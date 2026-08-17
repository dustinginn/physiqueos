import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createCanonicalPersistenceCommandPorts } from "./CanonicalPersistenceCommandPorts.js";

const ownerUserId = "owner-one";
const principal = { userId: ownerUserId, deviceId: "device-one", sessionId: "session-one" };
const now = () => new Date("2026-08-11T12:00:00.000Z");

describe("Phase 4 canonical command persistence ports", () => {
  it("preserves command outcomes across independent legacy-copy adapters", async () => {
    const left = fixture(); const right = fixture();
    const commands = [
      ["submitWeight", { localDate: "2026-08-11", value: 180 }, null],
      ["submitCheckIn", { localDate: "2026-08-11", energy: 4 }, null],
      ["completePriority", { priorityId: "priority-one", occurrenceDate: "2026-08-11" }, "1"],
      ["editProtocol", { protocolId: "protocol-one", patch: { title: "Updated" } }, "1"],
      ["editGoal", { goalId: "goal-one", patch: { title: "Updated Goal" } }, "1"],
      ["confirmEvidenceReview", { reviewId: "review-one" }, "1"],
      ["correctTrainingSession", { sessionId: "training-one", corrections: [{ field: "load" }] }, "1"],
    ];
    for (const [name, payload, expectedVersion] of commands) {
      const context = commandContext(payload, expectedVersion, `command-${name}`);
      const a = await createCanonicalPersistenceCommandPorts({ records: left, now })[name](context);
      const b = await createCanonicalPersistenceCommandPorts({ records: right, now })[name](context);
      expect(a).toEqual(b);
    }
    expect(left.snapshot()).toEqual(right.snapshot());
  });

  it("rejects stale writes and suppresses a duplicate occurrence completion", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const first = await ports.completePriority(commandContext({ priorityId: "priority-one", occurrenceDate: "2026-08-11" }, "1", "first"));
    expect(first.result.record.version).toBe(2);
    const repeated = await ports.completePriority(commandContext({ priorityId: "priority-one", occurrenceDate: "2026-08-11" }, "1", "second"));
    expect(repeated.result.status).toBe("already_completed");
    await expect(ports.editGoal(commandContext({ goalId: "goal-one", patch: { title: "first" } }, "9", "stale"))).rejects.toMatchObject({ code: "EXPECTED_VERSION_CONFLICT" });
  });

  it("keeps independent aggregate writes independent", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const [goal, protocol] = await Promise.all([
      ports.editGoal(commandContext({ goalId: "goal-one", patch: { title: "Goal B" } }, "1", "goal")),
      ports.editProtocol(commandContext({ protocolId: "protocol-one", patch: { title: "Protocol B" } }, "1", "protocol")),
    ]);
    expect(goal.result.record.title).toBe("Goal B");
    expect(protocol.result.record.title).toBe("Protocol B");
  });

  it("enqueues no durable outbox work for any committed canonical write", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const committed = await ports.editGoal(commandContext({ goalId: "goal-one", patch: { title: "Goal C" } }, "1", "no-outbox"));
    expect(committed.status).toBe("committed");
    expect(committed.outbox).toEqual([]);
    const duplicate = await ports.completePriority(commandContext({ priorityId: "priority-one", occurrenceDate: "2026-08-11" }, "1", "dup"));
    const repeated = await ports.completePriority(commandContext({ priorityId: "priority-one", occurrenceDate: "2026-08-11" }, "1", "dup-2"));
    expect(duplicate.outbox).toEqual([]);
    expect(repeated.outbox).toEqual([]);
  });
});

function fixture() {
  return createInMemoryCanonicalRecordStore({
    goals: [{ id: "goal-one", userId: ownerUserId, title: "Goal", version: 1 }],
    protocols: [{ id: "protocol-one", userId: ownerUserId, title: "Protocol", version: 1 }],
    executionItems: [{ id: "priority-one", userId: ownerUserId, completionHistory: [], version: 1 }],
    evidenceReviews: [{ id: "review-one", userId: ownerUserId, status: "pending", version: 1 }],
    trainingPerformanceEvents: [{ id: "training-one", userId: ownerUserId, version: 1 }],
    weightEntries: [], dailyCheckIns: [], evidencePackages: [],
  });
}
function commandContext(payload, expectedVersion, commandId) {
  return { ownerUserId, principal, metadata: { commandId, expectedVersion }, payload };
}
