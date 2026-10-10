// Arithmetic regression tests for energy-model.js. Usage: node energy-model.test.mjs
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const ctx = { module: { exports: {} } }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(dir, 'energy-model.js'), 'utf8'), ctx);
const E = ctx.module.exports; const results = []; const eq = (name, got, want) => results.push({ name, pass: JSON.stringify(got) === JSON.stringify(want), got, want });
const A = E.cloneScenario('A'), B = E.cloneScenario('B'), C = E.cloneScenario('C');
// Scenario A: Founder records (Oct 10 snapshot): maintenance from logged food and DEXA change
const ev = A.evidence;
eq('A: sparse cut month (9/28 logged) excluded, never imputed', [ev.excluded.length, ev.excluded[0].start, ev.excluded[0].intakeDays], [1, 'Jun 20', 9]);
eq('A: 3 building periods, 82 of 83 days logged', [ev.perPeriod.length, ev.logged, ev.days], [3, 82, 83]);
eq('A: mean logged intake 2,546 (monthly 2,349–2,714)', [ev.intake, Math.min(...ev.perPeriod.map((p) => p.intake)), Math.max(...ev.perPeriod.map((p) => p.intake))], [2546, 2349, 2714]);
eq('A: DEXA fat +4.6, lean +7.1, total +11.6 lb', [ev.dFat, ev.dLean, ev.dTotal], [4.6, 7.1, 11.6]);
eq('A: stored (4.6×4250 + 7.1×830)/83 = 307/day', ev.stored, 307);
eq('A: maintenance 2,546 − 307 → 2,240 (rounded to 10)', E.planningMaintenance(A).value, 2240);
eq('A: monthly maintenance 2,325 / 2,353 / 2,024 → range 2,020–2,350', [ev.perPeriod.map((p) => p.maintenance), E.planningMaintenance(A).low, E.planningMaintenance(A).high], [[2325, 2353, 2024], 2020, 2350]);
eq('A: usual activity = recorded mean 897 → 900, approved Move goal stays 800', [ev.activity, A.usual, A.approvedGoal], [897, 900, 800]);
eq('A: no 2,117 anywhere in the scenario', JSON.stringify(A).includes('2117'), false);
eq('A: maintenance below every month’s intake (gained weight in each)', ev.perPeriod.every((p) => p.maintenance < p.intake), true);
eq('A planning source calibrated (records)', [E.planningMaintenance(A).source, A.calibrated.source], ['calibrated', 'records']);
const tA = E.targetsFromBalance(A, -500, 100);
eq('A −500 & +100 → eat 2,240 − 500 + 100 = 1,840', tA.eat, 1840); eq('A activity goal 900 + 100 = 1,000', tA.goal, 1000); eq('A derived balance −500', tA.balance, -500);
eq('A approved 2,500 plan vs 2,240 → +260 (DEXA shows ≈ +307 at 2,546 logged)', E.derivedBalance(A, { eat: 2500, added: 0 }), 260);
eq('A floor 1,700 (25% below 2,240, rounded up)', E.floorFor(2240), 1700);
const fl = E.targetsFromBalance(A, -750, 0); eq('A −750 → 1,490 limited to floor 1,700, balance −540', [fl.eat, fl.limited, fl.balance], [1700, true, -540]);
const t1 = E.targetsFromBalance(A, -450, 100), t3 = E.targetsFromBalance(A, -450, 300);
eq('1:1: +200 activity → +200 eat and +200 goal', [t3.eat - t1.eat, t3.goal - t1.goal, t3.balance], [200, 200, -450]);
eq('A suggested −450/+100 → 1,890/1,000', [t1.eat, t1.goal], [1890, 1000]);
eq('calibration with too few logged days → insufficient, no estimate', E.calibrateFromPeriods(E.FOUNDER_PERIODS.map((p) => ({ ...p, intakeDays: 9 }))).status, 'insufficient');
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
const A2 = { ...A, calibrated: { ...A.calibrated, value: 2040 } };
eq('after recalibration to 2,040, approved 1,890/+100 shows balance −250', E.derivedBalance(A2, { eat: 1890, added: 100 }), -250);
const failed = results.filter((r) => !r.pass);
fs.writeFileSync(path.join(dir, 'energy-model.test-results.json'), JSON.stringify(results, null, 2));
console.log(`${results.length - failed.length}/${results.length} arithmetic checks passed`); failed.forEach((f) => console.log('FAIL', f.name, 'got', JSON.stringify(f.got), 'want', JSON.stringify(f.want)));
process.exitCode = failed.length ? 1 : 0;
