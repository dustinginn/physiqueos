import { describe, expect, it } from "vitest";
import { createDestination, DestinationId } from "../../contracts/v1/destination.js";
import { adaptApplicationReadModelToLegacyWeb } from "./legacyWebPresentation.js";

describe("legacy web read-model presentation", () => {
  it("restores typed destinations to href only at the legacy component edge", () => {
    const input = {
      hero: { destination: createDestination(DestinationId.GOAL_DETAIL, { goalId: "goal one" }) },
      cards: [{ destination: createDestination(DestinationId.PROFILE) }],
      narrative: { destination: "keep this domain value" },
    };

    expect(adaptApplicationReadModelToLegacyWeb(input)).toEqual({
      hero: { href: "/goals/goal%20one" },
      cards: [{ href: "/profile" }],
      narrative: { destination: "keep this domain value" },
    });
    expect(input.hero).not.toHaveProperty("href");
  });
});
