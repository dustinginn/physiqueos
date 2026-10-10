// ---------------------------------------------------------------------------
// Screens part C: focused strategy editors opened from the plan.
// Every editor uses the same frame: Cancel · title · Done (Done keeps the edit
// in the draft; nothing is saved until the single approval).
// ---------------------------------------------------------------------------
const owned = (label, value, owner) => `<div class="lrow"><div class="l">${label}<small>Set in ${owner}</small></div><div class="r"><b style="color:var(--ink)">${value}</b>${I.chev}</div></div>`;
const editorHead = (eyebrow, title, lead) => `<div><span class="eyebrow">${eyebrow}</span><div class="display h2" style="margin-top:6px">${title}</div>${lead ? `<p class="lead" style="margin-top:6px">${lead}</p>` : ''}</div>`;

// ---------------- Nutrition -----------------
const nutrition = (opts = {}) => `
${statusBar()}${navX('Nutrition', opts.err ? '<span style="color:var(--muted)">Done</span>' : 'Done')}
<div class="content stack">
  ${editorHead('Nutrition', 'Turn your energy plan into meals')}
  <div class="card" style="padding:4px 16px">${owned('Calories', '1,750 kcal/day', 'Daily energy')}</div>
  <div class="card"><div class="row between"><span class="eyebrow">Protein</span><span class="t-xs muted">≈ ${opts.err ? '—' : '179 g/day'}</span></div>
    <div class="seg" style="margin-top:10px"><div class="on">Per body weight</div><div>Fixed grams</div></div>
    <div class="row between" style="margin-top:12px"><span class="t-body">${opts.err ? 'Grams per lb' : 'Grams per lb'}</span>${opts.err ? '<div class="stepper" style="border-color:var(--red)"><span>−</span><b style="color:var(--red)">2.4 g</b><span>+</span></div>' : '<div class="stepper"><span>−</span><b>1.0 g</b><span>+</span></div>'}</div>
    ${opts.err ? `<div class="errtxt">${I.warn} Choose 0.5–2.0 g per lb (or switch to fixed grams, 50–400 g).</div>` : `<p class="t-xs muted" style="margin-top:8px">At 179 lb. Updates as your weight changes.</p>`}
  </div>
  <div class="card"><span class="eyebrow">Carbohydrates</span>
    <div class="chips" style="margin-top:10px"><span class="chip on">Performance</span><span class="chip">Balanced</span><span class="chip">Lower carbohydrate</span></div>
    <span class="eyebrow" style="display:block;margin-top:16px">Fat</span>
    <div class="chips" style="margin-top:10px"><span class="chip">Sustainable minimum</span><span class="chip on">Balanced</span><span class="chip">Higher fat</span></div>
  </div>
  ${opts.warn ? bannerB('amber', 'warn', 'Protein is a big share at 1,750', '179 g is 41% of your calories, leaving ≈ 150 g carbs for training. That works for a short leaning phase. Want to keep it?') : ''}
  <div class="concept"><div class="row between"><span class="eyebrow purple">Daily macro preview</span>${ctag('Concept')}</div>
    <div class="ebar" style="margin-top:10px"><div style="flex:41;background:#FB7185">P 179 g</div><div style="flex:34;background:#FBBF24;color:#10202A">C ≈150 g</div><div style="flex:25;background:#38BDF8;color:#10202A">F ≈ 49 g</div></div>
    <p class="t-xs muted" style="margin-top:8px">Derived guidance, not a target. Today only protein is a stored number; carbs and fat are approaches.</p></div>
  <div class="concept"><div class="row between"><span class="eyebrow purple">Consistency</span>${ctag('Concept')}</div>
    <div class="lrow"><div class="l">Log intake<small>So calibration stays reliable</small></div><div class="r"><b style="color:var(--ink)">6 of 7 days</b></div></div>
    <div class="lrow"><div class="l">Counts as on plan<small>Matches how briefings judge adherence</small></div><div class="r"><b style="color:var(--ink)">within ±10%</b></div></div></div>
</div>`;
S['N1-nutrition'] = () => nutrition();
S['N2-nutrition-tradeoff'] = () => nutrition({ warn: true });
S['N3-nutrition-invalid'] = () => nutrition({ err: true });

// ---------------- Activity -----------------
S['AC1-activity'] = () => `
${statusBar()}${navX('Activity')}
<div class="content stack">
  ${editorHead('Activity', 'How much you move')}
  <div class="card"><div class="row between"><span class="eyebrow">Your usual</span>${I.lock}</div>
    <div class="bigval" style="margin-top:8px">≈ 800<small>kcal/day</small></div>
    <p class="t-sm ink2" style="margin-top:6px">Apple Watch active energy, last 4 weeks (720–880), workouts included. Already part of your maintenance.</p></div>
  <div class="card"><div class="row between"><span class="eyebrow" style="color:var(--purple)">Added this phase</span><span class="t-xs muted">From Daily energy</span></div>
    <div class="row between" style="margin-top:8px"><div class="bigval" style="color:var(--purple)">+100<small>kcal/day</small></div><span class="t-sm semi" style="color:var(--teal)">Change</span></div>
    <div class="kv" style="margin-top:6px"><span class="k">Apple Watch goal</span><span class="v">900 kcal/day</span></div>
    <div class="kv"><span class="k">Per week</span><span class="v">+700 kcal</span></div></div>
  <div class="concept"><div class="row between"><span class="eyebrow purple">How you’ll add it</span>${ctag()}</div>
    <div class="divider-list" style="margin-top:4px">
      <div class="lrow"><div class="l">Brisk walks<small>3 × 45 min · Mon, Wed, Sat</small></div><div class="r">${I.chev}</div></div>
      <div class="lrow"><div class="l">Daily steps<small>≈ 2,200 more than your usual 9,400</small></div><div class="r">${I.chev}</div></div>
    </div></div>
  <p class="t-xs muted">Activity estimates are approximate. We judge the weekly total, not each walk.</p>
</div>`;

S['AC2-distribution'] = () => `
${statusBar()}${navX('Added Activity', 'Done', '‹ Activity')}
<div class="content stack">
  <div class="row between">${editorHead('Weekly plan', 'Spread +700 kcal a week', '')}</div>
  <div>${ctag('Concept · no backend yet')}</div>
  <div class="card"><span class="eyebrow">Session</span>
    <div class="chips" style="margin-top:10px"><span class="chip on">Brisk walk</span><span class="chip">Incline walk</span><span class="chip">Bike</span><span class="chip">Steps only</span></div>
    <div class="row between" style="margin-top:12px"><span class="t-body">Length</span><div class="stepper"><span>−</span><b>45 min</b><span>+</span></div></div>
    <div class="row between" style="margin-top:8px"><span class="t-body">Per week</span><div class="stepper"><span>−</span><b>3</b><span>+</span></div></div>
    <p class="t-xs muted" style="margin-top:8px">≈ 233 kcal each by your Watch’s estimate · ≈ 700 a week</p></div>
  <div class="card"><span class="eyebrow">Days</span>
    <div class="week" style="margin-top:10px">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => `<div class="${[0, 2, 5].includes(i) ? 'on' : ''} ${[0, 1, 3, 4, 5].includes(i) ? 'train' : ''}" style="min-height:58px"><b>${d}</b>${[0, 2, 5].includes(i) ? '<span class="dot"></span>' : ''}</div>`).join('')}</div>
    ${bannerB('amber', 'warn', 'Saturday is also a Lower Body day', 'A 45-minute walk is fine for most people; move it to Sunday if your legs need the rest.')}</div>
</div>`;

S['AC3-no-watch'] = () => `
${statusBar()}${navX('Activity')}
<div class="content stack">
  ${editorHead('Activity', 'We can’t see your usual activity')}
  ${bannerB('amber', 'watch', 'No Apple Watch activity for 9 days', 'Without your usual activity we can’t separate “added” movement. We’ll keep your current 800 kcal activity goal.')}
  <div class="card"><div class="kv"><span class="k">Usual activity</span><span class="v muted">Unknown</span></div><div class="kv"><span class="k">Activity goal</span><span class="v">800 kcal/day (kept)</span></div></div>
  <div class="card unav"><div class="row between"><span class="eyebrow">Added this phase</span>${I.lock}</div><p class="t-sm ink2" style="margin-top:6px">Available once 2 weeks of activity are in Health. Your deficit comes from intake until then.</p></div>
  <div class="btn secondary">Check Apple Health access</div>
</div>`;

// ---------------- Training -----------------
const training = (opts = {}) => `
${statusBar()}${navX('Training', opts.err ? '<span style="color:var(--muted)">Done</span>' : 'Done')}
<div class="content stack">
  ${editorHead('Training', 'Keep the muscle you built')}
  ${opts.err ? '' : bannerB('teal', 'info', 'Suggested while leaning: keep your sessions, hold progression', 'Training hard is what tells your body to keep lean mass in a deficit. Conservative progression avoids chasing new records on less food.')}
  <div class="card"><div class="row between"><span class="eyebrow">Sessions per week</span><span class="t-sm strong">${opts.err ? '<span style="color:var(--red)">0 total</span>' : '9 total'}</span></div>
    <div class="divider-list" style="margin-top:4px">${[['Chest', 1], ['Back', 1], ['Shoulders', 1], ['Arms', 2], ['Lower body', 2], ['Core', 2]].map(([a, n]) => `<div class="lrow"><div class="l">${a}</div><div class="stepper"><span>−</span><b>${opts.err ? 0 : n}×</b><span>+</span></div></div>`).join('')}</div>
    ${opts.err ? `<div class="errtxt">${I.warn} Choose at least one session a week.</div>` : ''}</div>
  <div class="card"><span class="eyebrow">Focus</span>
    <div class="chips" style="margin-top:10px">${['Chest', 'Back', 'Shoulders', 'Arms', 'Lower body', 'Core'].map((a) => `<span class="chip ${!opts.err && ['Chest', 'Back'].includes(a) ? 'on' : ''}">${a}</span>`).join('')}</div>
    ${opts.err ? `<div class="errtxt">${I.warn} Choose at least one focus area.</div>` : ''}</div>
  <div class="card"><span class="eyebrow">Progression</span>
    <div class="seg" style="margin-top:10px"><div class="on">Conservative</div><div>Moderate</div><div>Aggressive</div></div>
    <p class="t-xs muted" style="margin-top:8px"><span class="was">Moderate</span> → Conservative · two good sessions before adding load</p></div>
  <div class="concept"><div class="row between"><span class="eyebrow purple">Not editable here yet</span>${ctag()}</div>
    ${['Weekly schedule and split', 'Volume and intensity', 'Exercise variants (in the workout logger)'].map((t) => `<div class="lrow unav"><div class="l">${t}</div>${I.lock}</div>`).join('')}</div>
</div>`;
S['T1-training'] = () => training();
S['T2-training-invalid'] = () => training({ err: true });

S['T3-training-schedule-concept'] = () => `
${statusBar()}${navX('Weekly Schedule', 'Done', '‹ Training')}
<div class="content stack">
  <div class="row between"><div class="display h2">Your training week</div>${ctag()}</div>
  <p class="lead">A future editor: assign the 9 sessions to days. Today the schedule isn’t stored; Training saves frequency, focus and progression only.</p>
  <div class="card divider-list" style="padding:0 16px">${[['Mon', 'Chest · Shoulders'], ['Tue', 'Lower body'], ['Wed', 'Arms · Core'], ['Thu', 'Back'], ['Fri', 'Lower body'], ['Sat', 'Arms · Core'], ['Sun', 'Rest']].map(([d, s]) => `<div class="lrow"><div class="l strong" style="width:48px">${d}</div><div class="grow t-sm ${s === 'Rest' ? 'muted' : ''}">${s}</div>${I.dots}</div>`).join('')}</div>
  <div class="card soft"><div class="kv"><span class="k">Volume</span><span class="v muted">Hold current sets</span></div><div class="kv"><span class="k">Intensity</span><span class="v muted">Keep 1–3 reps in reserve</span></div></div>
</div>`;

// ---------------- Recovery -----------------
S['R1-recovery'] = () => `
${statusBar()}${navX('Recovery')}
<div class="content stack">
  ${editorHead('Recovery', 'What helps you recover')}
  <div class="card" style="padding:0 16px">${srow('moon', '', 'Foam Rolling', 'Daily · 7:15 PM · reminder on')}</div>
  <div class="concept"><div class="row between"><span class="eyebrow purple">Recovery targets</span>${ctag()}</div>
    <div class="lrow"><div class="l">Sleep<small>Your Sleep evidence averages 7 h 05 m. A target isn’t stored yet.</small></div><div class="r unav">7 h 30 m ${I.lock}</div></div>
    <div class="lrow"><div class="l">Rest days<small>Derived from your training week once a schedule exists</small></div><div class="r unav">1 / week ${I.lock}</div></div></div>
  <p class="t-xs muted">Recovery methods come from your plan. New methods are added outside Goal Adaptation.</p>
</div>`;

const scheduleEditor = (opts = {}) => `
${statusBar()}${navX(opts.title || 'Foam Rolling', opts.err ? '<span style="color:var(--muted)">Done</span>' : 'Done', '‹ ' + (opts.back || 'Recovery'))}
<div class="content stack">
  ${editorHead(opts.eyebrow || 'Recovery support', opts.title || 'Foam Rolling')}
  <div class="card"><span class="eyebrow">How often</span>
    <div class="chips" style="margin-top:10px">${['Daily', 'Weekly', 'Specific days', 'Every few days'].map((c) => `<span class="chip ${c === (opts.freq || 'Daily') ? 'on' : ''}">${c}</span>`).join('')}</div>
    ${opts.freq === 'Specific days' ? `<div class="chips" style="margin-top:12px">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<span class="chip" style="min-width:40px;justify-content:center">${d}</span>`).join('')}</div>${opts.err ? `<div class="errtxt">${I.warn} Choose at least one day.</div>` : ''}` : ''}
    <span class="eyebrow" style="display:block;margin-top:16px">When</span>
    <div class="chips" style="margin-top:10px">${['Morning', 'Afternoon', 'Evening', 'Exact time'].map((c) => `<span class="chip ${c === 'Exact time' ? 'on' : ''}">${c}</span>`).join('')}</div>
    <div class="field" style="margin-top:10px"><span>Time</span><b>${opts.time || '7:15 PM'}</b></div></div>
  <div class="card divider-list" style="padding:0 16px">
    <div class="lrow"><div class="l">Remind me</div>${sw(true)}</div>
    <div class="lrow"><div class="l">Starts</div><div class="r">Today ${I.chev}</div></div>
    <div class="lrow"><div class="l">Ends</div><div class="r">Until changed ${I.chev}</div></div>
    <div class="lrow"><div class="l">Notes<small>${opts.note || 'Shown when the priority opens'}</small></div>${I.chev}</div></div>
  <div class="ewarn info">${I.cal}<span><b>Preview:</b> ${opts.preview || 'Every day at 7:15 PM, starting today'}</span></div>
</div>`;
S['R2-schedule'] = () => scheduleEditor();
S['R3-schedule-invalid'] = () => scheduleEditor({ freq: 'Specific days', err: true, preview: 'Choose days to see the preview' });

// ---------------- Peptides -----------------
S['PE1-peptides'] = () => `
${statusBar()}${navX('Peptides')}
<div class="content stack">
  ${editorHead('Peptides', 'Your current protocols')}
  <div class="ewarn info">${I.info}<span>PhysiqueOS doesn’t recommend peptides or doses. Changes here only update the schedule and reminders you follow.</span></div>
  ${[['Retatrutide', 'Active · Thursdays 9:45 PM', 'teal'], ['Tesamorelin', 'Active · Daily evening', 'teal']].map(([n, d]) => `
  <div class="card"><div class="row between"><div><div class="t-body strong">${n}</div><div class="t-sm ink2">${d}</div></div><span class="pill teal">Carry forward</span></div>
    <div class="row" style="gap:8px;margin-top:12px"><div class="btn secondary small grow">Manage</div><div class="btn secondary small grow" style="color:var(--red)">Pause</div></div></div>`).join('')}
  <p class="t-xs muted">Dose history is always kept. Pauses and changes join this plan and take effect when you approve.</p>
</div>`;

S['PE2-peptide-manage'] = () => `
${statusBar()}${navX('Tesamorelin', 'Done', '‹ Peptides')}
<div class="content stack">
  ${editorHead('Peptide', 'Tesamorelin')}
  <div class="card divider-list" style="padding:0 16px">
    ${[['Dose', 'Unchanged'], ['Days', 'Every day'], ['Time', '9:45 PM'], ['Next dose', 'Today · 9:45 PM']].map(([k, v], i) => `<div class="lrow"><div class="l">${k}</div><div class="r">${v}${i < 3 ? I.chev : ''}</div></div>`).join('')}
    <div class="lrow"><div class="l">Reminder</div>${sw(true)}</div>
    <div class="lrow"><div class="l">Notes</div><div class="r">Add notes ${I.chev}</div></div></div>
  <div class="card"><span class="eyebrow">Pause with this plan</span>
    <div class="divider-list" style="margin-top:4px">
      <div class="choice">${radio(true)}<div class="grow"><div class="t-body strong">Keep taking it</div></div></div>
      <div class="choice">${radio(false)}<div class="grow"><div class="t-body strong">Pause from the day I approve</div><div class="t-sm ink2">Doses and reminders stop. History is kept.</div></div></div>
    </div></div>
  <p class="t-xs muted">Dose and dose-plan changes keep their own safeguards (for example, rewriting past doses needs confirmation).</p>
</div>`;

S['PE3-peptide-pause-confirm'] = () => `<div style="height:874px;overflow:hidden;position:relative">${S['PE2-peptide-manage']()}</div><div class="scrim"></div>
<div class="alert"><div class="ab"><div class="t">Pause Tesamorelin?</div><p>It pauses on the day you approve this plan. Upcoming doses and reminders stop until you resume. Your dose history is kept.</p></div>
<div class="act red b">Pause with this plan</div><div class="act">Cancel</div></div>`;

// ---------------- Supplements -----------------
S['SU1-supplements'] = () => `
${statusBar()}${navX('Supplements')}
<div class="content stack">
  ${editorHead('Supplements', 'Supplements in your plan')}
  ${[['Tongkat Ali', '2 capsules · daily morning', 'Active'], ['Electrolytes', '1 serving · training days', 'Active']].map(([n, d]) => `
  <div class="card"><div class="row between"><div><div class="t-body strong">${n}</div><div class="t-sm ink2">${d}</div></div><span class="pill teal">Carry forward</span></div>
    <div class="row" style="gap:8px;margin-top:12px"><div class="btn secondary small grow">Edit</div><div class="btn secondary small grow">Pause</div></div></div>`).join('')}
  <div class="card unav"><div class="row between"><div class="t-body strong">${I.plus} Add a supplement</div>${ctag('Native hidden today')}</div></div>
</div>`;

S['SU2-supplement-edit'] = () => `
${statusBar()}${navX('Tongkat Ali', '<span style="color:var(--muted)">Done</span>', '‹ Supplements')}
<div class="content stack">
  ${editorHead('Supplement', 'Tongkat Ali')}
  <div class="card"><span class="eyebrow">Amount</span>
    <div class="row" style="gap:10px;margin-top:10px"><div class="field err grow"><span class="strong" style="color:var(--red)">two</span></div><div class="field" style="width:130px"><span>capsules</span></div></div>
    <div class="errtxt">${I.warn} Enter a number, like 2 or 0.5.</div></div>
  <div class="card divider-list" style="padding:0 16px">
    <div class="lrow"><div class="l">Schedule</div><div class="r">Daily · Morning ${I.chev}</div></div>
    <div class="lrow"><div class="l">Remind me</div>${sw(true)}</div>
    <div class="lrow"><div class="l">Purpose and role</div><div class="r">Edit ${I.chev}</div></div></div>
</div>`;

// ---------------- Coaching updates -----------------
S['CU1-coaching'] = () => `
${statusBar()}${navX('Coaching Updates')}
<div class="content stack">
  ${editorHead('Coaching updates', 'When you hear from us')}
  <div class="card divider-list" style="padding:0 16px">
    ${[['Midweek check-in', 'Wednesday · 9:00 AM', true], ['Weekly briefing', 'Sunday · 8:00 AM · your check-in', true], ['Monthly review', '1st of the month · 9:00 AM', true]].map(([n, d, on]) => `<div class="lrow"><div class="l">${n}<small>${d}</small></div>${sw(on)}</div>`).join('')}</div>
  <div class="card divider-list" style="padding:0 16px">
    <div class="lrow"><div class="l">Progress photos<small>Every 2 weeks on Saturday · reminder on</small></div>${I.chev}</div>
    <div class="lrow"><div class="l">Next DEXA scan <span class="pill line" style="margin-left:6px">Optional</span><small>Not scheduled</small></div>${I.chev}</div></div>
  <div class="card divider-list" style="padding:0 16px">
    <div class="lrow"><div class="l">Photo Event briefing</div>${sw(true)}</div>
    <div class="lrow"><div class="l">DEXA Event briefing</div>${sw(true)}</div></div>
  <p class="t-xs muted">Briefings notify you when they’re ready. The Monthly day is fixed to the 1st. Daily briefings aren’t available.</p>
</div>`;

S['CU2-photos'] = () => `
${statusBar()}${navX('Progress Photos', 'Done', '‹ Coaching')}
<div class="content stack">
  ${editorHead('Progress photos', 'Photo check-ins')}
  ${bannerB('teal', 'info', 'Suggested while leaning: every 2 weeks', 'Photos help confirm you’re back in range when there’s no DEXA.')}
  <div class="card"><div class="row between"><span class="t-body">Every</span><div class="stepper"><span>−</span><b>2</b><span>+</span></div></div>
    <div class="seg" style="margin-top:12px"><div class="on">Weeks</div><div>Months</div></div>
    <div class="lrow" style="margin-top:6px"><div class="l">Day</div><div class="r">Saturday ${I.chev}</div></div>
    <div class="lrow"><div class="l">Time</div><div class="r">Morning ${I.chev}</div></div>
    <div class="lrow"><div class="l">Remind me</div>${sw(true)}</div></div>
  <div class="ewarn info">${I.cal}<span><b>Next:</b> Sat Oct 17 · Oct 31 · Nov 14</span></div>
</div>`;

S['CU3-dexa'] = () => `
${statusBar()}${navX('Next DEXA Scan', 'Done', '‹ Coaching')}
<div class="content stack">
  ${editorHead('DEXA', 'Schedule a scan (optional)', 'A DEXA gives the most precise answer, but your plan never depends on one.')}
  <div class="card divider-list" style="padding:0 16px">
    <div class="lrow"><div class="l">Date</div><div class="r">Fri, Nov 13 ${I.chev}</div></div>
    <div class="lrow"><div class="l">Time</div><div class="r">7:30 AM ${I.chev}</div></div>
    <div class="lrow"><div class="l">Prep note</div><div class="r">Add ${I.chev}</div></div></div>
  <div class="card divider-list" style="padding:0 16px">
    ${[['1 week before', true], ['1 day before', true], ['Morning of', false], ['Upload results after', true]].map(([n, on]) => `<div class="lrow"><div class="l">${n}</div>${sw(on)}</div>`).join('')}</div>
  <div class="concept"><div class="row between"><span class="t-body strong" style="color:var(--red)">Remove this scan</span>${ctag('Concept · no unschedule today')}</div></div>
</div>`;

// ---------------- Tracking & reminders -----------------
const tracking = (off) => `
${statusBar()}${navX('Tracking & Reminders')}
<div class="content stack">
  ${editorHead('Tracking', 'What keeps your evidence current')}
  ${off ? bannerB('red', 'bell', 'Notifications are off for PhysiqueOS', 'Reminders won’t arrive. Your plan still works; turn them on in iOS Settings.') : ''}
  <div class="card divider-list" style="padding:0 16px">
    <div class="lrow"><div class="l">Morning weigh-in<small>Daily · Morning · completes automatically from weight</small></div>${I.chev}</div></div>
  <div class="sec-label">All reminders in this plan</div>
  <div class="card divider-list" style="padding:0 16px">
    ${[['Morning weigh-in', 'Daily morning', true], ['Foam Rolling', 'Daily 7:15 PM', true], ['Tesamorelin', 'Daily 9:45 PM', true], ['Progress photos', 'Every 2 weeks · Sat', true], ['Tongkat Ali', 'Daily morning', false]].map(([n, d, on]) => `<div class="lrow"><div class="l">${n}<small>${d}</small></div>${sw(on, off)}</div>`).join('')}</div>
  <p class="t-xs muted">Each reminder still belongs to its strategy. This list just puts them in one place.</p>
  ${off ? '<div class="btn secondary">Open iOS Settings</div>' : ''}
</div>`;
S['TR1-tracking'] = () => tracking(false);
S['TR2-notifications-off'] = () => tracking(true);
