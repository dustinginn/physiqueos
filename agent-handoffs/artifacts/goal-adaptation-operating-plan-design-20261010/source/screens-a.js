// ---------------------------------------------------------------------------
// Screens part A: icons, shared fragments, journey entry, phase & goal setup,
// Approach A plan hub. Values: Founder Oct 9 (Phase B candidate 99f11ae6) where
// stated; everything marked * is illustrative.
// ---------------------------------------------------------------------------
const S = {};
Object.assign(I, {
  energy: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M10 1 3 10h5l-1 7 7-9H9l1-7Z" fill="currentColor"/></svg>',
  food: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M5 1v6a2 2 0 0 0 4 0V1M7 7v10M13 1c-2 1.5-2.5 4-2.5 6.5h2.5V17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  walk: '<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="10" cy="2.6" r="1.8" fill="currentColor"/><path d="m7 17 2-5 2 2v3M6 9l2-3.5 3 .5 2 3M9 12l-.5-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lift: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M1 9h16M4 5v8M14 5v8M2 7v4M16 7v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  moon: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M15 11.5A7 7 0 0 1 6.5 3 7 7 0 1 0 15 11.5Z" fill="currentColor"/></svg>',
  drop: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 1.5S3.5 7.6 3.5 11.2a5.5 5.5 0 0 0 11 0C14.5 7.6 9 1.5 9 1.5Z" fill="currentColor"/></svg>',
  pill: '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="1.5" y="6" width="15" height="6.5" rx="3.25" fill="none" stroke="currentColor" stroke-width="1.8" transform="rotate(-35 9 9)"/><path d="m6.6 5.5 4.2 6" stroke="currentColor" stroke-width="1.8"/></svg>',
  cam: '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="1.5" y="4.5" width="15" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 4.5 7 2.5h4l1 2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  scale: '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="1.5" y="1.5" width="15" height="15" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 6.5a4 4 0 0 1 6 0L10 8.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  bell: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M4.5 12.5V8a4.5 4.5 0 0 1 9 0v4.5l1.5 1.5H3l1.5-1.5ZM7.5 16h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  target: '<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="9" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/></svg>',
  flag: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M3.5 17V2M3.5 3h10l-2 3.5 2 3.5h-10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  shield: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 1.5 15 4v4.5c0 3.8-2.6 6.7-6 8-3.4-1.3-6-4.2-6-8V4l6-2.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  cal: '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="1.5" y="3" width="15" height="13.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M1.5 7.5h15M5.5 1v3.5M12.5 1v3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  lock: '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="3" y="8" width="12" height="9" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 8V5.5a3.5 3.5 0 0 1 7 0V8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  reset: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M2 1.8v3h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pencil: '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M9.5 1.5 12.5 4.5 4.5 12.5H1.5v-3l8-8Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  watch: '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="4" y="4" width="10" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 4 6.6 1h4.8L12 4M6 14l.6 3h4.8l.6-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  chevDown: '<svg width="14" height="9" viewBox="0 0 14 9"><path d="m1.5 1.5 5.5 5.5 5.5-5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  dots: '<svg width="20" height="6" viewBox="0 0 20 6"><circle cx="3" cy="3" r="2.2" fill="currentColor"/><circle cx="10" cy="3" r="2.2" fill="currentColor"/><circle cx="17" cy="3" r="2.2" fill="currentColor"/></svg>',
});
const IL = '<span style="color:var(--amberInk);font-weight:800">*</span>';
const ctag = (t = 'Concept') => `<span class="ctag">${t}</span>`;
const ptag = (t = 'Provisional') => `<span class="ptag">${t}</span>`;
const sw = (on = true, dis = false) => `<span class="sw ${on ? 'on' : ''} ${dis ? 'dis' : ''}"></span>`;
const radio = (on) => `<div class="radio ${on ? 'on' : ''}"></div>`;
const tray = (n, label = 'Review changes', sub = '') => `<div class="tray"><span class="count">${n}</span><div class="grow"><div class="t-sm strong">${n} change${n === 1 ? '' : 's'} in your draft</div><div class="t-xs muted">${sub || 'Nothing changes until you approve'}</div></div><div class="btn primary">${label}</div></div>`;
const navX = (title, action = 'Done', back = 'Cancel') => `<div class="nav"><span class="back" style="font-weight:500">${back}</span><span class="title">${title}</span><span class="action" style="font-weight:700">${action}</span></div>`;
const srow = (ic, tone, name, detail, right = `<span class="edit">Edit</span>`, cls = '') => `<div class="srow ${cls}"><span class="ic ${tone}">${I[ic]}</span><div class="grow"><div class="nm">${name}</div><div class="dt">${detail}</div></div>${right}</div>`;
const pillTone = (t, label) => `<span class="pill ${t}">${label}</span>`;
const bannerB = (tone, icon, title, body) => `<div class="banner ${tone}"><span style="color:var(--${tone === 'amber' ? 'amberInk' : tone === 'red' ? 'red' : 'teal'});margin-top:1px">${I[icon]}</span><div><div class="bt">${title}</div><p>${body}</p></div></div>`;

// ---------------- Journey entry -----------------
S['J1-options'] = () => `
${statusBar()}${nav('Briefing', 'Goal Options')}
<div class="content stack">
  <div class="display h1">Choose what to protect next</div>
  <p class="t-body ink2">You've built about 7 of your 10 lb. Body fat is above your 8–9% range, and Oct 31 is unlikely at your recent pace.</p>
  <div class="cmp">
    <div class="hd lbl"></div><div class="hd sel"><span style="color:var(--teal)">★</span> Lean out first</div><div class="hd">Keep building</div><div class="hd">Keep plan</div>
    <div class="lbl">Daily intake</div><div class="sel">1,600–1,775</div><div>2,275–2,375</div><div>2,500</div>
    <div class="lbl">Body fat</div><div class="sel">Back to 8.3–9%</div><div>Ends 10.4–11.3%</div><div>12.4–14%</div>
    <div class="lbl">Timing</div><div class="sel">Lean 2–7 wks, goal ≈ Jan–May</div><div>Goal ≈ Jan–Apr</div><div>Goal ≈ late Nov–Dec</div>
    <div class="lbl">Fits limits?</div><div class="sel" style="color:var(--green);font-weight:700">Yes</div><div style="color:var(--amberInk);font-weight:700">Needs upper ≥ 11.5%</div><div style="color:var(--red);font-weight:700">No</div>
  </div>
  <p class="t-xs muted">★ Ranked first for you. Calories are calibrated from your own logging and scans (maintenance ≈ 2,117, moderate confidence). Every number is provisional and rechecked before you approve.</p>
  <div class="card selected rail"><div class="row between"><span class="pill teal">Recommended</span><span class="t-xs muted">Selected</span></div>
    <div class="display h3" style="margin-top:8px">Lean out first, then keep building</div>
    <p class="t-sm ink2" style="margin-top:6px">The only option that fits your body-fat range while protecting the lean mass you've built.</p></div>
  <div class="btn primary">Set up leaning phase ${I.arrow}</div>
  <div class="btn ghost">Make my own changes instead</div>
</div>`;

S['J2-option-detail'] = () => `
${statusBar()}${nav('Options', 'Keep my current plan')}
<div class="content stack">
  <span class="pill red" style="align-self:flex-start">${I.warn} Doesn't fit your limits</span>
  <div class="display h1">Keep my current plan</div>
  <p class="t-body ink2">You can choose this. Here's what the evidence says it likely means.</p>
  <div class="card"><span class="eyebrow">Tradeoffs</span>
    <div class="divider-list" style="margin-top:6px">
      <div class="lrow"><div class="l"><span style="color:var(--green);font-weight:800">+</span> No changes to your routine</div></div>
      <div class="lrow"><div class="l"><span style="color:var(--amberInk);font-weight:800">−</span> Body fat likely 12.4–14% by the goal<small>Your firm limit is 8–9%</small></div></div>
      <div class="lrow"><div class="l"><span style="color:var(--amberInk);font-weight:800">−</span> Goal ≈ Nov 26 – Dec 28<small>Oct 31 is unlikely at your measured pace</small></div></div>
    </div></div>
  <div class="card soft"><div class="row between"><span class="eyebrow">How sure is this?</span><span class="pill line">Moderate</span></div>
    <p class="t-sm ink2" style="margin-top:6px">Based on 3 calibrated months of logging and 4 scans. Ranges narrow with each scan.</p></div>
  ${bannerB('amber', 'warn', 'Your firm limit would need to change', 'To keep this plan you’ll set a new body-fat range, or keep 8–9% and accept it will show as exceeded.')}
  <div class="btn secondary">Choose this anyway</div>
  <div class="btn ghost">Back to options</div>
</div>`;

// ---------------- Phase & goal setup -----------------
const completionCard = (mode) => `
  <div class="card"><span class="eyebrow">How should the leaning phase end?</span>
    <div class="divider-list" style="margin-top:4px">
      <div class="choice">${radio(mode === 'outcome')}<div class="grow"><div class="row between"><span class="t-body strong">When I'm back in range</span>${mode === 'outcome' ? '<span class="pill teal">Suggested</span>' : ''}</div><div class="t-sm ink2">Body fat back in 8–9%. A DEXA confirms it best; without one, we estimate from your weight trend and photos.</div></div></div>
      <div class="choice">${radio(mode === 'time')}<div class="grow"><div class="t-body strong">After a set time</div>${mode === 'time' ? `<div class="row between" style="margin-top:8px"><span class="t-sm ink2">Length</span><div class="stepper"><span>−</span><b>4 weeks</b><span>+</span></div></div><div class="t-xs muted" style="margin-top:6px">Ends Nov 6 · then we review together</div>` : '<div class="t-sm ink2">A fixed number of weeks</div>'}</div></div>
      <div class="choice">${radio(mode === 'hybrid')}<div class="grow"><div class="t-body strong">Whichever comes first</div>${mode === 'hybrid' ? `<div class="row between" style="margin-top:8px"><span class="t-sm ink2">Time limit</span><div class="stepper"><span>−</span><b>6 weeks</b><span>+</span></div></div>` : '<div class="t-sm ink2">Back in range, or a time limit you set</div>'}</div></div>
    </div>
    <p class="t-xs muted" style="margin-top:6px">${mode === 'outcome' ? 'Estimated 2–5 weeks at your chosen deficit.' : 'If time runs out before you’re back in range, we’ll ask what you want to do. Nothing ends or restarts on its own.'}</p>
  </div>`;

S['P1-leaning-setup'] = () => `
${statusBar()}${nav('Options', 'Leaning Phase')}
<div class="content stack">
  <div class="display h1">Set up your leaning phase</div>
  <p class="lead">Three things define this phase. Everything else in your plan carries forward unless you change it.</p>
  ${completionCard('outcome')}
  <div class="card" style="padding:0 16px">
    <div class="srow"><span class="ic amber">${I.energy}</span><div class="grow"><div class="nm">Daily energy</div><div class="dt"><b style="color:var(--ink)">−450 kcal/day</b> · 1,750 eaten · +100 activity</div></div><span class="edit">Edit</span></div>
    <div class="rule" style="margin:0"></div>
    <div class="srow"><span class="ic">${I.cal}</span><div class="grow"><div class="nm">Check-ins</div><div class="dt">Weekly, in your Sunday briefing</div></div><span class="edit">Edit</span></div>
  </div>
  <div class="card" style="padding:12px 16px"><div class="row between"><div><div class="t-body strong">Your plan for this phase</div><div class="t-sm ink2">Nutrition, training, recovery and 6 more carry forward</div></div>${I.chev}</div></div>
  <div class="btn primary">Continue to your plan ${I.arrow}</div>
</div>`;

S['P2-completion-time'] = () => `
${statusBar()}${nav('Options', 'Leaning Phase')}
<div class="content stack">
  <div class="display h2">How should the leaning phase end?</div>
  ${completionCard('time')}
  ${bannerB('teal', 'info', 'Time-only phases are reviewed, never auto-completed', 'At 4 weeks we’ll show your measured change and ask whether to keep leaning, resume building or maintain.')}
</div>`;

S['P3-completion-hybrid'] = () => `
${statusBar()}${nav('Options', 'Leaning Phase')}
<div class="content stack">
  <div class="display h2">How should the leaning phase end?</div>
  ${completionCard('hybrid')}
  <div class="card soft"><div class="kv"><span class="k">Likely end</span><span class="v">Nov 1 – Nov 20</span></div><div class="kv"><span class="k">Latest end</span><span class="v">Nov 20 (6-week limit)</span></div></div>
</div>`;

S['P4-keep-building'] = () => `
${statusBar()}${nav('Options', 'Keep Building')}
<div class="content stack">
  <div class="display h1">Keep building with limits that fit</div>
  <div class="card" style="padding:0 16px">
    <div class="srow"><span class="ic amber">${I.shield}</span><div class="grow"><div class="nm">Body-fat range</div><div class="dt"><span class="was">8–9% firm</span> → <b style="color:var(--ink)">8–11.5% this phase</b></div></div><span class="edit">Edit</span></div>
    <div class="rule" style="margin:0"></div>
    <div class="srow"><span class="ic amber">${I.flag}</span><div class="grow"><div class="nm">Goal date</div><div class="dt"><span class="was">Oct 31</span> → <b style="color:var(--ink)">Feb 15</b> · likely</div></div><span class="edit">Edit</span></div>
    <div class="rule" style="margin:0"></div>
    <div class="srow"><span class="ic amber">${I.energy}</span><div class="grow"><div class="nm">Daily energy</div><div class="dt"><b style="color:var(--ink)">+200 kcal/day</b> · 2,325 eaten · no added activity</div></div><span class="edit">Edit</span></div>
  </div>
  ${bannerB('teal', 'check', 'These fit together', 'At +200 kcal, body fat likely ends 10.4–11.3%, inside the new 11.5% upper limit.')}
  <div class="card" style="padding:12px 16px"><div class="row between"><div><div class="t-body strong">Your plan for this phase</div><div class="t-sm ink2">Everything else carries forward</div></div>${I.chev}</div></div>
  <div class="btn primary">Continue to your plan ${I.arrow}</div>
</div>`;

S['P5-guardrail-editor'] = () => `
${statusBar()}${navX('Body-Fat Range')}
<div class="content stack">
  <p class="lead">Your range protects what matters while you work toward the goal.</p>
  <div class="card"><span class="eyebrow">Range</span>
    <div class="row between" style="margin-top:10px"><span class="t-body">Lower</span><div class="stepper"><span>−</span><b>8.0%</b><span>+</span></div></div>
    <div class="row between" style="margin-top:8px"><span class="t-body">Upper</span><div class="stepper"><span>−</span><b>11.5%</b><span>+</span></div></div>
    <div style="margin-top:14px;position:relative;height:38px">
      <div style="position:absolute;left:0;right:0;top:14px;height:10px;border-radius:9px;background:var(--soft);border:1px solid var(--hairline)"></div>
      <div style="position:absolute;left:25%;right:31.25%;top:14px;height:10px;border-radius:9px;background:var(--tealWash);border:1.5px solid var(--teal)"></div>
      <div style="position:absolute;left:46%;top:6px;width:3px;height:26px;background:var(--amber);border-radius:2px"></div>
      <div class="t-xs" style="position:absolute;left:39%;top:-10px;color:var(--amberInk);font-weight:800">You 9.7%</div>
    </div>
    <div class="ticks"><span>6%</span><span>8%</span><span>10%</span><span>12%</span><span>14%</span></div>
  </div>
  <div class="card"><span class="eyebrow">How strict?</span>
    <div class="divider-list" style="margin-top:4px">
      <div class="choice">${radio(true)}<div class="grow"><div class="t-body strong">Firm limit</div><div class="t-sm ink2">Going past it opens a review of your plan</div></div></div>
      <div class="choice">${radio(false)}<div class="grow"><div class="t-body strong">Target range</div><div class="t-sm ink2">Watched and coached; doesn’t trigger reviews on its own</div></div></div>
    </div></div>
  <div class="card"><span class="eyebrow">Applies</span><div class="seg" style="margin-top:10px"><div class="on">This phase</div><div>Until a date</div><div>Always</div></div>
    <p class="t-xs muted" style="margin-top:8px">After this phase, your original 8–9% returns. Version 1 is kept in Your Journey.</p></div>
</div>`;

S['P5b-guardrail-invalid'] = () => `
${statusBar()}${navX('Body-Fat Range', '<span style="color:var(--muted)">Done</span>')}
<div class="content stack">
  <div class="card"><span class="eyebrow">Range</span>
    <div class="row between" style="margin-top:10px"><span class="t-body">Lower</span><div class="stepper" style="border-color:var(--red)"><span>−</span><b style="color:var(--red)">10.0%</b><span>+</span></div></div>
    <div class="row between" style="margin-top:8px"><span class="t-body">Upper</span><div class="stepper" style="border-color:var(--red)"><span>−</span><b style="color:var(--red)">9.5%</b><span>+</span></div></div>
    <div class="errtxt">${I.warn} Upper must be at least 0.5% above lower.</div>
  </div>
  <div class="card" style="opacity:.6"><div class="row" style="gap:10px;align-items:flex-start">${I.lock}<div><div class="t-body strong">Keep 8–9% firm while building</div><div class="t-sm ink2">Not available: you’re at 9.7%, and building would move further from it. Choose leaning, or set a new range.</div></div></div></div>
  ${bannerB('amber', 'warn', 'Upper below your current level', 'You’re at 9.7%. An upper limit under that is allowed while leaning, but will show as exceeded right away while building.')}
</div>`;

S['P6-deadline-editor'] = () => `
${statusBar()}${navX('Goal Date')}
<div class="content stack">
  <p class="lead">How likely each date is at your measured pace (≈ 0.6–1.0 lb lean per month after leaning).</p>
  <div class="card">
    <div class="row between"><span class="t-sm ink2">Remaining</span><span class="t-body strong">≈ 2.9 lb lean mass</span></div>
    <div style="margin-top:14px">
      ${[['Oct 31', 'Unlikely', 'red', 4], ['Dec 31', 'Possible', 'amber', 46], ['Feb 15', 'Likely', 'green', 82], ['Apr 30', 'Very likely', 'green', 96]].map(([d, l, t, p]) => `
      <div class="lrow" style="min-height:48px"><div class="l strong" style="width:72px">${d}</div><div class="grow"><div class="bar"><i style="width:${p}%;background:var(--${t === 'amber' ? 'amber' : t})"></i></div></div><span class="pill ${t === 'green' ? 'teal' : t}" style="min-width:86px;justify-content:center">${l}</span></div>`).join('')}
    </div></div>
  <div class="field focus"><span>Goal date</span><span class="strong">Feb 15, 2027 ${I.cal}</span></div>
  <p class="t-xs muted">Probabilities are rough and widen with time. They update with every scan. You can keep any future date; unlikely dates show as at risk.</p>
  <div class="btn ghost">Keep Oct 31 anyway</div>
</div>`;

S['P6b-deadline-past'] = () => `
${statusBar()}${navX('Goal Date', '<span style="color:var(--muted)">Done</span>')}
<div class="content stack">
  <div class="field err"><span>Goal date</span><span class="strong" style="color:var(--red)">Oct 1, 2026 ${I.cal}</span></div>
  <div class="errtxt">${I.warn} Choose a date after today (Oct 9).</div>
  <div class="field"><span>Phase must end by</span><span class="ink2">Before the goal date</span></div>
  ${bannerB('amber', 'warn', 'Leaning phase ends after this date', 'Your leaning phase could run to Nov 20. A goal date before then leaves no time to build. Move the goal date or shorten the phase.')}
</div>`;

S['P7-checkins'] = () => `
${statusBar()}${navX('Check-ins')}
<div class="content stack">
  <p class="lead">When we look at your evidence together and decide whether anything should change.</p>
  <div class="card"><span class="eyebrow">Regular check-in</span>
    <div class="seg" style="margin-top:10px"><div class="on">Weekly</div><div>Every 2 weeks</div></div>
    <p class="t-xs muted" style="margin-top:8px">Delivered in your Sunday Weekly briefing. Change the day in Coaching updates.</p></div>
  <div class="card"><div class="row between"><span class="eyebrow">Calibration checkpoint</span>${pillTone('line', 'Fixed by policy')}</div>
    <div class="t-body strong" style="margin-top:8px">4 weeks after the phase starts · Nov 6</div>
    <p class="t-sm ink2" style="margin-top:4px">We only judge the new energy plan after 4 weeks of enough evidence. If logging or adherence fall short, we’ll help with that first.</p></div>
  <div class="card"><div class="row between"><div><div class="t-body strong">Safety checks</div><div class="t-sm ink2">Always on. Losing more than 1.5% of body weight in a week opens a review right away.</div></div>${I.lock}</div></div>
</div>`;

// ---------------- Approach A: plan hub -----------------
const hubRows = (opts = {}) => {
  const changing = [
    ['flag', 'amber', 'Phase', '<span class="was">Lean Mass Build</span> → <b style="color:var(--ink)">Leaning phase</b> · ends when back in range'],
    ['energy', 'amber', 'Energy', '<span class="was">2,500 eaten · 800 activity</span><br><b style="color:var(--ink)">−450/day · 1,750 eaten · 900 activity</b>'],
    ...(opts.more ? [['lift', 'amber', 'Training', 'Progression <span class="was">Moderate</span> → <b style="color:var(--ink)">Conservative</b>'], ['walk', 'amber', 'Activity', '3 brisk walks a week · Mon, Wed, Sat']] : []),
  ];
  const carried = [
    ['food', '', 'Nutrition', 'Protein 1.0 g/lb · balanced carbs and fat' + IL, opts.conflict ? 'amber' : ''],
    ...(opts.more ? [] : [['walk', '', 'Activity', 'Usual ≈ 800 kcal/day from Apple Watch']]),
    ...(opts.more ? [] : [['lift', '', 'Training', '9 sessions/week · Chest, Back · Moderate']]),
    ['moon', '', 'Recovery', 'Foam Rolling · daily 7:15 PM'],
    ['drop', '', 'Peptides', '2 protocols · unchanged'],
    ['pill', '', 'Supplements', 'Tongkat Ali, Electrolytes'],
    ['cam', '', 'Coaching updates', 'Weekly Sun · Photos every 2 weeks'],
    ['scale', '', 'Tracking & reminders', 'Morning weigh-in · 4 reminders'],
  ];
  return { changing, carried };
};
const hub = (opts = {}) => {
  const { changing, carried } = hubRows(opts);
  const shown = opts.expanded ? carried : carried.slice(0, opts.more ? 2 : 3);
  return `
${statusBar()}${nav('Leaning Phase', 'Your Plan')}
<div class="content">
  <div class="display h1">Your plan for the leaning phase</div>
  <p class="lead" style="margin-top:6px">${changing.length} changing. Everything else carries forward — tap any strategy to change it.</p>
  ${opts.superseded ? `<div style="margin-top:12px">${bannerB('amber', 'sync', 'New scan arrived — energy numbers refreshed', 'Your edits are kept. Maintenance moved 2,117 → 2,180, so intake is now 1,800 for the same −450/day. Review the change below.')}</div>` : ''}
  ${opts.conflict ? `<div style="margin-top:12px">${bannerB('amber', 'warn', '1 thing to check', 'Protein at 1.0 g/lb is 41% of 1,750 kcal. That works, but leaves less room for carbs on training days. <span style="color:var(--teal);font-weight:700">Review Nutrition</span>')}</div>` : ''}
  <div class="sec-label">Changing</div>
  <div class="card" style="padding:0 16px"><div class="divider-list">${changing.map(([ic, t, n, d]) => srow(ic, t, n, d, '<span class="edit">Edit</span>', 'chg')).join('')}</div></div>
  <div class="sec-label row between" style="display:flex"><span>Carrying forward</span><span style="color:var(--teal);letter-spacing:0;text-transform:none;font-size:1.2em">${opts.expanded ? 'Show less' : `Show all ${carried.length}`}</span></div>
  <div class="card" style="padding:0 16px"><div class="divider-list">${shown.map(([ic, t, n, d, warn]) => srow(ic, t, n, d, warn ? `<span class="pill amber">Check</span>` : '<span class="edit">Edit</span>')).join('')}
    ${opts.expanded ? '' : `<div class="srow" style="min-height:48px"><div class="grow t-sm ink2">${carried.slice(shown.length).map((c) => c[2]).join(' · ')}</div>${I.chevDown}</div>`}</div></div>
  <p class="t-xs muted" style="margin-top:12px;text-align:center">Edits are saved to this draft as you go. One approval applies everything together.</p>
</div>
${tray(changing.length + (opts.more ? 0 : 0), 'Review')}`;
};
S['A1-hub'] = () => hub();
S['A2-hub-expanded'] = () => hub({ expanded: true });
S['A3-hub-more-edits'] = () => hub({ more: true, conflict: true });
S['A4-hub-superseded'] = () => hub({ superseded: true });
S['A5-unsaved'] = () => `<div style="height:874px;overflow:hidden;position:relative">${hub({ more: true })}</div><div class="scrim"></div>
<div class="alert"><div class="ab"><div class="t">Leave without approving?</div><p>Your 4 changes stay in this draft until Oct 23 or until new evidence arrives. Nothing in your plan has changed yet.</p></div>
<div class="act b">Keep editing</div><div class="act">Leave and keep draft</div><div class="act red">Discard changes</div></div>`;
S['A6-hub-xl'] = () => hub();
