import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createActivityProtocolBuilderService } from "../../../../../domain/services/ActivityProtocolBuilderService";
import ActivityProtocolBuilderScreen from "../../../../../screens/ActivityProtocolBuilderScreen";
import { activateActivityProtocol } from "./actions";

export const dynamic = "force-dynamic";

export default async function NewActivityProtocolPage() {
  const user = await FounderRepositories.users.getCurrentUser();
  if (!user) redirect("/profile/operating-plan");
  const service = createActivityProtocolBuilderService({ repositories: FounderRepositories });
  const context = await service.getBuilderContext(user.id);
  if (context.activeProtocol) redirect("/profile/operating-plan?activity=active");

  return <ActivityProtocolBuilderScreen action={activateActivityProtocol} context={context} />;
}
