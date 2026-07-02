import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import ProtocolDetailScreen from "../../../../screens/ProtocolDetailScreen";

export const dynamic = "force-dynamic";

export default async function ProtocolDetailPage({ params, searchParams }) {
  const { protocolId } = await params;
  const query = await searchParams;
  const user = await FounderRepositories.users.getCurrentUser();
  const [protocol, goals] = await Promise.all([
    FounderRepositories.protocols.getProtocolById(protocolId),
    FounderRepositories.goals.listGoals(user.id),
  ]);

  if (!protocol || protocol.userId !== user.id) {
    notFound();
  }

  return <ProtocolDetailScreen from={query?.from} goals={goals} protocol={protocol} />;
}
