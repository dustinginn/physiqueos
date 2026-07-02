"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { createDailyCheckIn } from "../../domain/models/dailyCheckIn";

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
