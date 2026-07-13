import { createFieldProvenance, createSource } from "./recordMetadata";

export function createDailyBriefing(data = {}) {
  return {
    id: "",
    userId: "",
    generatedAt: "",
    artifactType: "scheduled",
    cadence: "daily",
    evidenceWindow: null,
    lifecycle: { generatedAt: "", surfacedAt: null, openedAt: null, consumedAt: null, supersededAt: null, resolvedAt: null, eligibleForHigherCadenceSummary: true },
    trigger: {
      evidenceId: null,
      evidenceType: null,
      analysisId: null,
    },
    briefing: null,
    source: createSource({ type: "computed", name: "PhysiqueOS" }),
    fieldProvenance: createFieldProvenance({
      imported: ["trigger"],
      computed: ["briefing"],
    }),
    createdAt: "",
    updatedAt: "",
    ...data,
  };
}
