import fs from "node:fs";
import { describe, expect, it } from "vitest";

const foamActions = fs.readFileSync(
  new URL("./execution/[executionId]/actions.js", import.meta.url),
  "utf8",
);
const morningActions = fs.readFileSync(
  new URL("./tracking/morning-weigh-in/actions.js", import.meta.url),
  "utf8",
);
const editor = fs.readFileSync(
  new URL("../../../screens/RecurringSupportEditorScreen.jsx", import.meta.url),
  "utf8",
);
const genericEditor = fs.readFileSync(
  new URL("../../../screens/ExecutionItemBuilderScreen.jsx", import.meta.url),
  "utf8",
);

describe("Operating Plan save reliability wiring", () => {
  it("routes Foam Rolling and Morning Weigh-In through the bounded canonical commit boundary", () => {
    const foam = foamActions.slice(
      foamActions.indexOf("export async function saveFoamRollingSupport"),
      foamActions.indexOf("export async function saveExecutionItem"),
    );
    for (const source of [foam, morningActions]) {
      expect(source).toContain("loadProductionBoundedFounderReadContext");
      expect(source).toContain("loadApplicationCanonicalCommitBindings");
      expect(source).toContain("finishDurableOperatingPlanSave");
      expect(source).not.toContain("loadApplicationRuntimeBindings");
      expect(source).not.toContain("FounderRepositories.");
    }
  });

  it("does not report a committed save as failed when cache refresh is unavailable", () => {
    for (const source of [foamActions, morningActions]) {
      expect(source).toContain("Saved. This page could not refresh automatically.");
      expect(source).toContain("saved: true");
    }
    expect(editor).toContain("state.saved");
  });

  it("contains clean UTF-8 save and navigation text on the Operating Plan execution surface", () => {
    for (const source of [editor, genericEditor]) {
      expect(source).not.toContain("â€¦");
      expect(source).not.toContain("â†");
    }
    expect(editor).toContain('pending ? "Saving…" : "Save Support"');
    expect(editor).toContain("← {protocol.name}");
  });
});
