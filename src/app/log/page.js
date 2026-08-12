import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { createInactiveLegacyWebContext } from "../../application/auth/legacyWebContext";
import { createLogReadService } from "../../application/log/LogReadService";
import LogHubScreen from "../../screens/LogHubScreen";
import {
  parseEvidenceRecoverySearchParams,
} from "../../domain/services/EvidenceRecoveryContext";

export const dynamic = "force-dynamic";

export default async function LogPage({ searchParams }) {
  const params = await searchParams;
  const recoveryContext = parseEvidenceRecoverySearchParams(params);
  const context = await createInactiveLegacyWebContext({ repositories: FounderRepositories });
  const log = await createLogReadService({ repositories: FounderRepositories }).getLog({
    principal: context.principal,
    timeZone: context.user.timeZone ?? context.user.timezone,
  });

  return (
    <LogHubScreen
      error={params?.error ?? null}
      loggedToday={log.loggedToday}
      saved={params?.saved ?? null}
      uploadAnythingAction="/log/upload"
      pendingEvidenceReviews={log.pendingEvidenceReviews}
      recoveryContext={recoveryContext}
    />
  );
}
