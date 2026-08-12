import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createFounderStoreMutationLockService } from "./FounderStoreMutationLock";
import { assertProductionLegacyCanonicalWriteAllowed } from "../../platform/cutover/canonicalWriteFence";

export const LEGACY_FOUNDER_STORE_REVISION = 0;

export const FounderStoreUnitOfWorkErrorCode = Object.freeze({
  REVISION_CONFLICT: "FOUNDER_STORE_REVISION_CONFLICT",
  TRANSACTION_CLOSED: "FOUNDER_STORE_TRANSACTION_CLOSED",
  TRANSACTION_ABORTED: "FOUNDER_STORE_TRANSACTION_ABORTED",
  STAGE_FAILED: "FOUNDER_STORE_STAGE_FAILED",
  VALIDATION_FAILED: "FOUNDER_STORE_VALIDATION_FAILED",
  SERIALIZATION_FAILED: "FOUNDER_STORE_SERIALIZATION_FAILED",
  TEMP_WRITE_FAILED: "FOUNDER_STORE_TEMP_WRITE_FAILED",
  ATOMIC_REPLACE_FAILED: "FOUNDER_STORE_ATOMIC_REPLACE_FAILED",
  PERSISTENCE_FAILED: "FOUNDER_STORE_PERSISTENCE_FAILED",
  PUBLICATION_FAILED: "FOUNDER_STORE_PUBLICATION_FAILED",
});

export class FounderStoreUnitOfWorkError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "FounderStoreUnitOfWorkError";
    this.code = code;
    this.stage = options.stage ?? null;
    this.expectedRevision = options.expectedRevision ?? null;
    this.actualRevision = options.actualRevision ?? null;
    this.commitId = options.commitId ?? null;
    this.committed = options.committed ?? false;
  }
}

export function getFounderStoreUnitOfWorkCapabilities() {
  return Object.freeze({
    crossRepositoryTransaction: true,
    atomicCommit: true,
    rollback: true,
    stagedWrites: true,
    revisionLocking: true,
    persistenceErrorsPropagate: true,
    persistenceErrorPropagation: true,
    scope: "founder_store_unit_of_work",
    repositoryParticipation: false,
    crossProcessLocking: true,
  });
}

export function getFounderStoreRevision(store = {}) {
  return Number.isSafeInteger(store.revision) && store.revision >= 0
    ? store.revision
    : LEGACY_FOUNDER_STORE_REVISION;
}

export function createFounderStoreUnitOfWork({
  filePath,
  liveStore,
  binding = {},
  fileSystem = createNodeFounderStoreFileSystem(),
  now = () => new Date(),
  createCommitId = () => randomUUID(),
  createTransactionId = () => randomUUID(),
  serialize = defaultSerialize,
  publish = publishFounderStoreInPlace,
  stageFrom = liveStore,
  validatePersistedBaseline = null,
  mutationLock = null,
  lockOwnership = null,
  lockContext = {},
} = {}) {
  if (!filePath) throw new Error("Founder-store unit of work requires a file path.");
  if (!liveStore || typeof liveStore !== "object") {
    throw new Error("Founder-store unit of work requires a live store.");
  }

  const effectiveMutationLock = mutationLock ??
    (fileSystem.kind === "node_founder_store_file_system"
      ? createFounderStoreMutationLockService({ storePath: filePath }) : null);
  return {
    binding: Object.freeze({
      storeIdentity: binding.storeIdentity ?? null,
      storeKind: binding.storeKind ?? null,
      isolated: binding.isolated === true,
      productionAllowed: binding.productionAllowed === true,
      storePath: path.resolve(filePath),
    }),
    capabilities: getFounderStoreUnitOfWorkCapabilities(),

    begin() {
      const persisted = readPersistedStore(fileSystem, filePath);
      const expectedRevision = getFounderStoreRevision(persisted);
      const transactionId = createTransactionId();
      const stagedState = structuredClone(stageFrom);
      stagedState.revision = expectedRevision;
      let status = "open";
      let callbackResult;

      const assertOpen = () => {
        if (status === "aborted") {
          throw unitError("TRANSACTION_ABORTED", "The founder-store transaction was aborted.", {
            expectedRevision,
          });
        }
        if (status !== "open") {
          throw unitError("TRANSACTION_CLOSED", "The founder-store transaction is closed.", {
            expectedRevision,
          });
        }
      };

      return {
        get status() {
          return status;
        },
        transactionId,
        expectedRevision,

        inspect() {
          assertOpen();
          return structuredClone(stagedState);
        },

        async mutate(callback) {
          assertOpen();
          if (typeof callback !== "function") return undefined;
          try {
            callbackResult = await callback(stagedState);
            return callbackResult;
          } catch (cause) {
            status = "aborted";
            throw unitError("STAGE_FAILED", "Founder-store staged mutation failed.", {
              cause,
              expectedRevision,
            });
          }
        },

        abort() {
          assertOpen();
          status = "aborted";
          return { status };
        },

        async commit({ validate, finalizeCandidate, validateFinalized } = {}) {
          assertOpen();
          status = "committing";
          const commitId = createCommitId();
          try {
            return await withFounderStoreCommitMutex(filePath, () =>
              withFounderStoreMutationLock({ lockService: effectiveMutationLock,
                lockOwnership, expectedRevision, lockContext }, async () => {
              if (typeof validate === "function") {
                let validation;
                try {
                  validation = await validate(structuredClone(stagedState));
                } catch (cause) {
                  throw unitError("VALIDATION_FAILED", "Founder-store staged validation failed.", {
                    cause,
                    expectedRevision,
                    commitId,
                  });
                }
                if (validation === false || validation?.valid === false) {
                  throw unitError("VALIDATION_FAILED", "Founder-store staged validation rejected the transaction.", {
                    expectedRevision,
                    commitId,
                  });
                }
              }

              const current = readPersistedStore(fileSystem, filePath);
              if (typeof validatePersistedBaseline === "function") {
                let baselineValidation;
                try {
                  baselineValidation = await validatePersistedBaseline(
                    structuredClone(current)
                  );
                } catch (cause) {
                  throw unitError("VALIDATION_FAILED", "Founder-store persisted baseline validation failed.", {
                    cause,
                    expectedRevision,
                    commitId,
                  });
                }
                if (baselineValidation === false || baselineValidation?.valid === false) {
                  throw unitError("VALIDATION_FAILED", "Founder-store persisted baseline changed before commit.", {
                    expectedRevision,
                    commitId,
                  });
                }
              }
              assertRevision(expectedRevision, getFounderStoreRevision(current), commitId);
              const committedState = structuredClone(stagedState);
              committedState.revision = nextRevision(expectedRevision);
              committedState.updatedAt = now().toISOString();
              committedState.lastCommitId = commitId;
              const candidateContext = Object.freeze({
                expectedRevision,
                candidateRevision: committedState.revision,
                commitId,
              });

              if (typeof finalizeCandidate === "function") {
                try {
                  await finalizeCandidate({
                    stagedState: committedState,
                    ...candidateContext,
                  });
                } catch (cause) {
                  throw unitError("VALIDATION_FAILED", "Founder-store candidate finalization failed.", {
                    cause,
                    expectedRevision,
                    commitId,
                  });
                }
              }
              if (typeof validateFinalized === "function") {
                let finalValidation;
                try {
                  finalValidation = await validateFinalized(
                    structuredClone(committedState),
                    candidateContext
                  );
                } catch (cause) {
                  throw unitError("VALIDATION_FAILED", "Finalized founder-store candidate validation failed.", {
                    cause,
                    expectedRevision,
                    commitId,
                  });
                }
                if (finalValidation === false || finalValidation?.valid === false) {
                  throw unitError("VALIDATION_FAILED", "Finalized founder-store candidate was rejected.", {
                    expectedRevision,
                    commitId,
                  });
                }
              }

              assertProductionLegacyCanonicalWriteAllowed({
                operation: `founder-unit-of-work:${lockContext.operation ?? "commit"}`,
                runtimeStorePath: filePath,
              });

              let serialized;
              try {
                serialized = serialize(committedState);
              } catch (cause) {
                throw unitError("SERIALIZATION_FAILED", "Founder-store serialization failed.", {
                  cause,
                  expectedRevision,
                  commitId,
                });
              }

              const persistence = persistCandidate({
                filePath,
                fileSystem,
                serialized,
                expectedRevision,
                commitId,
                validatePersistedBaseline,
              });

              try {
                publish(liveStore, structuredClone(committedState));
              } catch (cause) {
                status = "aborted";
                throw unitError("PUBLICATION_FAILED", "Founder store was persisted but live publication failed.", {
                  cause,
                  expectedRevision,
                  actualRevision: committedState.revision,
                  commitId,
                  committed: true,
                });
              }

              status = "committed";
              return Object.freeze({
                status,
                committed: true,
                expectedRevision,
                revision: committedState.revision,
                commitId,
                result: callbackResult,
                warnings: Object.freeze(persistence.warnings),
              });
              }));
          } catch (error) {
            if (status !== "committed") status = "aborted";
            throw normalizeUnitOfWorkError(error, { expectedRevision, commitId });
          }
        },
      };
    },

    async execute({ mutate, validate } = {}) {
      const transaction = this.begin();
      await transaction.mutate(mutate);
      return transaction.commit({ validate });
    },
  };
}

function persistCandidate({
  filePath,
  fileSystem,
  serialized,
  expectedRevision,
  commitId,
  validatePersistedBaseline,
}) {
  const directory = path.dirname(filePath);
  const tempPath = path.join(
    directory,
    `${path.basename(filePath)}.${process.pid}.${commitId}.tmp`
  );
  const warnings = [];
  let handle = null;
  let installed = false;
  try {
    fileSystem.mkdir(directory);
    try {
      handle = fileSystem.openExclusive(tempPath);
      fileSystem.write(handle, serialized);
      fileSystem.syncFile(handle);
      fileSystem.close(handle);
      handle = null;
    } catch (cause) {
      throw unitError("TEMP_WRITE_FAILED", "Founder-store temporary write failed.", {
        cause,
        stage: "temporary_write",
        expectedRevision,
        commitId,
      });
    }

    const current = readPersistedStore(fileSystem, filePath);
    if (typeof validatePersistedBaseline === "function") {
      let validation;
      try {
        validation = validatePersistedBaseline(structuredClone(current));
      } catch (cause) {
        throw unitError("VALIDATION_FAILED", "Founder-store persisted baseline validation failed before replacement.", {
          cause,
          expectedRevision,
          commitId,
        });
      }
      if (
        validation?.then ||
        validation === false ||
        validation?.valid === false
      ) {
        throw unitError("VALIDATION_FAILED", "Founder-store persisted baseline changed before replacement.", {
          expectedRevision,
          commitId,
        });
      }
    }
    assertRevision(expectedRevision, getFounderStoreRevision(current), commitId);

    try {
      fileSystem.atomicReplace(tempPath, filePath);
      installed = true;
    } catch (cause) {
      throw unitError("ATOMIC_REPLACE_FAILED", "Founder-store atomic replacement failed.", {
        cause,
        stage: "atomic_replace",
        expectedRevision,
        commitId,
      });
    }

    try {
      fileSystem.syncDirectory(directory);
    } catch (cause) {
      warnings.push(Object.freeze({
        code: "FOUNDER_STORE_DIRECTORY_SYNC_UNAVAILABLE",
        stage: "directory_sync",
        message: cause?.message ?? "Directory synchronization was unavailable.",
      }));
    }
  } finally {
    if (handle !== null) {
      try {
        fileSystem.close(handle);
      } catch {
        // The original write error remains authoritative.
      }
    }
    try {
      if (fileSystem.exists(tempPath)) fileSystem.remove(tempPath);
    } catch (cause) {
      const warning = Object.freeze({
        code: installed
          ? "FOUNDER_STORE_POST_COMMIT_TEMP_CLEANUP_FAILED"
          : "FOUNDER_STORE_TEMP_CLEANUP_FAILED",
        stage: "temporary_cleanup",
        message: cause?.message ?? "Temporary cleanup failed.",
      });
      if (installed) warnings.push(warning);
    }
  }
  return { warnings };
}

export function createNodeFounderStoreFileSystem() {
  return {
    kind: "node_founder_store_file_system",
    read(filePath) {
      return fs.readFileSync(filePath, "utf8");
    },
    mkdir(directory) {
      fs.mkdirSync(directory, { recursive: true });
    },
    openExclusive(filePath) {
      return fs.openSync(filePath, "wx");
    },
    write(handle, serialized) {
      fs.writeFileSync(handle, serialized, "utf8");
    },
    syncFile(handle) {
      fs.fsyncSync(handle);
    },
    close(handle) {
      fs.closeSync(handle);
    },
    atomicReplace(tempPath, filePath) {
      fs.renameSync(tempPath, filePath);
    },
    syncDirectory(directory) {
      if (process.platform === "win32") return;
      const handle = fs.openSync(directory, "r");
      try {
        fs.fsyncSync(handle);
      } finally {
        fs.closeSync(handle);
      }
    },
    exists(filePath) {
      return fs.existsSync(filePath);
    },
    remove(filePath) {
      fs.unlinkSync(filePath);
    },
  };
}

function readPersistedStore(fileSystem, filePath) {
  try {
    return JSON.parse(fileSystem.read(filePath));
  } catch (cause) {
    throw unitError("PERSISTENCE_FAILED", "Founder store could not be read.", {
      cause,
      stage: "read",
    });
  }
}

function assertRevision(expectedRevision, actualRevision, commitId) {
  if (actualRevision !== expectedRevision) {
    throw unitError("REVISION_CONFLICT", "Founder-store revision changed before commit.", {
      expectedRevision,
      actualRevision,
      commitId,
    });
  }
}

function nextRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) {
    throw unitError("PERSISTENCE_FAILED", "Founder-store revision cannot advance safely.", {
      actualRevision: revision,
      stage: "revision",
    });
  }
  return revision + 1;
}

function defaultSerialize(store) {
  return `${JSON.stringify(store)}\n`;
}

function publishFounderStoreInPlace(target, source) {
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete target[key];
  }
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(target[key]) && Array.isArray(value)) {
      target[key].splice(0, target[key].length, ...value);
    } else if (isPlainObject(target[key]) && isPlainObject(value)) {
      publishFounderStoreInPlace(target[key], value);
    } else {
      target[key] = value;
    }
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const commitMutexes = new Map();

async function withFounderStoreCommitMutex(filePath, operation) {
  const prior = commitMutexes.get(filePath) ?? Promise.resolve();
  let release;
  const turn = new Promise((resolve) => {
    release = resolve;
  });
  const tail = prior.then(() => turn);
  commitMutexes.set(filePath, tail);
  await prior;
  try {
    return await operation();
  } finally {
    release();
    if (commitMutexes.get(filePath) === tail) commitMutexes.delete(filePath);
  }
}

async function withFounderStoreMutationLock({ lockService, lockOwnership,
  expectedRevision, lockContext }, operation) {
  if (!lockService) return operation();
  if (lockOwnership) {
    lockService.assertOwnership(lockOwnership);
    return operation();
  }
  const ownership = await lockService.acquire({
    operation: lockContext.operation ?? "founder_store_unit_of_work",
    goalId: lockContext.goalId ?? null,
    decisionId: lockContext.decisionId ?? null,
    requestId: lockContext.requestId ?? null,
    timeoutMs: lockContext.timeoutMs ?? 750,
    maxHoldMs: lockContext.maxHoldMs ?? 120_000,
  });
  let outcome = "failed";
  let endingStoreRevision = expectedRevision;
  let errorCode = null;
  try {
    const result = await operation();
    outcome = "committed";
    endingStoreRevision = result?.revision ?? expectedRevision;
    return result;
  } catch (error) {
    errorCode = error?.code ?? "FOUNDER_STORE_TRANSACTION_FAILED";
    throw error;
  } finally {
    await lockService.release(ownership, { outcome,
      startingStoreRevision: expectedRevision, endingStoreRevision, errorCode });
  }
}

function unitError(shortCode, message, options = {}) {
  return new FounderStoreUnitOfWorkError(
    FounderStoreUnitOfWorkErrorCode[shortCode] ?? shortCode,
    message,
    options
  );
}

function normalizeUnitOfWorkError(error, context) {
  if (error instanceof FounderStoreUnitOfWorkError) return error;
  return unitError("PERSISTENCE_FAILED", "Founder-store transaction failed.", {
    cause: error,
    expectedRevision: context.expectedRevision,
    commitId: context.commitId,
  });
}
