import fs from "node:fs";
import { describe, expect, it } from "vitest";

const visibleAbsRoute = fs.readFileSync(new URL("./visible-abs/page.js", import.meta.url), "utf8");
const maintenanceRoute = fs.readFileSync(new URL("./maintenance/page.js", import.meta.url), "utf8");
const leanMassRoute = fs.readFileSync(new URL("./lean-mass/page.js", import.meta.url), "utf8");
const buildLeanMassRoute = fs.readFileSync(new URL("./build-lean-mass/page.js", import.meta.url), "utf8");
const buildLeanMassPresentation = fs.readFileSync(
  new URL("../../domain/services/PhaseAwareActiveGoalPreviewService.js", import.meta.url),
  "utf8"
);
const presentationLoader = fs.readFileSync(
  new URL("../../domain/services/NarrativeGoalPresentationLoader.js", import.meta.url),
  "utf8"
);

describe("Narrative Goal production routes", () => {
  it("renders the approved shared narrative experience on every canonical route", () => {
    for (const route of [maintenanceRoute, leanMassRoute]) {
      expect(route).toContain("NarrativeGoalPreviewScreen");
      expect(route).toContain("getNarrativeGoalPresentation");
      expect(route).not.toMatch(/redirect|narrative-preview/i);
    }
    expect(maintenanceRoute).toContain('getNarrativeGoalPresentation("maintenance")');
    expect(leanMassRoute).toContain('getNarrativeGoalPresentation("leanMass")');
  });

  it("promotes the approved completed Visible Abs keepsake into production", () => {
    expect(visibleAbsRoute).toContain("CompletedGoalPreviewScreen");
    expect(visibleAbsRoute).toContain("getProductionCompletedGoalReadService");
    expect(visibleAbsRoute).toContain("searchParams");
    expect(visibleAbsRoute).not.toMatch(/NarrativeGoalPreviewScreen|getNarrativeGoalPresentation|redirect|save|update|persist/i);
  });

  it("promotes the phase-aware Build Lean Mass goal through the shared read-only screen", () => {
    expect(buildLeanMassRoute).toContain("PhaseAwareActiveGoalPreviewScreen");
    expect(buildLeanMassRoute).toContain("getPhaseAwareActiveGoalPreview");
    expect(buildLeanMassRoute).not.toContain("NarrativeGoalPreviewScreen");
    expect(buildLeanMassRoute).not.toMatch(/redirect|action|save|update|persist/i);
    expect(buildLeanMassPresentation).toContain('goal.type !== "build_lean_mass"');
    expect(buildLeanMassPresentation).toContain("resolveActiveGoalConfidencePresentation");
    expect(buildLeanMassPresentation)
      .not.toContain("resolveOverallGoalConfidenceReadModel");
    expect(buildLeanMassPresentation).not.toMatch(/ProductionGoalTransitionActivationService|GoalTransitionActivationCoordinator|FounderStoreUnitOfWork|\.save\(|\.update\(|\.create\(/);
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
