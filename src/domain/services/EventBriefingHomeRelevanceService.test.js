import { describe, expect, it } from "vitest";
import { isEventBriefingRelevantForHome } from
  "./EventBriefingHomeRelevanceService";

describe("Event Briefing Home relevance", () => {
  it("keeps a freshly published DEXA event active only on its publication day", () => {
    const artifact = dexa("2026-08-15T19:02:57.601Z");
    expect(isEventBriefingRelevantForHome({
      artifact,
      localDate: "2026-08-15",
      timeZone: "America/Los_Angeles",
    })).toBe(true);
    expect(isEventBriefingRelevantForHome({
      artifact,
      localDate: "2026-08-30",
      timeZone: "America/Los_Angeles",
    })).toBe(false);
    expect(artifact.lifecycle).toEqual({});
  });

  it("preserves the existing Photo Event late-publication rule", () => {
    const artifact = {
      generatedAt: "2026-08-10T02:08:18.679Z",
      trigger: { evidenceType: "photo_session" },
      briefing: { photoEventNarrative: { eventDate: "2026-08-08" } },
    };
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
});

function dexa(generatedAt) {
  return {
    id: "dexa-event",
    generatedAt,
    trigger: { evidenceType: "dexa", evidenceId: "scan" },
    lifecycle: {},
    briefing: { dexaEventNarrative: { scanDate: "2026-08-15" } },
  };
}
