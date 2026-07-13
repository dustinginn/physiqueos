import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createTrainingProtocolBuilderService } from "../../../../../domain/services/TrainingProtocolBuilderService";
import TrainingProtocolBuilderScreen from "../../../../../screens/TrainingProtocolBuilderScreen";
import { activateTrainingProtocol } from "./actions";

export const dynamic = "force-dynamic";

export default async function NewTrainingProtocolPage() {
  const user = await FounderRepositories.users.getCurrentUser();
  if (!user) redirect("/profile/operating-plan");
  const context = await createTrainingProtocolBuilderService({ repositories: FounderRepositories }).getBuilderContext(user.id);
  if (context.activeProtocol) redirect("/profile/operating-plan?training=active");

  return <TrainingProtocolBuilderScreen action={activateTrainingProtocol} context={context} />;
}
