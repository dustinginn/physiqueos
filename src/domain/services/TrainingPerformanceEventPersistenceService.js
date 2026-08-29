import {
  assertValidTrainingPerformanceEvent,
  haveSameTrainingPerformanceEventSemantics,
} from "../models/trainingPerformanceEvent";
import {
  createFounderStoreUnitOfWork,
  FounderStoreUnitOfWorkErrorCode,
} from "../../data/repositories/FounderStoreUnitOfWork";

export const TrainingPerformanceEventPersistenceOutcome = Object.freeze({
  CREATED: "created",
  MATCHED: "matched",
  MIXED: "mixed",
  NO_EVENTS: "no_events",
  COLLISION: "semantic_collision",
  CONCURRENCY_CONFLICT: "concurrency_conflict",
  PERSISTENCE_FAILURE: "persistence_failure",
  COMMITTED_PUBLICATION_FAILURE: "committed_publication_failure",
});

export function createTrainingPerformanceEventPersistenceService({
  runtimeStorePath,
  liveStore,
  mutateCanonicalRuntime = null,
  createUnitOfWork = (options) => createFounderStoreUnitOfWork(options),
  now = () => new Date(),
} = {}) {
  if (typeof mutateCanonicalRuntime !== "function" && (!runtimeStorePath || !liveStore)) {
    throw new Error("Training performance-event persistence requires a bound Founder store.");
  }
  return {
    async persistEventBatch(events = [], options = {}) {
      const uniqueEvents = deduplicateInput(events);
      uniqueEvents.forEach(assertValidTrainingPerformanceEvent);
      if (uniqueEvents.length === 0 && !options.batchId) {
        return result(TrainingPerformanceEventPersistenceOutcome.NO_EVENTS);
      }

      if (typeof mutateCanonicalRuntime === "function") {
        return persistBoundedEventBatch({
          uniqueEvents,
          options,
          mutateCanonicalRuntime,
        });
      }

      const transaction = createUnitOfWork({
        filePath: runtimeStorePath,
        liveStore,
        stageFrom: liveStore,
        now,
      }).begin();
      const existingBatch = options.batchId
        ? (transaction.inspect().trainingPerformanceEventBatches ?? [])
          .find((batch) => batch.id === options.batchId)
        : null;
      const existingById = new Map(
        (transaction.inspect().trainingPerformanceEvents ?? []).map((event) => [
          event.id,
          event,
        ])
      );
      const existingEvents = [];
      const newEvents = [];
      for (const event of uniqueEvents) {
        const existing = existingById.get(event.id);
        if (!existing) {
          newEvents.push(event);
          continue;
        }
        if (!haveSameTrainingPerformanceEventSemantics(existing, event)) {
          transaction.abort();
          return result(TrainingPerformanceEventPersistenceOutcome.COLLISION, {
            collisionEventId: event.id,
          });
        }
        existingEvents.push(existing);
      }
      if (existingBatch) {
        if (!haveSameBatchSemantics(existingBatch, options.batch)) {
          transaction.abort();
          return result(TrainingPerformanceEventPersistenceOutcome.COLLISION, {
            collisionEventId: options.batchId,
          });
        }
        transaction.abort();
        return result(TrainingPerformanceEventPersistenceOutcome.MATCHED, {
          batch: existingBatch,
          existingEvents,
        });
      }
      if (newEvents.length === 0 && !options.batchId) {
        transaction.abort();
        return result(TrainingPerformanceEventPersistenceOutcome.MATCHED, {
          existingEvents,
        });
      }

      try {
        await transaction.mutate((store) => {
          store.trainingPerformanceEvents ??= [];
          store.trainingPerformanceEvents.push(...structuredClone(newEvents));
          if (options.batchId) {
            store.trainingPerformanceEventBatches ??= [];
            store.trainingPerformanceEventBatches.push(
              structuredClone(options.batch)
            );
          }
          options.mutateCandidate?.(store, {
            existingEvents: structuredClone(existingEvents),
            newEvents: structuredClone(newEvents),
          });
        });
        const committed = await transaction.commit({
          finalizeCandidate: options.finalizeCandidate,
          validateFinalized: (store) => {
            const eventsAreValid = newEvents.every((event) => {
              const matches = (store.trainingPerformanceEvents ?? []).filter(
                (candidate) => candidate.id === event.id
              );
              return (
                matches.length === 1 &&
                haveSameTrainingPerformanceEventSemantics(matches[0], event)
              );
            });
            return (
              eventsAreValid &&
              (!options.batchId ||
                (store.trainingPerformanceEventBatches ?? [])
                  .filter((batch) => batch.id === options.batchId).length === 1) &&
              options.validateFinalized?.(store, {
                existingEvents: structuredClone(existingEvents),
                newEvents: structuredClone(newEvents),
              }) !== false
            );
          },
        });
        return result(
          uniqueEvents.length === 0
            ? TrainingPerformanceEventPersistenceOutcome.NO_EVENTS
            : existingEvents.length
            ? TrainingPerformanceEventPersistenceOutcome.MIXED
            : TrainingPerformanceEventPersistenceOutcome.CREATED,
          {
            committed: true,
            existingEvents,
            newEvents,
            batch: options.batch ?? null,
            revision: committed.revision,
          }
        );
      } catch (error) {
        return result(
          error?.code === FounderStoreUnitOfWorkErrorCode.PUBLICATION_FAILED &&
          error.committed
            ? TrainingPerformanceEventPersistenceOutcome
                .COMMITTED_PUBLICATION_FAILURE
            : error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT
            ? TrainingPerformanceEventPersistenceOutcome.CONCURRENCY_CONFLICT
            : TrainingPerformanceEventPersistenceOutcome.PERSISTENCE_FAILURE,
          {
            committed: error?.committed === true,
            commitId: error?.commitId ?? null,
            errorCode:
              error?.code ?? "TRAINING_PERFORMANCE_EVENT_PERSISTENCE_FAILED",
          }
        );
      }
    },
  };
}

async function persistBoundedEventBatch({
  uniqueEvents,
  options,
  mutateCanonicalRuntime,
}) {
  try {
    const committed = await mutateCanonicalRuntime({
      operation: "training-performance-event-confirmation",
      allowedCollections: [
        "trainingPerformanceEvents",
        ...(options.batchId ? [
          "trainingPerformanceEventBatches",
          "piTrainingConfidenceWorkItems",
        ] : []),
      ],
      allowApplicationContextMutation: false,
      mutate(candidate, { commandId }) {
        const existingById = new Map(
          (candidate.trainingPerformanceEvents ?? []).map((event) => [
            event.id,
            event,
          ])
        );
        const existingEvents = [];
        const newEvents = [];
        for (const event of uniqueEvents) {
          const existing = existingById.get(event.id);
          if (!existing) {
            newEvents.push(event);
            continue;
          }
          if (!haveSameTrainingPerformanceEventSemantics(existing, event)) {
            throw collision(event.id);
          }
          existingEvents.push(existing);
        }
        const existingBatch = options.batchId
          ? (candidate.trainingPerformanceEventBatches ?? [])
            .find((batch) => batch.id === options.batchId)
          : null;
        if (existingBatch) {
          if (
            !haveSameBatchSemantics(existingBatch, options.batch) ||
            existingEvents.length !== uniqueEvents.length ||
            options.validateFinalized?.(candidate, {
              existingEvents,
              newEvents: [],
            }) === false
          ) {
            throw collision(options.batchId);
          }
          return {
            outcome: TrainingPerformanceEventPersistenceOutcome.MATCHED,
            existingEvents,
            newEvents: [],
            batch: existingBatch,
            selected: options.selectFinalized?.(candidate) ?? null,
          };
        }
        if (newEvents.length === 0 && !options.batchId) {
          return {
            outcome: TrainingPerformanceEventPersistenceOutcome.MATCHED,
            existingEvents,
            newEvents: [],
            batch: null,
            selected: options.selectFinalized?.(candidate) ?? null,
          };
        }

        candidate.trainingPerformanceEvents = [
          ...(candidate.trainingPerformanceEvents ?? []),
          ...structuredClone(newEvents),
        ];
        if (options.batchId) {
          candidate.trainingPerformanceEventBatches = [
            ...(candidate.trainingPerformanceEventBatches ?? []),
            structuredClone(options.batch),
          ];
        }
        options.mutateCandidate?.(candidate, {
          existingEvents: structuredClone(existingEvents),
          newEvents: structuredClone(newEvents),
        });
        options.finalizeCandidate?.({
          stagedState: candidate,
          commitId: commandId,
        });
        const eventsAreValid = newEvents.every((event) => {
          const matches = (candidate.trainingPerformanceEvents ?? []).filter(
            (item) => item.id === event.id
          );
          return matches.length === 1 &&
            haveSameTrainingPerformanceEventSemantics(matches[0], event);
        });
        if (
          !eventsAreValid ||
          (options.batchId &&
            (candidate.trainingPerformanceEventBatches ?? [])
              .filter((batch) => batch.id === options.batchId).length !== 1) ||
          options.validateFinalized?.(candidate, {
            existingEvents,
            newEvents,
          }) === false
        ) {
          throw validationFailure();
        }
        return {
          outcome: uniqueEvents.length === 0
            ? TrainingPerformanceEventPersistenceOutcome.NO_EVENTS
            : existingEvents.length
              ? TrainingPerformanceEventPersistenceOutcome.MIXED
              : TrainingPerformanceEventPersistenceOutcome.CREATED,
          existingEvents,
          newEvents,
          batch: options.batch ?? null,
          selected: options.selectFinalized?.(candidate) ?? null,
        };
      },
    });
    return result(committed.result.outcome, {
      committed: committed.changedCollections.length > 0,
      existingEvents: committed.result.existingEvents,
      newEvents: committed.result.newEvents,
      batch: committed.result.batch,
      selected: committed.result.selected,
      revision: committed.revision,
      commitId: committed.commitId,
      changedCollections: committed.changedCollections,
      memoryProfile: committed.memoryProfile,
    });
  } catch (error) {
    if (error?.code === "TRAINING_PERFORMANCE_EVENT_COLLISION") {
      return result(TrainingPerformanceEventPersistenceOutcome.COLLISION, {
        collisionEventId: error.collisionEventId,
      });
    }
    return result(
      error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT ||
      error?.code === "FOUNDER_STORE_REVISION_CONFLICT"
        ? TrainingPerformanceEventPersistenceOutcome.CONCURRENCY_CONFLICT
        : TrainingPerformanceEventPersistenceOutcome.PERSISTENCE_FAILURE,
      {
        committed: error?.committed === true,
        commitId: error?.commitId ?? null,
        errorCode:
          error?.code ?? "TRAINING_PERFORMANCE_EVENT_PERSISTENCE_FAILED",
      }
    );
  }
}

function collision(collisionEventId) {
  return Object.assign(
    new Error("Training performance-event identity or batch semantics collided."),
    {
      code: "TRAINING_PERFORMANCE_EVENT_COLLISION",
      collisionEventId,
    }
  );
}

function validationFailure() {
  return Object.assign(
    new Error("Finalized Training performance-event candidate was rejected."),
    { code: FounderStoreUnitOfWorkErrorCode.VALIDATION_FAILED }
  );
}

function deduplicateInput(events) {
  const byId = new Map();
  for (const event of events) {
    const existing = byId.get(event.id);
    if (existing && !haveSameTrainingPerformanceEventSemantics(existing, event)) {
      throw new Error("Training performance-event input contains an identity collision.");
    }
    byId.set(event.id, event);
  }
  return [...byId.values()];
}
function haveSameBatchSemantics(left, right) {
  const semantic = ({ sourceCommitId: _sourceCommitId, ...value } = {}) => value;
  return JSON.stringify(semantic(left)) === JSON.stringify(semantic(right));
}

function result(outcome, values = {}) {
  return {
    outcome,
    committed: false,
    newEvents: [],
    existingEvents: [],
    collisionEventId: null,
    ...values,
  };
}
