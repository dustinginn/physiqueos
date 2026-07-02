import GoalsHubScreen from "../../screens/GoalsHubScreen";

export const dynamic = "force-dynamic";

export default async function GoalsPage({ searchParams }) {
  const params = await searchParams;

  return <GoalsHubScreen from={params?.from} />;
}
