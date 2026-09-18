// Confidence V3 — Phase 5. Narrative V3: the explanatory layer over the SAME
// StrategicInterpretation + StrategicConfidenceProjection every numeric
// surface reads — never a second independent interpretation of the
// evidence. Same discipline V2's NarrativeEngine already established
// (`NarrativeTemplates.js`): deterministic, templated, keyed sentence
// lookups over structured fields, not free-text/model generation. That
// choice is deliberate here, not a placeholder — Phase 5 asks which
// elements are deterministic/templated/model-generated, and the honest
// answer for a strategic Confidence explanation (auditable, must not
// silently vary between identical inputs, must never assert something the
// interpretation doesn't structurally support) is: all of it, for now.
// Nothing here re-derives progress, pace, feasibility, or persistence — it
// only chooses which already-computed fact to say and how to phrase it.
//
// FACT / DERIVED / INTERPRETATION / UNCERTAINTY boundary, made explicit per
// section:
//   - `facts`     : direct readouts of the interpretation's structured
//                   fields (e.g. "153.3 lb on 2026-09-12").
//   - `derived`   : computed-but-not-interpreted values already present on
//                   the interpretation (pace, progress fraction) — this
//                   module restates them in prose, it does not compute them.
//   - `interpretation` : feasibility/persistence/strategic-significance
//                   verdicts — always phrased as "the evidence shows/
//                   suggests," never as raw fact.
//   - `uncertainty`     : `uncertaintyReason`/`missingEvidence`/
//                   `staleEvidence`, phrased as open questions, never
//                   smoothed into false confidence.

import { createHash } from "node:crypto";

export const NARRATIVE_V3_VERSION = "narrative_v3_v1";

const OUTCOME_DIRECTION_SUMMARY = Object.freeze({
  favorable: "the evidence is moving in the direction the Goal needs",
  unfavorable: "the evidence is moving against the direction the Goal needs",
  mixed: "the evidence is mixed — progress on the core metric, but a guardrail is under pressure",
  neutral: "the evidence has not shown a clear direction yet",
});

const FEASIBILITY_SUMMARY = Object.freeze({
  unproven: "Feasibility has not been demonstrated yet — no authoritative reading has shown the required rate is achievable.",
  weakly_supported: "Feasibility is only weakly supported — the required rate has not been clearly demonstrated.",
  demonstrated: "Feasibility has been demonstrated — an authoritative reading showed progress consistent with the required rate.",
  strongly_demonstrated: "Feasibility is strongly demonstrated — an authoritative reading showed progress ahead of the required rate, with the guardrail respected.",
  contradicted: "Feasibility is currently contradicted — the most recent authoritative reading moved against the Goal or breached a guardrail.",
});

const PERSISTENCE_SUMMARY = Object.freeze({
  unestablished: "There is not yet a comparable interval to judge persistence from.",
  single_observation: "This is the first time this favorable direction has been observed — persistence is not yet established.",
  confirmed_repeat: "This favorable direction has now been confirmed by a second reading.",
  sustained_repeat: "This favorable direction has been sustained across multiple readings.",
  contradicted: "A contradicting reading is present, resetting persistence for future favorable readings.",
});

// Word choice here is load-bearing, not stylistic: `increased`/`decreased`
// are exactly what CanonicalConfidencePresentationInvariant's
// INCREASE_LANGUAGE/DECREASE_LANGUAGE regexes require the published
// explanation text to contain for its corresponding `movementDirection` —
// see assertCanonicalConfidencePresentation. Do not rephrase these away
// from that vocabulary (e.g. "moved up") without also checking that
// invariant.
const MOVEMENT_SUMMARY = Object.freeze({
  increase: "increased",
  decrease: "decreased",
  no_meaningful_change: "held steady",
});

/**
 * @param interpretation  StrategicInterpretation (StrategicInterpretationService output).
 * @param eligibility      EvidenceEligibilityService output.
 * @param projection        StrategicConfidenceProjectionService output.
 * @param goalTitle          Presentation-only label, never branched on.
 * @param priorNarrativeSummary  The immediately-prior published narrative's
 *                                summary sentence, for continuity phrasing
 *                                ("since the last assessment...").
 */
export function generateNarrativeV3({
  interpretation,
  eligibility,
  projection,
  goalTitle = "this Goal",
  priorNarrativeSummary = null,
} = {}) {
  if (!interpretation || interpretation.schemaVersion !== "strategic_interpretation_v2") {
    throw new Error("generateNarrativeV3 requires a valid StrategicInterpretation.");
  }
  if (!projection || !projection.schemaVersion?.startsWith("strategic_confidence_projection")) {
    throw new Error("generateNarrativeV3 requires a valid StrategicConfidenceProjection.");
  }

  const movementSentence = buildMovementSentence({ projection, goalTitle });
  const outcomeSentence = OUTCOME_DIRECTION_SUMMARY[interpretation.strategicOutcomeDirection] ??
    OUTCOME_DIRECTION_SUMMARY.neutral;
  const summary = `${movementSentence} ${capitalize(outcomeSentence)}.`;

  const supportingFactors = buildSupportingFactors(interpretation);
  const limitingFactors = buildLimitingFactors({ interpretation, eligibility });

  const sections = Object.freeze({
    currentState: Object.freeze({
      kind: "interpretation",
      text: `${capitalize(goalTitle)} is currently assessed as ${interpretation.strategicOutcomeDirection}, ` +
        `with ${interpretation.strategicSignificance} significance.`,
    }),
    whatChanged: Object.freeze({
      kind: "derived",
      text: movementSentence,
    }),
    whySupporting: supportingFactors.length
      ? Object.freeze({ kind: "interpretation", items: supportingFactors })
      : null,
    whyLimiting: limitingFactors.length
      ? Object.freeze({ kind: "uncertainty", items: limitingFactors })
      : null,
    evidenceGaps: buildEvidenceGapsSection(eligibility),
    operatingPlanImplications: buildOperatingPlanImplications({ interpretation, eligibility }),
  });

  return Object.freeze({
    schemaVersion: NARRATIVE_V3_VERSION,
    generationMode: "deterministic_templated",
    summary,
    sections,
    supportingFactors,
    limitingFactors,
    continuityNote: priorNarrativeSummary
      ? `Previously: ${priorNarrativeSummary}`
      : null,
    provenance: Object.freeze({
      engineVersion: NARRATIVE_V3_VERSION,
      interpretationInputFingerprint: interpretation.provenance.inputFingerprint,
      inputFingerprint: fingerprintOf({ interpretation, eligibility, projection }),
    }),
  });
}

function buildMovementSentence({ projection, goalTitle }) {
  const verb = MOVEMENT_SUMMARY[projection.movement] ?? "held steady";
  if (projection.movement === "no_meaningful_change") {
    return `Confidence for ${goalTitle} ${verb} at ${projection.currentPercentage}%.`;
  }
  return `Confidence for ${goalTitle} ${verb} from ${projection.previousPercentage}% ` +
    `to ${projection.currentPercentage}% (${projection.delta > 0 ? "+" : ""}${projection.delta}).`;
}

function buildSupportingFactors(interpretation) {
  const items = [];
  if (interpretation.feasibilityState !== "unproven" && interpretation.feasibilityState !== "contradicted") {
    items.push(Object.freeze({
      key: `feasibility_${interpretation.feasibilityState}`,
      text: FEASIBILITY_SUMMARY[interpretation.feasibilityState],
    }));
  }
  if (["confirmed_repeat", "sustained_repeat"].includes(interpretation.persistenceState)) {
    items.push(Object.freeze({
      key: `persistence_${interpretation.persistenceState}`,
      text: PERSISTENCE_SUMMARY[interpretation.persistenceState],
    }));
  }
  if (interpretation.guardrailDirection === "favorable") {
    items.push(Object.freeze({ key: "guardrail_favorable", text: "Every tracked guardrail remains respected." }));
  }
  return Object.freeze(items);
}

function buildLimitingFactors({ interpretation, eligibility }) {
  const items = [];
  for (const reason of interpretation.uncertaintyReason ?? []) {
    const text = UNCERTAINTY_TEXT[reason];
    if (text) items.push(Object.freeze({ key: reason, text }));
  }
  if (interpretation.guardrailDirection === "unfavorable") {
    items.push(Object.freeze({
      key: "guardrail_unfavorable",
      text: "A tracked guardrail is currently unfavorable, which caps how far Confidence can move up.",
    }));
  }
  for (const missing of eligibility?.missingEvidence ?? []) {
    items.push(Object.freeze({
      key: `missing_${missing.domain}`,
      text: `No eligible ${missing.domain} evidence has been recorded for this Goal yet.`,
    }));
  }
  for (const stale of eligibility?.staleEvidence ?? []) {
    items.push(Object.freeze({
      key: `stale_${stale.domain}`,
      text: `The most recent ${stale.domain} evidence is ${stale.ageDays} days old, older than the expected ${stale.expectedCadenceDays}-day cadence.`,
    }));
  }
  return Object.freeze(items);
}

const UNCERTAINTY_TEXT = Object.freeze({
  single_observation_of_favorable_direction: "This favorable reading is a single observation — persistence has not yet been confirmed by a second interval.",
  biological_persistence_unproven: "Because this is a single high-authority reading, the underlying biological trend still needs to be confirmed rather than assumed.",
  awaiting_sustained_confirmation: "A second confirming reading has been seen, but sustained confirmation (a third) has not.",
  contradicting_reading_present: "A reading contradicting the favorable direction is present in the evidence history.",
  required_rate_not_yet_demonstrated: "The rate of progress required to achieve the Goal has not yet been clearly demonstrated.",
  no_deadline_pace_unavailable: "This Goal has no deadline, so pace-vs-deadline cannot be assessed — only raw progress magnitude.",
  guardrail_state_unknown: "At least one guardrail's position could not be assessed from available evidence.",
});

function buildEvidenceGapsSection(eligibility) {
  if (!eligibility) return null;
  const missing = eligibility.missingEvidence ?? [];
  const stale = eligibility.staleEvidence ?? [];
  if (missing.length === 0 && stale.length === 0) return null;
  return Object.freeze({
    kind: "uncertainty",
    missingDomains: Object.freeze(missing.map((item) => item.domain)),
    staleDomains: Object.freeze(stale.map((item) => item.domain)),
  });
}

function buildOperatingPlanImplications({ interpretation, eligibility }) {
  const implications = [];
  if (interpretation.nextDecisiveEvidence) {
    implications.push(Object.freeze({
      key: "next_decisive_evidence",
      evidenceType: interpretation.nextDecisiveEvidence.evidenceType,
      text: `The next decisive evidence would be another ${interpretation.nextDecisiveEvidence.evidenceType} reading — ${interpretation.nextDecisiveEvidence.reason}.`,
    }));
  }
  for (const missing of eligibility?.missingEvidence ?? []) {
    implications.push(Object.freeze({
      key: `collect_${missing.domain}`,
      evidenceType: missing.domain,
      text: `No ${missing.domain} evidence is eligible yet — the Operating Plan's ${missing.domain} cadence has not produced a usable reading.`,
    }));
  }
  return implications.length ? Object.freeze(implications) : Object.freeze([]);
}

function capitalize(value) {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value;
}
function fingerprintOf(value) {
  return `sha256_${createHash("sha256").update(stable(value)).digest("hex")}`;
}
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
