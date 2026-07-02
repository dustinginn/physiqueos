export function interpretPdfEvidence(evidence = {}) {
  return {
    sourceId: evidence.id ?? "",
    sourceType: "pdf",
    extractedFields: evidence.extractedFields ?? {},
    observations: [],
    recommendations: [],
    confidence: "pending",
    status: "stub",
  };
}
