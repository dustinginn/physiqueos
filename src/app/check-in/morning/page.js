import MorningCheckInScreen from "../../../screens/MorningCheckInScreen";
import {
  saveMorningCheckIn,
  saveStructuredRecoveryCheckIn,
} from "./actions";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import {
  getLocalDateKey,
  resolveLocalTimeZone,
} from "../../../domain/utils/localDate";
import { createMorningPriorityReconciliationService } from "../../../domain/services/MorningPriorityReconciliationService";

export const dynamic = "force-dynamic";

export default async function MorningCheckInPage() {
  const user = await FounderRepositories.users.getCurrentUser();
  const now = new Date();
  const timeZone = resolveLocalTimeZone(user.timeZone ?? user.timezone);
  const today = getLocalDateKey(now, timeZone);
  const reconciliationService = createMorningPriorityReconciliationService({
    repositories: FounderRepositories,
    now: () => now,
  });
  const [weightEntries, reconciliationSelection] = await Promise.all([
    FounderRepositories.weights.listWeightEntries(user.id),
    reconciliationService.getSelection({
      userId: user.id,
      timeZone,
      at: now,
    }),
  ]);
  const ordered = [...weightEntries].sort((a,b)=>String(b.measuredAt).localeCompare(String(a.measuredAt)));
  const existing = ordered.find((item)=>String(item.measuredAt).slice(0,10)===today)??null;
  const previous = ordered.find((item)=>String(item.measuredAt).slice(0,10)<today)??null;
  const existingCheckIn = await FounderRepositories.dailyCheckIns
    .getCheckInForDate(user.id, today);

  return (
    <MorningCheckInScreen
      action={saveMorningCheckIn}
      recoveryAction={saveStructuredRecoveryCheckIn}
      existingRecovery={existingCheckIn?.recovery ?? null}
      dateLabel={formatDate(today)}
      existingWeight={existing?.weight?.value??null}
      previousWeight={previous?.weight?.value??null}
      reconciliationItems={reconciliationSelection.items}
    />
  );
}

function formatDate(value){const [year,month,day]=value.split("-").map(Number);return new Date(year,month-1,day).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});}
