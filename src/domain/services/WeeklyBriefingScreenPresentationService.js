export function createWeeklyBriefingScreenPresentation(narrative) {
  const cards = object(narrative?.cards);
  const snapshot = object(cards.snapshot);
  const progress = object(cards.progress);
  const trainingFacts = object(progress.training?.presentation);
  const selection = object(narrative?.narrativePresentationSelection);
  const heroSelection = object(selection.hero);
  const trainingSelection = object(selection.training);
  const interpretationSelection = object(selection.interpretation);
  const coachSelection = object(selection.coachInsight);
  const navigation = object(selection.navigation);
  const context = object(narrative?.context);
  const activePhase = object(context.activePhase);
  const milestone = object(context.futureMilestone);
  const domainNarratives = new Map(
    array(interpretationSelection.items).map((item) => [item.domain, item])
  );

  return {
    hero: {
      eyebrow: "Weekly Briefing",
      periodLabel: `Completed week\n${formatRange(narrative?.weekStart, narrative?.weekEnd)}`,
      goalLabel: string(narrative?.context?.activeGoalSummary?.title),
      headline: string(heroSelection.headline),
      body: string(heroSelection.summary),
      confidence: narrative?.goalConfidence ? {
        ...narrative.goalConfidence,
        presentationExplanation: string(heroSelection.confidenceExplanation),
      } : null,
      confidenceContext: string(selection.confidence?.alignment?.context),
      cards: array(heroSelection.cards).map(normalizeHeroCard),
      strategy: activePhase.name ? {
        name: string(activePhase.name),
        weekLabel: Number.isFinite(Number(activePhase.ageDays))
          ? `Week ${Math.floor(Number(activePhase.ageDays) / 7) + 1}`
          : "",
        reviewLabel: string(milestone.label),
      } : null,
    },
    energy: isObject(progress.energy) ? {
      ...progress.energy,
      title: string(array(heroSelection.cards).find((item) => item.domain === "energy")?.headline),
      narrative: string(domainNarratives.get("energy")?.text),
    } : null,
    weight: isObject(progress.weight) ? {
      ...progress.weight,
      narrative: string(domainNarratives.get("weight")?.text),
    } : null,
    photos: isObject(progress.photo) ? {
      ...progress.photo,
      title: string(array(heroSelection.cards).find((item) => item.domain === "photos")?.headline),
      narrative: string(domainNarratives.get("photos")?.text),
    } : null,
    training: {
      title: string(
        array(heroSelection.cards).find((item) => item.domain === "training")?.headline
      ) || "Completed-week direction",
      conclusion: string(trainingSelection.conclusion),
      status: object(trainingFacts.counts),
      comparableCategoryCount: finite(trainingFacts.comparableCategoryCount),
      insufficientCount: finite(trainingFacts.counts?.insufficient),
      categories: array(trainingFacts.categorySummaries).filter(isObject),
      priorityCategories: array(trainingSelection.priorityCategories).filter(isObject),
      highlights: array(trainingFacts.highlights).filter(isObject),
      needsAttention: array(trainingSelection.needsAttention).filter(isObject),
      links: [
        { label: "Training reporting", href: "/progress/training" },
        { label: "Training Library", href: "/progress/training/library" },
      ],
      available: Boolean(
        trainingSelection.conclusion ||
        array(trainingFacts.categorySummaries).length
      ),
      limitations: array(trainingSelection.limitations),
      provenance: object(trainingSelection.provenance),
    },
    bodyComposition: createBodyCompositionPresentation(
      context,
      progress.dexa,
      selection.bodyComposition
    ),
    coachInsight: {
      title: "Carry the week forward",
      biggestWin: string(coachSelection.biggestWin),
      keepBuilding: string(coachSelection.keepBuilding),
      watchNextWeek: string(coachSelection.watchNextWeek),
      actionItems: array(coachSelection.actionItems).filter((item) => string(item)),
    },
    narrative: {
      completeness: string(selection.completeness) || "limited",
      limitations: array(selection.limitations),
      provenance: object(selection.provenance),
    },
    navigation: {
      backHref: string(navigation.backHref) || "/briefings/review",
      backLabel: string(navigation.backLabel) || "Briefing History",
    },
  };
}

function createBodyCompositionPresentation(context, progressDexa, narrative) {
  const contextualDexa = object(context.latestCompletedDexa);
  const progressLatest = object(progressDexa?.latest);
  const dexa = Object.keys(contextualDexa).length ? contextualDexa : progressLatest;
  const bodyFat = finiteOrNull(dexa.bodyFatPercentage?.value ?? dexa.bodyFatPercentage);
  const leanMass = finiteOrNull(dexa.leanMass?.value ?? dexa.leanMass);
  const fatMass = finiteOrNull(dexa.fatMass?.value ?? dexa.fatMass);
  const objective =
    string(context.activeGoal?.primaryOutcome) ||
    string(context.activeGoalSummary?.title);
  if (!dexa.id && !dexa.measuredAt) return null;
  return {
    title: "Current Baseline",
    bodyFat,
    leanMass,
    fatMass,
    date: string(dexa.measuredAt),
    objective,
    currentWeekScan: false,
    narrative: string(narrative?.explanation),
  };
}

function normalizeHeroCard(item) {
  const domain = item.domain === "energy" ? "energy_balance" : string(item.domain);
  return {
    ...item,
    domain,
    label: string(item.label),
    headline: string(item.headline),
    detail: string(item.detail),
    icon: string(item.icon),
    limitations: array(item.limitations),
    provenance: object(item.provenance),
  };
}

function formatRange(start, end) {
  const format = (value) => value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${value}T12:00:00Z`))
    : "";
  return `${format(start)}–${format(end)}`;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function array(value) { return Array.isArray(value) ? value : []; }
function string(value) { return typeof value === "string" ? value : ""; }
function finite(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function finiteOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
