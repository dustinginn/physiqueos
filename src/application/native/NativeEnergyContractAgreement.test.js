import { describe, expect, it, vi } from "vitest";
import { createNativeProductionContractService } from "./NativeProductionContractService.js";
import { createProviderEnergyEvidenceReport } from "../../domain/services/EnergyEvidenceService.js";

// Proves that, given the same canonical raw Energy inputs, the production
// Native energy read and the web /progress/energy composition
// (src/app/progress/energy/page.js) resolve to the same finished Energy
// semantics. Outer transport (the Native envelope) is intentionally excluded
// from the comparison -- only the composed report itself must agree.

const OWNER = "user_founder_001";
const principal = Object.freeze({
  userId: OWNER,
  deviceId: "device-native-001",
  sessionId: "session-native-001",
  scopes: Object.freeze(["founder:read", "founder:write"]),
});

const RAW_ENERGY_EVIDENCE = Object.freeze({
  activityDays: Object.freeze([
    Object.freeze({ id: "activity-1", date: "2026-07-23", activeCalories: 897, totalCalories: 2987 }),
  ]),
  dexaScans: Object.freeze([
    Object.freeze({ id: "dexa-1", measuredAt: "2026-07-18", restingMetabolicRate: { value: 1794 } }),
  ]),
  nutritionDays: Object.freeze([
    Object.freeze({ id: "nutrition-1", date: "2026-07-23", totals: { calories: 2321 }, meals: [{ totals: { calories: 1 } }] }),
  ]),
  timeline: Object.freeze({ contextId: "all", selectedLabel: "All Energy", options: Object.freeze([]) }),
});

function nativeService() {
  const readers = {
    progress: { getEnergy: vi.fn(async () => RAW_ENERGY_EVIDENCE) },
  };
  return createNativeProductionContractService({
    authenticate: vi.fn(async () => principal),
    ownerUserId: OWNER,
    readers,
    now: () => new Date("2026-07-24T12:00:00.000Z"),
  });
}

function request() {
  return new Request("https://physiqueos.example/api/v1/native/read/energy", {
    headers: { authorization: `Bearer ${"x".repeat(43)}` },
  });
}

describe("Web/Native Energy contract agreement", () => {
  it("resolves the Native production Energy read to the same canonical report the web Energy page composes", async () => {
    const webReport = createProviderEnergyEvidenceReport({
      ...RAW_ENERGY_EVIDENCE,
      contextId: RAW_ENERGY_EVIDENCE.timeline.contextId,
      timeline: RAW_ENERGY_EVIDENCE.timeline,
    });

    const nativeResult = await nativeService().read({ request: request(), resource: "energy" });

    // Semantic agreement on the composed report -- not a byte-identical
    // transport comparison. The Native envelope (contractVersion, resource,
    // authority, generatedAt) deliberately has no web equivalent.
    expect(nativeResult.data).toEqual(webReport);
  });

  it("carries forward RMR, intake, expenditure, and balance identically on both paths", async () => {
    const webReport = createProviderEnergyEvidenceReport({
      ...RAW_ENERGY_EVIDENCE,
      contextId: RAW_ENERGY_EVIDENCE.timeline.contextId,
      timeline: RAW_ENERGY_EVIDENCE.timeline,
    });
    const nativeResult = await nativeService().read({ request: request(), resource: "energy" });

    const [webDay] = webReport.days;
    const [nativeDay] = nativeResult.data.days;
    expect(nativeDay).toEqual(webDay);
    expect(nativeDay).toMatchObject({
      calorieIntake: 2321,
      activeCalories: 897,
      rmr: 1794,
      rmrScanId: "dexa-1",
      rmrScanDate: "2026-07-18",
      estimatedExpenditure: 2691,
      expenditureKind: "estimated_rmr_plus_active",
      energyBalance: -370,
      completeness: "complete",
    });
  });

  it("distinguishes missing evidence from an observed zero identically on both paths", async () => {
    const rawWithRestDay = Object.freeze({
      ...RAW_ENERGY_EVIDENCE,
      activityDays: Object.freeze([
        Object.freeze({ id: "rest-day", date: "2026-07-24", activeCalories: 0 }),
      ]),
      nutritionDays: Object.freeze([]),
    });
    const webReport = createProviderEnergyEvidenceReport({
      ...rawWithRestDay,
      contextId: rawWithRestDay.timeline.contextId,
      timeline: rawWithRestDay.timeline,
    });
    const readers = { progress: { getEnergy: vi.fn(async () => rawWithRestDay) } };
    const service = createNativeProductionContractService({
      authenticate: vi.fn(async () => principal),
      ownerUserId: OWNER,
      readers,
      now: () => new Date("2026-07-24T12:00:00.000Z"),
    });
    const nativeResult = await service.read({ request: request(), resource: "energy" });

    expect(nativeResult.data).toEqual(webReport);
    const restDay = nativeResult.data.days.find((day) => day.date === "2026-07-24");
    expect(restDay).toMatchObject({ activityDayId: "rest-day", activeCalories: 0, completeness: "activity-only" });
    expect(restDay.calorieIntake).toBeNull();
  });

  it("aggregates weekly Energy identically on both paths", async () => {
    const webReport = createProviderEnergyEvidenceReport({
      ...RAW_ENERGY_EVIDENCE,
      contextId: RAW_ENERGY_EVIDENCE.timeline.contextId,
      timeline: RAW_ENERGY_EVIDENCE.timeline,
    });
    const nativeResult = await nativeService().read({ request: request(), resource: "energy" });

    expect(nativeResult.data.weeks).toEqual(webReport.weeks);
    expect(nativeResult.data.recentFourWeeks).toEqual(webReport.recentFourWeeks);
    expect(nativeResult.data.audit).toEqual(webReport.audit);
  });
});
