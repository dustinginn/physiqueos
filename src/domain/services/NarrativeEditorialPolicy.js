const SYSTEM_STATE_CONCEPTS = [
  /\b(?:trend|context|projection|trajectory|forecast|state|status|assessment)\s+(?:(?:was|has been|remains?)\s+)?(?:updated|refreshed|unchanged|preserved|stable|confirmed)\b/i,
  /\bcurrent\s+(?:projection|trajectory|forecast|milestone|observation|confidence)\s+(?:state|snapshot)\b/i,
  /\b(?:evidence window|narrative driver|reconciliation date|confidence snapshot|milestone state|observation remains active)\b/i,
  /\bno material (?:state )?change\b/i,
];

const VAGUE_CHECKPOINTS = [
  /\b(?:moving|continue|wait(?:ing)?) (?:toward|until|for) (?:the )?next (?:scheduled )?measurement\b/i,
  /\b(?:the )?next (?:scheduled )?measurement (?:remains pending|will provide|will add|will confirm)\b/i,
  /\bmeasurement remains pending\b/i,
];

const GENERIC_ACTIONS = /^(?:keep execution steady|continue (?:the )?current plan|stay the course|let the trend do its job|no change needed)\.?$/i;
const FILLER_SUPPORT = /^(?:the trend is aligned|strength is holding up|training is holding up well|the plan remains unchanged|we(?:'re| are) still moving in the right direction)\.?$/i;

export function inspectUserFacingLanguage(value) {
  const text = normalize(value);
  return {
    systemState: text ? SYSTEM_STATE_CONCEPTS.some((pattern) => pattern.test(text)) : false,
    vagueCheckpoint: text ? VAGUE_CHECKPOINTS.some((pattern) => pattern.test(text)) : false,
    genericAction: text ? GENERIC_ACTIONS.test(text) : false,
    fillerSupport: text ? FILLER_SUPPORT.test(text) : false,
  };
}

export function isUserFacingNarrationAllowed(value) {
  const result = inspectUserFacingLanguage(value);
  return !result.systemState && !result.vagueCheckpoint;
}

export function filterEditorialNarration(items = []) {
  return items.map(normalize).filter(Boolean).filter(isUserFacingNarrationAllowed);
}

export function getClaimLifecycle({ claimId, evidenceDate = null, currentEvidenceDate = null, history = [] } = {}) {
  const appearances = history.filter((entry) => entry.claimId === claimId);
  const current = Boolean(evidenceDate && currentEvidenceDate && evidenceDate === currentEvidenceDate);
  if (current && appearances.length === 0) return "new";
  if (current) return "relevant";
  if (appearances.length === 0) return "relevant";
  if (appearances.length >= 2 || consecutiveTailCount(history, claimId) >= 2) return "retired";
  if (appearances.length === 1) return "background";
  return "relevant";
}

export function auditUserFacingNarrative(narrative, { claimLifecycles = {}, recentProse = [] } = {}) {
  const supports = narrative.supportingObservations ?? [];
  const interpretation = narrative.interpretation ?? [];
  const coach = [narrative.coachInsight, narrative.coachInsightView?.currentFocusBody].filter(Boolean);
  const visible = [narrative.hero?.title, narrative.hero?.summary, ...supports, ...interpretation, ...coach].filter(Boolean);
  const language = visible.map((text) => ({ text, ...inspectUserFacingLanguage(text) }));
  const checkpointMentions = visible.filter((text) => /\b(?:DEXA|photos?|weekly average|weigh-in|scan)\b/i.test(text) && /\b(?:next|Saturday|weekend|upcoming|will)\b/i.test(text));
  return {
    systemStateLanguage: language.filter((item) => item.systemState).map((item) => item.text),
    vagueFutureMeasurements: language.filter((item) => item.vagueCheckpoint).map((item) => item.text),
    genericActions: language.filter((item) => item.genericAction).map((item) => item.text),
    fillerHeroBullets: supports.filter((text) => inspectUserFacingLanguage(text).fillerSupport),
    excessiveHeroBullets: supports.length === 3 && supports.filter((text) => inspectUserFacingLanguage(text).fillerSupport).length > 0,
    unnamedCheckpoints: visible.filter((text) => /next (?:scheduled )?measurement/i.test(text)),
    unexplainedNamedCheckpoints: checkpointMentions.filter((text) => !/\b(?:show|tell|answer|confirm|whether|useful because|more useful)\b/i.test(text)),
    exhaustedClaimsPresented: Object.entries(claimLifecycles).filter(([, state]) => state === "retired").map(([claimId]) => claimId),
    sectionOverlap: {
      heroInterpretation: semanticOverlap([narrative.hero?.title, narrative.hero?.summary, ...supports], interpretation),
      interpretationCoach: semanticOverlap(interpretation, coach),
    },
    recentProseOverlap: visible.filter((text) => recentProse.some((recent) => tokenOverlap(text, recent) >= 0.8)),
  };
}

function consecutiveTailCount(history, claimId) {
  let count = 0;
  for (let index = history.length - 1; index >= 0 && history[index]?.claimId === claimId; index -= 1) count += 1;
  return count;
}

function semanticOverlap(left, right) {
  return left.filter(Boolean).flatMap((a) => right.filter(Boolean).filter((b) => tokenOverlap(a, b) >= 0.66).map((b) => ({ left: a, right: b })));
}

function tokenOverlap(left, right) {
  const a = new Set(String(left).toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const b = new Set(String(right).toLowerCase().match(/[a-z]{4,}/g) ?? []);
  if (!a.size || !b.size) return 0;
  return [...a].filter((token) => b.has(token)).length / Math.min(a.size, b.size);
}

function normalize(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}
