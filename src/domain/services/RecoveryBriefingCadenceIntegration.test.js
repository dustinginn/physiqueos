import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createWeeklyNarrativeService } from "./WeeklyNarrativeService";
import { createMidweekBriefingService } from "./MidweekBriefingService";
import { createDailyBriefingRepository } from "../../data/repositories/DailyBriefingRepository";
import { resolveBriefingCadenceRegistry } from "./BriefingCadenceRegistryService";
import { createWeeklyEvidenceWindow } from "./BriefingEvidenceWindowService";
import { createRecoveryBriefingComposerV1 } from "./RecoveryBriefingComposerV1.js";
import {
  RECOVERY_ASSESSMENT_FIELD,
  attachRecoveryAssessmentV1,
  composeRecoveryAssessmentForBriefingV1,
  projectRecoveryCardForNativeV1,
  resolveRecoveryBriefingPublicationAuthorityV1,
} from "./RecoveryBriefingPublicationV1.js";
import { createBriefingNavigationReadService } from "../../application/briefings/BriefingNavigationReadService.js";
import {
  OWNER,
  SLEEP_D0,
  canonicalNights,
  recoveryActivationRecord,
  recoveryAlgorithmRecord,
} from "../../testSupport/recoverySleepSynthetic.js";
import { recoveryAuthorityRecord } from "../../testSupport/recoveryBriefingSynthetic.js";

// End-to-end through the REAL Weekly and Midweek generators, the REAL artifact
// write funnel, the REAL cadence registry and the REAL Native read service.
// Only the V3 cadence lifecycle (publication) is a capture spy, exactly as the
// existing Weekly Sleep-invariance test does.

const TZ = "America/Los_Angeles";
const WEEKLY_AT = new Date("2026-10-25T10:00:00.000Z"); // Sun Oct 25 03:00 PDT
const WEEK = ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"];

const ordinary = () => WEEK.flatMap((date, index) => [
  { canonicalId: `activity_day|${date}`, evidence_type: "activity_day", userId: OWNER, quality: { status: "active" }, lastObservedAt: date,
    payload: { evidence_type: "activity_day", observed_at: date, daily_activity: { move_calories: 600 + index * 10, exercise_minutes: 30 } } },
  { canonicalId: `nutrition|${date}|nutrition-day`, evidence_type: "nutrition", userId: OWNER, quality: { status: "active" }, lastObservedAt: date,
    payload: { evidence_type: "nutrition", observed_at: date, daily_totals: { calories: 2400, protein_g: 180, carbs_g: 250, fat_g: 70 },
      meals: [], metadata: { date, daily_totals_scope: "full_day_summary", completeness: "complete" } } },
]);

function sleepFor(period = Array(7).fill(420)) {
  return [...canonicalNights(SLEEP_D0, Array(16).fill(420)), ...canonicalNights("2026-10-18", period)];
}

function composer({ authority = recoveryAuthorityRecord(), sleepDays = sleepFor() } = {}) {
  const reads = { authority: 0, sleep: 0 };
  return {
    reads,
    composer: createRecoveryBriefingComposerV1({
      readAuthorityRecord: async () => { reads.authority += 1; return authority; },
      readSleepInputs: async () => {
        reads.sleep += 1;
        return { sleepDays, activationPolicyRecord: recoveryActivationRecord(), algorithmPolicyRecord: recoveryAlgorithmRecord() };
      },
    }),
  };
}

function weekly({ recoveryComposer = null, existing = null } = {}) {
  const briefings = new Map(existing ? [[existing.id, existing]] : []);
  const repositories = {
    users: { getCurrentUser: async () => ({ id: OWNER, timeZone: TZ }), getUserById: async () => ({ id: OWNER, timeZone: TZ }) },
    canonicalEvidence: { listCanonicalEvidenceObjects: vi.fn(async () => ordinary()) },
    weights: { listWeightEntries: async () => WEEK.map((date, index) => ({ id: `w-${date}`, measuredAt: `${date}T14:00:00.000Z`, weight: { value: 180 + index * 0.1, unit: "lb" } })) },
    dailyBriefings: {
      listCompletedBriefingsInWindow: async () => [],
      getLatestWeeklyBriefing: async () => [...briefings.values()].at(-1) ?? null,
      listDailyBriefings: async () => [...briefings.values()],
      getBriefingById: async (id) => briefings.get(id) ?? null,
      getBriefingByEvidenceWindow: async (_user, windowId) => [...briefings.values()].find((item) => item.evidenceWindow?.id === windowId) ?? null,
    },
    goals: { getActiveGoal: async () => null, listGoals: async () => [] },
  };
  const publish = vi.fn(async ({ artifact }) => ({ committed: true, status: "created", artifact, revision: 2, commitId: "c" }));
  const service = createWeeklyNarrativeService({
    repositories,
    weeklyPersistence: { captureBaseline: () => ({ revision: 1, semanticDigest: "t", fileHash: "t" }), commit: vi.fn() },
    cadenceLifecycle: { publish },
    now: () => WEEKLY_AT,
    recoveryComposer,
  });
  return { service, publish };
}

function withoutRecovery(artifact) {
  const { [RECOVERY_ASSESSMENT_FIELD]: _recovery, ...briefing } = artifact.briefing;
  return { ...artifact, briefing };
}

describe("Weekly generator Recovery seam", () => {
  it("is byte-identical with no composer and with a composer whose authority is absent (zero Sleep reads)", async () => {
    const base = weekly();
    const off = composer({ authority: null });
    const gated = weekly({ recoveryComposer: off.composer });
    await base.service.generate({ userId: OWNER, reason: "scheduled_weekly_cadence" });
    await gated.service.generate({ userId: OWNER, reason: "scheduled_weekly_cadence" });
    const a = base.publish.mock.calls[0][0];
    const b = gated.publish.mock.calls[0][0];
    expect(b).toEqual(a);
    expect(Object.prototype.hasOwnProperty.call(b.artifact.briefing, RECOVERY_ASSESSMENT_FIELD)).toBe(false);
    expect(off.reads).toEqual({ authority: 1, sleep: 0 });
  });

  it("adds ONLY briefing.recoveryAssessment to the first eligible Weekly; V3 inputs are untouched", async () => {
    const base = weekly();
    const on = composer();
    const published = weekly({ recoveryComposer: on.composer });
    await base.service.generate({ userId: OWNER, reason: "scheduled_weekly_cadence" });
    await published.service.generate({ userId: OWNER, reason: "scheduled_weekly_cadence" });
    const a = base.publish.mock.calls[0][0];
    const b = published.publish.mock.calls[0][0];
    expect(b.artifact.evidenceWindow).toMatchObject({ startDate: "2026-10-18", endDate: "2026-10-24" });
    expect(b.artifact.briefing[RECOVERY_ASSESSMENT_FIELD].assessment.status.state).toBe("green");
    expect(withoutRecovery(b.artifact)).toEqual(a.artifact);
    // Everything V3/Confidence/Narrative consumes is identical.
    for (const key of ["periodEvidence", "piEnvelope", "operatingState", "activeGoal", "activePhase", "reason", "operation", "cadence"]) {
      expect(b[key]).toEqual(a[key]);
    }
    expect(on.reads).toEqual({ authority: 1, sleep: 1 });
  });

  it("never lets a Red Recovery status change any other Weekly content", async () => {
    const green = weekly({ recoveryComposer: composer().composer });
    const red = weekly({ recoveryComposer: composer({ sleepDays: sleepFor([300, 300, 300, 300, 300, 420, 420]) }).composer });
    await green.service.generate({ userId: OWNER, reason: "scheduled_weekly_cadence" });
    await red.service.generate({ userId: OWNER, reason: "scheduled_weekly_cadence" });
    const g = green.publish.mock.calls[0][0];
    const r = red.publish.mock.calls[0][0];
    expect(r.artifact.briefing[RECOVERY_ASSESSMENT_FIELD].assessment.status.state).toBe("red");
    expect(withoutRecovery(r.artifact)).toEqual(withoutRecovery(g.artifact));
    expect(r.periodEvidence).toEqual(g.periodEvidence);
  });

  it("publishes no field before the baseline is eligible", async () => {
    const early = weekly({ recoveryComposer: composer({ sleepDays: sleepFor().filter((day) => day.sleepDay > "2026-10-04") }).composer });
    await early.service.generate({ userId: OWNER, reason: "scheduled_weekly_cadence" });
    const artifact = early.publish.mock.calls[0][0].artifact;
    expect(Object.prototype.hasOwnProperty.call(artifact.briefing, RECOVERY_ASSESSMENT_FIELD)).toBe(false);
  });

  it("never recomposes an occurrence that already exists", async () => {
    const window = createWeeklyEvidenceWindow({ now: WEEKLY_AT, timeZone: TZ });
    const existing = { id: "weekly_briefing_2026-10-18_2026-10-24", cadence: "weekly", userId: OWNER, evidenceWindow: window, briefing: { version: "old" } };
    const on = composer();
    const { service } = weekly({ recoveryComposer: on.composer, existing });
    await service.generate({ userId: OWNER, reason: "scheduled_weekly_cadence" });
    expect(on.reads).toEqual({ authority: 0, sleep: 0 });
  });

  it("carries the published card verbatim on regeneration and never adds one to an artifact without it", async () => {
    const first = weekly({ recoveryComposer: composer().composer });
    await first.service.generate({ userId: OWNER, reason: "scheduled_weekly_cadence" });
    const published = first.publish.mock.calls[0][0].artifact;
    const regenerating = weekly({ recoveryComposer: composer({ sleepDays: sleepFor(Array(7).fill(300)) }).composer, existing: published });
    const prepared = await regenerating.service.prepareRegeneration({ userId: OWNER, reason: "late_evidence", targetArtifactId: published.id });
    expect(prepared.artifact.briefing[RECOVERY_ASSESSMENT_FIELD]).toEqual(published.briefing[RECOVERY_ASSESSMENT_FIELD]);
    const legacy = withoutRecovery(published);
    const noCard = weekly({ recoveryComposer: composer().composer, existing: legacy });
    const preparedLegacy = await noCard.service.prepareRegeneration({ userId: OWNER, reason: "late_evidence", targetArtifactId: legacy.id });
    expect(Object.prototype.hasOwnProperty.call(preparedLegacy.artifact.briefing, RECOVERY_ASSESSMENT_FIELD)).toBe(false);
  });

  it("is deterministic across repeated generation", async () => {
    const one = weekly({ recoveryComposer: composer().composer });
    const two = weekly({ recoveryComposer: composer().composer });
    await one.service.generate({ userId: OWNER, reason: "scheduled_weekly_cadence" });
    await two.service.generate({ userId: OWNER, reason: "scheduled_weekly_cadence" });
    expect(two.publish.mock.calls[0][0].artifact).toEqual(one.publish.mock.calls[0][0].artifact);
  });
});

describe("NO RECOVERY ON MIDWEEK, DEXA, PHOTO or any other type", () => {
  it("generates a Midweek with no Recovery field and the Midweek generator has no Recovery seam", async () => {
    const wednesday = new Date("2026-10-21T19:00:00Z");
    const records = [];
    const user = { id: OWNER, timeZone: TZ };
    const repositories = { users: { getCurrentUser: async () => user, getUserById: async () => user }, dailyBriefings: createDailyBriefingRepository(records),
      canonicalEvidence: { listCanonicalEvidenceObjects: async () => ordinary() }, weights: { listWeightEntries: async () => [] },
      dexaScans: { listDEXAScans: async () => [] }, goals: { getActiveGoal: async () => ({ id: "goal-build", title: "Build Lean Mass", phases: [] }) } };
    const result = await createMidweekBriefingService({ repositories, now: () => wednesday,
      recoveryComposer: composer().composer }).generateForCurrentWindow({ asOf: wednesday });
    expect(result.artifact.cadence).toBe("midweek");
    expect(JSON.stringify(result.artifact)).not.toMatch(/recoveryAssessment|recovery_card|recovery_briefing/);
    for (const file of ["MidweekBriefingService.js", "DEXAEventNarrativeService.js", "PhotoEventNarrativeService.js",
      "PIDEXAEventPublicationService.js", "PIPhotoEventPublicationService.js", "MidweekBriefingPresentationService.js"]) {
      expect(fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8")).not.toMatch(/RecoveryBriefing|recoveryComposer|recoveryAssessment/);
    }
  });

  it.each([
    ["midweek", "scheduled"], ["event", "event"], ["daily", "scheduled"], ["weekly", "event"],
  ])("the artifact write funnel refuses a Recovery field on cadence=%s type=%s", async (cadence, artifactType) => {
    const envelope = weeklyEnvelope();
    const repository = createDailyBriefingRepository([]);
    for (const value of [envelope, null, {}]) {
      await expect(repository.createDailyBriefing({ id: "x", userId: OWNER, cadence, artifactType,
        evidenceWindow: { id: "w" }, briefing: { [RECOVERY_ASSESSMENT_FIELD]: value } })).rejects.toThrow();
    }
  });

  it("the write funnel also refuses it on claim completion and accepts unchanged artifacts", async () => {
    const records = [{ id: "midweek-1", userId: OWNER, cadence: "midweek", artifactType: "scheduled", evidenceWindow: { id: "m" },
      lifecycle: { generationStatus: "in_progress" } }];
    const repository = createDailyBriefingRepository(records);
    await expect(repository.completeScheduledBriefing({ ...records[0], briefing: { [RECOVERY_ASSESSMENT_FIELD]: weeklyEnvelope() } })).rejects.toThrow();
    await expect(repository.completeScheduledBriefing({ ...records[0], briefing: { hero: {} } })).resolves.toMatchObject({ id: "midweek-1" });
  });

  it("the write funnel accepts a valid Weekly envelope and refuses one bound to another window", async () => {
    const repository = createDailyBriefingRepository([]);
    const window = createWeeklyEvidenceWindow({ now: WEEKLY_AT, timeZone: TZ });
    const artifact = { id: "weekly_artifact", userId: OWNER, cadence: "weekly", artifactType: "scheduled", evidenceWindow: window, briefing: {} };
    const attached = attachRecoveryAssessmentV1(artifact, weeklyDecision());
    await expect(repository.createDailyBriefing(attached)).resolves.toBeTruthy();
    const moved = { ...attached, id: "weekly_artifact_2", evidenceWindow: { ...window, id: "weekly:2026-10-11:2026-10-17:America/Los_Angeles", startDate: "2026-10-11", endDate: "2026-10-17" } };
    await expect(createDailyBriefingRepository([]).createDailyBriefing(moved)).rejects.toThrow();
  });
});

describe("Cadence collisions and schedule are unchanged", () => {
  it("keeps Sun Oct 25 Weekly, Nov 1 Monthly-over-Weekly precedence and Dec 1 Monthly", async () => {
    const repositories = { users: { getUserById: async () => ({ id: OWNER, timeZone: TZ }), getCurrentUser: async () => ({ id: OWNER, timeZone: TZ }) },
      dailyBriefings: { getBriefingByEvidenceWindow: async () => null } };
    const at = async (iso) => Object.fromEntries((await resolveBriefingCadenceRegistry({ repositories, generators: {}, userId: OWNER, now: new Date(iso) }))
      .map((entry) => [entry.cadence, { eligible: entry.eligible, reason: entry.eligibilityReason, window: entry.evidenceWindow?.id ?? null }]));
    const oct25 = await at("2026-10-25T10:30:00.000Z");
    expect(oct25.weekly).toMatchObject({ eligible: true, window: "weekly:2026-10-18:2026-10-24:America/Los_Angeles" });
    const nov1 = await at("2026-11-01T11:30:00.000Z"); // 03:30 PST (DST ends Nov 1)
    expect(nov1.monthly).toMatchObject({ eligible: true, window: "monthly:2026-10-01:2026-10-31:America/Los_Angeles" });
    expect(nov1.weekly).toMatchObject({ eligible: false, reason: "superseded_by_monthly" });
    const dec1 = await at("2026-12-01T11:30:00.000Z");
    expect(dec1.monthly).toMatchObject({ eligible: true, window: "monthly:2026-11-01:2026-11-30:America/Los_Angeles" });
    expect(dec1.weekly.eligible).toBe(false);
  });

  it("the October Monthly (published Nov 1) gets no Recovery: no prospective baseline exists", () => {
    const window = { id: "monthly:2026-10-01:2026-10-31:America/Los_Angeles", startDate: "2026-10-01", endDate: "2026-10-31",
      timeZone: TZ, closed: true, cutoff: "2026-11-01T06:59:59.999Z" };
    const decision = composeRecoveryAssessmentForBriefingV1({
      authority: resolveRecoveryBriefingPublicationAuthorityV1(recoveryAuthorityRecord({ effectiveFromPeriodStart: "2026-10-01" })),
      cadence: "monthly", window, artifactId: "monthly_october", ownerUserId: OWNER, evaluatedAt: "2026-11-01T10:00:00.000Z",
      sleepInputs: { sleepDays: canonicalNights(SLEEP_D0, Array(30).fill(420)), activationPolicyRecord: recoveryActivationRecord(), algorithmPolicyRecord: recoveryAlgorithmRecord() },
    });
    expect(decision).toMatchObject({ attach: false, reason: "baseline_not_yet_eligible" });
    expect(decision.eligibility.baselineReliableNights).toBe(0);
  });
});

describe("Native read contract (old-client compatible)", () => {
  const nativeStore = (artifact) => ({
    getAnalysis: vi.fn(), listHistory: vi.fn(async () => ({ artifacts: [] })),
    getArtifact: vi.fn(async () => ({ artifact, user: { id: OWNER, timeZone: TZ }, goals: [], confidenceAssessment: null })),
  });

  it("adds an optional top-level `recovery` card to Weekly only when published; otherwise the key is absent", async () => {
    const window = createWeeklyEvidenceWindow({ now: WEEKLY_AT, timeZone: TZ });
    const plain = nativeWeekly(window);
    const withCard = attachRecoveryAssessmentV1(plain, weeklyDecision({ artifactId: plain.id }));
    const without = await createBriefingNavigationReadService({ store: nativeStore(plain) }).getNativeArtifact({ artifactId: plain.id });
    const withResult = await createBriefingNavigationReadService({ store: nativeStore(withCard) }).getNativeArtifact({ artifactId: plain.id });
    expect(without).not.toHaveProperty("recovery");
    expect(withResult.recovery).toEqual(projectRecoveryCardForNativeV1(withCard));
    expect(withResult.recovery.status).toEqual({ state: "green", label: "Green" });
    const { recovery: _recovery, ...rest } = withResult;
    expect(rest).toEqual(without);
    expect(JSON.stringify(withResult.presentation)).not.toContain("recovery_card_v1");
  });

  it("projects Monthly with the card and without forwarding the stored envelope", async () => {
    const window = { id: "monthly:2026-11-01:2026-11-30:America/Los_Angeles", startDate: "2026-11-01", endDate: "2026-11-30", timeZone: TZ, closed: true, cutoff: "2026-12-01T07:59:59.999Z" };
    const monthly = { id: "monthly_briefing_owner_202611", userId: OWNER, cadence: "monthly", artifactType: "scheduled", evidenceWindow: window,
      generatedAt: "2026-12-01T11:00:00.000Z", briefing: { monthlyPresentation: { hero: { confidence: null } } } };
    const decision = composeRecoveryAssessmentForBriefingV1({
      authority: resolveRecoveryBriefingPublicationAuthorityV1(recoveryAuthorityRecord()), cadence: "monthly", window,
      artifactId: monthly.id, ownerUserId: OWNER, evaluatedAt: monthly.generatedAt,
      sleepInputs: { sleepDays: [...canonicalNights("2026-10-04", Array(28).fill(420)), ...canonicalNights("2026-11-01", Array(30).fill(420))],
        activationPolicyRecord: recoveryActivationRecord(), algorithmPolicyRecord: recoveryAlgorithmRecord() },
    });
    const withCard = attachRecoveryAssessmentV1(monthly, decision);
    const result = await createBriefingNavigationReadService({ store: nativeStore(withCard) }).getNativeArtifact({ artifactId: monthly.id });
    expect(result.recovery).toMatchObject({ cadence: "monthly", status: { state: "green" }, sleep: { trend: { granularity: "week" } } });
    expect(result.artifact.briefing).not.toHaveProperty(RECOVERY_ASSESSMENT_FIELD);
    const plain = await createBriefingNavigationReadService({ store: nativeStore(monthly) }).getNativeArtifact({ artifactId: monthly.id });
    expect(plain).not.toHaveProperty("recovery");
  });

  it("never serves Recovery for DEXA or Photo even if a stored row carried one", async () => {
    const envelope = weeklyEnvelope();
    const dexa = { id: "dexa-1", artifactType: "event", cadence: "event", briefing: { dexaEventNarrative: { snapshot: {} }, [RECOVERY_ASSESSMENT_FIELD]: envelope } };
    const photo = { id: "photo-1", artifactType: "event", cadence: "event", briefing: { photoEventNarrative: {}, [RECOVERY_ASSESSMENT_FIELD]: envelope } };
    for (const artifact of [dexa, photo]) {
      const result = await createBriefingNavigationReadService({ store: { ...nativeStore(artifact) } }).getNativeArtifact({ artifactId: artifact.id });
      expect(result).not.toHaveProperty("recovery");
      expect(JSON.stringify(result)).not.toContain("recoveryAssessment");
    }
  });
});

function weeklyDecision({ artifactId = "weekly_artifact" } = {}) {
  return composeRecoveryAssessmentForBriefingV1({
    authority: resolveRecoveryBriefingPublicationAuthorityV1(recoveryAuthorityRecord()), cadence: "weekly",
    window: createWeeklyEvidenceWindow({ now: WEEKLY_AT, timeZone: TZ }), artifactId, ownerUserId: OWNER,
    evaluatedAt: WEEKLY_AT.toISOString(),
    sleepInputs: { sleepDays: sleepFor(), activationPolicyRecord: recoveryActivationRecord(), algorithmPolicyRecord: recoveryAlgorithmRecord() },
  });
}

function weeklyEnvelope() {
  return weeklyDecision().recoveryAssessment;
}

function nativeWeekly(window) {
  return {
    id: "weekly_briefing_2026-10-18_2026-10-24", userId: OWNER, artifactType: "scheduled", cadence: "weekly", version: 3,
    generatedAt: WEEKLY_AT.toISOString(), evidenceCutoff: window.cutoff, evidenceWindow: window,
    goalContext: { goalId: "goal-build", phaseId: "phase-1" },
    briefing: { weeklyNarrative: {
      weekStart: window.startDate, weekEnd: window.endDate, goalConfidence: null,
      context: {
        activeGoalSummary: { id: "goal-build", title: "Build Lean Mass" },
        activePhase: { id: "phase-1", name: "Establish Maintenance", ageDays: 7 },
        pi: { observations: [], rankedClaims: { rankedCandidates: [] } },
      },
      cards: { snapshot: { facts: [] }, progress: { training: { completedDays: 0 }, weight: null, photo: null, dexa: null } },
    } },
  };
}
