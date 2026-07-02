import VisibleAbsGoalScreen from "../../../screens/VisibleAbsGoalScreen";

export const dynamic = "force-dynamic";

export default async function VisibleAbsGoalPage({ searchParams }) {
  const params = await searchParams;

  return <VisibleAbsGoalScreen from={params?.from} />;
}
