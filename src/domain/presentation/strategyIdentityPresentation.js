// Canonical Strategy/protocol identity (a mode string like "Phase Execution" or "Maintenance
// Calibration") is an internal record identity, not something a user should read verbatim. This
// module derives the user-facing identity from what the plan is actually doing — the active
// phase and its purpose — rather than echoing the internal mode name back. Canonical identity
// stays available wherever audit/editor behavior genuinely needs it (it is never renamed at the
// source); this only changes what gets displayed.

const ENERGY_MODE_IDENTITY = Object.freeze({
  "phase execution": {
    title: (phaseName) => phaseName ? `${phaseName} Energy Plan` : "Current Phase Energy Plan",
    planType: "Following the active phase's targets",
  },
  "maintenance calibration": {
    title: () => "Calorie Calibration",
    planType: "Adjusting gradually from weekly signals",
  },
});

export function describeEnergyStrategyIdentity({ mode, phaseName = null } = {}) {
  const entry = ENERGY_MODE_IDENTITY[String(mode ?? "").trim().toLowerCase()];
  if (!entry) return null;
  return { title: entry.title(phaseName), planType: entry.planType };
}
