"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createTrainingSessionCorrectionEvidencePackage } from "../../../../../domain/services/EvidenceCorrectionService";
import { loadApplicationRuntimeBindings } from "../../../../../application/runtime/ApplicationCanonicalRuntime";
import {
  createCanonicalEvidenceConfirmationCommitService,
} from "../../../../../domain/services/CanonicalEvidenceConfirmationCommitService";
import {
  normalizeTrainingContextId,
  resolveTrainingReturnPath,
} from "../../../../../navigation/trainingTimelineNavigation";

export async function addTrainingSessionCorrection(formData) {
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const correctionText = String(formData.get("correctionText") ?? "").trim();
  const contextId = normalizeTrainingContextId(
    String(formData.get("context") ?? "")
  );
  const returnTo = resolveTrainingReturnPath({
    contextId,
    returnTo: String(formData.get("returnTo") ?? ""),
  });
  const sessionPath = `/progress/training/session/${encodeURIComponent(sessionId)}`;
  const sessionTarget = (status) => {
    const params = new URLSearchParams({
      context: contextId,
      correction: status,
      returnTo,
    });
    return `${sessionPath}?${params.toString()}`;
  };

  if (!sessionId) redirect("/progress/training?correction=missing-session");
  if (!correctionText) redirect(sessionTarget("missing-details"));

  let redirectTarget = sessionTarget("saved");

  try {
    const user = await FounderRepositories.users.getCurrentUser();

    if (!user) throw new Error("Founder user is not available.");

    const existingCanonicalObjects =
      await FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects(user.id);
    const targetCanonicalObject = existingCanonicalObjects.find(
      (object) =>
        object?.quality?.status !== "superseded" &&
        object?.payload?.evidence_type === "training" &&
        (object.payload.id === sessionId || object.canonicalId === sessionId)
    );

    if (!targetCanonicalObject) {
      redirectTarget = sessionTarget("session-not-found");
    } else {
      const confirmedAt = new Date().toISOString();
      const correctionPackage = createTrainingSessionCorrectionEvidencePackage({
        author: user.id,
        capturedAt: confirmedAt,
        correctionText,
        targetCanonicalObject,
        userId: user.id,
      });
      const evidencePackage = {
        ...correctionPackage,
        review_metadata: {
          confirmedAt,
          confirmationSource: "training_session_correction",
        },
      };
      const result = await createCanonicalEvidenceConfirmationCommitService({
        ...(await loadApplicationRuntimeBindings()),
        enableEnergyConfidenceEnqueue: false,
      }).commitConfirmedEvidencePackage(evidencePackage, user.id);
      if (result.committed !== true && result.outcome !== "source_matched") {
        throw new Error(`Training correction commit failed: ${result.outcome}`);
      }

      revalidatePath("/briefings/weekly");
      revalidatePath("/briefings/review");
      revalidatePath("/check-in/morning");

      revalidatePath("/progress/training");
      revalidatePath("/progress/training/library");
      revalidatePath("/progress/training/reporting/resistance");
      revalidatePath("/progress/training/reporting/history");
      revalidatePath(sessionPath);
      revalidatePath("/timeline");
    }
  } catch (error) {
    console.warn("[TrainingCorrection] Failed to save workout correction.", {
      error: error?.message,
      sessionId,
      stack: error?.stack,
    });

    redirect(sessionTarget("failed"));
  }

  redirect(redirectTarget);
}
