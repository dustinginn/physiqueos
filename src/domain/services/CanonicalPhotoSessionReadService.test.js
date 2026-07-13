import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createPhotoSessionReadModels } from "./CanonicalPhotoSessionReadService";

function canonicalSession(date = "2026-07-11") {
  return { canonicalId: `session_${date}`, evidence_type: "photo_session", lastObservedAt: date, quality: { status: "active" }, provenance: { source_artifact_refs: ["front", "rear", "flex", "retry"] }, payload: { captureDate: date, completionState: "complete", synthesisStatus: "complete", sessionConditions: { morning: { value: false }, fasted: { value: false }, postWorkout: { value: true }, pump: { value: "unknown" } }, photos: [{ canonicalPhotoId: "front", view: "front", pose: "relaxed", status: "active", storage_path: "front.jpg" }, { canonicalPhotoId: "rear", view: "back", pose: "relaxed", status: "active", storage_path: "rear.jpg" }, { canonicalPhotoId: "flex", view: "back", pose: "flexed", status: "active", storage_path: "flex.jpg" }, { canonicalPhotoId: "retry", view: "back", pose: "flexed", status: "duplicate", storage_path: "retry.jpg", sourceIds: ["retry-source"] }] } };
}

describe("CanonicalPhotoSessionReadService", () => {
  it("renders canonical July 11 as exactly three ordered views with provenance-only retry", () => {
    const sessions = createPhotoSessionReadModels({ canonicalObjects: [canonicalSession()], legacyPhotos: [{ id: "legacy-retry", date: "2026-07-11", view: "back", pose: "flexed", imagePath: "flex.jpg" }], weights: [{ measuredAt: "2026-07-11", weight: { value: 180, unit: "lb" } }] });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sourceMode).toBe("canonical");
    expect(sessions[0].activeViewCount).toBe(3);
    expect(sessions[0].views.map((view) => view.label)).toEqual(["Front Relaxed", "Rear Relaxed", "Rear Flexed"]);
    expect(sessions[0].duplicateRetryCount).toBe(1);
    expect(sessions[0].weight).toBe("180.0 lb");
    expect(sessions[0].completionLabel).toBe("3/3 complete");
    expect(sessions[0].views[0].tags).toEqual(expect.arrayContaining(["Post-workout", "Not morning", "Not fasted", "Pump unknown"]));
  });

  it("adapts legacy-only dates without mixing them with canonical dates", () => {
    const legacy = [{ id: "a", date: "2026-07-04", view: "front", pose: "relaxed", imagePath: "a.jpg" }, { id: "b", date: "2026-07-04", view: "back", pose: "relaxed", imagePath: "b.jpg" }];
    const sessions = createPhotoSessionReadModels({ canonicalObjects: [canonicalSession()], legacyPhotos: legacy });
    expect(sessions.map((item) => item.sourceMode)).toEqual(["canonical", "legacy-adapted"]);
    expect(sessions[1].activeViewCount).toBe(2);
  });

  it("preserves the repaired persisted Founder truth", () => {
    const store = JSON.parse(fs.readFileSync(path.join(process.cwd(), "private", "founder", "runtime-store.json"), "utf8"));
    const sessions = createPhotoSessionReadModels({ canonicalObjects: store.canonicalEvidenceObjects, legacyPhotos: store.progressPhotos, weights: store.weightEntries, analyses: store.analyses });
    const session = sessions.find((item) => item.captureDate === "2026-07-11");
    expect(session.activeViewCount).toBe(3);
    expect(session.provenanceSourceCount).toBeGreaterThanOrEqual(4);
    expect(session.duplicateRetryCount).toBe(1);
    expect(session.views.some((view) => view.label === "Front Flexed" || view.label === "Side Relaxed")).toBe(false);
    expect(session.views.every((view) => view.canonicalViewId && view.imageReference && view.imageUrl && !view.hydrationDiagnostic)).toBe(true);
    expect(session.views.every((view) => view.comparison?.previousImageUrl)).toBe(true);
    const july5 = sessions.find((item) => item.captureDate === "2026-07-05");
    expect(july5.views.every((view) => !view.comparison || view.comparison.previousDate < "2026-07-05")).toBe(true);
    expect(sessions.some((item) => item.captureDate === "2026-07-06" && item.sessionFingerprint === july5.sessionFingerprint)).toBe(false);
    expect(july5.hiddenProvenanceAliases.length).toBeGreaterThanOrEqual(2);
    expect(session.views.every((view) => view.analysisLookupPath === "source_id" && view.currentPhotoNarrative)).toBe(true);
    expect(sessions.filter((item)=>item.captureDate==="2026-07-11")).toHaveLength(1);
  });

  it("selects each same-pose comparison backward and never uses a retry", () => {
    const current=canonicalSession("2026-07-11"), prior=canonicalSession("2026-07-03");
    prior.payload.photos=prior.payload.photos.map((photo,index)=>({...photo,canonicalPhotoId:`prior-${index}`,storage_path:`prior-${index}.jpg`}));
    const sessions=createPhotoSessionReadModels({canonicalObjects:[current,prior]});
    const latest=sessions[0];
    expect(latest.views.map((view)=>view.comparison?.previousDate)).toEqual(["2026-07-03","2026-07-03","2026-07-03"]);
    expect(latest.views.every((view)=>view.comparison?.previousPose?.id===view.poseId)).toBe(true);
    expect(latest.views.some((view)=>view.comparison?.previousCanonicalViewId==="retry")).toBe(false);
    expect(sessions[1].views.every((view)=>view.comparisonStatus==="no_prior_matching_pose")).toBe(true);
  });

  it("reports unavailable prior images and condition-aware neutral narratives honestly", () => {
    const current=canonicalSession("2026-07-11"), prior=canonicalSession("2026-07-03");
    prior.payload.photos=prior.payload.photos.map((photo,index)=>({...photo,canonicalPhotoId:`prior-${index}`,storage_path:null,sourceIds:[`missing-${index}`]}));
    const unavailable=createPhotoSessionReadModels({canonicalObjects:[current,prior]})[0].views[0];
    expect(unavailable.comparisonStatus).toBe("prior_image_unavailable");
    expect(unavailable.comparisonNarrative).toMatch(/stored image is unavailable/i);
    prior.payload.photos=prior.payload.photos.map((photo,index)=>({...photo,storage_path:`prior-${index}.jpg`,conditions:{morning:true,fasted:true,postWorkout:false,pump:false}}));
    const compared=createPhotoSessionReadModels({canonicalObjects:[current,prior]})[0].views[0];
    expect(compared.comparisonStatus).toBe("comparable_with_condition_differences");
    expect(compared.comparison.conditionSummary).toMatch(/^Conditions differ:/);
    expect(compared.comparisonNarrativeSource).toBe("neutral_condition_fallback");
    expect(compared.comparisonNarrative).not.toMatch(/tighter|leaner|improved/i);
  });

  it("uses persisted pose findings without calling or inventing new interpretation", () => {
    const current=canonicalSession("2026-07-11"), prior=canonicalSession("2026-07-03");
    prior.payload.photos=prior.payload.photos.map((photo,index)=>({...photo,canonicalPhotoId:`prior-${index}`,storage_path:`prior-${index}.jpg`}));
    const analysis={id:"analysis-front",evidenceIds:["front"],metadata:{structuredObservations:[{region:"waist",change:"Waist appears slightly tighter."}]}};
    const view=createPhotoSessionReadModels({canonicalObjects:[current,prior],analyses:[analysis]})[0].views[0];
    expect(view.comparisonNarrativeSource).toBe("persisted_pose_analysis");
    expect(view.comparisonNarrative).toContain("waist appears slightly tighter");
  });

  it("lets capture evidence outrank upload, creation, and weight dates", () => {
    const canonical=canonicalSession("2026-07-06");delete canonical.payload.captureDate;canonical.payload.photos=canonical.payload.photos.map((photo,index)=>({...photo,canonicalPhotoId:`c-${index}`,storage_path:`same-${index}.jpg`}));
    const legacy=canonical.payload.photos.slice(0,3).map((photo,index)=>({id:`source-${index}`,date:"2026-07-05",capturedAt:"2026-07-05",uploadedAt:"2026-07-06T00:39:00Z",createdAt:"2026-07-06T03:00:00Z",imagePath:photo.storage_path,view:photo.view,pose:photo.pose,linkedWeightEntryId:"weight_2026_07_06"}));
    const session=createPhotoSessionReadModels({canonicalObjects:[canonical],legacyPhotos:legacy,weights:[{measuredAt:"2026-07-06",weight:{value:166.4,unit:"lb"}}]})[0];
    expect(session.captureDate).toBe("2026-07-05");
    expect(session.dateDerivationSource).toBe("matched_source_capture_date");
    expect(session.weight).toBe("No same-day weight");
  });
});
