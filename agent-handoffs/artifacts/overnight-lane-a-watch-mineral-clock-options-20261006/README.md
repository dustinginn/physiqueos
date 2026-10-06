# Mineral Light Watch — system clock contrast options (Founder selection)

**Status: options ready for Founder selection.** No option is chosen or propagated. Release still renders the current production treatment (`band`).

- **Board:** `clock-options.png`. The representative Mineral Light execution state (set 2 of 3, rest running) is identical in every row; only the clock treatment differs.
- **Devices:** the Ultra 3 (49 mm, yours) and a 42 mm fit check, plus one compact row on the Workout Metrics page.
- **Raw captures:** `screens/`.
- **Rendering:** real shipping SwiftUI on the watchOS 27 simulator. The system clock is the real watchOS clock; PhysiqueOS never draws a clock.

## Options

| Option | What it is | Notes |
|---|---|---|
| **Current / rejected** — full-width band | An ink band across the whole top safe area. | The candidate you rejected. Shown for reference only. |
| **A — compact clock capsule** | A small ink pill (21 pt tall) around the time: 8 pt of horizontal padding, centered on the real clock. | The lightest touch, and closest to your suggestion. |
| **B — corner patch from the bezel** | A rounded ink field in the top-trailing corner, flush with the top edge (only the bottom corners are rounded), ending just above the header line. | It reads as the black bezel dipping into the corner rather than a page header. A little heavier than A. |
| **C — soft ink halo** | An elliptical ink gradient: opaque under the digits, fading to the mineral canvas. | No hard edge. The fade slightly darkens the end of the header line ("PUSH · PULL"), so it is the least crisp. |

A, B and C all clear the progress bar, the title/status line and the page indicator on both case sizes. All are non-interactive and hidden from VoiceOver.

## watchOS limitations found

- **White clock.** watchOS always draws the system time in white, and no API recolors it or reports its frame. In the real geometry, this is why the Mineral page needs local ink.
- **Clock anchor.** It is measured from the simulators: vertical center at half the top safe area, and the trailing edge about 8% of the screen width in from the edge, on both 49 mm and 42 mm.
- **Clock width.** It is estimated from the digit count of the current time (about 10 pt per digit plus the colon) and re-measured each minute. So A and B fit "7:00" and "12:58" alike.
- **Physical check still needed.** Clock metrics on a physical Ultra 3 should match the simulator. A one-glance check after you pick is still worthwhile.

## Implementation safety

- **DEBUG-only review seam:** `-watchClockTreatment band|capsule|patch|halo`.
- **Release:** always resolves to the current `band`.
  - The Release Watch build succeeds.
  - The seam string is absent from the Release binary.
- **Untouched:** Dark Watch, Watch appearance persistence/sync and every other surface.

## Next

Pick A, B or C (or ask for a tweak). A separate continuation will then:
- make it the Mineral production treatment and remove the others;
- propagate it across all Mineral Watch screens;
- run the Watch/Native regressions and the Release compile;
- publish the final boards.
