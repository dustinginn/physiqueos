export function interpretTextEvidence(evidence = {}) {
  return {
    sourceId: evidence.id ?? "",
    sourceType: evidence.type ?? "text",
    facts: evidence.text ? [evidence.text] : [],
    observations: [],
    recommendations: [],
    confidence: "pending",
    status: "stub",
  };
}
