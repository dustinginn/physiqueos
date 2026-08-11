export function createInMemoryFoundationTransactionStore(seed = {}) {
  let state = createState(seed);
  return Object.freeze({
    async run(work) {
      const staged = cloneState(state);
      const result = await work(createTransaction(staged));
      state = staged;
      return result;
    },
    inspect() {
      return cloneState(state);
    },
  });
}

function createTransaction(staged) {
  return Object.freeze({
    commandReceipts: Object.freeze({
      async find(userId, idempotencyKey) {
        return clone(staged.commandReceipts.get(receiptKey(userId, idempotencyKey)) ?? null);
      },
      async insert(receipt) {
        const key = receiptKey(receipt.userId, receipt.idempotencyKey);
        if (staged.commandReceipts.has(key)) throw new Error("Duplicate command receipt.");
        staged.commandReceipts.set(key, clone(receipt));
      },
      async complete(userId, idempotencyKey, completion) {
        const key = receiptKey(userId, idempotencyKey);
        const receipt = staged.commandReceipts.get(key);
        if (!receipt) throw new Error("Command receipt is missing.");
        const completed = { ...receipt, ...clone(completion) };
        staged.commandReceipts.set(key, completed);
        return clone(completed);
      },
    }),
    outbox: Object.freeze({
      async insert(message) {
        if (!message?.id || !message?.topic || !message?.dedupeKey) throw new Error("Outbox identity, topic, and dedupe key are required.");
        if (staged.outbox.has(message.id)) throw new Error("Duplicate outbox identity.");
        if ([...staged.outbox.values()].some((entry) => entry.topic === message.topic && entry.dedupeKey === message.dedupeKey)) {
          throw new Error("Duplicate outbox dedupe key.");
        }
        staged.outbox.set(message.id, clone({ status: "pending", ...message }));
      },
    }),
  });
}

function createState(seed) {
  return {
    commandReceipts: new Map((seed.commandReceipts ?? []).map((entry) => [receiptKey(entry.userId, entry.idempotencyKey), clone(entry)])),
    outbox: new Map((seed.outbox ?? []).map((entry) => [entry.id, clone(entry)])),
  };
}

function cloneState(state) {
  return createState({ commandReceipts: [...state.commandReceipts.values()], outbox: [...state.outbox.values()] });
}

function receiptKey(userId, idempotencyKey) {
  return `${userId}\u0000${idempotencyKey}`;
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}
