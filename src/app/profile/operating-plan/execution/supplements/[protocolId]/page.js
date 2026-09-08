import { notFound } from "next/navigation";
import { loadProductionBoundedFounderReadContext } from "../../../../../../application/composition/productionApplicationComposition";
import SupplementExecutionDetailScreen from "../../../../../../screens/SupplementExecutionDetailScreen";
import SupplementSupportEditorScreen from "../../../../../../screens/SupplementSupportEditorScreen";
import { saveSupplementExecution } from "./actions";
import { createSupplementSupportHydrationModel } from "../../../../../../domain/services/SupplementSupportManagementService";

export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }) {
  const { protocolId } = await params;
  const query = await searchParams;
  const { repositories } = await loadProductionBoundedFounderReadContext({ collections: ["user", "protocols", "protocolVersions", "executionItems", "reminders"] });
  const user = await repositories.users.getCurrentUser();
  const [protocol, version, executions, reminders] = await Promise.all([
    repositories.protocols.getProtocolById(protocolId),
    repositories.protocolVersions.getCurrentVersion(protocolId),
    repositories.executionItems.listExecutionItems(user.id),
    repositories.reminders.listReminders(user.id),
  ]);
  if (!protocol || protocol.userId !== user.id || protocol.category !== "supplement" || protocol.status !== "active" || !version) notFound();
  const item = executions.find((entry) => entry.type === "supplement" && entry.protocolRootId === protocol.id) ?? null;
  const reminder = reminders.find((entry) => entry.type === "supplement_reminder" && entry.linkedEntityId === protocol.id) ?? null;
  const hydration = createSupplementSupportHydrationModel({ executionItem: item, protocol, reminder });
  if (query?.edit === "1") return <SupplementSupportEditorScreen action={saveSupplementExecution.bind(null, {
    protocolId, expectedRevision: item?.executionRevision ?? null,
  })} hydration={hydration} key={`${item?.id ?? "unconfigured"}:${item?.executionRevision ?? 0}`} protocol={protocol}/>;
  return <SupplementExecutionDetailScreen item={item} protocol={protocol} reminder={reminder}/>;
}
