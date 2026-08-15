"use server";

import path from "node:path";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { assertApplicationUploadEntryAllowed, storeApplicationUpload } from "../../../application/media/ApplicationUploadService";
import { createEvidenceReviewService } from "../../../domain/services/EvidenceReviewService";
import {
  createDexaPdfReviewPackage,
  validateDexaPdfUpload,
} from "../../../domain/services/DexaPdfIntakeService";

export async function saveDEXAEvidence(formData) {
  try {
    assertApplicationUploadEntryAllowed({ operation: "dexa-upload" });
  } catch (error) {
    if (error?.code === "CANONICAL_WRITES_PAUSED") redirect("/evidence/dexa?error=writes-paused");
    throw error;
  }
  const user = await FounderRepositories.users.getCurrentUser();

  if (!user) throw new Error("Founder user is not available.");

  const file = formData.get("dexaPdf");

  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) {
    redirect("/evidence/dexa?error=missing-pdf");
  }

  const createdAt = new Date().toISOString();
  const submissionId = `dexa_submission_${createdAt.replace(/\D/g, "")}`;
  let bytes;
  try {
    bytes = validateDexaPdfUpload({
      bytes: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      mimeType: file.type,
    });
  } catch (error) {
    if (error?.code === "DEXA_PDF_TOO_LARGE") redirect("/evidence/dexa?error=pdf-too-large");
    if (error?.code === "DEXA_PDF_INVALID") redirect("/evidence/dexa?error=invalid-pdf");
    redirect("/evidence/dexa?error=missing-pdf");
  }
  const rawReportPath = (await storeApplicationUpload({
    ownerUserId: user.id,
    bytes,
    contentType: "application/pdf",
    originalFilename: file.name,
    legacyDirectory: path.join("private", "founder", "dexa", "uploads"),
    legacyPrefix: submissionId,
    category: "dexaScans",
    relationshipId: submissionId,
    artifactId: submissionId,
  })).reference;
  const existingScans = await FounderRepositories.dexaScans.listDEXAScans(user.id);
  const evidencePackage = await createDexaPdfReviewPackage({
    bytes,
    capturedAt: createdAt,
    existingScans,
    originalFileName: file.name,
    sourcePath: rawReportPath,
    submissionId,
    userId: user.id,
  });
  const review = await createEvidenceReviewService({ repositories: FounderRepositories }).stage({
    userId: user.id,
    source: "dedicated_dexa",
    evidencePackage,
  });
  redirect(`/evidence/review/${review.id}`);
}
