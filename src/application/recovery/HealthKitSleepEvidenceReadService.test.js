import { describe, expect, it } from "vitest";
import { createHealthKitSleepEvidenceReadService } from "./HealthKitSleepEvidenceReadService.js";

const day = (sleepDay, overrides = {}) => ({
  sleepDay, occurrenceDate: sleepDay, status: "asleep_recorded", algorithmVersion: "sleep-canon-v2",
  ingestionPurpose: "historical_evidence_import", origin: "historical_evidence_import", computedAt: "2026-10-01T12:00:00Z",
  mainEpisodeIndex: 0,
  mainSleep: { asleepSeconds: 25_200, awakeSeconds: 1200, deepSeconds: 3600, coreSeconds: 14_400, remSeconds: 7200, unspecifiedSeconds: 0, inBedSeconds: 27_000, stageCoverage: 1 },
  totalAsleepIncludingSecondarySeconds: 25_200,
  episodes: [{ kind: "main", start: `${sleepDay}T06:00:00Z`, end: `${sleepDay}T13:30:00Z`, timeZone: "America/Los_Angeles", timeZoneSource: "device_at_ingest", primarySource: { sourceFamily: "oura" }, corroboratingSources: [{ sourceFamily: "apple_watch" }], completeness: { stageDetail: "staged" }, timeline: [
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

function reliableDay(sleepDay, { start, end, timeZone = "UTC", timeZoneSource = "source_local_time" } = {}) {
  const base = day(sleepDay);
  return day(sleepDay, {
    ingestionPurpose: "validation_only",
    origin: "validation_only",
    episodes: [{
      ...base.episodes[0],
      start,
      end,
      timeZone,
      timeZoneSource,
      timeline: [{ stage: "asleep_core", start, end }],
    }],
  });
}

function utcWindow(sleepDay, start, end) {
  return reliableDay(sleepDay, {
    start: `2026-09-${start < "18:00" ? "30" : "29"}T${start}:00Z`,
    end: `2026-09-${end < "18:00" ? "30" : "29"}T${end}:00Z`,
  });
}

async function windowFor(rows) {
  const throughDate = rows.map((row) => row.sleepDay).sort().at(-1) ?? "2026-09-30";
  return (await service(rows).value.landing({ ownerUserId: "owner", throughDate })).window;
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
    expect(result).toMatchObject({ sleepDay: "2026-09-30", stageStatus: "available", stages: { deepSeconds: 3600 }, continuity: { awakeInWindowSeconds: 1200, longestAsleepStretchSeconds: 14400 }, timeInBedSeconds: 27000, timeZoneBasis: "device_at_ingest", provenance: { origin: "validation_only" }, strategicEligible: false });
  });

  it("does not infer stage availability from a numeric zero-coverage field", async () => {
    const unstaged = day("2026-09-30", {
      mainSleep: { ...day("2026-09-30").mainSleep, stageCoverage: 0 },
      episodes: [{ ...day("2026-09-30").episodes[0], completeness: { stageDetail: "stage_detail_absent" } }],
    });
    const result = await service([unstaged]).value.night({ ownerUserId: "owner", sleepDay: "2026-09-30" });
    expect(result.stageStatus).toBe("unavailable");
  });

  it("bounds pagination and aggregates long ranges weekly", async () => {
    const rows = Array.from({ length: 220 }, (_, index) => day(new Date(Date.parse("2026-09-30T00:00:00Z") - index * 86_400_000).toISOString().slice(0,10)));
    const result = await service(rows).value.trends({ ownerUserId: "owner", startDate: "2026-02-01", endDate: "2026-09-30", limit: 20 });
    expect(result.granularity).toBe("week");
    expect(result.nights).toHaveLength(20);
    expect(result.page.nextCursor).toBeTruthy();
    expect(result.series.length).toBeGreaterThan(20);
  });

  describe("midnight-safe Sleep Window consistency", () => {
    it("keeps starts entirely before midnight in ordinary order", async () => {
      const result = await windowFor([
        utcWindow("2026-09-30", "22:00", "06:00"),
        utcWindow("2026-09-29", "23:00", "07:00"),
        utcWindow("2026-09-28", "23:30", "07:30"),
      ]);
      expect(result).toMatchObject({ medianStartMinute: 1380, startSpreadMinutes: 30, nightsUsed: 3 });
    });

    it("keeps starts entirely after midnight in ordinary order", async () => {
      const result = await windowFor([
        utcWindow("2026-09-30", "00:10", "07:00"),
        utcWindow("2026-09-29", "00:30", "07:10"),
        utcWindow("2026-09-28", "01:00", "07:20"),
      ]);
      expect(result).toMatchObject({ medianStartMinute: 30, startSpreadMinutes: 20 });
    });

    it("treats tightly straddling midnight starts as nearby night-clock values", async () => {
      const result = await windowFor([
        utcWindow("2026-09-30", "23:50", "07:00"),
        utcWindow("2026-09-29", "00:20", "07:10"),
        utcWindow("2026-09-28", "00:10", "07:20"),
      ]);
      expect(result).toMatchObject({ medianStartMinute: 10, startSpreadMinutes: 10 });
    });

    it("maps the 23:59/00:01 even median back to exactly midnight", async () => {
      const result = await windowFor([
        utcWindow("2026-09-30", "23:59", "06:59"),
        utcWindow("2026-09-29", "00:01", "07:01"),
      ]);
      expect(result).toMatchObject({ medianStartMinute: 0, medianEndMinute: 420, startSpreadMinutes: 1, endSpreadMinutes: 1, nightsUsed: 2 });
    });

    it("handles a wider valid distribution across midnight without producing a daytime median", async () => {
      const result = await windowFor([
        utcWindow("2026-09-30", "22:30", "06:00"),
        utcWindow("2026-09-29", "23:30", "07:00"),
        utcWindow("2026-09-28", "00:30", "08:00"),
        utcWindow("2026-09-27", "01:30", "09:00"),
      ]);
      expect(result).toMatchObject({ medianStartMinute: 0, medianEndMinute: 450, startSpreadMinutes: 60, endSpreadMinutes: 60 });
    });

    it("computes morning wake-time median and spread in the same transformed domain", async () => {
      const result = await windowFor([
        utcWindow("2026-09-30", "23:00", "05:30"),
        utcWindow("2026-09-29", "23:10", "06:30"),
        utcWindow("2026-09-28", "23:20", "07:30"),
      ]);
      expect(result).toMatchObject({ medianEndMinute: 390, endSpreadMinutes: 60 });
    });

    it("keeps noon-straddling wake times close while making the 18:00 anchor cut explicit", async () => {
      const noon = await windowFor([
        utcWindow("2026-09-30", "03:00", "11:59"),
        utcWindow("2026-09-29", "03:00", "12:01"),
      ]);
      const anchor = await windowFor([
        utcWindow("2026-09-30", "03:00", "17:59"),
        utcWindow("2026-09-29", "03:00", "18:01"),
      ]);
      expect(noon).toMatchObject({ medianEndMinute: 720, endSpreadMinutes: 1 });
      expect(anchor).toMatchObject({ medianEndMinute: 360, endSpreadMinutes: 719 });
    });

    it("projects an episode spanning midnight to a midnight-safe typical window", async () => {
      const result = await windowFor([
        utcWindow("2026-09-30", "23:55", "07:30"),
        utcWindow("2026-09-29", "00:05", "07:40"),
      ]);
      expect(result).toMatchObject({ medianStartMinute: 0, medianEndMinute: 455, startSpreadMinutes: 5, endSpreadMinutes: 5 });
    });

    it("uses the documented rounded midpoint for even samples and the exact center for odd samples", async () => {
      const even = await windowFor([
        utcWindow("2026-09-30", "23:58", "06:58"),
        utcWindow("2026-09-29", "00:01", "07:01"),
      ]);
      const odd = await windowFor([
        utcWindow("2026-09-30", "23:50", "06:50"),
        utcWindow("2026-09-29", "00:01", "07:01"),
        utcWindow("2026-09-28", "00:20", "07:20"),
      ]);
      expect(even).toMatchObject({ medianStartMinute: 0, medianEndMinute: 420, startSpreadMinutes: 2, endSpreadMinutes: 2 });
      expect(odd).toMatchObject({ medianStartMinute: 1, medianEndMinute: 421 });
    });

    it("returns exact values for one reliable night and a rounded midpoint for two", async () => {
      const one = await windowFor([utcWindow("2026-09-30", "23:47", "07:13")]);
      const two = await windowFor([
        utcWindow("2026-09-30", "23:47", "07:13"),
        utcWindow("2026-09-29", "00:13", "07:47"),
      ]);
      expect(one).toMatchObject({ medianStartMinute: 1427, medianEndMinute: 433, startSpreadMinutes: 0, endSpreadMinutes: 0, nightsUsed: 1 });
      expect(two).toMatchObject({ medianStartMinute: 0, medianEndMinute: 450, startSpreadMinutes: 13, endSpreadMinutes: 17, nightsUsed: 2 });
    });

    it("counts mixed reliable and uncertain nights without using uncertain clock times", async () => {
      const result = await windowFor([
        utcWindow("2026-09-30", "23:50", "07:10"),
        day("2026-09-29"),
        utcWindow("2026-09-28", "00:10", "07:30"),
      ]);
      expect(result).toMatchObject({ medianStartMinute: 0, medianEndMinute: 440, nightsUsed: 2, inferredNightsExcluded: 1 });
    });

    it("preserves existing provenance eligibility for historical reliable and prospective device-at-ingest clocks", async () => {
      const historicalReliable = reliableDay("2026-09-30", { start: "2026-09-30T23:50:00Z", end: "2026-10-01T07:10:00Z" });
      historicalReliable.ingestionPurpose = "historical_evidence_import";
      historicalReliable.origin = "historical_evidence_import";
      const prospectiveDevice = reliableDay("2026-09-29", { start: "2026-09-29T00:10:00Z", end: "2026-09-29T07:30:00Z", timeZoneSource: "device_at_ingest" });
      const result = await windowFor([historicalReliable, prospectiveDevice, day("2026-09-28")]);
      expect(result).toMatchObject({ medianStartMinute: 0, medianEndMinute: 440, nightsUsed: 2, inferredNightsExcluded: 1 });
    });

    it("returns no formal typical window when every night is uncertain", async () => {
      const result = await windowFor([day("2026-09-30"), day("2026-09-29")]);
      expect(result).toEqual({ medianStartMinute: null, medianEndMinute: null, startSpreadMinutes: null, endSpreadMinutes: null, nightsUsed: 0, inferredNightsExcluded: 2 });
    });

    it("keeps a single outlier from moving an odd-sample median across midnight", async () => {
      const result = await windowFor([
        utcWindow("2026-09-30", "23:45", "06:45"),
        utcWindow("2026-09-29", "23:55", "06:55"),
        utcWindow("2026-09-28", "00:05", "07:05"),
        utcWindow("2026-09-27", "00:15", "07:15"),
        utcWindow("2026-09-26", "08:00", "15:00"),
      ]);
      expect(result).toMatchObject({ medianStartMinute: 5, medianEndMinute: 425, startSpreadMinutes: 10, endSpreadMinutes: 10 });
    });

    it("uses reliable local clocks across the DST spring-forward boundary", async () => {
      const result = await windowFor([
        reliableDay("2026-03-08", { start: "2026-03-08T07:50:00Z", end: "2026-03-08T14:10:00Z", timeZone: "America/Los_Angeles" }),
        reliableDay("2026-03-07", { start: "2026-03-07T07:50:00Z", end: "2026-03-07T15:10:00Z", timeZone: "America/Los_Angeles" }),
      ]);
      expect(result).toMatchObject({ medianStartMinute: 1430, medianEndMinute: 430, startSpreadMinutes: 0, endSpreadMinutes: 0, nightsUsed: 2 });
    });

    it("uses reliable local clocks across the DST fall-back boundary", async () => {
      const result = await windowFor([
        reliableDay("2026-11-02", { start: "2026-11-02T07:50:00Z", end: "2026-11-02T15:10:00Z", timeZone: "America/Los_Angeles" }),
        reliableDay("2026-11-01", { start: "2026-11-01T06:50:00Z", end: "2026-11-01T15:10:00Z", timeZone: "America/Los_Angeles" }),
      ]);
      expect(result).toMatchObject({ medianStartMinute: 1430, medianEndMinute: 430, startSpreadMinutes: 0, endSpreadMinutes: 0, nightsUsed: 2 });
    });

    it("uses each reliable local timezone without inferring or normalizing travel", async () => {
      const result = await windowFor([
        reliableDay("2026-09-30", { start: "2026-09-30T06:55:00Z", end: "2026-09-30T14:05:00Z", timeZone: "America/Los_Angeles" }),
        reliableDay("2026-09-29", { start: "2026-09-29T03:55:00Z", end: "2026-09-29T11:05:00Z", timeZone: "America/New_York" }),
      ]);
      expect(result).toMatchObject({ medianStartMinute: 1435, medianEndMinute: 425, startSpreadMinutes: 0, endSpreadMinutes: 0, nightsUsed: 2 });
    });

    it("is independent of input ordering and identical across repeated calls", async () => {
      const rows = [
        utcWindow("2026-09-30", "23:50", "06:50"),
        utcWindow("2026-09-29", "00:05", "07:05"),
        utcWindow("2026-09-28", "00:20", "07:20"),
      ];
      const first = await windowFor(rows);
      const reversed = await windowFor([...rows].reverse());
      const repeated = await windowFor(rows);
      expect(reversed).toEqual(first);
      expect(repeated).toEqual(first);
    });
  });
});
