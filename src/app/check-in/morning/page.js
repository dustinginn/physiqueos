import MorningCheckInScreen from "../../../screens/MorningCheckInScreen";
import {
  saveMorningCheckIn,
  saveStructuredRecoveryCheckIn,
  finalizeMorningBriefingReconciliation,
} from "./actions";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import {
  getLocalDateKey,
  resolveLocalTimeZone,
} from "../../../domain/utils/localDate";
import { createMorningPriorityReconciliationService } from "../../../domain/services/MorningPriorityReconciliationService";
import {
  createBriefingReconciliationPresentation,
} from "../../../domain/services/BriefingReconciliationPresentationService";
import {
  MORNING_EVIDENCE_RECOVERY_STATUSES,
} from "../../../domain/services/MorningEvidenceRecoveryService";

export const dynamic = "force-dynamic";

export default async function MorningCheckInPage() {
  return FounderRepositories.runInReadScope(async () => {
  const user = await FounderRepositories.users.getCurrentUser();
  const now = new Date();
  const timeZone = resolveLocalTimeZone(user.timeZone ?? user.timezone);
  const today = getLocalDateKey(now, timeZone);
  const reconciliationService = createMorningPriorityReconciliationService({
    repositories: FounderRepositories,
    now: () => now,
  });
  const [weightEntries, reconciliationSelection, briefingWorkItems] = await Promise.all([
    FounderRepositories.weights.listWeightEntries(user.id),
    reconciliationService.getSelection({
      userId: user.id,
      timeZone,
      at: now,
    }),
    FounderRepositories.briefingReconciliationWorkItems.listWorkItems(user.id),
  ]);
  const ordered = [...weightEntries].sort((a,b)=>String(b.measuredAt).localeCompare(String(a.measuredAt)));
  const existing = ordered.find((item)=>String(item.measuredAt).slice(0,10)===today)??null;
  const previous = ordered.find((item)=>String(item.measuredAt).slice(0,10)<today)??null;
  const existingCheckIn = await FounderRepositories.dailyCheckIns
    .getCheckInForDate(user.id, today);
  const briefingReconciliation = createBriefingReconciliationPresentation({
    evidenceDate: reconciliationSelection.window.previousLocalDate,
    hasPendingConfirmation: reconciliationSelection.evidenceRecoveryItems.some(
      (item) => item.status ===
        MORNING_EVIDENCE_RECOVERY_STATUSES.PENDING_CONFIRMATION
    ),
    workItems: briefingWorkItems,
  });

  return (
    <MorningCheckInScreen
      action={saveMorningCheckIn}
      recoveryAction={saveStructuredRecoveryCheckIn}
      briefingFinalizationAction={finalizeMorningBriefingReconciliation}
      briefingReconciliation={briefingReconciliation}
      existingRecovery={existingCheckIn?.recovery ?? null}
      dateLabel={formatDate(today)}
      existingWeight={existing?.weight?.value??null}
      previousWeight={previous?.weight?.value??null}
      reconciliationItems={reconciliationSelection.items}
    />
  );
  }, { readModel: "route.morning-check-in" });
}

function formatDate(value){const [year,month,day]=value.split("-").map(Number);return new Date(year,month-1,day).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});}
