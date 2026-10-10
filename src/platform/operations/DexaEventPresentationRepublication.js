import { createHash } from "node:crypto";
import { canonicalJson } from "../../contracts/v1/canonicalJson.js";
import { composeDexaEventPlainLanguage } from "../../domain/services/DEXAEventPlainLanguage.js";
import { RuntimeAuthority } from "../cutover/CombinedRuntimeAuthorityState.js";

/**
 * Guarded presentation-only republication of ONE published DEXA Event: the
 * October 9 2026 briefing.
 *
 * Why: that briefing was published on 539f7006, before the plain-language
 * presentation (5e91aa5d). Its text repeats the same conclusions in technical
 * words. The existing `regenerate` path cannot fix only the words: it re-runs
 * Confidence finalization in publish-successor mode against the current
 * snapshot, which is this briefing's own assessment, so it would publish a new
 * successor assessment and could change the published 70% (down from 80).
 *
 * What this does: re-words the stored briefing with the deployed plain-language
 * composer (`composeDexaEventPlainLanguage`) from the briefing's own stored
 * facts and the stored assessment's narrative plan. Nothing is recomputed. The
 * goal-progress band the composer needs is read from the stored assessment's
 * outlook and must agree with the stored V3 meaning sentence.
 *
 * What changes (exact allowlist, enforced by a whole-record diff): hero title
 * and body, tile labels and contexts (values untouched), interpretation
 * (including the evidence note: supporting evidence and uncertainty), Coach's
 * Insight, and a `plainLanguage` audit block. Everything else in the record is
 * byte-for-byte identical, including `confidencePublication`, `goalConfidence`,
 * the V3 narrative, progress, snapshot, references and evidence binding. No
 * other row is written: not the assessment, history or snapshot, not the scan,
 * analysis, PDF or Apple Health receipts, and no other briefing.
 *
 * How: preview is read-only and seals every fact the rewrite depends on. Apply
 * needs a separate Founder authorization reference and that seal, and writes
 * through `executePostgresFounderRecordMutation` (the system's named-record
 * write: owner advisory lock, runtime authority boundary, FOR UPDATE read,
 * UPDATE fenced on the read version, runtime revision bump). Inside that
 * transaction it re-reads every fact, re-plans and refuses on any drift. No
 * Founder identifier is stored in source: the owner comes from the runtime
 * binding and the briefing is found by its scan date.
 */
export const OCTOBER9_DEXA_PRESENTATION_REPUBLICATION_SCOPE = Object.freeze({
  republicationId: "dexa-2026-10-09-presentation-republication-v1",
  scanDate: "2026-10-09",
  collection: "dailyBriefings",
  recordIdPrefix: "dexa_event_",
  expectedRecordVersion: 1,
  expectedPresentationVersion: "dexa_event_presentation_v1_6_0",
  expectedConfidence: Object.freeze({ score: 70, priorScore: 80, movement: "decrease", movementDirection: "decreased" }),
  // The approved wording ("You're more than halfway to your muscle-building
  // target") is the more-than-half band.
  expectedGoalProgressBand: "more_than_half",
});

export const DEXA_REPUBLICATION_SEAL_VERSION = "dexa-presentation-republication-seal-v1";
export const DEXA_REPUBLICATION_SCHEMA = "dexa_event_presentation_republication_v1";
export const DEXA_REPUBLICATION_OPERATION = "dexa-event-presentation-republication";

const NARRATIVE = "briefing.dexaEventNarrative";
// Every path the rewrite may change, relative to the stored record. A diff of
// the whole record must fall entirely inside these.
export const DEXA_REPUBLICATION_ALLOWED_PATHS = Object.freeze([
  /^briefing\.dexaEventNarrative\.hero\.(title|body)$/,
  /^briefing\.dexaEventNarrative\.hero\.results\[\d+\]\.(label|context)$/,
  /^briefing\.dexaEventNarrative\.interpretation\.[A-Za-z]+$/,
  /^briefing\.dexaEventNarrative\.coachInsight\.(biggestWin|protect|watch|next)$/,
  /^briefing\.dexaEventNarrative\.plainLanguage$/,
]);
// Written only at apply, so they are outside every sealed digest.
const APPLY_ONLY_FIELDS = Object.freeze(["authorizationReference", "appliedAt", "commandId"]);
const BAND_SENTENCES = Object.freeze({
  reached: /\bYou reached\b/,
  more_than_half: /\bmore than halfway to\b/,
  half: /\bhalfway to\b/,
});

/**
 * Read-only facts. `query` runs inside a transaction the caller owns: READ ONLY
 * for preview and postflight, the named-record mutation's transaction for apply
 * (`lock` adds row locks to the single-row reads). Every statement is a SELECT
 * scoped to the owner.
 */
export async function loadDexaEventPresentationRepublicationFacts({
  query, ownerUserId, scope = OCTOBER9_DEXA_PRESENTATION_REPUBLICATION_SCOPE, lock = false,
  authorityEnvironment = null,
}) {
  const forUpdate = lock ? " FOR UPDATE" : "";
  const events = (await query(
    `SELECT record_id, version, legacy_id, status, occurrence_date::text AS occurrence_date, observed_at,
            source_identity, provenance, payload
       FROM physiqueos.canonical_briefing_records
      WHERE owner_user_id=$1 AND collection_name='dailyBriefings'
        AND payload#>>'{briefing,dexaEventNarrative,scanDate}'=$2
      ORDER BY record_id${forUpdate}`,
    [ownerUserId, scope.scanDate],
  )).rows.map((row) => ({
    recordId: row.record_id,
    version: Number(row.version),
    columns: {
      legacyId: row.legacy_id ?? null,
      status: row.status ?? null,
      occurrenceDate: row.occurrence_date ?? null,
      observedAt: iso(row.observed_at),
      sourceIdentity: row.source_identity ?? null,
      provenance: row.provenance ?? null,
    },
    payload: row.payload,
  }));
  const event = events.length === 1 ? events[0] : null;
  const assessmentId = event?.payload?.confidencePublication?.assessmentId ?? null;
  const assessments = assessmentId ? (await query(
    `SELECT record_id, version, payload FROM physiqueos.canonical_confidence_records
      WHERE owner_user_id=$1 AND collection_name='goalConfidenceHistory'
        AND (payload->>'id'=$2 OR payload->>'assessmentId'=$2)
      ORDER BY record_id${forUpdate}`,
    [ownerUserId, assessmentId],
  )).rows.map((row) => ({ recordId: row.record_id, version: Number(row.version), payload: row.payload })) : [];
  const snapshots = assessmentId ? (await query(
    `SELECT record_id, version, payload->>'currentAssessmentId' AS current_assessment_id
       FROM physiqueos.canonical_confidence_records
      WHERE owner_user_id=$1 AND collection_name='goalConfidenceSnapshots'
        AND strpos(payload::text, $2) > 0
      ORDER BY record_id${forUpdate}`,
    [ownerUserId, assessmentId],
  )).rows.map((row) => ({ recordId: row.record_id, version: Number(row.version), currentAssessmentId: row.current_assessment_id ?? null })) : [];
  const fingerprint = async (table, where, values) => {
    const row = (await query(
      `SELECT count(*)::int AS n,
              COALESCE(md5(string_agg(collection_name||'|'||record_id||'|'||version::text||'|'||md5(payload::text), E'\\n'
                ORDER BY collection_name, record_id)), '') AS digest
         FROM physiqueos.${table}
        WHERE owner_user_id=$1 AND ${where}`,
      [ownerUserId, ...values],
    )).rows[0] ?? {};
    return Object.freeze({ count: Number(row.n ?? 0), digest: String(row.digest ?? "") });
  };
  const canonicalId = `dexa_scan|${ownerUserId}|${scope.scanDate}`;
  const evidenceId = event?.payload?.trigger?.evidenceId ?? "";
  const recordId = event?.recordId ?? "";
  // Fingerprints of everything the rewrite must not touch. Sealed: any change
  // between preview and apply refuses.
  const linked = Object.freeze({
    assessment: await fingerprint("canonical_confidence_records",
      "collection_name='goalConfidenceHistory' AND (payload->>'id'=$2 OR payload->>'assessmentId'=$2)", [assessmentId ?? ""]),
    confidenceHistory: await fingerprint("canonical_confidence_records", "collection_name='goalConfidenceHistory'", []),
    confidenceSnapshots: await fingerprint("canonical_confidence_records", "collection_name='goalConfidenceSnapshots'", []),
    canonicalScan: await fingerprint("canonical_evidence_records",
      "collection_name='canonicalEvidenceObjects' AND (payload->>'canonicalId'=$2 OR record_id=$3)", [canonicalId, evidenceId]),
    legacyScan: await fingerprint("canonical_evidence_records",
      "collection_name='dexaScans' AND (record_id=$2 OR left(COALESCE(payload->>'measuredAt',''),10)=$3)", [evidenceId, scope.scanDate]),
    analyses: await fingerprint("canonical_confidence_records",
      "collection_name='analyses' AND (payload->'evidenceIds' ? $2 OR strpos(payload::text, $3) > 0)", [canonicalId, evidenceId || "dexa-republication:no-evidence-id"]),
    healthKitReceipts: await fingerprint("canonical_training_records",
      "collection_name='dexaHealthKitWritebackReceipts' AND payload->>'canonicalId'=$2", [canonicalId]),
    otherDexaEvents: await fingerprint("canonical_briefing_records",
      "collection_name='dailyBriefings' AND record_id LIKE 'dexa\\_event\\_%' AND record_id<>$2", [recordId]),
  });
  // Not sealed (other briefings are published on schedule); postflight reports
  // whether anything else in dailyBriefings changed.
  const otherBriefings = await fingerprint("canonical_briefing_records",
    "collection_name='dailyBriefings' AND record_id<>$2", [recordId]);
  const authorityState = authorityEnvironment ? (await query(
    "SELECT state FROM physiqueos.combined_runtime_authority WHERE environment=$1",
    [authorityEnvironment],
  )).rows[0]?.state ?? null : null;
  const runtimeRevision = Number((await query(
    "SELECT revision FROM physiqueos.canonical_runtime_metadata WHERE owner_user_id=$1",
    [ownerUserId],
  )).rows[0]?.revision ?? NaN);
  return Object.freeze({
    events,
    event,
    assessments,
    snapshots,
    linked,
    otherBriefings,
    authority: authorityEnvironment ? Object.freeze({
      present: Boolean(authorityState),
      // The same conditions the authority store requires before a provider write.
      writable: Boolean(authorityState) && authorityState.authority === RuntimeAuthority.PROVIDER &&
        authorityState.publicRuntimeAuthority === "provider" && authorityState.canonicalStoreEpoch === "postgres-canonical" &&
        authorityState.compositionMode === "postgres" && authorityState.writesEnabled === true,
      // When recorded, the write boundary claim writes nothing.
      firstWriteRecorded: authorityState?.firstProviderCanonicalWriteAt != null,
      migrationOperationId: authorityState?.migrationOperationId ?? null,
    }) : null,
    runtimeRevision,
  });
}

/**
 * Pure plan. Returns a refusal, `already_applied`, or the exact rewrite, its
 * field diff and the seal apply must reproduce.
 */
export function planDexaEventPresentationRepublication({
  facts, ownerUserId, scope = OCTOBER9_DEXA_PRESENTATION_REPUBLICATION_SCOPE, migrationOperationId = null,
}) {
  const refuse = (code, detail) => Object.freeze({ outcome: "refused", code, detail });
  if (!String(ownerUserId ?? "").trim()) return refuse("OWNER_MISSING", "The runtime owner binding is required.");
  if (facts.events.length !== 1) return refuse("EVENT_NOT_SINGLETON", `Found ${facts.events.length} briefings for the ${scope.scanDate} scan.`);
  const { event } = facts;
  const before = event.payload ?? {};
  const narrative = before.briefing?.dexaEventNarrative;
  if (before.userId !== ownerUserId) return refuse("OWNER_MISMATCH", "The briefing belongs to a different owner.");
  if (before.id !== event.recordId || !event.recordId.startsWith(scope.recordIdPrefix) ||
      before.trigger?.evidenceType !== "dexa" || before.artifactType !== "event" || before.cadence !== "event" || !narrative) {
    return refuse("EVENT_IDENTITY_UNEXPECTED", "The row is not a DEXA Event briefing.");
  }
  if (narrative.scanDate !== scope.scanDate) return refuse("EVENT_SCAN_DATE_MISMATCH", "The briefing's scan date differs.");
  if (Number(before.version) !== event.version) return refuse("EVENT_VERSION_INCONSISTENT", "Payload and row versions differ.");
  const ours = narrative.plainLanguage?.republication?.republicationId === scope.republicationId;
  if (ours && event.version === scope.expectedRecordVersion + 1) {
    return Object.freeze({ outcome: "already_applied", recordVersion: event.version, presentationDigest: presentationDigest(before) });
  }
  if (narrative.plainLanguage || narrative.presentationRolesV3) {
    return refuse("EVENT_ALREADY_PLAIN_LANGUAGE", "The briefing already carries a plain-language presentation.");
  }
  if (event.version !== scope.expectedRecordVersion) return refuse("EVENT_VERSION_UNEXPECTED", `Record version is ${event.version}.`);
  if (narrative.presentationVersion !== scope.expectedPresentationVersion ||
      before.briefing?.presentationVersion !== scope.expectedPresentationVersion) {
    return refuse("PRESENTATION_VERSION_UNEXPECTED", "The briefing's presentation version differs.");
  }

  const publication = before.confidencePublication ?? {};
  const confidence = narrative.goalConfidence ?? {};
  const assessmentId = publication.assessmentId;
  if (!assessmentId || confidence.assessmentId !== assessmentId) return refuse("CONFIDENCE_BINDING_MISMATCH", "Published and embedded Confidence differ.");
  if (facts.assessments.length !== 1) return refuse("ASSESSMENT_NOT_SINGLETON", `Found ${facts.assessments.length} history rows for the assessment.`);
  const wrapper = facts.assessments[0].payload ?? {};
  const assessment = wrapper.assessment ?? wrapper;
  if (assessment.id !== assessmentId || (wrapper.assessmentId != null && wrapper.assessmentId !== assessmentId)) {
    return refuse("ASSESSMENT_IDENTITY_MISMATCH", "The history row is not the published assessment.");
  }
  if ((assessment.briefingArtifactId ?? assessment.originatingBriefingId) !== before.id) {
    return refuse("ASSESSMENT_ARTIFACT_MISMATCH", "The assessment was not published by this briefing.");
  }
  const expected = scope.expectedConfidence;
  if (confidence.score !== expected.score || confidence.priorScore !== expected.priorScore ||
      confidence.movementDirection !== expected.movementDirection ||
      assessment.currentPercentage !== expected.score || assessment.priorPercentage !== expected.priorScore ||
      assessment.movement !== expected.movement) {
    return refuse("CONFIDENCE_UNEXPECTED", "The published Confidence is not the expected result.");
  }
  if (facts.snapshots.length !== 1 || facts.snapshots[0].currentAssessmentId !== assessmentId) {
    return refuse("SNAPSHOT_POINTER_UNEXPECTED", `Expected one active snapshot on the assessment; found ${facts.snapshots.length}.`);
  }
  if (facts.authority) {
    if (!facts.authority.writable) return refuse("CANONICAL_WRITES_NOT_AUTHORIZED", "Runtime authority does not allow provider writes.");
    if (!facts.authority.firstWriteRecorded) return refuse("AUTHORITY_BOUNDARY_NOT_RECORDED", "The write boundary claim would write the authority row.");
    if (migrationOperationId != null && String(migrationOperationId) !== String(facts.authority.migrationOperationId)) {
      return refuse("AUTHORITY_OPERATION_CONFLICT", "The runtime migration operation differs.");
    }
  }

  const narrativePlan = assessment.narrativePlan;
  if (!narrativePlan) return refuse("NARRATIVE_PLAN_MISSING", "The assessment has no narrative plan.");
  const band = deriveStoredGoalProgressBand(assessment);
  if (band.code) return refuse(band.code, band.detail);
  if (band.band !== scope.expectedGoalProgressBand) {
    return refuse("GOAL_PROGRESS_BAND_UNEXPECTED", `The stored goal progress is ${band.band ?? "unbanded"}.`);
  }
  const plain = composeDexaEventPlainLanguage({
    event: structuredClone(narrative), narrativePlan: structuredClone(narrativePlan), roles: { goalProgress: band.band },
  });
  if (!plain) return refuse("PLAIN_LANGUAGE_UNAVAILABLE", "The plain-language composer declined these facts.");

  const after = structuredClone(before);
  const next = after.briefing.dexaEventNarrative;
  next.hero = { ...next.hero, title: plain.hero.title, body: plain.hero.body, results: plain.hero.results };
  next.interpretation = plain.interpretation;
  next.coachInsight = { ...(next.coachInsight ?? {}), ...plain.coachInsight };
  next.plainLanguage = {
    schemaVersion: plain.schemaVersion,
    claims: plain.claims,
    republication: {
      schemaVersion: DEXA_REPUBLICATION_SCHEMA,
      republicationId: scope.republicationId,
      basis: "stored_briefing_and_assessment",
      sourceRecordVersion: event.version,
      sourcePresentationVersion: narrative.presentationVersion,
      assessmentId,
      goalProgressBand: band.band,
      goalProgressSource: "assessment_outlook_fraction_achieved",
      // The replaced text, so the row is its own exact rollback source.
      previousPresentation: previousPresentation(narrative),
    },
  };

  const changedPaths = diffPaths(before, after);
  const outside = changedPaths.filter((path) => !DEXA_REPUBLICATION_ALLOWED_PATHS.some((pattern) => pattern.test(path)));
  if (outside.length) return refuse("CHANGE_OUTSIDE_ALLOWLIST", `Would change ${outside.join(", ")}.`);
  const results = narrative.hero?.results ?? [];
  if (!Array.isArray(results) || results.length !== next.hero.results.length) {
    return refuse("TILES_CHANGED_SHAPE", "The tiles would change count.");
  }
  if (digest(preserved(before)) !== digest(preserved(after))) return refuse("PRESERVED_FIELDS_CHANGED", "A preserved field would change.");
  const metadata = republicationRecordMetadata({ ...after, version: event.version + 1 });
  const rewritten = Object.keys(metadata).filter((key) => canonicalJson(metadata[key] ?? null) !== canonicalJson(event.columns?.[key] ?? null));
  if (rewritten.length) return refuse("ROW_METADATA_WOULD_CHANGE", `Row metadata ${rewritten.join(", ")} would be rewritten.`);

  const sealed = Object.freeze({
    sealVersion: DEXA_REPUBLICATION_SEAL_VERSION,
    republicationId: scope.republicationId,
    ownerDigest: digest(ownerUserId),
    collection: scope.collection,
    recordId: event.recordId,
    recordVersion: event.version,
    recordDigest: digest(before),
    assessment: Object.freeze({ id: assessmentId, recordVersion: facts.assessments[0].version, digest: digest(wrapper) }),
    confidenceBindingDigest: digest(confidenceBinding(before)),
    confidence: Object.freeze({ score: confidence.score, priorScore: confidence.priorScore, movement: assessment.movement }),
    snapshot: Object.freeze({ recordId: facts.snapshots[0].recordId, version: facts.snapshots[0].version }),
    linked: facts.linked,
    goalProgressBand: band.band,
    beforePresentationDigest: presentationDigest(before),
    afterPresentationDigest: presentationDigest(after),
    preservedDigest: digest(preserved(after)),
    afterDigest: digest(withoutApplyMetadata(after)),
    changedPaths: Object.freeze(changedPaths),
  });
  return Object.freeze({
    outcome: "republish",
    sealed,
    sealDigest: digest(sealed),
    after,
    predictedMutation: `1 fenced UPDATE of dailyBriefings (version ${event.version} -> ${event.version + 1}) changing ${changedPaths.length} presentation paths, plus the runtime revision bump every canonical write makes; no other row written`,
  });
}

/**
 * Preview: read-only plan and seal. The caller owns the READ ONLY transaction.
 */
export async function previewDexaEventPresentationRepublication({
  query, ownerUserId, scope = OCTOBER9_DEXA_PRESENTATION_REPUBLICATION_SCOPE, authorityEnvironment = null, migrationOperationId = null,
}) {
  const facts = await loadDexaEventPresentationRepublicationFacts({ query, ownerUserId, scope, authorityEnvironment });
  const plan = planDexaEventPresentationRepublication({ facts, ownerUserId, scope, migrationOperationId });
  return Object.freeze({ mode: "preview", ...plan, otherBriefings: facts.otherBriefings, runtimeRevision: facts.runtimeRevision });
}

/**
 * Apply: one named-record mutation. Inside its transaction (owner lock,
 * authority boundary, the record read FOR UPDATE) every fact is re-read with
 * row locks and re-planned; the plan must reproduce the seal exactly, or
 * nothing is written. `executeRecordMutation` is
 * `executePostgresFounderRecordMutation` bound to the pool and authority store.
 */
export async function applyDexaEventPresentationRepublication({
  executeRecordMutation, ownerUserId, seal, authorizationReference = "",
  scope = OCTOBER9_DEXA_PRESENTATION_REPUBLICATION_SCOPE, authorityEnvironment = null, migrationOperationId = null,
  now = () => new Date(),
}) {
  if (typeof executeRecordMutation !== "function") throw republicationError("RECORD_MUTATION_REQUIRED");
  if (!String(authorizationReference).trim()) throw republicationError("AUTHORIZATION_REFERENCE_REQUIRED");
  const sealed = seal?.sealed;
  if (!seal?.sealDigest || sealed?.sealVersion !== DEXA_REPUBLICATION_SEAL_VERSION || digest(sealed) !== seal.sealDigest) {
    throw republicationError("SEAL_REQUIRED");
  }
  if (sealed.republicationId !== scope.republicationId || sealed.collection !== scope.collection) throw republicationError("SEAL_SCOPE_MISMATCH");
  let decision = null;
  try {
    const receipt = await executeRecordMutation({
      ownerUserId,
      operation: DEXA_REPUBLICATION_OPERATION,
      records: [{ collection: scope.collection, recordId: sealed.recordId }],
      mutate: async ({ read }, { client, commandId }) => {
        const query = (text, values) => client.query(text, values);
        const facts = await loadDexaEventPresentationRepublicationFacts({ query, ownerUserId, scope, lock: true, authorityEnvironment });
        const locked = read(scope.collection, sealed.recordId);
        if (!locked || !facts.event || facts.event.recordId !== sealed.recordId ||
            locked.version !== facts.event.version || digest(locked) !== digest(facts.event.payload)) {
          decision = { outcome: "refused", code: "SEAL_DRIFT", detail: "The locked record differs from the facts read." };
          throw stopWrite();
        }
        const plan = planDexaEventPresentationRepublication({ facts, ownerUserId, scope, migrationOperationId });
        if (plan.outcome === "already_applied") { decision = plan; throw stopWrite(); }
        if (plan.outcome !== "republish") { decision = plan; throw stopWrite(); }
        if (plan.sealDigest !== seal.sealDigest || canonicalJson(plan.sealed) !== canonicalJson(sealed)) {
          decision = { outcome: "refused", code: "SEAL_DRIFT", detail: "Production state differs from the sealed preview; run a fresh preview." };
          throw stopWrite();
        }
        const payload = structuredClone(plan.after);
        Object.assign(payload.briefing.dexaEventNarrative.plainLanguage.republication, {
          authorizationReference: String(authorizationReference),
          appliedAt: now().toISOString(),
          commandId,
        });
        return {
          writes: [{ collection: scope.collection, recordId: sealed.recordId, payload }],
          result: { outcome: "applied", sealDigest: plan.sealDigest, recordVersion: sealed.recordVersion + 1 },
        };
      },
    });
    const result = receipt.result ?? {};
    if (result.outcome !== "applied" || receipt.changedRecords.length !== 1) throw republicationError("APPLY_RESULT_UNEXPECTED");
    return Object.freeze({
      mode: "apply", ...result, rowsChanged: receipt.changedRecords.length, runtimeRevision: receipt.revision,
      authorizationReference: String(authorizationReference), memoryProfile: receipt.memoryProfile,
    });
  } catch (error) {
    if (error?.code === "REPUBLICATION_STOP" && decision) return Object.freeze({ mode: "apply", ...decision });
    throw error;
  }
}

/**
 * Read-only postflight against the sealed preview: the one record is the
 * sealed rewrite at the next version, and nothing it depends on moved.
 */
export function verifyDexaEventPresentationRepublicationPostflight({
  facts, seal, ownerUserId, scope = OCTOBER9_DEXA_PRESENTATION_REPUBLICATION_SCOPE, otherBriefingsAtSeal = null,
}) {
  const sealed = seal?.sealed;
  if (!sealed) throw republicationError("SEAL_REQUIRED");
  const checks = [];
  const check = (name, ok, detail = null) => checks.push(Object.freeze({ name, ok: Boolean(ok), ...(detail ? { detail } : {}) }));
  const event = facts.event;
  const payload = event?.payload ?? {};
  const republication = payload.briefing?.dexaEventNarrative?.plainLanguage?.republication ?? {};
  check("owner_matches_seal", digest(ownerUserId) === sealed.ownerDigest && payload.userId === ownerUserId);
  check("single_event_for_scan", facts.events.length === 1 && event?.recordId === sealed.recordId);
  check("record_version_advanced_once", event?.version === sealed.recordVersion + 1 && Number(payload.version) === event?.version);
  check("republication_recorded", republication.republicationId === scope.republicationId && Boolean(republication.authorizationReference));
  check("presentation_is_sealed_rewrite", presentationDigest(payload) === sealed.afterPresentationDigest);
  check("record_is_sealed_rewrite", digest(withoutApplyMetadata(payload)) === sealed.afterDigest);
  check("preserved_fields_unchanged", digest(preserved(payload)) === sealed.preservedDigest);
  check("confidence_binding_unchanged", digest(confidenceBinding(payload)) === sealed.confidenceBindingDigest);
  check("assessment_unchanged", facts.assessments.length === 1 && facts.assessments[0].version === sealed.assessment.recordVersion &&
    digest(facts.assessments[0].payload) === sealed.assessment.digest);
  check("snapshot_unchanged", facts.snapshots.length === 1 && facts.snapshots[0].recordId === sealed.snapshot.recordId &&
    facts.snapshots[0].version === sealed.snapshot.version && facts.snapshots[0].currentAssessmentId === sealed.assessment.id);
  for (const [name, value] of Object.entries(sealed.linked)) {
    check(`${name}_unchanged`, canonicalJson(facts.linked[name]) === canonicalJson(value));
  }
  const otherBriefingsUnchanged = otherBriefingsAtSeal
    ? canonicalJson(facts.otherBriefings) === canonicalJson(otherBriefingsAtSeal) : null;
  return Object.freeze({
    state: checks.every((item) => item.ok) ? "complete" : "discrepancies",
    checks: Object.freeze(checks),
    // Informational: other briefings are published on their own schedule.
    otherBriefingsUnchanged,
  });
}

/**
 * The goal-progress band the deployed composer gives `roles.goalProgress`
 * (NarrativeV3CompositionService goalProgressBand), read from the stored
 * assessment: goal achievement, then the objective's outlook fraction. It must
 * agree with the stored V3 meaning sentence that the same band produced.
 */
export function deriveStoredGoalProgressBand(assessment) {
  const plan = assessment?.narrativePlan ?? {};
  const objectiveId = plan.objectiveStates?.[0]?.objectiveId ?? null;
  const fail = (code, detail) => ({ band: null, code, detail });
  if (!objectiveId) return fail("GOAL_PROGRESS_UNAVAILABLE", "The plan names no objective.");
  let band = null;
  if (["achieved", "exceeded"].includes(plan.goalAchievement)) band = "reached";
  else if (plan.goalAchievement === "in_progress") {
    const trajectory = (assessment.confidenceProjection?.goalAchievementOutlook?.objectives ?? [])
      .find((item) => item.objectiveId === objectiveId)?.trajectory ?? null;
    // Maintenance objectives are never banded; only a scalar target is.
    if (trajectory?.kind !== "scalar_target") return fail("GOAL_PROGRESS_UNAVAILABLE", "The objective has no scalar-target outlook.");
    const ratio = trajectory.fractionAchieved;
    if (ratio > 0.5 && ratio < 1) band = "more_than_half";
    else if (ratio === 0.5) band = "half";
  }
  const meaning = String(plan.composition?.sections?.meaning ?? "");
  const stated = BAND_SENTENCES.reached.test(meaning) ? "reached"
    : BAND_SENTENCES.more_than_half.test(meaning) ? "more_than_half"
      : BAND_SENTENCES.half.test(meaning) ? "half" : null;
  if (stated !== band) return fail("GOAL_PROGRESS_UNCORROBORATED", "The stored outlook and the stored V3 meaning disagree on goal progress.");
  return { band };
}

/**
 * The row metadata columns a named-record write derives from a payload: the
 * same derivation as `extractMetadata` in PostgresFounderRepositoryFacade (kept
 * here so the read-only payload bundles no write path; the test pins the two
 * equal). The plan refuses unless the rewrite leaves every column as stored.
 */
export function republicationRecordMetadata(record) {
  const nullable = (value) => (value == null || value === "" ? null : String(value));
  const calendarDate = (value) => { const text = nullable(value); return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null; };
  const dateTime = (value) => { const text = nullable(value); return text && !Number.isNaN(Date.parse(text)) ? new Date(text).toISOString() : null; };
  return {
    legacyId: nullable(record.id ?? record.package_id ?? record.review_id),
    status: nullable(record.status ?? record.state),
    occurrenceDate: calendarDate(record.occurrenceDate ?? record.localDate ?? record.date ?? record.scheduledDate),
    observedAt: dateTime(record.observedAt ?? record.observed_at ?? record.createdAt),
    sourceIdentity: nullable(record.sourceIdentity ?? record.sourceId ?? record.source_id ?? record.fileId),
    provenance: record.provenance && typeof record.provenance === "object" ? record.provenance : { source: "provider-canonical-repository" },
  };
}

/** Paths (relative to the record) whose values differ, recursively. */
export function diffPaths(left, right, path = "") {
  if (Object.is(left, right)) return [];
  const bothObjects = left && right && typeof left === "object" && typeof right === "object";
  if (!bothObjects || Array.isArray(left) !== Array.isArray(right)) return [path];
  if (Array.isArray(left)) {
    if (left.length !== right.length) return [path];
    return left.flatMap((item, index) => diffPaths(item, right[index], `${path}[${index}]`));
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.flatMap((key) => {
    const child = path ? `${path}.${key}` : key;
    if (!(key in left) || !(key in right)) return [child];
    return diffPaths(left[key], right[key], child);
  });
}

/** The record without the allowlisted fields and the row-fence version. */
export function preserved(artifact) {
  const copy = structuredClone(artifact ?? {});
  delete copy.version;
  const narrative = copy.briefing?.dexaEventNarrative;
  if (narrative) {
    if (narrative.hero) {
      delete narrative.hero.title;
      delete narrative.hero.body;
      if (Array.isArray(narrative.hero.results)) {
        narrative.hero.results = narrative.hero.results.map(({ label: _label, context: _context, ...item }) => item);
      }
    }
    delete narrative.interpretation;
    if (narrative.coachInsight) for (const key of ["biggestWin", "protect", "watch", "next"]) delete narrative.coachInsight[key];
    delete narrative.plainLanguage;
  }
  return copy;
}

function previousPresentation(narrative) {
  return structuredClone({
    hero: {
      title: narrative.hero?.title ?? null,
      body: narrative.hero?.body ?? null,
      results: (narrative.hero?.results ?? []).map((item) => ({ label: item.label ?? null, context: item.context ?? null })),
    },
    interpretation: narrative.interpretation ?? null,
    coachInsight: Object.fromEntries(["biggestWin", "protect", "watch", "next"].map((key) => [key, narrative.coachInsight?.[key] ?? null])),
  });
}

function presentationDigest(artifact) {
  const narrative = withoutApplyMetadata(artifact).briefing?.dexaEventNarrative ?? {};
  return digest({
    title: narrative.hero?.title ?? null,
    body: narrative.hero?.body ?? null,
    tiles: (narrative.hero?.results ?? []).map((item) => [item.label ?? null, item.context ?? null]),
    interpretation: narrative.interpretation ?? null,
    coachInsight: narrative.coachInsight ?? null,
    plainLanguage: narrative.plainLanguage ?? null,
  });
}

function confidenceBinding(artifact) {
  return {
    confidencePublication: artifact?.confidencePublication ?? null,
    goalConfidence: artifact?.briefing?.dexaEventNarrative?.goalConfidence ?? null,
  };
}

function withoutApplyMetadata(artifact) {
  const copy = structuredClone(artifact ?? {});
  delete copy.version;
  const republication = copy.briefing?.dexaEventNarrative?.plainLanguage?.republication;
  if (republication) for (const key of APPLY_ONLY_FIELDS) delete republication[key];
  return copy;
}

function stopWrite() { return republicationError("REPUBLICATION_STOP"); }
function digest(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}
function iso(value) { return value == null ? null : new Date(value).toISOString(); }
function republicationError(code) { return Object.assign(new Error(code), { code }); }
