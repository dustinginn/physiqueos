// Monthly review presentation: projects the shared Briefing Intelligence
// review (narrativePlan.holisticSynthesis.review) onto the Monthly
// presentation the clients already render — hero, strategic card, Training
// Progress, Energy Evolution, New Baseline, What Changed and Month Ahead.
//
// Every word of prose comes from the review; the legacy Monthly editorial
// prose is replaced, and a legacy module the review did not earn is removed
// rather than left to speak with a second voice. Data the review does not
// author (the weekly energy bars, the measurement's metric grid) is kept only
// where it describes the same evidence. Confidence stays compact.

import { compactConfidence, resolveReviewContract } from "../intelligence/shared/BriefingSectionContracts.js";

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
    presentation.training = { ...(presentation.training ?? {}), title: training.title, summary: training.paragraphs.join(" "),
      interpretation: training.interpretation ?? null, stats: training.stats, highlights: [], next: null, callout: null };
  } else delete presentation.training;

  const energy = module("energy");
  if (energy && presentation.energy) {
    presentation.energy = { ...presentation.energy, title: energy.title, summary: energy.paragraphs.join(" "),
      whyItMatters: energy.interpretation ?? null };
  } else delete presentation.energy;

  const trajectory = module("trajectory");
  const baselineFacts = presentation.newBaseline?.facts ?? [];
  const sameMeasurement = baselineFacts.some((item) => /reference date/iu.test(item.label ?? "") &&
    new Date(`${trajectory?.measuredAt}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) === item.value);
  if (trajectory && sameMeasurement) {
    presentation.newBaseline = { ...presentation.newBaseline, title: trajectory.title, summary: trajectory.paragraphs.join(" "),
      callout: trajectory.interpretation ?? null };
  } else delete presentation.newBaseline;

  const execution = module("execution");
  if (execution) {
    presentation.changes = { title: execution.title, themes: [
      ...execution.items.map((item) => ({ label: item.title, title: item.label, body: item.text, tone: "primary" })),
      { label: "Pattern", title: execution.title, body: execution.paragraphs.join(" "), tone: "evidence" },
    ] };
  } else delete presentation.changes;

  // Dated moments are told inside their own modules; a separate timeline
  // would repeat them.
  delete presentation.moments;

  const ahead = module("ahead");
  presentation.monthAhead = { title: ahead.title, thesis: ahead.paragraphs.join(" "),
    guidance: ahead.items.map((item, index) => ({ label: item.label, value: item.value, detail: item.text,
      tone: ["training", "energy", "weight", "baseline"][index] ?? "primary" })) };

  // The strategic card carries the coach's read and the strategy synthesis;
  // the steps and the watch live in Month Ahead, the outlook in the hero.
  const canonical = briefing.monthlyNarrative?.strategicSummaryV3;
  if (canonical) {
    briefing.monthlyNarrative.strategicSummaryV3 = { ...canonical,
      sections: { result: canonical.sections?.result ?? null, meaning: null, action: null, watch: null, confidence: null },
      coachTake: module("strategy")?.paragraphs.join(" ") ?? canonical.coachTake,
      energy: null,
      uncertainty: (canonical.uncertainty ?? []).filter((item) => item.surfaced === true &&
        !["watch", "module"].includes(item.surfacedIn)).slice(0, 2) };
  }
  briefing.monthlyNarrative.title = presentation.hero.title;
  briefing.monthlyNarrative.thesis = presentation.hero.thesis;
  briefing.monthlyReviewV3 = { schemaVersion: review.schemaVersion, period: review.period,
    modules: review.modules.map((item) => item.role), omitted: review.omitted, audit: review.audit };
  return artifact;
}
