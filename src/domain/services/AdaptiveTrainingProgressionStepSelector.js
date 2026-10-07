const KNOWN_LOAD_SEMANTICS = new Set([
  "bodyweight",
  "external_load",
  "weighted_bodyweight",
]);

/**
 * Selects one evidence-supported step after progression eligibility has already
 * passed. This function does not decide eligibility and does not persist learned
 * state; it summarizes the supplied exact-context canonical evidence on read.
 */
export function selectAdaptiveTrainingProgressionStep(entries = []) {
  const latest = entries[0] ?? null;
  const base = createBaseStep(latest);
  if (!latest) return selection(base, false, false);

  const currentProfile = uniformProfile(latest);
  if (!currentProfile) {
    return selection({
      ...base,
      reasonCode: "non_uniform_current_profile",
    }, false, false);
  }
  if (!isKnownEntryContext(latest)) {
    return selection({
      ...base,
      currentRepTarget: currentProfile.reps,
      reasonCode: "ambiguous_load_semantics",
    }, false, false);
  }

  const runs = createContiguousLoadRuns(entries);
  const currentRun = compatibleCurrentRun(runs.at(-1)?.entries ?? [], latest);
  const previousRun = runs.at(-2) ?? null;
  const trajectory = summarizeRepTrajectory(currentRun);
  const rebuild = summarizeImmediateRebuild({
    currentRun,
    previousRun,
  });
  const loadEvidence = summarizeCompatibleLoadEvidence(runs, latest, currentProfile);

  const loadSupported = loadEvidence.uniqueRepeatedIncrement !== null &&
    !loadEvidence.competingRecurringIncrements &&
    !loadEvidence.regressionConflict &&
    !rebuild.unresolved &&
    latest.semanticLoad > 0 &&
    loadEvidence.currentMeetsTriggerProfiles;
  const repSupported = !loadEvidence.competingRecurringIncrements &&
    trajectory.nonRegressingAdvance &&
    (rebuild.unresolved || !loadSupported) &&
    Number.isSafeInteger(currentProfile.reps) &&
    currentProfile.reps >= 0 &&
    Number.isSafeInteger(currentProfile.reps + 1);

  if (repSupported && !loadSupported) {
    return selection({
      ...base,
      kind: "reps",
      currentRepTarget: currentProfile.reps,
      nextLoad: latest.semanticLoad,
      nextRepTarget: currentProfile.reps + 1,
      reasonCode: "same_load_rep_rebuild_supported",
      confidence: "supported",
    }, true, false);
  }
  if (!repSupported && loadSupported) {
    return selection({
      ...base,
      kind: "load",
      currentRepTarget: currentProfile.reps,
      nextLoad: latest.semanticLoad + loadEvidence.uniqueRepeatedIncrement,
      nextRepTarget: null,
      reasonCode: "repeated_compatible_load_increment_supported",
      confidence: "supported",
    }, false, true);
  }
  if (repSupported && loadSupported) {
    return selection({
      ...base,
      currentRepTarget: currentProfile.reps,
      reasonCode: "competing_rep_and_load_evidence",
    }, true, true);
  }
  return selection({
    ...base,
    currentRepTarget: currentProfile.reps,
    reasonCode: loadEvidence.hasCompatibleTransitions || trajectory.hasComparableHistory
      ? "no_supported_step"
      : "insufficient_compatible_history",
  }, false, false);
}

function createBaseStep(latest) {
  return {
    kind: "none",
    currentLoad: latest?.semanticLoad ?? null,
    nextLoad: null,
    currentRepTarget: null,
    nextRepTarget: null,
    loadType: latest?.loadSemantics ?? "unknown",
    unit: latest?.semanticUnit ?? latest?.unit ?? null,
    reasonCode: "no_supported_step",
    confidence: "insufficient",
  };
}

function selection(progressionStep, repSupported, loadSupported) {
  return Object.freeze({
    loadSupported,
    progressionStep: Object.freeze(progressionStep),
    repSupported,
  });
}

function createContiguousLoadRuns(entries) {
  const chronological = [...entries].reverse();
  const runs = [];
  chronological.forEach((entry) => {
    const current = runs.at(-1);
    if (current && sameSemanticLoadContext(current.entries.at(-1), entry)) {
      current.entries.push(entry);
    } else {
      runs.push({ entries: [entry] });
    }
  });
  return runs;
}

function compatibleCurrentRun(entries, latest) {
  const compatible = [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!sameSemanticLoadContext(entry, latest) || entry.sets.length !== latest.sets.length ||
      !hasUniformSetLoadContext(entry)) break;
    compatible.unshift(entry);
  }
  return compatible;
}

function summarizeRepTrajectory(entries) {
  const repFloors = entries.map((entry) => Math.min(...entry.sets.map((set) => set.reps)));
  const nonRegressing = repFloors.every((reps, index) => index === 0 || reps >= repFloors[index - 1]);
  return {
    hasComparableHistory: repFloors.length >= 2,
    nonRegressingAdvance: repFloors.length >= 2 && nonRegressing && repFloors.at(-1) > repFloors[0],
  };
}

function summarizeImmediateRebuild({ currentRun, previousRun }) {
  const before = uniformProfile(previousRun?.entries.at(-1));
  const first = uniformProfile(currentRun[0]);
  const latest = uniformProfile(currentRun.at(-1));
  const compatibleProfiles = before && first && latest &&
    before.setCount === first.setCount && first.setCount === latest.setCount;
  const transitionChangedLoad = previousRun && currentRun.length &&
    !sameSemanticLoadContext(previousRun.entries.at(-1), currentRun[0]);
  const causedRepDrop = Boolean(compatibleProfiles && transitionChangedLoad && first.reps < before.reps);
  return {
    unresolved: Boolean(causedRepDrop && latest.reps < before.reps),
  };
}

function summarizeCompatibleLoadEvidence(runs, latest, currentProfile) {
  const compatibleTransitions = [];
  for (let index = 1; index < runs.length; index += 1) {
    const fromRun = runs[index - 1];
    const toRun = runs[index];
    const beforeEntry = fromRun.entries.at(-1);
    const firstAfterEntry = toRun.entries[0];
    const before = uniformProfile(beforeEntry);
    const firstAfter = uniformProfile(firstAfterEntry);
    if (!before || !firstAfter || !isKnownEntryContext(beforeEntry) || !isKnownEntryContext(firstAfterEntry)) continue;
    if (before.setCount !== currentProfile.setCount || firstAfter.setCount !== currentProfile.setCount) continue;
    if (beforeEntry.loadSemantics !== latest.loadSemantics ||
      firstAfterEntry.loadSemantics !== latest.loadSemantics ||
      beforeEntry.semanticUnit !== latest.semanticUnit ||
      firstAfterEntry.semanticUnit !== latest.semanticUnit) continue;
    const increment = firstAfterEntry.semanticLoad - beforeEntry.semanticLoad;
    if (!(increment > 0)) continue;
    compatibleTransitions.push({
      beforeReps: before.reps,
      increment,
      regressionConflict: hasUnresolvedWithinRunRegression(toRun.entries),
    });
  }

  const recurrence = new Map();
  compatibleTransitions.forEach(({ increment }) => {
    const key = stableNumberKey(increment);
    const current = recurrence.get(key) ?? { count: 0, increment };
    recurrence.set(key, { count: current.count + 1, increment: current.increment });
  });
  const recurring = [...recurrence.values()].filter(({ count }) => count >= 2);
  const uniqueRepeatedIncrement = recurring.length === 1 ? recurring[0].increment : null;
  const relevant = uniqueRepeatedIncrement === null
    ? []
    : compatibleTransitions.filter(({ increment }) => stableNumberKey(increment) === stableNumberKey(uniqueRepeatedIncrement));
  const latestReps = currentProfile.reps;

  return {
    competingRecurringIncrements: recurring.length > 1,
    currentMeetsTriggerProfiles: relevant.length >= 2 && relevant.every(({ beforeReps }) => latestReps >= beforeReps),
    hasCompatibleTransitions: compatibleTransitions.length > 0,
    regressionConflict: relevant.some((transition) => transition.regressionConflict),
    uniqueRepeatedIncrement,
  };
}

function hasUnresolvedWithinRunRegression(entries) {
  const profiles = entries.map(uniformProfile).filter(Boolean);
  if (profiles.length < 2) return false;
  const terminal = profiles.at(-1).reps;
  return profiles.slice(0, -1).some(({ reps }) => reps > terminal);
}

function uniformProfile(entry) {
  if (!entry?.sets?.length) return null;
  const reps = entry.sets[0].reps;
  if (!Number.isSafeInteger(reps) || reps < 0 || entry.sets.some((set) => set.reps !== reps)) return null;
  return { reps, setCount: entry.sets.length };
}

function hasUniformSetLoadContext(entry) {
  return entry?.sets?.length > 0 && entry.sets.every((set) =>
    set.loadSemantics === entry.loadSemantics &&
    set.semanticLoad === entry.semanticLoad &&
    set.semanticUnit === entry.semanticUnit
  );
}

function isKnownEntryContext(entry) {
  return KNOWN_LOAD_SEMANTICS.has(entry?.loadSemantics) &&
    entry.semanticLoad !== null && Number.isFinite(entry.semanticLoad) &&
    hasUniformSetLoadContext(entry);
}

function sameSemanticLoadContext(left, right) {
  return left?.loadSemantics === right?.loadSemantics &&
    left?.semanticLoad === right?.semanticLoad &&
    left?.semanticUnit === right?.semanticUnit;
}

function stableNumberKey(value) {
  return Number(value).toFixed(8);
}
