import { describe, expect, it } from "vitest";
import {
  arePhotoPoseIdentitiesCompatible,
  normalizePhotoViewIdentity,
} from "./progressPhotoPoseVocabulary";

describe("flexible progress-photo identity", () => {
  it.each([
    [{orientation:"front",contractionState:"relaxed",poseVariant:"standard"},"front-relaxed","Front Relaxed"],
    [{orientation:"rear",contractionState:"relaxed",poseVariant:"standard"},"back-relaxed","Rear Relaxed"],
    [{orientation:"rear",contractionState:"flexed",poseVariant:"double_biceps"},"back-flexed","Rear Flexed — Double Biceps"],
    [{orientation:"side_unspecified",contractionState:"relaxed",poseVariant:"standard"},"side-relaxed","Side Relaxed"],
    [{orientation:"front",contractionState:"flexed",poseVariant:"standard"},"front-flexed","Front Flexed"],
  ])("normalizes %o", (input,id,label) => expect(normalizePhotoViewIdentity(input)).toMatchObject({poseId:id,label}));

  it("preserves known side and unknown side without guessing", () => {
    expect(normalizePhotoViewIdentity({orientation:"left_side",contractionState:"relaxed",poseVariant:"standard"}).poseId).toBe("left-side-relaxed");
    expect(normalizePhotoViewIdentity({orientation:"right_side",contractionState:"relaxed",poseVariant:"standard"}).poseId).toBe("right-side-relaxed");
    expect(normalizePhotoViewIdentity({orientation:"side_unspecified",contractionState:"relaxed",poseVariant:"standard"}).orientation).toBe("side_unspecified");
  });

  it("retains custom poses and maps legacy strings at read time", () => {
    expect(normalizePhotoViewIdentity({orientation:"front",contractionState:"flexed",poseVariant:"other",customLabel:"Most Muscular"})).toMatchObject({poseId:"custom-most-muscular",label:"Most Muscular"});
    expect(normalizePhotoViewIdentity({view:"back",pose:"flexed"})).toMatchObject({orientation:"rear",contractionState:"flexed",poseVariant:"double_biceps"});
  });

  it("never cross-matches incompatible poses or known sides", () => {
    expect(arePhotoPoseIdentitiesCompatible({view:"front",pose:"relaxed"},{view:"front",pose:"flexed"})).toBe(false);
    expect(arePhotoPoseIdentitiesCompatible({orientation:"left_side",contractionState:"relaxed",poseVariant:"standard"},{orientation:"right_side",contractionState:"relaxed",poseVariant:"standard"})).toBe(false);
    expect(arePhotoPoseIdentitiesCompatible({view:"back",pose:"relaxed"},{view:"front",pose:"relaxed"})).toBe(false);
  });
});
