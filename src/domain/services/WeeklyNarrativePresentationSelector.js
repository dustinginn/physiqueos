export const WEEKLY_NARRATIVE_PRESENTATION_SELECTOR_VERSION =
  "weekly_narrative_presentation_selector_v1";

const DOMAIN_ORDER = Object.freeze(["training", "energy", "weight", "photos"]);

export function selectWeeklyNarrativePresentation({
  assessment,
  facts = {},
  confidence = null,
  period = null,
  navigation = null,
} = {}) {
  const canonical = isCanonicalAssessment(assessment) ? assessment : null;
  const domains = canonical
    ? orderedDomains(canonical.domainConclusions)
    : [];
  const byDomain = new Map(domains.map((item) => [item.domain, item]));
  const training = byDomain.get("training") ?? null;
  const limitations = unique([
    ...(canonical?.uncertainties ?? []),
    ...(canonical?.completeness === "partial" ? ["canonical_narrative_partial"] : []),
    ...(!canonical ? ["canonical_narrative_unavailable"] : []),
  ]);

  return Object.freeze({
    schemaVersion: WEEKLY_NARRATIVE_PRESENTATION_SELECTOR_VERSION,
    assessmentId: canonical?.id ?? null,
    completeness: canonical?.completeness ?? "limited",
    limitations,
    hero: {
      headline: text(canonical?.overallConclusion?.headline),
      summary: text(canonical?.overallConclusion?.summary),
      confidenceExplanation: text(canonical?.confidenceExplanation),
      cards: DOMAIN_ORDER.map((domain) =>
        selectDomainCard(byDomain.get(domain), facts?.domains?.[domain] ?? {})
      ),
    },
    training: {
      conclusion: text(training?.explanation),
      status: training?.status ?? null,
      direction: training?.direction ?? null,
      strength: training?.strength ?? null,
      limitations: strings(training?.limitations),
      provenance: conclusionProvenance(training),
      needsAttention: selectTrainingAttention(training, facts?.training),
      priorityCategories: selectTrainingPriorities(training, facts?.training),
    },
    interpretation: {
      opening: text(canonical?.primaryFinding?.explanation),
      items: domains.map(selectInterpretationItem),
      synthesis: text(canonical?.overallConclusion?.summary),
    },
    coachInsight: {
      biggestWin: text(canonical?.coachTake?.biggestTakeaway ?? canonical?.primaryFinding?.explanation),
      keepBuilding: text(canonical?.coachTake?.recommendation ?? canonical?.recommendation?.text),
      watchNextWeek: text(canonical?.nextObservation?.text),
      actionItems: stringsInOrder(canonical?.coachTake?.actions).length
        ? stringsInOrder(canonical.coachTake.actions)
        : selectActionItems([
            canonical?.recommendation?.text,
            canonical?.nextObservation?.text,
          ]),
    },
    bodyComposition: canonical?.bodyCompositionConclusion
      ? {
          headline: text(canonical.bodyCompositionConclusion.headline),
          explanation: text(canonical.bodyCompositionConclusion.explanation),
        }
      : null,
    confidence: {
      reference: confidence ?? null,
      alignment: selectConfidenceAlignment(canonical, confidence),
    },
    period: period ?? null,
    navigation: navigation ?? null,
    provenance: canonical
      ? {
          assessmentId: canonical.id,
          modelVersion: canonical.modelVersion,
          sourceObservationIds: strings(canonical.provenance?.sourceObservationIds),
          sourceClaimIds: strings(canonical.provenance?.sourceClaimIds),
          evidenceCutoff: canonical.provenance?.evidenceCutoff ?? canonical.evidenceCutoff ?? null,
          confidenceAssessmentId:
            canonical.provenance?.confidenceAssessmentId ??
            canonical.confidenceAssessmentReference ??
            null,
          selectorVersion: WEEKLY_NARRATIVE_PRESENTATION_SELECTOR_VERSION,
        }
      : {
          assessmentId: null,
          modelVersion: null,
          sourceObservationIds: [],
          sourceClaimIds: [],
          evidenceCutoff: period?.endDate ?? null,
          confidenceAssessmentId: confidence?.assessmentId ?? null,
          selectorVersion: WEEKLY_NARRATIVE_PRESENTATION_SELECTOR_VERSION,
        },
  });
}

function selectTrainingPriorities(conclusion, trainingFacts) {
  const categories = Array.isArray(trainingFacts?.categories)
    ? trainingFacts.categories
    : [];
  const watched = new Set(
    strings(conclusion?.watchSubjects ?? conclusion?.plateauing).map(normalizedKey)
  );
  const attention = categories.filter((item) =>
    watched.has(normalizedKey(item?.label ?? item?.id))
  );
  const improving = categories
    .filter((item) => item?.status === "improving")
    .slice(0, 3);
  return [...attention, ...improving].map((item) => ({
    id: item.id ?? normalizedKey(item.label),
    label: text(item.label),
    status: item.status ?? null,
    statusLabel: text(item.statusLabel),
    statusTone: statusTone(item.status),
    comparableExerciseCount: finiteOrNull(item.comparableExerciseCount) ?? 0,
  }));
}

function statusTone(status) {
  if (status === "improving") return "success";
  if (status === "stable") return "neutral";
  if (status === "plateauing") return "warning";
  if (status === "regressing") return "danger";
  return "muted";
}

function selectActionItems(values) {
  const [recommendation, observation] = values.map(text);
  const recommendationActions = recommendation
    .replace(/[.!?]+$/, "")
    .split(/(?<=[.!?])\s+|,\s*(?:and\s+)?/)
    .map(sentence)
    .filter(Boolean)
    .slice(0, 2);
  return uniqueInOrder([
    ...recommendationActions,
    sentence(observation),
  ]).slice(0, 3);
}

function sentence(value) {
  const normalized = text(value);
  if (!normalized) return "";
  const capitalized = normalized[0].toUpperCase() + normalized.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function selectTrainingAttention(conclusion, trainingFacts) {
  const watched = strings(conclusion?.watchSubjects ?? conclusion?.plateauing)
    .map(normalizedKey);
  if (!watched.length) return [];
  return (Array.isArray(trainingFacts?.categories) ? trainingFacts.categories : [])
    .filter((item) => watched.includes(normalizedKey(item?.label ?? item?.id)))
    .map((item) => ({
      id: item.id ?? normalizedKey(item.label),
      label: text(item.label),
      status: item.status ?? null,
      statusLabel: text(item.statusLabel),
      comparableExerciseCount: finiteOrNull(item.comparableExerciseCount) ?? 0,
      message: `${text(item.statusLabel)} · ${finiteOrNull(item.comparableExerciseCount) ?? 0} supporting exercise${Number(item.comparableExerciseCount) === 1 ? "" : "s"}`,
    }));
}

function selectDomainCard(conclusion, fact) {
  const domain = normalizeDomain(conclusion?.domain ?? fact?.domain);
  return {
    domain,
    label: fact?.label ?? label(domain),
    headline: conclusion ? domainStatusLabel(conclusion) : "",
    detail: text(fact?.detail),
    icon: text(fact?.icon),
    destination: fact?.destination ?? null,
    evidenceCount: finiteOrNull(fact?.evidenceCount),
    status: conclusion?.status ?? null,
    direction: conclusion?.direction ?? null,
    strength: conclusion?.strength ?? null,
    explanation: text(conclusion?.explanation),
    limitations: strings(conclusion?.limitations),
    provenance: conclusionProvenance(conclusion),
  };
}

function selectInterpretationItem(conclusion) {
  return {
    key: conclusion.domain,
    domain: conclusion.domain,
    label: label(conclusion.domain),
    text: text(conclusion.explanation),
    status: conclusion.status ?? null,
    direction: conclusion.direction ?? null,
    strength: conclusion.strength ?? null,
    limitations: strings(conclusion.limitations),
    provenance: conclusionProvenance(conclusion),
    lifecycle: conclusion.lifecycle ?? null,
  };
}

function selectConfidenceAlignment(assessment, confidence) {
  if (!assessment || !confidence) {
    return { status: "unavailable", context: "", narrativePrimaryDomain: null };
  }
  const primaryDomain = normalizeDomain(assessment.primaryFinding?.domain);
  const visibleLeadReason =
    confidence.supportingReasons?.[0] ??
    confidence.supportingReason ??
    confidence.primaryReason ??
    confidence.reason ??
    confidence.reasons?.[0] ??
    "";
  const confidenceDomain = DOMAIN_ORDER.find((domain) =>
    new RegExp(domain === "photos" ? "photo|visual" : domain, "i").test(visibleLeadReason)
  ) ?? null;
  const diverges = Boolean(confidenceDomain && primaryDomain && confidenceDomain !== primaryDomain);
  return {
    status: diverges ? "historical_context_differs" : "aligned",
    narrativePrimaryDomain: primaryDomain,
    confidencePrimaryDomain: confidenceDomain,
    context: diverges
      ? "The confidence score reflects its generation-time assessment; this completed-week narrative reflects the canonical interpretation of the artifact-owned evidence."
      : "",
  };
}

function orderedDomains(values) {
  const byDomain = new Map(
    (Array.isArray(values) ? values : [])
      .filter((item) => item && typeof item === "object")
      .map((item) => [normalizeDomain(item.domain), item])
  );
  return DOMAIN_ORDER.map((domain) => byDomain.get(domain)).filter(Boolean);
}

function domainStatusLabel(conclusion) {
  if (conclusion.headline) return text(conclusion.headline);
  if (conclusion.domain === "training" && conclusion.status === "constructive") {
    return "Training progressed across most areas.";
  }
  if (conclusion.domain === "energy" && conclusion.direction === "below") {
    return "Below maintenance";
  }
  if (conclusion.domain === "weight") return "Supporting context";
  if (conclusion.domain === "photos" && conclusion.authority === "directional") {
    return "Photos looked generally stable.";
  }
  return title(conclusion.status ?? conclusion.direction ?? "Observed");
}

function conclusionProvenance(conclusion) {
  return {
    claimReferences: strings(conclusion?.claimReferences),
    evidenceBasis: strings(conclusion?.evidenceBasis),
  };
}

function isCanonicalAssessment(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.modelVersion === "pi_narrative_assessment_v1"
  );
}

function normalizeDomain(value) {
  return value === "energy_balance" ? "energy" : DOMAIN_ORDER.includes(value) ? value : null;
}

function label(domain) {
  return domain === "energy" ? "Energy" : title(domain ?? "Context");
}

function title(value) {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizedKey(value) {
  return String(value ?? "").trim().toLowerCase().replaceAll("_", " ");
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function strings(values) {
  return unique((Array.isArray(values) ? values : []).filter((item) => typeof item === "string"));
}

function stringsInOrder(values) {
  return uniqueInOrder(
    (Array.isArray(values) ? values : [])
      .filter((item) => typeof item === "string")
      .map(text)
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function uniqueInOrder(values) {
  return [...new Set(values.filter(Boolean))];
}

function finiteOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
