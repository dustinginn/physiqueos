import { resolveCanonicalEvidenceLocalDate } from "./CanonicalEvidenceDateService";
import {
  resolveFrozenGoalPhaseAttribution,
} from "./CanonicalGoalPhaseChronologyService";
import { selectCanonicalActiveGoal } from "./CanonicalGoalRelationshipService";

export function resolveCanonicalEvidenceGoalPhaseAttribution({
  evidenceObject = {},
  existingObject = null,
  goals = [],
  userId = null,
} = {}) {
  const persisted = existingObject?.goalPhaseAttribution
    ? existingObject
    : existingObject?.goalId || existingObject?.phaseId
      ? existingObject
      : evidenceObject;
  const explicit = resolveFrozenGoalPhaseAttribution({ artifact: persisted });
  if (explicit.source === "persisted_artifact") return explicit;

  const activeGoal = selectCanonicalActiveGoal(goals, { ownerUserId: userId });
  return resolveFrozenGoalPhaseAttribution({
    artifact: evidenceObject,
    fallbackGoal: activeGoal,
    asOf: resolveCanonicalEvidenceLocalDate(evidenceObject),
  });
}
