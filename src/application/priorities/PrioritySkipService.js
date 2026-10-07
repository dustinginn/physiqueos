import { randomUUID } from "node:crypto";
import { createCanonicalPersistenceCommandPorts } from "../commands/CanonicalPersistenceCommandPorts.js";
import { PRIORITY_SKIP_COMMAND_TYPE } from "../../domain/services/ReminderOccurrenceCompletion.js";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";

export const PRIORITY_SKIP_WRITE_COLLECTIONS = Object.freeze([
  "dailyCheckIns",
  "executionItems",
  "reminders",
]);

export const PRIORITY_SKIP_READ_COLLECTIONS = Object.freeze([
  "dailyCheckIns",
  "dexaScans",
  "executionItems",
  "progressPhotos",
  "protocols",
  "reminders",
  "user",
  "weightEntries",
]);

// Web submits the exact command projected by the Server. This adapter runs
// that same canonical persistence port inside the bounded Web transaction;
// it does not maintain a second Web eligibility matrix or a second skip
// mutation implementation.
export function createPrioritySkipService({ mutateCanonicalRuntime, now = () => new Date() } = {}) {
  if (typeof mutateCanonicalRuntime !== "function") {
    throw new Error("Priority Skip requires a bounded canonical mutation.");
  }
  return Object.freeze({
    async skip(command) {
      if (command?.commandType !== PRIORITY_SKIP_COMMAND_TYPE) {
        throw new Error("A projected priority.skip.v1 command is required.");
      }
      const committed = await mutateCanonicalRuntime({
        operation: "priority-skip",
        allowedCollections: PRIORITY_SKIP_WRITE_COLLECTIONS,
        readCollections: PRIORITY_SKIP_READ_COLLECTIONS,
        readApplicationContext: false,
        readImportMetadata: false,
        allowApplicationContextMutation: false,
        async mutate(candidate) {
          const user = (candidate.user ?? [])[0];
          if (!user?.id) throw new Error("Priority Skip requires a canonical user.");
          const records = createInMemoryCanonicalRecordStore(candidate);
          const outcome = await createCanonicalPersistenceCommandPorts({ records, now }).skipPriority({
            ownerUserId: user.id,
            principal: {
              userId: user.id,
              deviceId: "physiqueos-web",
              roles: ["founder"],
            },
            metadata: {
              commandId: randomUUID(),
              idempotencyKey: randomUUID(),
              expectedVersion: String(command.expectedVersion),
            },
            payload: command.payload,
          });
          const next = records.snapshot();
          for (const collection of PRIORITY_SKIP_WRITE_COLLECTIONS) {
            candidate[collection] = structuredClone(next[collection] ?? []);
          }
          return outcome.result;
        },
      });
      return committed.result;
    },
  });
}
