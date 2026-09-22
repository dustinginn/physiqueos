import { createPhase4CanonicalRecordStore } from "./Phase4CanonicalRecordStore.js";
import {
  HEALTHKIT_CANONICAL_DAY_COLLECTION,
  HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION,
  HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
  HealthKitGraduationPurpose,
  overlayGraduatedHealthKitDays,
  resolveHealthKitGraduationPolicy,
} from "../../domain/services/HealthKitGraduation.js";

// The read-side seam for graduated HealthKit Activity and Nutrition days.
//
// Every reader that should see graduated days calls `overlay(...)` on the
// canonical evidence array it is about to consume. With the policy absent or a
// scope OFF this costs one single-row policy lookup and returns the SAME array
// untouched, so current behavior is unchanged. It reads two application-only
// collections and never writes anything. Any failure while reading the
// graduation state fails closed to the ordinary, un-overlaid evidence: an
// optional projection must never break an ordinary read.

export function createHealthKitGraduationReader({ records, query, ownerUserId, onError = null } = {}) {
  const store = records ?? (query ? createPhase4CanonicalRecordStore({ query }) : null);
  if (!store || !ownerUserId) throw new Error("HealthKit graduation reads require a record store and owner.");
  // A read that consumes several evidence lists (Energy) can share one policy
  // lookup, but ONLY inside an explicit run: `beginRun` starts one. A reader that
  // never begins a run (a long-lived worker) looks the policy up every time, so a
  // policy change is never masked by a stale memo.
  let pending = null;
  let inRun = false;
  const fetchPolicy = () => store.get({
    ownerUserId,
    collection: HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION,
    recordId: HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
  });
  const lookup = () => {
    if (!inRun) return fetchPolicy();
    pending ??= fetchPolicy();
    return pending;
  };
  return Object.freeze({
    beginRun() { pending = null; inRun = true; },
    /**
     * @param canonicalObjects the ordinary canonical evidence array
     * @param purpose projection (UI read models) or evidence (V3 / Energy / briefings)
     * @param domains restrict to the domains this reader consumes
     * @param dateWindow `{ startDate, endDate }` (inclusive) restricting the days to
     *   the window a reader actually loaded, so a windowed read never gains a day
     *   outside its window
     * @param policyRecord a policy record the caller already loaded in its own
     *   query (null when none exists); skips the lookup entirely
     */
    async overlay(canonicalObjects, { purpose = HealthKitGraduationPurpose.PROJECTION, domains = ["activity", "nutrition"], keepDateOrder = false, dateWindow = null, policyRecord } = {}) {
      try {
        const policy = resolveHealthKitGraduationPolicy(policyRecord === undefined ? await lookup() : policyRecord);
        const scope = purpose === HealthKitGraduationPurpose.EVIDENCE ? policy.evidenceEligibility : policy.projection;
        if (!scope.enabled || !domains.some((domain) => scope.domains.includes(domain))) return canonicalObjects;
        const days = (await store.list({ ownerUserId, collection: HEALTHKIT_CANONICAL_DAY_COLLECTION }))
          .filter((day) => domains.includes(day?.domain))
          .filter((day) => !dateWindow || (day.localDate >= dateWindow.startDate && day.localDate <= dateWindow.endDate));
        if (days.length === 0) return canonicalObjects;
        const { objects } = overlayGraduatedHealthKitDays({ canonicalObjects, healthKitDays: days, policy, purpose });
        if (objects === canonicalObjects) return canonicalObjects;
        return keepDateOrder ? insertInDateOrder(canonicalObjects, objects) : objects;
      } catch (error) {
        onError?.(error);
        return canonicalObjects;
      }
    },
  });
}

// A read that is already ordered by observed date keeps that order: each new
// or replaced day is placed by its date and no existing relative order changes.
// A list that is not date-ordered simply receives the days appended.
function insertInDateOrder(original, overlaid) {
  const dateOf = (object) => String(object?.payload?.observed_at ?? object?.observed_at ?? "").slice(0, 10);
  const originalSet = new Set(original);
  const kept = overlaid.filter((object) => originalSet.has(object));
  const added = overlaid.filter((object) => !originalSet.has(object));
  const sorted = kept.every((object, index) => index === 0 || dateOf(kept[index - 1]) <= dateOf(object));
  if (!sorted) return overlaid;
  // A merged day replaces its ordinary original, so it is placed by its date too.
  const result = [...kept];
  for (const object of added) {
    const at = result.findIndex((candidate) => dateOf(candidate) > dateOf(object));
    result.splice(at === -1 ? result.length : at, 0, object);
  }
  return result;
}
