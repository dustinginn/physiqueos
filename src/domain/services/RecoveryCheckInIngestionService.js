import {
  createCanonicalRecoveryEvidenceObject,
  createRecoveryEvidenceRecord,
} from "../models/RecoveryEvidenceModel";
import { createDailyCheckIn } from "../models/dailyCheckIn";

export const RECOVERY_CHECK_IN_INGESTION_VERSION =
  "recovery_check_in_ingestion_v1";

export function createRecoveryCheckInIngestionService({ unitOfWork }) {
  if (!unitOfWork?.begin) {
    throw new Error("Recovery check-in ingestion requires an atomic unit of work.");
  }
  return {
    async save(input = {}) {
      const normalized = normalizeInput(input);
      if (!normalized.metrics.length) {
        return Object.freeze({
          status: "omitted",
          checkInId: null,
          evidenceIds: [],
        });
      }
      const transaction = unitOfWork.begin();
      let result;
      await transaction.mutate((staged) => {
        const checkIns = staged.dailyCheckIns ?? (staged.dailyCheckIns = []);
        const canonical =
          staged.canonicalEvidenceObjects ??
          (staged.canonicalEvidenceObjects = []);
        const checkInId =
          normalized.checkInId ??
          `daily_check_in_${normalized.date.replaceAll("-", "_")}`;
        const checkInIndex = checkIns.findIndex(
          (item) =>
            item.userId === normalized.userId &&
            item.date === normalized.date
        );
        const existingCheckIn = checkInIndex >= 0
          ? checkIns[checkInIndex]
          : null;
        const evidenceIds = [];
        const created = [];
        for (const metricInput of normalized.metrics) {
          const active = currentMetricRecord(
            canonical,
            normalized.userId,
            normalized.date,
            metricInput.metric
          );
          if (
            active &&
            active.value === metricInput.value &&
            active.unit === metricInput.unit
          ) {
            evidenceIds.push(active.id);
            continue;
          }
          const version = nextVersion(canonical, checkInId, metricInput.metric);
          const sourceRecordId =
            `${checkInId}:${metricInput.metric}:v${version}`;
          const record = createRecoveryEvidenceRecord({
            userId: normalized.userId,
            metric: metricInput.metric,
            value: metricInput.value,
            unit: metricInput.unit,
            evidenceDate: normalized.date,
            recordedAt: normalized.recordedAt,
            timezone: normalized.timezone,
            source: {
              kind: "manual_check_in",
              name: "Morning Check-In",
              ingestionPath: "morning_check_in_recovery",
              recordedAt: normalized.recordedAt,
              confidence: "normal",
            },
            sourceRecordId,
            sourceEvidenceIds: [checkInId],
            confidence: {
              level: "normal",
              basis: "explicit_structured_input",
            },
            ...(active
              ? {
                  correctsEvidenceId: active.id,
                  supersedesEvidenceId: active.id,
                }
              : {}),
            createdAt: normalized.recordedAt,
            updatedAt: normalized.recordedAt,
          });
          if (active) supersede(canonical, active.id, record);
          canonical.push(createCanonicalRecoveryEvidenceObject(record));
          evidenceIds.push(record.id);
          created.push(record.id);
        }
        const compatibility = Object.fromEntries(
          normalized.metrics.map((item) => [
            item.metric,
            item.value,
          ])
        );
        const checkIn = createDailyCheckIn({
          ...existingCheckIn,
          id: checkInId,
          userId: normalized.userId,
          date: normalized.date,
          recovery: {
            ...(existingCheckIn?.recovery ?? {}),
            sleepHours: compatibility.sleep_duration ??
              existingCheckIn?.recovery?.sleepHours ??
              null,
            subjectiveRecovery: compatibility.subjective_recovery ??
              existingCheckIn?.recovery?.subjectiveRecovery ??
              null,
            soreness: compatibility.soreness ??
              existingCheckIn?.recovery?.soreness ??
              null,
            canonicalEvidenceIds: unique([
              ...(existingCheckIn?.recovery?.canonicalEvidenceIds ?? []),
              ...evidenceIds,
            ]),
            sourceOfTruth: "canonical_recovery_evidence",
          },
          source: existingCheckIn?.source ?? {
            type: "manual",
            name: "Morning Check-In",
            confidence: "high",
          },
          createdAt: existingCheckIn?.createdAt || normalized.recordedAt,
          updatedAt: normalized.recordedAt,
        });
        if (checkInIndex >= 0) checkIns[checkInIndex] = checkIn;
        else checkIns.push(checkIn);
        result = {
          status: created.length ? "saved" : "unchanged",
          checkInId,
          evidenceIds: unique(evidenceIds),
          createdEvidenceIds: unique(created),
        };
      });
      await transaction.commit({
        validate(staged) {
          return (
            Array.isArray(staged.dailyCheckIns) &&
            Array.isArray(staged.canonicalEvidenceObjects)
          );
        },
      });
      return Object.freeze(result);
    },
  };
}

function normalizeInput(input) {
  const userId = required(input.userId, "userId");
  const date = requiredDate(input.date);
  const recordedAt = requiredTimestamp(input.recordedAt);
  const timezone = required(input.timezone, "timezone");
  const metrics = [
    input.sleepDuration == null || input.sleepDuration === ""
      ? null
      : {
          metric: "sleep_duration",
          value: Number(input.sleepDuration),
          unit: "hours",
        },
    input.subjectiveRecovery
      ? {
          metric: "subjective_recovery",
          value: input.subjectiveRecovery,
          unit: "category",
        }
      : null,
    input.soreness
      ? {
          metric: "soreness",
          value: input.soreness,
          unit: "category",
        }
      : null,
  ].filter(Boolean);
  return {
    userId,
    date,
    recordedAt,
    timezone,
    checkInId: input.checkInId ?? null,
    metrics,
  };
}

function currentMetricRecord(objects, userId, date, metric) {
  return objects
    .filter((item) =>
      item.userId === userId &&
      item.evidence_type === "recovery" &&
      item.payload?.evidenceDate === date &&
      item.payload?.metric === metric &&
      item.payload?.status !== "superseded" &&
      !item.payload?.supersededByEvidenceId
    )
    .map((item) => item.payload)
    .sort((left, right) => left.id.localeCompare(right.id))
    .at(-1) ?? null;
}

function nextVersion(objects, checkInId, metric) {
  const prefix = `${checkInId}:${metric}:v`;
  return objects.reduce((highest, item) => {
    const sourceId = item.payload?.sourceRecordId ?? "";
    return sourceId.startsWith(prefix)
      ? Math.max(highest, Number(sourceId.slice(prefix.length)) || 0)
      : highest;
  }, 0) + 1;
}

function supersede(objects, evidenceId, replacement) {
  const index = objects.findIndex((item) => item.canonicalId === evidenceId);
  if (index < 0) throw new Error("Recovery correction target is unavailable.");
  objects[index] = {
    ...objects[index],
    payload: {
      ...objects[index].payload,
      status: "superseded",
      supersededByEvidenceId: replacement.id,
      updatedAt: replacement.updatedAt,
    },
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}
function required(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}
function requiredDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("date must use YYYY-MM-DD.");
  }
  return value;
}
function requiredTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("recordedAt must be an ISO timestamp.");
  }
  return value;
}
