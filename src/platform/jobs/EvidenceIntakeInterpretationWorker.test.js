import { describe, expect, it, vi } from "vitest";
import { createEvidenceIntakeInterpretationWorkerHandler } from "./EvidenceIntakeInterpretationWorker.js";

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

  it("post-completion replay performs no interpretation or staging", async () => {
    const completeInterpretation = vi.fn();
    const loadArtifact = vi.fn();
    const handler = createEvidenceIntakeInterpretationWorkerHandler({
      store: fixtureStore({ claimInterpretation: async () => ({ outcome: "completed", receipt: receipt() }), completeInterpretation }),
      loadArtifact,
    });
    await expect(handler(message())).resolves.toMatchObject({ outcome: "completed" });
    expect(loadArtifact).not.toHaveBeenCalled();
    expect(completeInterpretation).not.toHaveBeenCalled();
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
function receipt() { return { id: "intake-one", submissionIdentity: "01999999-9999-7999-8999-999999999999", ownerUserId: "owner", effectiveDate: "2026-08-31", expectedEvidenceType: "auto", source: "universal_intake", storedArtifacts: [{ ordinal: 1 }], typedEvidence: null, recoveryContext: null, createdAt: "2026-09-01T05:43:24.105Z" }; }
