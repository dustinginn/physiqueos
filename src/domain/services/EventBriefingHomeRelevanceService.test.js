import { describe, expect, it } from "vitest";
import {
  isEventBriefingRelevantForHome,
  PHOTO_EVENT_HOME_PUBLICATION_WINDOW_MS,
  resolvePhotoEventHomeRelevanceEnd,
} from "./EventBriefingHomeRelevanceService";
import { isEventActiveForHome } from "./HomeBriefingRoutingService";

describe("Event Briefing Home relevance", () => {
  it("keeps a DEXA event for its canonical local event day and following day", () => {
    const artifact = dexa("2026-08-15T19:02:57.601Z");
    expect(isEventBriefingRelevantForHome({
      artifact,
      localDate: "2026-08-15",
      timeZone: "America/Los_Angeles",
    })).toBe(true);
    expect(isEventBriefingRelevantForHome({
      artifact,
      localDate: "2026-08-16",
      timeZone: "America/Los_Angeles",
    })).toBe(true);
    expect(isEventBriefingRelevantForHome({
      artifact,
      localDate: "2026-08-17",
      timeZone: "America/Los_Angeles",
    })).toBe(false);
    expect(artifact.lifecycle).toEqual({});
  });

  it("keeps a Photo Event for its canonical local event day and following day", () => {
    const artifact = {
      generatedAt: "2026-08-10T02:08:18.679Z",
      trigger: { evidenceType: "photo_session" },
      briefing: { photoEventNarrative: { eventDate: "2026-08-08" } },
    };
    expect(isEventBriefingRelevantForHome({
      artifact,
      localDate: "2026-08-08",
      timeZone: "America/Los_Angeles",
    })).toBe(true);
    expect(isEventBriefingRelevantForHome({
      artifact,
      localDate: "2026-08-09",
      timeZone: "America/Los_Angeles",
    })).toBe(true);
    expect(isEventBriefingRelevantForHome({
      artifact,
      localDate: "2026-08-10",
      timeZone: "America/Los_Angeles",
    })).toBe(false);
  });

  it("applies only the calendar-day rule when the caller supplies no read instant", () => {
    const artifact = {
      generatedAt: "2026-08-30T18:00:00.000Z",
      trigger: { evidenceType: "photo_session" },
      briefing: { photoEventNarrative: { eventDate: "2026-08-29" } },
    };
    const preservedArtifact = structuredClone(artifact);
    expect(isEventBriefingRelevantForHome({
      artifact,
      localDate: "2026-08-30",
      timeZone: "America/Los_Angeles",
    })).toBe(true);
    expect(isEventBriefingRelevantForHome({
      artifact,
      localDate: "2026-08-31",
      timeZone: "America/Los_Angeles",
    })).toBe(false);
    expect(artifact).toEqual(preservedArtifact);
  });

  it.each([
    ["month", "2026-09-30", "2026-10-01", "2026-10-02"],
    ["year", "2026-12-31", "2027-01-01", "2027-01-02"],
  ])("crosses a %s boundary by calendar date", (_label, eventDate, nextDate, expiredDate) => {
    const artifact = dexa("2027-01-02T07:55:00.000Z", eventDate);
    expect(isEventBriefingRelevantForHome({ artifact, localDate: eventDate, timeZone: "America/Los_Angeles" })).toBe(true);
    expect(isEventBriefingRelevantForHome({ artifact, localDate: nextDate, timeZone: "America/Los_Angeles" })).toBe(true);
    expect(isEventBriefingRelevantForHome({ artifact, localDate: expiredDate, timeZone: "America/Los_Angeles" })).toBe(false);
  });

  it.each([
    ["before local midnight", "2026-09-13T06:50:00.000Z"],
    ["after local midnight", "2026-09-13T07:10:00.000Z"],
  ])("uses the persisted event date when generated %s and UTC differs", (_label, generatedAt) => {
    const artifact = dexa(generatedAt, "2026-09-12");
    expect(isEventBriefingRelevantForHome({ artifact, localDate: "2026-09-12", timeZone: "America/Los_Angeles" })).toBe(true);
    expect(isEventBriefingRelevantForHome({ artifact, localDate: "2026-09-13", timeZone: "America/Los_Angeles" })).toBe(true);
    expect(isEventBriefingRelevantForHome({ artifact, localDate: "2026-09-14", timeZone: "America/Los_Angeles" })).toBe(false);
  });
});

function dexa(generatedAt, scanDate = "2026-08-15") {
  return {
    id: "dexa-event",
    generatedAt,
    trigger: { evidenceType: "dexa", evidenceId: "scan" },
    lifecycle: {},
    briefing: { dexaEventNarrative: { snapshot: { scanDate } } },
  };
}

// Founder decision: a Photo Briefing receives a full additional 24 hours of Home
// visibility after generation/publication, on top of its ordinary event-day window,
// whichever ends later. DEXA keeps the event-date rule alone.
describe("Photo Briefing 24 hour Home publication window", () => {
  const TZ = "America/Los_Angeles";
  const relevant = (artifact, now) => isEventBriefingRelevantForHome({
    artifact, now: new Date(now), timeZone: TZ,
    localDate: new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(now)),
  });
  const photo = (generatedAt, eventDate) => ({
    artifactType: "event",
    generatedAt,
    trigger: { evidenceType: "photo_session", evidenceId: "photo_session_x" },
    briefing: { photoEventNarrative: { eventDate } },
  });

  it("keeps ordinary event-date relevance for a same-day Photo Briefing", () => {
    const artifact = photo("2026-09-19T20:00:00.000Z", "2026-09-19");
    expect(relevant(artifact, "2026-09-19T21:00:00.000Z")).toBe(true);
    expect(relevant(artifact, "2026-09-20T15:00:00.000Z")).toBe(true);
    // The following local day still ends at local midnight, which is later than
    // publication plus 24 hours (Sep 20 20:00Z), so the ordinary window wins.
    expect(relevant(artifact, "2026-09-21T06:59:00.000Z")).toBe(true);
    expect(relevant(artifact, "2026-09-21T07:00:00.000Z")).toBe(false);
  });

  it("keeps a delayed Photo Briefing Home-relevant for a full 24 hours after generation", () => {
    // The real recovered briefing: Sep 19 capture, generated Sep 20 10:51 AM Pacific.
    const artifact = photo("2026-09-20T17:51:47.391Z", "2026-09-19");
    expect(relevant(artifact, "2026-09-20T17:55:00.000Z")).toBe(true);
    // Old rule ended here, at the start of Sep 21 Pacific.
    expect(relevant(artifact, "2026-09-21T06:59:00.000Z")).toBe(true);
    expect(relevant(artifact, "2026-09-21T07:00:00.000Z")).toBe(true);
    expect(relevant(artifact, "2026-09-21T12:00:00.000Z")).toBe(true);
    expect(relevant(artifact, "2026-09-21T17:51:47.390Z")).toBe(true);
  });

  it("expires exactly 24 hours after generation once the ordinary window has also ended", () => {
    const artifact = photo("2026-09-20T17:51:47.391Z", "2026-09-19");
    expect(relevant(artifact, "2026-09-21T17:51:47.391Z")).toBe(false);
    expect(relevant(artifact, "2026-09-21T17:52:00.000Z")).toBe(false);
    expect(relevant(artifact, "2026-09-22T17:00:00.000Z")).toBe(false);
  });

  it("uses whichever of the event-day window and publication plus 24 hours ends later", () => {
    const delayed = photo("2026-09-20T17:51:47.391Z", "2026-09-19");
    expect(resolvePhotoEventHomeRelevanceEnd({ artifact: delayed, timeZone: TZ })).toEqual({
      eventDayWindowEnd: "2026-09-21T07:00:00.000Z",
      publicationWindowEnd: "2026-09-21T17:51:47.391Z",
      effectiveEnd: "2026-09-21T17:51:47.391Z",
    });
    const sameDay = photo("2026-09-19T20:00:00.000Z", "2026-09-19");
    expect(resolvePhotoEventHomeRelevanceEnd({ artifact: sameDay, timeZone: TZ })).toEqual({
      eventDayWindowEnd: "2026-09-21T07:00:00.000Z",
      publicationWindowEnd: "2026-09-20T20:00:00.000Z",
      effectiveEnd: "2026-09-21T07:00:00.000Z",
    });
    expect(PHOTO_EVENT_HOME_PUBLICATION_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    // The predicate agrees with the computed end on both sides of it.
    for (const artifact of [delayed, sameDay]) {
      const end = Date.parse(resolvePhotoEventHomeRelevanceEnd({ artifact, timeZone: TZ }).effectiveEnd);
      expect(relevant(artifact, new Date(end - 1).toISOString())).toBe(true);
      expect(relevant(artifact, new Date(end).toISOString())).toBe(false);
    }
  });

  it("computes the ordinary window end across a daylight-saving change", () => {
    const artifact = photo("2026-11-02T18:00:00.000Z", "2026-11-02");
    expect(resolvePhotoEventHomeRelevanceEnd({ artifact, timeZone: TZ }).eventDayWindowEnd)
      .toBe("2026-11-04T08:00:00.000Z");
  });

  it("does not extend a Photo Briefing before it exists or before it is published", () => {
    const now = new Date("2026-09-20T18:00:00.000Z");
    const base = { timeZone: TZ, localDate: "2026-09-25", now };
    // Nonexistent: the Home gate never treats a missing artifact as visible.
    expect(isEventActiveForHome({ artifact: null, ...base })).toBe(false);
    // Unpublished: an artifact with no narrative content gets no publication window.
    const unpublished = { artifactType: "event", generatedAt: "2026-09-20T17:51:47.391Z", trigger: { evidenceType: "photo_session" }, briefing: {} };
    expect(isEventBriefingRelevantForHome({ ...base, artifact: unpublished })).toBe(false);
    expect(isEventActiveForHome({ ...base, artifact: unpublished, localDate: "2026-09-20" })).toBe(false);
    expect(resolvePhotoEventHomeRelevanceEnd({ artifact: unpublished, timeZone: TZ })).toBeNull();
    expect(resolvePhotoEventHomeRelevanceEnd({ artifact: null, timeZone: TZ })).toBeNull();
    // A failed or in-progress generation is never Home-visible, even inside the window.
    const published = photo("2026-09-20T17:51:47.391Z", "2026-09-19");
    for (const status of ["failed", "in_progress"]) {
      expect(isEventActiveForHome({ artifact: { ...published, lifecycle: { status } }, timeZone: TZ, localDate: "2026-09-20", now })).toBe(false);
    }
    expect(isEventActiveForHome({ artifact: published, timeZone: TZ, localDate: "2026-09-20", now })).toBe(true);
  });

  it("ignores a missing, invalid, or future generatedAt and a missing read instant", () => {
    const now = new Date("2026-09-20T18:00:00.000Z");
    const laterDate = { timeZone: TZ, localDate: "2026-09-25", now };
    for (const generatedAt of [undefined, "not a timestamp", "2026-09-20T18:00:00.001Z"]) {
      const artifact = photo(generatedAt, "2026-09-19");
      expect(isEventBriefingRelevantForHome({ ...laterDate, artifact })).toBe(false);
    }
    const artifact = photo("2026-09-20T17:51:47.391Z", "2026-09-19");
    expect(isEventBriefingRelevantForHome({ artifact, timeZone: TZ, localDate: "2026-09-21" })).toBe(false);
  });

  it("does not change DEXA: a late DEXA event still ends with its following local day", () => {
    const late = dexa("2026-09-20T17:51:47.391Z", "2026-09-19");
    // Publication plus 24 hours would keep it until Sep 21 17:51Z; DEXA must not gain that.
    expect(relevant(late, "2026-09-20T18:00:00.000Z")).toBe(true);
    expect(relevant(late, "2026-09-21T06:59:00.000Z")).toBe(true);
    expect(relevant(late, "2026-09-21T07:00:00.000Z")).toBe(false);
    expect(relevant(late, "2026-09-21T12:00:00.000Z")).toBe(false);
    expect(resolvePhotoEventHomeRelevanceEnd({ artifact: late, timeZone: TZ })).toBeNull();
  });
});
