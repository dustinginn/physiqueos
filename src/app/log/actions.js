"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadApplicationCanonicalCommitBindings } from "../../application/runtime/ApplicationCanonicalRuntime";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { createDailyCheckIn } from "../../domain/models/dailyCheckIn";
import {
  createMorningCheckInPersistenceService,
  MorningCheckInPersistenceValidationError,
} from "../../domain/services/MorningCheckInPersistenceService";
import {
  getLocalDayWindow,
} from "../../domain/utils/localDate";

export async function saveDirectWeighIn(formData) {
  const rawWeight = String(formData.get("weight") ?? "").trim();
  const parsedWeight = Number(rawWeight);
  if (!rawWeight || !Number.isFinite(parsedWeight)) {
    return directWeighInFailure("Enter a valid weight.");
  }
  const weightValue = Math.round(parsedWeight * 10) / 10;
  if (weightValue < 50 || weightValue > 1000) {
    return directWeighInFailure("Weight must be between 50 and 1,000 lb.");
  }

  const now = new Date();
  let measurementDate;
  try {
    measurementDate = getLocalDayWindow({
      dateKey: String(formData.get("evidenceDate") ?? "").trim(),
      timeZone: "UTC",
    }).dateKey;
  } catch {
    return directWeighInFailure("Choose a valid weigh-in date.");
  }

  const bindings = await loadApplicationCanonicalCommitBindings();
  let result;
  try {
    result = await createMorningCheckInPersistenceService({
      ...bindings,
      now: () => now,
    }).save({
      weightValue,
      measurementDate,
      createdAt: now.toISOString(),
      at: now,
      notes: null,
      protocolChangeNote: null,
      estimatedCalories: null,
      estimatedCaloriesBurned: null,
      proteinTarget: null,
      proteinAchieved: null,
      weighInContext: null,
      reconciliationSubmissions: [],
    });
  } catch (error) {
    if (error instanceof MorningCheckInPersistenceValidationError) {
      return directWeighInFailure(error.message);
    }
    throw error;
  }

  if (result.status !== "unchanged") {
    revalidatePath("/");
    revalidatePath("/log");
    revalidatePath("/progress");
    revalidatePath("/progress/weight");
    if (result.analysisId) revalidatePath(`/analysis/${result.analysisId}`);
  }

  const dateLabel = formatWeighInDate(result.date, result.currentDate);
  return Object.freeze({
    ok: true,
    status: result.status,
    date: result.date,
    message: result.status === "unchanged"
      ? `That weigh-in is already logged for ${dateLabel}.`
      : `Weigh-in logged for ${dateLabel}.`,
  });
}

export async function completeLogReminder(formData) {
  const reminderId = String(formData.get("reminderId") ?? "");

  if (!reminderId) throw new Error("Reminder id is required.");

  await FounderRepositories.reminders.completeReminder(reminderId);

  revalidateDailyDriverPaths();
  redirect("/log?saved=completion");
}

export async function completeLogSupplement(formData) {
  const protocolId = String(formData.get("protocolId") ?? "");

  if (!protocolId) throw new Error("Protocol id is required.");

  const user = await FounderRepositories.users.getCurrentUser();
  const today = getTodayKey();
  const checkIn = await getOrCreateTodayCheckIn(user.id, today);
  const completedProtocolIds = new Set([
    ...(checkIn.protocols?.completedProtocolIds ?? []),
    protocolId,
  ]);

  await FounderRepositories.dailyCheckIns.saveCheckIn({
    ...checkIn,
    protocols: {
      ...checkIn.protocols,
      completedProtocolIds: [...completedProtocolIds],
    },
    updatedAt: new Date().toISOString(),
  });

  revalidateDailyDriverPaths();
  redirect("/log?saved=supplement");
}

export async function saveLogNote(formData) {
  const noteType = String(formData.get("noteType") ?? "general");
  const note = normalizeOptionalText(formData.get("note"));

  if (!note) throw new Error("Note text is required.");

  const user = await FounderRepositories.users.getCurrentUser();
  const today = getTodayKey();
  const checkIn = await getOrCreateTodayCheckIn(user.id, today);
  const timestamp = new Date().toISOString();
  const noteText = appendNote(checkIn.notes, `${formatNoteType(noteType)}: ${note}`);
  const patch = {
    ...checkIn,
    notes: noteText,
    updatedAt: timestamp,
  };

  if (noteType === "nutrition") {
    patch.nutrition = {
      ...checkIn.nutrition,
      notes: appendNote(checkIn.nutrition?.notes, note),
    };
  }

  if (noteType === "training") {
    patch.activity = {
      ...checkIn.activity,
      workoutCompleted: checkIn.activity?.workoutCompleted ?? null,
    };
  }

  await FounderRepositories.dailyCheckIns.saveCheckIn(patch);

  revalidateDailyDriverPaths();
  redirect(`/log?saved=${noteType}`);
}

async function getOrCreateTodayCheckIn(userId, today) {
  const existing = await FounderRepositories.dailyCheckIns.getCheckInForDate(
    userId,
    today
  );

  if (existing) return existing;

  const now = new Date().toISOString();

  return createDailyCheckIn({
    id: `daily_check_in_${today.replaceAll("-", "_")}`,
    userId,
    date: today,
    source: {
      type: "manual",
      name: "Founder",
      confidence: "high",
    },
    fieldProvenance: {
      imported: [],
      computed: [],
    },
    createdAt: now,
    updatedAt: now,
  });
}

function revalidateDailyDriverPaths() {
  revalidatePath("/");
  revalidatePath("/log");
  revalidatePath("/progress");
  revalidatePath("/progress/weight");
  revalidatePath("/timeline");
  revalidatePath("/briefing/daily");
}

function appendNote(existing, note) {
  return [existing, note].filter(Boolean).join("\n");
}

function formatNoteType(value) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeOptionalText(value) {
  const text = String(value ?? "").trim();

  return text.length > 0 ? text : null;
}

function directWeighInFailure(error) {
  return Object.freeze({ ok: false, error });
}

function formatWeighInDate(date, today) {
  if (date === today) return "today";
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
