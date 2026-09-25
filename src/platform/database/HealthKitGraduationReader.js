import { createHash } from "node:crypto";
import { createPhase4CanonicalRecordStore } from "./Phase4CanonicalRecordStore.js";
import {
  HEALTHKIT_CANONICAL_DAY_COLLECTION,
  HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION,
  HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
  HealthKitGraduationPurpose,
  isHealthKitGraduationInScope,
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
  // ONE coherent HealthKit canonical-day snapshot per run. Inside a run the day
  // list is read at most once and the SAME promise (resolved or rejected) serves
  // every consumer: the evidence overlay a briefing generator freezes AND the
  // settlement coverage that authorizes and watermarks it. Coverage is never
  // re-read from the store later in the tick, so the readiness decision, the
  // watermark's canonical record/revision identities, and the generator inputs
  // cannot disagree about which revision was seen. Outside a run every consumer
  // reads fresh (long-lived worker semantics). A new run drops the snapshot, so
  // a rejected read never outlives its tick.
  let daysPending = null;
  // True once a settlement gate has adopted the current run (see
  // `beginSettlementRun`): a second gate tick must start a new run rather than
  // re-serve a snapshot that is already a tick old.
  let runAdoptedBySettlement = false;
  // Set when the most recent EVIDENCE overlay could not read HealthKit state and
  // therefore fell back to the ordinary, un-overlaid evidence. Cleared only by a
  // later EVIDENCE overlay that read successfully (each cadence tick performs
  // one before evaluating settlement), never by `beginRun`: the settlement gate
  // must be able to tell that THIS tick's evidence is degraded even though it
  // begins its own run after the overlay ran.
  let evidenceOverlayFailure = null;
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
  const fetchDays = () => store.list({ ownerUserId, collection: HEALTHKIT_CANONICAL_DAY_COLLECTION });
  const loadDays = () => {
    if (!inRun) return fetchDays();
    daysPending ??= fetchDays();
    return daysPending;
  };
  return Object.freeze({
    beginRun() { pending = null; daysPending = null; inRun = true; runAdoptedBySettlement = false; },
    /**
     * The settlement gate's per-tick entry point. If a run was already begun by
     * the tick owner (the cadence composition begins one BEFORE the evidence
     * overlay reads) and no gate has adopted it yet, the gate ADOPTS it and the
     * overlay's snapshot stays the one coverage is derived from. Otherwise (a
     * stand-alone gate, or a second gate tick over the same run) it begins a
     * fresh run, so a gate that is not driven by a composition still gets one
     * coherent snapshot per tick and never a stale one across ticks.
     */
    beginSettlementRun() {
      if (inRun && !runAdoptedBySettlement) { runAdoptedBySettlement = true; return; }
      pending = null; daysPending = null; inRun = true; runAdoptedBySettlement = true;
    },
    /** Ends the run: drops the memoized policy and day snapshot (bounded memory) and returns to fresh reads. */
    endRun() { pending = null; daysPending = null; inRun = false; runAdoptedBySettlement = false; },
    /**
     * PII-free descriptor of the run's day snapshot: a digest over the
     * (domain, localDate, canonicalRecordId, revision, coverage) tuples only
     * (never a value), so a test or a log can prove two consumers used the same
     * snapshot. null when no run is active, no read has happened yet, or the
     * snapshot read failed.
     */
    async describeSnapshot() {
      if (!inRun || !daysPending) return null;
      let days;
      try { days = await daysPending; } catch { return null; }
      const tuples = days.map((day) => [
        day?.domain ?? null, day?.localDate ?? null,
        day?.current?.canonicalRecordId ?? day?.id ?? null,
        day?.current?.revision ?? day?.revision ?? null,
        day?.current?.coverage ?? null,
      ]).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);
      return Object.freeze({
        dayCount: tuples.length,
        digest: createHash("sha256").update(JSON.stringify(tuples)).digest("hex"),
      });
    },
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
      const isEvidence = purpose === HealthKitGraduationPurpose.EVIDENCE;
      try {
        const result = await overlayUnchecked(canonicalObjects, { purpose, domains, keepDateOrder, dateWindow, policyRecord });
        if (isEvidence) evidenceOverlayFailure = null;
        return result;
      } catch (error) {
        if (isEvidence) evidenceOverlayFailure = describeReadError(error, "evidence_overlay");
        onError?.(error);
        return canonicalObjects;
      }
    },
    /**
     * Coverage-only read for the Briefing Evidence Settlement gate: whether a
     * domain's final local evidence day has settled as `complete_day` in
     * HealthKit, restricted to whichever of `domains` are actually in
     * evidence-eligibility scope for this owner right now. Never returns an
     * observed value — coverage/canonical-record-identity/revision only —
     * because the settlement gate decides WHEN to generate, never WHAT a
     * briefing says, and observed values must stay out of any read that
     * isn't itself already the evidence-eligibility overlay above.
     *
     * A READ FAILURE IS NOT "nothing is HealthKit-backed". `activeDomains: []`
     * means the owner genuinely has no in-scope domain for that date (settlement
     * not applicable). A failed read returns `{ readError }` instead — with
     * `activeDomains: []` for shape stability — so the gate can fail CLOSED
     * (wait/retry until the hard deadline) instead of freezing a briefing on
     * partial evidence because of a transient store error. The same applies when
     * this tick's evidence overlay silently degraded to ordinary evidence.
     * `readError` carries only an error class name/code, never a message.
     */
    async readSettlementCoverage({ localDate, domains = ["activity", "nutrition"] } = {}) {
      if (evidenceOverlayFailure) {
        return { activeDomains: [], domainStates: {}, readError: evidenceOverlayFailure };
      }
      try {
        return await readSettlementCoverageUnchecked({ localDate, domains });
      } catch (error) {
        onError?.(error);
        return { activeDomains: [], domainStates: {}, readError: describeReadError(error, "settlement_coverage") };
      }
    },
  });

  async function overlayUnchecked(canonicalObjects, { purpose, domains, keepDateOrder, dateWindow, policyRecord }) {
    const policy = resolveHealthKitGraduationPolicy(policyRecord === undefined ? await lookup() : policyRecord);
    const scope = purpose === HealthKitGraduationPurpose.EVIDENCE ? policy.evidenceEligibility : policy.projection;
    if (!scope.enabled || !domains.some((domain) => scope.domains.includes(domain))) return canonicalObjects;
    const days = (await loadDays())
      .filter((day) => domains.includes(day?.domain))
      .filter((day) => !dateWindow || (day.localDate >= dateWindow.startDate && day.localDate <= dateWindow.endDate));
    if (days.length === 0) return canonicalObjects;
    const { objects } = overlayGraduatedHealthKitDays({ canonicalObjects, healthKitDays: days, policy, purpose });
    if (objects === canonicalObjects) return canonicalObjects;
    return keepDateOrder ? insertInDateOrder(canonicalObjects, objects) : objects;
  }

  async function readSettlementCoverageUnchecked({ localDate, domains }) {
    const policy = resolveHealthKitGraduationPolicy(await lookup());
    const scope = policy.evidenceEligibility;
    // Domain in scope is necessary but not sufficient: a cadence whose
    // final evidence day falls before the scope's own startLocalDate (or
    // after an endLocalDate) is not HealthKit-backed for THIS date, even
    // though the domain itself is graduated in general — that date must
    // short-circuit to "not applicable" exactly like a non-graduated
    // domain, not sit waiting on a day HealthKit was never going to
    // canonicalize.
    const activeDomains = domains.filter((domain) =>
      isHealthKitGraduationInScope(scope, { domain, localDate }));
    if (activeDomains.length === 0) return { activeDomains: [], domainStates: {} };
    const days = (await loadDays())
      .filter((day) => activeDomains.includes(day?.domain) && day?.localDate === localDate);
    const domainStates = Object.fromEntries(activeDomains.map((domain) => {
      const day = days.find((item) => item.domain === domain);
      return [domain, day ? {
        present: true,
        coverage: day.current?.coverage ?? "missing",
        canonicalRecordId: day.current?.canonicalRecordId ?? day.id ?? null,
        revision: day.current?.revision ?? day.revision ?? null,
      } : { present: false, coverage: "missing" }];
    }));
    return { activeDomains, domainStates };
  }
}

// Only the error class and code: never a message (drivers put SQL, parameters
// and host names in messages) — safe for an operational log line.
function describeReadError(error, stage) {
  return Object.freeze({
    stage,
    name: String(error?.name ?? "Error").slice(0, 80),
    code: String(error?.code ?? "UNCLASSIFIED_ERROR").slice(0, 80),
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
