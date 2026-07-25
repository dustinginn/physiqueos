import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { summarizeTrainingActivities } from "./ProgressPlaceholderScreen";
import { getTrainingDaySummary } from "../presentation/trainingPresentation";

const source = fs.readFileSync(new URL("./ProgressPlaceholderScreen.jsx", import.meta.url), "utf8");
const historySheetSource = fs.readFileSync(
  new URL("../components/training/TrainingHistorySheet.jsx", import.meta.url),
  "utf8"
);

describe("Training Evidence workflow presentation", () => {
  it("keeps Latest Training Day as the first Training content section", () => {
    const trainingStart = source.indexOf("function TrainingEvidenceReport");
    const latest = source.indexOf('title="Latest Training Day"', trainingStart);
    const areas = source.indexOf('title="Training Areas"', trainingStart);
    expect(latest).toBeGreaterThan(trainingStart);
    expect(latest).toBeLessThan(areas);
  });

  it("orders Current Protocol, Related Goals, then Data Sources", () => {
    const trainingStart = source.indexOf("function TrainingEvidenceReport");
    const currentProtocol = source.indexOf('title="Current Protocol"', trainingStart);
    const relatedGoals = source.indexOf('mode="related-goals"', currentProtocol);
    const dataSources = source.indexOf("<TrainingSourceMetadataFooter", relatedGoals);
    expect(currentProtocol).toBeGreaterThan(trainingStart);
    expect(relatedGoals).toBeGreaterThan(currentProtocol);
    expect(dataSources).toBeGreaterThan(relatedGoals);
  });

  it("collapses duplicate same-day activity labels without changing session records", () => {
    const sessions = [
      { id: "1", label: "Stair Stepper" },
      { id: "2", label: "Outdoor Walk" },
      { id: "3", label: "Traditional Strength Training" },
      { id: "4", label: "Stair Stepper" },
      { id: "5", label: "Outdoor Walk" },
    ];
    expect(summarizeTrainingActivities(sessions)).toEqual([
      "Strength Training",
      "Stair Stepper",
      "Outdoor Walk",
    ]);
    expect(sessions).toHaveLength(5);
    expect(source).toContain("<RecordPreview entries={trainingDay.sessions} showSources />");
  });

  it("uses the shared muscle-group summary and preserves the existing training-day action", () => {
    expect(source).toContain("getTrainingDaySummary(");
    expect(source).toContain("View Training Day →");
    expect(source).not.toContain("trainingDay.sessions.slice(0, 5)");
    expect(source).not.toContain("{trainingDay.summary}");
    expect(source).not.toContain("{day.summary}");
    expect(
      getTrainingDaySummary([
        {
          label: "Traditional Strength Training",
          exercises: [{ name: "Hanging Leg Raise" }, { name: "Lying Leg Curl" }],
        },
        { label: "Outdoor Walk" },
      ])
    ).toBe("Core · Hamstrings · Walking");
  });

  it("opens complete recent history in the shared FloatingSheet", () => {
    expect(source).toContain("<TrainingHistorySheet");
    expect(source).toContain("days={trainingDays}");
    expect(source).not.toContain(
      'action={{ href: "/progress/training/reporting/history", label: "Show All" }}'
    );
    expect(historySheetSource).toContain("getTrainingDaySummary(day.sessions)");
    expect(historySheetSource).not.toContain("day.summary");
  });

  it("keeps the mobile page centered without horizontal overflow primitives", () => {
    expect(source).toContain("max-w-[393px]");
    expect(source).not.toMatch(/w-screen|min-w-\[/);
  });
});
