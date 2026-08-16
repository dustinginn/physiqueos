import { describe, expect, it } from "vitest";
import {
  expectInternalDomainNamesNatural,
  findUnnaturalInternalNounCapitalization,
} from "./proseCapitalization";

describe("prose capitalization", () => {
  it("flags an internal domain noun capitalized mid-sentence", () => {
    const violations = findUnnaturalInternalNounCapitalization("the Goal shifted toward growth.");
    expect(violations).toEqual([{ domain: "Goal", index: 4 }]);
  });

  it("does not flag a sentence-initial capitalized domain noun", () => {
    expect(findUnnaturalInternalNounCapitalization("Goal progress remained steady.")).toEqual([]);
  });

  it("does not flag a domain noun immediately after sentence-ending punctuation", () => {
    expect(findUnnaturalInternalNounCapitalization("Training progressed well. Goal progress followed.")).toEqual([]);
  });

  it("does not flag occurrences inside a known proper-title exception", () => {
    expect(findUnnaturalInternalNounCapitalization("This is the final planned phase. Goal Review comes next.")).toEqual([]);
    expect(findUnnaturalInternalNounCapitalization("The user authorized Lean Mass Build.")).toEqual([]);
    expect(findUnnaturalInternalNounCapitalization("Establish Maintenance was completed.")).toEqual([]);
    expect(findUnnaturalInternalNounCapitalization("that evidence, weighed during Phase Review, supported the transition.")).toEqual([]);
  });

  it("still flags a lookalike domain word outside any exception span", () => {
    const violations = findUnnaturalInternalNounCapitalization("The Strategy changed after Lean Mass Build ended.");
    expect(violations.map((item) => item.domain)).toEqual(["Strategy"]);
  });

  it("expectInternalDomainNamesNatural throws for unnatural capitalization", () => {
    expect(() => expectInternalDomainNamesNatural(["the Goal shifted toward growth."])).toThrow();
  });

  it("expectInternalDomainNamesNatural passes for natural prose and ignores empty/null entries", () => {
    expect(() => expectInternalDomainNamesNatural([
      null, "", "Training progressed across most reviewed areas.",
      "The evidence did not conclusively prove maintenance, but the strategy remained user-authorized.",
    ])).not.toThrow();
  });
});
