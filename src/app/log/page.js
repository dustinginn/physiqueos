import { getProductionCoreNavigationReadService } from "../../application/composition/productionApplicationComposition";
import LogHubScreen from "../../screens/LogHubScreen";
import { saveDirectWeighIn } from "./actions";
import {
  parseEvidenceRecoverySearchParams,
} from "../../domain/services/EvidenceRecoveryContext";

export const dynamic = "force-dynamic";

export default async function LogPage({ searchParams }) {
  const params = await searchParams;
  const recoveryContext = parseEvidenceRecoverySearchParams(params);
  const log = await getProductionCoreNavigationReadService().getLog();

  return (
    <LogHubScreen
      error={params?.error ?? null}
      defaultLogDate={log.localDate}
      directWeighInAction={saveDirectWeighIn}
      loggedToday={log.loggedToday}
      saved={params?.saved ?? null}
      uploadAnythingAction="/log/upload"
      pendingEvidenceReviews={log.pendingEvidenceReviews}
      recoveryContext={recoveryContext}
    />
  );
}
