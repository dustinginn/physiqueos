import { describe, expect, it, vi } from "vitest";
import { createAuthenticationPrincipal } from "../auth/principal.js";
import { createCommandMetadata } from "../../contracts/v1/command.js";
import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { createInMemoryFoundationTransactionStore } from "../../platform/commands/InMemoryFoundationTransactionStore.js";
import { executeIdempotentCommand } from "./executeIdempotentCommand.js";
import { createPhase3CommandService, Phase3Command } from "./Phase3CommandService.js";

const principal = createAuthenticationPrincipal({ userId: "owner", deviceId: "device", sessionId: "session" });

describe("canonical-store epoch protection", () => {
  it("cannot replay a legacy command receipt in the PostgreSQL epoch", async () => {
    const transactionRunner = createInMemoryFoundationTransactionStore();
    const metadata = createCommandMetadata({ idempotencyKey: "cross-epoch-command-0001" });
    const base = {
      transactionRunner,
      principal,
      metadata,
      commandType: "weight.submit.v1",
      payload: { localDate: "2026-08-12", value: 180 },
      handler: async () => ({ result: { committed: true } }),
    };
    await expect(executeIdempotentCommand({ ...base, canonicalStoreEpoch: "legacy-json" })).resolves.toMatchObject({ outcome: "committed" });
    await expect(executeIdempotentCommand({ ...base, canonicalStoreEpoch: "postgres-canonical" })).rejects.toMatchObject({
      status: 409,
      code: "IDEMPOTENCY_KEY_REUSED",
    });
  });

  it("rejects a client command created in a stale epoch before invoking its canonical port", async () => {
    const port = vi.fn(async () => ({ result: { committed: true } }));
    const writeFence = {
      assertWriteAllowed({ expectedEpoch }) {
        if (expectedEpoch !== "postgres-canonical") {
          throw new ApplicationProblem({ status: 409, code: "CANONICAL_STORE_EPOCH_MISMATCH", title: "Stale epoch." });
        }
        return { canonicalStoreEpoch: "postgres-canonical" };
      },
    };
    const service = createPhase3CommandService({
      transactionRunner: createInMemoryFoundationTransactionStore(),
      ports: { submitWeight: port },
      writeFence,
    });
    await expect(service.execute({
      commandType: Phase3Command.SUBMIT_WEIGHT,
      principal,
      metadata: { idempotencyKey: "stale-client-command-0001", canonicalStoreEpoch: "legacy-json" },
      payload: { localDate: "2026-08-12", value: 180 },
    })).rejects.toMatchObject({ status: 409, code: "CANONICAL_STORE_EPOCH_MISMATCH" });
    expect(port).not.toHaveBeenCalled();
  });
});
