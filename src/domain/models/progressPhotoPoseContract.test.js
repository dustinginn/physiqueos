import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CanonicalProgressPhotoCategories, getProgressPhotoPoseContract, isCanonicalPoseIdentity, normalizePhotoViewIdentity,
} from "./progressPhotoPoseVocabulary.js";
import { normalizePhotoSessionContext } from "../../application/native/NativeEvidenceIntakeRequest.js";
import { nativeProductionContractManifest } from "../../application/native/nativeProductionContractManifest.js";
import { renderProgressPhotoPoseContract } from "../../../scripts/contracts/exportProgressPhotoPoseContract.mjs";

// The canonical table, written out literally. Deriving it from the vocabulary would make this test agree with any drift.
const CANONICAL = [
  ["front", "relaxed", "standard", "front-relaxed", "Front Relaxed"],
  ["rear", "relaxed", "standard", "back-relaxed", "Rear Relaxed"],
  ["rear", "flexed", "double_biceps", "back-flexed", "Rear Flexed — Double Biceps"],
  ["side_unspecified", "relaxed", "standard", "side-relaxed", "Side Relaxed"],
  ["left_side", "relaxed", "standard", "left-side-relaxed", "Left Side Relaxed"],
  ["right_side", "relaxed", "standard", "right-side-relaxed", "Right Side Relaxed"],
  ["front", "flexed", "standard", "front-flexed", "Front Flexed"],
];
const key = (orientation, contraction, variant) => `${orientation}|${contraction}|${variant}`;

describe("canonical pose compatibility contract", () => {
  it("contains exactly the seven canonical combinations", () => {
    expect(getProgressPhotoPoseContract().combinations.map((item) => [item.orientation, item.contractionState, item.poseVariant, item.id, item.label])).toEqual(CANONICAL);
    expect(CanonicalProgressPhotoCategories).toHaveLength(7);
  });

  it("accepts a combination exactly when it is canonical, across every orientation, contraction, and variant", () => {
    const canonical = new Set(CANONICAL.map(([o, c, v]) => key(o, c, v)));
    const orientations = ["front", "rear", "left_side", "right_side", "side_unspecified"];
    const variants = ["standard", "double_biceps", "lat_spread", "side_chest", "other", "unspecified"];
    let accepted = 0;
    for (const orientation of orientations) for (const contractionState of ["relaxed", "flexed"]) for (const poseVariant of variants) {
      const expected = canonical.has(key(orientation, contractionState, poseVariant));
      expect(isCanonicalPoseIdentity({ orientation, contractionState, poseVariant }), key(orientation, contractionState, poseVariant)).toBe(expected);
      if (expected) accepted += 1;
    }
    expect(accepted).toBe(7);
  });

  it("rejects rear + relaxed + double biceps and accepts rear + flexed + double biceps", () => {
    expect(isCanonicalPoseIdentity({ orientation: "rear", contractionState: "relaxed", poseVariant: "double_biceps" })).toBe(false);
    expect(isCanonicalPoseIdentity({ orientation: "rear", contractionState: "flexed", poseVariant: "double_biceps" })).toBe(true);
    expect(normalizePhotoViewIdentity({ orientation: "rear", contractionState: "relaxed", poseVariant: "double_biceps" }).poseId).toBe("rear-relaxed-double_biceps");
    expect(normalizePhotoViewIdentity({ orientation: "rear", contractionState: "flexed", poseVariant: "double_biceps" }).poseId).toBe("back-flexed");
  });

  it("is published to clients as a generated, current contract file and in the Native contract manifest", () => {
    const file = path.resolve(__dirname, "../../../contracts/progress-photo-pose-contract.v1.json");
    expect(fs.readFileSync(file, "utf8")).toBe(renderProgressPhotoPoseContract());
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual(nativeProductionContractManifest.evidenceIntake?.poseContract ?? nativeProductionContractManifest.evidenceIntake.poseContract);
    expect(JSON.parse(fs.readFileSync(file, "utf8")).version).toBe("progress-photo-pose-contract-v1");
  });
});

describe("intake refuses non-canonical poses before any media is interpreted", () => {
  const session = (identities) => normalizePhotoSessionContext({ originalUnedited: true, timeOfDay: "afternoon", photoIdentities: identities, photoCount: identities.length });
  const identity = (orientation, contractionState, poseVariant, extra = {}) => ({ orientation, contractionState, poseVariant, identityStatus: "confirmed", userConfirmedIdentity: true, goalValidationRole: "supporting", tags: [], ...extra });

  it("rejects rear + relaxed + double biceps with a specific, non-retryable code", () => {
    expect(() => session([identity("front", "relaxed", "standard"), identity("rear", "relaxed", "double_biceps")]))
      .toThrowError(expect.objectContaining({ status: 400, code: "PHOTO_IDENTITY_NON_CANONICAL", title: expect.stringContaining("Photo 2") }));
  });

  it("rejects every other non-canonical combination Native's controls could once produce", () => {
    for (const bad of [
      identity("front", "flexed", "double_biceps"), identity("rear", "flexed", "standard"), identity("left_side", "flexed", "standard"),
      identity("front", "relaxed", "lat_spread"), identity("rear", "flexed", "side_chest"), identity("front", "relaxed", "other", { customLabel: "Custom" }),
    ]) expect(() => session([bad]), JSON.stringify(bad)).toThrowError(expect.objectContaining({ code: expect.stringMatching(/^PHOTO_IDENTITY_(NON_CANONICAL|INVALID)$/) }));
  });

  it("accepts every canonical combination, including the wire spelling Native sends for a generic side", () => {
    for (const [orientation, contractionState, poseVariant, poseId] of CANONICAL) {
      const context = session([identity(orientation, contractionState, poseVariant)]);
      expect(context.photoIdentities[0]).toMatchObject({ poseId, identityStatus: "confirmed" });
    }
    expect(session([identity("side", "relaxed", "standard")]).photoIdentities[0].poseId).toBe("side-relaxed");
  });

  it("still fails closed on unconfirmed and unknown identities", () => {
    expect(() => session([{ ...identity("front", "relaxed", "standard"), userConfirmedIdentity: false }])).toThrowError(expect.objectContaining({ code: "PHOTO_IDENTITY_UNCONFIRMED" }));
    expect(() => session([identity("sideways", "relaxed", "standard")])).toThrowError(expect.objectContaining({ code: "PHOTO_IDENTITY_NON_CANONICAL" }));
    expect(() => session([identity("front", "relaxed", "other")])).toThrowError(expect.objectContaining({ code: "PHOTO_IDENTITY_INVALID" }));
  });
});
