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
import {
  createPostgresFounderRepositoryFacade,
  executePostgresFounderRuntimeMutation,
} from "./PostgresFounderRepositoryFacade.js";

export async function createPhase4PostgresApplicationComposition({
  pool,
  ownerUserId,
  now = () => new Date(),
  objectRoot = null,
  issueAccessHandle = null,
  writeFence = null,
  authorityStore = null,
  migrationOperationId = null,
  compatibilityMode = true,
} = {}) {
  if (!pool?.query || !pool?.connect) throw new Error("Phase 4 composition requires a PostgreSQL pool.");
  const query = (text, values) => pool.query(text, values);
  const canonicalRuntime = await loadCanonicalRuntime({ query, ownerUserId });
  const runtime = addFounderNoncanonicalReadContext(canonicalRuntime, ownerUserId);
  registerRuntimeTrainingExercises(runtime.canonicalExerciseLibrary ?? []);
  const repositories = createPostgresFounderRepositoryFacade({
    pool,
    ownerUserId,
    authorityStore,
    migrationOperationId,
    compatibilityMode,
    now,
  });
  const loaders = createLegacyFounderReadLoaders({ repositories, readRuntimeStore: () => runtime, now });
  const readModels = createPhase3ReadModelService({
    loaders,
    now,
    readResourceVersion: ({ data }) => String(data?.version ?? runtime.revision ?? "1"),
  });
  const transactionRunner = createPhase4TransactionRunner({ pool });
  const ports = createTransactionBoundPorts({ now, authorityStore, migrationOperationId, compatibilityMode });
  const commands = createPhase3CommandService({ transactionRunner, ports, writeFence });
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
    repositoryWrites: repositories,
    readModels,
    commands,
    media,
    runtime,
    loadRuntime: () => loadCanonicalRuntime({ query, ownerUserId }),
    mutateRuntime: ({ commandId, operation, expectedRuntime, mutate }) =>
      executePostgresFounderRuntimeMutation({
        pool, ownerUserId, authorityStore, migrationOperationId, compatibilityMode,
        now, commandId, operation, expectedRuntime, mutate,
      }),
  });
}

export function addFounderNoncanonicalReadContext(canonicalRuntime, ownerUserId) {
  if (!ownerUserId || canonicalRuntime?.user?.id !== ownerUserId) return canonicalRuntime;
  return canonicalRuntime;
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

function createTransactionBoundPorts({ now, authorityStore, migrationOperationId, compatibilityMode }) {
  return Object.freeze(Object.fromEntries(CANONICAL_PERSISTENCE_PORT_NAMES.map((name) => [
    name,
    async (context) => {
      if (compatibilityMode) {
        const result = await context.transaction.client.query("SELECT current_database() AS database");
        if (!/^physiqueos_phase5_(?:test|restore)_provider(?:_|$)/.test(String(result.rows[0]?.database ?? ""))) {
          const error = new Error("Compatibility commands are restricted to the isolated Phase 5 provider database.");
          error.code = "PROVIDER_COMPATIBILITY_TARGET_REJECTED";
          throw error;
        }
      } else if (authorityStore) {
        await authorityStore.claimCanonicalWriteBoundary({
          client: context.transaction.client,
          migrationOperationId,
          commandId: context.metadata.commandId,
        });
      }
      return createCanonicalPersistenceCommandPorts({ records: context.transaction.canonicalRecords, now })[name](context);
    },
  ])));
}
