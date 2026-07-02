import { notFound } from "next/navigation";
import PriorityDetailScreen from "../../../screens/PriorityDetailScreen";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { createPriorityDetailService } from "../../../domain/services/PriorityDetailService";
import { completePriority } from "./actions";

export const dynamic = "force-dynamic";

export default async function PriorityDetailPage({ params }) {
  const { priorityId } = await params;
  const service = createPriorityDetailService({
    repositories: FounderRepositories,
  });
  const priority = await service.getPriorityDetail(priorityId);

  if (!priority) notFound();

  return (
    <PriorityDetailScreen
      completeAction={completePriority}
      priority={priority}
    />
  );
}
