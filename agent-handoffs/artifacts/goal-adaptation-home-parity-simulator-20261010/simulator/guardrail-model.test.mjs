// Unit tests for guardrail-model.js. Usage: node guardrail-model.test.mjs
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const ctx = { module: { exports: {} } }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(dir, 'guardrail-model.js'), 'utf8'), ctx);
const G = ctx.module.exports; const r = []; const eq = (n, got, want) => r.push({ name: n, pass: JSON.stringify(got) === JSON.stringify(want), got, want });
const goal = { enabled: true, min: 8, max: 9 }; const base = { goal, phase: null };
eq('keep → unchanged', G.grPropose(base, { mode: 'keep' }), { goal, phase: null });
eq('change phase-only → goal kept, phase override', G.grPropose(base, { mode: 'change', min: 8, max: 10, scope: 'phase' }), { goal, phase: { enabled: true, min: 8, max: 10, scope: 'phase' } });
eq('change goal → goal replaced, no override', G.grPropose(base, { mode: 'change', min: 8, max: 10, scope: 'goal' }), { goal: { enabled: true, min: 8, max: 10 }, phase: null });
eq('remove goal → disabled', G.grPropose(base, { mode: 'remove', scope: 'goal' }).goal.enabled, false);
eq('remove phase → goal kept, phase disabled', [G.grPropose(base, { mode: 'remove', scope: 'phase' }).goal.max, G.grPropose(base, { mode: 'remove', scope: 'phase' }).phase.enabled], [9, false]);
eq('text', [G.grText(goal), G.grText({ enabled: false }), G.grText({ enabled: true, min: 8, max: 11.5 })].map((x) => x.replace(/\u2060/g, '')), ['8–9%', 'None', '8–11.5%']);
const v = (ctx2, e) => G.grValidate(ctx2, e, G.grPropose(base, e));
eq('inverted range error', v({ kind: 'lean', bodyFat: 9.7, target: 9 }, { mode: 'change', min: 10, max: 9.5, scope: 'phase' }).ok, false);
eq('lean target above guardrail max → error', v({ kind: 'lean', bodyFat: 9.7, target: 9.5 }, { mode: 'keep' }).ok, false);
eq('lean target 9.0 within 8–9 → ok', v({ kind: 'lean', bodyFat: 9.7, target: 9 }, { mode: 'keep' }).ok, true);
eq('lean target ≥ current body fat → error', v({ kind: 'lean', bodyFat: 9.7, target: 9.7 }, { mode: 'change', min: 8, max: 10, scope: 'phase' }).ok, false);
eq('lean target 9.5 with phase guardrail 8–10 → ok', v({ kind: 'lean', bodyFat: 9.7, target: 9.5 }, { mode: 'change', min: 8, max: 10, scope: 'phase' }).ok, true);
eq('keep building at 9.7% with firm 8–9 → incompatible', v({ kind: 'keepBuilding', bodyFat: 9.7 }, { mode: 'keep' }).ok, false);
eq('keep building with 8–11.5 → ok', v({ kind: 'keepBuilding', bodyFat: 9.7 }, { mode: 'change', min: 8, max: 11.5, scope: 'phase' }).ok, true);
eq('keep building with guardrail removed for phase → ok + warning', [v({ kind: 'keepBuilding', bodyFat: 9.7 }, { mode: 'remove', scope: 'phase' }).ok, v({ kind: 'keepBuilding', bodyFat: 9.7 }, { mode: 'remove', scope: 'phase' }).warnings.length > 0], [true, true]);
eq('resume at 8.9% with goal 8–9 → ok', v({ kind: 'resume', bodyFat: 8.9 }, { mode: 'keep' }).ok, true);
eq('resume at 8.9% with new goal 7–8.5 → incompatible', v({ kind: 'resume', bodyFat: 8.9 }, { mode: 'change', min: 7, max: 8.5, scope: 'goal' }).ok, false);
eq('out of bounds 3–9 → error', v({ kind: 'lean', bodyFat: 9.7, target: 9 }, { mode: 'change', min: 3, max: 9, scope: 'goal' }).ok, false);
// Phase-target alignment (goal-wide change keeps the leaning phase pointed at the new range)
const P = (e) => G.grPropose(base, e); const A = (e, bf = 9.7) => { const t = G.grAlignedTarget(P(e), bf, 9); return [t.value, t.source]; };
eq('aligned target: keep 8–9 → 9 (goal)', A({ mode: 'keep' }), [9, 'goal']);
eq('aligned target: goal 6.5–8.5 → 8.5 (goal)', A({ mode: 'change', min: 6.5, max: 8.5, scope: 'goal' }), [8.5, 'goal']);
eq('aligned target: phase-only 6.5–8.5 → 8.5 (phase, lower than goal 9)', A({ mode: 'change', min: 6.5, max: 8.5, scope: 'phase' }), [8.5, 'phase']);
eq('aligned target: phase-only 8–10 → 9 (goal still lower)', A({ mode: 'change', min: 8, max: 10, scope: 'phase' }), [9, 'goal']);
eq('aligned target: goal 8–10 at 9.7% → 9.5 (already inside, just below now)', A({ mode: 'change', min: 8, max: 10, scope: 'goal' }), [9.5, 'belowNow']);
eq('aligned target: goal removed → previous 9 kept', A({ mode: 'remove', scope: 'goal' }), [9, 'previous']);
eq('aligned target never conflicts (goal 6.5–8.5)', G.grValidate({ kind: 'lean', bodyFat: 9.7, target: A({ mode: 'change', min: 6.5, max: 8.5, scope: 'goal' })[0] }, { mode: 'change', min: 6.5, max: 8.5, scope: 'goal' }, P({ mode: 'change', min: 6.5, max: 8.5, scope: 'goal' })).ok, true);
eq('step below 9.7 → 9.5; 9.5 → 9', [G.grStepBelow(9.7), G.grStepBelow(9.5)], [9.5, 9]);
// Repeated stepper edits never invert or leave bounds
let e = { mode: 'keep', min: 8, max: 9 }; for (const [k, dl] of [['min', -0.5], ['min', -0.5], ['min', -0.5], ['max', -0.5]]) e = G.grStep(e, k, dl);
eq('8–9 → lower ×3, upper ×1 → 6.5–8.5', [e.mode, e.min, e.max], ['change', 6.5, 8.5]);
eq('upper pushed below lower moves lower with it', [G.grStep({ min: 8, max: 8.5 }, 'max', -0.5).min, G.grStep({ min: 8, max: 8.5 }, 'max', -0.5).max], [7.5, 8]);
eq('lower pushed above upper moves upper with it', [G.grStep({ min: 8, max: 8.5 }, 'min', 0.5).min, G.grStep({ min: 8, max: 8.5 }, 'min', 0.5).max], [8.5, 9]);
eq('bounds clamp at 4 and 20', [G.grStep({ min: 4, max: 5 }, 'min', -0.5).min, G.grStep({ min: 18, max: 20 }, 'max', 0.5).max], [4, 20]);
// Conflict codes drive one-tap fixes
eq('custom target 9 vs new goal 6.5–8.5 → targetAboveRange', G.grValidate({ kind: 'lean', bodyFat: 9.7, target: 9 }, { mode: 'change', min: 6.5, max: 8.5, scope: 'goal' }, P({ mode: 'change', min: 6.5, max: 8.5, scope: 'goal' })).conflicts, ['targetAboveRange']);
eq('keep building 8–9 at 9.7% → aboveUpperWhileBuilding', G.grValidate({ kind: 'keepBuilding', bodyFat: 9.7 }, { mode: 'keep' }, P({ mode: 'keep' })).conflicts, ['aboveUpperWhileBuilding']);
eq('custom target 9.5 inside leaning-only 8–10 but above goal 9 → allowed with warning', (() => { const x = G.grValidate({ kind: 'lean', bodyFat: 9.7, target: 9.5 }, { mode: 'change', min: 8, max: 10, scope: 'phase' }, P({ mode: 'change', min: 8, max: 10, scope: 'phase' })); return [x.ok, x.warnings.some((w) => w.includes('above your goal'))]; })(), [true, true]);
const failed = r.filter((x) => !x.pass);
fs.writeFileSync(path.join(dir, 'guardrail-model.test-results.json'), JSON.stringify(r, null, 2));
console.log(`${r.length - failed.length}/${r.length} guardrail checks passed`); failed.forEach((f) => console.log('FAIL', f.name, JSON.stringify(f.got), JSON.stringify(f.want)));
process.exitCode = failed.length ? 1 : 0;
