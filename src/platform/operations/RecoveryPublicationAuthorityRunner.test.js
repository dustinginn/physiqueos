import { describe, expect, it } from "vitest";
import {
  RECOVERY_PUBLICATION_AUTHORITY_PROPOSAL_V1,
  RecoveryAuthorityAction,
  runRecoveryPublicationAuthority,
} from "./RecoveryPublicationAuthorityRunner.js";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import {
  RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_COLLECTION,
  RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID,
  createRecoverySleepInputReaderV1,
} from "../database/RecoverySleepInputReaderV1.js";
import {
  preflightRecoveryPublicationV1,
  resolveRecoveryBriefingPublicationAuthorityV1,
} from "../../domain/services/RecoveryBriefingPublicationV1.js";
import { createRecoveryBriefingComposerV1 } from "../../domain/services/RecoveryBriefingComposerV1.js";
import { RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_VERSION } from "../../domain/services/RecoveryBriefingPolicyV1.js";
import { OWNER, recoveryActivationRecord, recoveryAlgorithmRecord } from "../../testSupport/recoverySleepSynthetic.js";
import { recoveryAuthorityRecord } from "../../testSupport/recoveryBriefingSynthetic.js";

const SHA = "85a9802587de0ef23ff2021e803258dea825254d";
const NOW = new Date("2026-10-18T03:00:00.000Z"); // Sat Oct 17 20:00 PDT, after the checkpoint
const REF = "founder-chat-2026-10-17-recovery-v1-activation";

function weeklyBriefing(startDate, extra = {}) {
  return { id: `weekly-${startDate}`, cadence: "weekly", artifactType: "scheduled", version: 1,
    evidenceWindow: { startDate, endDate: shift(startDate, 6) }, briefing: {}, ...extra };
}
function shift(value, amount) {
  return new Date(Date.parse(`${value}T12:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10);
}

function setup({ authority = null, briefings = [weeklyBriefing("2026-10-04"), weeklyBriefing("2026-10-11")],
  activation = recoveryActivationRecord(), algorithm = recoveryAlgorithmRecord(), extraCensus = [] } = {}) {
  const configuration = [
    { ...activation, id: "healthkit_sleep_canonical_activation_policy" },
    { ...algorithm, id: "healthkit_sleep_canonical_algorithm_policy" },
    ...(authority ? [{ ...authority, id: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID }] : []),
  ];
  const store = createInMemoryCanonicalRecordStore({ healthKitConfiguration: configuration, dailyBriefings: briefings });
  const writes = [];
  const records = {
    get: store.get, list: store.list,
    putIfAbsent: async (input) => { writes.push({ op: "putIfAbsent", ...input }); return store.putIfAbsent(input); },
    put: async (input) => { writes.push({ op: "put", ...input }); return store.put(input); },
  };
  const censusAuthorityRows = async () => [
    ...((await store.get({ collection: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_COLLECTION, recordId: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID }))
      ? [{ table: "canonical_training_records", collection: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_COLLECTION, recordId: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID }] : []),
    ...extraCensus,
  ];
  const run = (action, options = {}) => runRecoveryPublicationAuthority({
    records, censusAuthorityRows, runtimeSha: SHA, now: () => NOW, action,
    authorization: { ownerUserId: OWNER, authorizationReference: options.reference ?? REF },
    ...options,
  });
  return { store, records, writes, run };
}

describe("Recovery publication authority runner — preview", () => {
  it("previews exactly the proposed record, which the deployed resolver accepts unchanged", async () => {
    const { run, writes } = setup();
    const result = await run(RecoveryAuthorityAction.PREVIEW);
    expect(result.outcome).toBe("preview");
    expect(writes).toEqual([]);
    expect(result.plan.record).toMatchObject({
      schemaVersion: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_VERSION, status: "enabled", cadences: ["weekly", "monthly"],
      effectiveFromPeriodStart: "2026-10-18", recoveryEffectiveSleepDay: "2026-10-02", strategicEvidenceEligibility: "excluded",
      historicalBackfill: false, artifactRewrite: false, publishBeforeBaselineEligible: false, authorizationRef: REF,
    });
    expect(result.plan.resolvesTo).toEqual(resolveRecoveryBriefingPublicationAuthorityV1(result.plan.record));
    expect(result.plan.resolvesTo.enabled).toBe(true);
    expect(result.plan.firstCoveredPeriods).toEqual({
      weekly: { startDate: "2026-10-18", endDate: "2026-10-24" },
      monthly: { startDate: "2026-11-01", endDate: "2026-11-30" },
    });
    expect(result.seal).toMatch(/^seal_[0-9a-f]{32}$/);
    expect(result.predictedMutations).toEqual([{ collection: "healthKitConfiguration", recordId: "recovery_briefing_publication_authority", operation: "create" }]);
  });

  it("is deterministic: the same facts give the same seal", async () => {
    const { run } = setup();
    expect((await run("preview")).seal).toBe((await run("preview")).seal);
  });

  it.each([
    ["cadences_invalid", { cadences: ["weekly", "midweek"] }],
    ["cadences_invalid", { cadences: ["dexa"] }],
    ["cadences_invalid", { cadences: [] }],
    ["cadences_invalid", { cadences: ["weekly", "weekly"] }],
    ["dates_invalid", { effectiveFromPeriodStart: "2026-10-32" }],
    ["dates_invalid", { recoveryEffectiveSleepDay: "Oct 2" }],
    ["recovery_effective_sleep_day_before_sleep_floor", { recoveryEffectiveSleepDay: "2026-10-01" }],
    ["effective_period_start_not_a_period_boundary", { effectiveFromPeriodStart: "2026-10-19" }],
    ["effective_period_start_not_a_period_boundary", { cadences: ["monthly"], effectiveFromPeriodStart: "2026-10-18" }],
    ["effective_period_not_after_sleep_floor", { effectiveFromPeriodStart: "2026-09-27" }],
    ["effective_period_already_published", { effectiveFromPeriodStart: "2026-10-11" }],
  ])("refuses %s without writing", async (reason, override) => {
    const { run, writes } = setup();
    const result = await run("preview", { desired: { ...RECOVERY_PUBLICATION_AUTHORITY_PROPOSAL_V1, ...override } });
    expect(result.outcome).toBe("refused");
    expect(result.reasons).toContain(reason);
    expect(writes).toEqual([]);
  });

  it("refuses a first covered period that has already closed (no historical reach)", async () => {
    const { run } = setup({ briefings: [] });
    const late = await run("preview", { now: () => new Date("2026-10-26T12:00:00.000Z") });
    expect(late.reasons).toContain("first_covered_period_already_closed");
  });

  it("refuses an existing, duplicate or misplaced authority (create-only)", async () => {
    expect((await setup({ authority: recoveryAuthorityRecord() }).run("preview")).reasons).toContain("authority_already_present");
    expect((await setup({ authority: recoveryAuthorityRecord({ status: "disabled" }) }).run("preview")).reasons).toContain("authority_already_present");
    const misplaced = await setup({ extraCensus: [{ table: "canonical_briefing_records", collection: "dailyBriefings", recordId: "recovery_briefing_publication_authority" }] }).run("preview");
    expect(misplaced.reasons).toContain("unexpected_authority_rows");
  });

  it("refuses when the Sleep inputs Recovery depends on are not live and prospective", async () => {
    expect((await setup({ activation: recoveryActivationRecord({ status: "disabled" }) }).run("preview")).reasons)
      .toContain("sleep_activation_not_prospective_validation_only");
    expect((await setup({ algorithm: recoveryAlgorithmRecord({ algorithmVersion: "sleep-canon-v2" }) }).run("preview")).reasons)
      .toContain("sleep_canon_v3_not_enabled");
  });

  it("refuses a missing or unsafe authorization reference", async () => {
    expect((await setup().run("preview", { reference: "" })).reasons).toContain("authorization_ref_invalid");
    expect((await setup().run("preview", { reference: "x y; drop" })).reasons).toContain("authorization_ref_invalid");
  });

  it("fails closed on a missing owner, runtime SHA or census", async () => {
    const { records } = setup();
    await expect(runRecoveryPublicationAuthority({ records, censusAuthorityRows: async () => [], runtimeSha: SHA, authorization: {} }))
      .rejects.toMatchObject({ code: "OWNER_REQUIRED" });
    await expect(runRecoveryPublicationAuthority({ records, censusAuthorityRows: async () => [], runtimeSha: "abc", authorization: { ownerUserId: OWNER } }))
      .rejects.toMatchObject({ code: "RUNTIME_SHA_REQUIRED" });
    await expect(runRecoveryPublicationAuthority({ records, runtimeSha: SHA, authorization: { ownerUserId: OWNER } }))
      .rejects.toMatchObject({ code: "AUTHORITY_CENSUS_REQUIRED" });
  });
});

describe("Recovery publication authority runner — apply", () => {
  it("creates exactly one record that the deployed reader and composer then honour", async () => {
    const { run, writes, store } = setup();
    const preview = await run("preview");
    const applied = await run("apply", { expectedSeal: preview.seal });
    expect(applied.outcome).toBe("applied");
    expect(applied.writes).toBe(1);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ op: "putIfAbsent", collection: "healthKitConfiguration", recordId: "recovery_briefing_publication_authority" });
    // Production parity: the composer's own reader and resolver see it enabled.
    const reader = createRecoverySleepInputReaderV1({ records: store, ownerUserId: OWNER });
    const resolved = resolveRecoveryBriefingPublicationAuthorityV1(await reader.readAuthorityRecord());
    expect(resolved).toMatchObject({ enabled: true, cadences: ["weekly", "monthly"], effectiveFromPeriodStart: "2026-10-18", authorizationRef: REF });
    // The first covered Weekly proceeds; the one before it does not; Midweek never does.
    const window = (startDate) => ({ startDate, endDate: shift(startDate, 6), closed: true, timeZone: "America/Los_Angeles" });
    expect(preflightRecoveryPublicationV1({ authority: resolved, cadence: "weekly", window: window("2026-10-18") }).proceed).toBe(true);
    expect(preflightRecoveryPublicationV1({ authority: resolved, cadence: "weekly", window: window("2026-10-11") }).reason)
      .toBe("period_before_publication_effective");
    expect(preflightRecoveryPublicationV1({ authority: resolved, cadence: "midweek", window: window("2026-10-18") }).reason)
      .toBe("cadence_excluded");
    expect(applied.facts.briefings.withRecoveryAssessment).toBe(0);
  });

  it("refuses a stale or missing seal and writes nothing", async () => {
    const { run, writes } = setup();
    expect((await run("apply", { expectedSeal: null })).outcome).toBe("drifted");
    expect((await run("apply", { expectedSeal: "seal_00000000000000000000000000000000" })).reasons).toEqual(["stale_or_missing_seal"]);
    expect(writes).toEqual([]);
  });

  it("refuses when production drifted between preview and apply (seal covers the facts)", async () => {
    const first = setup();
    const preview = await first.run("preview");
    const drifted = setup({ briefings: [weeklyBriefing("2026-10-04"), weeklyBriefing("2026-10-11"), weeklyBriefing("2026-09-27")] });
    expect((await drifted.run("apply", { expectedSeal: preview.seal })).outcome).toBe("drifted");
    expect(drifted.writes).toEqual([]);
    const otherSha = await runRecoveryPublicationAuthority({ ...{ records: first.records }, censusAuthorityRows: async () => [],
      runtimeSha: "0".repeat(40), now: () => NOW, action: "apply", expectedSeal: preview.seal,
      authorization: { ownerUserId: OWNER, authorizationReference: REF } });
    expect(otherSha.outcome).toBe("drifted");
  });

  it("refuses an authorization reference that differs from the sealed record's", async () => {
    const { run } = setup();
    const preview = await run("preview");
    const other = setup();
    // Same facts, different reference: the seal itself differs, so it is drifted, never applied.
    expect((await other.run("apply", { expectedSeal: preview.seal, reference: "founder-chat-other-ref" })).outcome).toBe("drifted");
    expect(other.writes).toEqual([]);
  });

  it("is idempotent: a repeated apply is refused and never writes a second record", async () => {
    const { run, writes } = setup();
    const preview = await run("preview");
    await run("apply", { expectedSeal: preview.seal });
    const again = await run("apply", { expectedSeal: preview.seal });
    expect(again.outcome).toBe("refused");
    expect(again.reasons).toContain("authority_already_present");
    expect(writes).toHaveLength(1);
  });

  it("throws (so the entry rolls back) when the authority appears concurrently", async () => {
    const { run, records } = setup();
    const preview = await run("preview");
    records.putIfAbsent = async () => ({ created: false, record: recoveryAuthorityRecord() });
    await expect(run("apply", { expectedSeal: preview.seal })).rejects.toMatchObject({ code: "AUTHORITY_CREATE_CONFLICT" });
  });

  it("throws when the stored record does not verify (e.g. a store that drops a field)", async () => {
    const { run, records, store } = setup();
    const preview = await run("preview");
    records.putIfAbsent = async (input) => store.putIfAbsent({ ...input, payload: { ...input.payload, historicalBackfill: true } });
    await expect(run("apply", { expectedSeal: preview.seal })).rejects.toMatchObject({ code: "POST_WRITE_VERIFICATION_FAILED" });
  });
});

describe("Recovery publication authority runner — postverify and disable", () => {
  async function applied() {
    const context = setup();
    const preview = await context.run("preview");
    await context.run("apply", { expectedSeal: preview.seal });
    return { ...context, preview };
  }

  it("postverify confirms exactly the sealed record and refuses anything else", async () => {
    const { run, preview } = await applied();
    expect((await run("postverify", { expectedRecordDigest: preview.plan.recordDigest })).outcome).toBe("verified");
    const wrong = await run("postverify", { expectedRecordDigest: "0".repeat(32) });
    expect(wrong.outcome).toBe("verification_failed");
    expect(wrong.failures).toContain("authority_record_differs_from_sealed_plan");
    expect((await setup().run("postverify", { expectedRecordDigest: preview.plan.recordDigest })).failures).toContain("authority_absent");
  });

  it("disable is a sealed, prospective rollback: the deployed resolver turns Recovery OFF", async () => {
    const { run, writes, store } = await applied();
    const plan = await run("disable-preview", { reference: "founder-chat-2026-10-26-recovery-disable" });
    expect(plan.outcome).toBe("disable_preview");
    expect(plan.plan.resolvesTo).toMatchObject({ enabled: false, invalidReason: "recovery_publication_authority_disabled" });
    expect(writes).toHaveLength(1);
    const done = await run("disable", { reference: "founder-chat-2026-10-26-recovery-disable", expectedSeal: plan.seal });
    expect(done.outcome).toBe("disabled");
    expect(writes).toHaveLength(2);
    expect(writes[1]).toMatchObject({ op: "put", expectedVersion: 1 });
    const stored = await store.get({ collection: "healthKitConfiguration", recordId: "recovery_briefing_publication_authority" });
    expect(resolveRecoveryBriefingPublicationAuthorityV1(stored).enabled).toBe(false);
    // Disabled is OFF for the composer: one authority lookup, no Sleep read, artifact unchanged.
    let sleepReads = 0;
    const composer = createRecoveryBriefingComposerV1({ readAuthorityRecord: async () => stored, readSleepInputs: async () => { sleepReads += 1; return {}; } });
    const artifact = { id: "w", cadence: "weekly", artifactType: "scheduled", evidenceWindow: { startDate: "2026-11-01", endDate: "2026-11-07", closed: true }, briefing: {} };
    const out = await composer.composeForNewArtifact({ cadence: "weekly", artifact });
    expect(out.artifact).toBe(artifact);
    expect(sleepReads).toBe(0);
    // A second disable is refused.
    expect((await run("disable-preview", { reference: "founder-chat-2026-10-26-recovery-disable" })).reasons).toContain("authority_not_enabled");
  });

  it("disable refuses a stale seal and an absent authority", async () => {
    const { run, writes } = await applied();
    expect((await run("disable", { reference: "founder-chat-x-disable", expectedSeal: "seal_00000000000000000000000000000000" })).outcome).toBe("drifted");
    expect(writes).toHaveLength(1);
    expect((await setup().run("disable-preview", { reference: "founder-chat-x-disable" })).reasons).toContain("authority_absent");
  });
});
