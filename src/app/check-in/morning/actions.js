"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createDailyCheckIn } from "../../../domain/models/dailyCheckIn";
import { createWeightEntry } from "../../../domain/models/weightEntry";
import { createAnalysisFromEvidence } from "../../../domain/services/AnalysisService";
import { createDailyBriefingService } from "../../../domain/services/DailyBriefingService";
import { extractManualNoteEvidence } from "../../../domain/services/DailyEventService";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";

const BODY_FAT_GOAL_ID = "goal_maintain_8_9_body_fat";
const LEAN_MASS_GOAL_ID = "goal_preserve_lean_mass";
const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";

export async function saveMorningCheckIn(formData) {
  const user = await FounderRepositories.users.getCurrentUser();

  if (!user) {
    throw new Error("Founder user is not available.");
  }

  const weightValue = Number(formData.get("weight"));

  if (!Number.isFinite(weightValue) || weightValue <= 0) {
    throw new Error("Morning weight is required.");
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const createdAt = now.toISOString();
  const notes = normalizeOptionalText(formData.get("notes"));
  const noteEvidence = extractManualNoteEvidence(notes);
  const protocolChangeNote = normalizeOptionalText(formData.get("protocolChanges"));
  const estimatedCalories = normalizeOptionalNumber(formData.get("estimatedCalories"));
  const estimatedCaloriesBurned = normalizeOptionalNumber(
    formData.get("estimatedCaloriesBurned")
  );
  const proteinTarget = normalizeOptionalNumber(formData.get("proteinTarget"));
  const proteinAchieved = normalizeOptionalNumber(formData.get("proteinAchieved"));
  const previousWeight = await FounderRepositories.weights.getLatestWeightEntry(user.id);
  const weighInContext = resolveWeighInContext(
    formData,
    user.preferences?.defaultWeighInContext
  );
  const contextAdjusted = !weighInContext.isDefault;
  const evidenceConfidence = contextAdjusted ? "medium" : "high";
  const confidenceAfter = getConfidenceAfter({
    hasPreviousWeight: Boolean(previousWeight),
    contextAdjusted,
  });
  await saveReconciliationEvidence({ formData, userId: user.id });

  const weightEntry = createWeightEntry({
    id: `weight_${today.replaceAll("-", "_")}`,
    userId: user.id,
    measuredAt: today,
    weight: {
      value: weightValue,
      unit: user.preferences?.weightUnit ?? "lb",
    },
    relatedGoalIds: [BODY_FAT_GOAL_ID, VISIBLE_ABS_GOAL_ID],
    source: {
      type: "manual",
      name: "Morning Check-In",
      externalId: null,
      importedAt: null,
      confidence: evidenceConfidence,
      notes: contextAdjusted
        ? "Manual weight recorded under different conditions; still overrides imported weight for the same day."
        : "Manual morning weight overrides imported weight for the same day.",
    },
    fieldProvenance: {
      imported: [
        "measuredAt",
        "weight.value",
        "weight.unit",
        "relatedGoalIds",
        "context",
        "notes",
      ],
      computed: [],
    },
    reliability: evidenceConfidence,
    context: weighInContext,
    notes,
    createdAt,
    updatedAt: createdAt,
  });

  await FounderRepositories.weights.addWeightEntry(weightEntry);

  const existingTodayCheckIn =
    await FounderRepositories.dailyCheckIns.getCheckInForDate(user.id, today);

  await FounderRepositories.dailyCheckIns.saveCheckIn(
    createDailyCheckIn({
      ...existingTodayCheckIn,
      id: `daily_check_in_${today.replaceAll("-", "_")}`,
      userId: user.id,
      date: today,
      weightEntryId: weightEntry.id,
      relatedGoalIds: [BODY_FAT_GOAL_ID, VISIBLE_ABS_GOAL_ID],
      nutrition: {
        proteinTargetHit: getTargetHit(proteinAchieved, proteinTarget),
        calorieTargetHit: null,
        estimatedCalories,
        estimatedCaloriesIn: estimatedCalories,
        estimatedCaloriesBurned,
        proteinTarget,
        proteinAchieved,
        relatedGoalIds: [LEAN_MASS_GOAL_ID],
        notes: "",
      },
      recovery: {
        sleepHours: null,
        sleepQuality:
          noteEvidence?.category === "recovery" ? noteEvidence.sleepQuality : null,
        sleepTargetHit:
          noteEvidence?.category === "recovery"
            ? noteEvidence.sleepTargetHit
            : null,
        notes:
          noteEvidence?.category === "recovery"
            ? noteEvidence.originalNote
            : null,
      },
      protocols: {
        completedProtocolIds: [],
        changeNote: protocolChangeNote,
      },
      notes,
      source: {
        type: "manual",
        name: "Morning Check-In",
        externalId: null,
        importedAt: null,
        confidence: "high",
        notes: "Founder Alpha morning check-in.",
      },
      fieldProvenance: {
        imported: [
          "date",
          "weightEntryId",
          "relatedGoalIds",
          "nutrition.estimatedCalories",
          "nutrition.estimatedCaloriesIn",
          "nutrition.estimatedCaloriesBurned",
          "nutrition.proteinTarget",
          "nutrition.proteinAchieved",
          "nutrition.relatedGoalIds",
          "protocols.changeNote",
          "notes",
        ],
        computed: [
          "recovery.sleepQuality",
          "recovery.sleepTargetHit",
          "recovery.notes",
        ],
      },
      createdAt,
      updatedAt: createdAt,
    })
  );

  const analysis = createAnalysisFromEvidence({
    id: weightEntry.id,
    type: "weight",
    createdAt,
    analysisId: `analysis_morning_weight_${createdAt.replace(/\D/g, "")}`,
    value: weightEntry.weight.value,
    unit: weightEntry.weight.unit,
    measuredAt: weightEntry.measuredAt,
    previousValue: previousWeight?.weight?.value ?? null,
    previousMeasuredAt: previousWeight?.measuredAt ?? null,
    context: weighInContext,
    notes,
    confidenceBefore: previousWeight ? 0.62 : 0.52,
    confidenceAfter,
  });

  await FounderRepositories.analyses.createAnalysis(analysis);
  await createDailyBriefingService({
    repositories: FounderRepositories,
  }).generateDailyBriefing({
    userId: user.id,
    trigger: {
      evidenceId: weightEntry.id,
      evidenceType: "weight",
      analysisId: analysis.id,
    },
  });

  revalidatePath("/");
  revalidatePath("/briefing/daily");
  revalidatePath("/progress");
  revalidatePath("/progress/weight");
  revalidatePath(`/analysis/${analysis.id}`);
  redirect("/briefing/daily");
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

function getConfidenceAfter({ hasPreviousWeight, contextAdjusted }) {
  if (contextAdjusted) {
    return hasPreviousWeight ? 0.6 : 0.52;
  }

  return hasPreviousWeight ? 0.68 : 0.58;
}

function getTargetHit(achieved, target) {
  if (achieved == null || target == null) return null;

  return achieved >= target;
}

async function saveReconciliationEvidence({ formData, userId }) {
  const ids = formData.getAll("reconciliationIds").map(String).filter(Boolean);

  await Promise.all(
    ids.map(async (id) => {
      const status = String(formData.get(`${id}_status`) ?? "");
      const date = String(formData.get(`${id}_date`) ?? "");
      const note = normalizeOptionalText(formData.get(`${id}_note`));

      if (!status || !date) return null;

      if (status === "completed") {
        await FounderRepositories.reminders.completeReminder(
          id,
          `${date}T20:00:00`
        );
      }

      const checkIn = await getOrCreateCheckInForDate(userId, date);
      const reconciliation = [
        ...(checkIn.reconciliation ?? []),
        {
          reminderId: id,
          status,
          note,
          recordedAt: new Date().toISOString(),
        },
      ];

      await FounderRepositories.dailyCheckIns.saveCheckIn({
        ...checkIn,
        reconciliation,
        notes: appendNote(
          checkIn.notes,
          note ? `Reconciliation ${id}: ${status} - ${note}` : null
        ),
        updatedAt: new Date().toISOString(),
      });

      return null;
    })
  );
}

async function getOrCreateCheckInForDate(userId, date) {
  const existing = await FounderRepositories.dailyCheckIns.getCheckInForDate(
    userId,
    date
  );

  if (existing) return existing;

  const now = new Date().toISOString();

  return createDailyCheckIn({
    id: `daily_check_in_${date.replaceAll("-", "_")}`,
    userId,
    date,
    source: {
      type: "manual",
      name: "Morning Reconciliation",
      externalId: null,
      importedAt: null,
      confidence: "medium",
      notes: "Founder Alpha morning reconciliation.",
    },
    fieldProvenance: {
      imported: ["reconciliation"],
      computed: [],
    },
    createdAt: now,
    updatedAt: now,
  });
}

function appendNote(existing, note) {
  return [existing, note].filter(Boolean).join("\n");
}
