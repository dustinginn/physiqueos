const DOMAIN_ORDER = Object.freeze(["training", "energy_balance", "weight", "photos"]);

export function normalizeWeeklyHeroDomains(cards, domainDefinitions = {}) {
  const structured = Array.isArray(cards) ? cards : [];
  const byDomain = new Map(structured
    .filter((item) => item && typeof item === "object")
    .map((item) => [normalizeDomain(item.domain), item]));
  return DOMAIN_ORDER.map((domain) =>
    normalizeDomainCard(byDomain.get(domain), domain, domainDefinitions?.[domain])
  );
}

function normalizeDomainCard(card, domain, definition) {
  const value = card && typeof card === "object" ? card : {};
  const metadata = definition && typeof definition === "object" ? definition : {};
  return {
    ...value,
    domain,
    label: stringOrNull(value.label) ?? stringOrNull(metadata.label) ?? "",
    headline: stringOrNull(value.headline) ?? "",
    detail: stringOrNull(value.detail) ?? "",
    icon: stringOrNull(value.icon) ?? stringOrNull(metadata.icon) ?? "",
    tone: stringOrNull(value.tone) ?? stringOrNull(metadata.tone) ?? "",
    accent: stringOrNull(value.accent) ?? stringOrNull(metadata.accent) ?? "",
    limitations: Array.isArray(value.limitations) ? value.limitations : [],
  };
}

function normalizeDomain(value) {
  if (value === "energy") return "energy_balance";
  return DOMAIN_ORDER.includes(value) ? value : null;
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
