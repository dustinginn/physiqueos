import { describe, expect, it, vi } from "vitest";
import { createDailyBriefingRepository } from "../../data/repositories/DailyBriefingRepository.js";
import { HEALTHKIT_CANONICAL_DAY_COLLECTION } from "./HealthKitGraduation.js";
import {
  at, createSettlementWorld, DAILY_DATE, DEADLINE, hkDay, hkRecords, MIDWEEK_DUE, OWNER, repositoriesFor, TZ,
} from "../../fixtures/briefingSettlementWorld.js";
import { createMidweekBriefingService } from "./MidweekBriefingService";
import { createMonthlyBriefingService } from "./MonthlyBriefingService";
import { createWeeklyNarrativeService } from "./WeeklyNarrativeService";
import { createMidweekEvidenceWindow, createWeeklyEvidenceWindow } from "./BriefingEvidenceWindowService";
import { prepareMidweekBriefingReviewPresentation } from "./MidweekBriefingPresentationService";
import {
  attachEvidenceSettlement,
  createSettlementGeneratorInput,
  freezeStoredEvidenceSettlement,
  preserveOccurrenceEvidenceSettlement,
  readEvidenceSettlement,
} from "./BriefingEvidenceSettlementArtifact.js";
import {
  BRIEFING_EVIDENCE_SETTLEMENT_WATERMARK_VERSION,
  buildEvidenceSettlementWatermarkV1,
  evaluateBriefingReadinessV1,
  recordDeviceCloseoutReceiptV1,
  verifyEvidenceSettlementWatermarkIntegrity,
} from "./BriefingEvidenceSettlementPolicy.js";
import { applyNarrativeV3ToBriefingArtifact } from "./BriefingGoalConfidencePresentationService.js";
import midweekFixture from "../../fixtures/briefingFamilyV3/midweekBriefingV2.json";

// BLOCKER 1: the immutable evidence-settlement watermark is built by the real
// executor from the real gate's decision, handed to the real generator, frozen
// with the real artifact, written by the real artifact repository, and read
// back — without a schema migration (one optional member of the artifact JSON).

const world = createSettlementWorld;

describe("watermark persisted on the real published Midweek artifact", () => {
  it("normal readiness generation persists the full watermark and only that", async () => {
    const w = world();
    const outcome = await w.run(at(5));
    expect(outcome).toMatchObject({ resultStatus: "generation_completed", settlementReasonCode: "readiness_satisfied" });
    expect(w.artifactRecords).toHaveLength(1);
    const artifact = w.artifactRecords[0];
    const mark = artifact.evidenceSettlement;
    const window = createMidweekEvidenceWindow({ now: new Date(at(5)), timeZone: TZ });
    expect(mark).toMatchObject({
      watermarkVersion: BRIEFING_EVIDENCE_SETTLEMENT_WATERMARK_VERSION,
      schemaVersion: "briefing_evidence_settlement_policy_v1",
      cadence: "midweek",
      settlementApplicable: true,
      readyAtGeneration: true,
      unsettledDomainsAtGeneration: [],
      publishReasonCode: "readiness_satisfied",
      deadlineFallback: false,
      coverageReadFailed: false,
      closeoutReceipt: null,
      timeZone: TZ,
      timeZoneAuthority: "briefing_schedule_authority",
      evidenceCutoff: window.cutoff,
      earliestPublishAt: MIDWEEK_DUE.toISOString(),
      hardDeadlineAt: at(DEADLINE),
      generatedAt: at(5),
    });
    expect(mark.evidenceWindow).toMatchObject({ id: window.id, startDate: "2026-09-13", endDate: "2026-09-15", timeZone: TZ });
    // Canonical identities + revisions + per-domain state are recorded.
    expect(mark.domains.activity).toEqual({
      present: true, coverage: "complete_day", settled: true, canonicalRecordId: `canon_activity_${DAILY_DATE}`, revision: 1 });
    expect(mark.domains.nutrition).toMatchObject({ settled: true, canonicalRecordId: `canon_nutrition_${DAILY_DATE}`, revision: 1 });
    // The artifact model does not distinguish generation from publication.
    expect(artifact.lifecycle.completedAt).toBe(mark.generatedAt);
    expect(artifact.generatedAt).toBe(mark.generatedAt);
    expect(verifyEvidenceSettlementWatermarkIntegrity(mark)).toBe(true);
    // Contract: no invented publish timestamp; no observed value anywhere in it.
    expect(mark).not.toHaveProperty("publishedAt");
    expect(JSON.stringify(mark)).not.toMatch(/calories|move_calories|protein/u);
  });

  it("the generator receives the settlement input additively (decision, readiness, window, timezone, asOf)", async () => {
    const w = world();
    await w.run(at(5));
    const input = w.generate.mock.calls[0][0].settlement;
    expect(input).toMatchObject({ timeZone: TZ, asOf: new Date(at(5)) });
    expect(input.decision).toMatchObject({ action: "generate", reasonCode: "readiness_satisfied" });
    expect(input.readiness.ready).toBe(true);
    expect(input.evidenceWindow.id).toMatch(/^midweek:2026-09-13:2026-09-15:/u);
    expect(w.generate.mock.calls[0][0]).toMatchObject({ userId: OWNER });
  });

  it("deadline-fallback generation persists unsettled domains and deadlineFallback=true", async () => {
    const w = world({ hk: hkRecords({ nutrition: "partial_day" }) });
    const outcome = await w.run(at(DEADLINE));
    expect(outcome).toMatchObject({ resultStatus: "generation_completed", settlementReasonCode: "hard_deadline_reached", settlementDeadlineFallback: true });
    const mark = w.artifactRecords[0].evidenceSettlement;
    expect(mark).toMatchObject({
      readyAtGeneration: false, unsettledDomainsAtGeneration: ["nutrition"], publishReasonCode: "hard_deadline_reached",
      deadlineFallback: true, coverageReadFailed: false, generatedAt: at(DEADLINE), hardDeadlineAt: at(DEADLINE),
    });
    expect(mark.domains.activity.settled).toBe(true);
    expect(mark.domains.nutrition).toMatchObject({ settled: false, coverage: "partial_day", revision: 1 });
    expect(verifyEvidenceSettlementWatermarkIntegrity(mark)).toBe(true);
  });

  it("legacy no-HealthKit-backed-domain path persists an honest 'settlement not applicable' watermark (decision: persist, never omit)", async () => {
    const w = world({ hk: hkRecords({ graduated: false }) });
    const outcome = await w.run(at(5));
    expect(outcome).toMatchObject({ resultStatus: "generation_completed", settlementReasonCode: "no_healthkit_backed_domains_settlement_not_applicable" });
    const mark = w.artifactRecords[0].evidenceSettlement;
    expect(mark).toMatchObject({
      settlementApplicable: false, readyAtGeneration: null, domains: {}, unsettledDomainsAtGeneration: [],
      publishReasonCode: "no_healthkit_backed_domains_settlement_not_applicable", deadlineFallback: false,
    });
  });

  it("no gate configured (manual/ad-hoc generation) publishes exactly as before: no watermark member at all", async () => {
    const records = [];
    const repositories = repositoriesFor(records);
    const service = createMidweekBriefingService({ repositories, now: () => new Date(at(5)) });
    const result = await service.generateForCurrentWindow({ asOf: new Date(at(5)) });
    expect(result.state).toBe("completed");
    expect(records[0]).not.toHaveProperty("evidenceSettlement");
  });
});

describe("watermark immutability", () => {
  const settled = () => evaluateBriefingReadinessV1({ domainStates: {
    activity: { present: true, coverage: "complete_day", canonicalRecordId: "a", revision: 4 },
    nutrition: { present: true, coverage: "complete_day", canonicalRecordId: "n", revision: 2 } } });

  it("is deep-frozen after construction, including nested window, domains and lists", () => {
    const mark = buildEvidenceSettlementWatermarkV1({
      evidenceWindow: { startDate: "2026-09-13", endDate: "2026-09-15", nested: { tags: ["a"] } }, readiness: settled(),
      publishDecision: { action: "generate", reasonCode: "readiness_satisfied", unsettledDomains: [] }, generatedAt: at(5) });
    expect(() => { mark.deadlineFallback = true; }).toThrow(TypeError);
    expect(() => { mark.integrity.digest = "x"; }).toThrow(TypeError);
    expect(() => { mark.domains.activity.revision = 9; }).toThrow(TypeError);
    expect(() => { mark.evidenceWindow.nested.tags.push("z"); }).toThrow(TypeError);
    expect(() => { mark.unsettledDomainsAtGeneration.push("z"); }).toThrow(TypeError);
  });

  it("stays deep-frozen after persistence and readback through a fresh repository over parsed JSON", async () => {
    const w = world();
    await w.run(at(5));
    // The canonical store hands back plain parsed JSON: nothing is frozen yet.
    const parsed = JSON.parse(JSON.stringify(w.artifactRecords));
    expect(Object.isFrozen(parsed[0].evidenceSettlement)).toBe(false);
    const readback = createDailyBriefingRepository(parsed);
    const [artifact] = await readback.listDailyBriefings(OWNER);
    const mark = artifact.evidenceSettlement;
    expect(Object.isFrozen(mark)).toBe(true);
    expect(() => { mark.deadlineFallback = true; }).toThrow(TypeError);
    expect(() => { mark.domains.nutrition.coverage = "partial_day"; }).toThrow(TypeError);
    expect(() => { mark.evidenceWindow.id = "other"; }).toThrow(TypeError);
    expect(() => { mark.unsettledDomainsAtGeneration.push("x"); }).toThrow(TypeError);
    // ... and the integrity envelope still verifies after the JSON round trip.
    expect(verifyEvidenceSettlementWatermarkIntegrity(mark)).toBe(true);
  });

  it("the writer freezes the stored record too (written by createDailyBriefing / completeScheduledBriefing)", async () => {
    const w = world();
    await w.run(at(5));
    expect(Object.isFrozen(w.artifactRecords[0].evidenceSettlement)).toBe(true);
    expect(Object.isFrozen(w.artifactRecords[0].evidenceSettlement.domains.activity)).toBe(true);
  });

  it("a tampered stored watermark fails its integrity check", async () => {
    const w = world();
    await w.run(at(5));
    const forged = JSON.parse(JSON.stringify(w.artifactRecords[0].evidenceSettlement));
    forged.deadlineFallback = true;
    expect(verifyEvidenceSettlementWatermarkIntegrity(forged)).toBe(false);
    expect(verifyEvidenceSettlementWatermarkIntegrity(null)).toBe(false);
  });
});

describe("a later evidence revision never touches the stored watermark or artifact", () => {
  it("HealthKit revision 2 lands after publication: the executor does not regenerate and the artifact is byte-identical", async () => {
    const w = world({ hk: hkRecords({ nutrition: "partial_day" }) });
    await w.run(at(DEADLINE)); // published via the deadline fallback with nutrition unsettled
    const before = JSON.stringify(w.artifactRecords);
    // Nutrition later settles at revision 2.
    await w.hk.put({ collection: HEALTHKIT_CANONICAL_DAY_COLLECTION,
      recordId: `healthkit_canonical_day_nutrition_${DAILY_DATE}`, payload: hkDay("nutrition", "complete_day", 2) });
    const later = await w.run(at(DEADLINE + 60));
    expect(later).toMatchObject({ resultStatus: "already_completed", artifactOutcome: "existing_immutable_artifact" });
    expect(w.generate).toHaveBeenCalledOnce();
    expect(JSON.stringify(w.artifactRecords)).toBe(before);
    const mark = w.artifactRecords[0].evidenceSettlement;
    expect(mark.domains.nutrition).toMatchObject({ coverage: "partial_day", revision: 1, settled: false });
    expect(mark.deadlineFallback).toBe(true);
  });
});

describe("historical artifacts that predate the field", () => {
  it("read, wrap, and present exactly as before; the watermark never alters the presentation or the binding", () => {
    const historical = structuredClone(midweekFixture);
    expect(historical).not.toHaveProperty("evidenceSettlement");
    const records = [structuredClone(historical)];
    expect(() => createDailyBriefingRepository(records)).not.toThrow();
    expect(readEvidenceSettlement(records[0])).toBeNull();
    expect(readEvidenceSettlement(null)).toBeNull();
    expect(readEvidenceSettlement({ evidenceSettlement: "junk" })).toBeNull();

    const withoutMark = prepareMidweekBriefingReviewPresentation({ artifact: historical });
    const withMark = prepareMidweekBriefingReviewPresentation({
      artifact: { ...structuredClone(historical), evidenceSettlement: buildEvidenceSettlementWatermarkV1({
        evidenceWindow: { startDate: "2026-09-13", endDate: "2026-09-15" },
        readiness: evaluateBriefingReadinessV1({ domainStates: {} }),
        publishDecision: { reasonCode: "hard_deadline_reached", unsettledDomains: ["activity", "nutrition"] },
        generatedAt: at(DEADLINE) }) } });
    expect(JSON.stringify(withMark)).toBe(JSON.stringify(withoutMark));
  });

  it("freezing and preserving are no-ops for records with no watermark", () => {
    const record = { id: "x", briefing: {} };
    expect(freezeStoredEvidenceSettlement(record)).toBe(record);
    expect(Object.isFrozen(record)).toBe(false);
    const incoming = { id: "x", briefing: {} };
    preserveOccurrenceEvidenceSettlement(incoming, [record]);
    expect(incoming).not.toHaveProperty("evidenceSettlement");
  });
});

describe("timezone and cutoff are preserved exactly", () => {
  it("records the window cutoff and timezone verbatim for a non-Pacific canonical timezone", () => {
    const timeZone = "Pacific/Auckland";
    const window = createMidweekEvidenceWindow({ now: new Date("2026-09-16T05:00:00Z"), timeZone });
    const entry = { cadence: "midweek", timeZone, evidenceWindow: window, dueAt: "2026-09-15T15:00:00.000Z" };
    const input = createSettlementGeneratorInput({ entry, asOf: new Date("2026-09-15T15:05:00Z"),
      decision: { action: "generate", reasonCode: "readiness_satisfied", unsettledDomains: [],
        readiness: evaluateBriefingReadinessV1({ domainStates: {} }) } });
    expect(input.watermark.timeZone).toBe(timeZone);
    expect(input.watermark.evidenceCutoff).toBe(window.cutoff);
    expect(input.watermark.evidenceWindow).toEqual(window);
    expect(input.watermark.earliestPublishAt).toBe("2026-09-15T15:00:00.000Z");
  });
});

describe("closeout metadata is optional and honest", () => {
  it("is null unless a real receipt exists; a supplied receipt is preserved frozen", () => {
    const readiness = evaluateBriefingReadinessV1({ domainStates: {} });
    const args = { evidenceWindow: { startDate: "2026-09-13", endDate: "2026-09-15" }, readiness,
      publishDecision: { reasonCode: "hard_deadline_reached", unsettledDomains: [] }, generatedAt: at(1) };
    expect(buildEvidenceSettlementWatermarkV1(args).closeoutReceipt).toBeNull();
    const receipt = recordDeviceCloseoutReceiptV1({ requestedAt: at(-10), respondedAt: at(-9), outcome: "no_new_evidence" });
    const mark = buildEvidenceSettlementWatermarkV1({ ...args, closeoutReceipt: receipt });
    expect(mark.closeoutReceipt).toEqual({ requestedAt: at(-10), respondedAt: at(-9), outcome: "no_new_evidence" });
    expect(() => { mark.closeoutReceipt.outcome = "x"; }).toThrow(TypeError);
  });

  it("the executor never fabricates a receipt (Server has no closeout endpoint yet)", () => {
    const window = createMidweekEvidenceWindow({ now: new Date("2026-09-16T18:00:00Z"), timeZone: TZ });
    const input = createSettlementGeneratorInput({ entry: { cadence: "midweek", timeZone: TZ, evidenceWindow: window, dueAt: at(0) },
      asOf: new Date(at(5)), decision: { action: "generate", reasonCode: "readiness_satisfied", unsettledDomains: [],
        readiness: evaluateBriefingReadinessV1({ domainStates: {} }) } });
    expect(input.watermark.closeoutReceipt).toBeNull();
  });
});

describe("duplicate / retry generation never produces a divergent watermark", () => {
  it("a second executor pass at a later time (even after the deadline) keeps the first watermark and one artifact", async () => {
    const w = world();
    await w.run(at(5));
    const first = JSON.stringify(w.artifactRecords[0].evidenceSettlement);
    await w.run(at(DEADLINE + 30));
    expect(w.artifactRecords).toHaveLength(1);
    expect(JSON.stringify(w.artifactRecords[0].evidenceSettlement)).toBe(first);
  });

  it("calling the real generator again with a DIFFERENT settlement returns the existing artifact with its original watermark", async () => {
    const w = world();
    await w.run(at(5));
    const original = JSON.stringify(w.artifactRecords[0].evidenceSettlement);
    const service = createMidweekBriefingService({ repositories: w.repositories, now: () => new Date(at(200)) });
    const window = createMidweekEvidenceWindow({ now: new Date(at(200)), timeZone: TZ });
    const divergent = createSettlementGeneratorInput({
      entry: { cadence: "midweek", timeZone: TZ, evidenceWindow: window, dueAt: at(0) }, asOf: new Date(at(200)),
      decision: { action: "generate", reasonCode: "hard_deadline_reached", unsettledDomains: ["nutrition"],
        readiness: evaluateBriefingReadinessV1({ domainStates: {} }) } });
    const result = await service.generateForCurrentWindow({ asOf: new Date(at(200)), settlement: divergent });
    expect(result).toMatchObject({ state: "completed", idempotent: true });
    expect(JSON.stringify(result.artifact.evidenceSettlement)).toBe(original);
    expect(w.artifactRecords).toHaveLength(1);
  });

  it("the writer keeps the oldest watermark of an occurrence when a replacement/duplicate carries another (or none)", async () => {
    const w = world();
    await w.run(at(5));
    const [first] = w.artifactRecords;
    const original = JSON.stringify(first.evidenceSettlement);
    const repository = createDailyBriefingRepository(w.artifactRecords);
    // An authorized replacement generated later, WITHOUT a watermark.
    const bare = structuredClone(first);
    delete bare.evidenceSettlement;
    bare.generatedAt = at(300);
    await repository.createDailyBriefing(bare, { replacementReason: "late_evidence_reconciliation" });
    expect(w.artifactRecords).toHaveLength(1);
    expect(JSON.stringify(w.artifactRecords[0].evidenceSettlement)).toBe(original);
    // ... and one carrying a DIFFERENT (later, deadline) watermark.
    const later = structuredClone(first);
    later.evidenceSettlement = buildEvidenceSettlementWatermarkV1({
      evidenceWindow: first.evidenceSettlement.evidenceWindow, readiness: evaluateBriefingReadinessV1({ domainStates: {} }),
      publishDecision: { reasonCode: "hard_deadline_reached", unsettledDomains: ["activity"] }, generatedAt: at(400) });
    await repository.createDailyBriefing(later, { replacementReason: "again" });
    expect(JSON.stringify(w.artifactRecords[0].evidenceSettlement)).toBe(original);
    // The replaced artifact is archived with the watermark it was published with.
    expect(w.artifactRecords[0].replacedBriefingHistory.length).toBeGreaterThan(0);
  });

  it("a claim completed with a watermark on the legacy path never overwrites an existing one", async () => {
    const claimed = { id: "a1", userId: OWNER, artifactType: "scheduled", lifecycle: { generationStatus: "in_progress" } };
    const repository = createDailyBriefingRepository([claimed]);
    const mark = (generatedAt, reasonCode) => buildEvidenceSettlementWatermarkV1({
      evidenceWindow: { startDate: "2026-09-13", endDate: "2026-09-15" }, readiness: evaluateBriefingReadinessV1({ domainStates: {} }),
      publishDecision: { reasonCode, unsettledDomains: [] }, generatedAt });
    const done = await repository.completeScheduledBriefing({ ...claimed, briefing: {}, evidenceSettlement: mark(at(5), "readiness_satisfied") });
    expect(done.evidenceSettlement.publishReasonCode).toBe("readiness_satisfied");
    const again = await repository.completeScheduledBriefing({ ...claimed, briefing: {}, evidenceSettlement: mark(at(500), "hard_deadline_reached") });
    expect(again.evidenceSettlement.publishReasonCode).toBe("readiness_satisfied");
    expect(again.evidenceSettlement.generatedAt).toBe(at(5));
  });
});

describe("attachEvidenceSettlement guards", () => {
  const window = { id: "midweek:2026-09-13:2026-09-15:America/Los_Angeles", startDate: "2026-09-13", endDate: "2026-09-15", cadence: "midweek", timeZone: TZ };
  const settlementFor = (evidenceWindow = window) => createSettlementGeneratorInput({
    entry: { cadence: "midweek", timeZone: TZ, evidenceWindow, dueAt: at(0) }, asOf: new Date(at(5)),
    decision: { action: "generate", reasonCode: "readiness_satisfied", unsettledDomains: [], readiness: evaluateBriefingReadinessV1({ domainStates: {} }) } });

  it("is a no-op without settlement input, keeps an existing watermark, and never mutates its input", () => {
    const artifact = { id: "a", evidenceWindow: window };
    expect(attachEvidenceSettlement(artifact, null)).toBe(artifact);
    const stamped = attachEvidenceSettlement(artifact, settlementFor());
    expect(stamped).not.toBe(artifact);
    expect(artifact).not.toHaveProperty("evidenceSettlement");
    expect(attachEvidenceSettlement(stamped, settlementFor())).toBe(stamped);
  });

  it("accepts an id that differs only by timezone when the covered evidence days are identical (N1)", () => {
    const tzOnly = { ...window, id: window.id.replace("America/Los_Angeles", "America/New_York") };
    expect(tzOnly.id).not.toBe(window.id);
    const stamped = attachEvidenceSettlement({ id: "a", evidenceWindow: tzOnly }, settlementFor());
    expect(stamped.evidenceSettlement.evidenceWindow.id).toBe(window.id);
    expect(stamped.evidenceSettlement.timeZone).toBe(TZ);
    // Different covered days still refuse, even with a matching-looking id shape.
    const shifted = { ...tzOnly, startDate: "2026-09-06", endDate: "2026-09-08" };
    expect(() => attachEvidenceSettlement({ id: "a", evidenceWindow: shifted }, settlementFor()))
      .toThrow(expect.objectContaining({ code: "evidence_settlement_window_mismatch" }));
  });

  it("refuses a watermark that describes a different window, or one that fails integrity", () => {
    const other = { ...window, id: "midweek:2026-09-06:2026-09-08:America/Los_Angeles", startDate: "2026-09-06", endDate: "2026-09-08" };
    expect(() => attachEvidenceSettlement({ id: "a", evidenceWindow: other }, settlementFor()))
      .toThrow(expect.objectContaining({ code: "evidence_settlement_window_mismatch" }));
    const tampered = { watermark: { ...settlementFor().watermark, deadlineFallback: true } };
    expect(() => attachEvidenceSettlement({ id: "a", evidenceWindow: window }, tampered))
      .toThrow(expect.objectContaining({ code: "evidence_settlement_integrity_invalid" }));
  });
});

describe("the other recurring generators carry the same watermark", () => {
  it("Weekly: generate() persists the supplied watermark on the artifact handed to persistence", async () => {
    const asOf = new Date("2026-07-12T18:00:00Z");
    const window = createWeeklyEvidenceWindow({ now: asOf, timeZone: TZ });
    const settlement = createSettlementGeneratorInput({
      entry: { cadence: "weekly", timeZone: TZ, evidenceWindow: window, dueAt: at(0) }, asOf,
      decision: { action: "generate", reasonCode: "hard_deadline_reached", unsettledDomains: ["nutrition"],
        readiness: evaluateBriefingReadinessV1({ domainStates: {} }), hardDeadlineAt: at(DEADLINE) } });
    const commit = vi.fn(async (prepared) => ({ status: "created", artifact: prepared.artifact, revision: 2, commitId: "c" }));
    const repositories = {
      users: { getCurrentUser: async () => ({ timeZone: TZ }) },
      canonicalEvidence: { listCanonicalEvidenceObjects: async () => [] },
      weights: { listWeightEntries: async () => [] },
      dailyBriefings: { listCompletedBriefingsInWindow: async () => [], getLatestWeeklyBriefing: async () => null, listDailyBriefings: async () => [] },
      goals: { getActiveGoal: async () => ({ id: "visible", title: "Visible Abs", status: "active", primary: true, type: "fat_loss" }), listGoals: async () => [] },
    };
    const service = createWeeklyNarrativeService({ repositories, weeklyPersistence: { captureBaseline: () => ({ revision: 1, semanticDigest: "t", fileHash: "t" }), commit }, now: () => asOf });
    await service.generate({ userId: "user", reason: "scheduled_weekly_cadence", asOf, settlement });
    const artifact = commit.mock.calls[0][0].artifact;
    expect(artifact.evidenceSettlement).toMatchObject({ cadence: "weekly", deadlineFallback: true, publishReasonCode: "hard_deadline_reached" });
    expect(artifact.evidenceSettlement.integrity.digest).toBe(settlement.watermark.integrity.digest);
    // Without settlement input: no member.
    commit.mockClear();
    await service.generate({ userId: "user", reason: "explicit_generation", asOf });
    expect(commit.mock.calls[0][0].artifact).not.toHaveProperty("evidenceSettlement");
  });

  it("Monthly: generateForCurrentWindow() hands the publisher an artifact carrying the watermark", async () => {
    const asOf = new Date("2026-10-01T12:00:00Z"); // 05:00 PT on the 1st
    const preparer = vi.fn(async ({ window }) => ({ artifact: { id: "monthly_x", evidenceWindow: window, briefing: {} } }));
    const publisher = vi.fn(async ({ prepared }) => ({ state: "completed", artifact: prepared.artifact }));
    const repositories = {
      users: { getCurrentUser: async () => ({ id: OWNER, timeZone: TZ }), getUserById: async () => ({ id: OWNER, timeZone: TZ }) },
      dailyBriefings: { getBriefingByEvidenceWindow: async () => null },
    };
    const service = createMonthlyBriefingService({ repositories, publicationService: {}, occurrencePreparer: preparer, occurrencePublisher: publisher, now: () => asOf });
    const { createMonthlyEvidenceWindow } = await import("./BriefingEvidenceWindowService");
    const window = createMonthlyEvidenceWindow({ now: asOf, timeZone: TZ });
    const settlement = createSettlementGeneratorInput({
      entry: { cadence: "monthly", timeZone: TZ, evidenceWindow: window, dueAt: at(0) }, asOf,
      decision: { action: "generate", reasonCode: "readiness_satisfied", unsettledDomains: [], readiness: evaluateBriefingReadinessV1({ domainStates: {} }) } });
    const result = await service.generateForCurrentWindow({ userId: OWNER, asOf, settlement });
    expect(result.state).toBe("completed");
    expect(publisher.mock.calls[0][0].prepared.artifact.evidenceSettlement).toMatchObject({ cadence: "monthly", publishReasonCode: "readiness_satisfied" });
  });
});

describe("the production V3 publication clone carries the watermark through unchanged", () => {
  it.each(["midweek", "weekly"])("applyNarrativeV3ToBriefingArtifact (%s) preserves artifact.evidenceSettlement and does not mutate its input", (type) => {
    const mark = buildEvidenceSettlementWatermarkV1({
      evidenceWindow: { startDate: "2026-09-13", endDate: "2026-09-15" }, readiness: evaluateBriefingReadinessV1({ domainStates: {} }),
      publishDecision: { reasonCode: "hard_deadline_reached", unsettledDomains: ["nutrition"] }, generatedAt: at(DEADLINE) });
    const artifact = { id: "a", evidenceSettlement: mark, briefing: { weeklyNarrative: { cards: {} } } };
    const out = applyNarrativeV3ToBriefingArtifact({ artifact, publicationType: type,
      narrativePlan: { composition: { sections: {} } }, strategicInterpretation: {} });
    expect(out.evidenceSettlement).toEqual(mark);
    expect(verifyEvidenceSettlementWatermarkIntegrity(out.evidenceSettlement)).toBe(true);
    expect(artifact.evidenceSettlement).toBe(mark);
  });
});
