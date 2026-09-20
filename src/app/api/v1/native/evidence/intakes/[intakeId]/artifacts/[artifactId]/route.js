import { executeApiRequest } from "../../../../../../../../../platform/http/apiResponse.js";
import { foundationBuildIdentity, foundationLogger } from "../../../../../../../../../platform/foundation/runtime.js";
import { getProductionNativeContractRuntime } from "../../../../../../../../../platform/auth/nativeProductionContractRuntime.js";
import {
  parseStagedArtifactPath,
  readStagedArtifactBody,
} from "../../../../../../../../../application/native/NativeStagedEvidenceIntakeRequest.js";
import { toEvidenceIntakeProblem } from "../../../../../../../../../domain/services/EvidenceIntakeProblemMapping.js";

export const runtime = "nodejs";

// Transfers exactly one declared artifact. The body is read only after the
// bearer is authorized and the manifest entry is known, under that entry's
// own byte ceiling. Re-sending an already stored artifact is a no-op.
export async function PUT(request, { params }) {
  return executeApiRequest(request, async () => {
    try {
      const { intakeId, artifactId } = parseStagedArtifactPath(await params);
      return await (await getProductionNativeContractRuntime()).storeStagedEvidenceArtifact({
        request,
        intakeId,
        artifactId,
        readBody: (options) => readStagedArtifactBody(request, options),
      });
    } catch (error) {
      throw toEvidenceIntakeProblem(error);
    }
  }, { buildIdentity: foundationBuildIdentity, logger: foundationLogger });
}
