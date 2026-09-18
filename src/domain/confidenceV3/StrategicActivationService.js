// Confidence V3 — Phase 8. Activation baseline.
//
// A one-time (per Goal+Phase) publication event, distinct from every
// recurring/event briefing type: it does not create a Midweek/Weekly/
// Monthly/DEXA/Photo artifact, it resolves the active Goal/Phase, evaluates
// ALL strategically-eligible evidence through an explicit cutoff, and
// publishes exactly one canonical V3 interpretation as the CURRENT
// user-facing Confidence — immediately, not waiting for the next scheduled
// briefing. Every subsequent V3 briefing (Midweek/Weekly/Monthly/DEXA/
// Photo) treats this as its prior interpretation, exactly like any other
// canonical predecessor.
//
// IDEMPOTENCY: `idempotencyKey`/`occurrenceId`/`artifactId`/`evidenceWindowId`
// are all deterministic functions of (goalId, phaseId, evidenceCutoff) only
// — NOT of the computed interpretation. Two calls with the same cutoff that
// happen to see identical eligible evidence produce an identical assessment
// `id` and the underlying publication service's own idempotency check
// (`CanonicalBriefingConfidencePublicationService`) returns `status:
// "matched"` without a second write. Two calls with the same key but
// DIFFERENT evidence (a real race, or a retry after evidence changed)
// produce a different assessment `id` under the same idempotencyKey, which
// that service deliberately rejects as `publication_identity_conflict`
// rather than silently duplicating or overwriting — fail closed, not
// fail open.
//
// CONTINUITY: `previousPercentage`/`confidenceBand` — the projection's
// required continuity anchor — are read from the goal's LATEST user-facing
// canonical Confidence (V2 or a prior V3 record; whichever actually
// published last), never fabricated and never hard-coded. If no prior
// user-facing assessment exists at all, activation is refused (this Goal
// should go through `goal_initialization` first, not V3 activation — see
// ConfidencePublisherRegistry's `requiresPrior` on `v3_strategic_activation`).

import { createHash } from "node:crypto";
import { ConfidencePublisherRegistry } from "../confidence/ConfidencePublisherRegistry";
import { createCanonicalConfidenceReadService } from "../confidence/CanonicalConfidenceReadService";
import { createCanonicalConfidenceAssessmentV3 } from "../confidence/CanonicalConfidenceAssessmentModel";
import { deriveStrategicInterpretation } from "./StrategicInterpretationService";
import { projectStrategicConfidence } from "./StrategicConfidenceProjectionService";
import { generateNarrativeV3 } from "./NarrativeV3Service";
import { evaluateEvidenceEligibility } from "./EvidenceEligibilityService";

export const STRATEGIC_ACTIVATION_VERSION = "strategic_activation_v1";

export function createStrategicActivationService({
  registry = ConfidencePublisherRegistry,
  publicationService,
  buildInterpretationInput,
  now = () => new Date(),
} = {}) {
  if (typeof publicationService?.publish !== "function") {
    throw new Error("StrategicActivationService requires a publicationService with publish().");
  }
  if (typeof buildInterpretationInput !== "function") {
    throw new Error("StrategicActivationService requires buildInterpretationInput(context) — " +
      "the real-evidence adapter is caller-supplied so this module stays pure/testable.");
  }

  return Object.freeze({
    /**
     * @param goal            Canonical active Goal (already resolved by the
     *                        caller via `selectCanonicalActiveGoal`).
     * @param phase           Canonical active Phase (already resolved via
     *                        `resolveCommittedPhaseContext`).
     * @param store            The founder runtime store (or equivalent
     *                        repository facade) — passed through unchanged
     *                        to `buildInterpretationInput` and to the read
     *                        service; this module never reads raw evidence
     *                        collections directly.
     * @param evidenceCutoff   ISO timestamp. Defaults to `now()`.
     */
    async activate({ goal, phase, store, evidenceCutoff = now().toISOString() } = {}) {
      if (!goal?.id) throw new Error("Activation requires a resolved active Goal.");
      if (!phase?.id) throw new Error("Activation requires a resolved active Phase.");
      const cutoffIso = new Date(evidenceCutoff).toISOString();
      const goalId = goal.id;
      const phaseId = phase.id;

      // Computed from (goalId, phaseId, cutoff) ONLY — before touching any
      // continuity anchor — so a replay can be recognized and short-
      // circuited before it ever re-reads "latest user-facing Confidence".
      // This matters because that read would otherwise see THIS call's own
      // just-published record on a second invocation (a real activation
      // followed immediately by a retry/replay) and derive a NEW
      // previousPercentage from it — a self-referential loop that produces
      // a different assessment id under the same idempotencyKey, which the
      // publication service correctly rejects as a conflict rather than a
      // match. Recognizing the replay here, before any evidence/continuity
      // read, is what keeps activation idempotent rather than merely
      // fail-closed on the second call.
      const occurrenceId = deterministicId("v3_activation", goalId, phaseId, cutoffIso);
      const artifactId = deterministicId("v3_activation_artifact", goalId, phaseId, cutoffIso);
      const evidenceWindowId = deterministicId("v3_activation_window", goalId, phaseId, cutoffIso);
      const idempotencyKey = occurrenceId;

      const existingActivation = (store?.goalConfidenceHistory ?? [])
        .find((item) => item.assessment?.idempotencyKey === idempotencyKey);
      if (existingActivation) {
        return Object.freeze({
          status: "matched",
          committed: false,
          assessmentId: existingActivation.assessmentId,
          currentPercentage: existingActivation.assessment?.currentPercentage ?? null,
          previousPercentage: existingActivation.assessment?.priorPercentage ?? null,
          movement: existingActivation.assessment?.movement ?? null,
        });
      }

      const readService = createCanonicalConfidenceReadService({ store });
      const latest = readService.getLatestUserFacingConfidence({ goalId });
      if (!latest.assessment) {
        return Object.freeze({
          status: "refused_no_prior_assessment",
          reason: latest.reason ?? "canonical_series_unavailable",
        });
      }
      const previousPercentage = latest.assessment.currentPercentage;
      const confidenceBand = latest.assessment.confidenceBand;
      const priorAssessmentId = latest.assessment.id;
      const priorNarrativeSummary = latest.assessment.narrativeExplanation?.text ?? null;

      const interpretationInput = await buildInterpretationInput({
        goal, phase, store, evidenceCutoff: cutoffIso,
      });
      const eligibility = evaluateEvidenceEligibility({
        ...interpretationInput.eligibilityInput,
        asOf: cutoffIso,
      });
      const interpretation = deriveStrategicInterpretation(interpretationInput.interpretation);
      const projection = projectStrategicConfidence({
        previousPercentage,
        confidenceBand,
        interpretation,
        baseCeiling: interpretationInput.baseCeiling ?? 8,
      });
      const narrative = generateNarrativeV3({
        interpretation, eligibility, projection,
        goalTitle: goal.title ?? goal.name ?? "this Goal",
        priorNarrativeSummary,
      });

      const authorization = registry.authorize({
        publisherType: "v3_strategic_activation",
        userId: goal.userId ?? store?.user?.id ?? "founder",
        goalId,
        occurrenceId,
        artifactId,
        cadenceOrEventType: undefined,
        idempotencyKey,
        hasPriorAssessment: true,
        evidenceWindowClosed: true,
      });

      const assessment = createCanonicalConfidenceAssessmentV3({
        goalId,
        phaseId,
        goalContractId: goal.goalContractId ?? null,
        goalContractVersion: goal.goalContractVersion ?? goal.version ?? "unversioned",
        publisherType: "v3_strategic_activation",
        originatingBriefingId: occurrenceId,
        briefingArtifactId: artifactId,
        evidenceWindowId,
        priorAssessmentId,
        confidenceBand,
        interpretation,
        projection,
        narrative,
        eligibility,
        publicationTimestamp: now().toISOString(),
        sourceCutoff: cutoffIso,
        idempotencyKey,
        sourceLineage: { reason: "confidence_v3_activation" },
      });

      const artifact = Object.freeze({
        id: artifactId,
        schemaVersion: STRATEGIC_ACTIVATION_VERSION,
        goalId, phaseId,
        evidenceCutoff: cutoffIso,
        currentPercentage: projection.currentPercentage,
        confidenceBand,
        narrativeSummary: narrative.summary,
        confidencePublication: {
          schemaVersion: "briefing_confidence_binding_v2",
          assessmentId: assessment.id,
          publisherType: "v3_strategic_activation",
          originatingBriefingId: occurrenceId,
          publicationCutoff: cutoffIso,
          intelligenceRunId: occurrenceId,
        },
      });

      const commitResult = await publicationService.publish({
        authorization, artifact, assessment,
        expectedPriorAssessmentId: priorAssessmentId,
      });

      return Object.freeze({
        status: commitResult.status,
        committed: commitResult.committed,
        assessmentId: assessment.id,
        currentPercentage: projection.currentPercentage,
        previousPercentage,
        movement: projection.movement,
        artifact: commitResult.artifact ?? artifact,
        interpretation, projection, narrative, eligibility,
        commitResult,
      });
    },
  });
}

function deterministicId(kind, goalId, phaseId, cutoffIso) {
  const digest = createHash("sha256")
    .update(`${kind}|${goalId}|${phaseId}|${cutoffIso.slice(0, 10)}`)
    .digest("hex").slice(0, 24);
  return `${kind}|${digest}`;
}
