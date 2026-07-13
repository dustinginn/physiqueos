"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createFounderTrainingProtocolActivation, validateTrainingProtocolInput } from "../../../../../domain/services/TrainingProtocolBuilderService";
import { createProtocolVersionService } from "../../../../../domain/services/ProtocolVersionService";

export async function activateTrainingProtocol(formData) {
  const user = await FounderRepositories.users.getCurrentUser();
  if (!user) throw new Error("Founder user is not available.");
  if (formData.get("founderConfirmed") !== "yes") {
    throw new Error("Review and confirm the Training strategy before activation.");
  }

  const parsed = JSON.parse(String(formData.get("strategy") || "{}"));
  const validation = validateTrainingProtocolInput(parsed);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  const activation = createFounderTrainingProtocolActivation({
    ...parsed,
    userId: user.id,
    effectiveAt: new Date().toISOString().slice(0, 10),
    confirmedAt: new Date().toISOString(),
  });
  await createProtocolVersionService({ repositories: FounderRepositories }).activateInitialProtocol(activation);

  revalidatePath("/profile/operating-plan");
  redirect("/profile/operating-plan?training=activated");
}
