import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  resolveRecoveryShadowInputAuthorityV1,
  runRecoveryBriefingShadowV1,
} from "./RecoveryBriefingShadowServiceV1.js";
import {
  RECOVERY_SHADOW_INPUT_AUTHORITY_VERSION,
  RecoveryShadowInputMode,
} from "./RecoveryBriefingPolicyV1.js";
import {
  OWNER,
  SLEEP_D0,
  canonicalNights,
  recoveryActivationRecord,
  recoveryAlgorithmRecord,
} from "../../testSupport/recoverySleepSynthetic.js";

const DAY_MS = 86_400_000;
const ELIGIBLE_WEEKLY = Object.freeze({ cadence: "weekly", startDate: "2026-10-18", endDate: "2026-10-24", timeZone: "America/Los_Angeles" });
const ELIGIBLE_CUTOFF = "2026-10-25T06:59:59.999Z";

function prospectiveAuthority() {
  return {
    ...syntheticAuthority(),
    mode: RecoveryShadowInputMode.PROSPECTIVE_VALIDATION_ONLY,
    effectiveSleepDay: SLEEP_D0,
  };
}

function prospectiveAssessmentInput({ period = null, cutoff = "2026-10-11T06:59:59.999Z" } = {}) {
  const resolved = period ?? { cadence: "weekly", startDate: "2026-10-04", endDate: "2026-10-10", timeZone: "America/Los_Angeles" };
  return {
    period: resolved,
    evidenceCutoff: cutoff,
    evaluatedAt: "2026-10-26T12:00:00.000Z",
    ownerUserId: OWNER,
    // Canonical rows from Sep 6 on: those before D0 are pre-policy-era rows.
    sleepDays: canonicalNights("2026-09-06", Array(49).fill(420)),
    activationPolicyRecord: recoveryActivationRecord(),
    algorithmPolicyRecord: recoveryAlgorithmRecord(),
    foamRolling: null,
    training: null,
  };
}

describe("RecoveryBriefingShadowServiceV1 isolation", () => {
  it("fails closed when explicit non-strategic input authority is absent", () => {
    const result = runRecoveryBriefingShadowV1({ assessmentInput: {} });
    expect(result).toMatchObject({
      shadow: true,
      status: "shadow_blocked",
      reason: "recovery_shadow_input_authority_absent",
      assessment: null,
    });
    expect(result.isolation).toEqual(isolationLedger());
  });

  it("rejects any authority that permits persistence, publication, clients or strategic use", () => {
    for (const change of [
      { persistence: "store" },
      { briefingPublication: true },
      { clientReadPath: true },
      { strategicEvidenceEligibility: "eligible" },
      { historicalBackfill: true },
    ]) {
      expect(resolveRecoveryShadowInputAuthorityV1({ ...syntheticAuthority(), ...change }))
        .toMatchObject({ enabled: false, invalidReason: "recovery_shadow_isolation_contract_invalid" });
    }
  });

  it("categorically rejects historical Sleep in every shadow mode", () => {
    const input = syntheticAssessmentInput();
    input.sleepRecords[0].ingestionPurpose = "historical_evidence_import";
    const result = runRecoveryBriefingShadowV1({
      inputAuthority: syntheticAuthority(),
      assessmentInput: input,
    });
    expect(result.status).toBe("shadow_blocked");
    expect(result.reason).toBe("historical_sleep_categorically_forbidden");
    expect(result.assessment).toBeNull();
  });

  it("rejects conflicting provenance labels instead of accepting a safe-looking alias", () => {
    const input = syntheticAssessmentInput();
    input.sleepRecords[0].origin = "historical_evidence_import";
    const result = runRecoveryBriefingShadowV1({
      inputAuthority: syntheticAuthority(),
      assessmentInput: input,
    });
    expect(result).toMatchObject({
      status: "shadow_blocked",
      reason: "historical_sleep_categorically_forbidden",
      assessment: null,
    });
    const nested = syntheticAssessmentInput();
    nested.sleepRecords[0].provenance = {
      ingestionPurpose: "historical_evidence_import",
    };
    expect(runRecoveryBriefingShadowV1({
      inputAuthority: syntheticAuthority(),
      assessmentInput: nested,
    })).toMatchObject({
      status: "shadow_blocked",
      reason: "historical_sleep_categorically_forbidden",
      assessment: null,
    });
  });

  it("evaluates synthetic shadow fixtures without any mutation or persistence seam", () => {
    const input = syntheticAssessmentInput();
    const before = structuredClone(input);
    const result = runRecoveryBriefingShadowV1({
      inputAuthority: syntheticAuthority(),
      assessmentInput: input,
    });
    expect(result.status).toBe("shadow_evaluated");
    expect(result.assessment.status.state).toBe("green");
    expect(result.assessment.policy.confidenceCoupling).toBe("none");
    expect(result.isolation).toEqual(isolationLedger());
    expect(result.provenance).toMatchObject({
      repositoryReads: 0,
      persistenceWrites: 0,
      runtimeClockReads: 0,
      historicalSleepRecords: 0,
    });
    expect(input).toEqual(before);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("allows prospective validation-only input only at or after its explicit floor", () => {
    // Weekly Oct 4-10: its baseline (Sep 6-Oct 3) holds only two nights on or
    // after D0 Oct 2, however many canonical rows exist before it.
    const result = runRecoveryBriefingShadowV1({
      inputAuthority: prospectiveAuthority(),
      assessmentInput: prospectiveAssessmentInput(),
    });
    expect(result.status).toBe("shadow_evaluated");
    expect(result.assessment.status.state).toBe("unavailable");
    expect(result.assessment.status.reasonCodes).toContain("insufficient_baseline_nights");
    expect(result.assessment.sleep.baseline.usableNights).toBe(2);
    expect(result.eligibility.accounting.baseline).toMatchObject({
      expectedNights: 28, reliableNights: 2, beforeProspectiveFloorNights: 26,
    });
    expect(result.authority).toMatchObject({
      mode: "prospective_validation_only",
      strategicEvidenceEligibility: "excluded",
    });
  });

  it("evaluates an eligible prospective Weekly from canonical sleep-canon-v3 days", () => {
    const result = runRecoveryBriefingShadowV1({
      inputAuthority: prospectiveAuthority(),
      assessmentInput: prospectiveAssessmentInput({ period: ELIGIBLE_WEEKLY, cutoff: ELIGIBLE_CUTOFF }),
    });
    expect(result.status).toBe("shadow_evaluated");
    expect(result.assessment).toMatchObject({ mode: "shadow", shadow: true });
    expect(result.assessment.status.state).toBe("green");
    expect(result.eligibility.accounting.baseline.reliableNights).toBe(16);
    expect(result.isolation).toEqual(isolationLedger());
  });

  it("fails closed when prospective validation-only Sleep lacks trusted availability", () => {
    const input = prospectiveAssessmentInput({ period: ELIGIBLE_WEEKLY, cutoff: ELIGIBLE_CUTOFF });
    input.sleepDays = input.sleepDays.map((day) => ({ ...day, computedAt: undefined }));
    const result = runRecoveryBriefingShadowV1({ inputAuthority: prospectiveAuthority(), assessmentInput: input });
    expect(result.status).toBe("shadow_evaluated");
    expect(result.assessment.status.state).toBe("unavailable");
    expect(result.eligibility.accounting.period.withheldByReason).toEqual({ availability_unknown: 7 });
  });

  it("never mixes fixture rows with canonical days or historical Sleep", () => {
    const fixtureInProspective = runRecoveryBriefingShadowV1({
      inputAuthority: prospectiveAuthority(),
      assessmentInput: { ...prospectiveAssessmentInput(), sleepRecords: [] },
    });
    expect(fixtureInProspective.reason).toBe("validation_only_requires_canonical_sleep_days");
    const canonicalInSynthetic = runRecoveryBriefingShadowV1({
      inputAuthority: syntheticAuthority(),
      assessmentInput: { ...syntheticAssessmentInput(), sleepDays: [] },
    });
    expect(canonicalInSynthetic.reason).toBe("synthetic_mode_refuses_canonical_sleep_days");
    const input = prospectiveAssessmentInput();
    input.sleepDays[0] = { ...input.sleepDays[0], ingestionPurpose: "historical_evidence_import" };
    expect(runRecoveryBriefingShadowV1({ inputAuthority: prospectiveAuthority(), assessmentInput: input }))
      .toMatchObject({ status: "shadow_blocked", reason: "historical_sleep_categorically_forbidden", assessment: null });
  });

  it("rejects impossible calendar dates in prospective authority", () => {
    expect(resolveRecoveryShadowInputAuthorityV1({
      ...syntheticAuthority(),
      mode: RecoveryShadowInputMode.PROSPECTIVE_VALIDATION_ONLY,
      effectiveSleepDay: "2026-02-31",
    })).toMatchObject({
      enabled: false,
      invalidReason: "recovery_shadow_effective_sleep_day_invalid",
    });
  });

  it("rejects mixed or operational Sleep purpose rather than silently broadening authority", () => {
    const input = syntheticAssessmentInput();
    input.sleepRecords[3].ingestionPurpose = "operational";
    const result = runRecoveryBriefingShadowV1({
      inputAuthority: syntheticAuthority(),
      assessmentInput: input,
    });
    expect(result).toMatchObject({
      status: "shadow_blocked",
      reason: "sleep_purpose_not_authorized_for_shadow",
    });
  });

  it("has no imports from Briefing publication, V3, Confidence, Narrative or recommendation code", () => {
    const source = fs.readFileSync(new URL("./RecoveryBriefingShadowServiceV1.js", import.meta.url), "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    expect(imports).toEqual([
      "./RecoveryBriefingAssessmentServiceV1.js",
      "./RecoveryBriefingPolicyV1.js",
      "./RecoveryBriefingSleepInputProjectionV1.js",
    ]);
    expect(source).not.toMatch(/Repository|publicationService|artifactService|store\.|\.publish\(|\.save\(|\.create\(/);
  });

  it("is unreachable from every existing Server composition and application path", () => {
    const sourceRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../.."
    );
    const references = walkJavaScript(sourceRoot)
      .filter((file) => !file.endsWith("RecoveryBriefingShadowServiceV1.js"))
      .filter((file) => !file.endsWith("RecoveryBriefingShadowServiceV1.test.js"))
      .filter((file) => fs.readFileSync(file, "utf8").includes("RecoveryBriefingShadowServiceV1"));
    expect(references).toEqual([]);
  });
});

function syntheticAuthority() {
  return {
    schemaVersion: RECOVERY_SHADOW_INPUT_AUTHORITY_VERSION,
    status: "enabled",
    mode: RecoveryShadowInputMode.SYNTHETIC,
    historicalBackfill: false,
    strategicEvidenceEligibility: "excluded",
    briefingPublication: false,
    clientReadPath: false,
    persistence: "none",
  };
}

function syntheticAssessmentInput() {
  const baselineStart = "2026-09-06";
  const periodStart = "2026-10-04";
  const days = [
    ...Array.from({ length: 28 }, (_, index) => shift(baselineStart, index)),
    ...Array.from({ length: 7 }, (_, index) => shift(periodStart, index)),
  ];
  return {
    period: {
      cadence: "weekly",
      startDate: periodStart,
      endDate: "2026-10-10",
      timeZone: "America/Los_Angeles",
    },
    evidenceCutoff: "2026-10-10T23:59:59.000Z",
    evaluatedAt: "2026-10-12T12:00:00.000Z",
    sleepRecords: days.map((sleepDay, index) => ({
      id: `synthetic-${index}`,
      sleepDay,
      status: "asleep_recorded",
      ingestionPurpose: "synthetic_shadow_fixture",
      mainSleep: { asleepSeconds: 420 * 60 },
      mainEpisodeIndex: 0,
      episodes: [{ kind: "main", timeZone: "America/Los_Angeles", timeZoneSource: "sample_metadata" }],
      availableAt: `${sleepDay}T16:00:00.000Z`,
    })),
    foamRolling: null,
    training: null,
  };
}

function isolationLedger() {
  return {
    strategic: false,
    userFacing: false,
    briefingArtifactMutation: false,
    v3ObservationMutation: false,
    confidenceMutation: false,
    narrativeMutation: false,
    recommendationMutation: false,
    evidenceEligibilityMutation: false,
    settlementReadinessMutation: false,
    historicalMutation: false,
    clientReadPath: false,
    persistence: "none",
    independentlyReversible: true,
  };
}

function shift(value, amount) {
  return new Date(Date.parse(`${value}T12:00:00Z`) + amount * DAY_MS)
    .toISOString().slice(0, 10);
}

function walkJavaScript(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkJavaScript(target);
    return entry.isFile() && entry.name.endsWith(".js") ? [target] : [];
  });
}
