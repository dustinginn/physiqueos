import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MonthlyBriefingScreen from "../../screens/MonthlyBriefingScreen";
import {
  assertCanonicalConfidencePresentation,
  canonicalConfidenceExplanation,
} from "./CanonicalConfidencePresentationInvariant";
import { projectPersistedMonthlyPresentationForRendering } from "./MonthlyPersistedArtifactCompatibilityService";

const JULY_ARTIFACT_ID = "monthly_briefing_user_founder_001_202607";
const JULY_ARTIFACT_SHA256 = "c561e9bc7b4f8773ca6121534b9ffac83dbca6c0dc907468c5b139bef12a69a4";
const runtimePath = path.resolve(
  process.env.PHYSIQUEOS_RUNTIME_STORE_PATH ??
  fileURLToPath(new URL("../../../private/founder/runtime-store.json", import.meta.url))
);

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJulyArtifact() {
  const bytes = fs.readFileSync(runtimePath);
  const store = JSON.parse(bytes);
  const artifact = store.dailyBriefings.find((item) => item.id === JULY_ARTIFACT_ID);
  if (!artifact) throw new Error(`Missing persisted Monthly artifact: ${JULY_ARTIFACT_ID}`);
  return { artifact, bytes, store };
}

describe("persisted Monthly artifact render compatibility", () => {
  it("projects the exact July artifact to the canonical published explanation without mutating history", () => {
    const before = readJulyArtifact();
    const originalArtifact = structuredClone(before.artifact);
    const originalConfidence = before.artifact.briefing.monthlyPresentation.hero.confidence;
    const originalDailyBriefingsHash = sha(JSON.stringify(before.store.dailyBriefings));

    expect(sha(JSON.stringify(before.artifact))).toBe(JULY_ARTIFACT_SHA256);
    expect(() => assertCanonicalConfidencePresentation(originalConfidence))
      .toThrow(/MIXED_SOURCE/);

    const presentation = projectPersistedMonthlyPresentationForRendering(
      before.artifact.briefing.monthlyPresentation
    );
    const projectedConfidence = presentation.hero.confidence;

    expect(assertCanonicalConfidencePresentation(projectedConfidence))
      .toBe(projectedConfidence);
    expect(canonicalConfidenceExplanation(projectedConfidence))
      .toBe(originalConfidence.primaryReason);
    expect(projectedConfidence.presentationExplanation)
      .toBe(originalConfidence.primaryReason);
    expect(projectedConfidence).toMatchObject({
      score: originalConfidence.score,
      delta: originalConfidence.delta,
      movementDirection: originalConfidence.movementDirection,
      assessmentId: originalConfidence.assessmentId,
      source: originalConfidence.source,
      modelVersion: originalConfidence.modelVersion,
    });
    expect(before.artifact).toEqual(originalArtifact);
    expect(JSON.parse(JSON.stringify(presentation))).toEqual(presentation);
    expect(structuredClone(presentation)).toEqual(presentation);

    const markup = renderToStaticMarkup(
      createElement(MonthlyBriefingScreen, { presentation })
    );
    expect(markup).toContain(originalConfidence.primaryReason);
    expect(markup).toContain("Goal confidence 59 percent");

    const after = readJulyArtifact();
    expect(sha(after.bytes)).toBe(sha(before.bytes));
    expect(after.store.revision).toBe(before.store.revision);
    expect(after.store.lastCommitId).toBe(before.store.lastCommitId);
    expect(sha(JSON.stringify(after.store.dailyBriefings)))
      .toBe(originalDailyBriefingsHash);
    expect(sha(JSON.stringify(after.artifact))).toBe(JULY_ARTIFACT_SHA256);
  });

  it("leaves canonical and unrelated presentation shapes unchanged", () => {
    const canonical = {
      hero: {
        confidence: {
          source: "canonical_confidence_v2_snapshot",
          modelVersion: "canonical_confidence_assessment_v2",
          primaryReason: "Confidence remained stable.",
          presentationExplanation: "Confidence remained stable.",
        },
      },
    };
    const legacyWithoutOverride = {
      hero: {
        confidence: {
          source: "canonical_pi_snapshot",
          modelVersion: "pi_goal_confidence_assessment_v1",
          primaryReason: "Confidence increased as support strengthened.",
          presentationExplanation: null,
        },
      },
    };

    expect(projectPersistedMonthlyPresentationForRendering(canonical)).toBe(canonical);
    expect(projectPersistedMonthlyPresentationForRendering(legacyWithoutOverride))
      .toBe(legacyWithoutOverride);
  });
});
