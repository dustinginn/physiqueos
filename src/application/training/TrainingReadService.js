import { listCanonicalTrainingExerciseIdentities } from "../../domain/models/trainingExerciseIdentity.js";
import { resolvePreviousExerciseOccurrence } from "../../domain/services/TrainingExerciseOccurrenceHistoryService.js";
import { createTrainingLoggerSuggestion } from "../../domain/services/TrainingLoggerSuggestionService.js";
import { requireAuthenticationPrincipal } from "../auth/principal.js";
import { isActiveCanonicalTrainingSession } from "../../domain/services/CanonicalReadModel.js";
import {
  getLocalDateKey,
  resolveLocalTimeZone,
} from "../../domain/utils/localDate.js";
import { withPrimaryTrainingNavigationCategory } from "../../navigation/trainingNavigationMapping.js";

export function createTrainingReadService({ repositories } = {}) {
  return Object.freeze({
    async listHistory({ principal, limit = 25 } = {}) {
      const actor = requireAuthenticationPrincipal(principal);
      const sessions = await listSessions(repositories, actor.userId);
      return sessions.slice(0, Math.min(100, Math.max(1, Number(limit) || 25))).map(projectSessionSummary);
    },
    async getSession({ principal, sessionId } = {}) {
      const actor = requireAuthenticationPrincipal(principal);
      const sessions = await listSessions(repositories, actor.userId);
      const session = sessions.find((item) => sessionIdentity(item) === sessionId);
      return session ? projectSessionDetail(session) : null;
    },
    async getDay({ principal, date, timeZone = null } = {}) {
      const actor = requireAuthenticationPrincipal(principal);
      if (!isValidDateKey(date)) return null;
      const user = await repositories.users?.getUserById?.(actor.userId);
      const resolvedTimeZone = resolveLocalTimeZone(timeZone ?? user?.timezone);
      const sessions = (await listSessions(repositories, actor.userId))
        .filter((record) => sessionLocalDate(record, resolvedTimeZone) === date)
        .sort(compareDaySessions)
        .map(projectSessionSummary);
      return projectTrainingDay({ date, sessions, timeZone: resolvedTimeZone });
    },
    async getExerciseLibrary({ principal, query = "", limit = 50 } = {}) {
      requireAuthenticationPrincipal(principal);
      const normalized = String(query).trim().toLowerCase();
      return listCanonicalTrainingExerciseIdentities()
        .filter((item) => !normalized || `${item.name} ${item.bodyRegion ?? ""}`.toLowerCase().includes(normalized))
        .slice(0, Math.min(100, Math.max(1, Number(limit) || 50)))
        .map(projectExercise);
    },
    async getExercise({ principal, exerciseId } = {}) {
      requireAuthenticationPrincipal(principal);
      const exercise = listCanonicalTrainingExerciseIdentities().find((item) => item.id === exerciseId);
      return exercise ? Object.freeze({ ...projectExercise(exercise), movementPattern: exercise.movement_pattern ?? null, primaryMuscleGroups: Object.freeze([...(exercise.primary_muscle_groups ?? [])]), secondaryMuscleGroups: Object.freeze([...(exercise.secondary_muscle_groups ?? [])]), modifiers: Object.freeze([...(exercise.modifiers ?? [])]) }) : null;
    },
    async listCategories({ principal } = {}) {
      requireAuthenticationPrincipal(principal);
      return Object.freeze([...new Set(listCanonicalTrainingExerciseIdentities().map((item) => item.body_region).filter(Boolean))].sort());
    },
    async listRecentExercises({ principal, limit = 10 } = {}) {
      const actor = requireAuthenticationPrincipal(principal);
      const sessions = await listSessions(repositories, actor.userId);
      const seen = new Set();
      const recent = [];
      for (const record of sessions) {
        for (const exercise of (record.payload ?? record).exercises ?? []) {
          const id = exercise.canonicalExerciseId ?? exercise.exerciseId ?? exercise.id ?? exercise.name;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          recent.push(Object.freeze({ id: String(id), name: exercise.canonicalExerciseName ?? exercise.name ?? String(id), observedAt: (record.payload ?? record).observed_at ?? null }));
        }
      }
      return Object.freeze(recent.slice(0, Math.min(50, Math.max(1, Number(limit) || 10))));
    },
    async getPreparation({ principal, canonicalExerciseId, before = null, relationshipContext = null, variantKey = null, localDate } = {}) {
      const actor = requireAuthenticationPrincipal(principal);
      const sessions = await listSessions(repositories, actor.userId);
      return Object.freeze({
        comparable: resolvePreviousExerciseOccurrence({ before, canonicalExerciseId, relationshipContext, sessions, variantKey }),
        suggestion: createTrainingLoggerSuggestion({ date: localDate, sessions }),
      });
    },
  });
}

async function listSessions(repositories, userId) {
  const records = await repositories.canonicalEvidence.listCanonicalEvidenceObjects(userId);
  return records.filter(isActiveCanonicalTrainingSession)
    .sort((left, right) => compareDaySessions(right, left));
}

function projectSessionSummary(record) {
  const session = record.payload ?? record;
  const id = sessionIdentity(record);
  const exercises = session.exercises ?? [];
  const activityType = session.metadata?.activity_type ?? "Workout";
  const bodyAreas = uniqueStrings(exercises.map((exercise) =>
    withPrimaryTrainingNavigationCategory({
      ...exercise,
      label: exercise.canonicalExerciseName ?? exercise.name,
    }).primaryNavigationCategory
  ).filter(Boolean).map(toTitle));
  const kind = classifySession({ activityType, exercises });
  return Object.freeze({
    id,
    observedAt: session.observed_at ?? record.lastObservedAt ?? null,
    capturedAt: session.captured_at ?? record.updatedAt ?? null,
    activityType,
    title: activityType,
    kind,
    exerciseCount: exercises.length,
    bodyAreas: Object.freeze(bodyAreas),
    durationSeconds: finiteOrNull(session.metadata?.duration_seconds),
    distance: finiteOrNull(session.metadata?.distance),
    distanceUnit: session.metadata?.distance_unit ?? null,
    activeCalories: finiteOrNull(session.metadata?.active_calories),
    detail: sessionDetail({ activityType, bodyAreas, exercises, metadata: session.metadata ?? {} }),
    href: `/progress/training/session/${encodeURIComponent(id)}`,
  });
}
function projectSessionDetail(record) { const session = record.payload ?? record; return Object.freeze({ ...projectSessionSummary(record), exercises: structuredClone(session.exercises ?? []), exerciseRelationshipGroups: structuredClone(session.exerciseRelationshipGroups ?? []), metadata: structuredClone(session.metadata ?? {}) }); }
function sessionIdentity(record) { const session = record.payload ?? record; return String(record.canonicalId ?? session.id ?? record.id); }
function projectExercise(item) { return Object.freeze({ id: item.id, name: item.name, bodyRegion: item.body_region ?? null, equipment: item.equipment ?? null, href: `/progress/training/library/${encodeURIComponent(item.id)}` }); }

function projectTrainingDay({ date, sessions, timeZone }) {
  const bodyAreas = uniqueStrings(sessions.flatMap((session) => session.bodyAreas));
  const strengthSessions = sessions.filter((session) => session.kind === "strength").length;
  const exerciseCount = sessions.reduce((total, session) => total + session.exerciseCount, 0);
  return Object.freeze({
    date,
    label: formatDate(date),
    href: `/progress/training/day/${date}`,
    timeZone,
    sessions: Object.freeze(sessions),
    summary: Object.freeze({
      bodyAreas: Object.freeze(bodyAreas),
      sessionCount: sessions.length,
      strengthSessions,
      exerciseCount,
      hasWalking: sessions.some((session) => session.kind === "walking"),
      hasCardio: sessions.some((session) => ["cardio", "walking"].includes(session.kind)),
    }),
  });
}

// Training Day ordering prefers a reliable session/capture timestamp, then the
// canonical identity. The identity fallback keeps date-only evidence stable.
function compareDaySessions(left, right) {
  const leftKey = sessionOrderKey(left);
  const rightKey = sessionOrderKey(right);
  return leftKey.localeCompare(rightKey) || sessionIdentity(left).localeCompare(sessionIdentity(right));
}

function sessionOrderKey(record) {
  const session = record.payload ?? record;
  return String(session.captured_at ?? record.updatedAt ?? record.createdAt ?? session.observed_at ?? "");
}

function sessionLocalDate(record, timeZone) {
  const session = record.payload ?? record;
  const observedAt = session.observed_at ?? record.lastObservedAt;
  return getLocalDateKey(observedAt, timeZone);
}

function sessionDetail({ activityType, bodyAreas, exercises, metadata }) {
  if (classifySession({ activityType, exercises }) === "strength") {
    return [bodyAreas.join(" · "), `${exercises.length} ${exercises.length === 1 ? "exercise" : "exercises"}`]
      .filter(Boolean).join(" · ");
  }
  return [formatDuration(metadata.duration_seconds),
    hasFiniteValue(metadata.distance) ? `${metadata.distance} ${metadata.distance_unit ?? "mi"}` : null,
    hasFiniteValue(metadata.active_calories) ? `${metadata.active_calories} active cal` : null]
    .filter(Boolean).join(" · ");
}

function classifySession({ activityType, exercises }) {
  if (exercises.length || /strength|resistance|lifting|weights?/i.test(activityType)) return "strength";
  if (/walk/i.test(activityType)) return "walking";
  if (/cardio|stair|stepper|elliptical|treadmill|cycling|bike|run/i.test(activityType)) return "cardio";
  return "other";
}

function formatDuration(value) {
  if (!hasFiniteValue(value)) return null;
  const seconds = Number(value);
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

function finiteOrNull(value) { return hasFiniteValue(value) ? Number(value) : null; }
function hasFiniteValue(value) { return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)); }
function uniqueStrings(values) { return [...new Set(values.filter(Boolean).map(String))]; }
function toTitle(value) { return String(value).replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
