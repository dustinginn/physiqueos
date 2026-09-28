// Monthly review presentation: projects the shared Briefing Intelligence
// review (narrativePlan.holisticSynthesis.review) onto the Monthly
// presentation the clients already render — hero, strategic card, Training
// Progress, Energy Evolution, New Baseline, What Changed and Month Ahead.
//
// Every word of prose comes from the review; the legacy Monthly editorial
// prose is replaced, and a legacy card the review did not earn is removed
// rather than left to speak with a second voice. The energy card's figures
// are rebuilt over the review's own window and readable days, so the bars,
// the averages and the prose describe the same days. Confidence stays compact.
// Applied at first publication only: an existing Monthly keeps its format.

import { compactConfidence, resolveReviewContract } from "../intelligence/shared/BriefingSectionContracts.js";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function applyMonthlyReviewToArtifact({ artifact, narrativePlan, confidenceBlock = null }) {
  const review = narrativePlan?.holisticSynthesis?.review;
  const briefing = artifact?.briefing;
  if (!review || !briefing?.monthlyPresentation) return artifact;
  const contract = resolveReviewContract("monthly");
  const presentation = briefing.monthlyPresentation;
  const module = (role) => review.modules.find((item) => item.role === role) ?? null;
  const opening = module("opening");
  const confidence = compactConfidence(review.confidence ?? narrativePlan.confidenceBriefing?.body, contract.confidence);

  presentation.hero = { ...presentation.hero,
    title: narrativePlan.composition.headline,
    thesis: opening.paragraphs.join(" "),
    highlights: opening.highlights ?? [],
    ...(review.period?.toDate ? { period: `${String(presentation.hero?.period ?? "").split(" · ")[0]} · Month to date` } : {}),
  };
  const block = confidenceBlock ?? presentation.hero.confidence ?? null;
  if (block && confidence) {
    presentation.hero.confidence = { ...block, primaryReason: confidence, presentationExplanation: confidence,
      explanationModel: block.explanationModel ? { ...block.explanationModel, summary: confidence } : block.explanationModel };
  }

  const training = module("training");
  if (training) {
    const { next: _next, highlights: _highlights, ...legacy } = presentation.training ?? {};
    presentation.training = { ...legacy, eyebrow: legacy.eyebrow ?? "Training Progress", title: training.title,
      summary: training.paragraphs.join(" "), interpretation: training.interpretation ?? null,
      callout: training.interpretation ? legacy.callout ?? "Why it matters" : null, stats: training.stats, highlights: [] };
  } else delete presentation.training;

  const energy = module("energy");
  const rebuilt = energy ? rebuildEnergy(presentation.energy, review.period, energy.excludedDates) : null;
  if (energy && rebuilt) {
    presentation.energy = { ...presentation.energy, ...rebuilt, eyebrow: presentation.energy.eyebrow ?? "Energy Evolution",
      // The phase's own name; the legacy positional index ("· Phase 1") does
      // not follow the goal's phase order.
      phaseLabel: presentation.energy.phaseLabel ? String(presentation.energy.phaseLabel).replace(/\s*·\s*Phase \d+$/u, "") : null,
      title: energy.title, summary: energy.paragraphs.join(" "), whyItMatters: energy.interpretation ?? null };
  } else delete presentation.energy;

  const trajectory = module("trajectory");
  const themes = [];
  if (trajectory && !trajectory.scaleOnly) {
    presentation.newBaseline = { eyebrow: trajectory.standing ? "Standing Measurement" : presentation.newBaseline?.eyebrow ?? "New Baseline",
      title: trajectory.title, summary: trajectory.paragraphs.join(" "), callout: trajectory.interpretation ?? null,
      facts: measurementFacts(presentation.newBaseline?.facts, trajectory) };
  } else delete presentation.newBaseline;
  // Without a measurement the scale is a "what changed" theme, not a baseline.
  if (trajectory?.scaleOnly) {
    themes.push({ label: "Scale", title: trajectory.title, body: trajectory.paragraphs.join(" "), tone: "weight" });
  }

  const execution = module("execution");
  if (execution) {
    execution.items.forEach((item, index) => themes.push({ label: item.title, title: item.label, body: item.text, tone: `routine-${index + 1}` }));
    themes.push({ label: "Pattern", title: execution.title, body: execution.paragraphs.join(" "), tone: "routine-pattern" });
  }
  if (themes.length) {
    // The heading names what the card holds, without restating the opening.
    presentation.changes = { eyebrow: presentation.changes?.eyebrow ?? "What Changed",
      title: execution && trajectory?.scaleOnly ? "The routine and the scale, across the month."
        : execution ? "Where the routine slipped." : trajectory.title, themes };
  } else delete presentation.changes;

  // Dated moments are told inside their own modules; a separate timeline
  // would repeat them.
  delete presentation.moments;

  const ahead = module("ahead");
  presentation.monthAhead = { eyebrow: presentation.monthAhead?.eyebrow ?? "Month Ahead", title: ahead.title,
    thesis: ahead.paragraphs.join(" "),
    // Each action has its own tone: clients key the cards by it.
    guidance: ahead.items.map((item, index) => ({ label: item.label, value: item.value, detail: item.text,
      tone: item.tone ?? `action-${index + 1}` })) };

  // The strategic card carries the coach's synthesis of the month only: the
  // opening tells the month, Month Ahead the steps and watch, the hero the
  // outlook.
  const canonical = briefing.monthlyNarrative?.strategicSummaryV3;
  const strategy = module("strategy")?.paragraphs.join(" ") ?? null;
  if (canonical) {
    briefing.monthlyNarrative.strategicSummaryV3 = { ...canonical,
      sections: { result: null, meaning: null, action: null, watch: null, confidence: null },
      coachTake: strategy ?? canonical.coachTake,
      energy: null,
      uncertainty: (canonical.uncertainty ?? []).filter((item) => item.surfaced === true &&
        !["watch", "module"].includes(item.surfacedIn)).slice(0, 2) };
  }
  presentation.coachTake = strategy ? { eyebrow: "Coach's Take", body: strategy } : null;
  briefing.monthlyNarrative.title = presentation.hero.title;
  briefing.monthlyNarrative.thesis = presentation.hero.thesis;
  briefing.monthlyReviewV3 = { schemaVersion: review.schemaVersion, period: review.period,
    modules: review.modules.map((item) => item.role), omitted: review.omitted, audit: review.audit };
  return artifact;
}

// The measurement's metric grid: the legacy grid when it describes this same
// measurement, otherwise the values the review itself carries.
function measurementFacts(legacyFacts = [], trajectory) {
  const label = longDate(trajectory.measuredAt);
  const same = (legacyFacts ?? []).some((item) => /reference date/iu.test(item.label ?? "") && item.value === label);
  if (same) return legacyFacts;
  return [
    ...(trajectory.grid ?? []),
    { label: "Reference date", value: label },
  ];
}

// Energy figures over the review's window, readable days only.
function rebuildEnergy(energy, period, excludedDates = []) {
  const days = (energy?.dailyWeeks ?? []).flatMap((week) => week.days ?? []);
  if (!days.length || !period) return null;
  const excluded = new Set(excludedDates);
  const inWindow = days.filter((day) => day.date >= period.startDate && day.date <= period.endDate);
  const readable = inWindow.filter((day) => !day.missing && !excluded.has(day.date) &&
    Number.isFinite(day.intake) && Number.isFinite(day.expenditure));
  if (readable.length < 7) return null;
  const avg = (list, field) => Math.round(list.reduce((sum, day) => sum + Number(day[field]), 0) / list.length);
  const blocks = [];
  for (let index = 0; index * 7 < inWindow.length; index += 1) blocks.push(inWindow.slice(index * 7, index * 7 + 7));
  const weekly = blocks.map((block, index) => {
    // A week needs three readable days to stand as a weekly average.
    const read = block.filter((day) => readable.includes(day));
    if (read.length < 3) {
      return { id: `week-${index + 1}`, label: `${shortDate(block[0].date)}–${shortDate(block.at(-1).date)}`,
        synthetic: false, observedCount: read.length, previewCount: 0, missing: true };
    }
    return { id: `week-${index + 1}`, label: `${shortDate(block[0].date)}–${shortDate(block.at(-1).date)}`,
      intake: avg(read, "intake"), expenditure: avg(read, "expenditure"),
      balance: avg(read, "intake") - avg(read, "expenditure"),
      synthetic: false, observedCount: read.length, previewCount: 0, missing: false };
  });
  const intake = avg(readable, "intake");
  const expenditure = avg(readable, "expenditure");
  const balance = intake - expenditure;
  return {
    phaseDates: `${shortDate(period.startDate)}–${shortDate(period.endDate)}`,
    summaryMetrics: [
      { label: "Avg intake", value: intake, suffix: "kcal", tone: "intake" },
      { label: "Avg expenditure", value: expenditure, suffix: "kcal", tone: "expenditure" },
      { label: "Avg balance", value: balance, suffix: "kcal", tone: "balance" },
      { label: "Balance magnitude", value: Math.abs(balance), suffix: "kcal", tone: "coverage" },
    ],
    weekly,
    dailyWeeks: blocks.map((block, index) => ({ label: `Week ${index + 1}`,
      days: block.map((day) => (readable.includes(day) ? day : { id: `missing-${day.date}`, date: day.date, day: day.day, missing: true, synthetic: false })) })),
  };
}

function shortDate(date) { return `${SHORT_MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`; }
function longDate(date) {
  return date ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
}
