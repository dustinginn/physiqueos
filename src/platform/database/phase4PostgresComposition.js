import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import { registerRuntimeTrainingExercises } from "../../domain/models/trainingExerciseIdentity.js";
import { createPhase3ReadModelService } from "../../application/read-models/Phase3ReadModelService.js";
import { createLegacyFounderReadLoaders } from "../../application/read-models/LegacyFounderReadLoaders.js";
import { createPhase3CommandService } from "../../application/commands/Phase3CommandService.js";
import {
  CANONICAL_PERSISTENCE_PORT_NAMES,
  createCanonicalPersistenceCommandPorts,
} from "../../application/commands/CanonicalPersistenceCommandPorts.js";
import { createAuthorizedMediaService } from "../../application/media/AuthorizedMediaService.js";
import { createLocalPrivateMediaAdapter } from "../object-storage/LocalPrivateMediaAdapter.js";
import { createPhase4MediaCatalog } from "../migration/phase4LocalMediaMigration.js";
import { loadCanonicalRuntime } from "../migration/phase4CanonicalImport.js";
import { createFoundationPostgresAdapters } from "./foundationPostgresComposition.js";
import { createPhase4CanonicalRecordStore } from "./Phase4CanonicalRecordStore.js";
import { createPostgresTransactionRunner } from "./transaction.js";

export async function createPhase4PostgresApplicationComposition({
  pool,
  ownerUserId,
  now = () => new Date(),
  objectRoot = null,
  issueAccessHandle = null,
} = {}) {
  if (!pool?.query || !pool?.connect) throw new Error("Phase 4 composition requires a PostgreSQL pool.");
  const query = (text, values) => pool.query(text, values);
  const runtime = await loadCanonicalRuntime({ query, ownerUserId });
  registerRuntimeTrainingExercises(runtime.canonicalExerciseLibrary ?? []);
  const repositories = createSeedRepositories(runtime);
  const loaders = createLegacyFounderReadLoaders({ repositories, readRuntimeStore: () => runtime, now });
  const readModels = createPhase3ReadModelService({
    loaders,
    now,
    readResourceVersion: ({ data }) => String(data?.version ?? runtime.revision ?? "1"),
  });
  const transactionRunner = createPhase4TransactionRunner({ pool });
  const ports = createTransactionBoundPorts({ now });
  const commands = createPhase3CommandService({ transactionRunner, ports });
  const media = objectRoot && issueAccessHandle
    ? createAuthorizedMediaService({
        catalog: createPhase4MediaCatalog({ query }),
        delivery: createLocalPrivateMediaAdapter({ privateRoot: objectRoot, issueAccessHandle }),
        clock: now,
      })
    : null;
  return Object.freeze({
    kind: "phase4-postgres-rehearsal",
    ownerUserId,
    repositories,
    readModels,
    commands,
    media,
    runtime,
  });
}

export function createPhase4TransactionRunner({ pool }) {
  return createPostgresTransactionRunner({
    pool,
    createContext(base) {
      const foundation = createFoundationPostgresAdapters({ query: base.query });
      return Object.freeze({
        ...base,
        ...foundation,
        commandReceipts: foundation.commands.commandReceipts,
        outbox: foundation.commands.outbox,
        canonicalRecords: createPhase4CanonicalRecordStore({ query: base.query }),
      });
    },
  });
}

function createTransactionBoundPorts({ now }) {
  return Object.freeze(Object.fromEntries(CANONICAL_PERSISTENCE_PORT_NAMES.map((name) => [
    name,
    (context) => createCanonicalPersistenceCommandPorts({ records: context.transaction.canonicalRecords, now })[name](context),
  ])));
}
