import fs from "node:fs";
import { describe, expect, it } from "vitest";

const visibleAbsRoute = fs.readFileSync(new URL("./visible-abs/page.js", import.meta.url), "utf8");
const maintenanceRoute = fs.readFileSync(new URL("./maintenance/page.js", import.meta.url), "utf8");
const leanMassRoute = fs.readFileSync(new URL("./lean-mass/page.js", import.meta.url), "utf8");
const presentationLoader = fs.readFileSync(
  new URL("../../domain/services/NarrativeGoalPresentationLoader.js", import.meta.url),
  "utf8"
);

describe("Narrative Goal production routes", () => {
  it("renders the approved shared narrative experience on every canonical route", () => {
    for (const route of [visibleAbsRoute, maintenanceRoute, leanMassRoute]) {
      expect(route).toContain("NarrativeGoalPreviewScreen");
      expect(route).toContain("getNarrativeGoalPresentation");
      expect(route).not.toMatch(/redirect|narrative-preview/i);
    }
    expect(visibleAbsRoute).toContain('getNarrativeGoalPresentation("visibleAbs")');
    expect(maintenanceRoute).toContain('getNarrativeGoalPresentation("maintenance")');
    expect(leanMassRoute).toContain('getNarrativeGoalPresentation("leanMass")');
  });

  it("reuses production dossier loaders without persistence or mutations", () => {
    expect(presentationLoader).toContain("getVisibleAbsDossier");
    expect(presentationLoader).toContain("getSupportingGoalDossier");
    expect(presentationLoader).toContain("composeNarrativeGoalPreview");
    expect(presentationLoader).toContain("composeSupportingNarrativeGoalPreview");
    expect(presentationLoader).not.toMatch(/save|create|update|persist/i);
  });

  it("has no remaining preview route implementation", () => {
    expect(
      fs.existsSync(new URL("./[goalId]/narrative-preview/page.js", import.meta.url))
    ).toBe(false);
  });
});
