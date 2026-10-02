import { describe, expect, it } from "vitest";
import {
  HEALTHKIT_SLEEP_CANON_V3_ALGORITHM_VERSION,
  analyzeHealthKitSleepCopyCoherence,
  canonicalizeHealthKitSleep,
  canonicalizeHealthKitSleepV3,
} from "./HealthKitSleepCanonicalizer.js";
import { HealthKitSleepLifecycle, getHealthKitSleepDayRecordId } from "./HealthKitSleepContract.js";
import { assessHealthKitSleepStrategicEligibility } from "./HealthKitSleepStrategicEligibility.js";
import {
  assertNotQuarantinedHealthKitEvidence,
  assessHealthKitStrategicEvidenceEligibility,
} from "./HealthKitEvidenceEligibilityPolicy.js";
import { preferring, stored, uuid } from "../../testSupport/healthKitSleepSynthetic.js";

// sleep-canon-v3 coherent copy selection. Synthetic data only; the
// "production shape" mirrors the sanitized Oct 2 2026 canary topology
// (partial deletion of revision A + a differently segmented revision B, both
// Oura, arriving in two ingestion batches eleven minutes apart).

const DAY = "2026-10-02";
const START = Date.parse("2026-10-02T06:00:00.000Z"); // 23:00 PDT Oct 1
const at = (minutes) => new Date(START + minutes * 60_000).toISOString();
const MIN = 60;

/** One revision: [[stage, startMin, endMin], ...] -> stored samples. */
function revision(name, segments, { idBase, batchId = `batch-${name}`, receivedAt, source = "oura", deleted = [] } = {}) {
  return segments.map(([stage, from, to], index) => {
    const sample = stored({ id: uuid(idBase + index), source, stage, start: at(from), end: at(to) }, { batchId, receivedAt });
    if (!deleted.includes(index)) return sample;
    return { ...sample, status: HealthKitSleepLifecycle.DELETED, lifecycle: { state: HealthKitSleepLifecycle.DELETED, deletedAt: receivedAt, deletionSource: "hk_deleted_object" } };
  });
}
/** Contiguous segmentation from boundaries and a stage pattern. */
function contiguous(boundaries, stages) {
  return boundaries.slice(0, -1).map((from, index) => [stages[index % stages.length], from, boundaries[index + 1]]);
}
const v2 = (samples, preference = null) => canonicalizeHealthKitSleep({ samples, preference }).get(DAY);
const v3 = (samples, preference = null) => canonicalizeHealthKitSleepV3({ samples, preference }).get(DAY);
const main = (day) => day.episodes[day.mainEpisodeIndex];
const ids = (samples) => new Set(samples.map((sample) => sample.id));
const live = (samples) => samples.filter((sample) => sample.lifecycle.state === HealthKitSleepLifecycle.LIVE);
const selected = (day) => new Set(main(day).sourceSampleIds);
function isSubset(set, superset) { return [...set].every((value) => superset.has(value)); }
/** The canonical stage totals one revision would produce on its own. */
const alone = (samples) => main(v3(live(samples)));
const stageTotals = (episode) => ({
  asleepSeconds: episode.asleepSeconds, deepSeconds: episode.deepSeconds, remSeconds: episode.remSeconds,
  coreSeconds: episode.coreSeconds, awakeSeconds: episode.awakeSeconds,
});

// Deterministic pseudo-random segmentation (no Founder data).
function boundariesFrom(seed, start, end, { min = 5, max = 15 } = {}) {
  let state = seed;
  const next = () => { state = (state * 1103515245 + 12345) % 2147483648; return state; };
  const values = [start];
  while (values.at(-1) < end) {
    const step = min + (next() % (max - min + 1));
    values.push(Math.min(end, values.at(-1) + step));
  }
  return values;
}
const PATTERN_A = ["asleep_core", "asleep_deep", "asleep_core", "asleep_rem", "awake", "asleep_core"];
const PATTERN_B = ["asleep_core", "asleep_rem", "asleep_core", "asleep_deep", "asleep_core", "awake"];
const stageName = (stage) => stage.replace("asleep_", "");

function productionShape() {
  // Revision A: provisional, ends ~58 min earlier, 66 samples; 22 later deleted.
  const aBounds = boundariesFrom(7, 0, 392, { min: 3, max: 9 }).slice(0, 67);
  const aEnd = aBounds.at(-1);
  // Revision B: complete, different segmentation, but sharing every 4th A boundary.
  const shared = new Set(aBounds.filter((_, index) => index % 4 === 0 && index > 0 && index < aBounds.length - 1));
  const bOwn = boundariesFrom(11, 0, 450, { min: 4, max: 10 });
  const bBounds = [...new Set([...bOwn, ...shared])].sort((x, y) => x - y);
  const a = revision("A", contiguous(aBounds, PATTERN_A).map(([stage, from, to]) => [stageName(stage), from, to]), {
    idBase: 30_000, receivedAt: "2026-10-02T14:34:00.000Z",
    deleted: Array.from({ length: 22 }, (_, k) => 3 * k + 1).filter((index) => index < aBounds.length - 1),
  });
  const b = revision("B", contiguous(bBounds, PATTERN_B).map(([stage, from, to]) => [stageName(stage), from, to]), {
    idBase: 31_000, receivedAt: "2026-10-02T14:45:00.000Z",
  });
  return { a, b, aEnd };
}

describe("sleep-canon-v3 coherent copy selection", () => {
  it("1. exact sanitized production shape: never mixes the partially deleted revision A with revision B", () => {
    const { a, b } = productionShape();
    expect(live(a)).toHaveLength(44);
    const samples = [...a, ...b];
    const before = v2(samples);
    // Reproduction: v2 splices across the two revisions at shared boundaries.
    const v2Selected = selected(before);
    expect([...v2Selected].some((id) => ids(a).has(id)) && [...v2Selected].some((id) => ids(b).has(id))).toBe(true);

    const after = v3(samples);
    const episode = main(after);
    expect(after.algorithmVersion).toBe(HEALTHKIT_SLEEP_CANON_V3_ALGORITHM_VERSION);
    expect(selected(after)).toEqual(ids(b));
    expect(stageTotals(episode)).toEqual(stageTotals(alone(b)));
    expect(episode.timeline).toEqual(alone(b).timeline);
    expect(episode.reconciliation.copySelection).toMatchObject({ applied: true, coherenceBasis: "ingestion_revision", selectedGenerationCount: 1, ambiguousContinuationCount: 0 });
    // Every live sample is preserved either as the selected copy or as corroboration.
    expect(new Set([...episode.sourceSampleIds, ...episode.corroboratingSampleIds])).toEqual(ids(live(samples)));
  });

  it("2. audit worst case: both copies contain deep sleep; v2 produced 0 deep; v3 keeps one real copy", () => {
    const a = revision("A", [["rem", 0, 60], ["deep", 60, 180], ["core", 180, 240], ["core", 240, 420]], { idBase: 32_000, receivedAt: "2026-10-02T14:34:00.000Z" });
    const b = revision("B", [["core", 0, 60], ["core", 60, 120], ["rem", 120, 240], ["deep", 240, 420]], { idBase: 33_000, receivedAt: "2026-10-02T14:45:00.000Z" });
    expect(main(v2([...a, ...b])).deepSeconds).toBe(0);
    const episode = main(v3([...a, ...b]));
    expect(episode.deepSeconds).toBeGreaterThan(0);
    const chosen = selected(v3([...a, ...b]));
    expect(chosen.size === 4 && (isSubset(chosen, ids(a)) || isSubset(chosen, ids(b)))).toBe(true);
    // Equal coverage: the most recently received copy wins (B, deep 180 min).
    expect(chosen).toEqual(ids(b));
    expect(episode.deepSeconds).toBe(180 * MIN);
  });

  it("3. identical duplicate copies select exactly one copy without double counting", () => {
    const segments = [["core", 0, 120], ["deep", 120, 240], ["rem", 240, 360], ["core", 360, 480]];
    const a = revision("A", segments, { idBase: 34_000, receivedAt: "2026-10-02T14:34:00.000Z" });
    const b = revision("B", segments, { idBase: 35_000, receivedAt: "2026-10-02T14:45:00.000Z" });
    const episode = main(v3([...a, ...b]));
    expect(episode.asleepSeconds).toBe(8 * 3600);
    expect(selected(v3([...a, ...b])).size).toBe(4);
    expect(episode.corroboratingSampleIds).toHaveLength(4);
  });

  it("4. same total range with different segmentation selects one whole revision", () => {
    const a = revision("A", contiguous([0, 90, 200, 300, 420, 480], ["core", "deep", "core", "rem", "core"]), { idBase: 36_000, receivedAt: "2026-10-02T14:34:00.000Z" });
    const b = revision("B", contiguous([0, 60, 200, 260, 300, 400, 480], ["core", "deep", "rem", "core", "rem", "core"]), { idBase: 37_000, receivedAt: "2026-10-02T14:45:00.000Z" });
    const chosen = selected(v3([...a, ...b]));
    expect(chosen).toEqual(ids(b)); // more samples, then later received
    expect(stageTotals(main(v3([...a, ...b])))).toEqual(stageTotals(alone(b)));
  });

  it("5. partial old copy + complete new copy selects the complete new copy", () => {
    const a = revision("A", contiguous([0, 60, 120, 180, 240, 300, 360, 420, 480], ["core", "deep"]), {
      idBase: 38_000, receivedAt: "2026-10-02T14:34:00.000Z", deleted: [1, 3, 5],
    });
    const b = revision("B", contiguous([0, 60, 120, 180, 240, 300, 360, 420, 480], ["deep", "core"]), { idBase: 39_000, receivedAt: "2026-10-02T14:45:00.000Z" });
    expect(selected(v3([...a, ...b]))).toEqual(ids(b));
  });

  it("6. complete old copy + partial new copy keeps the complete old copy, coherently", () => {
    const a = revision("A", contiguous([0, 60, 120, 180, 240, 300, 360, 420, 480], ["core", "deep"]), { idBase: 40_000, receivedAt: "2026-10-02T14:34:00.000Z" });
    const b = revision("B", contiguous([0, 60, 120, 180, 240], ["rem", "core"]), { idBase: 41_000, receivedAt: "2026-10-02T14:45:00.000Z" });
    expect(selected(v3([...a, ...b]))).toEqual(ids(a));
    expect(main(v3([...a, ...b])).asleepSeconds).toBe(8 * 3600);
  });

  it("7. shared boundaries on every other instant never splice", () => {
    const a = revision("A", contiguous([0, 30, 60, 100, 120, 170, 180, 240, 300], ["core", "deep", "rem"]), { idBase: 42_000, receivedAt: "2026-10-02T14:34:00.000Z" });
    const b = revision("B", contiguous([0, 45, 60, 110, 120, 150, 180, 250, 300], ["rem", "core", "deep", "awake"]), { idBase: 43_000, receivedAt: "2026-10-02T14:45:00.000Z" });
    const chosen = selected(v3([...a, ...b]));
    expect(isSubset(chosen, ids(a)) || isSubset(chosen, ids(b))).toBe(true);
  });

  it("8. shuffled input repeatedly produces identical canonical output", () => {
    const { a, b } = productionShape();
    const samples = [...a, ...b];
    const reference = JSON.stringify([...canonicalizeHealthKitSleepV3({ samples })]);
    let state = 42;
    for (let round = 0; round < 25; round += 1) {
      const shuffled = [...samples];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        state = (state * 1103515245 + 12345) % 2147483648;
        const swap = state % (index + 1);
        [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
      }
      expect(JSON.stringify([...canonicalizeHealthKitSleepV3({ samples: shuffled })])).toBe(reference);
    }
  });

  it("9. midnight crossing keeps the wake-date sleep day and one canonical row", () => {
    const { a, b } = productionShape();
    const days = canonicalizeHealthKitSleepV3({ samples: [...a, ...b] });
    expect([...days.keys()]).toEqual([DAY]);
    const day = days.get(DAY);
    expect(day.episodes).toHaveLength(1);
    expect(Date.parse(main(day).start)).toBeLessThan(Date.parse("2026-10-02T07:00:00.000Z")); // before local midnight
    expect(getHealthKitSleepDayRecordId(day.sleepDay)).toBe("healthkit_sleep_day_2026-10-02");
    expect(day.sleepDay).toBe(v2([...a, ...b]).sleepDay);
  });

  it("10. Oura + Apple Watch overlap: lane preference unchanged, coherent copy chosen inside the Oura lane", () => {
    const { a, b } = productionShape();
    const watch = revision("W", contiguous([0, 120, 240, 360, 470], ["core", "deep", "rem", "core"]), { idBase: 44_000, source: "watch", receivedAt: "2026-10-02T14:40:00.000Z" });
    const samples = [...a, ...b, ...watch];
    const before = main(v2(samples, preferring("oura")));
    const after = main(v3(samples, preferring("oura")));
    expect(after.primarySource).toEqual(before.primarySource);
    expect(after.primarySource.sourceFamily).toBe("oura");
    expect(after.reconciliation.reason).toBe(before.reconciliation.reason);
    expect(selected(v3(samples, preferring("oura")))).toEqual(ids(b));
    expect(after.corroboratingSources).toEqual(before.corroboratingSources);
    // Without Oura, the Watch fallback is identical under v2 and v3.
    expect(stageTotals(main(v3(watch)))).toEqual(stageTotals(main(v2(watch))));
  });

  it("11. no duplicate copy: v3 equals v2 apart from the algorithm identity", () => {
    const { b } = productionShape();
    const withInBed = [...b, stored({ id: uuid(45_000), source: "oura", stage: "inBed", start: at(-10), end: at(455) }, { batchId: "batch-B" })];
    const two = v2(withInBed);
    const three = v3(withInBed);
    const strip = (day) => {
      const { algorithmVersion, algorithmParametersDigest, inputDigest, episodes, ...rest } = day;
      return {
        ...rest,
        episodes: episodes.map(({ reconciliation, ...episode }) => {
          const { copySelection, ...reconciled } = reconciliation;
          const { rule, coherenceBasis, selectedGenerationCount, ambiguousContinuationCount, ...copy } = copySelection;
          return { ...episode, reconciliation: { ...reconciled, copySelection: copy } };
        }),
      };
    };
    expect(strip(three)).toEqual(strip(two));
    expect(three.algorithmVersion).toBe("sleep-canon-v3");
    expect(two.algorithmVersion).toBe("sleep-canon-v2");
    expect(three.inputDigest).not.toBe(two.inputDigest);
  });

  it("12. a late revision updates the same canonical day identity and converges to the coherent copy", () => {
    const { a, b } = productionShape();
    const aLive = a.map((sample) => ({ ...sample, status: HealthKitSleepLifecycle.LIVE, lifecycle: { state: HealthKitSleepLifecycle.LIVE } }));
    const first = v3(aLive);
    const second = v3([...a, ...b]);
    expect(second.sleepDay).toBe(first.sleepDay);
    expect(getHealthKitSleepDayRecordId(second.sleepDay)).toBe(getHealthKitSleepDayRecordId(first.sleepDay));
    expect(selected(first)).toEqual(ids(aLive));
    expect(selected(second)).toEqual(ids(b));
  });

  it("joins one copy that arrived in two non-overlapping batches into one coherent chain", () => {
    const segments = contiguous([0, 60, 120, 180, 240, 300, 360, 420, 480], ["core", "deep", "rem"]);
    const firstHalf = revision("B1", segments.slice(0, 4), { idBase: 46_000, batchId: "batch-B1", receivedAt: "2026-10-02T14:45:00.000Z" });
    const secondHalf = revision("B2", segments.slice(4), { idBase: 46_100, batchId: "batch-B2", receivedAt: "2026-10-02T14:45:05.000Z" });
    const stale = revision("A", contiguous([0, 90, 180, 270, 360, 450], ["rem", "core"]), { idBase: 46_200, receivedAt: "2026-10-02T14:34:00.000Z" });
    const day = v3([...firstHalf, ...secondHalf, ...stale]);
    expect(selected(day)).toEqual(ids([...firstHalf, ...secondHalf]));
    expect(main(day).asleepSeconds).toBe(8 * 3600);
  });

  it("a batch carrying two copies is not an identity: a copy continued in the next batch still rejoins coherently", () => {
    const aSegments = contiguous([0, 70, 150, 240, 330, 420, 480], ["core", "deep", "rem"]);
    const bSegments = contiguous([0, 55, 130, 200, 290, 380, 480], ["rem", "core", "deep"]);
    const mixed = [
      ...revision("A", aSegments, { idBase: 48_000, batchId: "batch-import-7", receivedAt: "2026-10-01T05:00:00.000Z" }),
      ...revision("B1", bSegments.slice(0, 3), { idBase: 48_100, batchId: "batch-import-7", receivedAt: "2026-10-01T05:00:00.000Z" }),
    ];
    const continuation = revision("B2", bSegments.slice(3), { idBase: 48_200, batchId: "batch-import-8", receivedAt: "2026-10-01T05:00:01.000Z" });
    const day = v3([...mixed, ...continuation]);
    const aIds = ids(mixed.slice(0, aSegments.length));
    const bIds = ids([...mixed.slice(aSegments.length), ...continuation]);
    const chosen = selected(day);
    expect(isSubset(chosen, aIds) || isSubset(chosen, bIds)).toBe(true);
    expect(main(day).asleepSeconds).toBe(8 * 3600);
  });

  it("historical import shape: one or two samples per batch never fragment a complete copy", () => {
    const { a, b } = productionShape();
    const liveA = live(a);
    // Every sample in its own tiny batch, both copies interleaved: batches are not identities.
    const tiny = [...liveA, ...b].map((sample, index) => ({ ...sample, ingestion: { ...sample.ingestion, batchId: `import-${index % 37}` } }));
    const two = main(v2(tiny));
    const three = main(v3(tiny));
    // Without a reliable revision identity, v3 keeps v2's selection exactly.
    expect(three.reconciliation.copySelection.coherenceBasis).toBe("topology_v2_selection");
    expect(stageTotals(three)).toEqual(stageTotals(two));
    expect(three.timeline).toEqual(two.timeline);
    expect(selected(v3(tiny))).toEqual(selected(v2(tiny)));
  });

  it("a small surviving old revision (< half the night) still never splices into the reliable new revision", () => {
    const { a, b } = productionShape();
    const keep = new Set(live(a).slice(0, 18).map((sample) => sample.id));
    const smallA = a.map((sample) => keep.has(sample.id) ? sample : { ...sample, status: HealthKitSleepLifecycle.DELETED, lifecycle: { state: HealthKitSleepLifecycle.DELETED } });
    const chosen = selected(v3([...smallA, ...b]));
    expect(chosen).toEqual(ids(b));
  });

  it("review repro: a small old remainder never joins the small second batch of the new revision", () => {
    const a = revision("A", [["core", 0, 60], ["deep", 240, 300]], { idBase: 49_000, receivedAt: "2026-10-02T14:34:00.000Z" });
    const b1 = revision("B1", [["core", 30, 120], ["deep", 120, 200], ["rem", 200, 300]], { idBase: 49_100, batchId: "batch-B1", receivedAt: "2026-10-02T14:45:00.000Z" });
    const b2 = revision("B2", [["core", 300, 360], ["rem", 360, 480]], { idBase: 49_200, batchId: "batch-B2", receivedAt: "2026-10-02T14:45:04.000Z" });
    const day = v3([...a, ...b1, ...b2]);
    expect(selected(day)).toEqual(ids([...b1, ...b2]));
    expect(main(day).asleepSeconds).toBe(450 * MIN);
    expect(main(day).reconciliation.copySelection.coherenceBasis).toBe("ingestion_revision");
  });

  it("fuzz: partial old revision + new revision split across two batches never splices or loses the new revision", () => {
    let state = 2026;
    const random = (n) => { state = (state * 1103515245 + 12345) % 2147483648; return state % n; };
    for (let night = 0; night < 300; night += 1) {
      const aBounds = boundariesFrom(1 + random(10_000), 0, 330 + random(120), { min: 3, max: 12 });
      const shared = aBounds.filter((_, index) => index > 0 && index < aBounds.length - 1 && random(3) === 0);
      const bBounds = [...new Set([...boundariesFrom(1 + random(10_000), 0, 450, { min: 3, max: 14 }), ...shared])].sort((x, y) => x - y);
      const aSegments = contiguous(aBounds, PATTERN_A).map(([stage, from, to]) => [stageName(stage), from, to]);
      const deleted = aSegments.map((_, index) => index).filter(() => random(100) < 20 + random(70));
      const a = revision("A", aSegments, { idBase: 100_000 + night * 1_000, receivedAt: "2026-10-02T14:34:00.000Z", deleted });
      const bSegments = contiguous(bBounds, PATTERN_B).map(([stage, from, to]) => [stageName(stage), from, to]);
      const split = 1 + random(bSegments.length - 1);
      const b1 = revision("B1", bSegments.slice(0, split), { idBase: 100_000 + night * 1_000 + 300, batchId: `b1-${night}`, receivedAt: "2026-10-02T14:45:00.000Z" });
      const b2 = revision("B2", bSegments.slice(split), { idBase: 100_000 + night * 1_000 + 600, batchId: `b2-${night}`, receivedAt: "2026-10-02T14:45:03.000Z" });
      const day = v3([...a, ...b1, ...b2]);
      const chosen = selected(day);
      const bIds = ids([...b1, ...b2]);
      expect(isSubset(chosen, ids(a)) || isSubset(chosen, bIds), `night ${night}`).toBe(true);
      expect(chosen, `night ${night}`).toEqual(bIds);
    }
  }, 60_000);

  it("reports, never hides, same-batch shared-boundary continuations that topology cannot disambiguate", () => {
    const a = revision("A", [["rem", 0, 60], ["deep", 60, 180], ["core", 180, 240], ["core", 240, 420]], { idBase: 47_000, batchId: "batch-one", receivedAt: "2026-10-02T14:45:00.000Z" });
    const b = revision("B", [["core", 0, 60], ["core", 60, 120], ["rem", 120, 240], ["deep", 240, 420]], { idBase: 47_100, batchId: "batch-one", receivedAt: "2026-10-02T14:45:00.000Z" });
    const episode = main(v3([...a, ...b]));
    // One batch carrying both copies proves nothing: v3 keeps v2's selection
    // and reports the ambiguity instead of guessing.
    expect(episode.reconciliation.copySelection).toMatchObject({ coherenceBasis: "topology_v2_selection" });
    expect(episode.reconciliation.copySelection.ambiguousContinuationCount).toBeGreaterThan(0);
    expect(stageTotals(episode)).toEqual(stageTotals(main(v2([...a, ...b]))));
    expect(episode.asleepSeconds).toBe(420 * MIN); // one non-overlapping chain, no double count
  });

  it("zero-write analysis flags the v2 cross-copy splice and nothing on a single-copy night", () => {
    const { a, b } = productionShape();
    const spliced = analyzeHealthKitSleepCopyCoherence({ samples: [...a, ...b] }).get(DAY);
    expect(spliced).toMatchObject({ duplicateCopies: true, v2CrossCopySplice: true });
    expect(spliced.v2SpansCoherentChains).toBeGreaterThan(1);
    const clean = analyzeHealthKitSleepCopyCoherence({ samples: b }).get(DAY);
    expect(clean).toMatchObject({ duplicateCopies: false, v2CrossCopySplice: false, coherentChainCount: 1 });
  });

  it("strategic isolation: a v3 prospective day stays quarantined and strategically ineligible", () => {
    const { a, b } = productionShape();
    const day = { ...v3([...a, ...b]), id: getHealthKitSleepDayRecordId(DAY), ingestionPurpose: "validation_only", origin: "validation_only", strategicEligible: false };
    expect(assessHealthKitStrategicEvidenceEligibility(day)).toMatchObject({ applicable: true, eligible: false, state: "quarantined" });
    expect(() => assertNotQuarantinedHealthKitEvidence(day)).toThrow(expect.objectContaining({ code: "HEALTHKIT_STRATEGIC_EVIDENCE_QUARANTINED" }));
    expect(assessHealthKitSleepStrategicEligibility(day)).toMatchObject({ eligible: false, reason: "prospective_validation_only_quarantined" });
    expect(assessHealthKitSleepStrategicEligibility(day, { schemaVersion: "healthkit-sleep-strategic-eligibility-v1", enabled: true, strategicEffectiveAt: "2026-01-01" }))
      .toMatchObject({ eligible: false });
  });
});
