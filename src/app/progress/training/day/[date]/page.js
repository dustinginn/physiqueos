import { getProductionTrainingNavigationReadService } from "../../../../../application/composition/productionApplicationComposition";
import {
  getTrainingRootHref,
  normalizeTrainingContextId,
  withTrainingTimelineContext,
} from "../../../../../navigation/trainingTimelineNavigation";
import TrainingDayScreen from "../../../../../screens/TrainingDayScreen";

export const dynamic = "force-dynamic";

export default async function TrainingDayPage({ params, searchParams }) {
  const { date } = await params;
  const query = await searchParams;
  const contextId = normalizeTrainingContextId(query?.context);
  const service = getProductionTrainingNavigationReadService();
  const day = await service.getDay({
    date: String(date ?? ""),
  });

  if (!day) {
    return (
      <TrainingDayScreen
        backHref={getTrainingRootHref(contextId)}
        day={{
          date: String(date ?? ""),
          label: "Training Day",
          sessions: [],
          summary: {},
        }}
      />
    );
  }

  const dayHref = withTrainingTimelineContext(day.href, contextId);
  return (
    <TrainingDayScreen
      backHref={getTrainingRootHref(contextId)}
      day={{
        ...day,
        sessions: day.sessions.map((session) => ({
          ...session,
          href: withTrainingTimelineContext(session.href, contextId, { returnTo: dayHref }),
        })),
      }}
    />
  );
}
