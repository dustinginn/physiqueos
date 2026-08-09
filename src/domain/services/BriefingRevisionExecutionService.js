import {
  beginBriefingReconciliation,
  completeBriefingReconciliation,
  failBriefingReconciliation,
} from "./BriefingReconciliationWorkItemService";

export const BRIEFING_REVISION_EXECUTION_VERSION =
  "briefing_revision_execution_v1";

export function createBriefingRevisionExecutionService({
  cadenceServices = {},
  getCurrentPublication,
  validateEligibility,
  saveWorkItem = async () => {},
  now = () => new Date(),
} = {}) {
  if (typeof getCurrentPublication !== "function") {
    throw new Error("Briefing revision execution requires a publication loader.");
  }
  if (typeof validateEligibility !== "function") {
    throw new Error("Briefing revision execution requires eligibility validation.");
  }
  return Object.freeze({
    async execute({ workItem, userId } = {}) {
      let active = beginBriefingReconciliation(workItem, now().toISOString());
      await saveWorkItem(active);
      try {
        const publication = await getCurrentPublication({
          publicationRootId: active.publicationRootId,
          userId,
        });
        if (!publication || publication.id !== active.publicationRootId) {
          throw typed("publication_not_current",
            "The targeted publication root is no longer current.");
        }
        const eligibility = await validateEligibility({ publication, workItem: active });
        if (!eligibility?.eligible) {
          throw typed("revision_no_longer_eligible",
            "The publication no longer qualifies for automatic revision.");
        }
        const service = cadenceServices[active.cadence];
        if (!service) throw typed("cadence_revision_unavailable",
          `No canonical ${active.cadence} revision service is registered.`);
        const result = await executeRegeneration(service, {
          userId,
          reason: "late_evidence_reconciliation",
          targetArtifactId: active.publicationRootId,
          reconciliationContext: {
            workItemId: active.id,
            affectedDependencies: active.affectedDependencies,
            inputFingerprint: active.inputFingerprint,
          },
        });
        if (!isSuccessful(result)) {
          throw typed(result?.status ?? "briefing_revision_failed",
            result?.error?.message ?? "Canonical briefing revision failed.");
        }
        const artifact = result.artifact ?? publication;
        active = completeBriefingReconciliation(active, {
          completedAt: now().toISOString(),
          publicationArtifactId: artifact.id,
          dependencyManifestFingerprint: artifact.dependencyManifest?.fingerprint ??
            eligibility.dependencyManifest?.fingerprint ?? null,
          noOp: result.status === "matched" || result.noOp === true,
        });
        await saveWorkItem(active);
        return Object.freeze({
          schemaVersion: BRIEFING_REVISION_EXECUTION_VERSION,
          status: active.result.noOp ? "completed_no_op" : "completed",
          committed: result.committed === true,
          artifact,
          workItem: active,
        });
      } catch (error) {
        active = failBriefingReconciliation(active, error, now().toISOString());
        await saveWorkItem(active);
        return Object.freeze({
          schemaVersion: BRIEFING_REVISION_EXECUTION_VERSION,
          status: "failed",
          committed: false,
          artifact: null,
          workItem: active,
          error: active.failure,
        });
      }
    },
  });
}

async function executeRegeneration(service, command) {
  if (typeof service.prepareRegeneration === "function" &&
      typeof service.executePreparedRegeneration === "function") {
    const prepared = await service.prepareRegeneration(command);
    return service.executePreparedRegeneration({ prepared });
  }
  if (typeof service.regenerate === "function") {
    const artifact = await service.regenerate(command);
    return artifact?.status ? artifact : {
      status: "regenerated", committed: true, artifact,
    };
  }
  throw typed("cadence_revision_unavailable",
    "The cadence service has no regeneration entry point.");
}

function isSuccessful(result) {
  return Boolean(result && [
    "regenerated",
    "matched",
    "briefing_regenerated_confidence_published",
    "briefing_regenerated_confidence_matched",
    "published_successor",
    "published_reaffirmation",
  ].includes(result.status));
}

function typed(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
