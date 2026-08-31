import fs from "node:fs";
import { describe, expect, it } from "vitest";

const homeAction = fs.readFileSync(new URL("./actions.js", import.meta.url), "utf8");
const detailAction = fs.readFileSync(new URL("./priorities/[priorityId]/actions.js", import.meta.url), "utf8");
const form = fs.readFileSync(new URL("../components/focus/PriorityCompletionForm.jsx", import.meta.url), "utf8");

describe("Priority completion action wiring", () => {
  it("routes Home and detail through the bounded PriorityCompletionService", () => {
    for (const source of [homeAction, detailAction]) {
      expect(source).toContain("createPriorityCompletionService");
      expect(source).toContain("loadApplicationCanonicalCommitBindings");
      expect(source).not.toContain("FounderRepositories.reminders.completeReminder");
    }
  });

  it("does not block Home durable success on a redirect", () => {
    expect(homeAction).not.toContain('redirect("/")');
    expect(homeAction).toContain("ok: true");
    expect(form).toContain("useActionState");
    expect(form).toContain("completed={state?.ok === true}");
  });
});
