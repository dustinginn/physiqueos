import { expect } from "vitest";

// PhysiqueOS Intelligence (PI) may internally reason about evidence sufficiency, uncertainty,
// information value, delay cost, Phase Review, authorization, strategy lifecycle, monitoring/
// review cadence, Guardrails, and Forecast/Confidence lineage — but user-facing coaching text
// must translate that reasoning into plain, direct language rather than narrating the
// architecture that produced it. This is the shared denylist of governance/internal-reasoning
// phrasing that must never appear in coaching-voice surfaces (Coach's Take, Current Phase,
// Guardrail context, Evidence Anchors/Turning Points, Current Strategy, weekly synthesis,
// Energy Balance, Weight Context, Body Composition, Forward Guidance, Operating Plan copy).
export const BANNED_GOVERNANCE_LANGUAGE_PATTERNS = Object.freeze([
  /remaining uncertainty was sufficiently bounded/i,
  /value of more information/i,
  /cost of delay/i,
  /user-authorized changes/i,
  /authorized transition/i,
  /phase review weighed/i,
  /current decision boundary/i,
  /monitoring cadence/i,
  /strategic review anchor/i,
  /pi recommended review/i,
  /the user authorized moving forward/i,
  /\bthe user authorized\b/i,
  /\buser authorized\b/i,
  /\buser-authorized\b/i,
  /sufficiently bounded/i,
  /did not conclusively prove/i,
  /\bPI\b/,
]);

// Returns every banned governance-language phrase found in `text` (empty array when the
// copy reads as natural coaching voice).
export function findGovernanceLanguageLeaks(text) {
  if (!text) return [];
  return BANNED_GOVERNANCE_LANGUAGE_PATTERNS
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);
}

// Test-facing assertion: none of `values` may contain internal/domain reasoning language.
// Use across every coaching-voice surface, with generic (non-Founder-specific) example
// inputs, so this genuinely guards the translation boundary rather than one paragraph.
export function expectNoGovernanceLanguageLeak(values) {
  for (const copy of (values ?? []).filter(Boolean)) {
    const leaks = findGovernanceLanguageLeaks(copy);
    expect(leaks, `Governance/internal-reasoning language leaked into coaching copy: "${copy}"`).toEqual([]);
  }
}
