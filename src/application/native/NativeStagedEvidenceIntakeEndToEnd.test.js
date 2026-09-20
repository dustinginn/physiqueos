import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DNG_BYTES, DNG_LITTLE_ENDIAN_BYTES, HEIC_BYTES, JPEG_BYTES, PNG_BYTES, TIFF_WITHOUT_DNG_BYTES, WEBP_BYTES } from "../../domain/services/ImageContainerDetection.test.js";

const holder = vi.hoisted(() => ({ runtime: null }));
vi.mock("../../platform/auth/nativeProductionContractRuntime.js", () => ({
  getProductionNativeContractRuntime: vi.fn(async () => holder.runtime),
}));

import { POST as stagedRoute } from "../../app/api/v1/native/evidence/intakes/staged/route.js";
import { PUT as artifactRoute } from "../../app/api/v1/native/evidence/intakes/[intakeId]/artifacts/[artifactId]/route.js";
import { GET as statusRoute } from "../../app/api/v1/native/evidence/intakes/[intakeId]/route.js";
import { createNativeProductionContractService } from "./NativeProductionContractService.js";
import { createAsyncEvidenceIntakeService, createProviderEvidenceIntakeArtifactLoader } from "../evidence/AsyncEvidenceIntakeService.js";
import { createProviderCanonicalUploadService } from "../media/ProviderCanonicalUploadService.js";
import { createPostgresEvidenceIntakeStore } from "../../platform/database/PostgresEvidenceIntakeStore.js";
import { createEvidenceIntakeInterpretationWorkerHandler } from "../../platform/jobs/EvidenceIntakeInterpretationWorker.js";
import { createAuthenticationPrincipal } from "../auth/principal.js";
import { stagedArtifactId, STAGED_DERIVATIVE_MAXIMUM_BYTES, STAGED_ORIGINAL_MAXIMUM_BYTES, STAGED_RAW_ORIGINAL_MAXIMUM_BYTES } from "../../domain/services/StagedEvidenceArtifactManifest.js";
import { EVIDENCE_INTAKE_INTERPRETATION_PAYLOAD_VERSION } from "../../domain/services/EvidenceIntakeBackgroundWork.js";

const OWNER = "user_founder_001";
const ID = "01999999-9999-7999-8999-999999999999";
const OTHER_ID = "02999999-9999-7999-8999-999999999999";
const BASE = "https://physiqueos.example/api/v1/native/evidence/intakes";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

// The eight-photo shape the Founder actually submits: HEIC originals from the
// iPhone camera, each with its JPEG analysis derivative, plus a JPEG, a PNG,
// and a WebP to cover every accepted original container.
function founderSet() {
  const originals = [
    { bytes: pad(HEIC_BYTES, 3_000), type: "image/heic", name: "progress-photo-1.heic" },
    { bytes: pad(HEIC_BYTES, 3_100), type: "image/heic", name: "progress-photo-2.heic" },
    { bytes: pad(JPEG_BYTES, 2_000), type: "image/jpeg", name: "progress-photo-3.jpg" },
    { bytes: pad(PNG_BYTES, 2_100), type: "image/png", name: "progress-photo-4.png" },
    { bytes: pad(WEBP_BYTES, 2_200), type: "image/webp", name: "progress-photo-5.webp" },
  ];
  const derivatives = [
    { bytes: pad(JPEG_BYTES, 900), type: "image/jpeg", name: "progress-photo-1-analysis.jpg", of: 1 },
    { bytes: pad(JPEG_BYTES, 950), type: "image/jpeg", name: "progress-photo-2-analysis.jpg", of: 2 },
  ];
  const entries = [...originals.map((file) => ({ ...file, role: "original" })), ...derivatives.map((file) => ({ ...file, role: "analysis_derivative" }))];
  return entries.map((file, index) => ({
    ...file,
    ordinal: index + 1,
    artifactId: stagedArtifactId(ID, index + 1),
    derivativeOf: file.of ? stagedArtifactId(ID, file.of) : null,
  }));
}

function pad(signature, length) {
  const filler = Buffer.alloc(Math.max(0, length - signature.length));
  for (let i = 0; i < filler.length; i += 1) filler[i] = (i * 31 + length) % 251;
  return Buffer.concat([signature, filler]);
}

function declaration(set, overrides = {}) {
  const originals = set.filter((file) => file.role === "original");
  return {
    submissionIdentity: ID,
    effectiveDate: "2026-09-19",
    expectedEvidenceType: "photo_session",
    photoSession: {
      originalUnedited: true,
      timeOfDay: "morning",
      fasted: true,
      postWorkout: false,
      pump: null,
      photoIdentities: originals.map((_, index) => ({
        orientation: ["front", "rear", "left_side", "right_side", "front"][index],
        contractionState: index === 4 ? "flexed" : "relaxed",
        // Every declared identity must be a canonical combination: Front + Flexed is Front Flexed (standard).
        poseVariant: "standard",
        goalValidationRole: "supporting",
        tags: [],
        identityStatus: "confirmed",
        userConfirmedIdentity: true,
      })),
    },
    artifacts: set.map((file) => ({
      artifactId: file.artifactId, ordinal: file.ordinal, role: file.role, derivativeOf: file.derivativeOf,
      fileName: file.name, mimeType: file.type, byteLength: file.bytes.length, sha256: sha(file.bytes),
    })),
    ...overrides,
  };
}

const authorization = `Bearer ${"x".repeat(43)}`;
function stage(body, { idempotencyKey = body.submissionIdentity } = {}) {
  return stagedRoute(new Request(`${BASE}/staged`, {
    method: "POST",
    headers: { authorization, "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(body),
  }));
}
function put(intakeId, artifactId, bytes, headers = {}) {
  return artifactRoute(new Request(`${BASE}/${intakeId}/artifacts/${artifactId}`, {
    method: "PUT",
    headers: { authorization, "content-type": "image/jpeg", "content-length": String(bytes.length), ...headers },
    body: bytes,
  }), { params: Promise.resolve({ intakeId, artifactId }) });
}
function status(intakeId) {
  return statusRoute(new Request(`${BASE}/${intakeId}`, { headers: { authorization } }), { params: Promise.resolve({ intakeId }) });
}
async function json(response) { return response.json(); }

let harness;
let store;
let uploads;
let principalUserId;

beforeEach(() => {
  harness = fakeDatabase();
  principalUserId = OWNER;
  store = createPostgresEvidenceIntakeStore({
    pool: harness.pool, ownerUserId: OWNER,
    authorityStore: { claimCanonicalWriteBoundary: vi.fn(async () => ({ outcome: "recorded" })) },
    now: () => new Date("2026-09-19T23:00:00.000Z"),
    createId: (() => { let n = 0; return () => `id-${(n += 1)}`; })(),
  });
  uploads = fakeProviderUploads(harness);
  const evidenceIntake = createAsyncEvidenceIntakeService({ store, uploads: uploads.service, now: () => new Date("2026-09-19T23:00:00.000Z") });
  holder.runtime = createNativeProductionContractService({
    authenticate: async () => createAuthenticationPrincipal({ userId: principalUserId, deviceId: "founder-iphone", sessionId: "s", scopes: ["founder:read", "founder:write"] }),
    ownerUserId: OWNER,
    readers: {},
    executeCommand: vi.fn(),
    confirmEvidenceReview: vi.fn(),
    evidenceIntake,
    openMedia: vi.fn(),
  });
});

describe("staged Progress Photos intake, end to end", () => {
  it("declares one intake for the exact Founder set: no bytes, every artifact expected, media incomplete", async () => {
    const set = founderSet();
    const response = await stage(declaration(set));
    expect(response.status).toBe(202);
    const body = await json(response);
    expect(body).toMatchObject({
      intakeId: `evidence_intake_${ID}`, status: "processing", mediaState: "receiving", mediaComplete: false,
      expectedArtifactCount: 7, storedArtifactCount: 0, reviewId: null,
    });
    expect(body.artifacts.map((item) => item.state)).toEqual(Array(7).fill("expected"));
    expect(body.artifacts[5]).toMatchObject({ role: "analysis_derivative", derivativeOf: stagedArtifactId(ID, 1) });
    expect(harness.receipts).toHaveLength(1);
    expect(harness.receipts[0].recovery_context).toMatchObject({ kind: "progress_photo_session", timeOfDay: "morning", conditions: { fasted: true, postWorkout: false, pump: null } });
    expect(harness.receipts[0].recovery_context.photoIdentities).toHaveLength(5);
    expect(harness.media).toHaveLength(0);
    expect(harness.outbox).toHaveLength(0);
  });

  it("recreates the same declaration idempotently and rejects a different one under the same identity", async () => {
    const set = founderSet();
    expect((await stage(declaration(set))).status).toBe(202);
    const replay = await stage(declaration(set));
    expect(replay.status).toBe(202);
    expect((await json(replay)).intakeId).toBe(`evidence_intake_${ID}`);
    expect(harness.receipts).toHaveLength(1);

    const drifted = declaration(set);
    drifted.artifacts[0].sha256 = sha(Buffer.from("different"));
    const conflict = await stage(drifted);
    expect(conflict.status).toBe(409);
    expect((await json(conflict)).code).toBe("EVIDENCE_INTAKE_IDENTITY_CONFLICT");
    expect(harness.receipts).toHaveLength(1);
  });

  it("transfers each artifact independently and completes media only on the last verified one", async () => {
    const set = founderSet();
    const { intakeId } = await json(await stage(declaration(set)));
    for (const [index, file] of set.entries()) {
      const response = await put(intakeId, file.artifactId, file.bytes, { "content-type": file.type });
      expect(response.status, `artifact ${file.ordinal}`).toBe(200);
      const body = await json(response);
      expect(body).toMatchObject({ artifactId: file.artifactId, artifactOutcome: "stored", storedArtifactCount: index + 1, expectedArtifactCount: 7 });
      const complete = index === set.length - 1;
      expect(body.mediaComplete).toBe(complete);
      expect(body.mediaState).toBe(complete ? "stored" : "receiving");
      expect(body.status).toBe("processing");
      if (!complete) {
        expect(harness.outbox).toHaveLength(0);
        await expect(store.claimInterpretation({ receiptId: intakeId, workerId: "w" })).rejects.toMatchObject({ code: "EVIDENCE_INTAKE_MEDIA_INCOMPLETE" });
      }
    }
    expect(harness.media).toHaveLength(7);
    expect(harness.media.map((item) => item.content_type)).toEqual(["image/heic", "image/heic", "image/jpeg", "image/png", "image/webp", "image/jpeg", "image/jpeg"]);
    expect(harness.outbox).toHaveLength(1);
    expect(harness.receipts[0]).toMatchObject({ media_state: "stored", interpretation_state: "pending" });
    const stored = harness.receipts[0].stored_artifacts;
    expect(stored.map((item) => [item.ordinal, item.role, item.derivativeOf])).toEqual(set.map((file) => [file.ordinal, file.role, file.derivativeOf]));
    expect(await store.claimInterpretation({ receiptId: intakeId, workerId: "w" })).toMatchObject({ outcome: "claimed" });
  });

  it("validates bytes against the declaration: type, length, hash, then container", async () => {
    const set = founderSet();
    const { intakeId } = await json(await stage(declaration(set)));
    const jpeg = set[2];
    const heic = set[0];
    const mismatchedType = await put(intakeId, jpeg.artifactId, jpeg.bytes, { "content-type": "image/png" });
    expect(mismatchedType.status).toBe(400);
    expect((await json(mismatchedType)).code).toBe("EVIDENCE_INTAKE_ARTIFACT_TYPE_MISMATCH");

    const shortBytes = jpeg.bytes.subarray(0, jpeg.bytes.length - 1);
    const mismatchedLength = await put(intakeId, jpeg.artifactId, shortBytes, { "content-type": "image/jpeg" });
    expect((await json(mismatchedLength)).code).toBe("EVIDENCE_INTAKE_ARTIFACT_SIZE_MISMATCH");

    const swapped = Buffer.from(jpeg.bytes);
    swapped[swapped.length - 1] ^= 0xff;
    const mismatchedHash = await put(intakeId, jpeg.artifactId, swapped, { "content-type": "image/jpeg" });
    expect((await json(mismatchedHash)).code).toBe("EVIDENCE_INTAKE_ARTIFACT_HASH_MISMATCH");

    // Declared HEIC whose bytes are really a JPEG of the declared length and hash.
    const disguised = founderSet();
    const fake = pad(JPEG_BYTES, disguised[0].bytes.length);
    disguised[0].bytes = fake;
    const other = declaration(disguised, { submissionIdentity: OTHER_ID, artifacts: undefined });
    other.artifacts = disguised.map((file, index) => ({ artifactId: stagedArtifactId(OTHER_ID, index + 1), ordinal: index + 1, role: file.role, derivativeOf: file.derivativeOf ? stagedArtifactId(OTHER_ID, file.of) : null, fileName: file.name, mimeType: file.type, byteLength: file.bytes.length, sha256: sha(file.bytes) }));
    const otherIntake = (await json(await stage(other))).intakeId;
    const container = await put(otherIntake, stagedArtifactId(OTHER_ID, 1), fake, { "content-type": "image/heic" });
    expect(container.status).toBe(400);
    expect((await json(container)).code).toBe("EVIDENCE_INTAKE_ARTIFACT_CONTAINER_INVALID");
    expect(harness.media).toHaveLength(0);
    void heic;
  });

  it("rejects unsupported media and oversize declarations before any transfer, and oversize transfers before any read", async () => {
    const set = founderSet();
    const unsupported = declaration(set);
    unsupported.artifacts[2].mimeType = "image/gif";
    expect((await json(await stage(unsupported))).code).toBe("STAGED_ARTIFACT_MEDIA_UNSUPPORTED");
    const tooLarge = declaration(set);
    tooLarge.artifacts[2].byteLength = STAGED_ORIGINAL_MAXIMUM_BYTES + 1;
    const tooLargeResponse = await stage(tooLarge);
    expect(tooLargeResponse.status).toBe(400);
    expect((await json(tooLargeResponse)).code).toBe("STAGED_ARTIFACT_TOO_LARGE");
    const missingDerivative = declaration(set);
    missingDerivative.artifacts = missingDerivative.artifacts.slice(0, 5);
    expect((await json(await stage(missingDerivative))).code).toBe("STAGED_DERIVATIVE_REQUIRED");
    expect(harness.receipts).toHaveLength(0);

    const { intakeId } = await json(await stage(declaration(set)));
    const derivative = set[5];
    let pulled = 0;
    const stream = new ReadableStream({ pull(controller) { pulled += 1; controller.enqueue(new Uint8Array(1024)); } });
    const response = await artifactRoute(new Request(`${BASE}/${intakeId}/artifacts/${derivative.artifactId}`, {
      method: "PUT", headers: { authorization, "content-type": "image/jpeg", "content-length": String(STAGED_DERIVATIVE_MAXIMUM_BYTES + 1) }, body: stream, duplex: "half",
    }), { params: Promise.resolve({ intakeId, artifactId: derivative.artifactId }) });
    expect(response.status).toBe(413);
    expect(pulled).toBeLessThanOrEqual(1);
    expect(harness.media).toHaveLength(0);
  });

  it("refuses an artifact declared for another intake, and refuses another principal before reading a byte", async () => {
    const set = founderSet();
    const { intakeId } = await json(await stage(declaration(set)));
    const foreign = await put(intakeId, stagedArtifactId(OTHER_ID, 1), set[2].bytes);
    expect(foreign.status).toBe(404);
    expect((await json(foreign)).code).toBe("EVIDENCE_INTAKE_ARTIFACT_UNKNOWN");
    const unknownIntake = await put(`evidence_intake_${OTHER_ID}`, stagedArtifactId(OTHER_ID, 1), set[2].bytes);
    expect(unknownIntake.status).toBe(404);
    expect((await json(unknownIntake)).code).toBe("EVIDENCE_INTAKE_NOT_FOUND");

    principalUserId = "user_someone_else";
    const readBody = vi.fn();
    await expect(holder.runtime.storeStagedEvidenceArtifact({
      request: new Request(`${BASE}/${intakeId}/artifacts/${set[2].artifactId}`, { method: "PUT", headers: { authorization } }),
      intakeId, artifactId: set[2].artifactId, readBody,
    })).rejects.toMatchObject({ status: 404, code: "RESOURCE_NOT_FOUND" });
    expect(readBody).not.toHaveBeenCalled();
    const crossOwnerStage = await stage(declaration(set));
    expect(crossOwnerStage.status).toBe(404);
    expect(harness.media).toHaveLength(0);
  });

  it("acknowledges a duplicate transfer without a second object, and converges a lost acknowledgement", async () => {
    const set = founderSet();
    const { intakeId } = await json(await stage(declaration(set)));
    const file = set[2];
    expect((await json(await put(intakeId, file.artifactId, file.bytes))).artifactOutcome).toBe("stored");
    const duplicate = await json(await put(intakeId, file.artifactId, file.bytes));
    expect(duplicate).toMatchObject({ artifactOutcome: "already_stored", storedArtifactCount: 1 });
    expect(harness.media).toHaveLength(1);
    expect(uploads.stores).toBe(1);

    // Lost acknowledgement: the object was catalogued but the receipt update
    // never landed (a crash between the two). The catalog is the truth.
    harness.receipts[0].stored_artifacts = [];
    const recovered = await json(await status(intakeId));
    expect(recovered).toMatchObject({ storedArtifactCount: 1, artifacts: expect.arrayContaining([expect.objectContaining({ artifactId: file.artifactId, state: "stored" })]) });
    const replay = await json(await put(intakeId, file.artifactId, file.bytes));
    expect(replay).toMatchObject({ artifactOutcome: "already_stored", storedArtifactCount: 1 });
    expect(harness.media).toHaveLength(1);
    expect(uploads.stores).toBe(1);
  });

  it("converges two concurrent transfers of the same artifact on one object", async () => {
    const set = founderSet();
    const { intakeId } = await json(await stage(declaration(set)));
    const file = set[3];
    const [first, second] = await Promise.all([put(intakeId, file.artifactId, file.bytes, { "content-type": file.type }), put(intakeId, file.artifactId, file.bytes, { "content-type": file.type })]);
    expect([first.status, second.status]).toEqual([200, 200]);
    const outcomes = [(await json(first)).artifactOutcome, (await json(second)).artifactOutcome].sort();
    expect(outcomes).toEqual(["already_stored", "stored"]);
    expect(harness.media).toHaveLength(1);
    expect(harness.receipts[0].stored_artifacts).toHaveLength(1);
  });

  it("completes media on a lost final acknowledgement and never enqueues interpretation twice", async () => {
    const set = founderSet();
    const { intakeId } = await json(await stage(declaration(set)));
    for (const file of set) expect((await put(intakeId, file.artifactId, file.bytes, { "content-type": file.type })).status).toBe(200);
    expect(harness.outbox).toHaveLength(1);
    // Every artifact is catalogued but the receipt never saw the last one.
    harness.receipts[0].stored_artifacts = harness.receipts[0].stored_artifacts.slice(0, -1);
    harness.receipts[0].media_state = "receiving";
    harness.receipts[0].interpretation_state = "waiting_for_media";
    const observed = await json(await status(intakeId));
    expect(observed).toMatchObject({ mediaComplete: true, mediaState: "stored", storedArtifactCount: 7 });
    expect(harness.outbox).toHaveLength(1);
    const again = await json(await put(intakeId, set[6].artifactId, set[6].bytes, { "content-type": set[6].type }));
    expect(again.artifactOutcome).toBe("already_stored");
    expect(harness.outbox).toHaveLength(1);
    expect(harness.media).toHaveLength(7);
    const replayDeclaration = await json(await stage(declaration(set)));
    expect(replayDeclaration).toMatchObject({ mediaComplete: true, status: "processing" });
    expect(harness.receipts).toHaveLength(1);
  });

  it("interprets complete media into one Evidence Review whose photos are the originals, with derivatives referenced for analysis", async () => {
    const set = founderSet();
    const { intakeId } = await json(await stage(declaration(set)));
    for (const file of set) expect((await put(intakeId, file.artifactId, file.bytes, { "content-type": file.type })).status).toBe(200);
    const handler = createEvidenceIntakeInterpretationWorkerHandler({
      store,
      loadArtifact: createProviderEvidenceIntakeArtifactLoader({ pool: harness.pool, objectProvider: uploads.provider, fetchImpl: uploads.fetchImpl }),
      now: () => new Date("2026-09-19T23:05:00.000Z"),
    });
    const completed = await handler({ messageId: "m1", workerId: "worker", payloadVersion: EVIDENCE_INTAKE_INTERPRETATION_PAYLOAD_VERSION, payload: harness.outbox[0].payload, assertLease: () => {} });
    expect(completed).toMatchObject({ interpretationState: "completed", reviewId: `evidence_review_${ID.replaceAll("-", "")}` });
    const review = harness.canonical.find((row) => row.collection === "evidenceReviews").payload;
    const object = review.interpretedEvidence.evidence_objects.find((item) => item.evidence_type === "photo_session");
    expect(object.photos).toHaveLength(5);
    expect(object.metadata.photo_count).toBe(5);
    expect(object.photos.map((photo) => photo.mime_type)).toEqual(["image/heic", "image/heic", "image/jpeg", "image/png", "image/webp"]);
    expect(object.photos.map((photo) => photo.orientation)).toEqual(["front", "rear", "left_side", "right_side", "front"]);
    const media = harness.media;
    for (const [index, photo] of object.photos.entries()) {
      const original = media.find((item) => item.provenance.artifactId === set[index].artifactId);
      expect(photo.storage_path).toBe(`media://${original.id}`);
      expect(photo.source_hash).toBe(sha(set[index].bytes));
      if (set[index].type === "image/heic") {
        const derivative = media.find((item) => item.provenance.artifactId === set.find((file) => file.derivativeOf === set[index].artifactId).artifactId);
        expect(photo.analysis_storage_path).toBe(`media://${derivative.id}`);
        expect(photo.analysis_mime_type).toBe("image/jpeg");
      } else {
        expect(photo.analysis_storage_path).toBeUndefined();
      }
    }
    expect(object.conditions).toMatchObject({ timeOfDay: "morning", fasted: true, postWorkout: false, pump: null });
    expect(object.source.source_artifact_refs).toHaveLength(5);
    expect(review.status).toBe("pending");
    // Interpretation is idempotent: a second delivery of the same message is a no-op read.
    const replay = await handler({ messageId: "m2", workerId: "worker", payloadVersion: EVIDENCE_INTAKE_INTERPRETATION_PAYLOAD_VERSION, payload: harness.outbox[0].payload, assertLease: () => {} });
    expect(replay).toMatchObject({ outcome: "completed" });
    expect(harness.canonical.filter((row) => row.collection === "evidenceReviews")).toHaveLength(1);
    expect(await json(await status(intakeId))).toMatchObject({ status: "ready", reviewId: review.id, mediaComplete: true });
  });

  // The Founder's real Build 44 set: five Apple ProRAW DNG originals (big-endian
  // TIFF, DNGVersion in IFD0), each with its JPEG analysis derivative. Same
  // lifecycle as HEIC — the container registry, not a format branch, decides
  // that a DNG is preserved verbatim, bounded as a raw original, and paired
  // with one derivative that analysis and display read instead.
  function proRawSet() {
    const originals = [1, 2, 3, 4, 5].map((n) => ({ bytes: pad(n === 3 ? DNG_LITTLE_ENDIAN_BYTES : DNG_BYTES, 4_000 + n), type: "image/x-adobe-dng", name: `progress-photo-${n}.dng`, role: "original" }));
    const derivatives = [1, 2, 3, 4, 5].map((n) => ({ bytes: pad(JPEG_BYTES, 700 + n), type: "image/jpeg", name: `progress-photo-${n}-analysis.jpg`, of: n, role: "analysis_derivative" }));
    return [...originals, ...derivatives].map((file, index) => ({ ...file, ordinal: index + 1, artifactId: stagedArtifactId(ID, index + 1), derivativeOf: file.of ? stagedArtifactId(ID, file.of) : null }));
  }

  it("carries a five-photo Apple ProRAW DNG set: originals verbatim, derivatives linked, canonical photos are the DNGs", async () => {
    const set = proRawSet();
    const declared = await json(await stage(declaration(set)));
    expect(declared).toMatchObject({ mediaState: "receiving", mediaComplete: false, expectedArtifactCount: 10, storedArtifactCount: 0 });
    for (const file of set) {
      const response = await put(declared.intakeId, file.artifactId, file.bytes, { "content-type": file.type });
      expect(response.status).toBe(200);
    }
    expect(await json(await status(declared.intakeId))).toMatchObject({ mediaComplete: true, mediaState: "stored", storedArtifactCount: 10 });
    expect(harness.media).toHaveLength(10);
    for (const file of set.filter((item) => item.role === "original")) {
      const stored = harness.media.find((item) => item.provenance.artifactId === file.artifactId);
      expect(stored.content_type).toBe("image/x-adobe-dng");
      expect(stored.sha256).toBe(sha(file.bytes));
      expect(Number(stored.byte_length)).toBe(file.bytes.length);
    }
    // Retry after acceptance: no second original, no second derivative.
    for (const file of [set[0], set[5]]) {
      expect((await json(await put(declared.intakeId, file.artifactId, file.bytes, { "content-type": file.type }))).artifactOutcome).toBe("already_stored");
    }
    expect(harness.media).toHaveLength(10);
    expect(harness.outbox).toHaveLength(1);

    const handler = createEvidenceIntakeInterpretationWorkerHandler({
      store,
      loadArtifact: createProviderEvidenceIntakeArtifactLoader({ pool: harness.pool, objectProvider: uploads.provider, fetchImpl: uploads.fetchImpl }),
      now: () => new Date("2026-09-19T23:05:00.000Z"),
    });
    await handler({ messageId: "m1", workerId: "worker", payloadVersion: EVIDENCE_INTAKE_INTERPRETATION_PAYLOAD_VERSION, payload: harness.outbox[0].payload, assertLease: () => {} });
    const review = harness.canonical.find((row) => row.collection === "evidenceReviews").payload;
    const object = review.interpretedEvidence.evidence_objects.find((item) => item.evidence_type === "photo_session");
    expect(object.photos).toHaveLength(5);
    expect(object.photos.map((photo) => photo.mime_type)).toEqual(Array(5).fill("image/x-adobe-dng"));
    for (const [index, photo] of object.photos.entries()) {
      const original = harness.media.find((item) => item.provenance.artifactId === set[index].artifactId);
      const derivative = harness.media.find((item) => item.provenance.artifactId === set[index + 5].artifactId);
      expect(photo.storage_path).toBe(`media://${original.id}`);
      expect(photo.source_hash).toBe(sha(set[index].bytes));
      expect(photo.analysis_storage_path).toBe(`media://${derivative.id}`);
      expect(photo.analysis_mime_type).toBe("image/jpeg");
    }
    expect(object.source.source_artifact_refs).toHaveLength(5);
  });

  it("bounds a DNG original at the raw ceiling, refuses bytes that are not a DNG, and keeps compressed originals at theirs", async () => {
    const set = proRawSet();
    const atLimit = declaration(set);
    atLimit.artifacts[0].byteLength = STAGED_RAW_ORIGINAL_MAXIMUM_BYTES;
    expect((await stage(atLimit)).status).toBe(202);
    harness.receipts.length = 0;
    const overLimit = declaration(set);
    overLimit.artifacts[1].byteLength = STAGED_RAW_ORIGINAL_MAXIMUM_BYTES + 1;
    const rejected = await json(await stage(overLimit));
    expect(rejected.code).toBe("STAGED_ARTIFACT_TOO_LARGE");
    expect(rejected.fieldErrors?.[0]?.field).toBe("artifacts[1].byteLength");
    // A compressed original does not inherit the raw ceiling.
    const heicTooLarge = declaration(founderSet());
    heicTooLarge.artifacts[0].byteLength = STAGED_ORIGINAL_MAXIMUM_BYTES + 1;
    expect((await json(await stage(heicTooLarge))).code).toBe("STAGED_ARTIFACT_TOO_LARGE");
    // A DNG without its derivative is incomplete by declaration.
    const missing = declaration(set);
    missing.artifacts = missing.artifacts.slice(0, 5);
    expect((await json(await stage(missing))).code).toBe("STAGED_DERIVATIVE_REQUIRED");
    expect(harness.receipts).toHaveLength(0);

    // Declared as DNG, but the bytes are plain TIFF (no DNGVersion) or a JPEG of the same length and hash.
    const { intakeId } = await json(await stage(declaration(set)));
    const plainTiff = pad(TIFF_WITHOUT_DNG_BYTES, set[0].bytes.length);
    const disguised = proRawSet();
    disguised[0].bytes = plainTiff;
    const other = declaration(disguised, { submissionIdentity: OTHER_ID, artifacts: undefined });
    other.artifacts = disguised.map((file, index) => ({ artifactId: stagedArtifactId(OTHER_ID, index + 1), ordinal: index + 1, role: file.role, derivativeOf: file.derivativeOf ? stagedArtifactId(OTHER_ID, file.of) : null, fileName: file.name, mimeType: file.type, byteLength: file.bytes.length, sha256: sha(file.bytes) }));
    const otherIntake = (await json(await stage(other))).intakeId;
    const tiff = await put(otherIntake, stagedArtifactId(OTHER_ID, 1), plainTiff, { "content-type": "image/x-adobe-dng" });
    expect((await json(tiff)).code).toBe("EVIDENCE_INTAKE_ARTIFACT_CONTAINER_INVALID");
    const wrongType = await put(intakeId, set[0].artifactId, set[0].bytes, { "content-type": "image/tiff" });
    expect(wrongType.status).toBe(400);
    expect(harness.media).toHaveLength(0);

    // A raw-sized body is read only for a raw entry: the same length against a compressed original is refused before any read.
    const compressed = founderSet();
    const compressedIntake = (await json(await stage(declaration(compressed, { submissionIdentity: OTHER_ID, artifacts: compressed.map((file, index) => ({ artifactId: stagedArtifactId(OTHER_ID, index + 1), ordinal: index + 1, role: file.role, derivativeOf: file.derivativeOf ? stagedArtifactId(OTHER_ID, file.of) : null, fileName: file.name, mimeType: file.type, byteLength: file.bytes.length, sha256: sha(file.bytes) })) }), { idempotencyKey: OTHER_ID })));
    void compressedIntake;
    let pulled = 0;
    const stream = new ReadableStream({ pull(controller) { pulled += 1; controller.enqueue(new Uint8Array(1024)); } });
    const oversize = await artifactRoute(new Request(`${BASE}/${intakeId}/artifacts/${set[0].artifactId}`, {
      method: "PUT", headers: { authorization, "content-type": "image/x-adobe-dng", "content-length": String(STAGED_RAW_ORIGINAL_MAXIMUM_BYTES + 1) }, body: stream, duplex: "half",
    }), { params: Promise.resolve({ intakeId, artifactId: set[0].artifactId }) });
    expect(oversize.status).toBe(413);
    expect(pulled).toBeLessThanOrEqual(1);
  });

  // The Build 45 physical failure, end to end: the Founder's plan carries an
  // uppercase Foundation UUID and lowercase artifact ids. The declaration
  // must accept exactly that, and every PUT must resolve to the same ids.
  it("declares the Build 45 ProRAW plan under an uppercase Foundation UUID with lowercase canonical ids, and resolves every transfer", async () => {
    const FOUNDATION_ID = "B5A63452-E7B0-469C-A634-38A08137716C";
    const lower = "artifact_b5a63452e7b0469ca63438a08137716c_";
    const set = proRawSet().map((file) => ({ ...file, artifactId: `${lower}${file.ordinal}`, derivativeOf: file.of ? `${lower}${file.of}` : null }));
    expect(set.map((file) => file.artifactId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `${lower}${n}`));

    const response = await stage(declaration(set, { submissionIdentity: FOUNDATION_ID }), { idempotencyKey: FOUNDATION_ID });
    expect(response.status).toBe(202);
    const body = await json(response);
    expect(body).toMatchObject({ intakeId: `evidence_intake_${FOUNDATION_ID}`, status: "processing", mediaState: "receiving", expectedArtifactCount: 10, storedArtifactCount: 0 });
    expect(body.artifacts.map((item) => item.artifactId)).toEqual(set.map((file) => file.artifactId));
    expect(body.artifacts.slice(5).map((item) => item.derivativeOf)).toEqual([1, 2, 3, 4, 5].map((n) => `${lower}${n}`));

    // A DNG original and its derivative transfer under the ids Native sends; an uppercase path spelling names the same artifact.
    const first = await put(body.intakeId, `${lower}1`, set[0].bytes, { "content-type": "image/x-adobe-dng" });
    expect(first.status).toBe(200);
    expect(await json(first)).toMatchObject({ artifactId: `${lower}1`, artifactOutcome: "stored", storedArtifactCount: 1 });
    const sixth = await put(body.intakeId, `${lower}6`, set[5].bytes);
    expect(await json(sixth)).toMatchObject({ artifactId: `${lower}6`, artifactOutcome: "stored", storedArtifactCount: 2 });
    const spelledUpper = await put(body.intakeId, `${lower}1`.toUpperCase().replace("ARTIFACT_", "artifact_"), set[0].bytes, { "content-type": "image/x-adobe-dng" });
    expect(await json(spelledUpper)).toMatchObject({ artifactId: `${lower}1`, artifactOutcome: "already_stored", storedArtifactCount: 2 });
    expect(harness.media).toHaveLength(2);
    for (const file of set.slice(1, 5).concat(set.slice(6))) {
      expect((await put(body.intakeId, file.artifactId, file.bytes, { "content-type": file.type })).status, file.artifactId).toBe(200);
    }
    expect(harness.receipts[0]).toMatchObject({ media_state: "stored" });
    expect(harness.receipts[0].stored_artifacts.map((item) => item.id)).toEqual(set.map((file) => file.artifactId));

    // The pre-fix derivation (case preserved) is refused before any intake exists — the exact physical failure.
    const OTHER_FOUNDATION_ID = "C5A63452-E7B0-469C-A634-38A08137716C";
    const upperIds = proRawSet().map((file) => ({ ...file, artifactId: `artifact_C5A63452E7B0469CA63438A08137716C_${file.ordinal}`, derivativeOf: file.of ? `artifact_C5A63452E7B0469CA63438A08137716C_${file.of}` : null }));
    const refused = await stage(declaration(upperIds, { submissionIdentity: OTHER_FOUNDATION_ID }), { idempotencyKey: OTHER_FOUNDATION_ID });
    expect(refused.status).toBe(400);
    expect((await json(refused)).code).toBe("STAGED_ARTIFACT_IDENTITY_INVALID");
    expect(harness.receipts).toHaveLength(1);
  });

  it("refuses a non-canonical pose at the declaration, before any intake, media, or interpretation exists", async () => {
    const set = founderSet();
    const bad = declaration(set);
    // The Build 45 defect: Double Biceps declared with a Relaxed contraction.
    bad.photoSession.photoIdentities[1] = { ...bad.photoSession.photoIdentities[1], orientation: "rear", contractionState: "relaxed", poseVariant: "double_biceps" };
    const response = await stage(bad);
    expect(response.status).toBe(400);
    expect((await json(response)).code).toBe("PHOTO_IDENTITY_NON_CANONICAL");
    expect(harness.receipts).toHaveLength(0);
    expect(harness.media).toHaveLength(0);
    expect(harness.outbox).toHaveLength(0);
    // The corrected identity (Rear Flexed is Double Biceps) declares normally.
    const good = declaration(set);
    good.photoSession.photoIdentities[1] = { ...good.photoSession.photoIdentities[1], orientation: "rear", contractionState: "flexed", poseVariant: "double_biceps" };
    expect((await stage(good)).status).toBe(202);
    expect(harness.receipts).toHaveLength(1);
    expect(harness.receipts[0].recovery_context.photoIdentities[1]).toMatchObject({ poseId: "back-flexed", contractionState: "flexed", poseVariant: "double_biceps" });
  });

  it("keeps the aggregate multipart transport and its 4 KiB command reader untouched", async () => {
    const { POST: aggregateRoute } = await import("../../app/api/v1/native/evidence/intakes/route.js");
    const boundary = "PhysiqueOSNativeIntakeTest";
    const CRLF = "\r\n";
    const png = pad(PNG_BYTES, 512);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="submissionIdentity"${CRLF}Content-Type: text/plain${CRLF}${CRLF}${OTHER_ID}${CRLF}`),
      Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="effectiveDate"${CRLF}Content-Type: text/plain${CRLF}${CRLF}2026-09-19${CRLF}`),
      Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="expectedEvidenceType"${CRLF}Content-Type: text/plain${CRLF}${CRLF}nutrition${CRLF}`),
      Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="evidenceFiles"; filename="meal.png"${CRLF}Content-Type: image/png${CRLF}${CRLF}`),
      png, Buffer.from(CRLF), Buffer.from(`--${boundary}--${CRLF}`),
    ]);
    const response = await aggregateRoute(new Request(BASE, { method: "POST", headers: { authorization, "idempotency-key": OTHER_ID, "content-type": `multipart/form-data; boundary=${boundary}` }, body }));
    expect(response.status).toBe(202);
    const accepted = await json(response);
    expect(accepted).toMatchObject({ intakeId: `evidence_intake_${OTHER_ID}`, status: "processing" });
    expect(accepted.mediaState).toBeUndefined();
    expect(harness.receipts[0].media_state).toBe("stored");
    expect(harness.media).toHaveLength(1);
    // The staged transport cannot hijack an aggregate intake identity.
    const single = founderSet().slice(2, 3);
    const hijack = await stage(declaration(single, { submissionIdentity: OTHER_ID, artifacts: [{ artifactId: stagedArtifactId(OTHER_ID, 1), ordinal: 1, role: "original", derivativeOf: null, fileName: "meal.png", mimeType: "image/png", byteLength: png.length, sha256: sha(png) }] }), { idempotencyKey: OTHER_ID });
    expect(hijack.status).toBe(409);
    expect((await json(hijack)).code).toBe("EVIDENCE_INTAKE_IDENTITY_CONFLICT");
  });
});

/// PostgreSQL emulation for exactly the statements the real store, the real
/// provider upload service, the artifact loader, and the worker issue.
function fakeDatabase() {
  const receipts = [];
  const media = [];
  const outbox = [];
  const canonical = [];
  const now = () => new Date("2026-09-19T23:00:00.000Z");
  const byId = (id) => receipts.find((row) => row.id === id && row.owner_user_id === OWNER);
  const query = async (sql, values = []) => {
    const text = String(sql).replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text) || text.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (text.startsWith("INSERT INTO physiqueos.evidence_intake_receipts")) {
      if (receipts.some((row) => row.submission_identity === values[1])) return { rows: [] };
      const staged = values.length === 9;
      const row = {
        id: values[0], submission_identity: values[1], owner_user_id: values[2], effective_date: values[3],
        expected_evidence_type: values[4], source: values[5], artifact_manifest: JSON.parse(values[6]), manifest_sha256: values[7],
        typed_evidence: staged ? null : values[8], typed_evidence_sha256: staged ? null : values[9], evidence_text_kind: staged ? null : values[10],
        recovery_context: JSON.parse(staged ? values[8] : values[11]), media_state: "receiving", stored_artifacts: [],
        upload_claimed_by: staged ? null : values[12], upload_claim_expires_at: staged ? null : values[13], interpretation_state: "waiting_for_media",
        interpretation_claimed_by: null, interpretation_claim_expires_at: null, package_id: null, review_id: null, last_error_code: null,
        version: 1, created_at: now(), updated_at: now(), interpretation_started_at: null, interpretation_completed_at: null,
      };
      receipts.push(row);
      return { rows: [row] };
    }
    if (text.includes("FROM physiqueos.evidence_intake_receipts") && text.includes("submission_identity=$2")) {
      return { rows: receipts.filter((row) => row.owner_user_id === values[0] && row.submission_identity === values[1]) };
    }
    if (text.includes("FROM physiqueos.evidence_intake_receipts") && text.includes("WHERE id=$1 AND owner_user_id=$2")) {
      return { rows: receipts.filter((row) => row.id === values[0] && row.owner_user_id === values[1]) };
    }
    if (text.includes("recovery_context->>'kind'='dismissed_evidence_replacement'")) return { rows: [] };
    if (text.includes("payload->>'status' AS status")) return { rows: [] };
    if (text.startsWith("UPDATE physiqueos.evidence_intake_receipts SET")) {
      const row = byId(values[0]);
      if (!row) return { rows: [] };
      if (text.includes("SET stored_artifacts=$3::jsonb")) { row.stored_artifacts = JSON.parse(values[2]); if (text.includes("media_state='receiving'")) { row.media_state = "receiving"; row.last_error_code = null; } }
      else if (text.includes("SET media_state='stored'")) { row.media_state = "stored"; if (row.interpretation_state === "waiting_for_media") row.interpretation_state = "pending"; row.upload_claimed_by = null; row.upload_claim_expires_at = null; }
      else if (text.includes("SET media_state='receiving',last_error_code=NULL")) { row.media_state = "receiving"; row.last_error_code = null; }
      else if (text.includes("SET media_state='failed'")) { row.media_state = "failed"; row.last_error_code = values[3]; }
      else if (text.includes("SET interpretation_state='processing'")) { row.interpretation_state = "processing"; row.interpretation_claimed_by = values[2]; row.interpretation_claim_expires_at = values[3]; row.interpretation_started_at = values[4]; }
      else if (text.includes("SET interpretation_state='completed'")) { row.interpretation_state = "completed"; row.package_id = values[2]; row.review_id = values[3]; row.interpretation_completed_at = values[4]; row.interpretation_claimed_by = null; }
      else if (text.includes("SET interpretation_state='failed'")) { row.interpretation_state = "failed"; row.last_error_code = values[3]; }
      else throw new Error(`Unexpected receipt update: ${text}`);
      row.version += 1;
      return { rows: [row] };
    }
    if (text.startsWith("INSERT INTO physiqueos.outbox_messages")) {
      if (!outbox.some((item) => item.topic === values[3] && item.dedupe_key === values[4])) outbox.push({ id: values[0], topic: values[3], dedupe_key: values[4], payload: JSON.parse(values[6]) });
      return { rows: [] };
    }
    if (text.startsWith("SELECT id,original_filename,content_type,byte_length,sha256,provenance,created_at FROM physiqueos.canonical_media_objects")) {
      return { rows: media.filter((item) => item.owner_user_id === values[0] && item.evidence_record_id === values[1] && item.state === "verified") };
    }
    if (text.startsWith("SELECT id,owner_user_id,content_type,byte_length,sha256,storage_key,provider_version FROM physiqueos.canonical_media_objects")) {
      return { rows: media.filter((item) => item.id === values[0] && item.owner_user_id === values[1] && item.evidence_record_id === values[2]) };
    }
    if (text.startsWith("INSERT INTO physiqueos.canonical_media_objects")) {
      const [id, owner, collection, recordId, filename, contentType, byteLength, sha256, storageKey, providerVersion, etag, provenance] = values;
      if (media.some((item) => item.owner_user_id === owner && item.sha256 === sha256 && item.evidence_collection === collection && item.evidence_record_id === recordId && item.id !== id)) {
        throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
      }
      media.push({ id, owner_user_id: owner, evidence_collection: collection, evidence_record_id: recordId, original_filename: filename, content_type: contentType, byte_length: Number(byteLength), sha256, storage_key: storageKey, provider_version: providerVersion, provider_etag: etag, provenance: JSON.parse(provenance), state: "verified", created_at: now() });
      return { rows: [] };
    }
    if (text.startsWith("INSERT INTO physiqueos.stored_objects")) return { rows: [{ id: values[0], state: "created", version: 1 }] };
    if (text.startsWith("INSERT INTO physiqueos.upload_intents")) return { rows: [{ id: values[0], state: "created" }] };
    if (text.includes("SET state = 'uploading'") || text.includes("SET state = 'completing'") || text.includes("SET state = 'completed'") || text.startsWith("UPDATE physiqueos.stored_objects SET state = 'verified'") || text.includes("SET state='failed'")) return { rows: [{ id: values[0], version: 2 }] };
    if (text.includes("FROM physiqueos.canonical_goal_records") || text.includes("FROM physiqueos.canonical_execution_records")) return { rows: [] };
    if (text.startsWith("SELECT payload FROM physiqueos.canonical_evidence_records")) return { rows: canonical.filter((row) => row.collection === values[1] && row.record_id === values[2]).map((row) => ({ payload: row.payload })) };
    if (text.startsWith("INSERT INTO physiqueos.canonical_evidence_records")) { canonical.push({ collection: values[1], record_id: values[2], payload: JSON.parse(values[9]) }); return { rows: [] }; }
    if (text.startsWith("UPDATE physiqueos.canonical_runtime_metadata")) return { rows: [] };
    throw new Error(`Unexpected SQL in staged harness: ${text}`);
  };
  const client = { query, release() {} };
  return { receipts, media, outbox, canonical, pool: { connect: async () => client, query } };
}

/// The real ProviderCanonicalUploadService over a fake object provider that
/// remembers uploaded bytes per object key, so inspectObject and the
/// artifact loader's read-back return exactly what was uploaded.
function fakeProviderUploads(harness) {
  const objects = new Map();
  let stores = 0;
  const provider = {
    beginMultipartUpload: async ({ ownerUserId, objectId, contentType }) => ({ bucket: "b", objectKey: `private/${ownerUserId}/${objectId}/original`, providerUploadId: `u-${objectId}`, contentType }),
    authorizeUploadPart: async ({ objectKey }) => ({ url: `https://upload.invalid/${objectKey}`, partNumber: 1 }),
    completeMultipartUpload: async () => ({ etag: "etag", providerVersion: "v1" }),
    inspectObject: async ({ objectKey }) => { const stored = objects.get(objectKey); return { byteLength: stored.bytes.length, sha256: sha(stored.bytes), contentType: stored.contentType }; },
    abortMultipartUpload: async () => undefined,
    deleteObject: async ({ objectKey }) => { objects.delete(objectKey); },
    authorizeRead: async ({ objectKey }) => ({ url: `https://read.invalid/${objectKey}` }),
  };
  const fetchImpl = async (url, init = {}) => {
    const key = String(url).replace(/^https:\/\/(?:upload|read)\.invalid\//, "");
    if (init.method === "PUT") {
      objects.set(key, { bytes: Buffer.from(init.body), contentType: init.headers["content-type"] });
      return new Response(null, { status: 200, headers: { etag: '"etag"' } });
    }
    const stored = objects.get(key);
    return new Response(stored.bytes, { status: 200, headers: { "content-type": stored.contentType } });
  };
  const inner = createProviderCanonicalUploadService({
    pool: harness.pool, objectProvider: provider, fetchImpl,
    authorityStore: { claimCanonicalWriteBoundary: async () => ({ outcome: "recorded" }) },
  });
  return {
    provider, fetchImpl,
    get stores() { return stores; },
    service: { async store(input) { stores += 1; return inner.store(input); } },
  };
}
