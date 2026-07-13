const ENTITY_ALIASES = [
  {
    canonical: "Tesamorelin",
    entity_type: "protocol_compound",
    aliases: ["tessa moreland", "tessmoreland", "tesamoralin", "tesamorelin"],
    protocolBias: "active_protocol",
  },
  {
    canonical: "Retatrutide",
    entity_type: "protocol_compound",
    aliases: ["reda truetide", "redditrue tide", "reta", "retatrutide"],
    protocolBias: "active_protocol",
  },
];

export function resolveVoiceEntities(transcript = "", { userHistory = {} } = {}) {
  const text = String(transcript ?? "");
  const normalized = normalizeEntityText(text);
  const resolved = [];

  ENTITY_ALIASES.forEach((entity) => {
    const match = findEntityAliasMatch({ entity, normalized, text });

    if (!match) return;

    resolved.push({
      accepted_canonical_name: entity.canonical,
      alias_matched: match.alias,
      confidence: match.confidence,
      entity_type: entity.entity_type,
      original_language: match.originalLanguage ?? match.alias,
      resolution_strategy: match.strategy,
      signals: {
        active_protocol_bias: entity.protocolBias,
        known_alias: match.strategy === "known_alias",
        phonetic_similarity: match.strategy === "phonetic_similarity",
        user_history_available: Boolean(userHistory?.entities?.[entity.canonical]),
      },
    });
  });

  return {
    resolved_entities: resolved,
    unresolved_mentions: [],
  };
}

function findEntityAliasMatch({ entity, normalized, text }) {
  for (const alias of entity.aliases) {
    const normalizedAlias = normalizeEntityText(alias);

    if (normalized.includes(normalizedAlias)) {
      return {
        alias,
        confidence: alias === entity.canonical.toLowerCase() ? "high" : "high",
        originalLanguage: findOriginalAliasText(text, alias),
        strategy: "known_alias",
      };
    }
  }

  const transcriptTokens = normalized.split(" ").filter(Boolean);
  const candidate = entity.aliases
    .map((alias) => ({
      alias,
      score: getTokenSimilarityScore(normalizeEntityText(alias), transcriptTokens),
    }))
    .sort((a, b) => b.score - a.score)[0];

  if (candidate?.score >= 0.72) {
    return {
      alias: candidate.alias,
      confidence: "moderate",
      strategy: "phonetic_similarity",
    };
  }

  return null;
}

function findOriginalAliasText(text, alias) {
  const pattern = new RegExp(
    `\\b${alias
      .split(/\s+/)
      .map(escapeRegExp)
      .join("[\\s-]+")}\\b`,
    "i"
  );
  const match = String(text ?? "").match(pattern);

  return match?.[0] ?? alias;
}

function getTokenSimilarityScore(alias, transcriptTokens) {
  const aliasTokens = alias.split(" ").filter(Boolean);
  if (aliasTokens.length === 0 || transcriptTokens.length === 0) return 0;

  const bestScores = aliasTokens.map((aliasToken) =>
    Math.max(
      ...transcriptTokens.map((token) => getStringSimilarity(aliasToken, token))
    )
  );

  return bestScores.reduce((sum, score) => sum + score, 0) / bestScores.length;
}

function getStringSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;

  const distance = levenshtein(left, right);
  const maxLength = Math.max(left.length, right.length);

  return maxLength ? 1 - distance / maxLength : 0;
}

function levenshtein(left, right) {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => [index]);

  for (let column = 1; column <= right.length; column += 1) {
    rows[0][column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;

      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + cost
      );
    }
  }

  return rows[left.length][right.length];
}

function normalizeEntityText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
