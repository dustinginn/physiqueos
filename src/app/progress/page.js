import { getProductionProgressHubReadService } from "../../application/composition/productionApplicationComposition";
import ProgressHubScreen from "../../screens/ProgressHubScreen";

export const dynamic = "force-dynamic";

export default async function ProgressPage({ searchParams }) {
  const params = await searchParams;
  const service = getProductionProgressHubReadService();
  const report = await service.getProgressHub();

  return <ProgressHubScreen from={params?.from} report={report} />;
}
