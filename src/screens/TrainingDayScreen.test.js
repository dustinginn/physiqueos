import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { formatDaySummary } from "./TrainingDayScreen.jsx";

const source = fs.readFileSync(new URL("./TrainingDayScreen.jsx", import.meta.url), "utf8");
const historySource = fs.readFileSync(new URL("../components/training/TrainingHistorySheet.jsx", import.meta.url), "utf8");

describe("Training Day presentation", () => {
  it("presents human-readable summaries without rendering internal identities", () => {
    expect(formatDaySummary({ bodyAreas: ["Quads"], strengthSessions: 1, exerciseCount: 4, hasWalking: true }))
      .toBe("Quads · 1 strength session · 4 exercises · Walking");
    expect(source).toContain("session.title");
    expect(source).toContain("session.detail");
    expect(source).not.toMatch(/canonicalId|source key|relationshipId/);
  });

  it("routes a Recent Training History date row to Training Day", () => {
    expect(historySource).toContain("day.href ?? `/progress/training/day/${day.date}`");
    expect(historySource).not.toContain("day.sessions?.[0]?.href");
  });
});
