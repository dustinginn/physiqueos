# Watch Mineral Light white bottom bar: audit and design

**Founder report (Build 90 physical):** In Mineral Light, a white horizontal, footer-like bar shows at the bottom of every screen that uses the shared primary action treatment. Dark is unaffected.

## Which screens share that treatment

`WatchPanelPage`:

| Screen | Source |
|---|---|
| Idle / Refresh and Phone unavailable | `WatchWorkoutRootView.idle` |
| Ready for Watch → **Start Workout** | `WatchWorkoutStartView` |
| Apple Health orphan prompt (End & Save / Discard) | `WatchOrphanHealthBanner` |
| Start Workout with an orphan | `WatchWorkoutStartView` + orphan content |

These do **not** use it: the Execution, Controls, Finish confirmation, Finishing and Summary pages.
- They lay out with `WatchBelowClockPage` / `GeometryReader` frames and `WatchEdgeCapsuleButton`.
- Summary has its own `ScrollView`, with Done outside it.

## Layer audit of `WatchPanelPage` (source `WatchWorkoutViews.swift:225`)

| Candidate | Finding |
|---|---|
| Safe-area background | The root `ZStack` paints `WatchPhysiqueOSTheme.background.ignoresSafeArea()` full-bleed, Mineral `#E8ECE5`. No uncovered safe-area band exists in our tree. |
| Container background | `WatchPanelPage` paints **no** background of its own. It relies on the root. |
| GeometryReader | Used only for sizing. It draws nothing. |
| Shared action container | `WatchPanelActionLayout` places two VStacks and has no fill. `WatchActionButton` fills only its capsule. Quiet buttons (Discard) are paper `#FBFAF4`, a capsule by design and not a full-width bar. |
| **ScrollView** | **The only system-owned view in the stack.** It sits under `.ignoresSafeArea(edges: [.top, .bottom])`, so its content and the action live in the bottom edge region. From watchOS 26, ScrollView can draw a system **scroll edge effect** there (API: `scrollEdgeEffectStyle` / `scrollEdgeEffectHidden`, watchOS 26+). Under `.preferredColorScheme(.light)` that effect would be light; under Dark it would be near-black, which is invisible on `#061019`. The device rendering is inferred, not observed. |
| System affordance | None applies. There is no toolbar, NavigationStack, page indicator (`indexDisplayMode: .never` only on pagers) or Now Playing UI. |

## Reproduction attempt

Run on the watchOS **27.0** simulator (Ultra 3 49 mm and S12 42 mm), with the DEBUG probe `-watchFooterProbe`:

- Rest captures of Start, Idle, Phone unavailable, Orphan and Summary in both appearances.
- Digital Crown rotation and swipe captures driven by a UI test (`WatchFooterProbeUITests`).
- Forced overflow: `overflow` (+6 pt) and `tall` (+70 pt).
- Edge effect hidden (`*-hidden`).

**Result: the bar did not reproduce on the 27.0 simulator in any state.** A pixel scan found no near-white rows except the Discard capsule.

### Interpretation (not proven)

The bar is device-OS specific. The leading hypothesis is the ScrollView bottom edge effect on the device's watchOS 26.x, rendered in light. It explains every reported fact:

- Mineral only.
- Only the screens with the shared action panel (exactly the screens with a ScrollView).
- Dark unchanged.
- Execution and Controls unaffected.

## Is it required by watchOS?

**No.**
- These pages need no scrolling at default text sizes.
- The edge effect is optional, and public API hides it (`scrollEdgeEffectHidden(_:for:)`, watchOS 26+).
- No Apple affordance (toolbar, navigation, page indicator) is attached to these pages.

## Design (candidate, not shipped)

`WatchPanelPage.candidateBody` sits behind DEBUG probe `-watchFooterProbe fixed`. It makes three changes:

1. **No ScrollView when the panel fits.** `ViewThatFits(in: .vertical)` first offers the panel at full screen height (`WatchPanelActionLayout`, unchanged), and falls back to the ScrollView only when Dynamic Type / AX sizes overflow.
2. **The panel paints its own full-bleed background**: `WatchPhysiqueOSTheme.background` behind the page. It no longer relies on the root alone.
3. **Overflow fallback** hides the bottom scroll edge effect on watchOS 26+.

**Proof that it preserves the Build 90-approved geometry:**
- Before/after captures cover 49 mm and 42 mm × Mineral and Dark × Start, Idle, Phone unavailable and Orphan, which is 16 states.
- They are **pixel-identical below the system clock** (0 pixels differ by more than 8/255; the clock row is masked because the time differs).
- So the true-centered Start Workout, the button size and Dark all stay exactly as Build 90.
- Boards: `boards/B91-W1-watch-footer-49mm.png`, `boards/B91-W2-watch-footer-42mm.png`.

## Device verification needed

Simulator parity cannot prove the device fix. The Founder can confirm in tomorrow's review:

1. **watchOS version** on the Watch (Settings → General → About).
2. **Discriminator:** swipe right during a workout to the Controls page (Pause / Finish / Cancel, Mineral). Is the bar there?
   - If it is **not** there, that confirms the ScrollView edge effect (Controls has no ScrollView).
   - If it **is** there, the source is elsewhere, and the next probe is the root window.
3. A wrist photo of the bar, if convenient. That shows whether it is a soft fade (edge effect) or a hard band.

## Implementation plan (held)

- Promote `candidateBody` to production and delete the probe and `WatchFooterProbeUITests`.
- Add a Watch UI test asserting that no ScrollView exists on Start / Idle / Orphan at default size.
- Add a test that the AX5 overflow still scrolls.
- Run the Watch UI suite at both sizes and confirm on the physical Watch.
