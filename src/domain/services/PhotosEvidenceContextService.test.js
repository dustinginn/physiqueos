import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EVIDENCE_CONTEXT_WINDOWS } from "./EvidenceContextWindows";
import {
  attachPhotoBriefingPublication,
  getPhotoSessionWindow,
  getPhotosTimelineReport,
} from "./PhotosEvidenceContextService";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("Photos Evidence Context", () => {
  it("defaults invalid or missing context to All Photos and honors valid contexts", async () => {
    const [fallback, invalid, build, visible] = await Promise.all([
      getPhotosTimelineReport(),
      getPhotosTimelineReport({ context: "invalid" }),
      getPhotosTimelineReport({ context: "build-lean-mass" }),
      getPhotosTimelineReport({ context: "visible-abs" }),
    ]);

    expect(fallback.timeline).toMatchObject({
      contextId: "all",
      selectedLabel: "All Photos",
      photoSessionWindow: null,
    });
    expect(invalid.timeline.contextId).toBe("all");
    expect(build.timeline.contextId).toBe("build-lean-mass");
    expect(visible.timeline.contextId).toBe("visible-abs");
    expect(fallback.timeline.options.map((option) => option.label)).toEqual([
      "Build Lean Mass",
      "Visible Abs",
      "All Photos",
    ]);
  }, 30000);

  it("centralizes the Photos-only July 18 baseline without changing lifecycle dates", () => {
    expect(EVIDENCE_CONTEXT_WINDOWS["build-lean-mass"]).toEqual({
      startDate: "2026-07-19",
      endDate: null,
    });
    expect(
      getPhotoSessionWindow({
        contextId: "build-lean-mass",
        endDate: "2026-07-24",
      })
    ).toEqual({
      baselineDate: "2026-07-18",
      startDate: "2026-07-18",
      endDate: "2026-07-24",
    });
    expect(getPhotoSessionWindow({ contextId: "visible-abs" })).toEqual(
      EVIDENCE_CONTEXT_WINDOWS["visible-abs"]
    );
  });

  it("only exposes a Photo Briefing link for a published event artifact", () => {
    const report = {
      latestPhotoSet: { id: "photo_session_user_2026-08-08" },
      photoSets: [{ id: "photo_session_user_2026-08-08" }],
    };
    const pending = attachPhotoBriefingPublication({ report, artifacts: [] });
    const published = attachPhotoBriefingPublication({
      report,
      artifacts: [{
        artifactType: "event",
        trigger: {
          evidenceType: "photo_session",
          evidenceId: "photo_session_user_2026-08-08",
        },
        briefing: { photoEventNarrative: { id: "narrative" } },
      }],
    });

    expect(pending.latestPhotoSet.photoBriefingHref).toBeNull();
    expect(published.latestPhotoSet.photoBriefingHref).toBe(
      "/briefings/photo/photo_session_user_2026-08-08"
    );
  });

  it("uses one scoped session set for latest, uploaded rows, and comparisons", async () => {
    const before = fs.readFileSync(storePath);
    const [build, visible, all] = await Promise.all([
      getPhotosTimelineReport({
        context: "build-lean-mass",
        currentDate: new Date("2026-07-24T12:00:00Z"),
      }),
      getPhotosTimelineReport({ context: "visible-abs" }),
      getPhotosTimelineReport({ context: "all" }),
    ]);

    expect(build.report.photoSets.map((session) => session.captureDate)).toEqual([
      "2026-07-18",
    ]);
    expect(build.report.latestPhotoSet.captureDate).toBe("2026-07-18");
    expect(build.report.latestPhotoSet.comparedAgainst).toBe(
      "No prior matching view"
    );
    expect(
      build.report.entries.every(
        (entry) =>
          entry.captureDate === "2026-07-18" &&
          entry.previousImageHref == null
      )
    ).toBe(true);

    expect(
      visible.report.photoSets.every(
        (session) =>
          session.captureDate >= "2026-05-24" &&
          session.captureDate <= "2026-07-18"
      )
    ).toBe(true);
    expect(visible.report.latestPhotoSet.captureDate).toBe("2026-07-18");
    expect(visible.report.latestPhotoSet.comparedAgainst).toBe("Jul 11");
    expect(all.report.photoSets.length).toBeGreaterThanOrEqual(
      visible.report.photoSets.length
    );
    expect(fs.readFileSync(storePath)).toEqual(before);
  }, 60000);
});
