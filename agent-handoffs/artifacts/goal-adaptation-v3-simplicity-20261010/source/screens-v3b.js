// ---------------------------------------------------------------------------
// v3 screens, part B: evolving RMR / maintenance transparency, learned
// training. Real today: DEXA-report RMR, RMR + active energy math, Training
// Logger evidence. Concept: equation/lean-mass RMR between scans, outcome-
// calibrated maintenance in production, learned weekly pattern.
// ---------------------------------------------------------------------------
const prov = (t, cls = '') => `<span class="prov ${cls}">${t}</span>`;

S['M1-why-numbers'] = () => `<div style="height:874px;overflow:hidden;position:relative">${S['F4-energy']()}</div><div class="scrim"></div>
<div class="sheet">
  <div class="grabber"></div>
  <div class="display h2">Why these numbers?</div>
  <p class="t-sm ink2" style="margin-top:6px">Three layers. Only the last one is yours to approve.</p>
  <div style="margin-top:12px">
    <div class="layer"><div class="row between"><span class="t-sm strong">Resting energy</span>${prov('DEXA report · Oct 9', 'e')}</div><div class="row between" style="margin-top:4px"><span class="bigval" style="font-size:1.3em">≈ 1,790<small>kcal/day*</small></span></div><p class="t-xs muted" style="margin-top:4px">What your body uses at rest. Updates with body composition.</p></div>
    <div class="layer"><div class="row between"><span class="t-sm strong">Maintenance</span>${prov('Learned from your results', 'm')}</div><div class="row between" style="margin-top:4px"><span class="bigval" style="font-size:1.3em">≈ 2,117<small>1,977–2,258</small></span></div><p class="t-xs muted" style="margin-top:4px">From what you logged and how your weight and scans changed, with your usual ≈ 800 activity included.</p></div>
    <div class="layer" style="border-color:var(--teal)"><div class="row between"><span class="t-sm strong">Your targets</span>${prov('You approved')}</div><div class="t-body strong" style="margin-top:4px">Eat 1,767 · activity goal 900</div><p class="t-xs muted" style="margin-top:4px">Change only when you approve, here or in a briefing.</p></div>
  </div>
</div>`;

S['M2-new-user'] = () => `
${statusBar()}${navX('Daily Energy', 'Done')}
<div class="content stack">
  ${editorHead('Energy', 'How we start without a scan')}
  <div class="layer"><div class="row between"><span class="t-sm strong">Resting energy</span>${prov('Estimate from your profile')}</div>
    <div class="bigval" style="font-size:1.3em;margin-top:4px">≈ 1,850<small>1,700–2,000</small></div>
    <p class="t-xs muted" style="margin-top:4px">From sex, age, height and weight. Read from Apple Health when available, so there’s nothing to fill in.</p></div>
  <div class="layer"><div class="row between"><span class="t-sm strong">Maintenance</span>${prov('Provisional')}</div>
    <div class="bigval" style="font-size:1.3em;margin-top:4px">≈ 2,750<small>2,450–3,050</small></div>
    <p class="t-xs muted" style="margin-top:4px">Resting energy plus your usual activity and digestion. Narrows after about 3 weeks of logging and weigh-ins.</p></div>
  <div class="card"><span class="eyebrow">Missing from Apple Health</span>
    <div class="row between" style="margin-top:10px"><span class="t-body">Birth year</span><span class="numbox">1988 ✎</span></div>
    <p class="t-xs muted" style="margin-top:8px">Only what’s missing is asked, once.</p></div>
  <p class="t-xs muted">A DEXA or measured resting energy makes this sharper. Neither is required.</p>
</div>`;

S['M3-composition-changed'] = () => `
${statusBar()}${nav('Your Plan', 'Daily Energy')}
<div class="content stack">
  ${bannerB('teal', 'info', 'Your estimates updated after the Nov 13 scan', 'Lean mass +1.3 lb, fat −2.4 lb. Your targets did not change.')}
  <div class="card diff">
    <div class="kv"><span class="k">Resting energy</span><span class="delta"><s>1,790</s><span class="v">1,812*</span></span></div>
    <div class="kv"><span class="k">Maintenance</span><span class="delta"><s>1,917</s><span class="v">≈ 1,940 (1,860–2,020)</span></span></div>
    <div class="kv"><span class="k">Your targets</span><span class="v">Eat 1,667 · goal 1,000 (unchanged)</span></div>
  </div>
  <p class="t-sm ink2">If the new estimates change what you should do, your next briefing will suggest it. Nothing changes without you.</p>
  <span class="t-sm semi" style="color:var(--teal)">Why these numbers?</span>
</div>`;

// ---------------- Learned training -----------------
const areaRows = (rows) => `<div class="areas">${rows.map(([a, f, w]) => `<span>${a}</span><div class="bar"><i style="width:${w}%"></i></div><b style="text-align:right">${f}</b>`).join('')}</div>`;
S['T1-learned'] = () => `
${statusBar()}${navX('Training')}
<div class="content stack">
  ${editorHead('Training', 'Learned from your recent workouts')}
  <div class="card"><div class="row between"><span class="eyebrow">Your pattern</span>${prov('Observed · 6 weeks, 22 workouts', 'm')}</div>
    <div class="t-body strong" style="margin-top:8px">≈ 4 workouts a week · usually Mon, Tue, Thu, Sat</div>
    <div style="margin-top:12px">${areaRows([['Lower body', '2.0×/wk', 100], ['Arms', '1.5×/wk', 75], ['Back', '1.2×/wk', 60], ['Chest', '1.0×/wk', 50], ['Shoulders', '1.0×/wk', 50], ['Core', '0.7×/wk', 35]])}</div>
    <p class="t-xs muted" style="margin-top:8px">Supersets count once per session. Weeks with no tracking are left out.</p></div>
  <div class="card"><div class="row between"><span class="eyebrow">How it’s going</span>${prov('Comparable sessions', 'm')}</div>
    <div class="kv"><span class="k">Improving</span><span class="v">9 lifts</span></div>
    <div class="kv"><span class="k">Holding</span><span class="v">6 lifts</span></div>
    <div class="kv"><span class="k">Slipping</span><span class="v">1 lift (incline press)</span></div></div>
  <div class="card soft"><div class="row between"><span class="eyebrow purple">Coach suggestion · leaning phase</span></div>
    <p class="t-sm ink2" style="margin-top:6px">Keep this pattern and hold your loads. Training hard is what protects lean mass while you eat less.</p></div>
  <div class="card" style="padding:12px 16px"><div class="row between"><div><div class="t-body strong">Training goals ${opt()}</div><div class="t-sm ink2">None set. We follow what you do.</div></div><span class="t-sm semi" style="color:var(--teal)">Add</span></div></div>
</div>`;

S['T2-learning'] = () => `
${statusBar()}${navX('Training')}
<div class="content stack">
  ${editorHead('Training', 'Learning your routine')}
  <div class="card"><div class="row between"><span class="eyebrow">So far</span>${prov('3 workouts · 9 days')}</div>
    <p class="t-body" style="margin-top:8px">Lower body, back and arms so far.</p>
    <div class="bar" style="margin-top:12px"><i style="width:40%"></i></div>
    <p class="t-xs muted" style="margin-top:8px">We’ll describe your weekly pattern after about 3 weeks and 6 workouts. Until then, nothing here affects your plan.</p></div>
  <div class="card" style="padding:12px 16px"><div class="row between"><div><div class="t-body strong">Training goals ${opt()}</div><div class="t-sm ink2">Set a few now if you like.</div></div><span class="t-sm semi" style="color:var(--teal)">Add</span></div></div>
</div>`;

S['T3-travel-week'] = () => `
${statusBar()}${navX('Training')}
<div class="content stack">
  ${editorHead('Training', 'Learned from your recent workouts')}
  ${bannerB('teal', 'info', 'Last week: 1 workout', 'That looks like a break, not a new routine. Your usual pattern stays the same. If it continues for 3 weeks, we’ll update it.')}
  <div class="card"><div class="row between"><span class="eyebrow">Your usual pattern</span>${prov('Observed · 6 weeks', 'm')}</div>
    <div class="t-body strong" style="margin-top:8px">≈ 4 workouts a week</div>
    <p class="t-xs muted" style="margin-top:6px">Days with no tracking at all are left out of the pattern.</p></div>
</div>`;

S['T4-goals'] = () => `<div style="height:874px;overflow:hidden;position:relative">${S['T1-learned']()}</div><div class="scrim"></div>
<div class="sheet">
  <div class="grabber"></div>
  <div class="row between"><span class="t-body muted">Cancel</span><span class="t-body strong">Training goals</span><span class="t-body strong" style="color:var(--teal)">Save</span></div>
  <p class="t-sm ink2" style="margin-top:12px">All optional. Leave blank and we’ll simply follow your workouts.</p>
  <div class="card divider-list" style="margin-top:12px;padding:0 16px">
    <div class="lrow"><div class="l">Focus areas</div><div class="r">Chest, Back ${I.chev}</div></div>
    <div class="lrow"><div class="l">Workouts a week</div><div class="r">4 ${I.chev}</div></div>
    <div class="lrow"><div class="l">Progression</div><div class="r">Conservative ${I.chev}</div></div>
  </div>
  <p class="t-xs muted" style="margin-top:10px">No split or day-by-day schedule needed.</p>
</div>`;
