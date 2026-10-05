PhysiqueOS Build 87 Home physical-acceptance corrections

TASK TYPE

Continue in Codex A / existing Batch 1 chat.
Use High reasoning.
Same chat.

Founder physical-device review of Build 87:
- Goals root + all Goal subpages: ACCEPTED.
- You / Settings: ACCEPTED.
- Home: accepted except for exactly three small parity defects below.

Do not reopen Goals or You/Settings.
Do not begin Batch 2.

CURRENT AUTHORITY

Build 87 uploaded head:
f66c7fc690b1b61094e620791ee2d4a40caf3799

Accepted Batch 1 implementation:
c4a74ad0855a0500e42a90a81d6f4a871e5cc3c5

Frozen Home design authority is the final corrected Home reference used during Batch 1 acceptance.

CORRECTION 1 — BRIEFING TILE

The purple “LATEST BRIEFING” eyebrow was intentionally removed in the final accepted Home design.

Keep it removed.

The shipping Build 87 tile still behaves geometrically as though that eyebrow occupies space, causing the actual briefing text/title/status to truncate around “Weekly Briefing R…”.

Correct the tile so the real canonical briefing title/status can consume the freed space.

Requirements:
- no purple Latest Briefing eyebrow;
- preserve canonical briefing content;
- allow the main briefing text to use the available width/height;
- avoid unnecessary truncation;
- preserve icon and arrow treatment;
- preserve locked tile dimensions unless a tiny internal layout correction is required;
- validate realistic long Weekly/Midweek text, not only a short fixture.

CORRECTION 2 — TOP REMAINING METRIC

Build 87 shows:
REMAINING —
when the locked target/current canonical state should show:
REMAINING
4 weeks

Restore the canonical remaining-period value.

Do not hard-code “4 weeks”.
Trace the current Goal/phase data and derive the same value used by the accepted target.

CORRECTION 3 — ACTIVE PHASE TIMELINE DETAIL

Under:
PHASE 2 · ACTIVE
Lean Mass Build

Build 87 omits the canonical detail line, leaving a visible gap.

Restore:
Aug 15 – Oct 31 · about 4 weeks remaining

Do not hard-code the dates/text.
Derive from canonical Phase 2 start/end/current remaining semantics.

Preserve the existing:
5.8 of 10 lb gained
line below it.

PIXEL PARITY

Render real iPhone simulator Home in Dark + Mineral Light using realistic current content.

Compare directly against the frozen corrected Home reference.

Inspect every pixel around:
- top four metrics;
- Primary Goal/phase timeline;
- briefing tile.

Do not stop at semantic correctness. Correct spacing, line breaks, typography, baseline, padding and truncation until those regions match the accepted reference as closely as system rendering allows.

TESTS

Add/update deterministic tests proving:
- Remaining derives correctly and does not regress to em dash when phase timing is available;
- active Phase 2 date/remaining detail renders from canonical data;
- briefing tile has no Latest Briefing eyebrow;
- realistic Weekly/Midweek briefing text receives the freed layout space.

Run focused Home tests and relevant Batch 1 regression tests.
Release compile if source changes warrant it.

BUILD

Do NOT upload another TestFlight build in this task yet.
Publish the corrected candidate and real-simulator Dark/Mineral images first for Founder review.
We will decide whether to batch the correction into the next build after visual acceptance.

OUTPUT

Publish concise correction report and main-visible comparison artifact.
State exact candidate SHA.

STOP for Founder review.

END TASK.