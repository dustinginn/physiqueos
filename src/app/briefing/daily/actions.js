"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { createDailyBriefingService } from "../../../domain/services/DailyBriefingService";

export async function generateScheduledDailyBriefing() {
  const result = await createDailyBriefingService({
    repositories: FounderRepositories,
  }).generateScheduledDailyBriefingForClosedWindow({});

  revalidatePath("/");
  revalidatePath("/briefing/daily");

  if (["created", "already_exists"].includes(result.state)) {
    redirect("/briefing/daily");
  }

  redirect(`/?briefingGeneration=${result.state}`);
}
