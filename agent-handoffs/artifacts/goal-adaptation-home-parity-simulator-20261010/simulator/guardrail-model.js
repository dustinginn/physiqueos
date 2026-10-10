// ---------------------------------------------------------------------------
// Body-fat guardrail model for the Goal Adaptation simulator (simulation only).
// Two scopes, kept separate:
//   goal  — the overarching goal's guardrail (applies across phases, goes forward)
//   phase — a temporary override for the current/next phase only; it expires
//           when that phase ends and the goal guardrail applies again.
// A leaning phase's completion target ("phase ends at ≤ X%") is a different
// thing again: it is the phase objective, not a guardrail.
// ---------------------------------------------------------------------------
const GR_LIMITS = { min: 4, max: 20, gap: 0.5, step: 0.5 };
const grFmt = (v) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
const WJ = '\u2060'; // word joiner: keeps a range like 8–9% on one line
function grText(g) { return g && g.enabled !== false ? `${grFmt(g.min)}${WJ}–${WJ}${grFmt(g.max)}%` : 'None'; }
function grEffective(goal, phase) { return phase || goal; }
function grSame(a, b) { if (!a || !b) return a === b; if ((a.enabled === false) || (b.enabled === false)) return (a.enabled === false) === (b.enabled === false); return a.min === b.min && a.max === b.max; }

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
  const errors = [], warnings = [];
  const bf = context.bodyFat;
  if (edit && edit.mode === 'change') {
    if (edit.max - edit.min < GR_LIMITS.gap) errors.push('Upper limit must be at least 0.5% above the lower limit.');
    if (edit.min < GR_LIMITS.min || edit.max > GR_LIMITS.max) errors.push(`Choose a range between ${GR_LIMITS.min}% and ${GR_LIMITS.max}%.`);
  }
  const eff = grEffective(proposed.goal, proposed.phase);
  const building = ['keepBuilding', 'resume', 'custom'].includes(context.kind);
  if (building && eff.enabled !== false && bf > eff.max) errors.push(`You’re at ${grFmt(bf)}%, above the ${grFmt(eff.max)}% upper limit. Building would move further away: raise the upper limit, remove the guardrail for this phase, or lean out first.`);
  if (['lean', 'continueLean'].includes(context.kind) && context.target != null) {
    if (context.target >= bf) errors.push(`The phase target (${grFmt(context.target)}%) is at or above your current ${grFmt(bf)}%, so the phase would end immediately.`);
    if (eff.enabled !== false && context.target > eff.max) errors.push(`The phase target (${grFmt(context.target)}%) is above the guardrail’s ${grFmt(eff.max)}% upper limit, so the phase would end outside your range.`);
    if (eff.enabled !== false && context.target < eff.min) warnings.push(`The phase target is below the guardrail’s ${grFmt(eff.min)}% lower limit.`);
  }
  if (edit && edit.mode === 'remove') warnings.push(edit.scope === 'goal' ? 'Without a guardrail, body fat is still shown but no longer triggers reviews, for this goal going forward.' : 'No guardrail during this phase. The goal guardrail returns when the phase ends.');
  if (proposed.phase && proposed.phase.enabled !== false && edit && edit.mode === 'change' && edit.scope === 'phase') warnings.push(`Applies to this phase only. The goal guardrail (${grText(proposed.goal)}) returns afterwards.`);
  return { errors, warnings, ok: errors.length === 0 };
}
if (typeof module !== 'undefined') module.exports = { GR_LIMITS, grFmt, grText, grEffective, grSame, grPropose, grValidate };
