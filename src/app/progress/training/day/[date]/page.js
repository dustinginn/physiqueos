import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createInactiveLegacyWebContext } from "../../../../../application/auth/legacyWebContext";
import { createTrainingReadService } from "../../../../../application/training/TrainingReadService";
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
  const webContext = await createInactiveLegacyWebContext({ repositories: FounderRepositories });
  const service = createTrainingReadService({ repositories: FounderRepositories });
  const day = await service.getDay({
    principal: webContext.principal,
    date: String(date ?? ""),
    timeZone: webContext.user.timezone,
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
