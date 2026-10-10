// ---------------------------------------------------------------------------
// Screens part D: cross-strategy states, review & approve, Approach B guided
// path, Approach C (considered), and standalone Operating Plan reuse.
// ---------------------------------------------------------------------------
S['X1-conflict'] = () => `<div style="height:874px;overflow:hidden;position:relative">${hub({ more: true, conflict: true })}</div><div class="scrim"></div>
<div class="sheet">
  <div class="grabber"></div>
  <span class="eyebrow amber">Check before you approve</span>
  <div class="display h2" style="margin-top:6px">Lots of new activity on top of full training</div>
  <p class="t-sm ink2" style="margin-top:6px">You raised added activity to +500 a day and kept 9 training sessions. Together that’s a big jump in total work, eating 2,167, above your maintenance, with the whole deficit riding on activity.</p>
  <div class="divider-list" style="margin-top:10px">
    <div class="choice">${radio(true)}<div class="grow"><div class="t-body strong">Use the suggested split</div><div class="t-sm ink2">+100 activity, 1,767 eaten, same −450 balance</div></div></div>
    <div class="choice">${radio(false)}<div class="grow"><div class="t-body strong">Keep +500 and drop to 7 sessions</div><div class="t-sm ink2">Opens Training</div></div></div>
    <div class="choice">${radio(false)}<div class="grow"><div class="t-body strong">Keep everything as I set it</div><div class="t-sm ink2">Noted in your plan; we’ll watch recovery</div></div></div>
  </div>
  <div class="btn primary" style="margin-top:10px">Apply</div>
</div>`;

S['X2-approve-failed'] = () => `
${statusBar()}${nav('Your Plan', 'Review')}
<div class="content stack">
  <div class="display h1">Review your new plan</div>
  ${bannerB('red', 'warn', 'Nothing was changed', 'We couldn’t reach PhysiqueOS, so none of your 5 changes were applied. Your draft is safe. Try again when you’re online.')}
  <div class="card" style="opacity:.6"><div class="kv"><span class="k">Phase</span><span class="v">Leaning phase</span></div><div class="kv"><span class="k">Daily energy</span><span class="v">−450 · 1,767 eaten</span></div></div>
  <div class="btn primary">Try again</div>
  <p class="t-xs muted" style="text-align:center">Changes apply together or not at all — never half a plan.</p>
</div>`;

S['X3-stale-merge'] = () => `
${statusBar()}${nav('Your Plan', 'Review')}
<div class="content stack">
  <div class="display h2">Something changed elsewhere</div>
  ${bannerB('amber', 'sync', 'Coaching updates were edited on the web', 'Your Weekly briefing moved to Saturday 7:00 AM while this draft was open. Your other changes are unaffected.')}
  <div class="card"><span class="eyebrow">Coaching updates</span>
    <div class="divider-list" style="margin-top:4px">
      <div class="choice">${radio(true)}<div class="grow"><div class="t-body strong">Use the newer setting</div><div class="t-sm ink2">Weekly on Saturday · 7:00 AM</div></div></div>
      <div class="choice">${radio(false)}<div class="grow"><div class="t-body strong">Keep my draft</div><div class="t-sm ink2">Weekly on Sunday · 8:00 AM</div></div></div>
    </div></div>
  <div class="btn primary">Continue to review</div>
</div>`;

const reviewScreen = (opts = {}) => `
${statusBar()}${nav('Your Plan', 'Review')}
<div class="content stack">
  <div class="display h1">Review your new plan</div>
  ${opts.superseded ? bannerB('amber', 'sync', 'Updated with your Oct 23 weigh-in trend', 'Maintenance moved 2,117 → 2,180. To keep −450/day, intake is now 1,830 (was 1,767). Approve again to continue.') : `<span class="pill teal" style="align-self:flex-start">${I.check} Checked against your latest evidence · 9:41 AM</span>`}
  <div class="card diff">
    <div class="grp" style="padding-top:0">Goal and phase</div>
    <div class="kv"><span class="k">Phase</span><span class="delta"><s>Lean Mass Build</s><span class="v">Leaning phase</span></span></div>
    <div class="kv"><span class="k">Ends</span><span class="v">Back in 8–9% · ≈ 2–5 weeks</span></div>
    <div class="kv"><span class="k">Goal date</span><span class="delta"><s>Oct 31</s><span class="v">Re-estimated after leaning</span></span></div>
    <div class="grp">Energy</div>
    <div class="kv"><span class="k">Daily balance</span><span class="v">−450 kcal (≈ −310 to −591)</span></div>
    <div class="kv"><span class="k">Eat</span><span class="delta"><s>2,500</s><span class="v" ${opts.superseded ? 'style="color:var(--amberInk)"' : ''}>${opts.superseded ? '1,830' : '1,767'} kcal</span></span></div>
    <div class="kv"><span class="k">Activity goal</span><span class="delta"><s>800</s><span class="v">900 kcal (+100 added)</span></span></div>
    <div class="grp">Other strategies</div>
    <div class="kv"><span class="k">Training progression</span><span class="delta"><s>Moderate</s><span class="v">Conservative</span></span></div>
    <div class="kv"><span class="k">Added activity</span><span class="v">3 walks · Mon, Wed, Sat${IL}</span></div>
  </div>
  <div class="card" style="padding:12px 16px"><div class="row between"><div><div class="t-body strong">Carrying forward (6)</div><div class="t-sm ink2">Body-fat range 8–9%, nutrition, recovery, peptides, supplements, coaching, tracking</div></div>${I.chev}</div></div>
  <div class="btn primary">${opts.superseded ? 'Approve updated plan' : 'Approve plan'}</div>
  <p class="t-xs muted" style="text-align:center">One approval updates your goal, phase and every strategy together. Your current plan is saved as version 1 in Your Journey.</p>
</div>`;
S['RV1-review'] = () => reviewScreen();
S['RV3-review-superseded'] = () => reviewScreen({ superseded: true });

S['RV2-approved'] = () => `
${statusBar()}${nav('Goals', 'Build Lean Mass')}
<div class="content stack">
  <div class="row" style="gap:10px"><span style="color:var(--green)">${I.check}</span><span class="eyebrow" style="color:var(--green)">Approved · Oct 9</span></div>
  <div class="display h1">Your leaning phase has started</div>
  <p class="lead">Starting today: 1,767 kcal, a 900 kcal activity goal and conservative progression. Your first check-in is Sunday.</p>
  <div class="card"><span class="eyebrow">Your journey</span>
    <div class="phases" style="margin-top:10px">
      <div class="ph"><div class="col"><div class="dot done"></div><div class="line"></div></div><div class="txt"><div class="t-body strong">Lean Mass Build · paused at +7 lb</div><div class="t-sm ink2">Plan version 1 kept</div></div></div>
      <div class="ph"><div class="col"><div class="dot now"></div><div class="line"></div></div><div class="txt"><div class="t-body strong">Leaning phase</div><div class="t-sm ink2">Started Oct 9 · plan version 2</div></div></div>
      <div class="ph"><div class="col"><div class="dot"></div></div><div class="txt"><div class="t-body strong muted">Building resumes when you choose</div></div></div>
    </div></div>
  <div class="btn secondary">See what changed</div>
</div>`;

// ---------------- Approach B: guided path -----------------
const guided = (step, title, body, opts = {}) => `
${statusBar()}${navX('Your Plan', 'Skip to review', '‹ Back')}
<div class="content stack">
  <div><div class="steps">${Array.from({ length: 7 }, (_, i) => `<i class="${i < step - 1 ? 'done' : i === step - 1 ? 'cur' : ''}"></i>`).join('')}</div>
  <div class="row between"><span class="eyebrow">Step ${step} of 7 · ${opts.domain}</span><span class="t-xs muted">${opts.changes ?? 1} change${(opts.changes ?? 1) === 1 ? '' : 's'} so far</span></div>
  <div class="display h2" style="margin-top:6px">${title}</div></div>
  ${body}
</div>
<div class="tray" style="padding-left:12px"><div class="btn secondary grow" style="min-height:46px">${opts.keep ? 'Keep as is' : 'Back'}</div><div class="btn primary grow">${opts.next || 'Next'}</div></div>`;
S['B1-guided-energy'] = () => guided(1, 'Daily energy', `
  <div class="card"><div class="row between"><span class="pill amber">Moderate deficit</span><span class="t-xs muted">Suggested</span></div><div class="bigval" style="margin-top:10px">−450<small>kcal/day</small></div>
  <div class="band" style="margin-top:12px"><div><span>Eat</span><b>1,767</b></div><div><span>Added activity</span><b>+100</b></div></div></div>
  <div class="btn ghost">Adjust balance and split</div>`, { domain: 'Energy', changes: 2, next: 'Next: Nutrition' });
S['B2-guided-training'] = () => guided(4, 'Training', `
  <p class="lead">Nothing has to change here. Keep it, or adjust for the leaning phase.</p>
  <div class="card soft"><div class="kv"><span class="k">Sessions</span><span class="v">9 a week</span></div><div class="kv"><span class="k">Focus</span><span class="v">Chest, Back</span></div><div class="kv"><span class="k">Progression</span><span class="v">Moderate</span></div></div>
  ${bannerB('teal', 'info', 'Suggested: conservative progression while leaning', 'Hold loads; don’t chase records on less food.')}
  <div class="btn secondary">Edit training</div>`, { domain: 'Training', changes: 2, keep: true, next: 'Use suggestion' });
S['B3-guided-overview'] = () => `
${statusBar()}${navX('Your Plan', 'Close', '‹ Back')}
<div class="content stack">
  <div class="display h2">Jump to a step</div>
  <div class="card divider-list" style="padding:0 16px">
    ${[['Energy', 'Changed', 'amber'], ['Nutrition', 'Kept', 'line'], ['Activity', 'Changed', 'amber'], ['Training', 'Current step', 'teal'], ['Recovery', '—', 'line'], ['Peptides & supplements', '—', 'line'], ['Coaching & tracking', '—', 'line']].map(([n, s, t], i) => `<div class="lrow"><div class="l"><span class="muted" style="margin-right:8px">${i + 1}</span>${n}</div><span class="pill ${t}">${s}</span></div>`).join('')}
  </div>
  <p class="t-xs muted">Each step defaults to “Keep as is”. Review appears after step 7, or any time with “Skip to review”.</p>
</div>`;

// ---------------- Approach C (considered, not recommended) -----------------
S['C1-accordion'] = () => `
${statusBar()}${nav('Leaning Phase', 'Your Plan')}
<div class="content stack">
  <div class="display h2">Your plan · all on one page</div>
  <div class="card"><div class="row between"><span class="t-body strong">Energy</span>${I.chevDown}</div>
    <div class="rng" style="margin-top:6px"><div class="track"><div class="fill" style="left:24%;width:36%"></div></div><input type="range" min="-750" max="500" value="-450" aria-label="Balance" disabled></div>
    <div class="row between t-sm"><span>Eat 1,767</span><span>Added +100</span></div></div>
  <div class="card"><div class="row between"><span class="t-body strong">Nutrition</span>${I.chevDown}</div>
    <div class="seg" style="margin-top:8px"><div class="on">Per body weight</div><div>Fixed</div></div>
    <div class="chips" style="margin-top:8px"><span class="chip on">Performance</span><span class="chip">Balanced</span><span class="chip">Lower</span></div></div>
  <div class="card"><div class="row between"><span class="t-body strong">Training</span>${I.chevDown}</div>
    ${[['Chest', 1], ['Back', 1], ['Arms', 2]].map(([a, n]) => `<div class="lrow"><div class="l">${a}</div><div class="stepper"><span>−</span><b>${n}×</b><span>+</span></div></div>`).join('')}</div>
  <div class="card"><div class="row between"><span class="t-body strong">Recovery · Peptides · Supplements · …</span>${I.chev}</div></div>
</div>`;

// ---------------- Same editors outside Goal Adaptation -----------------
S['O1-operating-plan'] = () => `
${statusBar()}${nav('You', 'Operating Plan')}
<div class="content">
  <div class="display h1">Your Operating Plan</div>
  <p class="lead" style="margin-top:6px">Leaning phase · version 2 since Oct 9</p>
  <div class="card" style="margin-top:14px;background:linear-gradient(160deg,var(--fieldStart),var(--fieldEnd));border:0">
    <span class="eyebrow" style="color:var(--ink)">Daily energy</span>
    <div class="bigval" style="margin-top:8px">−450<small>kcal/day</small></div>
    <div class="t-sm" style="margin-top:6px">1,767 eaten · 900 activity goal · weekly check-in</div></div>
  <div class="card" style="padding:0 16px;margin-top:12px"><div class="divider-list">
    ${[['food', 'Nutrition', 'Protein 1.0 g/lb · performance carbs'], ['walk', 'Activity', '+100 above usual · 3 walks'], ['lift', 'Training', '9 sessions · conservative'], ['moon', 'Recovery', 'Foam Rolling daily'], ['drop', 'Peptides', '2 active'], ['pill', 'Supplements', '2 active'], ['cam', 'Coaching updates', 'Weekly Sun · photos 2 wks'], ['scale', 'Tracking & reminders', '5 reminders']].map(([ic, n, d]) => srow(ic, '', n, d, I.chev)).join('')}</div></div>
  <p class="t-xs muted" style="margin-top:12px;text-align:center">Same editors as in Goal Adaptation. Outside a phase change, Energy opens a review because it’s tied to your phase.</p>
</div>
${tabbar('you')}`;
