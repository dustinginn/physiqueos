import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { createProgressReportingService } from "../../../../../domain/services/ProgressReportingService";
import { buildTrainingSessionNavigation } from "../../../../../navigation/navigationRegistry";
import TrainingKnowledgeScreen from "../../../../../screens/TrainingKnowledgeScreen";
import { addTrainingSessionCorrection } from "./actions";

export const dynamic = "force-dynamic";

export default async function TrainingSessionPage({ params, searchParams }) {
  const { sessionId } = await params;
  const query = await searchParams;
  const requestedSessionId = decodeRouteParam(sessionId);
  const service = createProgressReportingService({
    repositories: FounderRepositories,
  });
  const report = await service.getPlaceholderReport("training");
  const session = findTrainingSessionByRouteId(report, requestedSessionId);

  if (!session) notFound();

  return (
    <TrainingKnowledgeScreen
      correctionAction={addTrainingSessionCorrection}
      correctionStatus={query?.correction}
      mode="session"
      navigation={buildTrainingSessionNavigation(session)}
      report={report}
      session={session}
    />
  );
}

function findTrainingSessionByRouteId(report = {}, routeId) {
  const sessions = [
    ...(report.entries ?? []),
    ...(report.trainingDays ?? []).flatMap((day) => day.sessions ?? []),
  ];

  return sessions.find((session) =>
    [
      session.id,
      session.canonicalId,
      ...(session.aliases ?? []),
    ].some((candidate) => String(candidate) === String(routeId))
  );
}

function decodeRouteParam(value) {
  try {
    return decodeURIComponent(String(value ?? ""));
  } catch {
    return String(value ?? "");
  }
}
