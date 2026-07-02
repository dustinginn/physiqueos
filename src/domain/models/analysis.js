import { createFieldProvenance, createSource } from "./recordMetadata";

export const AnalysisTone = {
  INFO: "info",
  POSITIVE: "positive",
  WARNING: "warning",
  CRITICAL: "critical",
};

export function createAnalysis(data = {}) {
  return {
    id: "",
    createdAt: "",
    title: "",
    summary: "",
    evidenceIds: [],
    evidenceTypes: [],
    findings: [],
    impacts: [],
    recommendation: {
      title: "",
      rationale: "",
      action: null,
    },
    confidenceBefore: null,
    confidenceAfter: null,
    homeChanges: [],
    tone: AnalysisTone.INFO,
    source: createSource({ type: "computed", name: "PhysiqueOS" }),
    fieldProvenance: createFieldProvenance({
      imported: ["evidenceIds", "evidenceTypes"],
      computed: [
        "title",
        "summary",
        "findings",
        "impacts",
        "recommendation",
        "confidenceBefore",
        "confidenceAfter",
        "homeChanges",
        "tone",
      ],
    }),
    ...data,
  };
}
