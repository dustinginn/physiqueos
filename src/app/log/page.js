import { FounderRepositories } from "../../data/repositories/founderRepositories";
import LogHubScreen from "../../screens/LogHubScreen";
import {
  completeLogReminder,
  completeLogSupplement,
  saveLogNote,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function LogPage({ searchParams }) {
  const params = await searchParams;
  const user = await FounderRepositories.users.getCurrentUser();
  const [protocols, reminders] = await Promise.all([
    FounderRepositories.protocols.listActiveProtocols(user.id),
    FounderRepositories.reminders.listActiveReminders(user.id),
  ]);

  return (
    <LogHubScreen
      completeReminderAction={completeLogReminder}
      completeSupplementAction={completeLogSupplement}
      noteAction={saveLogNote}
      protocols={protocols}
      reminders={reminders}
      saved={params?.saved ?? null}
    />
  );
}
