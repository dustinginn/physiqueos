"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createDEXAScan } from "../../../domain/models/dexaScan";
import { createAnalysisFromEvidence } from "../../../domain/services/AnalysisService";
import { createDailyBriefingService } from "../../../domain/services/DailyBriefingService";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { createEvidenceReviewService } from "../../../domain/services/EvidenceReviewService";

const BODY_FAT_GOAL_ID = "goal_maintain_8_9_body_fat";
const LEAN_MASS_GOAL_ID = "goal_preserve_lean_mass";
const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";

export async function saveDEXAEvidence(formData) {
  const user = await FounderRepositories.users.getCurrentUser();

  if (!user) throw new Error("Founder user is not available.");
  if (formData.get("confirmed") !== "on") {
    throw new Error("DEXA values must be confirmed before saving.");
  }

  const file = formData.get("dexaPdf");

  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) {
    throw new Error("DEXA PDF is required.");
  }

  const measuredAt =
    normalizeOptionalText(formData.get("measuredAt")) ??
    inferDateFromFilename(file.name) ??
    getTodayKey();
  const createdAt = new Date().toISOString();
  const rawReportPath = await storePrivateUpload({
    directory: path.join("private", "founder", "dexa", "uploads"),
    file,
    prefix: `dexa-${measuredAt}`,
  });
  const existingScans = await FounderRepositories.dexaScans.listDEXAScans(user.id);
  const review = await createEvidenceReviewService({ repositories: FounderRepositories }).stage({
    userId: user.id,
    source: "dedicated_dexa",
    evidencePackage: {
      package_id: `dexa_review_${createdAt.replace(/\D/g, "")}`,
      review_metadata: { duplicateCandidate: existingScans.some((item) => item.measuredAt === measuredAt) },
      evidence_objects: [{
        id: `dexa_${measuredAt}`,
        evidence_type: "dexa_scan",
        observed_at: measuredAt,
        source_file: rawReportPath,
        parser_confidence: "user_entered",
        metadata: {
          totalMass: normalizeOptionalNumber(formData.get("totalMass")),
          bodyFatPercentage: normalizeOptionalNumber(formData.get("bodyFatPercentage")),
          fatMass: normalizeOptionalNumber(formData.get("fatMass")),
          leanMass: normalizeOptionalNumber(formData.get("leanMass")),
          boneMineralContent: normalizeOptionalNumber(formData.get("boneMineralContent")),
          restingMetabolicRate: normalizeOptionalNumber(formData.get("restingMetabolicRate")),
          vatMass: normalizeOptionalNumber(formData.get("vatMass")),
          vatVolume: normalizeOptionalNumber(formData.get("vatVolume")),
        },
      }],
    },
  });
  redirect(`/evidence/review/${review.id}`);

  /* Legacy confirmed-commit path retained temporarily below for extraction into the shared committer. */
  const scan = createDEXAScan({
    id: `dexa_${measuredAt.replaceAll("-", "_")}_${Date.now()}`,
    userId: user.id,
    measuredAt,
    relatedGoalIds: [BODY_FAT_GOAL_ID, LEAN_MASS_GOAL_ID, VISIBLE_ABS_GOAL_ID],
    provider: "BodySpec",
    totalMass: {
      value: normalizeOptionalNumber(formData.get("totalMass")),
      unit: "lb",
    },
    bodyFatPercentage: normalizeOptionalNumber(formData.get("bodyFatPercentage")),
    fatMass: {
      value: normalizeOptionalNumber(formData.get("fatMass")),
      unit: "lb",
    },
    leanMass: {
      value: normalizeOptionalNumber(formData.get("leanMass")),
      unit: "lb",
    },
    boneMineralContent: {
      value: normalizeOptionalNumber(formData.get("boneMineralContent")),
      unit: "lb",
    },
    restingMetabolicRate: {
      value: normalizeOptionalNumber(formData.get("restingMetabolicRate")),
      unit: "kcal/day",
    },
    visceralAdiposeTissue: {
      mass: {
        value: normalizeOptionalNumber(formData.get("vatMass")),
        unit: "lb",
      },
      volume: {
        value: normalizeOptionalNumber(formData.get("vatVolume")),
        unit: "in3",
      },
    },
    sourceFileId: rawReportPath,
    rawReportPath,
    source: {
      type: "dexa",
      name: "BodySpec",
      externalId: null,
      importedAt: createdAt,
      confidence: "high",
      notes: "Founder-confirmed DEXA PDF upload. Unknown measurements remain null.",
    },
    fieldProvenance: {
      imported: ["rawReportPath"],
      computed: [],
      confirmed: [
        "measuredAt",
        "totalMass",
        "bodyFatPercentage",
        "fatMass",
        "leanMass",
        "boneMineralContent",
        "restingMetabolicRate",
        "visceralAdiposeTissue",
      ],
    },
    createdAt,
    updatedAt: createdAt,
  });

  await FounderRepositories.dexaScans.addDEXAScan(scan);
  const analysis = createAnalysisFromEvidence({
    id: scan.id,
    type: "dexa",
    createdAt,
    analysisId: `analysis_dexa_${createdAt.replace(/\D/g, "")}`,
    confidenceBefore: 0.72,
    confidenceAfter: 0.8,
  });

  await FounderRepositories.analyses.createAnalysis(analysis);
  await createDailyBriefingService({
    repositories: FounderRepositories,
  }).generateEventBriefing({
    userId: user.id,
    trigger: {
      evidenceId: scan.id,
      evidenceType: "dexa",
      analysisId: analysis.id,
    },
  });

  revalidatePath("/");
  revalidatePath("/briefing/daily");
  revalidatePath("/progress");
  revalidatePath("/progress/dexa");
  revalidatePath("/timeline");
  redirect("/briefing/daily");
}

async function storePrivateUpload({ directory, file, prefix }) {
  const extension = path.extname(file.name || "").toLowerCase() || ".pdf";
  const safeName = `${sanitizeFileName(prefix)}-${Date.now()}${extension}`;
  const relativePath = path.join(directory, safeName);
  const absolutePath = path.join(process.cwd(), relativePath);
  const buffer = Buffer.from(await file.arrayBuffer());

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  return relativePath.replaceAll("\\", "/");
}

function normalizeOptionalText(value) {
  const text = String(value ?? "").trim();

  return text.length > 0 ? text : null;
}

function normalizeOptionalNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const number = Number(text);

  return Number.isFinite(number) ? number : null;
}

function inferDateFromFilename(fileName = "") {
  return fileName.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeFileName(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}
