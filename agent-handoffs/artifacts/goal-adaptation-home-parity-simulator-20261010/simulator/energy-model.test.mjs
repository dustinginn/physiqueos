// Arithmetic regression tests for energy-model.js. Usage: node energy-model.test.mjs
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const ctx = { module: { exports: {} } }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(dir, 'energy-model.js'), 'utf8'), ctx);
const E = ctx.module.exports; const results = []; const eq = (name, got, want) => results.push({ name, pass: JSON.stringify(got) === JSON.stringify(want), got, want });
const A = E.cloneScenario('A'), B = E.cloneScenario('B'), C = E.cloneScenario('C');
// Scenario A: Founder illustrative with DEXA
eq('A planning maintenance = calibrated 2117', E.planningMaintenance(A).value, 2117);
eq('A planning source', E.planningMaintenance(A).source, 'calibrated');
const tA = E.targetsFromBalance(A, -500, 100);
eq('A −500 & +100 → eat 1717', tA.eat, 1717); eq('A activity goal 800+100 = 900', tA.goal, 900); eq('A derived balance −500', tA.balance, -500);
eq('Founder regression: naive RMR 1850 + active 900 − intake 1700 = 1050', E.naiveDifference(A, { eat: 1700, goal: 900 }), 1050);
eq('naive at 1717 = 1033', E.naiveDifference(A, { eat: 1717, goal: 900 }), 1033);
eq('A bottom-up maintenance (1850+800)/0.9 = 2944', E.bottomUp(A).value, 2944);
eq('A gap bottom-up − calibrated = 827', E.reconciliation(A, { eat: 1717, goal: 900, added: 100 }).gap, 827);
eq('A bottom-up difference incl. digestion = −1205', E.bottomUpDifference(A, { eat: 1717, goal: 900 }), -1205);
eq('A approved base plan 2500/800 derived balance +383', E.derivedBalance(A, { eat: 2500, added: 0 }), 383);
eq('A floor 1600 (25% below 2117, rounded up)', E.floorFor(2117), 1600);
const fl = E.targetsFromBalance(A, -750, 0); eq('A −750 limited to floor 1600, balance −517', [fl.eat, fl.limited, fl.balance], [1600, true, -517]);
const t1 = E.targetsFromBalance(A, -450, 100), t3 = E.targetsFromBalance(A, -450, 300);
eq('1:1: +200 activity → +200 eat and +200 goal', [t3.eat - t1.eat, t3.goal - t1.goal, t3.balance], [200, 200, -450]);
eq('A suggested −450/+100 → 1767/900', [t1.eat, t1.goal], [1767, 900]);
// Scenario B: no DEXA, equation RMR, not yet calibrated
eq('B Mifflin–St Jeor (male, 38, 193 cm, 81.2 kg) = 1833', B.rmr, 1833);
eq('B provisional planning maintenance 2926', [E.planningMaintenance(B).value, E.planningMaintenance(B).source], [2926, 'provisional']);
eq('B range is wide (±426)', [E.planningMaintenance(B).low, E.planningMaintenance(B).high], [2500, 3352]);
const tB = E.targetsFromBalance(B, -450, 100); eq('B −450/+100 → 2576/900', [tB.eat, tB.goal], [2576, 900]);
eq('B base plan 2500/800 derived balance −426', E.derivedBalance(B, { eat: 2500, added: 0 }), -426);
// Scenario C: no wearable, partial logging
eq('C bottom-up = RMR × 1.4 = 2566', E.bottomUp(C).value, 2566);
eq('C cannot calibrate with partial logging', E.planningMaintenance({ ...C, calibrated: { value: 2300, low: 2150, high: 2450 } }).source, 'provisional');
const tC = E.targetsFromBalance(C, -450, 100); eq('C no activity goal, no extra activity; eat 2116', [tC.goal, tC.added, tC.eat], [null, 0, 2116]);
eq('C naive difference unavailable without activity data', E.naiveDifference(C, { eat: 2116, goal: null }), null);
// Calibration update keeps approved targets, moves derived balance
const A2 = { ...A, calibrated: { ...A.calibrated, value: 1917 } };
eq('after calibration to 1917, approved 1767/+100 shows balance −250', E.derivedBalance(A2, { eat: 1767, added: 100 }), -250);
const failed = results.filter((r) => !r.pass);
fs.writeFileSync(path.join(dir, 'energy-model.test-results.json'), JSON.stringify(results, null, 2));
console.log(`${results.length - failed.length}/${results.length} arithmetic checks passed`); failed.forEach((f) => console.log('FAIL', f.name, 'got', JSON.stringify(f.got), 'want', JSON.stringify(f.want)));
process.exitCode = failed.length ? 1 : 0;
