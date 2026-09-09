import { z } from "zod";

/**
 * Normalizes entity names (e.g. "  Google  " -> "google")
 * Collapses whitespace and lowers case for deterministic unique comparisons.
 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Converts text into a clean URL-friendly slug.
 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Validates whether a string is a valid HTTP/HTTPS URL.
 */
export function isValidUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(urlStr.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const companyCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Company name is required")
    .max(255, "Company name cannot exceed 255 characters"),
  slug: z
    .string()
    .trim()
    .max(255, "Slug cannot exceed 255 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain only lowercase letters, numbers, and hyphens")
    .optional(),
  industry: z
    .string()
    .trim()
    .min(1, "Industry is required")
    .max(100, "Industry cannot exceed 100 characters"),
  description: z
    .string()
    .trim()
    .max(2000, "Description cannot exceed 2000 characters")
    .nullable()
    .optional(),
  website: z
    .string()
    .trim()
    .max(500, "Website URL cannot exceed 500 characters")
    .refine((val) => !val || isValidUrl(val), {
      message: "Website must be a valid HTTP or HTTPS URL",
    })
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
});

export const companyUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Company name cannot be empty")
    .max(255, "Company name cannot exceed 255 characters")
    .optional(),
  slug: z
    .string()
    .trim()
    .max(255, "Slug cannot exceed 255 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain only lowercase letters, numbers, and hyphens")
    .optional(),
  industry: z
    .string()
    .trim()
    .min(1, "Industry cannot be empty")
    .max(100, "Industry cannot exceed 100 characters")
    .optional(),
  description: z
    .string()
    .trim()
    .max(2000, "Description cannot exceed 2000 characters")
    .nullable()
    .optional(),
  website: z
    .string()
    .trim()
    .max(500, "Website URL cannot exceed 500 characters")
    .refine((val) => !val || isValidUrl(val), {
      message: "Website must be a valid HTTP or HTTPS URL",
    })
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
});

export const roleCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Role name is required")
    .max(255, "Role name cannot exceed 255 characters"),
  slug: z
    .string()
    .trim()
    .max(255, "Slug cannot exceed 255 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain only lowercase letters, numbers, and hyphens")
    .optional(),
  category: z
    .string()
    .trim()
    .min(1, "Role category is required")
    .max(100, "Category cannot exceed 100 characters"),
  description: z
    .string()
    .trim()
    .max(2000, "Description cannot exceed 2000 characters")
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
});

export const roleUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Role name cannot be empty")
    .max(255, "Role name cannot exceed 255 characters")
    .optional(),
  slug: z
    .string()
    .trim()
    .max(255, "Slug cannot exceed 255 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain only lowercase letters, numbers, and hyphens")
    .optional(),
  category: z
    .string()
    .trim()
    .min(1, "Role category cannot be empty")
    .max(100, "Category cannot exceed 100 characters")
    .optional(),
  description: z
    .string()
    .trim()
    .max(2000, "Description cannot exceed 2000 characters")
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
});

export const studentTargetsUpdateSchema = z.object({
  primaryRoleId: z
    .string()
    .regex(uuidRegex, "Invalid role ID format")
    .nullable()
    .optional(),
  companyIds: z
    .array(z.string().regex(uuidRegex, "Invalid company ID format"))
    .max(10, "Cannot select more than 10 target companies")
    .refine((items) => new Set(items).size === items.length, {
      message: "Duplicate companies are not allowed in target list",
    })
    .optional(),
});

/**
 * Granular student targeting actions (Phase 11B).
 * Each action mutates exactly one relationship; all IDs are validated as UUIDs.
 */
export const studentTargetActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("addRole"),
    roleId: z.string().regex(uuidRegex, "Invalid role ID format"),
  }),
  z.object({
    action: z.literal("removeRole"),
    roleId: z.string().regex(uuidRegex, "Invalid role ID format"),
  }),
  z.object({
    action: z.literal("setPrimaryRole"),
    roleId: z.string().regex(uuidRegex, "Invalid role ID format"),
  }),
  z.object({
    action: z.literal("addCompany"),
    companyId: z.string().regex(uuidRegex, "Invalid company ID format"),
  }),
  z.object({
    action: z.literal("removeCompany"),
    companyId: z.string().regex(uuidRegex, "Invalid company ID format"),
  }),
  z.object({
    action: z.literal("setPrimaryCompany"),
    companyId: z.string().regex(uuidRegex, "Invalid company ID format"),
  }),
]);

export type StudentTargetAction = z.infer<typeof studentTargetActionSchema>;

export type CompanyCreateInput = z.input<typeof companyCreateSchema>;
export type CompanyUpdateInput = z.input<typeof companyUpdateSchema>;
export type RoleCreateInput = z.input<typeof roleCreateSchema>;
export type RoleUpdateInput = z.input<typeof roleUpdateSchema>;
export type StudentTargetsUpdateInput = z.input<typeof studentTargetsUpdateSchema>;
