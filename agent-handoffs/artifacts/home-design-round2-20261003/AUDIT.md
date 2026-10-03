# PhysiqueOS Home Round 2 audit

Date: 2026-10-03  
Scope: design exploration only; no shipping Native or Server implementation change.

## Authority

- Round 2 prompt authority: `031df6f138c2f2332d63879302a1573e19f5d225`
- Native Build 84 source authority: `bcd92c74602695766c270fe6af052de45afece4b`
- Exact Founder visual anchors: `screens/anchor-a-light.jpg` and `screens/anchor-b-dark.jpg`
- Native composition: `ios/PhysiqueOS/Presentation/Home/HomeView.swift` and its existing Home components
- Theme/type/navigation: `SharedUI/PhysiqueOSTheme.swift`, `SharedUI/Typography.swift`, `RootTabView.swift`
- Content contract: `Contracts/HomeReadModel.swift`
- Round 2 content authority: immutable [FIXTURE.json](FIXTURE.json)

The comparison is rendered at 402 × 874 pt above the fold (iPhone 17 Pro geometry) with safe-area and pinned-tab allowances. Full-page exports retain every canonical Home field.

## Anchor synthesis

Hybrid Dark retains anchor B's navy/open Goal hierarchy while adopting anchor A's contained trajectory and priority treatment. Hybrid Light brings the same structure into a warm, true-light palette rather than inverting dark colors. Hybrid Compact applies the synthesis with the explicit goal of exposing priorities above the fold.

Across all three, Latest Briefing is a clear action. Its prompt remains in the immutable fixture and moves behind the action; type, title and date stay visible. The confidence ring says `CONFIDENCE`, matching Native code, rather than inheriting the anchor's `MODERATE` caption.

## True iOS light appearance feasibility

Classification: **B — partially theme-capable, dark-only today**. Home's views mostly consume centralized tokens, which is a useful foundation, but those tokens are fixed dark RGB values and the app explicitly forces dark system appearance.

Direct code evidence:

- `App/PhysiqueOSApp.swift:94` applies `.preferredColorScheme(.dark)` to the root. The adjacent comment correctly notes that keyboards, pickers, alerts and share sheets follow that override.
- `SharedUI/PhysiqueOSTheme.swift:3-29` declares fixed dark `Color(hex:)` values. Its own comment says it is “still not a design system.”
- `Presentation/Root/RootTabView.swift:76` applies the single purple `accent` globally to tab tint.
- The asset catalog contains AppIcon only; there are no light/dark semantic color sets to extend.
- UIKit bridges resolve SwiftUI colors directly: `DEXAHistoryView.swift:561` sets the background from `PhysiqueOSTheme.background`; `NumericEditField.swift:25` sets `surfaceMuted`.
- Fixed appearance assumptions also occur in Briefing presentation gradients/dividers, photo inspection's deliberately black viewer, category chart colors, a dark-only Recovery/Sleep preview and Watch app forcing dark.

The central token file and reusable Home components make a Home-only experiment feasible without changing data or behavior. It is not sufficient to remove the root override: system chrome could become light while custom surfaces remain dark.

### Recommended adaptive token architecture

Preserve semantic names and introduce appearance-resolved values:

- foundation: `background`, `surface`, `surfaceElevated`, `surfaceTinted`, `separator`;
- content: `textPrimary`, `textSecondary`, `textMuted`;
- identity/interaction: `brand`, `interactive`, `selected`;
- state: `success`, `evidence`, `warning`, `destructive`;
- data identities: retain dedicated sleep, nutrition, weight, DEXA and energy-series tokens.

Implement the palette as either light/dark Asset Catalog color sets or an environment-backed `PhysiqueOSPalette` that resolves both SwiftUI `Color` and UIKit `UIColor`. Components should consume semantics, not branch on `colorScheme` locally. Purple remains the brand accent; blue/navy handles primary interaction, teal handles evidence/information, green handles active/on-track, amber handles guardrail/completion/time-sensitive meaning, and red stays destructive.

### Affected implementation surfaces

- Root appearance and tab/navigation chrome.
- `PhysiqueOSTheme`, `HomeColorToken`, reusable cards, headings, icon/status components and confidence ring.
- UIKit-backed controls and bridges.
- Sheets, alerts, share sheets, keyboards, pickers and disabled states.
- Charts, briefing gradients/dividers, external imagery and photo viewer treatment.
- Widgets, Live Activities and Watch if “true iOS light appearance” is app-wide rather than Home-only.

### Complexity and risk

- **Home-only light concept: Medium.** Add adaptive tokens, preserve existing content/actions, verify Home sheets/system controls and run contrast/Dynamic Type/VoiceOver checks.
- **Full app system appearance: High.** Remove the root force only after adaptive tokens cover every surface and UIKit bridge, then QA charts, briefings, photos, system chrome, widgets, Live Activities and Watch.
- The photo viewer should remain black by intent. Data-series colors should remain stable identities and gain appearance-specific contrast support rather than being arbitrarily recolored.

## Typography

Current Home uses Plus Jakarta Sans plus raw system-font calls. The actual inventory spans 7, 8, 9, 10, 10.5, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22 and 34 pt, with medium, semibold, bold, heavy and black. The smallest values occur in Goal progress/status metadata and priorities; heavy/black appears at several nested hierarchy levels.

Round 2 uses a smaller implementable scale:

- 11 pt / 600–700: eyebrow, state and metadata label;
- 13 pt / 500–600: supporting metadata;
- 15 pt / 500–650: body and actionable row content;
- 18 pt / 650–750: card and hero title;
- 28–32 pt / 700–750: Founder display name.

Compact may use 10 pt only for nonessential uppercase labels and must expand/reflow at accessibility sizes. The font family stays unchanged.

## Direction feasibility

### Hybrid Dark

Medium complexity. Reuse current models, header/hero/ring logic, phase models, FocusTile and navigation. Add action-only Briefing and compact ruled Goal variants. It preserves the recognizable dark navy/purple identity while moving interaction, evidence, success and guardrail into semantic colors.

### Hybrid Light

Medium for Home-only, high for an app-wide appearance launch. Reuse structural views/models; replace fixed dark color literals with adaptive semantic tokens. Warm canvas, white content surfaces and navy action preserve legibility without making the product generic.

### Hybrid Compact

Medium complexity. Reuse every model and destination while adding compact header, hero, Goal row, Briefing and FocusTile layouts. At accessibility categories, one-line and side-by-side structures must stack.

### Experimental A — Trajectory Ribbon

High complexity. An edge-to-edge teal/navy trajectory field replaces the default card stack; Goal and priorities become open editorial sections. This explicitly challenges heavy cards. Reuse data models, ring logic and destinations; add field and ruled-section primitives.

### Experimental B — Mineral Mosaic

High complexity. The mineral/oxide palette, asymmetric corners and phase rails create a substantially different surface/color relationship. Reuse content models; most palette and surface modifiers would be new.

### Experimental C — Split Command

High complexity. The hierarchy changes materially: confidence/status, next action and priorities precede Briefing and the full Goal narrative. Reading and VoiceOver order must match visual order. This is exploration only; no IA change is accepted.

## Accessibility constraints

- Actions and priority completion hit regions remain at least 44 × 44 pt even when visible icons are smaller.
- State is always paired with labels, icons or progress geometry; color is never the sole carrier.
- Compact rows must become stacked layouts under accessibility Dynamic Type, not truncate canonical values.
- Light surfaces require automated contrast tests plus real-device checks for disabled/secondary states and system controls.
- New open/ruled structures must expose explicit VoiceOver grouping and headings; rules alone cannot define hierarchy.

## Boundary confirmation

These are disposable rendered studies built from recreated components and one production-derived fixture. No shipping SwiftUI file, production content projection, Server behavior, API contract or TestFlight build was changed. No direction is ranked or accepted.
