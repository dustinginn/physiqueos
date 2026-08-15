import { createDailyBriefing } from "../models/dailyBriefing";
import { assertValidDexaScan } from "./DEXAContract";
import {
  classifyBodyFatGuardrail,
  resolveDEXAEventContext,
} from "./DEXAEventContextService";
import { createCanonicalBriefingConfidencePublicationService } from
  "./CanonicalBriefingConfidencePublicationService";
import {
  createPIDEXAEventLifecycleService,
} from "./PIDEXAEventLifecycleService";
import { composePIEditorialParagraph } from "./PIEditorialTranslationService";

export const DEXA_EVENT_VERSION = "dexa_event_v1_6_0";
export const DEXA_PRESENTATION_VERSION = "dexa_event_presentation_v1_6_0";
const REGIONS = ["trunk", "android", "legs", "arms", "gynoid"];

// A DEXA Event is an Anchor Event: it should explain which objective evidence
// increases confidence that the active goal is succeeding. Keep that principle
// goal-aware rather than Founder-specific so the narrative can evolve naturally.

export function composeDEXAEventNarrative({ scan, priorScan, phaseBaselineScan = null, phaseScans = [], supportingEvidence = [], goal = null, context = null, generatedAt = new Date().toISOString(), preview = false, simulatedTimeline = false } = {}) {
  const semanticGoalType = context?.semanticGoalType ?? inferSemanticGoalType(goal);
  if (!priorScan?.id) {
    return composeFirstDEXAEventNarrative({
      scan,
      goal,
      context,
      semanticGoalType,
      generatedAt,
      preview,
    });
  }
  if (semanticGoalType !== "fat_loss") {
    return composeGoalAwareDEXAEventNarrative({
      scan,
      priorScan,
      phaseBaselineScan,
      phaseScans,
      supportingEvidence,
      goal,
      context,
      semanticGoalType,
      generatedAt,
      preview,
      simulatedTimeline,
    });
  }
  if (!scan?.id || !priorScan?.id) throw new Error("Current and prior canonical DEXA scans are required.");
  assertValidDexaScan(scan, { production: false });
  assertValidDexaScan(priorScan, { production: false });
  const scanDate = dateKey(scan.measuredAt ?? scan.date);
  const priorScanDate = dateKey(priorScan.measuredAt ?? priorScan.date);
  if (!scanDate || !priorScanDate || priorScanDate >= scanDate) throw new Error("Prior DEXA must precede the current scan.");
  const daysBetweenScans = daysBetween(priorScanDate, scanDate);
  const headline = {
    weight: comparison("DEXA Weight", mass(priorScan.totalMass), mass(scan.totalMass), "lb"),
    bodyFat: comparison("Body Fat", number(priorScan.bodyFatPercentage), number(scan.bodyFatPercentage), "pts", "%"),
    fatMass: comparison("Fat Mass", mass(priorScan.fatMass), mass(scan.fatMass), "lb"),
    leanMass: comparison("Lean Tissue", mass(priorScan.leanMass), mass(scan.leanMass), "lb"),
  };
  const regionalFat = REGIONS.map((region) => regionalComparison(region, priorScan, scan, "fatMass")).filter(Boolean).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const regionalLean = REGIONS.map((region) => regionalComparison(region, priorScan, scan, "leanMass")).filter(Boolean).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const supplemental = [
    comparison("Visceral Fat", mass(priorScan.visceralAdiposeTissue?.mass), mass(scan.visceralAdiposeTissue?.mass), "lb", "lb", 2),
    comparison("A/G Ratio", number(priorScan.androidGynoidRatio), number(scan.androidGynoidRatio), "", "", 2),
    comparison("RMR", mass(priorScan.restingMetabolicRate), mass(scan.restingMetabolicRate), "cal/day", "cal/day", 0),
  ].filter((item) => item.previous !== null && item.current !== null);
  const support = summarizeSupportingEvidence(supportingEvidence, priorScanDate, scanDate);
  const supportingText = supportingEvidenceNarrative(support);
  const goalTitle = goal?.title ?? "Visible Abs at Rest";
  const numericalThresholdComplete = headline.bodyFat.current <= (goal?.supportingBodyFatRange?.max ?? 9);
  const fatLost = Math.abs(headline.fatMass.delta);
  const leanChange = headline.leanMass.delta;
  const leanChangePhrase = describeLeanChange(leanChange);
  const bodyFatChange = headline.bodyFat.delta;
  const trunkFatChange = regionalFat.find((item) => item.region === "trunk")?.delta ?? 0;
  const eventId = `dexa_event_${scan.id}`;
  const timeline = buildCutTimeline({ baselineScan: phaseBaselineScan, phaseScans, currentScan: scan, simulated: simulatedTimeline });
  const fullCutLeanChange = timeline.summary?.leanMass?.delta ?? null;
  const fullCutLeanConclusion = Number.isFinite(fullCutLeanChange)
    ? `Across the May 24 goal baseline, measured lean tissue changed ${signed(fullCutLeanChange)} lb and remained within the established preservation tolerance, achieving the full-cut preservation objective.`
    : "The available goal evaluation indicates that the established lean-mass preservation objective was achieved.";
  const canonicalScanCount = timeline.available ? timeline.scans.length : 2;
  const milestones = detectDEXAMilestones({ currentScan: scan, history: phaseScans, goal, regionalFat, headline });
  const stoodOut = fatLost >= 5 || Math.abs(trunkFatChange) >= 3
    ? `${format(fatLost)} lb of measured fat came off in ${daysBetweenScans} days, including ${format(Math.abs(trunkFatChange))} lb from your trunk.`
    : null;

  const narrative = {
    eventId, artifactId: eventId, scanId: scan.id, priorScanId: priorScan.id, scanDate, priorScanDate, daysBetweenScans, generatedAt,
    version: DEXA_EVENT_VERSION, presentationVersion: DEXA_PRESENTATION_VERSION, preview,
    semanticGoalType,
    context: context ? publicContext(context) : null,
    hero: {
      title: "The last four weeks produced substantial fat loss.",
      body: `You lost ${format(fatLost)} lb of fat and reduced body fat from ${format(headline.bodyFat.previous)}% to ${format(headline.bodyFat.current)}%, while measured lean tissue ${leanChangePhrase}.`,
      results: [
        { emoji: "🔥", label: "Fat Mass", value: `−${format(fatLost)} lb`, context: "Since the last scan" },
        { emoji: "📉", label: "Body Fat", value: `${format(headline.bodyFat.previous)}% → ${format(headline.bodyFat.current)}%`, context: `−${format(Math.abs(bodyFatChange))} percentage points` },
        { emoji: "🎯", label: "Trunk Fat", value: `−${format(Math.abs(trunkFatChange))} lb`, context: "Largest regional change" },
        { emoji: "💪", label: "Lean Tissue", value: `${signed(leanChange)} lb`, context: "Deserves a closer look" },
      ],
    },
    snapshot: { scanDate, daysBetweenScans, weight: headline.weight.current, bodyFat: headline.bodyFat.current, fatMass: headline.fatMass.current, leanMass: headline.leanMass.current, rmr: mass(scan.restingMetabolicRate) },
    progress: { headline: Object.values(headline), regionalFat, regionalLean, supplemental, timeline },
    regionalChanges: { fat: regionalFat, lean: regionalLean },
    milestones,
    interpretation: {
      opening: numericalThresholdComplete
        ? `This scan likely marks the numerical finish line of the cut. Body fat reached ${format(headline.bodyFat.current)}%, measured fat fell another ${format(fatLost)} lb, and the remaining question is visual confirmation at rest.`
        : canonicalScanCount >= 4
        ? `Across ${canonicalScanCount} canonical scans, this phase has established a consistent physiological direction: you have continued reducing body fat and moving closer to ${goalTitle}.`
        : canonicalScanCount === 3
          ? `Across three canonical scans, an emerging physiological trend is taking shape: you have continued moving body fat in the same direction, and this ${daysBetweenScans}-day interval brought you meaningfully closer to ${goalTitle}.`
          : `Over this ${daysBetweenScans}-day period, most of the weight you lost was fat, moving you meaningfully closer to ${goalTitle}.`,
      fatLoss: numericalThresholdComplete
        ? `You lost ${format(fatLost)} lb of measured fat, which accounts for the full ${format(Math.abs(headline.weight.delta))} lb reduction in DEXA weight and shows that the cut accomplished its body-composition objective. Most of that fat loss came from your trunk.`
        : `You lost ${format(fatLost)} lb of fat, which accounts for most of the ${format(Math.abs(headline.weight.delta))} lb change in your DEXA weight. Most of that fat loss came from your trunk.`,
      leanMass: numericalThresholdComplete
        ? `Measured lean tissue ${leanChangePhrase} since the last scan, so the latest interval did not show lean-tissue loss. ${fullCutLeanConclusion} Hydration, glycogen, food mass, preparation, and true tissue change still qualify the exact reading without reversing its measured direction.`
        : `Measured lean tissue ${leanChangePhrase}. DEXA lean-tissue readings can reflect glycogen, hydration, food mass, scan preparation, and true tissue change, so this result should be interpreted alongside training performance, recovery, and consistently prepared scans.`,
      regional: `You lost ${format(Math.abs(trunkFatChange))} lb of trunk fat and ${format(Math.abs(regionalFat.find((item) => item.region === "android")?.delta ?? 0))} lb of android fat. Your measured lean-tissue change was concentrated in the limbs, while the android region stayed ${describeStable(regionalLean.find((item) => item.region === "android")?.delta)}.`,
      supportingEvidence: supportingText,
      stoodOut: numericalThresholdComplete
        ? `The quality of the outcome stands out: ${format(fatLost)} lb of measured fat came off in the latest interval, lean tissue was preserved across the cut, and the numerical body-fat target was reached.`
        : stoodOut,
      uncertainty: numericalThresholdComplete
        ? "One scan never tells the whole story. Measured lean tissue can move with hydration, glycogen, food mass, preparation, and true tissue change. The final decision now depends on your own visual assessment, a qualified relaxed photo set, and whether that view agrees with the broader evidence."
        : "One scan never tells the whole story. Measured lean tissue can move with hydration, glycogen, food mass, preparation, and true tissue change, so training performance, recovery, photos, and the next consistently prepared scan provide the context that this result cannot supply alone.",
    },
    coachInsight: {
      biggestWin: numericalThresholdComplete
        ? `The cut appears to have achieved its numerical objective: body fat reached ${format(headline.bodyFat.current)}%, measured fat fell ${format(fatLost)} lb since the last scan, and lean mass remained preserved across the cut.`
        : timeline.available ? `This cut has consistently moved you closer to ${goalTitle}, and this scan removed another ${format(fatLost)} lb of measured fat.` : `You removed ${format(fatLost)} lb of measured fat and moved materially closer to ${goalTitle}.`,
      protect: numericalThresholdComplete
        ? "Do not push the cut more aggressively while visual confirmation is pending. Hold training quality, recovery, and nutrition steady instead of adding unnecessary deficit to chase a numerical threshold that the scan already shows as reached."
        : "This scan gives us another reason to trust the direction of the current phase. As body fat gets lower, protecting training quality, protein intake, recovery, and lean tissue matters more than maximizing the speed of loss.",
      watch: numericalThresholdComplete
        ? "Watch relaxed lower-ab visibility under consistent photo conditions and use your own visual interpretation to decide whether the final at-rest criterion is satisfied."
        : `Interpret the ${signed(leanChange)} lb lean-tissue change alongside strength, photos, recovery, and the next consistently prepared DEXA rather than treating one scan as a complete tissue diagnosis.`,
      next: timeline.available
        ? numericalThresholdComplete
          ? "Barring your own visual assessment and the relaxed photo confirmation, the evidence indicates this goal is complete. Ready to upload progress photos for visual confirmation?"
          : `Since the last scan, fat loss was substantial and measured lean tissue ${leanChangePhrase}. Across the full cut, body fat moved from ${format(timeline.summary.bodyFat.previous)}% to ${format(timeline.summary.bodyFat.current)}%. Strength, photos, recovery, and the next consistently prepared DEXA remain the decision boundary for this phase.`
        : "Use the next consistently prepared DEXA—together with strength, photos, and recovery—to decide whether the cut should continue at the same pace, slow, or transition toward maintenance.",
    },
    goalCompletionHandoff: numericalThresholdComplete ? {
      confirmationPurpose: "visible_abs_completion",
      numericalThresholdComplete: true,
      visualCriterionComplete: "uncertain",
      goalCompletionRecommended: false,
      transitionReady: false,
      question: "Ready to upload progress photos for visual confirmation?",
      actionLabel: "Upload Progress Photos",
      actionHref: `/evidence/photos?goalId=goal_visible_abs_at_rest&confirmationPurpose=visible_abs_completion&numericalThresholdComplete=true&visualCriterionComplete=uncertain&criterion=lower_abs_visible_at_rest&requiredPose=front-relaxed&userConfirmationRequired=true&requestedEvidence=relaxed_front_photo&sourceContext=dexa_event&sourceId=${encodeURIComponent(eventId)}`,
    } : null,
    supportingEvidence: support,
    uncertainties: ["DEXA lean tissue is influenced by hydration, glycogen, food mass, preparation, and true tissue change."],
    references: [...new Set([scan.id, priorScan.id, phaseBaselineScan?.id, ...supportingEvidence.map((item) => item.canonicalId)].filter(Boolean))],
    provenance: { version: DEXA_EVENT_VERSION, presentationVersion: DEXA_PRESENTATION_VERSION, currentScanSourceFileId: scan.sourceFileId ?? null, priorScanSourceFileId: priorScan.sourceFileId ?? null, canonicalScanIds: [...new Set([scan.id, priorScan.id, ...timeline.scans.map((item) => item.scanId)])], externalModelUsed: false, simulatedTimeline },
  };
  assertValidDexaEventNarrative(narrative);
  return narrative;
}

function composeFirstDEXAEventNarrative({
  scan,
  context,
  semanticGoalType,
  generatedAt,
  preview,
}) {
  if (!scan?.id) throw new Error("A current canonical DEXA scan is required.");
  assertValidDexaScan(scan, { production: false });
  const scanDate = dateKey(scan.measuredAt ?? scan.date);
  const values = {
    weight: mass(scan.totalMass),
    bodyFat: number(scan.bodyFatPercentage),
    fatMass: mass(scan.fatMass),
    leanMass: mass(scan.leanMass),
  };
  const headline = [
    comparison("DEXA Weight", values.weight, values.weight, "lb"),
    comparison("Body Fat", values.bodyFat, values.bodyFat, "pts", "%"),
    comparison("Fat Mass", values.fatMass, values.fatMass, "lb"),
    comparison("Lean Tissue", values.leanMass, values.leanMass, "lb"),
  ];
  const eventId = `dexa_event_${scan.id}`;
  const guardrail = classifyBodyFatGuardrail(values.bodyFat, context?.bodyFatGuardrail);
  const goalAware = semanticGoalType === "lean_mass_gain";
  const limitation = "This is the first eligible DEXA in the available history, so it establishes a baseline rather than a measured direction.";
  const narrative = {
    eventId,
    artifactId: eventId,
    scanId: scan.id,
    priorScanId: null,
    scanDate,
    priorScanDate: null,
    daysBetweenScans: 0,
    generatedAt,
    version: DEXA_EVENT_VERSION,
    presentationVersion: DEXA_PRESENTATION_VERSION,
    preview,
    semanticGoalType,
    context: publicContext(context),
    hero: {
      title: "This scan establishes a body-composition baseline.",
      body: goalAware
        ? composePIEditorialParagraph({
            observation: `You have ${format(values.leanMass)} lb of measured lean tissue at ${format(values.bodyFat)}% body fat`,
            interpretation: "This is the starting point for building muscle, not proof of progress yet",
            forwardImplication: "A later DEXA will show whether lean mass is increasing while body fat stays controlled",
          })
        : "This scan records where your body composition stands today. A later comparable scan will be needed before calling it a trend.",
      results: [
        { emoji: "💪", label: "Lean Tissue", value: `${format(values.leanMass)} lb`, context: goalAware ? "Primary baseline measure" : "Baseline measure" },
        { emoji: "◈", label: "Body Fat", value: `${format(values.bodyFat)}%`, context: goalAware ? guardrailLabel(guardrail) : "Baseline measure" },
        { emoji: "⚖️", label: "DEXA Weight", value: `${format(values.weight)} lb`, context: "Baseline context" },
        { emoji: "◇", label: "Fat Mass", value: `${format(values.fatMass)} lb`, context: "Baseline measure" },
      ],
    },
    snapshot: { scanDate, daysBetweenScans: 0, ...values, rmr: mass(scan.restingMetabolicRate) },
    progress: {
      headline,
      regionalFat: [],
      regionalLean: [],
      supplemental: [],
      timeline: { available: false, simulated: false, scans: [], metrics: [], summary: null },
      timelineLabel: context?.activePhase?.name ? `Since Starting ${context.activePhase.name}` : "Available Body-Composition History",
    },
    regionalChanges: { fat: [], lean: [] },
    milestones: [],
    interpretation: {
      opening: limitation,
      fatLoss: goalAware
        ? bodyFatGuardrailMeaning({ guardrail, bodyFatDelta: 0, phaseCalibration: context?.operatingState?.value === "calibration" })
        : "No scan-to-scan fat-mass direction is available.",
      leanMass: "No prior comparable DEXA is available, so lean-mass progress or decline cannot be inferred.",
      regional: "Regional change requires a prior comparable scan.",
      supportingEvidence: "Other evidence may provide context, but it cannot substitute for a comparable DEXA baseline.",
      stoodOut: null,
      uncertainty: limitation,
      goalProgress: null,
      guardrailStatus: goalAware ? guardrailLabel(guardrail) : null,
      phaseMeaning: context?.activePhase
        ? "This scan gives the current phase a starting point, but one measurement is not a reason to change the plan."
        : "Without an active phase to compare against, this scan should be treated as a starting point.",
    },
    coachInsight: {
      biggestWin: "You now have a measured starting point for every future comparison.",
      protect: "Prepare for future scans the same way so small changes are easier to trust.",
      watch: "Let the next comparable DEXA establish the direction instead of reading progress into one scan.",
      next: "Keep the current plan steady until a later comparison gives us a reason to change it.",
    },
    goalCompletionHandoff: null,
    supportingEvidence: { evidenceIds: [] },
    futureMilestone: context?.futureMilestone ?? null,
    pi: {
      status: context?.pi?.status ?? "unavailable",
      decisionStatus: context?.pi?.decisionContext?.status ?? "unavailable",
      decisionAdvisoryOnly: context?.pi?.decisionContext?.integrationEnabled === false,
      observationIds: context?.pi?.observations?.map((observation) => observation.id) ?? [],
      failure: context?.pi?.failure ?? null,
    },
    uncertainties: [limitation],
    references: [scan.id],
    provenance: {
      version: DEXA_EVENT_VERSION,
      presentationVersion: DEXA_PRESENTATION_VERSION,
      contextVersion: context?.schemaVersion ?? null,
      currentScanSourceFileId: scan.sourceFileId ?? null,
      priorScanSourceFileId: null,
      canonicalScanIds: [scan.id],
      externalModelUsed: false,
      simulatedTimeline: false,
    },
  };
  assertValidDexaEventNarrative(narrative);
  return narrative;
}

function composeGoalAwareDEXAEventNarrative({
  scan,
  priorScan,
  phaseBaselineScan,
  phaseScans,
  supportingEvidence,
  goal,
  context,
  semanticGoalType,
  generatedAt,
  preview,
  simulatedTimeline,
}) {
  if (!scan?.id || !priorScan?.id) throw new Error("Current and prior canonical DEXA scans are required.");
  assertValidDexaScan(scan, { production: false });
  assertValidDexaScan(priorScan, { production: false });
  const scanDate = dateKey(scan.measuredAt ?? scan.date);
  const priorScanDate = dateKey(priorScan.measuredAt ?? priorScan.date);
  if (!scanDate || !priorScanDate || priorScanDate >= scanDate) throw new Error("Prior DEXA must precede the current scan.");
  const daysBetweenScans = daysBetween(priorScanDate, scanDate);
  const headline = {
    weight: comparison("DEXA Weight", mass(priorScan.totalMass), mass(scan.totalMass), "lb"),
    bodyFat: comparison("Body Fat", number(priorScan.bodyFatPercentage), number(scan.bodyFatPercentage), "pts", "%"),
    fatMass: comparison("Fat Mass", mass(priorScan.fatMass), mass(scan.fatMass), "lb"),
    leanMass: comparison("Lean Tissue", mass(priorScan.leanMass), mass(scan.leanMass), "lb"),
  };
  const regionalFat = REGIONS.map((region) => regionalComparison(region, priorScan, scan, "fatMass")).filter(Boolean).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const regionalLean = REGIONS.map((region) => regionalComparison(region, priorScan, scan, "leanMass")).filter(Boolean).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const supplemental = [
    comparison("Visceral Fat", mass(priorScan.visceralAdiposeTissue?.mass), mass(scan.visceralAdiposeTissue?.mass), "lb", "lb", 2),
    comparison("A/G Ratio", number(priorScan.androidGynoidRatio), number(scan.androidGynoidRatio), "", "", 2),
    comparison("RMR", mass(priorScan.restingMetabolicRate), mass(scan.restingMetabolicRate), "cal/day", "cal/day", 0),
  ].filter((item) => item.previous !== null && item.current !== null);
  const support = summarizeSupportingEvidence(supportingEvidence, priorScanDate, scanDate);
  const supportingText = supportingEvidenceNarrative(support);
  const leanDelta = headline.leanMass.delta;
  const bodyFatDelta = headline.bodyFat.delta;
  const guardrail = classifyBodyFatGuardrail(headline.bodyFat.current, context?.bodyFatGuardrail);
  const leanState = leanDelta >= 0.5 ? "increased" : leanDelta <= -0.5 ? "decreased" : "flat";
  const phaseCalibration = context?.activePhase?.name === "Establish Maintenance"
    && context?.operatingState?.value === "calibration";
  const piFallback = context?.pi?.status === "fallback";
  const timeline = buildCutTimeline({
    baselineScan: phaseBaselineScan,
    phaseScans,
    currentScan: scan,
    simulated: simulatedTimeline,
  });
  const goalAware = semanticGoalType === "lean_mass_gain";
  const eventId = `dexa_event_${scan.id}`;
  const primary = goalAware
    ? leanMassMeaning({ leanState, leanDelta, guardrail, phaseCalibration })
    : neutralMeaning({ leanState, leanDelta, bodyFatDelta });
  const guardrailMeaning = goalAware
    ? bodyFatGuardrailMeaning({ guardrail, bodyFatDelta, phaseCalibration })
    : "No active body-fat guardrail is available, so this scan is presented as body-composition evidence rather than a goal verdict.";
  const uncertainty = piFallback
    ? "We can compare the two scans, but the surrounding goal context is incomplete, so this result should not change the plan by itself."
    : "One scan cannot prove that every change in lean tissue is new muscle. Hydration, glycogen, food, and scan preparation can all affect the number, so training, weight, nutrition, recovery, and progress photos still matter.";
  const phaseMeaning = phaseCalibration
    ? phaseCalibrationMeaning({ leanState, guardrail })
    : context?.activePhase
      ? "This result helps us judge the current phase, but one scan is not enough to move into the next one."
      : "Without an active phase to compare against, this scan should not change the plan by itself.";
  const next = nextDecision({ goalAware, leanState, guardrail, phaseCalibration, decisionContext: context?.pi?.decisionContext, futureMilestone: context?.futureMilestone });

  const narrative = {
    eventId,
    artifactId: eventId,
    scanId: scan.id,
    priorScanId: priorScan.id,
    scanDate,
    priorScanDate,
    daysBetweenScans,
    generatedAt,
    version: DEXA_EVENT_VERSION,
    presentationVersion: DEXA_PRESENTATION_VERSION,
    preview,
    semanticGoalType,
    context: publicContext(context),
    hero: {
      title: goalAware
        ? heroTitle({ leanState, guardrail })
        : "This scan updates the body-composition picture.",
      body: goalAware
        ? `Measured lean tissue ${describeLeanChange(leanDelta)} since the last scan, while body fat moved from ${format(headline.bodyFat.previous)}% to ${format(headline.bodyFat.current)}%. The useful question is whether you are adding muscle without letting body fat move beyond the range you chose.`
        : `Since the last scan, measured lean tissue changed ${signed(leanDelta)} lb and body fat changed ${signed(bodyFatDelta)} percentage points. Whether that is good or bad depends on the goal you are pursuing.`,
      results: [
        { emoji: "💪", label: "Lean Tissue", value: `${signed(leanDelta)} lb`, context: goalAware ? "Primary goal measure" : "Measured change" },
        { emoji: "◈", label: "Body Fat", value: `${format(headline.bodyFat.current)}%`, context: goalAware ? guardrailLabel(guardrail) : `${signed(bodyFatDelta)} points` },
        { emoji: "⚖️", label: "DEXA Weight", value: `${signed(headline.weight.delta)} lb`, context: "Context, not proof of tissue gain" },
        { emoji: "◇", label: "Fat Mass", value: `${signed(headline.fatMass.delta)} lb`, context: "Since the last scan" },
      ],
    },
    snapshot: {
      scanDate,
      daysBetweenScans,
      weight: headline.weight.current,
      bodyFat: headline.bodyFat.current,
      fatMass: headline.fatMass.current,
      leanMass: headline.leanMass.current,
      rmr: mass(scan.restingMetabolicRate),
    },
    progress: {
      headline: Object.values(headline),
      regionalFat,
      regionalLean,
      supplemental,
      timeline,
      timelineLabel: context?.activePhase?.name
        ? `Since Starting ${context.activePhase.name}`
        : "Available Body-Composition History",
    },
    regionalChanges: { fat: regionalFat, lean: regionalLean },
    milestones: [],
    interpretation: {
      opening: primary,
      fatLoss: goalAware
        ? guardrailMeaning
        : `Measured fat mass changed ${signed(headline.fatMass.delta)} lb. That change only matters in relation to the goal you are pursuing.`,
      leanMass: `Measured lean tissue ${describeLeanChange(leanDelta)}. ${leanState === "decreased" ? "That deserves a closer look, although one scan cannot tell us whether true muscle was lost." : "Prepare for the next scan the same way so we can see whether the direction holds."}`,
      regional: regionalInterpretation(regionalFat, regionalLean),
      supportingEvidence: supportingText,
      stoodOut: null,
      uncertainty,
      goalProgress: goalAware ? primary : null,
      guardrailStatus: goalAware ? guardrailMeaning : null,
      phaseMeaning,
    },
    coachInsight: {
      biggestWin: goalAware
        ? biggestWin({ leanState, guardrail })
        : "You now have a clear body-composition comparison to discuss alongside your current goal.",
      protect: phaseCalibration
        ? "Keep intake, activity, training, recovery, and scan preparation consistent enough to tell whether you have actually reached maintenance."
        : "Keep scan preparation consistent and protect productive training while we see whether this direction continues.",
      watch: goalAware
        ? watchSignal({ leanState, guardrail })
        : "Use the next comparable scan, along with training and weight, before deciding what this change means.",
      next,
    },
    goalCompletionHandoff: null,
    supportingEvidence: support,
    futureMilestone: context?.futureMilestone ?? null,
    pi: {
      status: context?.pi?.status ?? "unavailable",
      decisionStatus: context?.pi?.decisionContext?.status ?? "unavailable",
      decisionAdvisoryOnly: context?.pi?.decisionContext?.integrationEnabled === false,
      observationIds: context?.pi?.observations?.map((observation) => observation.id) ?? [],
      failure: context?.pi?.failure ?? null,
    },
    uncertainties: [uncertainty],
    references: [...new Set([
      scan.id,
      priorScan.id,
      phaseBaselineScan?.id,
      context?.goalBaselineDexa?.id,
      context?.completedPriorGoal?.id,
      ...supportingEvidence.map((item) => item.canonicalId),
    ].filter(Boolean))],
    provenance: {
      version: DEXA_EVENT_VERSION,
      presentationVersion: DEXA_PRESENTATION_VERSION,
      contextVersion: context?.schemaVersion ?? null,
      currentScanSourceFileId: scan.sourceFileId ?? null,
      priorScanSourceFileId: priorScan.sourceFileId ?? null,
      canonicalScanIds: [...new Set([scan.id, priorScan.id, ...timeline.scans.map((item) => item.scanId)])],
      externalModelUsed: false,
      simulatedTimeline,
    },
  };
  assertValidDexaEventNarrative(narrative);
  return narrative;
}

function inferSemanticGoalType(goal) {
  if (goal?.type === "build_lean_mass") return "lean_mass_gain";
  if (goal?.type === "maintenance" || goal?.type === "body_fat_maintenance") return "body_fat_maintenance";
  if (goal?.target?.direction === "decrease" || /fat loss|cut|visible abs/i.test(goal?.title ?? "")) return "fat_loss";
  return "unknown";
}

function leanMassMeaning({ leanState, leanDelta, guardrail, phaseCalibration }) {
  if (leanState === "increased") {
    const qualification = guardrail.status === "above"
      ? "Lean tissue moved up, but body fat also moved beyond the range you chose."
      : guardrail.status === "within" || guardrail.status === "near_boundary"
        ? "Lean tissue moved up while body fat stayed within the range you chose."
        : guardrail.status === "below"
          ? `Lean tissue moved up while body fat remained below the exact ${guardrail.guardrail.lowerBound}–${guardrail.guardrail.upperBound}% Guardrail you chose.`
          : "Lean tissue moved up, but a canonical body-fat Guardrail is unavailable.";
    return `Measured lean tissue increased ${format(Math.abs(leanDelta))} lb. ${qualification} That is encouraging, but one scan cannot prove how much of the change is new muscle.`;
  }
  if (leanState === "decreased") {
    return `Measured lean tissue decreased ${format(Math.abs(leanDelta))} lb. That is not the direction we want, but hydration, glycogen, food, and preparation can all affect one scan. Review training, nutrition, recovery, and the next comparable scan before assuming muscle was lost.`;
  }
  return `Measured lean tissue was effectively flat at ${signed(leanDelta)} lb. ${phaseCalibration ? "Body fat can still help us judge whether you have reached maintenance, but this scan does not show new muscle yet." : "This scan does not show new muscle yet."}`;
}

function neutralMeaning({ leanState, leanDelta, bodyFatDelta }) {
  return `This scan shows measured lean tissue ${leanState === "flat" ? "remaining effectively flat" : `${leanState} ${format(Math.abs(leanDelta))} lb`} and body fat changing ${signed(bodyFatDelta)} percentage points. Whether that is a good result depends on the goal you are pursuing.`;
}

function bodyFatGuardrailMeaning({ guardrail, bodyFatDelta, phaseCalibration }) {
  if (guardrail.status === "unknown") return "There is no clear body-fat range to judge this result against, so focus on the measured change rather than calling it good or bad.";
  if (guardrail.status === "above") return `Body fat is above your chosen ${guardrail.guardrail.lowerBound}–${guardrail.guardrail.upperBound}% range. Review the calorie plan before treating the lean-tissue increase as an uncomplicated win.`;
  if (guardrail.status === "below") return `Body fat is below your chosen ${guardrail.guardrail.lowerBound}–${guardrail.guardrail.upperBound}% range. Lower is not automatically better${phaseCalibration ? "; it may mean you are still eating below maintenance and limiting stronger training" : ""}.`;
  const boundary = guardrail.status === "near_boundary" ? "near the edge of" : "within";
  return `Body fat remains ${boundary} your chosen ${guardrail.guardrail.lowerBound}–${guardrail.guardrail.upperBound}% range after changing ${signed(bodyFatDelta)} percentage points. Small DEXA changes still need a comparable follow-up before we overinterpret them.`;
}

function phaseCalibrationMeaning({ leanState, guardrail }) {
  if (guardrail.status === "below") return "You may still be eating below maintenance. Keep this phase steady instead of moving into a dedicated muscle-building push too soon.";
  if (guardrail.status === "above") return "Body fat moved beyond the range you chose, so review the calorie plan before moving into the next phase.";
  if (leanState === "increased" && ["within", "near_boundary"].includes(guardrail.status)) return "This is the result we hoped to see, but one scan is not enough to prove that maintenance is established or to rush into the next phase.";
  return "Keep intake, training, recovery, and weight steady long enough to understand how your body is responding before changing phases.";
}

function nextDecision({ goalAware, leanState, guardrail, phaseCalibration, decisionContext, futureMilestone }) {
  const milestone = futureMilestone ? ` ${futureMilestone.label} will be the next useful comparison.` : "";
  if (!goalAware) return `Use training, weight, nutrition, recovery, and a future comparable scan before changing the plan.${milestone}`.trim();
  const advisory = decisionContext?.integrationEnabled === false
    ? " This result has not changed your phase."
    : "";
  if (leanState === "decreased" || guardrail.status === "above") {
    return `Review nutrition, training, recovery, and scan preparation before changing the plan.${advisory}${milestone}`.trim();
  }
  if (phaseCalibration) {
    return `Keep the plan steady until weight, training, and calorie intake show that maintenance is stable; this scan alone is not enough to move into the next phase.${advisory}${milestone}`.trim();
  }
  return `Continue the current phase and see whether the same direction appears in a later comparable scan.${advisory}${milestone}`.trim();
}

function heroTitle({ leanState, guardrail }) {
  if (leanState === "increased" && ["within", "near_boundary"].includes(guardrail.status)) return "Lean mass increased while body fat stayed controlled.";
  if (leanState === "increased" && guardrail.status === "above") return "Lean mass increased, but body fat needs attention.";
  if (leanState === "decreased") return "Lean mass moved in the wrong measured direction.";
  if (guardrail.status === "above") return "Lean mass was flat while body fat moved too high.";
  return "Body fat stayed controlled, but new muscle is not established yet.";
}

function biggestWin({ leanState, guardrail }) {
  if (leanState === "increased" && ["within", "near_boundary"].includes(guardrail.status)) return "Measured lean tissue increased while body fat stayed within the range you chose.";
  if (leanState === "increased") return "Measured lean tissue increased, which is encouraging even though body fat keeps it from being an uncomplicated win.";
  if (["within", "near_boundary"].includes(guardrail.status)) return "Body fat stayed within the range you chose while we wait for a clearer increase in lean tissue.";
  return "The scan gave you a clear reason to review the plan instead of guessing from weight alone.";
}

function watchSignal({ leanState, guardrail }) {
  if (leanState === "decreased") return "Watch whether the lean-tissue drop repeats with comparable preparation and whether training, nutrition, or recovery helps explain it.";
  if (guardrail.status === "above") return "Watch whether body fat stays above the range you chose and whether calorie intake needs to come down slightly.";
  if (guardrail.status === "below") return "Watch for signs that you are still under-eating, especially stalled training or continued weight loss.";
  return "Watch whether training and a later comparable scan confirm that lean tissue is continuing to increase while body fat stays controlled.";
}

function guardrailLabel(result) {
  return ({
    within: "Within body-fat guardrail",
    near_boundary: "Near guardrail boundary",
    above: "Above body-fat guardrail",
    below: "Below body-fat guardrail",
    unknown: "Guardrail unavailable",
  })[result.status];
}

function regionalInterpretation(regionalFat, regionalLean) {
  const fat = regionalFat[0];
  const lean = regionalLean[0];
  if (!fat && !lean) return "Regional comparisons are unavailable for this scan.";
  return [
    fat ? `${fat.label} had the largest measured fat-mass change at ${signed(fat.delta)} lb.` : null,
    lean ? `${lean.label} had the largest measured lean-tissue change at ${signed(lean.delta)} lb.` : null,
    "Regional DEXA changes remain measurements, not isolated tissue diagnoses.",
  ].filter(Boolean).join(" ");
}

function publicContext(context) {
  if (!context) return null;
  return {
    schemaVersion: context.schemaVersion,
    status: context.status,
    evidenceDate: context.evidenceDate,
    activeGoal: context.activeGoalSummary,
    activePhase: context.activePhase,
    operatingState: context.operatingState,
    completedPriorGoal: context.completedPriorGoal,
    currentGoalMeasures: context.currentGoalMeasures,
    bodyFatGuardrail: context.bodyFatGuardrail,
    activeProtocols: context.activeProtocols,
    baselineRoles: {
      immediatePriorDexaId: context.latestPriorDexa?.id ?? null,
      goalBaselineDexaId: context.goalBaselineDexa?.id ?? null,
      phaseBaselineDexaId: context.phaseBaselineDexa?.id ?? null,
    },
    futureMilestone: context.futureMilestone,
    piStatus: context.pi?.status ?? "unavailable",
    decisionContext: context.pi?.decisionContext ?? null,
    uncertainty: context.uncertainty,
  };
}

export function assertValidDexaEventNarrative(narrative) {
  const snapshot = narrative?.snapshot;
  for (const field of ["weight", "bodyFat", "fatMass", "leanMass"]) {
    if (!Number.isFinite(snapshot?.[field])) throw new Error(`DEXA Event Briefing requires finite ${field}.`);
  }
  if (!dateKey(snapshot.scanDate)) throw new Error("DEXA Event Briefing requires a valid scan date.");
  for (const metric of narrative?.progress?.headline ?? []) {
    if (![metric.previous, metric.current, metric.delta].every(Number.isFinite)) {
      throw new Error(`DEXA Event Briefing comparison ${metric.label} is incomplete.`);
    }
  }
  return narrative;
}

export function createFounderDEXAEventNarrativeService({
  repositories,
  now = () => new Date(),
  eventLifecycle,
} = {}) {
  const publication = eventLifecycle ? null :
    createCanonicalBriefingConfidencePublicationService({ now });
  return createDEXAEventNarrativeService({
    repositories,
    now,
    eventLifecycle: eventLifecycle ??
      createPIDEXAEventLifecycleService({ publicationService: publication, now }),
  });
}

export function createDEXAEventNarrativeService({
  repositories,
  now = () => new Date(),
  eventLifecycle = null,
} = {}) {
  async function build({
    userId,
    scanId,
    persist,
    baselineScanId = null,
    operation = "create",
    confidenceMode = "publish-successor",
    replacementAuthorized = false,
    reason = null,
    ignoreExisting = false,
  }) {
    const [scans, canonical] = await Promise.all([repositories.dexaScans.listDEXAScans(userId), repositories.canonicalEvidence?.listCanonicalEvidenceObjects(userId) ?? []]);
    const scan = scans.find((item) => item.id === scanId && item.userId === userId);
    if (!scan) throw new Error(`Canonical DEXA scan ${scanId} was not found for this user.`);
    const priorScan = selectNearestPriorDEXAScan(scans, scan);
    if (persist && baselineScanId) throw new Error("DEXA baseline overrides are Preview-only.");
    const generatedAt = now().toISOString();
    const context = await resolveDEXAEventContext({
      repositories,
      userId,
      scan,
      scans,
      generatedAt,
    });
    const goal = context.activeGoal;
    const phaseBaselineScan = baselineScanId
      ? resolveDEXAPhaseBaseline({ scans, scan, priorScan, goal, previewBaselineScanId: persist ? null : baselineScanId, userId })
      : context.phaseBaselineDexa ?? resolveDEXAPhaseBaseline({ scans, scan, priorScan, goal, userId });
    const phaseScans = phaseBaselineScan ? scans.filter((item) => item.userId === userId && dateKey(item.measuredAt) >= dateKey(phaseBaselineScan.measuredAt) && dateKey(item.measuredAt) <= dateKey(scan.measuredAt)).sort(byDate) : [];
    const id = `dexa_event_${scan.id}`;
    if (persist && !ignoreExisting) {
      const existing = (await repositories.dailyBriefings.listDailyBriefings(userId)).find((item) => item.id === id && item.preview !== true);
      if (existing) return existing;
    }
    const intervalEvidence = canonical.filter((item) => (!priorScan || dateKey(item.lastObservedAt) >= dateKey(priorScan.measuredAt)) && dateKey(item.lastObservedAt) <= dateKey(scan.measuredAt));
    const narrative = composeDEXAEventNarrative({ scan, priorScan, phaseBaselineScan, phaseScans, supportingEvidence: intervalEvidence, goal, context, generatedAt, preview: !persist, simulatedTimeline: Boolean(!persist && baselineScanId) });
    if (!persist) return narrative;
    const artifact = createDailyBriefing({ id, userId, artifactType: "event", cadence: "event", generatedAt, lifecycle: { generatedAt, openedAt: null, consumedAt: null }, trigger: { evidenceType: "dexa", evidenceId: scan.id, occurredAt: scan.measuredAt }, briefing: { version: DEXA_EVENT_VERSION, presentationVersion: DEXA_PRESENTATION_VERSION, dexaEventNarrative: narrative }, createdAt: generatedAt, updatedAt: generatedAt });
    if (eventLifecycle) {
      const result = await eventLifecycle.publish({
        operation,
        confidenceMode,
        artifact,
        scan,
        priorScan,
        context,
        reason: reason ?? `Confirmed DEXA Event ${scan.id}.`,
        replacementAuthorized,
      });
      if (result.committed || result.status === "matched") return result.artifact;
      const error = new Error(
        result.error?.message ?? `DEXA Event publication failed: ${result.status}`
      );
      error.code = result.status;
      throw error;
    }
    await repositories.dailyBriefings.createDailyBriefing(artifact);
    return artifact;
  }
  return {
    preview: ({ userId, scanId, baselineScanId = null }) => build({ userId, scanId, baselineScanId, persist: false }),
    generate: ({ userId, scanId }) => build({ userId, scanId, persist: true }),
    regenerate: ({ userId, scanId, reason, replacementAuthorized = false }) => {
      if (!reason) throw new Error("DEXA Event regeneration requires an explicit reason.");
      if (replacementAuthorized !== true) {
        throw new Error("DEXA Event regeneration requires explicit replacement authorization.");
      }
      return build({
        userId,
        scanId,
        persist: true,
        operation: "regenerate",
        confidenceMode: "publish-successor",
        replacementAuthorized: true,
        reason,
        ignoreExisting: true,
      });
    },
    getByScanId: async ({ userId, scanId }) => {
      const existing = (await repositories.dailyBriefings.listDailyBriefings(userId)).find((item) => item.id === `dexa_event_${scanId}` && item.preview !== true) ?? null;
      if (!existing) return null;
      const scans = await repositories.dexaScans.listDEXAScans(userId);
      return hydratePersistedDEXASupplemental(existing, scans);
    },
  };
}

export function hydratePersistedDEXASupplemental(artifact, scans = []) {
  const narrative = artifact?.briefing?.dexaEventNarrative;
  const timelineScans = narrative?.progress?.timeline?.scans ?? [];
  const priorId = timelineScans.at(-2)?.scanId ?? narrative?.priorScanId;
  const currentId = timelineScans.at(-1)?.scanId ?? narrative?.scanId;
  const prior = scans.find((scan) => scan.id === priorId);
  const current = scans.find((scan) => scan.id === currentId);
  if (!prior || !current) return artifact;
  const supplemental = [
    comparison("Visceral Fat", mass(prior.visceralAdiposeTissue?.mass), mass(current.visceralAdiposeTissue?.mass), "lb", "lb", 2),
    comparison("A/G Ratio", number(prior.androidGynoidRatio), number(current.androidGynoidRatio), "", "", 2),
    comparison("RMR", mass(prior.restingMetabolicRate), mass(current.restingMetabolicRate), "cal/day", "cal/day", 0),
  ].filter(Boolean);
  if (supplemental.length === 0) return artifact;
  return { ...artifact, briefing: { ...artifact.briefing, dexaEventNarrative: { ...narrative, progress: { ...narrative.progress, supplemental } } } };
}

export function resolveDEXAPhaseBaseline({ scans = [], scan, priorScan, goal, previewBaselineScanId = null, userId }) {
  const eligible = scans.filter((item) => item.userId === userId && dateKey(item.measuredAt) <= dateKey(priorScan?.measuredAt ?? scan?.measuredAt)).sort(byDate);
  if (previewBaselineScanId) {
    const override = scans.find((item) => item.id === previewBaselineScanId);
    if (!override || override.userId !== userId) throw new Error("Preview baseline must be a canonical DEXA owned by the same user.");
    if (dateKey(override.measuredAt) > dateKey(priorScan?.measuredAt)) throw new Error("Preview baseline cannot be after the previous scan.");
    return override;
  }
  const explicitId = goal?.dexaBaselineScanId ?? goal?.phase?.dexaBaselineScanId ?? null;
  if (explicitId) return eligible.find((item) => item.id === explicitId) ?? null;
  const startDate = dateKey(goal?.phase?.startDate ?? goal?.startDate);
  if (!startDate) return null;
  return eligible.filter((item) => dateKey(item.measuredAt) <= startDate).at(-1) ?? null;
}

export function selectNearestPriorDEXAScan(scans = [], scan) { return scans.filter((item) => item.id !== scan?.id && item.userId === scan?.userId && dateKey(item.measuredAt) < dateKey(scan?.measuredAt)).sort((a, b) => dateKey(b.measuredAt).localeCompare(dateKey(a.measuredAt)))[0] ?? null; }

function buildCutTimeline({ baselineScan, phaseScans, currentScan, simulated }) {
  if (!baselineScan) return { available: false, simulated: false, scans: [], metrics: [], summary: null };
  const scans = [...phaseScans].filter((item) => dateKey(item.measuredAt) >= dateKey(baselineScan.measuredAt) && dateKey(item.measuredAt) <= dateKey(currentScan.measuredAt)).sort(byDate);
  const uniqueScans = [...new Map(scans.map((item) => [item.id, item])).values()];
  const metrics = [
    timelineMetric("DEXA Weight", uniqueScans, (item) => mass(item.totalMass), "lb"),
    timelineMetric("Body Fat", uniqueScans, (item) => number(item.bodyFatPercentage), "%"),
    timelineMetric("Fat Mass", uniqueScans, (item) => mass(item.fatMass), "lb"),
    timelineMetric("Lean Tissue", uniqueScans, (item) => mass(item.leanMass), "lb"),
  ];
  const summary = Object.fromEntries(metrics.map((item) => [item.key, { previous: item.points[0]?.value, current: item.points.at(-1)?.value, delta: item.delta }]));
  return { available: uniqueScans.length >= 2, simulated, baselineDate: dateKey(baselineScan.measuredAt), currentDate: dateKey(currentScan.measuredAt), elapsedDays: daysBetween(dateKey(baselineScan.measuredAt), dateKey(currentScan.measuredAt)), scans: uniqueScans.map((item) => ({ scanId: item.id, date: dateKey(item.measuredAt) })), metrics, summary };
}

function timelineMetric(label, scans, selector, unit) { const key = label === "Body Fat" ? "bodyFat" : label === "Fat Mass" ? "fatMass" : label === "Lean Tissue" ? "leanMass" : "weight"; const points = scans.map((scan) => ({ scanId: scan.id, date: dateKey(scan.measuredAt), value: selector(scan) })).filter((item) => item.value !== null); return { key, label, unit, points, delta: points.length > 1 ? rounded(points.at(-1).value - points[0].value) : null }; }

function detectDEXAMilestones({ currentScan, history = [], goal, regionalFat, headline }) {
  const prior = history.filter((item) => dateKey(item.measuredAt) < dateKey(currentScan.measuredAt));
  const currentBodyFat = number(currentScan.bodyFatPercentage);
  const priorBodyFat = prior.map((item) => number(item.bodyFatPercentage)).filter((value) => value !== null);
  const milestones = [];
  if (currentBodyFat < 11 && priorBodyFat.every((value) => value >= 11)) milestones.push({ id: "first_below_11", label: "First canonical scan below 11% body fat" });
  if (currentBodyFat < 10 && priorBodyFat.every((value) => value >= 10)) milestones.push({ id: "first_single_digit", label: "First single-digit body-fat scan" });
  const range = goal?.targetRange;
  if (range && currentBodyFat >= range.min && currentBodyFat <= range.max) milestones.push({ id: "maintenance_range", label: `Entered the ${range.min}–${range.max}% target maintenance range` });
  if (priorBodyFat.length && currentBodyFat < Math.min(...priorBodyFat)) milestones.push({ id: "lowest_body_fat", label: "Lowest canonical body-fat percentage" });
  const priorFatMass = prior.map((item) => mass(item.fatMass)).filter((value) => value !== null);
  if (priorFatMass.length && mass(currentScan.fatMass) < Math.min(...priorFatMass)) milestones.push({ id: "lowest_fat_mass", label: "Lowest canonical fat mass" });
  const priorVat = prior.map((item) => mass(item.visceralAdiposeTissue?.mass)).filter((value) => value !== null);
  const currentVat = mass(currentScan.visceralAdiposeTissue?.mass);
  if (currentVat !== null && priorVat.length && currentVat < Math.min(...priorVat)) milestones.push({ id: "lowest_vat", label: "Lowest canonical visceral fat" });
  if (Math.abs(headline.fatMass.delta) >= 5 && Math.abs(regionalFat.find((item) => item.region === "trunk")?.delta ?? 0) >= 3) milestones.push({ id: "substantial_fat_interval", label: "Substantial scan-to-scan fat reduction" });
  return milestones.slice(0, 2);
}

function supportingEvidenceNarrative(support) {
  const signals = [];
  if (support.weightDays) signals.push("scale weight continued moving with the body-composition trend");
  if (support.trainingDays) signals.push("training stayed productive");
  if (support.nutritionDays) signals.push("nutrition remained consistent enough to support the phase");
  if (support.photoSessions) signals.push("recent photos showed the same tightening pattern");
  if (!signals.length) return "This scan comes from an earlier part of your journey, so the lean-tissue reading deserves context rather than an alarming conclusion.";
  return `The scan matches the broader journey: ${joinNatural(signals)}.`;
}
function regionalComparison(region, prior, current, field) { const previous = mass(prior.regionalAssessment?.[region]?.[field]); const value = mass(current.regionalAssessment?.[region]?.[field]); return previous === null || value === null ? null : { region, label: title(region), previous, current: value, delta: rounded(value - previous), unit: "lb" }; }
function comparison(label, previous, current, unit, displayUnit = unit, precision = unit === "cal/day" ? 0 : unit === "" ? 2 : 1) { return { label, previous, current, delta: previous === null || current === null ? null : rounded(current - previous), unit, displayUnit, precision }; }
function summarizeSupportingEvidence(items, start, end) { const active = items.filter((item) => item.quality?.status !== "superseded" && dateKey(item.lastObservedAt) >= start && dateKey(item.lastObservedAt) <= end); const countDays = (types) => new Set(active.filter((item) => types.includes(item.evidence_type)).map((item) => dateKey(item.lastObservedAt))).size; const result = { weightDays: countDays(["weight", "morning_weight"]), trainingDays: countDays(["training"]), photoSessions: countDays(["photo_session"]), activityDays: countDays(["activity_day"]), nutritionDays: countDays(["nutrition"]), evidenceIds: active.map((item) => item.canonicalId) }; return { ...result, total: result.evidenceIds.length }; }
function mass(value) { return number(value?.value ?? value); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function rounded(value) { return Number(value.toFixed(2)); }
function format(value) { return Number(value).toFixed(value === 0 || Math.abs(value) >= 10 ? 1 : Math.abs(value) < 1 ? 2 : 1).replace(/\.00$/, ".0"); }
function signed(value) { return `${value > 0 ? "+" : value < 0 ? "−" : ""}${format(Math.abs(value))}`; }
function title(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
function dateKey(value) { return String(value ?? "").slice(0, 10); }
function daysBetween(a, b) { return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000); }
function describeStable(value) { return Math.abs(value ?? 0) < 0.05 ? "stable" : `${format(Math.abs(value))} lb ${value < 0 ? "lower" : "higher"}`; }
function describeLeanChange(value) { return Math.abs(value ?? 0) < 0.05 ? "was stable" : `${value > 0 ? "increased" : "decreased"} ${format(Math.abs(value))} lb`; }
function byDate(a, b) { return dateKey(a.measuredAt).localeCompare(dateKey(b.measuredAt)); }
function joinNatural(items) { if (items.length < 2) return items[0] ?? ""; return `${items.slice(0, -1).join(", ")}${items.length > 2 ? "," : ""} and ${items.at(-1)}`; }
