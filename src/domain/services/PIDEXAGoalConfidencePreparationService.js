import { createHash } from "node:crypto";
import {
  createPIGoalConfidenceRefreshService,
  PIGoalConfidenceTriggerType,
} from "./PIGoalConfidenceRefreshService";

export const PI_DEXA_CONFIDENCE_PREPARATION_VERSION =
  "pi_dexa_goal_confidence_preparation_v1";

export function createPIDEXAGoalConfidencePreparationService({
  readService,
  now = () => new Date(),
} = {}) {
  if (!readService) throw new Error("Canonical confidence read service is required.");
  return Object.freeze({
    async prepare(request = {}) {
      if (request.triggerType !== PIGoalConfidenceTriggerType.DEXA_EVENT) {
        return { status: "not_eligible", reason: "unsupported_dexa_trigger" };
      }
      let publicationCommand = null;
      const refresh = createPIGoalConfidenceRefreshService({
        readService,
        now,
        persistenceService: {
          publish: async (command) => {
            publicationCommand = structuredClone(command);
            return {
              status: "published",
              committed: false,
              assessmentId: command.assessment.id,
            };
          },
        },
      });
      const result = await refresh.refresh({
        ...request,
        triggerId: request.occurrenceId,
        publicationReason: request.publicationReason ??
          `DEXA confidence publication ${request.occurrenceId}`,
        preparedPIReasoning: {
          ...request.preparedPIReasoning,
          piReasoningFingerprint:
            request.preparedPIReasoning?.piReasoningFingerprint ??
            fingerprint(request.preparedPIReasoning),
        },
      });
      if (result.status === "matched") {
        return {
          status: "authoritative_evidence_already_consumed",
          assessment: result.assessment,
          assessmentId: result.assessmentId,
          receipt: result.receipt,
          publicationCommand: null,
        };
      }
      if (!publicationCommand || !result.assessment) {
        return {
          status: result.status,
          reason: result.error?.message ?? null,
          receipt: result.receipt ?? null,
        };
      }
      const dexaContributor = result.contributors.find(
        (item) => item.domain === "dexa"
      ) ?? null;
      return {
        status: "prepared_successor",
        assessment: result.assessment,
        assessmentId: result.assessment.id,
        score: result.score,
        trace: result.trace,
        contributors: result.contributors,
        authoritativeDEXAContributor: dexaContributor,
        receipt: result.receipt,
        publicationCommand,
        authoritativeConsumptionKey:
          dexaContributor?.canonicalEvidenceReferences?.[0]?.id ?? null,
      };
    },
  });
}

function fingerprint(value) {
  return `sha256_${createHash("sha256").update(stable(value)).digest("hex")}`;
}
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value ?? {}).sort().map((key) =>
    `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
