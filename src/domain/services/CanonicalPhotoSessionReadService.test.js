import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPhotoSessionLandingSummary,
  createPhotoSessionReadModels,
} from "./CanonicalPhotoSessionReadService";

function canonicalSession(date = "2026-07-11") {
  return { canonicalId: `session_${date}`, evidence_type: "photo_session", lastObservedAt: date, quality: { status: "active" }, provenance: { source_artifact_refs: ["front", "rear", "flex", "retry"] }, payload: { captureDate: date, completionState: "complete", synthesisStatus: "complete", sessionConditions: { morning: { value: false }, fasted: { value: false }, postWorkout: { value: true }, pump: { value: "unknown" } }, photos: [{ canonicalPhotoId: "front", view: "front", pose: "relaxed", status: "active", storage_path: "front.jpg" }, { canonicalPhotoId: "rear", view: "back", pose: "relaxed", status: "active", storage_path: "rear.jpg" }, { canonicalPhotoId: "flex", view: "back", pose: "flexed", status: "active", storage_path: "flex.jpg" }, { canonicalPhotoId: "retry", view: "back", pose: "flexed", status: "duplicate", storage_path: "retry.jpg", sourceIds: ["retry-source"] }] } };
}

const POSES = [
  ["front", "relaxed"],
  ["back", "relaxed"],
  ["back", "flexed"],
  ["right_side", "relaxed"],
  ["front", "flexed"],
];

// A ProRAW/DNG session: the canonical photo keeps the DNG as its original and
// displays a linked JPEG derivative (same shape the Sep 19 production session has).
function dngSession(date, tag) {
  const id = (kind, index) => `019b0000-0000-7000-8${tag}00-0000000000${kind}${index}`;
  return {
    canonicalId: `photo_session_user_founder_001_${date}`,
    evidence_type: "photo_session",
    lastObservedAt: date,
    quality: { status: "active" },
    payload: {
      sessionId: `photo_session_user_founder_001_${date}`,
      captureDate: date,
      completionState: "complete",
      photos: POSES.map(([view, pose], index) => ({
        canonicalPhotoId: `canonical_${tag}_${index}`,
        view,
        pose,
        status: "active",
        mime_type: "image/x-adobe-dng",
        storage_path: `media://${id(1, index)}`,
        analysis_mime_type: "image/jpeg",
        analysis_storage_path: `media://${id(2, index)}`,
      })),
    },
    originalRef: (index) => `media://${id(1, index)}`,
    derivativeRef: (index) => `media://${id(2, index)}`,
  };
}

// What the evidence-review confirm action writes: one legacy progress photo per
// canonical photo, whose imagePath is the ORIGINAL storage reference.
function legacyRowsOnOriginals(session) {
  return session.payload.photos.map((photo, index) => ({
    id: `progress_photo_${session.payload.captureDate}_${index}`,
    date: session.payload.captureDate,
    capturedAt: session.payload.captureDate,
    view: photo.view,
    pose: photo.pose,
    imagePath: photo.storage_path,
    source: { type: "manual", name: "Confirmed Photo Session" },
  }));
}

describe("CanonicalPhotoSessionReadService", () => {
  it("derives the compact landing date and count without detailed comparison hydration", () => {
    const current = canonicalSession("2026-07-11");
    const prior = canonicalSession("2026-07-03");
    prior.payload.photos = prior.payload.photos.map((photo, index) => ({
      ...photo,
      canonicalPhotoId: `prior-${index}`,
      storage_path: `prior-${index}.jpg`,
    }));
    const canonicalObjects = [current, prior];
    const detailed = createPhotoSessionReadModels({ canonicalObjects });
    const summary = createPhotoSessionLandingSummary({ canonicalObjects });

    expect(summary).toEqual({
      count: detailed.length,
      latestDate: detailed[0].captureDate,
    });
    expect(Object.isFrozen(summary)).toBe(true);
  });

  it("routes migrated canonical media references through the private evidence boundary", () => {
    const canonical = canonicalSession("2026-08-14");
    const objectId = "media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57";
    canonical.payload.photos[0].storage_path = `media://${objectId}`;
    const session = createPhotoSessionReadModels({ canonicalObjects: [canonical] })[0];
    expect(session.views.find((view) => view.canonicalViewId === "front").imageUrl).toBe(`/api/private-evidence/media/${objectId}`);
  });

  it("prefers the stable canonical session identity when duplicate records share the same assets", () => {
    const stable = canonicalSession("2026-07-18");
    stable.canonicalId = "photo_session_user_founder_001_2026-07-18";
    stable.payload.sessionId = stable.canonicalId;
    const ingestionAlias = {
      ...structuredClone(stable),
      canonicalId: "photo_session|2026-07-18|front|rear|flex|side|front-flex",
      payload: { ...structuredClone(stable.payload), sessionId: null },
    };
    const sessions = createPhotoSessionReadModels({ canonicalObjects: [ingestionAlias, stable] });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(stable.canonicalId);
    expect(sessions[0].hiddenProvenanceAliases).toContain(ingestionAlias.canonicalId);
  });
  it("renders canonical July 11 as exactly three ordered views with provenance-only retry", () => {
    const sessions = createPhotoSessionReadModels({ canonicalObjects: [canonicalSession()], legacyPhotos: [{ id: "legacy-retry", date: "2026-07-11", view: "back", pose: "flexed", imagePath: "flex.jpg" }], weights: [{ measuredAt: "2026-07-11", weight: { value: 180, unit: "lb" } }] });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sourceMode).toBe("canonical");
    expect(sessions[0].activeViewCount).toBe(3);
    expect(sessions[0].views.map((view) => view.label)).toEqual(["Front Relaxed", "Rear Relaxed", "Rear Flexed — Double Biceps"]);
    expect(sessions[0].duplicateRetryCount).toBe(1);
    expect(sessions[0].weight).toBe("180.0 lb");
    expect(sessions[0].completionLabel).toBe("3 confirmed views");
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
  describe("canonical ownership of legacy rows that point at the ORIGINAL of a derivative-displayed photo", () => {
    it("yields exactly one canonical session for a DNG session plus legacy rows on its originals", () => {
      const canonical = dngSession("2026-09-19", "1");
      const sessions = createPhotoSessionReadModels({
        canonicalObjects: [canonical],
        legacyPhotos: legacyRowsOnOriginals(canonical),
      });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe("photo_session_user_founder_001_2026-09-19");
      expect(sessions[0].sourceMode).toBe("canonical");
      expect(sessions.some((session) => session.id.startsWith("legacy-photo-session-"))).toBe(false);
    });

    it("keeps the canonical views on the JPEG derivative, never the DNG original", () => {
      const canonical = dngSession("2026-09-19", "1");
      const [session] = createPhotoSessionReadModels({
        canonicalObjects: [canonical],
        legacyPhotos: legacyRowsOnOriginals(canonical),
      });
      const derivativeIds = POSES.map((_, index) => canonical.derivativeRef(index).slice("media://".length));
      expect(session.views).toHaveLength(5);
      expect(session.views.map((view) => view.imageUrl.replace("/api/private-evidence/media/", ""))).toEqual(
        expect.arrayContaining(derivativeIds),
      );
      const originals = POSES.map((_, index) => canonical.originalRef(index));
      for (const view of session.views) {
        expect(view.imageReference.startsWith("media://")).toBe(true);
        expect(originals).not.toContain(view.imageReference);
      }
    });

    it("applies the same ownership rule to the landing summary and the detailed read model", () => {
      const canonical = dngSession("2026-09-19", "1");
      const legacyPhotos = legacyRowsOnOriginals(canonical);
      const detailed = createPhotoSessionReadModels({ canonicalObjects: [canonical], legacyPhotos });
      const summary = createPhotoSessionLandingSummary({ canonicalObjects: [canonical], legacyPhotos });
      expect(summary).toEqual({ count: 1, latestDate: "2026-09-19" });
      expect(summary.count).toBe(detailed.length);
      expect(summary.latestDate).toBe(detailed[0].captureDate);
    });

    it("selects the canonical session as the latest set, so its canonical Photo Event id is used", () => {
      const canonical = dngSession("2026-09-19", "1");
      const older = canonicalSession("2026-08-22");
      const sessions = createPhotoSessionReadModels({
        canonicalObjects: [older, canonical],
        legacyPhotos: legacyRowsOnOriginals(canonical),
      });
      expect(sessions.map((session) => session.captureDate)).toEqual(["2026-09-19", "2026-08-22"]);
      expect(sessions[0].id).toBe(canonical.canonicalId);
      expect(`event_briefing_progress_photo_${sessions[0].id}`).toBe(
        "event_briefing_progress_photo_photo_session_user_founder_001_2026-09-19",
      );
    });

    it("still shows a legitimate legacy-only row that no canonical photo owns", () => {
      const canonical = dngSession("2026-09-19", "1");
      const legacyOnly = [
        { id: "legacy-only-a", date: "2026-09-19", view: "front", pose: "relaxed", imagePath: "media://019b0000-0000-7000-8f00-000000000001" },
        { id: "legacy-only-b", date: "2026-08-01", view: "front", pose: "relaxed", imagePath: "old-front.jpg" },
      ];
      const legacyPhotos = [...legacyRowsOnOriginals(canonical), ...legacyOnly];
      const sessions = createPhotoSessionReadModels({ canonicalObjects: [canonical], legacyPhotos });
      expect(sessions.filter((session) => session.sourceMode === "canonical")).toHaveLength(1);
      const legacySessions = sessions.filter((session) => session.sourceMode === "legacy-adapted");
      expect(legacySessions.map((session) => session.captureDate).sort()).toEqual(["2026-08-01", "2026-09-19"]);
      expect(legacySessions.every((session) => session.activeViewCount === 1)).toBe(true);
      expect(createPhotoSessionLandingSummary({ canonicalObjects: [canonical], legacyPhotos }).count).toBe(sessions.length);
    });

    it("does not suppress a legacy row that belongs to a different session's asset", () => {
      const sepDng = dngSession("2026-09-19", "1");
      const augDng = dngSession("2026-08-22", "2");
      // Only the Sep 19 originals are owned. A legacy row on an Aug 22 original is owned by
      // the Aug 22 session only when that session is present; with it absent it must remain.
      const augLegacy = legacyRowsOnOriginals(augDng);
      const sessions = createPhotoSessionReadModels({
        canonicalObjects: [sepDng],
        legacyPhotos: [...legacyRowsOnOriginals(sepDng), ...augLegacy],
      });
      expect(sessions.filter((session) => session.sourceMode === "canonical")).toHaveLength(1);
      const legacy = sessions.filter((session) => session.sourceMode === "legacy-adapted");
      expect(legacy).toHaveLength(1);
      expect(legacy[0].captureDate).toBe("2026-08-22");
      expect(legacy[0].activeViewCount).toBe(5);
    });

    it("does not let a superseded canonical session or an inactive photo claim ownership", () => {
      const superseded = dngSession("2026-09-19", "1");
      superseded.quality = { status: "superseded" };
      const legacyPhotos = legacyRowsOnOriginals(superseded);
      const sessions = createPhotoSessionReadModels({ canonicalObjects: [superseded], legacyPhotos });
      expect(sessions.map((session) => session.sourceMode)).toEqual(["legacy-adapted"]);

      const withRetry = dngSession("2026-09-19", "1");
      withRetry.payload.photos[4].status = "duplicate";
      const retryLegacy = legacyRowsOnOriginals(withRetry);
      const result = createPhotoSessionReadModels({ canonicalObjects: [withRetry], legacyPhotos: retryLegacy });
      const canonicalSessions = result.filter((session) => session.sourceMode === "canonical");
      expect(canonicalSessions).toHaveLength(1);
      expect(canonicalSessions[0].activeViewCount).toBe(4);
    });

    it("leaves JPEG-original sessions unchanged (original and display reference are the same asset)", () => {
      const canonical = canonicalSession("2026-07-11");
      const legacyPhotos = [{ id: "legacy-flex", date: "2026-07-11", view: "back", pose: "flexed", imagePath: "flex.jpg" }];
      const withLegacy = createPhotoSessionReadModels({ canonicalObjects: [canonical], legacyPhotos });
      const without = createPhotoSessionReadModels({ canonicalObjects: [canonical] });
      expect(withLegacy).toHaveLength(1);
      expect(withLegacy).toEqual(without);
      expect(createPhotoSessionLandingSummary({ canonicalObjects: [canonical], legacyPhotos })).toEqual(
        createPhotoSessionLandingSummary({ canonicalObjects: [canonical] }),
      );
    });
  });
});
