import { createActivityProtocolBuilderService } from "../../domain/services/ActivityProtocolBuilderService.js";
import { createTrainingProtocolBuilderService } from "../../domain/services/TrainingProtocolBuilderService.js";
import { createOperatingPlanEnergyStrategyService } from "../../domain/services/OperatingPlanEnergyStrategyService.js";
import { getOperatingPlanStrategyHref } from "../../domain/services/OperatingPlanStrategyDetailService.js";
import { resolveMorningWeighInSupport } from "../../domain/services/TrackingSupportService.js";
import { requireAuthenticationPrincipal } from "../auth/principal.js";

export function createOperatingPlanReadService({ repositories } = {}) {
  return Object.freeze({
    async getOperatingPlan({ principal } = {}) {
      const actor = requireAuthenticationPrincipal(principal);
      const activity = createActivityProtocolBuilderService({ repositories });
      const training = createTrainingProtocolBuilderService({ repositories });
      const energy = createOperatingPlanEnergyStrategyService({ repositories });
      const [protocols, reminders, nutritionContext, activityContext, trainingContext, energyStrategy, executionItems] = await Promise.all([
        repositories.protocols.listProtocols(actor.userId),
        repositories.reminders.listReminders(actor.userId),
        repositories.nutritionContext.getNutritionContext(actor.userId),
        activity.getBuilderContext(actor.userId),
        training.getBuilderContext(actor.userId),
        energy.getActiveStrategy(actor.userId),
        repositories.executionItems.listExecutionItems(actor.userId),
      ]);
      return Object.freeze({
        sections: Object.freeze(buildOperatingPlan({ energyStrategy, executionItems, nutritionContext, protocols, reminders, trainingProtocol: trainingContext.currentVersion })),
        sourceVersions: Object.freeze({
          activity: String(activityContext.currentVersion?.version ?? "1"),
          training: String(trainingContext.currentVersion?.version ?? "1"),
          energy: String(energyStrategy?.version ?? "1"),
        }),
      });
    },
  });
}

export function buildOperatingPlan({ energyStrategy, executionItems = [], nutritionContext, protocols = [], reminders = [], trainingProtocol }) {
  const active = protocols.filter((protocol) => protocol.status === "active");
  const byCategory = (category) => active.filter((protocol) => protocol.category === category);
  const supplements = byCategory("supplement");
  const recovery = byCategory("recovery");
  const peptides = byCategory("peptide");
  const coaching = active.find((protocol) => protocol.category === "briefings");
  const weighIn = resolveMorningWeighInSupport({ executionItems, protocols: active, reminders });
  const sections = [
    section("energy", "primary", "Energy Strategy", energyStrategy ? "Active" : "Not configured", [buildEnergyStrategyPlanItem(energyStrategy)]),
    section("nutrition", "primary", "Nutrition", "Manual context", [{ id: "nutrition-calorie-range", title: nutritionContext?.calibrationStrategy ? "Maintenance Calibration" : "Calorie Range", detail: calorieRange(nutritionContext), href: getOperatingPlanStrategyHref("nutrition", nutritionContext?.activeProtocolId), status: "Active" }]),
    section("training", "effort", "Training", trainingProtocol ? "Active protocol" : "Protocol not defined", [buildTrainingPlanItem(trainingProtocol)]),
    section("recovery", "success", "Recovery", recovery.length ? `${recovery.length} current method` : "Strategy coming soon", recovery.length ? [protocolItem("recovery-strategy", "Recovery Strategy", recovery)] : [{ id: "recovery-coming-soon", title: "Recovery", detail: "A dedicated recovery strategy will complete this layer", href: null, status: "Coming Soon" }]),
    section("peptide", "effort", "Peptides", `${peptides.length} current peptide${peptides.length === 1 ? "" : "s"}`, peptides.length ? [protocolItem("peptide-strategy", "Peptide Strategy", peptides)] : []),
    section("supplement", "success", "Supplements", `${supplements.length} current supplement${supplements.length === 1 ? "" : "s"}`, supplements.length ? [protocolItem("supplement-strategy", "Supplement Strategy", supplements)] : [], { supplements: true }),
    section("tracking", "evidence", "Tracking", "Recurring measurements", [{ id: "tracking", title: "Tracking", detail: weighIn?.supportSummary ?? "Morning Weigh-In Support", href: "/profile/operating-plan/tracking", status: weighIn ? "Active" : "Review" }]),
    ...(coaching ? [section("coaching", "primary", "Coaching Updates", "Wednesday and Sunday", [{ id: coaching.id, title: "Coaching Updates", detail: "Midweek calibration and weekly synthesis", href: getOperatingPlanStrategyHref("briefings", coaching.id), status: "Active" }])] : []),
  ];
  return sections.filter((item) => item.items.length > 0);
}

function section(iconKey, tone, title, subtitle, items, extra = {}) { return Object.freeze({ iconKey, tone, title, subtitle, items: Object.freeze(items), ...extra }); }
function protocolItem(id, title, protocols) { return { id, title, detail: protocols.map((item) => item.name).join(", "), href: `/profile/protocols/${protocols[0].id}?from=operating-plan`, status: "Active" }; }
function energyItem(link) { return link ? { id: link.protocolId, title: link.selectedPace === "maintenance_calibration" ? "Maintenance Calibration" : `${label(link.selectedPace)} cut`, detail: link.selectedPace === "maintenance_calibration" ? "Activity and Nutrition linked for weekly calibration" : "Activity and Nutrition linked", href: getOperatingPlanStrategyHref("energy", link.protocolId), status: "Active" } : { id: "energy-strategy-create", title: "Energy Strategy", detail: "Activity and Nutrition work together to define the cut", href: null, status: "Build Strategy" }; }
function trainingItem(version) { const strategy = version?.trainingStrategy; if (!strategy) return { id: "training-protocol-create", title: "Training", detail: "Define weekly frequency and progression strategy", href: "/profile/operating-plan/training/new", status: "Create Protocol" }; const sessions = Object.values(strategy.weeklyFrequencies ?? {}).reduce((sum, value) => sum + Number(value), 0); return { id: version.protocolId, title: "Maintenance Training Strategy", detail: `${sessions} weekly area sessions · ${label(strategy.progression?.pace)} progression`, href: getOperatingPlanStrategyHref("training", version.protocolId), status: "Active" }; }
function calorieRange(context) { const range = context?.estimatedDailyCaloricIntake; if (context?.calibrationStrategy) return context.calibrationStrategy.proteinBasis === "body_weight" && Number(context.calibrationStrategy.proteinRatio) === 1 ? "1 g per lb of body weight · intake adjusted gradually" : "Intake adjusted gradually from weekly signals"; return range?.min && range?.max ? `${range.min}-${range.max} ${range.unit}` : "Range pending"; }
function label(value) { return String(value ?? "").replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

export function buildEnergyStrategyPlanItem(link) { return energyItem(link); }
export function buildTrainingPlanItem(version) { return trainingItem(version); }
