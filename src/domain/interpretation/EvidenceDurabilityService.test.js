import { describe, expect, it } from "vitest";
import {
  attachNamedUncertaintyLifecycle,
  createCanonicalDurabilityPeriod,
  createDurabilitySignalFromDescriptor,
  deriveEvidenceDurability,
} from "./EvidenceDurabilityService";

describe("Confidence evidence durability", () => {
  it("normalizes Midweek and Weekly into the same canonical weekly period", () => {
    expect(period("midweek", "2026-08-02", "2026-08-04").id)
      .toBe(period("weekly", "2026-08-02", "2026-08-08").id);
    expect(period("midweek", "2026-08-02", "2026-08-04").state)
      .toBe("preliminary");
    expect(period("weekly", "2026-08-02", "2026-08-08").state)
      .toBe("completed");
  });

  it("classifies one, two, and three completed periods deterministically", () => {
    const emerging = durability({ current: week(1), prior: [] });
    const repeated = durability({ current: week(2), prior: [history(1)] });
    const sustained = durability({
      current: week(3), prior: [history(1), history(2)],
    });
    expect(emerging).toMatchObject({ persistence: "emerging",
      independentPeriodCount: 1, transition: null });
    expect(repeated).toMatchObject({ persistence: "repeated",
      independentPeriodCount: 2, transition: "repeated" });
    expect(sustained).toMatchObject({ persistence: "sustained",
      independentPeriodCount: 3, transition: "sustained" });
    expect(durability({ current: week(3), prior: [history(2), history(1)] }))
      .toEqual(sustained);
  });

  it("does not count an overlapping Midweek as another completed period", () => {
    const result = durability({
      current: period("midweek", "2026-08-02", "2026-08-04"),
      prior: [history(1)],
    });
    expect(result).toMatchObject({ persistence: "emerging",
      independentPeriodCount: 1, transition: null });
  });

  it("distinguishes a same-period revision from duplicate evidence", () => {
    const revised = durability({
      current: week(2), prior: [history(1), history(2, "old")],
      lineage: "new",
    });
    const duplicate = durability({
      current: week(2), prior: [history(1), history(2, "same")],
      lineage: "same",
    });
    expect(revised).toMatchObject({ independentPeriodCount: 2,
      transition: null, samePeriodRevision: true, duplicateEvidence: false });
    expect(duplicate).toMatchObject({ independentPeriodCount: 2,
      transition: null, duplicateEvidence: true });
  });

  it("tracks corroboration without turning capabilities into temporal periods", () => {
    const training = descriptor("training_progression", "training-current");
    const photos = descriptor("progress_photos", "photo-session");
    const result = deriveEvidenceDurability({
      goalId: "goal", strategyRevision: "strategy-v1",
      descriptors: [training, photos],
      reconciliationItems: [item(training), item(photos)],
      durabilityContext: {
        currentPeriod: week(2),
        priorPeriods: [history(1)],
      },
    });
    expect(result.corroboratingCapabilities).toEqual([
      "progress_photos", "training_progression",
    ]);
    expect(result.corroboratingCapabilityCount).toBe(2);
    expect(result.signals.find((entry) =>
      entry.capability === "training_progression").independentPeriodCount).toBe(2);
    expect(result.signals.find((entry) =>
      entry.capability === "progress_photos").independentPeriodCount).toBe(1);
  });

  it("records named uncertainty reduction only from a safe prior contract", () => {
    const durabilityResult = durability({ current: week(2), prior: [history(1)] });
    const safe = attachNamedUncertaintyLifecycle({
      remainingUncertainty: uncertainty("measurement_pending"),
      durability: durabilityResult,
      durabilityContext: {
        uncertaintyComparisonSafe: true,
        previousUncertaintyKeys: [
          "energy_calibration_uncertain|energy_availability",
          "objective_direct_measurement_pending|objective",
        ],
      },
    });
    expect(safe.durability.reducedUncertaintyKeys)
      .toEqual(["energy_calibration_uncertain|energy_availability"]);
    const unsafe = attachNamedUncertaintyLifecycle({
      remainingUncertainty: uncertainty("measurement_pending"),
      durability: durabilityResult,
      durabilityContext: { uncertaintyComparisonSafe: false,
        previousUncertaintyKeys: ["anything"] },
    });
    expect(unsafe.durability.reducedUncertaintyKeys).toEqual([]);
  });
});

function durability({ current, prior, lineage = "same" }) {
  const value = descriptor("training_progression", lineage);
  return deriveEvidenceDurability({
    goalId: "goal", strategyRevision: "strategy-v1",
    descriptors: [value], reconciliationItems: [item(value)],
    durabilityContext: { currentPeriod: current, priorPeriods: prior },
  });
}

function descriptor(capability, lineage) {
  return {
    id: `descriptor|${capability}`,
    capability,
    agreement: "supports",
    strength: "moderate",
    temporalApplicability: "applicable",
    sourceEvidenceIds: [lineage],
  };
}

function item(value) {
  return { evidenceRef: value.id, relevance: "material",
    temporalApplicability: "applicable" };
}

function history(number, lineage = `week-${number}`) {
  return {
    ...week(number),
    signals: [createDurabilitySignalFromDescriptor(
      descriptor("training_progression", lineage))],
  };
}

function week(number) {
  const start = `2026-08-${String(2 + (number - 1) * 7).padStart(2, "0")}`;
  const end = `2026-08-${String(8 + (number - 1) * 7).padStart(2, "0")}`;
  return period("weekly", start, end);
}

function period(cadence, startDate, endDate) {
  return createCanonicalDurabilityPeriod({
    evidenceWindow: {
      id: `${cadence}:${startDate}:${endDate}:America/Los_Angeles`,
      cadence, startDate, endDate, timeZone: "America/Los_Angeles",
      closed: cadence === "weekly",
    },
    cadence,
  });
}

function uncertainty(kind) {
  return { status: "material", items: [{
    id: "uncertainty", kind, question: "objective", cause: "pending",
    materiality: "high", reducibility: "reducible",
  }], summary: { state: "uncertainty_remains" } };
}
