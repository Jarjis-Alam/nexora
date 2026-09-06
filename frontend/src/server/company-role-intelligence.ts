import { db } from "@/db";
import {
  companies,
  roles,
  studentTargetRoles,
  studentTargetCompanies,
  users,
} from "@/db/schema";
import { eq, and, ilike, or, inArray, asc } from "drizzle-orm";
import {
  normalizeName,
  slugify,
  companyCreateSchema,
  companyUpdateSchema,
  roleCreateSchema,
  roleUpdateSchema,
  studentTargetsUpdateSchema,
  type CompanyCreateInput,
  type CompanyUpdateInput,
  type RoleCreateInput,
  type RoleUpdateInput,
  type StudentTargetsUpdateInput,
} from "@/lib/validations/company-role";

// Canonical Seed Data
export const canonicalRoles = [
  {
    id: "00000000-0000-0000-0000-000000000601",
    name: "Software Engineer",
    normalizedName: "software engineer",
    slug: "software-engineer",
    category: "Software Engineering",
    description: "General software development role focusing on algorithms, architecture, and core systems.",
    isActive: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000602",
    name: "Frontend Engineer",
    normalizedName: "frontend engineer",
    slug: "frontend-engineer",
    category: "Software Engineering",
    description: "Client-side web and application engineering, UI performance, and user experience.",
    isActive: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000603",
    name: "Backend Engineer",
    normalizedName: "backend engineer",
    slug: "backend-engineer",
    category: "Software Engineering",
    description: "Server-side business logic, APIs, microservices, databases, and high-throughput systems.",
    isActive: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000604",
    name: "Full Stack Engineer",
    normalizedName: "full stack engineer",
    slug: "full-stack-engineer",
    category: "Software Engineering",
    description: "End-to-end web engineering covering client interfaces, server APIs, and data layers.",
    isActive: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000605",
    name: "Data Analyst",
    normalizedName: "data analyst",
    slug: "data-analyst",
    category: "Data",
    description: "Data exploration, statistical modeling, dashboard visualization, and SQL query analysis.",
    isActive: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000606",
    name: "Data Engineer",
    normalizedName: "data engineer",
    slug: "data-engineer",
    category: "Data",
    description: "ETL pipelines, distributed data processing, data warehousing, and streaming analytics.",
    isActive: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000607",
    name: "DevOps Engineer",
    normalizedName: "devops engineer",
    slug: "devops-engineer",
    category: "Cloud/Infrastructure",
    description: "CI/CD pipelines, cloud orchestration, containers, infrastructure as code, and reliability.",
    isActive: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000608",
    name: "QA Engineer",
    normalizedName: "qa engineer",
    slug: "qa-engineer",
    category: "Testing/QA",
    description: "Quality assurance, automated regression testing, performance benchmarking, and test planning.",
    isActive: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000609",
    name: "Cybersecurity Analyst",
    normalizedName: "cybersecurity analyst",
    slug: "cybersecurity-analyst",
    category: "Security",
    description: "Information security, threat modeling, vulnerability assessment, and network protocol defense.",
    isActive: true,
  },
];

export const canonicalCompanies = [
  {
    id: "00000000-0000-0000-0000-000000000701",
    name: "Google",
    normalizedName: "google",
    slug: "google",
    industry: "Technology",
    description: "Global technology leader specializing in search, cloud computing, software, and hardware.",
    website: "https://careers.google.com",
    isActive: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000702",
    name: "Microsoft",
    normalizedName: "microsoft",
    slug: "microsoft",
    industry: "Technology",
    description: "Multinational developer of personal-computer software, enterprise systems, and cloud services.",
    website: "https://careers.microsoft.com",
    isActive: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000703",
    name: "Amazon",
    normalizedName: "amazon",
    slug: "amazon",
    industry: "Technology",
    description: "Global enterprise focused on e-commerce, cloud computing, digital streaming, and artificial intelligence.",
    website: "https://amazon.jobs",
    isActive: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000704",
    name: "Apple",
    normalizedName: "apple",
    slug: "apple",
    industry: "Technology",
    description: "Consumer electronics and software innovator delivering operating systems and consumer hardware.",
    website: "https://jobs.apple.com",
    isActive: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000705",
    name: "Meta",
    normalizedName: "meta",
    slug: "meta",
    industry: "Technology",
    description: "Technology conglomerate focusing on social technologies, infrastructure, and virtual platforms.",
    website: "https://metacareers.com",
    isActive: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000706",
    name: "TCS",
    normalizedName: "tcs",
    slug: "tcs",
    industry: "IT Services",
    description: "Global IT services, consulting, and business solutions organization.",
    website: "https://www.tcs.com/careers",
    isActive: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000707",
    name: "Infosys",
    normalizedName: "infosys",
    slug: "infosys",
    industry: "IT Services",
    description: "Digital services and consulting powerhouse serving global enterprises.",
    website: "https://www.infosys.com/careers",
    isActive: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000708",
    name: "Wipro",
    normalizedName: "wipro",
    slug: "wipro",
    industry: "IT Services",
    description: "Technology services and consulting company driving cognitive computing and cloud solutions.",
    website: "https://careers.wipro.com",
    isActive: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000709",
    name: "Accenture",
    normalizedName: "accenture",
    slug: "accenture",
    industry: "Consulting & IT",
    description: "Global professional services company with leading capabilities in digital, cloud, and security.",
    website: "https://www.accenture.com/careers",
    isActive: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000710",
    name: "Goldman Sachs",
    normalizedName: "goldman sachs",
    slug: "goldman-sachs",
    industry: "Financial Services & Tech",
    description: "Global financial institution delivering investment banking, securities, and financial engineering.",
    website: "https://www.goldmansachs.com/careers",
    isActive: true,
  },
];

/**
 * Seeds canonical companies and roles idempotently.
 * Safe to execute multiple times. Does not alter student targets or existing customized entities.
 */
export async function seedCanonicalPlacementData() {
  let rolesSeeded = 0;
  let companiesSeeded = 0;

  for (const r of canonicalRoles) {
    const existing = await db
      .select({ id: roles.id })
      .from(roles)
      .where(or(eq(roles.id, r.id), eq(roles.normalizedName, r.normalizedName)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(roles).values(r);
      rolesSeeded++;
    }
  }

  for (const c of canonicalCompanies) {
    const existing = await db
      .select({ id: companies.id })
      .from(companies)
      .where(or(eq(companies.id, c.id), eq(companies.normalizedName, c.normalizedName)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(companies).values(c);
      companiesSeeded++;
    }
  }

  return { rolesSeeded, companiesSeeded };
}

export interface StudentPlacementTargets {
  primaryRole: {
    id: string;
    name: string;
    slug: string;
    category: string;
    description: string | null;
    isActive: boolean;
  } | null;
  targetCompanies: Array<{
    id: string;
    name: string;
    slug: string;
    industry: string;
    description: string | null;
    website: string | null;
    isActive: boolean;
    priority: number;
  }>;
  targetCount: number;
  configured: boolean;
  context: {
    role: {
      id: string;
      name: string;
      category: string;
    } | null;
    companies: Array<{
      id: string;
      name: string;
    }>;
    configured: boolean;
  };
}

/**
 * Retrieves the placement targets for a specific student.
 * Structured, deterministic, and isolated from UI logic.
 */
export async function getStudentPlacementTargets(
  userId: string
): Promise<StudentPlacementTargets> {
  if (!userId) {
    throw new Error("User ID is required");
  }

  // 1. Fetch Primary Role
  const primaryRoleRows = await db
    .select({
      id: roles.id,
      name: roles.name,
      slug: roles.slug,
      category: roles.category,
      description: roles.description,
      isActive: roles.isActive,
    })
    .from(studentTargetRoles)
    .innerJoin(roles, eq(studentTargetRoles.roleId, roles.id))
    .where(
      and(
        eq(studentTargetRoles.userId, userId),
        eq(studentTargetRoles.isPrimary, true)
      )
    )
    .limit(1);

  const primaryRole = primaryRoleRows.length > 0 ? primaryRoleRows[0] : null;

  // 2. Fetch Target Companies ordered by priority
  const targetCompanyRows = await db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
      industry: companies.industry,
      description: companies.description,
      website: companies.website,
      isActive: companies.isActive,
      priority: studentTargetCompanies.priority,
    })
    .from(studentTargetCompanies)
    .innerJoin(companies, eq(studentTargetCompanies.companyId, companies.id))
    .where(eq(studentTargetCompanies.userId, userId))
    .orderBy(asc(studentTargetCompanies.priority));

  const targetCompanies = targetCompanyRows;
  const configured = primaryRole !== null || targetCompanies.length > 0;

  // 3. Construct clean intelligence context for future phases
  const context = {
    role: primaryRole
      ? {
          id: primaryRole.id,
          name: primaryRole.name,
          category: primaryRole.category,
        }
      : null,
    companies: targetCompanies.map((c) => ({
      id: c.id,
      name: c.name,
    })),
    configured,
  };

  return {
    primaryRole,
    targetCompanies,
    targetCount: targetCompanies.length,
    configured,
    context,
  };
}

/**
 * Updates placement targets for an authenticated student.
 * Validates inputs, checks active status for new assignments, and performs atomic updates.
 */
export async function updateStudentPlacementTargets(
  userId: string,
  rawInput: StudentTargetsUpdateInput
): Promise<StudentPlacementTargets> {
  const parsed = studentTargetsUpdateSchema.safeParse(rawInput);
  if (!parsed.success) {
    const err = parsed.error.issues[0]?.message || "Validation failed";
    throw new Error(err);
  }

  const { primaryRoleId, companyIds } = parsed.data;

  // Verify student exists
  const userRow = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userRow.length === 0) {
    throw new Error("Student account not found");
  }

  // Handle Primary Role update
  if (primaryRoleId !== undefined) {
    if (primaryRoleId === null) {
      await db
        .delete(studentTargetRoles)
        .where(eq(studentTargetRoles.userId, userId));
    } else {
      // Find role
      const roleRow = await db
        .select({ id: roles.id, name: roles.name, isActive: roles.isActive })
        .from(roles)
        .where(eq(roles.id, primaryRoleId))
        .limit(1);

      if (roleRow.length === 0) {
        throw new Error("Selected role does not exist");
      }

      // Check existing assignment
      const currentRoleAssignment = await db
        .select({ roleId: studentTargetRoles.roleId })
        .from(studentTargetRoles)
        .where(eq(studentTargetRoles.userId, userId))
        .limit(1);

      const isCurrentAssignment =
        currentRoleAssignment.length > 0 &&
        currentRoleAssignment[0].roleId === primaryRoleId;

      // Inactive role cannot be NEWLY assigned
      if (!isCurrentAssignment && !roleRow[0].isActive) {
        throw new Error(`Role "${roleRow[0].name}" is inactive and cannot be selected`);
      }

      // Upsert target primary role (unique constraint on userId ensures exactly one)
      await db
        .insert(studentTargetRoles)
        .values({
          userId,
          roleId: primaryRoleId,
          isPrimary: true,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: studentTargetRoles.userId,
          set: {
            roleId: primaryRoleId,
            isPrimary: true,
            updatedAt: new Date(),
          },
        });
    }
  }

  // Handle Target Companies update
  if (companyIds !== undefined) {
    if (companyIds.length === 0) {
      await db
        .delete(studentTargetCompanies)
        .where(eq(studentTargetCompanies.userId, userId));
    } else {
      // Fetch target companies
      const existingCompanies = await db
        .select({ id: companies.id, name: companies.name, isActive: companies.isActive })
        .from(companies)
        .where(inArray(companies.id, companyIds));

      if (existingCompanies.length !== companyIds.length) {
        throw new Error("One or more selected companies do not exist");
      }

      const companyMap = new Map(existingCompanies.map((c) => [c.id, c]));

      // Fetch current company targets for this student to allow preserving already selected inactive companies
      const currentTargets = await db
        .select({ companyId: studentTargetCompanies.companyId })
        .from(studentTargetCompanies)
        .where(eq(studentTargetCompanies.userId, userId));

      const currentCompanyIds = new Set(currentTargets.map((t) => t.companyId));

      for (const id of companyIds) {
        const comp = companyMap.get(id)!;
        if (!currentCompanyIds.has(id) && !comp.isActive) {
          throw new Error(`Company "${comp.name}" is inactive and cannot be newly selected`);
        }
      }

      // Synchronize in transaction
      await db.transaction(async (tx) => {
        await tx
          .delete(studentTargetCompanies)
          .where(eq(studentTargetCompanies.userId, userId));

        const insertRows = companyIds.map((cId, idx) => ({
          userId,
          companyId: cId,
          priority: idx + 1,
          updatedAt: new Date(),
        }));

        await tx.insert(studentTargetCompanies).values(insertRows);
      });
    }
  }

  return getStudentPlacementTargets(userId);
}

/**
 * Searches companies by query string and/or industry.
 */
export async function searchCompanies(options: {
  query?: string;
  industry?: string;
  includeInactive?: boolean;
  limit?: number;
} = {}) {
  const { query, industry, includeInactive = false, limit = 50 } = options;

  const conditions = [];

  if (!includeInactive) {
    conditions.push(eq(companies.isActive, true));
  }

  if (query && query.trim()) {
    const term = `%${query.trim()}%`;
    conditions.push(
      or(
        ilike(companies.name, term),
        ilike(companies.normalizedName, term),
        ilike(companies.industry, term)
      )
    );
  }

  if (industry && industry.trim()) {
    conditions.push(eq(companies.industry, industry.trim()));
  }

  const results = await db
    .select()
    .from(companies)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(companies.name))
    .limit(limit);

  return results;
}

/**
 * Searches roles by query string and/or category.
 */
export async function searchRoles(options: {
  query?: string;
  category?: string;
  includeInactive?: boolean;
  limit?: number;
} = {}) {
  const { query, category, includeInactive = false, limit = 50 } = options;

  const conditions = [];

  if (!includeInactive) {
    conditions.push(eq(roles.isActive, true));
  }

  if (query && query.trim()) {
    const term = `%${query.trim()}%`;
    conditions.push(
      or(
        ilike(roles.name, term),
        ilike(roles.normalizedName, term),
        ilike(roles.category, term)
      )
    );
  }

  if (category && category.trim()) {
    conditions.push(eq(roles.category, category.trim()));
  }

  const results = await db
    .select()
    .from(roles)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(roles.category), asc(roles.name))
    .limit(limit);

  return results;
}

// ==========================================
// ADMIN CATALOG OPERATIONS
// ==========================================

export async function adminCreateCompany(input: CompanyCreateInput) {
  const parsed = companyCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid company data");
  }

  const { name, industry, description, website, isActive } = parsed.data;
  const normalized = normalizeName(name);
  const slugVal = parsed.data.slug ? slugify(parsed.data.slug) : slugify(name);

  // Check normalizedName and slug uniqueness
  const existing = await db
    .select({ id: companies.id, normalizedName: companies.normalizedName, slug: companies.slug })
    .from(companies)
    .where(or(eq(companies.normalizedName, normalized), eq(companies.slug, slugVal)))
    .limit(1);

  if (existing.length > 0) {
    if (existing[0].normalizedName === normalized) {
      throw new Error(`A company with name "${name}" already exists`);
    }
    if (existing[0].slug === slugVal) {
      throw new Error(`A company with slug "${slugVal}" already exists`);
    }
  }

  const [newCompany] = await db
    .insert(companies)
    .values({
      name: name.trim(),
      normalizedName: normalized,
      slug: slugVal,
      industry: industry.trim(),
      description: description?.trim() || null,
      website: website?.trim() || null,
      isActive: isActive !== undefined ? isActive : true,
    })
    .returning();

  return newCompany;
}

export async function adminUpdateCompany(id: string, input: CompanyUpdateInput) {
  const parsed = companyUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid update data");
  }

  const current = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);

  if (current.length === 0) {
    throw new Error("Company not found");
  }

  const comp = current[0];
  const updateData: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (parsed.data.name !== undefined) {
    const trimmed = parsed.data.name.trim();
    const normalized = normalizeName(trimmed);

    if (normalized !== comp.normalizedName) {
      const dup = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.normalizedName, normalized))
        .limit(1);

      if (dup.length > 0) {
        throw new Error(`A company with name "${trimmed}" already exists`);
      }
    }

    updateData.name = trimmed;
    updateData.normalizedName = normalized;
  }

  if (parsed.data.slug !== undefined) {
    const slugVal = slugify(parsed.data.slug);
    if (slugVal !== comp.slug) {
      const dup = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.slug, slugVal))
        .limit(1);

      if (dup.length > 0) {
        throw new Error(`A company with slug "${slugVal}" already exists`);
      }
    }
    updateData.slug = slugVal;
  }

  if (parsed.data.industry !== undefined) {
    updateData.industry = parsed.data.industry.trim();
  }

  if (parsed.data.description !== undefined) {
    updateData.description = parsed.data.description ? parsed.data.description.trim() : null;
  }

  if (parsed.data.website !== undefined) {
    updateData.website = parsed.data.website ? parsed.data.website.trim() : null;
  }

  if (parsed.data.isActive !== undefined) {
    updateData.isActive = parsed.data.isActive;
  }

  const [updated] = await db
    .update(companies)
    .set(updateData)
    .where(eq(companies.id, id))
    .returning();

  return updated;
}

export async function adminCreateRole(input: RoleCreateInput) {
  const parsed = roleCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid role data");
  }

  const { name, category, description, isActive } = parsed.data;
  const normalized = normalizeName(name);
  const slugVal = parsed.data.slug ? slugify(parsed.data.slug) : slugify(name);

  // Check normalizedName and slug uniqueness
  const existing = await db
    .select({ id: roles.id, normalizedName: roles.normalizedName, slug: roles.slug })
    .from(roles)
    .where(or(eq(roles.normalizedName, normalized), eq(roles.slug, slugVal)))
    .limit(1);

  if (existing.length > 0) {
    if (existing[0].normalizedName === normalized) {
      throw new Error(`A role with name "${name}" already exists`);
    }
    if (existing[0].slug === slugVal) {
      throw new Error(`A role with slug "${slugVal}" already exists`);
    }
  }

  const [newRole] = await db
    .insert(roles)
    .values({
      name: name.trim(),
      normalizedName: normalized,
      slug: slugVal,
      category: category.trim(),
      description: description?.trim() || null,
      isActive: isActive !== undefined ? isActive : true,
    })
    .returning();

  return newRole;
}

export async function adminUpdateRole(id: string, input: RoleUpdateInput) {
  const parsed = roleUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid update data");
  }

  const current = await db
    .select()
    .from(roles)
    .where(eq(roles.id, id))
    .limit(1);

  if (current.length === 0) {
    throw new Error("Role not found");
  }

  const roleRec = current[0];
  const updateData: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (parsed.data.name !== undefined) {
    const trimmed = parsed.data.name.trim();
    const normalized = normalizeName(trimmed);

    if (normalized !== roleRec.normalizedName) {
      const dup = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.normalizedName, normalized))
        .limit(1);

      if (dup.length > 0) {
        throw new Error(`A role with name "${trimmed}" already exists`);
      }
    }

    updateData.name = trimmed;
    updateData.normalizedName = normalized;
  }

  if (parsed.data.slug !== undefined) {
    const slugVal = slugify(parsed.data.slug);
    if (slugVal !== roleRec.slug) {
      const dup = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.slug, slugVal))
        .limit(1);

      if (dup.length > 0) {
        throw new Error(`A role with slug "${slugVal}" already exists`);
      }
    }
    updateData.slug = slugVal;
  }

  if (parsed.data.category !== undefined) {
    updateData.category = parsed.data.category.trim();
  }

  if (parsed.data.description !== undefined) {
    updateData.description = parsed.data.description ? parsed.data.description.trim() : null;
  }

  if (parsed.data.isActive !== undefined) {
    updateData.isActive = parsed.data.isActive;
  }

  const [updated] = await db
    .update(roles)
    .set(updateData)
    .where(eq(roles.id, id))
    .returning();

  return updated;
}
