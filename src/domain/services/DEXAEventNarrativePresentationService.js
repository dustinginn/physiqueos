export function projectDEXAEventNarrativePresentation(narrative) {
  if (!narrative) return narrative;
  const result = structuredClone(narrative);
  const opening = result.interpretation?.opening;
  const guardrail = String(result.interpretation?.fatLoss ?? "").match(
    /body fat is (below|above|within|near)[^0-9]*(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)%/iu);
  if (opening?.includes("cannot yet judge body fat against a clear target range") && guardrail) {
    const status = guardrail[1].toLowerCase();
    result.interpretation.opening = opening.replace(
      "Lean tissue moved up, but we cannot yet judge body fat against a clear target range.",
      `Lean tissue moved up while body fat remained ${status} the exact ${guardrail[2]}–${guardrail[3]}% Guardrail you chose.`);
  }
  return deepFreeze(result);
}

function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
