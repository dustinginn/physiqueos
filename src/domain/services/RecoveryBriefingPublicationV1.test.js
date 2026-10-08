import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RECOVERY_ASSESSMENT_FIELD,
  RecoveryPublicationReason,
  assertRecoveryCadenceInvariantV1,
  attachRecoveryAssessmentV1,
  carryForwardRecoveryAssessmentV1,
  composeRecoveryAssessmentForBriefingV1,
  projectRecoveryCardForNativeV1,
  resolveRecoveryBriefingPublicationAuthorityV1,
  validateBriefingRecoveryAssessmentV1,
} from "./RecoveryBriefingPublicationV1.js";
import { createRecoveryBriefingComposerV1 } from "./RecoveryBriefingComposerV1.js";
import { createWeeklyEvidenceWindow, createMonthlyEvidenceWindow } from "./BriefingEvidenceWindowService.js";
import { createRecoverySleepInputReaderV1, RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID } from "../../platform/database/RecoverySleepInputReaderV1.js";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import {
  OWNER,
  SLEEP_D0,
  canonicalNights,
  recoveryActivationRecord,
  recoveryAlgorithmRecord,
} from "../../testSupport/recoverySleepSynthetic.js";
import { recoveryAuthorityRecord } from "../../testSupport/recoveryBriefingSynthetic.js";

const LA = "America/Los_Angeles";
// Sun Oct 25 2026 03:00 PDT: the Weekly for Oct 18-24.
const WEEKLY_AT = new Date("2026-10-25T10:00:00.000Z");
// Tue Dec 1 2026 03:00 PST: the Monthly for November.
const MONTHLY_AT = new Date("2026-12-01T11:00:00.000Z");

const weeklyWindow = () => createWeeklyEvidenceWindow({ now: WEEKLY_AT, timeZone: LA });
const monthlyWindow = () => createMonthlyEvidenceWindow({ now: MONTHLY_AT, timeZone: LA });

function weeklySleep(period = Array(7).fill(420)) {
  return [...canonicalNights(SLEEP_D0, Array(16).fill(420)), ...canonicalNights("2026-10-18", period)];
}

function monthlySleep(period = Array(30).fill(420)) {
  return [...canonicalNights("2026-10-04", Array(28).fill(420)), ...canonicalNights("2026-11-01", period)];
}

function inputs(sleepDays) {
  return { sleepDays, activationPolicyRecord: recoveryActivationRecord(), algorithmPolicyRecord: recoveryAlgorithmRecord() };
}

function compose({ cadence = "weekly", window = weeklyWindow(), sleepDays = weeklySleep(), authority = recoveryAuthorityRecord() } = {}) {
  return composeRecoveryAssessmentForBriefingV1({
    authority: resolveRecoveryBriefingPublicationAuthorityV1(authority),
    cadence,
    window,
    artifactId: `${cadence}_artifact`,
    ownerUserId: OWNER,
    evaluatedAt: (cadence === "monthly" ? MONTHLY_AT : WEEKLY_AT).toISOString(),
    sleepInputs: inputs(sleepDays),
  });
}

function artifactFor(cadence, { id = `${cadence}_artifact`, window = cadence === "monthly" ? monthlyWindow() : weeklyWindow(), artifactType = "scheduled" } = {}) {
  return {
    id, userId: OWNER, cadence, artifactType, generatedAt: (cadence === "monthly" ? MONTHLY_AT : WEEKLY_AT).toISOString(),
    evidenceWindow: window, briefing: { version: "x", marker: { nested: true } },
  };
}

describe("Recovery publication authority", () => {
  it("is OFF when absent, disabled or malformed, and never throws", () => {
    for (const record of [null, undefined, {}, { ...recoveryAuthorityRecord(), status: "disabled" },
      { ...recoveryAuthorityRecord(), schemaVersion: "v0" }, "enabled", 42]) {
      expect(resolveRecoveryBriefingPublicationAuthorityV1(record).enabled).toBe(false);
    }
  });

  it.each([
    [["weekly", "midweek"]], [["midweek"]], [["dexa_event"]], [["photo_event"]], [["weekly", "daily"]], [[]], ["weekly"],
  ])("refuses an authority naming %j as a whole (never silently narrowed)", (cadences) => {
    expect(resolveRecoveryBriefingPublicationAuthorityV1({ ...recoveryAuthorityRecord(), cadences }))
      .toMatchObject({ enabled: false, invalidReason: "recovery_publication_cadences_invalid", cadences: [] });
  });

  it.each([
    { strategicEvidenceEligibility: "eligible" }, { historicalBackfill: true }, { artifactRewrite: true },
    { publishBeforeBaselineEligible: true }, { effectiveFromPeriodStart: "2026-02-30" }, { authorizationRef: "" },
  ])("refuses a weakened isolation contract %j", (change) => {
    expect(resolveRecoveryBriefingPublicationAuthorityV1({ ...recoveryAuthorityRecord(), ...change }).enabled).toBe(false);
  });

  it("accepts Weekly-only, Monthly-only and both", () => {
    expect(resolveRecoveryBriefingPublicationAuthorityV1(recoveryAuthorityRecord({ cadences: ["monthly", "weekly"] })).cadences)
      .toEqual(["weekly", "monthly"]);
    expect(resolveRecoveryBriefingPublicationAuthorityV1(recoveryAuthorityRecord({ cadences: ["weekly"] })).cadences).toEqual(["weekly"]);
  });
});

describe("Recovery publication composition", () => {
  it("publishes a Green Weekly card for the first eligible Weekly (Oct 18-24)", () => {
    const decision = compose();
    expect(decision).toMatchObject({ attach: true, reason: RecoveryPublicationReason.PUBLISHED });
    expect(decision.recoveryAssessment.assessment).toMatchObject({ mode: "publication", shadow: false });
    expect(decision.recoveryAssessment.assessment.status).toMatchObject({ state: "green", label: "Green" });
    expect(decision.eligibility).toMatchObject({
      prospectiveFloor: SLEEP_D0, baselineReliableNights: 16, baselineRequiredNights: 14,
      periodReliableNights: 7, periodRequiredNights: 5, periodExpectedNights: 7,
    });
    expect(() => validateBriefingRecoveryAssessmentV1(decision.recoveryAssessment, { cadence: "weekly" })).not.toThrow();
  });

  it.each([
    ["yellow", [420, 375, 375, 375, 375, 375, 420], "Yellow"],
    ["red", [300, 300, 300, 300, 300, 420, 420], "Red"],
    ["unavailable", [420, 420, 420, 420, null, null, null], "Not enough data"],
  ])("publishes %s for the eligible Weekly", (state, period, label) => {
    const decision = compose({ sleepDays: weeklySleep(period) });
    expect(decision.attach).toBe(true);
    expect(decision.recoveryAssessment.assessment.status).toMatchObject({ state, label });
  });

  it("publishes NOTHING (no field) before the 14-night baseline is met", () => {
    const sparse = weeklySleep().filter((day) => !["2026-10-03", "2026-10-04", "2026-10-05"].includes(day.sleepDay));
    const decision = compose({ sleepDays: sparse });
    expect(decision).toMatchObject({ attach: false, reason: "baseline_not_yet_eligible" });
    expect(decision.eligibility.baselineReliableNights).toBe(13);
    expect(decision.recoveryAssessment).toBeUndefined();
  });

  it("publishes the November Monthly, and Not enough data below twenty nights", () => {
    const eligible = compose({ cadence: "monthly", window: monthlyWindow(), sleepDays: monthlySleep() });
    expect(eligible.attach).toBe(true);
    expect(eligible.recoveryAssessment.assessment.status.state).toBe("green");
    expect(eligible.recoveryAssessment.assessment.sleep.trend.granularity).toBe("week");
    const sparse = compose({ cadence: "monthly", window: monthlyWindow(),
      sleepDays: monthlySleep(Array.from({ length: 30 }, (_, index) => index < 19 ? 420 : null)) });
    expect(sparse.attach).toBe(true);
    expect(sparse.recoveryAssessment.assessment.status).toMatchObject({ state: "unavailable", label: "Not enough data" });
  });

  it.each([
    ["midweek", "cadence_excluded"], ["dexa_event", "cadence_excluded"], ["photo_event", "cadence_excluded"],
    ["daily", "cadence_excluded"], ["event", "cadence_excluded"],
  ])("never computes Recovery for %s", (cadence, reason) => {
    expect(compose({ cadence })).toEqual({ proceed: false, attach: false, reason });
  });

  it("respects the Weekly-only grant and the future-only effective period", () => {
    expect(compose({ cadence: "monthly", window: monthlyWindow(), sleepDays: monthlySleep(),
      authority: recoveryAuthorityRecord({ cadences: ["weekly"] }) })).toMatchObject({ attach: false, reason: "cadence_not_authorized" });
    expect(compose({ authority: recoveryAuthorityRecord({ effectiveFromPeriodStart: "2026-10-25" }) }))
      .toMatchObject({ attach: false, reason: "period_before_publication_effective" });
  });

  it("refuses an open window and blocked Sleep inputs", () => {
    expect(compose({ window: { ...weeklyWindow(), closed: false } })).toMatchObject({ reason: "evidence_window_not_closed" });
    const blocked = composeRecoveryAssessmentForBriefingV1({
      authority: resolveRecoveryBriefingPublicationAuthorityV1(recoveryAuthorityRecord()), cadence: "weekly",
      window: weeklyWindow(), artifactId: "a", ownerUserId: OWNER, evaluatedAt: WEEKLY_AT.toISOString(),
      sleepInputs: { ...inputs(weeklySleep()), algorithmPolicyRecord: null },
    });
    expect(blocked).toMatchObject({ attach: false, reason: "sleep_input_blocked", detail: "sleep_canon_v3_policy_not_enabled" });
  });

  it("derives the cutoff for a closed-window contract that carries none", () => {
    const { cutoff: _cutoff, ...window } = weeklyWindow();
    const decision = compose({ window });
    expect(decision.attach).toBe(true);
    expect(decision.recoveryAssessment.assessment.provenance.evidenceCutoff).toBe("2026-10-25T06:59:59.999Z");
  });

  it("is deterministic and binds identity to the artifact", () => {
    const first = compose();
    const second = compose();
    expect(second.recoveryAssessment).toEqual(first.recoveryAssessment);
    const forged = structuredClone(first.recoveryAssessment);
    forged.eligibility.baselineReliableNights = 20;
    expect(() => validateBriefingRecoveryAssessmentV1(forged)).toThrow("integrity mismatch");
    const strategic = structuredClone(first.recoveryAssessment);
    strategic.isolation.strategicEligibility = "eligible";
    expect(() => validateBriefingRecoveryAssessmentV1(strategic)).toThrow("Invalid Briefing Recovery assessment.");
  });
});

describe("Recovery artifact boundary", () => {
  it("survives a JSON (Postgres JSONB) round trip for every status, so a stored card always re-validates", () => {
    const periods = [Array(7).fill(420), [420, 375, 375, 375, 375, 375, 420], [300, 300, 300, 300, 300, 420, 420],
      [420, 420, 420, 420, null, null, null], [421.3, 389.7, 402.25, 377.9, 455.1, 300.05, 410]];
    for (const period of periods) {
      const attached = attachRecoveryAssessmentV1(artifactFor("weekly"), compose({ sleepDays: weeklySleep(period) }));
      // JSONB also reorders keys; stable serialization must not care.
      const reordered = JSON.parse(JSON.stringify(attached, (_key, value) => (value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse()) : value)));
      expect(() => assertRecoveryCadenceInvariantV1(reordered)).not.toThrow();
      expect(projectRecoveryCardForNativeV1(reordered)).toEqual(projectRecoveryCardForNativeV1(attached));
    }
    const monthly = attachRecoveryAssessmentV1(artifactFor("monthly"), compose({ cadence: "monthly", window: monthlyWindow(), sleepDays: monthlySleep() }));
    expect(() => assertRecoveryCadenceInvariantV1(JSON.parse(JSON.stringify(monthly)))).not.toThrow();
  });

  it("lets a stored Weekly with a card be replaced through the write funnel", async () => {
    const { createDailyBriefingRepository } = await import("../../data/repositories/DailyBriefingRepository.js");
    const stored = JSON.parse(JSON.stringify(attachRecoveryAssessmentV1(artifactFor("weekly"), compose())));
    const records = [stored];
    const repository = createDailyBriefingRepository(records);
    const replacement = carryForwardRecoveryAssessmentV1({ existing: stored, artifact: { ...artifactFor("weekly"), generatedAt: "2026-10-26T10:00:00.000Z" } });
    await expect(repository.createDailyBriefing(replacement, { replacementReason: "late_evidence" })).resolves.toBeTruthy();
    expect(records.at(-1).briefing[RECOVERY_ASSESSMENT_FIELD]).toEqual(stored.briefing[RECOVERY_ASSESSMENT_FIELD]);
  });

  it("returns the SAME artifact object when nothing is attached", () => {
    const artifact = artifactFor("weekly");
    expect(attachRecoveryAssessmentV1(artifact, { attach: false })).toBe(artifact);
    expect(carryForwardRecoveryAssessmentV1({ existing: artifactFor("weekly"), artifact })).toBe(artifact);
  });

  it("attaches exactly one envelope under briefing.recoveryAssessment", () => {
    const artifact = artifactFor("weekly");
    const before = structuredClone(artifact);
    const attached = attachRecoveryAssessmentV1(artifact, compose());
    expect(artifact).toEqual(before);
    expect(Object.keys(attached.briefing).filter((key) => key.toLowerCase().includes("recovery"))).toEqual([RECOVERY_ASSESSMENT_FIELD]);
    expect(attached.briefing.marker).toEqual({ nested: true });
    expect(() => attachRecoveryAssessmentV1({ ...artifact, id: "another" }, compose())).toThrow();
  });

  it.each(["midweek", "event", "daily", "dexa_event", "photo_event"])(
    "forbids any Recovery field (even null or empty) on %s artifacts", (cadence) => {
      for (const value of [compose().recoveryAssessment, null, {}, { status: "not_enough_data" }]) {
        expect(() => assertRecoveryCadenceInvariantV1({ ...artifactFor("weekly"), cadence,
          briefing: { [RECOVERY_ASSESSMENT_FIELD]: value } })).toThrow();
      }
    });

  it("forbids Recovery on event artifacts and invalid placeholders on Weekly/Monthly", () => {
    const envelope = compose().recoveryAssessment;
    expect(() => assertRecoveryCadenceInvariantV1({ ...artifactFor("weekly", { artifactType: "event" }),
      briefing: { [RECOVERY_ASSESSMENT_FIELD]: envelope } })).toThrow();
    for (const value of [null, {}, []]) {
      expect(() => assertRecoveryCadenceInvariantV1({ ...artifactFor("weekly"), briefing: { [RECOVERY_ASSESSMENT_FIELD]: value } })).toThrow();
    }
    expect(() => assertRecoveryCadenceInvariantV1(attachRecoveryAssessmentV1(artifactFor("weekly"), compose()))).not.toThrow();
    expect(() => assertRecoveryCadenceInvariantV1(artifactFor("midweek"))).not.toThrow();
  });

  it("carries a published envelope forward verbatim and never adds one on regeneration", () => {
    const published = attachRecoveryAssessmentV1(artifactFor("weekly"), compose());
    const regenerated = artifactFor("weekly");
    expect(carryForwardRecoveryAssessmentV1({ existing: published, artifact: regenerated }).briefing[RECOVERY_ASSESSMENT_FIELD])
      .toEqual(published.briefing[RECOVERY_ASSESSMENT_FIELD]);
    const recomputed = attachRecoveryAssessmentV1(artifactFor("weekly"), compose({ sleepDays: weeklySleep(Array(7).fill(300)) }));
    const kept = carryForwardRecoveryAssessmentV1({ existing: artifactFor("weekly"), artifact: recomputed });
    expect(Object.prototype.hasOwnProperty.call(kept.briefing, RECOVERY_ASSESSMENT_FIELD)).toBe(false);
  });

  it("projects one Native card for Weekly/Monthly and null everywhere else", () => {
    const weekly = attachRecoveryAssessmentV1(artifactFor("weekly"), compose({ sleepDays: weeklySleep([420, 375, 375, 375, 375, 375, 420]) }));
    const card = projectRecoveryCardForNativeV1(weekly);
    expect(card).toMatchObject({
      schemaVersion: "recovery_card_v1", presentation: "single_recovery_card_v1", cadence: "weekly",
      status: { state: "yellow", label: "Yellow" },
      period: { startDate: "2026-10-18", endDate: "2026-10-24", expectedNights: 7, observedNights: 7 },
      sleep: { baselineNights: 16, baselineLookbackNights: 28, baselineMinutes: 420, trend: { granularity: "night" } },
      commentary: { visible: true },
    });
    expect(card.sleep.trend.points).toHaveLength(7);
    expect(JSON.stringify(card)).not.toMatch(/score|strategic|confidence/i);
    expect(projectRecoveryCardForNativeV1(artifactFor("weekly"))).toBeNull();
    expect(projectRecoveryCardForNativeV1({ ...weekly, cadence: "midweek" })).toBeNull();
    expect(projectRecoveryCardForNativeV1({ ...weekly, id: "moved" })).toBeNull();
  });
});

describe("Recovery composer seam", () => {
  function reader(sleepDays, authority = recoveryAuthorityRecord()) {
    const calls = [];
    return {
      calls,
      readAuthorityRecord: async () => { calls.push("authority"); return authority; },
      readSleepInputs: async (range) => { calls.push(["sleep", range]); return inputs(sleepDays); },
    };
  }

  it("makes ZERO Sleep reads when the authority is absent, and returns the same artifact", async () => {
    const fake = reader(weeklySleep(), null);
    const composer = createRecoveryBriefingComposerV1(fake);
    const artifact = artifactFor("weekly");
    const result = await composer.composeForNewArtifact({ cadence: "weekly", artifact });
    expect(result.artifact).toBe(artifact);
    expect(result.decision.reason).toBe("publication_authority_disabled");
    expect(fake.calls).toEqual(["authority"]);
  });

  it.each(["midweek", "dexa_event", "photo_event"])("never reads anything for %s", async (cadence) => {
    const fake = reader(weeklySleep());
    const artifact = { ...artifactFor("weekly"), cadence };
    const result = await createRecoveryBriefingComposerV1(fake).composeForNewArtifact({ cadence, artifact });
    expect(result.artifact).toBe(artifact);
    expect(fake.calls).toEqual([]);
  });

  it("reads only the bounded baseline+period range and attaches when eligible", async () => {
    const fake = reader(weeklySleep());
    const decisions = [];
    const result = await createRecoveryBriefingComposerV1({ ...fake, onDecision: (decision) => decisions.push(decision) })
      .composeForNewArtifact({ cadence: "weekly", artifact: artifactFor("weekly") });
    expect(fake.calls).toEqual(["authority", ["sleep", { ownerUserId: OWNER, startDate: "2026-09-20", endDate: "2026-10-24" }]]);
    expect(result.artifact.briefing[RECOVERY_ASSESSMENT_FIELD].assessment.status.state).toBe("green");
    expect(decisions).toEqual([{ cadence: "weekly", reason: "recovery_card_published", detail: null }]);
  });

  it("never throws and never blocks a briefing when a read fails", async () => {
    const artifact = artifactFor("weekly");
    const failing = createRecoveryBriefingComposerV1({
      readAuthorityRecord: async () => recoveryAuthorityRecord(),
      readSleepInputs: async () => { const error = new Error("db down"); error.code = "ECONNRESET"; throw error; },
      onDecision: () => { throw new Error("observer bug"); },
    });
    const result = await failing.composeForNewArtifact({ cadence: "weekly", artifact });
    expect(result.artifact).toBe(artifact);
    expect(result.decision).toMatchObject({ attach: false, reason: "recovery_composition_failed", detail: "ECONNRESET" });
  });
});

describe("Recovery Sleep input reader", () => {
  it("reads ordinary canonical days and policies only, and has no write path", async () => {
    const store = createInMemoryCanonicalRecordStore({
      healthKitSleepDays: weeklySleep(),
      healthKitSleepHistoricalEvidenceDays: [{ id: "h", occurrenceDate: "2026-10-05", ingestionPurpose: "historical_evidence_import" }],
      healthKitConfiguration: [
        { id: "healthkit_sleep_canonical_activation_policy", ...recoveryActivationRecord() },
        { id: "healthkit_sleep_canonical_algorithm_policy", ...recoveryAlgorithmRecord() },
      ],
    });
    const reads = createRecoverySleepInputReaderV1({ records: store, ownerUserId: OWNER });
    expect(Object.keys(reads)).toEqual(["readAuthorityRecord", "readSleepInputs"]);
    expect(await reads.readAuthorityRecord()).toBeNull();
    const result = await reads.readSleepInputs({ startDate: "2026-09-20", endDate: "2026-10-24" });
    expect(result.sleepDays).toHaveLength(23);
    expect(result.sleepDays.every((day) => day.ingestionPurpose === "validation_only")).toBe(true);
    expect(result.activationPolicyRecord.effectiveSleepDay).toBe(SLEEP_D0);
    expect(store.getMutationCount()).toBe(0);
    await expect(reads.readSleepInputs({ startDate: "2026-01-01", endDate: "2026-10-24" })).rejects.toThrow("bounded range");
    await expect(reads.readSleepInputs({ ownerUserId: "other", startDate: "2026-09-20", endDate: "2026-10-24" })).rejects.toThrow("owner");
    expect(RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID).toBe("recovery_briefing_publication_authority");
  });

  it("is not constructed by any composition (not wired)", () => {
    const sources = ["src/application/composition/providerBriefingCadenceComposition.js",
      "src/application/composition/providerBriefingReconciliationComposition.js"]
      .map((file) => fs.readFileSync(file, "utf8"));
    for (const source of sources) {
      expect(source).not.toMatch(/Recovery(SleepInputReader|BriefingComposer|BriefingPublication)/);
    }
  });
});
