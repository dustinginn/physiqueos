import MorningCheckInScreen from "../../../screens/MorningCheckInScreen";
import { saveMorningCheckIn } from "./actions";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { DailyFocusService } from "../../../domain/services/DailyFocusService";

export const dynamic = "force-dynamic";

export default async function MorningCheckInPage({ searchParams }) {
  const params = await searchParams;
  const user = await FounderRepositories.users.getCurrentUser();
  const [reminders, checkIns, dexaScans, progressPhotos, weightEntries] = await Promise.all([
    FounderRepositories.reminders.listActiveReminders(user.id),
    FounderRepositories.dailyCheckIns.listCheckIns(user.id),
    FounderRepositories.dexaScans.listDEXAScans(user.id),
    FounderRepositories.progressPhotos.listPhotos(user.id),
    FounderRepositories.weights.listWeightEntries(user.id),
  ]);
  const reconciliationItems = DailyFocusService.getReconciliationItems({
    checkIns,
    dexaScans,
    progressPhotos,
    reminders,
    weightEntries,
  });

  return (
    <MorningCheckInScreen
      action={saveMorningCheckIn}
      reconciliationItems={reconciliationItems}
      returnTo={params?.session === "morning" ? "/log?session=morning" : null}
    />
  );
}
