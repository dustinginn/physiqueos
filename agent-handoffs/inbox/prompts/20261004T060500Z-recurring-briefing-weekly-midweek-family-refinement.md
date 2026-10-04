PhysiqueOS recurring briefing family — Weekly/Midweek parity refinement with Recovery graphing

TASK TYPE

Codex design exploration + content-contract audit only.

Do not modify shipping Native UI yet.
Do not deploy Server changes.
Do not create TestFlight.
Do not activate Recovery strategically.
Do not rewrite existing tuned canonical narrative copy except where the Founder explicitly authorizes section-level inclusion/removal below.

FOUNDER DECISION

The locked Weekly visual direction is accepted:
Immersive Story hero + Dense Analytical body.

The first Midweek translation is largely correct visually, but this pass must fix recurring-briefing family consistency.

The Founder wants Weekly and Midweek to share the SAME CORE SECTIONS, with Midweek using a more condensed amount of copy/content appropriate to its shorter Sunday–Tuesday horizon.

Monthly will be handled next, but this pass should create rules that can carry forward.

CRITICAL SOURCE FINDINGS FROM GH

Read and use:

agent-handoffs/reports/20260927T234500Z-briefing-intelligence-shared-layer-design.md
agent-handoffs/reports/20261001T215335Z-recovery-briefing-v1-design-architecture.md

Important confirmed facts:

1. "Still Unresolved" is NOT a legitimate briefing section.
   Historical audit found Server items marked surfaced:false were rendered anyway by Native.
   This was a client presentation discrepancy/regression.
   Do not preserve or redesign this section.
   It should not appear in Weekly, Midweek, Monthly, DEXA or Photo briefing mockups.

2. Recovery V1 is explicitly designed for all recurring cadences:
   Weekly, Midweek and Monthly.

Recommended Recovery placement:
- Weekly: after Training and before Body Composition / Coach's Take.
- Midweek: after Training and before Coach's Take.
- Monthly: after Energy Evolution and before outcome/editorial sections.

Recovery remains Confidence-decoupled and presentation-only until strategic graduation is separately approved.

REFERENCE IMAGES

Founder will attach:
- locked Weekly + Midweek family comparison;
- Recovery prototype examples showing preferred compact Sleep graphing and Green/Yellow/Red states.

Use the attached images as visual references.

Do not copy prototype styling literally.
Translate the graphing/data-density ideas into the NEW locked briefing visual system.

RECURRING BRIEFING CORE-SECTION CONTRACT

For Weekly and Midweek, establish the same core section inventory.

Founder direction:

1. Hero / Confidence / canonical narrative lead
2. Energy
3. Weight
4. Body Composition
5. Training
6. Recovery
7. Biggest Takeaway
8. What To Do
9. What To Watch / Into Next Week as cadence-appropriate canonical close
10. review/provenance footer

Exact canonical naming/copy remains Server-owned.

The intent is SECTION PARITY, not necessarily identical word count.

MIDWEEK
- same conceptual sections;
- more concise because it covers Sunday–Tuesday;
- only evidence actually available in the partial window;
- never fabricate completed-week claims;
- do not call emerging signals persistent;
- existing Midweek V3 restraint remains.

WEEKLY
- fuller completed-week treatment;
- same core sections;
- completed Sunday–Saturday data.

BODY COMPOSITION

Founder explicitly wants Body Composition present in BOTH Weekly and Midweek when current body-composition context is available.

The current Weekly design fixture omitted it because that fixture had bodyComposition=null.

For this design refinement:
- audit real production/body-composition authority;
- use a real available body-composition context if possible;
- do not fabricate DEXA values;
- show how Weekly Body Composition should render in the locked Weekly body;
- keep the Midweek Body Composition section but correct its visual consistency.

If Body Composition is conditionally unavailable in a real period, preserve legitimate absence semantics.
Do not force fake values.

PHOTOS

Founder decision:
REMOVE the Photos section from recurring Weekly/Midweek design.

Do not include a Photos section in Weekly or Midweek.

Photos remain their own evidence/event surface and Photo Briefing path.

Audit whether this requires a future presentation-contract change versus merely fixture/render cleanup.
Do not ship that change now.

STILL UNRESOLVED

Remove completely from all design artifacts.

Do not replace it with another uncertainty section.

If canonical V3 has a genuinely surfaced material uncertainty in a future artifact, handle that through the existing approved bounded uncertainty semantics, not a standing "Still Unresolved" section.

MIDWEEK BIGGEST TAKEAWAY

Founder notes Midweek is missing "Biggest Takeaway."

Add the SAME closing synthesis concept used in Weekly.

Map it to the existing canonical Coach's Take / finale content.
Do not invent a new narrative.

Required Midweek close:
- Biggest Takeaway
- What To Do
- What To Watch

Weekly close:
- Biggest Takeaway
- What To Do
- Into Next Week / canonical weekly close

Use actual canonical fields.

WEIGHT — MIDWEEK TYPOGRAPHY

The current Midweek Weight section has inconsistent/odd text sizing.

Audit against the locked Weekly Weight treatment.

Correct:
- metric scale;
- label scale;
- delta/context scale;
- narrative scale;
- alignment.

Midweek can be more compact, but not stylistically inconsistent or tiny.

RECOVERY — REQUIRED IN WEEKLY + MIDWEEK

Recovery must now be shown in both recurring briefing designs.

Use the approved Recovery Briefing V1 architecture as contract authority.

Important:
- no Recovery Score;
- status = Green / Yellow / Red / Not enough data;
- status not communicated by color alone;
- Confidence coupling = none;
- foam cannot set status;
- training corroboration is association only, never causation;
- Midweek Red unavailable in V1;
- Recovery remains future/fixture-only until production graduation.

RECOVERY VISUAL DIRECTION

Founder strongly likes the graphing from the earlier Recovery prototypes.

Use those prototype images as graph/content-density reference.

Translate them into the locked new briefing family.

The Recovery section should prominently use a compact Sleep trend graph.

WEEKLY graph:
- closed Sunday–Saturday period;
- actual canonical/fixture total-sleep points only;
- personal baseline reference line where contract supports it;
- status-colored points/accents where semantically valid;
- period average;
- baseline;
- coverage;
- foam row;
- commentary only when policy says commentary is visible.

MIDWEEK graph:
- Sunday–Tuesday only;
- same visual language;
- compact partial-period graph;
- period average;
- baseline;
- 3-night coverage;
- status;
- no Red state in Midweek V1;
- foam row if schedule-authoritative.

Do not invent sleep points.
If actual production values are unavailable because Recovery is not yet graduated, use clearly labeled synthetic fixture values from the approved Recovery prototype architecture only.

The graph should be condensed and data-forward, like the attached Recovery examples, but visually integrated with:
- dark navy;
- teal/mineral;
- restrained purple;
- the locked briefing typography;
- analytical body style.

RECOVERY IN ALL RECURRING BRIEFINGS GOING FORWARD

Record this as a design-system rule:

Monthly, Weekly, Midweek all include Recovery once Recovery V1 graduates.

Cadence-specific graph horizons:
- Midweek: individual Sun–Tue nightly points.
- Weekly: individual Sun–Sat nightly points.
- Monthly: weekly aggregated trend, not 30 noisy nightly points.

Do not add Recovery to DEXA or Photo in V1.

WEEKLY REFINEMENT

Do not redesign the accepted Weekly visual language.

Keep:
- accepted immersive hero;
- dense analytical body;
- current Energy treatment;
- current Training treatment;
- current Coach/finale treatment.

Adjust only:
- remove Photos;
- add Body Composition using the same analytical language;
- replace current Recovery placeholder with graph-driven Recovery treatment;
- remove any Still Unresolved remnants;
- ensure closing Biggest Takeaway remains.

MIDWEEK REFINEMENT

Keep the accepted family translation direction.

Adjust:
- same section family as Weekly;
- fix Weight typography;
- preserve Body Composition;
- Recovery becomes graph-driven;
- remove Still Unresolved;
- add Biggest Takeaway;
- preserve What To Do;
- preserve What To Watch;
- maintain condensed partial-week pacing.

SECTION PARITY MATRIX — REQUIRED

Create a matrix:

Section | Weekly | Midweek | Notes

Verify:
Hero/Confidence | yes | yes
Energy | yes | yes
Weight | yes | yes
Body Composition | yes when available | yes when available
Training | yes | yes
Recovery | yes future-contract | yes future-contract
Photos | no | no
Still Unresolved | no | no
Biggest Takeaway | yes | yes
What To Do | yes | yes
What To Watch / Into Next Week | cadence appropriate | cadence appropriate
Revision/provenance | yes | yes

Use actual source contracts to refine names, but preserve this Founder intent.

CONTENT SAFETY

Do not casually rewrite the tuned briefing narrative.

The Founder is changing:
- section inclusion parity;
- Photos removal from recurring briefings;
- Still Unresolved removal;
- Biggest Takeaway presence in Midweek;
- Recovery presentation requirement.

Everything else remains canonical.

If a required parity change conflicts with current Server/Native contracts:
- document the exact discrepancy;
- mock the Founder-approved target state;
- do NOT silently patch production;
- identify future implementation work separately.

OUTPUT

Produce DARK refinement first:

1. Updated Weekly full-length
2. Updated Midweek full-length
3. side-by-side Weekly/Midweek family board
4. Weekly Recovery viewport
5. Midweek Recovery viewport
6. Weekly Body Composition viewport
7. Midweek Body Composition viewport
8. Weekly finale viewport
9. Midweek finale viewport

No need for mineral light yet.

Founder is validating briefing-family structure first.

PARITY / VALIDATION

For unchanged canonical sections:
- exact canonical strings;
- exact data;
- exact domain attribution.

Validate Founder-authorized changes explicitly:
- Photos absent;
- Still Unresolved absent;
- Body Composition parity target represented;
- Biggest Takeaway present in Midweek;
- Recovery graph present in Weekly/Midweek;
- Recovery fixture boundary explicit;
- no invented Sleep production claims;
- Confidence unchanged;
- section order consistent.

ACCESSIBILITY

Recovery graph:
- textual summary for VoiceOver;
- baseline not encoded by color alone;
- status includes text;
- readable axis/day labels;
- Dynamic Type does not destroy graph/data association.

WEIGHT TYPOGRAPHY
- document corrected point sizes;
- compare Weekly vs Midweek.

SHIPPING ISOLATION

No shipping code changes.
No Server changes.
No Recovery activation.
No policy changes.
No build number.
No TestFlight.

Use disposable design harness only.

LOCK STATUS

Home: LOCKED.
Log: LOCKED.
Weekly visual language: LOCKED, with this section-family refinement pending.
Midweek visual language: same briefing family, refinement pending.
Monthly: next after Weekly/Midweek family parity is accepted.

BACKLOG

Record:
- Still Unresolved = not a briefing section; remove in future implementation.
- Photos = remove from recurring Weekly/Midweek presentation.
- Recurring briefing section parity decision.
- Recovery graphing required for Midweek/Weekly/Monthly after graduation.
- Midweek Biggest Takeaway required.
- Midweek Weight typography correction.
- Monthly translation next after this refinement.

REPORT

Publish:
agent-handoffs/reports/<timestamp>-recurring-briefing-weekly-midweek-family-refinement.md

Include:
- source-contract audit;
- GH evidence for Still Unresolved regression;
- Recovery architecture authority;
- section-parity matrix;
- artifact paths;
- content-contract discrepancies requiring future implementation;
- Recovery graph mappings;
- accessibility;
- confirmation shipping code unchanged.

STOP after updated Weekly/Midweek dark artifacts are ready for Founder review.

END TASK.
