import { describe, expect, it } from "vitest";
import { createCadencePIEvidenceEnvelope } from
  "./CadencePIEvidenceEnvelopeService";

const window = { startDate: "2026-08-01", endDate: "2026-08-31",
  timeZone: "America/Los_Angeles" };
const comparison = { startDate: "2026-07-01", endDate: "2026-07-31",
  timeZone: "America/Los_Angeles" };
const goal = {
  id: "goal-build", type: "build_lean_mass", title: "Build Lean Mass",
  status: "active", primary: true, timeline: { startDate: "2026-07-20" },
  phases: [{ id: "phase-build", name: "Build", status: "active",
    startDate: "2026-08-15" }],
};

describe("Cadence PI evidence envelope", () => {
  it("normalizes mapped Monthly domain evidence without double-counting Activity", () => {
    const envelope = createCadencePIEvidenceEnvelope({
      cadence: "monthly", evidenceWindow: window,
      comparisonWindow: comparison, evaluationDate: window.endDate,
      activeGoal: goal, activePhase: goal.phases[0],
      canonicalTrainingEvidence: [
        training("training-jul", "2026-07-28", 8),
        training("training-aug-1", "2026-08-05", 10),
        training("training-aug-2", "2026-08-26", 12),
      ],
      weights: [
        weight("weight-jul", "2026-07-31", 167),
        weight("weight-aug-1", "2026-08-01", 167.2),
        weight("weight-aug-2", "2026-08-31", 167.4),
      ],
      energyDays: [
        energy("2026-07-31", 2400, 2500),
        energy("2026-08-01", 2350, 2500),
        energy("2026-08-31", 2300, 2550),
      ],
      dexaScans: [dexa("dexa-jul", "2026-07-18", 147.5, 7.7, 167.4),
        dexa("dexa-aug", "2026-08-15", 148.3, 7.6, 168.3)],
    });
    expect(envelope.schemaVersion).toBe("cadence_pi_evidence_envelope_v1");
    expect(envelope.observations.some((item) =>
      item.id === "performance|overall|resistance")).toBe(true);
    expect(envelope.observations.find((item) =>
      item.kind === "energy_balance").supportingEvidenceIds).toEqual(
      expect.arrayContaining(["nutrition-2026-08-01", "activity-2026-08-01",
        "nutrition-2026-08-31", "activity-2026-08-31"]));
    expect(envelope.observations.find((item) =>
      item.kind === "weight_average_change").supportingEvidenceIds).toEqual(
      expect.arrayContaining(["weight-jul", "weight-aug-1", "weight-aug-2"]));
    expect(envelope.observations.find((item) =>
      item.kind === "recovery_insufficient_evidence")).toBeTruthy();
    expect(envelope.observations.find((item) =>
      item.kind === "dexa_measurement_snapshot").supportingEvidenceIds)
      .toEqual(["dexa-aug"]);
    expect(envelope.observations.some((item) => item.domain === "activity"))
      .toBe(false);
    expect(envelope.provenance.persistenceWrites).toBe(0);
  });

  it("does not invent Progress Photo scoring without a comparable session", () => {
    const envelope = createCadencePIEvidenceEnvelope({
      cadence: "monthly", evidenceWindow: window,
      comparisonWindow: comparison, evaluationDate: window.endDate,
      activeGoal: goal, activePhase: goal.phases[0],
    });
    expect(envelope.observations.some((item) => item.domain === "photos"))
      .toBe(false);
  });

  it("limits a non-comparative Monthly envelope to the declared evidence window", () => {
    const envelope = createCadencePIEvidenceEnvelope({
      cadence: "monthly", evidenceWindow: window,
      evaluationDate: window.endDate, activeGoal: goal,
      activePhase: goal.phases[0],
      canonicalTrainingEvidence: [
        training("training-jul", "2026-07-28", 8),
        training("training-aug", "2026-08-26", 12),
      ],
      weights: [weight("weight-jul", "2026-07-31", 167),
        weight("weight-aug-1", "2026-08-01", 167.2),
        weight("weight-aug-2", "2026-08-31", 167.4)],
      energyDays: [energy("2026-07-31", 2400, 2500),
        energy("2026-08-31", 2300, 2550)],
      dexaScans: [dexa("dexa-jul", "2026-07-18", 147.5, 7.7, 167.4),
        dexa("dexa-aug", "2026-08-15", 148.3, 7.6, 168.3)],
    });
    expect(envelope.provenance.sourceEvidenceIds).not.toContain("training-jul");
    expect(envelope.provenance.sourceEvidenceIds).not.toContain("weight-jul");
    expect(envelope.provenance.sourceEvidenceIds).not.toContain("nutrition-2026-07-31");
    expect(envelope.provenance.sourceEvidenceIds).not.toContain("dexa-jul");
    expect(envelope.provenance.sourceEvidenceIds).toEqual(expect.arrayContaining([
      "training-aug", "weight-aug-1", "weight-aug-2",
      "nutrition-2026-08-31", "activity-2026-08-31", "dexa-aug",
    ]));
  });
});

function training(id, date, reps) {
  return { id, evidence_type: "training", observed_at: date,
    metadata: { activity_type: "Traditional Strength Training" },
    exercises: [{ id: `${id}-exercise`, name: "Shoulder Press",
      body_region: "Upper Body", sets: [{ reps, weight: 40 }] }] };
}
function weight(id, measuredAt, value) {
  return { id, measuredAt, weight: { value, unit: "lb" } };
}
function energy(date, calorieIntake, estimatedExpenditure) {
  return { id: `energy-${date}`, date, calorieIntake, estimatedExpenditure,
    energyBalance: calorieIntake - estimatedExpenditure,
    completeness: "complete", pairedCompleteness: "complete",
    nutritionDayId: `nutrition-${date}`, activityDayId: `activity-${date}` };
}
function dexa(id, measuredAt, leanMass, bodyFatPercentage, totalMass) {
  return { id, measuredAt, leanMass: { value: leanMass },
    fatMass: { value: 12.8 }, bodyFatPercentage: { value: bodyFatPercentage },
    totalMass: { value: totalMass } };
}
