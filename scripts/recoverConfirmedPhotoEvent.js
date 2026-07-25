import { FounderRepositories } from "../src/data/repositories/founderRepositories.js";
import { createConfirmedPhotoEventRecoveryService } from "../src/domain/services/ConfirmedPhotoEventRecoveryService.js";

async function main() {
  const reviewId = process.argv.find((value) => value.startsWith("--review="))?.split("=")[1];
  const apply = process.argv.includes("--apply");
  const refreshArtifact = process.argv.includes("--refresh-artifact");
  const user = await FounderRepositories.users.getCurrentUser();
  if (!reviewId || !user) throw new Error("Usage: npx tsx scripts/recoverConfirmedPhotoEvent.js --review=<id> [--apply]");

  const service = createConfirmedPhotoEventRecoveryService({ repositories: FounderRepositories });
  const inspection = await service.inspect({ reviewId, userId: user.id });
  if (!apply) {
    console.log(JSON.stringify({
      mode: "read_only",
      status: inspection.status,
      code: inspection.code,
      message: inspection.message,
      reviewId,
      sessionId: inspection.sessionId,
      artifactId: inspection.artifactId,
      existingArtifact: Boolean(inspection.existingArtifact),
      firstIncompleteStep: inspection.firstIncompleteStep,
      refreshArtifact,
    }, null, 2));
    process.exitCode = inspection.status === "ready" ? 0 : 1;
    return;
  }
  if (inspection.status !== "ready") throw new Error(`${inspection.code}: ${inspection.message}`);
  const result = await service.recover({ reviewId, userId: user.id, refreshArtifact });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
