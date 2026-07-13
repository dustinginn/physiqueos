import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { recoverOrphanedEvidenceUploads } from "../../domain/services/EvidenceIngestionRecoveryService";

export async function recoverFounderOrphanedEvidenceUploads() {
  const user = await FounderRepositories.users.getCurrentUser();

  if (!user) return null;

  return recoverOrphanedEvidenceUploads({
    repositories: FounderRepositories,
    userId: user.id,
  });
}
