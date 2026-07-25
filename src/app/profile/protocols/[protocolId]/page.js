import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import ProtocolDetailScreen from "../../../../screens/ProtocolDetailScreen";
import { pauseSupplement, restoreSupplement } from "./supplementActions";

export const dynamic = "force-dynamic";

export default async function ProtocolDetailPage({ params, searchParams }) {
  const { protocolId } = await params;
  const query = await searchParams;
  const user = await FounderRepositories.users.getCurrentUser();
  const [protocol, goals, version] = await Promise.all([
    FounderRepositories.protocols.getProtocolById(protocolId),
    FounderRepositories.goals.listGoals(user.id),
    FounderRepositories.protocolVersions.getCurrentVersion(protocolId),
  ]);

  if (!protocol || protocol.userId !== user.id) {
    return <ProtocolDetailScreen from={query?.from} goals={[]} protocol={null} />;
  }

  const versions = version ? [version] : await FounderRepositories.protocolVersions.listVersions(protocolId);
  const authoritativeVersion = version ?? versions.at(-1) ?? null;
  return <ProtocolDetailScreen
    from={query?.from}
    goals={goals}
    lifecycleAction={protocol.category === "supplement"
      ? (protocol.status === "paused" ? restoreSupplement : pauseSupplement).bind(null, {
          protocolId,
          expectedCurrentVersionId: protocol.currentVersionId,
        })
      : null}
    protocol={protocol}
    version={authoritativeVersion}
  />;
}
