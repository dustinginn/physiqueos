import SupportingGoalScreen from "../../../screens/SupportingGoalScreen";

export const dynamic = "force-dynamic";

export default async function LeanMassGoalPage({ searchParams }) {
  const params = await searchParams;

  return <SupportingGoalScreen from={params?.from} goalKey="leanMass" />;
}
