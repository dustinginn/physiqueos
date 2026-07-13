import { getProgressPhotoCategoryLabel } from "../models/progressPhotoPoseVocabulary";
import { isActiveCanonicalEvidenceObject } from "./CanonicalReadModel";

export function createEvidenceTimelineService({ repositories }) {
  return {
    async getTimeline(userId) {
      const user = userId
        ? await repositories.users.getUserById(userId)
        : await repositories.users.getCurrentUser();
      const resolvedUserId = user?.id ?? userId;

      if (!resolvedUserId) return [];

      const [
        weights,
        photos,
        dexaScans,
        protocols,
        checkIns,
        analyses,
        dailyBriefings,
        evidencePackages,
        canonicalEvidenceObjects,
      ] =
        await Promise.all([
          repositories.weights.listWeightEntries(resolvedUserId),
          repositories.progressPhotos?.listPhotos(resolvedUserId) ?? [],
          repositories.dexaScans.listDEXAScans(resolvedUserId),
          repositories.protocols.listProtocols(resolvedUserId),
          repositories.dailyCheckIns.listCheckIns(resolvedUserId),
          repositories.analyses.listAnalyses(),
          repositories.dailyBriefings?.listDailyBriefings(resolvedUserId) ?? [],
          repositories.evidencePackages?.listEvidencePackages(resolvedUserId) ?? [],
          repositories.canonicalEvidence?.listCanonicalEvidenceObjects(resolvedUserId) ?? [],
        ]);
      const canonicalEvidenceItems = getCanonicalTimelineItems({
        canonicalEvidenceObjects,
        evidencePackages,
      });

      return [
        ...canonicalEvidenceItems,
        ...getFailedIngestionTimelineItems(evidencePackages),
        ...weights.map((entry) => ({
          id: entry.id,
          type: "Weight",
          date: entry.measuredAt,
          title: `${entry.weight.value.toFixed(1)} ${entry.weight.unit}`,
          detail: entry.context?.isDefault === false
            ? "Manual weight with different conditions"
            : "Manual morning weight",
          tone: "evidence",
        })),
        ...photos.map((photo) => ({
          id: photo.id,
          type: "Progress Photo",
          date: photo.date ?? photo.capturedAt,
          title: formatProgressPhotoLabel(photo),
          detail: photo.linkedWeightEntryId
            ? "Linked to same-day weight"
            : "Visual calibration evidence",
          tone: "evidence",
        })),
        ...dexaScans.map((scan) => ({
          id: scan.id,
          type: "DEXA",
          date: scan.measuredAt,
          title: scan.bodyFatPercentage
            ? `${scan.bodyFatPercentage.toFixed(1)}% body fat`
            : "Body composition scan",
          detail: scan.provider || "Calibration evidence",
          tone: "success",
        })),
        ...protocols.map((protocol) => ({
          id: protocol.id,
          type: "Protocol",
          date: protocol.startDate,
          title: protocol.name,
          detail: `${formatLabel(protocol.status)} ${formatLabel(protocol.category)}`,
          tone: "effort",
        })),
        ...checkIns.map((checkIn) => ({
          id: checkIn.id,
          type: "Daily Check-In",
          date: checkIn.date,
          title: "Morning check-in",
          detail: checkIn.weightEntryId
            ? "Weight evidence submitted"
            : "Context submitted",
          tone: "primary",
        })),
        ...analyses.map((analysis) => ({
          id: analysis.id,
          type: "Analysis",
          date: analysis.createdAt,
          title: analysis.title,
          detail: formatTimelineDetail(analysis.summary),
          metadata: typeof analysis.summary === "object" ? { structuredSummary: analysis.summary } : undefined,
          tone: "primary",
        })),
        ...dailyBriefings.map((dailyBriefing) => ({
          id: dailyBriefing.id,
          type: "Daily Briefing",
          date: dailyBriefing.generatedAt,
          title: dailyBriefing.briefing?.hero?.title ?? "Daily Briefing",
          detail:
            dailyBriefing.trigger?.evidenceType
              ? `Generated from ${formatLabel(dailyBriefing.trigger.evidenceType)} evidence`
              : "Generated briefing artifact",
          tone: "primary",
        })),
      ]
        .filter((item) => item.date)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    },
  };
}

export function formatTimelineDetail(value) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "Analysis completed";
  const sessions=value.resistance_sessions_last_7_days??value.resistanceSessionsLast7Days;
  const exercises=value.exercises_tracked??value.exercisesTracked;
  const improving=value.exercises_improving??value.exercisesImproving;
  const regressing=value.exercises_regressing??value.exercisesRegressing;
  const prs=value.recent_pr_count??value.recentPrCount;
  const parts=[[sessions,"resistance sessions"],[exercises,"exercises tracked"],[improving,"improving"],[regressing,"regressing"],[prs,"recent PRs"]].filter(([count])=>Number.isFinite(Number(count))).map(([count,label])=>`${count} ${label}`);
  const most=value.most_improved_exercise??value.mostImprovedExercise;
  if(most)parts.push(`Most improved: ${typeof most==="string"?most:most.name??most.exercise??"tracked exercise"}`);
  if(parts.length)return parts.join(", ");
  if(process.env.NODE_ENV!=="production")console.warn("[EvidenceTimeline] Unknown structured detail.",Object.keys(value));
  return "Structured analysis available";
}

function getFailedIngestionTimelineItems(evidencePackages = []) {
  const recoveredSubmissionIds = new Set(
    evidencePackages
      .filter((evidencePackage) => evidencePackage.quality?.status !== "failed")
      .map((evidencePackage) => getSubmissionIdFromPackageId(evidencePackage.package_id))
      .filter(Boolean)
  );

  return evidencePackages
    .filter((evidencePackage) => {
      if (evidencePackage.quality?.status !== "failed") return false;

      const submissionId = getSubmissionIdFromPackageId(evidencePackage.package_id);

      return !submissionId || !recoveredSubmissionIds.has(submissionId);
    })
    .map((evidencePackage) => ({
      id: evidencePackage.package_id,
      type: "Evidence Upload",
      date: evidencePackage.captured_at,
      title: "Upload needs review",
      detail: evidencePackage.recovery?.recoverable
        ? "Original files were preserved and can be reprocessed."
        : "Upload did not produce usable evidence.",
      tone: "warning",
    }));
}

function getSubmissionIdFromPackageId(packageId) {
  const match = String(packageId ?? "").match(/^(evidence_submission_\d{17})/);

  return match?.[1] ?? null;
}

function formatProgressPhotoLabel(photo = {}) {
  return getProgressPhotoCategoryLabel(photo);
}

function getCanonicalTimelineItems({ canonicalEvidenceObjects = [], evidencePackages = [] } = {}) {
  return getCanonicalPayloads({ canonicalEvidenceObjects, evidencePackages }).flatMap((evidenceObject) => {
      if (isActivityDay(evidenceObject)) {
        const dailyActivity = evidenceObject.daily_activity ?? {};

        return {
          id: evidenceObject.id,
          type: "Daily Activity",
          date: evidenceObject.observed_at,
          title: formatActivityDayTitle(dailyActivity),
          detail: formatActivityDayDetail(evidenceObject),
          tone: "effort",
        };
      }

      if (isTrainingSession(evidenceObject)) {
        return {
          id: evidenceObject.id,
          type: "Workout",
          date: evidenceObject.observed_at,
          title: evidenceObject.metadata?.activity_type ?? "Workout",
          detail: formatTrainingDetail(evidenceObject),
          tone: "primary",
        };
      }

    return null;
  }).filter(Boolean);
}

function getCanonicalPayloads({ canonicalEvidenceObjects = [], evidencePackages = [] } = {}) {
  if (canonicalEvidenceObjects.length > 0) {
    return canonicalEvidenceObjects
      .filter(isActiveCanonicalObject)
      .map((object) => object.payload ?? object);
  }

  const objectMap = new Map();

  evidencePackages.forEach((evidencePackage) => {
    (evidencePackage.evidence_objects ?? []).forEach((evidenceObject) => {
      objectMap.set(getEvidenceObjectIdentity(evidenceObject), evidenceObject);
    });
  });

  return [...objectMap.values()];
}

function isActiveCanonicalObject(object = {}) {
  return isActiveCanonicalEvidenceObject(object);
}

function getEvidenceObjectIdentity(evidenceObject) {
  if (isActivityDay(evidenceObject)) {
    return ["activity_day", getDateKey(evidenceObject.observed_at)].join("|");
  }

  if (isTrainingSession(evidenceObject)) {
    const metadata = evidenceObject.metadata ?? {};

    return [
      "training",
      getDateKey(evidenceObject.observed_at),
      metadata.activity_type,
      metadata.active_calories,
      metadata.distance,
      metadata.start_time ?? metadata.started_at ?? metadata.start,
      metadata.duration_seconds,
    ].join("|");
  }

  return [evidenceObject.evidence_type, evidenceObject.id].join("|");
}

function isActivityDay(evidenceObject) {
  return evidenceObject?.evidence_type === "activity_day";
}

function isTrainingSession(evidenceObject) {
  return evidenceObject?.evidence_type === "training";
}

function formatActivityDayTitle(dailyActivity = {}) {
  const move = dailyActivity.move_calories;
  const exercise = dailyActivity.exercise_minutes;

  if (Number.isFinite(move) && Number.isFinite(exercise)) {
    return `${move} active cal / ${exercise} exercise min`;
  }

  if (Number.isFinite(move)) return `${move} active calories`;
  if (Number.isFinite(exercise)) return `${exercise} exercise minutes`;

  return "Daily activity summary";
}

function formatActivityDayDetail(evidenceObject) {
  const dailyActivity = evidenceObject.daily_activity ?? {};
  const derived = evidenceObject.derived_metrics ?? {};
  const parts = [
    Number.isFinite(dailyActivity.total_calories_burned)
      ? `${dailyActivity.total_calories_burned} total calories`
      : null,
    Number.isFinite(derived.training_sessions_referenced)
      ? `${derived.training_sessions_referenced} workouts linked`
      : null,
    Number.isFinite(derived.non_workout_active_calories)
      ? `${derived.non_workout_active_calories} non-workout active cal`
      : null,
  ].filter(Boolean);

  return parts.join(" · ") || "Activity history updated";
}

function formatTrainingDetail(evidenceObject) {
  const metadata = evidenceObject.metadata ?? {};
  const parts = [
    formatTimeRange(metadata),
    formatDuration(metadata.duration_seconds),
    Number.isFinite(metadata.distance)
      ? `${metadata.distance} ${metadata.distance_unit ?? "mi"}`
      : null,
    Number.isFinite(metadata.active_calories)
      ? `${metadata.active_calories} active cal`
      : null,
    Number.isFinite(metadata.average_heart_rate)
      ? `${metadata.average_heart_rate} bpm avg HR`
      : null,
    formatExerciseSummary(evidenceObject.exercises),
  ].filter(Boolean);

  return parts.join(" · ") || "Workout history updated";
}

function formatTimeRange(metadata = {}) {
  const start = metadata.start_time ?? metadata.started_at ?? metadata.start;
  const end = metadata.end_time ?? metadata.ended_at ?? metadata.end;

  if (start && end) return `${start}-${end}`;
  return start ?? null;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return null;

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatExerciseSummary(exercises = []) {
  if (!exercises.length) return null;

  return exercises
    .slice(0, 2)
    .map((exercise) => exercise.name)
    .filter(Boolean)
    .join(", ");
}

function formatLabel(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getDateKey(value) {
  return String(value ?? "").slice(0, 10);
}
