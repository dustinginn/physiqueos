export const NARRATIVE_CONSUMER_CLASSIFICATION = Object.freeze({
  DYNAMIC_V3_NARRATIVE: "DYNAMIC_V3_NARRATIVE",
  STATIC_GOAL_PHASE_PURPOSE: "STATIC_GOAL_PHASE_PURPOSE",
  V2_STRATEGIC_NARRATIVE: "V2_STRATEGIC_NARRATIVE",
  FACTUAL_DOMAIN_PRESENTATION: "FACTUAL_DOMAIN_PRESENTATION",
  NEUTRAL_INGESTION_RECONCILIATION: "NEUTRAL_INGESTION_RECONCILIATION",
  STATIC_PRODUCT_COPY: "STATIC_PRODUCT_COPY",
  SPECIALIZED_FUTURE_WORK: "SPECIALIZED_FUTURE_WORK",
});

// This catalog makes the product boundary explicit. In particular, Goal-aware
// copy is not automatically dynamic Narrative V3: strategy-purpose text is
// regenerated only from structural Goal/Phase/Strategy changes.
export const NARRATIVE_V3_CONSUMER_OWNERSHIP = deepFreeze([
  entry("home_confidence", "Home Confidence card and detail", "BOTH",
    "DYNAMIC_V3_NARRATIVE", true, true, true, false,
    "canonical V3 Confidence publication", "GLANCE_TO_MEDIUM",
    "ActiveGoalConfidencePresentationReadService", "Home Confidence", "ALREADY_WIRED"),
  entry("home_goal_phase_headline", "Home Goal/Phase headline", "BOTH",
    "FACTUAL_DOMAIN_PRESENTATION", false, true, true, false,
    "Goal or Phase state change", "GLANCE", "HomeGoalTrajectoryService",
    "GoalsCard / Native Home Goals", "NO_DYNAMIC_V3_NEEDED"),
  entry("goal_hub_status", "Goal Hub achievement/status cue", "BOTH",
    "DYNAMIC_V3_NARRATIVE", true, true, true, false,
    "canonical V3 Confidence publication", "GLANCE",
    "GoalsHubReadService + ActiveGoalConfidencePresentationReadService",
    "GoalsHubScreen / Native Goals", "ALREADY_WIRED"),
  prior(entry("active_goal_synthesis", "Active Goal strategic synthesis", "BOTH",
    "DYNAMIC_V3_NARRATIVE", true, true, true, true,
    "eligible evidence or canonical V3 publication", "MEDIUM",
    "canonical current V3 strategic interpretation",
    "PhaseAwareActiveGoalPreviewScreen / Native Active Goal", "WIRE_LATER")),
  prior(entry("goal_transition_review", "Goal transition/review", "WEB",
    "V2_STRATEGIC_NARRATIVE", true, true, true, true,
    "transition evidence, selection, or Goal transition state", "MEDIUM",
    "GoalTransitionService", "GoalTransitionPreviewScreen", "WIRE_LATER")),
  prior(entry("phase_review_recommendation", "Phase review recommendation", "WEB",
    "V2_STRATEGIC_NARRATIVE", true, true, true, true,
    "eligible review evidence or decision state", "MEDIUM",
    "GoalAwarePhaseReviewRecommendationService",
    "PhaseReviewCard", "WIRE_LATER")),
  prior(entry("priority_goal_purpose", "Priority Goal-relative explanation", "BOTH",
    "STATIC_GOAL_PHASE_PURPOSE", false, true, true, true,
    "Priority definition, Goal, Phase, or linked strategy change", "ONE_LINE",
    "PriorityDetailService", "PriorityDetailScreen / Native Priority Detail",
    "STATIC_PURPOSE_ONLY")),
  entry("operating_plan_overview", "Operating Plan overview", "BOTH",
    "FACTUAL_DOMAIN_PRESENTATION", false, false, false, true,
    "strategy/protocol availability or configuration change", "NONE",
    "OperatingPlanReadService", "OperatingPlanScreen / Native Operating Plan",
    "NO_DYNAMIC_V3_NEEDED"),
  ...[
    ["energy", "Operating Plan Energy", "OperatingPlanStrategyDetailService"],
    ["nutrition", "Operating Plan Nutrition", "OperatingPlanStrategyDetailService"],
    ["training", "Operating Plan Training", "OperatingPlanStrategyDetailService"],
    ["recovery", "Operating Plan Recovery", "StrategyDomainReadService"],
    ["peptides", "Operating Plan Peptides", "StrategyDomainReadService"],
    ["supplements", "Operating Plan Supplements", "StrategyDomainReadService"],
    ["tracking", "Operating Plan Tracking", "TrackingSupportService"],
    ["coaching_updates", "Operating Plan Coaching Updates", "OperatingPlanStrategyDetailService"],
  ].map(([id, surface, source]) => prior(entry(`operating_plan_${id}`, surface,
    "BOTH", "STATIC_GOAL_PHASE_PURPOSE", false, true, true, true,
    "Goal, Phase, strategy configuration, or strategy revision", "SHORT",
    source, "Operating Plan detail (Web and Native)", "STATIC_PURPOSE_ONLY"))),
  ...[
    ["training", "Training factual detail", "Training reporting read models"],
    ["nutrition", "Nutrition factual detail", "Nutrition reporting read models"],
    ["activity", "Activity factual detail", "Activity evidence read models"],
    ["weight", "Weight factual detail", "Weight reporting read models"],
  ].map(([id, surface, source]) => prior(entry(`goal_relative_${id}`, surface,
    "BOTH", "FACTUAL_DOMAIN_PRESENTATION", false, true, true, false,
    "canonical domain evidence change", "NONE", source,
    `${surface} (Web and Native)`, "NO_DYNAMIC_V3_NEEDED"))),
  prior(entry("dexa_detail", "DEXA measurement history/detail", "BOTH",
    "FACTUAL_DOMAIN_PRESENTATION", false, true, true, false,
    "canonical DEXA record change", "NONE", "ProgressEvidenceReadService",
    "DEXAReportScreen / Native DEXA Detail", "NO_DYNAMIC_V3_NEEDED")),
  entry("dexa_event", "DEXA Event", "BOTH", "DYNAMIC_V3_NARRATIVE", true,
    true, true, true, "eligible DEXA Event publication", "FULL",
    "canonical DEXA Event V3 publication", "DEXA Event detail", "ALREADY_WIRED"),
  entry("photo_event_briefing", "Photo Event / Photo Briefing", "BOTH",
    "DYNAMIC_V3_NARRATIVE", true, true, true, true,
    "eligible Photo Event publication", "MEDIUM_TO_FULL",
    "canonical Photo V3 publication", "Photo Event / Briefing detail",
    "ALREADY_WIRED"),
  entry("progress_photos_detail", "Progress Photos history/detail/comparison", "BOTH",
    "SPECIALIZED_FUTURE_WORK", false, true, true, false,
    "canonical photo or visual presentation change", "NONE",
    "ProgressPhotosReadService", "Progress Photos visual surfaces",
    "DEFER_SPECIAL_PROJECT"),
]);

export function summarizePreviouslyIntendedV3Ownership() {
  const priorItems = NARRATIVE_V3_CONSUMER_OWNERSHIP.filter((item) =>
    item.previouslyIntendedV3 === true);
  return Object.freeze({
    previousCount: priorItems.length,
    correctedDynamicNotYetWired: priorItems.filter((item) =>
      item.dynamicEvidenceReactive && item.v3Action === "WIRE_LATER").length,
    staticGoalPhasePurpose: priorItems.filter((item) =>
      item.classification === "STATIC_GOAL_PHASE_PURPOSE").length,
    otherReclassified: priorItems.filter((item) =>
      !item.dynamicEvidenceReactive &&
      item.classification !== "STATIC_GOAL_PHASE_PURPOSE").length,
  });
}

function entry(id, surface, platform, classification, dynamicEvidenceReactive,
  goalAware, phaseAware, strategyAware, updateTrigger, expectedDensity,
  canonicalSource, currentConsumer, v3Action) {
  return { id, surface, platform, classification, dynamicEvidenceReactive,
    goalAware, phaseAware, strategyAware, updateTrigger, expectedDensity,
    canonicalSource, currentConsumer, v3Action };
}

function prior(value) { return { ...value, previouslyIntendedV3: true }; }

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
