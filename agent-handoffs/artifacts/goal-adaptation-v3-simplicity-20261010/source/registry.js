// ---------------------------------------------------------------------------
// v3 registry: focused board. Tags: NEW, UPDATED, Canonical today, New contract
// (Phase C), Concept only.
// ---------------------------------------------------------------------------
const T = { canon: 'Canonical today', newc: 'New contract (Phase C)', concept: 'Concept only' };
const SCREENS = {
  'F1-options': { short: 'Options', title: 'Option B comparison (preserved)', desc: 'Accepted side-by-side choices. The recommended option is ranked first; every valid option stays choosable.', tags: ['Preserved'] },
  'F2-setup': { short: 'Setup', title: 'Leaning setup: two decisions', desc: 'How the phase ends, and daily energy. Everything else carries forward; “Your plan” is one tap away for anyone who wants to customize early.', tags: ['UPDATED', T.newc] },
  'F3-hub': { short: 'Plan hub', title: 'Approach A plan hub, simplified', desc: 'Two changing rows, then carried-forward strategies in one short list. Training shows what was learned; recovery, supplements, photos and DEXA read as optional.', tags: ['Preserved', 'UPDATED'] },
  'F4-energy': { short: 'Energy', title: 'Daily energy on one screen (interactive)', desc: 'Pick the balance, then how: Suggested, Eat less, Move more, Blend or Custom. 1:1: eat = 2,117 + balance + extra activity. No weekly day-by-day split.', tags: ['UPDATED', 'Interactive', T.newc], energy: {} },
  'F5-review': { short: 'Review', title: 'Review: only numbers that change', desc: 'Phase, end condition, balance, eat, activity goal and goal date. No prescribed walks or schedules.', tags: ['UPDATED'] },
  'F6-stale': { short: 'Stale draft', title: 'Stale draft revalidated (generic)', desc: 'Any newer evidence or plan change refreshes derived numbers and shows the difference. Replaces the web-specific “edited elsewhere” screen.', tags: ['UPDATED', 'Revalidation'] },
  'Q1-proposal': { short: 'Suggestion', title: 'Quick Calibration: balance first (interactive)', desc: 'At the end of the Weekly, after Coach’s Take: “Deepen your daily deficit by 200”. Then four equal choices: Eat less, Move more, Blend, Custom. Accept stays disabled until you choose how.', tags: ['NEW', 'Interactive', T.newc] },
  'Q2-blend': { short: 'Blend', title: 'Quick Calibration: Blend selected (interactive)', desc: 'Eat 1,767 → 1,667 and activity goal 900 → 1,000: 100 + 100 = 200 deeper, 1:1. One tap to accept.', tags: ['NEW', 'Interactive'] },
  'Q3-custom': { short: 'Custom', title: 'Quick Calibration: Custom (interactive)', desc: 'Two small inputs: eat less by and move more by. Starts at 150 + 50; any mix, checked against the floor and the quick-step limit.', tags: ['NEW', 'Interactive', 'Editable numbers'] },
  'Q4-applied': { short: 'Applied', title: 'Plan updated inline', desc: 'Only the balance and its dependent targets change, in one approved write. View change and Undo. Three-week observation window before another suggestion.', tags: ['NEW'] },
  'Q5-why': { short: 'Why', title: 'Why 200?', desc: 'You followed the plan; the result shows a real deficit near −250. Maintenance estimate refined 2,117 → ≈ 1,917.', tags: ['NEW', 'Explainability'] },
  'Q6-escalate': { short: 'Escalate', title: 'When it needs the plan hub', desc: 'If the phase limit, goal date or guardrail is affected, the briefing opens Your Plan instead. Small compatible changes never do.', tags: ['NEW', 'Escalation'] },
  'M1-why-numbers': { short: 'Why numbers', title: 'Three layers: resting energy → maintenance → your targets', desc: 'Resting energy (DEXA report estimate), maintenance learned from results, and the targets you approved. Only targets need approval.', tags: ['NEW', 'Explainability'] },
  'M2-new-user': { short: 'No scan', title: 'Starting without a scan', desc: 'Provisional resting energy from sex, age, height and weight, read from Apple Health where possible; only missing fields are asked once. Wide range until results narrow it.', tags: ['NEW', T.concept] },
  'M3-composition-changed': { short: 'Estimates updated', title: 'Body composition changed: estimates move, targets don’t', desc: 'A new scan updates resting energy and maintenance. Approved targets stay put; a briefing suggests a change only if it matters.', tags: ['NEW', T.concept] },
  'T1-learned': { short: 'Learned', title: 'Learned from your recent workouts', desc: 'Observed pattern (frequency and usual days), how lifts are trending, a coach suggestion, and optional training goals. Clearly separated.', tags: ['NEW', T.concept] },
  'T2-learning': { short: 'Learning', title: 'Still learning (few workouts)', desc: 'No pattern claimed until about 3 weeks and 6 workouts.', tags: ['NEW', 'Empty / missing evidence'] },
  'T3-travel-week': { short: 'Break week', title: 'A light week isn’t a new routine', desc: 'One-off breaks don’t change the learned pattern; untracked days are left out.', tags: ['NEW'] },
  'T4-goals': { short: 'Goals', title: 'Optional training goals', desc: 'Focus areas, workouts a week and progression, all optional. No split or day-by-day schedule.', tags: ['NEW', T.canon] },
  'A1-activity': { short: 'Activity', title: 'Activity: one number', desc: 'Daily active-energy goal with a short, non-prescriptive example. Source shown as “Activity data · Apple Health”.', tags: ['UPDATED'] },
  'A2-no-wearable': { short: 'No data', title: 'No activity data', desc: 'Plan without activity data (eating carries the balance), or connect Apple Health. No unsupported device claims.', tags: ['NEW', 'Empty / missing evidence'] },
  'R1-recovery': { short: 'Recovery', title: 'Recovery priorities + optional sleep goal', desc: 'Existing priorities, add your own, and an optional sleep goal.', tags: ['UPDATED'] },
  'R2-add-priority': { short: 'Add priority', title: 'Add a recovery priority', desc: 'Pick stretching, mobility or your own; frequency and reminder optional.', tags: ['NEW', T.concept] },
  'R3-sleep-goal': { short: 'Sleep goal', title: 'Optional sleep goal', desc: 'One number, with your recent average for reference.', tags: ['NEW', T.concept] },
  'S1-supplements': { short: 'Supplements', title: 'Supplements', desc: 'List with add and edit. No recommendations or dose advice.', tags: ['UPDATED', T.canon] },
  'S2-add-supplement': { short: 'Add', title: 'Add a supplement', desc: 'Name, optional amount, how often and reminder.', tags: ['NEW', T.canon] },
  'P1-photos-dexa': { short: 'Photos & DEXA', title: 'Progress photos and DEXA, both optional', desc: 'Toggle photos and reminders; schedule a scan only if you want one.', tags: ['UPDATED', T.canon] },
};

const SECTIONS = [
  { group: 'Start here', items: [
    { key: 'principle', badge: 'NEW', title: 'Simplicity with sophistication: what changed', render: () => principleView() },
    { key: 'audit', badge: 'NEW', title: 'Source audit: what exists, what’s missing', render: () => auditView() },
  ] },
  { group: 'Founder scenario', items: [
    { key: 'scenario', title: 'Option B → leaning setup → plan hub → energy → review', note: 'The shortest path for the Founder’s Oct 9 situation. Two decisions, one review, one approval.', flow: ['#F1-options', '→', '#F2-setup', '→', '#F4-energy', '→', '#F5-review', '·', 'optional', '→', '#F3-hub'], screens: ['F1-options', 'F2-setup', 'F3-hub', 'F4-energy', 'F5-review', 'F6-stale'] },
  ] },
  { group: 'Quick Calibration', items: [
    { key: 'qc', badge: 'UPDATED', title: 'Quick Calibration: balance first, then how', note: 'Four weeks into leaning, logging and activity on plan, weight trend −0.2 lb/week. The Weekly ends with one suggestion. Try the tiles on Q1–Q3.', flow: ['Weekly (end)', '→', '#Q1-proposal', '→', '#Q2-blend', '→', '#Q4-applied', '·', '#Q5-why', '·', '#Q6-escalate'], screens: ['Q1-proposal', 'Q2-blend', 'Q3-custom', 'Q4-applied', 'Q5-why', 'Q6-escalate'] },
  ] },
  { group: 'Intelligence behind the scenes', items: [
    { key: 'rmr', badge: 'NEW', title: 'Evolving resting energy and maintenance', note: 'Estimates evolve on their own; your targets never change without you.', screens: ['M1-why-numbers', 'M2-new-user', 'M3-composition-changed'] },
    { key: 'training', badge: 'NEW', title: 'Training learned from the Logger', note: 'Observed pattern, user goals and coach suggestions are kept separate. No mandatory split.', screens: ['T1-learned', 'T2-learning', 'T3-travel-week', 'T4-goals'] },
  ] },
  { group: 'Simplified plan', items: [
    { key: 'editors', badge: 'UPDATED', title: 'Optional, easy-to-customize strategies', note: 'Activity is one number; recovery, sleep, supplements, photos and DEXA are optional and quick to adjust.', screens: ['A1-activity', 'A2-no-wearable', 'R1-recovery', 'R2-add-priority', 'R3-sleep-goal', 'S1-supplements', 'S2-add-supplement', 'P1-photos-dexa'] },
  ] },
  { group: 'For the Founder', items: [
    { key: 'decisions', badge: 'NEW', title: 'Decisions still open', render: () => decisionsView() },
    { key: 'index', title: 'Visual index', render: () => indexView() },
  ] },
];

function linkScreens(text) {
  return text.replace(/\b(F[1-6]|Q[1-6]|M[1-3]|T[1-4]|A[12]|R[1-3]|S[12]|P1)\b/g, (m) => {
    const id = Object.keys(SCREENS).find((k) => k.split('-')[0] === m);
    return id ? `<a href="#p-${id}">${m}</a>` : m;
  });
}

function principleView() {
  const rows = [
    ['Quick Calibration', '“Eat 150 less” (intake only)', 'Balance first (“deepen by 200”), then Eat less · Move more · Blend · Custom, equal weight, 1:1 (Q1–Q3)'],
    ['Energy editor', 'Two steps plus a weekly day-by-day split', 'One screen: balance + how; daily targets are averages, the week’s outcome matters (F4)'],
    ['Activity', 'Session type, length, count and days', 'One number plus an optional example; any activity counts (A1)'],
    ['Wearables', 'Apple Watch wording', '“Activity data · Apple Health”; no-data route; no device claims (A1, A2)'],
    ['Resting energy and maintenance', 'Fixed maintenance from one calibration', 'Evolving estimates with sources; targets change only with approval (M1–M3)'],
    ['Training', 'Configure frequency per area, split optional concept', 'Learned from the Logger; goals optional (T1–T4)'],
    ['Recovery, sleep, supplements', 'Fixed lists; sleep concept-only', 'Add your own priority, optional sleep goal, add supplements (R1–R3, S1, S2)'],
    ['Photos and DEXA', 'Inside a large Coaching Updates editor', 'Both optional on one small screen (P1)'],
    ['Conflicts', '“Edited on the web” merge screen', 'Generic stale-draft revalidation (F6)'],
    ['Review', 'Included prescribed walks', 'Only numbers that change (F5)'],
    ['Kept', 'Option B comparison · Approach A plan hub · 1:1 arithmetic · recommendation last in briefings · no automatic resumption · guardrail/phase/deadline behaviour', 'Unchanged'],
  ];
  return `<p class="note">The engine does the work; you see only the decisions that matter. Everything below the line of “what you approve” (resting energy, maintenance, learned training) updates on its own and explains itself in one tap. What you approve (targets, phase, limits) never changes without you.</p>
  <div class="tw"><table class="cov" style="min-width:860px"><tr><th>Area</th><th>Before (prior boards)</th><th>Now (V3)</th></tr>${rows.map((r) => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${linkScreens(r[2])}</td></tr>`).join('')}</table></div>`;
}

function auditView() {
  const rmr = [
    ['DEXA-report resting energy, stored per scan, editable', 'Exists', 'PdfInterpreter.js:191-223 · dexaScan.js:39'],
    ['Expenditure = DEXA resting energy + Apple Health active energy', 'Exists (all briefings, Energy Evidence)', 'EnergyDailyReconciliationService.js:119-152'],
    ['Source type for resting energy (measured / DEXA report / equation)', 'Missing (labelled “dexa”)', 'CadenceEnergyAssessmentService.js:238-257'],
    ['Equation or lean-mass resting energy; updates between scans', 'Missing', 'no Mifflin / Katch / Cunningham code'],
    ['Apple Health basal energy', 'Missing (Watch live display only)', 'WatchWorkoutHealthController.swift'],
    ['Maintenance learned from outcomes', 'Dormant only (Phase B 99f11ae6)', 'EnergyCalibrationV1.js'],
    ['Estimate vs weight-outcome check', 'Exists, narrative only', 'CadenceEnergyObservationsV3.js:378-401'],
    ['Sex and age for a provisional estimate', 'Missing (fields null, not collected)', 'models/user.js:16-21'],
    ['Fitbit or other connectors', 'Missing (Apple Health only; manual entry exists)', 'HealthKitTypeRegistry.swift'],
    ['Approved intake and activity targets', 'Exists (user_required, no auto-adjust)', 'PhaseEstablishmentService.js:5-17'],
  ];
  const tr = [
    ['Usual training days (any workout)', 'Exists in briefings', 'BriefingIntelligence.js:140-160'],
    ['Missed-run and frequency-change detection', 'Exists (not per area)', 'BriefingIntelligence.js:274-321'],
    ['Per-lift trends, PRs, best set, volume; variant + superset aware', 'Exists', 'TrainingPerformanceIntelligenceService.js'],
    ['Supersets not double-counted', 'Exists', 'trainingExerciseRelationship.js'],
    ['Exercise → 11 muscle groups', 'Exists', 'trainingNavigationMapping.js:144-264'],
    ['11 muscle groups → 6 plan areas', 'Missing', '—'],
    ['Learned weekly frequency per area', 'Missing', '—'],
    ['Planned vs observed comparator', 'Dormant (production passes null; week-start and vocabulary bugs)', 'MonthlyEvidenceIntelligenceV3.js:393-440'],
    ['Travel or deload marker', 'Missing (untracked days excluded)', 'BriefingIntelligence.js:548-553'],
  ];
  const gaps = [
    ['Quick Calibration write', 'Single-target, dependent-target atomic update with recommendation id (idempotent), revalidation fingerprint and version provenance', 'Phase C coordinator'],
    ['Maintenance estimate in production', 'Promote Phase B EnergyCalibrationV1 (dormant) with ranges; reconcile with RMR + active', 'Phase B → C'],
    ['Resting-energy source and between-scan estimate', 'Source type enum; lean-mass equation from last scan + weight trend; ± range', 'New'],
    ['Profile for provisional estimate', 'Read Apple Health sex, birth date, height, body mass (new permissions); store; ask only what’s missing', 'New (Native + Server)'],
    ['Learned training per area', '11→6 mapping; per-area weekly learner (Monday weeks, 4–8 week window, ≥3 weeks and ≥6 workouts); wire planned vs observed', 'New'],
    ['Recovery priorities and sleep goal', 'Custom recovery items through existing recurring support; sleep goal field', 'Partial (support exists) + new field'],
    ['Activity data abstraction', 'Source-neutral activity_day already exists; connector interface for other sources later', 'Later'],
  ];
  const table = (rows, h) => `<div class="tw"><table class="cov" style="min-width:760px"><tr>${h.map((x) => `<th>${x}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 1 ? ` class="${/^Exists/.test(c) ? 'st-canon' : /Dormant|Partial|narrative/.test(c) ? 'st-partial' : 'st-concept'}"` : ''}>${i === 2 ? `<code style="font-size:12px">${c}</code>` : c}</td>`).join('')}</tr>`).join('')}</table></div>`;
  return `<p class="note">Read from the release commits: Server production <code>85a98025</code>, Native Build 94 <code>49829781</code>, and the dormant Phase B candidate <code>99f11ae6</code>. The design reuses what exists and names every gap.</p>
  <h3 style="margin:0 0 10px">Resting energy, maintenance and activity data</h3>${table(rmr, ['Capability', 'Status', 'Source'])}
  <h3 style="margin:22px 0 10px">Training intelligence</h3>${table(tr, ['Capability', 'Status', 'Source'])}
  <h3 style="margin:22px 0 10px">Backend contract gaps for this design</h3><div class="tw"><table class="cov" style="min-width:760px"><tr><th>Gap</th><th>What’s needed</th><th>Where</th></tr>${gaps.map((g) => `<tr><td><b>${g[0]}</b></td><td>${g[1]}</td><td>${g[2]}</td></tr>`).join('')}</table></div>`;
}

function decisionsView() {
  const d = [
    ['Provisional resting energy without a scan', 'Needs sex and age, which the app doesn’t have. OK to read them (plus height and weight) from Apple Health with a new permission, and ask only for what’s missing (M2)?'],
    ['Resting energy between scans', 'Estimate it from your last scan’s lean mass and your weight trend (smooth, with a range), or keep the last DEXA value until the next scan (M3)?'],
    ['Quick Calibration choice', 'Four equal options with none preselected (as drawn), or preselect the option you chose last time (Q1)?'],
    ['Learned training areas', 'When a lift works more than one area (for example, pull-ups), count it for the main area only, or for both (T1)?'],
  ];
  return `<div class="dec">${d.map(([t, b], i) => `<div><b>${i + 1}. ${t}.</b> ${linkScreens(b)}</div>`).join('')}</div>
  <p class="note" style="margin-top:14px">Provisional values that stay as they are unless you say otherwise: intake floor 25% below maintenance, +500 extra-activity cap, ±300 quick-step limit, 3-week observation window.</p>`;
}

function indexView() {
  return `<p class="note">Every screen on this board. Click to jump; click a phone to enlarge (← → to step, T switches theme, Esc closes).</p>
  <div class="idx">${Object.keys(SCREENS).map((id) => `<a href="#p-${id}"><div class="mini">${phoneHtml(id, 'dark')}</div><b>${id.split('-')[0]}</b> ${SCREENS[id].short}</a>`).join('')}</div>`;
}

function boardIntro() {
  return `<div class="hero-b"><div class="kick">Goal Adaptation · V3 · design only</div>
  <h1>Simple on the surface, smart underneath</h1>
  <p class="lead">A focused revision. Quick Calibration now suggests a change to your daily balance and lets you choose how: eat less, move more, blend or custom, all 1:1. Resting energy and maintenance evolve as your body changes, and your training pattern is learned from the Logger, so the plan needs fewer settings. Option B and the Approach A plan hub are unchanged.</p>
  <div class="stats">
    <div class="stat"><b>${Object.keys(SCREENS).length}</b><span>focused screens, Dark and Mineral Light</span></div>
    <div class="stat"><b>2</b><span>decisions in the default leaning setup</span></div>
    <div class="stat"><b>4</b><span>equal ways to apply a calibration</span></div>
    <div class="stat"><b>1:1</b><span>activity accounting everywhere</span></div>
    <div class="stat"><b>4</b><span>decisions still open</span></div>
  </div>
  <p class="lead" style="font-size:13.5px">Markers: <span class="tag newb">NEW</span> · <span class="tag upd">UPDATED</span> · <span class="tag state">Preserved</span> · <span class="tag canon">Canonical today</span> · <span class="tag new">New contract (Phase C)</span> · <span class="tag concept">Concept only</span>. Founder maintenance ≈ 2,117 is from the Phase B candidate; values marked * are illustrative.</p></div>`;
}
