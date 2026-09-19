import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createEvidenceIntakeInterpretationWorkerHandler } from "./EvidenceIntakeInterpretationWorker.js";

const { interpretEvidenceIntakeStoredArtifacts } = await import(
  "../../domain/services/EvidenceIntakeService.js"
);

vi.mock("../../domain/services/EvidenceIntakeService.js", () => ({
  interpretEvidenceIntakeStoredArtifacts: vi.fn(async ({ submissionId, userId }) => ({
    evidencePackage: { package_id: `${submissionId}_images`, userId, evidence_objects: [], provenance: {} },
  })),
}));

describe("Evidence intake background interpretation", () => {
  it("atomically stages one deterministic package/review after provider media interpretation", async () => {
    const completed = vi.fn(async (input) => input);
    const store = fixtureStore({ completeInterpretation: completed });
    const handler = createEvidenceIntakeInterpretationWorkerHandler({ store, loadArtifact: vi.fn(async () => ({})), now: () => new Date("2026-09-01T06:00:00Z") });
    await handler(message());
    expect(completed).toHaveBeenCalledOnce();
    const input = completed.mock.calls[0][0];
    expect(input.evidencePackage.provenance.intake_receipt_id).toBe("intake-one");
    expect(input.review.id).toBe("evidence_review_01999999999979998999999999999999");
    expect(input.review.intakeReceiptId).toBe("intake-one");
  });

  it("carries the exact Logger target through interpretation into the durable review", async () => {
    const completed = vi.fn(async (input) => input);
    const target = "training|authoritative|training_logger_draft_draft-123";
    const handler = createEvidenceIntakeInterpretationWorkerHandler({
      store: fixtureStore({
        claimInterpretation: async () => ({ outcome: "claimed", receipt: receipt({
          expectedEvidenceType: "training",
          recoveryContext: { kind: "training_logger_support", targetTrainingDraftId: "draft-123", targetTrainingSessionCanonicalId: target },
        }) }),
        completeInterpretation: completed,
      }),
      loadArtifact: vi.fn(async () => ({})),
    });
    await handler(message());
    expect(completed.mock.calls[0][0].review.interpretedEvidence.review_metadata).toMatchObject({
      targetTrainingDraftId: "draft-123",
      targetTrainingSessionCanonicalId: target,
    });
  });

  it("carries dismissed-predecessor lineage into the immutable replacement package and review", async () => {
    const completed = vi.fn(async (input) => input);
    const recoveryContext = {
      kind: "dismissed_evidence_replacement",
      predecessorSubmissionIdentity: "01999999-9999-7999-8999-999999999998",
    };
    const handler = createEvidenceIntakeInterpretationWorkerHandler({
      store: fixtureStore({
        claimInterpretation: async () => ({ outcome: "claimed", receipt: receipt({
          expectedEvidenceType: "activity_day",
          recoveryContext,
        }) }),
        completeInterpretation: completed,
      }),
      loadArtifact: vi.fn(async () => ({})),
    });

    await handler(message());

    const persisted = completed.mock.calls[0][0];
    expect(persisted.evidencePackage.review_metadata).toMatchObject({ recoveryContext });
    expect(persisted.review.interpretedEvidence.review_metadata).toMatchObject({ recoveryContext });
    expect(persisted.review.status).toBe("pending");
  });

  it("preserves Founder-confirmed Progress Photo identities and resolves the scheduled goal server-side", async () => {
    const recoveryContext = {
      kind: "progress_photo_session",
      timeOfDay: "morning",
      originalUnedited: true,
      conditions: { timeOfDay: "morning", fasted: true, postWorkout: false, pump: false },
      photoIdentities: [{
        orientation: "front", contractionState: "relaxed", poseVariant: "standard",
        poseId: "front-relaxed", identityStatus: "confirmed", userConfirmedIdentity: true,
      }],
    };
    const handler = createEvidenceIntakeInterpretationWorkerHandler({
      store: fixtureStore({
        claimInterpretation: async () => ({ outcome: "claimed", receipt: receipt({
          expectedEvidenceType: "photo_session", recoveryContext,
        }) }),
        loadPhotoSessionContext: async () => ({
          goals: [{ id: "goal-visible-abs", status: "active" }],
          executionItems: [{ linkedEvidenceType: "progress_photo", linkedGoalId: "goal-visible-abs", occurrenceDate: "2026-08-31" }],
        }),
      }),
      loadArtifact: vi.fn(async () => ({})),
    });

    await handler(message());

    expect(interpretEvidenceIntakeStoredArtifacts).toHaveBeenCalledWith(expect.objectContaining({
      photoSessionContext: expect.objectContaining({
        kind: "progress_photo_session",
        photoIdentities: recoveryContext.photoIdentities,
        conditions: recoveryContext.conditions,
        captureMetadata: expect.objectContaining({ status: "reviewed", timeOfDay: "morning" }),
        goalRelationship: expect.objectContaining({ status: "resolved" }),
      }),
    }));
  });

  it("post-completion replay performs no interpretation or staging", async () => {
    const completeInterpretation = vi.fn();
    const loadArtifact = vi.fn();
    const readCanonicalExerciseRegistry = vi.fn();
    const handler = createEvidenceIntakeInterpretationWorkerHandler({
      store: fixtureStore({ claimInterpretation: async () => ({ outcome: "completed", receipt: receipt() }), completeInterpretation }),
      loadArtifact,
      readCanonicalExerciseRegistry,
    });
    await expect(handler(message())).resolves.toMatchObject({ outcome: "completed" });
    expect(loadArtifact).not.toHaveBeenCalled();
    expect(completeInterpretation).not.toHaveBeenCalled();
    expect(readCanonicalExerciseRegistry).not.toHaveBeenCalled();
  });

  it("hydrates the bounded canonical registry before a fresh-process interpretation", async () => {
    const order = [];
    interpretEvidenceIntakeStoredArtifacts.mockImplementationOnce(async ({ submissionId, userId }) => {
      order.push("interpret");
      return {
        evidencePackage: {
          package_id: `${submissionId}_images`,
          userId,
          evidence_objects: [],
          provenance: {},
        },
      };
    });
    const handler = createEvidenceIntakeInterpretationWorkerHandler({
      store: fixtureStore(),
      loadArtifact: vi.fn(async () => ({})),
      readCanonicalExerciseRegistry: vi.fn(async () => order.push("registry")),
    });

    await handler(message());

    expect(order).toEqual(["registry", "interpret"]);
  });

  it("keeps device OCR on the machine-extraction channel rather than typed evidence", async () => {
    const clientExtractedText = "Move 841 cal Exercise 111 min Stand 15 hr";
    const handler = createEvidenceIntakeInterpretationWorkerHandler({
      store: fixtureStore({
        claimInterpretation: async () => ({
          outcome: "claimed",
          receipt: receipt({ expectedEvidenceType: "activity_day", clientExtractedText }),
        }),
      }),
      loadArtifact: vi.fn(async () => ({})),
    });

    await handler(message());

    expect(interpretEvidenceIntakeStoredArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({ clientExtractedText })
    );
    expect(interpretEvidenceIntakeStoredArtifacts.mock.calls.at(-1)[0].typedEvidence)
      .toBeUndefined();
  });

  it("wires the production worker to the bounded canonicalExerciseLibrary store", () => {
    const source = fs.readFileSync("scripts/runFoundationWorker.mjs", "utf8");
    const intakeHandler = source.slice(
      source.indexOf("[EVIDENCE_INTAKE_INTERPRETATION_TOPIC]"),
      source.indexOf("PROVIDER_MIGRATION_DRY_RUN_ENABLED")
    );
    expect(source).toContain("createPhase4CanonicalRecordStore");
    expect(intakeHandler).toContain('collection: "canonicalExerciseLibrary"');
    expect(intakeHandler).toContain("hydrateCanonicalTrainingExerciseRegistry");
    expect(intakeHandler).not.toContain("loadCanonicalRuntime");
  });

  it("durably records interpretation failure without creating package/review state", async () => {
    const failInterpretation = vi.fn(async () => undefined);
    const completeInterpretation = vi.fn();
    const handler = createEvidenceIntakeInterpretationWorkerHandler({
      store: fixtureStore({
        failInterpretation,
        completeInterpretation,
        loadPhotoSessionContext: async () => { throw Object.assign(new Error("model unavailable"), { code: "MODEL_UNAVAILABLE" }); },
      }),
      loadArtifact: vi.fn(),
    });
    await expect(handler(message())).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
    expect(failInterpretation).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "MODEL_UNAVAILABLE" }));
    expect(completeInterpretation).not.toHaveBeenCalled();
  });
});

function message() { return { messageId: "worker-message", workerId: "worker-one", payloadVersion: "1", payload: { intakeReceiptId: "intake-one" }, assertLease: vi.fn() }; }
function fixtureStore(overrides = {}) { return { claimInterpretation: async () => ({ outcome: "claimed", receipt: receipt() }), loadPhotoSessionContext: async () => ({ goals: [], executionItems: [] }), completeInterpretation: vi.fn(), failInterpretation: vi.fn(), ...overrides }; }
function receipt(overrides = {}) { return { id: "intake-one", submissionIdentity: "01999999-9999-7999-8999-999999999999", ownerUserId: "owner", effectiveDate: "2026-08-31", expectedEvidenceType: "auto", source: "universal_intake", storedArtifacts: [{ ordinal: 1 }], clientExtractedText: null, recoveryContext: null, createdAt: "2026-09-01T05:43:24.105Z", ...overrides }; }
