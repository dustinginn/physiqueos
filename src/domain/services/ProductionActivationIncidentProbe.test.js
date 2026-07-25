import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProductionGoalTransitionActivationService } from "./ProductionGoalTransitionActivationService";

const temporaryFiles = [];

describe("temporary production activation incident probe", () => {
  afterEach(() => {
    for (const file of temporaryFiles.splice(0)) fs.rmSync(file, { force: true });
  });

  it("fails closed when the historical incident transition is already consumed", async () => {
    const productionShape = JSON.parse(
      fs.readFileSync("private/founder/runtime-store.json", "utf8")
    );
    const liveStore = structuredClone(productionShape);
    const filePath = path.join(os.tmpdir(), `physiqueos-activation-probe-${Date.now()}.json`);
    temporaryFiles.push(filePath);
    fs.writeFileSync(filePath, JSON.stringify(productionShape));
    const before = structuredClone(productionShape);
    const service = createProductionGoalTransitionActivationService({
      runtimeStorePath: filePath,
      liveStore,
      readLiveStore: () => structuredClone(liveStore),
      readPersistedStore: () => JSON.parse(fs.readFileSync(filePath, "utf8")),
      createTokenId: () => "incident_probe_token",
      now: () => new Date("2026-07-21T05:00:00.000Z"),
    });
    const transitionId = productionShape.goalTransitionDrafts
      .find((draft) => draft.liveProduction === true).id;
    await expect(service.createFinalReview({
      founderUserId: "user_founder_001",
      transitionId,
    })).rejects.toMatchObject({
      code: "PRODUCTION_ACTIVATION_DRAFT_NOT_READY",
      blockingReasons: expect.arrayContaining([
        expect.objectContaining({ code: "GOAL_TRANSITION_DRAFT_ALREADY_CONSUMED" }),
        expect.objectContaining({ code: "PROTOCOL_TRANSITION_DRAFT_ALREADY_CONSUMED" }),
        expect.objectContaining({ code: "TARGET_GOAL_ALREADY_ACTIVE" }),
      ]),
    });
    const persisted = JSON.parse(fs.readFileSync(filePath, "utf8"));
    expect(persisted).toEqual(before);
    expect(liveStore).toEqual(before);
    expect(persisted.revision).toBe(before.revision);
    expect(persisted.lastCommitId).toBe(before.lastCommitId);
    expect(persisted.goalTransitionDrafts.find((draft) => draft.id === transitionId))
      .toMatchObject({ status: "applied", consumed: true });
    expect(persisted.goalProtocolTransitionDrafts.find(
      (draft) => draft.goalTransitionDraftId === transitionId
    )).toMatchObject({ status: "applied", consumed: true });
    expect(persisted.goals).toEqual(before.goals);
    expect(persisted.protocols).toEqual(before.protocols);
    expect(persisted.protocolVersions).toEqual(before.protocolVersions);
    expect(persisted.executionItems).toEqual(before.executionItems);
    expect(persisted.reminders).toEqual(before.reminders);
    for (const collection of [
      "evidencePackages", "canonicalEvidenceObjects", "evidenceReviews",
      "evidenceRelationships", "dailyBriefings", "briefingArtifacts",
    ]) expect(persisted[collection] ?? []).toEqual(before[collection] ?? []);
  });
});
