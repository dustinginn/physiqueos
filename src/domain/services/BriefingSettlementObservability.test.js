import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { redactStructuredValue } from "../../platform/observability/structuredLogger.js";
import { HEALTHKIT_CANONICAL_DAY_COLLECTION } from "./HealthKitGraduation.js";
import { BriefingSettlementEvent } from "./BriefingEvidenceSettlementPolicy.js";
import { createBriefingSettlementObserver } from "./BriefingSettlementObservability.js";
import {
  at, createSettlementWorld, createWorker, DEADLINE, flakyRecords, hkDay, hkRecords, OWNER,
} from "../../fixtures/briefingSettlementWorld.js";

// LIVE SETTLEMENT OBSERVABILITY: every assertion here is on the REAL logger
// calls made by the REAL executor path (real gate, reader, generator, artifact
// repository), not on a stubbed emitter.

const E = BriefingSettlementEvent;
const lifecycle = (world) => world.events();
const fieldsOf = (world, event) => world.logs.filter((entry) => entry.event === event).map((entry) => entry.fields);

describe("normal settled path emits the expected ordered lifecycle", () => {
  it("window_closed -> revision received (per domain) -> readiness_checked -> readiness_satisfied -> briefing_generated -> briefing_published", async () => {
    const w = createSettlementWorld();
    await w.run(at(5));
    expect(lifecycle(w)).toEqual([
      E.WINDOW_CLOSED,
      E.LATEST_RELEVANT_REVISION_RECEIVED, E.LATEST_RELEVANT_REVISION_RECEIVED,
      E.READINESS_CHECKED,
      E.READINESS_SATISFIED,
      E.BRIEFING_GENERATED,
      E.BRIEFING_PUBLISHED,
    ]);
    // Fields sufficient for operational diagnosis: cadence + window identity, timezone, readiness, reason.
    const [closed] = fieldsOf(w, E.WINDOW_CLOSED);
    expect(closed).toMatchObject({
      cadenceKey: "midweek", userId: OWNER, windowStart: "2026-09-13", windowEnd: "2026-09-15",
      timeZone: "America/Los_Angeles", windowCutoff: expect.any(String), earliestPublishAt: at(0),
    });
    expect(closed.windowId).toMatch(/^midweek:2026-09-13:2026-09-15:/u);
    const [satisfied] = fieldsOf(w, E.READINESS_SATISFIED);
    expect(satisfied).toMatchObject({
      cadenceKey: "midweek", action: "generate", reasonCode: "readiness_satisfied", unsettledDomains: [],
      readinessDomains: { activity: { coverage: "complete_day", settled: true, revision: 1 }, nutrition: { coverage: "complete_day", settled: true, revision: 1 } },
    });
    const [generated] = fieldsOf(w, E.BRIEFING_GENERATED);
    expect(generated).toMatchObject({
      cadenceKey: "midweek", artifactId: w.artifactRecords[0].id, settlementReasonCode: "readiness_satisfied",
      deadlineFallback: false, watermarkDigest: w.artifactRecords[0].evidenceSettlement.integrity.digest,
    });
    expect(fieldsOf(w, E.BRIEFING_PUBLISHED)[0].artifactId).toBe(w.artifactRecords[0].id);
    // Info level throughout (nothing went wrong).
    expect(w.logs.every((entry) => entry.level === "info")).toBe(true);
  });
});

describe("retry path emits checks, never generated/published, and does not spam", () => {
  it("polling every 5 minutes while nutrition is partial: window_closed / closeout_eligible / readiness_checked once, awaiting per poll", async () => {
    const w = createSettlementWorld({ hk: hkRecords({ nutrition: "partial_day" }) });
    for (const minutes of [5, 10, 15, 20, 25]) {
      expect((await w.run(at(minutes))).resultStatus).toBe("awaiting_evidence_settlement");
    }
    const events = lifecycle(w);
    const count = (event) => events.filter((item) => item === event).length;
    expect(count(E.WINDOW_CLOSED)).toBe(1);
    expect(count(E.CLOSEOUT_ELIGIBLE)).toBe(1);
    expect(count(E.READINESS_CHECKED)).toBe(1); // deduped inside the 30-minute heartbeat
    expect(count(E.AWAITING_SETTLEMENT)).toBe(5);
    expect(count(E.LATEST_RELEVANT_REVISION_RECEIVED)).toBe(2); // first sight of each domain only
    for (const forbidden of [E.BRIEFING_GENERATED, E.BRIEFING_PUBLISHED, E.READINESS_SATISFIED, E.DEADLINE_FALLBACK_USED, E.CLOSEOUT_REQUESTED]) {
      expect(events).not.toContain(forbidden);
    }
    expect(w.artifactRecords).toEqual([]);
    const [eligible] = fieldsOf(w, E.CLOSEOUT_ELIGIBLE);
    expect(eligible).toMatchObject({ cadenceKey: "midweek", unsettledDomains: ["nutrition"], hardDeadlineAt: at(DEADLINE) });
  });

  it("re-emits readiness_checked on the 30-minute heartbeat and whenever the outcome changes", async () => {
    const w = createSettlementWorld({ hk: hkRecords({ nutrition: "partial_day" }) });
    await w.run(at(5));
    await w.run(at(20));
    expect(lifecycle(w).filter((event) => event === E.READINESS_CHECKED)).toHaveLength(1);
    await w.run(at(40)); // >= 30 minutes after the last emitted check
    expect(lifecycle(w).filter((event) => event === E.READINESS_CHECKED)).toHaveLength(2);
    // An outcome change re-emits immediately: the deadline arrives.
    await w.run(at(DEADLINE));
    expect(lifecycle(w).filter((event) => event === E.READINESS_CHECKED)).toHaveLength(3);
  });

  it("emits latest_relevant_revision_received when a domain's canonical revision advances between checks, before the check that acts on it", async () => {
    const w = createSettlementWorld({ hk: hkRecords({ nutrition: "partial_day" }) });
    await w.run(at(5));
    const before = w.logs.length;
    await w.hk.put({ collection: HEALTHKIT_CANONICAL_DAY_COLLECTION,
      recordId: "healthkit_canonical_day_nutrition_2026-09-15", payload: hkDay("nutrition", "complete_day", 2) });
    await w.run(at(10));
    const after = w.logs.slice(before).map((entry) => entry.event);
    expect(after).toEqual([
      E.LATEST_RELEVANT_REVISION_RECEIVED, E.READINESS_CHECKED, E.READINESS_SATISFIED, E.BRIEFING_GENERATED, E.BRIEFING_PUBLISHED]);
    const advanced = w.logs.slice(before).find((entry) => entry.event === E.LATEST_RELEVANT_REVISION_RECEIVED).fields;
    expect(advanced).toMatchObject({
      domain: "nutrition", previousCoverage: "partial_day", previousRevision: 1, coverage: "complete_day", revision: 2,
      canonicalRecordId: "canon_nutrition_2026-09-15",
    });
    // An unchanged domain is NOT re-announced.
    expect(after.filter((event) => event === E.LATEST_RELEVANT_REVISION_RECEIVED)).toHaveLength(1);
  });

  it("a transient generation failure that is retried emits readiness_satisfied once and generated/published exactly once, on success", async () => {
    let attempts = 0;
    const w = createSettlementWorld({ generatorWrap: async (inner, input) => {
      attempts += 1;
      if (attempts === 1) return { state: "failed", reason: "midweek_generation_failed", error: new Error("transient") };
      return inner(input);
    } });
    expect((await w.run(at(5))).resultStatus).toBe("transient_failure");
    expect(lifecycle(w)).not.toContain(E.BRIEFING_GENERATED);
    expect((await w.run(at(10))).resultStatus).toBe("generation_completed");
    const events = lifecycle(w);
    expect(events.filter((event) => event === E.READINESS_SATISFIED)).toHaveLength(1);
    expect(events.filter((event) => event === E.BRIEFING_GENERATED)).toHaveLength(1);
    expect(events.filter((event) => event === E.BRIEFING_PUBLISHED)).toHaveLength(1);
  });
});

describe("deadline fallback emits a distinct fallback signal", () => {
  it("deadline_fallback_used (not readiness_satisfied) with the unsettled domains, then generated/published flagged as fallback", async () => {
    const w = createSettlementWorld({ hk: hkRecords({ nutrition: "partial_day" }) });
    await w.run(at(DEADLINE));
    const events = lifecycle(w);
    expect(events).toContain(E.DEADLINE_FALLBACK_USED);
    expect(events).not.toContain(E.READINESS_SATISFIED);
    expect(events.indexOf(E.DEADLINE_FALLBACK_USED)).toBeLessThan(events.indexOf(E.BRIEFING_GENERATED));
    expect(fieldsOf(w, E.DEADLINE_FALLBACK_USED)[0]).toMatchObject({
      reasonCode: "hard_deadline_reached", unsettledDomains: ["nutrition"], cadenceKey: "midweek", timeZone: "America/Los_Angeles",
      readinessDomains: { nutrition: { coverage: "partial_day", settled: false } } });
    expect(fieldsOf(w, E.BRIEFING_GENERATED)[0]).toMatchObject({ deadlineFallback: true, settlementReasonCode: "hard_deadline_reached" });
  });

  it("fires once per window even when the generation is retried after a failure", async () => {
    let attempts = 0;
    const w = createSettlementWorld({ hk: hkRecords({ nutrition: "partial_day" }), generatorWrap: async (inner, input) => {
      attempts += 1;
      return attempts === 1 ? { state: "failed", reason: "x", error: new Error("t") } : inner(input);
    } });
    await w.run(at(DEADLINE));
    await w.run(at(DEADLINE + 5));
    expect(lifecycle(w).filter((event) => event === E.DEADLINE_FALLBACK_USED)).toHaveLength(1);
    expect(lifecycle(w).filter((event) => event === E.BRIEFING_GENERATED)).toHaveLength(1);
  });

  it("a legacy no-HealthKit-domain generation emits settlement_not_applicable, never readiness_satisfied", async () => {
    const w = createSettlementWorld({ hk: hkRecords({ graduated: false }) });
    await w.run(at(5));
    expect(lifecycle(w)).toEqual([E.WINDOW_CLOSED, E.READINESS_CHECKED, E.SETTLEMENT_NOT_APPLICABLE, E.BRIEFING_GENERATED, E.BRIEFING_PUBLISHED]);
  });
});

describe("already-published / duplicate generation emits no second generated/published lifecycle", () => {
  it("a later tick over the published occurrence emits nothing at all", async () => {
    const w = createSettlementWorld();
    await w.run(at(5));
    const count = w.logs.length;
    expect((await w.run(at(10))).resultStatus).toBe("already_completed");
    expect(w.logs.length).toBe(count);
  });

  it("an idempotent generator result (someone else published first) emits no generated/published", async () => {
    const w = createSettlementWorld({ generatorWrap: async (inner, input) => {
      const existing = { id: "midweek_x", lifecycle: { generationStatus: "completed" }, briefing: {} };
      return { state: "completed", artifact: existing, idempotent: true };
    } });
    const outcome = await w.run(at(5));
    expect(outcome).toMatchObject({ resultStatus: "already_completed", artifactOutcome: "matched" });
    expect(lifecycle(w)).not.toContain(E.BRIEFING_GENERATED);
    expect(lifecycle(w)).not.toContain(E.BRIEFING_PUBLISHED);
  });

  it("a completed result carrying ANOTHER attempt's watermark (existing artifact won) is not announced as generated by this attempt", async () => {
    const other = createSettlementWorld();
    await other.run(at(5)); // a prior worker published with its own watermark
    const winner = structuredClone(other.artifactRecords[0]);
    const w = createSettlementWorld({ generatorWrap: async () => ({ state: "completed", artifact: winner /* no idempotent flag, like Weekly */ }) });
    const outcome = await w.run(at(6));
    expect(outcome).toMatchObject({ resultStatus: "already_completed", artifactOutcome: "matched" });
    expect(lifecycle(w)).not.toContain(E.BRIEFING_GENERATED);
    expect(lifecycle(w)).not.toContain(E.BRIEFING_PUBLISHED);
  });
});

describe("dedup memory is per process, bounded, and shared across per-tick executors", () => {
  it("one shared observer across two executors: window_closed / readiness_satisfied once", async () => {
    const hk = hkRecords({ nutrition: "partial_day" });
    const artifactRecords = [];
    const logs = [];
    const observer = createBriefingSettlementObserver({ logger: { info: (event, fields) => logs.push({ level: "info", event, fields }), warn: () => {} } });
    const a = createWorker({ name: "a", artifactRecords, hk, settlementObserver: observer });
    const b = createWorker({ name: "b", artifactRecords, hk, settlementObserver: observer });
    await a.run(at(5));
    await b.run(at(10));
    expect(logs.filter((entry) => entry.event === E.WINDOW_CLOSED)).toHaveLength(1);
    expect(logs.filter((entry) => entry.event === E.CLOSEOUT_ELIGIBLE)).toHaveLength(1);
  });

  it("a fresh process (new observer) announces the window once again: a documented, acceptable restart re-emission", async () => {
    const hk = hkRecords({ nutrition: "partial_day" });
    const first = createSettlementWorld({ hk });
    const second = createSettlementWorld({ hk });
    await first.run(at(5));
    await second.run(at(10));
    expect(first.events()).toContain(E.WINDOW_CLOSED);
    expect(second.events()).toContain(E.WINDOW_CLOSED);
  });

  it("tracks a bounded number of windows and evicts the oldest", () => {
    const logs = [];
    const observer = createBriefingSettlementObserver({ logger: { info: (event) => logs.push(event), warn: () => {} }, maxTrackedWindows: 2 });
    const decision = { action: "wait", reasonCode: "before_earliest_publish_time", unsettledDomains: [] };
    const entry = (id) => ({ cadence: "midweek", userId: OWNER, evidenceWindow: { id }, timeZone: "UTC" });
    for (const id of ["w1", "w2", "w3", "w1"]) observer.observeCheck({ entry: entry(id), decision, asOf: new Date(at(5)) });
    // w1 was evicted by w3, so its return is announced again.
    expect(logs.filter((event) => event === E.WINDOW_CLOSED)).toHaveLength(4);
    logs.length = 0;
    observer.observeCheck({ entry: entry("w1"), decision, asOf: new Date(at(6)) });
    expect(logs).not.toContain(E.WINDOW_CLOSED);
  });

  it("emits nothing (and does not throw) without a logger", () => {
    const observer = createBriefingSettlementObserver({});
    expect(() => observer.observeCheck({ entry: { cadence: "midweek", evidenceWindow: { id: "w" } },
      decision: { action: "generate", reasonCode: "readiness_satisfied" }, asOf: new Date(at(5)) })).not.toThrow();
    expect(() => observer.observeCreated({ entry: { cadence: "midweek", evidenceWindow: { id: "w" } }, artifactId: "a", asOf: new Date(at(5)) })).not.toThrow();
  });
});

describe("honesty about closeout", () => {
  it("never emits closeout_requested; closeout_eligible only when HealthKit-backed domains are actually unsettled (not on a read failure, not when settled)", async () => {
    const settled = createSettlementWorld();
    await settled.run(at(5));
    expect(lifecycle(settled)).not.toContain(E.CLOSEOUT_ELIGIBLE);

    const hk = hkRecords();
    const flaky = flakyRecords(hk);
    const failing = createSettlementWorld({ hk, readerHk: flaky.records });
    flaky.setFailing(true);
    await failing.run(at(5));
    await failing.run(at(DEADLINE));
    expect(lifecycle(failing)).not.toContain(E.CLOSEOUT_ELIGIBLE);

    const partial = createSettlementWorld({ hk: hkRecords({ nutrition: "partial_day" }) });
    await partial.run(at(5));
    await partial.run(at(DEADLINE));
    expect(lifecycle(partial)).toContain(E.CLOSEOUT_ELIGIBLE);
    for (const world of [settled, failing, partial]) expect(lifecycle(world)).not.toContain(E.CLOSEOUT_REQUESTED);
  });
});

describe("redaction and vocabulary discipline", () => {
  const scenarios = async () => {
    const worlds = [];
    const partial = createSettlementWorld({ hk: hkRecords({ nutrition: "partial_day" }) });
    await partial.run(at(5)); await partial.run(at(DEADLINE));
    worlds.push(partial);
    const settled = createSettlementWorld();
    await settled.run(at(5));
    worlds.push(settled);
    const hk = hkRecords();
    const flaky = flakyRecords(hk);
    const failing = createSettlementWorld({ hk, readerHk: flaky.records });
    flaky.setFailing(true);
    await failing.run(at(5)); await failing.run(at(DEADLINE));
    worlds.push(failing);
    return worlds.flatMap((world) => world.logs);
  };

  it("survives the production redaction with every diagnostic field intact and carries no PII, message, or observed value", async () => {
    const logs = await scenarios();
    expect(logs.length).toBeGreaterThan(10);
    for (const { event, fields } of logs) {
      const wire = JSON.stringify(redactStructuredValue(fields));
      // Nothing was masked by the sensitive-key pattern (which would erase the diagnostic value) ...
      expect(wire, event).not.toContain("[REDACTED]");
      // ... and nothing sensitive is in there in the first place.
      expect(wire, event).not.toMatch(/@|password|db\.internal|transient store failure|calories|protein|move_calories/iu);
      expect(fields.userId === undefined || fields.userId === OWNER, event).toBe(true);
    }
  });

  it("uses only the BriefingSettlementEvent vocabulary at runtime, and no string literal of it in production sources", async () => {
    const logs = await scenarios();
    const known = new Set(Object.values(E));
    for (const { event } of logs) expect(known.has(event), event).toBe(true);
    const root = path.resolve(new URL("../..", import.meta.url).pathname);
    const offenders = [];
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(?:js|mjs)$/u.test(entry.name) || /\.test\.(?:js|mjs)$/u.test(entry.name)) continue;
        if (/testSupport|[\\/]fixtures[\\/]/u.test(full)) continue;
        if (/["'`]briefing_settlement\./u.test(fs.readFileSync(full, "utf8"))) offenders.push(path.relative(root, full));
      }
    };
    walk(root);
    // The enum's own definition is the one place the strings live.
    expect(offenders).toEqual(["domain/services/BriefingEvidenceSettlementPolicy.js"]);
  });
});
