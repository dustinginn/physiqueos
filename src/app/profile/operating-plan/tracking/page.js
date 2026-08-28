import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { resolveMorningWeighInSupport } from "../../../../domain/services/TrackingSupportService";
import TrackingScreen from "../../../../screens/TrackingScreen";

export const dynamic = "force-dynamic";

export default async function TrackingPage() {
  return FounderRepositories.runInReadScope(async () => {
  const user = await FounderRepositories.users.getCurrentUser();
  if (!user) notFound();
  const [executionItems, protocols, reminders] = await Promise.all([
    FounderRepositories.executionItems.listExecutionItems(user.id),
    FounderRepositories.protocols.listProtocols(user.id),
    FounderRepositories.reminders.listReminders(user.id),
  ]);
  const morningWeighIn = resolveMorningWeighInSupport({ executionItems, protocols, reminders, userId: user.id });
  return <TrackingScreen morningWeighIn={morningWeighIn} />;
  }, { readModel: "route.tracking" });
}
