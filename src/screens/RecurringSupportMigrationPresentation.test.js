import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Foam Rolling Support presentation", () => {
  it("uses the shared Support schedule editor without dosing or priority controls", () => {
    const screen = fs.readFileSync(
      new URL("./RecurringSupportEditorScreen.jsx", import.meta.url),
      "utf8"
    );
    const peptide = fs.readFileSync(
      new URL("./PeptideSupportEditorScreen.jsx", import.meta.url),
      "utf8"
    );
    const schedule = fs.readFileSync(
      new URL("./SupportScheduleEditor.jsx", import.meta.url),
      "utf8"
    );

    expect(screen).toContain("SupportScheduleEditor");
    expect(peptide).toContain("SupportScheduleEditor");
    expect(screen).toContain("Edit Support");
    expect(screen).toContain("Save Support");
    expect(schedule).toContain('title="Schedule"');
    expect(screen).toContain('title="Reminder"');
    expect(screen).toContain('title="Execution Notes"');
    expect(screen).toContain("Remind me");
    expect(screen).toContain("No reminder");
    expect(screen).not.toContain("Dosing Strategy");
    expect(screen).not.toContain("legacyPriority");
    expect(screen).not.toContain('title="Priority"');
    expect(screen).not.toContain("Execution Plan");
  });
});
