import { createDailyBriefing } from "../models/dailyBriefing";

export const DEXA_EVENT_VERSION = "dexa_event_v1_4_5";
export const DEXA_PRESENTATION_VERSION = "dexa_event_presentation_v1_4_3";
const REGIONS = ["trunk", "android", "legs", "arms", "gynoid"];

// A DEXA Event is an Anchor Event: it should explain which objective evidence
// increases confidence that the active goal is succeeding. Keep that principle
// goal-aware rather than Founder-specific so the narrative can evolve naturally.

export function composeDEXAEventNarrative({ scan, priorScan, phaseBaselineScan = null, phaseScans = [], supportingEvidence = [], goal = null, generatedAt = new Date().toISOString(), preview = false, simulatedTimeline = false } = {}) {
  if (!scan?.id || !priorScan?.id) throw new Error("Current and prior canonical DEXA scans are required.");
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
  const fatLost = Math.abs(headline.fatMass.delta);
  const leanChange = headline.leanMass.delta;
  const bodyFatChange = headline.bodyFat.delta;
  const trunkFatChange = regionalFat.find((item) => item.region === "trunk")?.delta ?? 0;
  const eventId = `dexa_event_${scan.id}`;
  const timeline = buildCutTimeline({ baselineScan: phaseBaselineScan, phaseScans, currentScan: scan, simulated: simulatedTimeline });
  const canonicalScanCount = timeline.available ? timeline.scans.length : 2;
  const milestones = detectDEXAMilestones({ currentScan: scan, history: phaseScans, goal, regionalFat, headline });
  const stoodOut = fatLost >= 5 || Math.abs(trunkFatChange) >= 3
    ? `${format(fatLost)} lb of measured fat came off in ${daysBetweenScans} days, including ${format(Math.abs(trunkFatChange))} lb from your trunk.`
    : null;

  return {
    eventId, artifactId: eventId, scanId: scan.id, priorScanId: priorScan.id, scanDate, priorScanDate, daysBetweenScans, generatedAt,
    version: DEXA_EVENT_VERSION, presentationVersion: DEXA_PRESENTATION_VERSION, preview,
    hero: {
      title: "The last four weeks produced substantial fat loss.",
      body: `You lost ${format(fatLost)} lb of fat and reduced body fat from ${format(headline.bodyFat.previous)}% to ${format(headline.bodyFat.current)}%, while measured lean tissue declined ${format(Math.abs(leanChange))} lb.`,
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
      opening: canonicalScanCount >= 4
        ? `Across ${canonicalScanCount} canonical scans, this phase has established a consistent physiological direction: you have continued reducing body fat and moving closer to ${goalTitle}.`
        : canonicalScanCount === 3
          ? `Across three canonical scans, an emerging physiological trend is taking shape: you have continued moving body fat in the same direction, and this ${daysBetweenScans}-day interval brought you meaningfully closer to ${goalTitle}.`
          : `Over this ${daysBetweenScans}-day period, most of the weight you lost was fat, moving you meaningfully closer to ${goalTitle}.`,
      fatLoss: `You lost ${format(fatLost)} lb of fat, which accounts for most of the ${format(Math.abs(headline.weight.delta))} lb change in your DEXA weight. Most of that fat loss came from your trunk.`,
      leanMass: `You also lost ${format(Math.abs(leanChange))} lb of measured lean tissue, mostly in your legs and arms. That does not automatically mean contractile muscle was lost; glycogen, hydration, food mass, scan preparation, and the size of the deficit can all influence this reading.`,
      regional: `You lost ${format(Math.abs(trunkFatChange))} lb of trunk fat and ${format(Math.abs(regionalFat.find((item) => item.region === "android")?.delta ?? 0))} lb of android fat. Your measured lean-tissue change was concentrated in the limbs, while the android region stayed ${describeStable(regionalLean.find((item) => item.region === "android")?.delta)}.`,
      supportingEvidence: supportingText,
      stoodOut,
      uncertainty: "One scan never tells the whole story. Measured lean tissue can move with hydration, glycogen, food mass, preparation, and true tissue change, so training performance, recovery, photos, and the next consistently prepared scan provide the context that this result cannot supply alone.",
    },
    coachInsight: {
      biggestWin: timeline.available ? `This cut has consistently moved you closer to ${goalTitle}, and this scan removed another ${format(fatLost)} lb of measured fat.` : `You removed ${format(fatLost)} lb of measured fat and moved materially closer to ${goalTitle}.`,
      protect: "This scan gives us another reason to trust the direction of the current phase. As body fat gets lower, protecting training quality, protein intake, recovery, and lean tissue matters more than maximizing the speed of loss.",
      watch: "Watch the limb lean-tissue changes against strength, photos, recovery, and the next DEXA rather than treating this scan as proof of muscle loss.",
      next: timeline.available
        ? `Since the last scan, fat loss was substantial and measured lean tissue declined. Across the full cut, body fat moved from ${format(timeline.summary.bodyFat.previous)}% to ${format(timeline.summary.bodyFat.current)}%. The decision boundary is whether strength, photos, recovery, and the next consistently prepared DEXA continue to support this pace or signal that the phase is ready to transition.`
        : "Use the next consistently prepared DEXA—together with strength, photos, and recovery—to decide whether the cut should continue at the same pace, slow, or transition toward maintenance.",
    },
    supportingEvidence: support,
    uncertainties: ["DEXA lean tissue is influenced by hydration, glycogen, food mass, preparation, and true tissue change."],
    references: [...new Set([scan.id, priorScan.id, phaseBaselineScan?.id, ...supportingEvidence.map((item) => item.canonicalId)].filter(Boolean))],
    provenance: { version: DEXA_EVENT_VERSION, presentationVersion: DEXA_PRESENTATION_VERSION, currentScanSourceFileId: scan.sourceFileId ?? null, priorScanSourceFileId: priorScan.sourceFileId ?? null, canonicalScanIds: [...new Set([scan.id, priorScan.id, ...timeline.scans.map((item) => item.scanId)])], externalModelUsed: false, simulatedTimeline },
  };
}

export function createDEXAEventNarrativeService({ repositories, now = () => new Date() }) {
  async function build({ userId, scanId, persist, baselineScanId = null }) {
    const [scans, canonical, goal] = await Promise.all([repositories.dexaScans.listDEXAScans(userId), repositories.canonicalEvidence?.listCanonicalEvidenceObjects(userId) ?? [], repositories.goals?.getActiveGoal(userId) ?? null]);
    const scan = scans.find((item) => item.id === scanId && item.userId === userId);
    if (!scan) throw new Error(`Canonical DEXA scan ${scanId} was not found for this user.`);
    const priorScan = selectNearestPriorDEXAScan(scans, scan);
    if (!priorScan) throw new Error(`No prior canonical DEXA exists before ${scan.measuredAt}.`);
    if (persist && baselineScanId) throw new Error("DEXA baseline overrides are Preview-only.");
    const phaseBaselineScan = resolveDEXAPhaseBaseline({ scans, scan, priorScan, goal, previewBaselineScanId: persist ? null : baselineScanId, userId });
    const phaseScans = phaseBaselineScan ? scans.filter((item) => item.userId === userId && dateKey(item.measuredAt) >= dateKey(phaseBaselineScan.measuredAt) && dateKey(item.measuredAt) <= dateKey(scan.measuredAt)).sort(byDate) : [];
    const id = `dexa_event_${scan.id}`;
    if (persist) {
      const existing = (await repositories.dailyBriefings.listDailyBriefings(userId)).find((item) => item.id === id && item.preview !== true);
      if (existing) return existing;
    }
    const generatedAt = now().toISOString();
    const intervalEvidence = canonical.filter((item) => dateKey(item.lastObservedAt) >= dateKey(priorScan.measuredAt) && dateKey(item.lastObservedAt) <= dateKey(scan.measuredAt));
    const narrative = composeDEXAEventNarrative({ scan, priorScan, phaseBaselineScan, phaseScans, supportingEvidence: intervalEvidence, goal, generatedAt, preview: !persist, simulatedTimeline: Boolean(!persist && baselineScanId) });
    if (!persist) return narrative;
    const artifact = createDailyBriefing({ id, userId, artifactType: "event", cadence: "event", generatedAt, lifecycle: { generatedAt, openedAt: null, consumedAt: null }, trigger: { evidenceType: "dexa", evidenceId: scan.id, occurredAt: scan.measuredAt }, briefing: { version: DEXA_EVENT_VERSION, presentationVersion: DEXA_PRESENTATION_VERSION, dexaEventNarrative: narrative }, createdAt: generatedAt, updatedAt: generatedAt });
    await repositories.dailyBriefings.createDailyBriefing(artifact);
    return artifact;
  }
  return {
    preview: ({ userId, scanId, baselineScanId = null }) => build({ userId, scanId, baselineScanId, persist: false }),
    generate: ({ userId, scanId }) => build({ userId, scanId, persist: true }),
    getByScanId: async ({ userId, scanId }) => (await repositories.dailyBriefings.listDailyBriefings(userId)).find((item) => item.id === `dexa_event_${scanId}` && item.preview !== true) ?? null,
  };
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

function supportingEvidenceNarrative(support) { const signals = []; if (support.weightDays) signals.push(`your scale trend across ${support.weightDays} day${support.weightDays === 1 ? "" : "s"}`); if (support.trainingDays) signals.push(`your resistance training across ${support.trainingDays} day${support.trainingDays === 1 ? "" : "s"}`); if (support.photoSessions) signals.push(`${support.photoSessions} progress-photo check-in${support.photoSessions === 1 ? "" : "s"}`); if (support.nutritionDays) signals.push(`${support.nutritionDays} complete nutrition day${support.nutritionDays === 1 ? "" : "s"}`); const missing = [["trainingDays", "training"], ["photoSessions", "photo"], ["nutritionDays", "nutrition"]].filter(([key]) => !support[key]).map(([, label]) => label); if (!signals.length) return "This scan comes from an earlier part of your journey, so we do not have the same training, nutrition, and photo context we have today. That means the lean-tissue result deserves context, not a more alarming conclusion."; const first = `${sentence(joinNatural(signals))} ${signals.length === 1 ? "helps" : "help"} place this scan in the broader story.`; return missing.length ? `${first} We do not have the same ${joinNatural(missing)} context for this interval, so those signals cannot yet confirm or contradict the lean-tissue change.` : first; }
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
function byDate(a, b) { return dateKey(a.measuredAt).localeCompare(dateKey(b.measuredAt)); }
function joinNatural(items) { if (items.length < 2) return items[0] ?? ""; return `${items.slice(0, -1).join(", ")}${items.length > 2 ? "," : ""} and ${items.at(-1)}`; }
function sentence(value) { return value ? value.charAt(0).toUpperCase() + value.slice(1) : value; }
