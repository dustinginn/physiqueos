import { describe, expect, it } from "vitest";
import {
  MORNING_EVIDENCE_RECOVERY_STATUSES,
  MORNING_RECONCILIATION_ITEM_KINDS,
  createMorningEvidenceRecoverySelection,
} from "./MorningEvidenceRecoveryService";

const DATE = "2026-08-08";

function selection(overrides = {}) {
  return createMorningEvidenceRecoverySelection({
    canonicalObjects: [],
    executionItems: [],
    previousDate: DATE,
    priorityItems: [],
    protocolVersions: [],
    protocols: [],
    reviews: [],
    ...overrides,
  });
}

function photoPriority() {
  return {
    id: "reminder_weekly_progress_photo_set",
    occurrenceKey: `reminder_weekly_progress_photo_set:${DATE}`,
    occurrenceDate: DATE,
    title: "Progress Photos",
    linkedEvidenceType: "progress_photo",
  };
}

function dailyProtocol(type) {
  return {
    protocols: [{
      id: `protocol_${type}`,
      currentVersionId: `protocol_${type}_v1`,
      protocolType: type,
      status: "active",
    }],
    protocolVersions: [{
      id: `protocol_${type}_v1`,
      protocolId: `protocol_${type}`,
      status: "active",
      effectiveAt: "2026-08-01",
      expectations: [{
        cadence: "daily",
        includedEvidenceTypes: [type === "activity" ? "activity_day" : "nutrition_day"],
      }],
    }],
  };
}

function transitionedActivityProtocol() {
  const sourceVersionId = "protocol_activity_source_v2";
  return {
    protocols: [{
      id: "protocol_activity_successor",
      currentVersionId: "protocol_activity_successor_v1",
      protocolType: "activity",
      category: "activity",
      status: "active",
      activationProvenance: { sourceVersionId },
    }],
    protocolVersions: [{
      id: "protocol_activity_successor_v1",
      protocolId: "protocol_activity_successor",
      status: "active",
      effectiveAt: "2026-08-01",
      change: { previousVersionId: sourceVersionId },
    }, {
      id: sourceVersionId,
      protocolId: "protocol_activity_source",
      status: "active",
      effectiveAt: "2026-07-11",
      expectations: [{
        cadence: "daily",
        includedEvidenceTypes: ["activity_day", "training_session"],
      }],
    }],
  };
}

function canonical(type, payload = {}) {
  return {
    canonicalId: `${type}|${DATE}|one`,
    evidence_type: type,
    lastObservedAt: DATE,
    payload: { evidence_type: type, observed_at: DATE, ...payload },
    quality: { status: "active" },
  };
}

function pending(type, id = `review_${type}`) {
  return {
    id,
    status: "pending",
    createdAt: "2026-08-09T08:00:00.000Z",
    interpretedEvidence: {
      evidence_objects: [{ id: `${id}_object`, evidence_type: type, observed_at: DATE }],
    },
  };
}

describe("Morning evidence recovery projection", () => {
  it("turns a scheduled missing photo priority into Upload Photos, not outcome reconciliation", () => {
    const result = selection({ priorityItems: [photoPriority()] });
    expect(result.executionReconciliationItems).toEqual([]);
    expect(result.evidenceRecoveryItems[0]).toMatchObject({
      kind: MORNING_RECONCILIATION_ITEM_KINDS.EVIDENCE,
      evidenceType: "photo_session",
      status: MORNING_EVIDENCE_RECOVERY_STATUSES.MISSING,
      primaryAction: { label: "Upload Photos" },
    });
    expect(result.evidenceRecoveryItems[0].primaryAction.href).toContain(
      "date=2026-08-08"
    );
  });

  it("resumes the exact pending photo review and suppresses the duplicate upload action", () => {
    const result = selection({
      priorityItems: [photoPriority()],
      reviews: [pending("photo_session", "review_photo")],
    });
    expect(result.evidenceRecoveryItems[0]).toMatchObject({
      pendingReviewId: "review_photo",
      status: MORNING_EVIDENCE_RECOVERY_STATUSES.PENDING_CONFIRMATION,
      primaryAction: { label: "Resume review" },
    });
    expect(result.evidenceRecoveryItems[0].primaryAction.href)
      .toContain("/evidence/review/review_photo?");
  });

  it("suppresses a scheduled photo prompt after canonical confirmation", () => {
    const result = selection({
      canonicalObjects: [canonical("photo_session")],
      priorityItems: [photoPriority()],
    });
    expect(result.evidenceRecoveryItems).toEqual([]);
  });

  it("does not prompt for photos when they were not scheduled", () => {
    expect(selection().evidenceRecoveryItems).toEqual([]);
  });

  it("requires a dated Training execution and ignores flexible weekly preference", () => {
    const protocol = { id: "training_protocol", protocolType: "training", category: "training", status: "active" };
    const flexible = selection({
      protocols: [protocol],
      executionItems: [{
        id: "weekly_training",
        active: true,
        cadence: { type: "weekly" },
        linkedProtocolId: protocol.id,
        preferredSchedule: { daysOfWeek: ["saturday"] },
      }],
    });
    const dated = selection({
      protocols: [protocol],
      executionItems: [{
        id: "dated_training",
        active: true,
        linkedProtocolId: protocol.id,
        occurrenceDate: DATE,
      }],
    });
    expect(flexible.evidenceRecoveryItems).toEqual([]);
    expect(dated.evidenceRecoveryItems[0]).toMatchObject({
      evidenceType: "training",
      status: "missing",
      primaryAction: { label: "Add Workout" },
    });
  });

  it("classifies pending, complete, and partial Training without calling partial missing", () => {
    const pendingResult = selection({ reviews: [pending("training")] });
    const completeResult = selection({
      canonicalObjects: [canonical("training", {
        exercises: [{ id: "curl" }],
        metadata: { activity_type: "Strength Training" },
      })],
      executionItems: [{ id: "dated", type: "training", occurrenceDate: DATE }],
    });
    const partialResult = selection({
      canonicalObjects: [canonical("training", {
        exercises: [],
        metadata: { activity_type: "Traditional Strength Training" },
      })],
    });
    expect(pendingResult.evidenceRecoveryItems[0].status)
      .toBe("pending_confirmation");
    expect(completeResult.evidenceRecoveryItems).toEqual([]);
    expect(partialResult.evidenceRecoveryItems[0]).toMatchObject({
      status: "present_partial",
      primaryAction: { label: "Add workout details" },
    });
  });

  it.each([
    ["activity", "activity_day", "Add Activity"],
    ["nutrition", "nutrition", "Add Nutrition"],
  ])("classifies expected %s as missing, pending, then present", (protocolType, evidenceType, action) => {
    const protocol = dailyProtocol(protocolType);
    const missing = selection(protocol);
    const waiting = selection({ ...protocol, reviews: [pending(evidenceType)] });
    const present = selection({
      ...protocol,
      canonicalObjects: [canonical(evidenceType, evidenceType === "nutrition"
        ? { metadata: { completeness: "complete" } }
        : {})],
    });
    expect(missing.evidenceRecoveryItems[0]).toMatchObject({
      evidenceType,
      status: "missing",
      primaryAction: { label: action },
    });
    expect(waiting.evidenceRecoveryItems[0]).toMatchObject({
      evidenceType,
      status: "pending_confirmation",
      primaryAction: { label: "Resume review" },
    });
    expect(present.evidenceRecoveryItems).toEqual([]);
  });

  it("inherits the production-shape daily Activity expectation through accepted protocol lineage", () => {
    const missing = selection(transitionedActivityProtocol());
    expect(missing.evidenceRecoveryItems).toEqual([
      expect.objectContaining({
        evidenceType: "activity_day",
        date: DATE,
        status: "missing",
        primaryAction: expect.objectContaining({ label: "Add Activity" }),
        recoveryContext: {
          date: DATE,
          expectedEvidenceType: "activity_day",
          recoveryKey: `protocol:activity_day:${DATE}`,
          returnTo: "/check-in/morning",
        },
      }),
    ]);
    expect(missing.evidenceRecoveryItems[0].primaryAction.href)
      .toContain("date=2026-08-08");
    expect(missing.evidenceRecoveryItems[0].primaryAction.href)
      .toContain("expectedEvidenceType=activity_day");
  });

  it("resumes a pending Activity review without duplicating Add Activity for inherited expectations", () => {
    const result = selection({
      ...transitionedActivityProtocol(),
      reviews: [pending("activity_day", "review_activity")],
    });
    expect(result.evidenceRecoveryItems).toEqual([
      expect.objectContaining({
        evidenceType: "activity_day",
        status: "pending_confirmation",
        pendingReviewId: "review_activity",
        primaryAction: expect.objectContaining({ label: "Resume review" }),
      }),
    ]);
  });

  it("suppresses inherited Activity recovery after canonical ActivityDay confirmation", () => {
    const result = selection({
      ...transitionedActivityProtocol(),
      canonicalObjects: [canonical("activity_day")],
    });
    expect(result.evidenceRecoveryItems).toEqual([]);
  });

  it("does not infer a daily expectation from an Activity protocol with explicit no expectations", () => {
    const protocol = transitionedActivityProtocol();
    protocol.protocolVersions[0].expectations = [];
    expect(selection(protocol).evidenceRecoveryItems).toEqual([]);
  });

  it("keeps ordinary reminders as explicit execution reconciliation", () => {
    const result = selection({
      priorityItems: [{
        id: "foam_roll",
        occurrenceKey: `foam_roll:${DATE}`,
        occurrenceDate: DATE,
        title: "Foam Roll",
      }],
    });
    expect(result.items[0].kind).toBe("execution_reconciliation");
  });

  it("does not infer evidence recovery from an execution reminder type alone", () => {
    const result = selection({
      priorityItems: [{
        id: "strength_session",
        occurrenceKey: `strength_session:${DATE}`,
        occurrenceDate: DATE,
        title: "Strength Session",
        type: "workout",
      }],
    });
    expect(result.evidenceRecoveryItems).toEqual([]);
    expect(result.executionReconciliationItems[0]).toMatchObject({
      id: "strength_session",
      kind: "execution_reconciliation",
    });
  });
});
