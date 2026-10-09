import { createCanonicalEvidenceRepository } from "../../data/repositories/CanonicalEvidenceRepository.js";
import { createDEXARepository } from "../../data/repositories/DEXARepository.js";
import { createExecutionItemRepository } from "../../data/repositories/ExecutionItemRepository.js";
import { createGoalRepository } from "../../data/repositories/GoalRepository.js";
import { createNutritionContextRepository } from "../../data/repositories/NutritionContextRepository.js";
import { createProgressPhotoRepository } from "../../data/repositories/ProgressPhotoRepository.js";
import { createProtocolRepository } from "../../data/repositories/ProtocolRepository.js";
import { createProtocolVersionRepository } from "../../data/repositories/ProtocolVersionRepository.js";
import { createWeightRepository } from "../../data/repositories/WeightRepository.js";
import { canonicalJson } from "../../contracts/v1/canonicalJson.js";
import { resolveEventBriefingPreferencesFromStore } from "../../domain/services/CoachingUpdatesReadService.js";
import { DEXA_APPOINTMENT_ID } from "../../domain/services/DexaAppointmentManagementService.js";
import {
  reconcileDexaAppointmentFromConfirmedEvidence,
  reconcileHistoricalDexaExecutionFromConfirmedEvidence,
} from "../../domain/services/DexaAppointmentLifecycleService.js";
import { createGuardedBoundedRuntime } from "../../platform/database/BoundedFounderRuntimeRead.js";
import { loadApplicationCanonicalCommitBindings } from "../runtime/ApplicationCanonicalRuntime.js";

// A confirmed DEXA scan is one small record, yet every post-confirmation step
// used to read or rewrite the whole canonical runtime (about 63 MB of canonical
// JSON in production on 2026-10-09, three or four times that once hydrated).
// The October 9 confirmation crashed the 1 GB worker and then the web process
// inside `compatibility_writes`, which loaded the runtime once to find the
// canonical scan and again to rewrite every collection for one `dexaScans` row.
//
// These steps read only the collections each step consumes and write only the
// records it changes. They are used for confirmations whose included evidence
// is DEXA only; every other evidence type keeps its existing path.

export const DEXA_EVIDENCE_TYPES = Object.freeze(["dexa", "dexa_scan", "body_composition"]);
export const LEGACY_DEXA_EXECUTION_ID = "execution_dexa";

export const DEXA_CANONICAL_READ_COLLECTIONS = Object.freeze(["canonicalEvidenceObjects"]);
export const DEXA_LEGACY_READ_COLLECTIONS = Object.freeze(["dexaScans"]);
export const DEXA_GOAL_EVALUATION_READ_COLLECTIONS = Object.freeze([
  "goals", "dexaScans", "weightEntries", "progressPhotos", "protocols", "nutritionContext",
]);
export const DEXA_EVENT_PREFERENCE_READ_COLLECTIONS = Object.freeze(["protocols", "protocolVersions"]);
// Everything the DEXA Event narrative, its Goal context, the V3 evidence
// universe and the Confidence publication can read. Excluded collections
// (evidence review and package history, Training events and libraries, PI work
// queues, migration markers) are guarded: a read of one fails the step loudly.
export const DEXA_EVENT_READ_COLLECTIONS = Object.freeze([
  "user", "goals", "goalTransitionDrafts", "goalProtocolTransitionDrafts",
  "phaseReviewDecisions", "phaseReviewTransactions", "phaseStrategies",
  "phaseExpectedTrajectories", "phaseLifecycleReadModels",
  "operatingPlan", "energyStrategyLinks", "nutritionContext",
  "protocols", "protocolVersions", "executionItems", "reminders",
  "weightEntries", "dailyCheckIns", "dexaScans", "progressPhotos",
  "canonicalEvidenceObjects", "analyses", "dailyBriefings",
  "goalConfidenceSnapshots", "goalConfidenceHistory", "goalConfidenceContinuitySeeds",
  "confidenceInitializationArtifacts", "confidenceActivationArtifacts",
]);

export function isDexaOnlyConfirmationPackage(evidencePackage) {
  const included = (evidencePackage?.evidence_objects ?? []).filter((item) => item?.removed !== true);
  return included.length > 0 && included.every((item) => DEXA_EVIDENCE_TYPES.includes(item?.evidence_type));
}

// Bounded reads exist only in the provider (PostgreSQL) composition. Elsewhere
// this returns null and every read goes through the same repositories as before.
async function loadProductionBoundedReadContext(input, env = process.env) {
  if (env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1" || env.NEXT_PHASE === "phase-production-build") return null;
  const { loadProductionBoundedFounderReadContext } = await import(
    "../composition/productionApplicationComposition.js"
  );
  return loadProductionBoundedFounderReadContext(input);
}

export function createDexaConfirmationBoundedSteps({
  userId,
  fallbackRepositories,
  loadReadContext = loadProductionBoundedReadContext,
  loadCanonicalCommitBindings = loadApplicationCanonicalCommitBindings,
  now = () => new Date(),
} = {}) {
  if (!String(userId ?? "").trim()) throw new Error("Bounded DEXA confirmation steps require the owner.");

  async function read(collections, { includeApplicationContext = false } = {}) {
    const context = await loadReadContext({
      collections: [...collections],
      includeApplicationContext,
      includeImportMetadata: false,
    });
    if (!context) return { runtime: null, repositories: fallbackRepositories };
    const runtime = createGuardedBoundedRuntime(context.runtime, collections);
    return { runtime, repositories: boundedRepositories(runtime) };
  }

  // Applies one repository operation to the named records only. The operation
  // runs against seed repositories over just those records, so the exact
  // existing repository and domain logic decides the result; any record it
  // changes is written alone, fenced on the version it was read at.
  async function mutateRecords({ collection, recordIds, operation, apply, fallback }) {
    const bindings = await loadCanonicalCommitBindings();
    if (typeof bindings?.mutateCanonicalRecords !== "function") {
      // Legacy or in-memory composition: no named-record writer exists, so the
      // repository is the only durable path (as ConfirmationBoundedWriters).
      return fallback();
    }
    const committed = await bindings.mutateCanonicalRecords({
      operation,
      records: recordIds.map((recordId) => ({ collection, recordId })),
      async mutate({ read: readRecord }) {
        const before = new Map();
        for (const recordId of recordIds) {
          const record = readRecord(collection, recordId);
          if (record) before.set(recordId, record);
        }
        const runtime = createGuardedBoundedRuntime(
          { [collection]: [...before.values()].map((record) => structuredClone(record)) },
          [collection]
        );
        const result = await apply(boundedRepositories(runtime));
        const after = runtime[collection];
        const writes = [];
        const seen = new Set();
        for (const record of after) {
          const recordId = String(record?.id ?? "");
          if (!recordIds.includes(recordId) || seen.has(recordId)) {
            throw Object.assign(new Error(`Bounded DEXA write touched an undeclared ${collection} record.`), {
              code: "FOUNDER_RECORD_MUTATION_SCOPE_VIOLATION",
            });
          }
          seen.add(recordId);
          const prior = before.get(recordId);
          if (!prior || contentDigest(prior) !== contentDigest(record)) {
            writes.push({ collection, recordId, payload: structuredClone(record) });
          }
        }
        for (const recordId of before.keys()) {
          if (!seen.has(recordId)) {
            throw Object.assign(new Error(`Bounded DEXA write removed ${collection} record.`), {
              code: "FOUNDER_RECORD_MUTATION_SCOPE_VIOLATION",
            });
          }
        }
        return { writes, result };
      },
    });
    return committed.result;
  }

  return Object.freeze({
    async readCanonicalEvidence() {
      const { repositories } = await read(DEXA_CANONICAL_READ_COLLECTIONS);
      return repositories.canonicalEvidence.listCanonicalEvidenceObjects(userId);
    },
    async readDexaScans() {
      const { repositories } = await read(DEXA_LEGACY_READ_COLLECTIONS);
      return repositories.dexaScans.listDEXAScans(userId);
    },
    async readGoalEvaluationInputs() {
      const { repositories } = await read(DEXA_GOAL_EVALUATION_READ_COLLECTIONS);
      const [goals, dexaScans, weightEntries, progressPhotos, protocols, nutritionContext] = await Promise.all([
        repositories.goals.listGoals(userId),
        repositories.dexaScans.listDEXAScans(userId),
        repositories.weights.listWeightEntries(userId),
        repositories.progressPhotos.listPhotos(userId),
        repositories.protocols.listProtocols(userId),
        repositories.nutritionContext.getNutritionContext?.(userId),
      ]);
      return { goals, dexaScans, weightEntries, progressPhotos, protocols, nutritionContext };
    },
    async readEventBriefingPreferences() {
      const { repositories } = await read(DEXA_EVENT_PREFERENCE_READ_COLLECTIONS);
      const protocols = await repositories.protocols.listProtocols(userId);
      const active = protocols.find((item) =>
        item.status === "active" && (item.protocolType ?? item.category) === "briefings"
      );
      const currentVersion = active?.currentVersionId
        ? await repositories.protocolVersions.getVersionById(active.currentVersionId)
        : null;
      return resolveEventBriefingPreferencesFromStore({
        protocols,
        protocolVersions: currentVersion ? [currentVersion] : [],
      });
    },
    // The canonical runtime the DEXA Event narrative and its Confidence
    // publication read. Loaded fresh (no clone), bounded and guarded.
    async loadDexaEventRuntime() {
      const { runtime } = await read(DEXA_EVENT_READ_COLLECTIONS, { includeApplicationContext: true });
      return runtime;
    },
    async persistCompatibilityScan(scan) {
      const recordId = String(scan?.id ?? "");
      if (!recordId) throw new Error("A DEXA compatibility row requires a stable id.");
      return mutateRecords({
        collection: "dexaScans",
        recordIds: [recordId],
        operation: "evidence-confirmation-dexa-compatibility-row",
        apply: (repositories) => repositories.dexaScans.upsertDEXAScan(structuredClone(scan)),
        fallback: () => fallbackRepositories.dexaScans.upsertDEXAScan?.(scan) ??
          fallbackRepositories.dexaScans.addDEXAScan(scan),
      });
    },
    // Current appointment first, historical legacy execution second, exactly
    // as the repository path; both records are read under one lock.
    async reconcileAppointment({ canonicalEvidenceId, evidenceDate, confirmedAt = now().toISOString() }) {
      const reconcile = async (repositories) => {
        const confirmation = { repositories, canonicalEvidenceId, confirmedAt, evidenceDate };
        const current = await reconcileDexaAppointmentFromConfirmedEvidence(confirmation);
        return current.matched
          ? current
          : reconcileHistoricalDexaExecutionFromConfirmedEvidence(confirmation);
      };
      return mutateRecords({
        collection: "executionItems",
        recordIds: [DEXA_APPOINTMENT_ID, LEGACY_DEXA_EXECUTION_ID],
        operation: "evidence-confirmation-dexa-appointment-reconciliation",
        apply: reconcile,
        fallback: () => reconcile(fallbackRepositories),
      });
    },
  });
}

// The storage version is assigned by the writer, never by the domain change, so
// an identical replay is not a change.
function contentDigest(record) {
  const { version: _version, ...content } = record ?? {};
  return canonicalJson(content);
}

// The repositories the bounded steps use, built exactly as createSeedRepositories
// builds them but only on first use. createSeedRepositories also constructs the
// Daily Briefing repository, which reads every briefing at construction, so it
// cannot be built over a runtime that did not load briefings.
function boundedRepositories(runtime) {
  const cache = new Map();
  const lazy = (name, create) => ({
    enumerable: true,
    get() {
      if (!cache.has(name)) cache.set(name, create());
      return cache.get(name);
    },
  });
  return Object.defineProperties({}, {
    canonicalEvidence: lazy("canonicalEvidence", () => createCanonicalEvidenceRepository(
      runtime.canonicalEvidenceObjects ?? [],
      { evidencePackages: runtime.evidencePackages ?? [], goals: runtime.goals ?? [] }
    )),
    dexaScans: lazy("dexaScans", () => createDEXARepository(runtime.dexaScans)),
    executionItems: lazy("executionItems", () => createExecutionItemRepository(runtime.executionItems ?? [])),
    goals: lazy("goals", () => createGoalRepository(runtime.goals)),
    nutritionContext: lazy("nutritionContext", () => createNutritionContextRepository(runtime.nutritionContext ?? null)),
    progressPhotos: lazy("progressPhotos", () => createProgressPhotoRepository(runtime.progressPhotos ?? [])),
    protocols: lazy("protocols", () => createProtocolRepository(runtime.protocols)),
    protocolVersions: lazy("protocolVersions", () => createProtocolVersionRepository(runtime.protocolVersions ?? [])),
    weights: lazy("weights", () => createWeightRepository(runtime.weightEntries)),
  });
}
