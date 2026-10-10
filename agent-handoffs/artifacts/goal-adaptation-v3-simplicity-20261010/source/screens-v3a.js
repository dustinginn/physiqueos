// ---------------------------------------------------------------------------
// v3 screens, part A: Founder scenario (Option B → setup → Plan Hub → energy →
// review), simplified editors, Quick Calibration v3.
// ---------------------------------------------------------------------------
const S = {};
Object.assign(I, {
  energy: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M10 1 3 10h5l-1 7 7-9H9l1-7Z" fill="currentColor"/></svg>',
  walk: '<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="10" cy="2.6" r="1.8" fill="currentColor"/><path d="m7 17 2-5 2 2v3M6 9l2-3.5 3 .5 2 3M9 12l-.5-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lift: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M1 9h16M4 5v8M14 5v8M2 7v4M16 7v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  moon: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M15 11.5A7 7 0 0 1 6.5 3 7 7 0 1 0 15 11.5Z" fill="currentColor"/></svg>',
  drop: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 1.5S3.5 7.6 3.5 11.2a5.5 5.5 0 0 0 11 0C14.5 7.6 9 1.5 9 1.5Z" fill="currentColor"/></svg>',
  pill: '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="1.5" y="6" width="15" height="6.5" rx="3.25" fill="none" stroke="currentColor" stroke-width="1.8" transform="rotate(-35 9 9)"/><path d="m6.6 5.5 4.2 6" stroke="currentColor" stroke-width="1.8"/></svg>',
  cam: '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="1.5" y="4.5" width="15" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  scan: '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="5" y="1.5" width="8" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M2 6h14M2 12h14" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/></svg>',
  food: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M5 1v6a2 2 0 0 0 4 0V1M7 7v10M13 1c-2 1.5-2.5 4-2.5 6.5h2.5V17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  flag: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M3.5 17V2M3.5 3h10l-2 3.5 2 3.5h-10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bell: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M4.5 12.5V8a4.5 4.5 0 0 1 9 0v4.5l1.5 1.5H3l1.5-1.5ZM7.5 16h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  reset: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M2 1.8v3h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevDown: '<svg width="14" height="9" viewBox="0 0 14 9"><path d="m1.5 1.5 5.5 5.5 5.5-5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
});
const radio = (on) => `<div class="radio ${on ? 'on' : ''}"></div>`;
const sw = (on = true) => `<span class="sw ${on ? 'on' : ''}"></span>`;
const ctag = (t = 'Concept') => `<span class="ctag">${t}</span>`;
const navX = (title, action = 'Done', back = 'Cancel') => `<div class="nav"><span class="back" style="font-weight:500">${back}</span><span class="title">${title}</span><span class="action" style="font-weight:700">${action}</span></div>`;
const srow = (ic, tone, name, detail, right = '<span class="edit">Edit</span>', cls = '') => `<div class="srow ${cls}"><span class="ic ${tone}">${I[ic]}</span><div class="grow"><div class="nm">${name}</div><div class="dt">${detail}</div></div>${right}</div>`;
const bannerB = (tone, icon, title, body) => `<div class="banner ${tone}"><span style="color:var(--${tone === 'amber' ? 'amberInk' : tone === 'red' ? 'red' : 'teal'});margin-top:1px">${I[icon]}</span><div><div class="bt">${title}</div><p>${body}</p></div></div>`;
const opt = (t) => `<span class="pill line" style="font-size:.6875em">${t || 'Optional'}</span>`;
const editorHead = (eyebrow, title, lead) => `<div><span class="eyebrow">${eyebrow}</span><div class="display h2" style="margin-top:6px">${title}</div>${lead ? `<p class="lead" style="margin-top:6px">${lead}</p>` : ''}</div>`;

// ---------------- Founder scenario -----------------
S['F1-options'] = () => `
${statusBar()}${nav('Briefing', 'Goal Options')}
<div class="content stack">
  <div class="display h1">Choose what to protect next</div>
  <p class="t-body ink2">You’ve built about 7 of your 10 lb. Body fat is above your 8–9% range, and Oct 31 is unlikely at your recent pace.</p>
  <div class="cmp">
    <div class="hd lbl"></div><div class="hd sel"><span style="color:var(--teal)">★</span> Lean out first</div><div class="hd">Keep building</div><div class="hd">Keep plan</div>
    <div class="lbl">Body fat</div><div class="sel">Back to 8.3–9%</div><div>Ends 10.4–11.3%</div><div>12.4–14%</div>
    <div class="lbl">Timing</div><div class="sel">Lean 2–7 wks, then build</div><div>Goal ≈ Jan–Apr</div><div>Goal ≈ late Nov–Dec</div>
    <div class="lbl">Fits limits?</div><div class="sel" style="color:var(--green);font-weight:700">Yes</div><div style="color:var(--amberInk);font-weight:700">Needs upper ≥ 11.5%</div><div style="color:var(--red);font-weight:700">No</div>
  </div>
  <p class="t-xs muted">★ Ranked first for you. Option B side-by-side, as approved. Numbers are rechecked before you approve.</p>
  <div class="btn primary">Set up leaning phase ${I.arrow}</div>
  <div class="btn ghost">Make my own changes instead</div>
</div>`;

S['F2-setup'] = () => `
${statusBar()}${nav('Options', 'Leaning Phase')}
<div class="content stack">
  <div class="display h1">Set up your leaning phase</div>
  <p class="lead">Two decisions. Everything else in your plan carries forward.</p>
  <div class="card"><span class="eyebrow">Ends</span>
    <div class="divider-list" style="margin-top:4px">
      <div class="choice">${radio(true)}<div class="grow"><div class="row between"><span class="t-body strong">When I’m back in range</span><span class="pill teal">Suggested</span></div><div class="t-sm ink2">8–9% body fat. A DEXA confirms it best; without one we estimate from your trends.</div></div></div>
      <div class="choice">${radio(false)}<div class="grow"><div class="t-body strong">After a set time, or whichever comes first</div></div></div>
    </div></div>
  <div class="card" style="padding:0 16px">${srow('energy', 'amber', 'Daily energy', '<b style="color:var(--ink)">−450 a day</b> · eat 1,767 · activity goal 900')}</div>
  <div class="card" style="padding:12px 16px"><div class="row between"><div><div class="t-body strong">Your plan</div><div class="t-sm ink2">Training, recovery, supplements and more carry forward</div></div>${I.chev}</div></div>
  <div class="btn primary">Review ${I.arrow}</div>
</div>`;

const hubV3 = () => `
${statusBar()}${nav('Leaning Phase', 'Your Plan')}
<div class="content">
  <div class="display h1">Your plan</div>
  <p class="lead" style="margin-top:6px">2 changing. The rest carries forward; tap anything to adjust.</p>
  <div class="sec-label">Changing</div>
  <div class="card" style="padding:0 16px"><div class="divider-list">
    ${srow('flag', 'amber', 'Phase', '<span class="was">Lean Mass Build</span> → <b style="color:var(--ink)">Leaning</b>', '<span class="edit">Edit</span>', 'chg')}
    ${srow('energy', 'amber', 'Daily energy', '<span class="was">eat 2,500 · goal 800</span><br><b style="color:var(--ink)">−450 · eat 1,767 · goal 900</b>', '<span class="edit">Edit</span>', 'chg')}
  </div></div>
  <div class="sec-label">Carrying forward</div>
  <div class="card" style="padding:0 16px"><div class="divider-list">
    ${srow('food', '', 'Nutrition', 'Protein 1.0 g/lb*')}
    ${srow('lift', '', 'Training', 'Learned: ≈ 4 workouts a week, upper/lower')}
    ${srow('moon', '', 'Recovery', 'Foam Rolling · sleep goal not set')}
    ${srow('pill', '', 'Supplements', '2 · reminders on')}
    ${srow('cam', '', 'Progress photos & DEXA', 'Photos every 2 weeks · no scan planned')}
  </div></div>
  <p class="t-xs muted" style="margin-top:12px;text-align:center">Approach A plan hub. Nothing changes until you approve.</p>
</div>
<div class="tray"><span class="count">2</span><div class="grow"><div class="t-sm strong">2 changes</div><div class="t-xs muted">Draft · rechecked before approval</div></div><div class="btn primary">Review</div></div>`;
S['F3-hub'] = () => hubV3();

const energyEditor = (opts = {}) => `
${statusBar()}${navX('Daily Energy')}
<div class="content stack">
  <div class="card">
    <div class="row between"><span class="eyebrow amber">Daily balance</span><span class="t-xs muted">Suggested −450</span></div>
    <div class="bigval" style="margin-top:10px"><span data-e="balance">−450</span><small>kcal/day</small></div>
    <div class="t-xs muted" style="margin-top:4px"><span data-e="rate">≈ 0.7–1.3 lb/week loss</span> · likely <span data-e="range">−591 to −310</span></div>
    <div class="rng"><div class="track"><div class="z" style="left:0;width:8%;background:var(--redWash)"></div><div class="z" style="left:8%;width:32%;background:var(--tealWash)"></div></div><input type="range" aria-label="Daily balance in kilocalories" data-in="balance" min="-750" max="500" step="25" value="${opts.balance ?? -450}"></div>
    <div class="ticks"><span>−750</span><span>0</span><span>+500</span></div>
  </div>
  <div><div class="t-sm strong" style="margin-bottom:8px">How you get there</div>
    <div class="chips" role="radiogroup" aria-label="How to reach the balance">${[['suggested', '★ Suggested'], ['eat', 'Eat less'], ['move', 'Move more'], ['blend', 'Blend'], ['custom', 'Custom']].map(([k, l]) => `<span class="chip" role="radio" tabindex="0" data-split="${k}">${l}</span>`).join('')}</div></div>
  <div class="card soft">
    <div class="kv"><span class="k">Eat each day</span><span class="v"><span data-e="eat">1,767</span> kcal</span></div>
    <div class="kv"><span class="k">Activity goal</span><span class="v"><span data-e="goal">900</span> kcal/day <span class="t-xs muted">(usual 800 <span data-e="added">+100</span>)</span></span></div>
    <div data-e="custom" hidden>
      <div class="row between" style="margin-top:8px"><span class="t-sm ink2">Eat</span><label class="numin"><span class="sr">Daily intake</span><input type="number" inputmode="numeric" data-in="eatNum" value="1767" aria-label="Daily intake"></label></div>
      <div class="row between" style="margin-top:8px"><span class="t-sm ink2">Extra activity</span><div class="row" style="gap:8px"><div class="mini-step"><span data-step="added:-25" role="button" tabindex="0" aria-label="25 less">−25</span><span data-step="added:25" role="button" tabindex="0" aria-label="25 more">+25</span></div><label class="numin"><span class="sr">Extra activity</span><input type="number" inputmode="numeric" data-in="added" min="0" max="500" value="100" aria-label="Extra activity"></label></div></div>
    </div>
    <p class="t-xs muted" style="margin-top:8px" data-e="formula">2,117 − 450 + 100 = <b>1,767</b></p>
    <p class="t-xs muted" data-e="example">For example, ≈ 2,200 more steps a day. Any activity counts.</p>
  </div>
  <div data-e="notes"></div>
  <span class="t-sm semi" style="color:var(--teal)">Why these numbers?</span>
</div>`;
S['F4-energy'] = () => energyEditor();

S['F5-review'] = () => `
${statusBar()}${nav('Your Plan', 'Review')}
<div class="content stack">
  <div class="display h1">Review your new plan</div>
  <span class="pill teal" style="align-self:flex-start">${I.check} Checked against your latest evidence</span>
  <div class="card diff">
    <div class="kv"><span class="k">Phase</span><span class="delta"><s>Lean Mass Build</s><span class="v">Leaning</span></span></div>
    <div class="kv"><span class="k">Ends</span><span class="v">Back in 8–9% · ≈ 2–5 weeks</span></div>
    <div class="kv"><span class="k">Daily balance</span><span class="v">−450 kcal</span></div>
    <div class="kv"><span class="k">Eat</span><span class="delta"><s>2,500</s><span class="v">1,767 kcal</span></span></div>
    <div class="kv"><span class="k">Activity goal</span><span class="delta"><s>800</s><span class="v">900 kcal</span></span></div>
    <div class="kv"><span class="k">Goal date</span><span class="delta"><s>Oct 31</s><span class="v">Re-estimated after leaning</span></span></div>
  </div>
  <div class="card" style="padding:12px 16px"><div class="row between"><div><div class="t-body strong">Carrying forward</div><div class="t-sm ink2">Body-fat range, nutrition, training, recovery, supplements, photos</div></div>${I.chev}</div></div>
  <div class="btn primary">Approve plan</div>
  <p class="t-xs muted" style="text-align:center">Only numbers that change are listed. One approval; version 1 is kept in Your Journey.</p>
</div>`;

S['F6-stale'] = () => `
${statusBar()}${nav('Your Plan', 'Review')}
<div class="content stack">
  <div class="display h2">Your plan was updated</div>
  ${bannerB('amber', 'sync', 'Something changed since you started this draft', 'A new weigh-in trend refined your maintenance estimate. To keep −450 a day, eating is now 1,800 instead of 1,767. Your other choices are unchanged.')}
  <div class="card diff"><div class="kv"><span class="k">Eat</span><span class="delta"><s>1,767</s><span class="v">1,800 kcal</span></span></div><div class="kv"><span class="k">Activity goal</span><span class="v">900 kcal (same)</span></div></div>
  <div class="btn primary">Continue to review</div>
</div>`;

// ---------------- Simplified editors -----------------
S['A1-activity'] = () => `
${statusBar()}${navX('Activity')}
<div class="content stack">
  ${editorHead('Activity', 'Your activity goal')}
  <div class="card"><div class="row between"><span class="t-body">Daily active energy</span><div class="stepper"><span>−</span><b>900</b><span>+</span></div></div>
    <p class="t-xs muted" style="margin-top:8px">Usual ≈ 800 (last 4 weeks, Apple Health) + 100 extra. Changing it here changes what you eat 1:1 at the same balance.</p></div>
  <div class="ewarn info">${I.info}<span>For example, ≈ 2,200 more steps a day, or a short walk most days. Any activity counts; you don’t need a schedule.</span></div>
  <div class="card divider-list" style="padding:0 16px">
    <div class="lrow"><div class="l">Activity data<small>Apple Health · active energy, workouts included</small></div>${I.chev}</div>
  </div>
</div>`;

S['A2-no-wearable'] = () => `
${statusBar()}${navX('Activity')}
<div class="content stack">
  ${editorHead('Activity', 'No activity data yet')}
  ${bannerB('amber', 'info', 'We don’t see any activity data', 'Your plan still works. Your deficit comes from what you eat, and your weigh-ins show the result.')}
  <div class="card"><div class="divider-list">
    <div class="choice">${radio(true)}<div class="grow"><div class="t-body strong">Plan without activity data</div><div class="t-sm ink2">No activity goal. Eating carries the whole balance.</div></div></div>
    <div class="choice">${radio(false)}<div class="grow"><div class="t-body strong">Connect Apple Health</div><div class="t-sm ink2">Any device that writes active energy to Apple Health works.</div></div></div>
  </div></div>
  <p class="t-xs muted">Other sources can plug in later through the same activity-data layer.</p>
</div>`;

S['R1-recovery'] = () => `
${statusBar()}${navX('Recovery')}
<div class="content stack">
  ${editorHead('Recovery', 'Recovery priorities')}
  <div class="card divider-list" style="padding:0 16px">
    ${srow('moon', '', 'Foam Rolling', 'Daily · evening · reminder on')}
    <div class="srow"><span class="ic" style="color:var(--teal)">${I.plus}</span><div class="grow"><div class="nm" style="color:var(--teal)">Add a priority</div><div class="dt">Stretching, mobility or your own</div></div></div>
  </div>
  <div class="card"><div class="row between"><div><div class="t-body strong">Sleep goal ${opt()}</div><div class="t-sm ink2">Your sleep data averages 7 h 05 m</div></div><span class="t-sm semi" style="color:var(--teal)">Set</span></div></div>
</div>`;

S['R2-add-priority'] = () => `<div style="height:874px;overflow:hidden;position:relative">${S['R1-recovery']()}</div><div class="scrim"></div>
<div class="sheet">
  <div class="grabber"></div>
  <div class="row between"><span class="t-body muted">Cancel</span><span class="t-body strong">Add a priority</span><span class="t-body strong" style="color:var(--teal)">Add</span></div>
  <div class="chips" style="margin-top:16px"><span class="chip on">Stretching</span><span class="chip">Mobility</span><span class="chip">Walk after meals</span><span class="chip">Breathing</span><span class="chip">Custom…</span></div>
  <div class="card divider-list" style="margin-top:14px;padding:0 16px">
    <div class="lrow"><div class="l">How often ${opt()}</div><div class="r">3× a week ${I.chev}</div></div>
    <div class="lrow"><div class="l">Remind me</div>${sw(false)}</div>
  </div>
  <p class="t-xs muted" style="margin-top:10px">Shows in Today’s Priorities when it’s due. Skip any day without penalty.</p>
</div>`;

S['R3-sleep-goal'] = () => `<div style="height:874px;overflow:hidden;position:relative">${S['R1-recovery']()}</div><div class="scrim"></div>
<div class="sheet">
  <div class="grabber"></div>
  <div class="row between"><span class="t-body muted">Cancel</span><span class="t-body strong">Sleep goal</span><span class="t-body strong" style="color:var(--teal)">Save</span></div>
  <div class="row between" style="margin-top:18px"><span class="t-body">Time asleep</span><div class="stepper"><span>−</span><b>7 h 30 m</b><span>+</span></div></div>
  <p class="t-xs muted" style="margin-top:10px">Recent average 7 h 05 m. Briefings mention sleep when it affects recovery. No reminders unless you ask.</p>
  <div class="btn ghost" style="margin-top:6px">Don’t set a goal</div>
</div>`;

S['S1-supplements'] = () => `
${statusBar()}${navX('Supplements')}
<div class="content stack">
  ${editorHead('Supplements', 'Supplements')}
  <div class="card divider-list" style="padding:0 16px">
    ${srow('pill', '', 'Tongkat Ali', '2 capsules · daily · reminder on')}
    ${srow('pill', '', 'Electrolytes', 'Training days · no reminder')}
    <div class="srow"><span class="ic" style="color:var(--teal)">${I.plus}</span><div class="grow"><div class="nm" style="color:var(--teal)">Add a supplement</div></div></div>
  </div>
  <p class="t-xs muted">PhysiqueOS tracks what you take; it doesn’t recommend supplements or doses.</p>
</div>`;

S['S2-add-supplement'] = () => `<div style="height:874px;overflow:hidden;position:relative">${S['S1-supplements']()}</div><div class="scrim"></div>
<div class="sheet">
  <div class="grabber"></div>
  <div class="row between"><span class="t-body muted">Cancel</span><span class="t-body strong">Add supplement</span><span class="t-body strong" style="color:var(--teal)">Add</span></div>
  <div class="field focus" style="margin-top:16px"><span class="strong">Creatine</span></div>
  <div class="card divider-list" style="margin-top:12px;padding:0 16px">
    <div class="lrow"><div class="l">Amount ${opt()}</div><div class="r">5 g ${I.chev}</div></div>
    <div class="lrow"><div class="l">How often</div><div class="r">Daily ${I.chev}</div></div>
    <div class="lrow"><div class="l">Remind me</div>${sw(false)}</div>
  </div>
</div>`;

S['P1-photos-dexa'] = () => `
${statusBar()}${navX('Photos & DEXA')}
<div class="content stack">
  ${editorHead('Evidence', 'Progress photos & DEXA', 'Both optional. Your plan works without them; they make estimates sharper.')}
  <div class="card divider-list" style="padding:0 16px">
    <div class="lrow"><div class="l">Progress photos<small>Every 2 weeks · Saturday morning</small></div>${sw(true)}</div>
    <div class="lrow"><div class="l">Remind me</div>${sw(true)}</div>
  </div>
  <div class="card divider-list" style="padding:0 16px">
    <div class="lrow"><div class="l">Next DEXA scan<small>Not planned · optional</small></div><span class="t-sm semi" style="color:var(--teal)">Schedule</span></div>
  </div>
</div>`;

// ---------------- Quick Calibration v3 -----------------
const take = `<div class="coach"><span class="eyebrow purple">Coach’s Take</span>
  <div style="margin-top:10px"><div class="t-sm strong">Biggest Takeaway</div><p class="t-sm ink2" style="margin-top:3px">Four weeks of steady logging and activity, but weight has moved about −0.2 lb a week, less than planned.</p></div>
  <div style="margin-top:10px"><div class="t-sm strong">Into Next Week</div><p class="t-sm ink2" style="margin-top:3px">Keep training as you are; strength is holding.</p></div></div>`;
const qcCardV3 = (sel = '') => `
  <div class="card selected" data-qcv3 data-qopt="${sel}">
    <div class="row between"><span class="eyebrow amber">Quick calibration</span><span class="pill teal">${I.check} Checked</span></div>
    <div class="display h3" style="margin-top:8px">Deepen your daily deficit by 200</div>
    <p class="t-sm ink2" style="margin-top:6px">Your −450 plan has behaved like about −250. Adding 200 brings you back on pace.</p>
    <div class="row" style="gap:10px;margin-top:10px;align-items:baseline"><span class="was t-lg">−450</span><span class="t-lg">→</span><span class="bigval" style="font-size:1.6em"><span data-qe="balance">−650</span></span><span class="t-sm ink2">planned a day</span></div>
    <div class="t-sm strong" style="margin-top:12px">How?</div>
    <div class="qgrid" role="radiogroup" aria-label="How to add 200">
      ${[['eat', 'Eat less', '1,567 · goal 900'], ['move', 'Move more', '1,767 · goal 1,100'], ['blend', 'Blend', '1,667 · goal 1,000'], ['custom', 'Custom', 'Set your own']].map(([k, l, d]) => `<div class="qtile" role="radio" tabindex="0" data-qopt="${k}"><b>${l}</b><span>${d}</span></div>`).join('')}
    </div>
    <div data-qe="custom" hidden>
      <div class="row between" style="margin-top:10px"><span class="t-sm ink2">Eat less by</span><div class="row" style="gap:8px"><div class="mini-step"><span data-qstep="eatLess:-25" role="button" tabindex="0" aria-label="25 less">−25</span><span data-qstep="eatLess:25" role="button" tabindex="0" aria-label="25 more">+25</span></div><label class="numin"><span class="sr">Eat less by</span><input type="number" inputmode="numeric" data-q="eatLess" value="150" aria-label="Eat less by kilocalories"></label></div></div>
      <div class="row between" style="margin-top:8px"><span class="t-sm ink2">Move more by</span><div class="row" style="gap:8px"><div class="mini-step"><span data-qstep="moveMore:-25" role="button" tabindex="0" aria-label="25 less">−25</span><span data-qstep="moveMore:25" role="button" tabindex="0" aria-label="25 more">+25</span></div><label class="numin"><span class="sr">Move more by</span><input type="number" inputmode="numeric" data-q="moveMore" value="50" aria-label="Move more by kilocalories"></label></div></div>
    </div>
    <div class="card soft" style="margin-top:10px;padding:8px 12px">
      <div class="kv" style="padding:6px 0"><span class="k">Eat</span><span class="v"><span data-qe="eat">1,767</span> <span class="t-xs muted">(<span data-qe="eatDelta">same</span>)</span></span></div>
      <div class="kv" style="padding:6px 0"><span class="k">Activity goal</span><span class="v"><span data-qe="goal">900</span> <span class="t-xs muted">(<span data-qe="goalDelta">same</span>)</span></span></div>
    </div>
    <div data-qe="msgs"></div>
    <div class="row" style="margin-top:12px"><div class="btn disabled grow" data-qe="accept">Choose how to add 200</div></div>
    <div class="row between" style="margin-top:6px"><span class="t-sm semi" style="color:var(--teal)">Why?</span><span class="t-sm semi muted">Not now</span></div>
  </div>`;
S['Q1-proposal'] = () => `
${statusBar()}${nav('Home', 'Weekly Briefing')}
<div class="content stack">
  <div class="row between"><span class="eyebrow">Weekly · Nov 1–7</span><span class="t-xs muted">End of briefing</span></div>
  ${take}
  ${qcCardV3('')}
</div>`;
S['Q2-blend'] = () => S['Q1-proposal']().replace('data-qopt=""', 'data-qopt="blend"');
S['Q3-custom'] = () => S['Q1-proposal']().replace('data-qopt=""', 'data-qopt="custom"');
S['Q4-applied'] = () => `
${statusBar()}${nav('Home', 'Weekly Briefing')}
<div class="content stack">
  <div class="row between"><span class="eyebrow">Weekly · Nov 1–7</span><span class="t-xs muted">End of briefing</span></div>
  ${take}
  <div class="card" style="border:1.5px solid var(--green)">
    <div class="row between"><span class="eyebrow" style="color:var(--green)">Plan updated</span><span class="t-xs muted">Nov 8 · 9:43 AM</span></div>
    <div class="kv"><span class="k">Daily balance</span><span class="delta"><s>−450</s><span class="v">−650 planned</span></span></div>
    <div class="kv"><span class="k">Eat</span><span class="delta"><s>1,767</s><span class="v">1,667</span></span></div>
    <div class="kv"><span class="k">Activity goal</span><span class="delta"><s>900</s><span class="v">1,000</span></span></div>
    <p class="t-sm ink2" style="margin-top:6px">Everything else is unchanged. We’ll watch for 3 weeks before suggesting anything else.</p>
    <div class="row between" style="margin-top:10px"><span class="t-sm semi" style="color:var(--teal)">View change</span><span class="t-sm semi" style="color:var(--teal)">Undo</span></div>
  </div>
</div>`;
S['Q5-why'] = () => `<div style="height:874px;overflow:hidden;position:relative">${S['Q1-proposal']()}</div><div class="scrim"></div>
<div class="sheet">
  <div class="grabber"></div>
  <div class="display h2">Why 200?</div>
  <div class="divider-list" style="margin-top:10px">
    <div class="kv"><span class="k">You followed the plan</span><span class="v">27/28 days logged · activity on goal</span></div>
    <div class="kv"><span class="k">Weight trend</span><span class="v">−0.2 lb/week (planned −0.7 to −1.3)</span></div>
    <div class="kv"><span class="k">What that means</span><span class="v">Real deficit ≈ −250, not −450</span></div>
    <div class="kv"><span class="k">Maintenance estimate</span><span class="delta"><s>2,117</s><span class="v">≈ 1,917</span></span></div>
  </div>
  <p class="t-sm ink2" style="margin-top:10px">Logs and wearables have margins of error; your results show the real balance. We suggest a modest step and recheck after 3 weeks.</p>
</div>`;
S['Q6-escalate'] = () => `
${statusBar()}${nav('Home', 'Monthly Briefing')}
<div class="content stack">
  <div class="row between"><span class="eyebrow">Monthly · October</span><span class="t-xs muted">End of briefing</span></div>
  <div class="coach"><span class="eyebrow purple">Coach’s Take · Month Ahead</span><p class="t-sm ink2" style="margin-top:8px">Fat is coming down slower than planned, and the leaning phase will likely pass its 6-week limit.</p></div>
  <div class="card selected"><div class="row between"><span class="eyebrow amber">Needs a plan review</span></div>
    <div class="display h3" style="margin-top:8px">Adjust energy and the phase end together</div>
    <p class="t-sm ink2" style="margin-top:6px">This affects your phase limit, so it opens Your Plan with both changes ready. Small changes like last month’s stay in the briefing.</p>
    <div class="btn primary" style="margin-top:12px">Review my plan ${I.arrow}</div></div>
</div>`;
