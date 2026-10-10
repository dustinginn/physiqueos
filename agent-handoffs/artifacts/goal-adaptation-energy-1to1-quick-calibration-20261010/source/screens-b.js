// ---------------------------------------------------------------------------
// Screens part B: the energy balance experience (interactive), 1:1 accounting.
// E0 is a one-time intro; step 1 picks the daily balance; step 2 splits it
// between eating and moving. Added activity counts in full.
// ---------------------------------------------------------------------------
const zoneTrack = () => `<div class="track">
  <div class="z" style="left:0;width:8%;background:var(--redWash)"></div>
  <div class="z" style="left:8%;width:32%;background:var(--tealWash)"></div>
  <div class="z" style="left:56%;width:4%;background:color-mix(in srgb,var(--ink) 8%,transparent)"></div>
  <div class="z" style="left:60%;width:20%;background:color-mix(in srgb,var(--purple) 12%,transparent)"></div>
  <div class="fill" data-e="netfill" style="left:24%;width:36%"></div>
</div>`;

const energyStep1 = (opts = {}) => `
${statusBar()}${navX('Daily Energy', 'Next', opts.back || 'Cancel')}
<div class="content stack">
  <div><span class="eyebrow amber">Step 1 of 2 · Daily balance</span>
  <div class="display h2" style="margin-top:6px">How big a daily ${opts.surplus ? 'surplus' : 'deficit'}?</div></div>
  <div class="card">
    <div class="row between"><span class="pill amber" data-e="zone">Moderate deficit</span><span class="t-xs muted">${opts.surplus ? 'Suggested +200' : 'Suggested −450'}</span></div>
    <div class="bigval" style="margin-top:12px"><span data-e="net">−450 kcal/day</span></div>
    <div class="t-xs muted" style="margin-top:4px">Likely real balance <span data-e="netrange">−591 to −310</span></div>
    <div class="rng" style="margin-top:6px">${zoneTrack()}<input type="range" aria-label="Daily energy balance in kilocalories" data-in="net" min="-750" max="500" step="25" value="${opts.net ?? -450}"></div>
    <div class="ticks"><span>−750</span><span>−450</span><span>0</span><span>+250</span><span>+500</span></div>
    <input type="hidden" data-in="added" value="${opts.added ?? 100}">
    <div class="row" style="justify-content:center;gap:10px;margin-top:10px"><div class="mini-step"><span data-step="net:-25" role="button" tabindex="0" aria-label="Decrease balance by 25">−25</span><span data-step="net:25" role="button" tabindex="0" aria-label="Increase balance by 25">+25</span></div><span class="t-sm semi" data-preset="suggested" role="button" tabindex="0" style="color:var(--teal);display:inline-flex;gap:6px;align-items:center;cursor:pointer">${I.reset} Reset</span></div>
  </div>
  <div class="band">
    <div><span>Expected change</span><b data-e="rate">≈ 0.7–1.3 lb/week loss</b></div>
    <div><span>${opts.surplus ? 'Phase' : 'Leaning phase'}</span><b data-e="weeks">2–5 weeks</b></div>
  </div>
  <div class="ewarn info">${I.info}<span>Ranges come from your calibrated maintenance, ≈ <b>2,117 kcal</b> (1,977–2,258) with your usual activity. Your weigh-in trend narrows them at each check-in.</span></div>
  ${opts.surplus ? '<div class="ewarn amber">' + I.warn + '<span>Maintenance is only known to about ±140 kcal, so a small surplus can mean anything from barely gaining to about 1 lb a week. The 4-week checkpoint tightens this.</span></div>' : ''}
  <div class="btn primary">Next: how you’ll get there ${I.arrow}</div>
</div>`;
S['E1-balance'] = () => energyStep1();
S['E7-surplus'] = () => energyStep1({ surplus: true, net: 200, added: 0, back: 'Keep Building', id: 'e7' });

const numIn = (key, label, val, id) => `<label class="numin"><span class="sr">${label}</span><input type="number" inputmode="numeric" data-in="${key}" value="${val}" aria-label="${label}"></label>`;
const allocation = (opts = {}) => `
${statusBar()}${navX('Daily Energy', 'Done', '‹ Balance')}
<div class="content stack">
  <div><span class="eyebrow amber">Step 2 of 2 · Eat and move</span>
  <div class="display h2" style="margin-top:6px">Split your <span data-e="net">−450 kcal/day</span></div></div>
  <input type="hidden" data-in="net" value="${opts.net ?? -450}">
  <div class="chips" role="radiogroup" aria-label="Ways to split the balance">
    ${Object.entries(PRESETS).map(([k, p]) => `<span class="chip" role="radio" tabindex="0" data-preset="${k}">${k === 'suggested' ? '★ ' : ''}${p.label}</span>`).join('')}
  </div>
  <div class="card">
    <div class="alloc"><div><div class="t-sm ink2">Eat</div><div class="bigval" style="font-size:1.6em"><span data-e="intake">1,767</span><small>kcal/day</small></div></div>${numIn('intakeNum', 'Type an exact daily intake', 1767, `in-${opts.id || 'e2'}`)}</div>
    <div class="t-xs muted" data-e="intakeDelta">−733 vs today’s plan</div>
    <div class="rng"><div class="track"><div class="z" style="left:0;width:2%;background:var(--redWash)"></div></div><input type="range" aria-label="Daily intake in kilocalories" data-in="intake" min="1600" max="2617" step="1" value="1767"></div>
    <div class="ticks"><span>1,600 floor*</span><span>2,117 maintenance</span><span>2,617</span></div>
    <div class="rule"></div>
    <div class="alloc"><div><div class="t-sm ink2">Move more than usual</div><div class="bigval" style="font-size:1.6em;color:var(--purple)"><span data-e="added">+100</span><small>kcal/day</small></div></div>${numIn('addedNum', 'Type exact added activity', opts.added ?? 100, `ad-${opts.id || 'e2'}`)}</div>
    <div class="t-xs muted" data-e="steps">≈ 2,200 extra steps a day</div>
    <div class="rng purple"><div class="track"></div><input type="range" aria-label="Added activity above your usual in kilocalories" data-in="added" min="0" max="500" step="1" value="${opts.added ?? 100}"></div>
    <div class="row between"><div class="ticks grow" style="margin-right:10px"><span>0 · usual only</span><span>+250</span><span>+500*</span></div><div class="mini-step"><span data-step="added:-25" role="button" tabindex="0" aria-label="Less added activity by 25">−25</span><span data-step="added:25" role="button" tabindex="0" aria-label="More added activity by 25">+25</span></div></div>
  </div>
  <div class="ewarn ok" style="margin-top:0">${I.check}<span>Eat = maintenance + balance + added activity<br><span data-e="formula">2,117 − 450 + 100 = <b>1,767</b></span></span></div>
  <div data-e="warnings"></div>
  <div class="card soft">
    <div class="row between"><span class="eyebrow">Your targets</span><span class="t-xs muted">Balance stays <span data-e="netShort">−450</span></span></div>
    <div class="kv"><span class="k">Eat each day</span><span class="v"><span data-e="intake">1,767</span> kcal</span></div>
    <div class="kv"><span class="k">Apple Watch active energy</span><span class="v"><span data-e="activityGoal">900</span> kcal/day</span></div>
    <div class="kv"><span class="k">Per week</span><span class="v"><span data-e="weekIntake">12,369</span> eaten · +<span data-e="weekAdded">700</span> moved</span></div>
    <div class="kv"><span class="k">Weekly balance</span><span class="v"><span data-e="weekNet">−3,150</span> kcal</span></div>
    <p class="t-xs muted" style="margin-top:6px">Your usual ≈ 800 kcal is already inside maintenance, so it’s never counted twice. The Watch goal is usual + added.</p>
  </div>
  <div class="row between"><span class="t-sm semi" data-preset="suggested" role="button" tabindex="0" style="color:var(--teal);display:inline-flex;gap:6px;align-items:center;cursor:pointer">${I.reset} Reset to suggested</span><span class="t-sm semi" style="color:var(--teal)">Why these numbers?</span></div>
  <p class="t-xs muted">* Provisional floor and cap, for Founder review.</p>
</div>`;
S['E2-allocation'] = () => allocation();
S['E4-floor'] = () => allocation({ net: -750, added: 0, id: 'e4' });
S['E5-activity-heavy'] = () => allocation({ added: 500, id: 'e5' });
S['E10-allocation-xl'] = () => allocation({ id: 'e10' });

S['E0-intro'] = () => `<div style="height:874px;overflow:hidden;position:relative">${S['P1-leaning-setup']()}</div><div class="scrim"></div>
<div class="sheet">
  <div class="grabber"></div>
  <span class="eyebrow amber">Before you set your energy</span>
  <div class="display h2" style="margin-top:6px">Your targets are a starting point</div>
  <div class="stack-sm" style="margin-top:12px">
    <p class="t-body ink2">Food logs and wearables both have margins of error. That’s normal.</p>
    <p class="t-body ink2">Consistent targets help us see how your body actually responds.</p>
    <p class="t-body ink2">PhysiqueOS then recalibrates from your weight and body-composition trends, and suggests small adjustments in your briefings.</p>
  </div>
  <div class="btn primary" style="margin-top:18px">Continue</div>
  <p class="t-xs muted" style="text-align:center;margin-top:10px">Shown once. “Why these numbers?” on the energy screens has the details.</p>
</div>`;

S['E3-numeric'] = () => `<div style="height:874px;overflow:hidden;position:relative">${allocation({ id: 'e3bg' })}</div><div class="scrim"></div>
<div class="sheet" style="padding-bottom:300px">
  <div class="grabber"></div>
  <div class="row between"><span class="t-body muted">Cancel</span><span class="t-body strong">Daily intake</span><span class="t-body strong" style="color:var(--teal)">Set</span></div>
  <div class="field focus" style="margin-top:16px;font-size:1.3em"><span class="strong">1,800</span><span class="t-sm muted">kcal/day</span></div>
  <div class="divider-list" style="margin-top:10px">
    <div class="choice">${radio(true)}<div class="grow"><div class="t-body strong">Keep the −450 balance</div><div class="t-sm ink2">Added activity becomes +133 kcal/day (1,800 = 2,117 − 450 + 133)</div></div></div>
    <div class="choice">${radio(false)}<div class="grow"><div class="t-body strong">Change the balance instead</div><div class="t-sm ink2">Balance becomes −417 (activity stays +100); leaning ≈ 2–6 weeks</div></div></div>
  </div>
  <p class="t-xs muted">Targets aren’t rounded, so the balance you chose is kept exactly.</p>
</div>
<div class="kbd">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k) => `<div>${k}</div>`).join('')}</div>`;

S['E6-weekly'] = () => `
${statusBar()}${navX('This Week', 'Done', '‹ Energy')}
<div class="content stack">
  <div class="display h2">Your week at −450 a day</div>
  <div class="week">
    ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => { const walk = [0, 2, 5].includes(i); const train = [0, 1, 3, 4, 5].includes(i); return `<div class="${walk ? 'on' : ''} ${train ? 'train' : ''}"><span class="muted">${d}</span><b>1,767</b><span class="muted">eat</span>${walk ? '<span class="dot"></span><span style="color:var(--purple);font-weight:700">+233</span>' : '<span class="muted">—</span>'}</div>`; }).join('')}
  </div>
  <div class="row" style="gap:14px;flex-wrap:wrap"><span class="t-xs row" style="gap:6px"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--purple)"></span>Added walk</span><span class="t-xs row" style="gap:6px"><span style="width:14px;height:3px;background:var(--teal);display:inline-block;border-radius:2px"></span>Training day</span></div>
  <div class="card">
    <div class="kv"><span class="k">Eat this week</span><span class="v">12,369 kcal</span></div>
    <div class="kv"><span class="k">Added activity</span><span class="v">≈ 700 kcal · 3 brisk 45-min walks</span></div>
    <div class="kv"><span class="k">Weekly balance</span><span class="v">≈ −3,150 kcal</span></div>
  </div>
  <p class="t-xs muted">Daily intake is the same every day; added activity is planned as 3 × ≈233 = ≈700 a week, the same as +100 a day.</p>
  <div class="card"><span class="eyebrow">Spread</span>
    <div class="divider-list" style="margin-top:4px">
      <div class="choice">${radio(true)}<div class="grow"><div class="t-body strong">Same intake every day</div><div class="t-sm ink2">Simplest to follow and to judge</div></div></div>
      <div class="choice unav">${radio(false)}<div class="grow"><div class="row between"><span class="t-body strong">More on training days</span>${ctag()}</div><div class="t-sm ink2">e.g. 1,900 on training days, 1,435 on rest days. Same weekly total.</div></div></div>
    </div></div>
  <p class="t-xs muted">Missed a walk? Your weekly balance matters more than any single day. Briefings judge the week, not the day.</p>
</div>`;

S['E8-no-calibration'] = () => `
${statusBar()}${navX('Daily Energy', 'Done')}
<div class="content stack">
  <div class="display h2">We can’t size this yet</div>
  ${bannerB('amber', 'info', 'Not enough logged intake between measurements', 'Calibration needs about 3 weeks with 70% of days logged between two weigh-in trends or scans. You have 9 of 28 days logged.')}
  <div class="card"><span class="eyebrow">Choose for now</span>
    <div class="divider-list" style="margin-top:4px">
      <div class="choice">${radio(true)}<div class="grow"><div class="t-body strong">Keep 2,500 kcal and 800 activity</div><div class="t-sm ink2">Log for 3 weeks; we’ll suggest a calibrated plan at the checkpoint</div></div></div>
      <div class="choice">${radio(false)}<div class="grow"><div class="t-body strong">Set my own numbers</div><div class="t-sm ink2">Shown as “not calibrated” until evidence supports them</div>
        <div class="row between" style="margin-top:10px"><span class="t-sm ink2">Eat</span><span class="numbox">2,200 ${I.pencil}</span></div>
        <div class="row between" style="margin-top:8px"><span class="t-sm ink2">Activity goal</span><span class="numbox">850 ${I.pencil}</span></div></div></div>
    </div></div>
  <p class="t-xs muted">No deficit size, weekly rate or phase length is shown until calibration. We won’t guess.</p>
</div>`;

S['E9-baseline-explainer'] = () => `<div style="height:874px;overflow:hidden;position:relative">${allocation({ id: 'e9bg' })}</div><div class="scrim"></div>
<div class="sheet">
  <div class="grabber"></div>
  <div class="display h2">How your energy adds up</div>
  <p class="t-sm ink2" style="margin-top:6px">Measured from what you logged and how your body changed, not from a formula.</p>
  <div class="sec-label">What you burn ≈ 2,117 + 100 = 2,217</div>
  <div class="ebar"><div class="base" style="flex:1317">Body at rest ≈ 1,317</div><div class="base" style="flex:800;filter:saturate(.6)">Usual 800</div><div class="add" style="flex:100">+100</div></div>
  <div class="sec-label">What you eat</div>
  <div class="ebar"><div class="eat" style="flex:1767">1,767</div><div class="gap" style="flex:450">−450</div></div>
  <div class="divider-list" style="margin-top:12px">
    <div class="lrow"><div class="l">Usual activity<small>Your Apple Watch average (~800, workouts included) is already part of maintenance. It isn’t added again.</small></div></div>
    <div class="lrow"><div class="l">Added activity<small>Counts 1:1. Every extra 100 kcal you move lets you eat 100 more at the same balance.</small></div></div>
    <div class="lrow"><div class="l">If estimates are off<small>Logs and wearables have margins of error. Your weight and body-composition trend shows the real result, and Quick Calibration adjusts your targets.</small></div></div>
  </div>
</div>`;
