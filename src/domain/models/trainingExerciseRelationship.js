import { getCanonicalTrainingExerciseSlug } from "./trainingExerciseIdentity";
import {
  getTrainingExecutionVariantKey,
} from "./trainingExecutionVariant";

export const TRAINING_EXERCISE_RELATIONSHIP_TYPES = Object.freeze({
  SUPERSET: "superset",
});

export function createTrainingExerciseOccurrenceId({
  canonicalExerciseId = null,
  executionVariant = null,
  name = null,
  occurrenceIndex = 0,
  provenanceRef = "typed_evidence_0",
  sourceLine = null,
} = {}) {
  const movementKey = canonicalExerciseId ??
    getCanonicalTrainingExerciseSlug(name) ??
    normalizeKey(name) ??
    "exercise";
  const identity = [
    provenanceRef,
    Number.isInteger(sourceLine) ? `line:${sourceLine}` : "line:unknown",
    `occurrence:${occurrenceIndex}`,
    movementKey,
    `variant:${getTrainingExecutionVariantKey(executionVariant)}`,
  ].join("|");
  return `exercise_occurrence_${stableHash(identity)}`;
}

export function ensureUniqueTrainingExerciseOccurrenceIds(
  exercises = [],
  { preserveExisting = true, provenanceRef = "typed_evidence_0", sourceLines = [] } = {}
) {
  const seen = new Set();
  return (exercises ?? []).map((exercise, occurrenceIndex) => {
    const current = cleanString(exercise?.id ?? exercise?.exercise_id);
    if (preserveExisting && current && !seen.has(current)) {
      seen.add(current);
      return { ...exercise, id: current };
    }
    let id = createTrainingExerciseOccurrenceId({
      canonicalExerciseId: exercise?.canonicalExerciseId,
      executionVariant: exercise?.executionVariant,
      name: exercise?.name,
      occurrenceIndex,
      provenanceRef:
        exercise?.provenance_ref ??
        exercise?.provenance?.source_artifact_refs?.[0] ??
        provenanceRef,
      sourceLine: sourceLines[occurrenceIndex] ?? null,
    });
    let collision = 1;
    while (seen.has(id)) {
      id = `${id}_${collision}`;
      collision += 1;
    }
    seen.add(id);
    return { ...exercise, id };
  });
}

export function createTrainingExerciseRelationshipGroup({
  id = null,
  memberExerciseIds = [],
  provenance = {},
  provenance_ref = null,
  relationshipType = TRAINING_EXERCISE_RELATIONSHIP_TYPES.SUPERSET,
} = {}) {
  const members = uniqueStrings(memberExerciseIds);
  const sourceRef = cleanString(provenance_ref) ??
    cleanString(provenance?.source_artifact_refs?.[0]) ??
    "unknown";
  return {
    id: cleanString(id) ??
      `exercise_relationship_${stableHash([
        relationshipType,
        sourceRef,
        ...members,
      ].join("|"))}`,
    relationshipType,
    memberExerciseIds: members,
    provenance_ref: sourceRef,
    provenance: {
      source_artifact_refs: uniqueStrings(
        provenance?.source_artifact_refs?.length
          ? provenance.source_artifact_refs
          : [sourceRef]
      ),
    },
  };
}

export function normalizeTrainingExerciseRelationshipGroups(
  groups = [],
  { exercises = [], strict = false } = {}
) {
  const normalized = (Array.isArray(groups) ? groups : [])
    .map((group) => createTrainingExerciseRelationshipGroup(group));
  const issues = validateTrainingExerciseRelationshipGroups({
    exercises,
    groups: normalized,
  });
  if (strict && issues.length > 0) {
    const error = new Error(issues[0].message);
    error.code = issues[0].code;
    error.relationshipIssues = issues;
    throw error;
  }
  return strict ? normalized : normalized.filter((group) =>
    !issues.some((issue) => issue.relationshipGroupId === group.id)
  );
}

export function validateTrainingExerciseRelationshipGroups({
  exercises = [],
  groups = [],
} = {}) {
  const exerciseIds = new Set(
    (exercises ?? []).map((exercise) => cleanString(exercise?.id)).filter(Boolean)
  );
  const duplicateExerciseIds = duplicateStrings(
    (exercises ?? []).map((exercise) => cleanString(exercise?.id)).filter(Boolean)
  );
  const groupIds = new Set();
  const memberships = new Map();
  const issues = [];

  duplicateExerciseIds.forEach((exerciseId) => issues.push(issue(
    "DUPLICATE_EXERCISE_OCCURRENCE_ID",
    "Exercise occurrence ids must be unique inside a relationship-bearing TrainingSession.",
    { exerciseId }
  )));

  for (const group of groups ?? []) {
    const relationshipGroupId = cleanString(group?.id);
    const type = cleanString(group?.relationshipType);
    const members = Array.isArray(group?.memberExerciseIds)
      ? group.memberExerciseIds.map(cleanString).filter(Boolean)
      : [];
    if (!relationshipGroupId || groupIds.has(relationshipGroupId)) {
      issues.push(issue(
        "INVALID_EXERCISE_RELATIONSHIP_ID",
        "Exercise relationship ids must be present and unique inside the TrainingSession.",
        { relationshipGroupId }
      ));
    }
    if (relationshipGroupId) groupIds.add(relationshipGroupId);
    if (type !== TRAINING_EXERCISE_RELATIONSHIP_TYPES.SUPERSET) {
      issues.push(issue(
        "INVALID_EXERCISE_RELATIONSHIP_TYPE",
        "Superset is the only supported exercise relationship type.",
        { relationshipGroupId }
      ));
    }
    if (members.length < 2) {
      issues.push(issue(
        "INVALID_EXERCISE_RELATIONSHIP_MEMBER_COUNT",
        "An exercise relationship group requires at least two members.",
        { relationshipGroupId }
      ));
    }
    if (new Set(members).size !== members.length) {
      issues.push(issue(
        "DUPLICATE_EXERCISE_RELATIONSHIP_MEMBER",
        "An exercise occurrence can appear only once inside a relationship group.",
        { relationshipGroupId }
      ));
    }
    for (const memberExerciseId of members) {
      if (!exerciseIds.has(memberExerciseId)) {
        issues.push(issue(
          "DANGLING_EXERCISE_RELATIONSHIP_MEMBER",
          "An exercise relationship references an unavailable exercise occurrence.",
          { memberExerciseId, relationshipGroupId }
        ));
      }
      const priorGroupId = memberships.get(memberExerciseId);
      if (priorGroupId && priorGroupId !== relationshipGroupId) {
        issues.push(issue(
          "OVERLAPPING_EXERCISE_RELATIONSHIP_MEMBERSHIP",
          "An exercise occurrence can belong to only one structural relationship group.",
          { memberExerciseId, relationshipGroupId }
        ));
      } else if (relationshipGroupId) {
        memberships.set(memberExerciseId, relationshipGroupId);
      }
    }
  }
  return issues;
}

export function getTrainingExerciseRelationshipMembership(
  session = {},
  exerciseId
) {
  const id = cleanString(exerciseId);
  if (!id) return null;
  const groups = normalizeTrainingExerciseRelationshipGroups(
    session.exerciseRelationshipGroups,
    { exercises: session.exercises }
  );
  const group = groups.find((candidate) =>
    candidate.memberExerciseIds.includes(id)
  );
  if (!group) return null;
  return {
    group,
    memberIndex: group.memberExerciseIds.indexOf(id),
  };
}

export function deriveTrainingExerciseRelationshipContext({
  exercise,
  session,
} = {}) {
  const membership = getTrainingExerciseRelationshipMembership(
    session,
    exercise?.id
  );
  if (!membership) return null;
  const byId = new Map(
    (session?.exercises ?? []).map((candidate) => [candidate.id, candidate])
  );
  const orderedMembers = membership.group.memberExerciseIds
    .map((id) => byId.get(id))
    .filter(Boolean);
  const orderedPartners = orderedMembers
    .filter((candidate) => candidate.id !== exercise.id)
    .map((candidate) => ({
      canonicalExerciseId:
        candidate.canonicalExerciseId ??
        getCanonicalTrainingExerciseSlug(candidate.name),
      name: candidate.name,
    }));
  const comparisonKey = getTrainingExerciseRelationshipComparisonKey({
    relationshipType: membership.group.relationshipType,
    orderedPartners,
  });
  return {
    relationshipType: membership.group.relationshipType,
    memberIndex: membership.memberIndex,
    orderedPartners,
    comparisonKey,
  };
}

export function getTrainingExerciseRelationshipComparisonKey(context) {
  const relationshipType = context?.relationshipType ?? context?.relationship_type;
  if (!relationshipType) return "standalone";
  const partnerIds = (
    context.orderedPartners ?? context.ordered_partners ?? context.partners ?? []
  )
    .map((partner) =>
      cleanString(partner?.canonicalExerciseId ?? partner?.canonical_exercise_id)
    )
    .filter(Boolean)
    .sort();
  return `${relationshipType}|partners:${partnerIds.join(",")}`;
}

export function haveSameTrainingExerciseRelationshipContext(left, right) {
  return getTrainingExerciseRelationshipComparisonKey(left) ===
    getTrainingExerciseRelationshipComparisonKey(right);
}

export function removeExerciseFromTrainingRelationshipGroups(
  groups = [],
  exerciseId
) {
  return (groups ?? []).flatMap((group) => {
    const memberExerciseIds = (group.memberExerciseIds ?? []).filter(
      (memberId) => memberId !== exerciseId
    );
    return memberExerciseIds.length < 2
      ? []
      : [{ ...group, memberExerciseIds }];
  });
}

export function remapTrainingExerciseRelationshipGroups(groups = [], idMap = new Map()) {
  return (groups ?? []).map((group) => ({
    ...group,
    memberExerciseIds: (group.memberExerciseIds ?? []).map(
      (id) => idMap.get(id) ?? id
    ),
  }));
}

function issue(code, message, details = {}) {
  return { code, message, ...details };
}

function duplicateStrings(values = []) {
  const seen = new Set();
  const duplicates = new Set();
  values.forEach((value) => {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return [...duplicates];
}

function uniqueStrings(values = []) {
  return [...new Set((values ?? []).map(cleanString).filter(Boolean))];
}

function cleanString(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeKey(value) {
  return cleanString(value)?.toLowerCase().replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") ?? null;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
