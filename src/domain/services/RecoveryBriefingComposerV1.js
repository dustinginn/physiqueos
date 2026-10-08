import {
  attachRecoveryAssessmentV1,
  carryForwardRecoveryAssessmentV1,
  composeRecoveryAssessmentForBriefingV1,
  preflightRecoveryPublicationV1,
  RecoveryPublicationReason,
  resolveRecoveryBriefingPublicationAuthorityV1,
} from "./RecoveryBriefingPublicationV1.js";
import { RECOVERY_BRIEFING_CADENCES } from "./RecoveryBriefingPolicyV1.js";

// The optional generator seam for NEW Weekly and Monthly artifacts.
//
// A generator that is not given a composer (every production composition
// today) is byte-identical to before. With a composer, the authority is
// resolved and the cadence/period gates run BEFORE any Sleep read, so a
// disabled, excluded or not-yet-effective occurrence costs zero reads. The
// composer never throws: any failure leaves the briefing exactly as it would
// have been without Recovery, and a briefing is never held for Recovery.
//
// `readAuthorityRecord()` returns the Server-owned publication authority record
// (null = OFF). `readSleepInputs({ ownerUserId, startDate, endDate })` returns
// `{ sleepDays, activationPolicyRecord, algorithmPolicyRecord }` read-only.
//
// The generator passes its own read-only canonical snapshot `repositories`;
// the foam and training execution context is projected from it in memory
// (no new store query or permission), and only after the authority and
// cadence gates pass.

export function createRecoveryBriefingComposerV1({
  readAuthorityRecord,
  readSleepInputs,
  onDecision = null,
} = {}) {
  if (typeof readAuthorityRecord !== "function" || typeof readSleepInputs !== "function") {
    throw new Error("Recovery composition requires an authority reader and a Sleep input reader.");
  }
  const report = (decision) => {
    try {
      onDecision?.(Object.freeze({ cadence: decision.cadence, reason: decision.reason, detail: decision.detail ?? null }));
    } catch {
      // Observability must never affect a briefing.
    }
    return decision;
  };
  return Object.freeze({
    /** For a NEW occurrence only. Returns `{ artifact, decision }`. */
    async composeForNewArtifact({ cadence, artifact, repositories = null } = {}) {
      const unchanged = (reason, extra = {}) => ({
        artifact, decision: report({ cadence, attach: false, reason, ...extra }),
      });
      try {
        // Excluded cadences never even read the authority.
        if (!RECOVERY_BRIEFING_CADENCES.includes(cadence) || !artifact?.id ||
            artifact.cadence !== cadence || artifact.artifactType === "event") {
          return unchanged(RecoveryPublicationReason.CADENCE_EXCLUDED);
        }
        const window = artifact.evidenceWindow;
        const authority = resolveRecoveryBriefingPublicationAuthorityV1(await readAuthorityRecord());
        const preflight = preflightRecoveryPublicationV1({ authority, cadence, window });
        if (!preflight.proceed) return unchanged(preflight.reason, { detail: authority.invalidReason });
        const sleepInputs = await readSleepInputs({
          ownerUserId: artifact.userId ?? null, ...preflight.readRange,
        });
        const decision = composeRecoveryAssessmentForBriefingV1({
          authority, cadence, window, artifactId: artifact.id,
          ownerUserId: artifact.userId ?? null,
          // The artifact's own generation instant: deterministic per occurrence.
          evaluatedAt: artifact.generatedAt,
          sleepInputs,
          executionInputs: await readExecutionInputs(repositories, artifact.userId ?? null),
        });
        report({ cadence, ...decision });
        return { artifact: attachRecoveryAssessmentV1(artifact, decision), decision };
      } catch (error) {
        return unchanged(RecoveryPublicationReason.COMPOSITION_FAILED, {
          detail: String(error?.code ?? error?.name ?? "Error").slice(0, 80),
        });
      }
    },
    /** For regeneration/correction: never recompute, add or drop Recovery. */
    carryForward({ existing, artifact } = {}) {
      return carryForwardRecoveryAssessmentV1({ existing, artifact });
    },
  });
}

// In-memory snapshot reads only. Any failure = no execution context (the card
// is still composed from Sleep alone, with the limitation recorded).
async function readExecutionInputs(repositories, userId) {
  if (!repositories) return null;
  try {
    const [reminders, executionItems, dailyCheckIns, canonicalEvidenceObjects] = await Promise.all([
      repositories.reminders?.listReminders?.(userId) ?? [],
      repositories.executionItems?.listExecutionItems?.(userId) ?? [],
      repositories.dailyCheckIns?.listCheckIns?.(userId) ?? [],
      repositories.canonicalEvidence?.listCanonicalEvidenceObjects?.(userId) ?? [],
    ]);
    return { reminders, executionItems, dailyCheckIns, canonicalEvidenceObjects };
  } catch {
    return null;
  }
}
