const params = new URLSearchParams(window.location.search);
const screen = params.get("screen") || "S1";
const theme = params.get("theme") === "light" ? "light" : "dark";
document.documentElement.dataset.theme = theme;

const nav = ({ back = "", title = "", action = "" } = {}) => `
  <div class="status-bar"><span>9:41</span><span class="status-glyphs">● ◒ ▰</span></div>
  <div class="nav-bar">
    <span class="nav-back">${back ? `‹ ${back}` : ""}</span>
    <span class="nav-title">${title}</span>
    <span class="nav-action">${action}</span>
  </div>`;

const tabs = (active = "You") => `
  <div class="tab-bar" aria-label="Primary navigation">
    ${[["⌂","Home"],["◎","Goals"],["＋","Log"],["▥","Evidence"],["◉","You"]].map(([glyph,label]) => `
      <div class="tab ${active === label ? "active" : ""}"><span><span class="tab-glyph">${glyph}</span>${label}</span></div>`).join("")}
  </div>`;

const header = (eyebrow, title, subtitle) => `
  <header class="screen-header">
    <div class="eyebrow">${eyebrow}</div>
    <div class="screen-title">${title}</div>
    <div class="screen-subtitle">${subtitle}</div>
  </header>`;

const row = ({ icon, tone = "", title, detail, trailing = "›" }) => `
  <div class="settings-row">
    <div class="row-icon ${tone}">${icon}</div>
    <div><div class="row-title">${title}</div><div class="row-detail">${detail}</div></div>
    <div class="row-trailing">${trailing === "›" ? '<span class="chevron">›</span>' : trailing}</div>
  </div>`;

const status = (text, tone = "") => `<span class="status-pill ${tone}">${text}</span>`;

const layouts = {
  D1: () => `
    ${nav({ back: "Evidence Hub", title: "DEXA" })}
    <div class="screen-scroll">
      ${header("DEXA Evidence", "Body composition", "BodySpec scan history and structured trends.")}
      <div class="card dexa-context">
        <div class="dexa-scan"><div><div class="dexa-label">Latest Scan</div><div class="dexa-date">Aug 30, 2026</div></div>${status("BodySpec", "neutral")}</div>
      </div>
      <section class="card delta-card">
        <div class="delta-title">Since Prior Scan</div>
        <div class="delta-grid">
          <div class="delta-column"><div class="delta-label">Body Fat</div><div class="delta-value green">+0.4 pts</div></div>
          <div class="delta-column"><div class="delta-label">Fat Mass</div><div class="delta-value amber">+1.0 lb</div></div>
          <div class="delta-column"><div class="delta-label">Lean Mass</div><div class="delta-value blue">+1.5 lb</div></div>
        </div>
      </section>
    </div>`,

  Y1: () => `
    <div class="status-bar"><span>9:41</span><span class="status-glyphs">● ◒ ▰</span></div>
    <div class="screen-scroll with-tabs">
      ${header("You", "What PhysiqueOS knows.", "Your operating profile and the controls that keep it current.")}
      <section class="card hero-card">
        <div class="hero-head"><div class="badge-icon round">D</div><div><div class="hero-kicker">Operating Status</div><div class="hero-title">Your operating system is connected.</div><div class="hero-copy">Goals, plans, and source-aware evidence remain in their established homes.</div></div></div>
        <div class="facts"><div class="fact"><div class="fact-label">Goals</div><div class="fact-value">1 active</div></div><div class="fact"><div class="fact-label">Protocols</div><div class="fact-value">6 active</div></div><div class="fact"><div class="fact-label">Sources</div><div class="fact-value">1 connected</div></div></div>
      </section>
      <section class="section card group">
        ${row({ icon: "◎", title: "Goals", detail: "1 active goal" })}
        ${row({ icon: "▦", tone: "blue", title: "Operating Plan", detail: "Current strategy and protocols" })}
        ${row({ icon: "⚙", tone: "violet", title: "Settings", detail: "Profile, data sources, and appearance" })}
      </section>
    </div>
    ${tabs("You")}`,

  S1: () => `
    ${nav({ back: "You", title: "Settings" })}
    <div class="screen-scroll">
      ${header("Settings", "Keep PhysiqueOS yours.", "A small set of controls for identity, connected data, and this device.")}
      <div class="section-label">Personal</div>
      <section class="card group">
        ${row({ icon: "D", title: "Profile", detail: "Name, height, time zone, and units", trailing: "Dustin  ›" })}
      </section>
      <div class="section-label section">Connected Data</div>
      <section class="card group">
        ${row({ icon: "♥", tone: "green", title: "Data Sources", detail: "What PhysiqueOS receives and sends", trailing: `${status("Connected")} <span class="chevron">›</span>` })}
      </section>
      <div class="section-label section">App</div>
      <section class="card group">
        ${row({ icon: "◐", tone: "violet", title: "Appearance", detail: "System, Dark, or Mineral Light", trailing: "System  ›" })}
      </section>
      <div class="section-label section">Account</div>
      <section class="card group">
        <div class="plain-row"><div><div class="plain-label">Dustin</div><div class="row-detail">This iPhone · secure session active</div></div>${status("Connected")}</div>
        <div class="plain-row"><span class="plain-label destructive">Sign Out</span><span class="plain-value">This device</span></div>
      </section>
      <div class="plain-row"><span class="plain-value">PhysiqueOS 1.0</span><span class="plain-value">Build 85</span></div>
    </div>`,

  P1: () => `
    ${nav({ back: "Settings", title: "Profile", action: "Save" })}
    <div class="screen-scroll">
      ${header("Profile", "The details PhysiqueOS uses.", "Used for daily timing, measurements, and how your name appears.")}
      <section class="card identity-row"><div class="avatar">D</div><div><div class="identity-name">Dustin</div><div class="identity-detail">Owner profile · synced with PhysiqueOS</div></div></section>
      <div class="section-label section">Basic Details</div>
      <section class="card form-card">
        <div class="field"><div class="field-label">Preferred name</div><div class="field-control"><span>Dustin</span><span class="field-hint">Shown across PhysiqueOS</span></div></div>
        <div class="field"><div class="field-label">Height</div><div class="field-control"><span>6 ft 4 in</span><span class="chevron">›</span></div></div>
        <div class="field"><div class="field-label">Time zone</div><div class="field-control"><span>America/Los_Angeles</span><span class="chevron">›</span></div></div>
        <div class="field"><div class="field-label">Weight units</div><div class="field-control"><span>Pounds (lb)</span><span class="chevron">›</span></div></div>
      </section>
      <div class="save-bar"><div class="button-primary">Save Profile</div></div>
    </div>`,

  DS1: () => `
    ${nav({ back: "Settings", title: "Data Sources" })}
    <div class="screen-scroll">
      ${header("Data Sources", "Where your data comes from.", "Connection and direction only. Evidence remains in Evidence.")}
      <div class="section-label">Connected</div>
      <section class="card source-card">
        <div class="source-head"><div class="source-mark">♥</div><div><div class="source-name">Apple Health</div><div class="source-copy">Receives health and workout data. Sends selected body composition results.</div></div>${status("Connected")}</div>
        <div class="domains"><span class="domain-chip">Activity</span><span class="domain-chip">Workouts</span><span class="domain-chip">Nutrition</span><span class="domain-chip">Sleep</span><span class="domain-chip">Body Composition ↗</span></div>
      </section>
      <section class="section card group">
        ${row({ icon: "♥", tone: "green", title: "Apple Health", detail: "View access and data directions", trailing: "›" })}
      </section>
      <p class="footnote">Manual entries, uploads, and PhysiqueOS Logger sessions are product inputs—not external connections—and stay out of this list.</p>
    </div>`,

  DS2: () => `
    ${nav({ back: "Data Sources", title: "Apple Health" })}
    <div class="screen-scroll">
      <section class="card source-card">
        <div class="source-head"><div class="source-mark">♥</div><div><div class="source-name">Apple Health</div><div class="source-copy">Health access is active on this iPhone.</div></div>${status("Connected")}</div>
      </section>
      <div class="section-label section">PhysiqueOS Receives</div>
      <section class="card group">
        <div class="domain-row"><div><div class="domain-name">Activity</div><div class="domain-detail">Steps, active energy, exercise, stand, distance, flights</div></div>${status("Active")}</div>
        <div class="domain-row"><div><div class="domain-name">Workouts & Cardio</div><div class="domain-detail">Workout type, duration, heart rate, energy, distance</div></div>${status("Active")}</div>
        <div class="domain-row"><div><div class="domain-name">Nutrition</div><div class="domain-detail">Energy, protein, carbohydrates, fat, fiber</div></div>${status("Active")}</div>
        <div class="domain-row"><div><div class="domain-name">Sleep</div><div class="domain-detail">Sleep stages and source-aware nightly episodes</div></div>${status("Active")}</div>
      </section>
      <div class="section-label section">PhysiqueOS Sends</div>
      <section class="card group">
        <div class="domain-row"><div><div class="domain-name">DEXA Body Composition</div><div class="domain-detail">Body fat percentage and lean body mass only</div></div>${status("On")}</div>
        <div class="domain-row"><div><div class="domain-name">Weight</div><div class="domain-detail">Not written by PhysiqueOS</div></div>${status("Off", "neutral")}</div>
      </section>
      <div class="section"><div class="button-secondary">Review Access in Health</div></div>
    </div>`,

  DS3: () => `
    ${nav({ back: "Data Sources", title: "Apple Health" })}
    <div class="screen-scroll">
      <section class="card source-card">
        <div class="source-head"><div class="source-mark">♥</div><div><div class="source-name">Apple Health</div><div class="source-copy">Some categories have no data visible to PhysiqueOS.</div></div>${status("Action Needed", "warn")}</div>
      </section>
      <section class="section callout">Review access in Health. Apple does not reveal whether read access was denied, so PhysiqueOS reports only what is visible.</section>
      <div class="section-label section">PhysiqueOS Receives</div>
      <section class="card group">
        <div class="domain-row"><div><div class="domain-name">Activity</div><div class="domain-detail">Recent data visible</div></div>${status("Active")}</div>
        <div class="domain-row"><div><div class="domain-name">Workouts & Cardio</div><div class="domain-detail">Recent data visible</div></div>${status("Active")}</div>
        <div class="domain-row"><div><div class="domain-name">Nutrition</div><div class="domain-detail">No recent data visible</div></div>${status("Review", "warn")}</div>
        <div class="domain-row"><div><div class="domain-name">Sleep</div><div class="domain-detail">No recent data visible</div></div>${status("Review", "warn")}</div>
      </section>
      <div class="section-label section">PhysiqueOS Sends</div>
      <section class="card group"><div class="domain-row"><div><div class="domain-name">DEXA Body Composition</div><div class="domain-detail">Export is currently off</div></div>${status("Off", "neutral")}</div></section>
      <div class="section"><div class="button-primary">Review Access in Health</div></div>
    </div>`,

  A1: () => `
    ${nav({ back: "Settings", title: "Appearance" })}
    <div class="screen-scroll">
      ${header("Appearance", "Choose how PhysiqueOS looks.", "System is the default. Light uses the locked Mineral Light palette.")}
      <section class="appearance-list">
        <div class="appearance-option selected"><div class="appearance-preview ${theme === "light" ? "light" : ""}"><div class="preview-bar"></div><div class="preview-card"></div><div class="preview-lines"><span></span><span></span></div></div><div><div class="appearance-name">System</div><div class="appearance-detail">Matches this iPhone and changes automatically.</div></div><div class="check">✓</div></div>
        <div class="appearance-option"><div class="appearance-preview"><div class="preview-bar"></div><div class="preview-card"></div><div class="preview-lines"><span></span><span></span></div></div><div><div class="appearance-name">Dark</div><div class="appearance-detail">Deep navy surfaces with bright semantic accents.</div></div><div class="empty-check"></div></div>
        <div class="appearance-option"><div class="appearance-preview light"><div class="preview-bar"></div><div class="preview-card"></div><div class="preview-lines"><span></span><span></span></div></div><div><div class="appearance-name">Light</div><div class="appearance-detail">Mineral Light surfaces with dark readable type.</div></div><div class="empty-check"></div></div>
      </section>
      <p class="footnote">Selecting Dark or Light moves the checkmark and applies that appearance immediately across the app.</p>
    </div>`
};

const content = layouts[screen] ? layouts[screen]() : layouts.S1();
document.getElementById("screen-root").innerHTML = `<div class="capture-stage"><article class="phone" aria-label="PhysiqueOS ${screen} ${theme}">${content}</article></div>`;
