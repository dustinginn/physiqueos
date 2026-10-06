PhysiqueOS Overnight Lane A — Founder final Watch Mineral clock treatment review

Continue in the EXISTING Claude A Overnight Lane A Remote Control chat using High reasoning. Same chat/worktree/branch.

FOUNDER REVIEW STATUS

Founder approves Claude A's work except for ONE visual issue:

The Mineral Light Apple Watch render currently uses a full-width dark/black band across the top to preserve contrast for watchOS's white system clock.

Founder does NOT approve the full-width band.

Everything else in Claude A is approved for now:
- Dark Watch presentation;
- Watch utility redesign generally;
- independent iPhone / Watch appearance controls;
- Watch Complete Set Review/Confirmation gating;
- timed-set projection;
- Live Activity / Dynamic Island;
- Priority Detail family;
- Morning Check-In;
- manual/backdated weight;
- Home Confidence.

Do not reopen those surfaces.

TASK

Create 2–3 focused REAL SHIPPING SWIFTUI alternatives for the Mineral Light Watch clock treatment.

This is a DESIGN-SELECTION CHECKPOINT FIRST.

Do NOT choose a winner for Founder.
Do NOT propagate one option across all Watch screens yet.
Do NOT change Dark Watch.

PROBLEM

watchOS renders the system clock in white, so the Mineral Light Watch canvas needs sufficient local contrast around the clock.

The current solution — a dark band spanning the full width/top — is visually too heavy and undermines Mineral Light.

Founder specifically suggested a small oval/capsule around the time and is open to alternatives.

OPTIONS TO TEST

At minimum render:

OPTION A — compact clock capsule
- small dark/ink oval/capsule localized behind the system clock;
- only as large as necessary for reliable white-clock contrast;
- visually centered/anchored to the real clock position;
- no full-width header treatment.

OPTION B — compact rounded clock patch
- slightly less pill-like / more watch-native rounded rectangle or localized rounded field;
- constrained tightly to the clock region;
- should visually recede into the bezel rather than look like a page header.

OPTION C — one additional restrained solution if real SwiftUI/watchOS geometry suggests something better.
Examples could include:
- a very small bezel-integrated dark island;
- a subtle localized ink gradient/halo;
- another treatment that preserves white-clock contrast without spanning the top.

Do NOT use:
- a full-width dark bar;
- a dark full header;
- a large decorative shape that competes with workout content;
- a fake clock drawn by PhysiqueOS in place of the system clock.

REAL WATCH GEOMETRY

Use the real Watch simulator and shipping view.

Test at least:
- Founder-size Apple Watch Ultra 3 / 49 mm;
- the existing smaller 42 mm fit check if practical.

The treatment must not collide with:
- progress bar;
- exercise title/current set;
- connectivity/status indicators;
- Always-On/dimmed behavior;
- safe areas/system chrome.

REVIEW BOARD

Produce one mobile-readable comparison board showing:
- current rejected full-width band as "Current / rejected";
- Option A;
- Option B;
- Option C if created.

Use the SAME representative Mineral Light Watch state for every option so Founder can compare only the clock treatment.

If helpful, include a second compact row showing the preferred options on one additional state, but do not flood the review.

No locked-reference comparison is needed; this is a Founder-directed correction to a shipping-platform constraint.

IMPLEMENTATION SAFETY

Keep each option isolated behind a DEBUG-only review seam or equivalent local review mechanism.

Do not leave multiple production code paths enabled in Release.

At this checkpoint, production behavior may remain on the current candidate treatment until Founder chooses.

Do not alter Watch appearance persistence/sync semantics.

TESTS

Only focused compile/render/accessibility checks are needed for the option board.

Do not rerun the full 2k+ suite merely to present design options.

After Founder selects an option, a separate continuation will:
- implement the selected treatment;
- propagate it across Mineral Watch screens;
- run the relevant Watch/Native regressions and Release compile;
- publish final boards.

PUBLISH

Push the comparison board to the existing Claude A branch and verify the GitHub browser link remotely.

Publish:
- exact board link;
- short explanation of each option;
- any watchOS limitation discovered.

Notify:
PhysiqueOS Watch Mineral clock — options ready for Founder selection.

STOP FOR FOUNDER SELECTION.

No merge.
No build bump.
No TestFlight.
No Server work.
No production mutation.

END TASK.