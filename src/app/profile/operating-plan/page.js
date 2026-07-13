import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { createActivityProtocolBuilderService } from "../../../domain/services/ActivityProtocolBuilderService";
import { createTrainingProtocolBuilderService } from "../../../domain/services/TrainingProtocolBuilderService";
import { createCutEnergyStrategyService } from "../../../domain/services/CutEnergyStrategyService";
import OperatingPlanScreen from "../../../screens/OperatingPlanScreen";

export const dynamic = "force-dynamic";

export default async function OperatingPlanPage({ searchParams }) {
  const params = await searchParams;
  const user = await FounderRepositories.users.getCurrentUser();
  const activityService = createActivityProtocolBuilderService({ repositories: FounderRepositories });
  const trainingService = createTrainingProtocolBuilderService({ repositories: FounderRepositories });
  const energyService = createCutEnergyStrategyService({ repositories: FounderRepositories });
  const [protocols, reminders, nutritionContext, activityContext, trainingContext, energyContext, executionItems] =
    await Promise.all([
      FounderRepositories.protocols.listProtocols(user.id),
      FounderRepositories.reminders.listReminders(user.id),
      FounderRepositories.nutritionContext.getNutritionContext(user.id),
      activityService.getBuilderContext(user.id),
      trainingService.getBuilderContext(user.id),
      energyService.getBuilderContext(user.id),
      FounderRepositories.executionItems.listExecutionItems(user.id),
    ]);

  return (
    <OperatingPlanScreen
      activityActivated={params?.activity === "activated"}
      activityProtocol={activityContext.currentVersion}
      nutritionContext={nutritionContext}
      protocols={protocols}
      reminders={reminders}
      trainingActivated={params?.training === "activated"}
      trainingProtocol={trainingContext.currentVersion}
      energyActivated={params?.energy === "activated"}
      energyStrategy={energyContext.link}
      executionItems={executionItems}
    />
  );
}
