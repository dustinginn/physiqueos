import { loadProductionBoundedFounderReadContext } from "../../../../application/composition/productionApplicationComposition";
import ProtocolDetailScreen from "../../../../screens/ProtocolDetailScreen";
import StrategyDomainScreen from "../../../../screens/StrategyDomainScreen";
import { getLocalDateKey, resolveLocalTimeZone } from "../../../../domain/utils/localDate";
import { pauseSupplement, restoreSupplement } from "./supplementActions";

export const dynamic = "force-dynamic";

export default async function ProtocolDetailPage({ params, searchParams }) {
  const { protocolId } = await params;
  const query = await searchParams;
  const { repositories } = await loadProductionBoundedFounderReadContext({ collections: ["user", "goals", "protocols", "protocolVersions", "executionItems"] });
  const user = await repositories.users.getCurrentUser();
  const [protocol, goals, version, activeProtocols, executionItems] = await Promise.all([
    repositories.protocols.getProtocolById(protocolId),
    repositories.goals.listGoals(user.id),
    repositories.protocolVersions.getCurrentVersion(protocolId),
    repositories.protocols.listActiveProtocols(user.id),
    repositories.executionItems.listExecutionItems(user.id),
  ]);

  if (!protocol || protocol.userId !== user.id) {
    return <ProtocolDetailScreen from={query?.from} goals={[]} protocol={null} />;
  }

  if (["recovery", "peptide", "supplement"].includes(protocol.category) && protocol.status === "active") {
    const domainProtocols = activeProtocols.filter((item) => item.category === protocol.category);
    const domainVersions = await Promise.all(
      domainProtocols.map((item) => repositories.protocolVersions.getCurrentVersion(item.id))
    );
    const timeZone = resolveLocalTimeZone(user.timeZone ?? user.timezone);
    return <StrategyDomainScreen
      category={protocol.category}
      executionItems={executionItems}
      goals={goals}
      localDate={getLocalDateKey(new Date(), timeZone)}
      protocols={domainProtocols}
      versions={domainVersions.filter(Boolean)}
    />;
  }

  const versions = version ? [version] : await repositories.protocolVersions.listVersions(protocolId);
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
