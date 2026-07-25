"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";

export async function completePriority(formData) {
  const priorityId = String(formData.get("priorityId") ?? "");

  if (!priorityId) {
    throw new Error("Priority id is required.");
  }

  const occurrenceDate = String(formData.get("occurrenceDate") ?? "");
  const dose = String(formData.get("dose") ?? "");
  const protocolId = String(formData.get("protocolId") ?? "");
  if (occurrenceDate && dose && protocolId) {
    await FounderRepositories.reminders.completeReminderFromEvidence(priorityId, {
      id: `${priorityId}:${occurrenceDate}`,
      completedAt: new Date().toISOString(),
      evidenceDate: occurrenceDate,
      effectiveDose: dose,
      protocolId,
      satisfactionType: "scheduled_protocol_execution",
    });
  } else {
    await FounderRepositories.reminders.completeReminder(priorityId);
  }

  revalidatePath("/");
  revalidatePath("/log");
  revalidatePath(`/priorities/${priorityId}`);
  redirect("/");
}
