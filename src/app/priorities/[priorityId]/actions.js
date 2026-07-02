"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";

export async function completePriority(formData) {
  const priorityId = String(formData.get("priorityId") ?? "");

  if (!priorityId) {
    throw new Error("Priority id is required.");
  }

  await FounderRepositories.reminders.completeReminder(priorityId);

  revalidatePath("/");
  revalidatePath("/log");
  revalidatePath(`/priorities/${priorityId}`);
  redirect("/");
}
