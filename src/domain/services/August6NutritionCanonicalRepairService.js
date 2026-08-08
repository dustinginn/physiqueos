import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import { reconcileNutritionDayEvidence } from "../models/nutritionDayEvidence";
import { createFounderRuntimeSemanticDigest } from "./FounderRuntimeSemanticDigest";
import { createPILowerLevelConfidenceWorkEnqueueService } from "./PILowerLevelConfidenceWorkEnqueueService";
import { createPISemanticFingerprint } from "./PILowerLevelConfidenceContracts";

export const AUGUST_6_NUTRITION_CANONICAL_ID =
  "nutrition|2026-08-06|nutrition_day_2026-08-06_1";
export const AUGUST_6_NUTRITION_PACKAGE_ID =
  "evidence_submission_20260807011337338_images";
export const AUGUST_6_NUTRITION_REVIEW_ID =
  "evidence_review_20260807011557905";
export const AUGUST_6_NUTRITION_SUMMARY_ARTIFACT = "IMG_1804.jpeg";
export const AUGUST_6_PI_ENERGY_WORK_ID =
  "pi_energy_work|1abc101675232e1a5b166abd49279cd0534ad3a4fb09dc2ac2046df586e9d4c2";
export const AUGUST_6_AUTHORITATIVE_TOTALS = Object.freeze({
  calories: 2280,
  protein_g: 189,
  carbs_g: 185,
  fat_g: 83,
});

const INCORRECT_TOTALS = Object.freeze({
  calories: 1201,
  protein_g: 63,
  carbs_g: 111,
  fat_g: 48,
});
const EXPECTED_MEALS = Object.freeze([
  ["Breakfast", 440, 62, 37, 6],
  ["Lunch", 640, 64, 36, 28],
  ["Dinner", 648, 55, 28, 25],
  ["Snacks", 553, 8, 83, 23],
]);

export function createAugust6NutritionCanonicalRepairService({
  runtimeStorePath,
  liveStore,
  evidenceRoot = process.cwd(),
  now = () => new Date(),
  createUnitOfWork = createFounderStoreUnitOfWork,
} = {}) {
  if (!runtimeStorePath || !liveStore) {
    throw new Error("August 6 Nutrition repair requires a bound Founder store.");
  }

  return Object.freeze({
    audit() {
      const baseline = capture(runtimeStorePath);
      return classify(baseline.store, evidenceRoot);
    },

    prepare({ preparedAt = now().toISOString() } = {}) {
      const baseline = capture(runtimeStorePath);
      const classification = classify(baseline.store, evidenceRoot);
      if (classification.state === "already_repaired") {
        return { outcome: "already_repaired", baseline: publicBaseline(baseline),
          classification, changedPaths: [] };
      }
      assert(classification.state === "eligible", classification.reason);
      const staged = stageRepair(baseline.store, preparedAt);
      validateCandidate(baseline.store, staged.store, staged, { finalized: false });
      const plan = {
        canonicalId: AUGUST_6_NUTRITION_CANONICAL_ID,
        authoritativeArtifact: AUGUST_6_NUTRITION_SUMMARY_ARTIFACT,
        authoritativeTotals: AUGUST_6_AUTHORITATIVE_TOTALS,
        retainedMealCount: EXPECTED_MEALS.length,
        piEnergyWorkId: AUGUST_6_PI_ENERGY_WORK_ID,
        expectedSourceFingerprint: staged.beforeWork.expectedSourceFingerprint,
        correctionLinkageFingerprint: staged.afterWork.sourceLinkageFingerprint,
        preparedAt: new Date(preparedAt).toISOString(),
      };
      const fingerprint = digest({ baseline: publicBaseline(baseline), plan });
      return {
        outcome: "prepared",
        baseline: publicBaseline(baseline),
        classification,
        changedPaths: changedPaths(baseline.store, staged.store),
        fingerprint,
        plan,
      };
    },

    async execute(command = {}) {
      const prepared = this.prepare({ preparedAt: command.preparedAt });
      if (prepared.outcome === "already_repaired") return prepared;
      validateCommand(command, prepared);
      const baseline = capture(runtimeStorePath);
      assertBaseline(baseline, prepared.baseline);
      let staged;
      const transaction = createUnitOfWork({
        filePath: runtimeStorePath,
        liveStore,
        stageFrom: baseline.store,
        now: () => new Date(command.preparedAt),
        validatePersistedBaseline: (current) => ({
          valid:
            current.revision === baseline.revision &&
            createFounderRuntimeSemanticDigest(current) === baseline.semanticDigest,
        }),
        lockContext: { operation: "august_6_nutrition_canonical_repair" },
      }).begin();
      await transaction.mutate((candidate) => {
        staged = stageRepair(candidate, command.preparedAt, { mutate: true });
      });
      const commit = await transaction.commit({
        validate: (candidate) => {
          validateCandidate(baseline.store, candidate, staged, { finalized: false });
          return { valid: true };
        },
        finalizeCandidate({ stagedState, commitId }) {
          stampPendingSourceCommit(stagedState, commitId);
        },
        validateFinalized: (candidate, { commitId }) => {
          validateCandidate(baseline.store, candidate, staged, {
            finalized: true,
            commitId,
          });
          return { valid: true };
        },
      });
      const after = capture(runtimeStorePath);
      const afterClassification = classify(after.store, evidenceRoot);
      assert(afterClassification.state === "already_repaired", "post_commit_verification_failed");
      return {
        outcome: "repaired",
        committed: true,
        revision: commit.revision,
        commitId: commit.commitId,
        before: publicBaseline(baseline),
        after: publicBaseline(after),
        changedPaths: changedPaths(baseline.store, after.store),
        canonicalId: AUGUST_6_NUTRITION_CANONICAL_ID,
        piEnergyWorkId: AUGUST_6_PI_ENERGY_WORK_ID,
        expectedSourceFingerprint: afterClassification.work.expectedSourceFingerprint,
        sourceLinkageFingerprint: afterClassification.work.sourceLinkageFingerprint,
      };
    },
  });
}

function stageRepair(store, preparedAt, { mutate = false } = {}) {
  const candidate = mutate ? store : structuredClone(store);
  const recordIndex = candidate.canonicalEvidenceObjects.findIndex(
    (item) => item.canonicalId === AUGUST_6_NUTRITION_CANONICAL_ID
  );
  assert(recordIndex >= 0, "canonical_record_missing");
  const beforeRecord = structuredClone(candidate.canonicalEvidenceObjects[recordIndex]);
  const beforeWork = structuredClone(candidate.piEnergyConfidenceWorkItems.find(
    (item) => item.id === AUGUST_6_PI_ENERGY_WORK_ID
  ));
  assert(beforeWork, "pi_energy_work_missing");
  const correctedRecord = correctCanonicalRecord(beforeRecord, preparedAt);
  candidate.canonicalEvidenceObjects[recordIndex] = correctedRecord;
  const activity = candidate.canonicalEvidenceObjects.find(
    (item) => item.canonicalId === "activity_day|2026-08-06"
  );
  const enqueue = createPILowerLevelConfidenceWorkEnqueueService({
    now: () => new Date(preparedAt),
  }).stageEnergySourceChange(candidate, {
    domain: "nutrition",
    canonicalEvidenceId: correctedRecord.canonicalId,
    linkedCounterpartId: activity?.canonicalId ?? null,
    changedLocalDate: "2026-08-06",
    sourceChangeType: "correction",
    sourceSemanticFingerprint: createPISemanticFingerprint(
      semanticCanonicalRecord(correctedRecord)
    ),
    reason: "energy_correction_committed",
    evidenceCutoff: "2026-08-06T23:59:59.999Z",
    createdAt: new Date(preparedAt).toISOString(),
  });
  assert(enqueue.workId === AUGUST_6_PI_ENERGY_WORK_ID, "pi_energy_identity_changed");
  const afterWork = candidate.piEnergyConfidenceWorkItems.find(
    (item) => item.id === AUGUST_6_PI_ENERGY_WORK_ID
  );
  return { store: candidate, beforeRecord, correctedRecord, beforeWork, afterWork,
    enqueue };
}

function correctCanonicalRecord(record, preparedAt) {
  const corrected = structuredClone(record);
  corrected.updatedAt = new Date(preparedAt).toISOString();
  corrected.payload.metadata = {
    ...corrected.payload.metadata,
    daily_totals_scope: "full_day_summary",
    daily_totals_source_artifact_refs: [AUGUST_6_NUTRITION_SUMMARY_ARTIFACT],
  };
  corrected.payload.daily_totals = {
    ...corrected.payload.daily_totals,
    ...AUGUST_6_AUTHORITATIVE_TOTALS,
  };
  corrected.payload.macro_percentages = {
    ...corrected.payload.macro_percentages,
    protein: { ...corrected.payload.macro_percentages?.protein,
      grams: 189, percent_of_calories: 34 },
    carbohydrates: { ...corrected.payload.macro_percentages?.carbohydrates,
      grams: 185, percent_of_calories: 33 },
    fat: { ...corrected.payload.macro_percentages?.fat,
      grams: 83, percent_of_calories: 33 },
  };
  const totalsByKey = AUGUST_6_AUTHORITATIVE_TOTALS;
  for (const key of Object.keys(totalsByKey)) {
    corrected.payload.goal_status[key] = {
      ...corrected.payload.goal_status[key],
      actual: totalsByKey[key],
      difference: totalsByKey[key],
    };
  }
  const nutrientTotals = new Map([
    ["calories", 2280], ["protein", 189], ["carbohydrates", 185], ["fat", 83],
  ]);
  corrected.payload.nutrients = corrected.payload.nutrients.map((nutrient) => {
    const total = nutrientTotals.get(String(nutrient.name).toLowerCase());
    return total == null ? nutrient : {
      ...nutrient,
      total,
      provenance_ref: AUGUST_6_NUTRITION_SUMMARY_ARTIFACT,
    };
  });
  return corrected;
}

function classify(store, evidenceRoot) {
  try {
    const record = store.canonicalEvidenceObjects?.find(
      (item) => item.canonicalId === AUGUST_6_NUTRITION_CANONICAL_ID
    );
    assert(record, "canonical_record_missing");
    const evidencePackage = store.evidencePackages?.find(
      (item) => item.package_id === AUGUST_6_NUTRITION_PACKAGE_ID
    );
    assert(evidencePackage, "evidence_package_missing");
    const artifact = evidencePackage.provenance?.source_artifacts?.find(
      (item) => item.file_name === AUGUST_6_NUTRITION_SUMMARY_ARTIFACT
    );
    assert(
      artifact?.observed_date === "2026-08-06" &&
      fs.existsSync(path.resolve(evidenceRoot, artifact.storage_path)),
      "authoritative_summary_artifact_not_retained"
    );
    const packageNutrition = evidencePackage.evidence_objects?.find(
      (item) => item.evidence_type === "nutrition" && item.observed_at === "2026-08-06"
    );
    assert(hasArtifact(packageNutrition, AUGUST_6_NUTRITION_SUMMARY_ARTIFACT),
      "package_summary_provenance_missing");
    const review = store.evidenceReviews?.find(
      (item) => item.id === AUGUST_6_NUTRITION_REVIEW_ID
    );
    const reviewNutrition = review?.interpretedEvidence?.evidence_objects?.find(
      (item) => item.evidence_type === "nutrition" && item.observed_at === "2026-08-06"
    );
    assert(
      review?.status === "confirmed" &&
      review.interpretedEvidence?.package_id === AUGUST_6_NUTRITION_PACKAGE_ID &&
      hasArtifact(reviewNutrition, AUGUST_6_NUTRITION_SUMMARY_ARTIFACT),
      "confirmed_review_lineage_missing"
    );
    assert(
      record.provenance?.evidence_package_ids?.includes(AUGUST_6_NUTRITION_PACKAGE_ID) &&
      record.provenance?.source_artifact_refs?.includes(AUGUST_6_NUTRITION_SUMMARY_ARTIFACT),
      "canonical_provenance_missing"
    );
    validateMeals(record.payload.meals);
    const reconciliation = reconcileNutritionDayEvidence({
      dailyTotals: AUGUST_6_AUTHORITATIVE_TOTALS,
      meals: record.payload.meals,
    });
    assert(reconciliation.status === "reconciled", "authoritative_totals_not_corroborated");
    const work = store.piEnergyConfidenceWorkItems?.find(
      (item) => item.id === AUGUST_6_PI_ENERGY_WORK_ID
    );
    assert(work?.status === "pending" && work.attemptCount === 0,
      "pi_energy_work_not_safely_pending");
    const totals = pickTotals(record.payload.daily_totals);
    if (same(totals, AUGUST_6_AUTHORITATIVE_TOTALS)) {
      assert(
        record.payload.metadata?.daily_totals_scope === "full_day_summary" &&
        record.payload.metadata?.daily_totals_source_artifact_refs?.includes(
          AUGUST_6_NUTRITION_SUMMARY_ARTIFACT
        ) &&
        work.sourceCommitLinks?.some((link) =>
          link.canonicalEvidenceId === AUGUST_6_NUTRITION_CANONICAL_ID &&
          link.sourceChangeType === "correction"
        ),
        "repair_incomplete"
      );
      return { state: "already_repaired", record, work, artifact, reconciliation };
    }
    assert(same(totals, INCORRECT_TOTALS), "canonical_totals_changed_since_diagnostic");
    return { state: "eligible", record, work, artifact, reconciliation };
  } catch (error) {
    return { state: "blocked", reason: error.message };
  }
}

function validateCandidate(before, candidate, staged, { finalized, commitId } = {}) {
  const correctedRecord = candidate.canonicalEvidenceObjects.find(
    (item) => item.canonicalId === AUGUST_6_NUTRITION_CANONICAL_ID
  );
  const afterWork = candidate.piEnergyConfidenceWorkItems.find(
    (item) => item.id === AUGUST_6_PI_ENERGY_WORK_ID
  );
  validateMeals(correctedRecord.payload.meals);
  assert(same(pickTotals(correctedRecord.payload.daily_totals),
    AUGUST_6_AUTHORITATIVE_TOTALS), "corrected_totals_invalid");
  assert(digest(staged.beforeRecord.payload.meals) ===
    digest(correctedRecord.payload.meals), "meal_collection_changed");
  assert(digest(staged.beforeRecord.provenance) ===
    digest(correctedRecord.provenance), "canonical_provenance_changed");
  assert(staged.beforeRecord.canonicalId === correctedRecord.canonicalId,
    "canonical_identity_changed");
  assert(afterWork.id === staged.beforeWork.id &&
    afterWork.expectedSourceFingerprint === staged.beforeWork.expectedSourceFingerprint &&
    afterWork.status === staged.beforeWork.status &&
    afterWork.attemptCount === staged.beforeWork.attemptCount,
  "pi_energy_work_identity_changed");
  validateProtectedCollections(before, candidate);
  const newLinks = afterWork.sourceCommitLinks.filter((link) =>
    !(staged.beforeWork.sourceCommitLinks ?? []).some((prior) => same(prior, link))
  );
  assert(newLinks.length === 1 &&
    newLinks[0].canonicalEvidenceId === AUGUST_6_NUTRITION_CANONICAL_ID &&
    newLinks[0].sourceChangeType === "correction" &&
    newLinks[0].linkedCounterpartId === "activity_day|2026-08-06",
  "pi_energy_correction_link_invalid");
  if (finalized) assert(newLinks[0].commitId === commitId,
    "pi_energy_commit_link_not_finalized");
  else assert(newLinks[0].commitId === "pending_source_commit",
    "pi_energy_pending_link_invalid");
}

function validateProtectedCollections(before, candidate) {
  for (const key of Object.keys(before)) {
    if (["revision", "lastCommitId", "updatedAt"].includes(key)) continue;
    if (key === "canonicalEvidenceObjects") {
      assert(digest(before[key].filter((item) => item.canonicalId !== AUGUST_6_NUTRITION_CANONICAL_ID)) ===
        digest(candidate[key].filter((item) => item.canonicalId !== AUGUST_6_NUTRITION_CANONICAL_ID)),
      "unrelated_canonical_record_changed");
      continue;
    }
    if (key === "piEnergyConfidenceWorkItems") {
      assert(digest(before[key].filter((item) => item.id !== AUGUST_6_PI_ENERGY_WORK_ID)) ===
        digest(candidate[key].filter((item) => item.id !== AUGUST_6_PI_ENERGY_WORK_ID)),
      "unrelated_pi_energy_work_changed");
      continue;
    }
    assert(digest(before[key]) === digest(candidate[key]), `protected_state_changed:${key}`);
  }
}

function validateMeals(meals = []) {
  assert(meals.length === EXPECTED_MEALS.length, "meal_collection_changed");
  const actual = meals.map((meal) => [meal.name, meal.totals?.calories,
    meal.totals?.protein_g, meal.totals?.carbs_g, meal.totals?.fat_g]);
  assert(same(actual, EXPECTED_MEALS), "meal_values_changed_since_diagnostic");
}

function validateCommand(command, prepared) {
  assert(command.acceptProductionMutation === true, "production_mutation_not_authorized");
  assert(command.stopOnConflict === true, "stop_on_conflict_required");
  assert(command.expectedFileHash === prepared.baseline.fileHash, "file_hash_mismatch");
  assert(command.expectedSemanticDigest === prepared.baseline.semanticDigest,
    "semantic_digest_mismatch");
  assert(Number(command.expectedRevision) === prepared.baseline.revision,
    "revision_mismatch");
  assert(command.expectedLastCommitId === prepared.baseline.lastCommitId,
    "last_commit_mismatch");
  assert(command.preparationFingerprint === prepared.fingerprint,
    "preparation_fingerprint_mismatch");
}

function assertBaseline(actual, expected) {
  for (const key of ["fileHash", "semanticDigest", "revision", "lastCommitId", "bytes"]) {
    assert(actual[key] === expected[key], `baseline_changed:${key}`);
  }
}

function stampPendingSourceCommit(store, commitId) {
  const work = store.piEnergyConfidenceWorkItems.find(
    (item) => item.id === AUGUST_6_PI_ENERGY_WORK_ID
  );
  work.sourceCommitLinks = work.sourceCommitLinks.map((link) =>
    link.commitId === "pending_source_commit" ? { ...link, commitId } : link
  );
}

function capture(filePath) {
  const bytes = fs.readFileSync(filePath);
  const store = JSON.parse(bytes);
  return {
    store,
    fileHash: `sha256_${createHash("sha256").update(bytes).digest("hex")}`,
    semanticDigest: createFounderRuntimeSemanticDigest(store),
    revision: store.revision ?? 0,
    lastCommitId: store.lastCommitId ?? null,
    bytes: bytes.length,
  };
}

function publicBaseline(value) {
  return { fileHash: value.fileHash, semanticDigest: value.semanticDigest,
    revision: value.revision, lastCommitId: value.lastCommitId, bytes: value.bytes };
}

function semanticCanonicalRecord(record) {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...semantic } = record;
  return semantic;
}

function pickTotals(value = {}) {
  return Object.fromEntries(Object.keys(AUGUST_6_AUTHORITATIVE_TOTALS)
    .map((key) => [key, value[key]]));
}

function hasArtifact(object, artifact) {
  return object?.source?.source_artifact_refs?.includes(artifact) ||
    object?.provenance?.source_artifact_refs?.includes(artifact);
}

function changedPaths(before, after, prefix = "") {
  if (same(before, after)) return [];
  if (!before || !after || typeof before !== "object" || typeof after !== "object") {
    return [prefix || "<root>"];
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    const max = Math.max(before?.length ?? 0, after?.length ?? 0);
    return Array.from({ length: max }, (_, index) => index)
      .flatMap((index) => changedPaths(before?.[index], after?.[index], `${prefix}[${index}]`));
  }
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .flatMap((key) => changedPaths(before[key], after[key], prefix ? `${prefix}.${key}` : key));
}

function digest(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}
function same(first, second) { return stable(first) === stable(second); }
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
function assert(condition, reason) { if (!condition) throw new Error(reason); }
