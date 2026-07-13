export function createEnergyStrategyLinkRepository(records = [], options = {}) { return {
  async getActiveLink(userId) { return structuredClone(records.find((item) => item.userId === userId && item.status === "active") ?? null); },
  async saveLink(link) { if (records.some((item) => item.id === link.id)) throw new Error("Energy Strategy already exists."); records.push(structuredClone(link)); options.onChange?.(); return structuredClone(link); },
}; }
