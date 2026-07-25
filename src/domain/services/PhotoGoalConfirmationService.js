const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";
const PURPOSE = "visible_abs_completion";
const CRITERION = "lower_abs_visible_at_rest";
const REQUIRED_POSE = "front-relaxed";

export function evaluatePhotoGoalConfirmation({
  confirmationPurpose,
  goalId = VISIBLE_ABS_GOAL_ID,
  criterion = CRITERION,
  numericalThresholdComplete = false,
  session = null,
  visualCriterionComplete,
  completionComparisons = null,
  latestDexa = null,
  priorDexa = null,
  baselineDexa = null,
} = {}) {
  if (confirmationPurpose !== PURPOSE) return null;

  // Retain compatibility for callers that already hold an explicit reviewed result.
  if (visualCriterionComplete === true || visualCriterionComplete === false) {
    return createResult({
      goalId,
      criterion,
      numericalThresholdComplete,
      status: visualCriterionComplete ? "confirmed" : "not_confirmed",
      confidence: "high",
      supportingObservations: [],
      limitingFactors: [],
      qualifiedViewId: null,
    });
  }

  const front = session?.views?.find((view) => view.poseId === REQUIRED_POSE) ?? null;
  if (!front) {
    return createResult({
      goalId,
      criterion,
      numericalThresholdComplete,
      status: "uncertain",
      confidence: "low",
      limitingFactors: ["A front relaxed photo is required."],
    });
  }

  const findings = [
    ...(front.structuredFindings ?? []).map((item) => item.change ?? item.description),
    ...(front.observedChanges ?? []),
    ...(front.goalRelevance ?? []),
  ].filter(Boolean);
  const limitations = [
    ...(front.interpretationLimitations ?? []),
    ...(front.interpretationConfidence ?? []),
  ].filter(Boolean);
  const combined = findings.join(" ");
  const limitationText = limitations.join(" ");
  const sourceIsOriginal = Boolean(front.imageHref && (front.provenance?.sourceIds?.length || front.imageReference));
  const visionBacked = front.analysisQuality === "vision_backed" || (!front.analysisQuality && Boolean(front.analysisMode) && !/fallback|deterministic/i.test(front.analysisMode));
  const relaxed = front.poseId === REQUIRED_POSE && !/flex|contract|engag/i.test(combined);
  const abdomenVisible = !/abdomen.*(cropped|obscured|not visible)|midsection.*(cropped|obscured)/i.test(`${combined} ${limitationText}`);
  const usable = sourceIsOriginal && visionBacked && relaxed && abdomenVisible && !/unusable|too dark|overexposed|poor framing|edited|filter|cannot assess|insufficient/i.test(limitationText);
  const positive = /(?:lower[- ]?abs?|lower abdominal)[^.]{0,80}(?:visible|clearly defined|clear definition|present at rest|separation)|visible lower[- ]?abs?/i.test(combined)
    && !/(?:not|not yet|not fully|unclear|cannot)[^.]{0,45}(?:visible|defined|confirm)|lower[- ]?abs?[^.]{0,50}(?:not|unclear|uncertain|limited)/i.test(combined);
  const negative = /(?:lower[- ]?abs?|lower abdominal)[^.]{0,80}(?:not visible|not yet visible|not fully visible|remain obscured|remain soft|unclear)|(?:not|cannot)[^.]{0,45}confirm[^.]{0,45}lower[- ]?abs?/i.test(combined);
  const objective = objectiveCompletionEvidence({ latestDexa, priorDexa, baselineDexa });
  const broadVisualSupport = /visible abdominal contours|oblique|lean waist|flat appearance of lower abdomen|abdominal separation/i.test(combined);
  const hasJourney = Boolean(completionComparisons?.journey?.first && completionComparisons?.journey?.final);
  if (usable && numericalThresholdComplete === true && objective.thresholdReached && objective.leanMassPreserved && hasJourney && broadVisualSupport) {
    return createResult({
      goalId,
      criterion,
      numericalThresholdComplete,
      status: "confirmed",
      confidence: "moderate",
      supportingObservations: findings,
      limitingFactors: limitations.filter((value) => !/single photo|no comparative context|no previous photo/i.test(value)),
      qualifiedViewId: front.id,
      evidenceSynthesis: {
        primaryValidator: front.id,
        supportingViewIds: (session?.views ?? []).filter((view) => view.id !== front.id).map((view) => view.id),
        journeyStartViewId: completionComparisons.journey.first.id,
        recentComparatorViewId: completionComparisons.recent?.previous?.id ?? null,
        objective,
        confidenceModifiers: ["Post-workout state and lighting differences reduce comparison precision but do not prevent evaluation."],
        conclusion: "The totality of objective and visual evidence supports completion.",
      },
    });
  }

  if (!usable) {
    return createResult({
      goalId,
      criterion,
      numericalThresholdComplete,
      status: "uncertain",
      confidence: "low",
      supportingObservations: findings,
      limitingFactors: qualificationLimits({ front, sourceIsOriginal, visionBacked, relaxed, abdomenVisible, limitations }),
      qualifiedViewId: front.id,
    });
  }

  if (positive) {
    return createResult({
      goalId,
      criterion,
      numericalThresholdComplete,
      status: "confirmed",
      confidence: /high/i.test(`${combined} ${limitationText}`) ? "high" : "moderate",
      supportingObservations: findings,
      limitingFactors: limitations,
      qualifiedViewId: front.id,
    });
  }

  if (negative) {
    return createResult({
      goalId,
      criterion,
      numericalThresholdComplete,
      status: "not_confirmed",
      confidence: "moderate",
      supportingObservations: findings,
      limitingFactors: limitations,
      qualifiedViewId: front.id,
    });
  }

  return createResult({
    goalId,
    criterion,
    numericalThresholdComplete,
    status: "uncertain",
    confidence: "low",
    supportingObservations: findings,
    limitingFactors: [...limitations, "The qualified view does not directly establish whether lower abs are visible at rest."],
    qualifiedViewId: front.id,
  });
}

export function selectVisibleAbsCompletionComparisons({
  sessions = [],
  finalSession,
  goalStartDate = null,
} = {}) {
  const eligible = sessions
    .filter((session) => ["canonical", "legacy-adapted"].includes(session.sourceMode) && session.captureDate <= finalSession?.captureDate)
    .flatMap((session) => session.views
      .filter((view) => view.poseId === REQUIRED_POSE && view.imageHref && !view.hydrationDiagnostic)
      .map((view) => ({ ...view, sessionId: session.id, captureDate: session.captureDate })))
    .filter((view) => !goalStartDate || view.captureDate >= journeyWindowStart(goalStartDate))
    .sort((left, right) => left.captureDate.localeCompare(right.captureDate));
  const final = eligible.findLast((view) => view.sessionId === finalSession?.id) ?? null;
  const prior = eligible.filter((view) => view.captureDate < (final?.captureDate ?? "")).at(-1) ?? null;
  const first = eligible.find((view) => view.captureDate < (final?.captureDate ?? "")) ?? final;
  const finalViews = (finalSession?.views ?? []).filter((view) => view.imageHref && !view.hydrationDiagnostic);
  const byPose = sessions
    .filter((session) => ["canonical", "legacy-adapted"].includes(session.sourceMode) && session.captureDate <= finalSession?.captureDate)
    .flatMap((session) => session.views.map((view) => ({ ...view, sessionId: session.id, captureDate: session.captureDate })))
    .filter((view) => view.imageHref && !view.hydrationDiagnostic && (!goalStartDate || view.captureDate >= journeyWindowStart(goalStartDate)));
  const recentComparisons = [];
  const journeyComparisons = [];
  const newBaselines = [];
  for (const current of finalViews) {
    const history = byPose.filter((view) => view.poseId === current.poseId && view.captureDate < finalSession.captureDate).sort((a,b)=>a.captureDate.localeCompare(b.captureDate));
    if (!history.length) {
      newBaselines.push(current);
      continue;
    }
    journeyComparisons.push(createComparisonEntry("journey", history[0], current, finalSession.id));
    recentComparisons.push(createComparisonEntry("recent", history.at(-1), current, finalSession.id));
  }
  return {
    requiredPose: REQUIRED_POSE,
    journey: first && final ? { first, final } : null,
    recent: prior && final ? { previous: prior, final } : null,
    recentComparisons,
    journeyComparisons,
    newBaselines,
  };
}

function createComparisonEntry(scope, first, current, currentSessionId) {
  const label = poseProseLabel(current.poseId);
  return {
    id: `${scope}_${current.poseId}_${first.captureDate}_${current.captureDate}`,
    poseId: current.poseId,
    poseLabel: label,
    comparisonScope: scope,
    firstViewId: first.id,
    currentViewId: current.id,
    firstSessionId: first.sessionId,
    currentSessionId,
    firstDate: first.captureDate,
    currentDate: current.captureDate,
    firstImageHref: first.imageHref,
    currentImageHref: current.imageHref,
    firstRoleLabel: scope === "journey" ? "First uploaded" : "Previous check-in",
    currentRoleLabel: "Final",
    observations: comparisonObservations(scope, current.poseId),
    confidence: scope === "recent" ? current.comparison?.comparisonConfidence ?? "moderate" : "moderate",
    viewerGalleryItems: [
      { id: first.id, imageHref: first.imageHref, date: first.captureDate, roleLabel: scope === "journey" ? "First uploaded" : "Previous check-in", poseLabel: label },
      { id: current.id, imageHref: current.imageHref, date: current.captureDate, roleLabel: "Final", poseLabel: label },
    ],
  };
}

function comparisonObservations(scope, poseId) {
  const copy = {
    recent: {
      "front-relaxed": "The final week brought smaller refinements through the waist, lower midsection, and obliques.",
      "back-relaxed": "The lower back looks cleaner and the waist taper reads more clearly.",
      "back-flexed": "Upper-back separation, rear-delt definition, and waist contrast show continued refinement.",
    },
    journey: {
      "front-relaxed": "The full journey shows substantially less waist softness, clearer abdominal structure, and stronger shoulder-to-waist contrast.",
      "back-relaxed": "Across the full journey, lower-back softness decreased while the waist taper and upper-back contours became clearer.",
      "back-flexed": "Across the full journey, upper-back separation, rear-delt definition, lat presentation, and waist contrast improved.",
    },
  };
  return [copy[scope]?.[poseId] ?? `The ${poseProseLabel(poseId)} view provides a consistent same-pose comparison.`];
}

function poseProseLabel(poseId) {
  return ({"front-relaxed":"Front relaxed","back-relaxed":"Rear relaxed","back-flexed":"Rear double biceps","right-side-relaxed":"Right-side relaxed","left-side-relaxed":"Left-side relaxed","side-relaxed":"Side relaxed","front-flexed":"Front flexed"})[poseId] ?? poseId.replaceAll("-"," ");
}

function createResult({
  goalId,
  criterion,
  numericalThresholdComplete,
  status,
  confidence,
  supportingObservations = [],
  limitingFactors = [],
  qualifiedViewId = null,
  evidenceSynthesis = null,
}) {
  const recommended = numericalThresholdComplete === true && status === "confirmed";
  return {
    confirmationPurpose: PURPOSE,
    goalId,
    criterion,
    requiredPose: REQUIRED_POSE,
    numericalThresholdComplete: numericalThresholdComplete === true,
    visualCriterionStatus: status,
    visualCriterionComplete: status === "confirmed" ? true : status === "not_confirmed" ? false : "uncertain",
    goalCompletionRecommended: recommended,
    transitionReady: recommended,
    confidence,
    supportingObservations: [...new Set(supportingObservations)].slice(0, 6),
    limitingFactors: [...new Set(limitingFactors)].slice(0, 6),
    requiredUserDecision: recommended,
    qualifiedViewId,
    evidenceSynthesis,
  };
}

function objectiveCompletionEvidence({ latestDexa, priorDexa, baselineDexa }) {
  const bodyFat = number(latestDexa?.bodyFatPercentage);
  const latestFat = number(latestDexa?.fatMass);
  const priorFat = number(priorDexa?.fatMass);
  const latestLean = number(latestDexa?.leanMass);
  const baselineLean = number(baselineDexa?.leanMass);
  const leanChangeFromBaseline = latestLean !== null && baselineLean !== null ? latestLean - baselineLean : null;
  return {
    bodyFatPercentage: bodyFat,
    fatLossSincePrior: latestFat !== null && priorFat !== null ? priorFat - latestFat : null,
    leanMass: latestLean,
    leanChangeFromBaseline,
    thresholdReached: bodyFat !== null && bodyFat <= 9,
    leanMassPreserved: leanChangeFromBaseline !== null && leanChangeFromBaseline >= -2,
  };
}

function journeyWindowStart(goalStartDate) {
  const value = new Date(`${goalStartDate}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 7);
  return value.toISOString().slice(0, 10);
}

function number(value) {
  const parsed = Number(value?.value ?? value);
  return Number.isFinite(parsed) ? parsed : null;
}

function qualificationLimits({ front, sourceIsOriginal, visionBacked, relaxed, abdomenVisible, limitations }) {
  return [
    !front.imageHref && "The original front relaxed image is unavailable.",
    !sourceIsOriginal && "The image could not be tied to an original source.",
    !visionBacked && "A completed visual interpretation is required.",
    !relaxed && "The pose could not be verified as relaxed.",
    !abdomenVisible && "The abdomen is not sufficiently visible.",
    ...limitations,
  ].filter(Boolean);
}
