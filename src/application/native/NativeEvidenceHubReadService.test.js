import { describe, expect, it, vi } from "vitest";
import { readNativeEvidenceHub } from "./NativeEvidenceHubReadService.js";

const NOW = new Date("2026-09-30T20:00:00.000Z");

describe("Native Evidence Hub aggregate", () => {
  it("returns seven compact Server-owned summaries in canonical order", async () => {
    const result = await readNativeEvidenceHub({ readers: readers(), currentDate: NOW });
    expect(result.streams.map(({ id }) => id)).toEqual([
      "training", "nutrition", "weight", "photos", "dexa", "activity", "energy",
    ]);
    expect(result.streams.every(({ state }) => state === "available")).toBe(true);
    expect(result.streams.find(({ id }) => id === "dexa")).toMatchObject({ metric: "12.4%", trend: "Last scan 2026-09-20" });
    expect(result.streams.find(({ id }) => id === "energy")).toMatchObject({ metric: "complete", trend: "1 of 1 evidence days complete" });
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(8_192);
  });

  it("represents independently empty streams without failing the aggregate", async () => {
    const source = readers();
    source.training.getLanding.mockResolvedValue({ report: { latestTrainingDay: null } });
    source.progress.getNutrition.mockResolvedValue({ report: { nutritionDays: [] } });
    source.progress.getWeight.mockResolvedValue({ timeline: {}, report: { history: [], chart: { markers: [] } } });
    source.photos.getNativePhotosTimeline.mockResolvedValue({ sessions: [] });
    source.progress.getDEXA.mockResolvedValue({ report: { latestScan: null, summary: [] } });
    source.progress.getActivity.mockResolvedValue({ report: { latestActivityDay: null } });
    source.progress.getEnergy.mockResolvedValue({ activityDays: [], nutritionDays: [], dexaScans: [], timeline: timeline() });
    const result = await readNativeEvidenceHub({ readers: source, currentDate: NOW });
    expect(result.streams.every(({ state, status }) => state === "empty" && status === "placeholder")).toBe(true);
  });

  it.each(["training", "nutrition", "weight", "photos", "dexa", "activity", "energy"])(
    "keeps the other six streams available when only %s is empty",
    async (emptyStream) => {
      const source = readers();
      setEmpty(source, emptyStream);
      const result = await readNativeEvidenceHub({ readers: source, currentDate: NOW });
      expect(result.streams.find(({ id }) => id === emptyStream)).toMatchObject({ state: "empty", status: "placeholder" });
      expect(result.streams.filter(({ state }) => state === "available")).toHaveLength(6);
    }
  );

  it.each(["training", "nutrition", "weight", "photos", "dexa", "activity", "energy"])(
    "fails soft when only %s is unavailable",
    async (failed) => {
      const source = readers();
      method(source, failed).mockRejectedValue(new Error("private failure detail"));
      const result = await readNativeEvidenceHub({ readers: source, currentDate: NOW });
      expect(result.streams.find(({ id }) => id === failed)).toMatchObject({
        state: "unavailable", status: "placeholder", metric: "Temporarily unavailable", failureClass: "read_failed",
      });
      expect(result.streams.filter(({ state }) => state === "available")).toHaveLength(6);
      expect(JSON.stringify(result)).not.toContain("private failure detail");
    }
  );

  it("isolates multiple failures, malformed contracts, and emits privacy-safe state telemetry", async () => {
    const source = readers();
    source.training.getLanding.mockRejectedValue(new Error("training secret"));
    source.progress.getNutrition.mockRejectedValue(new Error("nutrition secret"));
    source.progress.getDEXA.mockResolvedValue("malformed");
    const events = [];
    const result = await readNativeEvidenceHub({ readers: source, currentDate: NOW, onTelemetry: (event) => events.push(event) });
    expect(result.streams.filter(({ state }) => state === "unavailable").map(({ id }) => id)).toEqual(["training", "nutrition", "dexa"]);
    expect(result.streams.find(({ id }) => id === "dexa").failureClass).toBe("contract_invalid");
    expect(events).toEqual([expect.objectContaining({ event: "native.evidence_hub.composed", states: expect.objectContaining({ training: "unavailable", weight: "available" }) })]);
    expect(JSON.stringify(events)).not.toMatch(/secret|user|token|payload/i);
  });
});

function readers() {
  return {
    training: { getLanding: vi.fn(async () => ({ report: { latestTrainingDay: { date: "2026-09-29", daySummary: "4 exercises" } } })) },
    progress: {
      getNutrition: vi.fn(async () => ({ report: { nutritionDays: [{ date: "2026-09-29", value: "2,300 calories", detail: "180g protein" }] } })),
      getWeight: vi.fn(async () => ({ timeline: timeline(), report: { current: { date: "2026-09-30", value: "176.2 lb", detail: "Down 0.4 lb" }, history: [{ date: "2026-09-30", value: "176.2 lb", detail: "Down 0.4 lb" }], chart: { markers: [] } } })),
      getDEXA: vi.fn(async () => ({ report: { latestScan: { date: "2026-09-20" }, summary: [{ label: "Body Fat", value: "12.4%" }] } })),
      getActivity: vi.fn(async () => ({ report: { latestActivityDay: { date: "2026-09-29", value: "720 active cal", detail: "Daily activity summary" } } })),
      getEnergy: vi.fn(async () => ({
        activityDays: [{ id: "activity", date: "2026-09-29", activeCalories: 700 }],
        nutritionDays: [{ id: "nutrition", date: "2026-09-29", totals: { calories: 2_300 } }],
        dexaScans: [{ id: "dexa", measuredAt: "2026-09-20", restingMetabolicRate: { value: 1_700 } }],
        timeline: timeline(),
      })),
    },
    photos: { getNativePhotosTimeline: vi.fn(async () => ({ sessions: [{ intendedCaptureDate: "2026-09-28", photos: [{}, {}, {}] }] })) },
  };
}

function method(source, id) {
  if (id === "training") return source.training.getLanding;
  if (id === "photos") return source.photos.getNativePhotosTimeline;
  const names = { nutrition: "getNutrition", weight: "getWeight", dexa: "getDEXA", activity: "getActivity", energy: "getEnergy" };
  return source.progress[names[id]];
}

function setEmpty(source, id) {
  if (id === "training") source.training.getLanding.mockResolvedValue({ report: { latestTrainingDay: null } });
  if (id === "nutrition") source.progress.getNutrition.mockResolvedValue({ report: { nutritionDays: [] } });
  if (id === "weight") source.progress.getWeight.mockResolvedValue({ timeline: timeline(), report: { history: [], chart: { markers: [] } } });
  if (id === "photos") source.photos.getNativePhotosTimeline.mockResolvedValue({ sessions: [] });
  if (id === "dexa") source.progress.getDEXA.mockResolvedValue({ report: { latestScan: null, summary: [] } });
  if (id === "activity") source.progress.getActivity.mockResolvedValue({ report: { latestActivityDay: null } });
  if (id === "energy") source.progress.getEnergy.mockResolvedValue({ activityDays: [], nutritionDays: [], dexaScans: [], timeline: timeline() });
}

function timeline() {
  return { contextId: "all", type: "all_history", selectedLabel: "All", options: [] };
}
