import fs from "node:fs";
import { describe, expect, it } from "vitest";

const screen = fs.readFileSync(new URL("./YouScreen.jsx", import.meta.url), "utf8");
const bottomNavigation = fs.readFileSync(
  new URL("../fixtures/bottomNavigation.js", import.meta.url),
  "utf8"
);

describe("You production presentation", () => {
  it("uses one authoritative Goal count in the hero and Goals row", () => {
    expect(screen.match(/formatActiveGoalCount\(profile\.operatingStatus\.goals\)/g)).toHaveLength(1);
    expect(screen).toContain("formatActiveGoalCount(status.goals)");
    expect(screen).not.toContain("profile.goals.supporting.length");
  });

  it("removes only the redundant Evidence Sources presentations", () => {
    expect(screen).not.toContain("Evidence Sources");
    expect(screen).not.toContain('href="/progress?from=you"');
    expect(screen).toContain("grid grid-cols-3 gap-2");
    expect(bottomNavigation).toContain('label: "Evidence"');
    expect(bottomNavigation).toContain('href: "/progress"');
  });

  it("limits the doorway list to Goals, Operating Plan, and Integrations", () => {
    for (const label of ["Goals", "Operating Plan", "Integrations"]) {
      expect(screen).toContain(`title="${label}"`);
    }
    for (const retired of [
      "Protocols",
      "Preferences",
      "About You",
      "Privacy & Data",
    ]) {
      expect(screen).not.toContain(`title="${retired}"`);
    }
    expect(screen).toContain('{ label: "Active Protocols"');
    expect(screen).toContain('{ label: "Integrations"');
    expect(screen).toContain('href={`${profile.goals.href}?from=you`}');
    expect(screen).toContain("href={profile.operatingPlan.href}");
    expect(screen).not.toContain("href={profile.protocols.href}");
  });
});
