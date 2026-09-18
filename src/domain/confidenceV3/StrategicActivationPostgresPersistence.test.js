import { describe, expect, it } from "vitest";
import { createCanonicalConfidenceAssessment } from
  "../confidence/CanonicalConfidenceAssessmentModel.js";
import { createCanonicalConfidenceReadService } from
  "../confidence/CanonicalConfidenceReadService.js";
import { resolveActiveGoalConfidencePresentation } from
  "../services/ActiveGoalConfidencePresentationReadService.js";
import { createCanonicalBriefingConfidencePublicationService } from
  "../services/CanonicalBriefingConfidencePublicationService.js";
import { createPairedCalibrationFixtures } from
  "../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import { loadCanonicalRuntime } from
  "../../platform/migration/phase4CanonicalImport.js";
import { PHASE4_DOMAIN_TABLES } from
  "../../platform/migration/phase4DomainCollections.js";
import { executePostgresFounderRuntimeMutation } from
  "../../platform/database/PostgresFounderRepositoryFacade.js";
import { createStrategicActivationService } from "./StrategicActivationService.js";

const OWNER_ID = "activation-persistence-owner";
const CUTOFF = "2026-09-17T00:00:00.000Z";
const CALIBRATION = createPairedCalibrationFixtures().dexa;
const GOAL_ID = CALIBRATION.goalContract.goalId;
const PHASE_ID = CALIBRATION.goalContract.phase.phaseId;
const GOAL = Object.freeze({ id: GOAL_ID, userId: OWNER_ID,
  title: "Build Lean Mass", status: "active" });
const PHASE = Object.freeze({ id: PHASE_ID, goalId: GOAL_ID,
  name: "Lean Mass Build", status: "active" });
const PUBLICATION_COLLECTIONS = Object.freeze([
  "dailyBriefings",
  "goalConfidenceSnapshots",
  "goalConfidenceHistory",
  "confidenceInitializationArtifacts",
  "confidenceActivationArtifacts",
]);

describe("V3 activation PostgreSQL canonical persistence", () => {
  it("publishes and reads back one 79% activation, then replays idempotently", async () => {
    const database = productionShapedDatabase(seedRuntime());
    const first = await activate(database);
    expect(first.committed, JSON.stringify(first.commitResult)).toBe(true);
    expect(first).toMatchObject({ previousPercentage: 62, currentPercentage: 79 });

    const persisted = await database.load();
    expect(persisted.confidenceActivationArtifacts).toHaveLength(1);
    expect(persisted.goalConfidenceHistory).toHaveLength(2);
    expect(persisted.goalConfidenceSnapshots).toHaveLength(1);
    expect(persisted.dailyBriefings).toEqual([]);
    expect(database.rowsFor("confidenceActivationArtifacts")[0]?.table)
      .toBe("canonical_confidence_records");

    const current = createCanonicalConfidenceReadService({ store: persisted })
      .getCurrent({ goalId: GOAL_ID, phaseId: PHASE_ID });
    expect(current.assessment).toMatchObject({
      schemaVersion: "canonical_confidence_assessment_v3",
      publisherType: "v3_strategic_activation",
      currentPercentage: 79,
      strategyConfidence: { percentage: 90 },
    });
    const presentation = resolveActiveGoalConfidencePresentation({
      activeGoal: { ...GOAL, phases: [PHASE] },
      activePhase: PHASE,
      store: persisted,
    });
    expect(presentation).toMatchObject({ value: 79, piVersion: "confidence_v3" });

    const replay = await activate(database);
    expect(replay).toMatchObject({ status: "matched", committed: false,
      assessmentId: first.assessmentId, currentPercentage: 79 });
    const replayed = await database.load();
    expect(replayed.confidenceActivationArtifacts).toHaveLength(1);
    expect(replayed.goalConfidenceHistory).toHaveLength(2);
    expect(replayed.goalConfidenceSnapshots[0].currentAssessmentId)
      .toBe(first.assessmentId);
  });

  it("fails closed when an existing activation identity is recomputed differently", async () => {
    const database = productionShapedDatabase(seedRuntime());
    await activate(database);
    const before = database.digest();
    const conflict = await activate(database, { conflictingSemantics: true });
    expect(conflict).toMatchObject({ status: "publication_identity_conflict",
      committed: false });
    expect(database.digest()).toBe(before);
    expect((await database.load()).confidenceActivationArtifacts).toHaveLength(1);
  });

  it.each(["goalConfidenceHistory", "confidenceActivationArtifacts"])(
    "rolls back artifact, snapshot, and history together when %s fails",
    async (failedCollection) => {
      const database = productionShapedDatabase(seedRuntime());
      const before = database.digest();
      database.failNextInsert(failedCollection);
      const failed = await activate(database);
      expect(failed).toMatchObject({ status: "persistence_failure", committed: false });
      expect(database.digest()).toBe(before);
      const persisted = await database.load();
      expect(persisted.confidenceActivationArtifacts).toEqual([]);
      expect(persisted.goalConfidenceHistory).toHaveLength(1);
      expect(persisted.goalConfidenceSnapshots[0].currentScore).toBe(62);
      expect(database.transactions()).toEqual(["BEGIN", "ROLLBACK"]);
    },
  );
});

async function activate(database, { conflictingSemantics = false } = {}) {
  const store = await database.load();
  const publicationService = createCanonicalBriefingConfidencePublicationService({
    filePath: "provider://activation-persistence-test",
    liveStore: store,
    mutateCanonicalRuntime: (input) => executePostgresFounderRuntimeMutation({
      pool: database.pool,
      ownerUserId: OWNER_ID,
      compatibilityMode: true,
      requireCompatibilityAuthority: true,
      authorityStore: { assertCompatibilityAccess: async () => ({
        authority: "provider-compatibility-nonauthoritative",
      }) },
      commandId: "activation-persistence-command",
      ...input,
      returnReceipt: true,
    }),
    now: () => new Date(CUTOFF),
  });
  const service = createStrategicActivationService({
    publicationService,
    now: () => new Date(CUTOFF),
    buildInterpretationInput: async () => ({
      goalContract: CALIBRATION.goalContract,
      observations: conflictObservations(conflictingSemantics),
    }),
  });
  return service.activate({ goal: GOAL, phase: PHASE, store,
    evidenceCutoff: CUTOFF });
}

function conflictObservations(conflict) {
  if (!conflict) return CALIBRATION.observations;
  return CALIBRATION.observations.map((observation, index) => {
    if (index !== 0) return observation;
    const changed = structuredClone(observation);
    const leanMass = changed.capabilities.find((item) =>
      item.capabilityId === "body_composition.lean_mass");
    leanMass.value = 149;
    leanMass.change = 0.7;
    leanMass.factualSummary = "The comparison measured only 0.7 lb of progress.";
    changed.semanticFingerprint = `sha256_${"d".repeat(64)}`;
    return changed;
  });
}

function seedRuntime() {
  const prior = priorV2Assessment();
  return {
    dailyBriefings: [],
    confidenceInitializationArtifacts: [],
    confidenceActivationArtifacts: [],
    goalConfidenceHistory: [{
      id: `goal_confidence_history_v2|${prior.id}`,
      schemaVersion: "goal_confidence_history_record_v2",
      assessmentId: prior.id,
      goalId: GOAL_ID,
      phaseId: PHASE_ID,
      predecessorAssessmentId: null,
      originatingArtifactId: prior.briefingArtifactId,
      publisherType: prior.publisherType,
      persistedAt: prior.publicationTimestamp,
      commitId: "prior-commit",
      assessment: prior,
    }],
    goalConfidenceSnapshots: [{
      id: `goal_confidence_snapshot_v2|${GOAL_ID}|${PHASE_ID}`,
      schemaVersion: "goal_confidence_snapshot_v2",
      goalId: GOAL_ID,
      phaseId: PHASE_ID,
      goalContractId: prior.goalContract.id,
      goalContractVersion: prior.goalContract.version,
      currentAssessmentId: prior.id,
      currentScore: 62,
      scoreBand: "moderate",
      previousCanonicalAssessmentId: null,
      historyRecordId: `goal_confidence_history_v2|${prior.id}`,
      originatingArtifactId: prior.briefingArtifactId,
      publisherType: prior.publisherType,
      evidenceCutoff: prior.sourceCutoff,
      createdAt: prior.publicationTimestamp,
      updatedAt: prior.publicationTimestamp,
      commitId: "prior-commit",
    }],
  };
}

function priorV2Assessment() {
  return createCanonicalConfidenceAssessment({
    goalId: GOAL_ID,
    phaseId: PHASE_ID,
    goalContractId: "contract-prior",
    goalContractVersion: "1",
    publisherType: "weekly_briefing",
    originatingBriefingId: "occurrence-prior",
    briefingArtifactId: "artifact-prior",
    evidenceWindowId: "window-prior",
    priorAssessmentId: null,
    projection: {
      schemaVersion: "numeric_confidence_projection_v2_durability_v1",
      id: "projection-prior",
      movement: "no_meaningful_change",
      priorPercentage: null,
      currentPercentage: 62,
      movementMagnitude: "none",
    },
    structuredInterpretation: {
      id: "interpretation-prior",
      provenance: { inputFingerprint: "fingerprint-prior", engineVersion: "v2" },
    },
    forecastAssessment: {
      id: "forecast-prior",
      confidenceBand: "moderate",
      goalForecastStatus: "on_forecast",
      forecastDirection: "steady",
      forecastExplanation: { text: "steady" },
      remainingUncertainty: { status: "none", items: [] },
      nextDecisiveEvidence: null,
      forecastMetadata: {
        interpretationSemanticFingerprint: "semantic-prior",
        goalContractFingerprint: "goal-contract-prior",
        inputFingerprint: "forecast-prior",
        engineVersion: "v2",
      },
    },
    narrativeAssessment: {
      id: "narrative-prior",
      confidenceExplanation: { text: "Confidence held at 62%." },
      provenance: { inputFingerprint: "narrative-prior", engineVersion: "v2" },
    },
    publicationTimestamp: "2026-09-01T00:00:00.000Z",
    sourceCutoff: "2026-09-01T00:00:00.000Z",
    idempotencyKey: "prior-key",
  });
}

function productionShapedDatabase(seed) {
  let committed = toRows(seed);
  let working = null;
  let metadata = { revision: 1, lastCommandId: "prior-commit" };
  let workingMetadata = null;
  let failCollection = null;
  const transactionLog = [];

  const query = async (sql, values = []) => {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (normalized === "BEGIN") {
      working = structuredClone(committed);
      workingMetadata = { ...metadata };
      transactionLog.push("BEGIN");
      return result([]);
    }
    if (normalized === "COMMIT") {
      committed = working;
      metadata = workingMetadata;
      working = null;
      workingMetadata = null;
      transactionLog.push("COMMIT");
      return result([]);
    }
    if (normalized === "ROLLBACK") {
      working = null;
      workingMetadata = null;
      transactionLog.push("ROLLBACK");
      return result([]);
    }
    const rows = working ?? committed;
    const runtimeMetadata = workingMetadata ?? metadata;
    if (normalized.startsWith("SELECT pg_advisory_xact_lock")) return result([{}]);
    if (normalized === "SELECT current_database() AS database") {
      return result([{ database: "physiqueos_phase5_test_provider_activation" }]);
    }
    if (normalized.includes("SELECT collection_name,source_ordinal,record_id,payload")) {
      const collections = [...new Set(values.slice(1).flat())];
      return result(rows.filter((row) => collections.includes(row.collection))
        .sort((left, right) => left.collection.localeCompare(right.collection) ||
          left.ordinal - right.ordinal || left.recordId.localeCompare(right.recordId))
        .map((row) => ({ collection_name: row.collection,
          source_ordinal: row.ordinal, record_id: row.recordId,
          payload: structuredClone(row.payload) })));
    }
    if (normalized.startsWith("SELECT runtime_version,revision,last_command_id,updated_at,imported_at")) {
      return result([{ runtime_version: "founder-seed-v2",
        revision: runtimeMetadata.revision,
        last_command_id: runtimeMetadata.lastCommandId,
        updated_at: CUTOFF,
        imported_at: "2026-09-01T00:00:00.000Z" }]);
    }
    if (normalized.startsWith("DELETE FROM physiqueos.")) {
      const [ownerId, collection, identities] = values;
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const row = rows[index];
        if (row.ownerId === ownerId && row.collection === collection &&
            !identities.includes(row.recordId)) rows.splice(index, 1);
      }
      return result([]);
    }
    if (normalized.startsWith("SELECT version FROM physiqueos.")) {
      const row = rows.find((item) => item.ownerId === values[0] &&
        item.collection === values[1] && item.recordId === values[2]);
      return result(row ? [{ version: row.version }] : []);
    }
    if (normalized.startsWith("INSERT INTO physiqueos.") &&
        normalized.includes("collection_name,record_id")) {
      const collection = values[1];
      if (failCollection === collection) {
        failCollection = null;
        throw Object.assign(new Error("Injected canonical write failure."),
          { code: "INJECTED_CANONICAL_WRITE_FAILURE" });
      }
      const table = /^INSERT INTO physiqueos\.(\w+)/.exec(normalized)?.[1];
      const payload = JSON.parse(values[11]);
      const existing = rows.find((item) => item.ownerId === values[0] &&
        item.collection === collection && item.recordId === values[2]);
      if (existing) {
        existing.payload = payload;
        existing.version += 1;
        existing.ordinal = values[3];
      } else {
        rows.push({ table, ownerId: values[0], collection,
          recordId: values[2], ordinal: values[3], version: values[5], payload });
      }
      return result([]);
    }
    if (normalized.startsWith("UPDATE physiqueos.canonical_runtime_metadata")) {
      runtimeMetadata.revision += 1;
      runtimeMetadata.lastCommandId = values[1];
      return result([{ revision: runtimeMetadata.revision }]);
    }
    throw new Error(`Unmodeled production-shaped SQL: ${normalized}`);
  };
  const client = { query, release() {} };
  const pool = { connect: async () => client, query };
  return {
    pool,
    async load() {
      return loadCanonicalRuntime({ query, ownerUserId: OWNER_ID,
        collections: PUBLICATION_COLLECTIONS,
        includeApplicationContext: false, includeImportMetadata: false });
    },
    rowsFor(collection) {
      return committed.filter((row) => row.collection === collection)
        .map((row) => structuredClone(row));
    },
    failNextInsert(collection) { failCollection = collection; },
    transactions: () => [...transactionLog],
    digest: () => JSON.stringify({ rows: committed, metadata }),
  };
}

function toRows(runtime) {
  return PUBLICATION_COLLECTIONS.flatMap((collection) =>
    (runtime[collection] ?? []).map((payload, ordinal) => ({
      table: PHASE4_DOMAIN_TABLES[collection],
      ownerId: OWNER_ID,
      collection,
      recordId: recordId(payload, ordinal),
      ordinal,
      version: payload.version ?? 1,
      payload: structuredClone(payload),
    })));
}
function recordId(value, index) {
  return String(value?.id ?? value?.package_id ?? value?.review_id ?? `@index:${index}`);
}
function result(rows, rowCount = rows.length) { return { rows, rowCount }; }
