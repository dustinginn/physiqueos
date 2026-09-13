import { describe, expect, it } from "vitest";
import { isEventBriefingRelevantForHome } from
  "./EventBriefingHomeRelevanceService";

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

  it("does not use publication time to extend a Photo Event beyond its following local day", () => {
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
