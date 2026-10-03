import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDexaSemanticFingerprint } from "./CanonicalDexaScanService.js";
import {
  DEXA_HEALTHKIT_WRITEBACK_EFFECTIVE_DATE,
  DEXA_HEALTHKIT_WRITEBACK_POLICY_SCHEMA_VERSION,
  DEXA_HEALTHKIT_VALIDATION_EXPECTED_FINGERPRINT,
  intentIdentity,
  mergeDexaHealthKitWritebackReceipt,
  normalizeDexaHealthKitWritebackReceipt,
  projectDexaHealthKitWriteback,
} from "./DexaHealthKitWritebackService.js";

const owner = "user_founder_001";

describe("DEXA HealthKit writeback projection", () => {
  it("fails closed while permanent policy is absent and never backfills", () => {
    const result = projectDexaHealthKitWriteback({
      canonicalEvidenceObjects: [scan("2026-10-10")], ownerUserId: owner,
    });
    expect(result.policy.enabled).toBe(false);
    expect(result.intents).toEqual([]);
  });

  it("projects only BF% and fat-free mass for prospective canonical scans", () => {
    const result = projectDexaHealthKitWriteback({
      canonicalEvidenceObjects: [scan("2026-10-08"), scan("2026-10-09", 2)],
      ownerUserId: owner,
      policyRecord: enabledPolicy(),
    });
    expect(result.intents).toHaveLength(2);
    expect(result.intents.map((value) => value.measurementKind).sort()).toEqual([
      "bodyFatPercentage", "leanBodyMassFatFree",
    ]);
    expect(result.intents.find((value) => value.measurementKind === "leanBodyMassFatFree")).toMatchObject({
      value: 160.5,
      unit: "lb",
      derivation: "fat_free_mass_total_minus_fat",
      occurrenceDate: "2026-10-09",
      timePrecision: "date",
    });
    expect(JSON.stringify(result)).not.toContain("leanSoft");
    expect(JSON.stringify(result)).not.toContain("bodyMass");
    expect(JSON.stringify(result)).not.toContain("boneMineral");
  });

  it("prepares the exact bounded Sep 12 write and delete validation without enabling permanent policy", () => {
    const canonicalEvidenceObjects = [realValidationScan()];
    const write = projectDexaHealthKitWriteback({ canonicalEvidenceObjects, ownerUserId: owner, mode: "validation", validationAction: "write" });
    const remove = projectDexaHealthKitWriteback({ canonicalEvidenceObjects, ownerUserId: owner, mode: "validation", validationAction: "delete" });
    expect(write.policy.enabled).toBe(false);
    expect(write.intents).toHaveLength(2);
    expect(write.intents.every((intent) => intent.desiredState === "present" && intent.timePrecision === "date")).toBe(true);
    expect(remove.intents).toHaveLength(2);
    expect(remove.intents.every((intent) => intent.desiredState === "withdrawn" && intent.value == null)).toBe(true);
    expect(new Set(write.intents.map((intent) => intent.syncIdentifier)).size).toBe(2);
  });

  it("emits a withdrawal for a previously written scan that is no longer canonical", () => {
    const logicalScanKey = `dexa_scan|${owner}|2026-10-09`;
    const receipt = normalizeDexaHealthKitWritebackReceipt({
      intentIdentity: intentIdentity(logicalScanKey, "bodyFatPercentage"),
      logicalScanKey,
      canonicalRevision: 1,
      measurementKind: "bodyFatPercentage",
      desiredState: "present",
      syncIdentifier: projectDexaHealthKitWriteback({
        canonicalEvidenceObjects: [scan("2026-10-09")], ownerUserId: owner, policyRecord: enabledPolicy(),
      }).intents[0].syncIdentifier,
      outcome: "saved",
    }, { ownerUserId: owner });
    const result = projectDexaHealthKitWriteback({
      ownerUserId: owner, policyRecord: enabledPolicy(),
      receipts: [mergeDexaHealthKitWritebackReceipt(null, receipt)],
    });
    expect(result.intents).toEqual([expect.objectContaining({ desiredState: "withdrawn", measurementKind: "bodyFatPercentage" })]);
  });

  it("keeps retrying a withdrawal until a terminal deleted receipt is recorded", () => {
    const logicalScanKey = `dexa_scan|${owner}|2026-10-09`;
    const projected = projectDexaHealthKitWriteback({
      canonicalEvidenceObjects: [scan("2026-10-09")], ownerUserId: owner, policyRecord: enabledPolicy(),
    }).intents[0];
    const saved = receipt({
      logicalScanKey, syncIdentifier: projected.syncIdentifier,
      desiredState: "present", outcome: "saved",
    });
    const failedDelete = receipt({
      logicalScanKey, syncIdentifier: projected.syncIdentifier,
      desiredState: "withdrawn", outcome: "permission_needed",
    });
    const pending = mergeDexaHealthKitWritebackReceipt(saved, failedDelete);
    expect(pending).toMatchObject({
      desiredState: "withdrawn", outcome: "permission_needed", materializedState: "present",
    });
    expect(projectDexaHealthKitWriteback({
      ownerUserId: owner, policyRecord: enabledPolicy(), receipts: [pending],
    }).intents).toEqual([expect.objectContaining({ desiredState: "withdrawn" })]);
    const deleted = mergeDexaHealthKitWritebackReceipt(pending, receipt({
      logicalScanKey, syncIdentifier: projected.syncIdentifier,
      desiredState: "withdrawn", outcome: "deleted",
    }));
    expect(projectDexaHealthKitWriteback({
      ownerUserId: owner, policyRecord: enabledPolicy(), receipts: [deleted],
    }).intents).toEqual([]);
  });

  it("never lets a delayed lower-revision terminal receipt regress materialized state", () => {
    const logicalScanKey = `dexa_scan|${owner}|2026-10-09`;
    const projected = projectDexaHealthKitWriteback({
      canonicalEvidenceObjects: [scan("2026-10-09", 2)], ownerUserId: owner, policyRecord: enabledPolicy(),
    }).intents[0];
    const savedRevisionTwo = mergeDexaHealthKitWritebackReceipt(null, normalizeDexaHealthKitWritebackReceipt({
      intentIdentity: intentIdentity(logicalScanKey, "bodyFatPercentage"),
      logicalScanKey, canonicalRevision: 2, measurementKind: "bodyFatPercentage",
      desiredState: "present", syncIdentifier: projected.syncIdentifier, outcome: "saved",
    }, { ownerUserId: owner }));
    const delayedDeleteRevisionOne = normalizeDexaHealthKitWritebackReceipt({
      intentIdentity: intentIdentity(logicalScanKey, "bodyFatPercentage"),
      logicalScanKey, canonicalRevision: 1, measurementKind: "bodyFatPercentage",
      desiredState: "withdrawn", syncIdentifier: projected.syncIdentifier, outcome: "deleted",
    }, { ownerUserId: owner });
    expect(mergeDexaHealthKitWritebackReceipt(savedRevisionTwo, delayedDeleteRevisionOne)).toMatchObject({
      materializedState: "present", materializedRevision: 2,
    });
  });

  it("fails the Sep 12 validation closed if payload drifts under pinned revision metadata", () => {
    const canonical = realValidationScan();
    canonical.payload.bodyFatPercentage = 8.2;
    const result = projectDexaHealthKitWriteback({
      canonicalEvidenceObjects: [canonical], ownerUserId: owner,
      mode: "validation", validationAction: "write",
    });
    expect(result.intents).toEqual([]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DEXA_HEALTHKIT_VALIDATION_SCAN_IDENTITY_MISMATCH" }),
    ]));
  });

  it("fails the Sep 12 validation closed on duplicate active canonical scans", () => {
    const first = realValidationScan();
    const duplicate = structuredClone(first);
    duplicate.updatedAt = "2026-09-14T00:00:00.000Z";
    const result = projectDexaHealthKitWriteback({
      canonicalEvidenceObjects: [first, duplicate], ownerUserId: owner,
      mode: "validation", validationAction: "write",
    });
    expect(result.intents).toEqual([]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DEXA_ACTIVE_SCAN_DUPLICATE" }),
    ]));
  });

  it("rejects receipt attempts carrying HealthKit values", () => {
    expect(() => normalizeDexaHealthKitWritebackReceipt({ value: 8.1 }, { ownerUserId: owner }))
      .toThrow("DEXA HealthKit receipt is invalid");
  });
});

function enabledPolicy() {
  return {
    schemaVersion: DEXA_HEALTHKIT_WRITEBACK_POLICY_SCHEMA_VERSION,
    enabled: true,
    status: "enabled",
    effectiveFromScanDate: DEXA_HEALTHKIT_WRITEBACK_EFFECTIVE_DATE,
    measurementKinds: ["bodyFatPercentage", "leanBodyMassFatFree"],
    prospectiveOnly: true,
    historicalBackfill: false,
  };
}

function scan(date, revision = 1) {
  const canonicalId = `dexa_scan|${owner}|${date}`;
  const payload = {
    evidence_type: "dexa_scan",
    measuredAt: date,
    observed_at: date,
    bodyFatPercentage: 8.1,
    totalMass: { value: 174.7, unit: "lb" },
    fatMass: { value: 14.2, unit: "lb" },
    leanMass: { value: 153.3, unit: "lb" },
    boneMineralContent: { value: 7.2, unit: "lb" },
    restingMetabolicRate: { value: 1900, unit: "kcal/day" },
  };
  return {
    canonicalId,
    userId: owner,
    payload,
    quality: { status: "active" },
    dexaRevision: {
      schemaVersion: "canonical-dexa-scan-revision-v1",
      logicalScanKey: canonicalId,
      revision,
      semanticFingerprint: createDexaSemanticFingerprint(payload),
    },
  };
}

function realValidationScan() {
  const values = JSON.parse(readFileSync(
    new URL("../../fixtures/briefingFamilyV3/dexaScans.json", import.meta.url), "utf8",
  ));
  const source = structuredClone(values.find((value) =>
    value.measuredAt === "2026-09-12" &&
    value.dexaRevision?.semanticFingerprint === DEXA_HEALTHKIT_VALIDATION_EXPECTED_FINGERPRINT));
  const payload = structuredClone(source);
  for (const key of ["dexaRevision", "canonicalId", "canonicalLifecycleStatus", "version"]) delete payload[key];
  expect(createDexaSemanticFingerprint(payload)).toBe(DEXA_HEALTHKIT_VALIDATION_EXPECTED_FINGERPRINT);
  return {
    canonicalId: source.canonicalId,
    userId: source.userId,
    payload,
    quality: { status: "active" },
    dexaRevision: source.dexaRevision,
  };
}

function receipt({ logicalScanKey, syncIdentifier, desiredState, outcome }) {
  return normalizeDexaHealthKitWritebackReceipt({
    intentIdentity: intentIdentity(logicalScanKey, "bodyFatPercentage"),
    logicalScanKey,
    canonicalRevision: 1,
    measurementKind: "bodyFatPercentage",
    desiredState,
    syncIdentifier,
    outcome,
  }, { ownerUserId: owner });
}
