PhysiqueOS Build 90 — Founder next-round Native design review

TASK TYPE

NEW Claude Remote Control chat.
Use High reasoning.

DESIGN / PRODUCT REVIEW FIRST.

Do not implement the final production changes yet except for minimal DEBUG/review seams required to render real shipping SwiftUI options.

Build 89 is VALID in TestFlight at shipped source:
51399425b683d6a6e36b5c91836290259e31a7e0

Use Build 89 shipped source as design authority/base.

Do not include or depend on the separate Server progression correction.

GOAL

Create a coherent Founder review package for the four currently approved Build 90 Native items.

Founder wants design options where specified, then implementation will happen after selection.

ITEM 1 — IPHONE LOGGER REST STOPWATCH

Backlog authority:
GitHub issue #7.

Product intent:
phone-only users need a first-class rest stopwatch directly in the active Logger. Live Activity cannot be the only phone-visible stopwatch.

Architecture:
- audit/reuse existing canonical workout/rest timer authority;
- do not create a separate timer state machine;
- phone-only works without Watch or Live Activity;
- Watch/phone/Live Activity remain synchronized when present.

DESIGN OPTIONS

Produce 2–3 real SwiftUI options.

Founder currently leans toward:
Option A — stopwatch floating with/adjacent to the sticky Finish Workout region at the bottom.

Also explore:
Option B — compact persistent timer pill immediately above the footer;
Option C — restrained split-action/footer treatment if it preserves Finish Workout prominence.

Show at least:
- no active rest;
- active stopwatch rest;
- long scrolled workout state.

The control must not obscure set rows or bottom nav.

Do not choose winner.

ITEM 2 — GUIDED IPHONE → WATCH HANDOFF

Backlog authority:
GitHub issue #8.

Current Build 89 “Ready for Watch · before first set only” assumes the user understands the protocol.

Desired flow when paired/reachable Watch exists:

1. entering active Logger before first set presents lightweight setup sheet;
2. primary: Ready on Watch;
3. secondary: Use without Watch;
4. Ready initiates existing Watch handoff;
5. surface PhysiqueOS Watch app/pre-workout Start Workout state as far as watchOS legitimately permits;
6. phone waits for truthful Watch acknowledgment;
7. acknowledgment dismisses sheet automatically and reveals normal Logger;
8. existing workout authority continues.

If watchOS cannot reliably foreground the app:
show truthful instruction to open PhysiqueOS on Watch and tap Start Workout.

Use without Watch:
- immediate first-class path;
- no nagging again during same workout;
- no degraded Logger;
- naturally pairs with Item 1 stopwatch.

AUDIT FIRST

Determine what watchOS/WatchConnectivity actually permits:
- foreground/activation constraints;
- reachable vs paired;
- acknowledgment authority;
- Watch app not running;
- locked/asleep;
- stale session;
- restore/relaunch.

Do not promise impossible automatic launch behavior.

DESIGN OPTIONS

Produce 2–3 real SwiftUI sheet/overlay treatments covering:
- paired/reachable initial state;
- connecting/waiting state;
- Watch acknowledged state;
- paired but unreachable fallback;
- Use without Watch.

Founder wants this lightweight, not a wizard.

Also propose what replaces/removes the large Ready for Watch card after the guided flow exists.

Do not choose winner.

ITEM 3 — PHOTO BRIEFING EXPANDED VIEWER

Founder feedback from Build 89 physical review:

Current expanded paired-photo viewer has large uniform blank columns above/below the actual photos. It visually implies missing/incomplete content.

Desired:
- keep side-by-side Previous/Current synchronized comparison;
- keep pinch-to-zoom and synchronized pan;
- create a deliberately bounded photo-comparison stage;
- remaining screen area should read as page background, not empty image containers;
- move/show the canonical pose interpretation directly BELOW the expanded photo stage;
- keep Previous/date and Current/date attached clearly to respective images;
- make expanded viewer feel complete and intentional;
- do not add decorative filler merely to occupy space.

Example interpretation belongs below the pair:
“Shoulder and upper back width maintained with no visible reduction in muscle fullness.”
Use canonical persisted Photo Briefing interpretation, never hard-code example.

DESIGN OPTIONS

Produce 2–3 real SwiftUI treatments varying:
- stage height/aspect behavior;
- stage/background separation;
- date/Previous/Current labeling;
- interpretation placement;
- zoom affordance/footer treatment.

Test portrait photos like Front and Rear relaxed and a wider/flexed pose.

Dark + Mineral Light.

Do not choose winner.

ITEM 4 — WATCH PRIMARY BUTTON VERTICAL PLACEMENT

Founder physical review:
on the relevant Mineral Watch screen, the primary button is unnecessarily pinned near the bottom, leaving excessive dead space.

Desired:
- center the primary action vertically within the usable content area beneath the status/title content;
- preserve button size/style/tap target/action;
- preserve other Watch geometry;
- no need to redesign the screen.

Audit which Watch state/screen the Founder screenshot corresponds to and identify shared component impact.

Produce:
- Current;
- Option A centered;
- optionally Option B slightly above true center if optical balance warrants.

Founder already strongly prefers centered; this can be a small comparison rather than a broad redesign.

49 mm Founder Watch + 42 mm fit check.
Dark + Mineral Light if shared.

DESIGN SYSTEM / SCOPE

Use Build 89 accepted redesign grammar.

Do not reopen:
- general Home/Evidence/Goals/You redesign;
- Briefings other than expanded Photo viewer;
- Logger set typography;
- Suggested Today;
- Live Activity redesign;
- Watch Mineral clock capsule;
- Priorities/Morning Check-In;
- progression semantics.

No Server work.

REAL SWIFTUI

Review options must be real shipping SwiftUI components/state where practical, not Figma/mock HTML.

Use DEBUG-only review seams if needed.
No Release leakage.

REVIEW PACKAGE

Create one mobile-readable Build 90 review index plus focused boards:

B90-1 Logger stopwatch options.
B90-2 Watch handoff sheet options/states.
B90-3 Photo viewer options.
B90-4 Watch button placement.

Each board:
- label Current where useful;
- label Option A/B/C clearly;
- use same representative data/state across options;
- include Dark/Mineral where material;
- avoid giant boards that are hard to inspect on phone.

Push boards to branch and verify GitHub browser links remotely.

Do not publish private Founder photos unnecessarily beyond the existing accepted review-artifact policy. If real Photo Briefing media is already safely available in the existing review harness, use it only in the same controlled artifact scope; otherwise use faithful safe fixtures for layout selection and reserve real-media validation for device acceptance.

TECHNICAL FINDINGS

Alongside boards, publish a concise implementation audit for each item:
- source files/components;
- state authority;
- expected conflicts;
- architecture constraints;
- test plan;
- whether Server changes are needed;
- whether Item 1 + Item 2 should be implemented together.

For Watch handoff, explicitly document what automatic Watch surfacing is technically possible vs not guaranteed.

STOP FOR FOUNDER SELECTION

Do NOT implement final production behavior after creating the boards.

Do NOT bump Build 90.
Do NOT upload TestFlight.
Do NOT deploy Server.
Do NOT mutate production.

Publish main-visible report-only handoff pointing to review boards.

Notify:
PhysiqueOS Build 90 design round — Founder options ready for review.

STOP.

END TASK.