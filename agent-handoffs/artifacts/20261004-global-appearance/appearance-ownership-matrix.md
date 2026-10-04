# Global appearance ownership matrix

Implementation authority: `codex/global-appearance-infrastructure-20261004` at `d5359e33845cba20a212dade24c25e94f02aee6e`.

Classification key:

1. inherits iOS/system appearance automatically;
2. resolves through shared PhysiqueOS semantic tokens;
3. owns a separate platform/component palette with explicit paired behavior;
4. remains geometrically deferred because its locked redesign implementation has not landed.

| Appearance owner | Class | Implemented behavior | Scope boundary |
| --- | --- | --- | --- |
| App root and tab/navigation containers | 1 + 2 | `System` supplies no root override; explicit Dark/Light supply `.dark`/`.light`; the shared background/text/surface tokens resolve from the active trait collection. | Does not implement locked screen geometry. |
| Sheets and full-screen covers | 1 + 2 | Inherit the root scheme and dynamic tokens. The prior fixed-dark Recovery nights sheet override was removed. | System-owned presentation chrome remains system-owned. |
| Alerts, confirmation dialogs, keyboards and pickers | 1 | Inherit the effective root scheme. | No custom recoloring of OS chrome. |
| Forms and app-owned controls | 1 + 2 | Native control appearance follows the root; custom labels, borders, fills and status colors use semantic tokens. | Existing layout remains unchanged. |
| Home and Log | 2 + 4 | Current shipping geometry now resolves Dark/Mineral Light through shared tokens. | Locked next-generation Home/Log compositions are not broadly implemented here. |
| Briefings | 2 + 4 | Existing briefing surfaces resolve shared canvas, text, surface and chart semantics. | Locked briefing composition remains deferred; intentional purple hero gradients remain component-owned. |
| Evidence intake/review and evidence presentation | 2 + 4 | Existing token-owned surfaces migrate; semantic evidence/status colors retain meaning. | Locked Evidence redesign geometry remains deferred. Photo inspection keeps an intentional black inspection canvas. |
| Goals | 2 + 4 | Current Goals family resolves shared token pairs. | Locked hierarchy styling remains deferred. |
| Priority Detail | 2 + 3 | Shared controls migrate; the accepted Foam Rolling pilot retains its existing explicit paired dark/Mineral palette. | No other Priority Detail redesign is implemented. |
| Operating Plan | 2 + 4 | Current strategy/configuration surfaces resolve shared pairs. | Locked redesign geometry remains deferred. |
| Training Logger | 2 + 4 | Existing logger uses the shared dynamic palette and keeps its canonical interactions. | Locked Compact Command Center composition remains deferred. |
| You / Settings / Appearance | 2 | You receives the narrow real Settings doorway; Settings exposes only Appearance; selected state has checkmark, text and accessibility value. | Profile, Data Sources and Sign Out remain open and are not dead rows. |
| Media/photo inspection | 3 | Black inspection canvas and translucent controls remain intentionally image-viewer-specific in either appearance. | This is not an accidental fixed-dark product page. |
| Home Screen Widget | 3 | Widget-owned dark/Mineral token pairs resolve from WidgetKit's `colorScheme`; the iPhone preference is not treated as an extension contract. | Physical-device widget appearance remains on the release checklist. |
| Live Activity / Dynamic Island | 3 | Existing ActivityKit-owned palette and platform legibility semantics are preserved. | The iPhone preference is not forced into ActivityKit. |
| Watch app | 3 | Watch retains its current watchOS-owned dark presentation and receives no iPhone preference transport. | Claude's Watch/HealthKit behavior is untouched; a future Watch appearance decision is independent. |

## Hard-coded color audit

- The app root is the sole shipping iPhone `preferredColorScheme` owner after this change.
- Component-local fixed colors remain only where meaning or viewing context owns them: photo inspection black, briefing hero gradients, Evidence stream identity colors, and the accepted Foam Rolling paired palette.
- Category 4 means the accepted redesign's composition/geometry is still deferred. It does not mean an intentionally fixed-dark screen remains.

