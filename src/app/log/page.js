import {
  getProductionAsyncEvidenceIntakeService,
  getProductionCoreNavigationReadService,
} from "../../application/composition/productionApplicationComposition";
import LogHubScreen from "../../screens/LogHubScreen";
import { saveDirectWeighIn } from "./actions";
import {
  parseEvidenceRecoverySearchParams,
} from "../../domain/services/EvidenceRecoveryContext";

export const dynamic = "force-dynamic";

export default async function LogPage({ searchParams }) {
  const params = await searchParams;
  const recoveryContext = parseEvidenceRecoverySearchParams(params);
  const [log, intake] = await Promise.all([
    getProductionCoreNavigationReadService().getLog(),
    params?.intake
      ? getProductionAsyncEvidenceIntakeService().getStatus(params.intake).catch(() => null)
      : null,
  ]);

  return (
    <LogHubScreen
      error={params?.error ?? null}
      defaultLogDate={log.localDate}
      directWeighInAction={saveDirectWeighIn}
      intakeState={intake?.status ?? params?.upload ?? null}
      loggedToday={log.loggedToday}
      saved={params?.saved ?? null}
      uploadAnythingAction="/log/upload"
      pendingEvidenceReviews={log.pendingEvidenceReviews}
      recoveryContext={recoveryContext}
    />
  );
}
