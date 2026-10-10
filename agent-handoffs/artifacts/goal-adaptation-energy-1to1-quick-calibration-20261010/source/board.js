// ---------------------------------------------------------------------------
// Board renderer: sections, theme filter, search, click-to-enlarge, index.
// Depends on: S (screen templates), SCREENS (registry), SECTIONS, COVERAGE,
// boardIntro(), comparisonView(), decisionsView(), contractView().
// ---------------------------------------------------------------------------
const tagHtml = (t) => {
  const cls = t === 'NEW' ? 'newb' : /^UPDATED/.test(t) ? 'upd' : t === 'Canonical today' ? 'canon' : /^New contract/.test(t) ? 'new' : /concept/i.test(t) ? 'concept' : 'state';
  return `<span class="tag ${cls}">${t}</span>`;
};
const phoneHtml = (id, theme, extra = '') => {
  const sc = SCREENS[id];
  const energy = sc.energy ? ` data-energy data-net="${sc.energy.net}" data-added="${sc.energy.added}" data-sug-net="${sc.energy.sug?.[0] ?? -450}" data-sug-added="${sc.energy.sug?.[1] ?? 100}"` : '';
  return `<div class="phone ${theme} ${sc.xl ? 'xl' : ''}"${energy} data-capture="${id}-${theme}" ${extra}>${S[id]()}</div>`;
};
function shotHtml(id) {
  const sc = SCREENS[id];
  const search = (id + ' ' + sc.title + ' ' + sc.desc + ' ' + (sc.tags || []).join(' ')).toLowerCase().replace(/"/g, '');
  return `<div class="item" id="p-${id}" data-id="${id}" data-search="${search}">
    <div class="meta"><div class="id">${id.split('-')[0]} · ${sc.short}</div><div class="ttl">${sc.title}</div><div class="desc">${sc.desc}</div><div class="tags">${(sc.tags || []).map(tagHtml).join('')}</div></div>
    <div class="pair">
      <div class="shot phone-dark-wrap" tabindex="0" role="button" aria-label="Enlarge ${id} in Dark" data-open="${id}" data-theme="dark"><p class="cap">Dark</p><div class="frame">${phoneHtml(id, 'dark')}</div></div>
      <div class="shot phone-light-wrap" tabindex="0" role="button" aria-label="Enlarge ${id} in Mineral Light" data-open="${id}" data-theme="light"><p class="cap">Mineral Light</p><div class="frame">${phoneHtml(id, 'light')}</div></div>
    </div></div>`;
}
function flowHtml(flow) {
  if (!flow) return '';
  return `<div class="flowline">${flow.map((step, i) => (step === '→' || step === '·' ? `<span class="a">${step === '·' ? '|' : '→'}</span>` : step.startsWith('#') ? `<a class="n" href="#p-${step.slice(1)}"><b>${step.slice(1).split('-')[0]}</b>${SCREENS[step.slice(1)]?.short ?? ''}</a>` : `<span class="n">${step}</span>`)).join('')}</div>`;
}
function render() {
  const nav = [];
  const body = [];
  body.push(boardIntro());
  for (const group of SECTIONS) {
    nav.push(`<h4>${group.group}</h4>`);
    for (const sec of group.items) {
      const count = sec.screens ? sec.screens.length : '';
      const badge = sec.badge ? ` <span class="tag ${sec.badge === 'NEW' ? 'newb' : 'upd'}">${sec.badge}</span>` : '';
      nav.push(`<a class="navlink" href="#${sec.key}" data-nav="${sec.key}"><span>${sec.title}${badge}</span><small>${count}</small></a>`);
      const inner = sec.render ? sec.render() : `${flowHtml(sec.flow)}<div class="grid">${sec.screens.map((id) => shotHtml(id)).join('')}</div>`;
      body.push(`<section class="sec" id="${sec.key}" data-sec><h2>${sec.title}${badge}</h2>${sec.note ? `<p class="note">${sec.note}</p>` : ''}${inner}</section>`);
    }
  }
  document.getElementById('side').innerHTML = nav.join('');
  document.getElementById('main').innerHTML = body.join('');
  document.querySelectorAll('[data-energy]').forEach(energyRefresh);
  document.querySelectorAll('[data-qc]').forEach(qcRefresh);
}

// theme filter
function setShow(mode) {
  document.body.dataset.show = mode;
  document.querySelectorAll('[data-show-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.showBtn === mode)));
  try { localStorage.setItem('opd-show', mode); } catch (e) { /* storage unavailable */ }
}
function setBoardTheme(mode) {
  if (mode === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = mode;
  document.querySelectorAll('[data-board-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.boardBtn === mode)));
}
// search
function applySearch(q) {
  q = q.trim().toLowerCase();
  document.querySelectorAll('.item[data-search]').forEach((el) => el.classList.toggle('hide', !!q && !el.dataset.search.includes(q)));
  document.querySelectorAll('[data-sec]').forEach((sec) => {
    const items = sec.querySelectorAll('.item[data-search]');
    if (!items.length) { sec.classList.toggle('hide', !!q); return; }
    sec.classList.toggle('hide', !!q && [...items].every((p) => p.classList.contains('hide')));
  });
}
// lightbox
let lbList = [], lbPos = 0, lbTheme = 'dark';
function openLb(id, theme) {
  lbList = [...document.querySelectorAll('.item[data-id]')].filter((p) => !p.classList.contains('hide')).map((p) => p.dataset.id);
  lbPos = Math.max(0, lbList.indexOf(id));
  lbTheme = theme;
  drawLb();
  document.getElementById('lb').classList.add('open');
  document.getElementById('lb-close').focus();
}
function drawLb() {
  const id = lbList[lbPos];
  const sc = SCREENS[id];
  document.getElementById('lb-stage').innerHTML = phoneHtml(id, lbTheme);
  document.getElementById('lb-info').innerHTML = `<div class="kick">${id} · ${lbTheme === 'light' ? 'Mineral Light' : 'Dark'} · ${lbPos + 1} / ${lbList.length}</div><h3>${sc.title}</h3><p>${sc.desc}</p><div class="tags">${(sc.tags || []).map(tagHtml).join('')}</div>${sc.notes ? `<p style="margin-top:12px">${sc.notes}</p>` : ''}`;
  const st = document.getElementById('lb-stage').querySelector('[data-energy]');
  if (st) energyRefresh(st);
  const qs = document.getElementById('lb-stage').querySelector('[data-qc]');
  if (qs) qcRefresh(qs);
}
function closeLb() { document.getElementById('lb').classList.remove('open'); }
document.addEventListener('click', (ev) => {
  if (ev.target.closest('input, label, button, [data-preset], [data-step], [data-qstep], [data-qset]')) return;
  const open = ev.target.closest('[data-open]');
  if (open) { openLb(open.dataset.open, open.dataset.theme); return; }
  if (ev.target.id === 'lb') closeLb();
});
document.addEventListener('keydown', (ev) => {
  const lb = document.getElementById('lb');
  if (lb.classList.contains('open')) {
    if (ev.key === 'Escape') closeLb();
    if (ev.key === 'ArrowRight') { lbPos = (lbPos + 1) % lbList.length; drawLb(); }
    if (ev.key === 'ArrowLeft') { lbPos = (lbPos - 1 + lbList.length) % lbList.length; drawLb(); }
    if (ev.key.toLowerCase() === 't') { lbTheme = lbTheme === 'dark' ? 'light' : 'dark'; drawLb(); }
    return;
  }
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest?.('[data-open]')) { ev.preventDefault(); const o = ev.target.closest('[data-open]'); openLb(o.dataset.open, o.dataset.theme); }
});
// active section highlight
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) document.querySelectorAll('.navlink').forEach((a) => a.classList.toggle('on', a.dataset.nav === e.target.id)); });
}, { rootMargin: '-30% 0px -60% 0px' });

document.addEventListener('DOMContentLoaded', () => {
  render();
  document.querySelectorAll('[data-sec]').forEach((s) => io.observe(s));
  let saved = 'both';
  try { saved = localStorage.getItem('opd-show') || 'both'; } catch (e) { /* storage unavailable */ }
  setShow(saved);
  document.querySelectorAll('[data-show-btn]').forEach((b) => b.addEventListener('click', () => setShow(b.dataset.showBtn)));
  document.querySelectorAll('[data-board-btn]').forEach((b) => b.addEventListener('click', () => setBoardTheme(b.dataset.boardBtn)));
  document.getElementById('q').addEventListener('input', (e) => applySearch(e.target.value));
  document.getElementById('lb-close').addEventListener('click', closeLb);
  document.getElementById('lb-prev').addEventListener('click', () => { lbPos = (lbPos - 1 + lbList.length) % lbList.length; drawLb(); });
  document.getElementById('lb-next').addEventListener('click', () => { lbPos = (lbPos + 1) % lbList.length; drawLb(); });
  document.getElementById('lb-theme').addEventListener('click', () => { lbTheme = lbTheme === 'dark' ? 'light' : 'dark'; drawLb(); });
});
