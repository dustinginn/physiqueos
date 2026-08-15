const RECOGNIZED_MODES = new Map([
  ["maintenance calibration", "maintenance_calibration"],
  ["phase execution", "phase_execution"],
]);

export function createOperatingPlanEnergyStrategyService({ repositories }) {
  return {
    async getActiveStrategy(userId) {
      const [goals, protocols] = await Promise.all([
        repositories.goals.listGoals(userId),
        repositories.protocols.listProtocols(userId),
      ]);

      return resolveActiveOperatingPlanEnergyStrategy({
        goals,
        protocols,
        userId,
      });
    },
  };
}

export function resolveActiveOperatingPlanEnergyStrategy({
  goals = [],
  protocols = [],
  userId,
} = {}) {
  const activeGoals = goals.filter(
    (goal) =>
      goal.userId === userId &&
      goal.primary === true &&
      goal.status === "active"
  );

  if (activeGoals.length > 1) {
    throw new Error("Multiple active primary goals prevent Energy Strategy resolution.");
  }

  const activeGoal = activeGoals[0];
  if (!activeGoal) return null;

  const candidates = protocols.filter(
    (protocol) =>
      protocol.userId === userId &&
      protocol.status === "active" &&
      (protocol.protocolType === "energy" || protocol.category === "energy") &&
      protocolSupportsGoal(protocol, activeGoal.id) &&
      recognizedMode(protocol.effectiveStrategy?.mode)
  );
  const phaseBound = activeGoal.activePhaseStrategyId ? candidates.filter((protocol) =>
    protocol.phaseStrategyId === activeGoal.activePhaseStrategyId &&
    (!activeGoal.currentPhaseId || protocol.phaseId === activeGoal.currentPhaseId)) : [];
  const matches = phaseBound.length ? phaseBound : candidates.filter((protocol) => !protocol.phaseStrategyId);

  if (matches.length > 1) {
    throw new Error(
      `Multiple active Energy Strategies match goal ${activeGoal.id}.`
    );
  }

  const protocol = matches[0];
  if (!protocol) return null;

  const selectedPace = recognizedMode(protocol.effectiveStrategy.mode);

  return Object.freeze({
    isConfigured: true,
    goalId: activeGoal.id,
    protocolId: protocol.id,
    protocolVersionId: protocol.currentVersionId ?? null,
    status: protocol.status,
    mode: protocol.effectiveStrategy.mode,
    selectedPace,
    evaluationCadence:
      protocol.effectiveStrategy.evaluationCadence ?? null,
    nutritionStrategy:
      protocol.effectiveStrategy.calorieStrategy ?? null,
    activityStrategy:
      protocol.effectiveStrategy.activityStrategy ?? null,
    ...(protocol.effectiveStrategy.caloricIntakeTarget ? { caloricIntakeTarget: protocol.effectiveStrategy.caloricIntakeTarget } : {}),
    ...(protocol.effectiveStrategy.activityExpenditureTarget ? { activityExpenditureTarget: protocol.effectiveStrategy.activityExpenditureTarget } : {}),
    ...(protocol.phaseId ?? protocol.effectiveStrategy.phaseId ? { phaseId: protocol.phaseId ?? protocol.effectiveStrategy.phaseId } : {}),
    ...(protocol.phaseStrategyId ?? protocol.effectiveStrategy.phaseStrategyId ? { phaseStrategyId: protocol.phaseStrategyId ?? protocol.effectiveStrategy.phaseStrategyId } : {}),
    effectiveDate: protocol.activatedAt ?? protocol.startDate ?? null,
    provenance: protocol.activationProvenance
      ? {
          sourceProtocolId:
            protocol.activationProvenance.sourceProtocolId ?? null,
          sourceType:
            protocol.activationProvenance.provenanceSourceType ?? null,
        }
      : null,
  });
}

function protocolSupportsGoal(protocol, goalId) {
  const goalIds = new Set([
    ...(protocol.currentGoalIds ?? []),
    ...(protocol.relatedGoalIds ?? []),
    ...(protocol.goalIds ?? []),
    ...(protocol.goalLinks ?? []).map((link) => link.goalId),
  ]);

  return goalIds.has(goalId);
}

function recognizedMode(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

  return RECOGNIZED_MODES.get(normalized) ?? null;
}
