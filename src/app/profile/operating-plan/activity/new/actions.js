"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import {
  createFounderActivityProtocolActivation,
} from "../../../../../domain/services/ActivityProtocolBuilderService";
import { createProtocolVersionService } from "../../../../../domain/services/ProtocolVersionService";

export async function activateActivityProtocol(formData) {
  const user = await FounderRepositories.users.getCurrentUser();
  if (!user) throw new Error("Founder user is not available.");
  if (formData.get("founderConfirmed") !== "yes") {
    throw new Error("Founder confirmation is required before activation.");
  }

  const dailyTarget = Number(formData.get("dailyTarget"));
  if (!Number.isFinite(dailyTarget) || dailyTarget < 100 || dailyTarget > 5000) {
    throw new Error("Enter a valid daily Activity target.");
  }

  const activation = createFounderActivityProtocolActivation({
    dailyTarget,
    effectiveAt: new Date().toISOString().slice(0, 10),
    userId: user.id,
    confirmedAt: new Date().toISOString(),
  });
  const service = createProtocolVersionService({ repositories: FounderRepositories });
  await service.activateInitialProtocol(activation);

  revalidatePath("/profile/operating-plan");
  redirect("/profile/operating-plan?activity=activated");
}
