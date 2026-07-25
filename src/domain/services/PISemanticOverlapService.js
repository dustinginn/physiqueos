export const PI_SEMANTIC_OVERLAP_VERSION = "pi_semantic_overlap_v1";

const HIGH_AUTHORITY = new Set([
  "body_fat_guardrail",
  "dexa_event",
  "photo_event",
  "goal_completion",
  "goal_transition",
]);

export function assessPISemanticOverlap(left, right) {
  if (!left || !right) return result("none", []);
  if (HIGH_AUTHORITY.has(left.candidateType) || HIGH_AUTHORITY.has(right.candidateType)) {
    return result("higher_authority_owned", ["event_or_body_composition_authority"]);
  }
  const leftDomains = domains(left);
  const rightDomains = domains(right);
  const sharedDomains = leftDomains.filter((domain) => rightDomains.includes(domain));
  if (!sharedDomains.length) return result("none", []);
  if (identity(left) === identity(right)) {
    return result("redundant", ["same_semantic_identity"]);
  }
  const sameTraining = sharedDomains.includes("training") &&
    trainingMeaning(left) === trainingMeaning(right);
  const sameLimitation = limitationFamilies(left).some((item) =>
    limitationFamilies(right).includes(item)
  );
  if (sameTraining && sameLimitation) {
    return result("redundant", ["same_training_meaning", "same_evidence_limitation"]);
  }
  if (sameTraining || sameLimitation) {
    return result("partial_overlap", [
      ...(sameTraining ? ["same_training_meaning"] : []),
      ...(sameLimitation ? ["same_evidence_limitation"] : []),
    ]);
  }
  return result("complementary", ["shared_domain_distinct_meaning"]);
}

export function suppressPISemanticOverlap(entries = []) {
  const selected = [];
  const suppressed = [];
  for (const entry of entries) {
    const conflicts = selected.map((prior) => ({
      prior,
      assessment: assessPISemanticOverlap(prior.candidate ?? prior, entry.candidate ?? entry),
    }));
    const duplicate = conflicts.find(({ assessment }) =>
      ["redundant", "higher_authority_owned"].includes(assessment.state)
    );
    if (duplicate) {
      suppressed.push({ ...entry, overlap: duplicate.assessment });
    } else {
      selected.push(entry);
    }
  }
  return Object.freeze({ selected, suppressed });
}

function result(state, reasons) {
  return Object.freeze({
    schemaVersion: PI_SEMANTIC_OVERLAP_VERSION,
    state,
    reasons: [...new Set(reasons)].sort(),
  });
}
function domains(value) {
  return [...new Set(value.participatingDomains ?? value.candidate?.participatingDomains ?? [])].sort();
}
function identity(value) {
  return value.semanticFamily ?? value.id ?? value.sourceId ?? "";
}
function trainingMeaning(value) {
  const data = value.explanationData ?? value.candidate?.explanationData ?? {};
  return data.trainingStatus ?? data.trainingDirection ?? value.direction ?? "";
}
function limitationFamilies(value) {
  return (value.limitations ?? value.candidate?.limitations ?? []).map((item) => {
    if (/energy|paired|rmr|expenditure/i.test(item)) return "energy_coverage";
    if (/nutrition|protein/i.test(item)) return "nutrition_coverage";
    return item;
  });
}
