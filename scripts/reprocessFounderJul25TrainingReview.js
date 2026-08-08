import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseOperationalJsonBytes } from "./lib/operationalJson.mjs";
import { FounderRepositories } from "../src/data/repositories/FounderRepositories.js";
import { parseStrengthTrainingText } from "../src/domain/models/trainingSessionEvidence.js";
import {
  createPendingEvidenceReviewReprocessingService,
  PENDING_REVIEW_REPROCESS_VERSION,
} from "../src/domain/services/PendingEvidenceReviewReprocessingService.js";
import { JUL_25_STRENGTH_NOTE } from "../src/fixtures/jul25TrainingEvidenceFixture.js";

const REVIEW_ID = "evidence_review_20260726021515848";
const PACKAGE_ID = "evidence_submission_20260726021441961_images";
const RUNTIME_PATH = path.resolve(process.cwd(), "private", "founder", "runtime-store.json");
const apply = process.argv.includes("--apply");

const beforeBytes = fs.readFileSync(RUNTIME_PATH);
const before = parseOperationalJsonBytes(beforeBytes,
  { filePath: RUNTIME_PATH, stage: "training_review_reprocessing_source" });
const review = before.evidenceReviews?.find((item) => item.id === REVIEW_ID);
const evidencePackage = before.evidencePackages?.find((item) => item.package_id === PACKAGE_ID);
assert(review, "The characterized pending review was not found.");
assert(evidencePackage, "The characterized retained evidence package was not found.");
assert(review.status === "pending", "The characterized review is no longer pending.");
assert(review.interpretedEvidence?.package_id === PACKAGE_ID, "The review/package link changed.");
assert(!review.confirmation && !review.executedAt && !review.execution, "The review has begun confirmation or execution.");
assert(!Object.values(review.commitProgress ?? {}).some((step) => step?.status === "completed"), "A canonical commit step already completed.");
assert(
  !JSON.stringify(before.canonicalEvidenceObjects ?? []).includes(PACKAGE_ID),
  "Canonical evidence already references this retained package."
);
const typedArtifact = evidencePackage.provenance?.source_artifacts?.find(
  (artifact) => artifact.kind === "typed_evidence"
);
assert(normalize(typedArtifact?.text) === normalize(JUL_25_STRENGTH_NOTE), "The retained typed evidence differs from the reviewed fixture.");
const parsedExercises = parseStrengthTrainingText(typedArtifact.text);
assert(parsedExercises.length === 5, "The corrected interpretation must contain five exercises.");
assert(parsedExercises.flatMap((exercise) => exercise.sets).length === 20, "The corrected interpretation must contain twenty sets.");

const preflight = {
  mode: apply ? "apply" : "dry_run",
  reviewId: REVIEW_ID,
  packageId: PACKAGE_ID,
  status: review.status,
  runtimeRevision: before.revision ?? null,
  runtimeHash: sha(beforeBytes),
  reprocessVersion: PENDING_REVIEW_REPROCESS_VERSION,
  exerciseCount: parsedExercises.length,
  setCount: parsedExercises.flatMap((exercise) => exercise.sets).length,
  sourceArtifactFingerprint: sha(stableJson(evidencePackage.provenance?.source_artifacts ?? [])),
};

if (!apply) {
  console.log(JSON.stringify({ preflight, changed: false }, null, 2));
  process.exit(0);
}

const service = createPendingEvidenceReviewReprocessingService({
  repositories: FounderRepositories,
  reinterpret: async ({ evidencePackage: retainedPackage, review: currentReview }) => ({
    ...structuredClone(currentReview.interpretedEvidence),
    package_id: retainedPackage.package_id,
    provenance: structuredClone(retainedPackage.provenance),
    quality: { ...(currentReview.interpretedEvidence?.quality ?? {}), status: "complete" },
    evidence_objects: currentReview.interpretedEvidence.evidence_objects.map((object) =>
      object.metadata?.activity_type === "Traditional Strength Training"
        ? { ...structuredClone(object), exercises: parsedExercises }
        : structuredClone(object)
    ),
  }),
});

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run() {
  const result = await service.reprocessPendingReviewInPlace(REVIEW_ID);
  const afterBytes = fs.readFileSync(RUNTIME_PATH);
  const after = parseOperationalJsonBytes(afterBytes,
    { filePath: RUNTIME_PATH, stage: "training_review_reprocessing_post_commit" });
  const updated = after.evidenceReviews.find((item) => item.id === REVIEW_ID);
  const updatedPackage = after.evidencePackages.find((item) => item.package_id === PACKAGE_ID);
  const updatedStrength = updated.interpretedEvidence.evidence_objects.find(
    (object) => object.metadata?.activity_type === "Traditional Strength Training"
  );
  assert(updated.status === "pending", "The reprocessed review did not remain pending.");
  assert(updated.interpretedEvidence.package_id === PACKAGE_ID, "The reprocessed review/package link changed.");
  assert(updatedStrength.exercises.length === 5, "The persisted candidate does not contain five exercises.");
  assert(updatedStrength.exercises.flatMap((exercise) => exercise.sets).length === 20, "The persisted candidate does not contain twenty sets.");
  assert(stableJson(updatedPackage) === stableJson(evidencePackage), "The retained evidence package changed.");

  console.log(JSON.stringify({
    preflight,
    outcome: {
      changed: result.changed,
      idempotent: result.idempotent,
      status: updated.status,
      reprocessing: updated.reprocessing,
      exerciseCount: updatedStrength.exercises.length,
      setCount: updatedStrength.exercises.flatMap((exercise) => exercise.sets).length,
    },
    runtime: {
      beforeHash: sha(beforeBytes),
      afterHash: sha(afterBytes),
      beforeRevision: before.revision ?? null,
      afterRevision: after.revision ?? null,
    },
  }, null, 2));
}

function normalize(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function sha(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
