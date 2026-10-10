// ---------------------------------------------------------------------------
// v3 addendum (9e1d6207): Home, Goals and briefings across the temporary
// leaning phase. Home reuses the existing HomeJourneyFieldView slots only
// (headline, timeline line, support line, confidence ring, 4 metrics, phase
// rows, guardrail box). Values marked * are illustrative.
// ---------------------------------------------------------------------------
const ring = (pct, label = 'Goal') => `<svg width="96" height="96" viewBox="0 0 96 96" aria-label="${label} confidence ${pct} percent"><circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="9"/><circle cx="48" cy="48" r="40" fill="none" stroke="var(--green)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(pct / 100) * 251} 251" transform="rotate(-90 48 48)"/><text x="48" y="50" text-anchor="middle" font-size="20" font-weight="800" fill="currentColor">${pct}%</text><text x="48" y="66" text-anchor="middle" font-size="8.5" font-weight="700" fill="currentColor" opacity=".75">${label.toUpperCase()}</text></svg>`;
const metric = (k, v) => `<div style="border-top:1px solid rgba(255,255,255,.22);padding-top:6px"><div style="font-size:.5625em;font-weight:800;letter-spacing:.1em;opacity:.8">${k}</div><div style="font-size:.875em;font-weight:800;margin-top:3px;line-height:1.2">${v}</div></div>`;
const phaseRow = (tone, label, name, detail, extra = '') => `<div class="row" style="align-items:flex-start;gap:12px;position:relative;z-index:1"><span style="width:24px;height:24px;border-radius:50%;background:${tone === 'green' ? 'rgba(85,227,154,.25)' : tone === 'amber' ? 'rgba(244,188,72,.25)' : 'rgba(255,255,255,.14)'};display:grid;place-items:center;flex:none"><i style="width:12px;height:12px;border-radius:50%;background:${tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : 'transparent'};border:${tone === 'hollow' ? '2px solid currentColor' : '0'}"></i></span><div><div style="font-size:.6875em;font-weight:800;letter-spacing:.1em;opacity:.85">${label}</div><div style="font-weight:800;font-size:.9375em;margin-top:2px">${name}</div><div style="font-size:.75em;font-weight:600;opacity:.85;margin-top:2px">${detail}</div>${extra ? `<div style="font-size:.75em;font-weight:800;margin-top:2px">${extra}</div>` : ''}</div></div>`;
const homeField = (o) => `
<div style="margin:6px 0 0;padding:18px;background:linear-gradient(165deg,var(--fieldStart),var(--fieldEnd));position:relative;overflow:hidden;color:var(--ink)">
  <div style="position:absolute;width:265px;height:265px;border-radius:50%;border:48px solid rgba(255,255,255,.05);right:-130px;top:40px"></div>
  <div class="row" style="align-items:flex-start;gap:14px;position:relative">
    <div class="grow"><div style="font-size:.6875em;font-weight:800;letter-spacing:.1em;opacity:.85">TRAJECTORY</div>
      <div class="display" style="font-size:1.5em;margin-top:4px;line-height:1.1">${o.headline}</div>
      <div class="row" style="gap:6px;margin-top:6px"><i style="width:7px;height:7px;border-radius:50%;background:var(--green);flex:none"></i><span style="font-size:.8125em;font-weight:800;color:var(--green)">${o.timeline}</span></div>
      <p style="font-size:.875em;font-weight:500;margin-top:6px;line-height:1.35;opacity:.9">${o.support}</p></div>
    <div style="flex:none">${ring(o.conf)}</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0 16px;position:relative">${o.metrics.map(([k, v]) => metric(k, v)).join('')}</div>
  <div style="position:relative"><div style="font-size:.6875em;font-weight:800;letter-spacing:.1em;color:var(--purple)">PRIMARY GOAL · BUILD LEAN MASS</div><div style="font-size:.75em;opacity:.85;margin-top:2px">${o.range}</div>
    <div class="stack-sm" style="margin-top:12px">${o.rows.map((r) => phaseRow(...r)).join('')}</div></div>
  <div style="width:304px;max-width:100%;margin-top:14px;border-radius:12px;background:color-mix(in srgb,var(--paper) 80%,transparent);border-left:4px solid var(--cyan);padding:10px 12px;position:relative"><div style="font-size:.625em;font-weight:800;letter-spacing:.1em;color:var(--cyan)">${o.boxLabel}</div><div style="font-weight:800;font-size:.875em;margin-top:2px">${o.boxTitle}</div><div style="font-size:.75em;color:var(--ink2);margin-top:2px">${o.boxDetail}</div></div>
</div>`;
const homeStrip = (brief) => `<div class="row" style="gap:10px;height:104px;align-items:stretch">
  <div class="tile-amber" style="flex:58;min-height:0"><span class="display h3">Log Morning Weight</span><span style="background:rgba(255,255,255,.28);border-radius:14px;width:44px;height:44px;display:grid;place-items:center">${I.plus}</span></div>
  <div class="card" style="flex:42;border:1.5px solid var(--teal);padding:12px;display:flex;flex-direction:column;justify-content:space-between"><span class="eyebrow">Briefing</span><div class="t-sm strong">${brief}</div></div></div>`;
const homePriorities = (decision) => `<div class="card" style="padding:16px"><div class="row between"><span class="eyebrow purple">Today's priorities</span><span class="eyebrow purple">${decision ? 3 : 2} open</span></div>
  ${decision ? `<div class="card rail amber" style="margin-top:12px;background:var(--soft)"><div class="row between" style="align-items:flex-start"><div class="grow"><div class="eyebrow amber">Phase decision</div><div class="t-lg strong" style="margin-top:4px">${decision}</div><div class="t-sm ink2" style="margin-top:4px">Leaning phase complete · your choice</div></div><span style="color:var(--muted);width:44px;height:44px;display:grid;place-items:center;margin:-10px -10px 0 0">${I.x}</span></div></div>` : ''}
  <div class="row" style="gap:10px;margin-top:10px"><div class="prio grow"><div class="t-body semi">Morning Weigh-In</div><div class="t-sm ink2">Before food or fluids</div></div><div class="prio grow"><div class="t-body semi">Foam Rolling</div><div class="t-sm ink2">Evening</div></div></div></div>`;
const homeScreen = (o, brief, decision) => `
${statusBar()}
<div style="padding:4px 18px 0"><div class="t-body ink2">Good morning</div><div class="display" style="font-size:1.875em">Dustin<span style="color:var(--purple)">.</span></div></div>
${homeField(o)}
<div class="content stack" style="padding-top:12px">${homeStrip(brief)}${homePriorities(decision)}</div>
${tabbar('home')}`;

S['H1-home-building'] = () => homeScreen({ headline: 'Lean Mass Build', timeline: 'About 3 weeks remaining', support: 'Add lean mass gradually while keeping body fat in range.', conf: 70, metrics: [['TARGET DATE', 'Oct 31'], ['REMAINING', '3 weeks'], ['PROGRESS', '+7 of 10 lb'], ['DESTINATION', '+10 lb']], range: 'Jul 18 – Oct 31', rows: [['amber', 'PHASE 1 · COMPLETE', 'Maintenance Calibration', 'Jul 18 – Aug 15'], ['green', 'PHASE 2 · ACTIVE', 'Lean Mass Build', 'Aug 15 – Oct 31', '+7 of 10 lb gained']], boxLabel: 'GUARDRAIL', boxTitle: 'Keep body fat at 8–9%', boxDetail: 'Latest DEXA: above range' }, 'DEXA Analysis ready · Oct 9');

S['H2-home-leaning'] = () => homeScreen({ headline: 'Leaning phase', timeline: 'Temporary · week 2 · ≈ 2–4 weeks left*', support: 'Bring body fat back to 8–9% while keeping the lean mass you built. Building resumes when you choose.', conf: 70, metrics: [['GOAL', '+7 of 10 lb kept'], ['BODY FAT · 8–9%', '9.4%*'], ['PHASE', 'Week 2'], ['GOAL DATE', 'After leaning']], range: 'Jul 18 – re-estimated after leaning', rows: [['amber', 'PHASE 2 · PAUSED', 'Lean Mass Build', 'Paused at +7 lb · resumes when you choose'], ['green', 'NOW · TEMPORARY', 'Leaning phase', 'Started Oct 9 · ends when back in range', 'Week 2 · on track']], boxLabel: 'PHASE GOAL', boxTitle: 'Body fat back to 8–9%', boxDetail: 'Latest estimate 9.4%* · a DEXA confirms best' }, 'Weekly ready · Oct 18–24');

S['H3-home-phase-done'] = () => homeScreen({ headline: 'Leaning complete', timeline: 'Back in range · your next step', support: 'Body fat 8.7%* on your Nov 20 scan. Choose when to start building again.', conf: 72, metrics: [['GOAL', '+6.6 of 10 lb*'], ['BODY FAT · 8–9%', '8.7%* ✓'], ['PHASE', 'Complete'], ['GOAL DATE', 'Set on resume']], range: 'Jul 18 – re-estimated on resume', rows: [['amber', 'PHASE 2 · PAUSED', 'Lean Mass Build', 'Ready to resume'], ['green', 'LEANING · COMPLETE', 'Leaning phase', 'Oct 9 – Nov 20 · fat −3.1 lb*']], boxLabel: 'GUARDRAIL', boxTitle: 'Keep body fat at 8–9%', boxDetail: 'Latest DEXA: within range' }, 'DEXA Analysis ready · Nov 20', 'Start building again?');

S['H4-home-resumed'] = () => homeScreen({ headline: 'Lean Mass Build', timeline: 'Building again · ≈ 3.4 lb to go', support: 'Slow, lean gain from here, keeping body fat inside 8–9%.', conf: 64, metrics: [['TARGET DATE', 'Feb–Apr*'], ['REMAINING', '≈ 3.4 lb'], ['PROGRESS', '+6.6 of 10 lb'], ['DESTINATION', '+10 lb']], range: 'Jul 18 – Feb–Apr* (revised)', rows: [['amber', 'LEANING · COMPLETE', 'Leaning phase', 'Oct 9 – Nov 20'], ['green', 'PHASE 2 · RESUMED', 'Lean Mass Build', 'Resumed Nov 22', '+6.6 of 10 lb']], boxLabel: 'GUARDRAIL', boxTitle: 'Keep body fat at 8–9%', boxDetail: 'Latest DEXA: within range' }, 'Weekly ready · Nov 22–28');

// ---------------- Goals -----------------
const lab = (t, cls) => `<span class="prov ${cls || ''}">${t}</span>`;
const journeyCard = (rows) => `<div class="card"><span class="eyebrow">The path · Your Journey</span><div class="phases" style="margin-top:10px">${rows.map(([dot, title, sub], i) => `<div class="ph"><div class="col"><div class="dot ${dot}"></div>${i < rows.length - 1 ? '<div class="line"></div>' : ''}</div><div class="txt"><div class="t-body strong">${title}</div><div class="t-sm ink2">${sub}</div></div></div>`).join('')}</div></div>`;
const historyCard = (rows) => `<div class="card"><div class="row between"><span class="eyebrow">Changes you approved</span><span class="t-sm semi" style="color:var(--teal)">Original plan</span></div><div class="divider-list" style="margin-top:6px">${rows.map(([d, t]) => `<div class="lrow"><div class="l"><b>${d}</b><small>${t}</small></div></div>`).join('')}</div></div>`;

S['G1-goal-leaning'] = () => `
${statusBar()}${nav('Goals', 'Build Lean Mass')}
<div class="content stack">
  <div class="card" style="background:linear-gradient(160deg,var(--fieldStart),var(--fieldEnd));border:0">
    <div class="row between"><span class="eyebrow" style="color:var(--ink)">Active goal</span>${lab('Goal confidence 70%')}</div>
    <div class="display h1" style="margin-top:6px">Build Lean Mass</div>
    <div class="t-sm" style="margin-top:4px">+10 lb lean mass</div>
    <div class="kv"><span class="k" style="color:var(--ink)">Progress</span><span class="v">+7 of 10 lb · kept ${lab('Measured Oct 9', 'm')}</span></div>
    <div class="bar"><i style="width:70%"></i></div>
    <div class="kv"><span class="k" style="color:var(--ink)">Goal date</span><span class="delta"><s>Oct 31</s><span class="v">Re-estimated after leaning</span></span></div>
  </div>
  <div class="card" style="border:1.5px solid var(--green)">
    <div class="row between"><span class="eyebrow" style="color:var(--green)">Now · temporary phase</span>${lab('Week 2')}</div>
    <div class="display h2" style="margin-top:6px">Leaning phase</div>
    <p class="t-sm ink2" style="margin-top:4px">Back to 8–9% body fat while keeping lean mass. Then building resumes when you choose.</p>
    <div class="kv"><span class="k">Ends</span><span class="v">Back in 8–9% · review at 6 weeks if not</span></div>
    <div class="kv"><span class="k">Body fat</span><span class="v">9.7% → 9.4%* ${lab('Estimate')}</span></div>
    <div class="bar"><i style="width:43%"></i></div>
    <div class="kv"><span class="k">Phase forecast</span><span class="v">Likely 2–4 more weeks ${lab('Forecast', 'e')}</span></div>
    <p class="t-xs muted" style="margin-top:4px">Phase forecast is separate from goal confidence.</p>
  </div>
  <div class="card"><div class="row between"><span class="eyebrow">Body-fat limit</span>${lab('You approved')}</div>
    <div class="t-body strong" style="margin-top:6px">8–9% · firm · always</div><p class="t-sm ink2" style="margin-top:2px">Currently above; this phase is bringing it back.</p></div>
  <div class="card"><div class="row between"><span class="eyebrow">Plan for this phase</span><span class="t-sm semi" style="color:var(--teal)">Open plan</span></div>
    <div class="kv"><span class="k">Daily balance</span><span class="v">−450 · eat 1,767 · goal 900</span></div>
    <div class="kv"><span class="k">Carried forward</span><span class="v">Training, recovery, supplements, photos</span></div></div>
  ${journeyCard([['done', 'Phase 1 · Maintenance Calibration', 'Jul 18 – Aug 15 · complete'], ['paused', 'Phase 2 · Lean Mass Build', 'Paused at +7 lb on Oct 9 · progress kept'], ['now', 'Leaning phase · temporary', 'Since Oct 9 · week 2'], ['', 'Lean Mass Build resumes', 'When you choose, after leaning']])}
  ${historyCard([['Oct 9 · plan v2', 'Leaning phase approved · eat 2,500 → 1,767, activity goal 800 → 900'], ['Aug 15 · plan v1', 'Lean Mass Build started · original goal date Oct 31']])}
</div>`;

S['G2-goal-phase-complete'] = () => `
${statusBar()}${nav('Goals', 'Build Lean Mass')}
<div class="content stack">
  <div class="card" style="border:1.5px solid var(--green)">
    <div class="row between"><span class="eyebrow" style="color:var(--green)">Leaning phase complete</span>${lab('Nov 20 DEXA*', 'm')}</div>
    <div class="display h2" style="margin-top:6px">Back in your 8–9% range</div>
    <div class="kv"><span class="k">Body fat</span><span class="delta"><s>9.7%</s><span class="v">8.7%*</span></span></div>
    <div class="kv"><span class="k">Fat mass</span><span class="v">−3.1 lb*</span></div>
    <div class="kv"><span class="k">Lean mass (DEXA)</span><span class="v">−0.4 lb*</span></div>
    <p class="t-xs muted" style="margin-top:4px">DEXA lean mass is everything that isn’t fat, including water and stored carbs. Some of a small drop after a cut is usually water, not muscle.</p>
  </div>
  <div class="card"><div class="row between"><span class="eyebrow">Build Lean Mass</span>${lab('Goal')}</div>
    <div class="kv"><span class="k">Progress</span><span class="delta"><s>+7.0</s><span class="v">+6.6 of 10 lb*</span></span></div>
    <p class="t-xs muted">Shown honestly: progress isn’t reset, and the next scans will show how much returns.</p></div>
  <div class="card selected"><span class="eyebrow amber">What’s next?</span>
    <div class="divider-list" style="margin-top:4px">
      <div class="choice">${radio(true)}<div class="grow"><div class="row between"><span class="t-body strong">Start building again</span><span class="pill teal">Suggested</span></div><div class="t-sm ink2">Slow, lean gain · goal ≈ Feb–Apr*</div></div></div>
      <div class="choice">${radio(false)}<div class="grow"><div class="t-body strong">Hold at maintenance first</div><div class="t-sm ink2">2–4 weeks before building</div></div></div>
      <div class="choice">${radio(false)}<div class="grow"><div class="t-body strong">Keep leaning</div><div class="t-sm ink2">Aim for the lower end of 8–9%</div></div></div>
    </div>
    <div class="btn primary" style="margin-top:10px">Review this change</div>
    <p class="t-xs muted" style="margin-top:8px;text-align:center">Nothing restarts on its own.</p></div>
</div>`;

S['G3-goal-resumed'] = () => `
${statusBar()}${nav('Goals', 'Build Lean Mass')}
<div class="content stack">
  <div class="card" style="background:linear-gradient(160deg,var(--fieldStart),var(--fieldEnd));border:0">
    <div class="row between"><span class="eyebrow" style="color:var(--ink)">Active goal</span>${lab('Goal confidence 64%')}</div>
    <div class="display h1" style="margin-top:6px">Build Lean Mass</div>
    <div class="kv"><span class="k" style="color:var(--ink)">Progress</span><span class="v">+6.6 of 10 lb ${lab('Measured Nov 20', 'm')}</span></div>
    <div class="bar"><i style="width:66%"></i></div>
    <div class="kv"><span class="k" style="color:var(--ink)">Goal date</span><span class="delta"><s>Oct 31</s><span class="v">Feb–Apr* ${lab('Forecast', 'e')}</span></span></div>
  </div>
  ${journeyCard([['done', 'Phase 1 · Maintenance Calibration', 'Jul 18 – Aug 15'], ['done', 'Phase 2 · Lean Mass Build', 'Aug 15 – Oct 9 · +7 lb'], ['done', 'Leaning phase · temporary', 'Oct 9 – Nov 20 · fat −3.1 lb*, back in range'], ['now', 'Phase 2 · Lean Mass Build (resumed)', 'Since Nov 22 · +200 a day · eat 2,117 · goal 800*']])}
  ${historyCard([['Nov 22 · plan v4', 'Resumed building · balance +200'], ['Nov 8 · plan v3', 'Quick calibration · deficit −450 → −650'], ['Oct 9 · plan v2', 'Leaning phase approved'], ['Aug 15 · plan v1', 'Lean Mass Build · original date Oct 31']])}
</div>`;
