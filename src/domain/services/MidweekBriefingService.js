import { createMidweekEvidenceWindow, selectScheduledBriefingCadence } from "./BriefingEvidenceWindowService";
import { composeMidweekBriefingPreview, MIDWEEK_BRIEFING_TYPE, MIDWEEK_BRIEFING_VERSION } from "./MidweekBriefingPreviewService";
import { createMidweekPIShadowResult } from "./MidweekBriefingPIShadowService";
import { createMidweekPIAuthoritativeSelection } from "./MidweekBriefingPIShadowService";
import { createPIDecisionCadenceShadow } from "./PIDecisionCadenceShadowService";
import {
  CADENCE_RMR_STRATEGIES,
  createCadenceEnergyAssessment,
} from "./CadenceEnergyAssessmentService";
import { loadLatestCadenceBriefingContinuity } from "./CadenceBriefingContinuityService";
import { mergePIBriefingMemory } from "./PIBriefingMemoryService";
import { adaptMidweekPISelection } from "./MidweekPINarrativeCandidateService";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { createPhotoSessionReadModels } from "./CanonicalPhotoSessionReadService";
import { createCoachingUpdatesReadService } from "./CoachingUpdatesReadService";

// Explicit diagnostic boundary only. Production generation never invokes,
// returns, persists, renders, or hands off this result.
export function createMidweekBriefingPIShadowDiagnostic(input) {
  return createMidweekPIShadowResult(input);
}

export function getMidweekArtifactId({ userId, window }) {
  const owner = String(userId).replace(/[^a-z0-9_-]/gi, "_");
  return `midweek_briefing_${owner}_${window.startDate.replaceAll("-", "")}_${window.endDate.replaceAll("-", "")}`;
}

export function createMidweekBriefingService({ repositories, now = () => new Date() } = {}) {
  return {
    async generateForCurrentWindow({ userId, asOf = now() } = {}) {
      const user = userId ? await repositories.users.getUserById(userId) : await repositories.users.getCurrentUser();
      const resolvedUserId = user?.id ?? userId;
      if (!resolvedUserId) return { state: "not_eligible", reason: "user_not_found" };
      const timeZone = user?.timeZone ?? "America/Los_Angeles";
      const coachingUpdates = await createCoachingUpdatesReadService({ repositories })
        .getCurrent({ userId: resolvedUserId });
      if (selectScheduledBriefingCadence({ now: asOf, timeZone, coachingUpdates }) !== "midweek") {
        return { state: "not_eligible", reason: "not_wednesday" };
      }

      const window = createMidweekEvidenceWindow({ now: asOf, timeZone, coachingUpdates });
      const id = getMidweekArtifactId({ userId: resolvedUserId, window });
      const existing = await repositories.dailyBriefings.getBriefingByEvidenceWindow(resolvedUserId, window.id);
      if (existing?.briefing) return { state: "completed", artifact: existing, idempotent: true };

      const generatedAt = asOf.toISOString();
      const claim = await repositories.dailyBriefings.claimScheduledBriefing({ artifactId: id, evidenceWindow: window, claimedAt: generatedAt, userId: resolvedUserId });
      if (!claim.acquired) return { state: claim.state, artifact: claim.artifact, idempotent: true };

      try {
        const [canonicalObjects, weights, dexaScans, goal, progressPhotos, analyses] = await Promise.all([
          repositories.canonicalEvidence.listCanonicalEvidenceObjects(resolvedUserId),
          repositories.weights.listWeightEntries(resolvedUserId),
          repositories.dexaScans.listDEXAScans(resolvedUserId),
          repositories.goals.getActiveGoal(resolvedUserId),
          repositories.progressPhotos?.listPhotos(resolvedUserId) ?? [],
          repositories.analyses?.listAnalyses?.() ?? [],
        ]);
        const continuity = await loadLatestCadenceBriefingContinuity({
          repository: repositories.dailyBriefings,
          userId: resolvedUserId,
          cadence: "midweek",
          excludeArtifactId: id,
        });
        let authoritative = null;
        let piMemory = continuity.status === "available"
          ? continuity.memory ?? null
          : null;
        let currentEnergyAssessment = null;
        let comparisonEnergyAssessment = null;
        const activePhase = (goal?.phases ?? []).find(
          (phase) => phase.status === "active"
        ) ?? null;
        try {
          const comparisonWindow = {
            startDate: shiftDate(window.startDate, -7),
            endDate: shiftDate(window.endDate, -7),
            timeZone,
          };
          const energyInput = {
            cadence: "midweek",
            timeZone,
            nutritionDays: canonicalObjects.filter((item) => item.evidence_type === "nutrition"),
            activityDays: canonicalObjects.filter((item) => item.evidence_type === "activity_day"),
            dexaScans,
            rmrStrategy: CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
          };
          currentEnergyAssessment = createCadenceEnergyAssessment({
            ...energyInput,
            window,
            comparisonWindow,
          });
          comparisonEnergyAssessment = createCadenceEnergyAssessment({
            ...energyInput,
            window: comparisonWindow,
          });
          const trainingReport = createTrainingPerformanceIntelligenceReport({
            canonicalObjects: canonicalObjects.filter((item) =>
              String(item?.payload?.observed_at ?? item?.observed_at ?? "").slice(0, 10) <= window.endDate
            ),
            now: new Date(`${window.endDate}T12:00:00Z`),
            generatedAt,
          });
          authoritative = createMidweekPIAuthoritativeSelection({
            evidenceWindow: window,
            comparisonWindow,
            evaluationDate: window.briefingDate,
            timeZone,
            weights,
            trainingReport,
            canonicalTrainingEvidence: canonicalObjects.filter(
              (item) => (item?.payload ?? item)?.evidence_type === "training"
            ),
            recoveryEvidenceRecords: canonicalObjects
              .map((item) => item?.payload ?? item)
              .filter((item) => item?.schemaVersion === "recovery_evidence_v1"),
            currentEnergyAssessment,
            comparisonEnergyAssessment,
            activeGoal: goal,
            activePhase,
            dexaScans,
            photoSessions: createPhotoSessionReadModels({
              canonicalObjects,
              legacyPhotos: progressPhotos,
              weights,
              analyses,
            }),
            continuity,
          });
        } catch {
          authoritative = null;
        }
        const adaptedSelection = authoritative
          ? adaptMidweekPISelection(authoritative.selection)
          : null;
        const narrative = composeMidweekBriefingPreview({ window, timeZone, canonicalObjects, weights, dexaScans, goal, generatedAt, currentEnergyAssessment, comparisonEnergyAssessment, piNarrativeSelection: adaptedSelection });
        if (authoritative) {
          void createPIDecisionCadenceShadow({
            cadence: "midweek",
            evaluationDate: window.briefingDate,
            cadenceEligible: true,
            evidenceWindow: window,
            activeGoal: goal,
            activePhase,
            rankedCandidates: authoritative.candidates ?? [],
            claims: authoritative.shadow?.claims ?? [],
            lifecycle: authoritative.shadow?.lifecycleResult,
            evidenceCompleteness: {
              overall: currentEnergyAssessment?.coverage?.state === "complete"
                ? "complete" : "partial",
              training: authoritative.shadow?.coverage?.training === "available"
                ? "complete" : "partial",
              energy: currentEnergyAssessment?.coverage?.state === "complete"
                ? "complete" : "partial",
              recovery:
                authoritative.shadow?.recoveryPI?.assessment?.completeness ??
                "missing",
              bodyComposition: dexaScans.length ? "complete" : "missing",
            },
            eventAuthority: { state: "no_event" },
            recommendationMetadata: {
              id: narrative.coachingDecision?.type ?? null,
              kind: narrative.coachingDecision?.type ?? null,
              priority: null,
              count: narrative.coachingDecision ? 1 : 0,
              compatibility: "unknown",
            },
            existingRecommendation: narrative.coachingDecision,
            existingNarrative: {
              verdict: narrative.hero?.verdict ?? null,
              energy: narrative.energyBalance?.interpretation ?? null,
            },
            sundayHandoff: narrative.sundayContinuity,
            memory: continuity?.memory ?? null,
            priorDecisionMemory: null,
            renderingCompatible: false,
            memoryCompatible: false,
            integrationEnabled: false,
            limitations: ["midweek_decision_shadow_only"],
          });
        }
        const briefing = structuredClone(narrative);
        delete briefing.preview;
        briefing.id = id;
        briefing.persistence = { artifactPersisted: true, threadsPersisted: true, lifecycleAdvanced: true };
        briefing.openCoachingThreads = briefing.openCoachingThreads.map((thread) => ({ ...thread, lifecycle: { ...thread.lifecycle, persisted: true } }));
        const artifact = {
          id, userId: resolvedUserId, artifactType: "scheduled", cadence: "midweek", generatedAt,
          evidenceWindow: window,
          lifecycle: { generationStatus: "completed", claimedAt: claim.artifact.lifecycle.claimedAt, generatedAt, completedAt: generatedAt, failedAt: null, failureReason: null, openedAt: null, consumedAt: null },
          trigger: {}, briefing: { ...briefing, version: MIDWEEK_BRIEFING_VERSION, briefingType: MIDWEEK_BRIEFING_TYPE },
          source: { type: "computed", name: "PhysiqueOS", confidence: "high" },
          sourceRevisions: { goalId: goal?.id ?? null, phaseId: briefing.activePhase?.id ?? null },
          createdAt: claim.artifact.createdAt, updatedAt: generatedAt,
        };
        if (authoritative) {
          try {
            artifact.piMemory = mergePIBriefingMemory(
              piMemory,
              {
                communicatedClaimIds: authoritative.communicatedClaimIds,
                claims: authoritative.candidates,
                limitations: continuity.limitations,
              },
              { cadence: "midweek", briefingDate: window.briefingDate }
            );
          } catch {
            // Memory is optional and must never block briefing generation.
          }
        }
        const persisted = await repositories.dailyBriefings.completeScheduledBriefing(artifact);
        return { state: "completed", artifact: persisted, idempotent: false };
      } catch (error) {
        await repositories.dailyBriefings.failScheduledBriefing(id, { failedAt: now().toISOString(), reason: error instanceof Error ? error.message : "Midweek generation failed." });
        return { state: "failed", reason: "midweek_generation_failed", error };
      }
    },
  };
}


function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
