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

  const monthName = review.period?.monthName ?? "This month";
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
      title: energy.title, summary: energy.paragraphs.join(" "), whyItMatters: energy.interpretation ?? null };
  } else delete presentation.energy;

  const trajectory = module("trajectory");
  if (trajectory) {
    presentation.newBaseline = { eyebrow: presentation.newBaseline?.eyebrow ?? "New Baseline",
      title: trajectory.title, summary: trajectory.paragraphs.join(" "), callout: trajectory.interpretation ?? null,
      facts: measurementFacts(presentation.newBaseline?.facts, trajectory) };
  } else delete presentation.newBaseline;

  // What Changed: one thematic card per domain (label, headline, story).
  const changes = module("changes");
  if (changes) {
    presentation.changes = { eyebrow: presentation.changes?.eyebrow ?? "What Changed",
      title: `${monthName} changed how progress should be judged.`,
      themes: changes.items.map((item) => ({ label: item.title, title: item.value, body: item.text, tone: item.tone })) };
  } else delete presentation.changes;

  // Defining Moments: the dated vertical timeline.
  const moments = module("moments");
  if (moments) {
    presentation.moments = { eyebrow: presentation.moments?.eyebrow ?? "Defining Moments",
      title: `${moments.items.length} moments defined ${monthName}.`,
      moments: moments.items.map((item) => ({ date: item.date, label: item.title, body: item.text, tone: item.tone })) };
  } else delete presentation.moments;

  const ahead = module("ahead");
  presentation.monthAhead = { eyebrow: presentation.monthAhead?.eyebrow ?? "Month Ahead",
    title: `Turn ${monthName}'s signals into repeatable evidence.`,
    thesis: ahead.paragraphs.join(" "),
    // Each card has its own domain tone: clients key the cards by it.
    guidance: ahead.items.map((item, index) => ({ label: item.label, value: item.value, detail: item.text,
      tone: item.tone ?? `action-${index + 1}` })) };

  // The approved Monthly has no strategic or uncertainty card: the canonical
  // V3 narrative stays at briefing.narrativeV3, and the Monthly renders only
  // its editorial skeleton.
  if (briefing.monthlyNarrative) delete briefing.monthlyNarrative.strategicSummaryV3;
  delete presentation.coachTake;
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
