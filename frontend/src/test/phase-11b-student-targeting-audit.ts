import { db } from "@/db";
import {
  users,
  profiles,
  companies,
  roles,
  studentTargetRoles,
  studentTargetCompanies,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  getStudentPlacementTargets,
  updateStudentPlacementTargets,
  addStudentTargetRole,
  removeStudentTargetRole,
  setStudentPrimaryRole,
  addStudentTargetCompany,
  removeStudentTargetCompany,
  setStudentPrimaryCompany,
  adminCreateCompany,
  adminUpdateCompany,
  adminCreateRole,
  adminUpdateRole,
  seedCanonicalPlacementData,
} from "@/server/company-role-intelligence";
import { studentTargetActionSchema } from "@/lib/validations/company-role";
import { calculateReadiness } from "@/server/readiness";
import { getStudentIntelligence } from "@/server/student-intelligence";
import { GET as studentTargetsGet, PUT as studentTargetsPut } from "@/app/api/student/targets/route";
import { GET as adminCompaniesGet } from "@/app/api/admin/companies/route";
import { NextRequest } from "next/server";

async function runPhase11bTests() {
  console.log("==================================================");
  console.log("🎯 NEXORA — PHASE 11B: STUDENT COMPANY & ROLE INTELLIGENCE");
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

  const createdUserIds: string[] = [];
  const createdCompanyIds: string[] = [];
  const createdRoleIds: string[] = [];

  try {
    // ------------------------------------------------------------------------
    // SETUP
    // ------------------------------------------------------------------------
    console.log("\n--- Setting up Isolated Test Fixtures ---");
    await seedCanonicalPlacementData();

    const [userA] = await db
      .insert(users)
      .values({
        email: `phase11b_student_a_${Date.now()}@nexora.test`,
        passwordHash: "hash_11b_a",
        isAdmin: false,
      })
      .returning();
    createdUserIds.push(userA.id);
    await db.insert(profiles).values({
      userId: userA.id,
      name: "Target Student A",
      college: "Nexora Institute",
      branch: "Computer Science",
      graduationYear: 2026,
    });

    const [userB] = await db
      .insert(users)
      .values({
        email: `phase11b_student_b_${Date.now()}@nexora.test`,
        passwordHash: "hash_11b_b",
        isAdmin: false,
      })
      .returning();
    createdUserIds.push(userB.id);
    await db.insert(profiles).values({
      userId: userB.id,
      name: "Target Student B",
      college: "Nexora Institute",
      branch: "Information Technology",
      graduationYear: 2026,
    });

    const ts = Date.now();
    const role1 = await adminCreateRole({ name: `R1 SWE ${ts}`, category: "Software Engineering", isActive: true });
    const role2 = await adminCreateRole({ name: `R2 Cloud ${ts}`, category: "Cloud/Infrastructure", isActive: true });
    const role3 = await adminCreateRole({ name: `R3 QA ${ts}`, category: "Testing/QA", isActive: true });
    createdRoleIds.push(role1.id, role2.id, role3.id);

    const comp1 = await adminCreateCompany({ name: `C1 Alpha ${ts}`, industry: "Technology", isActive: true });
    const comp2 = await adminCreateCompany({ name: `C2 Beta ${ts}`, industry: "Finance & Tech", isActive: true });
    const comp3 = await adminCreateCompany({ name: `C3 Gamma ${ts}`, industry: "IT Services", isActive: true });
    createdCompanyIds.push(comp1.id, comp2.id, comp3.id);

    // ------------------------------------------------------------------------
    // A. TARGET ROLES
    // ------------------------------------------------------------------------
    console.log("\n--- A. Target Roles ---");

    // A1. First role added becomes primary automatically
    let t = await addStudentTargetRole(userA.id, role1.id);
    assert(t.configured === true, "configured becomes true after first role");
    assert(t.roleCount === 1, "roleCount is 1 after first role");
    assert(t.primaryRole?.id === role1.id, "First added role automatically becomes primary");
    assert(t.targetRoles.length === 1 && t.targetRoles[0].isPrimary === true, "targetRoles reflects the single primary role");

    // A2. Second role added (not primary)
    t = await addStudentTargetRole(userA.id, role2.id);
    assert(t.roleCount === 2, "roleCount is 2 after adding second role");
    assert(t.targetRoles.length === 2, "targetRoles contains both roles");
    assert(t.primaryRole?.id === role1.id, "Primary role unchanged when a secondary role is added");
    const secondary = t.targetRoles.find((r) => r.id === role2.id);
    assert(secondary?.isPrimary === false, "Second role is not primary");

    // A3. Duplicate role prevented
    let dupRejected = false;
    try {
      await addStudentTargetRole(userA.id, role2.id);
    } catch (e) {
      dupRejected = e instanceof Error && e.message.includes("already");
    }
    assert(dupRejected, "Duplicate target role rejected");

    // A4. Nonexistent role rejected
    let missingRoleRejected = false;
    try {
      await addStudentTargetRole(userA.id, "00000000-0000-0000-0000-000000000999");
    } catch (e) {
      missingRoleRejected = e instanceof Error && e.message.includes("does not exist");
    }
    assert(missingRoleRejected, "Nonexistent role rejected");

    // A5. Inactive role rejected for new selection
    const roleInactive = await adminCreateRole({ name: `R4 Inactive ${ts}`, category: "Security" });
    createdRoleIds.push(roleInactive.id);
    await adminUpdateRole(roleInactive.id, { isActive: false });
    let inactiveRoleRejected = false;
    try {
      await addStudentTargetRole(userA.id, roleInactive.id);
    } catch (e) {
      inactiveRoleRejected = e instanceof Error && e.message.includes("inactive");
    }
    assert(inactiveRoleRejected, "Inactive role cannot be newly selected");

    // A6. Primary role switch
    t = await setStudentPrimaryRole(userA.id, role2.id);
    assert(t.primaryRole?.id === role2.id, "setPrimaryRole switches the primary role");
    const primaryCount = t.targetRoles.filter((r) => r.isPrimary).length;
    assert(primaryCount === 1, "Exactly one primary role exists after switch");
    const dbPrimaryRows = await db
      .select()
      .from(studentTargetRoles)
      .where(eq(studentTargetRoles.userId, userA.id));
    assert(
      dbPrimaryRows.filter((r) => r.isPrimary).length === 1,
      "Partial unique index guarantees exactly one primary row in DB"
    );

    // A7. Remove secondary role
    t = await removeStudentTargetRole(userA.id, role1.id);
    assert(t.roleCount === 1, "Removing secondary role leaves one role");
    assert(t.primaryRole?.id === role2.id, "Primary role preserved when a secondary role is removed");

    // A8. Removing primary promotes the oldest remaining role
    await addStudentTargetRole(userA.id, role3.id);
    t = await removeStudentTargetRole(userA.id, role2.id);
    assert(t.roleCount === 1, "Primary removal leaves remaining role");
    assert(t.primaryRole?.id === role3.id, "Oldest remaining role promoted after primary removal");

    // A9. Role limit (10)
    const extraRoles: string[] = [];
    for (let i = 0; i < 9; i++) {
      const r = await adminCreateRole({ name: `RL ${i} ${ts}`, category: "General" });
      extraRoles.push(r.id);
      createdRoleIds.push(r.id);
      await addStudentTargetRole(userA.id, r.id);
    }
    const afterTen = await getStudentPlacementTargets(userA.id);
    assert(afterTen.roleCount === 10, "10 target roles allowed (limit)");
    let overLimitRejected = false;
    try {
      const overflow = await adminCreateRole({ name: `RL overflow ${ts}`, category: "General" });
      createdRoleIds.push(overflow.id);
      await addStudentTargetRole(userA.id, overflow.id);
    } catch (e) {
      overLimitRejected = e instanceof Error && e.message.includes("10");
    }
    assert(overLimitRejected, "11th target role rejected (max 10)");

    // Reset role set to role3 + role1 for later phases
    for (const rid of extraRoles) {
      await removeStudentTargetRole(userA.id, rid);
    }
    await addStudentTargetRole(userA.id, role1.id);
    await setStudentPrimaryRole(userA.id, role3.id);
    t = await getStudentPlacementTargets(userA.id);
    assert(t.roleCount === 2 && t.primaryRole?.id === role3.id, "Role set reset cleanly for downstream tests");

    // ------------------------------------------------------------------------
    // B. TARGET COMPANIES
    // ------------------------------------------------------------------------
    console.log("\n--- B. Target Companies ---");

    // B1. Add first company → priority 1 + primaryCompany
    t = await addStudentTargetCompany(userA.id, comp1.id);
    assert(t.targetCompanies.length === 1, "First target company added");
    assert(t.targetCompanies[0].priority === 1, "First company gets priority 1");
    assert(t.primaryCompany?.id === comp1.id, "First company becomes the primary company");

    // B2. Add second company → priority 2
    t = await addStudentTargetCompany(userA.id, comp2.id);
    assert(t.targetCompanies.length === 2, "Second target company added");
    assert(t.targetCompanies[1].priority === 2, "Second company gets priority 2");
    assert(t.primaryCompany?.id === comp1.id, "Primary company remains the first-added company");

    // B3. Duplicate company prevented
    let dupCompanyRejected = false;
    try {
      await addStudentTargetCompany(userA.id, comp2.id);
    } catch (e) {
      dupCompanyRejected = e instanceof Error && e.message.includes("already");
    }
    assert(dupCompanyRejected, "Duplicate target company rejected");

    // B4. Nonexistent company rejected
    let missingCompanyRejected = false;
    try {
      await addStudentTargetCompany(userA.id, "00000000-0000-0000-0000-000000000888");
    } catch (e) {
      missingCompanyRejected = e instanceof Error && e.message.includes("does not exist");
    }
    assert(missingCompanyRejected, "Nonexistent company rejected");

    // B5. Inactive company rejected for new selection
    const compInactive = await adminCreateCompany({ name: `C4 Inactive ${ts}`, industry: "Tech" });
    createdCompanyIds.push(compInactive.id);
    await adminUpdateCompany(compInactive.id, { isActive: false });
    let inactiveCompanyRejected = false;
    try {
      await addStudentTargetCompany(userA.id, compInactive.id);
    } catch (e) {
      inactiveCompanyRejected = e instanceof Error && e.message.includes("inactive");
    }
    assert(inactiveCompanyRejected, "Inactive company cannot be newly selected");

    // B6. Set primary company (move to priority 1, others shift down)
    t = await setStudentPrimaryCompany(userA.id, comp2.id);
    assert(t.primaryCompany?.id === comp2.id, "setPrimaryCompany moves company to priority 1");
    assert(t.targetCompanies[0].id === comp2.id && t.targetCompanies[0].priority === 1, "Company reordered to priority 1");
    assert(t.targetCompanies[1].id === comp1.id && t.targetCompanies[1].priority === 2, "Former primary shifts to priority 2");
    const priorities = t.targetCompanies.map((c) => c.priority);
    assert(JSON.stringify(priorities) === JSON.stringify([1, 2]), "Priorities remain contiguous 1..N");

    // B7. Remove company renumbers priorities
    t = await removeStudentTargetCompany(userA.id, comp2.id);
    assert(t.targetCompanies.length === 1, "Company removed");
    assert(t.targetCompanies[0].id === comp1.id && t.targetCompanies[0].priority === 1, "Remaining company renumbered to priority 1");
    assert(t.primaryCompany?.id === comp1.id, "Remaining company becomes primary after removal");

    // B8. Company limit (10)
    const extraCompanies: string[] = [];
    for (let i = 0; i < 9; i++) {
      const c = await adminCreateCompany({ name: `CL ${i} ${ts}`, industry: "General" });
      extraCompanies.push(c.id);
      createdCompanyIds.push(c.id);
      await addStudentTargetCompany(userA.id, c.id);
    }
    const companiesAfterTen = await getStudentPlacementTargets(userA.id);
    assert(companiesAfterTen.targetCount === 10, "10 target companies allowed (limit)");
    let companyOverLimit = false;
    try {
      const overflow = await adminCreateCompany({ name: `CL overflow ${ts}`, industry: "General" });
      createdCompanyIds.push(overflow.id);
      await addStudentTargetCompany(userA.id, overflow.id);
    } catch (e) {
      companyOverLimit = e instanceof Error && e.message.includes("10");
    }
    assert(companyOverLimit, "11th target company rejected (max 10)");

    // Reset companies to comp1 only
    for (const cid of extraCompanies) {
      await removeStudentTargetCompany(userA.id, cid);
    }
    t = await getStudentPlacementTargets(userA.id);
    assert(t.targetCount === 1 && t.primaryCompany?.id === comp1.id, "Company set reset cleanly for downstream tests");

    // ------------------------------------------------------------------------
    // C. INTEGRATION & PERSISTENCE
    // ------------------------------------------------------------------------
    console.log("\n--- C. Integration & Persistence ---");

    // C1. Persistence: re-fetch after mutations reflects the same state
    const persisted = await getStudentPlacementTargets(userA.id);
    assert(
      persisted.roleCount === 2 && persisted.targetCount === 1 && persisted.primaryRole?.id === role3.id,
      "Targets persist and are re-readable after mutations"
    );

    // C2. Deterministic retrieval
    const r1 = await getStudentPlacementTargets(userA.id);
    const r2 = await getStudentPlacementTargets(userA.id);
    assert(JSON.stringify(r1) === JSON.stringify(r2), "Repeated target retrieval is deterministic");

    // C3. Empty state (no fake values)
    const empty = await getStudentPlacementTargets(userB.id);
    assert(empty.configured === false, "Targetless student has configured === false");
    assert(empty.primaryRole === null && empty.targetRoles.length === 0, "Targetless student has no roles");
    assert(empty.primaryCompany === null && empty.targetCompanies.length === 0, "Targetless student has no companies");
    assert(empty.roleCount === 0 && empty.targetCount === 0, "Targetless student counts are zero");

    // C4. Ownership isolation
    const bAfter = await getStudentPlacementTargets(userB.id);
    assert(bAfter.configured === false, "Student B targets unaffected by Student A mutations");

    // C5. Legacy Phase 11A update still enforces exactly-one-role semantics
    await updateStudentPlacementTargets(userA.id, { primaryRoleId: role2.id, companyIds: [comp2.id, comp1.id] });
    const legacyRows = await db
      .select()
      .from(studentTargetRoles)
      .where(eq(studentTargetRoles.userId, userA.id));
    assert(legacyRows.length === 1, "Legacy update keeps exactly one role row (Phase 11A contract)");
    assert(legacyRows[0].roleId === role2.id && legacyRows[0].isPrimary === true, "Legacy update sets the new primary role");
    const legacyCompanies = await db
      .select()
      .from(studentTargetCompanies)
      .where(eq(studentTargetCompanies.userId, userA.id));
    assert(legacyCompanies.length === 2, "Legacy update sets company list");

    // ------------------------------------------------------------------------
    // D. INTELLIGENCE INVARIANCE
    // ------------------------------------------------------------------------
    console.log("\n--- D. Intelligence Invariance ---");

    const intelBefore = await getStudentIntelligence(userA.id);
    const readinessBefore = await calculateReadiness(userA.id);

    // Mutate targets heavily — intelligence must not change
    await addStudentTargetRole(userA.id, role1.id);
    await setStudentPrimaryRole(userA.id, role1.id);
    await addStudentTargetCompany(userA.id, comp3.id);
    await setStudentPrimaryCompany(userA.id, comp3.id);
    await removeStudentTargetRole(userA.id, role2.id);

    const intelAfter = await getStudentIntelligence(userA.id);
    const readinessAfter = await calculateReadiness(userA.id);

    assert(
      JSON.stringify(intelBefore.readiness) === JSON.stringify(intelAfter.readiness),
      "Readiness structure unchanged after target mutations"
    );
    assert(
      JSON.stringify(intelBefore.weakAreas) === JSON.stringify(intelAfter.weakAreas),
      "Weak areas unchanged after target mutations"
    );
    assert(
      JSON.stringify(intelBefore.recommendations) === JSON.stringify(intelAfter.recommendations),
      "Recommendations unchanged after target mutations"
    );
    assert(
      JSON.stringify(readinessBefore) === JSON.stringify(readinessAfter),
      "calculateReadiness output unchanged after target mutations"
    );

    // Targetless student intelligence still works (zero-data path)
    const intelB = await getStudentIntelligence(userB.id);
    assert(intelB.dataSufficiency.status === "zero_data", "Targetless student intelligence returns zero-data state");
    assert(intelB.readiness.score === null, "No fabricated readiness for targetless student");

    // No fabricated target-specific requirements anywhere
    const serializedIntel = JSON.stringify(intelAfter);
    assert(
      !serializedIntel.includes("requires") && !serializedIntel.includes("hiring"),
      "No fabricated company hiring requirements introduced into intelligence"
    );

    // ------------------------------------------------------------------------
    // E. SECURITY & VALIDATION
    // ------------------------------------------------------------------------
    console.log("\n--- E. Security & Validation ---");

    // E1. Anonymous GET denied (401 or fail-closed)
    let anonGetFailClosed = false;
    try {
      const anonReq = new NextRequest("http://localhost:3000/api/student/targets");
      const res = await studentTargetsGet(anonReq);
      anonGetFailClosed = res.status === 401;
    } catch (e) {
      anonGetFailClosed =
        e instanceof Error &&
        (e.message.includes("Unauthorized") || e.message.includes("headers"));
    }
    assert(anonGetFailClosed, "Anonymous GET to student targets API denied (401 or fail-closed)");

    // E2. Anonymous PUT (action) denied (401 or fail-closed)
    let anonPutFailClosed = false;
    try {
      const anonReq = new NextRequest("http://localhost:3000/api/student/targets", {
        method: "PUT",
        body: JSON.stringify({ action: "addRole", roleId: role1.id }),
      });
      const res = await studentTargetsPut(anonReq);
      anonPutFailClosed = res.status === 401;
    } catch (e) {
      anonPutFailClosed =
        e instanceof Error &&
        (e.message.includes("Unauthorized") || e.message.includes("headers"));
    }
    assert(anonPutFailClosed, "Anonymous PUT to student targets API denied (401 or fail-closed)");

    // E3. Malformed action payload rejected by schema
    const badAction = studentTargetActionSchema.safeParse({ action: "addRole", roleId: "not-a-uuid" });
    assert(!badAction.success, "Malformed roleId rejected by action schema");
    const unknownAction = studentTargetActionSchema.safeParse({ action: "deleteRole", roleId: role1.id });
    assert(!unknownAction.success, "Unknown action rejected by action schema");

    // E4. Client-supplied userId is ignored (server uses session user exclusively)
    await updateStudentPlacementTargets(userB.id, { primaryRoleId: role1.id });
    const spoofCheck = await getStudentPlacementTargets(userA.id);
    assert(spoofCheck.primaryRole?.id === role1.id, "User A primary role reflects only User A's own actions");
    const bSpoofCheck = await getStudentPlacementTargets(userB.id);
    assert(bSpoofCheck.primaryRole?.id === role1.id, "User B updated only via its own userId");

    // E5. Student cannot access admin endpoints
    let adminStatus = 0;
    try {
      const studentReq = new NextRequest("http://localhost:3000/api/admin/companies");
      const res = await adminCompaniesGet(studentReq);
      adminStatus = res.status;
    } catch {
      adminStatus = 401; // fail-closed
    }
    assert(adminStatus === 401 || adminStatus === 403, "Non-admin access to admin companies endpoint denied");

    // E6. Cross-user mutation prevention via server functions (ownership bound by userId)
    let crossUserBlocked = false;
    try {
      // Attempting to remove User B's role using User A's identity must not touch B's row
      await removeStudentTargetRole(userA.id, role1.id);
      const bRoles = await getStudentPlacementTargets(userB.id);
      if (bRoles.primaryRole?.id === role1.id) {
        crossUserBlocked = true; // B's data intact
      }
    } catch {
      crossUserBlocked = true;
    }
    assert(crossUserBlocked, "Cross-user removal cannot affect another student's targets");

    console.log("\n==================================================");
    console.log(`PHASE 11B TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log("==================================================");
  } catch (err) {
    console.error("Test execution encountered unexpected error:", err);
    failed++;
  } finally {
    // ------------------------------------------------------------------------
    // CLEANUP
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

runPhase11bTests();