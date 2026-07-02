import SupportingGoalScreen from "../../../screens/SupportingGoalScreen";

export const dynamic = "force-dynamic";

export default async function MaintenanceGoalPage({ searchParams }) {
  const params = await searchParams;

  return <SupportingGoalScreen from={params?.from} goalKey="maintenance" />;
}
