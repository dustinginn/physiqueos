import { describe, expect, it } from "vitest";
import { contractDexaEventInterpretation } from "./DEXAEventPresentationContraction.js";
import { prepareDexaOct9V3 } from "../../testSupport/briefingFamilyV3Harness.js";

const interpretation = {
  opening: "Lean went up. Body fat moved past the range. One scan proves little.",
  fatLoss: "Body fat is above the range. Review calories.",
  leanMass: "Lean went up. Prepare the same way next time.",
  regional: "Trunk changed most.",
  phaseMeaning: "One scan is not enough to change phases.",
  stoodOut: null,
  supportingEvidence: "Weight moved with the trend.",
  uncertainty: "One scan cannot prove new muscle.",
  goalProgress: "Lean went up. Body fat moved past the range. One scan proves little.",
  guardrailStatus: "Body fat is above the range. Review calories.",
};
const interpretationClaims = {
  opening: [
    { claim: "objective_movement", text: "Lean went up." },
    { claim: "guardrail_status", text: "Body fat moved past the range." },
    { claim: "measurement_uncertainty", text: "One scan proves little." },
  ],
  fatLoss: [{ claim: "guardrail_reasoning", text: null }],
  leanMass: [
    { claim: "objective_movement", text: "Lean went up." },
    { claim: "comparable_next_check", text: "Prepare the same way next time." },
  ],
  regional: [{ claim: "regional", text: null }],
  phaseMeaning: [{ claim: "phase_meaning", text: null }],
  supportingEvidence: [{ claim: "supporting_evidence", text: null }],
  uncertainty: [{ claim: "measurement_uncertainty", text: null }],
  goalProgress: [{ claim: "alias", of: "opening" }],
  guardrailStatus: [{ claim: "alias", of: "fatLoss" }],
};

describe("DEXA Event interpretation contraction", () => {
  it("keeps each claim only in its home and drops verbatim aliases", () => {
    const result = contractDexaEventInterpretation({ interpretation, interpretationClaims, roleClaims: {
      heroBody: ["objective_movement", "guardrail_status"], protect: ["preserve_routine_and_comparability"],
    } });
    expect(result.opening).toBe("");
    expect(result.leanMass).toBe("");
    expect(result.goalProgress).toBeNull();
    expect(result.guardrailStatus).toBeNull();
    for (const field of ["fatLoss", "regional", "phaseMeaning", "supportingEvidence", "uncertainty"]) {
      expect(result[field]).toBe(interpretation[field]);
    }
  });

  it("keeps the first statement of a claim the roles do not carry, and only the first", () => {
    const result = contractDexaEventInterpretation({ interpretation, interpretationClaims, roleClaims: { heroBody: [] } });
    expect(result.opening).toBe("Lean went up. Body fat moved past the range.");
    expect(result.leanMass).toBe("Prepare the same way next time.");
  });

  it("does nothing to prose edited after it was tagged, or without claims or roles", () => {
    const edited = { ...interpretation, opening: "A sentence someone rewrote." };
    expect(contractDexaEventInterpretation({ interpretation: edited, interpretationClaims, roleClaims: { heroBody: ["objective_movement"] } }).opening)
      .toBe("A sentence someone rewrote.");
    expect(contractDexaEventInterpretation({ interpretation, interpretationClaims: undefined, roleClaims: {} })).toBe(interpretation);
    expect(contractDexaEventInterpretation({ interpretation, interpretationClaims, roleClaims: undefined })).toBe(interpretation);
  });

  it("does not mutate its input", () => {
    const copy = structuredClone(interpretation);
    contractDexaEventInterpretation({ interpretation, interpretationClaims, roleClaims: { heroBody: ["objective_movement"] } });
    expect(interpretation).toEqual(copy);
  });
});

describe("DEXA Event interpretation claims", () => {
  // Tagged sentences must reassemble into exactly the stored interpretation text,
  // or contraction would silently skip the field.
  const variants = {
    increased: null,
    decreased: (scan) => { scan.leanMass = { value: 152.1, unit: "lb" }; scan.totalMass = { value: 176.6, unit: "lb" }; scan.bodyFatPercentage = 9.9; },
    flat: (scan) => { scan.leanMass = { value: 153.3, unit: "lb" }; scan.totalMass = { value: 177.8, unit: "lb" }; scan.bodyFatPercentage = 9.8; },
  };
  for (const [name, mutateScan] of Object.entries(variants)) {
    it(`reassemble exactly into the interpretation text (${name} lean tissue)`, async () => {
      const { legacy } = await prepareDexaOct9V3({ mutateScan });
      for (const [field, parts] of Object.entries(legacy.interpretationClaims)) {
        if (parts.length === 0 || parts.every((part) => part.claim === "alias")) continue;
        if (parts.length === 1 && parts[0].text == null) continue;
        expect(parts.map((part) => part.text).join(" ")).toBe(legacy.interpretation[field]);
      }
    });
  }
});
