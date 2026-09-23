import { createPayloadHash } from "../../contracts/v1/canonicalJson.js";
import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { requireAuthenticationPrincipal } from "../auth/principal.js";

export async function executeIdempotentCommand({ transactionRunner, principal, metadata, commandType, payload, canonicalStoreEpoch = null, handler }) {
  const actor = requireAuthenticationPrincipal(principal);
  const payloadHash = createPayloadHash({ commandType, payloadVersion: metadata.payloadVersion, canonicalStoreEpoch, payload });
  return transactionRunner.run(async (transaction) => {
    const existing = await transaction.commandReceipts.find(actor.userId, metadata.idempotencyKey);
    if (existing) return replayReceipt(existing, payloadHash);

    const inserted = await transaction.commandReceipts.insert({
      id: metadata.commandId,
      userId: actor.userId,
      deviceId: actor.deviceId,
      sessionId: actor.sessionId,
      commandId: metadata.commandId,
      idempotencyKey: metadata.idempotencyKey,
      commandType,
      payloadHash,
      status: "processing",
    });
    if (!inserted) {
      // Lost the race: a concurrent request with the same idempotency key
      // landed first between our find() and our insert(). This is not an
      // error -- treat it exactly like the early-found case above.
      const racedReceipt = await transaction.commandReceipts.find(actor.userId, metadata.idempotencyKey);
      if (!racedReceipt) {
        throw new ApplicationProblem({
          status: 500,
          code: "COMMAND_RECEIPT_RACE_UNRESOLVED",
          title: "The command receipt insert conflicted but no receipt could be found afterward.",
        });
      }
      return replayReceipt(racedReceipt, payloadHash);
    }

    const outcome = await handler({ transaction, principal: actor, metadata, payload, canonicalStoreEpoch });
    for (const message of outcome?.outbox ?? []) await transaction.outbox.insert(message);
    const receipt = await transaction.commandReceipts.complete(actor.userId, metadata.idempotencyKey, {
      status: outcome?.status ?? "committed",
      result: outcome?.result ?? null,
      operationId: outcome?.operationId ?? null,
    });
    return Object.freeze({ outcome: "committed", receipt });
  });
}

function replayReceipt(receipt, payloadHash) {
  if (receipt.payloadHash !== payloadHash) {
    throw new ApplicationProblem({
      status: 409,
      code: "IDEMPOTENCY_KEY_REUSED",
      title: "The idempotency key was already used for a different request.",
    });
  }
  if (receipt.status === "processing") {
    return Object.freeze({ outcome: "pending", receipt });
  }
  return Object.freeze({ outcome: "replayed", receipt });
}
