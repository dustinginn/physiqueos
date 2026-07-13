import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { reprocessEvidencePackagesFromStoredArtifacts } from "../../../../domain/services/EvidenceIngestionRecoveryService";

export const runtime = "nodejs";

export async function POST(request) {
  if (!isEvidenceRepairEnabled()) {
    return NextResponse.json(
      {
        error: "Evidence repair is available only in development or when explicitly enabled.",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const user = await FounderRepositories.users.getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Founder user is not available." },
        { status: 500 }
      );
    }

    const summary = await reprocessEvidencePackagesFromStoredArtifacts({
      evidenceDate: normalizeDateKey(body.evidenceDate),
      force: body.force === true,
      packageId: normalizeOptionalText(body.packageId),
      reason:
        normalizeOptionalText(body.reason) ??
        "Stored evidence was reprocessed with the current Evidence Intake Engine.",
      repositories: FounderRepositories,
      typedEvidenceOnly: body.typedEvidenceOnly === true,
      userId: user.id,
    });

    revalidatePath("/progress");
    revalidatePath("/progress/activity");
    revalidatePath("/progress/training");
    revalidatePath("/progress/nutrition");
    revalidatePath("/progress/photos");
    revalidatePath("/timeline");

    return NextResponse.json({
      ok: true,
      canonicalObjectCounts: summary.canonicalObjectCounts,
      reprocessedPackageCount: summary.reprocessedPackageCount,
      reprocessedPackageIds: summary.reprocessedPackages.map(
        (evidencePackage) => evidencePackage.package_id
      ),
      targetPackageCount: summary.targetPackageCount,
    });
  } catch (error) {
    console.warn("[EvidenceReprocess] Stored artifact reprocess failed.", {
      error: error?.message,
      stack: error?.stack,
    });

    return NextResponse.json(
      { error: "Stored evidence could not be reprocessed." },
      { status: 500 }
    );
  }
}

function isEvidenceRepairEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.PHYSIQUEOS_ENABLE_EVIDENCE_REPAIR === "1"
  );
}

function normalizeDateKey(value) {
  const text = String(value ?? "").trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeOptionalText(value) {
  const text = String(value ?? "").trim();

  return text.length > 0 ? text : null;
}
