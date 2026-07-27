import { describe, expect, it } from "vitest";
import {
  createPICadenceConfidenceReasoning,
} from "./PICadenceConfidenceReasoningService";

describe("Photo confidence cadence deduplication", () => {
  it.each(["midweek", "weekly"])(
    "keeps consumed Photo authority contextual in %s", (cadence) => {
      const artifact = cadence === "weekly"
        ? {
            id: "weekly_future",
            evidenceWindow: { id: "week_future" },
            briefing: { weeklyNarrative: {
              cards: { interpretation: { domains: [{
                domain: "photos",
                insight: "Photos support a stable visual guardrail.",
              }] } },
            } },
          }
        : {
            id: "midweek_future",
            evidenceWindow: { id: "midweek_future" },
            briefing: { training: {}, weightContext: {}, energyBalance: {} },
          };
      const result = createPICadenceConfidenceReasoning({
        cadence, artifact,
      });
      expect(result.domainStates.photos).toMatchObject({
        status: "missing",
      });
      if (cadence === "weekly") {
        expect(result.domainStates.photos.contextualStatus).toBe("stable");
      }
    }
  );
});
