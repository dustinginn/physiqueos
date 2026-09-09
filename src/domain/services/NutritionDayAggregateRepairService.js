import { randomUUID } from "node:crypto";
import { applyNutritionDayMealAggregation } from "../models/nutritionDayEvidence";
import {
  createCanonicalNutritionDayRecord,
  getCanonicalNutritionSemanticFingerprint,
  selectActiveCanonicalNutritionDays,
} from "./CanonicalNutritionDayService";

const REQUIRED_AGGREGATE_FIELDS = Object.freeze([
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
]);

export function inspectNutritionDayAggregateRepair({
  canonicalObjects = [],
  date,
  userId,
} = {}) {
  const normalizedDate = requireDate(date);
  const ownerUserId = requireValue(userId, "userId");
  const selection = selectActiveCanonicalNutritionDays(canonicalObjects, {
    date: normalizedDate,
    userId: ownerUserId,
  });
  if (selection.diagnostics.length > 0 || selection.records.length !== 1) {
    throw repairError(
      "NUTRITION_AGGREGATE_REPAIR_DAY_AMBIGUOUS",
      "Nutrition aggregate repair requires exactly one active canonical day."
    );
  }
  const existing = selection.records[0];
  const projectedPayload = applyNutritionDayMealAggregation(existing.payload);
  const reconciliation = projectedPayload.metadata?.daily_totals_reconciliation;
  const requiredFieldsComplete = REQUIRED_AGGREGATE_FIELDS.every((field) =>
    reconciliation?.computed_fields?.includes(field));
  return Object.freeze({
    eligible: requiredFieldsComplete && reconciliation?.status !== "needs_review",
    canonicalId: existing.canonicalId,
    date: normalizedDate,
    beforeTotals: existing.payload.daily_totals,
    afterTotals: projectedPayload.daily_totals,
    mealCount: existing.payload.meals?.length ?? 0,
    reconciliation,
    semanticFingerprint: getCanonicalNutritionSemanticFingerprint(existing),
  });
}

export function createNutritionDayAggregateRepairService({
  mutateCanonicalRuntime,
  now = () => new Date(),
} = {}) {
  if (typeof mutateCanonicalRuntime !== "function") {
    throw new Error("Nutrition aggregate repair requires a bounded canonical mutation.");
  }

  return Object.freeze({
    async repair({
      commandId = randomUUID(),
      date,
      expectedCanonicalId,
      expectedPriorSemanticFingerprint,
      userId,
    } = {}) {
      const normalizedDate = requireDate(date);
      const ownerUserId = requireValue(userId, "userId");
      const expectedId = requireValue(expectedCanonicalId, "expectedCanonicalId");
      const expectedFingerprint = requireValue(
        expectedPriorSemanticFingerprint,
        "expectedPriorSemanticFingerprint"
      );

      const receipt = await mutateCanonicalRuntime({
        commandId,
        operation: "nutrition-day-aggregate-repair",
        allowedCollections: ["canonicalEvidenceObjects"],
        readCollections: ["canonicalEvidenceObjects"],
        readApplicationContext: false,
        readImportMetadata: false,
        allowApplicationContextMutation: false,
        mutate(runtime) {
          const beforeCount = runtime.canonicalEvidenceObjects?.length ?? 0;
          const inspection = inspectNutritionDayAggregateRepair({
            canonicalObjects: runtime.canonicalEvidenceObjects,
            date: normalizedDate,
            userId: ownerUserId,
          });
          const existing = selectActiveCanonicalNutritionDays(
            runtime.canonicalEvidenceObjects,
            { date: normalizedDate, userId: ownerUserId }
          ).records[0];
          if (existing.canonicalId !== expectedId) {
            throw repairError(
              "NUTRITION_AGGREGATE_REPAIR_CANONICAL_ID_MISMATCH",
              "The target canonical Nutrition Day changed before repair."
            );
          }
          const actualFingerprint = getCanonicalNutritionSemanticFingerprint(existing);
          if (actualFingerprint !== expectedFingerprint) {
            throw repairError(
              "NUTRITION_AGGREGATE_REPAIR_STALE",
              "The target canonical Nutrition Day changed before repair."
            );
          }

          const projectedPayload = applyNutritionDayMealAggregation(existing.payload);
          const reconciliation = inspection.reconciliation;
          if (!inspection.eligible && reconciliation?.status !== "needs_review") {
            throw repairError(
              "NUTRITION_AGGREGATE_REPAIR_MEALS_INCOMPLETE",
              "Canonical meals do not completely own calories and macro totals."
            );
          }
          if (reconciliation.status === "needs_review") {
            throw repairError(
              "NUTRITION_AGGREGATE_REPAIR_REQUIRES_REVIEW",
              "Canonical meal evidence is ambiguous and requires review."
            );
          }

          const sourceEvidencePackageId = existing.nutritionRevision
            ?.sourceEvidencePackageId ??
            existing.provenance?.evidence_package_ids?.at(-1) ?? null;
          const sourceReviewId = existing.nutritionRevision?.sourceReviewId ??
            existing.provenance?.evidence_review_ids?.at(-1) ?? null;
          const sourceEvidenceObjectId = existing.nutritionRevision
            ?.sourceEvidenceObjectId ?? existing.payload?.id ?? null;
          const evidenceObject = {
            ...projectedPayload,
            reconciliation: {
              ...(projectedPayload.reconciliation ?? {}),
              nutrition: {
                disposition: "replace",
                expectedPriorSemanticFingerprint: expectedFingerprint,
                replacementReason: "canonical_meal_aggregate_recomputation",
                replacementScope: "full_day",
                sourceReviewId,
              },
            },
          };
          const repaired = createCanonicalNutritionDayRecord({
            canonicalId: existing.canonicalId,
            canonicalProvenance: existing.provenance,
            evidenceObject,
            evidencePackage: {
              package_id: sourceEvidencePackageId,
              review_metadata: { sourceReviewId },
            },
            existingObject: existing,
            now: now().toISOString(),
            requireExpectedPriorFingerprint: true,
            userId: ownerUserId,
          });
          const existingMeals = JSON.stringify(existing.payload?.meals ?? []);
          if (JSON.stringify(repaired.payload?.meals ?? []) !== existingMeals) {
            throw repairError(
              "NUTRITION_AGGREGATE_REPAIR_MEALS_CHANGED",
              "Nutrition aggregate repair must not alter canonical meals."
            );
          }
          if (
            JSON.stringify(repaired.provenance?.evidence_package_ids ?? []) !==
              JSON.stringify(existing.provenance?.evidence_package_ids ?? []) ||
            JSON.stringify(repaired.provenance?.evidence_review_ids ?? []) !==
              JSON.stringify(existing.provenance?.evidence_review_ids ?? [])
          ) {
            throw repairError(
              "NUTRITION_AGGREGATE_REPAIR_PROVENANCE_CHANGED",
              "Nutrition aggregate repair must preserve review and package provenance."
            );
          }
          const index = runtime.canonicalEvidenceObjects.findIndex(
            (record) => record.canonicalId === existing.canonicalId
          );
          runtime.canonicalEvidenceObjects[index] = repaired;
          if (runtime.canonicalEvidenceObjects.length !== beforeCount) {
            throw repairError(
              "NUTRITION_AGGREGATE_REPAIR_COUNT_CHANGED",
              "Nutrition aggregate repair must revise one record in place."
            );
          }
          return Object.freeze({
            canonicalId: repaired.canonicalId,
            date: normalizedDate,
            beforeTotals: existing.payload.daily_totals,
            afterTotals: repaired.payload.daily_totals,
            mealCount: repaired.payload.meals?.length ?? 0,
            priorSemanticFingerprint: actualFingerprint,
            semanticFingerprint: repaired.nutritionRevision.semanticFingerprint,
            revision: repaired.nutritionRevision.revision,
          });
        },
      });
      return Object.freeze({
        ...receipt.result,
        commitId: receipt.commitId ?? commandId,
        committed: receipt.committed !== false,
      });
    },
  });
}

function requireDate(value) {
  const date = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw repairError(
      "NUTRITION_AGGREGATE_REPAIR_DATE_INVALID",
      "A canonical local date is required."
    );
  }
  return date;
}

function requireValue(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw repairError(
      "NUTRITION_AGGREGATE_REPAIR_INPUT_INVALID",
      `${field} is required.`
    );
  }
  return normalized;
}

function repairError(code, message) {
  return Object.assign(new Error(message), { code });
}
