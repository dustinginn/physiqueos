import {
  reconcileConfirmedEvidencePackage,
  reconcileEvidencePackageIntoCanonicalHistory,
} from "../../domain/services/CanonicalEvidenceService";
import {
  createCanonicalRecoveryEvidenceObject,
  createRecoveryEvidenceRecord,
} from "../../domain/models/RecoveryEvidenceModel";
import { getNutritionDayLogicalKey } from "../../domain/services/CanonicalNutritionDayService";

export const RECOVERY_EVIDENCE_WINDOW_LIMIT = 64;

export function createCanonicalEvidenceRepository(canonicalEvidenceObjects = [], options = {}) {
  async function reconcileFromEvidencePackages(userId) {
    const evidencePackages = options.evidencePackages ?? [];
    const packagesForUser = evidencePackages.filter(
      (evidencePackage) => !userId || !evidencePackage.userId || evidencePackage.userId === userId
    );

    if (packagesForUser.length === 0) return [];

    const reconciledObjects = packagesForUser.reduce(
      (objects, evidencePackage) =>
        reconcileEvidencePackageIntoCanonicalHistory({
          evidencePackage,
          existingCanonicalObjects: objects,
          userId: userId ?? evidencePackage.userId,
        }),
      canonicalEvidenceObjects
    );

    canonicalEvidenceObjects.splice(
      0,
      canonicalEvidenceObjects.length,
      ...reconciledObjects
    );
    options.onChange?.();

    return canonicalEvidenceObjects.filter(
      (evidenceObject) => !userId || evidenceObject.userId === userId
    );
  }

  return {
    async listCanonicalEvidenceObjects(userId) {
      return canonicalEvidenceObjects.filter(
        (evidenceObject) => !userId || evidenceObject.userId === userId
      );
    },

    // Compatibility alias for explicit recovery workflows. Never call from a GET route or routine confirmation.
    async reconcileFromEvidencePackages(userId) {
      return reconcileFromEvidencePackages(userId);
    },

    async reconcileCanonicalHistory(userId) {
      const beforeById = new Map(
        canonicalEvidenceObjects.map((object) => [object.canonicalId, JSON.stringify(object)])
      );
      const objects = await reconcileFromEvidencePackages(userId);
      const afterIds = new Set(objects.map((object) => object.canonicalId));

      return {
        objects,
        report: {
          addedCanonicalIds: objects
            .filter((object) => !beforeById.has(object.canonicalId))
            .map((object) => object.canonicalId),
          changedCanonicalIds: objects
            .filter((object) => beforeById.get(object.canonicalId) !== JSON.stringify(object))
            .map((object) => object.canonicalId),
          removedCanonicalIds: [...beforeById.keys()].filter((id) => !afterIds.has(id)),
          mutationReason: "explicit_canonical_history_maintenance",
        },
      };
    },

    async reconcileConfirmedEvidencePackage(evidencePackage, userId) {
      const result = reconcileConfirmedEvidencePackage({
        evidencePackage,
        existingCanonicalObjects: canonicalEvidenceObjects,
        userId,
      });

      if (result.changedObjects.length > 0) {
        await upsertCanonicalEvidenceObjects(result.changedObjects);
      }

      return result;
    },

    async upsertCanonicalEvidenceObjects(evidenceObjects = []) {
      return upsertCanonicalEvidenceObjects(evidenceObjects);
    },

    async getRecoveryEvidenceById(userId, evidenceId) {
      const object = canonicalEvidenceObjects.find(
        (item) =>
          item.canonicalId === evidenceId &&
          item.userId === userId &&
          item.evidence_type === "recovery"
      );
      return object?.payload ? structuredClone(object.payload) : null;
    },

    async listRecoveryEvidenceInWindow(userId, window, query = {}) {
      return listRecoveryEvidenceInWindow(
        canonicalEvidenceObjects,
        userId,
        window,
        query
      );
    },

    async saveRecoveryEvidence(input) {
      const record = createRecoveryEvidenceRecord(input);
      const existing = canonicalEvidenceObjects.find(
        (item) => item.canonicalId === record.id
      );
      if (existing) {
        if (existing.userId !== record.userId) {
          throw new Error("Recovery evidence identity belongs to another user.");
        }
        if (JSON.stringify(existing.payload) !== JSON.stringify(record)) {
          throw new Error("Recovery evidence value change requires an explicit correction.");
        }
        return structuredClone(existing.payload);
      }
      const changed = [];
      if (record.supersedesEvidenceId || record.correctsEvidenceId) {
        const priorId = record.supersedesEvidenceId ?? record.correctsEvidenceId;
        const prior = canonicalEvidenceObjects.find(
          (item) => item.canonicalId === priorId
        );
        validateCompatibleRecoveryLineage(prior, record);
        changed.push({
          ...prior,
          payload: {
            ...prior.payload,
            status: "superseded",
            supersededByEvidenceId: record.id,
            updatedAt: record.updatedAt,
          },
        });
      }
      changed.push(createCanonicalRecoveryEvidenceObject(record));
      await upsertCanonicalEvidenceObjects(changed);
      return record;
    },
  };

  async function upsertCanonicalEvidenceObjects(evidenceObjects = []) {
      assertNoSecondActiveNutritionDay(
        canonicalEvidenceObjects,
        evidenceObjects
      );
      let changed = false;
      evidenceObjects.forEach((evidenceObject) => {
        const existingIndex = canonicalEvidenceObjects.findIndex(
          (item) => item.canonicalId === evidenceObject.canonicalId
        );

        if (existingIndex >= 0) {
          if (JSON.stringify(canonicalEvidenceObjects[existingIndex]) !== JSON.stringify(evidenceObject)) {
            canonicalEvidenceObjects[existingIndex] = evidenceObject;
            changed = true;
          }
        } else {
          canonicalEvidenceObjects.push(evidenceObject);
          changed = true;
        }
      });

      if (changed) options.onChange?.();

      return evidenceObjects;
  }
}

function assertNoSecondActiveNutritionDay(existing = [], incoming = []) {
  for (const record of incoming) {
    const payload = record.payload ?? record;
    if (
      payload.evidence_type !== "nutrition" ||
      record.quality?.status === "superseded" ||
      record.quality?.supersededBy
    ) continue;
    const logicalDayKey = getNutritionDayLogicalKey(record);
    const conflict = existing.find((candidate) =>
      candidate.canonicalId !== record.canonicalId &&
      (!record.userId || !candidate.userId || candidate.userId === record.userId) &&
      (candidate.payload ?? candidate).evidence_type === "nutrition" &&
      candidate.quality?.status !== "superseded" &&
      !candidate.quality?.supersededBy &&
      getNutritionDayLogicalKey(candidate) === logicalDayKey
    );
    if (conflict) {
      throw new Error(
        `Cannot persist a second active canonical NutritionDay for ${logicalDayKey}.`
      );
    }
  }
}

export function listRecoveryEvidenceInWindow(
  canonicalEvidenceObjects,
  userId,
  window,
  {
    metrics = null,
    includeSuperseded = false,
    limit = RECOVERY_EVIDENCE_WINDOW_LIMIT,
  } = {}
) {
  if (!userId) throw new Error("Recovery evidence query requires userId.");
  if (!window?.startDate || !window?.endDate) {
    throw new Error("Recovery evidence query requires a bounded window.");
  }
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > RECOVERY_EVIDENCE_WINDOW_LIMIT
  ) {
    throw new Error(`Recovery evidence query limit cannot exceed ${RECOVERY_EVIDENCE_WINDOW_LIMIT}.`);
  }
  const metricSet = metrics ? new Set(metrics) : null;
  const unique = new Map();
  canonicalEvidenceObjects
    .filter((item) =>
      item.userId === userId &&
      item.evidence_type === "recovery" &&
      item.payload?.evidenceDate >= window.startDate &&
      item.payload?.evidenceDate <= window.endDate &&
      (!metricSet || metricSet.has(item.payload.metric)) &&
      item.payload.status !== "invalid" &&
      (includeSuperseded ||
        (item.payload.status !== "superseded" &&
          !item.payload.supersededByEvidenceId))
    )
    .forEach((item) => unique.set(item.canonicalId, item.payload));
  return [...unique.values()]
    .sort((left, right) =>
      `${left.evidenceDate}|${left.metric}|${left.source.kind}|${left.id}`
        .localeCompare(
          `${right.evidenceDate}|${right.metric}|${right.source.kind}|${right.id}`
        )
    )
    .slice(0, limit)
    .map((item) => structuredClone(item));
}

function validateCompatibleRecoveryLineage(prior, record) {
  if (!prior || prior.evidence_type !== "recovery") {
    throw new Error("Recovery evidence correction target was not found.");
  }
  if (prior.userId !== record.userId) {
    throw new Error("Recovery evidence correction cannot cross users.");
  }
  if (
    prior.payload.metric !== record.metric ||
    prior.payload.scope?.region !== record.scope?.region
  ) {
    throw new Error("Recovery evidence correction metric scope must match.");
  }
  if (prior.payload.supersededByEvidenceId) {
    throw new Error("Recovery evidence correction target is already superseded.");
  }
}
