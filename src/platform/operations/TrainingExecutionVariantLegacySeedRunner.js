import { createHash } from "node:crypto";
import { listCanonicalTrainingExerciseIdentities } from "../../domain/models/trainingExerciseIdentity.js";
import { normalizeTrainingExecutionVariant } from "../../domain/models/trainingExecutionVariant.js";
import {
  planTrainingExecutionVariantCreate,
  TRAINING_EXECUTION_VARIANT_COLLECTION,
  TRAINING_EXECUTION_VARIANT_PROVENANCE,
} from "../../domain/models/trainingExecutionVariantDefinition.js";

/**
 * Historical Static Hold seed (Founder decision D3, Build 92).
 *
 * Materializes exactly two canonical execution-variant definitions for the
 * Founder's historically recorded Static Hold work, so the existing legacy
 * `static_hold` occurrences resolve to a stable identity and become a
 * selectable Logger choice:
 *   - spider_curl            / "Static Hold" / legacyKeys [static_hold]
 *   - pendulum_squat_machine / "Static Hold" / legacyKeys [static_hold]
 * Both inherit the exercise's normal reps/load semantics (the audited
 * evidence is reps + load on every set; no duration is implied).
 *
 * Scope is fixed in code. It creates a definition only if missing, reactivates
 * a compatible retired one, never duplicates, never touches evidence, and never
 * seeds the misfiled legacy "Super Set" variant. Dry run writes nothing; apply
 * needs the `expected` facts of the immediately preceding dry run plus an
 * authorization reference, and verifies in-transaction that only the planned
 * definition records changed. Executing it in production is a separate,
 * explicitly Founder-authorized act.
 */
export const TRAINING_EXECUTION_VARIANT_LEGACY_SEED = Object.freeze([
  Object.freeze({ canonicalExerciseId: "spider_curl", displayName: "Static Hold", legacyKeys: Object.freeze(["static_hold"]) }),
  Object.freeze({ canonicalExerciseId: "pendulum_squat_machine", displayName: "Static Hold", legacyKeys: Object.freeze(["static_hold"]) }),
]);

const EVIDENCE_COLLECTION = "canonicalEvidenceObjects";
const EXCLUDED_LEGACY_KEYS = Object.freeze(["super_set"]);

export function legacySeedTrainingExecutionVariantId({ canonicalExerciseId, key }) {
  const hash = createHash("sha256")
    .update(`training-execution-variant|legacy_seed|${canonicalExerciseId}|${key}`)
    .digest("hex")
    .slice(0, 32);
  return `tev_${hash}`;
}

export async function runTrainingExecutionVariantLegacySeed({
  records,
  authorization,
  apply = false,
  expected = null,
  now = () => new Date(),
} = {}) {
  const ownerUserId = authorization?.ownerUserId;
  if (!ownerUserId) throw Object.assign(new Error("An owner is required."), { code: "OWNER_REQUIRED" });
  const [definitions, runtimeExercises, evidence] = await Promise.all([
    records.list({ ownerUserId, collection: TRAINING_EXECUTION_VARIANT_COLLECTION }),
    records.list({ ownerUserId, collection: "canonicalExerciseLibrary" }),
    records.list({ ownerUserId, collection: EVIDENCE_COLLECTION }),
  ]);
  const knownExercises = new Set([...listCanonicalTrainingExerciseIdentities(), ...runtimeExercises].map((item) => item?.id));
  const facts = collectFacts({ definitions, evidence });
  const timestamp = now();

  const refusals = [];
  let working = [...definitions];
  const plan = TRAINING_EXECUTION_VARIANT_LEGACY_SEED.map((entry) => {
    if (!knownExercises.has(entry.canonicalExerciseId)) {
      refusals.push(`canonical_exercise_unavailable:${entry.canonicalExerciseId}`);
      return null;
    }
    const planned = planTrainingExecutionVariantCreate({
      definitions: working,
      canonicalExerciseId: entry.canonicalExerciseId,
      displayName: entry.displayName,
      legacyKeys: entry.legacyKeys,
      id: legacySeedTrainingExecutionVariantId({ canonicalExerciseId: entry.canonicalExerciseId, key: "static_hold" }),
      provenance: TRAINING_EXECUTION_VARIANT_PROVENANCE.LEGACY_SEED,
      now: timestamp,
    });
    if (planned.outcome === "created") working = [...working, planned.definition];
    if (planned.outcome === "reactivated") {
      working = working.map((item) => ((item.payload ?? item).id === planned.definition.id ? planned.definition : item));
    }
    return Object.freeze({
      canonicalExerciseId: entry.canonicalExerciseId,
      displayName: planned.definition.displayName,
      variantId: planned.definition.id,
      outcome: planned.outcome,
      operation: planned.outcome === "created" ? "create" : planned.outcome === "reactivated" ? "update" : "none",
      expectedVersion: planned.previous?.version ?? null,
      definition: planned.definition,
    });
  }).filter(Boolean);
  if (refusals.length) return Object.freeze({ outcome: "refused", reasons: refusals, facts });

  const summary = {
    seed: plan.map(({ definition: _definition, ...item }) => item),
    predictedMutations: plan
      .filter((item) => item.operation !== "none")
      .map((item) => ({ collection: TRAINING_EXECUTION_VARIANT_COLLECTION, recordId: item.variantId, operation: item.operation })),
    unchangedByDesign: {
      canonicalEvidenceObjects: facts.evidenceCount,
      legacySuperSetOccurrences: facts.legacySuperSetOccurrences,
      evidenceRewritten: false,
      superSetSeeded: false,
    },
    facts,
  };
  if (!apply) return Object.freeze({ outcome: "dry_run", ...summary });

  const drift = compareFacts(expected, facts);
  if (drift.length) return Object.freeze({ outcome: "drifted", drift, facts });
  if (!String(authorization.authorizationReference ?? "").trim()) {
    throw Object.assign(new Error("An authorization reference is required."), { code: "AUTHORIZATION_REFERENCE_REQUIRED" });
  }
  for (const item of plan) {
    if (item.operation === "create") {
      const created = await records.putIfAbsent({
        ownerUserId,
        collection: TRAINING_EXECUTION_VARIANT_COLLECTION,
        recordId: item.variantId,
        payload: item.definition,
        sourceIdentity: item.variantId,
      });
      if (created?.created === false) {
        throw Object.assign(new Error("A definition appeared concurrently."), { code: "SEED_IDENTITY_CONFLICT" });
      }
    } else if (item.operation === "update") {
      const { version: _version, ...payload } = item.definition;
      await records.put({
        ownerUserId,
        collection: TRAINING_EXECUTION_VARIANT_COLLECTION,
        recordId: item.variantId,
        expectedVersion: item.expectedVersion,
        payload,
        sourceIdentity: item.variantId,
      });
    }
  }
  const [afterDefinitions, afterEvidence] = await Promise.all([
    records.list({ ownerUserId, collection: TRAINING_EXECUTION_VARIANT_COLLECTION }),
    records.list({ ownerUserId, collection: EVIDENCE_COLLECTION }),
  ]);
  const verification = verify({ plan, beforeDefinitions: definitions, afterDefinitions, evidence, afterEvidence });
  if (verification.length) {
    throw Object.assign(new Error(`Post-write verification failed: ${verification.join(", ")}`), { code: "POST_WRITE_VERIFICATION_FAILED" });
  }
  return Object.freeze({ outcome: "applied", ...summary, writes: summary.predictedMutations.length });
}

function collectFacts({ definitions, evidence }) {
  const staticHold = {};
  let legacySuperSetOccurrences = 0;
  let activeTrainingSessions = 0;
  for (const record of evidence) {
    const session = record?.payload ?? record;
    if (session?.evidence_type !== "training") continue;
    if (record?.quality?.status === "superseded" || record?.quality?.supersededBy) continue;
    activeTrainingSessions += 1;
    for (const exercise of session.exercises ?? []) {
      const key = normalizeTrainingExecutionVariant(exercise?.executionVariant)?.key;
      if (key === "static_hold") {
        const id = exercise.canonicalExerciseId ?? "unresolved";
        staticHold[id] = (staticHold[id] ?? 0) + 1;
      }
      if (EXCLUDED_LEGACY_KEYS.includes(key)) legacySuperSetOccurrences += 1;
    }
  }
  const definitionSummary = definitions
    .map((item) => item?.payload ?? item)
    .map((item) => ({ id: item.id, canonicalExerciseId: item.canonicalExerciseId, key: item.key, status: item.status, version: item.version ?? null }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return {
    definitionCount: definitionSummary.length,
    definitionsDigest: digest(definitionSummary),
    evidenceCount: evidence.length,
    evidenceDigest: digest(evidence.map((item) => [(item?.payload ?? item)?.id ?? item?.canonicalId ?? null, item?.version ?? null])),
    activeTrainingSessions,
    activeStaticHoldOccurrencesByExercise: Object.fromEntries(Object.entries(staticHold).sort()),
    legacySuperSetOccurrences,
  };
}

function compareFacts(expected, facts) {
  if (!expected || typeof expected !== "object") return ["expected_facts_missing"];
  return Object.keys(facts)
    .filter((key) => JSON.stringify(expected[key]) !== JSON.stringify(facts[key]))
    .map((key) => `facts_changed:${key}`);
}

function verify({ plan, beforeDefinitions, afterDefinitions, evidence, afterEvidence }) {
  const failures = [];
  const before = new Map(beforeDefinitions.map((item) => [(item?.payload ?? item).id, item?.payload ?? item]));
  const after = new Map(afterDefinitions.map((item) => [(item?.payload ?? item).id, item?.payload ?? item]));
  const touched = new Set(plan.filter((item) => item.operation !== "none").map((item) => item.variantId));
  for (const [id, definition] of before) {
    if (!touched.has(id) && JSON.stringify(after.get(id)) !== JSON.stringify(definition)) failures.push(`unplanned_definition_change:${id}`);
  }
  for (const item of plan) {
    const stored = after.get(item.variantId);
    if (!stored || stored.status !== "active" || stored.canonicalExerciseId !== item.canonicalExerciseId ||
        !(stored.key === "static_hold" || (stored.legacyKeys ?? []).includes("static_hold"))) {
      failures.push(`seed_not_present:${item.canonicalExerciseId}`);
    }
  }
  if ([...after.values()].some((definition) => definition.key === "super_set" || (definition.legacyKeys ?? []).includes("super_set"))) {
    failures.push("super_set_seeded");
  }
  if (digest(afterEvidence.map((item) => [(item?.payload ?? item)?.id ?? item?.canonicalId ?? null, item?.version ?? null])) !==
      digest(evidence.map((item) => [(item?.payload ?? item)?.id ?? item?.canonicalId ?? null, item?.version ?? null]))) {
    failures.push("evidence_changed");
  }
  return failures;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}
