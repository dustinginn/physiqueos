import { describe, expect, it } from "vitest";
import { parseNativeEvidenceIntakeRequest } from "./NativeEvidenceIntakeRequest.js";

const ID = "01999999-9999-7999-8999-999999999999";

describe("Native production Evidence intake", () => {
  it("accepts an exact BodySpec PDF submission identity", async () => {
    const file = new File([Buffer.from("%PDF-1.7\nbody")], "BodySpec.pdf", { type: "application/pdf" });
    const result = await parseNativeEvidenceIntakeRequest(request("dexa_scan", file));
    expect(result).toMatchObject({ submissionIdentity: ID, effectiveDate: "2026-09-11", expectedEvidenceType: "dexa_scan" });
    expect(result.artifactManifest.files).toEqual([
      { ordinal: 1, name: "BodySpec.pdf", size: file.size, type: "application/pdf" },
    ]);
  });

  it.each(["nutrition", "activity_day", "training"])("accepts a valid %s screenshot", async (type) => {
    const file = new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], "screen.png", { type: "image/png" });
    await expect(parseNativeEvidenceIntakeRequest(request(type, file)))
      .resolves.toMatchObject({ expectedEvidenceType: type, files: [file] });
  });

  it("accepts a Founder-confirmed Progress Photo set without inferring pose identity from filenames", async () => {
    const first = png("IMG_5001.png");
    const second = png("IMG_5002.png");
    const body = baseBody("photo_session");
    body.set("originalUnedited", "true");
    body.set("photoSessionTimeOfDay", "morning");
    body.set("photoSessionFasted", "true");
    body.set("photoSessionPostWorkout", "false");
    body.set("photoSessionPump", "false");
    body.set("photoIdentitiesJson", JSON.stringify([
      { orientation: "front", contractionState: "relaxed", poseVariant: "standard", identityStatus: "confirmed", userConfirmedIdentity: true, goalValidationRole: "primary" },
      { orientation: "rear", contractionState: "flexed", poseVariant: "double_biceps", identityStatus: "confirmed", userConfirmedIdentity: true },
    ]));
    body.append("evidenceFiles", first);
    body.append("evidenceFiles", second);

    await expect(parseNativeEvidenceIntakeRequest(nativeRequest(body))).resolves.toMatchObject({
      expectedEvidenceType: "photo_session",
      recoveryContext: {
        kind: "progress_photo_session",
        timeOfDay: "morning",
        originalUnedited: true,
        conditions: { timeOfDay: "morning", fasted: true, postWorkout: false, pump: false },
        photoIdentities: [
          expect.objectContaining({ poseId: "front-relaxed", sourceOrder: 0, goalValidationRole: "primary" }),
          expect.objectContaining({ poseId: "back-flexed", sourceOrder: 1, goalValidationRole: "supporting" }),
        ],
      },
    });
  });

  it("rejects a Progress Photo set without explicit session and pose confirmations", async () => {
    const body = baseBody("photo_session");
    body.append("evidenceFiles", png("front.png"));
    await expect(parseNativeEvidenceIntakeRequest(nativeRequest(body)))
      .rejects.toMatchObject({ code: "PHOTO_ORIGINAL_CONFIRMATION_REQUIRED" });

    body.set("originalUnedited", "true");
    body.set("photoSessionTimeOfDay", "morning");
    body.set("photoIdentitiesJson", JSON.stringify([
      { orientation: "front", contractionState: "relaxed", poseVariant: "standard", identityStatus: "suggested", userConfirmedIdentity: false },
    ]));
    await expect(parseNativeEvidenceIntakeRequest(nativeRequest(body)))
      .rejects.toMatchObject({ code: "PHOTO_IDENTITY_UNCONFIRMED" });
  });

  it("persists an exact Logger target only for Training supporting evidence", async () => {
    const file = new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], "screen.png", { type: "image/png" });
    const draftId = "draft-123";
    const target = `training|authoritative|training_logger_draft_${draftId}`;
    const training = request("training", file);
    const body = await training.formData();
    body.set("targetTrainingDraftId", draftId);
    body.set("targetTrainingSessionCanonicalId", target);
    const targeted = new Request(training.url, { method: "POST", headers: {
      authorization: `Bearer ${"x".repeat(43)}`, "idempotency-key": ID,
    }, body });
    await expect(parseNativeEvidenceIntakeRequest(targeted)).resolves.toMatchObject({
      recoveryContext: {
        kind: "training_logger_support", targetTrainingDraftId: draftId,
        targetTrainingSessionCanonicalId: target,
      },
    });

    const activity = request("activity_day", file);
    const wrongBody = await activity.formData();
    wrongBody.set("targetTrainingDraftId", draftId);
    wrongBody.set("targetTrainingSessionCanonicalId", target);
    await expect(parseNativeEvidenceIntakeRequest(new Request(activity.url, {
      method: "POST", headers: { authorization: `Bearer ${"x".repeat(43)}`, "idempotency-key": ID }, body: wrongBody,
    }))).rejects.toMatchObject({ code: "TRAINING_TARGET_CONTEXT_INVALID" });
  });

  it("preserves a dismissed predecessor as explicit replacement lineage", async () => {
    const file = new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], "screen.png", { type: "image/png" });
    const predecessor = "02999999-9999-7999-8999-999999999999";
    const replacement = request("activity_day", file);
    const body = await replacement.formData();
    body.set("replacementForSubmissionIdentity", predecessor);
    await expect(parseNativeEvidenceIntakeRequest(new Request(replacement.url, {
      method: "POST", headers: { authorization: `Bearer ${"x".repeat(43)}`, "idempotency-key": ID }, body,
    }))).resolves.toMatchObject({
      submissionIdentity: ID,
      recoveryContext: {
        kind: "dismissed_evidence_replacement",
        predecessorSubmissionIdentity: predecessor,
      },
    });
  });

  it("rejects malformed or self-referential replacement lineage", async () => {
    const file = new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], "screen.png", { type: "image/png" });
    for (const predecessor of ["not-a-submission-identity", ID]) {
      const replacement = request("activity_day", file);
      const body = await replacement.formData();
      body.set("replacementForSubmissionIdentity", predecessor);
      await expect(parseNativeEvidenceIntakeRequest(new Request(replacement.url, {
        method: "POST", headers: { authorization: `Bearer ${"x".repeat(43)}`, "idempotency-key": ID }, body,
      }))).rejects.toMatchObject({ code: "EVIDENCE_REPLACEMENT_IDENTITY_INVALID", status: 400 });
    }
  });

  it("rejects mismatched idempotency identity and disguised screenshots", async () => {
    const badIdentity = request("nutrition", new File(["not png"], "screen.png", { type: "image/png" }), "different");
    await expect(parseNativeEvidenceIntakeRequest(badIdentity)).rejects.toMatchObject({ code: "IDEMPOTENCY_IDENTITY_MISMATCH" });
    const badImage = request("activity_day", new File(["not png"], "screen.png", { type: "image/png" }));
    await expect(parseNativeEvidenceIntakeRequest(badImage)).rejects.toMatchObject({ code: "SCREENSHOT_INVALID" });
  });

  it("accepts local OCR only for explicit Activity and preserves it as non-authoritative interpreter input", async () => {
    const file = new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], "screen.png", { type: "image/png" });
    const activity = request("activity_day", file, ID, "Move 948/700 CAL Exercise 67/30 MIN Stand 13/12 HRS");
    await expect(parseNativeEvidenceIntakeRequest(activity)).resolves.toMatchObject({
      expectedEvidenceType: "activity_day",
      clientExtractedText: "Move 948/700 CAL Exercise 67/30 MIN Stand 13/12 HRS",
      files: [file],
    });
    const nutrition = request("nutrition", file, ID, "Move 948/700 CAL Exercise 67/30 MIN Stand 13/12 HRS");
    await expect(parseNativeEvidenceIntakeRequest(nutrition)).rejects.toMatchObject({
      code: "CLIENT_EXTRACTION_CONTEXT_INVALID", status: 400,
    });
  });
});

function request(type, file, key = ID, clientExtractedText = null) {
  const body = baseBody(type);
  if (clientExtractedText) body.set("clientExtractedText", clientExtractedText);
  body.append("evidenceFiles", file);
  return nativeRequest(body, key);
}

function baseBody(type) {
  const body = new FormData();
  body.set("submissionIdentity", ID);
  body.set("effectiveDate", "2026-09-11");
  body.set("expectedEvidenceType", type);
  return body;
}

function nativeRequest(body, key = ID) {
  return new Request("https://physiqueos.example/api/v1/native/evidence/intakes", {
    method: "POST", headers: { authorization: `Bearer ${"x".repeat(43)}`, "idempotency-key": key }, body,
  });
}

function png(name) {
  return new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], name, { type: "image/png" });
}
