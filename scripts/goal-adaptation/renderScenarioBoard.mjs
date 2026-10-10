// Renders the Founder scenario acceptance board from the ACTUAL engine results.
// Usage: node scripts/goal-adaptation/renderScenarioBoard.mjs <outDir>
// Writes results.json (deterministic) and scenario-board.html (artifact-ready
// page body; the publishing skeleton supplies <html>/<head>).
import fs from "node:fs";
import path from "node:path";
import { runGoalAdaptationScenarios } from "../../src/domain/goalAdaptation/scenarios/runGoalAdaptationScenarios.js";
import { GOAL_ADAPTATION_POLICY_V1 } from "../../src/domain/goalAdaptation/GoalAdaptationPolicyV1.js";

const outDir = path.resolve(process.argv[2] ?? ".");
fs.mkdirSync(outDir, { recursive: true });
const run = runGoalAdaptationScenarios();
fs.writeFileSync(path.join(outDir, "results.json"), `${JSON.stringify(run, null, 2)}\n`);

const esc = (value) => String(value ?? "—").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const label = (value) => esc(String(value ?? "—").replaceAll("_", " "));
const CATEGORY = { mass_building: "Mass building", leaning: "Leaning", strength: "Strength", maintenance: "Maintenance" };
const SOURCE = { founder_production_sanitized: "Founder (production, sanitized)", synthetic: "Synthetic" };
const num = (value, digits = 3) => (value == null ? "—" : Number(value).toFixed(digits).replace(/\.?0+$/, ""));

function scheduleLines(s) {
  if (!s || s.scheduleState === "not_measurable") return [`Not measurable: ${label(s?.reason)}`];
  if (s.scheduleState === "complete") return ["Target reached"];
  return [
    `Days left ${s.timeRemainingDays}${s.storedTimeRemainingDays != null && s.storedTimeRemainingDays !== s.timeRemainingDays ? ` (stored V3: ${s.storedTimeRemainingDays})` : ""}`,
    `Measured pace ${num(s.measuredRate, 4)}/day vs needed ${num(s.requiredRate, 4)}/day`,
    `Measured-basis ratio ${num(s.measuredBasisRatio, 2)} → ${label(s.measuredBasisState)}`,
    `Projected-at-pace ratio ${num(s.projectedAtPaceRatio, 2)} → ${label(s.scheduleState)}${s.projectedCompletionDate ? ` (finish ≈ ${s.projectedCompletionDate})` : ""}`,
  ];
}

const kcal = (rangeValue) => rangeValue ? (rangeValue.low === rangeValue.high ? `${rangeValue.low}` : `${rangeValue.low}–${rangeValue.high}`) : "—";
const signed = (rangeValue) => rangeValue ? `${rangeValue.low > 0 ? "+" : ""}${rangeValue.low}${rangeValue.low === rangeValue.high ? "" : ` to ${rangeValue.high > 0 ? "+" : ""}${rangeValue.high}`}` : "—";
function energyCell(e) {
  if (!e) return "—";
  if (e.status === "calibrated" || e.status === "unchanged") return `${kcal(e.intakeKcal)} kcal${e.activityKcal != null ? ` · activity ${e.activityKcal}` : ""}${e.changeFromPlanKcal ? `<div class="sub">${signed(e.changeFromPlanKcal)} vs plan${e.clamped ? " · held at safety floor" : ""}</div>` : ""}`;
  return `<span class="sub">${label(e.status)}</span>`;
}
function timelineCell(t) {
  if (!t) return "—";
  const parts = [];
  if (t.phaseWeeks) parts.push(`phase ${t.phaseWeeks.low === t.phaseWeeks.high ? t.phaseWeeks.low : `${t.phaseWeeks.low}–${t.phaseWeeks.high}`} wk`);
  if (t.goalCompletion) parts.push(`goal ≈ ${t.goalCompletion.earliest} → ${t.goalCompletion.latest}`);
  return `${parts.join(" · ") || "—"}${t.note ? `<div class="sub">${esc(t.note)}</div>` : ""}`;
}
function projectedCell(o) {
  const p = o.projected ?? {};
  const bf = p.bodyFatPercentAtCompletion ?? p.bodyFatPercentAtPhaseEnd;
  const bits = [];
  if (bf) bits.push(`body fat ${bf.low}–${bf.high}%`);
  if (p.fatToLoseLb != null) bits.push(`≈${p.fatToLoseLb} lb fat to lose`);
  if (o.requires?.upperLimitAtLeast) bits.push(`needs upper ≥ ${o.requires.upperLimitAtLeast}%`);
  if (o.requires?.lowerLimitAtMost) bits.push(`needs lower ≤ ${o.requires.lowerLimitAtMost}%`);
  return bits.join("<br>") || "—";
}
function phaseBSection(r) {
  const b = r.phaseB;
  if (!b) return "";
  const c = b.calibration;
  const calib = c.status === "calibrated"
    ? `Maintenance ≈ <b>${c.maintenanceKcal.estimate}</b> logged kcal/day (${c.maintenanceKcal.low}–${c.maintenanceKcal.high})${c.atActivityKcal != null ? ` at ${c.atActivityKcal} kcal activity` : ""} · confidence ${label(c.confidence)} · ${c.periodsUsed} period(s) · ${c.methods.map(label).join(", ")}`
    : `<b>No calibration</b>: ${label(c.note)}. Calorie targets are withheld.`;
  const periods = (c.periods ?? []).map((p) => `<tr><td>${p.start} → ${p.end}</td><td>${p.days} d</td><td>${p.intakeMean != null ? Math.round(p.intakeMean) : "—"} (${Math.round((p.intakeCoverage ?? 0) * 100)}% logged)</td><td>${p.activityMean != null ? Math.round(p.activityMean) : "—"}</td><td>${p.used ? `${p.storedKcalPerDay > 0 ? "+" : ""}${p.storedKcalPerDay}` : "—"}</td><td>${p.used ? `${p.maintenanceKcal} ±${p.uncertaintyKcal}` : `<span class="sub">excluded: ${label(p.reason)}</span>`}</td></tr>`).join("");
  const options = b.options ? `<table class="opts"><tr><th>#</th><th>Option</th><th>Daily intake</th><th>Timeline</th><th>Projected</th><th>Fits limits</th><th>Tradeoffs</th><th>Checks</th></tr>${b.options.options.map((o) => `<tr class="${o.recommended ? "rec" : ""}"><td>${o.rank}</td><td><b>${esc(o.label)}</b>${o.recommended ? ' <span class="pill go">Recommended</span>' : ""}</td><td>${energyCell(o.energy)}</td><td>${timelineCell(o.timeline)}</td><td>${projectedCell(o)}</td><td>${o.fitsLimits === true ? "yes" : o.fitsLimits === false ? "<b>no</b>" : "—"}</td><td>${o.tradeoffs.protects.length ? `<span class="good">+</span> ${esc(o.tradeoffs.protects.join("; "))}` : ""}${o.tradeoffs.costs.length ? `<br><span class="cost">−</span> ${esc(o.tradeoffs.costs.join("; "))}` : ""}</td><td class="sub">${[...o.validation.errors, ...o.validation.warnings].map(label).join("<br>") || "ok"}</td></tr>`).join("")}</table><p class="sub">${esc(label(b.options.note))} · user approval required · nothing applies automatically</p>` : `<p class="sub">No options: Phase A did not reach a proposal for this case.</p>`;
  const reval = b.revalidation ? `<p><b>Revalidation:</b> ${label(b.revalidation.status)} (${b.revalidation.reasons.map(label).join(", ") || "no material change"}) · age ${b.revalidation.ageDays} days · approval ${b.revalidation.approvalAllowed ? "allowed" : "blocked until refreshed"}</p>` : "";
  return `<section class="pb"><h4>Phase B: options, calculations and tradeoffs (actual engine output)</h4><p>${calib}</p>
    ${c.periods?.length ? `<div class="tw"><table class="periods"><tr><th>Period</th><th>Days</th><th>Mean intake</th><th>Activity</th><th>Stored kcal/day</th><th>Maintenance</th></tr>${periods}</table></div>` : ""}
    <div class="tw">${options}</div>${reval}</section>`;
}

const rows = run.results.map((r) => `
  <tr data-cat="${r.category}" data-outcome="${r.actual.originatesProposal ? "proposal" : "none"}">
    <td><a href="#s-${r.id}" class="id">${r.id}</a></td>
    <td class="title">${esc(r.title)}<div class="sub">${esc(SOURCE[r.source])} · ${esc(r.asOf)} · ${label(r.triggerFamily)}</div></td>
    <td>${esc(CATEGORY[r.category])}</td>
    <td>${label(r.actual.coverage)}<div class="sub">${r.actual.precision === "measured_body_composition_available" ? "scan precision" : "no scan · estimated"} · adherence ${label(r.actual.adherence)}</div></td>
    <td>${label(r.actual.eligibility)}</td>
    <td><span class="rung ${r.actual.originatesProposal ? "go" : "hold"}">${label(r.actual.rung)}</span></td>
    <td>${r.actual.originatesProposal ? '<span class="pill go">Proposal</span>' : r.actual.linkOnly ? '<span class="pill">Link only</span>' : '<span class="pill hold">No adaptation</span>'}</td>
    <td>${r.phaseB?.options ? `${label(r.phaseB.options.options[0].kind)}${r.phaseB.options.recommendedKind ? "" : '<div class="sub">not recommended</div>'}${r.phaseB.options.options[0].energy?.intakeKcal && r.phaseB.options.options[0].energy.status === "calibrated" ? `<div class="sub">${kcal(r.phaseB.options.options[0].energy.intakeKcal)} kcal</div>` : ""}` : r.phaseB?.revalidation ? label(r.phaseB.revalidation.status) : "—"}</td>
    <td>${r.pass ? '<span class="pill pass">PASS</span>' : '<span class="pill fail">FAIL</span>'}</td>
  </tr>`).join("");

const cards = run.results.map((r) => {
  const e = r.engine;
  const g = e.guardrail;
  return `
  <details class="card" id="s-${r.id}" data-cat="${r.category}" data-outcome="${r.actual.originatesProposal ? "proposal" : "none"}">
    <summary><span class="id">${r.id}</span><span class="ct">${esc(r.title)}</span>${r.pass ? '<span class="pill pass">PASS</span>' : '<span class="pill fail">FAIL</span>'}<span class="rung ${r.actual.originatesProposal ? "go" : "hold"}">${label(r.actual.rung)}</span></summary>
    <p class="situation">${esc(r.situation)}</p>
    <div class="grid">
      <section><h4>Evidence and state</h4><ul>
        <li>Goal type: ${label(r.evidence.goalType)} · phase day ${r.evidence.daysInPhase ?? "—"} (started ${esc(r.evidence.phaseStart)})</li>
        ${r.evidence.coverage.map((line) => `<li>${esc(line)}</li>`).join("")}
        <li>Body-composition scans: ${r.evidence.bodyCompositionScans} (${r.evidence.bodyCompositionScans ? "adds precision" : "not required"})</li>
        <li>Plan adherence: ${label(r.evidence.adherence)}</li>
        ${r.evidence.outcomeTrend ? `<li>Outcome trend: ${label(r.evidence.outcomeTrend)} for ${r.evidence.outcomeTrendDays} days</li>` : ""}
        ${r.evidence.belowRangeHistory.length ? `<li>Prior guardrail positions: ${esc(r.evidence.belowRangeHistory.join(", "))}</li>` : ""}
        ${r.evidence.phaseState ? `<li>Phase: ${label(r.evidence.phaseState.type)}, time limit reached ${r.evidence.phaseState.timeLimitReached}, outcome met ${r.evidence.phaseState.outcomeMet}</li>` : ""}
      </ul></section>
      <section><h4>Engine reasoning (actual output)</h4><ul>
        ${scheduleLines(e.schedule).map((line) => `<li>${esc(line)}</li>`).join("")}
        <li>Guardrail: ${g.position ? `${label(g.position)} by ${num(g.deviation, 2)} · ${label(g.severity)} · ${label(g.meaning)} side` : "not assessed"}</li>
        <li>Eligibility: <b>${label(e.eligibility.status)}</b>${(e.eligibility.reasons ?? []).length ? ` (${e.eligibility.reasons.map(label).join("; ")})` : ""}</li>
        <li>Decision: <b>${label(e.decision.rung)}</b> · trigger ${label(e.decision.trigger)} · ${e.decision.originatesProposal ? "originates a proposal" : e.decision.linkOnly ? "link only" : "no proposal"}${e.decision.deferral && e.decision.deferral.reason !== "no_prior_recommendation" ? ` · deferral: ${label(e.decision.deferral.reason)}` : ""}</li>
        ${e.choice ? `<li>Choice check (firm ceiling + keep date): ${e.choice.valid ? "valid" : "rejected"} ${e.choice.errors.map(label).join(", ")}${e.choice.warnings.length ? ` · warning ${e.choice.warnings.map(label).join(", ")}` : ""}</li>` : ""}
        ${e.alternativeChoice ? `<li>Alternative (range 8–10%, keep date): ${e.alternativeChoice.valid ? "valid" : "rejected"}${e.alternativeChoice.warnings.length ? ` · warning ${e.alternativeChoice.warnings.map(label).join(", ")}` : ""}</li>` : ""}
      </ul></section>
      <section><h4>Before (existing V3) vs after (Phase A)</h4><table class="ba">
        <tr><th></th><th>Existing V3</th><th>Phase A shadow</th></tr>
        <tr><td>Recommendation</td><td>${label(r.before.recommendation ?? "not run")}<div class="sub">${esc(r.before.recommendationSource)}</div></td><td>${label(e.decision.rung)}</td></tr>
        <tr><td>Schedule</td><td>${label(r.before.storedScheduleState ?? "—")}${r.before.storedTimeRemainingDays != null ? ` · ${r.before.storedTimeRemainingDays} days` : ""}</td><td>${label(e.schedule.scheduleState)}${e.schedule.timeRemainingDays != null ? ` · ${e.schedule.timeRemainingDays} days` : ""}</td></tr>
        <tr><td>Guardrail</td><td>${label(r.before.v3GuardrailStatus ?? "—")} (symmetric)</td><td>${g.position ? `${label(g.severity)} · ${label(g.meaning)} side` : "—"}</td></tr>
        <tr><td>Adaptation path</td><td>none</td><td>${e.decision.originatesProposal ? "proposal for user approval" : "no proposal"}</td></tr>
      </table></section>
      <section><h4>User-facing copy</h4>
        ${e.decision.coaching.length ? e.decision.coaching.map((c) => `<p class="copy real"><span class="tag">Engine output · ${esc(c.placement)}</span>${esc(c.text)}</p>`).join("") : '<p class="sub">No coaching item from the engine for this case.</p>'}
        ${r.illustrativeCopy ? `<p class="copy ill"><span class="tag">Illustrative · design copy, not engine output</span>${esc(r.illustrativeCopy)}</p>` : ""}
      </section>
    </div>
    ${phaseBSection(r)}
    <table class="checks"><tr><th>Check</th><th>Expected</th><th>Actual</th><th></th></tr>
      ${r.checks.map((c) => `<tr><td>${esc(c.key)}</td><td>${esc(JSON.stringify(c.expected))}</td><td>${esc(JSON.stringify(c.actual))}</td><td>${c.pass ? "✓" : "✗"}</td></tr>`).join("")}
    </table>
  </details>`;
}).join("");

function featureF1() {
  const r = run.results.find((item) => item.id === "F1");
  if (!r?.phaseB?.options) return "";
  const c = r.phaseB.calibration;
  return `<div class="feature"><h2 style="margin-top:0">Your Oct 9 situation: what Phase B would offer</h2>
    <p class="lead">Calibrated from your own logged intake and scans: maintenance ≈ <b>${c.maintenanceKcal.estimate}</b> logged kcal/day (${c.maintenanceKcal.low}–${c.maintenanceKcal.high}) at ${c.atActivityKcal} kcal activity, ${label(c.confidence)} confidence. These are the engine's actual options; the numbers are provisional and nothing changes until you approve.</p>
    <div class="tw"><table class="opts"><tr><th>#</th><th>Option</th><th>Daily intake</th><th>Timeline</th><th>Projected</th><th>Fits limits</th></tr>${r.phaseB.options.options.map((o) => `<tr class="${o.recommended ? "rec" : ""}"><td>${o.rank}</td><td><b>${esc(o.label)}</b>${o.recommended ? ' <span class="pill go">Recommended</span>' : ""}</td><td>${energyCell(o.energy)}</td><td>${timelineCell(o.timeline)}</td><td>${projectedCell(o)}</td><td>${o.fitsLimits === true ? "yes" : o.fitsLimits === false ? "<b>no</b>" : "—"}</td></tr>`).join("")}</table></div>
    <p class="sub">See drilldown F1 for the calibration periods and tradeoffs.</p></div>`;
}

const p = GOAL_ADAPTATION_POLICY_V1;
const html = `<title>Goal Adaptation Scenario Gate</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap">
<style>
/* Layout: gate summary, filterable decision matrix, then one expandable drilldown per scenario. */
:root { --bg:#E8ECE5; --surface:#FBFAF4; --soft:#EEF2ED; --fg:#102431; --fg2:#526970; --muted:#5D7279; --accent:#087E78; --wash:rgba(8,126,120,.09); --warn:#925500; --warnWash:rgba(201,130,32,.12); --bad:#B83D4B; --good:#16875F; --line:rgba(25,56,66,.17);
  --display:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif; --body:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#061019; --surface:#0F1C2A; --soft:#132334; --fg:#F3F8FA; --fg2:#C3D2D9; --muted:#92A5AF; --accent:#3BD2CA; --wash:rgba(59,210,202,.1); --warn:#EFB84F; --warnWash:rgba(244,188,72,.12); --bad:#FF697A; --good:#55E39A; --line:rgba(157,179,189,.2); color-scheme:dark } }
:root[data-theme="dark"] { --bg:#061019; --surface:#0F1C2A; --soft:#132334; --fg:#F3F8FA; --fg2:#C3D2D9; --muted:#92A5AF; --accent:#3BD2CA; --wash:rgba(59,210,202,.1); --warn:#EFB84F; --warnWash:rgba(244,188,72,.12); --bad:#FF697A; --good:#55E39A; --line:rgba(157,179,189,.2); color-scheme:dark }
* { box-sizing:border-box } body { background:var(--bg); color:var(--fg); font-family:var(--body); -webkit-font-smoothing:antialiased }
.wrap { max-width:1640px; margin:0 auto; padding-inline:clamp(16px,2.6vw,44px); padding-block:30px 72px }
.kick { color:var(--accent); font-size:12px; font-weight:800; letter-spacing:.14em; text-transform:uppercase }
h1 { font-family:var(--display); font-size:clamp(28px,3.4vw,46px); letter-spacing:-.03em; margin:8px 0 10px; line-height:1.05 }
h2 { font-family:var(--display); font-size:24px; letter-spacing:-.02em; margin:34px 0 12px }
.lead { color:var(--fg2); font-size:16px; line-height:1.55; max-width:96ch; margin:0 }
.stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; margin:20px 0 4px }
.stat { background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:14px 16px } .stat b { font-family:var(--display); font-size:28px; display:block } .stat span { color:var(--muted); font-size:13px }
.filters { display:flex; flex-wrap:wrap; gap:8px; margin:18px 0 10px; position:sticky; top:env(safe-area-inset-top,0px); background:var(--bg); padding-block:10px; z-index:5; border-bottom:1px solid var(--line) }
.filters button { font:600 13px var(--body); border:1px solid var(--line); background:var(--surface); color:var(--fg2); border-radius:999px; padding:7px 13px; cursor:pointer }
.filters button[aria-pressed="true"] { background:var(--wash); color:var(--accent); border-color:var(--accent) }
.tablewrap { overflow-x:auto; border:1px solid var(--line); border-radius:16px; background:var(--surface) }
table.matrix { width:100%; border-collapse:collapse; font-size:14px; min-width:1100px }
.matrix th, .matrix td { text-align:left; vertical-align:top; padding:10px 12px; border-top:1px solid var(--line) } .matrix th { border-top:0; color:var(--muted); font-size:11px; letter-spacing:.1em; text-transform:uppercase }
.matrix .title { max-width:420px; font-weight:600 } .sub { color:var(--muted); font-size:12.5px; font-weight:400; margin-top:3px }
a.id, .id { font-family:var(--display); font-weight:800; color:var(--accent); text-decoration:none }
.pill { display:inline-block; border-radius:999px; padding:3px 10px; font-size:12px; font-weight:700; border:1px solid var(--line); white-space:nowrap; color:var(--fg2) }
.pill.pass { color:var(--good); border-color:currentColor } .pill.fail { color:var(--bad); border-color:currentColor } .pill.go { color:var(--warn); border-color:currentColor; background:var(--warnWash) } .pill.hold { color:var(--fg2) }
.rung { font-weight:700 } .rung.go { color:var(--warn) } .rung.hold { color:var(--fg2) }
details.card { background:var(--surface); border:1px solid var(--line); border-radius:18px; margin:12px 0; padding:0 18px; scroll-margin-top:72px }
details.card summary { cursor:pointer; display:flex; gap:12px; align-items:center; flex-wrap:wrap; padding:14px 0; list-style:none } details.card summary::-webkit-details-marker { display:none }
details.card summary .ct { flex:1; min-width:240px; font-weight:700 } details[open] summary { border-bottom:1px solid var(--line) }
.situation { color:var(--fg2); line-height:1.5; margin:14px 0 }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr)); gap:16px }
.grid section { background:var(--soft); border-radius:14px; padding:12px 14px; min-width:0 } h4 { margin:0 0 8px; font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted) }
.grid ul { margin:0; padding-left:18px; line-height:1.55; font-size:14px } .grid li { overflow-wrap:anywhere }
table.ba, table.checks { width:100%; border-collapse:collapse; font-size:13.5px } .ba td, .ba th, .checks td, .checks th { border-top:1px solid var(--line); padding:6px 8px 6px 0; text-align:left; vertical-align:top } .ba th, .checks th { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.08em; border-top:0 }
table.checks { margin:14px 0 16px } .checks td { overflow-wrap:anywhere }
.copy { border-radius:12px; padding:10px 12px; margin:0 0 8px; font-size:14px; line-height:1.5 } .copy .tag { display:block; font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; margin-bottom:4px }
.copy.real { background:var(--wash) } .copy.real .tag { color:var(--accent) } .copy.ill { border:1.5px dashed var(--warn) } .copy.ill .tag { color:var(--warn) }
.notes { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr)); gap:16px } .notes div { background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:14px 18px; font-size:14.5px; line-height:1.55 } .notes ul { margin:6px 0 0; padding-left:18px }
.pb { background:var(--soft); border-radius:14px; padding:12px 14px; margin-top:16px } .pb p { font-size:14px; line-height:1.55; margin:6px 0 }
.tw { overflow-x:auto } table.opts, table.periods { width:100%; border-collapse:collapse; font-size:13.5px; margin:8px 0; min-width:860px } .opts th, .opts td, .periods th, .periods td { border-top:1px solid var(--line); padding:7px 8px 7px 0; text-align:left; vertical-align:top } .opts th, .periods th { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.08em; border-top:0 }
tr.rec td { background:var(--wash) } .good { color:var(--good); font-weight:700 } .cost { color:var(--warn); font-weight:700 }
.feature { background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:16px 20px; margin-top:18px }
[hidden] { display:none !important }
</style>
<div class="wrap">
  <div class="kick">PhysiqueOS · Goal Intelligence · Phase 0/A scenario acceptance gate · dormant, not deployed</div>
  <h1>Goal Adaptation Scenario Gate</h1>
  <p class="kick" style="margin-top:-2px">Phase B added: ranked options · energy calibration · timelines · validation · revalidation (all numbers provisional)</p>
  <p class="lead">Every row below is produced by the <b>actual Phase A engine</b> (<code>${esc(run.engine)}</code>) under <code>${esc(run.policyVersion)}</code> (draft thresholds, Founder review required). Founder rows reuse sanitized production assessments; all other rows are synthetic and labelled. Coaching text marked "Engine output" is generated by the engine; text marked "Illustrative" is accepted V2 design copy and is not produced by any engine yet.</p>
  <div class="stats">
    <div class="stat"><b>${run.passed}/${run.total}</b><span>scenarios pass expected-vs-actual</span></div>
    <div class="stat"><b>${run.proposalsOriginated}</b><span>would open a proposal for user approval</span></div>
    <div class="stat"><b>${run.noAdaptationOutcomes}</b><span>correctly no adaptation (coaching, watch, link-only, suppressed or nothing)</span></div>
    <div class="stat"><b>${run.acceptedPhaseAScenarios}</b><span>accepted Phase 0/A scenarios kept as regressions (decisions unchanged)</span></div>
    <div class="stat"><b>${run.results.filter((item) => item.phaseB?.options?.recommendedKind).length}</b><span>cases with a recommended Phase B option</span></div>
    <div class="stat"><b>0</b><span>automatic goal or phase changes (never allowed)</span></div>
  </div>
  ${featureF1()}
  <div class="filters" role="group" aria-label="Filter scenarios">
    <button type="button" data-f="all" aria-pressed="true">All</button>
    ${Object.entries(CATEGORY).map(([k, v]) => `<button type="button" data-f="cat:${k}" aria-pressed="false">${v}</button>`).join("")}
    <button type="button" data-f="outcome:proposal" aria-pressed="false">Proposal</button>
    <button type="button" data-f="outcome:none" aria-pressed="false">No adaptation</button>
  </div>
  <div class="tablewrap"><table class="matrix">
    <tr><th>ID</th><th>Scenario</th><th>Type</th><th>Evidence</th><th>Eligibility</th><th>Engine rung</th><th>Outcome</th><th>Phase B top option</th><th>Result</th></tr>
    ${rows}
  </table></div>
  <h2>Scenario drilldowns</h2>
  ${cards}
  <h2>Draft policy thresholds for Founder review</h2>
  <div class="notes">
    <div><b>Eligibility</b><ul>
      <li>First calibration checkpoint ${p.calibration.checkpointDays} days (not a guarantee; safety exceptions bypass it)</li>
      <li>Evidence window ${p.evidenceWindowDays} days of complete weeks</li>
      <li>Lean-mass build: weight ≥4/wk, training ≥2/wk, intake or daily evidence ≥5/wk; DEXA never required</li>
      <li>Leaning: weight ≥4/wk plus intake, activity or daily evidence ≥5/wk · Maintenance: weight ≥3/wk plus ≥4/wk · Strength: comparable sessions ≥2/wk</li>
      <li>HealthKit nutrition/activity/steps/workouts/sleep never prompted manually</li>
    </ul></div>
    <div><b>Adherence and decisions</b><ul>
      <li>Adherence judged only on ≥${p.adherence.minimumMeasuredDaysForJudgement} measured days; intake ±${p.adherence.nutritionTolerance.fraction * 100}%, activity ±${p.adherence.activityTolerance.fraction * 100}%; adequate ≥${p.adherence.adequateShareOfMeasuredDays * 100}% of days; consistent = ${p.adherence.consistentNonadherenceWeeks} off-plan weeks</li>
      <li>Consistent nonadherence driving an unsafe guardrail or a stalled outcome → sustainability review (not ineligibility)</li>
      <li>Pace needs ≥${p.schedule.minimumEvidenceSpanDays} days of measurement; stalled/regressing ≥${p.outcome.sustainedTrendDays} days → strategy review</li>
      <li>Below range while building: watch, review after ${p.belowRange.persistenceWeeklyEvaluations} weekly evaluations or a confirming scan</li>
      <li>Safety exceptions: unsafe-side breach, weight change ≥${p.safetyExceptions.rapidWeightChangePercentPerWeek}%/week, reported health concern</li>
    </ul></div>
    <div><b>Phase B provisional numbers</b><ul>
      <li>Energy densities: fat ${p.phaseB.energyDensityKcalPerLb.fat}, lean ${p.phaseB.energyDensityKcalPerLb.lean} kcal/lb; scan error ±${p.phaseB.measurementError.scanFatLb} lb fat, ±${p.phaseB.measurementError.scanLeanLb} lb lean</li>
      <li>Calibration needs ≥${p.phaseB.calibration.minimumPeriodDays}-day periods with ≥${p.phaseB.calibration.minimumIntakeCoverage * 100}% logged days; recency half-life ${p.phaseB.calibration.recencyHalfLifeDays} days</li>
      <li>Leaning ${p.phaseB.rates.leaningPercentBodyWeightPerWeek.join("–")}% body weight/week, aiming at ${p.phaseB.guardrailTargetPositionInRange * 100}% of the way up the range; slow build ${p.phaseB.rates.slowBuildLeanLbPerMonth.join("–")} lb lean/month at +${p.phaseB.rates.slowBuildSurplusKcal.join("–")} kcal</li>
      <li>Safety bounds: never more than ${p.phaseB.limits.maximumDeficitFractionOfMaintenance * 100}% below or ${p.phaseB.limits.maximumSurplusKcal} kcal above calibrated maintenance; recommendations expire after ${p.phaseB.revalidation.maximumAgeDays} days or on a ${p.phaseB.revalidation.calibrationShiftKcal} kcal calibration shift</li>
    </ul></div>
    <div><b>Not exercisable until Phase C/D</b><ul>
      <li>Persisted recommendations, notification and Home priority delivery</li>
      <li>Atomic approval: goal-contract revision, temporary phase, Operating Plan versions, Your Journey events (Phase C)</li>
      <li>Narrative wiring of coaching into published Weekly/Monthly briefings, and all Native screens (Phase C/D)</li>
    </ul></div>
  </div>
</div>
<script>
const buttons = [...document.querySelectorAll('.filters button')];
buttons.forEach((b) => b.addEventListener('click', () => {
  buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  const [kind, value] = b.dataset.f.split(':');
  document.querySelectorAll('[data-cat]').forEach((el) => {
    el.hidden = kind === 'cat' ? el.dataset.cat !== value : kind === 'outcome' ? el.dataset.outcome !== value : false;
  });
}));
</script>
`;
fs.writeFileSync(path.join(outDir, "scenario-board.html"), html);
process.stdout.write(`${JSON.stringify({ total: run.total, passed: run.passed, failed: run.failed, proposals: run.proposalsOriginated }, null, 0)}\n`);
