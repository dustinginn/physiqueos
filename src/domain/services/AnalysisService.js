import { createAnalysis, AnalysisTone } from "../models/analysis";

const DEFAULT_RECOMMENDATION =
  "Continue reviewing trend data before making changes.";

export function createAnalysisFromEvidence(evidence = {}) {
  const evidenceType = evidence.type ?? "evidence";
  const evidenceId = evidence.id ? [evidence.id] : [];
  const weightChange = getWeightChange(evidence);
  const isWeightEvidence = evidenceType === "weight";
  const contextAdjusted = isContextAdjusted(evidence.context);

  return createAnalysis({
    id: evidence.analysisId ?? `analysis_${Date.now()}`,
    createdAt: evidence.createdAt ?? new Date().toISOString(),
    title: getAnalysisTitle(evidenceType, weightChange),
    summary: getAnalysisSummary(evidenceType, evidence, weightChange, contextAdjusted),
    evidenceIds: evidenceId,
    evidenceTypes: [evidenceType],
    findings: getFindings(evidenceType, evidence, weightChange, contextAdjusted),
    impacts: getImpacts(evidenceType, weightChange, contextAdjusted),
    recommendation: getRecommendation(evidenceType, weightChange, contextAdjusted),
    confidenceBefore: evidence.confidenceBefore ?? null,
    confidenceAfter: evidence.confidenceAfter ?? null,
    homeChanges: [
      {
        section: "home",
        change: isWeightEvidence ? "morning_weight_recorded" : "eligible_for_refresh",
      },
    ],
    tone: getTone(evidenceType, weightChange),
  });
}

function getAnalysisTitle(evidenceType, weightChange) {
  if (evidenceType === "weight" && weightChange?.meaningful) {
    return "Morning Weight Updated";
  }
  if (evidenceType === "weight") return "Morning Weight Recorded";
  if (evidenceType === "dexa") return "DEXA Evidence Recorded";
  if (evidenceType === "protocol") return "Protocol Context Updated";

  return "Evidence Recorded";
}

function getAnalysisSummary(evidenceType, evidence, weightChange, contextAdjusted) {
  if (evidenceType === "weight" && weightChange?.hasPrevious) {
    const direction = weightChange.delta > 0 ? "up" : "down";
    const contextNote = contextAdjusted
      ? " Conditions differed from the normal morning weigh-in context."
      : "";

    if (!weightChange.meaningful) {
      return `Morning weight was ${formatWeight(evidence.value, evidence.unit)} with no meaningful change from the prior recorded weight.${contextNote}`;
    }

    return `Morning weight was ${formatWeight(evidence.value, evidence.unit)}, ${direction} ${Math.abs(weightChange.delta).toFixed(1)} ${evidence.unit} from the prior recorded weight.${contextNote}`;
  }

  if (evidenceType === "weight") {
    const contextNote = contextAdjusted
      ? " under different weigh-in conditions"
      : "";

    return `Morning weight was recorded at ${formatWeight(evidence.value, evidence.unit)}${contextNote}.`;
  }
  if (evidenceType === "dexa") {
    return "Body composition evidence recorded.";
  }
  if (evidenceType === "protocol") return "Protocol context recorded.";

  return "Evidence recorded.";
}

function getFindings(evidenceType, evidence, weightChange, contextAdjusted) {
  if (evidenceType !== "weight") {
    return [
      {
        title: "Evidence received",
        detail: `${formatEvidenceType(evidenceType)} evidence was recorded.`,
      },
    ];
  }

  const findings = [
    {
      title: "Manual morning weight saved",
      detail: `${formatWeight(evidence.value, evidence.unit)} is now the authoritative weight evidence for ${evidence.measuredAt}.`,
    },
  ];

  findings.push(
    contextAdjusted
      ? {
          title: "Different conditions noted",
          detail:
            "This entry is stored as manual evidence, but should be interpreted with the unusual weigh-in context attached.",
        }
      : {
          title: "Default context applied",
          detail:
            "This entry inherited the normal morning, fasted, before food/water, home-scale context.",
        }
  );

  if (!weightChange?.hasPrevious) {
    findings.push({
      title: "Baseline ready",
      detail: "Future check-ins can now compare against this manual weight.",
    });

    return findings;
  }

  if (!weightChange.meaningful) {
    findings.push({
      title: "No meaningful change",
      detail: "The change from the prior recorded weight is small enough to treat as normal day-to-day variation.",
    });
  } else {
    findings.push({
      title: "Weight changed",
      detail: `The latest entry changed by ${Math.abs(weightChange.delta).toFixed(1)} ${evidence.unit} from the prior recorded weight.`,
    });
  }

  return findings;
}

function getImpacts(evidenceType, weightChange, contextAdjusted) {
  if (evidenceType !== "weight") {
    return [
      {
        area: "home",
        detail: "Home data can now refresh from the latest evidence.",
      },
    ];
  }

  return [
    {
      area: "home",
      detail: "Home can now refresh trajectory, momentum, focus, and latest analysis from today's manual evidence.",
    },
    {
      area: "confidence",
      detail: getConfidenceImpact(weightChange, contextAdjusted),
    },
  ];
}

function getRecommendation(evidenceType, weightChange, contextAdjusted) {
  if (evidenceType !== "weight") {
    return {
      title: "Review trend before changing course",
      rationale: DEFAULT_RECOMMENDATION,
      action: null,
    };
  }

  if (contextAdjusted) {
    return {
      title: "Treat as context-adjusted evidence",
      rationale:
        "The weight is useful, but the conditions were different from the normal morning baseline. Compare it with the next default-context weigh-in before changing course.",
      action: "/",
    };
  }

  if (!weightChange?.hasPrevious) {
    return {
      title: "Keep collecting morning evidence",
      rationale:
        "This creates the first manual anchor. Continue logging morning weight before changing strategy.",
      action: "/check-in/morning",
    };
  }

  if (!weightChange.meaningful) {
    return {
      title: "Stay the course today",
      rationale:
        "Today's weight does not show a meaningful shift. Continue the current plan and let trend data do the deciding.",
      action: "/",
    };
  }

  return {
    title: "Review trend before adjusting",
    rationale:
      "The change is worth noticing, but one morning weight is not enough to change course. Compare it with the recent trend before making adjustments.",
    action: "/",
  };
}

function getTone(evidenceType, weightChange) {
  if (evidenceType === "weight" && !weightChange?.meaningful) {
    return AnalysisTone.POSITIVE;
  }

  return AnalysisTone.INFO;
}

function getWeightChange(evidence) {
  if (evidence.type !== "weight" || evidence.previousValue == null) {
    return null;
  }

  const delta = Number((evidence.value - evidence.previousValue).toFixed(1));

  return {
    delta,
    hasPrevious: true,
    meaningful: Math.abs(delta) >= 1,
  };
}

function getConfidenceImpact(weightChange, contextAdjusted) {
  if (contextAdjusted) {
    return "Confidence is context-adjusted because this weigh-in did not match the normal morning baseline.";
  }

  if (weightChange?.meaningful) {
    return "Confidence can update, but one weight change should be interpreted through trend context.";
  }

  return "Confidence is supported by a stable check-in without a meaningful day-to-day shift.";
}

function isContextAdjusted(context) {
  return Boolean(context && context.isDefault === false);
}

function formatWeight(value, unit = "lb") {
  if (value === null || value === undefined) return "the recorded weight";

  return `${Number(value).toFixed(1)} ${unit}`;
}

function formatEvidenceType(evidenceType) {
  return evidenceType
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
