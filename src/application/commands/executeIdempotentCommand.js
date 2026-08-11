import { createPayloadHash } from "../../contracts/v1/canonicalJson";
import { ApplicationProblem } from "../../contracts/v1/problem";
import { requireAuthenticationPrincipal } from "../auth/principal";

export async function executeIdempotentCommand({ transactionRunner, principal, metadata, commandType, payload, handler }) {
  const actor = requireAuthenticationPrincipal(principal);
  const payloadHash = createPayloadHash({ commandType, payloadVersion: metadata.payloadVersion, payload });
  return transactionRunner.run(async (transaction) => {
    const existing = await transaction.commandReceipts.find(actor.userId, metadata.idempotencyKey);
    if (existing) return replayReceipt(existing, payloadHash);

    await transaction.commandReceipts.insert({
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

    const outcome = await handler({ transaction, principal: actor, metadata, payload });
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
