// ---------------------------------------------------------------------------
// Body-fat guardrail model for the Goal Adaptation simulator (simulation only).
// Two scopes, kept separate:
//   goal  — the overarching goal's guardrail (applies across phases, goes forward)
//   phase — a temporary override for the current/next phase only; it expires
//           when that phase ends and the goal guardrail applies again.
// A leaning phase's completion target ("phase ends at ≤ X%") is a different
// thing again: it is the phase objective, not a guardrail. By default it is
// aligned to the lowest upper limit that will apply (so the phase returns the
// user to their range) and follows guardrail edits until the user sets it
// by hand; a hand-set target is never overwritten silently.
// ---------------------------------------------------------------------------
const GR_LIMITS = { min: 4, max: 20, gap: 0.5, step: 0.5 };
const grFmt = (v) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
const WJ = '\u2060'; // word joiner: keeps a range like 8–9% on one line
function grText(g) { return g && g.enabled !== false ? `${grFmt(g.min)}${WJ}–${WJ}${grFmt(g.max)}%` : 'None'; }
function grEffective(goal, phase) { return phase || goal; }
function grSame(a, b) { if (!a || !b) return a === b; if ((a.enabled === false) || (b.enabled === false)) return (a.enabled === false) === (b.enabled === false); return a.min === b.min && a.max === b.max; }

// Largest 0.5% step strictly below the current body fat.
const grStepBelow = (bf) => Math.ceil(bf * 2 - 1e-9) / 2 - 0.5;
// Default phase target for proposed guardrails. fallback: target to keep when no guardrail applies.
// source: 'goal' | 'phase' (aligned to that upper limit) | 'previous' (no guardrail; previous target kept)
//         | 'belowNow' (already inside the range, so just below current body fat)
function grAlignedTarget(proposed, bodyFat, fallback) {
  const on = (g) => g && g.enabled !== false;
  const goalMax = on(proposed.goal) ? proposed.goal.max : Infinity;
  const phaseMax = on(proposed.phase) ? proposed.phase.max : Infinity;
  let value = Math.min(goalMax, phaseMax); let source = phaseMax < goalMax ? 'phase' : 'goal';
  if (value === Infinity) { value = fallback; source = 'previous'; }
  if (value >= bodyFat) { value = Math.max(GR_LIMITS.min, grStepBelow(bodyFat)); source = 'belowNow'; }
  return { value, source };
}
// One stepper tap. Never produces an inverted or out-of-bounds range: pushing one limit past the
// other moves the other limit with it, so repeated edits never dead-end.
function grStep(edit, key, delta) {
  const e = { ...edit, mode: 'change' }; const L = GR_LIMITS;
  e[key] = Math.round((e[key] + delta) * 2) / 2;
  e.min = Math.max(L.min, Math.min(L.max - L.gap, e.min)); e.max = Math.max(L.min + L.gap, Math.min(L.max, e.max));
  if (e.max - e.min < L.gap) { if (key === 'min') e.max = e.min + L.gap; else e.min = e.max - L.gap; }
  return e;
}
// edit: { mode: 'keep' | 'change' | 'remove', min, max, scope: 'phase' | 'goal' }
// base: { goal, phase } guardrails that would apply to the phase being set up if nothing changed
function grPropose(base, edit) {
  const goal = { ...base.goal }; let phase = base.phase ? { ...base.phase } : null;
  if (!edit || edit.mode === 'keep') return { goal, phase };
  const next = edit.mode === 'remove' ? { enabled: false } : { enabled: true, min: edit.min, max: edit.max };
  if (edit.scope === 'goal') return { goal: next, phase: null };
  return { goal, phase: { ...next, scope: 'phase' } };
}
// context: { kind: 'lean' | 'keepBuilding' | 'resume' | 'maintain' | 'continueLean' | 'custom', bodyFat, target }
function grValidate(context, edit, proposed) {
  const errors = [], warnings = [], conflicts = [];
  const bf = context.bodyFat;
  if (edit && edit.mode === 'change') {
    if (edit.max - edit.min < GR_LIMITS.gap) errors.push('Upper limit must be at least 0.5% above the lower limit.');
    if (edit.min < GR_LIMITS.min || edit.max > GR_LIMITS.max) errors.push(`Choose a range between ${GR_LIMITS.min}% and ${GR_LIMITS.max}%.`);
  }
  const eff = grEffective(proposed.goal, proposed.phase);
  const building = ['keepBuilding', 'resume', 'custom'].includes(context.kind);
  if (building && eff.enabled !== false && bf > eff.max) conflicts.push('aboveUpperWhileBuilding'), errors.push(`You’re at ${grFmt(bf)}%, above the ${grFmt(eff.max)}% upper limit. Building would move further away: raise the upper limit, remove the guardrail for this phase, or lean out first.`);
  if (['lean', 'continueLean'].includes(context.kind) && context.target != null) {
    if (context.target >= bf) conflicts.push('targetNotBelowNow'), errors.push(`The phase target (${grFmt(context.target)}%) is at or above your current ${grFmt(bf)}%, so the phase would end immediately.`);
    if (eff.enabled !== false && context.target > eff.max) conflicts.push('targetAboveRange'), errors.push(`The phase target (${grFmt(context.target)}%) is above the guardrail’s ${grFmt(eff.max)}% upper limit, so the phase would end outside your range.`);
    if (eff.enabled !== false && context.target < eff.min) warnings.push(`The phase target is below the guardrail’s ${grFmt(eff.min)}% lower limit.`);
    const g = proposed.goal; if (proposed.phase && g && g.enabled !== false && context.target > g.max && !(eff.enabled !== false && context.target > eff.max)) warnings.push(`The phase ends at ${grFmt(context.target)}%, above your goal’s ${grFmt(g.max)}% upper limit. Building can resume only inside the goal range, or after you change it.`);
  }
  if (edit && edit.mode === 'remove') warnings.push(edit.scope === 'goal' ? 'Without a guardrail, body fat is still shown but no longer triggers reviews, for this goal going forward.' : 'No guardrail during this phase. The goal guardrail returns when the phase ends.');
  return { errors, warnings, conflicts, ok: errors.length === 0 };
}
if (typeof module !== 'undefined') module.exports = { GR_LIMITS, grFmt, grText, grEffective, grSame, grPropose, grValidate, grStepBelow, grAlignedTarget, grStep };
