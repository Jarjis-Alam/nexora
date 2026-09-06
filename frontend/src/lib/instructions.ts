/**
 * Validates admin-supplied test instructions (plain text only, Phase 7E).
 * - undefined / null / "" / whitespace-only -> NULL (no instructions)
 * - valid string -> trimmed, max 5000 characters
 * - non-string or >5000 characters -> error
 * Newlines inside the string are preserved.
 *
 * Pure function with no dependencies so it can be shared by the admin API
 * route and the Phase 7E audit suite.
 */
export function parseTestInstructions(
  value: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "Test instructions must be plain text." };
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }
  if (trimmed.length > 5000) {
    return { ok: false, error: "Test instructions cannot exceed 5000 characters." };
  }
  return { ok: true, value: trimmed };
}