// ---------------------------------------------------------------------------
// Goal Adaptation simulator (design simulation only, illustrative data).
// No network, no production data, no persistence beyond this page.
// Rules honoured: one primary goal; Option B comparison; Approach A plan hub;
// 1:1 energy arithmetic; no weekly scheduling editor; non-prescriptive
// activity; training split, DEXA and photos optional; no new briefing
// sections; Midweek never proposes; nothing resumes automatically; Home keeps
// its production layout (only phase text changes).
// ---------------------------------------------------------------------------
const START = { y: 2026, m: 9, d: 10 }; // Oct 10 2026 (simulated)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateLabel = (day) => { const d = new Date(Date.UTC(START.y, START.m, START.d + day)); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const fmt = (v) => Math.round(v).toLocaleString('en-US');
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v));
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);

const BASE_PLAN = { mode: 'build', eat: 2500, added: 0, goal: 800, trainingGoals: null, progression: 'Moderate', recovery: ['Foam Rolling'], sleepGoal: null, supplements: ['Tongkat Ali', 'Electrolytes'], photos: true, dexa: false };
function initialState(scenario = 'A') {
  const E = cloneScenario(scenario);
  return {
    E,
    day: 0, screen: 'home', stack: [], theme: 'dark', toast: null,
    phase: 'building', // building | leaning | leaningComplete | resumed | maintaining | keepBuilding
    phaseStartDay: null, completion: { mode: 'outcome', weeks: 6 },
    body: { weight: 179.0, fat: 17.4, lean: 154.6, other: 7.0 },
    gained: 7.1, response: 'asEstimated',
    guardrail: { enabled: true, min: 8, max: 9 }, phaseGuardrail: null, completionTarget: 9, goalDate: 'Oct 31',
    plan: { ...BASE_PLAN, goal: E.usual == null ? null : E.usual },
    draft: null, explainerSeen: false,
    decision: { open: true, source: 'Oct 9 DEXA', dismissed: false, kind: 'adapt' },
    qc: null, observeUntil: null, lastQcDay: null,
    versions: [{ v: 1, day: -56, label: 'Lean Mass Build started', detail: `Eat 2,500 · activity goal ${E.usual == null ? '—' : '800'} · range 8–9%`, snap: null }],
    undo: null, weeklyLog: [], log: [`Simulation started · scenario ${E.key} · Oct 10 (simulated)`],
  };
}
let S = initialState();
const snap = () => JSON.parse(JSON.stringify({ E: S.E, phase: S.phase, phaseStartDay: S.phaseStartDay, completion: S.completion, guardrail: S.guardrail, phaseGuardrail: S.phaseGuardrail, completionTarget: S.completionTarget, goalDate: S.goalDate, plan: S.plan, decision: S.decision, qc: S.qc, observeUntil: S.observeUntil }));
const bf = (b = S.body) => (b.fat / b.weight) * 100;
const inPhaseWeeks = () => (S.phaseStartDay == null ? 0 : Math.floor((S.day - S.phaseStartDay) / 7));

// ---------------- energy model (1:1, see energy-model.js) -----------------
const M = () => planningMaintenance(S.E).value;
const planBal = (p) => derivedBalance(S.E, p);
const fmtG = (g) => (g == null ? '—' : fmt(g));
const hasActivity = () => S.E.usual != null;
const truth = () => S.E.truth - (S.response === 'slower' ? 250 : 0);
function energyFrom(balance, split, custom) {
  const usual = hasActivity();
  const added = !usual ? 0 : split === 'eat' ? 0 : split === 'move' ? Math.min(500, Math.max(0, -balance)) : split === 'blend' ? Math.min(500, Math.max(0, Math.round(-balance / 2))) : split === 'custom' ? Math.max(0, Math.min(500, custom ?? 100)) : (balance < 0 ? 100 : 0);
  return targetsFromBalance(S.E, balance, added);
}
function rateRange(balance) {
  const pm = planningMaintenance(S.E); const half = (pm.high - pm.low) / 2;
  const lo = (balance - half) * 7, hi = (balance + half) * 7;
  const d = balance < 0 ? 3300 : 2500;
  if (Math.abs(balance) < 60) return 'about steady';
  if (lo < 0 && hi > 0) return balance < 0 ? 'could be anywhere from a loss to a small gain (wide estimate)' : 'could be anywhere from a small loss to a gain (wide estimate)';
  const a = Math.abs(lo / d), b = Math.abs(hi / d);
  return balance < 0 ? `≈ ${f1(Math.min(a, b))}–${f1(Math.max(a, b))} lb/week loss` : `≈ ${f1(Math.min(a, b) * 4.33)}–${f1(Math.max(a, b) * 4.33)} lb/month gain`;
}
const effGR = () => grEffective(S.guardrail, S.phaseGuardrail);
const effMax = () => (effGR().enabled === false ? Infinity : effGR().max);
function draftBase(d) { return { goal: S.guardrail, phase: d.kind === 'next' || d.kind === 'lean' ? null : S.phaseGuardrail }; }
const draftProposed = (d) => grPropose(draftBase(d), d.gr);
function draftContext(d) {
  const kind = d.kind === 'next' ? { resume: 'resume', maintain: 'maintain', continue: 'continueLean' }[d.next] : d.kind;
  const target = tgtUsed(d) ? tgt(d) : null;
  return { kind, bodyFat: bf(), target };
}
const draftCheck = (d) => grValidate(draftContext(d), d.gr, draftProposed(d));
// Phase target: aligned automatically to the lowest upper limit that will apply, until the user sets it by hand.
const tgtUsed = (d) => (d.kind === 'lean' && d.completion.mode !== 'time') || (d.kind === 'next' && d.next === 'continue');
const tgtFallback = () => (S.guardrail.enabled !== false ? S.guardrail.max : grStepBelow(bf()));
const tgtInfo = (d) => grAlignedTarget(draftProposed(d), bf(), tgtFallback());
const tgtStart = (d) => grAlignedTarget(draftBase(d), bf(), tgtFallback()).value;
const tgt = (d) => (d.targetMode === 'custom' ? d.target : tgtInfo(d).value);
const tgtWhy = (d) => { if (d.targetMode === 'custom') return 'custom'; const src = tgtInfo(d).source; return src === 'goal' ? `matches your ${grSame(draftBase(d).goal, draftProposed(d).goal) ? '' : 'new '}goal upper limit` : { phase: 'matches the leaning-only upper limit', previous: 'no guardrail · previous target kept', belowNow: 'already inside your range · just below now' }[src]; };
// One-tap ways out of a conflict, so validation never dead-ends.
function fixes(d, onEditor) {
  const c = draftCheck(d).conflicts; const out = [];
  if (c.includes('targetAboveRange') || c.includes('targetNotBelowNow')) { if (d.targetMode === 'custom') out.push([`Use ${grFmt(tgtInfo(d).value)}% (aligned)`, 'targetAuto', '']); if (!onEditor) out.push(['Edit guardrail', 'openGuardrail', '']); }
  if (c.includes('aboveUpperWhileBuilding')) { const up = d.kind === 'keepBuilding' ? 11.5 : Math.ceil(bf() * 2) / 2; out.push([`Raise upper limit to ${grFmt(up)}%`, 'grFixUpper', up]); if (d.kind === 'keepBuilding') out.push(['Lean out first instead', 'chooseLean', '']); }
  return out.length ? `<div class="chips" style="margin-top:8px">${out.map(([l, a, arg]) => `<span class="chip on" data-act="${a}" ${arg !== '' ? `data-arg="${arg}"` : ''} role="button" tabindex="0">${l}</span>`).join('')}</div>` : '';
}
const grLabel = (pr) => (pr.phase ? `${grText(pr.phase)} this phase only · goal ${grText(pr.goal)}` : `${grText(pr.goal)} (goal)`);
const grChanged = (d) => { const b = draftBase(d), pr = draftProposed(d); return !grSame(b.goal, pr.goal) || !grSame(b.phase, pr.phase); };
const checkMsgs = (chk) => chk.errors.map((m) => `<div class="ewarn red">${I.warn}<span>${m}</span></div>`).join('') + chk.warnings.map((m) => `<div class="ewarn amber">${I.info}<span>${m}</span></div>`).join('');
function homeGR(detail) {
  const g = effGR();
  if (g.enabled === false) return { title: 'No body-fat guardrail', detail: S.phaseGuardrail ? `This phase only · goal ${grText(S.guardrail)}` : 'Removed from this goal' };
  return { title: `Maintain approximately ${grFmt(g.min)}–${grFmt(g.max)}% body fat`, detail: S.phaseGuardrail ? `This phase only · goal ${grText(S.guardrail)}` : detail };
}
const maintLabel = () => { const pm = planningMaintenance(S.E); return pm.source === 'calibrated' ? `${fmt(pm.value)} (calibrated${S.E.key === 'A' && !S.E.recalibrated ? ', illustrative' : ''})` : `${fmt(pm.value)} (provisional estimate)`; };

// ---------------- simulated evidence -----------------
function simulateWeek() {
  const p = S.plan;
  const net = p.eat - truth() - (p.added || 0); // simulated real daily balance
  const dw = (net * 7) / (net < 0 ? 3300 : 2500);
  let fatShare, leanShare;
  if (net < 0) { fatShare = 0.85; leanShare = 0.12; } else { fatShare = 0.45; leanShare = 0.5; }
  const before = { ...S.body };
  S.body.weight += dw; S.body.fat += dw * fatShare; S.body.lean += dw * leanShare; S.body.other += dw * (1 - fatShare - leanShare);
  S.gained += dw * leanShare;
  S.day += 7;
  S.weeklyLog.push({ day: S.day, dw, bf: bf(), expected: (planBal(S.plan) * 7) / 3300 });
  S.log.unshift(`${dateLabel(S.day)} · simulated week: weight ${sgn(dw * 10) === '0' ? '±0' : (dw >= 0 ? '+' : '−') + f1(Math.abs(dw))} lb, body fat ${f1(bf())}%`);
  if (S.undo && S.undo.day < S.day) S.undo = null;
  evaluateAfterWeek(before);
}
function evaluateAfterWeek() {
  if (S.phase === 'leaning') {
    const weeks = inPhaseWeeks();
    const backInRange = S.completionTarget != null && bf() <= S.completionTarget;
    const timeUp = S.completion.mode !== 'outcome' && weeks >= S.completion.weeks;
    if ((S.completion.mode !== 'time' && backInRange) || timeUp) {
      S.phase = 'leaningComplete';
      S.decision = { open: true, source: `${dateLabel(S.day)} ${backInRange ? 'scan' : 'time limit'}`, dismissed: false, kind: backInRange ? 'complete' : 'timeLimit' };
      S.qc = null;
      S.log.unshift(`${dateLabel(S.day)} · leaning phase ${backInRange ? 'reached the range' : 'reached its time limit'}; your decision is needed`);
      return;
    }
    // Quick Calibration eligibility: ≥3 weeks of evidence, outside observation window, slower than planned
    const last = S.weeklyLog.slice(-3);
    const observed = last.reduce((a, w) => a + w.dw, 0) / Math.max(1, last.length);
    const expected = (planBal(S.plan) * 7) / 3300;
    const eligible = weeks >= 3 && S.E.logging === 'complete' && (!S.observeUntil || S.day >= S.observeUntil) && observed > expected * 0.7 && !S.qc;
    if (eligible) {
      const impliedNet = (observed * 3300) / 7;
      const gap = Math.round((planBal(S.plan) - impliedNet) / 25) * 25; // negative: real deficit smaller than planned
      const step = Math.max(-300, Math.min(-100, gap));
      S.qc = { step, observed, expected, created: S.day, opt: null, fromM: M(), target: planBal(S.plan), custom: { eatLess: hasActivity() ? Math.round(-step * 0.75 / 25) * 25 : -step, moveMore: hasActivity() ? Math.round(-step * 0.25 / 25) * 25 : 0 } };
      S.log.unshift(`${dateLabel(S.day)} · Weekly briefing suggests a Quick Calibration (${sgn(step)} kcal/day)`);
    }
  }
}

// ---------------- navigation -----------------
function go(screen, opts = {}) { if (!opts.replace) S.stack.push(S.screen); S.screen = screen; S.toast = opts.toast || null; render(); document.getElementById('phone-scroll')?.scrollTo(0, 0); }
function back() { S.screen = S.stack.pop() || 'home'; S.toast = null; render(); }
function home(toast) { S.stack = []; S.screen = 'home'; S.toast = toast || null; render(); }
function addVersion(label, detail) {
  const v = S.versions.length + 1;
  S.versions.unshift({ v, day: S.day, label, detail, snap: null });
  return v;
}

// ---------------- Home mapping (production-parity renderer) -----------------
function homeState() {
  const pct = `${Math.round((S.gained / 10) * 100)}%`;
  const base = {
    confidence: S.phase === 'leaning' || S.phase === 'leaningComplete' ? 70 : S.phase === 'resumed' ? 66 : 70,
    action: 'Log Morning Weight',
    priorities: [{ title: 'Morning Weigh-In', sub: 'Before food or fluids' }, { title: 'Foam Rolling', sub: 'Evening' }],
    briefing: S.decision.open && S.phase === 'building' ? { title: 'DEXA Analysis', date: 'Oct 9' } : { title: S.qc ? 'Weekly Briefing' : 'Weekly Briefing', date: dateLabel(Math.max(0, S.day - 1)) },
  };
  if (S.plan.recovery.includes('Stretching')) base.priorities.push({ title: 'Stretching', sub: 'Anytime' });
  if (S.phase === 'building' || S.phase === 'keepBuilding') {
    const decisionItem = S.decision.open && !S.decision.dismissed ? [{ title: 'Review goal options', sub: 'From your Oct 9 scan', kind: 'decision', action: 'openOptions' }] : [];
    return { ...base, headline: 'Lean Mass Build', timeline: S.phase === 'keepBuilding' ? `New date ${S.goalDate}` : '3 weeks remaining', support: 'Add lean mass gradually while keeping body fat in range.',
      metrics: { targetDate: S.goalDate, remaining: S.phase === 'keepBuilding' ? 'Revised' : '3 weeks', progress: pct, destination: '10 lb' }, range: `Jul 18 – ${S.goalDate}`,
      rows: [{ order: 1, status: 'completed', name: 'Establish Maintenance', detail: 'Completed' }, { order: 2, status: 'active', name: 'Lean Mass Build', detail: `Aug 15 – ${S.goalDate}`, label: `${f1(S.gained)} of 10 lb gained` }],
      guardrail: homeGR(bf() > effMax() ? 'Latest: above range' : 'Within range'),
      priorities: [...decisionItem, ...base.priorities] };
  }
  if (S.phase === 'leaning') {
    const wk = inPhaseWeeks();
    const left = S.completion.mode === 'outcome' ? 'until back in range' : `${Math.max(0, S.completion.weeks - wk)} weeks left`;
    return { ...base, headline: 'Leaning', timeline: `Temporary · ${left}`, support: S.completionTarget != null ? `Bring body fat to ${grFmt(S.completionTarget)}% while keeping lean mass.` : 'Lean out for a set time while keeping lean mass.',
      metrics: { targetDate: 'Paused', remaining: S.completion.mode === 'outcome' ? '—' : `${Math.max(0, S.completion.weeks - wk)} weeks`, progress: pct, destination: '10 lb' }, range: 'Jul 18 – date set after leaning',
      rows: [{ order: 2, status: 'paused', name: 'Lean Mass Build', detail: `${f1(S.gained)} of 10 lb kept` }, { order: 3, status: 'active', name: 'Leaning (temporary)', detail: `Since ${dateLabel(S.phaseStartDay)} · week ${wk + 1}`, label: `Body fat ${f1(bf())}% → ${S.completionTarget != null ? `${grFmt(S.completionTarget)}%` : 'time limit'}` }],
      guardrail: homeGR('Applies across every phase'),
      briefing: { title: 'Weekly Briefing', date: S.day === S.phaseStartDay ? 'Today' : dateLabel(S.day) } };
  }
  if (S.phase === 'leaningComplete') {
    const inRange = S.completionTarget != null && bf() <= S.completionTarget;
    return { ...base, headline: inRange ? 'Leaning complete' : 'Leaning time limit', timeline: inRange ? 'Back in range' : 'Review needed', support: inRange ? 'Choose when to resume building.' : 'Choose what happens next.',
      metrics: { targetDate: '—', remaining: '—', progress: pct, destination: '10 lb' }, range: 'Jul 18 – date set on resume',
      rows: [{ order: 2, status: 'paused', name: 'Lean Mass Build', detail: 'Ready to resume' }, { order: 3, status: 'completed', name: 'Leaning (temporary)', detail: inRange ? `Target ${grFmt(S.completionTarget)}% met` : `${dateLabel(S.phaseStartDay)} – ${dateLabel(S.day)}` }],
      guardrail: homeGR(bf() > effMax() ? 'Above range' : 'Within range'),
      briefing: { title: 'DEXA Analysis', date: dateLabel(S.day) },
      priorities: [...(S.decision.dismissed ? [] : [{ title: 'Choose your next phase', sub: inRange ? 'Leaning complete' : 'Time limit reached', kind: 'decision', action: 'openNext' }]), ...base.priorities] };
  }
  if (S.phase === 'maintaining') {
    return { ...base, headline: 'Maintain', timeline: 'Holding before building', support: 'Keep weight steady for a few weeks, then resume building.',
      metrics: { targetDate: '—', remaining: '—', progress: pct, destination: '10 lb' }, range: 'Jul 18 – date set on resume',
      rows: [{ order: 3, status: 'completed', name: 'Leaning (temporary)', detail: 'Target met' }, { order: 4, status: 'active', name: 'Maintain', detail: `Since ${dateLabel(S.phaseStartDay)}`, label: 'Building resumes when you choose' }],
      guardrail: homeGR('Within range') };
  }
  // resumed
  return { ...base, headline: 'Lean Mass Build', timeline: '14 weeks remaining', support: 'Add lean mass gradually while keeping body fat in range.',
    metrics: { targetDate: S.goalDate, remaining: '14 weeks', progress: pct, destination: '10 lb' }, range: `Jul 18 – ${S.goalDate}`,
    rows: [{ order: 3, status: 'completed', name: 'Leaning (temporary)', detail: 'Target met' }, { order: 4, status: 'active', name: 'Lean Mass Build', detail: `${dateLabel(S.phaseStartDay)} – ${S.goalDate}`, label: `${f1(S.gained)} of 10 lb gained` }],
    guardrail: homeGR(bf() > effMax() ? 'Above range' : 'Within range') };
}

// ---------------- shared UI bits -----------------
const sNav = (back, title, action = '', backAct = 'back') => `<div class="nav"><span class="back" data-act="${backAct}" role="button" tabindex="0">${I.back}<span>${back}</span></span><span class="title">${title}</span><span class="action">${action}</span></div>`;
const radio = (on) => `<div class="radio ${on ? 'on' : ''}"></div>`;
const tag = (t, tone = 'line') => `<span class="pill ${tone}">${t}</span>`;
const simTag = '<span class="pill amber" style="font-size:.625em">SIMULATED</span>';
const btn = (label, act, cls = 'primary', arg = '') => `<div class="btn ${cls}" data-act="${act}" ${arg !== '' ? `data-arg="${arg}"` : ''} role="button" tabindex="0">${label}</div>`;
const tabs = (active) => `<div class="tabbar">${[['home', 'Home'], ['goals', 'Goals'], ['log', 'Log'], ['evidence', 'Evidence'], ['you', 'You']].map(([k, l]) => `<div class="tab ${k === active ? 'on' : ''}" data-act="tab" data-arg="${k}" role="button" tabindex="0">${I[k]}<span>${l}</span></div>`).join('')}</div>`;
const coach = (title, rows) => `<div class="coach"><div class="eyebrow purple">${title}</div><div class="divider-list" style="margin-top:6px">${rows.map(([h, b]) => `<div style="padding:10px 0"><div class="t-sm strong">${h}</div><p class="t-sm ink2" style="margin-top:3px">${b}</p></div>`).join('')}</div></div>`;
const stubCards = (names) => `<div class="card soft" style="padding:10px 14px"><div class="t-xs muted">${names}</div></div>`;

// ---------------- screens -----------------
Object.assign(I, {
  flag: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M3.5 17V2M3.5 3h10l-2 3.5 2 3.5h-10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  shield: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 1.5 15 4v4.5c0 3.8-2.6 6.7-6 8-3.4-1.3-6-4.2-6-8V4l6-2.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  lift: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M1 9h16M4 5v8M14 5v8M2 7v4M16 7v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  moon: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M15 11.5A7 7 0 0 1 6.5 3 7 7 0 1 0 15 11.5Z" fill="currentColor"/></svg>',
  pill: '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="1.5" y="6" width="15" height="6.5" rx="3.25" fill="none" stroke="currentColor" stroke-width="1.8" transform="rotate(-35 9 9)"/><path d="m6.6 5.5 4.2 6" stroke="currentColor" stroke-width="1.8"/></svg>',
  cam: '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="1.5" y="4.5" width="15" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
});
const SCREENS = {};
SCREENS.home = () => `<div>${homeParity(homeState(), S.theme, { tabbar: false })}</div>${tabs('home')}`;

SCREENS.briefing = () => {
  if (S.phase === 'building' && S.decision.open) {
    return `${statusBar()}${sNav('Home', 'DEXA Analysis')}
    <div class="content stack">
      <div class="row between"><span class="eyebrow">DEXA event · Oct 9</span>${simTag}</div>
      ${stubCards('Hero · Snapshot · What Measurably Changed · What This Scan Means (unchanged)')}
      ${coach('Coach’s Insight', [['Biggest Win', 'You’re about 7 of 10 lb toward your lean-mass goal. That progress is real.'], ['Next', 'Body fat is above your 8–9% range. Decide how to handle it before pushing calories higher.']])}
      ${S.decision.dismissed ? '<p class="t-xs muted" style="text-align:center">You chose “Not now”. The decision stays available in Goals.</p>' : `
      <div class="card rail amber" style="padding-top:16px;padding-bottom:16px"><div class="eyebrow amber">Goal decision</div>
        <div class="display h3" style="margin-top:6px">Review your goal options</div>
        <p class="t-sm ink2" style="margin-top:6px">Body fat ${f1(bf())}% is above your ${grText(S.guardrail)} range, and Oct 31 is unlikely at your recent pace.</p>
        <div class="row" style="gap:10px;margin-top:12px">${btn('Review options', 'openOptions', 'primary small grow')}${btn('Not now', 'notNow', 'secondary small')}</div>
        <p class="t-xs muted" style="margin-top:8px">Nothing changes until you approve.</p></div>`}
    </div>`;
  }
  if (S.phase === 'leaningComplete') {
    const inRange = S.completionTarget != null && bf() <= S.completionTarget;
    const d = S.phaseSnapshot || S.body;
    return `${statusBar()}${sNav('Home', 'DEXA Analysis')}
    <div class="content stack">
      <div class="row between"><span class="eyebrow">DEXA event · ${dateLabel(S.day)}</span>${simTag}</div>
      <div class="card"><span class="eyebrow">Since starting the leaning phase</span>
        <div class="kv"><span class="k">Body fat</span><span class="delta"><s>${f1(S.phaseStartBf)}%</s><span class="v">${f1(bf())}%</span></span></div>
        <div class="kv"><span class="k">Fat mass</span><span class="v">${sgn((S.body.fat - S.phaseStartBody.fat) * 10) === '0' ? '0' : f1(S.body.fat - S.phaseStartBody.fat)} lb</span></div>
        <div class="kv"><span class="k">Lean mass</span><span class="v">${f1(S.body.lean - S.phaseStartBody.lean)} lb</span></div>
        <p class="t-xs muted">Lean mass is muscle plus water and other non-fat tissue; a small drop after a cut is often water.</p></div>
      ${coach('Coach’s Insight', [['Biggest Win', inRange ? 'Body fat is back in range and most of your lean mass held.' : 'Body fat came down, but not yet into range.'], ['Next', inRange ? 'Start building again slowly, keeping body fat in range.' : 'Decide whether to keep leaning, hold, or resume.']])}
      ${S.decision.dismissed ? '' : `<div class="card rail amber" style="padding-top:16px;padding-bottom:16px"><div class="eyebrow amber">Phase decision</div>
        <div class="display h3" style="margin-top:6px">${inRange ? 'Your leaning phase is complete' : 'Your leaning time limit is up'}</div>
        <div class="row" style="gap:10px;margin-top:12px">${btn('Choose what’s next', 'openNext', 'primary small grow')}${btn('Not now', 'notNowPhase', 'secondary small')}</div></div>`}
    </div>`;
  }
  // Weekly
  const wk = S.weeklyLog[S.weeklyLog.length - 1];
  const leaning = S.phase === 'leaning';
  const headline = leaning ? (S.qc ? 'Leaning is slower than planned' : 'Leaning is on track') : 'Steady week';
  return `${statusBar()}${sNav('Home', 'Weekly Briefing')}
  <div class="content stack">
    <div class="row between"><span class="eyebrow">Weekly · week ending ${dateLabel(S.day)}</span>${simTag}</div>
    <div class="card" style="background:linear-gradient(160deg,var(--fieldStart),var(--fieldEnd));border:0"><div class="display h3">${headline}</div>
      <p class="t-sm" style="margin-top:6px">${wk ? `Weight ${wk.dw < 0 ? '−' : '+'}${f1(Math.abs(wk.dw))} lb this week · body fat ${f1(wk.bf)}%` : 'No simulated week yet. Use “Advance a week”.'}</p>
      <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">${tag(`Strategy: ${leaning ? 'Leaning (temporary)' : 'Lean Mass Build'}`)}${leaning ? tag(`Week ${inPhaseWeeks()}`) : ''}</div></div>
    ${stubCards('Energy · Weight · Body Composition · Training · Recovery (layout unchanged)')}
    ${coach('Coach’s Take', leaning ? [['Biggest Takeaway', S.qc ? 'You followed the plan, but fat loss is slower than planned.' : 'Fat is coming down and your lifts are holding, so the lean mass you built is protected.'], ['What To Do', 'Keep training heavy; it’s what protects lean mass while you eat less.'], ['Into Next Week', `Eat ${fmt(S.plan.eat)} · activity goal ${fmtG(S.plan.goal)}.`]] : [['Biggest Takeaway', 'Training and logging stayed consistent.'], ['Into Next Week', `Eat ${fmt(S.plan.eat)} · activity goal ${fmtG(S.plan.goal)}.`]])}
    ${S.qc ? qcCard() : '<p class="t-xs muted" style="text-align:center">No suggestion this week, so nothing appears below Coach’s Take.</p>'}
  </div>`;
};
function qcCard() {
  const q = S.qc; const act = hasActivity();
  const half = Math.round(q.step / 2 / 25) * 25;
  const opts = { eat: { label: 'Eat less', eat: q.step, move: 0 }, ...(act ? { move: { label: 'Move more', eat: 0, move: -q.step }, blend: { label: 'Blend', eat: half, move: q.step - half === 0 ? 0 : -(q.step - half) } } : {}), custom: { label: 'Custom', eat: -q.custom.eatLess, move: act ? q.custom.moveMore : 0 } };
  const sel = q.opt ? opts[q.opt] : null;
  const newEat = sel ? S.plan.eat + sel.eat : S.plan.eat, newGoal = sel && S.plan.goal != null ? S.plan.goal + sel.move : S.plan.goal;
  const change = sel ? sel.eat - sel.move : q.step;
  const newM = q.fromM + q.step;
  const floor = floorFor(newM);
  const bad = sel && (newEat < floor || Math.abs(change) > 300 || change === 0);
  return `<div class="card selected">
    <div class="row between"><span class="eyebrow amber">Quick calibration</span>${tag('Checked', 'teal')}</div>
    <div class="display h3" style="margin-top:8px">Add ${fmt(-q.step)} to your daily deficit</div>
    <p class="t-sm ink2" style="margin-top:6px">Your logged intake and weight trend suggest maintenance is about ${fmt(newM)}, not ${fmt(q.fromM)}. So your ${sgn(q.target)} plan has been closer to ${sgn(q.target - q.step)}. Adding ${fmt(-q.step)} a day keeps you on pace.</p>
    <div class="qgrid" role="radiogroup" aria-label="How">${Object.entries(opts).map(([k, o]) => `<div class="qtile ${q.opt === k ? 'on' : ''}" role="radio" aria-checked="${q.opt === k}" tabindex="0" data-act="qcOpt" data-arg="${k}"><b>${o.label}</b><span>${k === 'custom' ? 'Set your own' : `eat ${fmt(S.plan.eat + o.eat)}${act ? ` · goal ${fmtG(S.plan.goal + o.move)}` : ''}`}</span></div>`).join('')}</div>
    ${act ? '' : '<p class="t-xs muted" style="margin-top:6px">Move more and Blend need activity data.</p>'}
    ${q.opt === 'custom' ? `<div class="row between" style="margin-top:10px"><span class="t-sm ink2">Eat less by</span><div class="mini-step"><span data-act="qcStep" data-arg="eatLess:-25" role="button" tabindex="0">−25</span><span data-act="qcStep" data-arg="eatLess:25" role="button" tabindex="0">+25</span></div><b>${q.custom.eatLess}</b></div>
      ${act ? `<div class="row between" style="margin-top:8px"><span class="t-sm ink2">Move more by</span><div class="mini-step"><span data-act="qcStep" data-arg="moveMore:-25" role="button" tabindex="0">−25</span><span data-act="qcStep" data-arg="moveMore:25" role="button" tabindex="0">+25</span></div><b>${q.custom.moveMore}</b></div>` : ''}` : ''}
    <div class="card soft" style="margin-top:10px;padding:8px 12px"><div class="kv" style="padding:5px 0"><span class="k">Eat</span><span class="v">${fmt(newEat)}</span></div><div class="kv" style="padding:5px 0"><span class="k">Activity goal</span><span class="v">${fmtG(newGoal)}</span></div><div class="kv" style="padding:5px 0"><span class="k">Planned balance (vs ${fmt(newM)})</span><span class="v">${sgn(newEat - newM - ((S.plan.added || 0) + (sel ? sel.move : 0)))}</span></div></div>
    ${sel && newEat < floor ? `<div class="ewarn red">${I.warn}<span>Eating can’t go below ${fmt(floor)} (provisional floor).</span></div>` : ''}
    ${sel && Math.abs(change) > 300 ? `<div class="ewarn amber">${I.warn}<span>Changes over 300 a day go to a full plan review.</span></div>` : ''}
    <div class="row" style="margin-top:12px">${sel ? btn(bad ? 'Adjust the amount' : `Accept: eat ${fmt(newEat)}${act ? ` · goal ${fmtG(newGoal)}` : ''}`, bad ? 'noop' : 'qcAccept', bad ? 'disabled grow' : 'primary grow') : '<div class="btn disabled grow">Choose how</div>'}</div>
    <div class="row between" style="margin-top:6px"><span class="t-sm semi" style="color:var(--teal)" data-act="go" data-arg="qcWhy" role="button" tabindex="0">Why?</span><span class="t-sm semi muted" data-act="qcLater" role="button" tabindex="0">Not now</span></div>
  </div>`;
}
SCREENS.qcWhy = () => { const q = S.qc; const real = Math.round((q.observed * 3300) / 7 / 10) * 10; return `${statusBar()}${sNav('Weekly', 'Why this change')}
  <div class="content stack"><div class="display h2">Why ${fmt(-q.step)}?</div>
  <div class="card"><div class="kv"><span class="k">Logging</span><span class="v">complete enough to calibrate ${simTag}</span></div>
  <div class="kv"><span class="k">Weight trend</span><span class="v">${f1(q.observed)} lb/week (planned ${f1(q.expected)})</span></div>
  <div class="kv"><span class="k">Real balance implied</span><span class="v">≈ ${sgn(real)}/day (planned ${sgn(q.target)})</span></div>
  <div class="kv"><span class="k">Maintenance</span><span class="delta"><s>${fmt(q.fromM)}</s><span class="v">≈ ${fmt(q.fromM + q.step)}</span></span></div></div>
  <p class="t-sm ink2">These are logged calories: the comparison between what you logged and how your weight changed. Logs, wearables and RMR estimates all carry error, so we move in modest steps and watch for 3 weeks before suggesting anything else.</p></div>`; };
SCREENS.monthly = () => { const leaning = S.phase === 'leaning'; return `${statusBar()}${sNav('Home', 'Monthly Briefing')}
  <div class="content stack"><div class="row between"><span class="eyebrow">Monthly · ${dateLabel(S.day)}</span>${simTag}</div>
  ${stubCards('Hero · Goal Milestone · Training · Energy · Recovery · New Baseline · What Changed · Defining Moments (layout unchanged)')}
  ${coach('Coach’s Take', [['Coach’s Take', leaning ? 'This month moved from building to a planned leaning phase. Both serve the same Build Lean Mass goal: protect what you built, then keep building.' : S.phase === 'resumed' ? 'Building again after a short leaning phase. Body fat is in range, so this is a clean restart.' : 'Steady month toward Build Lean Mass.']])}
  <div class="card"><span class="eyebrow">Month Ahead</span><div class="t-body strong" style="margin-top:6px">${leaning ? 'Finish leaning, then choose how to resume building.' : 'Keep the current plan.'}</div>
  <p class="t-sm ink2" style="margin-top:4px">Phase and goal are tracked separately: the phase ends when you’re back in range; the goal date is set when building resumes.</p></div>
  ${S.qc ? `<div class="card" style="padding:12px 16px" data-act="openWeekly" role="button" tabindex="0"><div class="row between"><div><div class="t-sm strong">A Quick Calibration is open</div><div class="t-xs muted">From your Weekly</div></div>${I.chev}</div></div>` : ''}</div>`; };
SCREENS.photo = () => `${statusBar()}${sNav('Home', 'Photo Event')}
  <div class="content stack"><div class="row between"><span class="eyebrow">Photo event · ${dateLabel(S.day)}</span>${simTag}</div>
  ${stubCards('Hero · This Photo Session · What Visibly Changed · Interpretation (layout unchanged)')}
  ${coach('Coach’s Insight', [['Coach’s Insight', S.phase === 'leaning' ? 'Your waist looks a little leaner, consistent with the leaning phase. Photos support the trend but don’t measure body fat, so a scan or your weigh-in trend decides when the phase is done.' : 'Photos look consistent with your recent trend.']])}
  <p class="t-xs muted" style="text-align:center">Photos alone never trigger a recommendation.</p></div>`;
SCREENS.midweek = () => `${statusBar()}${sNav('Home', 'Midweek Briefing')}
  <div class="content stack"><div class="row between"><span class="eyebrow">Midweek · ${dateLabel(S.day + 3)}</span>${simTag}</div>
  <div class="card" style="background:linear-gradient(160deg,var(--fieldStart),var(--fieldEnd));border:0"><div class="display h3">${S.phase === 'leaning' ? 'Leaning is moving as planned so far' : 'On plan so far this week'}</div>
  <div style="margin-top:8px">${tag(`Goal & Phase: Build Lean Mass · ${S.phase === 'leaning' ? 'Leaning (temporary)' : S.phase === 'maintaining' ? 'Maintain' : 'Lean Mass Build'}`)}</div></div>
  ${stubCards('Energy · Weight · Body Composition · Training (layout unchanged)')}
  ${coach('Coach’s Take', [['Biggest Takeaway', 'Intake and activity are on plan through Tuesday.'], ['What To Do', 'Keep the same plan through Sunday.']])}
  ${S.qc || (S.decision.open && !S.decision.dismissed) ? `<div class="card" style="padding:12px 16px" data-act="${S.qc ? 'openWeekly' : S.phase === 'leaningComplete' ? 'openNext' : 'openOptions'}" role="button" tabindex="0"><div class="row between"><div><div class="t-sm strong">You have an open decision</div><div class="t-xs muted">From an earlier briefing</div></div>${I.chev}</div></div>` : ''}
  <p class="t-xs muted" style="text-align:center">Midweek never makes new suggestions.</p></div>`;

SCREENS.options = () => `${statusBar()}${sNav('Back', 'Goal Options')}
  <div class="content stack">
    <div class="display h1">Choose what to protect next</div>
    <p class="t-body ink2">You’ve built about ${f1(S.gained)} of your 10 lb. Body fat (${f1(bf())}%) is above your ${grText(S.guardrail)} range, and Oct 31 is unlikely at your recent pace. ${simTag}</p>
    <div class="cmp">
      <div class="hd lbl"></div><div class="hd sel"><span style="color:var(--teal)">★</span> Lean out first</div><div class="hd">Keep building</div><div class="hd">Keep plan</div>
      <div class="lbl">Body fat</div><div class="sel">Back to 8–9%</div><div>Higher; new range needed</div><div>Likely keeps rising</div>
      <div class="lbl">Lean mass</div><div class="sel">Held; building pauses</div><div>Keeps building</div><div>Keeps building</div>
      <div class="lbl">Timing</div><div class="sel">Leaning a few weeks, then build</div><div>Goal later than Oct 31</div><div>Oct 31 unlikely</div>
      <div class="lbl">Fits limits?</div><div class="sel" style="color:var(--green);font-weight:700">Yes</div><div style="color:var(--amberInk);font-weight:700">New range</div><div style="color:var(--red);font-weight:700">No</div>
    </div>
    <p class="t-xs muted">★ Ranked first. Ranges are rough and rechecked before you approve.</p>
    ${btn('Lean out first', 'chooseLean')}
    ${btn('Keep building with new limits', 'chooseKeepBuilding', 'secondary')}
    ${btn('Keep my current plan', 'chooseKeepPlan', 'secondary')}
    <div class="btn ghost" data-act="chooseCustom" role="button" tabindex="0">Make my own changes instead</div>
  </div>`;

SCREENS.notNow = () => `${statusBar()}${sNav('Back', 'Not now')}
  <div class="content stack"><div class="display h2">Not ready to decide?</div>
  <div class="card divider-list" style="padding:0 16px">
    <div class="choice" data-act="notNowPick" data-arg="remind" role="button" tabindex="0"><div class="grow"><div class="t-body strong">Remind me with Sunday’s Weekly</div><div class="t-sm ink2">Hidden until then.</div></div>${I.chev}</div>
    <div class="choice" data-act="notNowPick" data-arg="keep" role="button" tabindex="0"><div class="grow"><div class="t-body strong">Keep my current plan</div><div class="t-sm ink2">We won’t ask again unless new evidence gives a new reason.</div></div>${I.chev}</div>
    <div class="choice" data-act="notNowPick" data-arg="remove" role="button" tabindex="0"><div class="grow"><div class="t-body strong">Remove from Home</div><div class="t-sm ink2">Stays open in Goals.</div></div>${I.chev}</div>
  </div></div>`;

function goalChangeNote(d) {
  const base = draftBase(d), pr = draftProposed(d);
  if (grSame(base.goal, pr.goal)) return '';
  const t = tgtUsed(d) ? ` This leaning phase is meant to bring you back into it: phase target ${d.targetMode === 'custom' ? `stays at your custom ${grFmt(tgt(d))}%` : `≤ ${grFmt(tgt(d))}%, set automatically`}.` : '';
  return `<div class="card soft" style="padding:10px 14px"><span class="eyebrow amber">Goal guardrail · going forward</span><div class="t-sm" style="margin-top:4px"><s class="muted">${grText(base.goal)}</s> → <b>${grText(pr.goal)}</b> for Build Lean Mass.${t}${d.kind === 'lean' ? ` Phase 4 keeps ${grText(pr.goal)} when building resumes.` : ''}</div></div>`;
}
SCREENS.leanSetup = () => { const d = S.draft; return `${statusBar()}${sNav('Options', 'Leaning Phase')}
  <div class="content stack">
    <div class="display h1">Set up your leaning phase</div>
    <p class="lead">Two decisions. Everything else carries forward.</p>
    <div class="card"><span class="eyebrow">Ends</span><div class="divider-list" style="margin-top:4px">
      ${[['outcome', 'When I reach my phase target', `Body fat at or below ${grFmt(tgt(d))}%. A DEXA confirms it best; otherwise we estimate from trends.`], ['time', 'After a set time', 'Then we review together'], ['hybrid', 'Whichever comes first', 'Back in range, or the time limit']].map(([k, t, sub]) => `<div class="choice" data-act="setCompletion" data-arg="${k}" role="radio" aria-checked="${d.completion.mode === k}" tabindex="0">${radio(d.completion.mode === k)}<div class="grow"><div class="t-body strong">${t}</div><div class="t-sm ink2">${sub}</div></div></div>`).join('')}
    </div>${d.completion.mode !== 'outcome' ? `<div class="row between" style="margin-top:6px"><span class="t-sm ink2">Time limit</span><div class="stepper"><span data-act="weeks" data-arg="-1" role="button" tabindex="0">−</span><b>${d.completion.weeks} weeks</b><span data-act="weeks" data-arg="1" role="button" tabindex="0">+</span></div></div>` : ''}
    <p class="t-xs muted" style="margin-top:6px">Nothing ends or restarts on its own; you choose what’s next.</p></div>
    <div class="card" style="padding:0 16px"><div class="divider-list">
      ${d.completion.mode !== 'time' ? `<div class="srow"><span class="ic ${tgt(d) !== tgtStart(d) ? 'amber' : ''}">${I.flag}</span><div class="grow"><div class="nm">Phase target</div><div class="dt">Ends at body fat ≤ ${grFmt(tgt(d))}% · ${tgtWhy(d)} · now ${f1(bf())}%</div>${d.targetMode === 'custom' && tgt(d) !== tgtInfo(d).value ? `<div class="t-sm semi" style="color:var(--teal);margin-top:2px" data-act="targetAuto" role="button" tabindex="0">Align to ${grFmt(tgtInfo(d).value)}%</div>` : ''}</div><div class="mini-step"><span data-act="target" data-arg="-0.5" role="button" tabindex="0" aria-label="Lower phase target">−</span><span data-act="target" data-arg="0.5" role="button" tabindex="0" aria-label="Raise phase target">+</span></div></div>` : ''}
      <div class="srow" data-act="openGuardrail" role="button" tabindex="0"><span class="ic ${grChanged(d) ? 'amber' : ''}">${I.shield}</span><div class="grow"><div class="nm">Body-fat guardrail</div><div class="dt">${grLabel(draftProposed(d))}</div></div><span class="edit">Edit</span></div>
    </div><p class="t-xs muted" style="margin:6px 0 10px">The phase target is what ends this phase. The guardrail is the range your goal protects.</p></div>
    ${goalChangeNote(d)}
    ${checkMsgs({ errors: draftCheck(d).errors, warnings: [] })}${fixes(d)}
    <div class="card" style="padding:0 16px"><div class="srow" data-act="openEnergy" role="button" tabindex="0"><span class="ic amber">${I.bolt}</span><div class="grow"><div class="nm">Daily energy</div><div class="dt"><b style="color:var(--ink)">${sgn(d.plan.balance)} a day</b> · eat ${fmt(d.plan.eat)} · activity goal ${fmtG(d.plan.goal)}</div></div><span class="edit">Edit</span></div></div>
    <div class="card" style="padding:12px 16px" data-act="openHub" role="button" tabindex="0"><div class="row between"><div><div class="t-body strong">Your plan</div><div class="t-sm ink2">Training, recovery, supplements and tracking carry forward</div></div>${I.chev}</div></div>
    ${btn('Review', draftCheck(d).ok ? 'openReview' : 'noop', draftCheck(d).ok ? 'primary' : 'disabled')}
  </div>`; };

SCREENS.keepBuilding = () => { const d = S.draft; const pr = draftProposed(d); const eff = grEffective(pr.goal, pr.phase); const chk = draftCheck(d); const fits = eff.enabled === false || eff.max >= 11.5; return `${statusBar()}${sNav('Options', 'Keep Building')}
  <div class="content stack"><div class="display h1">Keep building with limits that fit</div>
    <div class="card" style="padding:0 16px"><div class="srow" data-act="openGuardrail" role="button" tabindex="0"><span class="ic amber">${I.shield}</span><div class="grow"><div class="nm">Body-fat guardrail</div><div class="dt">${grLabel(pr)} · now ${f1(bf())}%</div></div><span class="edit">Edit</span></div></div>
    ${checkMsgs(chk)}${fixes(d)}
    ${chk.ok ? `<div class="ewarn ${fits ? 'ok' : 'amber'}">${fits ? I.check : I.warn}<span>${fits ? 'At a small surplus, body fat likely stays inside this range.' : 'Body fat likely ends around 10.4–11.3%; an upper limit of at least 11.5% fits.'}</span></div>` : ''}
    <div class="card"><span class="eyebrow">Goal date</span>
      <div class="choice" data-act="date" data-arg="Oct 31" role="radio" tabindex="0">${radio(d.goalDate === 'Oct 31')}<div class="grow"><div class="t-body strong">Keep Oct 31</div>${d.goalDate === 'Oct 31' ? `<div class="ewarn amber">${I.warn}<span>Likely not achievable. It will show as at risk.</span></div>` : ''}</div></div>
      <div class="choice" data-act="date" data-arg="Feb 15" role="radio" tabindex="0">${radio(d.goalDate === 'Feb 15')}<div class="grow"><div class="t-body strong">Move to Feb 15</div><div class="t-sm ink2">Likely at a slow, lean gain</div></div></div></div>
    <div class="card" style="padding:0 16px"><div class="srow" data-act="openEnergy" role="button" tabindex="0"><span class="ic amber">${I.bolt}</span><div class="grow"><div class="nm">Daily energy</div><div class="dt"><b style="color:var(--ink)">${sgn(d.plan.balance)} a day</b> · eat ${fmt(d.plan.eat)}</div></div><span class="edit">Edit</span></div></div>
    ${btn('Your plan', 'openHub', 'secondary')}${btn('Review', chk.ok ? 'openReview' : 'noop', chk.ok ? 'primary' : 'disabled')}
  </div>`; };

SCREENS.guardrail = () => { const d = S.draft; const base = draftBase(d); const pr = draftProposed(d); const chk = draftCheck(d); const g = d.gr;
  const scopeLabel = d.kind === 'next' ? 'Next phase only' : d.kind === 'lean' ? 'Leaning phase only' : 'This phase only';
  const goalScope = g.scope === 'goal'; const phaseWord = d.kind === 'lean' ? 'leaning phase' : d.kind === 'next' ? 'next phase' : 'current phase';
  const head = g.mode === 'keep' ? '' : goalScope ? 'Changing your GOAL guardrail' : `Changing the ${phaseWord} only`;
  const note = g.mode === 'keep' ? '' : goalScope
    ? `Build Lean Mass uses ${grText(pr.goal)} going forward${d.kind === 'next' ? ', starting with the next phase' : d.kind === 'lean' ? '' : ', in this and every later phase'}.${tgtUsed(d) ? ` This leaning phase aims to bring you back into it, so its phase target ${d.targetMode === 'custom' ? `stays at your custom ${grFmt(tgt(d))}%` : `moves to ${grFmt(tgt(d))}% automatically`}.` : ''}${d.kind === 'lean' ? ` Phase 4 keeps ${grText(pr.goal)} when building resumes.` : ''}`
    : `Only during the ${phaseWord}. Your goal guardrail (${grText(pr.goal)}) returns when it ends${d.kind === 'lean' ? ' and carries into Phase 4' : ''}.`;
  const after = [['Goal guardrail', `${grText(pr.goal)} · ${grSame(base.goal, pr.goal) ? 'unchanged' : 'going forward'}`]];
  if (pr.phase) after.push([scopeLabel, grText(pr.phase)]);
  if (tgtUsed(d)) after.push(['Phase target (separate)', `≤ ${grFmt(tgt(d))}% · ${tgtWhy(d)}`]);
  if (d.kind === 'lean' || (d.kind === 'next' && d.next !== 'resume')) after.push(['When building resumes (Phase 4)', grText(pr.goal)]);
  if (d.kind === 'next' && d.next === 'resume') after.push(['Phase 4 starts with', grText(grEffective(pr.goal, pr.phase))]);
  return `${statusBar()}${sNav('Cancel', 'Body-Fat Guardrail', '<span data-act="grDone" role="button" tabindex="0" style="font-weight:700">Done</span>', 'grCancel')}
  <div class="content stack">
    <div class="card soft" style="padding:10px 14px"><div class="kv" style="padding:4px 0"><span class="k">Now applies</span><span class="v">${grLabel(base)}</span></div><div class="kv" style="padding:4px 0"><span class="k">Body fat now</span><span class="v">${f1(bf())}% ${simTag}</span></div></div>
    <div class="card"><div class="divider-list">
      ${[['keep', `Keep ${grText(grEffective(base.goal, base.phase))}`, 'No change'], ['change', 'Change the range', 'Raise or lower the limits'], ['remove', 'Remove the guardrail', 'Body fat is still shown; it just won’t trigger reviews']].map(([k, t, sub]) => `<div class="choice" data-act="grMode" data-arg="${k}" role="radio" aria-checked="${g.mode === k}" tabindex="0">${radio(g.mode === k)}<div class="grow"><div class="t-body strong">${t}</div><div class="t-sm ink2">${sub}</div></div></div>`).join('')}
    </div>
    ${g.mode !== 'keep' ? `<div class="t-sm strong" style="margin-top:12px">Applies to</div><div class="seg" style="margin-top:8px"><div class="${goalScope ? 'on' : ''}" data-act="grScope" data-arg="goal" role="radio" aria-checked="${goalScope}" tabindex="0">Goal, going forward</div><div class="${!goalScope ? 'on' : ''}" data-act="grScope" data-arg="phase" role="radio" aria-checked="${!goalScope}" tabindex="0">${scopeLabel}</div></div>` : ''}
    ${g.mode === 'change' ? `<div class="row between" style="margin-top:12px"><span class="t-body">Lower</span><div class="stepper"><span data-act="gr" data-arg="min:-0.5" role="button" tabindex="0" aria-label="Lower limit down">−</span><b>${grFmt(g.min)}%</b><span data-act="gr" data-arg="min:0.5" role="button" tabindex="0" aria-label="Lower limit up">+</span></div></div>
      <div class="row between" style="margin-top:8px"><span class="t-body">Upper</span><div class="stepper"><span data-act="gr" data-arg="max:-0.5" role="button" tabindex="0" aria-label="Upper limit down">−</span><b>${grFmt(g.max)}%</b><span data-act="gr" data-arg="max:0.5" role="button" tabindex="0" aria-label="Upper limit up">+</span></div></div>` : ''}
    </div>
    ${head ? `<div class="card soft" style="padding:10px 14px"><span class="eyebrow ${goalScope ? 'amber' : ''}">${head}</span><div class="t-sm" style="margin-top:4px">${note}</div></div>` : ''}
    ${checkMsgs(chk)}${fixes(d, true)}
    <div class="card" style="padding:10px 14px">${after.map(([k, v]) => `<div class="kv" style="padding:4px 0"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div>
    <p class="t-xs muted">Changes join the rest of this plan and apply with one approval. Earlier ranges stay in your goal history.</p>
  </div>`; };

SCREENS.explainer = () => `${statusBar()}${sNav('Back', 'Daily Energy')}
  <div class="content stack" style="padding-top:30px"><span class="eyebrow amber">Before you set your energy</span>
  <div class="display h1">Your targets are a starting point</div>
  <p class="t-body ink2">Food logs and wearables both have margins of error. That’s normal.</p>
  <p class="t-body ink2">Consistent targets help us see how your body actually responds.</p>
  <p class="t-body ink2">PhysiqueOS then recalibrates from your weight and body-composition trends, and suggests small adjustments in your briefings.</p>
  ${btn('Continue', 'explainerDone')}
  <p class="t-xs muted" style="text-align:center">Shown once.</p></div>`;

SCREENS.energy = () => { const d = S.draft; const e = energyFrom(d.plan.balance, d.split, d.custom); const pm = planningMaintenance(S.E); const act = hasActivity(); return `${statusBar()}${sNav('Back', 'Daily Energy', '<span data-act="back" role="button" tabindex="0" style="font-weight:700">Done</span>')}
  <div class="content stack">
    <div class="card"><div class="row between"><span class="eyebrow amber">Daily balance</span><span class="t-xs muted">Suggested ${S.draft.kind === 'lean' ? '−450' : S.draft.kind === 'next' ? '' : '+200'}</span></div>
      <div class="bigval" style="margin-top:10px" data-e="balance">${sgn(e.balance)}<small>kcal/day</small>${e.limited ? ' <span style="font-size:.4em;color:var(--red)">limited</span>' : ''}</div>
      <div class="t-xs muted" style="margin-top:4px">${rateRange(e.balance)} · simulated</div>
      <div class="rng"><div class="track"></div><input type="range" aria-label="Daily balance" data-in="balance" min="-750" max="500" step="25" value="${d.plan.balance}"></div>
      <div class="ticks"><span>−750</span><span>0</span><span>+500</span></div>
      <div class="row" style="justify-content:center;gap:10px;margin-top:6px"><div class="mini-step"><span data-act="bal" data-arg="-25" role="button" tabindex="0">−25</span><span data-act="bal" data-arg="25" role="button" tabindex="0">+25</span></div><span class="t-sm semi" style="color:var(--teal)" data-act="balReset" role="button" tabindex="0">Reset</span></div></div>
    <div class="t-sm strong">How you get there</div>
    <div class="chips" role="radiogroup">${[['suggested', '★ Suggested'], ['eat', 'Eat less'], ['move', 'Move more'], ['blend', 'Blend'], ['custom', 'Custom']].filter(([k]) => act || k === 'suggested' || k === 'eat').map(([k, l]) => `<span class="chip ${d.split === k ? 'on' : ''}" data-act="split" data-arg="${k}" role="radio" aria-checked="${d.split === k}" tabindex="0">${l}</span>`).join('')}</div>
    ${act ? '' : '<p class="t-xs muted">No activity data, so the balance comes from eating. Connect Apple Health to plan extra activity.</p>'}
    ${d.split === 'custom' && act ? `<div class="row between"><span class="t-sm ink2">Extra activity</span><div class="mini-step"><span data-act="custom" data-arg="-25" role="button" tabindex="0">−25</span><span data-act="custom" data-arg="25" role="button" tabindex="0">+25</span></div><b>+${fmt(e.added)}</b></div>` : ''}
    <div class="card soft">
      <div class="kv"><span class="k">Eat each day</span><span class="v" data-e="eat">${fmt(e.eat)} kcal</span></div>
      <div class="kv"><span class="k">Activity goal</span><span class="v" data-e="goal">${act ? `${fmt(e.goal)} kcal <span class="t-xs muted">(usual ${fmt(S.E.usual)} +${fmt(e.added)})</span>` : '—'}</span></div>
      <p class="t-xs muted" style="margin-top:6px" data-e="formula">Eat = maintenance ${fmt(pm.value)} ${e.balance < 0 ? '−' : '+'} ${fmt(Math.abs(e.balance))}${act ? ` + extra ${fmt(e.added)}` : ''} = <b>${fmt(e.eat)}</b></p>
      <p class="t-xs muted">Maintenance used: ${maintLabel()}${pm.source === 'provisional' ? ', range ' + fmt(pm.low) + '–' + fmt(pm.high) : ''}.</p>
      ${e.added ? `<p class="t-xs muted">For example, ≈ ${fmt(Math.round(e.added * 22 / 100) * 100)} more steps a day. Any activity counts.</p>` : ''}</div>
    ${pm.source === 'provisional' ? `<div class="ewarn amber">${I.warn}<span>This is a starting estimate, not calibrated from your results yet. Targets will be checked against your weight trend after about 3 weeks of logging.</span></div>` : ''}
    ${e.limited ? `<div class="ewarn red">${I.warn}<span>Eating is held at ${fmt(e.floor)} (provisional floor). Add activity or choose a smaller deficit.</span></div>` : ''}
    ${e.eat >= pm.value && e.added > 0 && e.balance < 0 ? `<div class="ewarn amber">${I.warn}<span>You’d eat at or above maintenance and rely on extra activity for the whole deficit.</span></div>` : ''}
    <span class="t-sm semi" style="color:var(--teal)" data-act="go" data-arg="why" role="button" tabindex="0">Why these numbers?</span>
  </div>`; };

SCREENS.why = () => { const p = S.draft ? S.draft.plan : S.plan; const r = reconciliation(S.E, p); const E = S.E; const act = hasActivity(); const src = RMR_SOURCES[E.rmrSource].label;
  return `${statusBar()}${sNav('Back', 'Why these numbers?')}
  <div class="content stack">
    <p class="lead">How eating ${fmt(p.eat)}${act ? ` and an activity goal of ${fmtG(p.goal)}` : ''} were worked out. All values are simulated. ${simTag}</p>
    <div class="layer"><div class="row between"><span class="t-sm strong">1 · Resting energy (RMR)</span><span class="prov e">${src}</span></div><div class="t-body strong" style="margin-top:4px">≈ ${fmt(E.rmr)} kcal/day</div><p class="t-xs muted">An estimate unless measured. It changes as body composition changes.</p></div>
    <div class="layer"><div class="row between"><span class="t-sm strong">2 · Usual activity</span><span class="prov">${act ? 'Apple Health, last 4 weeks' : 'No activity data'}</span></div><div class="t-body strong" style="margin-top:4px">${act ? `≈ ${fmt(E.usual)} kcal/day, workouts included` : `Assumed activity level × ${E.factor}`}</div></div>
    <div class="layer"><div class="row between"><span class="t-sm strong">3 · Digestion</span><span class="prov">Assumption</span></div><div class="t-body strong" style="margin-top:4px">≈ ${E.tefPct}% of intake${act ? ` (≈ ${fmt(r.tef)})` : ' (inside the activity factor)'}</div></div>
    <div class="layer"><div class="row between"><span class="t-sm strong">4 · Estimate from these parts</span><span class="prov">Bottom-up</span></div><div class="t-body strong" style="margin-top:4px">≈ ${fmt(r.bottomUp.value)} (${fmt(r.bottomUp.low)}–${fmt(r.bottomUp.high)}) at usual activity</div><p class="t-xs muted">${act ? `(${fmt(E.rmr)} + ${fmt(E.usual)}) ÷ (1 − ${E.tefPct}%)` : `${fmt(E.rmr)} × ${E.factor}`}</p></div>
    <div class="layer" style="${r.planning.source === 'calibrated' ? 'border-color:var(--teal)' : ''}"><div class="row between"><span class="t-sm strong">5 · Maintenance from your results</span><span class="prov ${r.planning.source === 'calibrated' ? 'm' : ''}">${r.planning.source === 'calibrated' ? 'Calibrated' : 'Not available yet'}</span></div>
      <div class="t-body strong" style="margin-top:4px">${r.planning.source === 'calibrated' ? `≈ ${fmt(r.planning.value)} (${fmt(r.planning.low)}–${fmt(r.planning.high)}) logged kcal/day` : '—'}</div><p class="t-xs muted">${r.planning.note || ''}</p></div>
    <div class="card" style="border:1.5px solid var(--teal)"><span class="eyebrow">What the plan uses</span>
      <div class="kv"><span class="k">Maintenance</span><span class="v">${maintLabel()}</span></div>
      <div class="kv"><span class="k">Planned daily balance</span><span class="v">${sgn(r.balance)}</span></div>
      <div class="kv"><span class="k">Eat</span><span class="v">${fmt(r.planning.value)} ${r.balance < 0 ? '−' : '+'} ${fmt(Math.abs(r.balance))}${act ? ` + ${fmt(p.added || 0)} extra` : ''} = ${fmt(p.eat)}</span></div>
      ${act ? `<div class="kv"><span class="k">Activity goal</span><span class="v">${fmt(E.usual)} usual + ${fmt(p.added || 0)} extra = ${fmtG(p.goal)}</span></div>` : ''}</div>
    ${act ? `<div class="card soft"><span class="eyebrow">Why it isn’t RMR + activity − food</span>
      <div class="kv"><span class="k">RMR + activity goal − eat</span><span class="v">${fmt(E.rmr)} + ${fmtG(p.goal)} − ${fmt(p.eat)} = ${fmt(r.naive)}</span></div>
      <div class="kv"><span class="k">With digestion added</span><span class="v">≈ ${fmt(-r.bottomUpDiff)}</span></div>
      <p class="t-xs muted" style="margin-top:6px">That simple sum is not your deficit. ${r.planning.source === 'calibrated' ? `Your results behave like maintenance ≈ ${fmt(r.planning.value)}, about ${fmt(Math.abs(r.gap))} ${r.gap > 0 ? 'below' : 'above'} the bottom-up estimate. The gap usually comes from under-logged food, wearable over-estimates and RMR estimate error. The plan follows your results and still shows both.` : 'Until your results calibrate it, the plan starts from the bottom-up estimate with a wide range.'}</p></div>` : ''}
  </div>`; };

const hubRow = (ic, name, detail, act, changed) => `<div class="srow ${changed ? 'chg' : ''}" data-act="${act}" role="button" tabindex="0"><span class="ic ${changed ? 'amber' : ''}">${ic}</span><div class="grow"><div class="nm">${name}</div><div class="dt">${detail}</div></div><span class="edit">Edit</span></div>`;
SCREENS.hub = () => { const d = S.draft; const p = d.plan; const base = S.plan;
  const changing = [];
  if (d.kind === 'lean') changing.push(hubRow(I.flag, 'Phase', `<span class="was">Lean Mass Build</span> → <b style="color:var(--ink)">Leaning (temporary)</b>`, d.kind === 'lean' ? 'openLeanSetup' : 'noop', true));
  if (grChanged(d)) changing.push(hubRow(I.shield, 'Body-fat guardrail', `<span class="was">${grLabel(draftBase(d))}</span><br><b style="color:var(--ink)">${grLabel(draftProposed(d))}</b>${tgtUsed(d) ? `<br>Phase target ≤ ${grFmt(tgt(d))}% · ${tgtWhy(d)}` : ''}`, 'openGuardrail', true));
  if (p.eat !== base.eat || p.goal !== base.goal) changing.push(hubRow(I.bolt, 'Daily energy', `<span class="was">eat ${fmt(base.eat)} · goal ${fmtG(base.goal)}</span><br><b style="color:var(--ink)">${sgn(p.balance)} · eat ${fmt(p.eat)} · goal ${fmtG(p.goal)}</b>`, 'openEnergy', true));
  const carried = [
    [I.lift, 'Training', `Learned: ≈ 4 workouts a week${p.trainingGoals ? ` · goal ${p.trainingGoals}` : ''} · ${p.progression}`, 'openTraining', p.progression !== base.progression || p.trainingGoals !== base.trainingGoals],
    [I.moon, 'Recovery', `${p.recovery.join(', ')}${p.sleepGoal ? ` · sleep ${p.sleepGoal}` : ' · no sleep goal'}`, 'openRecovery', p.recovery.length !== base.recovery.length || p.sleepGoal !== base.sleepGoal],
    [I.pill, 'Supplements', p.supplements.join(', ') || 'None', 'openSupplements', p.supplements.length !== base.supplements.length],
    ...(grChanged(d) ? [] : [[I.shield, 'Body-fat guardrail', grLabel(draftProposed(d)), 'openGuardrail', false]]),
    [I.cam, 'Photos & DEXA', `Photos ${p.photos ? 'every 2 weeks' : 'off'} · DEXA ${p.dexa ? 'scheduled' : 'optional, not planned'}`, 'openTracking', p.photos !== base.photos || p.dexa !== base.dexa],
  ];
  const ch = changing.length + carried.filter((c) => c[4]).length;
  return `${statusBar()}${sNav('Back', 'Your Plan')}
  <div class="content"><div class="display h1">Your plan</div>
    <p class="lead" style="margin-top:6px">${ch} changing. Everything else carries forward; tap anything to adjust.</p>
    ${changing.length ? `<div class="sec-label">Changing</div><div class="card" style="padding:0 16px"><div class="divider-list">${changing.join('')}</div></div>` : ''}
    <div class="sec-label">Carrying forward</div><div class="card" style="padding:0 16px"><div class="divider-list">${carried.map(([i, n, dt, a, c]) => hubRow(i, n, dt, a, c)).join('')}</div></div>
    <div style="height:90px"></div></div>
  <div class="tray"><span class="count">${ch}</span><div class="grow"><div class="t-sm strong">${ch} change${ch === 1 ? '' : 's'}</div><div class="t-xs muted">Nothing changes until you approve</div></div><div class="btn primary" data-act="openReview" role="button" tabindex="0">Review</div></div>`; };

SCREENS.training = () => { const p = S.draft.plan; return `${statusBar()}${sNav('Your Plan', 'Training', '<span data-act="back" role="button" tabindex="0" style="font-weight:700">Done</span>')}
  <div class="content stack"><span class="eyebrow">Learned from your recent workouts ${simTag}</span>
  <div class="card"><div class="t-body strong">≈ 4 workouts a week · usually Mon, Tue, Thu, Sat</div><p class="t-xs muted" style="margin-top:6px">Observed over 6 weeks. Supersets count once; weeks with no tracking are left out.</p></div>
  <div class="card soft"><span class="eyebrow purple">Coach suggestion</span><p class="t-sm ink2" style="margin-top:6px">${S.draft.kind === 'lean' ? 'While leaning, keep your workouts and hold loads.' : 'Keep progressing as you are.'}</p></div>
  <div class="card"><span class="eyebrow">Progression</span><div class="seg" style="margin-top:10px">${['Conservative', 'Moderate', 'Aggressive'].map((x) => `<div class="${p.progression === x ? 'on' : ''}" data-act="prog" data-arg="${x}" role="button" tabindex="0">${x}</div>`).join('')}</div></div>
  <div class="card"><div class="row between"><div><div class="t-body strong">Workouts a week (optional)</div><div class="t-sm ink2">${p.trainingGoals ? `Goal: ${p.trainingGoals}` : 'None set. We follow what you do.'}</div></div><div class="mini-step"><span data-act="tgoal" data-arg="-1" role="button" tabindex="0">−</span><span data-act="tgoal" data-arg="1" role="button" tabindex="0">+</span></div></div></div>
  <p class="t-xs muted">No split or day-by-day schedule needed.</p></div>`; };

SCREENS.recovery = () => { const p = S.draft.plan; return `${statusBar()}${sNav('Your Plan', 'Recovery', '<span data-act="back" role="button" tabindex="0" style="font-weight:700">Done</span>')}
  <div class="content stack"><span class="eyebrow">Recovery priorities</span>
  <div class="card divider-list" style="padding:0 16px">${p.recovery.map((r) => `<div class="lrow"><div class="l">${r}</div>${r === 'Foam Rolling' ? '<span class="t-xs muted">Evening</span>' : `<span class="t-sm semi" style="color:var(--red)" data-act="rmRecovery" data-arg="${r}" role="button" tabindex="0">Remove</span>`}</div>`).join('')}</div>
  <div class="chips">${['Stretching', 'Mobility', 'Walk after meals'].filter((x) => !p.recovery.includes(x)).map((x) => `<span class="chip" data-act="addRecovery" data-arg="${x}" role="button" tabindex="0">+ ${x}</span>`).join('')}</div>
  <div class="card"><div class="row between"><div><div class="t-body strong">Sleep goal (optional)</div><div class="t-sm ink2">${p.sleepGoal || 'Not set'}</div></div><div class="mini-step"><span data-act="sleep" data-arg="-1" role="button" tabindex="0">−</span><span data-act="sleep" data-arg="1" role="button" tabindex="0">+</span></div></div>${p.sleepGoal ? '<span class="t-sm semi" style="color:var(--teal)" data-act="sleep" data-arg="clear" role="button" tabindex="0">Clear</span>' : ''}</div></div>`; };

SCREENS.supplements = () => { const p = S.draft.plan; return `${statusBar()}${sNav('Your Plan', 'Supplements', '<span data-act="back" role="button" tabindex="0" style="font-weight:700">Done</span>')}
  <div class="content stack"><div class="card divider-list" style="padding:0 16px">${p.supplements.map((x) => `<div class="lrow"><div class="l">${x}</div><span class="t-sm semi" style="color:var(--red)" data-act="rmSupp" data-arg="${x}" role="button" tabindex="0">Remove</span></div>`).join('') || '<div class="lrow"><div class="l muted">None</div></div>'}</div>
  <div class="chips">${['Creatine', 'Vitamin D', 'Magnesium'].filter((x) => !p.supplements.includes(x)).map((x) => `<span class="chip" data-act="addSupp" data-arg="${x}" role="button" tabindex="0">+ ${x}</span>`).join('')}</div>
  <p class="t-xs muted">Amount and reminders are optional. PhysiqueOS doesn’t recommend supplements or doses.</p></div>`; };

SCREENS.tracking = () => { const p = S.draft.plan; return `${statusBar()}${sNav('Your Plan', 'Photos & DEXA', '<span data-act="back" role="button" tabindex="0" style="font-weight:700">Done</span>')}
  <div class="content stack"><p class="lead">Both optional. They sharpen estimates; your plan works without them.</p>
  <div class="card divider-list" style="padding:0 16px">
    <div class="lrow" data-act="toggle" data-arg="photos" role="switch" aria-checked="${p.photos}" tabindex="0"><div class="l">Progress photos<small>Every 2 weeks</small></div><span class="sw ${p.photos ? 'on' : ''}"></span></div>
    <div class="lrow" data-act="toggle" data-arg="dexa" role="switch" aria-checked="${p.dexa}" tabindex="0"><div class="l">Schedule a DEXA<small>Optional</small></div><span class="sw ${p.dexa ? 'on' : ''}"></span></div></div></div>`; };

SCREENS.review = () => { const d = S.draft; const p = d.plan, b = S.plan; const rows = [];
  const gb = draftBase(d), gp = draftProposed(d); const goalCh = !grSame(gb.goal, gp.goal);
  const tCell = () => `Body fat ≤ ${grFmt(tgt(d))}% · ${d.targetMode === 'custom' ? 'custom' : tgtInfo(d).source === 'goal' ? `aligned to the ${goalCh ? 'new ' : ''}goal upper limit` : tgtWhy(d)}`;
  if (d.kind === 'lean') rows.push(['Phase', 'Lean Mass Build', 'Leaning (temporary)']);
  if (d.kind === 'next') rows.push(['Phase', 'Leaning (complete)', d.next === 'resume' ? 'Phase 4 · Lean Mass Build (linked to Phase 2)' : d.next === 'maintain' ? 'Maintain' : 'Leaning (continued)']);
  rows.push(['Goal guardrail', goalCh ? grText(gb.goal) : '', goalCh ? `${grText(gp.goal)} · goal, going forward` : `${grText(gp.goal)} · unchanged`]);
  if (gp.phase || gb.phase) rows.push([d.kind === 'lean' ? 'Leaning-only guardrail' : 'This phase only', gb.phase && !grSame(gb.phase, gp.phase) ? grText(gb.phase) : '', gp.phase ? `${grText(gp.phase)} · ends with the phase` : 'None · goal guardrail applies']);
  if (d.kind === 'next' && S.phaseGuardrail) rows.push(['Leaning-only guardrail', grText(S.phaseGuardrail), 'Ends with leaning']);
  if (d.kind === 'lean') {
    const t0 = tgtStart(d);
    rows.push(['Phase ends', d.completion.mode !== 'time' && tgt(d) !== t0 ? `≤ ${grFmt(t0)}%` : '', d.completion.mode === 'outcome' ? tCell() : d.completion.mode === 'time' ? `After ${d.completion.weeks} weeks` : `${tCell()} or ${d.completion.weeks} weeks`]);
    rows.push(['When building resumes', '', `Phase 4 · Lean Mass Build (linked to Phase 2) · guardrail ${grText(gp.goal)}`], ['Goal date', 'Oct 31', 'Set when building resumes']);
  }
  if (d.kind === 'next' && d.next === 'continue') rows.push(['Phase ends', '', tCell()], ['When building resumes', '', `Phase 4 · guardrail ${grText(gp.goal)}`]);
  if (d.kind === 'keepBuilding' && d.goalDate !== 'Oct 31') rows.push(['Goal date', 'Oct 31', d.goalDate]);
  if (p.balance !== planBal(b)) rows.push(['Daily balance', sgn(planBal(b)), sgn(p.balance)]);
  if (p.eat !== b.eat) rows.push(['Eat', fmt(b.eat), `${fmt(p.eat)} kcal`]);
  if (p.goal !== b.goal) rows.push(['Activity goal', fmtG(b.goal), `${fmtG(p.goal)} kcal`]);
  if (p.progression !== b.progression) rows.push(['Training progression', b.progression, p.progression]);
  if (p.trainingGoals !== b.trainingGoals) rows.push(['Workouts a week', b.trainingGoals || 'not set', p.trainingGoals || 'not set']);
  if (p.recovery.join() !== b.recovery.join()) rows.push(['Recovery', b.recovery.join(', '), p.recovery.join(', ')]);
  if (p.sleepGoal !== b.sleepGoal) rows.push(['Sleep goal', b.sleepGoal || 'not set', p.sleepGoal || 'not set']);
  if (p.supplements.join() !== b.supplements.join()) rows.push(['Supplements', b.supplements.join(', '), p.supplements.join(', ')]);
  if (p.photos !== b.photos) rows.push(['Progress photos', b.photos ? 'on' : 'off', p.photos ? 'on' : 'off']);
  if (p.dexa !== b.dexa) rows.push(['DEXA', b.dexa ? 'scheduled' : 'not planned', p.dexa ? 'scheduled' : 'not planned']);
  return `${statusBar()}${sNav('Back', 'Review')}
  <div class="content stack"><div class="display h1">Review your new plan</div>
  <span class="pill teal" style="align-self:flex-start">${I.check} Checked against your latest evidence ${simTag}</span>
  <div class="card diff">${rows.length ? rows.map(([k, was, now]) => `<div class="kv"><span class="k">${k}</span><span class="delta">${was ? `<s>${was}</s>` : ''}<span class="v">${now}</span></span></div>`).join('') : '<p class="t-sm ink2">No changes yet.</p>'}</div>
  <div class="card soft" style="padding:10px 14px"><div class="t-xs muted">Eat = maintenance ${maintLabel()} ${p.balance < 0 ? '−' : '+'} ${fmt(Math.abs(p.balance))}${hasActivity() ? ` + ${fmt(p.added || 0)} extra activity` : ''} = <b style="color:var(--ink)">${fmt(p.eat)}</b>${hasActivity() ? ` · activity goal = ${fmt(S.E.usual)} usual + ${fmt(p.added || 0)} = ${fmtG(p.goal)}` : ''}</div>
    <div class="t-sm semi" style="color:var(--teal);margin-top:6px" data-act="go" data-arg="why" role="button" tabindex="0">Why these numbers?</div></div>
  <p class="t-xs muted">Only numbers that change are listed. Everything else carries forward.</p>
  ${checkMsgs({ errors: draftCheck(d).errors, warnings: [] })}${fixes(d)}
  ${btn('Approve', rows.length && draftCheck(d).ok ? 'approve' : 'noop', rows.length && draftCheck(d).ok ? 'primary' : 'disabled')}
  <p class="t-xs muted" style="text-align:center">One approval updates goal, phase and plan together. Version ${S.versions.length} is kept in Your Journey.</p></div>`; };

SCREENS.next = () => { const inRange = S.completionTarget != null && bf() <= S.completionTarget; const n = S.draft?.next || 'resume'; return `${statusBar()}${sNav('Back', 'What’s next')}
  <div class="content stack"><div class="display h1">${inRange ? 'Leaning complete' : 'Time limit reached'}</div>
  <div class="card"><div class="kv"><span class="k">Body fat</span><span class="delta"><s>${f1(S.phaseStartBf)}%</s><span class="v">${f1(bf())}%</span></span></div>
  <div class="kv"><span class="k">Lean mass (DEXA)</span><span class="v">${f1(S.body.lean - S.phaseStartBody.lean)} lb</span></div>
  <div class="kv"><span class="k">Goal progress</span><span class="delta"><s>${f1(S.phaseStartGained)}</s><span class="v">${f1(S.gained)} of 10 lb</span></span></div>
  <p class="t-xs muted">Shown honestly, never reset. Some of a small lean drop is usually water. ${simTag}</p></div>
  <div class="card divider-list" style="padding:0 16px">${[['resume', 'Start building again', 'Slow, lean gain · +200 a day'], ['maintain', 'Hold at maintenance first', 'A few weeks before building'], ['continue', 'Keep leaning', inRange ? 'Set a lower phase target' : 'Continue toward your target']].map(([k, t, s]) => `<div class="choice" data-act="pickNext" data-arg="${k}" role="radio" aria-checked="${n === k}" tabindex="0">${radio(n === k)}<div class="grow"><div class="t-body strong">${t}${k === (inRange ? 'resume' : 'continue') ? ' <span class="pill teal">Suggested</span>' : ''}</div><div class="t-sm ink2">${s}</div></div></div>`).join('')}</div>
  ${S.draft ? `<div class="card" style="padding:0 16px"><div class="divider-list">
    ${n === 'continue' ? `<div class="srow"><span class="ic">${I.flag}</span><div class="grow"><div class="nm">Phase target</div><div class="dt">Ends at body fat ≤ ${grFmt(tgt(S.draft))}% · ${tgtWhy(S.draft)}</div>${S.draft.targetMode === 'custom' && tgt(S.draft) !== tgtInfo(S.draft).value ? `<div class="t-sm semi" style="color:var(--teal);margin-top:2px" data-act="targetAuto" role="button" tabindex="0">Align to ${grFmt(tgtInfo(S.draft).value)}%</div>` : ''}</div><div class="mini-step"><span data-act="target" data-arg="-0.5" role="button" tabindex="0">−</span><span data-act="target" data-arg="0.5" role="button" tabindex="0">+</span></div></div>` : ''}
    <div class="srow" data-act="openGuardrail" role="button" tabindex="0"><span class="ic ${grChanged(S.draft) ? 'amber' : ''}">${I.shield}</span><div class="grow"><div class="nm">${n === 'continue' ? 'Guardrail while leaning' : 'Guardrail when building resumes'}</div><div class="dt">${grLabel(draftProposed(S.draft))}</div></div><span class="edit">Edit</span></div></div></div>
    ${S.phaseGuardrail ? `<p class="t-xs muted">The leaning-only guardrail (${grText(S.phaseGuardrail)}) ends with this phase.</p>` : ''}
    ${n === 'resume' && !grChanged(S.draft) ? `<p class="t-xs muted">Phase 4 carries your approved goal guardrail forward (${grText(S.guardrail)}).</p>` : ''}
    ${checkMsgs({ errors: draftCheck(S.draft).errors, warnings: [] })}${fixes(S.draft)}` : ''}
  ${btn('Review this change', S.draft && draftCheck(S.draft).ok ? 'nextReview' : 'noop', S.draft && draftCheck(S.draft).ok ? 'primary' : 'disabled')}<p class="t-xs muted" style="text-align:center">Nothing restarts on its own.</p></div>`; };

SCREENS.goals = () => { const leaning = S.phase === 'leaning'; const tempRows = [['done', 'Phase 1 · Establish Maintenance', 'Complete']];
  if (S.phase === 'building' || S.phase === 'keepBuilding') tempRows.push(['now', 'Phase 2 · Lean Mass Build', `Since Aug 15 · ${f1(S.gained)} of 10 lb`]);
  else { tempRows.push([S.phase === 'resumed' ? 'done' : 'paused', 'Phase 2 · Lean Mass Build', `Paused at ${f1(S.phaseStartGained ?? S.gained)} lb · progress kept`]); tempRows.push([leaning ? 'now' : 'done', 'Leaning · temporary', leaning ? `Since ${dateLabel(S.phaseStartDay)} · week ${inPhaseWeeks() + 1}` : `Body fat ${f1(S.completeBf ?? bf())}%`]);
    if (S.phase === 'resumed') tempRows.push(['now', 'Lean Mass Build (resumed)', `Since ${dateLabel(S.phaseStartDay)}`]); else if (S.phase === 'maintaining') tempRows.push(['now', 'Maintain', `Since ${dateLabel(S.phaseStartDay)}`]); else tempRows.push(['', 'Lean Mass Build resumes', 'When you choose']); }
  return `${statusBar()}${sNav('Home', 'Build Lean Mass')}
  <div class="content stack">
    <div class="card" style="background:linear-gradient(160deg,var(--fieldStart),var(--fieldEnd));border:0"><div class="row between"><span class="eyebrow" style="color:var(--ink)">Active goal</span>${simTag}</div>
      <div class="display h1" style="margin-top:6px">Build Lean Mass</div>
      <div class="kv"><span class="k" style="color:var(--ink)">Progress</span><span class="v">${f1(S.gained)} of 10 lb</span></div><div class="bar"><i style="width:${(S.gained / 10) * 100}%"></i></div>
      <div class="kv"><span class="k" style="color:var(--ink)">Goal date</span><span class="v">${S.phase === 'building' ? 'Oct 31 (at risk)' : S.phase === 'resumed' || S.phase === 'keepBuilding' ? S.goalDate : 'Set when building resumes'}</span></div></div>
    ${leaning ? `<div class="card" style="border:1.5px solid var(--green)"><div class="row between"><span class="eyebrow" style="color:var(--green)">Now · temporary phase</span>${tag(`Week ${inPhaseWeeks() + 1}`)}</div>
      <div class="display h2" style="margin-top:6px">Leaning</div>
      <div class="kv"><span class="k">Ends</span><span class="v">${S.completion.mode === 'outcome' ? `Body fat ≤ ${grFmt(S.completionTarget)}%` : S.completion.mode === 'time' ? `After ${S.completion.weeks} weeks` : `Body fat ≤ ${grFmt(S.completionTarget)}% or ${S.completion.weeks} weeks`}</span></div>
      <div class="kv"><span class="k">Body fat</span><span class="v">${f1(S.phaseStartBf)}% → ${f1(bf())}%</span></div>
      <div class="kv"><span class="k">Plan</span><span class="v">${sgn(planBal(S.plan))} · eat ${fmt(S.plan.eat)} · goal ${fmtG(S.plan.goal)}</span></div></div>` : ''}
    ${(S.decision.open) && (S.phase === 'building' || S.phase === 'leaningComplete') ? `<div class="card rail amber" data-act="${S.phase === 'building' ? 'openOptions' : 'openNext'}" role="button" tabindex="0"><div class="eyebrow amber">Open decision</div><div class="t-body strong" style="margin-top:4px">${S.phase === 'building' ? 'Review your goal options' : 'Choose your next phase'}</div></div>` : ''}
    <div class="card"><div class="row between"><span class="eyebrow">Body-fat guardrail</span>${tag('You approved')}</div>
      <div class="kv"><span class="k">Goal</span><span class="v">${grText(S.guardrail)}</span></div>
      ${S.phaseGuardrail ? `<div class="kv"><span class="k">This phase only</span><span class="v">${grText(S.phaseGuardrail)}</span></div>` : ''}
      ${leaning && S.completionTarget != null ? `<div class="kv"><span class="k">Phase target (separate)</span><span class="v">≤ ${grFmt(S.completionTarget)}%</span></div>` : ''}
      ${leaning ? `<div class="kv"><span class="k">When building resumes</span><span class="v">${grText(S.guardrail)}</span></div>` : ''}
      <div class="kv"><span class="k">Body fat now</span><span class="v">${f1(bf())}%</span></div></div>
    <div class="card"><span class="eyebrow">The path · Your Journey</span><div class="phases" style="margin-top:10px">${tempRows.map(([dot, t, s], i) => `<div class="ph"><div class="col"><div class="dot ${dot}"></div>${i < tempRows.length - 1 ? '<div class="line"></div>' : ''}</div><div class="txt"><div class="t-body strong">${t}</div><div class="t-sm ink2">${s}</div></div></div>`).join('')}</div></div>
    <div class="card"><div class="row between"><span class="eyebrow">Changes you approved</span>${S.undo ? `<span class="t-sm semi" style="color:var(--teal)" data-act="undo" role="button" tabindex="0">Undo last</span>` : ''}</div>
      <div class="divider-list" style="margin-top:6px">${S.versions.map((v) => `<div class="lrow"><div class="l"><b>v${v.v} · ${v.day < 0 ? 'Aug 15' : dateLabel(v.day)}</b><small>${v.label} · ${v.detail}</small></div></div>`).join('')}</div></div>
  </div>${tabs('goals')}`; };

SCREENS.placeholder = () => `${statusBar()}${sNav('Home', 'Not in this simulation')}<div class="content stack"><p class="lead">This tab isn’t part of the Goal Adaptation simulation.</p>${btn('Back to Home', 'tab', 'secondary', 'home')}</div>${tabs('')}`;

// ---------------- actions -----------------
function startDraft(kind) {
  const plan = JSON.parse(JSON.stringify(S.plan)); plan.balance = planBal(S.plan);
  const eff = effGR();
  S.draft = { kind, plan, split: 'suggested', custom: 100, completion: { ...S.completion }, goalDate: S.goalDate, next: 'resume', target: null, targetMode: 'auto',
    gr: { mode: 'keep', min: eff.enabled === false ? 8 : eff.min, max: eff.enabled === false ? 9 : eff.max, scope: 'goal' } };
  if (kind === 'lean') applyEnergy(-450);
  if (kind === 'keepBuilding') { S.draft.gr = { mode: 'change', min: S.draft.gr.min, max: S.draft.gr.max, scope: 'goal' }; S.draft.goalDate = 'Oct 31'; applyEnergy(200); }
}
function applyEnergy(balance) { const d = S.draft; d.plan.balance = balance; const e = energyFrom(balance, d.split, d.custom); Object.assign(d.plan, { eat: e.eat, added: e.added, goal: e.goal, balance: e.balance }); }
function recomputeDraft() { if (S.draft && S.draft.plan.balance != null && (S.draft.kind === 'lean' || S.draft.kind === 'keepBuilding' || S.draft.kind === 'next' || S.draft.touched)) applyEnergy(S.draft.plan.balance); }
const ACT = {
  back, noop: () => {},
  tab: (a) => (a === 'home' ? home() : a === 'goals' ? (S.stack = [], S.screen = 'goals', render()) : go('placeholder')),
  go: (a) => go(a),
  openGoals: () => go('goals'), openBriefing: () => go('briefing'), openWeekly: () => go('briefing'),
  logWeight: () => toast('Weight logging isn’t part of this simulation'),
  openOptions: () => go('options'),
  notNow: () => go('notNow'),
  notNowPick: (a) => { if (a === 'keep') { S.decision.open = false; S.versions.unshift({ v: S.versions.length + 1, day: S.day, label: 'Kept current plan', detail: 'Decision recorded; no changes' }); } else S.decision.dismissed = true; home(a === 'keep' ? 'Decision recorded. We’ll only ask again with new evidence.' : a === 'remind' ? 'We’ll remind you in Sunday’s Weekly.' : 'Removed from Home. Still open in Goals.'); },
  notNowPhase: () => { S.decision.dismissed = true; home('Removed from Home. Still open in Goals.'); },
  chooseLean: () => { startDraft('lean'); go('leanSetup'); },
  chooseKeepBuilding: () => { startDraft('keepBuilding'); go('keepBuilding'); },
  chooseKeepPlan: () => { S.decision.open = false; S.versions.unshift({ v: S.versions.length + 1, day: S.day, label: 'Kept current plan', detail: 'Body fat stays above range; Oct 31 at risk' }); home('Plan kept. Goal date shows as at risk.'); },
  chooseCustom: () => { startDraft('custom'); go('hub'); },
  setCompletion: (a) => { S.draft.completion.mode = a; render(); },
  weeks: (a) => { S.draft.completion.weeks = Math.max(2, Math.min(12, S.draft.completion.weeks + Number(a))); render(); },
  openEnergy: () => { if (!S.explainerSeen) go('explainer'); else go('energy'); },
  explainerDone: () => { S.explainerSeen = true; go('energy', { replace: true }); },
  bal: (a) => { applyEnergy(Math.max(-750, Math.min(500, S.draft.plan.balance + Number(a)))); render(); },
  balReset: () => { applyEnergy(S.draft.kind === 'keepBuilding' ? 200 : S.draft.kind === 'lean' ? -450 : 383); render(); },
  split: (a) => { S.draft.split = a; applyEnergy(S.draft.plan.balance); render(); },
  custom: (a) => { S.draft.custom = Math.max(0, Math.min(500, S.draft.custom + Number(a))); applyEnergy(S.draft.plan.balance); render(); },
  openHub: () => go('hub'), openLeanSetup: () => go('leanSetup'), openKeepBuilding: () => go('keepBuilding'),
  openTraining: () => go('training'), openRecovery: () => go('recovery'), openSupplements: () => go('supplements'), openTracking: () => go('tracking'),
  prog: (a) => { S.draft.plan.progression = a; render(); },
  tgoal: (a) => { const v = (S.draft.plan.trainingGoals || 4) + Number(a); S.draft.plan.trainingGoals = Math.max(2, Math.min(7, v)); render(); },
  addRecovery: (a) => { S.draft.plan.recovery.push(a); render(); }, rmRecovery: (a) => { S.draft.plan.recovery = S.draft.plan.recovery.filter((x) => x !== a); render(); },
  sleep: (a) => { if (a === 'clear') S.draft.plan.sleepGoal = null; else { const cur = S.draft.plan.sleepGoal ? Number(S.draft.plan.sleepGoal.replace(/[^0-9.]/g, '')) : 7; const n = Math.max(6, Math.min(9, cur + Number(a) * 0.5)); S.draft.plan.sleepGoal = `${n} h`; } render(); },
  addSupp: (a) => { S.draft.plan.supplements.push(a); render(); }, rmSupp: (a) => { S.draft.plan.supplements = S.draft.plan.supplements.filter((x) => x !== a); render(); },
  toggle: (a) => { S.draft.plan[a] = !S.draft.plan[a]; render(); },
  gr: (a) => { const [k, d] = a.split(':'); S.draft.gr = grStep(S.draft.gr, k, Number(d)); render(); },
  grFixUpper: (a) => { const d = S.draft; const e = grEffective(draftProposed(d).goal, draftProposed(d).phase); d.gr = { ...d.gr, mode: 'change', min: e.enabled === false ? Math.min(8, Number(a) - 0.5) : Math.min(e.min, Number(a) - 0.5), max: Number(a) }; render(); },
  grDone: () => { S.grSnap = null; back(); },
  grCancel: () => { if (S.grSnap) Object.assign(S.draft, JSON.parse(S.grSnap)); S.grSnap = null; back(); },
  targetAuto: () => { S.draft.targetMode = 'auto'; S.draft.target = null; render(); },
  grMode: (a) => { const d = S.draft; d.gr.mode = a; if (a === 'keep') { const b = draftBase(d); const e = grEffective(b.goal, b.phase); if (e.enabled !== false) Object.assign(d.gr, { min: e.min, max: e.max }); } render(); },
  grScope: (a) => { S.draft.gr.scope = a; render(); },
  openGuardrail: () => { const d = S.draft; S.grSnap = JSON.stringify({ gr: d.gr, targetMode: d.targetMode, target: d.target }); go('guardrail'); },
  target: (a) => { const d = S.draft; d.target = Math.max(GR_LIMITS.min, Math.min(15, tgt(d) + Number(a))); d.targetMode = 'custom'; render(); },
  date: (a) => { S.draft.goalDate = a; render(); },
  openReview: () => go('review'),
  approve: () => {
    const d = S.draft; if (!draftCheck(d).ok) return; S.undo = { day: S.day, before: snap(), versionsLen: S.versions.length };
    const pr = draftProposed(d); const grNote = (grChanged(d) ? ` · guardrail ${grLabel(pr)}` : '') + (tgtUsed(d) ? ` · phase target ≤ ${grFmt(tgt(d))}%` : '');
    S.guardrail = pr.goal; S.phaseGuardrail = pr.phase;
    S.plan = d.plan;
    let label, detail;
    if (d.kind === 'lean') {
      S.phase = 'leaning'; S.phaseStartDay = S.day; S.completion = d.completion; S.completionTarget = d.completion.mode === 'time' ? null : tgt(d); S.phaseStartBf = bf(); S.phaseStartBody = { ...S.body }; S.phaseStartGained = S.gained; S.decision = { open: false };
      label = 'Leaning phase approved'; detail = `${sgn(d.plan.balance)}/day · eat ${fmt(d.plan.eat)} · goal ${fmtG(d.plan.goal)}`;
    } else if (d.kind === 'keepBuilding') {
      S.phase = 'keepBuilding'; S.goalDate = d.goalDate; S.decision = { open: false };
      label = 'Kept building with new limits'; detail = `${d.goalDate} · eat ${fmt(d.plan.eat)}`;
    } else if (d.kind === 'next') {
      S.completeBf = bf(); S.decision = { open: false }; S.qc = null; S.observeUntil = null;
      if (d.next === 'resume') { S.phase = 'resumed'; S.phaseStartDay = S.day; S.goalDate = 'Feb 20'; label = 'Building resumed'; }
      else if (d.next === 'maintain') { S.phase = 'maintaining'; S.phaseStartDay = S.day; label = 'Holding at maintenance'; }
      else { S.phase = 'leaning'; S.phaseStartDay = S.day; S.completion = { mode: 'hybrid', weeks: 4 }; S.completionTarget = tgt(d); S.phaseStartBf = bf(); S.phaseStartBody = { ...S.body }; S.phaseStartGained = S.gained; label = 'Leaning continued'; }
      detail = `${sgn(d.plan.balance)}/day · eat ${fmt(d.plan.eat)} · goal ${fmtG(d.plan.goal)}`;
    } else { label = 'Plan customized'; detail = `eat ${fmt(d.plan.eat)} · goal ${fmtG(d.plan.goal)}`; S.decision.open = false; }
    const v = addVersion(label, detail + grNote);
    S.draft = null; S.log.unshift(`${dateLabel(S.day)} · v${v} approved: ${label}${grNote}`);
    home(`Plan updated · version ${v}`);
  },
  undo: () => { if (!S.undo) return; Object.assign(S, S.undo.before); const v = addVersion('Undo', 'Back to the previous plan'); S.undo = null; S.log.unshift(`${dateLabel(S.day)} · undo → v${v}`); home(`Undone · version ${v} restores the previous plan`); },
  openNext: () => { const plan = JSON.parse(JSON.stringify(S.plan)); plan.balance = planBal(S.plan); const g = S.guardrail; S.draft = { kind: 'next', next: S.completionTarget != null && bf() <= S.completionTarget ? 'resume' : 'continue', plan, split: 'suggested', custom: 100, target: null, targetMode: 'auto', gr: { mode: 'keep', min: g.enabled === false ? 8 : g.min, max: g.enabled === false ? 9 : g.max, scope: 'goal' } }; go('next'); },
  pickNext: (a) => { S.draft.next = a; render(); },
  nextReview: () => { const d = S.draft; applyEnergy(d.next === 'resume' ? 200 : d.next === 'maintain' ? 0 : -450); go('review'); },
  qcOpt: (a) => { S.qc.opt = a; render(); },
  qcStep: (a) => { const [k, d] = a.split(':'); S.qc.custom[k] = Math.max(0, Math.min(400, S.qc.custom[k] + Number(d))); render(); },
  qcLater: () => { S.qc = null; S.observeUntil = S.day + 7; render(); toast('Hidden until next week’s check.'); },
  qcAccept: () => {
    const q = S.qc; const o = q.opt; const act = hasActivity(); const half = Math.round(q.step / 2 / 25) * 25;
    const eatD = o === 'eat' ? q.step : o === 'move' ? 0 : o === 'blend' ? half : -q.custom.eatLess;
    const moveD = !act ? 0 : o === 'eat' ? 0 : o === 'move' ? -q.step : o === 'blend' ? -(q.step - half) : q.custom.moveMore;
    S.undo = { day: S.day, before: snap() };
    S.plan = { ...S.plan, eat: S.plan.eat + eatD, goal: S.plan.goal == null ? null : S.plan.goal + moveD, added: (S.plan.added || 0) + moveD };
    const newM = q.fromM + q.step;
    S.E.calibrated = { value: newM, low: newM - 150, high: newM + 150, note: 'Updated from your logged intake and weight trend (simulated).' }; S.E.recalibrated = true;
    const v = addVersion('Quick calibration', `${sgn(eatD - moveD)}/day · eat ${fmt(S.plan.eat)} · goal ${fmtG(S.plan.goal)} · maintenance ≈ ${fmt(newM)}`);
    S.qc = null; S.observeUntil = S.day + 21; S.log.unshift(`${dateLabel(S.day)} · Quick calibration applied (v${v}); maintenance ${fmt(q.fromM)} → ${fmt(newM)}`);
    render(); toast(`Plan updated · version ${v} · watching for 3 weeks`);
  },
};
function toast(msg) { S.toast = msg; render(); }

// ---------------- control panel -----------------
const CONTROL = {
  advance: () => { if (S.phase === 'building' && S.decision.open && !S.decision.dismissed) { toast('Make or postpone the goal decision first, or use Reset.'); return; } simulateWeek(); S.stack = []; S.screen = S.phase === 'leaningComplete' ? 'briefing' : 'briefing'; render(); },
  midweek: () => go('midweek'),
  finish: () => { if (S.phase !== 'leaning') { toast('Start a leaning phase first.'); return; } let n = 0; while (S.phase === 'leaning' && n < 16) { simulateWeek(); n++; } S.stack = []; S.screen = 'briefing'; render(); },
  response: (a) => { S.response = a; render(); },
  theme: (a) => { S.theme = a; render(); },
  reset: () => { S = initialState(S.E.key); render(); },
  scenario: (k) => { S = initialState(k); render(); },
};
function energyLab() {
  const E = S.E; const plan = S.draft ? S.draft.plan : S.plan; const r = reconciliation(E, plan); const pm = r.planning;
  const num = (k, v, label, extra = '') => `<label class="lab-f"><span>${label}</span><input type="number" inputmode="numeric" data-lab="${k}" value="${v ?? ''}" ${extra} aria-label="${label}"></label>`;
  return `<div class="pn-sec"><div class="pn-h">Energy assumptions (test)</div>
    <div class="pn-btns" role="group" aria-label="Scenario">${Object.values(ENERGY_SCENARIOS).map((sc) => `<button data-ctl="scenario" data-arg="${sc.key}" aria-pressed="${E.key === sc.key}">${sc.label}</button>`).join('')}</div>
    <p class="pn-note">Picking a scenario restarts the simulation. Editing a value below updates estimates live; approved targets never change, but unapproved drafts are recalculated.</p>
    <div class="lab-grid">
      ${num('rmr', E.rmr, 'RMR kcal/day')}
      <label class="lab-f"><span>RMR source</span><select data-lab="rmrSource" aria-label="RMR source">${Object.entries(RMR_SOURCES).map(([k, v]) => `<option value="${k}" ${E.rmrSource === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      ${num('usual', E.usual, 'Usual active kcal (blank = no wearable)')}
      ${E.usual == null ? num('factor', E.factor, 'Activity factor (no wearable)', 'step="0.05" min="1.1" max="1.9"') : num('tef', E.tefPct, 'Digestion % of intake', 'min="0" max="20"')}
      <label class="lab-f"><span>Outcome calibration</span><select data-lab="calOn" aria-label="Outcome calibration"><option value="on" ${E.calibrated ? 'selected' : ''}>Available</option><option value="off" ${E.calibrated ? '' : 'selected'}>Not available</option></select></label>
      ${E.calibrated ? num('cal', E.calibrated.value, 'Calibrated maintenance') : ''}
      <label class="lab-f"><span>Intake logging</span><select data-lab="logging" aria-label="Intake logging"><option value="complete" ${E.logging === 'complete' ? 'selected' : ''}>≥ 70% of days</option><option value="partial" ${E.logging === 'partial' ? 'selected' : ''}>Partial (9 of 28 days)</option></select></label>
      ${S.draft && S.draft.plan.balance != null ? num('balance', S.draft.plan.balance, 'Draft balance kcal/day', 'step="25"') + (hasActivity() ? num('extra', S.draft.plan.added || 0, 'Draft extra activity', 'step="25" min="0" max="500"') : '') : ''}
    </div>
    <table class="lab-t">
      <tr><td>Bottom-up estimate</td><td>${fmt(r.bottomUp.value)} <small>(${fmt(r.bottomUp.low)}–${fmt(r.bottomUp.high)})</small></td></tr>
      <tr><td>Calibrated from results</td><td>${E.calibrated ? `${fmt(E.calibrated.value)}${E.logging === 'complete' ? '' : ' <small>(ignored: partial logging)</small>'}` : '—'}</td></tr>
      <tr><td><b>Maintenance used</b></td><td><b>${maintLabel()}</b></td></tr>
      <tr><td>${S.draft ? 'Draft' : 'Approved'} eat / activity goal</td><td>${fmt(plan.eat)} / ${fmtG(plan.goal)}</td></tr>
      <tr><td><b>Planned balance</b></td><td><b>${sgn(r.balance)}</b> <small>= ${fmt(plan.eat)} − ${fmt(pm.value)} − ${fmt(plan.added || 0)}</small></td></tr>
      <tr><td>RMR + activity goal − eat</td><td>${r.naive == null ? '—' : fmt(r.naive)} <small>not a deficit</small></td></tr>
      <tr><td>Bottom-up − calibrated</td><td>${pm.source === 'calibrated' ? sgn(r.gap) : '—'}</td></tr>
      <tr><td>Simulated true maintenance</td><td>${fmt(truth())} <small>hidden from the app</small></td></tr>
    </table></div>`;
}
function panel() {
  const flow = [['home', 'Home'], ['goals', 'Goals'], ['briefing', 'Latest briefing'], ['midweek', 'Midweek'], ['monthly', 'Monthly'], ['photo', 'Photo event']];
  return `<div class="pn-sec"><div class="pn-h">Simulated state</div>
    <div class="kvs"><span>Date</span><b>${dateLabel(S.day)}</b><span>Phase</span><b>${{ building: 'Lean Mass Build', leaning: 'Leaning (temporary)', leaningComplete: 'Leaning complete', resumed: 'Lean Mass Build (resumed)', maintaining: 'Maintain', keepBuilding: 'Lean Mass Build (new limits)' }[S.phase]}</b>
    <span>Body fat</span><b>${f1(bf())}%</b><span>Lean gained</span><b>${f1(S.gained)} of 10 lb</b><span>Plan</span><b>${sgn(planBal(S.plan))} · eat ${fmt(S.plan.eat)} · goal ${fmtG(S.plan.goal)}</b><span>Maintenance used</span><b>${maintLabel()}</b><span>Guardrail</span><b>${S.phaseGuardrail ? `${grText(S.phaseGuardrail)} this phase · goal ${grText(S.guardrail)}` : `${grText(S.guardrail)} (goal)`}</b><span>Version</span><b>v${S.versions[0].v}</b></div></div>
  <div class="pn-sec"><div class="pn-h">Jump to</div><div class="pn-btns">${flow.map(([k, l]) => `<button data-ctl="jump" data-arg="${k}">${l}</button>`).join('')}</div></div>
  <div class="pn-sec"><div class="pn-h">Simulate evidence</div><div class="pn-btns"><button data-ctl="advance" class="pri">Advance a week</button><button data-ctl="finish">Run to phase end</button></div>
    <div class="pn-h" style="margin-top:12px">Body response</div><div class="pn-btns"><button data-ctl="response" data-arg="asEstimated" aria-pressed="${S.response === 'asEstimated'}">As estimated</button><button data-ctl="response" data-arg="slower" aria-pressed="${S.response === 'slower'}">Slower than estimated</button></div>
    <p class="pn-note">“Slower” makes real maintenance about 250 lower than estimated, so a Quick Calibration appears in a Weekly after about 3 weeks.</p></div>
  ${energyLab()}
  <div class="pn-sec"><div class="pn-h">Phone theme</div><div class="pn-btns"><button data-ctl="theme" data-arg="dark" aria-pressed="${S.theme === 'dark'}">Dark</button><button data-ctl="theme" data-arg="light" aria-pressed="${S.theme === 'light'}">Mineral Light</button></div></div>
  <div class="pn-sec"><div class="pn-btns"><button data-ctl="reset" class="warn">Reset simulation</button></div></div>
  <div class="pn-sec"><div class="pn-h">Event log</div><ol class="pn-log">${S.log.slice(0, 12).map((l) => `<li>${l}</li>`).join('')}</ol></div>`;
}

// ---------------- render + events -----------------
function render() {
  const phone = document.getElementById('phone');
  phone.className = `phone ${S.theme === 'light' ? 'light' : ''}`;
  phone.innerHTML = `<div id="phone-scroll" class="pscroll">${SCREENS[S.screen]()}</div>${S.toast ? `<div class="toast" role="status">${I.check}<span>${S.toast}</span></div>` : ''}`;
  document.getElementById('panel').innerHTML = panel();
  document.getElementById('crumb').textContent = `${S.screen}${S.stack.length ? ` · ${S.stack.length} back` : ''}`;
  if (S.toast) { const t = S.toast; setTimeout(() => { if (S.toast === t) { S.toast = null; const el = document.querySelector('#phone .toast'); if (el) el.remove(); } }, 2600); }
}
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-ctl]');
  if (c) { if (c.dataset.ctl === 'jump') { S.stack = []; S.screen = c.dataset.arg; render(); } else CONTROL[c.dataset.ctl](c.dataset.arg); return; }
  const a = e.target.closest('#phone [data-act]');
  if (a && ACT[a.dataset.act]) { e.preventDefault(); ACT[a.dataset.act](a.dataset.arg); }
});
function labChange(k, v) {
  const E = S.E; const n = Number(v);
  if (k === 'rmr' && n > 500) E.rmr = Math.round(n);
  if (k === 'rmrSource') E.rmrSource = v;
  if (k === 'usual') { if (v === '') { E.usual = null; } else if (n >= 0) E.usual = Math.round(n); S.plan.goal = E.usual == null ? null : E.usual + (S.plan.added || 0); if (E.usual == null) S.plan.added = 0; }
  if (k === 'tef' && n >= 0 && n <= 20) E.tefPct = n;
  if (k === 'factor' && n >= 1.1 && n <= 1.9) E.factor = n;
  if (k === 'calOn') E.calibrated = v === 'on' ? (E.calibrated || { value: bottomUp(E).value, low: bottomUp(E).value - 150, high: bottomUp(E).value + 150, note: 'Entered for testing.' }) : null;
  if (k === 'cal' && E.calibrated && n > 500) { E.calibrated.value = Math.round(n); E.calibrated.low = E.calibrated.value - 150; E.calibrated.high = E.calibrated.value + 150; }
  if (k === 'logging') E.logging = v;
  if (k === 'balance' && S.draft) { S.draft.touched = true; applyEnergy(Math.max(-750, Math.min(500, Math.round(n)))); }
  if (k === 'extra' && S.draft) { S.draft.touched = true; S.draft.split = 'custom'; S.draft.custom = Math.max(0, Math.min(500, Math.round(n))); applyEnergy(S.draft.plan.balance); }
  if (!['balance', 'extra'].includes(k)) recomputeDraft();
  S.qc = null;
  render();
}
document.addEventListener('change', (e) => { const l = e.target.closest('[data-lab]'); if (l) labChange(l.dataset.lab, l.value); });
document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('#phone [data-act]')) { e.preventDefault(); e.target.click(); } });
document.addEventListener('input', (e) => { if (e.target.dataset.in === 'balance') { applyEnergy(Number(e.target.value)); const v = e.target.value; render(); const el = document.querySelector('[data-in="balance"]'); if (el) { el.value = v; el.focus(); } } });
document.addEventListener('DOMContentLoaded', render);
