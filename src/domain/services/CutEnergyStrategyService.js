import { createFounderActivityProtocolActivation, ACTIVITY_PROTOCOL_ID } from "./ActivityProtocolBuilderService";
import { createProtocolVersionService } from "./ProtocolVersionService";

export const ENERGY_STRATEGY_ID = "energy_strategy_founder_cut";
export const NUTRITION_PROTOCOL_ID = "protocol_nutrition_founder_cut";

export function calculateEnergyStrategy({ rmr, activityTarget, calorieMin, calorieMax, weight, proteinRatio = 1 }) {
  const expenditure = Number(rmr) + Number(activityTarget);
  const deficitMin = Math.max(0, expenditure - Number(calorieMax));
  const deficitMax = Math.max(0, expenditure - Number(calorieMin));
  return { expenditureRange: { min: Math.round(expenditure * .9), max: Math.round(expenditure * 1.1) }, deficitRange: { min: deficitMin, max: deficitMax }, weeklyLossRange: { min: Number((deficitMin * 7 / 3500).toFixed(1)), max: Number((deficitMax * 7 / 3500).toFixed(1)) }, translatedProteinGrams: Math.round(Number(weight) * Number(proteinRatio)), confidence: "moderate" };
}

export function createCutEnergyStrategyService({ repositories }) { return {
  async getBuilderContext(userId) {
    const [goal, dexa, weight, nutrition, link] = await Promise.all([repositories.goals.getGoalById("goal_visible_abs_at_rest"), repositories.dexaScans.getLatestDEXAScan(userId), repositories.weights.getLatestWeightEntry(userId), repositories.nutritionContext.getNutritionContext(userId), repositories.energyStrategyLinks.getActiveLink(userId)]);
    return { goal, link, rmr: { value: dexa?.restingMetabolicRate?.value ?? null, evidenceId: dexa?.id ?? null, date: dexa?.measuredAt ?? null, source: dexa?.provider ?? null }, weight: { value: weight?.weight?.value ?? null, evidenceId: weight?.id ?? null, date: weight?.measuredAt?.slice(0,10) ?? null, source: weight?.source?.name ?? "Morning weight" }, activityTarget: nutrition?.estimatedDailyActiveCalorieBurn?.value ?? 1000, calorieRange: { min: nutrition?.estimatedDailyCaloricIntake?.min ?? 1900, max: Math.min(nutrition?.estimatedDailyCaloricIntake?.max ?? 2100, 2100) }, phase: "Late-stage cut", effectiveDateLabel: new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/Los_Angeles" }).format(new Date()) };
  },
  async activate(input) {
    if (await repositories.energyStrategyLinks.getActiveLink(input.userId)) throw new Error("An active Energy Strategy already exists.");
    if (await repositories.protocols.getActiveProtocolByType(input.userId, "activity")) throw new Error("Activity must be unconfigured before building this strategy.");
    if (await repositories.protocols.getActiveProtocolByType(input.userId, "nutrition")) throw new Error("Nutrition is already configured.");
    const timestamp = input.confirmedAt ?? new Date().toISOString();
    const calculation = calculateEnergyStrategy(input);
    const shared = { strategyLinkId: ENERGY_STRATEGY_ID, selectedPace: input.pace, calculationSnapshot: { rmr: { value: input.rmr, source: input.rmrSource, evidenceId: input.rmrEvidenceId, observedDate: input.rmrDate }, activityTarget: input.activityTarget, calorieRange: { min: input.calorieMin, max: input.calorieMax }, proteinRule: input.proteinRule, currentWeight: input.weight, weightSource: input.weightSource, weightDate: input.weightDate, selectedPace: input.pace, ...calculation, limitations: ["RMR and active calories are estimates; actual expenditure changes over time."], calculatedAt: timestamp }, dependencies: [] };
    const activity = createFounderActivityProtocolActivation({ dailyTarget: input.activityTarget, effectiveAt: input.effectiveAt, userId: input.userId, confirmedAt: timestamp });
    Object.assign(activity.version, shared, { dependencies: ["goal", "goal_phase", "recovery_trend", "weight_trend", "dexa"] });
    activity.version.change.reason = "Create the Activity lever within the linked Cut Energy Strategy.";
    const nutrition = { protocol: { id: NUTRITION_PROTOCOL_ID, userId: input.userId, protocolType: "nutrition", category: "nutrition", name: "Cut Nutrition" }, version: { id: `${NUTRITION_PROTOCOL_ID}_v1`, effectiveAt: input.effectiveAt, author: { type: "user", id: input.userId, displayName: "Founder" }, change: { reason: "Create the Nutrition lever within the linked Cut Energy Strategy.", changedFields: [], previousVersionId: null }, goalLinks: [{ goalId: "goal_visible_abs_at_rest", relationship: "supports" }], phaseContext: { id: "late_stage_cut", label: "Late-stage cut" }, intent: { summary: "Support continued fat loss while preserving lean mass and recovery." }, expectations: [{ id: "daily_calorie_range", metric: "calorie_intake", operator: "between", min: input.calorieMin, max: input.calorieMax, unit: "kcal", cadence: "daily", includedEvidenceTypes: ["nutrition_day"] }, { id: "daily_protein_minimum", metric: "protein", operator: "minimum", target: calculation.translatedProteinGrams, unit: "g", cadence: "daily", rule: input.proteinRule, weightSource: input.weightSource, weightDate: input.weightDate }], evaluationWindows: [{ cadence: "weekly", evaluationMode: "joint_energy_pattern" }], coachingPolicy: { weeklyPattern: true, proteinIsMinimum: true, pushAlertsEnabled: false }, reviewTriggers: [{ type: "rmr_change" }, { type: "activity_strategy_change" }, { type: "weight_trend_mismatch" }, { type: "recovery_or_performance_change" }, { type: "goal_transition" }], evidenceBasis: { directEvidenceConfidence: "moderate" }, confirmation: { confirmedByUser: true, confirmedAt: timestamp, authority: "founder_confirmation", protocolConfidence: "high" }, createdAt: timestamp, ...shared, dependencies: ["goal", "goal_phase", "rmr", "body_weight", "activity_protocol", "activity_evidence", "weight_trend", "recovery", "training_performance"] } };
    const versionService = createProtocolVersionService({ repositories });
    const activityCreated = await versionService.activateInitialProtocol(activity);
    try { const nutritionCreated = await versionService.activateInitialProtocol(nutrition); const link = { id: ENERGY_STRATEGY_ID, userId: input.userId, goalId: "goal_visible_abs_at_rest", phaseContext: { id: "late_stage_cut", label: "Late-stage cut" }, activityProtocolId: ACTIVITY_PROTOCOL_ID, nutritionProtocolId: NUTRITION_PROTOCOL_ID, status: "active", selectedPace: input.pace, createdAt: timestamp, updatedAt: timestamp }; await repositories.energyStrategyLinks.saveLink(link); return { activity: activityCreated, nutrition: nutritionCreated, link }; } catch (error) { await repositories.protocols.updateProtocol(activityCreated.protocol.id, { status: "archived", currentVersionId: null }); await repositories.protocolVersions.supersedeVersion(activityCreated.version.id, { endedAt: timestamp }); throw error; }
  }
}; }
