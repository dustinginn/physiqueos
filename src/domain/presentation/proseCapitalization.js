import { expect } from "vitest";

// Internal domain nouns that recur across generated prose. These represent canonical
// objects (Goal, Strategy, Phase, ...) and should read like ordinary English words in a
// sentence, not like a proper noun, unless they are genuinely starting the sentence.
export const INTERNAL_DOMAIN_NOUNS = Object.freeze([
  "Training", "Energy", "Weight", "Photos", "Goal", "Recovery", "Activity",
  "Strategy", "Phase", "Forecast", "Confidence", "Evidence", "Guardrail", "Nutrition",
]);

// Proper user-facing titles/names that legitimately keep an internal-object noun capitalized
// mid-sentence (they are labels/titles, not ordinary prose) — matches inside these spans are
// never flagged.
export const KNOWN_PROSE_TITLE_EXCEPTIONS = Object.freeze([
  "Build Lean Mass", "Lean Mass Build", "Establish Maintenance", "Goal Review comes next",
  "Phase Review",
]);

// Returns every mid-sentence occurrence of a capitalized internal-object noun in `text` that
// is neither at a sentence boundary nor inside a known proper-title exception. An empty
// array means the prose reads naturally.
export function findUnnaturalInternalNounCapitalization(text, {
  domains = INTERNAL_DOMAIN_NOUNS, exceptions = KNOWN_PROSE_TITLE_EXCEPTIONS,
} = {}) {
  if (!text) return [];
  const exceptionSpans = exceptions
    .map((title) => ({ title, index: text.indexOf(title) }))
    .filter((span) => span.index !== -1)
    .map((span) => ({ start: span.index, end: span.index + span.title.length }));
  const violations = [];
  for (const domain of domains) {
    for (const match of text.matchAll(new RegExp(`\\b${domain}\\b`, "g"))) {
      const prefix = text.slice(0, match.index).trimEnd();
      if (prefix === "" || /[.!?]$/.test(prefix)) continue;
      if (exceptionSpans.some((span) => match.index >= span.start && match.index < span.end)) continue;
      violations.push({ domain, index: match.index });
    }
  }
  return violations;
}

// Test-facing assertion: every string in `values` must read with natural prose
// capitalization for internal domain nouns. Use inside vitest specs.
export function expectInternalDomainNamesNatural(values, options) {
  for (const copy of (values ?? []).filter(Boolean)) {
    const violations = findUnnaturalInternalNounCapitalization(copy, options);
    expect(violations, `Unnatural mid-sentence capitalization in: "${copy}"`).toEqual([]);
  }
}
