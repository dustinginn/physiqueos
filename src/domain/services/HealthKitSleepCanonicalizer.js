import {
  HEALTHKIT_SLEEP_ASLEEP_STAGES,
  HEALTHKIT_SLEEP_DAY_BOUNDARY_HOUR,
  HEALTHKIT_SLEEP_SPECIFIC_STAGES,
  HealthKitSleepIngestionPurpose,
  HealthKitSleepLifecycle,
  HealthKitSleepSourceClass,
  HealthKitSleepStage,
  deriveHealthKitSleepDay,
  digest,
  sleepDayWindowEndMs,
  stable,
} from "./HealthKitSleepContract.js";
import { sleepSourcePreferenceRank } from "./HealthKitSleepPolicies.js";

// sleep-canon-v1: a PURE, deterministic function from live HealthKit Sleep
// samples (+ the resolved source-preference policy) to canonical sleep days.
//
//   1. Preserve every observation. Reconciliation only decides what is counted.
//   2. Episodes: cluster the asleep/awake intervals of ALL sources whose gap is
//      <= episodeGapMs. A cluster without any asleep interval is not an episode.
//      In-bed intervals near no asleep episode form an in_bed_only episode.
//   3. One primary source lane (sourceClass + bundle identifier) per episode:
//        usable sensor > usable manual > insufficient sensor > insufficient manual
//        > explicit Server preference (only within the same tier, so it never
//          lifts an insufficient lane over a usable one)
//        > staged over unspecified-only > more asleep coverage
//        > deterministic class / bundle tie-break.
//      Zero-length samples carry no time and are preserved but never counted.
//      "Usable" is technical, not coaching: the lane's own asleep union covers
//      at least minimumUsableCoverageRatio of the episode's all-source asleep
//      union. Never "newest writer wins".
//   4. Totals come from the primary lane ONLY (no cross-source gap filling, no
//      hybrid totals). Within the lane each instant has one state, by
//      precedence deep > REM > core > awake > unspecified, so a nested stage
//      overrides overlapping unspecified sleep and nothing is double counted.
//      In-bed and awake are never asleep. A gap with no sample is not awake.
//   5. Sleep day: an episode belongs to the wake date D whose window
//      [D-1 18:00, D 18:00) contains its end, in the zone of its last primary
//      asleep sample. Durations always come from absolute instants.
//   6. Main episode = greatest asleep duration; all others are secondary and
//      preserved. No UI labels (nap / additional sleep) are decided here.
//   7. No sleep efficiency, awakening count, or score.

export const HEALTHKIT_SLEEP_CANON_ALGORITHM_VERSION = "sleep-canon-v1";
export const HEALTHKIT_SLEEP_DAY_SCHEMA_VERSION = "healthkit-sleep-day-v1";

// Versioned technical parameters. Changing any of them is a new algorithm
// version, never a coaching threshold.
export const SLEEP_CANON_V1_PARAMETERS = Object.freeze({
  episodeGapMinutes: 60,
  minimumUsableCoverageRatio: 0.5,
  inBedMinimumCoverageRatio: 0.9,
  dayBoundaryHour: HEALTHKIT_SLEEP_DAY_BOUNDARY_HOUR,
  lanePrecedence: Object.freeze(["asleep_deep", "asleep_rem", "asleep_core", "awake", "asleep_unspecified"]),
  classTieBreak: Object.freeze(["apple_watch", "third_party", "apple_other", "apple_iphone", "user_entered"]),
});

const GAP_MS = SLEEP_CANON_V1_PARAMETERS.episodeGapMinutes * 60 * 1000;
const ASLEEP = new Set(HEALTHKIT_SLEEP_ASLEEP_STAGES);
const SPECIFIC = new Set(HEALTHKIT_SLEEP_SPECIFIC_STAGES);
const PRECEDENCE = new Map(SLEEP_CANON_V1_PARAMETERS.lanePrecedence.map((stage, index) => [stage, index]));
const PARAMETERS_DIGEST = `sha256_${digest(stable(SLEEP_CANON_V1_PARAMETERS))}`;

export const HealthKitSleepPrimaryReason = Object.freeze({
  ONLY_CANDIDATE: "only_candidate",
  USABLE_SENSOR_OVER_MANUAL: "usable_sensor_over_manual",
  USABLE_OVER_INSUFFICIENT: "usable_over_insufficient_coverage",
  SENSOR_OVER_MANUAL: "sensor_over_manual_both_insufficient",
  SOURCE_PREFERENCE: "server_source_preference",
  STAGE_DETAIL: "stage_detail",
  COVERAGE: "greater_asleep_coverage",
  TIE_BREAK: "deterministic_tie_break",
});

/**
 * @param samples  stored healthKitSleepSamples records (any lifecycle; only
 *                 live, non-tombstone samples with a known stage participate)
 * @param preference resolved source-preference policy (or null = generic)
 * @returns Map<sleepDay, canonical day content> (no owner/revision fields)
 */
export function canonicalizeHealthKitSleep({ samples = [], preference = null } = {}) {
  const live = samples
    .filter((sample) => sample && !sample.tombstone && sample.lifecycle?.state === HealthKitSleepLifecycle.LIVE)
    .filter((sample) => sample.stage && sample.stage !== HealthKitSleepStage.UNKNOWN)
    .map(toInterval)
    .filter(Boolean);

  const activity = live.filter((sample) => ASLEEP.has(sample.stage) || sample.stage === HealthKitSleepStage.AWAKE);
  const inBed = live.filter((sample) => sample.stage === HealthKitSleepStage.IN_BED);

  const groups = cluster(activity).filter((group) => group.some((sample) => ASLEEP.has(sample.stage)));
  const inBedByGroup = assignInBed(groups, inBed);
  const episodes = groups
    .map((group, index) => buildAsleepEpisode(group, inBedByGroup[index], preference))
    .filter(Boolean);

  // An in-bed sample assigned to an asleep group is an input of that episode
  // (counted only if it is the primary lane's, but always part of the
  // digest, so its suppression is tracked). Only unassigned in-bed samples can
  // form an in_bed_only episode.
  const assignedInBed = new Set(inBedByGroup.flat().map((sample) => sample.id));
  const inBedOnly = cluster(inBed.filter((sample) => !assignedInBed.has(sample.id)))
    .map((group) => buildInBedOnlyEpisode(group, preference));

  const byDay = new Map();
  for (const episode of [...episodes, ...inBedOnly]) {
    if (!episode.sleepDay) continue;
    if (!byDay.has(episode.sleepDay)) byDay.set(episode.sleepDay, []);
    byDay.get(episode.sleepDay).push(episode);
  }
  const days = new Map();
  for (const [sleepDay, dayEpisodes] of [...byDay].sort(([left], [right]) => left.localeCompare(right))) {
    days.set(sleepDay, buildDay(sleepDay, dayEpisodes, preference));
  }
  return days;
}

/** Canonical content of a sleep day that has no episodes left (all deleted). */
export function emptyHealthKitSleepDay(sleepDay, { preference = null } = {}) {
  return buildDay(sleepDay, [], preference);
}

function toInterval(sample) {
  const start = Date.parse(sample.startedAt);
  const end = Date.parse(sample.endedAt);
  // A zero-length sample carries no time: it is preserved in the sample store
  // but can neither form nor extend an episode.
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const bundleIdentifier = String(sample.source?.bundleIdentifier ?? "");
  const sourceClass = sample.source?.sourceClass ?? HealthKitSleepSourceClass.THIRD_PARTY;
  return {
    id: sample.id,
    bucket: sample.occurrenceDate ?? null,
    stage: sample.stage,
    start,
    end,
    timeZone: sample.timeZone,
    timeZoneSource: sample.timeZoneSource,
    contentFingerprint: sample.contentFingerprint,
    ingestionPurpose: sample.ingestionPurpose ?? HealthKitSleepIngestionPurpose.OPERATIONAL,
    laneKey: `${sourceClass}\u0000${bundleIdentifier.toLowerCase()}`,
    lane: { sourceClass, sourceFamily: sample.source?.sourceFamily ?? null, bundleIdentifier },
  };
}

function byStartThenId(left, right) {
  return left.start - right.start || left.end - right.end || String(left.id).localeCompare(String(right.id));
}

function cluster(intervals) {
  const groups = [];
  let current = null;
  let currentEnd = -Infinity;
  for (const interval of [...intervals].sort(byStartThenId)) {
    if (current && interval.start - currentEnd <= GAP_MS) {
      current.push(interval);
      currentEnd = Math.max(currentEnd, interval.end);
    } else {
      current = [interval];
      currentEnd = interval.end;
      groups.push(current);
    }
  }
  return groups;
}

// Each in-bed sample belongs to at most ONE asleep episode (greatest overlap,
// then smallest gap, then earliest episode), so an in-bed total is never
// counted twice across split sleep.
function assignInBed(groups, inBedSamples) {
  const spans = groups.map(spanOf);
  const assigned = groups.map(() => []);
  for (const sample of inBedSamples) {
    let best = -1;
    let bestKey = null;
    spans.forEach((span, index) => {
      if (!near(sample, span)) return;
      const overlap = Math.max(0, Math.min(sample.end, span.end) - Math.max(sample.start, span.start));
      const gap = Math.max(0, span.start - sample.end, sample.start - span.end);
      const key = [-overlap, gap, span.start];
      if (bestKey === null || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
        best = index;
        bestKey = key;
      }
    });
    if (best !== -1) assigned[best].push(sample);
  }
  return assigned;
}

function spanOf(intervals) {
  return { start: Math.min(...intervals.map((item) => item.start)), end: Math.max(...intervals.map((item) => item.end)) };
}
function near(left, right) {
  return left.start - right.end <= GAP_MS && right.start - left.end <= GAP_MS;
}

function unionMs(intervals, clip = null) {
  const ranges = intervals
    .map(({ start, end }) => clip ? [Math.max(start, clip.start), Math.min(end, clip.end)] : [start, end])
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  let total = 0;
  let cursorStart = null;
  let cursorEnd = null;
  for (const [start, end] of ranges) {
    if (cursorEnd === null || start > cursorEnd) {
      if (cursorEnd !== null) total += cursorEnd - cursorStart;
      cursorStart = start;
      cursorEnd = end;
    } else {
      cursorEnd = Math.max(cursorEnd, end);
    }
  }
  if (cursorEnd !== null) total += cursorEnd - cursorStart;
  return total;
}

function groupLanes(intervals) {
  const lanes = new Map();
  for (const interval of intervals) {
    if (!lanes.has(interval.laneKey)) lanes.set(interval.laneKey, { key: interval.laneKey, ...interval.lane, intervals: [] });
    lanes.get(interval.laneKey).intervals.push(interval);
  }
  return [...lanes.values()];
}

function classRank(sourceClass) {
  const index = SLEEP_CANON_V1_PARAMETERS.classTieBreak.indexOf(sourceClass);
  return index === -1 ? SLEEP_CANON_V1_PARAMETERS.classTieBreak.length : index;
}

// Lexicographic lane ranking; returns the ordered candidates and the first
// criterion that separated the primary from the runner-up.
function rankLanes(candidates) {
  const keys = [
    ["tier", (lane) => lane.tier, null],
    ["preference", (lane) => lane.preferenceRank ?? Number.MAX_SAFE_INTEGER, HealthKitSleepPrimaryReason.SOURCE_PREFERENCE],
    ["staged", (lane) => (lane.staged ? 0 : 1), HealthKitSleepPrimaryReason.STAGE_DETAIL],
    ["coverage", (lane) => -lane.coverageMs, HealthKitSleepPrimaryReason.COVERAGE],
    ["class", (lane) => classRank(lane.sourceClass), HealthKitSleepPrimaryReason.TIE_BREAK],
    ["bundle", (lane) => lane.bundleIdentifier.toLowerCase(), HealthKitSleepPrimaryReason.TIE_BREAK],
    ["key", (lane) => lane.key, HealthKitSleepPrimaryReason.TIE_BREAK],
  ];
  const compare = (left, right) => {
    for (const [, value] of keys) {
      const a = value(left);
      const b = value(right);
      if (a < b) return -1;
      if (a > b) return 1;
    }
    return 0;
  };
  const ordered = [...candidates].sort(compare);
  if (ordered.length === 1) return { ordered, reason: HealthKitSleepPrimaryReason.ONLY_CANDIDATE };
  const [primary, runnerUp] = ordered;
  for (const [name, value, reason] of keys) {
    if (value(primary) === value(runnerUp)) continue;
    if (name === "tier") {
      let tierReason = HealthKitSleepPrimaryReason.USABLE_OVER_INSUFFICIENT;
      if (primary.usable && runnerUp.usable) tierReason = HealthKitSleepPrimaryReason.USABLE_SENSOR_OVER_MANUAL;
      else if (!primary.usable) tierReason = HealthKitSleepPrimaryReason.SENSOR_OVER_MANUAL;
      return { ordered, reason: tierReason };
    }
    return { ordered, reason };
  }
  return { ordered, reason: HealthKitSleepPrimaryReason.TIE_BREAK };
}

function tierOf({ usable, manual }) {
  if (usable && !manual) return 0;
  if (usable && manual) return 1;
  if (!manual) return 2;
  return 3;
}

function buildAsleepEpisode(group, assignedInBed, preference) {
  const asleepAll = group.filter((sample) => ASLEEP.has(sample.stage));
  const episodeAsleepMs = unionMs(asleepAll);
  const candidates = groupLanes(group)
    .map((lane) => {
      const laneAsleep = lane.intervals.filter((sample) => ASLEEP.has(sample.stage));
      const coverageMs = unionMs(laneAsleep);
      const manual = lane.sourceClass === HealthKitSleepSourceClass.USER_ENTERED;
      const usable = coverageMs > 0 && coverageMs >= SLEEP_CANON_V1_PARAMETERS.minimumUsableCoverageRatio * episodeAsleepMs;
      return {
        ...lane,
        coverageMs,
        manual,
        usable,
        staged: laneAsleep.some((sample) => SPECIFIC.has(sample.stage)),
        preferenceRank: sleepSourcePreferenceRank(preference, lane),
      };
    })
    .filter((lane) => lane.coverageMs > 0)
    .map((lane) => ({ ...lane, tier: tierOf(lane) }));
  // Defensive: toInterval already drops zero-length samples, so an asleep
  // group always has a lane with coverage. Never throw inside a batch.
  if (candidates.length === 0) return null;
  const { ordered, reason } = rankLanes(candidates);
  const primary = ordered[0];

  const primaryActivity = primary.intervals;
  const primaryAsleep = primaryActivity.filter((sample) => ASLEEP.has(sample.stage));
  const extent = spanOf(primaryAsleep);
  const resolved = resolveLaneTimeline(primaryActivity, extent);

  const laneInBed = assignedInBed.filter((sample) => sample.laneKey === primary.key && near(sample, extent));
  const inBedUnion = unionMs(laneInBed);
  const extentMs = extent.end - extent.start;
  const inBedDefensible = laneInBed.length > 0 && extentMs > 0 &&
    unionMs(laneInBed, extent) >= SLEEP_CANON_V1_PARAMETERS.inBedMinimumCoverageRatio * extentMs;

  const zoneSample = [...primaryAsleep].sort((left, right) => right.end - left.end || String(left.id).localeCompare(String(right.id)))[0];
  const sleepDay = deriveHealthKitSleepDay(extent.end, zoneSample.timeZone);
  const asleepSeconds = seconds(resolved.totals.asleep);
  const stagedSeconds = seconds(resolved.totals.asleep_core + resolved.totals.asleep_deep + resolved.totals.asleep_rem);

  const corroborating = ordered.slice(1).map((lane) => Object.freeze({
    sourceClass: lane.sourceClass,
    sourceFamily: lane.sourceFamily,
    bundleIdentifier: lane.bundleIdentifier,
    asleepSeconds: seconds(lane.coverageMs),
    staged: lane.staged,
    usable: lane.usable,
    sampleCount: lane.intervals.length,
  }));
  const primaryIds = new Set([...primaryActivity, ...laneInBed].map((sample) => sample.id));
  const inputs = [...group, ...assignedInBed];
  return {
    kind: "asleep",
    span: extent,
    sleepDay,
    inputs,
    content: {
      start: iso(extent.start),
      end: iso(extent.end),
      timeZone: zoneSample.timeZone,
      timeZoneSource: zoneSample.timeZoneSource,
      primarySource: Object.freeze({
        sourceClass: primary.sourceClass,
        sourceFamily: primary.sourceFamily,
        bundleIdentifier: primary.bundleIdentifier,
      }),
      reconciliation: Object.freeze({
        reason,
        primaryUsable: primary.usable,
        preferenceApplied: primary.preferenceRank !== null && primary.preferenceRank !== undefined,
        candidateCount: ordered.length,
      }),
      asleepSeconds,
      awakeSeconds: seconds(resolved.totals.awake),
      coreSeconds: seconds(resolved.totals.asleep_core),
      deepSeconds: seconds(resolved.totals.asleep_deep),
      remSeconds: seconds(resolved.totals.asleep_rem),
      unspecifiedSeconds: seconds(resolved.totals.asleep_unspecified),
      inBedSeconds: inBedDefensible ? seconds(inBedUnion) : null,
      stageCoverage: asleepSeconds > 0 ? Math.round((stagedSeconds / asleepSeconds) * 10000) / 10000 : 0,
      timeline: resolved.timeline,
      completeness: Object.freeze({
        asleepData: "present",
        stageDetail: primary.staged ? "staged" : "stage_detail_absent",
        sourceBasis: primary.manual ? "manual_only" : "sensor",
      }),
      sourceSampleIds: Object.freeze([...primaryIds].sort()),
      corroboratingSources: Object.freeze(corroborating),
      corroboratingSampleIds: Object.freeze(group.filter((sample) => !primaryIds.has(sample.id)).map((sample) => sample.id).sort()),
    },
  };
}

function buildInBedOnlyEpisode(group, preference) {
  const candidates = groupLanes(group).map((lane) => {
    const coverageMs = unionMs(lane.intervals);
    const manual = lane.sourceClass === HealthKitSleepSourceClass.USER_ENTERED;
    return {
      ...lane, coverageMs, manual, usable: true, staged: false,
      preferenceRank: sleepSourcePreferenceRank(preference, lane),
      tier: tierOf({ usable: true, manual }),
    };
  });
  const { ordered, reason } = rankLanes(candidates);
  const primary = ordered[0];
  const extent = spanOf(primary.intervals);
  const zoneSample = [...primary.intervals].sort((left, right) => right.end - left.end || String(left.id).localeCompare(String(right.id)))[0];
  const primaryIds = new Set(primary.intervals.map((sample) => sample.id));
  return {
    kind: "in_bed_only",
    span: extent,
    sleepDay: deriveHealthKitSleepDay(extent.end, zoneSample.timeZone),
    inputs: group,
    content: {
      start: iso(extent.start),
      end: iso(extent.end),
      timeZone: zoneSample.timeZone,
      timeZoneSource: zoneSample.timeZoneSource,
      primarySource: Object.freeze({
        sourceClass: primary.sourceClass, sourceFamily: primary.sourceFamily, bundleIdentifier: primary.bundleIdentifier,
      }),
      reconciliation: Object.freeze({
        reason, primaryUsable: true,
        preferenceApplied: primary.preferenceRank !== null && primary.preferenceRank !== undefined,
        candidateCount: ordered.length,
      }),
      // No sleep total is ever emitted without asleep samples.
      asleepSeconds: null,
      awakeSeconds: null,
      coreSeconds: null,
      deepSeconds: null,
      remSeconds: null,
      unspecifiedSeconds: null,
      inBedSeconds: seconds(unionMs(primary.intervals)),
      stageCoverage: null,
      timeline: Object.freeze([]),
      completeness: Object.freeze({
        asleepData: "in_bed_only",
        stageDetail: "stage_detail_absent",
        sourceBasis: primary.manual ? "manual_only" : "sensor",
      }),
      sourceSampleIds: Object.freeze([...primaryIds].sort()),
      corroboratingSources: Object.freeze(ordered.slice(1).map((lane) => Object.freeze({
        sourceClass: lane.sourceClass, sourceFamily: lane.sourceFamily, bundleIdentifier: lane.bundleIdentifier,
        asleepSeconds: null, staged: false, usable: true, sampleCount: lane.intervals.length,
      }))),
      corroboratingSampleIds: Object.freeze(group.filter((sample) => !primaryIds.has(sample.id)).map((sample) => sample.id).sort()),
    },
  };
}

// One state per instant inside the lane's asleep extent, by precedence.
function resolveLaneTimeline(intervals, extent) {
  const clipped = intervals
    .map((sample) => ({ stage: sample.stage, start: Math.max(sample.start, extent.start), end: Math.min(sample.end, extent.end) }))
    .filter((sample) => sample.end > sample.start);
  const boundaries = [...new Set(clipped.flatMap((sample) => [sample.start, sample.end]))].sort((a, b) => a - b);
  const totals = { asleep: 0, awake: 0, asleep_core: 0, asleep_deep: 0, asleep_rem: 0, asleep_unspecified: 0 };
  const timeline = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    let state = null;
    for (const sample of clipped) {
      if (sample.start <= start && sample.end >= end &&
        (state === null || PRECEDENCE.get(sample.stage) < PRECEDENCE.get(state))) state = sample.stage;
    }
    if (state === null) continue;
    totals[state] += end - start;
    if (ASLEEP.has(state)) totals.asleep += end - start;
    const last = timeline.at(-1);
    if (last && last.stage === state && last.endMs === start) last.endMs = end;
    else timeline.push({ stage: state, startMs: start, endMs: end });
  }
  return {
    totals,
    timeline: Object.freeze(timeline.map((segment) => Object.freeze({
      stage: segment.stage, start: iso(segment.startMs), end: iso(segment.endMs),
    }))),
  };
}

function buildDay(sleepDay, dayEpisodes, preference) {
  const ordered = [...dayEpisodes].sort((left, right) =>
    left.span.start - right.span.start || left.span.end - right.span.end ||
    String(left.content.sourceSampleIds[0]).localeCompare(String(right.content.sourceSampleIds[0])));
  let mainIndex = null;
  ordered.forEach((episode, index) => {
    if (episode.kind !== "asleep") return;
    if (mainIndex === null || episode.content.asleepSeconds > ordered[mainIndex].content.asleepSeconds) mainIndex = index;
  });
  const episodes = ordered.map((episode, index) => Object.freeze({
    kind: index === mainIndex ? "main" : "secondary",
    ...episode.content,
  }));
  const inputSamples = new Map();
  for (const episode of ordered) for (const sample of episode.inputs) inputSamples.set(sample.id, sample);
  const inputs = [...inputSamples.values()].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const zones = [...new Set(episodes.map((episode) => episode.timeZone))];
  const timeZone = mainIndex !== null ? episodes[mainIndex].timeZone : (episodes[0]?.timeZone ?? null);
  const main = mainIndex !== null ? episodes[mainIndex] : null;
  const preferenceDigest = preference?.configured ? preference.digest : "generic";
  const inputDigest = `sha256_${digest(stable({
    algorithm: HEALTHKIT_SLEEP_CANON_ALGORITHM_VERSION,
    parameters: PARAMETERS_DIGEST,
    preference: preferenceDigest,
    sleepDay,
    inputs: inputs.map((sample) => [sample.id, sample.contentFingerprint, sample.timeZone, sample.ingestionPurpose]),
  }))}`;
  const asleepEpisodes = episodes.filter((episode) => episode.asleepSeconds !== null);
  return Object.freeze({
    schemaVersion: HEALTHKIT_SLEEP_DAY_SCHEMA_VERSION,
    sleepDay,
    algorithmVersion: HEALTHKIT_SLEEP_CANON_ALGORITHM_VERSION,
    algorithmParametersDigest: PARAMETERS_DIGEST,
    sourcePreference: Object.freeze({ configured: preference?.configured === true, digest: preferenceDigest }),
    inputDigest,
    status: episodes.length === 0 ? "no_sleep_recorded" : main ? "asleep_recorded" : "in_bed_only",
    timeZone,
    timeZoneShift: zones.length > 1,
    windowClosesAt: timeZone ? iso(sleepDayWindowEndMs(sleepDay, timeZone)) : null,
    ingestionPurpose: inputs.some((sample) => sample.ingestionPurpose === HealthKitSleepIngestionPurpose.VALIDATION_ONLY)
      ? HealthKitSleepIngestionPurpose.VALIDATION_ONLY
      : HealthKitSleepIngestionPurpose.OPERATIONAL,
    mainEpisodeIndex: mainIndex,
    mainSleep: main ? Object.freeze({
      asleepSeconds: main.asleepSeconds,
      awakeSeconds: main.awakeSeconds,
      coreSeconds: main.coreSeconds,
      deepSeconds: main.deepSeconds,
      remSeconds: main.remSeconds,
      unspecifiedSeconds: main.unspecifiedSeconds,
      inBedSeconds: main.inBedSeconds,
      stageCoverage: main.stageCoverage,
    }) : null,
    // Episodes are disjoint (clusters never overlap), so this sum never
    // double counts. It is descriptive only; nothing here judges it.
    totalAsleepIncludingSecondarySeconds: asleepEpisodes.length
      ? asleepEpisodes.reduce((sum, episode) => sum + episode.asleepSeconds, 0)
      : null,
    episodes: Object.freeze(episodes),
    inputSampleIds: Object.freeze(inputs.map((sample) => sample.id)),
    // Candidate sleep days (storage buckets) of the inputs, so a later
    // recompute can find every day this record depends on without a scan.
    inputSampleDays: Object.freeze([...new Set(inputs.map((sample) => sample.bucket).filter(Boolean))].sort()),
  });
}

function seconds(ms) { return Math.round(ms / 1000); }
function iso(ms) { return new Date(ms).toISOString(); }
