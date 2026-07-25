export const PI_SEMANTIC_WINDOW_COMPATIBILITY_VERSION =
  "pi_semantic_window_compatibility_v1";

export function assessPISemanticWindowCompatibility(left, right) {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  if (!normalizedLeft || !normalizedRight) return result("unknown", ["window_unavailable"]);
  if (normalizedLeft.timeZone && normalizedRight.timeZone &&
      normalizedLeft.timeZone !== normalizedRight.timeZone) {
    return result("unknown", ["window_timezone_mismatch"]);
  }
  if (normalizedLeft.startDate === normalizedRight.startDate &&
      normalizedLeft.endDate === normalizedRight.endDate) {
    return result("exact_match", []);
  }
  if (normalizedLeft.endDate < normalizedRight.startDate) {
    return result(nextDay(normalizedLeft.endDate) === normalizedRight.startDate
      ? "adjacent" : "disjoint", []);
  }
  if (normalizedRight.endDate < normalizedLeft.startDate) {
    return result(nextDay(normalizedRight.endDate) === normalizedLeft.startDate
      ? "adjacent" : "disjoint", []);
  }
  return result("overlap_only", []);
}

function normalize(value) {
  const startDate = value?.startDate ?? String(value?.start ?? "").slice(0, 10);
  const endDate = value?.endDate ?? String(value?.end ?? "").slice(0, 10);
  if (!date(startDate) || !date(endDate) || startDate > endDate) return null;
  return {
    startDate,
    endDate,
    timeZone: value.timeZone ?? value.windowTimeZone ?? null,
  };
}
function result(state, limitations) {
  return Object.freeze({
    schemaVersion: PI_SEMANTIC_WINDOW_COMPATIBILITY_VERSION,
    state,
    authoritativeEligible: state === "exact_match",
    limitations: [...limitations],
    repositoryReads: 0,
    runtimeClockReads: 0,
  });
}
function nextDay(dateValue) {
  const value = new Date(`${dateValue}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}
function date(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
