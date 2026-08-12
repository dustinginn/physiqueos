import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDurableMigrationControlStore } from "./DurableMigrationControlStore.js";
import { createCanonicalWriteFence } from "./canonicalWriteFence.js";
import {
  CanonicalCompositionMode,
  CanonicalStoreEpoch,
  MigrationControlAction,
  MigrationFenceState,
} from "./migrationControlState.js";

const temporaryDirectories = [];

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true }));
});

describe("durable production migration control", () => {
  it("persists an inactive legacy state and idempotent fence activation across process composition", () => {
    const fixture = createFixture();
    const initialized = fixture.store.initialize(initialization());
    expect(initialized.state).toMatchObject({
      fenceState: MigrationFenceState.INACTIVE,
      canonicalStoreEpoch: CanonicalStoreEpoch.LEGACY_JSON,
      compositionMode: CanonicalCompositionMode.LEGACY_JSON,
      writesEnabled: true,
    });

    const command = transitionCommand(initialized.state, MigrationControlAction.ACTIVATE_FENCE, {
      commandId: "control-command-activate-0001",
      migrationOperationId: "migration-operation-0001",
      expectedMigrationId: "migration-package-0001",
    });
    const activated = fixture.store.transition(command);
    expect(activated.state).toMatchObject({
      fenceState: MigrationFenceState.ACTIVE,
      canonicalStoreEpoch: CanonicalStoreEpoch.MIGRATION_FENCE,
      compositionMode: CanonicalCompositionMode.LEGACY_JSON,
      writesEnabled: false,
      readsEnabled: true,
    });
    expect(fixture.store.transition(command).outcome).toBe("idempotent-replay");
    const restarted = createDurableMigrationControlStore({ filePath: fixture.filePath });
    expect(restarted.read().state).toEqual(activated.state);
  });

  it("returns a structured maintenance problem while reads remain enabled", () => {
    const fixture = createFixture();
    let state = fixture.store.initialize(initialization()).state;
    state = fixture.store.transition(transitionCommand(state, MigrationControlAction.ACTIVATE_FENCE, {
      migrationOperationId: "migration-operation-0001",
      expectedMigrationId: "migration-package-0001",
    })).state;
    const fence = createCanonicalWriteFence({ controlStore: fixture.store, requiredCompositionMode: CanonicalCompositionMode.LEGACY_JSON });
    expect(fence.inspect().readsEnabled).toBe(true);
    expect(() => fence.assertWriteAllowed({ operation: "weight.submit" })).toThrowError(expect.objectContaining({
      status: 503,
      code: "CANONICAL_WRITES_PAUSED",
      title: "Writes are temporarily paused.",
    }));
  });

  it("aborts safely to unchanged legacy state before a PostgreSQL write", () => {
    const fixture = createFixture();
    let state = activate(fixture.store);
    state = fixture.store.transition(transitionCommand(state, MigrationControlAction.BEGIN_CUTOVER)).state;
    state = fixture.store.transition(transitionCommand(state, MigrationControlAction.SWITCH_TO_POSTGRES)).state;
    state = fixture.store.transition(transitionCommand(state, MigrationControlAction.ABORT_TO_LEGACY)).state;
    expect(state).toMatchObject({
      fenceState: MigrationFenceState.ABORTED,
      canonicalStoreEpoch: CanonicalStoreEpoch.LEGACY_JSON,
      compositionMode: CanonicalCompositionMode.LEGACY_JSON,
      writesEnabled: true,
      firstPostgresWriteAt: null,
    });
  });

  it("releases only the explicit canonical outcome and replays the release command idempotently", () => {
    const fixture = createFixture();
    let state = activate(fixture.store);
    state = fixture.store.transition(transitionCommand(state, MigrationControlAction.BEGIN_CUTOVER)).state;
    state = fixture.store.transition(transitionCommand(state, MigrationControlAction.SWITCH_TO_POSTGRES)).state;
    state = fixture.store.transition(transitionCommand(state, MigrationControlAction.RECORD_FIRST_POSTGRES_WRITE)).state;
    const release = transitionCommand(state, MigrationControlAction.RELEASE_FENCE, {
      commandId: "control-command-release-0001",
      expectedCanonicalStoreOutcome: CanonicalCompositionMode.POSTGRES,
    });
    const released = fixture.store.transition(release);
    expect(released.state).toMatchObject({ fenceState: MigrationFenceState.COMPLETED, compositionMode: CanonicalCompositionMode.POSTGRES, writesEnabled: true });
    expect(fixture.store.transition(release).outcome).toBe("idempotent-replay");
  });

  it("fails closed for repeated activation and PostgreSQL release before the first-write boundary", () => {
    const fixture = createFixture();
    let state = activate(fixture.store);
    expect(() => fixture.store.transition(transitionCommand(state, MigrationControlAction.ACTIVATE_FENCE, {
      commandId: "control-command-invalid-reactivation-0001",
      migrationOperationId: "migration-operation-0001",
      expectedMigrationId: "migration-package-0001",
    }))).toThrowError(/requires an inactive, aborted, or completed control state/i);
    state = fixture.store.read().state;
    state = fixture.store.transition(transitionCommand(state, MigrationControlAction.BEGIN_CUTOVER)).state;
    state = fixture.store.transition(transitionCommand(state, MigrationControlAction.SWITCH_TO_POSTGRES)).state;
    expect(() => fixture.store.transition(transitionCommand(state, MigrationControlAction.RELEASE_FENCE, {
      commandId: "control-command-invalid-release-0001",
      expectedCanonicalStoreOutcome: CanonicalCompositionMode.POSTGRES,
    }))).toThrowError(/requires the recorded first canonical write boundary/i);
    expect(fixture.store.read().state).toMatchObject({
      fenceState: MigrationFenceState.CUTOVER_IN_PROGRESS,
      compositionMode: CanonicalCompositionMode.POSTGRES,
      writesEnabled: false,
      firstPostgresWriteAt: null,
    });
  });

  it("forbids stale JSON rollback after the first PostgreSQL write and enters recovery-required", () => {
    const fixture = createFixture();
    let state = activate(fixture.store);
    state = fixture.store.transition(transitionCommand(state, MigrationControlAction.BEGIN_CUTOVER)).state;
    state = fixture.store.transition(transitionCommand(state, MigrationControlAction.SWITCH_TO_POSTGRES)).state;
    state = fixture.store.transition(transitionCommand(state, MigrationControlAction.RECORD_FIRST_POSTGRES_WRITE)).state;
    expect(() => fixture.store.transition(transitionCommand(state, MigrationControlAction.ABORT_TO_LEGACY))).toThrowError(/forbidden after the first PostgreSQL canonical write/i);
    const unchanged = fixture.store.read().state;
    state = fixture.store.transition(transitionCommand(unchanged, MigrationControlAction.REQUIRE_RECOVERY, {
      commandId: "control-command-recovery-0001",
    })).state;
    expect(state).toMatchObject({
      fenceState: MigrationFenceState.RECOVERY_REQUIRED,
      canonicalStoreEpoch: CanonicalStoreEpoch.POSTGRES_CANONICAL,
      compositionMode: CanonicalCompositionMode.POSTGRES,
      writesEnabled: false,
    });
    expect(fixture.store.read().audit.some((entry) => entry.result === "failed" && entry.errorCode === "MIGRATION_CONTROL_TRANSITION_REJECTED")).toBe(true);
  });

  it("fails closed when durable state is missing or has been changed outside the state machine", () => {
    const fixture = createFixture();
    const fence = createCanonicalWriteFence({ controlStore: fixture.store, requiredCompositionMode: CanonicalCompositionMode.LEGACY_JSON });
    expect(() => fence.assertWriteAllowed()).toThrowError(expect.objectContaining({ code: "CANONICAL_WRITES_PAUSED" }));
    fixture.store.initialize(initialization());
    const envelope = JSON.parse(fs.readFileSync(fixture.filePath, "utf8"));
    envelope.state.writesEnabled = false;
    fs.writeFileSync(fixture.filePath, `${JSON.stringify(envelope)}\n`);
    expect(() => fence.assertWriteAllowed()).toThrowError(expect.objectContaining({ code: "CANONICAL_WRITES_PAUSED" }));
  });
});

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "migration-control-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, "migration-control.json");
  let tick = 0;
  return {
    filePath,
    store: createDurableMigrationControlStore({
      filePath,
      now: () => new Date(`2026-08-12T20:00:${String(tick++).padStart(2, "0")}.000Z`),
    }),
  };
}

function initialization() {
  return {
    environment: "isolated-rehearsal",
    operator: "founder",
    commandId: "control-command-initialize-0001",
    correlationId: "correlation-initialize-0001",
    sourceIdentity: { commit: "test-commit", buildId: "test-build" },
  };
}

function activate(store) {
  const initial = store.initialize(initialization()).state;
  return store.transition(transitionCommand(initial, MigrationControlAction.ACTIVATE_FENCE, {
    migrationOperationId: "migration-operation-0001",
    expectedMigrationId: "migration-package-0001",
  })).state;
}

let commandCounter = 0;
function transitionCommand(state, action, overrides = {}) {
  commandCounter += 1;
  return {
    action,
    commandId: overrides.commandId ?? `control-command-${String(commandCounter).padStart(4, "0")}`,
    correlationId: "correlation-migration-0001",
    operator: "founder",
    reason: `Test ${action}.`,
    expectedVersion: state.version,
    expectedFenceState: state.fenceState,
    expectedCanonicalStoreEpoch: state.canonicalStoreEpoch,
    expectedCompositionMode: state.compositionMode,
    migrationOperationId: overrides.migrationOperationId ?? state.migrationOperationId,
    expectedMigrationId: overrides.expectedMigrationId ?? state.expectedMigrationId,
    expectedCanonicalStoreOutcome: overrides.expectedCanonicalStoreOutcome,
  };
}
