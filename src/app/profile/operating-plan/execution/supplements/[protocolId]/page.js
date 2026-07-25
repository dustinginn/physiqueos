import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../../../data/repositories/founderRepositories";
import SupplementExecutionDetailScreen from "../../../../../../screens/SupplementExecutionDetailScreen";
import SupplementExecutionEditorScreen from "../../../../../../screens/SupplementExecutionEditorScreen";
import { saveSupplementExecution } from "./actions";
import { createSupplementExecutionHydrationModel } from "../../../../../../domain/services/SupplementExecutionManagementService";

export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }) {
  const { protocolId } = await params;
  const query = await searchParams;
  const user = await FounderRepositories.users.getCurrentUser();
  const [protocol, version, executions] = await Promise.all([
    FounderRepositories.protocols.getProtocolById(protocolId),
    FounderRepositories.protocolVersions.getCurrentVersion(protocolId),
    FounderRepositories.executionItems.listExecutionItems(user.id),
  ]);
  if (!protocol || protocol.userId !== user.id || protocol.category !== "supplement" || protocol.status !== "active" || !version) notFound();
  const item = executions.find((entry) => entry.type === "supplement" && entry.protocolRootId === protocol.id) ?? null;
  const hydration = createSupplementExecutionHydrationModel({ executionItem: item, protocol });
  if (query?.edit === "1") return <SupplementExecutionEditorScreen action={saveSupplementExecution.bind(null, {
    protocolId, expectedRevision: item?.executionRevision ?? null,
  })} item={hydration.draft} key={`${item?.id ?? "unconfigured"}:${item?.executionRevision ?? 0}`} protocol={protocol}/>;
  return <SupplementExecutionDetailScreen item={item} protocol={protocol}/>;
}
