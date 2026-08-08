import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Supplement Support presentation migration", () => {
  it("uses one shared Support editor without Priority or manual timeline controls", () => {
    const source = read("src/screens/SupplementSupportEditorScreen.jsx");
    expect(source).toContain("SupplementSupportEditorScreen");
    expect(source).toContain("Dose / Quantity");
    expect(source).toContain("SupportScheduleEditor");
    expect(source).toContain("Remind me");
    expect(source).toContain("No reminder");
    expect(source).toContain("Execution Notes");
    expect(source).toContain("Save Support");
    expect(source).not.toContain("Supplement Execution");
    expect(source).not.toContain("Save Execution");
    expect(source).not.toContain("Dosing Timeline");
    expect(source).not.toMatch(/title="Priority"|label="Priority"/);
  });

  it("routes every active supplement through the generic Support editor", () => {
    const page = read("src/app/profile/operating-plan/execution/supplements/[protocolId]/page.js");
    expect(page).toContain("SupplementSupportEditorScreen");
    expect(page).toContain("createSupplementSupportHydrationModel");
    expect(page).toContain('entry.type === "supplement"');
    expect(page).not.toContain("SupplementExecutionEditorScreen");
  });

  it("keeps the supplement detail experience in Support language", () => {
    const detail = read("src/screens/SupplementExecutionDetailScreen.jsx");
    expect(detail).toContain("Supplement Support");
    expect(detail).toContain("Edit Support");
    expect(detail).toContain("Dose / Quantity");
    expect(detail).not.toContain("Supplement Execution");
    expect(detail).not.toContain("Dosing Timeline");
    expect(detail).not.toMatch(/label="Priority"/);
  });
});

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}
