import { listCanonicalTrainingExerciseIdentities } from "../../domain/models/trainingExerciseIdentity.js";
import { resolvePreviousExerciseOccurrence } from "../../domain/services/TrainingExerciseOccurrenceHistoryService.js";
import { createTrainingLoggerSuggestion } from "../../domain/services/TrainingLoggerSuggestionService.js";
import { requireAuthenticationPrincipal } from "../auth/principal.js";

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
  return records.filter((record) => (record.payload ?? record).evidence_type === "training" && record.quality?.status !== "superseded" && !record.quality?.supersededBy)
    .sort((left, right) => String((right.payload ?? right).observed_at ?? "").localeCompare(String((left.payload ?? left).observed_at ?? "")));
}

function projectSessionSummary(record) { const session = record.payload ?? record; return Object.freeze({ id: sessionIdentity(record), observedAt: session.observed_at ?? record.lastObservedAt ?? null, activityType: session.metadata?.activity_type ?? "Workout", exerciseCount: session.exercises?.length ?? 0, href: `/progress/training/session/${encodeURIComponent(sessionIdentity(record))}` }); }
function projectSessionDetail(record) { const session = record.payload ?? record; return Object.freeze({ ...projectSessionSummary(record), exercises: structuredClone(session.exercises ?? []), exerciseRelationshipGroups: structuredClone(session.exerciseRelationshipGroups ?? []), metadata: structuredClone(session.metadata ?? {}) }); }
function sessionIdentity(record) { const session = record.payload ?? record; return String(record.canonicalId ?? session.id ?? record.id); }
function projectExercise(item) { return Object.freeze({ id: item.id, name: item.name, bodyRegion: item.body_region ?? null, equipment: item.equipment ?? null, href: `/progress/training/library/${encodeURIComponent(item.id)}` }); }
