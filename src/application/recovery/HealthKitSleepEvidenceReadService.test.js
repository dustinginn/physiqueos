import { describe, expect, it } from "vitest";
import { createHealthKitSleepEvidenceReadService } from "./HealthKitSleepEvidenceReadService.js";

const day = (sleepDay, overrides = {}) => ({
  sleepDay, occurrenceDate: sleepDay, status: "asleep_recorded", algorithmVersion: "sleep-canon-v2",
  ingestionPurpose: "historical_evidence_import", origin: "historical_evidence_import", computedAt: "2026-10-01T12:00:00Z",
  mainEpisodeIndex: 0,
  mainSleep: { asleepSeconds: 25_200, awakeSeconds: 1200, deepSeconds: 3600, coreSeconds: 14_400, remSeconds: 7200, unspecifiedSeconds: 0, inBedSeconds: 27_000, stageCoverage: "stage_detail_available" },
  totalAsleepIncludingSecondarySeconds: 25_200,
  episodes: [{ kind: "main", start: `${sleepDay}T06:00:00Z`, end: `${sleepDay}T13:30:00Z`, timeZone: "America/Los_Angeles", timeZoneSource: "device_at_ingest", primarySource: { sourceFamily: "oura" }, corroboratingSources: [{ sourceFamily: "apple_watch" }], completeness: { stageDetail: "available" }, timeline: [
    { stage: "asleep_core", start: `${sleepDay}T06:00:00Z`, end: `${sleepDay}T10:00:00Z` },
    { stage: "awake", start: `${sleepDay}T10:00:00Z`, end: `${sleepDay}T10:20:00Z` },
    { stage: "asleep_rem", start: `${sleepDay}T10:20:00Z`, end: `${sleepDay}T13:30:00Z` },
  ] }], ...overrides,
});

function service(rows) {
  const calls = [];
  return { calls, value: createHealthKitSleepEvidenceReadService({
    store: { async listDays(input) { calls.push(input); return rows.filter((row) => row.sleepDay >= input.startDate && row.sleepDay <= input.endDate); } },
    now: () => new Date("2026-09-30T12:00:00Z"),
  }) };
}

describe("Recovery/Sleep Evidence read model", () => {
  it("builds bounded landing, sanitizes source families, and excludes uncertain historical clocks from consistency", async () => {
    const current = service([day("2026-09-30"), day("2026-09-29")]);
    const result = await current.value.landing({ ownerUserId: "owner", throughDate: "2026-09-30" });
    expect(current.calls).toEqual([{ ownerUserId: "owner", startDate: "2026-09-01", endDate: "2026-09-30" }]);
    expect(result).toMatchObject({ lastNight: { sleepDay: "2026-09-30", source: "Oura", strategicEligible: false }, sevenNightAverage: { seconds: 25200, nightCount: 2 }, window: { nightsUsed: 0, inferredNightsExcluded: 2 }, sources: [{ label: "Apple Watch" }, { label: "Oura" }], strategicUse: "quarantined" });
    expect(JSON.stringify(result)).not.toContain("com.ouraring");
  });

  it("returns full v2 night inspection fields and prefers prospective at an overlapping day", async () => {
    const historical = day("2026-09-30");
    const prospective = day("2026-09-30", { ingestionPurpose: "validation_only", origin: "validation_only" });
    const result = await service([historical, prospective]).value.night({ ownerUserId: "owner", sleepDay: "2026-09-30" });
    expect(result).toMatchObject({ sleepDay: "2026-09-30", stages: { deepSeconds: 3600 }, continuity: { awakeInWindowSeconds: 1200, longestAsleepStretchSeconds: 14400 }, timeInBedSeconds: 27000, timeZoneBasis: "device_at_ingest", provenance: { origin: "validation_only" }, strategicEligible: false });
  });

  it("bounds pagination and aggregates long ranges weekly", async () => {
    const rows = Array.from({ length: 220 }, (_, index) => day(new Date(Date.parse("2026-09-30T00:00:00Z") - index * 86_400_000).toISOString().slice(0,10)));
    const result = await service(rows).value.trends({ ownerUserId: "owner", startDate: "2026-02-01", endDate: "2026-09-30", limit: 20 });
    expect(result.granularity).toBe("week");
    expect(result.nights).toHaveLength(20);
    expect(result.page.nextCursor).toBeTruthy();
    expect(result.series.length).toBeGreaterThan(20);
  });
});
