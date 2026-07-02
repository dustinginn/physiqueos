import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import ProtocolsHubScreen from "../../../screens/ProtocolsHubScreen";

export const dynamic = "force-dynamic";

export default async function ProtocolsPage() {
  const user = await FounderRepositories.users.getCurrentUser();
  const [goals, protocols] = await Promise.all([
    FounderRepositories.goals.listGoals(user.id),
    FounderRepositories.protocols.listProtocols(user.id),
  ]);

  return <ProtocolsHubScreen goals={goals} protocols={protocols} />;
}
