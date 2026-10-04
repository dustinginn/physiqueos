const iconPaths = {
  timer: '<path d="M12 4.2a8 8 0 1 0 7.1 4.3"/><path d="M12 7v5l3.2 2"/><path d="M9 2h6"/><path d="M18.5 5.5l1.5-1.5"/>',
  stopwatch: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.8 2"/><path d="M9.5 2.5h5"/><path d="M12 2.5v3"/>',
  flame: '<path class="fill" d="M13.4 2.2c.5 3-1.1 4.3-2 5.8-.8-1.2-1.3-2.4-1.1-4.1C6.8 6.3 4.5 9.3 5 13.3 5.5 17.8 8.4 21 12.3 21c4 0 7.1-3.1 7.1-7.4 0-3.5-2.1-7.6-6-11.4Zm-1.1 15.9c-1.8 0-3.1-1.4-3.1-3.2 0-1.5.8-2.8 2.3-4.1.1 1.2.6 2 1.3 2.8.5-.8 1.1-1.6 1-2.7 1.1 1.2 1.7 2.5 1.7 3.8 0 1.9-1.4 3.4-3.2 3.4Z"/>',
  heart: '<path class="fill" d="M12 21s-7.7-4.7-9.4-9.2C1.2 8.1 3.5 5 7 5c2.1 0 3.7 1.1 5 2.7C13.3 6.1 15 5 17 5c3.5 0 5.8 3.1 4.4 6.8C19.7 16.3 12 21 12 21Z"/>',
  nutrition: '<path d="M6 2v8M3.8 2v5.2A2.2 2.2 0 0 0 6 9.4a2.2 2.2 0 0 0 2.2-2.2V2M6 9.4V22M15.5 2v20M15.5 2c3.5 1.5 4.4 6.5 0 9"/>'
};

function sfIcon(name) {
  const legacy = { 'legacy-time':'◷', 'legacy-heat':'♨', 'legacy-sum':'∑', 'legacy-heart':'♥', 'legacy-nutrition':'⌁' };
  if (legacy[name]) return `<span class="sum-icon legacy" aria-hidden="true">${legacy[name]}</span>`;
  if (name === 'sum') return '<span class="sum-icon" aria-hidden="true">∑</span>';
  return `<svg class="sf-icon" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name]}</svg>`;
}

function metricRow({ icon, label, value, color, caption = '' }) {
  return `<div class="metric-row" style="--metric-accent:${color}" data-icon="${icon}">
    <span class="metric-icon">${sfIcon(icon)}</span>
    <span class="metric-copy"><span class="metric-label">${label}${caption ? `<em>${caption}</em>` : ''}</span><strong>${value}</strong></span>
  </div>`;
}

function watchPage(kind, theme, normalized = false) {
  const dark = theme === 'dark';
  const exact = dark
    ? { time:'#60A5FA', active:'#FBBF24', total:'#4ADE80', heart:'#FF697A', nutrition:'#C084FC' }
    : { time:'#2563B8', active:'#A85A00', total:'#137847', heart:'#C73850', nutrition:'#7540B8' };
  const old = dark ? '#AA98FF' : '#5C3FD2';
  const color = key => normalized ? old : exact[key];
  const rows = kind === 'metrics' ? [
    {icon:normalized?'legacy-time':'timer',label:'TIME',value:'27:18',color:color('time')},
    {icon:normalized?'legacy-heat':'flame',label:'ACTIVE CALORIES',value:'214 CAL',color:color('active')},
    {icon:normalized?'legacy-sum':'sum',label:'TOTAL CALORIES',value:'267 CAL',color:color('total')},
    {icon:normalized?'legacy-heart':'heart',label:'HEART RATE',value:'132 BPM',color:color('heart')}
  ] : [
    {icon:normalized?'legacy-time':'stopwatch',label:'TRAINING SESSION',value:'27:18',color:color('time')},
    {icon:normalized?'legacy-heat':'flame',label:'ACTIVE CALORIES',caption:'SO FAR',value:'842 CAL',color:color('active')},
    {icon:normalized?'legacy-nutrition':'nutrition',label:'NUTRITION',value:'2,463 CAL',color:color('nutrition')}
  ];
  return `<div class="watch-shell ${theme}">
    <span class="watch-time">10:09</span>
    <div class="watch-face">
      <div class="watch-title">${kind === 'metrics' ? 'WORKOUT METRICS' : 'DAILY TOTALS'}</div>
      ${rows.map(metricRow).join('')}
      ${kind === 'daily' ? '<div class="freshness">Updated 10:08 PM</div>' : ''}
    </div>
  </div>`;
}

function doneControl(done, old = false) {
  if (old) return `<span class="old-dot ${done?'is-done':''}" aria-label="${done?'Completed':'Not completed'}">${done?'●':'○'}</span>`;
  return `<button class="done-control ${done?'is-done':''}" type="button" aria-label="${done?'Mark set incomplete':'Mark set complete'}"><span aria-hidden="true">${done?'✓':''}</span></button>`;
}

function setRow({ number, primary, load, done, old = false }) {
  return `<div class="set-row ${done?'completed':''}">
    <strong>${number}</strong><span class="field">${primary}</span><span class="field">${load}</span>
    ${doneControl(done, old)}<button class="delete-control" type="button" aria-label="Remove set ${number}">⌫</button>
  </div>`;
}

function exerciseCard({ name, context, measurement = 'REPS', rows, relationship = '' }) {
  return `<section class="exercise-card">
    <header><div><h3>${name}</h3><p>${relationship ? `<b>${relationship}</b> · ` : ''}${context}</p></div><span class="menu">•••</span></header>
    <div class="prior">Previous · 3 × 10 at 115 lb</div>
    <div class="set-header"><span>SET</span><span>${measurement}</span><span>LOAD</span><span>DONE</span><span></span></div>
    ${rows.map(setRow).join('')}
    <div class="add-set">＋ Add set</div>
  </section>`;
}

function loggerPhone(theme, superset = false) {
  const first = exerciseCard({name:'Incline Barbell Press',context:'Ordinary · Chest',relationship:superset?'SUPERSET A':'',rows:[
    {number:1,primary:10,load:125,done:true},{number:2,primary:10,load:125,done:false},{number:3,primary:10,load:125,done:false}
  ]});
  const second = exerciseCard({name:superset?'Pull-Up':'Cable Fly',context:superset?'Bodyweight · Back':'Ordinary · Chest',relationship:superset?'SUPERSET A':'',rows:[
    {number:1,primary:10,load:superset?'BW':40,done:true},{number:2,primary:10,load:superset?'BW':40,done:false}
  ]});
  return `<div class="phone ${theme}"><div class="island"></div><div class="status"><span>9:41</span><span>5G ◒</span></div><div class="phone-content">
    <div class="logger-heading"><span>● LIVE WORKOUT</span><strong>Training Logger</strong><small>Today · Started 9:14 PM</small></div>
    <div class="progress"><i></i><b>2 of 8</b></div>
    ${first}${second}
  </div><footer>Finish Workout</footer></div>`;
}

function loggerComparison() {
  const close = (theme, old) => `<div class="row-close ${theme}"><span class="set-num">2</span><span class="field">10</span><span class="field">125</span>${doneControl(false,old)}<span class="delete-control">⌫</span></div>`;
  return `<div class="compare-grid logger-compare">
    <div><label>OLD · DARK</label>${close('dark',true)}</div><div><label>RESTORED · DARK</label>${close('dark',false)}</div>
    <div><label>OLD · LIGHT</label>${close('light',true)}</div><div><label>RESTORED · LIGHT</label>${close('light',false)}</div>
  </div>`;
}

function watchComparison() {
  return `<div class="compare-grid watch-compare">
    <div><label>OLD · NORMALIZED</label>${watchPage('metrics','dark',true)}</div>
    <div><label>RESTORED · PRODUCTION IDENTITY</label>${watchPage('metrics','dark',false)}</div>
    <div><label>OLD · NORMALIZED</label>${watchPage('daily','light',true)}</div>
    <div><label>RESTORED · PRODUCTION IDENTITY</label>${watchPage('daily','light',false)}</div>
  </div>`;
}

function card(id, title, note, content, wide = false) {
  return `<article class="review-card ${wide?'wide':''}" data-render="${id}"><header class="review-meta"><span>${id}</span><h2>${title}</h2><p>${note}</p></header><div class="review-stage">${content}</div></article>`;
}

document.getElementById('app').innerHTML = `<header class="board-head"><div><span>PHYSIQUEOS · ACCEPTANCE CORRECTIONS</span><h1>Two corrections.<br>Everything else held.</h1><p>Build 85 production metric identity returns to Watch. The shipping Logger Done affordance returns at a practical 44-point target. Live Activity is unchanged.</p></div><aside><b>Prompt authority</b>2b780cd80c15e0c8d057d3c9f4b9f752dd39d1b2<b>Package authority</b>29d2fe1fcd343e4da077b020a120c1e2f14f37ea</aside></header>
<section><div class="section-head"><span>WATCH · FOCUSED ACCEPTANCE</span><h2>Production metric identity</h2></div><div class="review-grid">
${card('watch-metrics-dark','Workout Metrics · dark','Exact SF Symbol roles and Build 85 dark accent values.',watchPage('metrics','dark'))}
${card('watch-metrics-light','Workout Metrics · mineral light','Same icon identity; hue-preserving contrast tokens.',watchPage('metrics','light'))}
${card('watch-daily-dark','Daily Totals · dark','Stopwatch, flame and fork/knife restore distinct meaning.',watchPage('daily','dark'))}
${card('watch-daily-light','Daily Totals · mineral light','No geometry or hierarchy change.',watchPage('daily','light'))}
${card('watch-metric-comparison','Before / after','Normalized purple is replaced by production-specific icon and color identity.',watchComparison(),true)}
</div></section>
<section><div class="section-head"><span>LOGGER · FOCUSED ACCEPTANCE</span><h2>Obvious Done control</h2></div><div class="review-grid">
${card('logger-weighted-dark','Weighted set rows · dark','Completed and incomplete states together; Done target is 44×44.',loggerPhone('dark'))}
${card('logger-weighted-light','Weighted set rows · mineral light','Identical geometry and state semantics.',loggerPhone('light'))}
${card('logger-superset-dark','Superset / bodyweight · dark','Same Done control propagates through linked and bodyweight rows.',loggerPhone('dark',true))}
${card('logger-superset-light','Superset / bodyweight · mineral light','Same source control; no relationship behavior changes.',loggerPhone('light',true))}
${card('logger-done-comparison','Before / after close-up','Small subtle circle replaced by the source-faithful checkmark-circle control and practical target.',loggerComparison(),true)}
</div></section>`;
