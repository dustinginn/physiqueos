import fs from "node:fs";
import { describe, expect, it } from "vitest";

const page = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");
const action = fs.readFileSync(new URL("./actions.js", import.meta.url), "utf8");

describe("Goal Transition preview route safety", () => {
  it("resolves entry from query state and keeps GET read-only", () => {
    expect(page).toContain("resolveGoalTransitionPreviewSection(query)");
    expect(page).toContain("getOrPreview");
    expect(page).not.toMatch(/\.saveSection\(|\.markReady\(|\.updateGoal\(|\.saveGoal\(/);
  });
  it("keeps mutations behind explicit server actions", () => {
    expect(action).toContain('"use server"');
    expect(action).not.toMatch(/\.updateGoal\(|\.saveGoal\(|\.updateProtocol\(|\.saveProtocol\(/);
  });
});
