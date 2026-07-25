import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("Home phase-aware visual hierarchy", () => {
  it("keeps the hero compact and moves confidence explanation behind interaction", () => {
    const hero = read("src/components/cards/HomeHeroCard.jsx");
    const detail = read("src/components/cards/HomeConfidenceDetail.jsx");
    expect(hero).not.toContain("confidenceNarrative &&");
    expect(hero).not.toContain("<ProgressBar");
    expect(detail).toContain("<button aria-label={`View why goal confidence is ${confidence} percent`}");
    expect(detail).toContain("<FloatingSheet");
    expect(detail).toContain("What supports confidence");
    expect(detail).toContain("What limits confidence");
    expect(detail).toContain("What will make confidence clearer");
    expect(detail).not.toMatch(/rawProgress|score formula|evidenceId/);
  });

  it("supports close, Escape/overlay conventions, and browser Back without persistence", () => {
    const detail = read("src/components/cards/HomeConfidenceDetail.jsx");
    expect(detail).toContain('window.addEventListener("popstate"');
    expect(detail).toContain("window.history.pushState");
    expect(detail).toContain("window.history.back()");
    expect(detail).not.toMatch(/repository|save|persist|server action/i);
  });

  it("uses distinct phase accents and keeps progress labels visually separate", () => {
    const goal = read("src/components/goals/GoalRow.jsx");
    expect(goal).toContain('upcoming ? "var(--chart-1)"');
    expect(goal).not.toContain("var(--success)");
    expect(goal).toContain('outcome ? "var(--chart-4)" : "var(--chart-3)"');
    expect(goal).toContain('phase.status === "active" || upcoming');
    expect(goal).toContain("borderColor: highlightedPhase");
    expect(goal).toContain("backgroundColor: highlightedPhase");
    expect(goal).toContain("outcome ? Dumbbell : Compass");
    expect(goal).toContain("text-right");
    expect(goal).not.toContain("Journey began");
  });
});
