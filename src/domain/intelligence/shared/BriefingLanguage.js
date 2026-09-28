// Shared language rules for Founder-facing Briefing Intelligence copy.
//
// "Read" used as analyst shorthand — a "read" on progress, the "clearest read",
// days "complete enough to read", "read the balance as…" — is model jargon,
// not coach language. The literal act of reading (a label, a screen) is fine;
// only the interpret/evaluate/indicator sense is ruled out. Realization picks
// context-appropriate words instead (shows, indicator, sign, judge, picture…).
export const ANALYTICAL_READ_JARGON = new RegExp([
  "\\b(?:clear(?:er|est)?|earl(?:y|iest)|steadier|better|full(?:er)?|overall|visual|useful|main|dominant|safest|detailed|complete|coach|conditioning|photo|front|first|quick|good|strong(?:er)?)\\s+read\\b",
  "\\bEarly read\\b",
  "\\b(?:easy|hard|harder|easier|difficult) to read\\b",
  "\\b(?:complete|clean) enough to read\\b",
  "\\btoo (?:patchy|incomplete|sparse) to read\\b",
  "\\bread on (?:progress|how|your|the (?:week|month|trend|goal|change|cut|build))\\b",
  "\\bread (?:the (?:weekly|balance|trend)|intake|cleanly|as directional|together)\\b",
  "\\bbe read (?:together|cleanly|alongside|as)\\b",
  "\\breads? (?:as|like)\\b",
  "\\bclear(?:er|est)? reading\\b",
  "\\b(?:un)?readable days?\\b",
  "\\bthe read (?:is|was)\\b",
  "\\breads? (?:tighter|cleaner|leaner|sharper|flatter|stronger|softer|smaller|larger|bigger|wider|more|less|a (?:little|bit)|slightly|modestly|maintained|athletic)\\b",
  "\\b(?:its|this) read\\b(?! \\d)",
].join("|"), "iu");

export function findAnalyticalReadJargon(text) {
  const match = ANALYTICAL_READ_JARGON.exec(String(text ?? ""));
  return match ? match[0] : null;
}
