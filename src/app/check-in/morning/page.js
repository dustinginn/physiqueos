import MorningCheckInScreen from "../../../screens/MorningCheckInScreen";
import {
  saveMorningCheckIn,
  saveStructuredRecoveryCheckIn,
  finalizeMorningBriefingReconciliation,
} from "./actions";
import { getProductionCoreNavigationReadService } from "../../../application/composition/productionApplicationComposition";

export const dynamic = "force-dynamic";

export default async function MorningCheckInPage() {
  const model = await getProductionCoreNavigationReadService().getMorningCheckIn();
  return (
    <MorningCheckInScreen
      action={saveMorningCheckIn}
      recoveryAction={saveStructuredRecoveryCheckIn}
      briefingFinalizationAction={finalizeMorningBriefingReconciliation}
      briefingReconciliation={model.briefingReconciliation}
      existingRecovery={model.existingRecovery}
      dateLabel={formatDate(model.today)}
      existingWeight={model.existingWeight}
      previousWeight={model.previousWeight}
      reconciliationItems={model.reconciliationItems}
    />
  );
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
