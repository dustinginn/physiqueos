export const LOCKED_MONTHLY_SECTION_ROLES = Object.freeze([
  "hero",
  "goalCompletionMilestone",
  "trainingProgress",
  "energyEvolution",
  "newBaseline",
  "whatChanged",
  "definingMoments",
  "monthAhead",
]);

export const LOCKED_MONTHLY_HERO_SUMMARY_ROLES = Object.freeze([
  "training",
  "newBaseline",
  "energy",
]);

const sectionContracts = Object.freeze({
  hero: { presentationKey: "hero", narrativeKey: "hero" },
  goalCompletionMilestone: { presentationKey: "milestone", storyType: "goal_completion" },
  trainingProgress: { presentationKey: "training", narrativeKey: "training", storyType: "training_evolution" },
  energyEvolution: { presentationKey: "energy", narrativeKey: "energy", storyType: "energy_trend" },
  newBaseline: { presentationKey: "newBaseline", narrativeKey: "newBaseline", storyType: "new_baseline" },
  whatChanged: { presentationKey: "changes", narrativeKey: "changes", dynamic: true },
  definingMoments: { presentationKey: "moments", narrativeKey: "moments", dynamic: true },
  monthAhead: { presentationKey: "monthAhead", narrativeKey: "monthAhead" },
});

const heroContracts = Object.freeze({
  training: { label: "Training", storyType: "training_evolution" },
  newBaseline: { label: "New baseline", storyType: "new_baseline" },
  energy: { label: "Calories", storyType: "energy_trend" },
});

function candidateFor(decision, storyType) {
  return decision?.candidates?.find((candidate) => candidate.storyType === storyType) ?? null;
}

function missingClassification({ contract, decision, narrative, presentation }) {
  const candidate = contract.storyType ? candidateFor(decision, contract.storyType) : null;
  const narrativeValue = contract.narrativeKey ? narrative?.[contract.narrativeKey] : undefined;
  const presentationValue = presentation?.[contract.presentationKey];
  if (presentationValue) return "present";
  if (contract.storyType && !candidate) {
    if (contract.storyType === "new_baseline" &&
        decision?.semanticDiagnostics?.newBaseline?.status !== "canonical_role_resolved") {
      return "absent_semantic_classification_failed";
    }
    return "absent_story_not_selected";
  }
  if (candidate && !candidate.included) return "absent_story_not_selected";
  if (contract.narrativeKey && !narrativeValue) {
    return contract.dynamic
      ? "intentionally_omitted_by_dynamic_composition"
      : "absent_narrative_composition_dropped";
  }
  if (narrativeValue && !presentationValue) return "absent_presentation_mapping_dropped";
  return "rendering_suppressed_null_role";
}

function auditSection(role, contract, models) {
  const classification = missingClassification({ contract, ...models });
  return Object.freeze({
    role,
    classification,
    present: classification === "present",
    storyType: contract.storyType ?? null,
    storyId: contract.storyType ? candidateFor(models.decision, contract.storyType)?.storyId ?? null : null,
    renderState: models.presentation?.[contract.presentationKey]
      ? "rendered"
      : "suppressed_null_role",
  });
}

function auditHeroRole(role, contract, models) {
  const highlight = models.presentation?.hero?.highlights?.find((item) => item.label === contract.label) ?? null;
  const candidate = candidateFor(models.decision, contract.storyType);
  let classification = "present";
  if (!highlight) {
    if (!candidate) {
      classification = contract.storyType === "new_baseline" &&
        models.decision?.semanticDiagnostics?.newBaseline?.status !== "canonical_role_resolved"
        ? "absent_semantic_classification_failed"
        : "absent_story_not_selected";
    } else if (!candidate.included) {
      classification = "absent_story_not_selected";
    } else {
      classification = "absent_presentation_mapping_dropped";
    }
  }
  return Object.freeze({
    role,
    label: contract.label,
    storyType: contract.storyType,
    storyId: candidate?.storyId ?? null,
    classification,
    present: Boolean(highlight),
  });
}

export function auditMonthlySectionRoleInventory({ decision, narrative, presentation } = {}) {
  const models = { decision, narrative: narrative?.monthlyNarrative ?? narrative, presentation };
  const sections = Object.fromEntries(
    Object.entries(sectionContracts).map(([role, contract]) => [role, auditSection(role, contract, models)])
  );
  const heroSummary = Object.fromEntries(
    Object.entries(heroContracts).map(([role, contract]) => [role, auditHeroRole(role, contract, models)])
  );
  const weightCandidate = candidateFor(decision, "weight_context");
  const weightLocations = [
    models.narrative?.changes?.themes?.some((item) => item.label === "Weight") && "whatChanged",
    models.narrative?.monthAhead?.guidance?.some((item) => item.label === "Weight") && "monthAhead",
  ].filter(Boolean);
  const weightText = JSON.stringify({
    changes: models.narrative?.changes,
    monthAhead: models.narrative?.monthAhead,
  });

  return Object.freeze({
    schemaVersion: "monthly_locked_section_role_inventory_v1",
    sections: Object.freeze(sections),
    heroSummary: Object.freeze(heroSummary),
    weight: Object.freeze({
      storyId: weightCandidate?.storyId ?? null,
      selected: weightCandidate?.included === true,
      contextualLocations: weightLocations,
      standaloneSection: false,
      prohibitedIndependentClaim: /(?:lean.mass gain|fat gain|maintenance success|strategy failure)(?: is| was)? (?:confirmed|proven)/i.test(weightText),
    }),
    complete: Object.values(sections).every((entry) => entry.present),
    heroSummaryComplete: Object.values(heroSummary).every((entry) => entry.present),
  });
}
