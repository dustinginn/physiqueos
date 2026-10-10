// ---------------------------------------------------------------------------
// Production-parity Home renderer (design replica, not production code).
// Authority: Native Build 94 (498297815a) sources:
//   Presentation/Home/HomeView.swift            stack spacing 12, padding 18/10, canvas bg
//   Presentation/Home/HomeHeaderView.swift      greeting 17 medium + name 30 bold + purple "."
//   Presentation/Home/HomeJourneyFieldView.swift goal field, metrics, journey, guardrail, strip
//   SharedUI/ConfidenceRing.swift               82pt ring in 110 frame, 6pt line, "CONFIDENCE"
//   Presentation/Home/TodaysFocusCardView.swift priorities card (tiles approximated)
// Only dynamic server strings change between states; every slot, size and
// colour below mirrors the source. 1 CSS px = 1 iOS pt.
// ---------------------------------------------------------------------------
const HOME_TOKENS = {
  dark: { canvas: '#061019', paper: '#0F1C2A', soft: '#132334', ink: '#F3F8FA', ink2: '#C3D2D9', fieldStart: '#087B70', fieldEnd: '#132751', green: '#55E39A', amber: '#EFB84F', amberField: '#F4BC48', purple: '#AA98FF', cyan: '#3BC6DD', teal: '#3BD2CA', rule: 'rgba(167,188,197,.18)', fieldInk: '#FFFFFF', fieldSecondary: 'rgba(255,255,255,.72)', rowSecondary: 'rgba(255,255,255,.70)', metricRule: 'rgba(255,255,255,.09)', circle: 'rgba(85,227,154,.12)', guardBg: 'rgba(11,34,49,.92)', ringTrack: 'rgba(148,163,184,.22)', ringFill: '#4ADE80', ringText: '#F3F6FB', ringMuted: '#9AA8BA', tab: 'rgba(15,28,42,.86)' },
  light: { canvas: '#E8ECE5', paper: '#FBFAF4', soft: '#EEF2ED', ink: '#102431', ink2: '#526970', fieldStart: '#CBE6E2', fieldEnd: '#B9D5DD', green: '#16875F', amber: '#C88228', amberField: '#C98220', purple: '#5C3FD2', cyan: '#107F99', teal: '#087E78', rule: 'rgba(110,129,127,.22)', fieldInk: '#102431', fieldSecondary: '#526970', rowSecondary: '#526970', metricRule: 'rgba(16,36,49,.10)', circle: 'rgba(22,135,95,.10)', guardBg: 'rgba(248,251,247,.88)', ringTrack: '#BFCBC7', ringFill: '#138C60', ringText: '#0A1B2C', ringMuted: '#65767D', tab: 'rgba(251,250,244,.9)' },
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function hpRing(t, value) {
  const size = 82, line = 6, r = (size - line) / 2, c = 2 * Math.PI * r;
  return `<div style="width:110px;height:110px;display:grid;place-items:center;flex:none" role="img" aria-label="Confidence ${value} percent">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="position:absolute"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${t.ringTrack}" stroke-width="${line}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${t.ringFill}" stroke-width="${line}" stroke-linecap="round" stroke-dasharray="${(value / 100) * c} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>
    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;width:${size * 0.82}px;position:relative"><span style="font-size:22px;font-weight:700;color:${t.ringText}">${value}%</span><span style="font-size:8px;font-weight:700;letter-spacing:.28px;color:${t.ringMuted}">CONFIDENCE</span></div></div>`;
}
function hpMetric(t, label, value, mark) {
  return `<div style="flex:1;min-width:0"><div style="height:1px;background:${t.metricRule};margin-bottom:9px"></div>
    <div style="font-size:9px;font-weight:700;letter-spacing:.6px;color:${t.fieldSecondary};white-space:nowrap;overflow:hidden">${label}</div>
    <div style="font-size:14px;font-weight:800;color:${t.fieldInk};margin-top:4px;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden" ${mark ? `data-changed="1"` : ''}>${esc(value)}</div></div>`;
}
function hpRow(t, row) {
  const active = row.status === 'active';
  const tint = active ? t.green : t.amber;
  const statusLabel = row.status === 'completed' ? 'COMPLETE' : row.status.toUpperCase();
  return `<div style="display:flex;gap:11px;align-items:flex-start">
    <div style="width:24px;height:24px;border-radius:50%;background:${tint}2E;display:grid;place-items:center;flex:none"><i style="width:12px;height:12px;border-radius:50%;background:${tint};display:block"></i></div>
    <div style="display:flex;flex-direction:column;gap:3px;min-width:0">
      <div style="font-size:10px;font-weight:700;letter-spacing:.4px;color:${tint}">PHASE${row.order} · ${statusLabel}</div>
      <div style="font-size:15px;font-weight:800;color:${t.fieldInk}">${esc(row.name)}</div>
      ${row.detail ? `<div style="font-size:12px;font-weight:600;color:${t.rowSecondary}">${esc(row.detail)}</div>` : ''}
      ${active && row.label ? `<div style="font-size:12px;font-weight:800;color:${t.fieldInk};padding-top:2px">${esc(row.label)}</div>` : ''}
    </div></div>`;
}
function hpGuardrail(t, g, dark) {
  return `<div style="width:304px;max-width:100%;margin-top:14px;padding:10px 12px;background:${t.guardBg};border-radius:12px;position:relative;overflow:hidden;display:flex;flex-direction:column;gap:4px">
    <span style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${t.cyan}"></span>
    <div style="font-size:10px;font-weight:700;letter-spacing:.8px;color:${t.cyan}">GUARDRAIL</div>
    <div style="font-size:14px;font-weight:800;color:${t.fieldInk}">${esc(g.title)}</div>
    ${g.detail ? `<div style="font-size:12px;font-weight:500;color:${t.fieldSecondary}">${esc(g.detail)}</div>` : ''}</div>`;
}
function hpField(t, s, dark) {
  return `<div data-act="openGoals" role="button" tabindex="0" aria-label="Open goal" style="cursor:pointer;padding:18px;position:relative;overflow:hidden;background:linear-gradient(135deg,${t.fieldStart},${t.fieldEnd})">
    <div style="position:absolute;width:313px;height:313px;border-radius:50%;border:48px solid ${t.circle};right:-116px;bottom:-94px;box-sizing:border-box;pointer-events:none"></div>
    <div style="display:flex;align-items:center;gap:14px;position:relative">
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:5px">
        <div style="font-size:11px;font-weight:700;letter-spacing:1.1px;color:${t.fieldSecondary}">TRAJECTORY</div>
        <div style="font-size:24px;font-weight:800;color:${t.fieldInk};line-height:1.15">${esc(s.headline)}</div>
        <div style="display:flex;align-items:center;gap:6px"><i style="width:7px;height:7px;border-radius:50%;background:${t.green};flex:none;display:block"></i><span style="font-size:13px;font-weight:700;color:${t.green}">${esc(s.timeline)}</span></div>
        <div style="font-size:14px;font-weight:500;color:${t.fieldSecondary};line-height:1.3">${esc(s.support)}</div>
      </div>
      ${hpRing(t, s.confidence)}
    </div>
    <div style="display:flex;gap:10px;margin:14px 0 16px;position:relative">
      ${hpMetric(t, 'TARGET DATE', s.metrics.targetDate)}${hpMetric(t, 'REMAINING', s.metrics.remaining)}${hpMetric(t, 'PROGRESS', s.metrics.progress)}${hpMetric(t, 'DESTINATION', s.metrics.destination)}
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;position:relative">
      <div><span style="font-size:11px;font-weight:700;letter-spacing:1px;color:${t.purple};${dark ? 'background:#E9E2FF;padding:4px 8px;border-radius:5px;' : ''}">PRIMARY GOAL</span></div>
      <div style="font-size:12px;font-weight:500;color:${t.fieldSecondary}">${esc(s.range)}</div>
      <div style="display:flex;flex-direction:column;gap:12px;position:relative">
        <div style="position:absolute;left:11px;top:8px;bottom:0;width:2px;background:linear-gradient(${t.amber}D1 0%,${t.amber}D1 43%,${t.green}D1 57%,${t.green}D1 100%)"></div>
        ${s.rows.map((r) => hpRow(t, r)).join('')}
      </div>
    </div>
    ${hpGuardrail(t, s.guardrail, dark)}
  </div>`;
}
function hpStrip(t, s) {
  return `<div style="display:flex;gap:10px;height:104px">
    <div data-act="${s.actionAct || 'logWeight'}" role="button" tabindex="0" style="cursor:pointer;flex:0 0 calc((100% - 10px) * .58);background:${t.amberField};border-radius:18px;padding:14px;display:flex;align-items:flex-end;justify-content:space-between;box-sizing:border-box">
      <span style="font-size:17px;font-weight:800;color:#102431;line-height:1.15">${esc(s.action)}</span>
      <span style="width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,.18);display:grid;place-items:center;color:#102431;font-size:22px;font-weight:800;flex:none">+</span></div>
    <div data-act="openBriefing" role="button" tabindex="0" style="cursor:pointer;flex:1;min-width:0;background:${t.paper};border-radius:18px;border:1px solid ${t.teal}6B;padding:12px;display:flex;align-items:flex-end;gap:9px;position:relative;box-sizing:border-box">
      <span style="width:34px;height:34px;border-radius:9px;background:${t.teal}21;display:grid;place-items:center;color:${t.teal};flex:none"><svg width="13" height="15" viewBox="0 0 13 15"><path d="M2 0h6l5 5v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2Z" fill="currentColor"/></svg></span>
      <div style="min-width:0;display:flex;flex-direction:column;gap:2px"><span style="font-size:14px;font-weight:800;color:${t.ink};line-height:1.2">${esc(s.briefing.title)}</span><span style="font-size:11px;font-weight:500;color:${t.ink2}">${esc(s.briefing.date)}</span></div>
      <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);color:${t.teal};font-size:12px;font-weight:700">→</span></div></div>`;
}
function hpPriorities(t, s) {
  const tile = (p) => `<div ${p.action ? `data-act="${p.action}" role="button" tabindex="0"` : ''} style="background:${p.kind === 'decision' ? t.soft : t.soft};border:1px solid ${p.kind === 'decision' ? t.amber : t.rule};border-radius:14px;padding:12px;display:flex;gap:10px;align-items:center;${p.action ? 'cursor:pointer;' : ''}min-height:56px;box-sizing:border-box">
    <div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700;color:${t.ink}">${esc(p.title)}</div>${p.sub ? `<div style="font-size:12px;color:${t.ink2};margin-top:2px">${esc(p.sub)}</div>` : ''}</div>
    ${p.kind === 'decision' ? `<span style="color:${t.amber};font-weight:800">›</span>` : `<span style="width:26px;height:26px;border-radius:50%;border:2px solid ${t.rule};flex:none"></span>`}</div>`;
  return `<div style="background:${t.paper};border:1px solid ${t.rule};border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;justify-content:space-between"><span style="font-size:11px;font-weight:700;letter-spacing:.9px;color:${t.purple}">TODAY'S PRIORITIES</span><span style="font-size:11px;font-weight:700;letter-spacing:.4px;color:${t.purple}">${s.priorities.length} OPEN</span></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${s.priorities.map((p) => tile(p)).join('')}</div></div>`;
}
function hpTabbar(t, active = 'home') {
  const tabs = [['home', 'Home'], ['goals', 'Goals'], ['log', 'Log'], ['evidence', 'Evidence'], ['you', 'You']];
  return `<div style="position:sticky;bottom:0;padding:8px 16px 26px;background:linear-gradient(transparent,${t.canvas} 40%)"><div style="height:62px;border-radius:31px;background:${t.tab};backdrop-filter:blur(16px);border:1px solid ${t.rule};display:grid;grid-template-columns:repeat(5,1fr);align-items:center">
    ${tabs.map(([k, l]) => `<div ${`data-tab="${k}"`} role="button" tabindex="0" style="display:grid;justify-items:center;gap:2px;font-size:10px;font-weight:600;cursor:pointer;color:${k === active ? (t === HOME_TOKENS.dark ? '#8B8CFF' : '#7655DC') : t.ink2}"><span style="width:22px;height:22px;border-radius:50%;background:currentColor;opacity:${k === active ? 1 : .55}"></span>${l}</div>`).join('')}</div></div>`;
}
function homeParity(state, theme = 'dark', opts = {}) {
  const t = HOME_TOKENS[theme];
  const dark = theme === 'dark';
  return `<div class="hp" style="width:402px;background:${t.canvas};color:${t.ink};font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif;-webkit-font-smoothing:antialiased;position:relative">
    <div style="height:54px;display:flex;align-items:center;justify-content:space-between;padding:6px 34px 0 42px;font-weight:700;font-size:17px">9:41<span style="font-size:12px">●●● ▮</span></div>
    <div style="padding:10px 18px 0;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:17px;font-weight:500;color:${t.ink2}">${esc(state.greeting || 'Good morning')}</span><span style="font-size:30px;font-weight:700;color:${t.ink}">${esc(state.name || 'Dustin')}<span style="color:${t.purple}">.</span></span></div>
      <div style="margin:0 -18px">${hpField(t, state, dark)}</div>
      ${hpStrip(t, state)}
      ${hpPriorities(t, state)}
    </div>
    ${opts.tabbar === false ? '<div style="height:20px"></div>' : hpTabbar(t, 'home')}
  </div>`;
}

// ---------------- Illustrative states (Founder scenario, simulated values) -----------------
const HOME_STATES = {
  baseline: {
    label: 'Production baseline (reconstructed)',
    headline: 'Lean Mass Build', timeline: '3 weeks remaining', support: 'Add lean mass gradually while keeping body fat in range.', confidence: 70,
    metrics: { targetDate: 'Oct 31', remaining: '3 weeks', progress: '71%', destination: '10 lb' },
    range: 'Jul 18 – Oct 31',
    rows: [{ order: 1, status: 'completed', name: 'Establish Maintenance', detail: 'Completed' }, { order: 2, status: 'active', name: 'Lean Mass Build', detail: 'Aug 15 – Oct 31 · about 3 weeks remaining', label: '7.1 of 10 lb gained' }],
    guardrail: { title: 'Maintain approximately 8–9% body fat', detail: 'Applies across every phase' },
    action: 'Log Morning Weight', briefing: { title: 'DEXA Analysis', date: 'Today' },
    priorities: [{ title: 'Morning Weigh-In', sub: 'Before food or fluids' }, { title: 'Foam Rolling', sub: 'Evening' }],
  },
};
HOME_STATES.h1 = { ...HOME_STATES.baseline, label: 'H1 · Building (unchanged)' };
HOME_STATES.h2 = {
  ...HOME_STATES.baseline, label: 'H2 · Temporary leaning phase',
  headline: 'Leaning', timeline: 'Temporary · 4 weeks left', support: 'Bring body fat back to 8–9% while keeping lean mass.',
  metrics: { targetDate: 'Paused', remaining: '4 weeks', progress: '71%', destination: '10 lb' },
  range: 'Jul 18 – date set after leaning',
  rows: [{ order: 2, status: 'paused', name: 'Lean Mass Build', detail: '7.1 of 10 lb kept' }, { order: 3, status: 'active', name: 'Leaning (temporary)', detail: 'Oct 10 – Nov 7 · about 4 weeks remaining', label: 'Body fat 9.7% → 8–9%' }],
  briefing: { title: 'Weekly Briefing', date: 'Yesterday' },
};
HOME_STATES.h3 = {
  ...HOME_STATES.baseline, label: 'H3 · Phase complete, choice pending',
  headline: 'Leaning complete', timeline: 'Back in range', support: 'Choose when to resume building.',
  metrics: { targetDate: '—', remaining: '—', progress: '69%', destination: '10 lb' },
  range: 'Jul 18 – date set on resume',
  rows: [{ order: 2, status: 'paused', name: 'Lean Mass Build', detail: 'Ready to resume' }, { order: 3, status: 'completed', name: 'Leaning (temporary)', detail: 'Body fat 8.7%' }],
  guardrail: { title: 'Maintain approximately 8–9% body fat', detail: 'Within range' },
  briefing: { title: 'DEXA Analysis', date: 'Today' },
  priorities: [{ title: 'Choose your next phase', sub: 'Leaning complete', kind: 'decision', action: 'decide' }, { title: 'Morning Weigh-In', sub: 'Before food or fluids' }, { title: 'Foam Rolling', sub: 'Evening' }],
};
HOME_STATES.h4 = {
  ...HOME_STATES.baseline, label: 'H4 · Building resumed',
  headline: 'Lean Mass Build', timeline: '14 weeks remaining', support: 'Add lean mass gradually while keeping body fat in range.',
  metrics: { targetDate: 'Feb 20', remaining: '14 weeks', progress: '69%', destination: '10 lb' },
  range: 'Jul 18 – Feb 20',
  rows: [{ order: 3, status: 'completed', name: 'Leaning (temporary)', detail: 'Oct 10 – Nov 7' }, { order: 4, status: 'active', name: 'Lean Mass Build', detail: 'Nov 9 – Feb 20 · about 14 weeks remaining', label: '6.9 of 10 lb gained' }],
  guardrail: { title: 'Maintain approximately 8–9% body fat', detail: 'Within range' },
  briefing: { title: 'Weekly Briefing', date: 'Yesterday' },
};
