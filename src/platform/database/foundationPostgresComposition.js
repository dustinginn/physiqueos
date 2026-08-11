import { createPostgresCommandStore } from "./PostgresCommandStore.js";
import { createPostgresControlStore } from "./PostgresControlStore.js";
import { createPostgresIdentityStore } from "./PostgresIdentityStore.js";
import { createPostgresObjectStore } from "./PostgresObjectStore.js";
import { createPostgresOperationsStore } from "./PostgresOperationsStore.js";
import { createPostgresOutboxStore } from "./PostgresOutboxStore.js";
import { createPostgresPasskeyStore } from "./PostgresPasskeyStore.js";
import { createPostgresTransactionRunner } from "./transaction.js";

export function createFoundationPostgresAdapters({ query }) {
  return Object.freeze({
    identity: createPostgresIdentityStore({ query }),
    commands: createPostgresCommandStore({ query }),
    operations: createPostgresOperationsStore({ query }),
    objects: createPostgresObjectStore({ query }),
    outbox: createPostgresOutboxStore({ query }),
    passkeys: createPostgresPasskeyStore({ query }),
    control: createPostgresControlStore({ query }),
  });
}

export function createFoundationPostgresTransactionRunner({ pool }) {
  return createPostgresTransactionRunner({
    pool,
    createContext(base) {
      const adapters = createFoundationPostgresAdapters({ query: base.query });
      return Object.freeze({
        ...base,
        ...adapters,
        commandReceipts: adapters.commands.commandReceipts,
        outbox: adapters.commands.outbox,
      });
    },
  });
}
