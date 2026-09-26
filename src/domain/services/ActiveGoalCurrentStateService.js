import { evaluateGuardrailMeasurementV3 } from "../intelligence/v3/DeclarativeGoalEvaluator.js";
import { adaptLegacyGuardrailV3 } from "../intelligence/ProductionConfidenceNarrativeV3Adapter.js";
import { findNarrativeV3VoiceViolations } from "../intelligence/v3/NarrativeV3CompositionService.js";
import { isV3BoundArtifact, requireCanonicalNarrativeV3 } from "./BriefingV3Projection.js";
import { prepareMidweekBriefingReviewPresentation } from "./MidweekBriefingPresentationService.js";
import { buildMilestoneStory } from "../presentation/milestoneStoryPresentation.js";

// Active Goal current-state contract. Canonical facts establish where the Goal
// stands (authoritative DEXA, goal target); Confidence V3 / Narrative V3 and the
// latest published briefing supply interpretation. Nothing here is Founder- or
// date-specific: every number comes from canonical records passed in.
export const ACTIVE_GOAL_CURRENT_STATE_V1 = "active_goal_current_state_v1";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INACTIVE_DEXA_STATES = new Set(["failed", "superseded", "retracted", "deleted", "inactive", "rejected", "removed"]);
// Goal-context coaching language: the Goal page explains meaning, never the
// machinery of updates, evidence accumulation or reviews.
const GOAL_LANGUAGE_VIOLATIONS = [
  /\bone update\b/i, /\bthis update\b/i, /evidence (?:keeps )?accumulat/i,
  /\bnext review\b/i, /\bgoal review\b/i, /\bmy recommendation\b/i,
];

export function findGoalCoachingLanguageViolations(value) {
  const text = String(value ?? "");
  return [
    ...GOAL_LANGUAGE_VIOLATIONS.filter((pattern) => pattern.test(text)).map((pattern) => `goal_language:${pattern.source}`),
    ...findNarrativeV3VoiceViolations(text),
  ];
}

// ---------------------------------------------------------------------------
// DEXA authority

// A DEXA record is authoritative for the Goal only when it is a live canonical
// revision with a lean-mass measurement in lb. Failed, superseded, retracted
// or removed revisions never qualify; for a measurement date with several live
// revisions the highest revision (then latest update) wins.
export function selectAuthoritativeGoalDexaScans(scans = []) {
  return selectAuthoritativeGoalDexaRecords(scans).map(normalizeScan);
}

// The same selection returning the canonical records themselves, for
// consumers (the goal trajectory) that read the stored DEXA shape.
export function selectAuthoritativeGoalDexaRecords(scans = []) {
  const eligible = (Array.isArray(scans) ? scans : []).filter(isAuthoritativeDexaScan)
    .map((record, index) => ({ record, index, revision: Number(record.dexaRevision?.revision ?? 0), updatedAt: String(record.updatedAt ?? record.createdAt ?? "") }))
    .sort((a, b) => a.revision - b.revision || a.updatedAt.localeCompare(b.updatedAt) || String(a.record.id).localeCompare(String(b.record.id)) || a.index - b.index);
  const byDate = new Map();
  for (const item of eligible) byDate.set(item.record.measuredAt ?? item.record.date, item.record);
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, record]) => record);
}

function isAuthoritativeDexaScan(scan) {
  if (!scan || typeof scan !== "object") return false;
  if ([scan.canonicalLifecycleStatus, scan.status].some((value) => INACTIVE_DEXA_STATES.has(String(value ?? "").toLowerCase()))) return false;
  if (scan.superseded === true || scan.retracted === true || scan.removed === true || scan.supersededBy) return false;
  const date = scan.measuredAt ?? scan.date;
  return typeof date === "string" && DATE_PATTERN.test(date) &&
    Number.isFinite(scan.leanMass?.value) && scan.leanMass.value > 0 && scan.leanMass.unit === "lb";
}

function normalizeScan(scan) {
  const pounds = (value) => Number.isFinite(value?.value) && value.unit === "lb" ? Number(value.value) : null;
  return Object.freeze({
    id: scan.id ?? null,
    date: scan.measuredAt ?? scan.date,
    leanMassLb: Number(scan.leanMass.value),
    fatMassLb: pounds(scan.fatMass),
    bodyFatPercent: Number.isFinite(scan.bodyFatPercentage) ? Number(scan.bodyFatPercentage) : null,
    weightLb: pounds(scan.totalMass),
    revision: Number(scan.dexaRevision?.revision ?? 0),
    updatedAt: scan.updatedAt ?? scan.createdAt ?? "",
  });
}

// Baseline = the last authoritative scan on or before the goal journey start.
// Current = the latest authoritative scan. They are never conflated: when no
// scan follows the baseline, current is the baseline itself and flagged so.
export function selectGoalCompositionAnchors({ dexaScans = [], journeyStartDate = null } = {}) {
  const scans = selectAuthoritativeGoalDexaScans(dexaScans);
  const baseline = DATE_PATTERN.test(journeyStartDate ?? "")
    ? scans.filter((scan) => scan.date <= journeyStartDate).at(-1) ?? null : null;
  const current = scans.at(-1) ?? null;
  const sinceBaseline = baseline ? scans.filter((scan) => scan.date >= baseline.date) : scans;
  return Object.freeze({ scans, baseline, current, sinceBaseline });
}

export function composeComposition({ baseline, current }) {
  if (!current) return null;
  const sameAsBaseline = Boolean(baseline) && baseline.date === current.date;
  const change = baseline && !sameAsBaseline ? Object.freeze({
    leanMassLb: diff(current.leanMassLb, baseline.leanMassLb),
    fatMassLb: diff(current.fatMassLb, baseline.fatMassLb),
    bodyFatPoints: diff(current.bodyFatPercent, baseline.bodyFatPercent),
    weightLb: diff(current.weightLb, baseline.weightLb),
  }) : null;
  return Object.freeze({
    authority: "DEXA",
    baseline: baseline ? publicScan(baseline, "goal_baseline") : null,
    current: publicScan(current, sameAsBaseline ? "goal_baseline" : "latest"),
    sameAsBaseline,
    change,
  });
}

function publicScan(scan, role) {
  return Object.freeze({ role, scanId: scan.id, date: scan.date, leanMassLb: scan.leanMassLb,
    fatMassLb: scan.fatMassLb, bodyFatPercent: scan.bodyFatPercent, weightLb: scan.weightLb });
}

// ---------------------------------------------------------------------------
// Progress toward the target (deterministic)

export function composeGoalProgress({ target, baseline, current }) {
  const supported = target?.type === "numeric_change" && target.metric === "lean_mass" &&
    target.unit === "lb" && Number(target.amount) > 0;
  if (!supported) return null;
  const targetAmount = Number(target.amount);
  const sign = target.direction === "decrease" ? -1 : 1;
  const base = { metric: "lean_mass", unit: "lb", targetAmount, targetDate: target.targetDate ?? null };
  if (!baseline) return Object.freeze({ ...base, status: "baseline_unavailable", achievedAmount: null, remainingAmount: null, percentComplete: null });
  if (!current || current.date === baseline.date) {
    return Object.freeze({ ...base, status: "awaiting_follow_up", achievedAmount: 0, remainingAmount: targetAmount, percentComplete: 0 });
  }
  const achievedAmount = round1(sign * (current.leanMassLb - baseline.leanMassLb));
  const remainingAmount = round1(Math.max(targetAmount - achievedAmount, 0));
  const rawPercent = round1((achievedAmount / targetAmount) * 100);
  return Object.freeze({ ...base, status: achievedAmount >= targetAmount ? "reached" : "measured",
    baselineDate: baseline.date, currentDate: current.date, achievedAmount, remainingAmount,
    rawPercent, percentComplete: Math.round(clamp(rawPercent, 0, 100)) });
}

// ---------------------------------------------------------------------------
// Body-fat guardrail: V3 evaluator classification + consequence-policy meaning

export function resolveBodyFatGuardrailV3({ goal, guardrailTexts = [] } = {}) {
  const configured = goal?.v3Guardrails ?? goal?.guardrailsV3;
  if (Array.isArray(configured)) {
    const match = configured.find((item) => String(item?.metricCapability?.id ?? item?.metricCapability ?? "") === "body_composition.body_fat_percentage");
    if (match) return { guardrail: match, text: match.text ?? match.displayName ?? null };
  }
  const legacy = (goal?.guardrails ?? []).filter((item) => item?.accepted !== false)
    .find((item) => /body[\s-]*fat/i.test(String(item?.text ?? item?.description ?? "")));
  const source = legacy ?? (guardrailTexts.find((text) => /body[\s-]*fat/i.test(String(text))) ? { id: "body_fat_guardrail", text: guardrailTexts.find((text) => /body[\s-]*fat/i.test(String(text))) } : null);
  const guardrail = source ? adaptLegacyGuardrailV3(source) : null;
  return guardrail ? { guardrail, text: String(source.text ?? source.description ?? "") } : null;
}

export function composeGoalGuardrail({ goal, guardrailTexts = [], current, progress = null }) {
  const resolved = resolveBodyFatGuardrailV3({ goal, guardrailTexts });
  if (!resolved || resolved.guardrail.evaluation?.mode !== "allowed_range") return null;
  const { min, max } = resolved.guardrail.evaluation.allowedRange;
  const range = Object.freeze({ min, max, unit: "%" });
  const value = current?.bodyFatPercent ?? null;
  const evaluation = evaluateGuardrailMeasurementV3(resolved.guardrail, value);
  const position = evaluation.status === "not_assessed" ? null
    : value < min ? "below" : value > max ? "above" : "within";
  return Object.freeze({
    title: resolved.text.replace(/[.]\s*$/u, ""),
    label: `${formatRange(min, max)} body fat`,
    range,
    measurement: value == null ? null : Object.freeze({ value, date: current.date, source: "DEXA" }),
    status: evaluation.status,
    position,
    deviation: evaluation.deviation,
    interpretation: describeGuardrailMeaning({ status: evaluation.status, position, value, deviation: evaluation.deviation,
      range, consequencePolicy: resolved.guardrail.consequencePolicy ?? {}, progress }),
  });
}

function describeGuardrailMeaning({ status, position, value, deviation, range, consequencePolicy, progress }) {
  if (status === "not_assessed" || value == null) return null;
  const measured = `Body fat is ${formatPercent(value)}`;
  const rangeText = `the ${formatRange(range.min, range.max)} range`;
  if (status === "clear") {
    return progress?.achievedAmount > 0
      ? `${measured}, inside ${rangeText}, while lean mass is up since the goal baseline. The build is adding lean mass without pushing body fat out of range.`
      : `${measured}, inside ${rangeText}, so the guardrail is not limiting the build.`;
  }
  const gap = `${formatNumber(deviation)} ${deviation === 1 ? "point" : "points"} ${position} ${rangeText}`;
  if (status === "breached") {
    return consequencePolicy.recommendationConstraint === "review"
      ? `${measured}, ${gap}. That is far enough outside the guardrail to change the approach before pushing the build further.`
      : `${measured}, ${gap}. That weighs on confidence in the build until it moves back toward the range.`;
  }
  return position === "above"
    ? `${measured}, ${gap}. It does not call for a change to the plan on its own, but further fat gain would work against the build.`
    : `${measured}, ${gap}. It does not call for a change to the plan on its own; the next DEXA should show whether it settles back into range.`;
}

// ---------------------------------------------------------------------------
// Confidence V3 (goal context)

const PUBLISHER_LABELS = Object.freeze({
  midweek_briefing: "Midweek Briefing", weekly_briefing: "Weekly Briefing", monthly_briefing: "Monthly Briefing",
  dexa_event_briefing: "DEXA Briefing", photo_event_briefing: "Photo Briefing",
});

// The Goal shows the goal-level V3 explanation (why confidence sits where it
// does for this goal), not the publishing briefing's movement sentence, which
// only has a referent inside that briefing. A valid V3 assessment never falls
// back to legacy/V2 text; text that breaks the goal coaching-language rules is
// withheld rather than rewritten.
export function composeGoalConfidence(presentation, { timeZone = "UTC" } = {}) {
  if (!presentation || presentation.status === "unavailable" || presentation.value == null) {
    return Object.freeze({ status: "unavailable", score: null, band: null, movement: null, delta: null, summary: null, summarySource: null, publishedBy: null, detail: null });
  }
  const detail = presentation.explanationDetail;
  const isV3 = presentation.piVersion === "confidence_v3";
  const v3Detail = isV3 && detail?.schemaVersion === "home_confidence_presentation_v3" ? detail : null;
  const candidate = isV3 ? v3Detail?.whyConfidence ?? null : presentation.presentationExplanation ?? presentation.primaryReason ?? null;
  const summary = candidate && findGoalCoachingLanguageViolations(candidate).length === 0 ? candidate : null;
  const publishedAt = presentation.publicationTimestamp ?? null;
  return Object.freeze({
    status: presentation.status,
    modelVersion: presentation.modelVersion ?? null,
    score: presentation.value,
    band: presentation.label,
    movement: presentation.movement ?? null,
    delta: presentation.delta ?? null,
    priorScore: presentation.priorScore ?? null,
    assessmentId: presentation.assessmentId ?? null,
    summary,
    summarySource: summary ? (isV3 ? "narrative_v3.why_confidence" : "confidence_v2.goal_surface") : null,
    publishedBy: Object.freeze({
      publisherType: presentation.originatingPublisher ?? null,
      label: PUBLISHER_LABELS[presentation.originatingPublisher] ?? null,
      artifactId: presentation.originatingArtifactId ?? null,
      publishedAt,
      publishedOn: publishedAt ? localDate(publishedAt, timeZone) : null,
    }),
    detail: v3Detail ? Object.freeze({
      whatSupportsIt: cleanList([...(v3Detail.whatIncreasedIt ?? []), ...(v3Detail.whatSupportsItNow ?? [])]),
      whatIsHoldingItBack: cleanList(v3Detail.whatIsHoldingItBack),
      whatCouldRaiseIt: cleanList(v3Detail.whatCouldRaiseIt),
      whatCouldLowerIt: cleanList(v3Detail.whatCouldLowerIt),
      assumptions: cleanList(v3Detail.assumptions),
    }) : null,
  });
}

function cleanList(items = []) {
  return Object.freeze((items ?? []).filter((item) => typeof item === "string" && item.trim() &&
    findGoalCoachingLanguageViolations(item).length === 0));
}

// ---------------------------------------------------------------------------
// Turning points: selective, derived from canonical facts only

export function composeGoalTurningPoints({ baseline, sinceBaseline = [], journeyStartDate = null, phases = [], target = null, guardrail = null } = {}) {
  const points = [];
  const guardrailDefinition = guardrail?.definition ?? null;
  if (baseline) {
    points.push({ id: `dexa_baseline|${baseline.date}`, kind: "dexa_baseline", date: baseline.date, title: "Goal baseline DEXA",
      body: `Lean mass measured ${formatPounds(baseline.leanMassLb)}${baseline.bodyFatPercent != null ? ` at ${formatPercent(baseline.bodyFatPercent)} body fat` : ""}. Progress toward the goal is measured from this scan.` });
  }
  if (journeyStartDate && (!baseline || Math.abs(daysBetween(baseline.date, journeyStartDate)) > 7)) {
    points.push({ id: `goal_activated|${journeyStartDate}`, kind: "goal_activated", ...buildMilestoneStory("goal_activated", { date: journeyStartDate }) });
  }
  const scanDatesUsed = new Set(baseline ? [baseline.date] : []);
  const ordered = [...phases].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
  for (const phase of ordered) {
    const prior = ordered.find((item) => Number(item.order) === Number(phase.order) - 1);
    const start = phase.startDate;
    if (!prior || !DATE_PATTERN.test(start ?? "") || !["active", "completed"].includes(phase.status)) continue;
    const scan = sinceBaseline.filter((item) => item.date <= start && (!baseline || item.date > baseline.date)).at(-1) ?? null;
    if (scan) scanDatesUsed.add(scan.date);
    points.push({ id: `phase_transition|${phase.id ?? phase.phaseId}|${start}`, kind: "phase_transition", ...buildMilestoneStory("phase_transition", {
      date: start, priorPhaseName: prior.phaseName ?? prior.name, activePhaseName: phase.phaseName ?? phase.name,
      measurementDate: scan?.date ?? null, metricLabel: scan ? "lean mass" : null,
      metricValue: scan ? formatPounds(scan.leanMassLb) : null,
      changeFromBaseline: scan && baseline ? `${signed(scan.leanMassLb - baseline.leanMassLb)} lb` : null,
    }) });
  }
  const targetAmount = target?.metric === "lean_mass" && Number(target?.amount) > 0 ? Number(target.amount) : null;
  const materialDelta = Math.max(1, targetAmount ? targetAmount * 0.1 : 1);
  const withinGuardrail = (scan) => guardrailDefinition && scan?.bodyFatPercent != null
    ? evaluateGuardrailMeasurementV3(guardrailDefinition, scan.bodyFatPercent).status === "clear" : null;
  for (let index = 1; index < sinceBaseline.length; index += 1) {
    const scan = sinceBaseline[index];
    const previous = sinceBaseline[index - 1];
    if (!baseline || scanDatesUsed.has(scan.date)) continue;
    const change = round1(scan.leanMassLb - previous.leanMassLb);
    const cumulative = round1(scan.leanMassLb - baseline.leanMassLb);
    const crossed = targetAmount ? [1, 0.5].find((mark) =>
      (previous.leanMassLb - baseline.leanMassLb) / targetAmount < mark && cumulative / targetAmount >= mark) ?? null : null;
    const guardrailBefore = withinGuardrail(previous);
    const guardrailAfter = withinGuardrail(scan);
    const guardrailChanged = guardrailBefore != null && guardrailAfter != null && guardrailBefore !== guardrailAfter;
    if (Math.abs(change) < materialDelta && !crossed && !guardrailChanged) continue;
    const title = crossed === 1 ? "Lean-mass target reached"
      : crossed === 0.5 ? "Past halfway to the lean-mass target"
        : Math.abs(change) >= materialDelta ? `Lean mass ${change > 0 ? "up" : "down"} ${formatNumber(Math.abs(change))} lb`
          : guardrailAfter ? "Body fat back inside the guardrail" : "Body fat left the guardrail range";
    const guardrailSentence = guardrailChanged
      ? ` Body fat moved ${guardrailAfter ? "into" : "out of"} the ${guardrail.label.replace(/ body fat$/u, "")} range at ${formatPercent(scan.bodyFatPercent)}.` : "";
    points.push({ id: `dexa_milestone|${scan.date}`, kind: "dexa_milestone", date: scan.date, title,
      body: `The ${formatShortDate(scan.date)} DEXA measured ${formatPounds(scan.leanMassLb)} of lean mass, ${signed(change)} lb since the ${formatShortDate(previous.date)} scan and ${signed(cumulative)} lb from the goal baseline.${guardrailSentence}` });
  }
  return Object.freeze(points.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.title.localeCompare(b.title))
    .slice(-6).map((item) => Object.freeze(item)));
}

// ---------------------------------------------------------------------------
// Latest published briefing: Coach's Take, verbatim, with provenance

const COACH_SECTION_ORDER = ["coachTake", "action", "watch"];
const COACH_SECTION_TITLES = Object.freeze({ coachTake: "Biggest Takeaway", action: "What To Do", watch: "What To Watch" });
const NATIVE_BRIEFING_CADENCES = new Set(["weekly", "midweek", "monthly", "event"]);
const UNPUBLISHED_STATES = new Set(["failed", "in_progress", "generating", "pending", "preview", "claimed"]);

export function briefingPublicationInstant(artifact) {
  return artifact?.deliveryDate ?? artifact?.generatedAt ?? artifact?.createdAt ?? null;
}

// Mirrors Briefing History ordering, restricted to published V3-bound
// artifacts (every publisher is V3 since the V3 activation; frozen V2
// artifacts carry V2 semantics the Goal must not adopt).
export function selectLatestPublishedV3Briefing(artifacts = []) {
  return [...(artifacts ?? [])].filter(isPublishedV3Briefing)
    .sort((a, b) => instantMs(briefingPublicationInstant(b)) - instantMs(briefingPublicationInstant(a)) ||
      String(b.id).localeCompare(String(a.id)))[0] ?? null;
}

export function isPublishedV3Briefing(artifact) {
  if (!artifact?.briefing || !NATIVE_BRIEFING_CADENCES.has(artifact.cadence) || !isV3BoundArtifact(artifact)) return false;
  if (artifact.artifactType === "preview" || artifact.preview === true) return false;
  const states = [artifact.lifecycle?.status, artifact.lifecycle?.generationStatus].map((value) => String(value ?? "").toLowerCase());
  return !states.some((value) => UNPUBLISHED_STATES.has(value)) && briefingPublicationInstant(artifact) != null;
}

export function projectLatestBriefingCoachTake({ artifact, assessment = null, timeZone = "UTC" } = {}) {
  if (!isPublishedV3Briefing(artifact)) return null;
  let narrative;
  try { narrative = requireCanonicalNarrativeV3(artifact, "Goal Coach's Take"); } catch { return null; }
  let sections;
  if (artifact.cadence === "midweek") {
    // Midweek serves its coaching through the presentation contract, which may
    // suppress a section the lead already owns. The Goal shows exactly what the
    // briefing showed.
    let presentation;
    try { presentation = prepareMidweekBriefingReviewPresentation({ artifact, assessment }); } catch { return null; }
    if (presentation?.presentationModel !== "canonical_narrative_v3") return null;
    const coaching = presentation.presentationContract?.coaching ?? [];
    sections = COACH_SECTION_ORDER.map((kind) => coaching.find((item) => item.section === kind))
      .filter((item) => item?.text).map((item) => ({ kind: item.section, title: COACH_SECTION_TITLES[item.section], text: item.text }));
  } else {
    const values = { coachTake: narrative.coachTake, action: narrative.sections.action, watch: narrative.sections.watch };
    sections = COACH_SECTION_ORDER.filter((kind) => values[kind]).map((kind) => ({ kind, title: COACH_SECTION_TITLES[kind], text: values[kind] }));
  }
  if (!sections.length) return null;
  const publishedAt = briefingPublicationInstant(artifact);
  const publishedOn = DATE_PATTERN.test(publishedAt) ? publishedAt : localDate(publishedAt, timeZone);
  const briefingLabel = briefingDisplayLabel(artifact);
  return Object.freeze({
    artifactId: artifact.id,
    cadence: artifact.cadence,
    artifactType: artifact.cadence === "event" ? eventType(artifact) : "scheduled",
    briefingLabel,
    publishedAt,
    publishedOn,
    evidenceWindow: artifact.evidenceWindow?.startDate && artifact.evidenceWindow?.endDate
      ? Object.freeze({ startDate: artifact.evidenceWindow.startDate, endDate: artifact.evidenceWindow.endDate }) : null,
    attribution: `${formatShortDate(publishedOn)} ${briefingLabel} · Coach's Take`,
    sections: Object.freeze(sections.map((item) => Object.freeze(item))),
  });
}

function eventType(artifact) {
  if (artifact.briefing?.dexaEventNarrative || ["dexa", "dexa_scan", "body_composition"].includes(artifact.trigger?.evidenceType)) return "dexa_event";
  if (artifact.briefing?.photoEventNarrative || ["photo", "photo_session", "progress_photo"].includes(artifact.trigger?.evidenceType)) return "photo_event";
  return "event";
}

function briefingDisplayLabel(artifact) {
  if (artifact.cadence === "weekly") return "Weekly Briefing";
  if (artifact.cadence === "midweek") return "Midweek Briefing";
  if (artifact.cadence === "monthly") return "Monthly Briefing";
  const type = eventType(artifact);
  return type === "dexa_event" ? "DEXA Briefing" : type === "photo_event" ? "Photo Briefing" : "Briefing";
}

export function confidenceAssessmentForArtifact(artifact, history = []) {
  const assessmentId = artifact?.confidencePublication?.assessmentId ?? null;
  if (!assessmentId) return null;
  return (history ?? []).find((record) => record?.assessmentId === assessmentId)?.assessment ?? null;
}

// ---------------------------------------------------------------------------
// Assembly

export function composeActiveGoalCurrentState({ goal, activePhase, journeyStartDate, phases = [], guardrailTexts = [],
  dexaScans = [], confidencePresentation = null, trainingProgress = null, latestBriefing = null, confidenceHistory = [],
  timeZone = "UTC", currentDate = new Date() }) {
  const anchors = selectGoalCompositionAnchors({ dexaScans, journeyStartDate });
  const progress = composeGoalProgress({ target: goal?.target, baseline: anchors.baseline, current: anchors.current });
  const guardrail = composeGoalGuardrail({ goal, guardrailTexts, current: anchors.current, progress });
  const guardrailDefinition = resolveBodyFatGuardrailV3({ goal, guardrailTexts })?.guardrail ?? null;
  const cadence = activePhase?.strategicReviewCadence === "monthly" && activePhase?.strategicReviewAnchor === "dexa_body_composition"
    ? "Measured by monthly DEXA" : null;
  return Object.freeze({
    schemaVersion: ACTIVE_GOAL_CURRENT_STATE_V1,
    asOf: localDate(currentDate, timeZone),
    composition: composeComposition(anchors),
    progress,
    guardrail,
    phase: activePhase ? Object.freeze({ id: activePhase.phaseId ?? activePhase.id, name: activePhase.phaseName ?? activePhase.name,
      purpose: activePhase.purpose ?? null, startDate: activePhase.startDate ?? null, measurementCadence: cadence }) : null,
    confidence: composeGoalConfidence(confidencePresentation, { timeZone }),
    training: trainingProgress,
    turningPoints: composeGoalTurningPoints({ baseline: anchors.baseline, sinceBaseline: anchors.sinceBaseline, journeyStartDate,
      phases, target: goal?.target, guardrail: guardrail ? { ...guardrail, definition: guardrailDefinition } : null }),
    coachTake: latestBriefing ? projectLatestBriefingCoachTake({ artifact: latestBriefing,
      assessment: confidenceAssessmentForArtifact(latestBriefing, confidenceHistory), timeZone }) : null,
  });
}

// ---------------------------------------------------------------------------

function diff(left, right) { return Number.isFinite(left) && Number.isFinite(right) ? round1(left - right) : null; }
function round1(value) { return Math.round(value * 10) / 10; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function signed(value) { const rounded = round1(value); return `${rounded >= 0 ? "+" : "-"}${Math.abs(rounded).toFixed(1)}`; }
function formatNumber(value) { return Number.isInteger(value) ? String(value) : Number(value).toFixed(1); }
function formatPounds(value) { return `${Number(value).toFixed(1)} lb`; }
function formatPercent(value) { return `${Number(value).toFixed(1)}%`; }
function formatRange(min, max) { return `${formatNumber(min)}–${formatNumber(max)}%`; }
function instantMs(value) { const parsed = Date.parse(value ?? ""); return Number.isFinite(parsed) ? parsed : 0; }
function daysBetween(left, right) { return Math.round((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / 86400000); }
function formatShortDate(value) {
  if (!DATE_PATTERN.test(value ?? "")) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
function localDate(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(value instanceof Date ? value : new Date(value));
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}
