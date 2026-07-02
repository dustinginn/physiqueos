import fs from "node:fs";
import path from "node:path";
import { founderSeedPack } from "../founderSeed";

const STORE_KEY = "__PHYSIQUEOS_FOUNDER_RUNTIME_STORE__";
const PERSISTED_COLLECTIONS = [
  "weightEntries",
  "user",
  "goals",
  "nutritionContext",
  "operatingPlan",
  "dexaScans",
  "progressPhotos",
  "protocols",
  "reminders",
  "dailyCheckIns",
  "dailyBriefings",
  "analyses",
];

function createFounderRuntimeStore() {
  const persisted = readPersistedRuntimeStore();

  return {
    version: founderSeedPack.version,
    importedAt: founderSeedPack.importedAt,
    user: persisted.user ?? founderSeedPack.user,
    goals: mergeSeedWithPersisted(founderSeedPack.goals, persisted.goals),
    weightEntries: mergeSeedWithPersisted(
      founderSeedPack.weightEntries,
      persisted.weightEntries
    ),
    dexaScans: mergeSeedWithPersisted(founderSeedPack.dexaScans, persisted.dexaScans),
    protocols: mergeSeedWithPersisted(founderSeedPack.protocols, persisted.protocols),
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
  };
}

export function getFounderRuntimeStore() {
  globalThis[STORE_KEY] ??= createFounderRuntimeStore();

  return globalThis[STORE_KEY];
}

export function persistFounderRuntimeStore(store = getFounderRuntimeStore()) {
  if (typeof window !== "undefined") return;

  const filePath = getRuntimeStorePath();
  const payload = PERSISTED_COLLECTIONS.reduce(
    (snapshot, collection) => ({
      ...snapshot,
      [collection]: store[collection],
    }),
    {
      version: store.version,
      updatedAt: new Date().toISOString(),
    }
  );

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(`${filePath}.tmp`, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(`${filePath}.tmp`, filePath);
}

function readPersistedRuntimeStore() {
  if (typeof window !== "undefined") return {};

  const filePath = getRuntimeStorePath();

  if (!fs.existsSync(filePath)) return {};

  try {
    const persisted = JSON.parse(fs.readFileSync(filePath, "utf8"));

    return persisted.version === founderSeedPack.version ? persisted : {};
  } catch {
    return {};
  }
}

function mergeSeedWithPersisted(seedRecords = [], persistedRecords, options = {}) {
  if (!Array.isArray(persistedRecords)) return [...seedRecords];

  const recordsById = new Map(seedRecords.map((record) => [record.id, record]));

  persistedRecords.forEach((record) => {
    if (options.seedWinsExistingIds && recordsById.has(record.id)) return;

    recordsById.set(record.id, record);
  });

  return [...recordsById.values()];
}

function getRuntimeStorePath() {
  return path.join(process.cwd(), "private", "founder", "runtime-store.json");
}
