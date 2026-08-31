import { notFound } from "next/navigation";
import PriorityDetailScreen from "../../../screens/PriorityDetailScreen";
import { getProductionPriorityNavigationReadService } from "../../../application/composition/productionApplicationComposition";
import { completePriority } from "./actions";

export const dynamic = "force-dynamic";

export default async function PriorityDetailPage({ params }) {
  const { priorityId } = await params;
  const service = getProductionPriorityNavigationReadService();
  const priority = await service.getPriorityDetail(priorityId);

  if (!priority) notFound();

  return (
    <PriorityDetailScreen
      completeAction={completePriority}
      priority={priority}
    />
  );
}
