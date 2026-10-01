import { describe, expect, it } from "vitest";
import {
  HEALTHKIT_SLEEP_CANON_ALGORITHM_VERSION,
  HealthKitSleepPrimaryReason,
  canonicalizeHealthKitSleep,
  canonicalizeHealthKitSleepV1,
} from "./HealthKitSleepCanonicalizer.js";
import { HealthKitSleepLifecycle } from "./HealthKitSleepContract.js";
import { resolveHealthKitSleepSourcePreferencePolicy } from "./HealthKitSleepPolicies.js";
import { LA, preferring, stored, uuid } from "../../testSupport/healthKitSleepSynthetic.js";

const H = 3600;
const night = (overrides) => stored({ start: "2026-09-10T23:00:00-07:00", end: "2026-09-11T07:00:00-07:00", ...overrides });
function only(days, key) {
  expect([...days.keys()]).toContain(key);
  return days.get(key);
}
function main(day) { return day.episodes[day.mainEpisodeIndex]; }

describe("sleep-canon-v2 attribution, clustering and stages", () => {
  it("#1 simple overnight unspecified: wake-date day, asleep from instants, stage detail absent", () => {
    const day = only(canonicalizeHealthKitSleep({ samples: [night({ source: "oura" })] }), "2026-09-11");
    expect(day.algorithmVersion).toBe(HEALTHKIT_SLEEP_CANON_ALGORITHM_VERSION);
    expect(day.status).toBe("asleep_recorded");
    expect(day.mainSleep).toMatchObject({ asleepSeconds: 8 * H, unspecifiedSeconds: 8 * H, stageCoverage: 0, inBedSeconds: null });
    expect(main(day).completeness).toEqual({ asleepData: "present", stageDetail: "stage_detail_absent", sourceBasis: "sensor" });
    expect(day.windowClosesAt).toBe("2026-09-12T01:00:00.000Z");
  });

  it("#2 staged Watch night: stage sums equal asleep, awake only between sleep, no inBed", () => {
    const samples = [
      ["core", "23:00", "01:00"], ["deep", "01:00", "02:00"], ["awake", "02:00", "02:10"],
      ["rem", "02:10", "03:00"], ["core", "03:00", "07:00"],
    ].map(([stage, from, to]) => stored({
      source: "watch", stage,
      start: `${from < "12:00" ? "2026-09-11" : "2026-09-10"}T${from}:00-07:00`,
      end: `${to < "12:00" && to !== "00:00" ? "2026-09-11" : "2026-09-10"}T${to}:00-07:00`,
    }));
    const day = only(canonicalizeHealthKitSleep({ samples }), "2026-09-11");
    const episode = main(day);
    expect(episode.asleepSeconds).toBe(8 * H - 600);
    expect(episode.coreSeconds + episode.deepSeconds + episode.remSeconds).toBe(episode.asleepSeconds);
    expect(episode).toMatchObject({ awakeSeconds: 600, deepSeconds: H, remSeconds: 50 * 60, stageCoverage: 1, inBedSeconds: null });
    expect(episode.completeness.stageDetail).toBe("staged");
    expect(episode.timeline.map((segment) => segment.stage)).toEqual(["asleep_core", "asleep_deep", "awake", "asleep_rem", "asleep_core"]);
  });

  it("#3 unspecified with nested stages in the same lane counts each instant once", () => {
    const samples = [
      night({ source: "oura" }),
      stored({ source: "oura", stage: "deep", start: "2026-09-11T01:00:00-07:00", end: "2026-09-11T02:00:00-07:00" }),
      stored({ source: "oura", stage: "rem", start: "2026-09-11T04:00:00-07:00", end: "2026-09-11T04:30:00-07:00" }),
    ];
    const episode = main(only(canonicalizeHealthKitSleep({ samples }), "2026-09-11"));
    expect(episode.asleepSeconds).toBe(8 * H);
    expect(episode.deepSeconds).toBe(H);
    expect(episode.remSeconds).toBe(30 * 60);
    expect(episode.unspecifiedSeconds).toBe(8 * H - H - 30 * 60);
  });

  it("#4 inBed is never asleep; inBed total only when the same lane covers >= 90% of the episode", () => {
    const withInBed = canonicalizeHealthKitSleep({ samples: [
      night({ source: "oura" }),
      stored({ source: "oura", stage: "inBed", start: "2026-09-10T22:30:00-07:00", end: "2026-09-11T07:15:00-07:00" }),
    ] });
    expect(main(only(withInBed, "2026-09-11"))).toMatchObject({ asleepSeconds: 8 * H, inBedSeconds: 8 * H + 45 * 60 });

    const otherLaneInBed = canonicalizeHealthKitSleep({ samples: [
      night({ source: "watch", stage: "core" }),
      stored({ source: "iphone", stage: "inBed", start: "2026-09-10T22:30:00-07:00", end: "2026-09-11T07:15:00-07:00" }),
    ] });
    expect(main(only(otherLaneInBed, "2026-09-11"))).toMatchObject({ asleepSeconds: 8 * H, inBedSeconds: null });

    const partialInBed = canonicalizeHealthKitSleep({ samples: [
      night({ source: "oura" }),
      stored({ source: "oura", stage: "inBed", start: "2026-09-10T23:00:00-07:00", end: "2026-09-11T02:00:00-07:00" }),
    ] });
    expect(main(only(partialInBed, "2026-09-11")).inBedSeconds).toBeNull();
  });

  it("#5 awake inside the episode counts as awake; awake at the edge is not counted; never asleep", () => {
    const samples = [
      stored({ source: "oura", start: "2026-09-10T23:00:00-07:00", end: "2026-09-11T03:00:00-07:00" }),
      stored({ source: "oura", stage: "awake", start: "2026-09-11T03:00:00-07:00", end: "2026-09-11T03:30:00-07:00" }),
      stored({ source: "oura", start: "2026-09-11T03:30:00-07:00", end: "2026-09-11T07:00:00-07:00" }),
      stored({ source: "oura", stage: "awake", start: "2026-09-11T07:00:00-07:00", end: "2026-09-11T07:20:00-07:00" }),
      stored({ source: "oura", stage: "awake", start: "2026-09-11T02:00:00-07:00", end: "2026-09-11T02:15:00-07:00" }),
    ];
    const episode = main(only(canonicalizeHealthKitSleep({ samples }), "2026-09-11"));
    // The 02:00 awake overrides overlapping unspecified sleep in the same lane.
    expect(episode.awakeSeconds).toBe(30 * 60 + 15 * 60);
    expect(episode.asleepSeconds).toBe(8 * H - 30 * 60 - 15 * 60);
    expect(episode.end).toBe("2026-09-11T14:00:00.000Z");
  });

  it("#8 daytime nap is a secondary episode of the same sleep day; main unchanged", () => {
    const day = only(canonicalizeHealthKitSleep({ samples: [
      night({ source: "watch", stage: "core" }),
      stored({ source: "watch", stage: "core", start: "2026-09-11T14:00:00-07:00", end: "2026-09-11T15:10:00-07:00" }),
    ] }), "2026-09-11");
    expect(day.episodes.map((episode) => episode.kind)).toEqual(["main", "secondary"]);
    expect(day.mainSleep.asleepSeconds).toBe(8 * H);
    expect(day.totalAsleepIncludingSecondarySeconds).toBe(8 * H + 70 * 60);
  });

  it("#9 evening nap belongs to the next sleep day and stays separate from that night (gap > 60 min)", () => {
    const days = canonicalizeHealthKitSleep({ samples: [
      stored({ source: "watch", stage: "core", start: "2026-09-10T19:30:00-07:00", end: "2026-09-10T20:40:00-07:00" }),
      night({ source: "watch", stage: "core" }),
    ] });
    expect([...days.keys()]).toEqual(["2026-09-11"]);
    const day = days.get("2026-09-11");
    expect(day.episodes).toHaveLength(2);
    expect(day.episodes[0]).toMatchObject({ kind: "secondary", asleepSeconds: 70 * 60 });
    expect(day.episodes[1]).toMatchObject({ kind: "main", asleepSeconds: 8 * H });
  });

  it("an episode ending exactly at 18:00 local belongs to the next sleep day", () => {
    const days = canonicalizeHealthKitSleep({ samples: [
      stored({ source: "watch", stage: "core", start: "2026-09-11T16:30:00-07:00", end: "2026-09-11T18:00:00-07:00" }),
    ] });
    expect([...days.keys()]).toEqual(["2026-09-12"]);
  });

  it("#10 split sleep with a 2 h gap: two episodes, main = larger, total = disjoint sum", () => {
    const day = only(canonicalizeHealthKitSleep({ samples: [
      stored({ source: "watch", stage: "core", start: "2026-09-10T23:00:00-07:00", end: "2026-09-11T01:30:00-07:00" }),
      stored({ source: "watch", stage: "core", start: "2026-09-11T03:30:00-07:00", end: "2026-09-11T07:00:00-07:00" }),
    ] }), "2026-09-11");
    expect(day.episodes.map((episode) => [episode.kind, episode.asleepSeconds])).toEqual([["secondary", 2.5 * H], ["main", 3.5 * H]]);
    expect(day.totalAsleepIncludingSecondarySeconds).toBe(6 * H);
  });

  it("#11 a gap <= 60 min clusters into one episode, and the gap is not awake", () => {
    const day = only(canonicalizeHealthKitSleep({ samples: [
      stored({ source: "watch", stage: "core", start: "2026-09-10T23:00:00-07:00", end: "2026-09-11T02:00:00-07:00" }),
      stored({ source: "watch", stage: "core", start: "2026-09-11T02:40:00-07:00", end: "2026-09-11T07:00:00-07:00" }),
    ] }), "2026-09-11");
    expect(day.episodes).toHaveLength(1);
    expect(main(day)).toMatchObject({ asleepSeconds: 3 * H + 4 * H + 20 * 60, awakeSeconds: 0 });
  });

  it("#12 DST spring-forward and fall-back nights use absolute instants", () => {
    const spring = only(canonicalizeHealthKitSleep({ samples: [
      stored({ source: "watch", stage: "core", start: "2026-03-07T23:00:00-08:00", end: "2026-03-08T07:00:00-07:00" }),
    ] }), "2026-03-08");
    expect(spring.mainSleep.asleepSeconds).toBe(7 * H);
    const fall = only(canonicalizeHealthKitSleep({ samples: [
      stored({ source: "watch", stage: "core", start: "2026-10-31T23:00:00-07:00", end: "2026-11-01T07:00:00-08:00" }),
    ] }), "2026-11-01");
    expect(fall.mainSleep.asleepSeconds).toBe(9 * H);
    // The fall-back sleep-day window is 25 wall hours long.
    expect(fall.windowClosesAt).toBe("2026-11-02T02:00:00.000Z");
  });

  it("#13 travel: per-episode zone, zone source recorded, shift flagged, no fabricated day", () => {
    const days = canonicalizeHealthKitSleep({ samples: [
      stored({ source: "watch", stage: "core", timeZone: "America/New_York", start: "2026-09-10T23:00:00-04:00", end: "2026-09-11T06:00:00-04:00" }),
      stored({ source: "watch", stage: "core", timeZone: LA, timeZoneSource: "device_at_ingest", start: "2026-09-11T13:00:00-07:00", end: "2026-09-11T14:00:00-07:00" }),
    ] });
    expect([...days.keys()]).toEqual(["2026-09-11"]);
    const day = days.get("2026-09-11");
    expect(day.timeZoneShift).toBe(true);
    expect(day.episodes.map((episode) => [episode.timeZone, episode.timeZoneSource]))
      .toEqual([["America/New_York", "sample_metadata"], [LA, "device_at_ingest"]]);
    expect(day.timeZone).toBe("America/New_York");
  });

  it("#23 unknown future stage values are preserved upstream but never asleep and never create a day", () => {
    const unknownOnly = canonicalizeHealthKitSleep({ samples: [night({ source: "watch", stage: 9 })] });
    expect(unknownOnly.size).toBe(0);
    const mixed = only(canonicalizeHealthKitSleep({ samples: [
      night({ source: "watch", stage: "core" }),
      stored({ source: "watch", stage: 9, start: "2026-09-11T01:00:00-07:00", end: "2026-09-11T02:00:00-07:00" }),
    ] }), "2026-09-11");
    expect(mixed.mainSleep.asleepSeconds).toBe(8 * H);
  });

  it("#24 inBed-only night: in_bed_only, no sleep total emitted", () => {
    const day = only(canonicalizeHealthKitSleep({ samples: [
      stored({ source: "iphone", stage: "inBed", start: "2026-09-10T22:45:00-07:00", end: "2026-09-11T06:45:00-07:00" }),
    ] }), "2026-09-11");
    expect(day).toMatchObject({ status: "in_bed_only", mainEpisodeIndex: null, mainSleep: null, totalAsleepIncludingSecondarySeconds: null });
    expect(day.episodes[0]).toMatchObject({ asleepSeconds: null, inBedSeconds: 8 * H, completeness: { asleepData: "in_bed_only" } });
  });

  it("deleted and tombstoned samples never count", () => {
    const deleted = { ...night({ source: "watch", stage: "core" }), lifecycle: { state: HealthKitSleepLifecycle.DELETED } };
    const tombstone = { id: "healthkit_sleep_sample_x", tombstone: true, lifecycle: { state: HealthKitSleepLifecycle.DELETED } };
    expect(canonicalizeHealthKitSleep({ samples: [deleted, tombstone] }).size).toBe(0);
  });

  it("is deterministic: input order never changes content or digest", () => {
    const samples = [
      night({ source: "oura" }),
      night({ source: "watch", stage: "core", start: "2026-09-10T23:10:00-07:00" }),
      stored({ source: "oura", stage: "deep", start: "2026-09-11T01:00:00-07:00", end: "2026-09-11T02:00:00-07:00" }),
      stored({ source: "watch", stage: "core", start: "2026-09-11T14:00:00-07:00", end: "2026-09-11T15:00:00-07:00" }),
    ];
    const forward = canonicalizeHealthKitSleep({ samples });
    const reversed = canonicalizeHealthKitSleep({ samples: [...samples].reverse() });
    expect(JSON.stringify([...reversed])).toBe(JSON.stringify([...forward]));
  });
});

describe("sleep-canon-v2 source reconciliation (policy-driven, never hard-coded)", () => {
  const OURA = preferring("oura");
  const watchNight = (overrides = {}) => night({ source: "watch", stage: "core", start: "2026-09-10T22:50:00-07:00", end: "2026-09-11T07:10:00-07:00", ...overrides });

  it("Oura preferred + Watch overlap -> Oura primary even when Watch covers more", () => {
    const episode = main(only(canonicalizeHealthKitSleep({
      samples: [night({ source: "oura", stage: "core" }), watchNight()], preference: OURA,
    }), "2026-09-11"));
    expect(episode.primarySource.sourceFamily).toBe("oura");
    expect(episode.reconciliation).toMatchObject({ reason: HealthKitSleepPrimaryReason.SOURCE_PREFERENCE, preferenceApplied: true, candidateCount: 2 });
    expect(episode.asleepSeconds).toBe(8 * H);
    expect(episode.corroboratingSources).toEqual([expect.objectContaining({ sourceFamily: "apple_watch", asleepSeconds: 8 * H + 20 * 60 })]);
  });

  it("Oura unspecified + Watch staged -> usable Oura stays primary; Watch secondary; no hybrid totals", () => {
    const episode = main(only(canonicalizeHealthKitSleep({
      samples: [night({ source: "oura" }), watchNight({ stage: "deep" })], preference: OURA,
    }), "2026-09-11"));
    expect(episode.primarySource.sourceFamily).toBe("oura");
    expect(episode).toMatchObject({ asleepSeconds: 8 * H, deepSeconds: 0, unspecifiedSeconds: 8 * H, stageCoverage: 0 });
    expect(episode.completeness.stageDetail).toBe("stage_detail_absent");
    expect(episode.corroboratingSampleIds).toHaveLength(1);
  });

  it("Oura missing -> Watch fallback", () => {
    const episode = main(only(canonicalizeHealthKitSleep({ samples: [watchNight()], preference: OURA }), "2026-09-11"));
    expect(episode.primarySource.sourceFamily).toBe("apple_watch");
    expect(episode.reconciliation).toMatchObject({ reason: HealthKitSleepPrimaryReason.ONLY_CANDIDATE, preferenceApplied: false });
  });

  it("Oura technically insufficient (< 50% of the episode) -> deterministic fallback to Watch", () => {
    const episode = main(only(canonicalizeHealthKitSleep({
      samples: [
        watchNight(),
        stored({ source: "oura", stage: "core", start: "2026-09-11T01:00:00-07:00", end: "2026-09-11T03:00:00-07:00" }),
      ],
      preference: OURA,
    }), "2026-09-11"));
    expect(episode.primarySource.sourceFamily).toBe("apple_watch");
    expect(episode.reconciliation).toMatchObject({ reason: HealthKitSleepPrimaryReason.USABLE_OVER_INSUFFICIENT, preferenceApplied: false });
    expect(episode.corroboratingSources[0]).toMatchObject({ sourceFamily: "oura", usable: false });
  });

  it("Oura + historical Sleep Cycle overlap -> Oura", () => {
    const episode = main(only(canonicalizeHealthKitSleep({
      samples: [night({ source: "oura" }), night({ source: "sleepCycle", start: "2026-09-10T22:30:00-07:00" })], preference: OURA,
    }), "2026-09-11"));
    expect(episode.primarySource.sourceFamily).toBe("oura");
  });

  it("Sleep Cycle only -> usable sensor fallback", () => {
    const episode = main(only(canonicalizeHealthKitSleep({ samples: [night({ source: "sleepCycle" })], preference: OURA }), "2026-09-11"));
    expect(episode.primarySource).toMatchObject({ sourceFamily: "sleep_cycle", sourceClass: "third_party" });
    expect(episode.completeness.sourceBasis).toBe("sensor");
  });

  it("#7 manual + Oura -> Oura; manual preserved as coexisting corroboration", () => {
    const episode = main(only(canonicalizeHealthKitSleep({
      samples: [night({ source: "manual", start: "2026-09-10T22:00:00-07:00" }), night({ source: "oura" })],
    }), "2026-09-11"));
    expect(episode.primarySource.sourceFamily).toBe("oura");
    expect(episode.reconciliation.reason).toBe(HealthKitSleepPrimaryReason.USABLE_SENSOR_OVER_MANUAL);
    expect(episode.corroboratingSources[0]).toMatchObject({ sourceClass: "user_entered", sourceFamily: "manual" });
  });

  it("#7 manual only -> manual_only", () => {
    const episode = main(only(canonicalizeHealthKitSleep({ samples: [night({ source: "manual" })] }), "2026-09-11"));
    expect(episode.completeness.sourceBasis).toBe("manual_only");
    expect(episode.primarySource.sourceClass).toBe("user_entered");
  });

  it("no preference -> generic deterministic ranking (staged beats coverage, then class tie-break)", () => {
    const generic = resolveHealthKitSleepSourcePreferencePolicy(null);
    const stagedWins = main(only(canonicalizeHealthKitSleep({
      samples: [night({ source: "oura", start: "2026-09-10T22:00:00-07:00" }), night({ source: "watch", stage: "core" })], preference: generic,
    }), "2026-09-11"));
    expect(stagedWins.primarySource.sourceFamily).toBe("apple_watch");
    expect(stagedWins.reconciliation.reason).toBe(HealthKitSleepPrimaryReason.STAGE_DETAIL);

    const exactTie = main(only(canonicalizeHealthKitSleep({
      samples: [night({ source: "oura", stage: "core" }), night({ source: "watch", stage: "core" })],
    }), "2026-09-11"));
    expect(exactTie.primarySource.sourceFamily).toBe("apple_watch");
    expect(exactTie.reconciliation.reason).toBe(HealthKitSleepPrimaryReason.TIE_BREAK);

    const coverage = main(only(canonicalizeHealthKitSleep({
      samples: [night({ source: "oura", stage: "core", start: "2026-09-10T22:00:00-07:00" }), night({ source: "watch", stage: "core" })],
    }), "2026-09-11"));
    expect(coverage.primarySource.sourceFamily).toBe("oura");
    expect(coverage.reconciliation.reason).toBe(HealthKitSleepPrimaryReason.COVERAGE);
  });

  it("a preference can name any source (Watch or a bundle) — nothing is Oura-specific", () => {
    const byFamily = main(only(canonicalizeHealthKitSleep({
      samples: [night({ source: "oura", stage: "core", start: "2026-09-10T22:00:00-07:00" }), night({ source: "watch", stage: "core" })],
      preference: preferring("apple_watch"),
    }), "2026-09-11"));
    expect(byFamily.primarySource.sourceFamily).toBe("apple_watch");
    const byBundle = main(only(canonicalizeHealthKitSleep({
      samples: [night({ source: "oura", stage: "core" }), night({ source: "sleepCycle", stage: "core", start: "2026-09-10T22:00:00-07:00" })],
      preference: preferring({ bundleIdentifier: "com.lexwarelabs.goodmorning" }),
    }), "2026-09-11"));
    expect(byBundle.primarySource.sourceFamily).toBe("sleep_cycle");
  });

  it("a preference change changes the digest but never drops secondary observations", () => {
    const samples = [night({ source: "oura", stage: "core" }), watchNight()];
    const generic = only(canonicalizeHealthKitSleep({ samples }), "2026-09-11");
    const preferred = only(canonicalizeHealthKitSleep({ samples, preference: OURA }), "2026-09-11");
    expect(preferred.inputDigest).not.toBe(generic.inputDigest);
    expect([...preferred.inputSampleIds]).toEqual([...generic.inputSampleIds]);
    expect(preferred.inputSampleIds).toHaveLength(2);
  });
});

it("synthetic ids are unique", () => {
  expect(uuid(1)).not.toBe(uuid(2));
});

describe("sleep-canon-v1 review regressions", () => {
  it("a zero-length asleep sample never throws and never forms an episode", () => {
    const instant = "2026-09-11T03:00:00-07:00";
    expect(canonicalizeHealthKitSleep({ samples: [stored({ source: "watch", stage: "core", start: instant, end: instant })] }).size).toBe(0);
    expect(canonicalizeHealthKitSleep({ samples: [
      stored({ source: "watch", stage: "core", start: instant, end: instant }),
      stored({ source: "watch", stage: "awake", start: "2026-09-11T03:00:00-07:00", end: "2026-09-11T03:10:00-07:00" }),
    ] }).size).toBe(0);
    const withNight = only(canonicalizeHealthKitSleep({ samples: [
      night({ source: "oura" }),
      stored({ source: "watch", stage: "core", start: instant, end: instant }),
    ] }), "2026-09-11");
    expect(main(withNight).reconciliation.candidateCount).toBe(1);
  });

  it("one in-bed sample is counted in at most one episode of split sleep", () => {
    const day = only(canonicalizeHealthKitSleep({ samples: [
      stored({ source: "oura", start: "2026-09-10T23:00:00-07:00", end: "2026-09-11T01:00:00-07:00" }),
      stored({ source: "oura", start: "2026-09-11T02:10:00-07:00", end: "2026-09-11T03:00:00-07:00" }),
      stored({ source: "oura", stage: "inBed", start: "2026-09-10T22:55:00-07:00", end: "2026-09-11T01:05:00-07:00" }),
    ] }), "2026-09-11");
    expect(day.episodes).toHaveLength(2);
    const withInBed = day.episodes.filter((episode) => episode.inBedSeconds !== null);
    expect(withInBed).toHaveLength(1);
    expect(withInBed[0].asleepSeconds).toBe(2 * H);
  });

  it("labels an insufficient sensor chosen over an insufficient manual lane honestly", () => {
    const episode = main(only(canonicalizeHealthKitSleep({ samples: [
      stored({ source: "watch", stage: "core", start: "2026-09-10T23:00:00-07:00", end: "2026-09-11T01:00:00-07:00" }),
      stored({ source: "manual", start: "2026-09-11T01:30:00-07:00", end: "2026-09-11T03:00:00-07:00" }),
      stored({ source: "sleepCycle", start: "2026-09-11T03:30:00-07:00", end: "2026-09-11T05:30:00-07:00" }),
    ] }), "2026-09-11"));
    // Three disjoint lanes: none reaches 50% of the all-source union.
    expect(episode.reconciliation.primaryUsable).toBe(false);
    expect(episode.primarySource.sourceClass).not.toBe("user_entered");
    expect(episode.reconciliation.reason).toBe(HealthKitSleepPrimaryReason.STAGE_DETAIL);
  });

  it("names the tier reason when both top lanes are insufficient", () => {
    const episode = main(only(canonicalizeHealthKitSleep({ samples: [
      stored({ source: "sleepCycle", start: "2026-09-10T23:00:00-07:00", end: "2026-09-11T01:00:00-07:00" }),
      stored({ source: "manual", start: "2026-09-11T01:30:00-07:00", end: "2026-09-11T04:00:00-07:00" }),
      stored({ source: "manual", start: "2026-09-11T04:30:00-07:00", end: "2026-09-11T04:31:00-07:00" }),
      stored({ source: "oura", start: "2026-09-11T04:40:00-07:00", end: "2026-09-11T06:30:00-07:00" }),
    ] }), "2026-09-11"));
    // Manual has the most coverage (2h31m) but is below 50% of the union too;
    // an insufficient sensor lane still outranks an insufficient manual lane.
    expect(episode.primarySource.sourceClass).toBe("third_party");
    expect(episode.reconciliation.primaryUsable).toBe(false);
  });
});

describe("sleep-canon-v2 within-lane duplicate-copy resolution", () => {
  const startMs = Date.parse("2026-09-11T06:00:00.000Z");
  const isoAt = (minutes) => new Date(startMs + minutes * 60 * 1000).toISOString();
  const stagedCopy = ({ idBase, shift = 0, source = "oura", stages = ["core", "deep", "rem", "core"] }) =>
    stages.map((stage, index) => stored({
      id: uuid(idBase + index),
      source,
      stage,
      start: isoAt(shift + index * 120),
      end: isoAt(shift + (index + 1) * 120),
    }));
  const episode = (samples, preference = null) => main(only(canonicalizeHealthKitSleep({ samples, preference }), "2026-09-11"));
  const metrics = (value) => ({
    start: value.start,
    end: value.end,
    asleepSeconds: value.asleepSeconds,
    awakeSeconds: value.awakeSeconds,
    coreSeconds: value.coreSeconds,
    deepSeconds: value.deepSeconds,
    remSeconds: value.remSeconds,
    unspecifiedSeconds: value.unspecifiedSeconds,
    inBedSeconds: value.inBedSeconds,
    timeline: value.timeline,
  });

  it("selects one exact staged copy with different UUIDs and preserves the other as provenance", () => {
    const samples = [...stagedCopy({ idBase: 1000 }), ...stagedCopy({ idBase: 2000 })];
    const value = episode(samples);
    expect(value.reconciliation.copySelection).toMatchObject({
      applied: true, candidateCount: 2, selectedSampleCount: 4, corroboratingSampleCount: 4,
    });
    expect(value).toMatchObject({ asleepSeconds: 8 * H, coreSeconds: 4 * H, deepSeconds: 2 * H, remSeconds: 2 * H });
    expect(value.sourceSampleIds).toHaveLength(4);
    expect(value.corroboratingSampleIds).toHaveLength(4);
    expect(new Set([...value.sourceSampleIds, ...value.corroboratingSampleIds])).toEqual(new Set(samples.map((sample) => sample.id)));
  });

  it("selects one near-duplicate shifted copy without expanding the timeline", () => {
    const value = episode([...stagedCopy({ idBase: 3000 }), ...stagedCopy({ idBase: 4000, shift: 5 })]);
    expect(value.reconciliation.copySelection).toMatchObject({ applied: true, candidateCount: 2 });
    expect(value.start).toBe(isoAt(0));
    expect(value.end).toBe(isoAt(480));
    expect(value.asleepSeconds).toBe(8 * H);
    expect(value.timeline).toHaveLength(4);
  });

  it("prefers a complete copy over a partial overlapping copy", () => {
    const complete = stagedCopy({ idBase: 5000 });
    const partial = stagedCopy({ idBase: 6000, shift: 60 }).slice(0, 2);
    const value = episode([...complete, ...partial]);
    expect(value.reconciliation.copySelection).toMatchObject({ applied: true, candidateCount: 2 });
    expect(new Set(value.sourceSampleIds)).toEqual(new Set(complete.map((sample) => sample.id)));
    expect(value.asleepSeconds).toBe(8 * H);
  });

  it("chooses one of two complete conflicting staged copies and never combines their simultaneous states", () => {
    const first = stagedCopy({ idBase: 7000, stages: ["core", "core", "deep", "deep"] });
    const second = stagedCopy({ idBase: 8000, shift: 5, stages: ["deep", "deep", "core", "core"] });
    const value = episode([...first, ...second]);
    expect(value.reconciliation.copySelection).toMatchObject({ applied: true, candidateCount: 2 });
    expect(value.timeline.map((segment) => segment.stage)).toEqual(["asleep_core", "asleep_deep"]);
    expect(value).toMatchObject({ asleepSeconds: 8 * H, coreSeconds: 4 * H, deepSeconds: 4 * H });
  });

  it("resolves three copies deterministically", () => {
    const samples = [
      ...stagedCopy({ idBase: 9000 }),
      ...stagedCopy({ idBase: 10000, shift: 3 }),
      ...stagedCopy({ idBase: 11000, shift: 6 }),
    ];
    const value = episode(samples);
    expect(value.reconciliation.copySelection).toMatchObject({ applied: true, candidateCount: 3 });
    expect(value.sourceSampleIds).toHaveLength(4);
    expect(value.corroboratingSampleIds).toHaveLength(8);
    expect(value.asleepSeconds).toBe(8 * H);
  });

  it("keeps genuinely complementary non-overlapping samples in one copy", () => {
    const samples = stagedCopy({ idBase: 12000 });
    const value = episode(samples);
    expect(value.reconciliation.copySelection).toMatchObject({ applied: false, candidateCount: 1, selectedSampleCount: 4 });
    expect(new Set(value.sourceSampleIds)).toEqual(new Set(samples.map((sample) => sample.id)));
    expect(value.corroboratingSampleIds).toEqual([]);
  });

  it("treats a one-second stage-boundary overlap as rounding, not a duplicate copy", () => {
    const samples = stagedCopy({ idBase: 12500 });
    samples[1] = stored({
      id: uuid(12501), source: "oura", stage: "deep",
      start: new Date(Date.parse(isoAt(120)) - 1000).toISOString(), end: isoAt(240),
    });
    const value = episode(samples);
    expect(value.reconciliation.copySelection).toMatchObject({ applied: false, candidateCount: 1 });
    expect(value.asleepSeconds).toBe(8 * H);
    expect(value.sourceSampleIds).toHaveLength(4);
  });

  it("keeps the one in-bed envelope with the selected staged copy", () => {
    const inBed = stored({ id: uuid(13000), source: "oura", stage: "inBed", start: isoAt(-30), end: isoAt(495) });
    const value = episode([
      ...stagedCopy({ idBase: 13100 }),
      ...stagedCopy({ idBase: 13200, shift: 5 }),
      inBed,
    ]);
    expect(value.reconciliation.copySelection).toMatchObject({ applied: true, selectedSampleCount: 5 });
    expect(value.inBedSeconds).toBe(8 * H + 45 * 60);
    expect(value.sourceSampleIds).toContain(inBed.id);
  });

  it("does not let an overlapping awake disagreement reduce the selected complete copy", () => {
    const complete = stagedCopy({ idBase: 14000, stages: ["core", "core", "core", "core"] });
    const disagreement = stored({ id: uuid(14100), source: "oura", stage: "awake", start: isoAt(120), end: isoAt(180) });
    const value = episode([...complete, disagreement]);
    expect(value.reconciliation.copySelection).toMatchObject({ applied: true, candidateCount: 2 });
    expect(value).toMatchObject({ asleepSeconds: 8 * H, awakeSeconds: 0, coreSeconds: 8 * H });
    expect(value.corroboratingSampleIds).toContain(disagreement.id);
  });

  it("selects within the Oura lane only after source preference chooses Oura over Watch", () => {
    const value = episode([
      ...stagedCopy({ idBase: 15000 }),
      ...stagedCopy({ idBase: 15100, shift: 5 }),
      ...stagedCopy({ idBase: 15200, source: "watch", shift: -10 }),
    ], preferring("oura"));
    expect(value.primarySource.sourceFamily).toBe("oura");
    expect(value.reconciliation).toMatchObject({ reason: HealthKitSleepPrimaryReason.SOURCE_PREFERENCE, candidateCount: 2 });
    expect(value.reconciliation.copySelection).toMatchObject({ applied: true, candidateCount: 2 });
    expect(value.corroboratingSources).toEqual([expect.objectContaining({ sourceFamily: "apple_watch" })]);
  });

  it("falls back deterministically when the selected copy is deleted", () => {
    const samples = [...stagedCopy({ idBase: 16000 }), ...stagedCopy({ idBase: 16100, shift: 5 })];
    const before = episode(samples);
    const after = episode(samples.filter((sample) => !before.sourceSampleIds.includes(sample.id)));
    expect(before.reconciliation.copySelection.applied).toBe(true);
    expect(after.reconciliation.copySelection.applied).toBe(false);
    expect(after.asleepSeconds).toBe(8 * H);
    expect(after.sourceSampleIds).toHaveLength(4);
  });

  it("recomputes to a later-arriving more authoritative complete copy", () => {
    const partial = stagedCopy({ idBase: 17000 }).slice(0, 2);
    const complete = stagedCopy({ idBase: 17100, shift: 5 });
    const before = episode(partial);
    const after = episode([...partial, ...complete]);
    expect(before.asleepSeconds).toBe(4 * H);
    expect(after.asleepSeconds).toBe(8 * H);
    expect(after.reconciliation.copySelection.applied).toBe(true);
    expect(new Set(after.sourceSampleIds)).toEqual(new Set(complete.map((sample) => sample.id)));
  });

  it("converges under out-of-order arrival", () => {
    const samples = [...stagedCopy({ idBase: 18000 }), ...stagedCopy({ idBase: 18100, shift: 5 })];
    const forward = canonicalizeHealthKitSleep({ samples });
    const reversed = canonicalizeHealthKitSleep({ samples: [...samples].reverse() });
    expect(JSON.stringify([...reversed])).toBe(JSON.stringify([...forward]));
  });

  it("retains v1-equivalent totals and timeline when no duplicate exists while versioning the artifact", () => {
    const samples = [
      ...stagedCopy({ idBase: 19000 }),
      stored({ id: uuid(19100), source: "oura", stage: "inBed", start: isoAt(-15), end: isoAt(495) }),
    ];
    const v2Day = only(canonicalizeHealthKitSleep({ samples }), "2026-09-11");
    const v1Day = only(canonicalizeHealthKitSleepV1({ samples }), "2026-09-11");
    expect(metrics(main(v2Day))).toEqual(metrics(main(v1Day)));
    expect(v2Day.algorithmVersion).toBe("sleep-canon-v2");
    expect(v1Day.algorithmVersion).toBe("sleep-canon-v1");
    expect(v2Day.inputDigest).not.toBe(v1Day.inputDigest);
  });

  it("never double-counts total asleep, stages, or timeline across duplicate copies", () => {
    const value = episode([...stagedCopy({ idBase: 20000 }), ...stagedCopy({ idBase: 20100 })]);
    const staged = value.coreSeconds + value.deepSeconds + value.remSeconds + value.unspecifiedSeconds;
    const timeline = value.timeline.reduce((sum, segment) => sum + (Date.parse(segment.end) - Date.parse(segment.start)) / 1000, 0);
    expect(value.asleepSeconds).toBe(8 * H);
    expect(staged).toBe(value.asleepSeconds);
    expect(timeline).toBe(value.asleepSeconds + value.awakeSeconds);
  });
});
