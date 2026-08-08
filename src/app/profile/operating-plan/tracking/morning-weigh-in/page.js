import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createRecurringSupportHydrationModel } from "../../../../../domain/services/RecurringSupportManagementService";
import { resolveMorningWeighInSupport } from "../../../../../domain/services/TrackingSupportService";
import RecurringSupportEditorScreen from "../../../../../screens/RecurringSupportEditorScreen";
import { saveMorningWeighInSupport } from "./actions";

export const dynamic = "force-dynamic";

export default async function MorningWeighInSupportPage() {
  const user = await FounderRepositories.users.getCurrentUser();
  const [executionItems, protocols, reminders] = await Promise.all([
    FounderRepositories.executionItems.listExecutionItems(user.id),
    FounderRepositories.protocols.listProtocols(user.id),
    FounderRepositories.reminders.listReminders(user.id),
  ]);
  const support = resolveMorningWeighInSupport({ executionItems, protocols, reminders, userId: user.id });
  if (!support) notFound();
  return (
    <RecurringSupportEditorScreen
      action={saveMorningWeighInSupport.bind(null, {
        executionId: support.executionItem.id,
        expectedRevision: support.executionItem.executionRevision ?? 1,
        protocolId: support.protocol.id,
        reminderId: support.reminder.id,
      })}
      backHref="/profile/operating-plan/tracking"
      backLabel="Tracking"
      contextLabel="Tracking Support"
      helperCopy="Set when this measurement is expected and whether Home should remind you. Weight evidence completes it automatically."
      hydration={createRecurringSupportHydrationModel(support)}
      protocol={support.protocol}
    />
  );
}
