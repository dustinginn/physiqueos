import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import OperatingPlanScreen from "../../../screens/OperatingPlanScreen";

export const dynamic = "force-dynamic";

export default async function OperatingPlanPage() {
  const user = await FounderRepositories.users.getCurrentUser();
  const [protocols, reminders, nutritionContext] =
    await Promise.all([
      FounderRepositories.protocols.listProtocols(user.id),
      FounderRepositories.reminders.listReminders(user.id),
      FounderRepositories.nutritionContext.getNutritionContext(user.id),
    ]);

  return (
    <OperatingPlanScreen
      nutritionContext={nutritionContext}
      protocols={protocols}
      reminders={reminders}
    />
  );
}
