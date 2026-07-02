export function createSource(data = {}) {
  return {
    type: "seed",
    name: "PhysiqueOS",
    externalId: null,
    importedAt: null,
    confidence: "medium",
    notes: "",
    ...data,
  };
}

export function createFieldProvenance(data = {}) {
  return {
    imported: [],
    computed: [],
    ...data,
  };
}
