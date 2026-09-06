export type TestStatus = "draft" | "published" | "closed" | "archived";

export type EffectiveStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "closed"
  | "archived";

export interface LifecycleTestInput {
  status: TestStatus;
  scheduledStartAt?: Date | string | null;
  scheduledEndAt?: Date | string | null;
  scheduleTimezone?: string | null;
  isPublished?: boolean;
}

/**
 * Reusable server-side helper to compute the authoritative effective availability
 * status of a test at any given instant.
 *
 * Boundary Semantics: Half-open interval [scheduledStartAt, scheduledEndAt)
 * - now < scheduledStartAt: "scheduled"
 * - now == scheduledStartAt: "active"
 * - scheduledStartAt <= now < scheduledEndAt: "active"
 * - now == scheduledEndAt: "closed"
 * - now > scheduledEndAt: "closed"
 */
export function getEffectiveTestStatus(
  test: LifecycleTestInput,
  nowInput?: Date | string | number | null
): EffectiveStatus {
  let status = test.status || "draft";
  if (status === "draft" && test.isPublished === true) {
    status = "published";
  }

  if (status === "draft") return "draft";
  if (status === "archived") return "archived";
  if (status === "closed") return "closed";

  if (status === "published") {
    const now = nowInput ? new Date(nowInput) : new Date();
    const nowMs = now.getTime();

    const startMs = test.scheduledStartAt
      ? new Date(test.scheduledStartAt).getTime()
      : null;
    const endMs = test.scheduledEndAt
      ? new Date(test.scheduledEndAt).getTime()
      : null;

    // 1. Future start -> scheduled
    if (startMs !== null && !isNaN(startMs) && nowMs < startMs) {
      return "scheduled";
    }

    // 2. Schedule expired -> closed
    if (endMs !== null && !isNaN(endMs) && nowMs >= endMs) {
      return "closed";
    }

    // 3. Otherwise within window or evergreen -> active
    return "active";
  }

  return "draft";
}

/**
 * Checks whether a student is allowed to create a NEW attempt for this test.
 */
export function isTestAvailableForNewAttempts(
  test: LifecycleTestInput,
  nowInput?: Date | string | number | null
): boolean {
  return getEffectiveTestStatus(test, nowInput) === "active";
}

/**
 * Centralized lifecycle transition validator for administrative operations.
 */
export function validateLifecycleTransition(
  currentStatus: TestStatus,
  targetStatus: TestStatus,
  hasAttempts: boolean
): { ok: boolean; error?: string } {
  if (currentStatus === targetStatus) {
    return { ok: true };
  }

  if (currentStatus === "archived") {
    return {
      ok: false,
      error:
        "Archived tests are terminal and cannot transition to other states. Duplicate the test to create an editable copy.",
    };
  }

  if (currentStatus === "draft") {
    if (targetStatus === "published" || targetStatus === "archived") {
      return { ok: true };
    }
    if (targetStatus === "closed") {
      return {
        ok: false,
        error:
          "Cannot close a draft test. You must publish the test first or leave it in draft.",
      };
    }
  }

  if (currentStatus === "published") {
    if (targetStatus === "closed" || targetStatus === "archived") {
      return { ok: true };
    }
    if (targetStatus === "draft") {
      if (hasAttempts) {
        return {
          ok: false,
          error:
            "Cannot revert a published test to draft because student attempts already exist. Close or archive the test instead.",
        };
      }
      return { ok: true };
    }
  }

  if (currentStatus === "closed") {
    if (targetStatus === "published") {
      return { ok: true }; // Reopening test
    }
    if (targetStatus === "archived") {
      return { ok: true };
    }
    if (targetStatus === "draft") {
      return {
        ok: false,
        error: "Cannot revert a closed test to draft.",
      };
    }
  }

  return {
    ok: false,
    error: `Invalid lifecycle transition from ${currentStatus} to ${targetStatus}.`,
  };
}

/**
 * Validates scheduling date ranges and timezone parameters.
 */
export function validateSchedule(
  startInput?: Date | string | null,
  endInput?: Date | string | null,
  timezoneInput?: string | null
): {
  ok: boolean;
  error?: string;
  startUtc: Date | null;
  endUtc: Date | null;
  timezone: string | null;
} {
  let startUtc: Date | null = null;
  let endUtc: Date | null = null;

  if (startInput !== undefined && startInput !== null && startInput !== "") {
    startUtc = new Date(startInput);
    if (isNaN(startUtc.getTime())) {
      return {
        ok: false,
        error: "Invalid scheduled start time format.",
        startUtc: null,
        endUtc: null,
        timezone: null,
      };
    }
  }

  if (endInput !== undefined && endInput !== null && endInput !== "") {
    endUtc = new Date(endInput);
    if (isNaN(endUtc.getTime())) {
      return {
        ok: false,
        error: "Invalid scheduled end time format.",
        startUtc: null,
        endUtc: null,
        timezone: null,
      };
    }
  }

  if (endUtc !== null && startUtc === null) {
    return {
      ok: false,
      error: "Start time is required when an end time is specified.",
      startUtc: null,
      endUtc: null,
      timezone: null,
    };
  }

  if (startUtc !== null && endUtc !== null) {
    if (endUtc.getTime() <= startUtc.getTime()) {
      return {
        ok: false,
        error: "End time must be strictly after start time.",
        startUtc: null,
        endUtc: null,
        timezone: null,
      };
    }
  }

  const timezone =
    typeof timezoneInput === "string" && timezoneInput.trim()
      ? timezoneInput.trim()
      : null;

  return {
    ok: true,
    startUtc,
    endUtc,
    timezone,
  };
}
