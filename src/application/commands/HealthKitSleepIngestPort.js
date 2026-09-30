import { ApplicationProblem } from "../../contracts/v1/problem.js";
import {
  HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION,
  HEALTHKIT_SLEEP_CONTRACT_VERSION,
  HEALTHKIT_SLEEP_DAY_COLLECTION,
  HEALTHKIT_SLEEP_SAMPLE_COLLECTION,
  HealthKitSleepContractError,
  HealthKitSleepDeletionSource,
  HealthKitSleepLifecycle,
  createHealthKitSleepSampleRecord,
  createHealthKitSleepTombstoneRecord,
  deriveHealthKitSleepDay,
  getHealthKitSleepDayRecordId,
  getHealthKitSleepSampleRecordId,
  normalizeHealthKitSleepBatch,
  shiftDateKey,
} from "../../domain/services/HealthKitSleepContract.js";
import {
  HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID,
  assessHealthKitSleepSampleActivation,
  resolveHealthKitSleepActivationPolicy,
  resolveHealthKitSleepSourcePreferencePolicy,
} from "../../domain/services/HealthKitSleepPolicies.js";
import {
  canonicalizeHealthKitSleep,
  emptyHealthKitSleepDay,
} from "../../domain/services/HealthKitSleepCanonicalizer.js";
import { assertNotQuarantinedHealthKitEvidence } from "../../domain/services/HealthKitEvidenceEligibilityPolicy.js";

/// `healthkit.sleep.ingest.v1`: HealthKit Sleep samples, deletions and a
/// bounded recent-window live-ID manifest in one idempotent command.
///
/// Dormant by construction: without an enabled Server-owned activation policy
/// the command is refused (409 HEALTHKIT_SLEEP_INGESTION_NOT_ENABLED) before
/// anything is read or written, so a thrown problem leaves no receipt and no
/// record. Every read is scoped to the Sleep collections and to a bounded
/// sleep-day range; the generic HealthKit observation collection is never read.
///
/// Per-sample failures (same UUID with conflicting immutable content, a sample
/// before the prospective activation floor) refuse only that sample; the rest of
/// the batch commits. Canonical days are recomputed only for touched days, and a
/// recomputation with an unchanged inputDigest writes nothing.
export function createHealthKitSleepIngestPort({ records, now = () => new Date() } = {}) {
  return async function ingestHealthKitSleep(context) {
    if (typeof records?.putIfAbsent !== "function" || typeof records?.listByOccurrenceDateRange !== "function") {
      throw new Error("HealthKit Sleep ingestion requires create-if-absent and scoped date-range record storage.");
    }
    let batch;
    try {
      batch = normalizeHealthKitSleepBatch(context.payload);
    } catch (error) {
      if (!(error instanceof HealthKitSleepContractError)) throw error;
      throw new ApplicationProblem({
        status: 400,
        code: error.code,
        title: error.message,
        fieldErrors: error.field ? [{ field: error.field, code: "invalid", detail: error.message }] : [],
      });
    }
    const ownerUserId = context.ownerUserId;
    const policy = resolveHealthKitSleepActivationPolicy(await records.get({
      ownerUserId, collection: HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION, recordId: HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID,
    }));
    if (!policy.enabled) {
      throw new ApplicationProblem({
        status: 409,
        code: "HEALTHKIT_SLEEP_INGESTION_NOT_ENABLED",
        title: "HealthKit Sleep ingestion is not enabled.",
        detail: "Keep Sleep changes on device and re-check the Native contract manifest.",
      });
    }
    const preference = resolveHealthKitSleepSourcePreferencePolicy(await records.get({
      ownerUserId, collection: HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION, recordId: HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID,
    }));
    const receivedAt = now().toISOString();
    const deliveryDeviceId = context.principal?.deviceId ?? null;
    const touchedDays = new Set();
    const changedSampleIds = new Set();
    // A changed sample can affect every sleep day from its start's day through
    // its end's day, widened by two days for zone skew (an episode's day uses
    // the zone of its last primary sample, which may differ by up to ~26 h).
    const touch = ({ id, startedAt, endedAt, timeZone }) => {
      if (id) changedSampleIds.add(id);
      const first = deriveHealthKitSleepDay(startedAt, timeZone);
      const last = deriveHealthKitSleepDay(endedAt, timeZone);
      if (!first || !last) return;
      for (let day = shiftDateKey(first, -2); day <= shiftDateKey(last, 2); day = shiftDateKey(day, 1)) touchedDays.add(day);
    };
    let recomputeTruncated = false;

    const sampleResults = [];
    const seenInBatch = new Map();
    for (const sample of batch.samples) {
      const inBatch = seenInBatch.get(sample.externalId);
      if (inBatch !== undefined) {
        // A repeat inside one batch mirrors the first copy's fate.
        if (inBatch.contentFingerprint !== sample.contentFingerprint) sampleResults.push(conflict(sample));
        else sampleResults.push(outcome(sample, inBatch.outcome === "stored" ? "replayed" : inBatch.outcome));
        continue;
      }
      const resultIndex = sampleResults.length;
      const remember = () => seenInBatch.set(sample.externalId, {
        contentFingerprint: sample.contentFingerprint, outcome: sampleResults[resultIndex]?.outcome,
      });
      const sampleDay = deriveHealthKitSleepDay(sample.endedAt, sample.timeZone);
      const activation = assessHealthKitSleepSampleActivation({ sample, policy, sampleSleepDay: sampleDay });
      if (!activation.admitted) {
        sampleResults.push(outcome(sample, `refused_${activation.reason}`));
        remember();
        continue;
      }
      const recordId = getHealthKitSleepSampleRecordId(ownerUserId, sample.externalId);
      const existing = await records.get({ ownerUserId, collection: HEALTHKIT_SLEEP_SAMPLE_COLLECTION, recordId });
      if (!existing) {
        const record = createHealthKitSleepSampleRecord({
          ownerUserId, sample, receivedAt, batchId: batch.batchId, deliveryDeviceId, ingestionPurpose: policy.mode,
        });
        const stored = await records.putIfAbsent({
          ownerUserId, collection: HEALTHKIT_SLEEP_SAMPLE_COLLECTION, recordId, payload: record,
        });
        if (stored.created) {
          touch({ ...sample, id: recordId });
          sampleResults.push(outcome(sample, "stored"));
        } else {
          sampleResults.push(stored.record?.contentFingerprint === sample.contentFingerprint ? outcome(sample, "replayed") : conflict(sample));
        }
      } else if (existing.tombstone) {
        // The deletion arrived first. HealthKit never reuses a UUID, so the
        // sample stays deleted; its content is kept only as provenance.
        const record = createHealthKitSleepSampleRecord({
          ownerUserId, sample, receivedAt, batchId: batch.batchId, deliveryDeviceId,
          ingestionPurpose: policy.mode, lifecycle: existing.lifecycle,
        });
        await records.put({
          ownerUserId, collection: HEALTHKIT_SLEEP_SAMPLE_COLLECTION, recordId, payload: record, expectedVersion: existing.version,
        });
        sampleResults.push(outcome(sample, "deleted_before_arrival"));
      } else if (existing.contentFingerprint === sample.contentFingerprint) {
        sampleResults.push(outcome(sample, "replayed"));
      } else {
        sampleResults.push(conflict(sample));
      }
      remember();
    }

    const deletionResults = [];
    for (const deletion of batch.deletions) {
      const recordId = getHealthKitSleepSampleRecordId(ownerUserId, deletion.externalId);
      const existing = await records.get({ ownerUserId, collection: HEALTHKIT_SLEEP_SAMPLE_COLLECTION, recordId });
      if (!existing) {
        await records.putIfAbsent({
          ownerUserId, collection: HEALTHKIT_SLEEP_SAMPLE_COLLECTION, recordId,
          payload: createHealthKitSleepTombstoneRecord({
            ownerUserId, externalId: deletion.externalId, deletedAt: receivedAt, batchId: batch.batchId,
            deletionSource: HealthKitSleepDeletionSource.HK_DELETED_OBJECT,
          }),
        });
        deletionResults.push(Object.freeze({ externalId: deletion.externalId, outcome: "tombstoned" }));
      } else if (existing.lifecycle?.state === HealthKitSleepLifecycle.DELETED) {
        deletionResults.push(Object.freeze({ externalId: deletion.externalId, outcome: "already_deleted" }));
      } else {
        await markDeleted(existing, HealthKitSleepDeletionSource.HK_DELETED_OBJECT);
        deletionResults.push(Object.freeze({ externalId: deletion.externalId, outcome: "deleted" }));
      }
    }

    let manifestResult = null;
    if (batch.windowManifest) {
      const { windowStart, windowEnd, liveExternalIds } = batch.windowManifest;
      const live = new Set(liveExternalIds);
      const startMs = Date.parse(windowStart);
      const endMs = Date.parse(windowEnd);
      const floorMs = Date.parse(policy.activationFloor);
      // Sample buckets use each sample's own zone; two days of margin keep any
      // real zone inside the scoped read. The instant test below is exact.
      const candidates = await records.listByOccurrenceDateRange({
        ownerUserId,
        collection: HEALTHKIT_SLEEP_SAMPLE_COLLECTION,
        startDate: shiftDateKey(deriveHealthKitSleepDay(startMs, "UTC"), -2),
        endDate: shiftDateKey(deriveHealthKitSleepDay(endMs, "UTC"), 2),
      });
      let markedDeleted = 0;
      for (const candidate of candidates) {
        if (candidate.tombstone || candidate.lifecycle?.state !== HealthKitSleepLifecycle.LIVE) continue;
        const ended = Date.parse(candidate.endedAt);
        if (!(ended >= startMs && ended < endMs) || ended < floorMs) continue;
        if (live.has(candidate.externalId)) continue;
        await markDeleted(candidate, HealthKitSleepDeletionSource.WINDOW_MANIFEST);
        markedDeleted += 1;
      }
      manifestResult = Object.freeze({ examined: candidates.length, markedDeleted });
    }

    const recomputed = await recomputeSleepDays(touchedDays);

    return Object.freeze({
      status: "committed",
      result: Object.freeze({
        contractVersion: HEALTHKIT_SLEEP_CONTRACT_VERSION,
        batchId: batch.batchId,
        ingestionPurpose: policy.mode,
        samples: Object.freeze(sampleResults),
        deletions: Object.freeze(deletionResults),
        windowManifest: manifestResult,
        sleepDays: Object.freeze(recomputed),
        recomputeTruncated,
        strategicEvidenceEligibility: "quarantined",
      }),
    });

    async function markDeleted(existing, deletionSource) {
      const payload = {
        ...existing,
        status: HealthKitSleepLifecycle.DELETED,
        lifecycle: { state: HealthKitSleepLifecycle.DELETED, deletedAt: receivedAt, deletionSource, deletionBatchId: batch.batchId },
      };
      delete payload.version;
      await records.put({
        ownerUserId, collection: HEALTHKIT_SLEEP_SAMPLE_COLLECTION, recordId: existing.id, payload, expectedVersion: existing.version,
      });
      if (existing.startedAt && existing.endedAt) touch(existing);
    }

    async function recomputeSleepDays(days) {
      if (days.size === 0) return [];
      // Fixed-point closure over sleep days. Computing day X reads samples
      // bucketed X-1..X+1. Any computed day whose inputs touch an affected
      // bucket joins the affected set together with all of its inputs'
      // buckets (so a day that lost samples to a merged episode is rewritten),
      // and inputs reaching the edge of a loaded range widen it. Bounded, so a
      // pathological chain can never make one batch unbounded.
      let affected = new Set(days);
      let pass = await computePass(affected);
      let iteration = 1;
      while (pass.expansion.size > 0) {
        if (iteration >= MAX_RECOMPUTE_PASSES || affected.size + pass.expansion.size > MAX_RECOMPUTED_DAYS) {
          // Bounded work per batch; the days written are still exactly the
          // ones the final pass computed. Reported so an operator can see it.
          recomputeTruncated = true;
          break;
        }
        affected = new Set([...affected, ...pass.expansion]);
        pass = await computePass(affected);
        iteration += 1;
      }
      const results = [];
      for (const sleepDay of [...affected].sort()) {
        const recordId = getHealthKitSleepDayRecordId(sleepDay);
        const existing = await records.get({ ownerUserId, collection: HEALTHKIT_SLEEP_DAY_COLLECTION, recordId });
        const content = pass.computed.get(sleepDay) ?? (existing ? emptyHealthKitSleepDay(sleepDay, { preference }) : null);
        if (!content) continue;
        if (existing?.inputDigest === content.inputDigest) continue;
        const payload = assertQuarantined({
          ...content,
          id: recordId,
          userId: ownerUserId,
          occurrenceDate: sleepDay,
          observedAt: content.windowClosesAt ?? existing?.observedAt ?? null,
          revision: Number(existing?.revision ?? 0) + 1,
          computedAt: receivedAt,
          evidenceEligibility: { state: "quarantined", strategic: false, decidedBy: "healthkit-strategic-evidence-quarantine-v1" },
        });
        await records.put({
          ownerUserId, collection: HEALTHKIT_SLEEP_DAY_COLLECTION, recordId, payload,
          expectedVersion: existing ? existing.version : null,
        });
        results.push(Object.freeze({ sleepDay, revision: payload.revision }));
      }
      return results;
    }

    async function computePass(affected) {
      const computed = new Map();
      const expansion = new Set();
      for (const run of contiguousRuns([...affected].sort())) {
        const low = shiftDateKey(run[0], -1);
        const high = shiftDateKey(run.at(-1), 1);
        const samples = await records.listByOccurrenceDateRange({
          ownerUserId, collection: HEALTHKIT_SLEEP_SAMPLE_COLLECTION, startDate: low, endDate: high,
        });
        const inRun = new Set(run);
        const relevantIds = new Set(changedSampleIds);
        for (const [sleepDay, content] of canonicalizeHealthKitSleep({ samples, preference })) {
          const buckets = content.inputSampleDays;
          if (!affected.has(sleepDay) && !buckets.some((bucket) => affected.has(bucket)) &&
            !content.inputSampleIds.some((id) => changedSampleIds.has(id))) continue;
          if (inRun.has(sleepDay)) computed.set(sleepDay, content);
          for (const id of content.inputSampleIds) relevantIds.add(id);
          for (const day of [sleepDay, ...buckets]) if (!affected.has(day)) expansion.add(day);
          if (buckets.some((bucket) => bucket <= low) && !affected.has(low)) expansion.add(low);
          if (buckets.some((bucket) => bucket >= high) && !affected.has(high)) expansion.add(high);
        }
        // Previously stored days that depended on any relevant sample must be
        // rewritten too, wherever (zone skew) they were stored.
        const storedDays = await records.listByOccurrenceDateRange({
          ownerUserId, collection: HEALTHKIT_SLEEP_DAY_COLLECTION, startDate: shiftDateKey(low, -2), endDate: shiftDateKey(high, 2),
        });
        for (const day of storedDays) {
          if (!(day.inputSampleIds ?? []).some((id) => relevantIds.has(id))) continue;
          for (const dependency of [day.sleepDay, ...(day.inputSampleDays ?? [])]) {
            if (dependency && !affected.has(dependency)) expansion.add(dependency);
          }
        }
      }
      return { computed, expansion };
    }
  };
}

// The sleep day record must be recognised as HealthKit-derived and quarantined;
// this proves the detector would refuse it at any strategic write boundary.
function assertQuarantined(payload) {
  try {
    assertNotQuarantinedHealthKitEvidence(payload, { context: "HealthKit Sleep day" });
  } catch (error) {
    if (error?.code === "HEALTHKIT_STRATEGIC_EVIDENCE_QUARANTINED") return payload;
    throw error;
  }
  throw new Error("A HealthKit Sleep day escaped the strategic quarantine detector.");
}

const MAX_RECOMPUTE_PASSES = 8;
const MAX_RECOMPUTED_DAYS = 45;

function contiguousRuns(sortedDays) {
  const runs = [];
  for (const day of sortedDays) {
    const last = runs.at(-1);
    if (last && shiftDateKey(last.at(-1), 1) === day) last.push(day);
    else runs.push([day]);
  }
  return runs;
}

function outcome(sample, result) {
  return Object.freeze({ externalId: sample.externalId, outcome: result });
}

// Contract violation for ONE sample: HealthKit objects are immutable, so the
// same UUID with different content is refused. Only a digest is reported.
function conflict(sample) {
  return Object.freeze({
    externalId: sample.externalId,
    outcome: "refused_identity_conflict",
    incomingContentDigest: sample.contentFingerprint,
  });
}
