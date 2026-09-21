// Current cadence beats stale carry-forward.
//
// V3 may carry a prior briefing's observations forward so a capability the
// current briefing could not observe is not silently absent. It must never let
// an older cadence observation fill a capability that the CURRENT briefing
// already covers with usable evidence. Carry-forward is for absent
// capabilities only.

export const CADENCE_OBSERVATION_PREFIX = "cadence_v3|";

export function supersedeStaleCadenceObservations({
  stored = [],
  current = [],
  currentArtifactId = null,
} = {}) {
  // A capability is covered by the current briefing when it supplies usable
  // evidence for it (capability coverage), and any older observation whose
  // window falls inside a current window for the same capability is covered
  // even when the current evidence is thin (window coverage).
  const covered = new Map();
  const currentWindows = new Map();
  for (const observation of current) {
    if (!isCadenceObservation(observation)) continue;
    if (observation.status === "superseded" || observation.status === "retracted") continue;
    for (const measurement of observation.capabilities ?? []) {
      const family = capabilityFamily(measurement.capabilityId);
      if (isUsable(observation) && !covered.has(family)) {
        covered.set(family, observation.observationId);
      }
      const windows = currentWindows.get(family) ?? [];
      windows.push({ window: observation.evidenceWindow, observationId: observation.observationId });
      currentWindows.set(family, windows);
    }
  }
  const superseded = [];
  const windowScoped = current.filter((observation) => isCadenceObservation(observation) &&
    (observation.capabilities ?? []).some((measurement) =>
      WINDOW_SCOPED_FAMILIES.has(capabilityFamily(measurement.capabilityId))));
  const currentHull = hullOf(windowScoped.map((observation) => observation.evidenceWindow));
  const currentHullSource = windowScoped[0]?.observationId ?? null;
  const kept = stored.filter((observation) => {
    if (!isCadenceObservation(observation)) return true;
    // A regenerated artifact replaces its own prior version entirely; leftovers
    // from the earlier version are never carried into the new one.
    if (currentArtifactId && observationArtifactId(observation) === currentArtifactId) {
      superseded.push(Object.freeze({
        observationId: observation.observationId,
        capabilityId: observation.capabilities?.[0]?.capabilityId ?? null,
        supersededBy: null,
        reason: "regenerated_artifact_replaces_prior_version",
      }));
      return false;
    }
    for (const measurement of observation.capabilities ?? []) {
      const family = capabilityFamily(measurement.capabilityId);
      // Window-scoped measurements (Energy, Nutrition and Activity coverage) that
      // describe a period the current briefing fully contains are stale by
      // construction, whether or not the current briefing restates them.
      if (WINDOW_SCOPED_FAMILIES.has(family) && currentHull && windowContains(currentHull, observation.evidenceWindow)) {
        superseded.push(Object.freeze({
          observationId: observation.observationId,
          capabilityId: measurement.capabilityId,
          supersededBy: currentHullSource,
          reason: "current_window_contains_observation_window",
        }));
        return false;
      }
      const byCapability = covered.get(family);
      const byWindow = (currentWindows.get(family) ?? [])
        .find((item) => windowContains(item.window, observation.evidenceWindow));
      if (!byCapability && !byWindow) continue;
      superseded.push(Object.freeze({
        observationId: observation.observationId,
        capabilityId: measurement.capabilityId,
        supersededBy: byCapability ?? byWindow.observationId,
        reason: byCapability ? "current_window_covers_capability" : "current_window_contains_observation_window",
      }));
      return false;
    }
    return true;
  });
  return Object.freeze({ observations: kept, superseded: Object.freeze(superseded) });
}

// Energy execution, estimate, pairing and tension describe one measurement of
// one window. A current Energy estimate supersedes every prior-window member of
// that family, including a prior tension the current window does not restate.
const WINDOW_SCOPED_FAMILIES = new Set(["energy_family", "execution.nutrition", "execution.activity"]);

function hullOf(windows) {
  const usable = windows.filter((window) => window?.startDate && window?.endDate);
  if (!usable.length) return null;
  return {
    startDate: usable.map((window) => String(window.startDate).slice(0, 10)).sort()[0],
    endDate: usable.map((window) => String(window.endDate).slice(0, 10)).sort().at(-1),
  };
}

export function capabilityFamily(capabilityId) {
  return /^(execution\.energy_|strategy\.energy_)/.test(String(capabilityId)) ? "energy_family" : capabilityId;
}

export function isCadenceObservation(observation) {
  return String(observation?.observationId ?? "").startsWith(CADENCE_OBSERVATION_PREFIX);
}

export function observationArtifactId(observation) {
  return String(observation?.observationId ?? "").split("|")[1] ?? null;
}

function windowContains(outer, inner) {
  if (!outer?.startDate || !outer?.endDate || !inner?.startDate || !inner?.endDate) return false;
  return String(inner.startDate).slice(0, 10) >= String(outer.startDate).slice(0, 10) &&
    String(inner.endDate).slice(0, 10) <= String(outer.endDate).slice(0, 10);
}

function isUsable(observation) {
  return observation?.status !== "superseded" && observation?.status !== "retracted" &&
    observation?.quality?.status !== "insufficient";
}
