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

// sleep-canon-v2: a PURE, deterministic function from live HealthKit Sleep
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
//   4. Within the primary lane, mutually overlapping staged/awake chains are
//      candidate copies of the same source episode. Select one technically
//      usable copy by asleep coverage, staged coverage/completeness, and a
//      stable content tie-break. Non-selected copies remain corroborating
//      provenance. Complementary non-overlapping samples remain one copy.
//   5. Totals come from the selected copy of the primary lane ONLY (no
//      cross-source or cross-copy gap filling). Within the copy each instant
//      has one state, by
//      precedence deep > REM > core > awake > unspecified, so a nested stage
//      overrides overlapping unspecified sleep and nothing is double counted.
//      In-bed and awake are never asleep. A gap with no sample is not awake.
//   6. Sleep day: an episode belongs to the wake date D whose window
//      [D-1 18:00, D 18:00) contains its end, in the zone of its last primary
//      asleep sample. Durations always come from absolute instants.
//   7. Main episode = greatest asleep duration; all others are secondary and
//      preserved. No UI labels (nap / additional sleep) are decided here.
//   8. No sleep efficiency, awakening count, or score.

export const HEALTHKIT_SLEEP_CANON_V1_ALGORITHM_VERSION = "sleep-canon-v1";
export const HEALTHKIT_SLEEP_CANON_ALGORITHM_VERSION = "sleep-canon-v2";
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

export const SLEEP_CANON_V2_PARAMETERS = Object.freeze({
  ...SLEEP_CANON_V1_PARAMETERS,
  withinLaneCopyResolution: Object.freeze({
    conflictStages: Object.freeze(["awake", "asleep_core", "asleep_deep", "asleep_rem"]),
    boundaryToleranceSeconds: 1,
    unspecifiedMayEnvelopeSpecificStages: true,
    selectionOrder: Object.freeze([
      "usable", "asleep_coverage", "staged_coverage", "resolved_coverage", "sample_count", "stable_content",
    ]),
  }),
});

const GAP_MS = SLEEP_CANON_V1_PARAMETERS.episodeGapMinutes * 60 * 1000;
const ASLEEP = new Set(HEALTHKIT_SLEEP_ASLEEP_STAGES);
const SPECIFIC = new Set(HEALTHKIT_SLEEP_SPECIFIC_STAGES);
const PRECEDENCE = new Map(SLEEP_CANON_V1_PARAMETERS.lanePrecedence.map((stage, index) => [stage, index]));
const COPY_BOUNDARY_TOLERANCE_MS = SLEEP_CANON_V2_PARAMETERS.withinLaneCopyResolution.boundaryToleranceSeconds * 1000;
const V1_PARAMETERS_DIGEST = `sha256_${digest(stable(SLEEP_CANON_V1_PARAMETERS))}`;
const PARAMETERS_DIGEST = `sha256_${digest(stable(SLEEP_CANON_V2_PARAMETERS))}`;

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
  return canonicalize({
    samples,
    preference,
    algorithmVersion: HEALTHKIT_SLEEP_CANON_ALGORITHM_VERSION,
    parametersDigest: PARAMETERS_DIGEST,
    resolveDuplicateCopies: true,
  });
}

// Retained for immutable historical comparison/audit only. Production
// recomputation always calls canonicalizeHealthKitSleep (v2).
export function canonicalizeHealthKitSleepV1({ samples = [], preference = null } = {}) {
  return canonicalize({
    samples,
    preference,
    algorithmVersion: HEALTHKIT_SLEEP_CANON_V1_ALGORITHM_VERSION,
    parametersDigest: V1_PARAMETERS_DIGEST,
    resolveDuplicateCopies: false,
  });
}

function canonicalize({ samples, preference, algorithmVersion, parametersDigest, resolveDuplicateCopies }) {
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
    .map((group, index) => buildAsleepEpisode(group, inBedByGroup[index], preference, { resolveDuplicateCopies }))
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
    days.set(sleepDay, buildDay(sleepDay, dayEpisodes, preference, { algorithmVersion, parametersDigest }));
  }
  return days;
}

/** Canonical content of a sleep day that has no episodes left (all deleted). */
export function emptyHealthKitSleepDay(sleepDay, { preference = null } = {}) {
  return buildDay(sleepDay, [], preference, {
    algorithmVersion: HEALTHKIT_SLEEP_CANON_ALGORITHM_VERSION,
    parametersDigest: PARAMETERS_DIGEST,
  });
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

function buildAsleepEpisode(group, assignedInBed, preference, { resolveDuplicateCopies }) {
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

  const copyResolution = resolveDuplicateCopies
    ? selectAuthoritativeLaneCopy(primary.intervals)
    : { selected: primary.intervals, corroborating: [], candidateCount: 1, applied: false };
  const primaryActivity = copyResolution.selected;
  const primaryAsleep = primaryActivity.filter((sample) => ASLEEP.has(sample.stage));
  const extent = spanOf(primaryAsleep);
  const resolved = resolveLaneTimeline(primaryActivity, extent);

  const allLaneInBed = assignedInBed.filter((sample) => sample.laneKey === primary.key && near(sample, extent));
  const inBedResolution = resolveDuplicateCopies && copyResolution.applied
    ? selectAuthoritativeInBedCopy(allLaneInBed, extent)
    : { selected: allLaneInBed, corroborating: [] };
  const laneInBed = inBedResolution.selected;
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
  const sameLaneCorroboratingCount = copyResolution.corroborating.length + inBedResolution.corroborating.length;
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
        ...(resolveDuplicateCopies ? {
          copySelection: Object.freeze({
            applied: copyResolution.applied,
            candidateCount: copyResolution.candidateCount,
            selectedSampleCount: primaryActivity.length + laneInBed.length,
            corroboratingSampleCount: sameLaneCorroboratingCount,
            rule: "usable_then_asleep_then_staged_then_resolved_then_samples_then_stable_content",
          }),
        } : {}),
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
      corroboratingSampleIds: Object.freeze((resolveDuplicateCopies ? inputs : group)
        .filter((sample) => !primaryIds.has(sample.id)).map((sample) => sample.id).sort()),
    },
  };
}

// A source copy is a chain of mutually non-overlapping specific-stage/awake
// samples. Unspecified sleep may legitimately envelope specific stages, so it
// does not split an otherwise single copy. This is deterministic interval
// partitioning, not transport/batch inference.
function selectAuthoritativeLaneCopy(intervals) {
  const exclusive = intervals.filter((sample) => SPECIFIC.has(sample.stage) || sample.stage === HealthKitSleepStage.AWAKE);
  const unspecified = intervals.filter((sample) => sample.stage === HealthKitSleepStage.ASLEEP_UNSPECIFIED);
  const basis = exclusive.length > 0 ? exclusive : unspecified;
  const partitions = partitionNonOverlapping(basis);
  if (partitions.length <= 1) {
    return { selected: intervals, corroborating: [], candidateCount: 1, applied: false };
  }
  const allAsleepCoverage = unionMs(intervals.filter((sample) => ASLEEP.has(sample.stage)));
  const candidates = copyPartitionCandidates(basis).map((partition) => {
    // A lone unspecified envelope is shared technical context when staged or
    // awake partitions exist; it cannot identify which source copy produced it.
    const activity = exclusive.length > 0 ? [...partition, ...unspecified] : partition;
    const asleep = activity.filter((sample) => ASLEEP.has(sample.stage));
    const extent = spanOf(asleep.length > 0 ? asleep : activity);
    const resolved = resolveLaneTimeline(activity, extent);
    const coverageMs = unionMs(asleep);
    const stagedCoverageMs = unionMs(activity.filter((sample) => SPECIFIC.has(sample.stage)));
    const resolvedCoverageMs = resolved.totals.asleep + resolved.totals.awake;
    return {
      activity,
      coverageMs,
      stagedCoverageMs,
      resolvedCoverageMs,
      usable: coverageMs > 0 && coverageMs >= SLEEP_CANON_V1_PARAMETERS.minimumUsableCoverageRatio * allAsleepCoverage,
      signature: copySignature(activity),
      idSignature: activity.map((sample) => String(sample.id)).sort().join("\u0000"),
    };
  }).filter((candidate) => candidate.coverageMs > 0).sort(compareCopies);
  if (candidates.length === 0) {
    return { selected: intervals, corroborating: [], candidateCount: 1, applied: false };
  }
  const selectedCandidate = candidates[0];
  const selectedIds = new Set(selectedCandidate.activity.map((sample) => sample.id));
  return {
    selected: selectedCandidate.activity,
    corroborating: intervals.filter((sample) => !selectedIds.has(sample.id)),
    candidateCount: partitions.length,
    applied: true,
  };
}

function selectAuthoritativeInBedCopy(intervals, extent) {
  if (intervals.length <= 1) return { selected: intervals, corroborating: [] };
  const partitions = partitionNonOverlapping(intervals);
  if (partitions.length <= 1) return { selected: intervals, corroborating: [] };
  const selectedCandidate = copyPartitionCandidates(intervals).map((partition) => ({
    activity: partition,
    coverageMs: unionMs(partition, extent),
    stagedCoverageMs: 0,
    resolvedCoverageMs: unionMs(partition),
    usable: unionMs(partition, extent) > 0,
    signature: copySignature(partition),
    idSignature: partition.map((sample) => String(sample.id)).sort().join("\u0000"),
  })).sort(compareCopies)[0];
  const selectedIds = new Set(selectedCandidate.activity.map((sample) => sample.id));
  return {
    selected: selectedCandidate.activity,
    corroborating: intervals.filter((sample) => !selectedIds.has(sample.id)),
  };
}

// Equal-start shorter- and longer-first orderings each protect a different
// adversarial shape (a genuine short stage beside a wider interval versus a
// stray short disagreement inside a complete copy). Evaluate the coherent
// chains from both deterministic colorings; never splice samples between them.
function copyPartitionCandidates(intervals) {
  const seen = new Set();
  return [
    ...partitionNonOverlapping(intervals, byCopyInterval),
    ...partitionNonOverlapping(intervals, byCopyIntervalShortFirst),
  ].filter((partition) => {
    const key = partition.map((sample) => String(sample.id)).sort().join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function partitionNonOverlapping(intervals, ordering = byCopyInterval) {
  const partitions = [];
  for (const interval of [...intervals].sort(ordering)) {
    const available = partitions
      .map((partition, index) => ({ partition, index, lastEnd: Math.max(...partition.map((sample) => sample.end)) }))
      .filter(({ partition }) => partition.every((sample) => !overlaps(sample, interval)))
      .sort((left, right) => right.lastEnd - left.lastEnd || left.index - right.index);
    if (available.length > 0) available[0].partition.push(interval);
    else partitions.push([interval]);
  }
  return partitions;
}

function overlaps(left, right) {
  return Math.min(left.end, right.end) - Math.max(left.start, right.start) > COPY_BOUNDARY_TOLERANCE_MS;
}

function byCopyInterval(left, right) {
  // At one boundary, place the interval with greater continuation first. A
  // short conflicting observation then becomes corroborating instead of
  // breaking the complete chain into two artificial fragments.
  return left.start - right.start || right.end - left.end ||
    String(left.stage).localeCompare(String(right.stage)) || String(left.id).localeCompare(String(right.id));
}

function byCopyIntervalShortFirst(left, right) {
  return left.start - right.start || left.end - right.end ||
    String(left.stage).localeCompare(String(right.stage)) || String(left.id).localeCompare(String(right.id));
}

function copySignature(intervals) {
  return [...intervals].sort(byCopyInterval)
    .map((sample) => `${sample.stage}:${sample.start}:${sample.end}:${sample.timeZone}:${sample.timeZoneSource}`)
    .join("|");
}

function compareCopies(left, right) {
  return Number(right.usable) - Number(left.usable) ||
    right.coverageMs - left.coverageMs ||
    right.stagedCoverageMs - left.stagedCoverageMs ||
    right.resolvedCoverageMs - left.resolvedCoverageMs ||
    right.activity.length - left.activity.length ||
    left.signature.localeCompare(right.signature) ||
    left.idSignature.localeCompare(right.idSignature);
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

function buildDay(sleepDay, dayEpisodes, preference, { algorithmVersion, parametersDigest }) {
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
    algorithm: algorithmVersion,
    parameters: parametersDigest,
    preference: preferenceDigest,
    sleepDay,
    inputs: inputs.map((sample) => [sample.id, sample.contentFingerprint, sample.timeZone, sample.ingestionPurpose]),
  }))}`;
  const asleepEpisodes = episodes.filter((episode) => episode.asleepSeconds !== null);
  return Object.freeze({
    schemaVersion: HEALTHKIT_SLEEP_DAY_SCHEMA_VERSION,
    sleepDay,
    algorithmVersion,
    algorithmParametersDigest: parametersDigest,
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
