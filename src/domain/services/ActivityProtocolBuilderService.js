import { createActivityEvidenceSummary } from "./ActivityEvidenceSummaryService";

export const ACTIVITY_PROTOCOL_TYPE = "activity";
export const ACTIVITY_PROTOCOL_ID = "protocol_activity_founder_cut";
export const ACTIVITY_GOAL_ID = "goal_visible_abs_at_rest";

export function createActivityProtocolBuilderService({ repositories }) {
  return {
    async getBuilderContext(userId) {
      const [goal, operatingPlan, canonicalObjects, activeProtocol] = await Promise.all([
        repositories.goals.getGoalById(ACTIVITY_GOAL_ID),
        repositories.operatingPlan.getOperatingPlan(userId),
        repositories.canonicalEvidence.listCanonicalEvidenceObjects(userId),
        repositories.protocols.getActiveProtocolByType(userId, ACTIVITY_PROTOCOL_TYPE),
      ]);
      const currentVersion = activeProtocol
        ? await repositories.protocolVersions.getCurrentVersion(activeProtocol.id)
        : null;
      const defaultDailyTarget = Number(
        operatingPlan?.training?.estimatedDailyActiveCalories?.value ?? 1000
      );

      return {
        activeProtocol,
        currentVersion,
        defaultDailyTarget,
        defaultWeeklyTarget: deriveWeeklyActivityTarget(defaultDailyTarget),
        evidenceSummary: createActivityEvidenceSummary({ canonicalObjects }),
        goal: goal ?? { id: ACTIVITY_GOAL_ID, title: "Visible Abs at Rest" },
        phase: { id: "late_stage_cut", label: "Late-stage cut" },
        effectiveDateLabel: new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/Los_Angeles" }).format(new Date()),
      };
    },
  };
}

export function deriveWeeklyActivityTarget(dailyTarget) {
  return Math.round(Number(dailyTarget) * 7);
}

export function createFounderActivityProtocolActivation({
  dailyTarget,
  effectiveAt,
  userId,
  confirmedAt,
}) {
  const normalizedDailyTarget = Number(dailyTarget);
  const weeklyTarget = deriveWeeklyActivityTarget(normalizedDailyTarget);
  const timestamp = confirmedAt || new Date().toISOString();

  return {
    protocol: {
      id: ACTIVITY_PROTOCOL_ID,
      userId,
      protocolType: ACTIVITY_PROTOCOL_TYPE,
      category: "lifestyle",
      name: "Cut Activity",
    },
    version: {
      id: `${ACTIVITY_PROTOCOL_ID}_v1`,
      effectiveAt,
      author: { type: "user", id: userId, displayName: "Founder" },
      change: {
        reason: "Formalize the activity strategy supporting the current cut.",
        changedFields: [],
        previousVersionId: null,
      },
      goalLinks: [{ goalId: ACTIVITY_GOAL_ID, relationship: "supports" }],
      phaseContext: {
        id: "late_stage_cut",
        label: "Late-stage cut",
        confirmedByUser: true,
      },
      intent: {
        summary: `Sustain approximately ${normalizedDailyTarget.toLocaleString("en-US")} active calories per day while preserving recovery.`,
      },
      expectations: [{
        id: "daily_active_calories",
        metric: "apple_watch_active_calories",
        operator: "approximately",
        target: normalizedDailyTarget,
        unit: "active_kcal",
        cadence: "daily",
        includedEvidenceTypes: ["activity_day", "training_session"],
      }],
      evaluationWindows: [{
        id: "weekly_active_calories",
        cadence: "weekly",
        target: weeklyTarget,
        unit: "active_kcal",
        derivation: { type: "daily_target_times_days", dailyTarget: normalizedDailyTarget, days: 7 },
        evaluationMode: "trajectory",
        dailyVariationPolicy: "expected",
        weekStartsOn: "monday",
      }],
      coachingPolicy: {
        evaluationPriority: "weekly_trajectory",
        dailyNoisePolicy: "ignore_expected_variation",
        recoverableWeekPolicy: "stay_quiet",
        surfaceWhen: "meaningfully_trending_to_miss",
        dailyBriefingMateriality: "weekly_outlook_only",
        sundayWeeklyReview: "full_review_later",
        pushAlertsEnabled: false,
      },
      reviewTriggers: [
        { type: "goal_transition" },
        { type: "sustained_recovery_concern" },
        { type: "persistent_execution_change" },
      ],
      evidenceBasis: {
        evidenceTypes: ["activity_day"],
        directEvidenceConfidence: "moderate",
        directEvidenceWindow: { approximateDays: 7 },
        limitations: ["Direct Activity evidence currently covers only the recent period."],
        historicalClaimPolicy: "Do not attribute broader cut progress to the recent Activity evidence.",
      },
      confirmation: {
        confirmedByUser: true,
        confirmedAt: timestamp,
        statement: "The recent Activity pattern represents the strategy followed throughout the cut.",
        authority: "founder_confirmation",
        protocolConfidence: "high",
      },
      createdAt: timestamp,
    },
  };
}
