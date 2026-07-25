import { describe, expect, it } from "vitest";
import { resolveProtocolDoseTransition } from "./ProtocolDoseTransitionService";

const protocol = {
  dose: { value: 2, unit: "mg" },
  doseHistory: [
    { label: "week_9", dose: 2, doseUnit: "mg", startDate: "2026-07-16", endDate: "2026-07-22" },
    { label: "week_10_taper", dose: 1.5, doseUnit: "mg", startDate: "2026-07-23", endDate: "2026-07-29" },
    { label: "week_11_taper", dose: 1, doseUnit: "mg", startDate: "2026-07-30", endDate: "2026-08-05" },
    { label: "week_12_taper", dose: 0.5, doseUnit: "mg", startDate: "2026-08-06" },
  ],
};

describe("protocol dose transitions", () => {
  it.each([
    ["2026-07-22", 2],
    ["2026-07-23", 1.5],
    ["2026-07-30", 1],
    ["2026-08-06", 0.5],
  ])("resolves %s from dated history", (date, dose) => {
    expect(resolveProtocolDoseTransition(protocol, date).effectiveDose.value).toBe(dose);
  });

  it("returns transition context without allowing the top-level dose to override it", () => {
    expect(resolveProtocolDoseTransition(protocol, "2026-07-23")).toMatchObject({
      effectiveDose: { value: 1.5, unit: "mg" },
      previousDose: { value: 2, unit: "mg" },
      effectiveDate: "2026-07-23",
      nextDose: { value: 1, unit: "mg" },
      nextEffectiveDate: "2026-07-30",
      changeEffectiveToday: true,
      taperStepId: "week_10_taper",
    });
  });
});
