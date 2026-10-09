import { describe, expect, it, vi } from "vitest";
import {
  createDexaConfirmationBoundedSteps,
  DEXA_CANONICAL_READ_COLLECTIONS,
  DEXA_EVENT_READ_COLLECTIONS,
  DEXA_GOAL_EVALUATION_READ_COLLECTIONS,
  isDexaOnlyConfirmationPackage,
} from "./DexaConfirmationBoundedSteps.js";
import { loadCanonicalRuntime } from "../../platform/migration/phase4CanonicalImport.js";
import { executePostgresFounderRecordMutation } from "../../platform/database/PostgresFounderRepositoryFacade.js";
import { createFakeFounderCanonicalDatabase } from "../../testSupport/fakeFounderCanonicalDatabase.js";

// Synthetic fixtures only; no Founder record is reproduced.
const OWNER = "user_dexa_bounded_steps";
const SCAN_DATE = "2026-10-09";
const CANONICAL_ID = `dexa_scan|${OWNER}|${SCAN_DATE}`;
const authorityStore = Object.freeze({ claimCanonicalWriteBoundary: async () => {} });
// Reconciling synthetic figures (34.2 + 148.6 + 7.2 = 190; 190 x 18% = 34.2) so
// the real DEXA contract accepts the legacy row as a valid scan.
const SYNTHETIC_SCAN_METRICS = Object.freeze({
  provider: "Synthetic Provider",
  totalMass: { value: 190, unit: "lb" },
  bodyFatPercentage: 18,
  fatMass: { value: 34.2, unit: "lb" },
  leanMass: { value: 148.6, unit: "lb" },
  boneMineralContent: { value: 7.2, unit: "lb" },
  sourceFileId: "media://synthetic.pdf",
  provenance: { extraction_engine: "synthetic", source_artifact_refs: ["media://synthetic.pdf"] },
});

function appointment(overrides = {}) {
  return {
    id: "execution_next_dexa", userId: OWNER, type: "evidence", status: "scheduled", active: true,
    timezone: "America/Los_Angeles", preferredSchedule: { date: SCAN_DATE }, uploadReminder: true,
    completionHistory: [], ...overrides,
  };
}

function seed() {
  return createFakeFounderCanonicalDatabase({
    ownerUserId: OWNER,
    collections: {
      user: { id: OWNER, timeZone: "America/Los_Angeles" },
      goals: [{ id: "goal_1", userId: OWNER, status: "active" }],
      protocols: [{ id: "protocol_briefings", userId: OWNER, status: "active", protocolType: "briefings", currentVersionId: "pv_1" }],
      protocolVersions: [{ id: "pv_1", protocolId: "protocol_briefings", eventBriefings: { dexa: true } }],
      weightEntries: [{ id: "weight_2026_10_08", userId: OWNER, measuredAt: "2026-10-08", weight: { value: 180, unit: "lb" } }],
      dexaScans: [{ id: "legacy_scan_sep", userId: OWNER, measuredAt: "2026-09-12", ...SYNTHETIC_SCAN_METRICS }],
      executionItems: [
        appointment(),
        { id: "execution_dexa", userId: OWNER, type: "evidence", active: true, completionHistory: [] },
        { id: "execution_other", userId: OWNER },
      ],
      canonicalEvidenceObjects: [
        { canonicalId: CANONICAL_ID, id: CANONICAL_ID, userId: OWNER, evidence_type: "dexa_scan", lastObservedAt: SCAN_DATE, quality: { status: "active" } },
        { canonicalId: "canonical_training_1", id: "canonical_training_1", userId: OWNER, evidence_type: "training", lastObservedAt: "2026-10-08" },
      ],
      evidenceReviews: [{ id: "review_unrelated", userId: OWNER, status: "confirmed" }],
      analyses: [{ id: "analysis_1", evidenceIds: ["x"], evidenceTypes: ["dexa"] }],
      dailyBriefings: [{ id: "briefing_1", userId: OWNER }],
    },
  });
}

function steps(db, { bindings = null } = {}) {
  return createDexaConfirmationBoundedSteps({
    userId: OWNER,
    fallbackRepositories: {
      dexaScans: { upsertDEXAScan: vi.fn(async (scan) => scan) },
      executionItems: { getExecutionItemById: vi.fn(async () => null), saveExecutionItem: vi.fn() },
    },
    loadReadContext: async ({ collections, includeApplicationContext }) => ({
      runtime: await loadCanonicalRuntime({ query: db.query, ownerUserId: OWNER, collections, includeApplicationContext, includeImportMetadata: false }),
    }),
    loadCanonicalCommitBindings: async () => bindings ?? ({
      mutateCanonicalRecords: (input) => executePostgresFounderRecordMutation({ pool: db.pool, ownerUserId: OWNER, authorityStore, ...input }),
    }),
    now: () => new Date("2026-10-09T15:30:00.000Z"),
  });
}

describe("DEXA-only confirmation detection", () => {
  it.each([
    [{ evidence_objects: [{ evidence_type: "dexa_scan" }] }, true],
    [{ evidence_objects: [{ evidence_type: "dexa" }, { evidence_type: "body_composition" }] }, true],
    [{ evidence_objects: [{ evidence_type: "dexa_scan" }, { evidence_type: "weight", removed: true }] }, true],
    [{ evidence_objects: [{ evidence_type: "dexa_scan" }, { evidence_type: "weight" }] }, false],
    [{ evidence_objects: [{ evidence_type: "photo_session" }] }, false],
    [{ evidence_objects: [{ evidence_type: "dexa_scan", removed: true }] }, false],
    [{ evidence_objects: [] }, false],
    [null, false],
  ])("%j -> %s", (evidencePackage, expected) => {
    expect(isDexaOnlyConfirmationPackage(evidencePackage)).toBe(expected);
  });
});

describe("bounded DEXA confirmation reads", () => {
  it("reads canonical evidence from that collection alone", async () => {
    const db = seed();
    const canonical = await steps(db).readCanonicalEvidence();
    expect(canonical.map((item) => item.canonicalId)).toEqual([CANONICAL_ID, "canonical_training_1"]);
    expect(db.stats.collectionLoads).toEqual([...DEXA_CANONICAL_READ_COLLECTIONS]);
  });

  it("reads the legacy DEXA read model from that collection alone", async () => {
    const db = seed();
    const scans = await steps(db).readDexaScans();
    expect(scans.map((item) => item.id)).toEqual(["legacy_scan_sep"]);
    expect(db.stats.collectionLoads).toEqual(["dexaScans"]);
  });

  it("reads Goal evaluation inputs from exactly the six collections Goal evaluation consumes", async () => {
    const db = seed();
    const inputs = await steps(db).readGoalEvaluationInputs();
    expect(inputs.goals.map((item) => item.id)).toEqual(["goal_1"]);
    expect(inputs.weightEntries).toHaveLength(1);
    expect(inputs.dexaScans).toHaveLength(1);
    expect([...db.stats.collectionLoads].sort()).toEqual([...DEXA_GOAL_EVALUATION_READ_COLLECTIONS].sort());
  });

  it("resolves event briefing preferences from protocols and versions only", async () => {
    const db = seed();
    await steps(db).readEventBriefingPreferences();
    expect([...db.stats.collectionLoads].sort()).toEqual(["protocolVersions", "protocols"]);
  });

  it("loads the DEXA Event runtime bounded and guarded", async () => {
    const db = seed();
    const runtime = await steps(db).loadDexaEventRuntime();
    expect([...new Set(db.stats.collectionLoads)].sort()).toEqual([...DEXA_EVENT_READ_COLLECTIONS].sort());
    expect(runtime.dailyBriefings).toHaveLength(1);
    expect(runtime.revision).toBe(1);
    expect(() => runtime.evidenceReviews.length).toThrowError(expect.objectContaining({ code: "BOUNDED_READ_COLLECTION_NOT_LOADED" }));
  });
});

describe("bounded DEXA compatibility row", () => {
  const row = { id: "evidence_object_dexa_oct9", userId: OWNER, measuredAt: SCAN_DATE, canonicalId: CANONICAL_ID, dexaRevision: { revision: 1 } };

  it("writes the one row, loading no collection and leaving every other row untouched", async () => {
    const db = seed();
    await steps(db).persistCompatibilityScan(row);
    expect(db.stats.collectionLoads).toEqual([]);
    expect(db.stats.recordWrites).toEqual([`dexaScans:${row.id}`]);
    expect(db.get("dexaScans", row.id)).toMatchObject({ ...row, version: 1 });
    expect(db.get("dexaScans", "legacy_scan_sep").version).toBe(1);
    expect(db.list("dexaScans").map((item) => item.id)).toEqual(["legacy_scan_sep", row.id]);
  });

  it("is idempotent: replaying the same row writes nothing", async () => {
    const db = seed();
    await steps(db).persistCompatibilityScan(row);
    const revision = db.revision;
    db.resetStats();
    await steps(db).persistCompatibilityScan(row);
    expect(db.stats.recordWrites).toEqual([]);
    expect(db.stats.metadataBumps).toBe(0);
    expect(db.revision).toBe(revision);
    expect(db.list("dexaScans").filter((item) => item.measuredAt === SCAN_DATE)).toHaveLength(1);
  });

  it("uses the repository when no named-record writer is bound (legacy composition)", async () => {
    const db = seed();
    const subject = steps(db, { bindings: { mutateCanonicalRuntime: () => { throw new Error("no"); } } });
    await subject.persistCompatibilityScan(row);
    expect(db.stats.recordWrites).toEqual([]);
  });
});

describe("bounded DEXA appointment reconciliation", () => {
  it("completes the scheduled appointment for the scan date and writes only that record", async () => {
    const db = seed();
    const result = await steps(db).reconcileAppointment({ canonicalEvidenceId: CANONICAL_ID, evidenceDate: SCAN_DATE });

    expect(result).toMatchObject({ matched: true, persisted: true, completionId: `execution_next_dexa:${SCAN_DATE}:${CANONICAL_ID}` });
    expect(db.stats.collectionLoads).toEqual([]);
    expect(db.stats.recordReads.sort()).toEqual(["executionItems:execution_dexa", "executionItems:execution_next_dexa"]);
    expect(db.stats.recordWrites).toEqual(["executionItems:execution_next_dexa"]);
    const stored = db.get("executionItems", "execution_next_dexa");
    expect(stored).toMatchObject({ status: "completed", active: false, completedByEvidenceId: CANONICAL_ID, completedEvidenceDate: SCAN_DATE, version: 2 });
    expect(stored.completionHistory).toHaveLength(1);
    expect(db.get("executionItems", "execution_dexa").version).toBe(1);
    expect(db.get("executionItems", "execution_other").version).toBe(1);
  });

  it("is idempotent: a second reconciliation writes nothing", async () => {
    const db = seed();
    await steps(db).reconcileAppointment({ canonicalEvidenceId: CANONICAL_ID, evidenceDate: SCAN_DATE });
    db.resetStats();
    const again = await steps(db).reconcileAppointment({ canonicalEvidenceId: CANONICAL_ID, evidenceDate: SCAN_DATE });
    expect(again).toMatchObject({ matched: true, outcome: "idempotent" });
    expect(db.stats.recordWrites).toEqual([]);
    expect(db.get("executionItems", "execution_next_dexa").completionHistory).toHaveLength(1);
  });

  it("records a genuinely historical scan on the legacy execution only", async () => {
    const db = seed();
    const result = await steps(db).reconcileAppointment({ canonicalEvidenceId: "dexa_scan|historical", evidenceDate: "2026-09-12" });
    expect(result).toMatchObject({ matched: true, legacy: true, outcome: "persisted" });
    expect(db.stats.recordWrites).toEqual(["executionItems:execution_dexa"]);
    expect(db.get("executionItems", "execution_next_dexa").status).toBe("scheduled");
  });

  it("leaves both records alone when nothing matches", async () => {
    const db = seed();
    const result = await steps(db).reconcileAppointment({ canonicalEvidenceId: "dexa_scan|future", evidenceDate: "2026-12-01" });
    expect(result.matched).toBe(false);
    expect(db.stats.recordWrites).toEqual([]);
    expect(db.stats.metadataBumps).toBe(0);
  });
});
