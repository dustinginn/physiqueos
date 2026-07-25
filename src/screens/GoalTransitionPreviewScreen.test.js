import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./GoalTransitionPreviewScreen.jsx", import.meta.url), "utf8");

describe("GoalTransitionPreviewScreen", () => {
  it("contains the reconciled coaching flow in the approved order", () => {
    const labels = ["Completion Review", "Primary Goal", "Guardrails", "How Progress Will Be Measured", "Calibration", "Protocol Transition", "Routine Preview", "Briefing Cadence", "Supporting Objectives", "Final Review"];
    let previous = -1;
    for (const label of labels) {
      const next = source.indexOf(label);
      expect(next).toBeGreaterThan(previous);
      previous = next;
    }
    expect(source).toContain("Goal creation");
    expect(source).not.toContain("Save & Continue");
    expect(source).not.toContain("Review Next Goal");
    expect(source).not.toContain("Ready to Begin");
    expect(source).toContain("Create Goal");
  });
  it("uses normal-flow Back and Next controls in the mobile-width shell", () => {
    expect(source).toContain("max-w-[393px]");
    expect(source).toContain('data-testid="transition-page-actions"');
    expect(source).not.toContain("transition-action-dock");
    expect(source).not.toContain("fixed bottom-");
    expect(source).toContain("overflow-x-hidden");
  });
  it("uses transient URL navigation instead of durable currentSection for entry", () => {
    expect(source).toContain('initialSection = "completion"');
    expect(source).toContain("window.history.replaceState");
    expect(source).not.toContain("draft.currentSection");
    expect(source).not.toContain("/profile/protocols/");
  });
  it("hides backend metadata and explains evidence in goal-specific language", () => {
    expect(source).not.toContain("sourceProtocolId}</p>");
    expect(source).not.toContain("{item.importance}");
    expect(source).toContain("weight alone can’t tell us whether you’re gaining muscle or fat");
    expect(source).toContain("Nothing is being edited here.");
  });
  it("separates decision pages from informational review pages", () => {
    expect(source).toContain('mode="decision" title="What comes next?"');
    expect(source).toContain('mode="decision" title="What should we protect?"');
    expect(source).toContain("Customize Measurement Strategy");
    expect(source).toContain("Done Customizing");
    expect(source).not.toContain('item.accepted?"Included"');
    expect(source).toContain("function GroupedCommitments({items})");
    expect(source).not.toContain("function GroupedCommitments({items,onToggle})");
  });
  it("explains goal creation and the protocol-review handoff", () => {
    expect(source).toContain('title="Your New Goal"');
    expect(source).toContain("Next Step");
    expect(source).toContain("This creates your next goal.");
    expect(source).toContain("review the protocols that will support it");
  });
});
