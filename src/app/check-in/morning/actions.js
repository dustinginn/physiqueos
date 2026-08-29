"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import {
  getLocalDateKey,
  resolveLocalTimeZone,
} from "../../../domain/utils/localDate";
import { loadApplicationRuntimeBindings } from "../../../application/runtime/ApplicationCanonicalRuntime";
import { createRecoveryCheckInIngestionService } from "../../../domain/services/RecoveryCheckInIngestionService";
import { createMorningCheckInPersistenceService } from "../../../domain/services/MorningCheckInPersistenceService";
import {
  parseMorningPriorityReconciliationFormData,
  createMorningPriorityReconciliationService,
} from "../../../domain/services/MorningPriorityReconciliationService";
import {
  createFounderMorningBriefingFinalizationService,
} from "../../../domain/services/MorningBriefingFinalizationService";

export async function finalizeMorningBriefingReconciliation() {
  const user = await FounderRepositories.users.getCurrentUser();
  if (!user) throw new Error("Founder user is not available.");
  const now = new Date();
  const timeZone = resolveLocalTimeZone(user.timeZone ?? user.timezone);
  const result = await createFounderMorningBriefingFinalizationService({
    repositories: FounderRepositories,
    now: () => now,
  }).finalize({ userId: user.id, timeZone, at: now });
  if (result.status === "waiting") {
    redirect("/check-in/morning?briefingUpdate=waiting");
  }
  revalidatePath("/");
  revalidatePath("/check-in/morning");
  revalidatePath("/briefings/weekly");
  revalidatePath("/briefings/review");
  redirect(result.status === "failed"
    ? "/check-in/morning?briefingUpdate=failed"
    : "/briefings/weekly?briefingUpdate=current");
}

export async function saveStructuredRecoveryCheckIn(formData) {
  const user = await FounderRepositories.users.getCurrentUser();
  if (!user) throw new Error("Founder user is not available.");
  const now = new Date();
  const bindings = await loadApplicationRuntimeBindings();
  const service = createRecoveryCheckInIngestionService({
    unitOfWork: bindings.createUnitOfWork({
      filePath: bindings.runtimeStorePath,
      liveStore: bindings.liveStore,
      binding: {
        storeIdentity: "founder_runtime_store",
        storeKind: "production",
        isolated: false,
        productionAllowed: true,
      },
    }),
  });
  const timeZone = resolveLocalTimeZone(user.timeZone ?? user.timezone);
  await service.save({
    userId: user.id,
    date: getLocalDateKey(now, timeZone),
    recordedAt: now.toISOString(),
    timezone: timeZone,
    sleepDuration: normalizeOptionalNumber(formData.get("sleepDuration")),
    subjectiveRecovery:
      normalizeOptionalText(formData.get("subjectiveRecovery")) || null,
    soreness: normalizeOptionalText(formData.get("soreness")) || null,
  });
  revalidatePath("/");
  revalidatePath("/check-in/morning");
  redirect("/check-in/morning?recovery=saved");
}

export async function saveMorningCheckIn(formData) {
  const user = await FounderRepositories.users.getCurrentUser();

  if (!user) {
    throw new Error("Founder user is not available.");
  }

  const rawWeight = String(formData.get("weight") ?? "").trim();
  const parsedWeight = Number(rawWeight);

  if (!rawWeight || !Number.isFinite(parsedWeight)) {
    throw new Error("Enter a valid morning weight.");
  }
  const weightValue = Math.round(parsedWeight * 10) / 10;
  if (weightValue < 50 || weightValue > 1000) throw new Error("Morning weight must be between 50 and 1,000 lb.");

  const now = new Date();
  const timeZone = resolveLocalTimeZone(user.timeZone ?? user.timezone);
  const today = getLocalDateKey(now, timeZone);
  const createdAt = now.toISOString();
  const notes = normalizeOptionalText(formData.get("notes"));
  const protocolChangeNote = normalizeOptionalText(formData.get("protocolChanges"));
  const estimatedCalories = normalizeOptionalNumber(formData.get("estimatedCalories"));
  const estimatedCaloriesBurned = normalizeOptionalNumber(
    formData.get("estimatedCaloriesBurned")
  );
  const proteinTarget = normalizeOptionalNumber(formData.get("proteinTarget"));
  const proteinAchieved = normalizeOptionalNumber(formData.get("proteinAchieved"));
  const weighInContext = resolveWeighInContext(
    formData,
    user.preferences?.defaultWeighInContext
  );
  const bindings = await loadApplicationRuntimeBindings();
  const service = createMorningCheckInPersistenceService({
    ...bindings,
    now: () => now,
  });
  const result = await service.save({
    user,
    weightValue,
    today,
    createdAt,
    at: now,
    timeZone,
    notes,
    protocolChangeNote,
    estimatedCalories,
    estimatedCaloriesBurned,
    proteinTarget,
    proteinAchieved,
    weighInContext,
    reconciliationSubmissions:
      parseMorningPriorityReconciliationFormData(formData),
  });

  if (result.status === "unchanged") {
    redirect("/?weight=unchanged");
  }
  revalidatePath("/");
  revalidatePath("/progress");
  revalidatePath("/progress/weight");
  revalidatePath(`/analysis/${result.analysisId}`);
  redirect("/?weight=saved");
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

function resolveWeighInContext(formData, defaultContext = {}) {
  const baseContext = {
    timing: defaultContext?.timing ?? "morning",
    nutritionState: defaultContext?.nutritionState ?? "fasted",
    intakeState: defaultContext?.intakeState ?? "before_food_water",
    scale: defaultContext?.scale ?? "normal_home_scale",
    confidence: defaultContext?.confidence ?? "high",
  };
  const hasOverride = formData.get("contextOverride") === "on";

  if (!hasOverride) {
    return {
      ...baseContext,
      conditions: [],
      notes: null,
      isDefault: true,
    };
  }

  return {
    timing: String(formData.get("weighInTiming") || baseContext.timing),
    nutritionState: String(formData.get("nutritionState") || baseContext.nutritionState),
    intakeState: String(formData.get("intakeState") || baseContext.intakeState),
    scale: String(formData.get("scaleContext") || baseContext.scale),
    conditions: formData.getAll("conditions").map(String),
    confidence: "context_adjusted",
    notes: normalizeOptionalText(formData.get("contextNotes")),
    isDefault: false,
  };
}
