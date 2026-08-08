import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("shared peptide Support presentation", () => {
  it("routes every active peptide edit through the shared Support editor", () => {
    const route = read("src/app/profile/operating-plan/execution/peptides/[protocolId]/page.js");

    expect(route).toContain("PeptideSupportEditorScreen");
    expect(route).toContain('supportEditor:"peptide_support_v1"');
    expect(route).not.toMatch(/Retatrutide|Tesamorelin|PeptideExecutionEditorScreen/);
  });

  it("uses Support terminology and retains priority only as hidden compatibility data", () => {
    const screen = read("src/screens/PeptideSupportEditorScreen.jsx");

    expect(screen).toContain("Edit Support");
    expect(screen).toContain("Save Support");
    expect(screen).toContain("Dosing Strategy");
    expect(screen).toContain('name="legacyPriority" type="hidden"');
    expect(screen).not.toMatch(/Save Execution|Peptide Execution|\[\["high","High"\]/);
  });
});

function read(file) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}
