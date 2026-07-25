import fs from "node:fs";
import { describe, expect, it } from "vitest";

const screen = fs.readFileSync(new URL("../../../../../screens/ProtocolTransitionPreviewScreen.jsx", import.meta.url), "utf8");
const groups = fs.readFileSync(new URL("../../../../../presentation/protocolReviewGroups.js", import.meta.url), "utf8");

describe("recommendation-first Protocol Review interaction", () => {
  it("does not show a disposition dropdown by default", () => {
    expect(screen).not.toContain("<select");
    expect(screen).toContain("Coach recommendation");
    expect(screen).toContain("I’d like to do something different");
  });

  it("progressively discloses clearly named alternatives", () => {
    expect(screen).toContain("showAlternatives&&<AlternativeChoices");
    for (const label of ["Keep this plan", "Update this plan", "Choose a new plan", "Pause for now", "Leave it behind"]) expect(screen).toContain(label);
  });

  it("uses recommendation-specific primary actions", () => {
    for (const label of ["Keep This Plan", "Review and Update", "Choose a New Plan", "Pause This Plan", "Leave This Plan Behind"]) expect(groups).toContain(label);
    expect(screen).toContain('if (["update", "replace"].includes(disposition) || needsVirtualCadence)');
    expect(screen).toContain('else navigate("protocols")');
  });

  it("keeps grouped item decisions independently addressable", () => {
    expect(screen).toContain('saveDisposition(review.id,"keep",group.id)');
    expect(screen).toContain('saveDisposition(review.id,"pause",group.id)');
    expect(screen).toContain("editGroupedItem(review)");
    expect(screen).toContain("reviewId=${encodeURIComponent(review.id)}");
    expect(screen).toContain('saveDisposition(review.id,"leave_behind",group.id)');
  });
});
