const I = {
  back: '<svg width="13" height="21" viewBox="0 0 13 21"><path d="M11 2 2.5 10.5 11 19" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chev: '<svg class="chev" width="8" height="14" viewBox="0 0 8 14"><path d="m1.5 1.5 5 5.5-5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrow: '<svg width="20" height="16" viewBox="0 0 20 16"><path d="M2 8h15M11 2l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg class="check" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="m6 10.3 2.7 2.7L14.3 7.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x: '<svg width="14" height="14" viewBox="0 0 14 14"><path d="m2 2 10 10M12 2 2 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  doc: '<svg width="18" height="22" viewBox="0 0 18 22"><path d="M3 1h8l6 6v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z" fill="currentColor"/><path d="M5 12h8M5 16h6" stroke="var(--paper)" stroke-width="1.8" stroke-linecap="round"/></svg>',
  warn: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 1.8 17 16H1L9 1.8Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M9 7v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="13.4" r="1.1" fill="currentColor"/></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 7v4.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="4.6" r="1" fill="currentColor"/></svg>',
  plus: '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  history: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M2.5 9a6.5 6.5 0 1 0 2-4.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M2 2.5v3.3h3.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 5.5V9l2.5 1.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  sync: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M13.5 6A5.8 5.8 0 0 0 3 4.6M2.5 10A5.8 5.8 0 0 0 13 11.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M3 1.8v3h3M13 14.2v-3h-3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  home: '<svg width="30" height="26" viewBox="0 0 30 26"><path d="M15 2 2 13h4v11h7v-7h4v7h7V13h4L15 2Z" fill="currentColor"/></svg>',
  goals: '<svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="13" cy="13" r="6.3" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="13" cy="13" r="2" fill="currentColor"/></svg>',
  log: '<svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="12" fill="currentColor"/><path d="M13 7v12M7 13h12" stroke="var(--paper)" stroke-width="2.6" stroke-linecap="round"/></svg>',
  evidence: '<svg width="28" height="24" viewBox="0 0 28 24"><rect x="1" y="9" width="7" height="14" rx="2" fill="currentColor"/><rect x="10.5" y="4" width="7" height="19" rx="2" fill="currentColor"/><rect x="20" y="1" width="7" height="22" rx="2" fill="currentColor"/></svg>',
  you: '<svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="12" fill="currentColor"/><circle cx="13" cy="10" r="4.2" fill="var(--paper)"/><path d="M5.5 20.5c1.8-3.2 4.5-4.6 7.5-4.6s5.7 1.4 7.5 4.6" fill="var(--paper)"/></svg>',
  bolt: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M9 1 3 9h4l-1 6 6-8H8l1-6Z" fill="currentColor"/></svg>',
};
const statusBar = () => `<div class="sb"><span>9:41</span><span class="icons">
  <svg width="19" height="12" viewBox="0 0 19 12"><rect x="0" y="8" width="3.2" height="4" rx="1" fill="currentColor"/><rect x="5" y="5.5" width="3.2" height="6.5" rx="1" fill="currentColor"/><rect x="10" y="3" width="3.2" height="9" rx="1" fill="currentColor"/><rect x="15" y="0" width="3.2" height="12" rx="1" fill="currentColor"/></svg>
  <svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 2.2c2.6 0 4.9 1 6.6 2.7l1.4-1.4A11.3 11.3 0 0 0 .5 3.5l1.4 1.4A9.3 9.3 0 0 1 8.5 2.2Zm0 4c1.5 0 2.8.6 3.8 1.5l1.4-1.4a7.3 7.3 0 0 0-10.4 0l1.4 1.4c1-.9 2.3-1.5 3.8-1.5Zm0 4 1.9-1.9a2.7 2.7 0 0 0-3.8 0l1.9 1.9Z" fill="currentColor"/></svg>
  <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".7" y=".7" width="22.6" height="11.6" rx="3.6" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.2"/><rect x="2.5" y="2.5" width="19" height="8" rx="2.2" fill="currentColor"/><rect x="24.6" y="4.3" width="1.8" height="4.4" rx=".9" fill="currentColor" fill-opacity=".5"/></svg>
</span></div>`;
const nav = (back, title, action = '') => `<div class="nav"><span class="back">${I.back}<span>${back}</span></span><span class="title">${title}</span><span class="action">${action}</span></div>`;
const tabbar = (active = 'home') => `<div class="tabbar">${[
  ['home', 'Home'], ['goals', 'Goals'], ['log', 'Log'], ['evidence', 'Evidence'], ['you', 'You']
].map(([k, l]) => `<div class="tab ${k === active ? 'on' : ''}">${I[k]}<span>${l}</span></div>`).join('')}</div>`;
const illusTag = (text = 'Illustrative') => `<span class="illus-tag">${text}</span>`;
