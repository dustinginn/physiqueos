import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import { createFounderRuntimeSemanticDigest } from "./FounderRuntimeSemanticDigest";
import {
  classifyAllActiveProtocolLineages,
} from "./ActiveProtocolLineageInvariantService";
import {
  createTransitionProtocolLineageMigrationService,
} from "./TransitionProtocolLineageMigrationService";
import {
  prepareActiveProtocolSuccessorTransition,
} from "./ActiveProtocolSuccessorService";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lineage-migration-"));
  directories.push(directory);
  const file = path.join(directory, "runtime-store.json");
  const store = JSON.parse(fs.readFileSync("private/founder/runtime-store.json", "utf8"));
  fs.writeFileSync(file, JSON.stringify(store));
  const candidates = classifyAllActiveProtocolLineages(store)
    .filter((item) => item.classification === "single_planned_transition_candidate");
  const command = {
    rootIds: candidates.map((item) => item.rootId),
    expectedVersionIds: candidates.map((item) => item.candidateVersionId),
    expectedRevision: store.revision,
    expectedSemanticDigest: createFounderRuntimeSemanticDigest(store),
    reason: "Repair accepted Goal Transition initial-version lineage.",
  };
  const service = createTransitionProtocolLineageMigrationService({
    runtimeStorePath: file,
    liveStore: store,
    now: () => new Date("2026-07-27T13:00:00.000Z"),
    createUnitOfWork: (options) => createFounderStoreUnitOfWork({
      ...options,
      createCommitId: () => "isolated-lineage-commit",
      createTransactionId: () => "isolated-lineage-transaction",
    }),
  });
  return { file, store, candidates, command, service };
}

describe("TransitionProtocolLineageMigrationService", () => {
  it("prepares deterministic exact-allowlist mutations", () => {
    const { service, command } = fixture();
    const left = service.prepare(command);
    const right = service.prepare(command);
    expect(left).toEqual(right);
    expect(left.candidates).toHaveLength(6);
    expect(left.candidates.every((item) =>
      item.beforeClassification === "single_planned_transition_candidate"
      && item.afterClassification === "valid_active_lineage")).toBe(true);
  });

  it("atomically repairs all six and leaves protected collections unchanged", async () => {
    const { file, store, service, command } = fixture();
    const protectedBefore = JSON.stringify({
      executionItems: store.executionItems, reminders: store.reminders,
      goals: store.goals, confidence: store.goalConfidenceSnapshots,
      briefings: store.briefingArtifacts, events: store.events,
    });
    const result = await service.execute({
      ...command, acceptRuntimeMutation: true, confirmPeptidesExcluded: true,
    });
    expect(result).toMatchObject({ outcome: "success", committed: true, revision: 32 });
    const after = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(classifyAllActiveProtocolLineages(after)
      .filter((item) => item.classification === "single_planned_transition_candidate"))
      .toHaveLength(0);
    expect(classifyAllActiveProtocolLineages(after)
      .filter((item) => item.classification === "valid_active_lineage")).toHaveLength(13);
    expect(JSON.stringify({
      executionItems: after.executionItems, reminders: after.reminders,
      goals: after.goals, confidence: after.goalConfidenceSnapshots,
      briefings: after.briefingArtifacts, events: after.events,
    })).toBe(protectedBefore);
  });

  it("replays byte-stably without another revision", async () => {
    const { file, service, command } = fixture();
    await service.execute({
      ...command, acceptRuntimeMutation: true, confirmPeptidesExcluded: true,
    });
    const beforeReplay = fs.readFileSync(file);
    const reloaded = JSON.parse(beforeReplay);
    const replay = createTransitionProtocolLineageMigrationService({
      runtimeStorePath: file,
      liveStore: reloaded,
    });
    const result = await replay.execute({
      ...command,
      expectedRevision: reloaded.revision,
      expectedSemanticDigest: createFounderRuntimeSemanticDigest(reloaded),
      acceptRuntimeMutation: true,
      confirmPeptidesExcluded: true,
    });
    expect(result).toMatchObject({ outcome: "already_migrated", committed: false });
    expect(fs.readFileSync(file)).toEqual(beforeReplay);
  }, 40_000);

  it("rejects omitted, altered, unknown, and peptide allowlists", () => {
    const { service, command } = fixture();
    expect(service.prepare({}).outcome).toBe("allowlist_required");
    expect(service.prepare({ ...command, rootIds: [...command.rootIds, "unknown"] }).outcome)
      .toBe("version_allowlist_required");
    expect(service.prepare({
      ...command,
      rootIds: ["protocol_retatrutide_founder"],
      expectedVersionIds: ["none"],
    }).outcome).toBe("peptide_root_excluded");
  });

  it("requires explicit execution authorization", async () => {
    const { service, command } = fixture();
    expect(await service.execute(command)).toMatchObject({
      outcome: "authorization_required", committed: false,
    });
  });

  it("makes all six successor-ready and prepares the interval-two photo successor", async () => {
    const { file, service, command } = fixture();
    await service.execute({
      ...command, acceptRuntimeMutation: true, confirmPeptidesExcluded: true,
    });
    const store = JSON.parse(fs.readFileSync(file, "utf8"));
    const repaired = classifyAllActiveProtocolLineages(store)
      .filter((item) => command.rootIds.includes(item.rootId));
    expect(repaired.every((item) => item.classification === "valid_active_lineage"))
      .toBe(true);

    const photo = store.protocols.find((item) =>
      command.rootIds.includes(item.id) && item.protocolType === "photos");
    const current = store.protocolVersions.find((item) =>
      item.id === photo.currentVersionId);
    const successorVersion = structuredClone(current);
    successorVersion.change.reviewedChanges.recurrence.interval = 2;
    successorVersion.recurrence =
      structuredClone(successorVersion.change.reviewedChanges.recurrence);
    successorVersion.intent = { summary: "Capture comparable progress photos." };
    const prepared = prepareActiveProtocolSuccessorTransition(store, {
      protocolId: photo.id,
      expectedCurrentVersionId: current.id,
      effectiveDate: "2026-08-08",
      successorVersion,
      goalAssociation: current.goalLinks[0],
      provenance: {
        author: { type: "user", id: store.user.id, displayName: "Founder" },
        reason: "Change Progress Photos to every two weeks.",
        confirmation: { confirmedByUser: true, authority: "founder_confirmation" },
        details: { source: "isolated_successor_readiness" },
      },
    }, new Date("2026-07-27T13:00:00.000Z"));
    expect(prepared.ok, JSON.stringify(prepared)).toBe(true);
    expect(prepared.successor.change.reviewedChanges.recurrence).toMatchObject({
      frequency: "weekly", interval: 2, dayOfWeek: "saturday", daypart: "afternoon",
    });
    expect(prepared.successor.effectiveAt).toBe("2026-08-08");
  }, 40_000);
});
