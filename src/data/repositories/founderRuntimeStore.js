import fs from "node:fs";
import path from "node:path";
import { founderSeedPack } from "../founderSeed";
import { createCanonicalMorningWeightEvidenceObject } from "../../domain/models/morningWeightEvidence";
import {
  normalizeProgressPhotoPose,
  normalizeProgressPhotoView,
} from "../../domain/models/progressPhotoPoseVocabulary";
import { normalizeDailyBriefingRecords } from "./DailyBriefingHistory";

const STORE_KEY = "__PHYSIQUEOS_FOUNDER_RUNTIME_STORE__";
const STORE_WRITE_ATTEMPTS = 6;
const STORE_WRITE_BACKOFF_MS = 35;
const PERSISTED_COLLECTIONS = [
  "weightEntries",
  "user",
  "goals",
  "nutritionContext",
  "operatingPlan",
  "dexaScans",
  "progressPhotos",
  "protocols",
  "protocolVersions",
  "energyStrategyLinks",
  "executionItems",
  "reminders",
  "dailyCheckIns",
  "dailyBriefings",
  "analyses",
  "evidencePackages",
  "canonicalEvidenceObjects",
  "evidenceReviews",
];
const APPEND_ONLY_COLLECTIONS = [
  "evidencePackages",
  "canonicalEvidenceObjects",
  "progressPhotos",
  "dexaScans",
  "protocolVersions",
];
const AUTHORITATIVE_FOUNDER_WEIGHT_DATES = new Set([
  "2026-05-21",
  "2026-05-29",
  "2026-06-05",
  "2026-06-12",
  "2026-06-13",
  "2026-06-14",
  "2026-06-15",
  "2026-06-16",
  "2026-06-17",
  "2026-06-18",
  "2026-06-19",
  "2026-06-20",
  "2026-06-21",
  "2026-06-22",
  "2026-06-23",
  "2026-06-24",
  "2026-06-26",
  "2026-06-28",
  "2026-07-01",
  "2026-07-02",
  "2026-07-03",
]);
let storeWriteCounter = 0;
let lastRuntimeStoreReadMtimeMs = null;

export function createFounderRuntimeStore(persisted = readPersistedRuntimeStore()) {

  return normalizeFounderRuntimeStore({
    version: founderSeedPack.version,
    updatedAt: persisted.updatedAt ?? founderSeedPack.importedAt,
    importedAt: founderSeedPack.importedAt,
    user: persisted.user ?? founderSeedPack.user,
    goals: mergeSeedWithPersisted(founderSeedPack.goals, persisted.goals, {
      fillMissingSeedFields: true,
    }),
    weightEntries: mergeSeedWithPersisted(
      founderSeedPack.weightEntries,
      persisted.weightEntries,
      { seedWinsIds: getAuthoritativeFounderWeightIds() }
    ),
    dexaScans: mergeSeedWithPersisted(founderSeedPack.dexaScans, persisted.dexaScans),
    protocols: mergeSeedWithPersisted(founderSeedPack.protocols, persisted.protocols),
    protocolVersions: mergeSeedWithPersisted(
      founderSeedPack.protocolVersions,
      persisted.protocolVersions
    ),
    energyStrategyLinks: mergeSeedWithPersisted(founderSeedPack.energyStrategyLinks, persisted.energyStrategyLinks),
    executionItems: mergeSeedWithPersisted(founderSeedPack.executionItems, persisted.executionItems),
    reminders: mergeSeedWithPersisted(founderSeedPack.reminders, persisted.reminders),
    nutritionContext: persisted.nutritionContext ?? founderSeedPack.nutritionContext,
    operatingPlan: persisted.operatingPlan ?? founderSeedPack.operatingPlan,
    operatingRhythm: founderSeedPack.operatingRhythm,
    adaptiveTrustProfile: founderSeedPack.adaptiveTrustProfile,
    milestones: [...founderSeedPack.milestones],
    progressPhotos: mergeSeedWithPersisted(
      founderSeedPack.progressPhotos,
      persisted.progressPhotos,
      { seedWinsExistingIds: true }
    ),
    dailyCheckIns: mergeSeedWithPersisted(
      founderSeedPack.dailyCheckIns,
      persisted.dailyCheckIns
    ),
    dailyBriefings: mergeSeedWithPersisted(
      founderSeedPack.dailyBriefings,
      persisted.dailyBriefings
    ),
    analyses: mergeSeedWithPersisted(founderSeedPack.analyses, persisted.analyses),
    evidencePackages: mergeSeedWithPersisted([], persisted.evidencePackages),
    evidenceReviews: mergeSeedWithPersisted([], persisted.evidenceReviews),
    canonicalEvidenceObjects: mergeSeedWithPersisted(
      [],
      persisted.canonicalEvidenceObjects
    ),
  });
}

export function getFounderRuntimeStore() {
  if (!globalThis[STORE_KEY]) {
    globalThis[STORE_KEY] = createFounderRuntimeStore();
  } else {
    refreshFounderRuntimeStoreFromDisk(globalThis[STORE_KEY]);
  }

  return globalThis[STORE_KEY];
}

export function persistFounderRuntimeStore(store = getFounderRuntimeStore(), options = {}) {
  if (typeof window !== "undefined") return;

  const filePath = options.filePath ?? getRuntimeStorePath();
  const tempPath = createRuntimeStoreTempPath(filePath);
  const latestPersisted = readPersistedRuntimeStore(filePath);
  const incomingPayload = PERSISTED_COLLECTIONS.reduce(
    (snapshot, collection) => ({
      ...snapshot,
      [collection]: store[collection],
    }),
    {
      version: store.version,
      updatedAt: new Date().toISOString(),
    }
  );
  if (options.mutatedCollection) {
    for (const collection of PERSISTED_COLLECTIONS) {
      if (collection !== options.mutatedCollection && Object.prototype.hasOwnProperty.call(latestPersisted, collection)) incomingPayload[collection] = latestPersisted[collection];
    }
  }
  // Hydration may normalize legacy briefing history for safe reads. Until an
  // explicit briefing mutation occurs, unrelated writes must retain the exact
  // persisted briefing payload instead of implicitly promoting that read model.
  if (options.mutatedCollection !== "dailyBriefings" && Array.isArray(latestPersisted.dailyBriefings)) {
    incomingPayload.dailyBriefings = latestPersisted.dailyBriefings;
  }
  const payload = mergeRuntimeStoreForPersistence({
    incoming: incomingPayload,
    persisted: latestPersisted,
  });
  const writeReason = getRuntimeStoreWriteReason(options.reason);

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    cleanupRuntimeStoreTempFile(`${filePath}.tmp`);
    logRuntimeStorePersistCounts({
      after: payload,
      before: latestPersisted,
      reason: writeReason,
    });
    fs.writeFileSync(tempPath, `${JSON.stringify(payload)}\n`);
    replaceRuntimeStoreFile({ filePath, tempPath });
    mergeRuntimeStoreInPlace(store, normalizeFounderRuntimeStore(payload));
  } catch (error) {
    warnRuntimeStorePersistenceFailure(error);
    cleanupRuntimeStoreTempFile(tempPath);
  }
}

export function mergeRuntimeStoreForPersistence({ incoming = {}, persisted = {} } = {}) {
  const merged = {
    ...incoming,
    updatedAt: incoming.updatedAt ?? new Date().toISOString(),
  };

  APPEND_ONLY_COLLECTIONS.forEach((collection) => {
    merged[collection] = mergeAppendOnlyCollection({
      collection,
      incomingRecords: incoming[collection],
      persistedRecords: persisted[collection],
    });
  });

  if (
    Array.isArray(persisted.evidencePackages) &&
    merged.evidencePackages.length < persisted.evidencePackages.length
  ) {
    console.warn(
      `[FounderRuntimeStore] Protected evidencePackages from shrinking ${persisted.evidencePackages.length} -> ${merged.evidencePackages.length}.`
    );
    merged.evidencePackages = mergeAppendOnlyCollection({
      collection: "evidencePackages",
      incomingRecords: persisted.evidencePackages,
      persistedRecords: merged.evidencePackages,
    });
  }

  return merged;
}

function refreshFounderRuntimeStoreFromDisk(store) {
  const filePath = getRuntimeStorePath();
  try {
    const mtimeMs = fs.statSync(filePath).mtimeMs;
    if (lastRuntimeStoreReadMtimeMs === mtimeMs) return;
  } catch {
    return;
  }
  const persisted = readPersistedRuntimeStore();

  if (!persisted.updatedAt) return;
  if (
    store.updatedAt &&
    String(store.updatedAt).localeCompare(String(persisted.updatedAt)) >= 0
  ) {
    return;
  }

  mergeRuntimeStoreInPlace(store, createFounderRuntimeStore(persisted));
}

function readPersistedRuntimeStore(filePath = getRuntimeStorePath()) {
  if (typeof window !== "undefined") return {};

  if (!fs.existsSync(filePath)) return {};

  try {
    lastRuntimeStoreReadMtimeMs = fs.statSync(filePath).mtimeMs;
    const persisted = JSON.parse(fs.readFileSync(filePath, "utf8"));

    return persisted.version === founderSeedPack.version ? persisted : {};
  } catch {
    return {};
  }
}

function mergeAppendOnlyCollection({
  collection,
  incomingRecords,
  persistedRecords,
}) {
  const recordsById = new Map();

  normalizeRecords(persistedRecords).forEach((record, index) => {
    recordsById.set(getAppendOnlyRecordId(record, collection, index), record);
  });
  normalizeRecords(incomingRecords).forEach((record, index) => {
    recordsById.set(getAppendOnlyRecordId(record, collection, index), record);
  });

  return [...recordsById.values()];
}

function normalizeRecords(records) {
  return Array.isArray(records) ? records : [];
}

function getAppendOnlyRecordId(record, collection, index) {
  const id =
    record?.package_id ??
    record?.canonicalId ??
    record?.canonical_id ??
    record?.id ??
    record?.scanId ??
    record?.photoId;

  if (id) return String(id);

  if (collection === "dexaScans") {
    const identity = [
      record?.provider,
      record?.measuredAt ?? record?.date,
      record?.totalMass,
      record?.bodyFatPercentage,
    ]
      .filter(Boolean)
      .join("|");

    if (identity) return identity;
  }

  return `${collection}:unkeyed:${index}`;
}

function logRuntimeStorePersistCounts({ after, before, reason }) {
  const beforeCounts = getRuntimeStoreCounts(before);
  const afterCounts = getRuntimeStoreCounts(after);

  console.info(
    "[FounderRuntimeStore] Persisting runtime store.",
    JSON.stringify({
      reason,
      before: beforeCounts,
      after: afterCounts,
    })
  );
}

function getRuntimeStoreCounts(store = {}) {
  const canonicalObjects = normalizeRecords(store.canonicalEvidenceObjects);

  return {
    evidencePackages: normalizeRecords(store.evidencePackages).length,
    canonicalEvidenceObjects: canonicalObjects.length,
    trainingSessions: canonicalObjects.filter(isActiveCanonicalTrainingObject).length,
    progressPhotos: normalizeRecords(store.progressPhotos).length,
    nutritionRecords: canonicalObjects.filter(isCanonicalNutritionObject).length,
  };
}

function isActiveCanonicalTrainingObject(object = {}) {
  return (
    getCanonicalEvidenceType(object) === "training" &&
    object.quality?.status !== "superseded" &&
    object.status !== "superseded" &&
    object.payload?.status !== "superseded"
  );
}

function isCanonicalNutritionObject(object = {}) {
  return getCanonicalEvidenceType(object) === "nutrition";
}

function getCanonicalEvidenceType(object = {}) {
  return (
    object.evidence_type ??
    object.object_type ??
    object.type ??
    object.payload?.evidence_type ??
    object.payload?.schema_type ??
    object.payload?.type ??
    ""
  );
}

function getRuntimeStoreWriteReason(reason) {
  if (reason) return reason;

  const stack = new Error().stack ?? "";
  const caller = stack
    .split("\n")
    .map((line) => line.trim())
    .find(
      (line) =>
        line &&
        line !== "Error" &&
        line !== "Error:" &&
        !line.includes("getRuntimeStoreWriteReason") &&
        !line.includes("persistFounderRuntimeStore")
    );

  return caller ?? "repository onChange";
}

function mergeSeedWithPersisted(seedRecords = [], persistedRecords, options = {}) {
  if (!Array.isArray(persistedRecords)) return [...seedRecords];

  const recordsById = new Map(
    seedRecords.map((record, index) => [getMergeRecordId(record, index), record])
  );

  persistedRecords.forEach((record, index) => {
    const id = getMergeRecordId(record, seedRecords.length + index);

    if (
      (options.seedWinsExistingIds || options.seedWinsIds?.has(id)) &&
      recordsById.has(id)
    ) {
      return;
    }

    if (options.fillMissingSeedFields && recordsById.has(id)) {
      const seedRecord = recordsById.get(id);
      recordsById.set(
        id,
        Object.fromEntries(
          [...new Set([...Object.keys(seedRecord ?? {}), ...Object.keys(record ?? {})])]
            .map((key) => [
              key,
              record?.[key] === null || record?.[key] === undefined || record?.[key] === ""
                ? seedRecord?.[key]
                : record[key],
            ])
        )
      );
      return;
    }

    recordsById.set(id, record);
  });

  return [...recordsById.values()];
}

function getMergeRecordId(record, index) {
  return (
    record?.id ??
    record?.package_id ??
    record?.canonicalId ??
    record?.canonical_id ??
    record?.scanId ??
    record?.photoId ??
    `unkeyed:${index}`
  );
}

function normalizeFounderRuntimeStore(store) {
  const weightEntries = normalizeFounderWeightEntries(
    normalizeAuthoritativeRecords(
      store.weightEntries,
      (entry) => `${entry.userId}:${getDateKey(entry.measuredAt)}`,
      "correctionHistory"
    )
  );
  const dailyCheckIns = store.dailyCheckIns ?? [];
  const canonicalEvidenceObjects = backfillCanonicalMorningWeights({
    canonicalEvidenceObjects: (store.canonicalEvidenceObjects ?? []).map(
      normalizeCanonicalPhotoEvidenceObject
    ),
    dailyCheckIns,
    weightEntries,
  });

  return {
    ...store,
    goals: mergeSeedWithPersisted(founderSeedPack.goals, store.goals, {
      fillMissingSeedFields: true,
    }),
    weightEntries,
    analyses: normalizeAuthoritativeRecords(
      store.analyses,
      (analysis) =>
        `${normalizeList(analysis.evidenceTypes).join("|")}:${normalizeList(
          analysis.evidenceIds
        ).join("|")}`,
      "replacedAnalysisHistory"
    ),
    dailyBriefings: normalizeDailyBriefingRecords(store.dailyBriefings),
    evidencePackages: store.evidencePackages ?? [],
    protocolVersions: store.protocolVersions ?? [],
    energyStrategyLinks: store.energyStrategyLinks ?? [],
    executionItems: store.executionItems ?? [],
    progressPhotos: (store.progressPhotos ?? []).map(normalizeFounderProgressPhoto),
    canonicalEvidenceObjects,
    operatingPlan: normalizeFounderOperatingPlan(store.operatingPlan),
    reminders: normalizeFounderReminders(store.reminders ?? []),
  };
}

function backfillCanonicalMorningWeights({
  canonicalEvidenceObjects = [],
  dailyCheckIns = [],
  weightEntries = [],
}) {
  const canonicalById = new Map(
    canonicalEvidenceObjects.map((object) => [object.canonicalId, object])
  );

  weightEntries.forEach((weightEntry) => {
    const date = getDateKey(weightEntry.measuredAt);
    const canonicalId = `morning_weight|${weightEntry.userId}|${date}`;

    if (!date) return;

    const dailyCheckIn = dailyCheckIns.find(
      (checkIn) =>
        checkIn.userId === weightEntry.userId &&
        checkIn.date === date &&
        checkIn.weightEntryId === weightEntry.id
    );
    const canonicalWeight = createCanonicalMorningWeightEvidenceObject({
      createdAt: weightEntry.createdAt ?? weightEntry.updatedAt,
      dailyCheckIn,
      userId: weightEntry.userId,
      weightEntry,
    });

    if (!canonicalWeight) return;

    if (
      !canonicalById.has(canonicalId) ||
      AUTHORITATIVE_FOUNDER_WEIGHT_DATES.has(date)
    ) {
      canonicalById.set(canonicalWeight.canonicalId, canonicalWeight);
    }
  });

  return [...canonicalById.values()];
}

function normalizeFounderWeightEntries(weightEntries = []) {
  const entriesByDate = new Map(
    weightEntries.map((entry) => [
      `${entry.userId}:${getDateKey(entry.measuredAt)}`,
      entry,
    ])
  );

  founderSeedPack.weightEntries.forEach((entry) => {
    const date = getDateKey(entry.measuredAt);

    if (!AUTHORITATIVE_FOUNDER_WEIGHT_DATES.has(date)) return;

    entriesByDate.set(`${entry.userId}:${date}`, entry);
  });

  return [...entriesByDate.values()].sort((left, right) =>
    String(left.measuredAt ?? "").localeCompare(String(right.measuredAt ?? ""))
  );
}

function getAuthoritativeFounderWeightIds() {
  return new Set(
    [...AUTHORITATIVE_FOUNDER_WEIGHT_DATES].map(
      (date) => `weight_${date.replaceAll("-", "_")}`
    )
  );
}

function mergeRuntimeStoreInPlace(target, source) {
  Object.entries(source).forEach(([key, value]) => {
    const existingValue = target[key];

    if (Array.isArray(existingValue) && Array.isArray(value)) {
      existingValue.splice(0, existingValue.length, ...value);
      return;
    }

    if (isPlainObject(existingValue) && isPlainObject(value)) {
      Object.keys(existingValue).forEach((existingKey) => {
        if (!(existingKey in value)) delete existingValue[existingKey];
      });
      Object.assign(existingValue, value);
      return;
    }

    target[key] = value;
  });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeFounderProgressPhoto(photo = {}) {
  const inferred = inferKnownFounderPhotoCategory(photo);
  const view = inferred.view ?? normalizeProgressPhotoView(photo.view);

  return {
    ...photo,
    pose: inferred.pose ?? normalizeProgressPhotoPose(photo.pose, view),
    view,
  };
}

function normalizeCanonicalPhotoEvidenceObject(object = {}) {
  const payload = object.payload ?? object;

  if (payload.evidence_type !== "photo_session") return object;

  const normalizedPayload = {
    ...payload,
    photos: (payload.photos ?? []).map((photo) => {
      const inferred = inferKnownFounderPhotoCategory({
        imagePath: photo.storage_path,
        pose: photo.pose,
        view: photo.view,
      });
      const view = inferred.view ?? normalizeProgressPhotoView(photo.view);

      return {
        ...photo,
        pose: inferred.pose ?? normalizeProgressPhotoPose(photo.pose, view),
        view,
      };
    }),
  };

  return object.payload
    ? {
        ...object,
        payload: normalizedPayload,
      }
    : normalizedPayload;
}

function inferKnownFounderPhotoCategory(photo = {}) {
  const pathKey = String(photo.imagePath ?? photo.storage_path ?? "");

  if (pathKey.includes("IMG_1343")) return { pose: "flexed", view: "back" };
  if (pathKey.includes("IMG_1342")) return { pose: "relaxed", view: "back" };

  return {};
}

function normalizeAuthoritativeRecords(records = [], getKey, auditField) {
  const recordsByKey = new Map();

  records.forEach((record, index) => {
    const key = getKey(record);
    const safeKey =
      !key || key.includes("undefined") || key.endsWith(":")
        ? `unkeyed:${index}`
        : key;

    const existing = recordsByKey.get(safeKey);

    if (!existing) {
      recordsByKey.set(safeKey, record);
      return;
    }

    const winner = isNewerRecord(record, existing) ? record : existing;
    const replaced = winner === record ? existing : record;

    recordsByKey.set(safeKey, {
      ...winner,
      [auditField]: [
        ...(winner[auditField] ?? []),
        {
          replacedAt: winner.updatedAt ?? winner.createdAt ?? winner.generatedAt ?? null,
          previousEntry: replaced,
          reason: "Runtime store authoritative occurrence normalization.",
        },
      ],
    });
  });

  return [...recordsByKey.values()];
}

function isNewerRecord(left, right) {
  return getSortTimestamp(left).localeCompare(getSortTimestamp(right)) >= 0;
}

function getSortTimestamp(record) {
  return String(record.updatedAt ?? record.generatedAt ?? record.createdAt ?? "");
}

function normalizeList(value) {
  return [...(Array.isArray(value) ? value : [])].sort();
}

function getDateKey(value) {
  return String(value ?? "").slice(0, 10);
}

function normalizeFounderOperatingPlan(operatingPlan) {
  if (!operatingPlan?.evidenceProtocols?.progressPhotos) return operatingPlan;

  return {
    ...operatingPlan,
    evidenceProtocols: {
      ...operatingPlan.evidenceProtocols,
      progressPhotos: operatingPlan.evidenceProtocols.progressPhotos.map((protocol) => {
        if (/weekly progress photo set/i.test(protocol.title)) {
          return {
            ...protocol,
            title: "Weekly Progress Photo Set",
            dayOfWeek: "saturday",
            timeOfDay: "afternoon",
            expectedViews: ["front-relaxed", "back-relaxed", "back-flexed"],
          };
        }

        if (/front progress photos?|rear progress photos?/i.test(protocol.title)) {
          return {
            ...protocol,
            active: false,
            dayOfWeek: "saturday",
            timeOfDay: "afternoon",
          };
        }

        return protocol;
      }),
    },
  };
}

function normalizeFounderReminders(reminders = []) {
  const normalized = reminders.map(normalizeFounderReminder);
  const hasGroupedPhotoReminder = normalized.some(
    (reminder) => reminder.id === "reminder_weekly_progress_photo_set"
  );

  if (!hasGroupedPhotoReminder) return normalized;

  return normalized.filter(
    (reminder) =>
      reminder.id !== "reminder_front_progress_photos" &&
      reminder.id !== "reminder_rear_progress_photos"
  );
}

function normalizeFounderReminder(reminder) {
  if (reminder.id === "reminder_weekly_progress_photo_set") {
    return normalizeFounderPhotoReminder(reminder, {
      expectedViews: ["front-relaxed", "back-relaxed", "back-flexed"],
      linkedEntityType: "progress_photo_set",
      title: "Weekly Progress Photo Set",
    });
  }

  if (reminder.id === "reminder_front_progress_photos") {
    return normalizeFounderPhotoReminder(reminder, {
      expectedViews: ["front-relaxed"],
      title: "Front Progress Photo",
    });
  }

  if (reminder.id === "reminder_rear_progress_photos") {
    return normalizeFounderPhotoReminder(reminder, {
      expectedViews: ["back-relaxed"],
      title: "Rear Progress Photo",
    });
  }

  return reminder;
}

function normalizeFounderPhotoReminder(reminder, { expectedViews, linkedEntityType, title }) {
  return {
    ...reminder,
    title,
    linkedEntityType: linkedEntityType ?? reminder.linkedEntityType,
    schedule: {
      ...reminder.schedule,
      preferredDay: "saturday",
      daysOfWeek: ["saturday"],
      timeOfDay: "afternoon",
    },
    defaultContext: {
      ...reminder.defaultContext,
      morning: false,
    },
    expectedViews,
  };
}

function getRuntimeStorePath() {
  return path.join(process.cwd(), "private", "founder", "runtime-store.json");
}

function createRuntimeStoreTempPath(filePath) {
  storeWriteCounter += 1;

  return `${filePath}.${process.pid}.${Date.now()}.${storeWriteCounter}.tmp`;
}

function replaceRuntimeStoreFile({ filePath, tempPath }) {
  let lastError = null;

  for (let attempt = 1; attempt <= STORE_WRITE_ATTEMPTS; attempt += 1) {
    try {
      fs.renameSync(tempPath, filePath);
      return;
    } catch (error) {
      lastError = error;

      if (!isRetriablePersistenceError(error) || attempt === STORE_WRITE_ATTEMPTS) {
        break;
      }

      console.warn(
        `[FounderRuntimeStore] Retry ${attempt}/${STORE_WRITE_ATTEMPTS} after ${error.code} while replacing runtime-store.json.`
      );
      sleepSync(STORE_WRITE_BACKOFF_MS * attempt);
    }
  }

  try {
    fs.copyFileSync(tempPath, filePath);
    cleanupRuntimeStoreTempFile(tempPath);
    console.warn(
      "[FounderRuntimeStore] Runtime store persisted with copy fallback after rename failed."
    );
    return;
  } catch (copyError) {
    cleanupRuntimeStoreTempFile(tempPath);
    throw copyError?.code ? copyError : lastError;
  }
}

function isRetriablePersistenceError(error) {
  return ["EBUSY", "EACCES", "EPERM"].includes(error?.code);
}

function cleanupRuntimeStoreTempFile(tempPath) {
  try {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  } catch (error) {
    console.warn(
      `[FounderRuntimeStore] Could not remove temp runtime store file: ${error.message}`
    );
  }
}

function warnRuntimeStorePersistenceFailure(error) {
  console.warn(
    `[FounderRuntimeStore] Runtime store persistence failed without crashing the app: ${error.message}`
  );
}

function sleepSync(milliseconds) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);

  Atomics.wait(view, 0, 0, milliseconds);
}
