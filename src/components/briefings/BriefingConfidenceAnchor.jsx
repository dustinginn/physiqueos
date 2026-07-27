import ConfidenceRing from "../ui/ConfidenceRing";

export default function BriefingConfidenceAnchor({
  confidence,
  testId = "briefing-confidence",
}) {
  if (!confidence) return null;
  return (
    <div
      className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-4 border-y border-[var(--divider)] py-4"
      data-testid={testId}
    >
      <ConfidenceRing
        animate={false}
        className="mx-auto"
        label={`Goal confidence ${confidence.score} percent, ${bandLabel(confidence.band)}. ${movementLabel(confidence)}`}
        showLabel={false}
        size={96}
        value={confidence.score}
      />
      <div>
        <p className="text-[10px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">
          {bandLabel(confidence.band)} confidence
        </p>
        <p className="mt-1 text-sm font-black text-[var(--text-primary)]">
          {movementLabel(confidence)}
        </p>
        <p className="mt-2 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
          {confidenceHeadline(confidence)}
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
  if (confidence.presentationExplanation) return confidence.presentationExplanation;
  const support = confidence.supportingReasons?.[0];
  const limit = confidence.limitingReasons?.[0];
  if (confidence.movementDirection === "increased" && support && limit) {
    return `Confidence increased because ${lower(support)}, while ${lower(limit)}.`;
  }
  if (confidence.movementDirection === "held" && limit) {
    return `Confidence held while ${lower(limit)}.`;
  }
  if (confidence.movementDirection === "decreased" && limit) {
    return `Confidence decreased because ${lower(limit)}.`;
  }
  return confidence.primaryReason;
}

function lower(value) {
  return String(value).replace(/[.]$/u, "").replace(/^./u, (letter) => letter.toLowerCase());
}

function bandLabel(value) {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
