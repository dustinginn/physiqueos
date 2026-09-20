import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createNativeProductionContractService } from "./NativeProductionContractService.js";
import { nativeProductionContractManifest } from "./nativeProductionContractManifest.js";
import { parseNativeStagedEvidenceIntakeRequest, parseStagedArtifactPath } from "./NativeStagedEvidenceIntakeRequest.js";
import { toEvidenceIntakeProblem } from "../../domain/services/EvidenceIntakeProblemMapping.js";
import { createEvidenceIntakeInterpretationWorkerHandler } from "../../platform/jobs/EvidenceIntakeInterpretationWorker.js";
import { createStoredEvidenceArtifactDescriptor, interpretEvidenceIntakeStoredArtifacts } from "../../domain/services/EvidenceIntakeService.js";
import { createPhotoSessionReadModels } from "../../domain/services/CanonicalPhotoSessionReadService.js";
import { createAuthenticationPrincipal } from "../auth/principal.js";
import { stagedArtifactId, STAGED_EVIDENCE_MANIFEST_VERSION } from "../../domain/services/StagedEvidenceArtifactManifest.js";
import { HEIC_BYTES, JPEG_BYTES } from "../../domain/services/ImageContainerDetection.test.js";
import { EVIDENCE_INTAKE_INTERPRETATION_PAYLOAD_VERSION } from "../../domain/services/EvidenceIntakeBackgroundWork.js";

const OWNER = "user_founder_001";
const ID = "01999999-9999-7999-8999-999999999999";
const SHA = "a".repeat(64);
const principal = (userId = OWNER, scopes = ["founder:read", "founder:write"]) =>
  createAuthenticationPrincipal({ userId, deviceId: "d", sessionId: "s", scopes });

function service(overrides = {}) {
  const evidenceIntake = { stage: vi.fn(async (input) => ({ intakeId: "intake-1", input })), storeStagedArtifact: vi.fn(async (input) => ({ intakeId: input.intakeId, artifactId: input.artifactId })), getStatus: vi.fn(), accept: vi.fn() };
  return { evidenceIntake, service: createNativeProductionContractService({
    authenticate: overrides.authenticate ?? vi.fn(async () => principal()),
    ownerUserId: OWNER, readers: {}, executeCommand: vi.fn(), confirmEvidenceReview: vi.fn(), evidenceIntake, openMedia: vi.fn(),
  }) };
}
const request = () => new Request("https://physiqueos.example/api/v1/native/evidence/intakes/staged", { headers: { authorization: `Bearer ${"x".repeat(43)}` } });

function stagedBody(overrides = {}) {
  return {
    submissionIdentity: ID, effectiveDate: "2026-09-19", expectedEvidenceType: "photo_session",
    photoSession: { originalUnedited: true, timeOfDay: "evening", fasted: null, postWorkout: true, pump: false,
      photoIdentities: [{ orientation: "front", contractionState: "relaxed", poseVariant: "standard", identityStatus: "confirmed", userConfirmedIdentity: true }] },
    artifacts: [
      { artifactId: stagedArtifactId(ID, 1), ordinal: 1, role: "original", fileName: "IMG_1.heic", mimeType: "image/heic", byteLength: 3_000_000, sha256: SHA },
      { artifactId: stagedArtifactId(ID, 2), ordinal: 2, role: "analysis_derivative", derivativeOf: stagedArtifactId(ID, 1), fileName: "IMG_1-analysis.jpg", mimeType: "image/jpeg", byteLength: 900_000, sha256: "b".repeat(64) },
    ],
    ...overrides,
  };
}
function jsonRequest(body, headers = {}) {
  return new Request("https://physiqueos.example/api/v1/native/evidence/intakes/staged", {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": ID, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("staged intake declaration parsing", () => {
  it("produces the same frozen photo-session context the multipart transport produces", async () => {
    const input = await parseNativeStagedEvidenceIntakeRequest(jsonRequest(stagedBody()));
    expect(input.artifactManifest.version).toBe(STAGED_EVIDENCE_MANIFEST_VERSION);
    expect(input.recoveryContext).toMatchObject({
      kind: "progress_photo_session", timeOfDay: "evening", originalUnedited: true,
      conditions: { timeOfDay: "evening", fasted: null, postWorkout: true, pump: false },
      photoIdentities: [{ orientation: "front", contractionState: "relaxed", poseVariant: "standard", identityStatus: "confirmed", userConfirmedIdentity: true, sourceOrder: 0, order: 0, goalValidationRole: "supporting", tags: [] }],
    });
    expect(Object.isFrozen(input.recoveryContext)).toBe(true);
    expect(input.recoveryContext.replacement).toBeUndefined();
  });

  it("counts identities against originals only, and enforces every Build 43 session gate", async () => {
    const reject = async (body, code, headers) => {
      const problem = toEvidenceIntakeProblem(await parseNativeStagedEvidenceIntakeRequest(jsonRequest(body, headers)).catch((error) => error));
      expect(problem.code).toBe(code);
      return problem;
    };
    await reject(stagedBody({ photoSession: { ...stagedBody().photoSession, photoIdentities: [] } }), "PHOTO_IDENTITIES_INVALID");
    await reject(stagedBody({ photoSession: { ...stagedBody().photoSession, originalUnedited: false } }), "PHOTO_ORIGINAL_CONFIRMATION_REQUIRED");
    await reject(stagedBody({ photoSession: { ...stagedBody().photoSession, timeOfDay: "night" } }), "PHOTO_SESSION_TIME_REQUIRED");
    await reject(stagedBody({ photoSession: { ...stagedBody().photoSession, photoIdentities: [{ orientation: "front", contractionState: "relaxed", poseVariant: "standard", identityStatus: "review", userConfirmedIdentity: false }] } }), "PHOTO_IDENTITY_UNCONFIRMED");
    await reject(stagedBody({ photoSession: null }), "PHOTO_SESSION_REQUIRED");
    await reject(stagedBody({ expectedEvidenceType: "nutrition" }), "EVIDENCE_TYPE_UNAVAILABLE");
    await reject(stagedBody({ effectiveDate: "2026-02-30" }), "CONTRACT_VALIDATION_FAILED");
    await reject(stagedBody({ submissionIdentity: "not-a-uuid" }), "EVIDENCE_INTAKE_SUBMISSION_ID_INVALID");
    await reject(stagedBody(), "IDEMPOTENCY_IDENTITY_MISMATCH", { "idempotency-key": "02999999-9999-7999-8999-999999999999" });
    await reject(stagedBody({ replacementForSubmissionIdentity: ID }), "EVIDENCE_REPLACEMENT_IDENTITY_INVALID");
    const manifestProblem = await reject(stagedBody({ artifacts: stagedBody().artifacts.slice(0, 1) }), "STAGED_DERIVATIVE_REQUIRED");
    expect(manifestProblem.status).toBe(400);
    expect(manifestProblem.fieldErrors).toEqual([{ field: "artifacts[0]", code: "invalid", detail: expect.stringMatching(/derivative/) }]);
    const malformed = await parseNativeStagedEvidenceIntakeRequest(jsonRequest("{\"submissionIdentity\":")).catch((error) => error);
    expect(malformed).toMatchObject({ status: 400, code: "REQUEST_INVALID" });
    const huge = await parseNativeStagedEvidenceIntakeRequest(jsonRequest({ ...stagedBody(), padding: "p".repeat(70_000) })).catch((error) => error);
    expect(huge).toMatchObject({ status: 413, code: "REQUEST_TOO_LARGE" });
  });

  it("links a dismissed predecessor as lineage without disturbing the photo session context", async () => {
    const predecessor = "02999999-9999-7999-8999-999999999999";
    const input = await parseNativeStagedEvidenceIntakeRequest(jsonRequest(stagedBody({ replacementForSubmissionIdentity: predecessor })));
    expect(input.recoveryContext.replacement).toEqual({ kind: "dismissed_evidence_replacement", predecessorSubmissionIdentity: predecessor });
    expect(input.recoveryContext.kind).toBe("progress_photo_session");
  });

  it("only routes well-formed intake and artifact identities", () => {
    expect(parseStagedArtifactPath({ intakeId: `evidence_intake_${ID}`, artifactId: stagedArtifactId(ID, 12).toUpperCase() })).toEqual({ intakeId: `evidence_intake_${ID}`, artifactId: stagedArtifactId(ID, 12) });
    expect(() => parseStagedArtifactPath({ intakeId: "evidence_intake_x", artifactId: stagedArtifactId(ID, 1) })).toThrowError(expect.objectContaining({ status: 404, code: "EVIDENCE_INTAKE_NOT_FOUND" }));
    expect(() => parseStagedArtifactPath({ intakeId: `evidence_intake_${ID}`, artifactId: "../../etc/passwd" })).toThrowError(expect.objectContaining({ status: 404, code: "EVIDENCE_INTAKE_ARTIFACT_UNKNOWN" }));
    expect(() => parseStagedArtifactPath({ intakeId: `evidence_intake_${ID}`, artifactId: "artifact_01999999999979998999999999999999_0" })).toThrowError(expect.objectContaining({ status: 404 }));
  });

  it("declares under an uppercase Foundation UUID with the lowercase ids Native sends, and the PUT path resolves the same ids", async () => {
    const FOUNDATION_ID = "B5A63452-E7B0-469C-A634-38A08137716C";
    const lower = "artifact_b5a63452e7b0469ca63438a08137716c_";
    const artifacts = [
      { artifactId: `${lower}1`, ordinal: 1, role: "original", fileName: "progress-photo-1.dng", mimeType: "image/x-adobe-dng", byteLength: 46_247_587, sha256: SHA },
      { artifactId: `${lower}2`, ordinal: 2, role: "analysis_derivative", derivativeOf: `${lower}1`, fileName: "progress-photo-1-analysis.jpg", mimeType: "image/jpeg", byteLength: 648_223, sha256: "b".repeat(64) },
    ];
    const parsed = await parseNativeStagedEvidenceIntakeRequest(jsonRequest(stagedBody({ submissionIdentity: FOUNDATION_ID, artifacts }), { "idempotency-key": FOUNDATION_ID }));
    expect(parsed.submissionIdentity).toBe(FOUNDATION_ID);
    expect(parsed.artifactManifest.files.map((file) => [file.artifactId, file.derivativeOf])).toEqual([[`${lower}1`, null], [`${lower}2`, `${lower}1`]]);
    // Intake identity stays case-preserving; only the artifact segment is canonical lowercase.
    const intakeId = `evidence_intake_${FOUNDATION_ID}`;
    expect(parseStagedArtifactPath({ intakeId, artifactId: `${lower}2` })).toEqual({ intakeId, artifactId: `${lower}2` });
    expect(parseStagedArtifactPath({ intakeId, artifactId: `${lower}2`.toUpperCase() })).toEqual({ intakeId, artifactId: `${lower}2` });
    // The pre-fix derivation (case preserved) is refused with the exact Build 45 failure code.
    const upper = artifacts.map((entry) => ({ ...entry, artifactId: entry.artifactId.toUpperCase().replace("ARTIFACT_", "artifact_"), derivativeOf: entry.derivativeOf?.toUpperCase().replace("ARTIFACT_", "artifact_") ?? entry.derivativeOf }));
    const problem = toEvidenceIntakeProblem(await parseNativeStagedEvidenceIntakeRequest(jsonRequest(stagedBody({ submissionIdentity: FOUNDATION_ID, artifacts: upper }), { "idempotency-key": FOUNDATION_ID })).catch((error) => error));
    expect(problem).toMatchObject({ status: 400, code: "STAGED_ARTIFACT_IDENTITY_INVALID" });
  });
});

describe("staged intake contract service", () => {
  it("authorizes founder:write and forwards owner-bound input", async () => {
    const current = service();
    const result = await current.service.stageEvidenceIntake({ request: request(), input: { submissionIdentity: ID } });
    expect(result).toMatchObject({ intakeId: "intake-1", input: { submissionIdentity: ID, ownerUserId: OWNER } });
    await expect(service({ authenticate: vi.fn(async () => principal(OWNER, ["founder:read"])) }).service.stageEvidenceIntake({ request: request(), input: {} }))
      .rejects.toMatchObject({ status: 403 });
    await expect(service({ authenticate: vi.fn(async () => principal("someone-else")) }).service.stageEvidenceIntake({ request: request(), input: {} }))
      .rejects.toMatchObject({ status: 404, code: "RESOURCE_NOT_FOUND" });
  });

  it("authorizes before the artifact body is read, and requires a body reader", async () => {
    const current = service();
    const readBody = vi.fn();
    await expect(current.service.storeStagedEvidenceArtifact({ request: request(), intakeId: "intake-1", artifactId: "artifact-1", readBody })).resolves.toMatchObject({ intakeId: "intake-1", artifactId: "artifact-1" });
    expect(current.evidenceIntake.storeStagedArtifact).toHaveBeenCalledWith(expect.objectContaining({ intakeId: "intake-1", artifactId: "artifact-1", readBody }));
    const denied = service({ authenticate: vi.fn(async () => principal("someone-else")) });
    await expect(denied.service.storeStagedEvidenceArtifact({ request: request(), intakeId: "intake-1", artifactId: "artifact-1", readBody })).rejects.toMatchObject({ status: 404 });
    expect(denied.evidenceIntake.storeStagedArtifact).not.toHaveBeenCalled();
    await expect(current.service.storeStagedEvidenceArtifact({ request: request(), intakeId: "intake-1", artifactId: "artifact-1" })).rejects.toMatchObject({ status: 404 });
    const without = service();
    delete without.evidenceIntake.stage;
    await expect(without.service.stageEvidenceIntake({ request: request(), input: {} })).rejects.toMatchObject({ status: 404 });
  });

  it("publishes the staged-media capability in the contract manifest without changing existing writes", () => {
    expect(nativeProductionContractManifest.evidenceIntake.stagedMedia).toMatchObject({
      createEndpoint: "/api/v1/native/evidence/intakes/staged",
      artifactEndpoint: "/api/v1/native/evidence/intakes/{intakeId}/artifacts/{artifactId}",
      artifactMethod: "PUT",
      manifestVersion: STAGED_EVIDENCE_MANIFEST_VERSION,
      evidenceTypes: ["photo_session"],
      originalTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/x-adobe-dng"],
      derivativeType: "image/jpeg",
      originalMaximumBytes: 32 * 1024 * 1024,
      rawOriginalMaximumBytes: 48 * 1024 * 1024,
      originalMaximumBytesByType: {
        "image/jpeg": 32 * 1024 * 1024, "image/png": 32 * 1024 * 1024, "image/webp": 32 * 1024 * 1024,
        "image/heic": 32 * 1024 * 1024, "image/heif": 32 * 1024 * 1024, "image/x-adobe-dng": 48 * 1024 * 1024,
      },
      derivativeMaximumBytes: 8 * 1024 * 1024,
      maximumOriginals: 24,
      heicDerivativeRequired: true,
      derivativeRequiredTypes: ["image/heic", "image/heif", "image/x-adobe-dng"],
      serverDerivativeGeneration: false,
    });
    expect(nativeProductionContractManifest.evidenceIntake.createEndpoint).toBe("/api/v1/native/evidence/intakes");
    expect(nativeProductionContractManifest.writes.map((item) => item.commandType)).toContain("healthkit.observations.ingest.v1");
    expect(nativeProductionContractManifest.healthKitIngestion.maximumBatchSize).toBe(100);
    const openapi = JSON.parse(fs.readFileSync(new URL("../../../openapi/physiqueos-v1.json", import.meta.url), "utf8"));
    expect(openapi.paths["/native/evidence/intakes/staged"].post.operationId).toBe("stageNativeEvidenceIntake");
    expect(openapi.paths["/native/evidence/intakes/{intakeId}/artifacts/{artifactId}"].put.operationId).toBe("storeNativeStagedEvidenceArtifact");
  });

  it("maps every staged-transport failure to a typed problem", () => {
    const map = (code) => toEvidenceIntakeProblem(Object.assign(new Error(code), { code }));
    expect(map("EVIDENCE_INTAKE_ARTIFACT_HASH_MISMATCH")).toMatchObject({ status: 400 });
    expect(map("EVIDENCE_INTAKE_ARTIFACT_CONTAINER_INVALID")).toMatchObject({ status: 400 });
    expect(map("EVIDENCE_INTAKE_NOT_FOUND")).toMatchObject({ status: 404 });
    expect(map("EVIDENCE_INTAKE_ARTIFACT_UNKNOWN")).toMatchObject({ status: 404 });
    expect(map("EVIDENCE_INTAKE_TRANSPORT_CONFLICT")).toMatchObject({ status: 409 });
    expect(map("EVIDENCE_INTAKE_MEDIA_ALREADY_COMPLETE")).toMatchObject({ status: 409 });
    expect(map("EVIDENCE_INTAKE_STAGING_UNAVAILABLE")).toMatchObject({ status: 503 });
    expect(map("SOMETHING_UNKNOWN")).not.toHaveProperty("status");
  });
});

describe("analysis derivatives stay companions of their originals", () => {
  const original = (overrides = {}) => ({ ordinal: 1, id: stagedArtifactId(ID, 1), role: "original", derivativeOf: null, objectId: "obj-1", storagePath: "media://obj-1", fileName: "progress-photo-1.heic", mimeType: "image/heic", byteLength: HEIC_BYTES.length, sha256: SHA, uploadedAt: "2026-09-19T23:00:00.000Z", ...overrides });
  const derivative = (overrides = {}) => ({ ordinal: 2, id: stagedArtifactId(ID, 2), role: "analysis_derivative", derivativeOf: stagedArtifactId(ID, 1), objectId: "obj-2", storagePath: "media://obj-2", fileName: "progress-photo-1-analysis.jpg", mimeType: "image/jpeg", byteLength: JPEG_BYTES.length, sha256: "b".repeat(64), uploadedAt: "2026-09-19T23:00:00.000Z", ...overrides });

  it("gives the worker originals only, each carrying its derivative reference", async () => {
    const loadArtifact = vi.fn(async ({ artifact }) => createStoredEvidenceArtifactDescriptor({
      buffer: artifact.mimeType === "image/heic" ? HEIC_BYTES : JPEG_BYTES, capturedAt: artifact.uploadedAt, file: { name: artifact.fileName, type: artifact.mimeType }, id: artifact.id, mimeType: artifact.mimeType,
      observedDate: "2026-09-19", relativePath: artifact.storagePath, analysisRelativePath: artifact.analysisArtifact?.storagePath ?? null, analysisMimeType: artifact.analysisArtifact?.mimeType ?? null,
    }));
    const completed = vi.fn(async (input) => input);
    const receipt = {
      id: `evidence_intake_${ID}`, submissionIdentity: ID, ownerUserId: OWNER, effectiveDate: "2026-09-19", expectedEvidenceType: "photo_session", source: "universal_intake",
      createdAt: "2026-09-19T23:00:00.000Z", mediaState: "stored", interpretationState: "processing", storedArtifacts: [original(), derivative(), original({ ordinal: 3, id: stagedArtifactId(ID, 3), objectId: "obj-3", storagePath: "media://obj-3", fileName: "progress-photo-3.jpg", mimeType: "image/jpeg", sha256: "c".repeat(64) })],
      recoveryContext: { kind: "progress_photo_session", timeOfDay: "morning", originalUnedited: true, conditions: { timeOfDay: "morning", fasted: true, postWorkout: null, pump: null }, photoIdentities: [
        { orientation: "front", contractionState: "relaxed", poseVariant: "standard", poseId: "front_relaxed", identityStatus: "confirmed", userConfirmedIdentity: true, sourceOrder: 0, order: 0, tags: [], goalValidationRole: "supporting" },
        { orientation: "rear", contractionState: "flexed", poseVariant: "standard", poseId: "rear_flexed", identityStatus: "confirmed", userConfirmedIdentity: true, sourceOrder: 1, order: 1, tags: [], goalValidationRole: "supporting" },
      ] },
    };
    const handler = createEvidenceIntakeInterpretationWorkerHandler({
      store: { claimInterpretation: async () => ({ outcome: "claimed", receipt }), completeInterpretation: completed, failInterpretation: vi.fn(), loadPhotoSessionContext: async () => ({ goals: [], executionItems: [] }) },
      loadArtifact, now: () => new Date("2026-09-19T23:05:00.000Z"),
    });
    await handler({ messageId: "m", workerId: "w", payloadVersion: EVIDENCE_INTAKE_INTERPRETATION_PAYLOAD_VERSION, payload: { intakeReceiptId: receipt.id } });
    expect(loadArtifact).toHaveBeenCalledTimes(2);
    expect(loadArtifact.mock.calls.map(([{ artifact }]) => artifact.id)).toEqual([stagedArtifactId(ID, 1), stagedArtifactId(ID, 3)]);
    expect(loadArtifact.mock.calls[0][0].artifact.analysisArtifact).toMatchObject({ id: stagedArtifactId(ID, 2), storagePath: "media://obj-2" });
    expect(loadArtifact.mock.calls[1][0].artifact.analysisArtifact).toBeUndefined();
    const object = completed.mock.calls[0][0].evidencePackage.evidence_objects.find((item) => item.evidence_type === "photo_session");
    expect(object.photos).toHaveLength(2);
    expect(object.metadata.photo_count).toBe(2);
    expect(object.photos[0]).toMatchObject({ mime_type: "image/heic", storage_path: "media://obj-1", analysis_storage_path: "media://obj-2", analysis_mime_type: "image/jpeg", source_hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(object.photos[1]).not.toHaveProperty("analysis_storage_path");
    expect(completed.mock.calls[0][0].evidencePackage.provenance.source_artifacts.map((item) => item.id)).not.toContain(stagedArtifactId(ID, 2));
  });

  it("never materializes an HEIC data URL, but keeps the original hash and reference", () => {
    const heic = createStoredEvidenceArtifactDescriptor({ buffer: HEIC_BYTES, capturedAt: "2026-09-19T23:00:00.000Z", file: { name: "IMG.heic", type: "image/heic" }, id: "a", mimeType: "image/heic", observedDate: "2026-09-19", relativePath: "media://obj-1", analysisRelativePath: "media://obj-2" });
    expect(heic.dataUrl).toBeNull();
    expect(heic).toMatchObject({ analysisRelativePath: "media://obj-2", analysisMimeType: "image/jpeg", relativePath: "media://obj-1" });
    const jpeg = createStoredEvidenceArtifactDescriptor({ buffer: JPEG_BYTES, capturedAt: "2026-09-19T23:00:00.000Z", file: { name: "IMG.jpg", type: "image/jpeg" }, id: "b", mimeType: "image/jpeg", observedDate: "2026-09-19", relativePath: "media://obj-3" });
    expect(jpeg.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(jpeg).not.toHaveProperty("analysisRelativePath");
  });

  it("displays and compares an HEIC canonical photo through its derivative while identity stays the original", () => {
    const session = { canonicalId: "session_2026-09-19", evidence_type: "photo_session", lastObservedAt: "2026-09-19", quality: { status: "active" }, provenance: { source_artifact_refs: ["front", "rear"] }, payload: { captureDate: "2026-09-19", completionState: "incomplete", synthesisStatus: "pending", sessionConditions: {}, photos: [
      { canonicalPhotoId: "front", view: "front", pose: "relaxed", status: "active", storage_path: "media://019a0000-0000-7000-8000-000000000001", mime_type: "image/heic", analysis_storage_path: "media://019a0000-0000-7000-8000-000000000002", analysis_mime_type: "image/jpeg", source_hash: SHA },
      { canonicalPhotoId: "rear", view: "back", pose: "relaxed", status: "active", storage_path: "media://019a0000-0000-7000-8000-000000000003", mime_type: "image/jpeg", analysis_storage_path: "media://019a0000-0000-7000-8000-000000000004" },
    ] } };
    const [model] = createPhotoSessionReadModels({ canonicalObjects: [session] });
    const front = model.views.find((view) => view.canonicalViewId === "front");
    const rear = model.views.find((view) => view.canonicalViewId === "rear");
    expect(front.imageHref).toBe("/api/private-evidence/media/019a0000-0000-7000-8000-000000000002");
    expect(front.imageReference).toBe("media://019a0000-0000-7000-8000-000000000002");
    // A directly displayable original ignores any derivative reference.
    expect(rear.imageHref).toBe("/api/private-evidence/media/019a0000-0000-7000-8000-000000000003");
    expect(model.thumbnailHref).toBe("/api/private-evidence/media/019a0000-0000-7000-8000-000000000002");
  });

  it("routes the vision interpreter to the derivative reference when one exists", () => {
    const source = fs.readFileSync(new URL("../../app/evidence/review/[reviewId]/actions.js", import.meta.url), "utf8");
    expect(source).toContain("function analysisMediaReference(photo)");
    expect(source).toContain("loadPhotoAnalysisMedia(analysisMediaReference(photo) ?? {");
    expect(source.match(/loadPhotoAnalysisMedia\(analysisMediaReference\(photo\) \?\? \{/g)).toHaveLength(2);
  });

  it("keeps interpretation of a directly-consumable set byte-identical to before", async () => {
    const result = await interpretEvidenceIntakeStoredArtifacts({
      capturedAt: "2026-09-19T23:00:00.000Z", evidenceDate: "2026-09-19", expectedEvidenceType: "photo_session",
      loadArtifact: async ({ artifact }) => createStoredEvidenceArtifactDescriptor({ buffer: JPEG_BYTES, capturedAt: artifact.uploadedAt, file: { name: artifact.fileName, type: artifact.mimeType }, id: artifact.id, mimeType: artifact.mimeType, observedDate: "2026-09-19", relativePath: artifact.storagePath }),
      sourceArtifacts: [{ ordinal: 1, id: "artifact_x_1", storagePath: "media://obj-9", fileName: "progress-photo-1.jpg", mimeType: "image/jpeg", uploadedAt: "2026-09-19T23:00:00.000Z" }],
      submissionId: "evidence_submission_x", userId: OWNER,
      photoSessionContext: { kind: "progress_photo_session", timeOfDay: "morning", originalUnedited: true, conditions: { timeOfDay: "morning", fasted: null, postWorkout: null, pump: null }, photoIdentities: [{ orientation: "front", contractionState: "relaxed", poseVariant: "standard", poseId: "front_relaxed", identityStatus: "confirmed", userConfirmedIdentity: true, sourceOrder: 0, order: 0, tags: [], goalValidationRole: "supporting" }] },
    });
    const object = result.evidencePackage.evidence_objects[0];
    expect(object.photos[0]).toMatchObject({ mime_type: "image/jpeg", storage_path: "media://obj-9" });
    expect(object.photos[0]).not.toHaveProperty("analysis_storage_path");
  });
});
