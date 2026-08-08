import ConfidenceRing from "../ui/ConfidenceRing";
import {
  assertCanonicalConfidencePresentation,
  canonicalConfidenceExplanation,
} from "../../domain/services/CanonicalConfidencePresentationInvariant";

export default function BriefingConfidenceAnchor({
  animate = false,
  confidence,
  testId = "briefing-confidence",
  topBorder = testId !== "midweek-confidence",
}) {
  if (!confidence) return null;
  const canonicalConfidence = assertCanonicalConfidencePresentation(confidence);
  return (
    <div
      className={`grid grid-cols-[104px_minmax(0,1fr)] items-center gap-4 border-b border-[var(--divider)] py-4 ${topBorder ? "border-t" : ""}`}
      data-testid={testId}
    >
      {animate ? <ConfidenceRing
        animate
        className="mx-auto"
        label={`Goal confidence ${canonicalConfidence.score} percent, ${bandLabel(canonicalConfidence.band)}. ${movementLabel(canonicalConfidence)}`}
        showLabel={false}
        size={96}
        value={canonicalConfidence.score}
      /> : <ConfidenceRing
        animate={false}
        className="mx-auto"
        label={`Goal confidence ${canonicalConfidence.score} percent, ${bandLabel(canonicalConfidence.band)}. ${movementLabel(canonicalConfidence)}`}
        showLabel={false}
        size={96}
        value={canonicalConfidence.score}
      />}
      <div>
        <p className="text-[10px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">
          {bandLabel(canonicalConfidence.band)} confidence
        </p>
        <p className="mt-1 text-sm font-black text-[var(--text-primary)]">
          {movementLabel(canonicalConfidence)}
        </p>
        <p className="mt-2 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
          {confidenceHeadline(canonicalConfidence)}
        </p>
      </div>
    </div>
  );
}

export function movementLabel(confidence) {
  if (confidence.movementDirection === "increased") return `▲ +${Math.abs(confidence.delta)}`;
  if (confidence.movementDirection === "decreased") return `▼ −${Math.abs(confidence.delta)}`;
  if (confidence.movementDirection === "held") return "— No change";
  if (confidence.movementDirection === "initial") return "Initial assessment";
  return "Movement unavailable";
}

export function confidenceHeadline(confidence) {
  return canonicalConfidenceExplanation(confidence);
}

function bandLabel(value) {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
