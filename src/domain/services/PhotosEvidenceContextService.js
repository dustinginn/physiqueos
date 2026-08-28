import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { getTrainingEvidenceContext } from "./TrainingEvidenceContextService";
import { EVIDENCE_CONTEXT_WINDOWS } from "./EvidenceContextWindows";
import { createProgressReportingService } from "./ProgressReportingService";
import { runRepositoryReadScope } from "../../application/read-models/RepositoryReadScope";

const PHOTO_CONTEXT_IDS = new Set(["build-lean-mass", "visible-abs", "all"]);

export async function getPhotosTimelineReport({
  context,
  currentDate = new Date(),
  repositories = FounderRepositories,
} = {}) {
  return runRepositoryReadScope({
    repositories,
    readModel: "progress.photos-timeline",
    callback: async () => {
      const timeline = await getTrainingEvidenceContext({
        context: PHOTO_CONTEXT_IDS.has(context) ? context : "all",
        currentDate,
        repositories,
      });
      const photoSessionWindow = getPhotoSessionWindow(timeline);
      const report = await createProgressReportingService({
        repositories,
      }).getPlaceholderReport("photos", undefined, { photoSessionWindow });
      const user = await repositories.users.getCurrentUser();
      const artifacts = user && repositories.dailyBriefings?.listDailyBriefings
        ? await repositories.dailyBriefings.listDailyBriefings(user.id)
        : [];
      const publicationAwareReport = attachPhotoBriefingPublication({
        report,
        artifacts,
      });

      return {
        timeline: Object.freeze({
          ...timeline,
          selectedLabel:
            timeline.contextId === "all" ? "All Photos" : timeline.selectedLabel,
          options: timeline.options.map((option) => ({
            ...option,
            label: option.id === "all" ? "All Photos" : option.label,
          })),
          photoSessionWindow,
          source:
            timeline.contextId === "all"
              ? "canonical_photo_history"
              : "goal_lifecycle_with_photo_baseline",
        }),
        report: publicationAwareReport,
      };
    },
  });
}

export function attachPhotoBriefingPublication({ report, artifacts = [] }) {
  const publishedSessionIds = new Set(
    artifacts
      .filter((item) =>
        item.artifactType === "event" &&
        item.trigger?.evidenceType === "photo_session" &&
        item.briefing?.photoEventNarrative
      )
      .map((item) => item.trigger.evidenceId)
  );
  const annotate = (photoSet) => {
    if (!photoSet) return null;
    const sessionId = photoSet.photoSessionId ?? photoSet.id;
    return {
      ...photoSet,
      photoBriefingHref: publishedSessionIds.has(sessionId)
        ? `/briefings/photo/${sessionId}`
        : null,
    };
  };
  const photoSets = (report.photoSets ?? []).map(annotate);
  const latestPhotoSet = photoSets.find((item) =>
    item.id === report.latestPhotoSet?.id
  ) ?? annotate(report.latestPhotoSet);

  return {
    ...report,
    latestPhotoSet,
    photoSets,
  };
}

export function getPhotoSessionWindow(timeline) {
  if (timeline.contextId === "all") return null;

  if (timeline.contextId === "build-lean-mass") {
    return Object.freeze({
      baselineDate: EVIDENCE_CONTEXT_WINDOWS["visible-abs"].endDate,
      startDate: EVIDENCE_CONTEXT_WINDOWS["visible-abs"].endDate,
      endDate: timeline.endDate,
    });
  }

  return EVIDENCE_CONTEXT_WINDOWS["visible-abs"];
}
