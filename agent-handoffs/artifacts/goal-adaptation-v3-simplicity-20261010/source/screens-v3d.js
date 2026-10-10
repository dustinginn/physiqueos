// ---------------------------------------------------------------------------
// v3 addendum: phase-aware briefings. Approved section order is kept; only the
// narrative inside existing sections changes. Middle modules are shown as a
// compact "unchanged" stub so each phone shows the hero and the ending.
// ---------------------------------------------------------------------------
const stub = (names) => `<div class="card soft" style="padding:10px 14px"><div class="t-xs muted">${names} · layout unchanged</div></div>`;
const weeklyHero = (o) => `<div class="card" style="background:linear-gradient(160deg,var(--fieldStart),var(--fieldEnd));border:0">
  <div class="row between"><div><div class="eyebrow" style="color:var(--ink)">Weekly briefing</div><div class="t-xs" style="margin-top:2px">${o.dates}</div></div>${ring(o.conf)}</div>
  <div class="display h2" style="margin-top:6px">${o.headline}</div>
  <p class="t-sm" style="margin-top:6px;opacity:.9">${o.meaning}</p>
  <div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap">${o.chips.map(([k, v]) => `<span class="pill line" style="background:color-mix(in srgb,var(--paper) 70%,transparent)">${k}: ${v}</span>`).join('')}</div></div>`;
const coachTake = (rows, title = 'Coach’s Take') => `<div class="coach"><div class="eyebrow purple">${title}</div><div class="divider-list" style="margin-top:6px">${rows.map(([h, b, mark]) => `<div style="padding:10px 0"><div class="t-sm strong">${h}</div><p class="t-sm ${mark ? '' : 'ink2'}" style="margin-top:3px${mark ? ';background:var(--tealWash);border-radius:8px;padding:4px 6px' : ''}">${b}</p></div>`).join('')}</div></div>`;

S['B0-weekly-before'] = () => `
${statusBar()}${nav('Briefings', 'Weekly Briefing')}
<div class="content stack">
  ${weeklyHero({ dates: 'Oct 18–24', conf: 66, headline: 'Weight moved the wrong way for building', meaning: 'Scale weight fell 0.9 lb, which works against your lean-mass goal.', chips: [['Strategy', 'Leaning phase'], ['Week', '2']] })}
  ${stub('Energy · Weight · Body Composition · Training · Recovery')}
  ${coachTake([['Biggest Takeaway', 'Weight dropped while you’re building muscle. That’s not the direction you want.'], ['What To Do', 'Pause the push to gain more weight until intake is back on plan.']])}
  <div class="ewarn red">${I.warn}<span>Today’s engine judges the week by the goal (build = weight up), so a planned cut reads as a setback.</span></div>
</div>`;

S['B1-weekly-leaning'] = () => `
${statusBar()}${nav('Briefings', 'Weekly Briefing')}
<div class="content stack">
  ${weeklyHero({ dates: 'Oct 18–24', conf: 70, headline: 'Leaning is on track', meaning: 'Weight down 0.9 lb, strength held on 8 of 9 lifts. Exactly what this temporary phase is for.', chips: [['Strategy', 'Leaning (temporary)'], ['Week', '2'], ['Next', 'Calibration check Nov 6']] })}
  ${stub('Energy · Weight · Body Composition · Training · Recovery')}
  ${coachTake([['Biggest Takeaway', 'Fat is coming down and your lifts are holding, so the +7 lb you built is being protected.', 1], ['What To Do', 'Keep training heavy; it’s the signal that keeps lean mass while you eat less.'], ['What To Watch', 'If strength drops on 2+ lifts, we’ll look at the deficit size.'], ['Into Next Week', 'Same plan: −450 a day, 1,767 kcal, activity goal 900.']])}
  <p class="t-xs muted" style="text-align:center">No recommendation this week, so nothing appears below Coach’s Take.</p>
</div>`;

S['B2-monthly-leaning'] = () => `
${statusBar()}${nav('Briefings', 'Monthly Briefing')}
<div class="content stack">
  <div class="row between"><span class="eyebrow">Monthly · October</span><span class="t-xs muted">End of briefing</span></div>
  ${stub('Hero · Goal Milestone · Training · Energy · Recovery · New Baseline · What Changed · Defining Moments')}
  ${coachTake([['Coach’s Take', 'October split in two: three weeks of building that added lean mass, then a deliberate leaning phase to bring body fat back into range. Both moved you toward the same goal.', 1]])}
  <div class="card"><span class="eyebrow">Month Ahead</span>
    <div class="t-body strong" style="margin-top:6px">Finish leaning, then decide how to resume building.</div>
    <p class="t-sm ink2" style="margin-top:4px">Phase forecast: likely 2–4 more weeks. Goal: +7 of 10 lb kept; the new goal date is set when you resume.</p>
    <div class="divider-list" style="margin-top:8px">${[['Energy', 'Hold −450 a day; a calibration check comes on Nov 6.'], ['Training', 'Keep loads; protect strength.'], ['Recovery', 'Sleep 7 h+ helps you hold strength in a deficit.']].map(([k, v]) => `<div class="lrow"><div class="l">${k}<small>${v}</small></div></div>`).join('')}</div></div>
</div>`;

S['B3-dexa-phase-complete'] = () => `
${statusBar()}${nav('Briefings', 'DEXA Analysis')}
<div class="content stack">
  <div class="card" style="background:linear-gradient(160deg,var(--fieldStart),var(--fieldEnd));border:0">
    <div class="eyebrow" style="color:var(--ink)">DEXA event briefing · Nov 20*</div>
    <div class="display h2" style="margin-top:6px">Back in your 8–9% range</div>
    <p class="t-sm" style="margin-top:6px;opacity:.9">Your leaning phase did its job: fat down, lean mass close to where it was.</p></div>
  <div class="card"><span class="eyebrow">Since starting the leaning phase</span>
    <div class="kv"><span class="k">Body fat</span><span class="delta"><s>9.7%</s><span class="v">8.7%*</span></span></div>
    <div class="kv"><span class="k">Fat mass</span><span class="v" style="color:var(--green)">−3.1 lb*</span></div>
    <div class="kv"><span class="k">Lean mass</span><span class="v">−0.4 lb*</span></div>
    <p class="t-xs muted">Lean mass is muscle plus water and other non-fat tissue. A small drop after a cut is often water and stored carbs.</p></div>
  ${coachTake([['Biggest Win', 'Body fat is back in range, and the lean mass you built is largely intact.', 1], ['Protect', 'Your strength held through the cut, which is the best sign the muscle is still there.'], ['Next', 'Start building again slowly so body fat stays in range.']], 'Coach’s Insight')}
  <div class="card rail amber" style="padding-top:16px;padding-bottom:16px">
    <div class="eyebrow amber">Phase decision</div>
    <div class="display h3" style="margin-top:6px">Your leaning phase is complete</div>
    <p class="t-sm ink2" style="margin-top:6px">Choose when and how to start building again. Nothing restarts on its own.</p>
    <div class="row" style="margin-top:12px;gap:10px"><div class="btn primary small grow">Choose what’s next</div><div class="btn secondary small" style="width:104px">Not now</div></div></div>
</div>`;

S['B4-midweek-leaning'] = () => `
${statusBar()}${nav('Briefings', 'Midweek Briefing')}
<div class="content stack">
  <div class="card" style="background:linear-gradient(160deg,var(--fieldStart),var(--fieldEnd));border:0">
    <div class="eyebrow" style="color:var(--ink)">Midweek briefing · Oct 25–27</div>
    <div class="display h3" style="margin-top:6px">Leaning is moving as planned so far</div>
    <span class="pill line" style="margin-top:10px;display:inline-flex;background:color-mix(in srgb,var(--paper) 70%,transparent)">Goal & Phase: Build Lean Mass · Leaning (temporary)</span></div>
  ${stub('Energy · Weight · Body Composition · Training')}
  ${coachTake([['Biggest Takeaway', 'Intake and activity are on plan through Tuesday.'], ['What To Do', 'Keep the same plan through Sunday.']])}
  <p class="t-xs muted" style="text-align:center">Midweek never suggests changes. If a decision is already open, it links to it.</p>
</div>`;

S['B5-photo-leaning'] = () => `
${statusBar()}${nav('Briefings', 'Photo Event')}
<div class="content stack">
  <div class="row between"><span class="eyebrow">Photo event · Oct 31</span><span class="t-xs muted">End of briefing</span></div>
  ${stub('Hero · This Photo Session · What Visibly Changed · Interpretation')}
  ${coachTake([['Coach’s Insight', 'Your waist looks a little leaner than two weeks ago, consistent with the leaning phase. Photos support the trend but don’t measure body fat, so your next scan or weigh-in trend decides when the phase is done.', 1]], 'Coach’s Insight')}
  <p class="t-xs muted" style="text-align:center">Photos alone never trigger a recommendation.</p>
</div>`;
