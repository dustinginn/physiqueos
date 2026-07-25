import { stableNestedId, stableTransitionId } from "../models/goalTransitionDraft";

const SECTION_IDS = ["completion", "objective", "guardrails", "supporting", "evidence", "operating", "strategy", "commitments", "cadence", "review"];

export function createGoalTransitionService({ repositories, now = () => new Date() } = {}) {
  return {
    async getOrPreview({ userId, sourceGoalId }) {
      const existing = await repositories.goalTransitionDrafts.getLatestActiveForSourceGoal(userId, sourceGoalId);
      return existing ?? buildDraft(await loadContext(repositories, userId, sourceGoalId), now());
    },
    async saveSection({ userId, sourceGoalId, section, patch = {}, currentSection }) {
      const existing = await repositories.goalTransitionDrafts.getLatestActiveForSourceGoal(userId, sourceGoalId);
      const draft = existing ?? buildDraft(await loadContext(repositories, userId, sourceGoalId), now());
      if (!SECTION_IDS.includes(section)) throw new Error("Unknown transition section.");
      const updated = {
        ...draft,
        [sectionMap(section)]: mergeSection(draft[sectionMap(section)], patch),
        currentSection: currentSection ?? draft.currentSection,
        completedSections: [...new Set([...draft.completedSections, section])],
        updatedAt: now().toISOString(),
      };
      updated.generatedCommitments = generateCommitments(updated);
      return repositories.goalTransitionDrafts.save(updated);
    },
    async markReady({ userId, sourceGoalId }) {
      const draft = await repositories.goalTransitionDrafts.getLatestActiveForSourceGoal(userId, sourceGoalId);
      if (!draft) throw new Error("Save the transition draft before review.");
      const validation = validateGoalTransitionDraft(draft);
      if (!validation.valid) throw new Error(validation.errors.join(" "));
      const stamp = now().toISOString();
      return repositories.goalTransitionDrafts.save({ ...draft, status: "ready", acceptedAt: draft.acceptedAt ?? stamp, consumed: false, currentSection: "review", completedSections: [...new Set([...draft.completedSections, "review"])], updatedAt: stamp });
    },
  };
}

export function validateGoalTransitionDraft(draft) {
  const errors = [];
  if (!draft?.primaryObjective?.title?.trim()) errors.push("Choose a primary objective.");
  const acceptedEvidence = [...(draft?.evidenceStrategy?.outcomeMeasures ?? []), ...(draft?.evidenceStrategy?.predictiveSignals ?? []), ...(draft?.evidenceStrategy?.explanatorySignals ?? [])].filter((item) => item.accepted);
  if (!acceptedEvidence.some((item) => item.role === "outcome")) errors.push("Accept at least one outcome measure.");
  if (!acceptedEvidence.some((item) => item.role === "predictive")) errors.push("Accept at least one predictive signal.");
  return { valid: errors.length === 0, errors };
}

export function buildGoalTransitionDraft(context, createdAt = new Date()) {
  return buildDraft(context, createdAt);
}

function buildDraft({ userId, goal, dexa, photoEvent, protocols, weights }, createdAt) {
  const id = stableTransitionId(goal.id);
  const stamp = createdAt.toISOString();
  const measure = (kind, label, role, importance, explanation, accepted = true) => ({ id: stableNestedId(id, "evidence", kind), evidenceType: kind, label, role, importance, explanation, accepted });
  const guardrail = (key, text, accepted = false) => ({ id: stableNestedId(id, "guardrail", key), text, accepted, recommendationSource: "coach_transition_v1" });
  const protocolReviews = buildProtocolReviews(id, protocols);
  return {
    id, userId, sourceGoalId: goal.id, status: "draft", createdAt: stamp, updatedAt: stamp,
    sourceGoalSnapshot: { title: goal.title, status: goal.status, lifecycle: "completion_recommended", userDecisionPending: true },
    primaryObjective: { id: stableNestedId(id, "objective", "lean_mass"), type: "build_lean_mass", title: "Build Lean Mass", recommendationReason: "The cut established a lean starting point. The next useful chapter is to add tissue without giving back that body-composition result." },
    guardrails: [
      guardrail("body_fat", "Maintain approximately 8–9% body fat."),
      guardrail("gradual_gain", "Keep weight gain gradual."),
      guardrail("recovery", "Maintain recovery quality."),
      guardrail("strength", "Avoid sustained strength regression."),
    ],
    supportingObjectives: ["Chest", "Shoulders", "Arms", "Back", "Lower Body", "Core"].map((title) => ({ id: stableNestedId(id, "support", title), title, accepted: false })),
    evidenceStrategy: {
      outcomeMeasures: [
        measure("dexa_lean_mass", "DEXA lean mass", "outcome", "defining", "Directly measures whether the primary objective is occurring."),
        measure("dexa_fat_mass", "DEXA fat mass", "outcome", "strong", "Tests whether gain remains inside the body-fat guardrail."),
        measure("dexa_body_fat", "DEXA body-fat percentage", "outcome", "strong", "Keeps the composition boundary visible."),
      ],
      predictiveSignals: [
        measure("progressive_overload", "Progressive overload", "predictive", "strong", "Productive training progression should precede measurable tissue gain."),
        measure("training_trend", "Training-performance trend", "predictive", "strong", "Multi-session performance matters more than isolated PRs."),
        measure("scale_weight", "Scale-weight trend", "predictive", "supporting", "Weight alone cannot distinguish lean gain from fat gain."),
        measure("progress_photos", "Progress photos", "predictive", "supporting", "Photos add shape and proportion context between DEXA scans."),
      ],
      explanatorySignals: [
        ["calories", "Calorie intake"], ["protein", "Protein intake"], ["macros", "Carbohydrate and fat intake"], ["activity", "Activity expenditure"], ["recovery", "Recovery"], ["sleep", "Sleep"], ["adherence", "Protocol adherence"],
      ].map(([key, label]) => measure(key, label, "explanatory", "contextual", "Helps explain why outcome and performance measures changed.")),
    },
    operatingState: { value: "calibration", accepted: true, recommendationReason: "We know the starting body composition, but true maintenance intake, productive surplus, and sustainable activity are still unknown.", known: ["Current body composition", "Recent cut intake", "Recent activity target", "Recent training structure", "Protein adherence history"], unknown: ["True maintenance intake", "Productive calorie surplus", "Optimal cardio reduction", "Expected rate of weight gain"] },
    protocolReviews,
    generatedCommitments: [],
    briefingCadence: { type: "twice_weekly", days: ["wednesday", "sunday"], recommendationReason: "Lean-mass progress is better interpreted across several days than through daily fluctuations. Event Briefings remain independent." },
    openingBaseline: buildBaseline(dexa, photoEvent, protocols, weights),
    coachRecommendations: { version: "goal_transition_recommendations_v1", summary: "Begin with calibration, preserve defining evidence, and adapt cut-specific energy and activity strategies." },
    currentSection: "completion", completedSections: [],
  };
}

function buildProtocolReviews(draftId, protocols) {
  const categories = [
    ["energy", "Energy Balance", null, "modify", "The previous strategy sustained a deficit. The next chapter begins by learning maintenance."],
    ["nutrition", "Nutrition", "nutrition", "modify", "Protein remains important, while calories and macros may need to rise."],
    ["training", "Resistance Training", "training", "keep", "The existing structure can carry forward while hypertrophy emphasis is reviewed."],
    ["activity", "Cardio and Activity", "activity", "modify", "The prior activity target should not remain a fixed success requirement."],
    ["recovery", "Recovery", null, "keep", "Recovery support remains useful unless new evidence suggests a change."],
    ["weight", "Weight Tracking", null, "keep", "Keep daily collection while reducing single-day narrative importance."],
    ["photos", "Progress Photos", null, "keep", "Photos remain useful at a less frequent cadence."],
    ["dexa", "DEXA", null, "keep", "DEXA is a defining outcome measure for lean-mass gain."],
    ["briefings", "Briefings", null, "modify", "Twice-weekly interpretation better matches slower body-composition change."],
  ];
  return categories.map(([key, name, type, disposition, reason]) => {
    const protocol = protocols.find((item) => item.protocolType === type) ?? null;
    return { id: stableNestedId(draftId, "protocol", key), category: key, protocolId: protocol?.id ?? `virtual_${key}`, protocolType: type ?? key, sourceVersionId: protocol?.currentVersionId ?? null, name, currentStrategy: protocol?.name ?? "Current evidence and operating-plan strategy", recommendation: disposition, recommendationReason: reason, selectedDisposition: disposition, proposedChanges: {}, editStatus: disposition === "modify" ? "review_required" : "unchanged", hasHistory: Boolean(protocol?.currentVersionId) };
  });
}

function buildBaseline(dexa, photoEvent, protocols, weights) {
  const recent = weights.slice(-7);
  const values = recent.map((item) => Number(item.weight?.value)).filter(Number.isFinite);
  return {
    date: String(dexa?.measuredAt ?? "").slice(0, 10) || null,
    dexaWeight: dexa?.totalMass?.value ?? dexa?.totalMass ?? null,
    leanMass: dexa?.leanMass?.value ?? dexa?.leanMass ?? null,
    fatMass: dexa?.fatMass?.value ?? dexa?.fatMass ?? null,
    bodyFatPercentage: dexa?.bodyFatPercentage?.value ?? dexa?.bodyFatPercentage ?? null,
    scaleTrend: values.length ? { average: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)), first: values[0], last: values.at(-1) } : null,
    trainingPerformanceState: "Recent training remained productive; progression should be evaluated conservatively across multiple sessions.",
    latestPhotoSessionId: photoEvent?.trigger?.evidenceId ?? null,
    activeProtocolIds: protocols.map((item) => item.id),
  };
}

function generateCommitments(draft) {
  const existing = new Map((draft.generatedCommitments ?? []).map((item) => [item.id, item]));
  const rows = [
    ["weight", "daily", "Log morning weight."], ["nutrition", "daily", "Log nutrition."], ["nutrition", "daily", "Meet the protein minimum."], ["training", "daily", "Complete scheduled training or recovery work."],
    ["training", "weekly", "Complete the resistance-training schedule."], ["weight", "weekly", "Review weight trend rather than single-day movement."], ["energy", "weekly", "Review calorie intake and activity together."], ["training", "weekly", "Evaluate training progression."],
    ["photos", "periodic", "Complete progress photos on the selected cadence."], ["dexa", "periodic", "Complete DEXA scans on the selected cadence."], ["energy", "periodic", "Reassess the energy-balance protocol during calibration."],
  ];
  return rows.map(([category, frequency, requirement]) => {
    const review = draft.protocolReviews.find((item) => item.category === category);
    const id = stableNestedId(draft.id, "commitment", `${category}_${frequency}_${requirement}`);
    return { id, sourceProtocolId: review?.protocolId ?? `virtual_${category}`, frequency, requirement, origin: review?.selectedDisposition === "modify" ? "modified" : review?.protocolId?.startsWith("virtual_") ? "new" : "inherited", accepted: existing.get(id)?.accepted ?? true };
  });
}

async function loadContext(repositories, userId, sourceGoalId) {
  const [goal, scans, artifacts, protocols, weights] = await Promise.all([repositories.goals.getGoalById(sourceGoalId), repositories.dexaScans.listDEXAScans(userId), repositories.dailyBriefings.listDailyBriefings(userId), repositories.protocols.listActiveProtocols(userId), repositories.weights.listWeightEntries(userId)]);
  if (!goal) throw new Error("Source goal was not found.");
  const dexa = [...scans].sort((a, b) => String(b.measuredAt).localeCompare(String(a.measuredAt)))[0] ?? null;
  const photoEvent = artifacts.filter((item) => item.trigger?.evidenceType === "photo_session").sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)))[0] ?? null;
  return { userId, goal, dexa, photoEvent, protocols, weights: [...weights].sort((a, b) => String(a.measuredAt).localeCompare(String(b.measuredAt))) };
}

function sectionMap(section) {
  return ({ objective: "primaryObjective", evidence: "evidenceStrategy", operating: "operatingState", strategy: "protocolReviews", commitments: "generatedCommitments", cadence: "briefingCadence" })[section] ?? section;
}
function mergeSection(current, patch) {
  if (Array.isArray(current)) return Array.isArray(patch) ? patch : current;
  return { ...current, ...patch };
}
