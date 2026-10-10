// ---------------------------------------------------------------------------
// Screens part E: Quick Calibration, a lightweight briefing-native adjustment.
// The recommendation lives at the very bottom of the briefing, after Coach's
// Take / Coach's Insight (approved placement). No new briefing sections.
// ---------------------------------------------------------------------------
const briefingTop = (kind, period, take) => `
${statusBar()}${nav('Home', `${kind} Briefing`)}
<div class="content stack">
  <div class="row between"><span class="eyebrow">${kind} · ${period}</span><span class="t-xs muted">Scrolled to the end</span></div>
  <div class="coach"><span class="eyebrow purple">Coach’s Take</span>
    ${take.map(([h, b]) => `<div style="margin-top:10px"><div class="t-sm strong">${h}</div><p class="t-sm ink2" style="margin-top:3px">${b}</p></div>`).join('')}
  </div>`;
const founderTake = [
  ['Biggest Takeaway', 'Four weeks in, you’ve logged 27 of 28 days and hit your 900 kcal activity goal most days. Weight has barely moved: about −0.2 lb a week.'],
  ['What To Do', 'Keep training the same; strength held, which is what protects lean mass.'],
  ['Into Next Week', 'Keep logging the way you have. It’s what makes the adjustment below reliable.'],
];
const qcCard = (opts = {}) => `
  <div class="card ${opts.applied ? '' : 'selected'}" ${opts.applied ? 'style="border:1.5px solid var(--green)"' : ''}>
    <div class="row between"><span class="eyebrow ${opts.applied ? '' : 'amber'}" ${opts.applied ? 'style="color:var(--green)"' : ''}>${opts.applied ? 'Plan updated' : 'Quick calibration'}</span>${opts.applied ? `<span class="t-xs muted">${opts.applied}</span>` : `<span class="pill teal">${I.check} Checked 9:41 AM</span>`}</div>
    <div class="display h3" style="margin-top:8px">${opts.title || 'Eat a little less to restore your deficit'}</div>
    <div class="row" style="gap:10px;margin-top:10px;align-items:baseline"><span class="was t-lg">${opts.from || '1,767'}</span><span class="t-lg">→</span><span class="bigval" style="font-size:1.7em">${opts.to || '1,617'}</span><span class="t-sm ink2">kcal/day</span><span class="pill ${opts.deltaTone || 'amber'}" style="margin-left:auto">${opts.delta || '−150'}</span></div>
    <p class="t-sm ink2" style="margin-top:8px">${opts.why || 'Your results suggest maintenance is nearer 1,967 than 2,117. This brings you back to about −450 a day. Everything else stays the same.'}</p>
    ${opts.applied ? `<div class="row between" style="margin-top:12px"><span class="t-sm semi" style="color:var(--teal)">View change</span><span class="t-sm semi" style="color:var(--teal)">${opts.undo === false ? '' : 'Undo'}</span></div>` : `
    <div class="row" style="gap:8px;margin-top:14px"><div class="btn primary grow">${opts.accept || 'Accept −150'}</div></div>
    <div class="row between" style="margin-top:6px"><div class="btn ghost" style="padding:0">Choose another amount</div><span class="t-sm semi" style="color:var(--teal)">Why?</span></div>`}
  </div>`;

S['QC1-briefing-proposal'] = () => `${briefingTop('Weekly', 'Nov 1–7', founderTake)}
  ${qcCard()}
  <p class="t-xs muted" style="text-align:center">Updates only your daily intake. Activity, training and routines stay as they are.</p>
</div>`;

S['QC2-why'] = () => `<div style="height:874px;overflow:hidden;position:relative">${S['QC1-briefing-proposal']()}</div><div class="scrim"></div>
<div class="sheet">
  <div class="grabber"></div>
  <div class="display h2">Why this adjustment</div>
  <div class="divider-list" style="margin-top:10px">
    <div class="kv"><span class="k">Logging</span><span class="v">27 of 28 days · avg 1,771 kcal</span></div>
    <div class="kv"><span class="k">Activity</span><span class="v">avg 905 of 900 kcal goal</span></div>
    <div class="kv"><span class="k">Weigh-ins</span><span class="v">26 · trend −0.2 lb/week</span></div>
    <div class="kv"><span class="k">Expected</span><span class="v">−0.7 to −1.3 lb/week</span></div>
    <div class="kv"><span class="k">Maintenance estimate</span><span class="delta"><s>2,117</s><span class="v">≈ 1,967 (1,860–2,060)</span></span></div>
  </div>
  <p class="t-sm ink2" style="margin-top:10px">You followed the plan, so the gap is in the estimate, not in you. We adjust in small steps, then watch for 3 weeks before suggesting anything else.</p>
</div>`;

S['QC3-choose-amount'] = () => `<div style="height:874px;overflow:hidden;position:relative">${S['QC1-briefing-proposal']()}</div><div class="scrim"></div>
<div class="sheet" data-qc>
  <div class="grabber"></div>
  <div class="row between"><span class="t-body muted">Cancel</span><span class="t-body strong">Choose an amount</span><span style="width:52px"></span></div>
  <div class="row between" style="margin-top:16px"><div><div class="t-sm ink2">Change</div><div class="bigval" style="font-size:1.6em" data-qe="delta">−150 kcal/day</div></div>
    <div class="mini-step"><span data-qstep="-25" role="button" tabindex="0" aria-label="25 less">−25</span><span data-qstep="25" role="button" tabindex="0" aria-label="25 more">+25</span></div></div>
  <div class="rng amber"><div class="track"></div><input type="range" aria-label="Change to daily intake in kilocalories" data-q="delta" min="-400" max="200" step="1" value="${QC.recommended}"></div>
  <div class="ticks"><span>−400</span><span>−150 ★</span><span>0</span><span>+200</span></div>
  <div class="row between" style="margin-top:10px"><span class="t-sm ink2">New daily intake</span><label class="numin"><span class="sr">New daily intake</span><input type="number" inputmode="numeric" data-q="deltaNum" value="1617" aria-label="New daily intake in kilocalories"></label></div>
  <div class="card soft" style="margin-top:12px;padding:10px 14px">
    <div class="kv"><span class="k">Per week</span><span class="v"><span data-qe="week">11,319</span> kcal (<span data-qe="weekDelta">−1,050</span>)</span></div>
    <div class="kv"><span class="k">Expected daily balance</span><span class="v"><span data-qe="net">−450</span> kcal</span></div>
    <div class="kv"><span class="k">Unchanged</span><span class="v t-sm" style="font-weight:600">Activity goal 900 · training · routines</span></div>
  </div>
  <div data-qe="msgs"></div>
  <div class="row" style="gap:8px;margin-top:12px"><span class="chip" data-qset="-150" role="button" tabindex="0">★ −150</span><span class="chip" data-qset="-100" role="button" tabindex="0">−100</span><span class="chip" data-qset="-200" role="button" tabindex="0">−200</span><span class="chip" data-qset="0" role="button" tabindex="0">No change</span></div>
  <div class="btn primary" data-qe="apply" style="margin-top:12px">Apply 1,617 kcal</div>
</div>`;

S['QC4-choose-invalid'] = () => S['QC3-choose-amount']().replace(`value="${QC.recommended}"`, 'value="-350"');

S['QC5-applied'] = () => `${briefingTop('Weekly', 'Nov 1–7', founderTake)}
  ${qcCard({ applied: 'Nov 8 · 9:43 AM', why: 'Your daily intake is now 1,617 from today. Activity goal, training and routines are unchanged. We’ll watch for 3 weeks before suggesting anything else.' })}
  <div class="toast" style="position:static;margin-top:4px">${I.check}<span>Plan updated · 1,617 kcal/day from today</span><span style="margin-left:auto;color:var(--teal);font-weight:800">Undo</span></div>
</div>`;

S['QC6-already-applied'] = () => `${briefingTop('Weekly', 'Nov 1–7', founderTake)}
  ${qcCard({ applied: 'Applied Nov 8 on iPhone', undo: false, why: 'This adjustment was already applied. Tapping Accept again does nothing; your plan changed once.' })}
  <div class="ewarn info">${I.info}<span>Undo was available until your next log against the new target. It’s in your plan history if you want to go back.</span></div>
</div>`;

S['QC7-stale'] = () => `${briefingTop('Weekly', 'Nov 1–7', founderTake)}
  <div class="card" style="border:1.5px solid var(--amber)">
    <div class="row between"><span class="eyebrow amber">Quick calibration</span><span class="pill amber">${I.sync} Refreshed</span></div>
    <div class="display h3" style="margin-top:8px">This suggestion was updated</div>
    <p class="t-sm ink2" style="margin-top:6px">Your energy plan changed on Nov 9 (activity goal raised to 1,000). We rechecked: the suggestion is now <b>1,767 → 1,667 (−100)</b>.</p>
    <div class="row" style="gap:8px;margin-top:12px"><div class="btn primary grow">Accept −100</div></div>
    <div class="btn ghost" style="padding:0;margin-top:4px">Choose another amount</div>
  </div>
  <p class="t-xs muted" style="text-align:center">Rechecked when you open the briefing and again when you tap Accept.</p>
</div>`;

S['QC8-escalate'] = () => `${briefingTop('Monthly', 'October', [['Biggest Takeaway', 'Body fat came down, but slower than planned, and the leaning phase is now likely to run past its 6-week limit.'], ['Month Ahead', 'Two things are linked: how much to eat, and when the phase should end.']])}
  <div class="card selected">
    <div class="row between"><span class="eyebrow amber">Needs a plan review</span><span class="pill line">2 changes</span></div>
    <div class="display h3" style="margin-top:8px">Adjust intake and the phase end together</div>
    <p class="t-sm ink2" style="margin-top:6px">A quick change isn’t enough: the phase’s time limit is affected too. Review both in your plan, with everything else carried forward.</p>
    <div class="btn primary" style="margin-top:12px">Review my plan ${I.arrow}</div>
  </div>
  <p class="t-xs muted" style="text-align:center">Opens Your Plan with both changes pre-filled. Nothing changes until you approve.</p>
</div>`;

S['QC9-history'] = () => `
${statusBar()}${nav('Energy', 'Plan History')}
<div class="content stack">
  <div class="display h2">Daily energy history</div>
  <div class="card divider-list" style="padding:0 16px">
    ${[['Version 3 · current', 'Nov 8 · Quick calibration from Weekly Nov 1–7', '1,767 → 1,617 kcal · activity 900 unchanged', true],
       ['Version 2', 'Oct 9 · Leaning phase approved', '2,500 → 1,767 kcal · activity 800 → 900', false],
       ['Version 1', 'Aug 15 · Lean Mass Build', '2,500 kcal · activity 800', false]].map(([v, src, chg, cur]) => `
    <div class="lrow" style="align-items:flex-start;padding:12px 0"><div class="l"><b>${v}</b><small>${src}</small><small style="color:var(--ink)">${chg}</small></div>${cur ? '<span class="pill teal">Active</span>' : ''}</div>`).join('')}
  </div>
  <div class="btn secondary">Go back to version 2</div>
  <p class="t-xs muted">Going back creates version 4 with version 2’s targets. Nothing is deleted, and each version keeps the briefing that suggested it.</p>
</div>`;

S['QC10-observing'] = () => `
${statusBar()}${nav('Your Plan', 'Daily Energy')}
<div class="content stack">
  <div class="card" style="background:linear-gradient(160deg,var(--fieldStart),var(--fieldEnd));border:0">
    <span class="eyebrow" style="color:var(--ink)">Daily energy · leaning phase</span>
    <div class="bigval" style="margin-top:8px">1,617<small>kcal/day</small></div>
    <div class="t-sm" style="margin-top:6px">Activity goal 900 · target −450/day</div></div>
  <div class="card"><div class="row between"><span class="eyebrow">Observing</span><span class="pill line">Since Nov 8</span></div>
    <p class="t-sm ink2" style="margin-top:6px">We’re giving the new target 3 weeks before suggesting another adjustment. Earliest next suggestion: Weekly of Nov 29.</p>
    <div class="bar" style="margin-top:10px"><i style="width:28%"></i></div></div>
  <div class="card" style="padding:12px 16px"><div class="row between"><div class="t-body strong">Plan history</div>${I.chev}</div></div>
  <p class="t-xs muted">Safety checks still run every week. A fast drop or a scan can open a review sooner.</p>
</div>`;

S['QC11-no-proposal'] = () => `${briefingTop('Weekly', 'Oct 18–24', [['Biggest Takeaway', 'Two weeks into leaning. You logged 4 of 7 days this week, so the trend isn’t clear yet.'], ['What To Do', 'Log every day this week, including weekends. That’s what lets us tune your targets.'], ['Into Next Week', 'Same plan: 1,767 kcal and your 900 kcal activity goal.']])}
  <div class="ewarn info">${I.info}<span>Design note: with too little evidence there is no recommendation card at all. Coaching stays in Coach’s Take; there is no “too early” screen.</span></div>
</div>`;

S['QC12-midweek'] = () => `
${statusBar()}${nav('Home', 'Midweek Check-in')}
<div class="content stack">
  <div class="row between"><span class="eyebrow">Midweek · Nov 8–10</span><span class="t-xs muted">Scrolled to the end</span></div>
  <div class="coach"><span class="eyebrow purple">Coach’s Insight</span><p class="t-sm ink2" style="margin-top:8px">Logging is on track this week. Keep the same plan through Sunday.</p></div>
  <div class="card" style="padding:12px 16px"><div class="row between"><div><div class="t-sm strong">You have a plan suggestion</div><div class="t-xs muted">From your Weekly, Nov 1–7</div></div>${I.chev}</div></div>
  <p class="t-xs muted" style="text-align:center">Midweek never makes new suggestions. It only links to one that’s still open.</p>
</div>`;

const altCard = (kind, period, eyebrow, title, from, to, delta, tone, why, accept) => `
${statusBar()}${nav('Home', `${kind} Briefing`)}
<div class="content stack">
  <div class="row between"><span class="eyebrow">${kind} · ${period}</span><span class="t-xs muted">Scrolled to the end</span></div>
  <div class="coach"><span class="eyebrow purple">${kind === 'Monthly' ? 'Coach’s Take · Month Ahead' : 'Coach’s Take'}</span><p class="t-sm ink2" style="margin-top:8px">${why}</p></div>
  ${qcCard({ title, from, to, delta, deltaTone: tone, why: eyebrow, accept })}
</div>`;
S['QC13-alt-cut'] = () => altCard('Weekly', 'example', 'Fat loss stalled for 3 weeks with logging on plan. Activity and training stay the same.', 'Eat a little less to restart fat loss', '2,200', '2,000', '−200', 'amber', 'Three weeks of steady logging, but your waist and weight trend haven’t moved.', 'Accept −200');
S['QC14-alt-mass'] = () => altCard('Monthly', 'example', 'Gaining slower than planned for a month, with logging on plan. Training stays the same.', 'Eat a little more to keep building', '2,600', '2,750', '+150', 'teal', 'Lean mass is up, but more slowly than planned. Strength keeps climbing.', 'Accept +150');
S['QC15-alt-maintenance'] = () => altCard('Weekly', 'example', 'Weight drifting up about 0.4 lb a week for 3 weeks, inside your range so far.', 'Ease intake back to hold steady', '2,400', '2,300', '−100', 'amber', 'You’re inside your maintenance range, but trending toward the top.', 'Accept −100');
S['QC16-alt-strength'] = () => `
${statusBar()}${nav('Home', 'Weekly Briefing')}
<div class="content stack">
  <div class="row between"><span class="eyebrow">Weekly · example</span><span class="t-xs muted">Scrolled to the end</span></div>
  <div class="coach"><span class="eyebrow purple">Coach’s Take</span><p class="t-sm ink2" style="margin-top:8px">Your bench and squat have stalled for 3 weeks while sleep has dipped.</p></div>
  <div class="card selected"><div class="row between"><span class="eyebrow amber">Quick calibration</span><span class="pill teal">${I.check} Checked</span></div>
    <div class="display h3" style="margin-top:8px">Progress more conservatively for now</div>
    <div class="row" style="gap:10px;margin-top:10px;align-items:baseline"><span class="was t-lg">Moderate</span><span class="t-lg">→</span><span class="t-lg strong">Conservative</span></div>
    <p class="t-sm ink2" style="margin-top:8px">Changes only your progression pace. Sessions, focus and energy stay the same.</p>
    <div class="btn primary" style="margin-top:12px">Accept</div><div class="btn ghost" style="padding:0">Not now</div></div>
</div>`;
