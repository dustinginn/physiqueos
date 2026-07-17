import fs from "node:fs";
import { describe, expect, it } from "vitest";

const screen = fs.readFileSync(new URL("./ProgressHubScreen.jsx", import.meta.url), "utf8");
const index = fs.readFileSync(
  new URL("../components/progress/EvidenceHubIndex.jsx", import.meta.url),
  "utf8"
);

describe("Evidence Hub V2", () => {
  it("uses one shared compact card in both sections", () => {
    expect(index.match(/<EvidenceStreamCard/g)).toHaveLength(2);
    expect(index.match(/function EvidenceStreamCard/g)).toHaveLength(1);
    expect(index).toContain("min-h-[68px]");
    expect(index).not.toMatch(/stream\.trend|text-2xl|Latest:/);
  });

  it("locks icon wrappers to a non-shrinking square and chevrons to fixed geometry", () => {
    expect(index).toContain("h-8 min-h-8 w-8 min-w-8 flex-none aspect-square rounded-full");
    expect(index).toContain('className="h-[18px] w-[18px] shrink-0 text-slate-400"');
    expect(index).toContain('size="sm"');
  });

  it("hides Recently Used during server rendering and cold-start hydration", () => {
    expect(index).toContain("useState([])");
    expect(index).toContain("recentlyUsed.length > 0");
    expect(index).toContain("window.localStorage");
    expect(index.indexOf("window.localStorage")).toBeGreaterThan(index.indexOf("useEffect"));
  });

  it("reads personalization once without reshuffling after click events", () => {
    expect(index).toContain("setRecentIds(rankRecentlyUsedEvidence");
    expect(index).toContain("}, []);");
    expect(index).not.toMatch(/setRecentIds\([^)]*recordVisit/);
  });

  it("records each card visit by stable evidence identifier", () => {
    expect(index).toContain("onClick={() => onVisit(stream.id)}");
    expect(index).toContain("recordEvidenceHubVisit(current, evidenceType");
  });

  it("retains all summaries, destinations, and accessible full-card navigation", () => {
    for (const label of ["Last workout", "Last logged", "Latest", "Last session", "Last scan"]) {
      expect(index).toContain(label);
    }
    expect(index).toContain("stream.href");
    expect(index).toContain("Review ${title}. ${accessibleSummary}");
    expect(index).toContain("focus-visible:ring-4");
    expect(index).not.toMatch(/narrative-preview|\/log/);
  });

  it("keeps the centered mobile column overflow-safe above the bottom navigation", () => {
    expect(screen).toContain("max-w-[393px]");
    expect(screen).toContain("overflow-x-hidden");
    expect(screen).toContain("pb-32");
    expect(index).toContain("w-full");
    expect(index).not.toMatch(/w-screen|min-w-\[/);
  });
});
