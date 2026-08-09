import { createHash } from "node:crypto";
import { NutritionDailyTotalsScope } from "../models/nutritionDayEvidence";

export const NUTRITION_DAY_REVISION_SCHEMA_VERSION =
  "canonical-nutrition-day-revision-v1";

export const NutritionCanonicalDisposition = Object.freeze({
  ADDITIVE: "additive",
  AMBIGUOUS: "ambiguous",
  REPLACE: "replace",
});

export class CanonicalNutritionDayError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CanonicalNutritionDayError";
    this.code = code;
  }
}

export function getNutritionDayLogicalKey(value = {}) {
  const payload = value.payload ?? value;
  const date = nutritionDate(payload);
  return date ? `nutrition|${date}` : null;
}

export function getStableNutritionDayCanonicalId(value = {}) {
  const date = nutritionDate(value.payload ?? value);
  return date ? `nutrition|${date}|nutrition-day` : null;
}

export function normalizeNutritionMealKey(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized === "snack") return "snacks";
  return normalized || null;
}

export function createNutritionSemanticFingerprint(
  payload = {},
  { replacementScope = "active_day" } = {}
) {
  const semantic = {
    date: nutritionDate(payload),
    dailyTotals: semanticObject(payload.daily_totals),
    goalStatus: semanticObject(payload.goal_status),
    macroPercentages: semanticObject(payload.macro_percentages),
    meals: (payload.meals ?? [])
      .map((meal) => ({
        key: normalizeNutritionMealKey(meal.name ?? meal.id),
        label: String(meal.name ?? "Meal").trim(),
        completeness: meal.completeness ?? null,
        totals: semanticObject(meal.totals),
        foods: (meal.foods ?? [])
          .map((food) => ({
            name: String(food.canonical_name ?? food.name ?? "").trim(),
            brand: clean(food.brand),
            servingSize: clean(food.serving_size),
            servings: finite(food.servings),
            nutrients: semanticObject(food.nutrients),
          }))
          .sort((left, right) => stable(left).localeCompare(stable(right))),
      }))
      .sort((left, right) =>
        `${left.key}|${stable(left)}`.localeCompare(`${right.key}|${stable(right)}`)
      ),
    nutrients: (payload.nutrients ?? [])
      .map((nutrient) => ({
        name: clean(nutrient.name),
        total: finiteOrText(nutrient.total),
        goal: finiteOrText(nutrient.goal),
        remaining: finiteOrText(nutrient.remaining),
        unit: clean(nutrient.unit),
      }))
      .sort((left, right) => stable(left).localeCompare(stable(right))),
    replacementScope,
    targets: semanticObject(payload.targets),
  };
  return `sha256_${createHash("sha256").update(stable(semantic)).digest("hex")}`;
}

export function getCanonicalNutritionSemanticFingerprint(record = {}) {
  return record.nutritionRevision?.semanticFingerprint ??
    createNutritionSemanticFingerprint(record.payload ?? record, {
      replacementScope:
        record.nutritionRevision?.replacementScope ?? "legacy_active_day",
    });
}

export function prepareNutritionEvidencePackageForReview({
  canonicalObjects = [],
  evidencePackage = {},
  reviewId = null,
} = {}) {
  return {
    ...evidencePackage,
    evidence_objects: (evidencePackage.evidence_objects ?? []).map((object) => {
      if (!isNutritionPayload(object) || object.removed === true) return object;
      const selection = selectActiveCanonicalNutritionDays(canonicalObjects, {
        date: nutritionDate(object),
      });
      const existing = selection.records[0] ?? null;
      if (!existing) {
        return withNutritionReconciliation(object, {
          disposition: NutritionCanonicalDisposition.ADDITIVE,
          dispositionStatus: "automatic",
          logicalDayKey: getNutritionDayLogicalKey(object),
          replacementScope: "initial_day",
          sourceReviewId: reviewId,
        });
      }
      if (selection.diagnostics.length > 0) {
        return withNutritionReconciliation(object, {
          disposition: null,
          dispositionStatus: "blocked_duplicate_active_days",
          existingPreview: createNutritionPreview(existing.payload),
          expectedPriorSemanticFingerprint:
            getCanonicalNutritionSemanticFingerprint(existing),
          logicalDayKey: getNutritionDayLogicalKey(object),
          sourceReviewId: reviewId,
          targetCanonicalId: existing.canonicalId,
        });
      }
      const assessment = assessNutritionDisposition({
        existingPayload: existing.payload,
        incomingPayload: object,
      });
      return withNutritionReconciliation(object, {
        ...assessment,
        existingPreview: createNutritionPreview(existing.payload),
        expectedPriorSemanticFingerprint:
          getCanonicalNutritionSemanticFingerprint(existing),
        logicalDayKey: getNutritionDayLogicalKey(object),
        newPreview: createNutritionPreview(object),
        sourceReviewId: reviewId,
        targetCanonicalId: existing.canonicalId,
      });
    }),
    review_metadata: {
      ...(evidencePackage.review_metadata ?? {}),
      sourceReviewId: reviewId ?? evidencePackage.review_metadata?.sourceReviewId,
    },
  };
}

export function assessNutritionDisposition({
  existingPayload = {},
  incomingPayload = {},
} = {}) {
  const explicit = incomingPayload.reconciliation?.nutrition?.disposition ??
    incomingPayload.metadata?.canonical_disposition;
  const scope = incomingPayload.metadata?.daily_totals_scope;
  const incomingKeys = mealKeys(incomingPayload);
  const existingKeys = new Set(mealKeys(existingPayload));
  const overlapping = incomingKeys.filter((key) => existingKeys.has(key));

  if (explicit === NutritionCanonicalDisposition.REPLACE) {
    return {
      disposition: explicit,
      dispositionStatus: "explicit",
      replacementScope:
        incomingPayload.reconciliation?.nutrition?.replacementScope ??
        inferReplacementScope(incomingPayload, overlapping),
    };
  }
  if (explicit === NutritionCanonicalDisposition.ADDITIVE) {
    return {
      disposition: explicit,
      dispositionStatus: "explicit",
      replacementScope: "distinct_meals",
    };
  }
  if (scope === NutritionDailyTotalsScope.FULL_DAY_SUMMARY) {
    return {
      disposition: NutritionCanonicalDisposition.REPLACE,
      dispositionStatus: "automatic",
      replacementScope: "full_day",
    };
  }
  if (incomingKeys.length === 1 && overlapping.length === 1) {
    return {
      disposition: NutritionCanonicalDisposition.REPLACE,
      dispositionStatus: "automatic",
      replacementScope: `meal:${overlapping[0]}`,
    };
  }
  return {
    disposition: null,
    dispositionStatus: "requires_choice",
    replacementScope: incomingKeys.length === 1
      ? `meal:${incomingKeys[0]}`
      : "bounded_selection",
  };
}

export function createCanonicalNutritionDayRecord({
  canonicalId,
  canonicalProvenance,
  evidenceObject,
  evidencePackage,
  existingObject = null,
  now = new Date().toISOString(),
  requireExpectedPriorFingerprint = false,
  userId,
} = {}) {
  const candidate = structuredClone(evidenceObject);
  const relationship = candidate.reconciliation?.nutrition ?? {};
  const canonicalCandidate = withoutCanonicalReconciliation(candidate);
  const assessment = existingObject
    ? assessNutritionDisposition({
        existingPayload: existingObject.payload,
        incomingPayload: candidate,
      })
    : {
        disposition: NutritionCanonicalDisposition.ADDITIVE,
        dispositionStatus: "automatic",
        replacementScope: "initial_day",
      };
  const disposition = relationship.disposition ?? assessment.disposition;
  const replacementScope = relationship.replacementScope ??
    assessment.replacementScope;

  if (existingObject && isExactAcceptedSourceReplay({
    evidenceObject: candidate,
    evidencePackage,
    existingObject,
  })) {
    return existingObject;
  }

  if (existingObject && requireExpectedPriorFingerprint) {
    const expected = relationship.expectedPriorSemanticFingerprint;
    const actual = getCanonicalNutritionSemanticFingerprint(existingObject);
    if (!expected || expected !== actual) {
      throw new CanonicalNutritionDayError(
        "NUTRITION_REVISION_STALE",
        "This Nutrition Day changed after the review opened. Refresh the review before saving."
      );
    }
  }
  if (existingObject && !disposition) {
    throw new CanonicalNutritionDayError(
      "NUTRITION_DISPOSITION_REQUIRED",
      "Choose whether this evidence updates the existing Nutrition Day or adds a distinct meal."
    );
  }
  if (existingObject && disposition === NutritionCanonicalDisposition.ADDITIVE) {
    const existingKeys = new Set(mealKeys(existingObject.payload));
    if (mealKeys(candidate).length === 0) {
      throw new CanonicalNutritionDayError(
        "NUTRITION_ADDITIVE_SCOPE_REQUIRED",
        "Add separately requires a distinct meal scope."
      );
    }
    if (mealKeys(candidate).some((key) => existingKeys.has(key))) {
      throw new CanonicalNutritionDayError(
        "NUTRITION_ADDITIVE_SCOPE_CONFLICT",
        "Add separately is only available for a distinct meal not already represented."
      );
    }
    if (candidate.metadata?.daily_totals_scope ===
      NutritionDailyTotalsScope.FULL_DAY_SUMMARY) {
      throw new CanonicalNutritionDayError(
        "NUTRITION_FULL_DAY_CANNOT_BE_ADDITIVE",
        "A full-day Nutrition snapshot must update the existing day."
      );
    }
  }

  const payload = existingObject
    ? reconcileNutritionPayload({
        disposition,
        existing: existingObject.payload,
        incoming: canonicalCandidate,
        replacementScope,
      })
    : canonicalCandidate;
  if (existingObject?.payload?.id) payload.id = existingObject.payload.id;
  const priorFingerprint = existingObject
    ? getCanonicalNutritionSemanticFingerprint(existingObject)
    : null;
  const semanticFingerprint = createNutritionSemanticFingerprint(payload, {
    replacementScope,
  });
  const semanticChanged = priorFingerprint !== semanticFingerprint;
  const priorRevision = existingObject?.nutritionRevision?.revision ??
    (existingObject ? 1 : 0);
  const revision = semanticChanged ? priorRevision + 1 : priorRevision || 1;
  const sourceReviewId = relationship.sourceReviewId ??
    evidencePackage?.review_metadata?.sourceReviewId ?? null;
  const history = [...(existingObject?.nutritionRevisionHistory ?? [])];
  if (existingObject && semanticChanged) {
    history.push(createRevisionSnapshot(existingObject));
  }

  return {
    canonicalId,
    createdAt: existingObject?.createdAt ?? now,
    evidence_type: "nutrition",
    firstObservedAt: existingObject?.firstObservedAt ?? nutritionDate(payload),
    lastObservedAt: nutritionDate(payload),
    nutritionRevision: {
      schemaVersion: NUTRITION_DAY_REVISION_SCHEMA_VERSION,
      logicalDayKey: getNutritionDayLogicalKey(payload),
      revision,
      semanticFingerprint,
      priorSemanticFingerprint: semanticChanged ? priorFingerprint :
        existingObject?.nutritionRevision?.priorSemanticFingerprint ?? null,
      disposition,
      replacementScope,
      replacementReason: existingObject
        ? relationship.replacementReason ?? "confirmed_same_date_nutrition"
        : "initial_canonical_nutrition_day",
      replacedAt: existingObject && semanticChanged ? now :
        existingObject?.nutritionRevision?.replacedAt ?? null,
      sourceEvidencePackageId:
        evidencePackage?.package_id ?? evidencePackage?.id ?? null,
      sourceEvidenceObjectId: evidenceObject.id ?? null,
      sourceReviewId,
    },
    nutritionRevisionHistory: history,
    payload,
    provenance: {
      ...canonicalProvenance,
      evidence_review_ids: unique([
        ...(existingObject?.provenance?.evidence_review_ids ?? []),
        sourceReviewId,
      ]),
    },
    quality: { status: "active" },
    updatedAt: semanticChanged || !existingObject ? now : existingObject.updatedAt,
    userId,
  };
}

function isExactAcceptedSourceReplay({ evidenceObject, evidencePackage, existingObject }) {
  const packageId = evidencePackage?.package_id ?? evidencePackage?.id;
  if (!packageId || !(existingObject.provenance?.evidence_package_ids ?? [])
    .includes(packageId)) return false;
  if (!(existingObject.provenance?.contributing_evidence_object_ids ?? [])
    .includes(evidenceObject.id)) return false;
  return createNutritionSemanticFingerprint(evidenceObject, {
    replacementScope:
      existingObject.nutritionRevision?.replacementScope ?? "legacy_active_day",
  }) === getCanonicalNutritionSemanticFingerprint(existingObject);
}

export function selectActiveCanonicalNutritionDays(
  canonicalObjects = [],
  { date = null, userId = null } = {}
) {
  const groups = new Map();
  canonicalObjects
    .filter((record) =>
      isNutritionPayload(record.payload ?? record) &&
      isActive(record) &&
      (!userId || !record.userId || record.userId === userId) &&
      (!date || nutritionDate(record.payload ?? record) === date)
    )
    .forEach((record) => {
      const key = getNutritionDayLogicalKey(record);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    });
  const diagnostics = [];
  const records = [];
  for (const [logicalDayKey, candidates] of groups.entries()) {
    const ordered = [...candidates].sort(compareCanonicalNutritionAuthority);
    records.push(ordered.at(-1));
    if (ordered.length > 1) {
      diagnostics.push(Object.freeze({
        code: "NUTRITION_ACTIVE_DAY_DUPLICATE",
        logicalDayKey,
        canonicalIds: ordered.map((item) => item.canonicalId).sort(),
      }));
    }
  }
  return Object.freeze({
    diagnostics: Object.freeze(diagnostics),
    records: Object.freeze(records.sort((left, right) =>
      nutritionDate(left.payload).localeCompare(nutritionDate(right.payload))
    )),
  });
}

export function selectNutritionDayPayloads(days = []) {
  const groups = new Map();
  for (const day of days) {
    const date = nutritionDate(day);
    if (!date) continue;
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(day);
  }
  return [...groups.entries()].map(([, candidates]) =>
    [...candidates].sort(compareNutritionPayloadAuthority).at(-1)
  );
}

function reconcileNutritionPayload({ disposition, existing, incoming, replacementScope }) {
  if (disposition === NutritionCanonicalDisposition.ADDITIVE) {
    return {
      ...existing,
      captured_at: incoming.captured_at ?? existing.captured_at,
      meals: [...(existing.meals ?? []), ...(incoming.meals ?? [])],
      metadata: updateMealCounts({
        ...(existing.metadata ?? {}),
        source: incoming.metadata?.source ?? existing.metadata?.source,
      }, [...(existing.meals ?? []), ...(incoming.meals ?? [])]),
      provenance: mergePayloadProvenance(existing.provenance, incoming.provenance),
      source: mergeSource(existing.source, incoming.source),
    };
  }
  if (replacementScope === "full_day") {
    return {
      ...incoming,
      provenance: mergePayloadProvenance(existing.provenance, incoming.provenance),
      source: mergeSource(existing.source, incoming.source),
    };
  }
  const replacementKeys = new Set(mealKeys(incoming));
  const meals = [
    ...(existing.meals ?? []).filter((meal) =>
      !replacementKeys.has(normalizeNutritionMealKey(meal.name ?? meal.id))
    ),
    ...(incoming.meals ?? []),
  ];
  return {
    ...existing,
    captured_at: incoming.captured_at ?? existing.captured_at,
    meals,
    metadata: updateMealCounts({
      ...(existing.metadata ?? {}),
      source: incoming.metadata?.source ?? existing.metadata?.source,
    }, meals),
    provenance: mergePayloadProvenance(existing.provenance, incoming.provenance),
    source: mergeSource(existing.source, incoming.source),
  };
}

function createRevisionSnapshot(record) {
  return {
    revision: record.nutritionRevision?.revision ?? 1,
    semanticFingerprint: getCanonicalNutritionSemanticFingerprint(record),
    replacementScope: record.nutritionRevision?.replacementScope ??
      "legacy_active_day",
    acceptedAt: record.updatedAt ?? record.createdAt ?? null,
    payload: structuredClone(record.payload),
    provenance: structuredClone(record.provenance ?? {}),
    sourceEvidencePackageId:
      record.nutritionRevision?.sourceEvidencePackageId ?? null,
    sourceEvidenceObjectId:
      record.nutritionRevision?.sourceEvidenceObjectId ?? record.payload?.id ?? null,
    sourceReviewId: record.nutritionRevision?.sourceReviewId ?? null,
  };
}

function compareCanonicalNutritionAuthority(left, right) {
  const revisionDelta = (left.nutritionRevision?.revision ?? 0) -
    (right.nutritionRevision?.revision ?? 0);
  if (revisionDelta) return revisionDelta;
  const timeDelta = String(left.updatedAt ?? left.createdAt ?? "")
    .localeCompare(String(right.updatedAt ?? right.createdAt ?? ""));
  if (timeDelta) return timeDelta;
  return String(left.canonicalId ?? "").localeCompare(String(right.canonicalId ?? ""));
}

function compareNutritionPayloadAuthority(left, right) {
  const revisionDelta = (left._canonicalNutritionRevision?.revision ?? 0) -
    (right._canonicalNutritionRevision?.revision ?? 0);
  if (revisionDelta) return revisionDelta;
  const timeDelta = String(left._canonicalUpdatedAt ?? "")
    .localeCompare(String(right._canonicalUpdatedAt ?? ""));
  if (timeDelta) return timeDelta;
  return String(left._canonicalId ?? left.id ?? "")
    .localeCompare(String(right._canonicalId ?? right.id ?? ""));
}

function withNutritionReconciliation(object, values) {
  return {
    ...object,
    reconciliation: {
      ...(object.reconciliation ?? {}),
      nutrition: {
        ...(object.reconciliation?.nutrition ?? {}),
        ...withoutUndefined(values),
      },
    },
  };
}

function withoutCanonicalReconciliation(payload) {
  const clone = structuredClone(payload);
  if (!clone.reconciliation) return clone;
  delete clone.reconciliation.nutrition;
  if (Object.keys(clone.reconciliation).length === 0) {
    delete clone.reconciliation;
  }
  return clone;
}

function inferReplacementScope(payload, overlapping) {
  if (payload.metadata?.daily_totals_scope ===
    NutritionDailyTotalsScope.FULL_DAY_SUMMARY) return "full_day";
  if (overlapping.length === 1) return `meal:${overlapping[0]}`;
  return "bounded_selection";
}

function createNutritionPreview(payload = {}) {
  return {
    calories: finite(payload.daily_totals?.calories),
    meals: (payload.meals ?? []).map((meal) => ({
      key: normalizeNutritionMealKey(meal.name ?? meal.id),
      label: meal.name ?? "Meal",
      calories: finite(meal.totals?.calories),
    })),
  };
}

function updateMealCounts(metadata, meals) {
  return {
    ...metadata,
    meal_count: meals.length,
    food_count: meals.reduce((sum, meal) => sum + (meal.foods?.length ?? 0), 0),
  };
}

function mergeSource(left = {}, right = {}) {
  return {
    ...left,
    ...right,
    source_artifact_refs: unique([
      ...(left.source_artifact_refs ?? []),
      ...(right.source_artifact_refs ?? []),
    ]),
  };
}

function mergePayloadProvenance(left = {}, right = {}) {
  return {
    ...left,
    ...right,
    source_artifact_refs: unique([
      ...(left.source_artifact_refs ?? []),
      ...(right.source_artifact_refs ?? []),
    ]),
  };
}

function mealKeys(payload = {}) {
  return unique((payload.meals ?? [])
    .map((meal) => normalizeNutritionMealKey(meal.name ?? meal.id)));
}

function nutritionDate(payload = {}) {
  return String(payload.observed_at ?? payload.date ?? payload.metadata?.date ?? "")
    .slice(0, 10);
}

function isNutritionPayload(payload = {}) {
  return payload?.evidence_type === "nutrition";
}

function isActive(record = {}) {
  return record.quality?.status !== "superseded" &&
    !record.quality?.supersededBy &&
    record.payload?.quality?.status !== "superseded";
}

function semanticObject(value = {}) {
  return Object.fromEntries(Object.entries(value ?? {})
    .filter(([, item]) => item !== null && item !== undefined && item !== "")
    .map(([key, item]) => [key,
      item && typeof item === "object" && !Array.isArray(item)
        ? semanticObject(item)
        : finiteOrText(item)]));
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteOrText(value) {
  const number = finite(value);
  return number === null ? value : number;
}

function clean(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function withoutUndefined(value = {}) {
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
