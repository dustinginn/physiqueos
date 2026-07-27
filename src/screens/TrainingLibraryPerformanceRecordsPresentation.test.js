import fs from "node:fs";
import { describe, expect, it } from "vitest";

const screen = fs.readFileSync(
  new URL("./TrainingKnowledgeScreen.jsx", import.meta.url),
  "utf8"
);
const route = fs.readFileSync(
  new URL("../app/progress/training/library/[[...path]]/page.js", import.meta.url),
  "utf8"
);

describe("Training Library persisted performance-record presentation", () => {
  it("reads the dedicated repository and resolves the selected canonical identity", () => {
    expect(route).toContain(
      "FounderRepositories.trainingPerformanceEvents"
    );
    expect(route).toContain("resolveTrainingExerciseIdentity(path.at(-1))");
    expect(route).toContain("createTrainingLibraryExerciseRecordsReadModel");
    expect(route).not.toMatch(/TrainingPerformanceIntelligenceService|commitProgress|pr_detection/);
  });

  it("places an additive Performance Records card after the benchmark", () => {
    const benchmark = screen.indexOf('key="benchmark"');
    const records = screen.indexOf('key="performance-records"');
    const latest = screen.indexOf('key="last-session"');
    const history = screen.indexOf('key="history"', latest);
    expect(benchmark).toBeGreaterThan(-1);
    expect(records).toBeGreaterThan(benchmark);
    expect(latest).toBeGreaterThan(records);
    expect(history).toBeGreaterThan(latest);
    expect(screen).toContain("Durable achievements");
    expect(screen).toContain("{model.heading}");
    expect(screen).toContain("model.countLabel");
  });
});
