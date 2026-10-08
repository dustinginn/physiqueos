import { describe, expect, it, vi } from "vitest";

// The provider cadence composition wires Recovery into NEW Weekly and Monthly
// generation only. Generators are captured (as in the sibling composition
// test); the Recovery reader and composer are REAL and run over a mocked pool,
// so the exact database reads are observable. Synthetic data only.

const captured = {};
vi.mock("../../domain/services/BriefingCadenceExecutorService", () => ({
  createBriefingCadenceExecutor: (options) => ({
    async execute() {
      captured.generators = options.generators;
      await options.settlementGate?.beginTick();
      return { ok: true };
    },
  }),
}));
vi.mock("../../domain/services/WeeklyNarrativeService", () => ({
  createWeeklyNarrativeService: (options) => { captured.weekly = options; return {}; },
}));
vi.mock("../../domain/services/MidweekBriefingService", () => ({
  createMidweekBriefingService: (options) => { captured.midweek = options; return {}; },
}));
vi.mock("../../domain/services/MonthlyBriefingService", () => ({
  createFounderMonthlyBriefingService: (options) => { captured.monthly = options; return {}; },
}));
vi.mock("../../domain/services/CanonicalBriefingConfidencePublicationService", () => ({
  createCanonicalBriefingConfidencePublicationService: () => ({}),
}));
vi.mock("../../domain/services/PICadenceBriefingLifecycleService", () => ({
  createPICadenceBriefingLifecycleService: () => ({}),
}));
vi.mock("../../platform/database/PostgresBriefingCadenceExecution", () => ({
  createPostgresBriefingCadenceExecutionLock: () => ({}),
  createPostgresBriefingCadenceExecutionStore: () => ({}),
}));

import { createProviderBriefingCadenceRunner } from "./providerBriefingCadenceComposition.js";
import { createWeeklyEvidenceWindow, createMonthlyEvidenceWindow } from "../../domain/services/BriefingEvidenceWindowService.js";
import { RECOVERY_ASSESSMENT_FIELD } from "../../domain/services/RecoveryBriefingPublicationV1.js";
import { RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID } from "../../platform/database/RecoverySleepInputReaderV1.js";
import { HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID, HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_RECORD_ID } from "../../domain/services/HealthKitSleepPolicies.js";
import { OWNER as SLEEP_OWNER, SLEEP_D0, canonicalNights, recoveryActivationRecord, recoveryAlgorithmRecord } from "../../testSupport/recoverySleepSynthetic.js";
import { recoveryAuthorityRecord } from "../../testSupport/recoveryBriefingSynthetic.js";

const OWNER = SLEEP_OWNER;
const TZ = "America/Los_Angeles";

async function compose({ authority = null, sleepDays = [] } = {}) {
  const queries = [];
  const pool = { query: vi.fn(async (text, values = []) => {
    queries.push({ collection: values[1], recordId: /record_id=\$3/.test(text) ? values[2] : null, range: /BETWEEN/.test(text) ? [values[2], values[3]] : null });
    if (/record_id=\$3/.test(text)) {
      if (values[2] === RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID) return { rows: authority ? [{ payload: authority, version: 1 }] : [] };
      if (values[2] === HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID) return { rows: [{ payload: recoveryActivationRecord(), version: 1 }] };
      if (values[2] === HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_RECORD_ID) return { rows: [{ payload: recoveryAlgorithmRecord(), version: 1 }] };
      return { rows: [] };
    }
    if (values[1] === "healthKitSleepDays" && /BETWEEN/.test(text)) {
      return { rows: sleepDays.filter((day) => day.sleepDay >= values[2] && day.sleepDay <= values[3]).map((payload) => ({ payload, version: 1 })) };
    }
    return { rows: [] };
  }) };
  const runner = createProviderBriefingCadenceRunner({
    pool, ownerUserId: OWNER,
    authorityStore: { read: async () => ({ state: {
      authority: "provider-authoritative", workerAuthority: "provider", publicRuntimeAuthority: "provider", canonicalStoreEpoch: "postgres-canonical",
      firstProviderCanonicalWriteAt: "2026-09-01T00:00:00.000Z", firstProviderCommandId: "cmd",
    } }) },
    loadCanonicalRuntime: async () => ({ user: { id: OWNER, timeZone: TZ }, canonicalEvidenceObjects: [] }),
    loadCanonicalCommitBindings: async () => ({ mutateCanonicalRuntime: async () => ({}) }),
  });
  await runner.execute({ asOf: new Date("2026-10-25T10:00:00.000Z") });
  queries.length = 0; // ignore the tick's own graduation reads
  return { queries };
}

function weeklyArtifact() {
  return { id: "weekly_briefing_2026-10-18_2026-10-24", userId: OWNER, cadence: "weekly", artifactType: "scheduled",
    generatedAt: "2026-10-25T10:00:00.000Z", evidenceWindow: createWeeklyEvidenceWindow({ now: new Date("2026-10-25T10:00:00.000Z"), timeZone: TZ }),
    briefing: { version: "weekly", weeklyNarrative: { summary: "unchanged" } } };
}

function monthlyArtifact() {
  return { id: "monthly_briefing_user_202611", userId: OWNER, cadence: "monthly", artifactType: "scheduled",
    generatedAt: "2026-12-01T11:00:00.000Z", evidenceWindow: createMonthlyEvidenceWindow({ now: new Date("2026-12-01T11:00:00.000Z"), timeZone: TZ }),
    briefing: { version: "monthly", monthlyPresentation: { hero: {} } } };
}

const weeklySleep = () => [...canonicalNights(SLEEP_D0, Array(16).fill(420)), ...canonicalNights("2026-10-18", Array(7).fill(420))];

describe("provider cadence composition: Recovery wiring (Weekly + Monthly only)", () => {
  it("passes one composer to Weekly and Monthly and none to Midweek", async () => {
    await compose();
    expect(typeof captured.weekly.recoveryComposer?.composeForNewArtifact).toBe("function");
    expect(captured.monthly.recoveryComposer).toBe(captured.weekly.recoveryComposer);
    expect(captured.midweek).not.toHaveProperty("recoveryComposer");
    expect(Object.keys(captured.midweek).some((key) => /recovery/i.test(key))).toBe(false);
  });

  it("with the authority ABSENT (production today): one authority lookup, ZERO Sleep reads, same artifact", async () => {
    const { queries } = await compose({ sleepDays: weeklySleep() });
    for (const artifact of [weeklyArtifact(), monthlyArtifact()]) {
      queries.length = 0;
      const result = await captured.weekly.recoveryComposer.composeForNewArtifact({ cadence: artifact.cadence, artifact });
      expect(result.artifact).toBe(artifact);
      expect(Object.prototype.hasOwnProperty.call(result.artifact.briefing, RECOVERY_ASSESSMENT_FIELD)).toBe(false);
      expect(result.decision.reason).toBe("publication_authority_disabled");
      expect(queries).toEqual([{ collection: "healthKitConfiguration", recordId: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID, range: null }]);
      expect(queries.some((query) => query.collection === "healthKitSleepDays")).toBe(false);
    }
  });

  it("never reads anything for Midweek or event artifacts", async () => {
    const { queries } = await compose({ authority: recoveryAuthorityRecord(), sleepDays: weeklySleep() });
    for (const cadence of ["midweek", "event", "daily"]) {
      const artifact = { ...weeklyArtifact(), cadence };
      const result = await captured.weekly.recoveryComposer.composeForNewArtifact({ cadence, artifact });
      expect(result.artifact).toBe(artifact);
    }
    expect(queries).toEqual([]);
  });

  it("with a synthetic authority, publishes for the eligible NEW Weekly from a bounded ordinary Sleep read", async () => {
    const { queries } = await compose({ authority: recoveryAuthorityRecord(), sleepDays: weeklySleep() });
    const result = await captured.weekly.recoveryComposer.composeForNewArtifact({ cadence: "weekly", artifact: weeklyArtifact() });
    const envelope = result.artifact.briefing[RECOVERY_ASSESSMENT_FIELD];
    expect(envelope.cadence).toBe("weekly");
    expect(envelope.eligibility).toMatchObject({ baselineReliableNights: 16, periodReliableNights: 7, periodRequiredNights: 5 });
    expect(envelope.assessment.status.state).toBe("green");
    const sleepReads = queries.filter((query) => query.collection === "healthKitSleepDays");
    expect(sleepReads).toEqual([{ collection: "healthKitSleepDays", recordId: null, range: ["2026-09-20", "2026-10-24"] }]);
    expect(queries.some((query) => /Historical/i.test(String(query.collection)))).toBe(false);
    expect(result.artifact.briefing.weeklyNarrative).toEqual({ summary: "unchanged" });
  });

  it("publishes NOTHING before 14 reliable nights, and Monthly needs its own coverage", async () => {
    await compose({ authority: recoveryAuthorityRecord(), sleepDays: weeklySleep().filter((day) => day.sleepDay > "2026-10-04") });
    const early = await captured.weekly.recoveryComposer.composeForNewArtifact({ cadence: "weekly", artifact: weeklyArtifact() });
    expect(early.decision.reason).toBe("baseline_not_yet_eligible");
    expect(Object.prototype.hasOwnProperty.call(early.artifact.briefing, RECOVERY_ASSESSMENT_FIELD)).toBe(false);
    const novemberSleep = [...canonicalNights("2026-10-04", Array(28).fill(420)), ...canonicalNights("2026-11-01", Array.from({ length: 30 }, (_, index) => index < 19 ? 420 : null))];
    await compose({ authority: recoveryAuthorityRecord(), sleepDays: novemberSleep });
    const monthly = await captured.monthly.recoveryComposer.composeForNewArtifact({ cadence: "monthly", artifact: monthlyArtifact() });
    expect(monthly.artifact.briefing[RECOVERY_ASSESSMENT_FIELD].assessment.status.state).toBe("unavailable");
    expect(monthly.artifact.briefing[RECOVERY_ASSESSMENT_FIELD].eligibility).toMatchObject({ periodReliableNights: 19, periodRequiredNights: 20 });
  });

  it("fails closed to the unchanged artifact when the database read throws", async () => {
    await compose({ authority: recoveryAuthorityRecord() });
    const artifact = weeklyArtifact();
    // The reader throws on an out-of-range read; the composer must swallow it.
    const result = await captured.weekly.recoveryComposer.composeForNewArtifact({ cadence: "weekly", artifact: { ...artifact, evidenceWindow: { ...artifact.evidenceWindow, startDate: "2026-01-04", endDate: "2026-10-24" } } });
    expect(Object.prototype.hasOwnProperty.call(result.artifact.briefing, RECOVERY_ASSESSMENT_FIELD)).toBe(false);
    expect(result.decision.attach).toBe(false);
  });
});
