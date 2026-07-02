export function createOperatingPlanRepository(operatingPlan = null, options = {}) {
  return {
    async getOperatingPlan(userId) {
      if (!operatingPlan || operatingPlan.userId !== userId) return null;

      return operatingPlan;
    },

    async saveOperatingPlan(plan) {
      if (operatingPlan) {
        Object.assign(operatingPlan, plan);
      } else {
        operatingPlan = plan;
      }
      options.onChange?.();

      return operatingPlan;
    },

    async updateOperatingPlan(userId, patch) {
      if (!operatingPlan || operatingPlan.userId !== userId) return null;

      Object.assign(operatingPlan, {
        ...operatingPlan,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      options.onChange?.();

      return operatingPlan;
    },
  };
}
