export function interpretVoiceEvidence(evidence = {}) {
  return {
    sourceId: evidence.id ?? "",
    sourceType: "voice",
    transcript: evidence.transcript ?? "",
    facts: evidence.transcript ? [evidence.transcript] : [],
    observations: [],
    recommendations: [],
    confidence: "pending",
    status: "stub",
  };
}
