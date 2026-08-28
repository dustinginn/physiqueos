import path from "node:path";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAuthenticationPrincipal } from "../../../../application/auth/principal.js";
import { getProductionApplicationComposition } from "../../../../application/composition/productionApplicationComposition.js";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { parsePrivateMediaReference } from "../../../../contracts/v1/mediaIdentifiers.js";
import {
  assertApplicationUploadEntryAllowed,
  storeApplicationUpload,
} from "../../../../application/media/ApplicationUploadService";
import {
  createStoredEvidenceArtifactDescriptor,
  processEvidenceIntakeSubmission,
  reinterpretEvidenceIntakeSubmissionFromStoredArtifacts,
} from "../../../../domain/services/EvidenceIntakeService";
import { createEvidenceReviewService } from "../../../../domain/services/EvidenceReviewService";
import {
  buildTrainingLoggerEvidencePackage,
  createProductionAppleHealthReconciliation,
} from "../../../../domain/services/TrainingLoggerAppleHealthService";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    assertApplicationUploadEntryAllowed({ operation: "training-reconciliation:create" });
    const formData = await request.formData();
    const draft = parseJson(formData.get("draftJson"), "Training Logger draft");
    assertDraftForReconciliation(draft);
    const files = formData.getAll("evidenceFiles")
      .filter((file) => typeof file?.arrayBuffer === "function" && file.size > 0);
    const user = await FounderRepositories.users.getCurrentUser();
    const canonicalObjects = await FounderRepositories.canonicalEvidence
      .listCanonicalEvidenceObjects(user.id);
    let evidencePackage = null;

    if (formData.get("reprocessExisting") === "1") {
      const packageId = String(formData.get("evidencePackageId") ?? "");
      const persistedPackage = packageId
        ? await FounderRepositories.evidencePackages.getEvidencePackageById(packageId)
        : null;
      if (!persistedPackage || persistedPackage.userId !== user.id) {
        throw new Error("Apple Health evidence is unavailable.");
      }
      const intake = await reinterpretEvidenceIntakeSubmissionFromStoredArtifacts({
        evidencePackage: persistedPackage,
        expectedEvidenceType: "training",
        loadArtifact: createTrainingLoggerStoredArtifactLoader({ userId: user.id }),
        userId: user.id,
      });
      evidencePackage = intake.evidencePackage;
      await FounderRepositories.evidencePackages.saveEvidencePackage(evidencePackage);
    }

    if (!evidencePackage && files.length > 0) {
      const intake = await processEvidenceIntakeSubmission({
        artifactStorageFailureMode: "preserve-recoverable-package",
        evidenceDate: draft.workoutDate,
        expectedEvidenceType: "training",
        files,
        typedEvidence: null,
        userId: user.id,
        storeArtifact: createTrainingLoggerArtifactStore({ userId: user.id }),
      });
      evidencePackage = intake.evidencePackage;
      await FounderRepositories.evidencePackages.saveEvidencePackage(evidencePackage);
      if (evidencePackage.quality?.status === "failed") {
        return NextResponse.json({
          error: "The screenshots were preserved, but their workout details could not be interpreted. Try again or continue without Apple Health evidence.",
          evidencePackageId: evidencePackage.package_id,
        }, { status: 422 });
      }
    }

    const reconciliation = createProductionAppleHealthReconciliation({
      batchId: evidencePackage?.package_id ?? `training_logger_batch_${draft.draftId}`,
      canonicalObjects,
      evidenceObjects: evidencePackage?.evidence_objects ?? [],
      workoutDate: draft.workoutDate,
    });
    return NextResponse.json({
      evidencePackageId: evidencePackage?.package_id ?? null,
      reconciliation,
    });
  } catch (error) {
    console.warn("[TrainingLogger] Reconciliation preparation failed.", {
      code: error?.code ?? "TRAINING_LOGGER_RECONCILIATION_FAILED",
      message: error?.message,
    });
    return NextResponse.json({
      error: error?.message ?? "Training Logger evidence could not be prepared.",
    }, { status: error?.status ?? 400 });
  }
}

export async function PUT(request) {
  try {
    assertApplicationUploadEntryAllowed({ operation: "training-reconciliation:update" });
    const requested = await request.json();
    const draft = requested?.draft;
    assertDraftForReview(draft);
    const user = await FounderRepositories.users.getCurrentUser();
    const sourcePackage = requested.evidencePackageId
      ? await FounderRepositories.evidencePackages.getEvidencePackageById(
          String(requested.evidencePackageId)
        )
      : null;
    if (sourcePackage && sourcePackage.userId !== user.id) {
      throw new Error("Apple Health evidence is unavailable.");
    }
    const existingReviews = await FounderRepositories.evidenceReviews.listReviews(user.id);
    const packageId = `training_logger_submission_${cleanId(draft.draftId)}`;
    const existing = existingReviews.find((review) =>
      review.interpretedEvidence?.package_id === packageId && review.status !== "discarded"
    );
    if (existing) {
      return NextResponse.json({
        reviewId: existing.id,
        reviewUrl: `/evidence/review/${existing.id}`,
        reused: true,
      });
    }
    const canonicalObjects = await FounderRepositories.canonicalEvidence
      .listCanonicalEvidenceObjects(user.id);
    const evidencePackage = buildTrainingLoggerEvidencePackage({
      canonicalObjects,
      draft,
      sourcePackage,
      userId: user.id,
    });
    await FounderRepositories.evidencePackages.saveEvidencePackage(evidencePackage);
    const review = await createEvidenceReviewService({ repositories: FounderRepositories }).stage({
      userId: user.id,
      evidencePackage,
      source: "training_logger",
    });
    return NextResponse.json({
      reviewId: review.id,
      reviewUrl: `/evidence/review/${review.id}`,
    });
  } catch (error) {
    console.warn("[TrainingLogger] Evidence Review staging failed.", {
      code: error?.code ?? "TRAINING_LOGGER_REVIEW_FAILED",
      message: error?.message,
    });
    return NextResponse.json({
      code: error?.code ?? null,
      error: error?.message ?? "Training Logger Evidence Review could not be prepared.",
    }, { status: error?.status ?? (error?.code === "APPLE_WORKOUT_ALREADY_CONSUMED" ? 409 : 400) });
  }
}

function createTrainingLoggerStoredArtifactLoader({ userId, fetchImpl = fetch }) {
  return async ({ artifact }) => {
    if (process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1") {
      throw new Error("Stored provider evidence reinterpretation requires provider full runtime.");
    }
    const objectId = parsePrivateMediaReference(artifact.storage_path);
    if (!objectId) throw new Error("Stored Apple Health evidence has an invalid private media reference.");
    const composition = await getProductionApplicationComposition();
    const principal = createAuthenticationPrincipal({
      userId,
      deviceId: "training-logger-reinterpretation",
      sessionId: "training-logger-reinterpretation",
      scopes: ["media:read"],
      authenticationMethod: "founder-session",
      transport: "server-only",
    });
    const descriptor = await composition.media.authorizeRead({ principal, objectId });
    const access = await composition.mediaGateway.redeemRead({
      accessHandle: descriptor.accessHandle,
      principal,
    });
    const response = await fetchImpl(access.url, { cache: "no-store", redirect: "error" });
    if (!response.ok) throw new Error("Stored Apple Health evidence is unavailable.");
    const buffer = Buffer.from(await response.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    if (buffer.length !== descriptor.size || sha256 !== descriptor.sha256) {
      throw new Error("Stored Apple Health evidence failed integrity verification.");
    }
    if (artifact.mime_type && descriptor.contentType !== artifact.mime_type) {
      throw new Error("Stored Apple Health evidence content type does not match.");
    }
    return { buffer, contentType: descriptor.contentType };
  };
}

function createTrainingLoggerArtifactStore({ userId }) {
  return async ({ capturedAt, observedDate, file, index, submissionId }) => {
    const buffer = Buffer.from(await file.arrayBuffer());
    const artifactId = `artifact_${submissionId}_${index + 1}`;
    const stored = await storeApplicationUpload({
      ownerUserId: userId,
      bytes: buffer,
      contentType: file.type || "application/octet-stream",
      originalFilename: file.name || `apple-health-${index + 1}.bin`,
      legacyDirectory: path.join("private", "founder", "evidence", "uploads"),
      legacyPrefix: `${submissionId}-${index + 1}`,
      category: "evidencePackages",
      relationshipId: submissionId,
      artifactId,
    });
    return createStoredEvidenceArtifactDescriptor({
      artifactId,
      buffer,
      capturedAt,
      file,
      id: artifactId,
      observedDate,
      relativePath: stored.reference,
      safeName: file.name || `apple-health-${index + 1}.bin`,
    });
  };
}

function assertDraftForReconciliation(draft) {
  if (!draft?.draftId || !/^\d{4}-\d{2}-\d{2}$/.test(String(draft.workoutDate))) {
    throw new Error("A valid Training Logger draft and workout date are required.");
  }
  if (!["live", "retrospective"].includes(draft.mode)) {
    throw new Error("Choose Start Workout or Log Past Workout before continuing.");
  }
  if (!Array.isArray(draft.exercises) || draft.exercises.length === 0) {
    throw new Error("Add at least one exercise before finishing the workout.");
  }
  if (draft.exercises.some((exercise) =>
    !Array.isArray(exercise.sets) ||
    exercise.sets.length === 0 ||
    exercise.sets.some((set) =>
      !Number.isFinite(Number(set.reps)) ||
      Number(set.reps) <= 0 ||
      !Number.isFinite(Number(set.load)) ||
      Number(set.load) < 0
    )
  )) {
    throw new Error("Every exercise needs at least one performed set with valid reps and load.");
  }
}

function assertDraftForReview(draft) {
  assertDraftForReconciliation(draft);
  const reconciliation = draft.reconciliation;
  if (!reconciliation?.finalized) {
    throw new Error("Finish Apple Health reconciliation before Evidence Review.");
  }
  if (
    reconciliation.matchState === "no_match" &&
    !reconciliation.continueWithoutStrength
  ) {
    throw new Error("Choose to continue without a strength match.");
  }
  if (
    reconciliation.matchState !== "no_match" &&
    !reconciliation.strengthCandidateIds?.includes(reconciliation.selectedStrengthSourceId)
  ) {
    throw new Error("Choose an eligible unlinked strength workout.");
  }
}

function parseJson(value, label) {
  try {
    return JSON.parse(String(value ?? ""));
  } catch {
    throw new Error(`${label} is invalid.`);
  }
}

function cleanId(value) {
  return String(value ?? "draft").replace(/[^a-z0-9_-]+/gi, "_");
}
