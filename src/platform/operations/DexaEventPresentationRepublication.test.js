import { createHash } from "node:crypto";
import { canonicalJson } from "../../contracts/v1/canonicalJson.js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareDexaOct9V3 } from "../../testSupport/briefingFamilyV3Harness.js";
import { createFakeFounderCanonicalDatabase } from "../../testSupport/fakeFounderCanonicalDatabase.js";
import { executePostgresFounderRecordMutation } from "../database/PostgresFounderRepositoryFacade.js";
import { RuntimeAuthority } from "../cutover/CombinedRuntimeAuthorityState.js";
import {
  applyDexaEventPresentationRepublication,
  DEXA_REPUBLICATION_ALLOWED_PATHS,
  deriveStoredGoalProgressBand,
  diffPaths,
  loadDexaEventPresentationRepublicationFacts,
  OCTOBER9_DEXA_PRESENTATION_REPUBLICATION_SCOPE,
  planDexaEventPresentationRepublication,
  preserved,
  previewDexaEventPresentationRepublication,
  republicationRecordMetadata,
  verifyDexaEventPresentationRepublicationPostflight,
} from "./DexaEventPresentationRepublication.js";

// The published scan's notable body-part change (torso +2.2 lb fat, +0.6 lb lean).
const oct9Regional = (scan) => {
  scan.regionalAssessment.trunk.fatMass.value += 2.2;
  scan.regionalAssessment.trunk.leanMass.value += 0.6;
};
const AUTHORITY_ENVIRONMENT = "test-provider";
const WRITABLE_AUTHORITY = Object.freeze({
  authority: RuntimeAuthority.PROVIDER, publicRuntimeAuthority: "provider", canonicalStoreEpoch: "postgres-canonical",
  compositionMode: "postgres", writesEnabled: true, firstProviderCanonicalWriteAt: "2026-08-27T00:00:00.000Z",
  migrationOperationId: "migration-op-1",
});

let published;
let deployed;
beforeAll(async () => {
  // As published on 539f7006: the same plan projected without event roles.
  published = await prepareDexaOct9V3({ withRoles: false, mutateScan: oct9Regional });
  // What the deployed 5e91aa5d path publishes for a new Event from the same inputs.
  deployed = await prepareDexaOct9V3({ mutateScan: oct9Regional });
});

function storedFixture({ artifact = published.artifact, prepared = published.prepared } = {}) {
  const narrative = artifact.briefing.dexaEventNarrative;
  const owner = artifact.userId;
  // Stored on 539f7006: the assessment's plan has no event presentation roles.
  const assessment = structuredClone(prepared.assessment);
  delete assessment.narrativePlan.composition.eventPresentation;
  const event = {
    ...structuredClone(artifact),
    source: { type: "dexa_event" },
    createdAt: artifact.generatedAt,
    updatedAt: artifact.generatedAt,
    lifecycle: { state: "published" },
    evidenceWindow: null,
    fieldProvenance: { briefing: "dexa_event_composer" },
    confidencePublication: {
      assessmentId: narrative.goalConfidence.assessmentId, publisherType: "dexa_event_briefing",
      schemaVersion: "pi_goal_confidence_publication_v1", intelligenceRunId: "run_oct9",
      publicationCutoff: "2026-10-10T06:59:59.999Z", originatingBriefingId: artifact.id,
    },
  };
  const canonicalId = `dexa_scan|${owner}|2026-10-09`;
  return {
    owner,
    event,
    assessment,
    canonicalId,
    scope: {
      ...OCTOBER9_DEXA_PRESENTATION_REPUBLICATION_SCOPE,
      // The harness reproduces the wording, not the production Confidence numbers.
      expectedConfidence: {
        score: narrative.goalConfidence.score, priorScore: narrative.goalConfidence.priorScore,
        movement: assessment.movement, movementDirection: narrative.goalConfidence.movementDirection,
      },
      expectedPresentationVersion: narrative.presentationVersion,
    },
    collections: {
      user: { id: owner },
      goalConfidenceHistory: [
        { id: "assessment_sep12", assessmentId: "assessment_sep12", assessment: { id: "assessment_sep12", currentPercentage: 80 } },
        { id: assessment.id, assessmentId: assessment.id, goalId: assessment.goalId, assessment, publisherType: "dexa_event_briefing" },
      ],
      goalConfidenceSnapshots: [{ id: "goal_confidence_snapshot_1", goalId: assessment.goalId, currentAssessmentId: assessment.id }],
      canonicalEvidenceObjects: [{ id: "ceo_dexa_oct9", canonicalId, evidence_type: "dexa_scan", lastObservedAt: "2026-10-09" }],
      dexaScans: [{ id: artifact.trigger.evidenceId, measuredAt: "2026-10-09", provider: "BodySpec" }],
      analyses: [{ id: "analysis_dexa_oct9", evidenceIds: [canonicalId] }, { id: "analysis_other", evidenceIds: ["x"] }],
      dexaHealthKitWritebackReceipts: [
        { id: "hk_bodyfat", canonicalId, measurementKind: "body_fat_percentage", canonicalRevision: 1, outcome: "saved" },
        { id: "hk_lean", canonicalId, measurementKind: "lean_body_mass", canonicalRevision: 1, outcome: "saved" },
      ],
      dailyBriefings: [
        { id: "dexa_event_sep12", userId: owner, briefing: { dexaEventNarrative: { scanDate: "2026-09-12" } } },
        { id: "weekly_2026_10_04", userId: owner, cadence: "weekly", briefing: { hero: { title: "Weekly" } } },
        { id: "daily_2026_10_09", userId: owner, cadence: "daily", briefing: { hero: { title: "Daily" } } },
      ],
    },
  };
}

// The fake canonical database for the system write path, plus an owner-scoped
// responder for the republication's SELECTs, over the same committed rows.
async function database(fixture = storedFixture(), { authority = WRITABLE_AUTHORITY } = {}) {
  const db = createFakeFounderCanonicalDatabase({ ownerUserId: fixture.owner, collections: fixture.collections });
  // The Event row is written the way the system writes it, so its row metadata is real.
  await executePostgresFounderRecordMutation({
    pool: db.pool, ownerUserId: fixture.owner, authorityStore: { claimCanonicalWriteBoundary: async () => {} },
    records: [{ collection: "dailyBriefings", recordId: fixture.event.id }],
    mutate: async () => ({ writes: [{ collection: "dailyBriefings", recordId: fixture.event.id, payload: { ...fixture.event, version: 1 } }] }),
  });
  db.resetStats();
  const statements = [];
  const all = (collection) => db.list(collection).map((payload) => ({ payload, row: db.row(collection, payload.id) }));
  const md5 = (text) => createHash("md5").update(text).digest("hex");
  const fingerprint = (rows) => [{
    n: rows.length,
    digest: rows.length ? md5(rows.map(({ row }) => `${row.collection}|${row.recordId}|${row.version}|${md5(JSON.stringify(row.payload))}`).sort().join("\n")) : "",
  }];
  const FINGERPRINTS = [
    [/goalConfidenceHistory' AND \(payload->>'id'=\$2/, (values) => all("goalConfidenceHistory").filter(({ payload }) => payload.id === values[1] || payload.assessmentId === values[1])],
    [/collection_name='goalConfidenceHistory'\s*$/, () => all("goalConfidenceHistory")],
    [/collection_name='goalConfidenceSnapshots'\s*$/, () => all("goalConfidenceSnapshots")],
    [/canonicalEvidenceObjects/, (values) => all("canonicalEvidenceObjects").filter(({ payload, row }) => payload.canonicalId === values[1] || row.recordId === values[2])],
    [/collection_name='dexaScans'/, (values) => all("dexaScans").filter(({ payload, row }) => row.recordId === values[1] || String(payload.measuredAt ?? "").slice(0, 10) === values[2])],
    [/collection_name='analyses'/, (values) => all("analyses").filter(({ payload }) => (payload.evidenceIds ?? []).includes(values[1]) || JSON.stringify(payload).includes(values[2]))],
    [/dexaHealthKitWritebackReceipts/, (values) => all("dexaHealthKitWritebackReceipts").filter(({ payload }) => payload.canonicalId === values[1])],
    [/record_id LIKE 'dexa\\_event\\_%'/, (values) => all("dailyBriefings").filter(({ row }) => row.recordId.startsWith("dexa_event_") && row.recordId !== values[1])],
    [/collection_name='dailyBriefings' AND record_id<>\$2\s*$/, (values) => all("dailyBriefings").filter(({ row }) => row.recordId !== values[1])],
  ];
  const respond = (sql, values) => {
    if (/FROM physiqueos\.combined_runtime_authority/.test(sql)) return [authority ? { state: authority } : null].filter(Boolean);
    if (/payload#>>'\{briefing,dexaEventNarrative,scanDate\}'=\$2/.test(sql)) {
      return all("dailyBriefings").filter(({ payload }) => payload.briefing?.dexaEventNarrative?.scanDate === values[1])
        .map(({ row }) => ({
          record_id: row.recordId, version: row.version, legacy_id: row.legacyId, status: row.status,
          occurrence_date: row.occurrenceDate, observed_at: row.observedAt, source_identity: row.sourceIdentity,
          provenance: row.provenance, payload: row.payload,
        }));
    }
    if (/SELECT record_id, version, payload FROM physiqueos\.canonical_confidence_records/.test(sql)) {
      return all("goalConfidenceHistory").filter(({ payload }) => payload.id === values[1] || payload.assessmentId === values[1])
        .map(({ row }) => ({ record_id: row.recordId, version: row.version, payload: row.payload }));
    }
    if (/current_assessment_id/.test(sql)) {
      return all("goalConfidenceSnapshots").filter(({ row }) => JSON.stringify(row.payload).includes(values[1]))
        .map(({ row }) => ({ record_id: row.recordId, version: row.version, current_assessment_id: row.payload.currentAssessmentId ?? null }));
    }
    if (/count\(\*\)::int AS n,/.test(sql)) {
      const where = sql.split("WHERE owner_user_id=$1 AND ")[1];
      const match = FINGERPRINTS.find(([pattern]) => pattern.test(where));
      if (!match) throw new Error(`unrecognised fingerprint: ${where}`);
      return fingerprint(match[1](values));
    }
    return null;
  };
  const query = async (text, values = []) => {
    const sql = String(text);
    statements.push({ sql, values });
    const rows = /^\s*SELECT\b/i.test(sql) ? respond(sql, values) : null;
    if (rows) return { rows, rowCount: rows.length };
    return db.query(sql, values);
  };
  const client = { query, release() {} };
  const pool = { query, async connect() { return client; } };
  return { db, pool, query, statements, owner: fixture.owner, fixture };
}

function executeRecordMutation(harness) {
  return (input) => executePostgresFounderRecordMutation({
    pool: harness.pool, authorityStore: { claimCanonicalWriteBoundary: async () => ({ outcome: "already-recorded" }) },
    commandId: "republication-command-1", ...input,
  });
}

async function preview(harness, scope = harness.fixture.scope) {
  return previewDexaEventPresentationRepublication({
    query: harness.query, ownerUserId: harness.owner, scope, authorityEnvironment: AUTHORITY_ENVIRONMENT,
  });
}

async function apply(harness, seal, overrides = {}) {
  return applyDexaEventPresentationRepublication({
    executeRecordMutation: executeRecordMutation(harness), ownerUserId: harness.owner, seal,
    authorizationReference: "founder-approval-test", scope: harness.fixture.scope,
    authorityEnvironment: AUTHORITY_ENVIRONMENT, now: () => new Date("2026-10-10T12:00:00.000Z"), ...overrides,
  });
}

const sealOf = (plan) => ({ sealDigest: plan.sealDigest, sealed: plan.sealed });
const narrativeOf = (record) => record.briefing.dexaEventNarrative;
const everyRow = (db) => ["dailyBriefings", "goalConfidenceHistory", "goalConfidenceSnapshots", "canonicalEvidenceObjects",
  "dexaScans", "analyses", "dexaHealthKitWritebackReceipts"].flatMap((collection) => db.list(collection).map((payload) => [collection, payload]));

describe("October 9 DEXA presentation republication: preview", () => {
  it("re-words the stored briefing with exactly the approved plain language", async () => {
    const harness = await database();
    const plan = await preview(harness);
    expect(plan.outcome).toBe("republish");
    const narrative = narrativeOf(plan.after);
    expect(narrative.hero.title).toBe("You're making progress toward your muscle-building goal, but body fat needs attention.");
    expect(narrative.hero.body).toBe(
      "Since your September 12 scan, your lean mass (muscle plus water and other non-fat tissue) went up 1.3 lb. " +
      "Your body fat rose to 9.7%, which is above your 8–9% target range.");
    expect(narrative.hero.results.map((item) => [item.label, item.context])).toEqual([
      ["Lean Mass", "Your main goal measure"],
      ["Body Fat", "Above your 8–9% target"],
      ["Scan Weight", "Includes water and food, not just muscle and fat"],
      ["Fat Mass", "Since the last scan"],
    ]);
    expect(narrative.interpretation.opening).toBe(
      "You also gained 3.2 lb of fat, more than the lean mass you added. " +
      "Some fat gain is normal while building muscle, but right now fat is coming on faster than lean mass.");
    expect(narrative.interpretation.regional).toBe(
      "The biggest changes were in your torso: about 2.2 lb more fat and 0.6 lb more lean mass. " +
      "Body-part numbers are less precise than the whole-body totals.");
    expect(narrative.interpretation.phaseMeaning).toBe(
      "One scan isn't enough to decide whether you're ready for the next part of your plan. " +
      "We'll weigh it alongside your training, weight trend and next scan first.");
    expect(narrative.interpretation.uncertainty).toBe(
      "A scan gives a useful picture of how your body is changing, but it can't tell us exactly how much of the increase " +
      "in lean mass is new muscle. Water, food and recent training can all shift the reading, so it helps to have your " +
      "next scan under similar conditions.");
    expect(narrative.interpretation).toMatchObject({ fatLoss: "", leanMass: "", goalProgress: null, guardrailStatus: null });
    expect(narrative.coachInsight).toEqual({
      biggestWin: "You're more than halfway to your muscle-building target. That's meaningful progress, and it's worth protecting.",
      protect: "Keep training the way you have been. There's no reason to overhaul your whole plan when part of it is moving in the right direction.",
      watch: "",
      next: "Take a closer look at your calorie intake before trying to gain more weight. " +
        "The priority now is keeping your muscle-building progress while bringing body fat back toward your target.",
    });
  });

  it("matches what the deployed plain-language path publishes, field for field", async () => {
    const plan = await preview(await database());
    const after = narrativeOf(plan.after);
    const live = deployed.artifact.briefing.dexaEventNarrative;
    expect(after.hero.title).toBe(live.hero.title);
    expect(after.hero.body).toBe(live.hero.body);
    expect(after.hero.results).toEqual(live.hero.results);
    expect(after.interpretation).toEqual(live.interpretation);
    expect(after.coachInsight).toEqual(live.coachInsight);
    expect(after.plainLanguage).toMatchObject(live.plainLanguage);
  });

  it("changes only allowlisted presentation paths and keeps every other byte", async () => {
    const harness = await database();
    const before = harness.db.get("dailyBriefings", harness.fixture.event.id);
    const plan = await preview(harness);
    const paths = diffPaths(before, plan.after);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) expect(DEXA_REPUBLICATION_ALLOWED_PATHS.some((pattern) => pattern.test(path)), path).toBe(true);
    expect(plan.sealed.changedPaths).toEqual(paths);
    expect(JSON.stringify(preserved(plan.after))).toBe(JSON.stringify(preserved(before)));
    const [b, a] = [narrativeOf(before), narrativeOf(plan.after)];
    expect(JSON.stringify(a.goalConfidence)).toBe(JSON.stringify(b.goalConfidence));
    expect(JSON.stringify(plan.after.confidencePublication)).toBe(JSON.stringify(before.confidencePublication));
    expect(JSON.stringify(plan.after.briefing.narrativeV3)).toBe(JSON.stringify(before.briefing.narrativeV3));
    for (const field of ["progress", "snapshot", "references", "evidenceBinding", "regionalChanges", "supportingEvidence", "context", "strategicMeaningV3"]) {
      expect(JSON.stringify(a[field]), field).toBe(JSON.stringify(b[field]));
    }
    expect(a.hero.results.map(({ emoji, value }) => [emoji, value])).toEqual(b.hero.results.map(({ emoji, value }) => [emoji, value]));
    expect(a.presentationRolesV3).toBeUndefined();
    // The replaced text travels with the row: restoring it reproduces the stored record.
    const restored = structuredClone(plan.after);
    const previous = narrativeOf(restored).plainLanguage.republication.previousPresentation;
    const target = narrativeOf(restored);
    target.hero.title = previous.hero.title;
    target.hero.body = previous.hero.body;
    target.hero.results = target.hero.results.map((item, index) => ({ ...item, ...previous.hero.results[index] }));
    target.interpretation = previous.interpretation;
    target.coachInsight = { ...target.coachInsight, ...previous.coachInsight };
    delete target.plainLanguage;
    expect(JSON.stringify(restored)).toBe(JSON.stringify(before));
    expect(a.plainLanguage.republication).toMatchObject({
      republicationId: "dexa-2026-10-09-presentation-republication-v1", sourceRecordVersion: 1,
      assessmentId: b.goalConfidence.assessmentId, goalProgressBand: "more_than_half",
    });
  });

  it("is read-only, owner-scoped and SELECT-only", async () => {
    const harness = await database();
    const rows = everyRow(harness.db);
    await preview(harness);
    expect(harness.statements.length).toBeGreaterThan(0);
    for (const { sql, values } of harness.statements) {
      expect(sql).toMatch(/^\s*SELECT\b/);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|FOR UPDATE)\b/);
      if (!/combined_runtime_authority/.test(sql)) {
        expect(sql).toMatch(/owner_user_id=\$1/);
        expect(values[0]).toBe(harness.owner);
      }
    }
    expect(harness.db.stats.recordWrites).toEqual([]);
    expect(harness.db.stats.metadataBumps).toBe(0);
    expect(everyRow(harness.db)).toEqual(rows);
  });

  it("seals the owner, record, assessment binding, snapshot pointer and presentation digests", async () => {
    const harness = await database();
    const plan = await preview(harness);
    expect(plan.sealed).toMatchObject({
      recordId: harness.fixture.event.id, recordVersion: 1, collection: "dailyBriefings",
      assessment: { id: harness.fixture.assessment.id, recordVersion: 1 },
      snapshot: { recordId: "goal_confidence_snapshot_1", version: 1 },
      goalProgressBand: "more_than_half",
    });
    expect(plan.sealed.ownerDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.sealed.beforePresentationDigest).not.toBe(plan.sealed.afterPresentationDigest);
    expect(Object.keys(plan.sealed.linked).sort()).toEqual(["analyses", "assessment", "canonicalScan", "confidenceHistory",
      "confidenceSnapshots", "healthKitReceipts", "legacyScan", "otherDexaEvents"]);
    expect(plan.sealed.linked.healthKitReceipts.count).toBe(2);
    expect(plan.sealed.linked.otherDexaEvents.count).toBe(1);
    // Deterministic: a second preview over the same state seals the same digest.
    expect((await preview(harness)).sealDigest).toBe(plan.sealDigest);
  });
});

describe("October 9 DEXA presentation republication: apply", () => {
  it("writes the one sealed record through the named-record mutation and nothing else", async () => {
    const harness = await database();
    const plan = await preview(harness);
    const othersBefore = everyRow(harness.db).filter(([collection, payload]) => !(collection === "dailyBriefings" && payload.id === harness.fixture.event.id));
    const revision = harness.db.revision;
    harness.statements.length = 0;

    const result = await apply(harness, sealOf(plan));

    expect(result).toMatchObject({ mode: "apply", outcome: "applied", rowsChanged: 1, recordVersion: 2, sealDigest: plan.sealDigest });
    expect(harness.db.stats.recordWrites).toEqual([`dailyBriefings:${harness.fixture.event.id}`]);
    expect(harness.db.stats.collectionRewrites).toEqual([]);
    expect(harness.db.stats.collectionLoads).toEqual([]);
    expect(harness.db.stats.metadataBumps).toBe(1);
    expect(harness.db.revision).toBe(revision + 1);
    const othersAfter = everyRow(harness.db).filter(([collection, payload]) => !(collection === "dailyBriefings" && payload.id === harness.fixture.event.id));
    expect(JSON.stringify(othersAfter)).toBe(JSON.stringify(othersBefore));

    // SQL audit: the owner lock, then SELECTs, then exactly one fenced record
    // UPDATE and the runtime revision bump.
    const writes = harness.statements.filter(({ sql }) => !/^\s*(SELECT|BEGIN|COMMIT|ROLLBACK)\b/i.test(sql));
    expect(writes.map(({ sql }) => sql.trim().split(/\s+/).slice(0, 2).join(" "))).toEqual([
      "UPDATE physiqueos.canonical_briefing_records", "UPDATE physiqueos.canonical_runtime_metadata",
    ]);
    const update = writes[0];
    expect(update.sql).toMatch(/WHERE owner_user_id=\$1 AND collection_name=\$2 AND record_id=\$3 AND version=\$12/);
    expect(update.values.slice(0, 3)).toEqual([harness.owner, "dailyBriefings", harness.fixture.event.id]);
    expect(update.values[11]).toBe(1);
    expect(harness.statements[1].sql).toMatch(/pg_advisory_xact_lock/);
    expect(harness.statements[1].values).toEqual([`physiqueos:${harness.owner}`]);
    expect(harness.statements.filter(({ sql }) => /FOR UPDATE/.test(sql)).length).toBeGreaterThanOrEqual(3);

    const row = harness.db.row("dailyBriefings", harness.fixture.event.id);
    expect(row.version).toBe(2);
    expect(row.payload.version).toBe(2);
    expect(row.payload.briefing.dexaEventNarrative.plainLanguage.republication).toMatchObject({
      authorizationReference: "founder-approval-test", appliedAt: "2026-10-10T12:00:00.000Z", commandId: "republication-command-1",
    });
    expect(diffPaths(plan.after, { ...row.payload, version: 1 })).toEqual(["briefing.dexaEventNarrative.plainLanguage.republication.appliedAt",
      "briefing.dexaEventNarrative.plainLanguage.republication.authorizationReference",
      "briefing.dexaEventNarrative.plainLanguage.republication.commandId"]);
  });

  it("keeps the row metadata columns the system wrote", async () => {
    const harness = await database();
    const before = harness.db.row("dailyBriefings", harness.fixture.event.id);
    await apply(harness, sealOf(await preview(harness)));
    const after = harness.db.row("dailyBriefings", harness.fixture.event.id);
    for (const column of ["legacyId", "status", "occurrenceDate", "observedAt", "sourceIdentity", "provenance", "ordinal"]) {
      expect(after[column], column).toEqual(before[column]);
    }
  });

  it("passes postflight against the seal and is idempotent", async () => {
    const harness = await database();
    const plan = await preview(harness);
    await apply(harness, sealOf(plan));
    const facts = await loadDexaEventPresentationRepublicationFacts({
      query: harness.query, ownerUserId: harness.owner, scope: harness.fixture.scope, authorityEnvironment: AUTHORITY_ENVIRONMENT,
    });
    const postflight = verifyDexaEventPresentationRepublicationPostflight({
      facts, seal: sealOf(plan), ownerUserId: harness.owner, scope: harness.fixture.scope, otherBriefingsAtSeal: plan.otherBriefings,
    });
    expect(postflight.checks.filter((item) => !item.ok)).toEqual([]);
    expect(postflight).toMatchObject({ state: "complete", otherBriefingsUnchanged: true });

    harness.db.resetStats();
    const again = await apply(harness, sealOf(plan));
    expect(again).toMatchObject({ outcome: "already_applied", recordVersion: 2 });
    expect(harness.db.stats.recordWrites).toEqual([]);
    expect(harness.db.stats.metadataBumps).toBe(0);
    expect((await preview(harness)).outcome).toBe("already_applied");
  });

  it("refuses with SEAL_DRIFT when any sealed fact moves after preview, and writes nothing", async () => {
    const drifts = {
      assessment: (db) => db.insert("goalConfidenceHistory", { ...db.list("goalConfidenceHistory")[1], version: 2, persistedAt: "later" }),
      snapshot: (db) => db.insert("goalConfidenceSnapshots", { ...db.list("goalConfidenceSnapshots")[0], version: 2, updatedAt: "later" }),
      newAssessment: (db) => db.insert("goalConfidenceHistory", { id: "assessment_successor", assessmentId: "assessment_successor", assessment: { id: "assessment_successor" } }),
      healthKit: (db, fixture) => db.insert("dexaHealthKitWritebackReceipts", { id: "hk_third", canonicalId: fixture.canonicalId }),
      scan: (db, fixture) => db.insert("canonicalEvidenceObjects", { id: "ceo_dexa_oct9", canonicalId: fixture.canonicalId, version: 2 }),
      analysis: (db, fixture) => db.insert("analyses", { id: "analysis_dexa_oct9_b", evidenceIds: [fixture.canonicalId] }),
      otherDexaEvent: (db) => db.insert("dailyBriefings", { id: "dexa_event_sep12", briefing: { dexaEventNarrative: { scanDate: "2026-09-12", edited: true } }, version: 2 }),
    };
    for (const [name, drift] of Object.entries(drifts)) {
      const harness = await database();
      const plan = await preview(harness);
      drift(harness.db, harness.fixture);
      harness.db.resetStats();
      const result = await apply(harness, sealOf(plan));
      expect(result, name).toMatchObject({ outcome: "refused", code: "SEAL_DRIFT" });
      expect(harness.db.stats.recordWrites, name).toEqual([]);
      expect(harness.db.stats.metadataBumps, name).toBe(0);
      expect(harness.db.row("dailyBriefings", harness.fixture.event.id).version, name).toBe(1);
    }
  });

  it("refuses when the record itself was rewritten after preview", async () => {
    const harness = await database();
    const plan = await preview(harness);
    const current = harness.db.get("dailyBriefings", harness.fixture.event.id);
    await executePostgresFounderRecordMutation({
      pool: harness.db.pool, ownerUserId: harness.owner, authorityStore: { claimCanonicalWriteBoundary: async () => {} },
      records: [{ collection: "dailyBriefings", recordId: current.id }],
      mutate: async () => ({ writes: [{ collection: "dailyBriefings", recordId: current.id, payload: { ...current, updatedAt: "later" } }] }),
    });
    harness.db.resetStats();
    expect(await apply(harness, sealOf(plan))).toMatchObject({ outcome: "refused", code: "EVENT_VERSION_UNEXPECTED" });
    expect(harness.db.stats.recordWrites).toEqual([]);
  });

  it("requires the Founder authorization reference and an intact seal", async () => {
    const harness = await database();
    const plan = await preview(harness);
    await expect(apply(harness, sealOf(plan), { authorizationReference: " " })).rejects.toMatchObject({ code: "AUTHORIZATION_REFERENCE_REQUIRED" });
    await expect(apply(harness, null)).rejects.toMatchObject({ code: "SEAL_REQUIRED" });
    const tampered = { sealDigest: plan.sealDigest, sealed: { ...plan.sealed, recordVersion: 7 } };
    await expect(apply(harness, tampered)).rejects.toMatchObject({ code: "SEAL_REQUIRED" });
    const otherScope = { ...plan.sealed, republicationId: "other" };
    await expect(apply(harness, { sealDigest: digestOf(otherScope), sealed: otherScope }))
      .rejects.toMatchObject({ code: "SEAL_SCOPE_MISMATCH" });
    expect(harness.db.stats.recordWrites).toEqual([]);
  });
});

describe("October 9 DEXA presentation republication: refusals", () => {
  async function refusal(mutate, { scope, authority } = {}) {
    const fixture = storedFixture();
    mutate?.(fixture);
    const harness = await database(fixture, authority === undefined ? {} : { authority });
    const plan = await preview(harness, scope ?? fixture.scope);
    expect(harness.db.stats.recordWrites).toEqual([]);
    return plan;
  }

  it("refuses unless Confidence is exactly the published result (production: 70 from 80, decrease)", async () => {
    const production = await refusal(null, { scope: OCTOBER9_DEXA_PRESENTATION_REPUBLICATION_SCOPE });
    // The harness assessment is not the production 70%, so the production scope refuses it.
    expect(production).toMatchObject({ outcome: "refused" });
    expect(["CONFIDENCE_UNEXPECTED", "PRESENTATION_VERSION_UNEXPECTED"]).toContain(production.code);
    const scoreMoved = await refusal((fixture) => { fixture.event.briefing.dexaEventNarrative.goalConfidence.score += 1; });
    expect(scoreMoved).toMatchObject({ outcome: "refused", code: "CONFIDENCE_UNEXPECTED" });
  });

  it.each([
    ["EVENT_NOT_SINGLETON", (fixture) => fixture.collections.dailyBriefings.push({ ...structuredClone(fixture.event), id: "dexa_event_duplicate" })],
    ["OWNER_MISMATCH", (fixture) => { fixture.event.userId = "someone_else"; }],
    ["EVENT_IDENTITY_UNEXPECTED", (fixture) => { fixture.event.trigger.evidenceType = "photo"; }],
    ["CONFIDENCE_BINDING_MISMATCH", (fixture) => { fixture.event.confidencePublication.assessmentId = "assessment_sep12"; }],
    ["ASSESSMENT_NOT_SINGLETON", (fixture) => { fixture.collections.goalConfidenceHistory.pop(); }],
    ["ASSESSMENT_ARTIFACT_MISMATCH", (fixture) => {
      fixture.assessment.briefingArtifactId = "other"; fixture.assessment.originatingBriefingId = "other";
    }],
    ["SNAPSHOT_POINTER_UNEXPECTED", (fixture) => { fixture.collections.goalConfidenceSnapshots[0].currentAssessmentId = "assessment_successor:" + fixture.assessment.id; }],
    ["GOAL_PROGRESS_UNCORROBORATED", (fixture) => { fixture.assessment.narrativePlan.composition.sections.meaning = "Lean mass is progressing."; }],
    ["GOAL_PROGRESS_UNAVAILABLE", (fixture) => {
      for (const objective of fixture.assessment.confidenceProjection.goalAchievementOutlook.objectives) objective.trajectory.kind = "range";
    }],
    ["EVENT_ALREADY_PLAIN_LANGUAGE", (fixture) => { fixture.event.briefing.dexaEventNarrative.plainLanguage = { schemaVersion: "dexa_event_plain_language_v1" }; }],
  ])("refuses %s", async (code, mutate) => {
    expect(await refusal(mutate)).toMatchObject({ outcome: "refused", code });
  });

  it("refuses unless runtime authority allows the write without writing the authority row", async () => {
    expect(await refusal(null, { authority: { ...WRITABLE_AUTHORITY, writesEnabled: false } }))
      .toMatchObject({ outcome: "refused", code: "CANONICAL_WRITES_NOT_AUTHORIZED" });
    expect(await refusal(null, { authority: { ...WRITABLE_AUTHORITY, firstProviderCanonicalWriteAt: null } }))
      .toMatchObject({ outcome: "refused", code: "AUTHORITY_BOUNDARY_NOT_RECORDED" });
    expect(await refusal(null, { authority: null })).toMatchObject({ outcome: "refused", code: "CANONICAL_WRITES_NOT_AUTHORIZED" });
    expect(await refusal(null, { authority: { ...WRITABLE_AUTHORITY, authority: "provider" } }))
      .toMatchObject({ outcome: "refused", code: "CANONICAL_WRITES_NOT_AUTHORIZED" });
  });

  it("refuses a record already published with the plain-language presentation", async () => {
    const fixture = storedFixture({ artifact: deployed.artifact, prepared: deployed.prepared });
    const harness = await database(fixture);
    expect(await preview(harness)).toMatchObject({ outcome: "refused", code: "EVENT_ALREADY_PLAIN_LANGUAGE" });
  });

  it("refuses when the write would rewrite the row's metadata columns", () => {
    const fixture = storedFixture();
    const event = { recordId: fixture.event.id, version: 1, columns: { legacyId: null }, payload: { ...fixture.event, version: 1 } };
    const facts = {
      events: [event], event,
      assessments: [{ recordId: fixture.assessment.id, version: 1, payload: fixture.collections.goalConfidenceHistory[1] }],
      snapshots: [{ recordId: "s", version: 1, currentAssessmentId: fixture.assessment.id }],
      linked: {}, authority: null,
    };
    expect(planDexaEventPresentationRepublication({ facts, ownerUserId: fixture.owner, scope: fixture.scope }))
      .toMatchObject({ outcome: "refused", code: "ROW_METADATA_WOULD_CHANGE" });
  });

  it("allowlists only presentation paths", () => {
    const allowed = (path) => DEXA_REPUBLICATION_ALLOWED_PATHS.some((pattern) => pattern.test(path));
    for (const path of ["briefing.dexaEventNarrative.hero.title", "briefing.dexaEventNarrative.hero.results[2].context",
      "briefing.dexaEventNarrative.interpretation.uncertainty", "briefing.dexaEventNarrative.coachInsight.watch",
      "briefing.dexaEventNarrative.plainLanguage"]) expect(allowed(path), path).toBe(true);
    for (const path of ["version", "updatedAt", "confidencePublication", "confidencePublication.assessmentId",
      "briefing.dexaEventNarrative.goalConfidence.score", "briefing.dexaEventNarrative.hero.results[0].value",
      "briefing.dexaEventNarrative.hero.results", "briefing.dexaEventNarrative.hero.results[1].emoji",
      "briefing.dexaEventNarrative.hero", "briefing.dexaEventNarrative.progress", "briefing.narrativeV3.summary",
      "briefing.dexaEventNarrative.coachInsight.extra", "briefing.dexaEventNarrative.presentationRolesV3",
      "briefing.dexaEventNarrative.interpretation", "briefing.presentationVersion", "trigger.evidenceId"]) expect(allowed(path), path).toBe(false);
  });
});

describe("row metadata derivation", () => {
  it("is exactly what the system's named-record write stores", async () => {
    const owner = "user_metadata";
    const db = createFakeFounderCanonicalDatabase({ ownerUserId: owner, collections: { user: { id: owner } } });
    const payloads = [
      { id: "daily_a", createdAt: "2026-10-09T18:05:00.000Z" },
      { id: "daily_b", status: "published", localDate: "2026-10-09", observedAt: "2026-10-09T10:00:00-07:00", sourceId: "src", provenance: { source: "pdf" } },
      { id: "daily_c", state: "draft", date: "not-a-date", createdAt: "garbage", fileId: "", provenance: "text" },
    ];
    for (const payload of payloads) {
      await executePostgresFounderRecordMutation({
        pool: db.pool, ownerUserId: owner, authorityStore: { claimCanonicalWriteBoundary: async () => {} },
        records: [{ collection: "dailyBriefings", recordId: payload.id }],
        mutate: async () => ({ writes: [{ collection: "dailyBriefings", recordId: payload.id, payload }] }),
      });
      const row = db.row("dailyBriefings", payload.id);
      const { legacyId, status, occurrenceDate, observedAt, sourceIdentity, provenance } = row;
      expect(republicationRecordMetadata({ ...payload, version: 1 }), payload.id)
        .toEqual({ legacyId, status, occurrenceDate, observedAt, sourceIdentity, provenance });
    }
  });
});

describe("stored goal-progress band", () => {
  it("reads the band from the stored outlook and requires the stored V3 sentence to agree", () => {
    const { assessment } = storedFixture();
    expect(deriveStoredGoalProgressBand(assessment)).toEqual({ band: "more_than_half" });
    const half = structuredClone(assessment);
    half.confidenceProjection.goalAchievementOutlook.objectives[0].trajectory.fractionAchieved = 0.5;
    expect(deriveStoredGoalProgressBand(half)).toMatchObject({ code: "GOAL_PROGRESS_UNCORROBORATED" });
    half.narrativePlan.composition.sections.meaning = "You are halfway to the goal.";
    expect(deriveStoredGoalProgressBand(half)).toEqual({ band: "half" });
  });
});

function digestOf(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
