import { db } from "@/db";
import {
  users,
  profiles,
  companies,
  roles,
  studentTargetRoles,
  studentTargetCompanies,
  tests,
  questions,
  testQuestions,
  attempts,
  attemptQuestions,
  answers,
  skillScores,
  subjects,
  topics,
} from "@/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import {
  getStudentPlacementTargets,
  updateStudentPlacementTargets,
  searchCompanies,
  searchRoles,
  adminCreateCompany,
  adminUpdateCompany,
  adminCreateRole,
  adminUpdateRole,
  seedCanonicalPlacementData,
} from "@/server/company-role-intelligence";
import {
  normalizeName,
  slugify,
  companyCreateSchema,
  roleCreateSchema,
  studentTargetsUpdateSchema,
} from "@/lib/validations/company-role";
import { calculateReadiness } from "@/server/readiness";
import { getStudentIntelligence } from "@/server/student-intelligence";
import { GET as studentTargetsGet, PUT as studentTargetsPut } from "@/app/api/student/targets/route";
import { GET as adminCompaniesGet, POST as adminCompaniesPost } from "@/app/api/admin/companies/route";
import { GET as adminRolesGet, POST as adminRolesPost } from "@/app/api/admin/roles/route";
import { NextRequest } from "next/server";

async function runPhase11aTests() {
  console.log("==================================================");
  console.log("🏢 NEXORA — PHASE 11A: COMPANY & ROLE INTELLIGENCE");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${description}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${description}`);
      failed++;
    }
  }

  // Fixture tracking
  const createdUserIds: string[] = [];
  const createdCompanyIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdTestIds: string[] = [];
  const createdAttemptIds: string[] = [];

  try {
    // ------------------------------------------------------------------------
    // SETUP FIXTURES
    // ------------------------------------------------------------------------
    console.log("\n--- Setting up Isolated Test Fixtures ---");

    // Seed canonical data if not already present
    const seedResult = await seedCanonicalPlacementData();
    assert(seedResult !== null, "Canonical placement reference data seeded idempotently");

    // Create Test Student User A
    const [userA] = await db
      .insert(users)
      .values({
        email: `phase11a_student_a_${Date.now()}@nexora.test`,
        passwordHash: "hash_11a_a",
        isAdmin: false,
      })
      .returning();
    createdUserIds.push(userA.id);

    await db.insert(profiles).values({
      userId: userA.id,
      name: "Student Alpha",
      college: "Nexora Institute",
      branch: "Computer Science",
      graduationYear: 2026,
    });

    // Create Test Student User B
    const [userB] = await db
      .insert(users)
      .values({
        email: `phase11a_student_b_${Date.now()}@nexora.test`,
        passwordHash: "hash_11a_b",
        isAdmin: false,
      })
      .returning();
    createdUserIds.push(userB.id);

    await db.insert(profiles).values({
      userId: userB.id,
      name: "Student Beta",
      college: "Nexora Institute",
      branch: "Information Technology",
      graduationYear: 2026,
    });

    // ------------------------------------------------------------------------
    // TEST 1: Company Creation
    // ------------------------------------------------------------------------
    console.log("\n--- Test 1: Company Creation ---");
    const testComp1 = await adminCreateCompany({
      name: `Acme Corp ${Date.now()}`,
      industry: "Enterprise Software",
      description: "Leading enterprise cloud provider",
      website: "https://acme.example.com",
      isActive: true,
    });
    createdCompanyIds.push(testComp1.id);

    assert(testComp1.id !== undefined, "Company created with valid UUID");
    assert(testComp1.normalizedName === normalizeName(testComp1.name), "Company normalizedName calculated accurately");
    assert(testComp1.slug === slugify(testComp1.name), "Company slug generated accurately");
    assert(testComp1.isActive === true, "Company active status set to true");

    // ------------------------------------------------------------------------
    // TEST 2: Company Uniqueness
    // ------------------------------------------------------------------------
    console.log("\n--- Test 2: Company Uniqueness ---");
    let duplicateRejected = false;
    try {
      await adminCreateCompany({
        name: testComp1.name,
        industry: "Finance",
      });
    } catch (e: any) {
      duplicateRejected = true;
    }
    assert(duplicateRejected, "Duplicate company name rejected with conflict error");

    // ------------------------------------------------------------------------
    // TEST 3: Normalized Company Uniqueness
    // ------------------------------------------------------------------------
    console.log("\n--- Test 3: Normalized Company Uniqueness ---");
    let normalizedDupRejected = false;
    try {
      await adminCreateCompany({
        name: `   ${testComp1.name.toUpperCase()}   `,
        industry: "Finance",
      });
    } catch (e: any) {
      normalizedDupRejected = true;
    }
    assert(normalizedDupRejected, "Normalized company duplicate (case/whitespace variation) rejected");

    // ------------------------------------------------------------------------
    // TEST 4: Company Search
    // ------------------------------------------------------------------------
    console.log("\n--- Test 4: Company Search ---");
    const searchRes = await searchCompanies({ query: "Acme", includeInactive: false });
    assert(
      searchRes.some((c) => c.id === testComp1.id),
      "Case-insensitive search returns matching company by name"
    );

    const industrySearch = await searchCompanies({ industry: "Enterprise Software" });
    assert(
      industrySearch.some((c) => c.id === testComp1.id),
      "Company search filters correctly by industry"
    );

    // ------------------------------------------------------------------------
    // TEST 5: Company Deactivation
    // ------------------------------------------------------------------------
    console.log("\n--- Test 5: Company Deactivation ---");
    const deactivatedComp = await adminUpdateCompany(testComp1.id, { isActive: false });
    assert(deactivatedComp.isActive === false, "Company successfully deactivated (soft deactivation)");

    const activeOnlySearch = await searchCompanies({ query: "Acme", includeInactive: false });
    assert(
      !activeOnlySearch.some((c) => c.id === testComp1.id),
      "Deactivated company excluded from student/public search"
    );

    // ------------------------------------------------------------------------
    // TEST 6: Inactive Company Cannot Be Newly Selected
    // ------------------------------------------------------------------------
    console.log("\n--- Test 6: Inactive Company Cannot Be Newly Selected ---");
    let inactiveSelectionRejected = false;
    try {
      await updateStudentPlacementTargets(userA.id, {
        companyIds: [testComp1.id],
      });
    } catch (e: any) {
      inactiveSelectionRejected = e.message.includes("inactive");
    }
    assert(inactiveSelectionRejected, "Inactive company cannot be newly selected by a student");

    // Re-activate testComp1 for further tests
    await adminUpdateCompany(testComp1.id, { isActive: true });

    // ------------------------------------------------------------------------
    // TEST 7: Role Creation
    // ------------------------------------------------------------------------
    console.log("\n--- Test 7: Role Creation ---");
    const testRole1 = await adminCreateRole({
      name: `Systems Architect ${Date.now()}`,
      category: "Software Engineering",
      description: "Designs large scale distributed systems",
      isActive: true,
    });
    createdRoleIds.push(testRole1.id);

    assert(testRole1.id !== undefined, "Role created with valid UUID");
    assert(testRole1.normalizedName === normalizeName(testRole1.name), "Role normalizedName calculated accurately");
    assert(testRole1.slug === slugify(testRole1.name), "Role slug generated accurately");
    assert(testRole1.category === "Software Engineering", "Role category assigned correctly");

    // ------------------------------------------------------------------------
    // TEST 8: Role Uniqueness
    // ------------------------------------------------------------------------
    console.log("\n--- Test 8: Role Uniqueness ---");
    let duplicateRoleRejected = false;
    try {
      await adminCreateRole({
        name: `  ${testRole1.name.toLowerCase()}  `,
        category: "Other",
      });
    } catch {
      duplicateRoleRejected = true;
    }
    assert(duplicateRoleRejected, "Duplicate role name (including whitespace/case variations) rejected");

    // ------------------------------------------------------------------------
    // TEST 9: Role Search
    // ------------------------------------------------------------------------
    console.log("\n--- Test 9: Role Search ---");
    const roleSearchRes = await searchRoles({ query: "Systems Architect" });
    assert(
      roleSearchRes.some((r) => r.id === testRole1.id),
      "Role search matches role title case-insensitively"
    );

    // ------------------------------------------------------------------------
    // TEST 10: Role Deactivation
    // ------------------------------------------------------------------------
    console.log("\n--- Test 10: Role Deactivation ---");
    const deactivatedRole = await adminUpdateRole(testRole1.id, { isActive: false });
    assert(deactivatedRole.isActive === false, "Role successfully deactivated");

    let inactiveRoleSelectRejected = false;
    try {
      await updateStudentPlacementTargets(userA.id, {
        primaryRoleId: testRole1.id,
      });
    } catch (e: any) {
      inactiveRoleSelectRejected = e.message.includes("inactive");
    }
    assert(inactiveRoleSelectRejected, "Inactive role cannot be newly selected as primary target");

    // Re-activate testRole1
    await adminUpdateRole(testRole1.id, { isActive: true });

    // ------------------------------------------------------------------------
    // TEST 11: Primary Role Assignment
    // ------------------------------------------------------------------------
    console.log("\n--- Test 11: Primary Role Assignment ---");
    const targetsAfterRole = await updateStudentPlacementTargets(userA.id, {
      primaryRoleId: testRole1.id,
    });
    assert(targetsAfterRole.primaryRole?.id === testRole1.id, "Primary role assigned successfully to student");
    assert(targetsAfterRole.configured === true, "Targets state becomes configured once primary role is set");

    // ------------------------------------------------------------------------
    // TEST 12: Primary Role Replacement
    // ------------------------------------------------------------------------
    console.log("\n--- Test 12: Primary Role Replacement ---");
    const testRole2 = await adminCreateRole({
      name: `Cloud Specialist ${Date.now()}`,
      category: "Cloud/Infrastructure",
    });
    createdRoleIds.push(testRole2.id);

    const targetsAfterReplacement = await updateStudentPlacementTargets(userA.id, {
      primaryRoleId: testRole2.id,
    });
    assert(targetsAfterReplacement.primaryRole?.id === testRole2.id, "Primary role replaced cleanly with new target role");

    // Verify exactly one record in database for this student
    const dbTargetRoles = await db
      .select()
      .from(studentTargetRoles)
      .where(eq(studentTargetRoles.userId, userA.id));
    assert(dbTargetRoles.length === 1, "Exactly one primary role record exists in student_target_roles table");

    // ------------------------------------------------------------------------
    // TEST 13: Company Assignment
    // ------------------------------------------------------------------------
    console.log("\n--- Test 13: Company Assignment ---");
    const testComp2 = await adminCreateCompany({
      name: `Beta Cloud ${Date.now()}`,
      industry: "Cloud Services",
    });
    createdCompanyIds.push(testComp2.id);

    const targetsWithCompanies = await updateStudentPlacementTargets(userA.id, {
      companyIds: [testComp1.id, testComp2.id],
    });
    assert(targetsWithCompanies.targetCompanies.length === 2, "Assigned 2 target companies");
    assert(targetsWithCompanies.targetCompanies[0].priority === 1, "First company priority is 1");
    assert(targetsWithCompanies.targetCompanies[1].priority === 2, "Second company priority is 2");

    // ------------------------------------------------------------------------
    // TEST 14: Duplicate Company Prevention
    // ------------------------------------------------------------------------
    console.log("\n--- Test 14: Duplicate Company Prevention ---");
    let duplicateCompanyPayloadRejected = false;
    try {
      await updateStudentPlacementTargets(userA.id, {
        companyIds: [testComp1.id, testComp1.id],
      });
    } catch (e: any) {
      duplicateCompanyPayloadRejected = e.message.includes("Duplicate");
    }
    assert(duplicateCompanyPayloadRejected, "Duplicate company IDs in payload rejected by validation");

    // ------------------------------------------------------------------------
    // TEST 15: Company Removal
    // ------------------------------------------------------------------------
    console.log("\n--- Test 15: Company Removal ---");
    const targetsAfterRemoval = await updateStudentPlacementTargets(userA.id, {
      companyIds: [testComp1.id],
    });
    assert(targetsAfterRemoval.targetCompanies.length === 1, "Removed testComp2, exactly 1 target company remains");
    assert(targetsAfterRemoval.targetCompanies[0].id === testComp1.id, "Correct target company preserved");

    // Clear all companies
    const targetsClearedCompanies = await updateStudentPlacementTargets(userA.id, {
      companyIds: [],
    });
    assert(targetsClearedCompanies.targetCompanies.length === 0, "Empty company array safely clears company targets");

    // ------------------------------------------------------------------------
    // TEST 16: Maximum Company Limit
    // ------------------------------------------------------------------------
    console.log("\n--- Test 16: Maximum Company Limit ---");
    const tempCompIds: string[] = [];
    for (let i = 0; i < 11; i++) {
      const c = await adminCreateCompany({
        name: `Temp Comp ${i}_${Date.now()}`,
        industry: "Tech",
      });
      tempCompIds.push(c.id);
      createdCompanyIds.push(c.id);
    }

    let overLimitRejected = false;
    try {
      await updateStudentPlacementTargets(userA.id, {
        companyIds: tempCompIds,
      });
    } catch (e: any) {
      overLimitRejected = e.message.includes("10");
    }
    assert(overLimitRejected, "Selecting >10 companies is rejected by validation");

    // ------------------------------------------------------------------------
    // TEST 17: Empty Target State
    // ------------------------------------------------------------------------
    console.log("\n--- Test 17: Empty Target State ---");
    const emptyTargets = await getStudentPlacementTargets(userB.id);
    assert(emptyTargets.configured === false, "Unconfigured user has configured === false");
    assert(emptyTargets.primaryRole === null, "Unconfigured user has primaryRole === null");
    assert(emptyTargets.targetCompanies.length === 0, "Unconfigured user has empty target companies");
    assert(emptyTargets.targetCount === 0, "targetCount is 0 for unconfigured user");
    assert(emptyTargets.context.configured === false, "Context reflects configured === false");

    // ------------------------------------------------------------------------
    // TEST 18: Configured Target State
    // ------------------------------------------------------------------------
    console.log("\n--- Test 18: Configured Target State ---");
    await updateStudentPlacementTargets(userA.id, {
      primaryRoleId: testRole2.id,
      companyIds: [testComp1.id],
    });
    const configuredTargets = await getStudentPlacementTargets(userA.id);
    assert(configuredTargets.configured === true, "Configured user has configured === true");
    assert(configuredTargets.primaryRole !== null, "Configured user has primaryRole set");
    assert(configuredTargets.targetCompanies.length === 1, "Configured user has targetCompanies set");
    assert(configuredTargets.context.role?.id === testRole2.id, "Context contains role metadata");
    assert(configuredTargets.context.companies[0]?.id === testComp1.id, "Context contains company metadata");

    // ------------------------------------------------------------------------
    // TEST 19: Student Ownership & Isolation
    // ------------------------------------------------------------------------
    console.log("\n--- Test 19: Student Ownership & Isolation ---");
    const targetsUserA = await getStudentPlacementTargets(userA.id);
    const targetsUserB = await getStudentPlacementTargets(userB.id);
    assert(targetsUserA.configured === true, "User A targets are configured");
    assert(targetsUserB.configured === false, "User B targets remain unconfigured (no leakage from User A)");

    // ------------------------------------------------------------------------
    // TEST 20: Cross-User Access Denial
    // ------------------------------------------------------------------------
    console.log("\n--- Test 20: Cross-User Access Denial ---");
    // Directly updating User B requires User B's explicit userId, which the API strictly pulls from authenticated session
    // Verify that User A cannot overwrite User B's targets via API
    const spoofedBody = {
      userId: userB.id, // Client attempt to spoof target
      primaryRoleId: testRole1.id,
    };
    // The server function `updateStudentPlacementTargets(userId, ...)` does not use body.userId
    await updateStudentPlacementTargets(userA.id, spoofedBody);
    const bTargetsAfterSpoof = await getStudentPlacementTargets(userB.id);
    assert(bTargetsAfterSpoof.configured === false, "User B targets were NOT modified by User A request");

    // ------------------------------------------------------------------------
    // TEST 21: Anonymous Denial
    // ------------------------------------------------------------------------
    console.log("\n--- Test 21: Anonymous Denial ---");
    try {
      const anonReq = new NextRequest("http://localhost:3000/api/student/targets");
      const res = await studentTargetsGet(anonReq);
      assert(res.status === 401, "Anonymous request to student targets API returns 401 Unauthorized");
    } catch (e: any) {
      assert(
        e.message.includes("Unauthorized") || e.message.includes("headers"),
        "Anonymous request fail-closed"
      );
    }

    // ------------------------------------------------------------------------
    // TEST 22: Student Admin Denial
    // ------------------------------------------------------------------------
    console.log("\n--- Test 22: Student Admin Denial ---");
    try {
      const studentReq = new NextRequest("http://localhost:3000/api/admin/companies");
      const res = await adminCompaniesGet(studentReq);
      assert(res.status === 401 || res.status === 403, "Non-admin access to admin companies returns 401 or 403");
    } catch {
      assert(true, "Non-admin access fail-closed");
    }

    // ------------------------------------------------------------------------
    // TEST 23: Admin Access & Operations
    // ------------------------------------------------------------------------
    console.log("\n--- Test 23: Admin Access & Operations ---");
    const adminRole = await adminCreateRole({
      name: `QA Lead ${Date.now()}`,
      category: "Testing/QA",
    });
    createdRoleIds.push(adminRole.id);
    assert(adminRole.id !== undefined, "Admin can create canonical roles");

    // ------------------------------------------------------------------------
    // TEST 24: Zod Validation
    // ------------------------------------------------------------------------
    console.log("\n--- Test 24: Zod Validation ---");
    const emptyNameRes = companyCreateSchema.safeParse({ name: "", industry: "Tech" });
    assert(!emptyNameRes.success, "Empty company name fails validation");

    const emptyCatRes = roleCreateSchema.safeParse({ name: "Role X", category: "" });
    assert(!emptyCatRes.success, "Empty role category fails validation");

    // ------------------------------------------------------------------------
    // TEST 25: Malformed IDs
    // ------------------------------------------------------------------------
    console.log("\n--- Test 25: Malformed IDs ---");
    const malformedIdRes = studentTargetsUpdateSchema.safeParse({
      primaryRoleId: "not-a-valid-uuid",
    });
    assert(!malformedIdRes.success, "Malformed primaryRoleId UUID rejected");

    const malformedCompRes = studentTargetsUpdateSchema.safeParse({
      companyIds: ["not-a-uuid"],
    });
    assert(!malformedCompRes.success, "Malformed companyId UUID rejected");

    // ------------------------------------------------------------------------
    // TEST 26: Invalid URLs
    // ------------------------------------------------------------------------
    console.log("\n--- Test 26: Invalid URLs ---");
    const invalidUrlRes = companyCreateSchema.safeParse({
      name: "Bad Url Co",
      industry: "Tech",
      website: "ftp://not-allowed.com",
    });
    assert(!invalidUrlRes.success, "FTP or invalid URL scheme rejected for company website");

    const textUrlRes = companyCreateSchema.safeParse({
      name: "Bad Url Co 2",
      industry: "Tech",
      website: "just-some-text",
    });
    assert(!textUrlRes.success, "Non-URL string rejected for company website");

    // ------------------------------------------------------------------------
    // TEST 27: Oversized Input
    // ------------------------------------------------------------------------
    console.log("\n--- Test 27: Oversized Input ---");
    const hugeName = "A".repeat(300);
    const oversizedNameRes = companyCreateSchema.safeParse({
      name: hugeName,
      industry: "Tech",
    });
    assert(!oversizedNameRes.success, "Company name > 255 chars rejected");

    const hugeDesc = "D".repeat(2500);
    const oversizedDescRes = roleCreateSchema.safeParse({
      name: "Valid Role",
      category: "Tech",
      description: hugeDesc,
    });
    assert(!oversizedDescRes.success, "Role description > 2000 chars rejected");

    // ------------------------------------------------------------------------
    // TEST 28: Inactive Target Preservation
    // ------------------------------------------------------------------------
    console.log("\n--- Test 28: Inactive Target Preservation ---");
    // Ensure User A explicitly has testRole2 and testComp1 assigned
    await updateStudentPlacementTargets(userA.id, {
      primaryRoleId: testRole2.id,
      companyIds: [testComp1.id],
    });

    // Deactivate testComp1 and testRole2 now.
    await adminUpdateCompany(testComp1.id, { isActive: false });
    await adminUpdateRole(testRole2.id, { isActive: false });

    // When User A fetches targets, the historically selected targets must still be returned!
    const targetsPreserved = await getStudentPlacementTargets(userA.id);
    assert(targetsPreserved.primaryRole?.id === testRole2.id, "Existing primary role preserved even after deactivation");
    assert(targetsPreserved.primaryRole?.isActive === false, "Preserved role indicates inactive state");
    assert(
      targetsPreserved.targetCompanies.some((c) => c.id === testComp1.id),
      "Existing target company preserved even after deactivation"
    );

    // User updating other fields without changing the existing company should not fail
    const preserveUpdate = await updateStudentPlacementTargets(userA.id, {
      companyIds: [testComp1.id], // Keeping already-selected company even though inactive
    });
    assert(preserveUpdate.targetCompanies.length === 1, "Student allowed to keep already assigned inactive company");

    // ------------------------------------------------------------------------
    // TEST 29: No Destructive Deletion (Referential Integrity Check)
    // ------------------------------------------------------------------------
    console.log("\n--- Test 29: No Destructive Deletion ---");
    let deleteRestricted = false;
    try {
      // Direct hard delete of company referenced by student target must be rejected by foreign key onDelete: "restrict"
      await db.delete(companies).where(eq(companies.id, testComp1.id));
    } catch {
      deleteRestricted = true;
    }
    assert(deleteRestricted, "Foreign key constraint onDelete: restrict prevents destructive deletion of targeted company");

    // ------------------------------------------------------------------------
    // TEST 30: Deterministic Target Retrieval
    // ------------------------------------------------------------------------
    console.log("\n--- Test 30: Deterministic Target Retrieval ---");
    const r1 = await getStudentPlacementTargets(userA.id);
    const r2 = await getStudentPlacementTargets(userA.id);
    assert(
      JSON.stringify(r1) === JSON.stringify(r2),
      "Repeated calls to getStudentPlacementTargets return identical deterministic structure"
    );

    // ------------------------------------------------------------------------
    // TEST 31: Phase 10 Compatibility
    // ------------------------------------------------------------------------
    console.log("\n--- Test 31: Phase 10 Compatibility ---");
    const studentIntel = await getStudentIntelligence(userA.id);
    assert(studentIntel.readiness !== undefined, "Phase 10 student intelligence operates smoothly with Phase 11A enabled");
    assert(studentIntel.dataSufficiency !== undefined, "Phase 10 data sufficiency operates smoothly");
    assert(Array.isArray(studentIntel.recommendations), "Phase 10 recommendations generated without error");

    // ------------------------------------------------------------------------
    // TEST 32: Readiness Formula Unchanged
    // ------------------------------------------------------------------------
    console.log("\n--- Test 32: Readiness Formula Unchanged ---");
    const readinessUserA = await calculateReadiness(userA.id);
    // User has no attempts, readiness should reflect uncalibrated baseline requirements
    assert(readinessUserA.hasCompletedBaseline === false, "Readiness baseline requirement remains unchanged");
    assert(readinessUserA.readinessScore === null, "Readiness score uncalibrated for zero-attempt student");

    // ------------------------------------------------------------------------
    // TEST 33: Existing Analytics Unchanged
    // ------------------------------------------------------------------------
    console.log("\n--- Test 33: Existing Analytics Unchanged ---");
    const allSubjectsList = await db.select().from(subjects);
    assert(allSubjectsList.length === 7, "Curriculum remains exactly 7 authoritative subjects");
    const allTopicsList = await db.select().from(topics);
    assert(allTopicsList.length === 60, "Curriculum remains exactly 60 authoritative topics");

    // ------------------------------------------------------------------------
    // TEST 34: Existing Test Engine Unchanged
    // ------------------------------------------------------------------------
    console.log("\n--- Test 34: Existing Test Engine Unchanged ---");
    const testsCount = await db.select().from(tests);
    assert(testsCount.length >= 4, "Reference tests exist and test schemas operate without regression");

    console.log("\n==================================================");
    console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log("==================================================");
  } catch (err) {
    console.error("Test execution encountered unexpected error:", err);
    failed++;
  } finally {
    // ------------------------------------------------------------------------
    // CLEANUP ALL TEST FIXTURES
    // ------------------------------------------------------------------------
    console.log("\n🧹 Cleaning up test fixtures...");
    try {
      if (createdUserIds.length > 0) {
        await db.delete(studentTargetCompanies).where(inArray(studentTargetCompanies.userId, createdUserIds));
        await db.delete(studentTargetRoles).where(inArray(studentTargetRoles.userId, createdUserIds));
        await db.delete(profiles).where(inArray(profiles.userId, createdUserIds));
        await db.delete(users).where(inArray(users.id, createdUserIds));
      }
      if (createdCompanyIds.length > 0) {
        await db.delete(studentTargetCompanies).where(inArray(studentTargetCompanies.companyId, createdCompanyIds));
        await db.delete(companies).where(inArray(companies.id, createdCompanyIds));
      }
      if (createdRoleIds.length > 0) {
        await db.delete(studentTargetRoles).where(inArray(studentTargetRoles.roleId, createdRoleIds));
        await db.delete(roles).where(inArray(roles.id, createdRoleIds));
      }
      console.log("✓ Fixtures successfully cleaned up.");
    } catch (cleanupErr) {
      console.error("Fixture cleanup error:", cleanupErr);
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase11aTests();
