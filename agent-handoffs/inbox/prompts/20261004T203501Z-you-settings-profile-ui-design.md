PhysiqueOS UI design — DEXA final visual correction + new You / Settings / Profile family

TASK TYPE

Continue in Codex B.
Use High reasoning.

Evidence design is complete and accepted except for ONE small DEXA visual parity correction.

After that, move onto a NEW design family under You:
Settings / Profile / Data Sources / Appearance.

This new family WILL require shipping implementation later. Design it against current architecture and clearly identify missing code/data contracts.

No shipping implementation in this task.

PART A — DEXA FINAL CORRECTION

Founder accepts DEXA Evidence except the Since Prior Scan section.

Production treatment is the visual authority for this component.

Use the production structure essentially 1:1:
- one clean horizontal summary card;
- three evenly distributed columns:
  - Body Fat;
  - Fat Mass;
  - Lean Mass;
- semantic value colors;
- subtle vertical separators;
- compact labels;
- no nested metric tiles;
- no unnecessary extra card weight.

Preserve exact values and units.
Apply only locked dark/mineral-light tokens.

Render one focused dark/light DEXA Since Prior Scan correction.

No need to rerender the full DEXA family.

After this focused correction, record DEXA Evidence = LOCKED and entire Evidence design family = LOCKED.

PART B — NEW YOU / SETTINGS FAMILY

Founder wants a durable Settings area under the You tab before beta testing.

Design the complete information architecture and core screens for:

1. You root / account entry point as needed.
2. Settings root.
3. Profile.
4. Data Sources.
5. Appearance.
6. Any minimal account/beta-readiness settings that current architecture requires.

Do not turn this into a miscellaneous settings dump.

SOURCE AUDIT FIRST

Audit current Native You tab, existing account/user model, Server owner/user model, HealthKit/source infrastructure, appearance/theme architecture, notification controls, unit preferences, version/account actions and any existing settings fragments.

Classify each candidate setting as:
- already implemented/current;
- current backend contract but no Native UI;
- new product requirement needing implementation;
- unnecessary for initial beta.

Do not fabricate backend capability.

PART C — PROFILE / BASIC DEMOGRAPHICS

Founder wants a basic user profile for beta readiness.

Design a minimal profile that collects ONLY fields with a current or clearly near-term product purpose.

Audit whether PhysiqueOS currently has/needs:
- display name / first name;
- date of birth or age;
- sex / biological sex only if required for health/body-composition logic;
- height;
- preferred units;
- email/account identity if provided by auth;
- timezone if required;
- other demographics only if source/product logic justifies them.

Do not collect demographics merely because generic profile pages do.

Avoid duplicating Goal, weight, DEXA or other canonical Evidence data.

For every proposed field, document:
Field | current source | why needed | storage authority | editable? | beta requirement | implementation needed?

If a field has no clear purpose, exclude it from the target design and mention it in the report.

PART D — DATA SOURCES

This is a user-readable source/control center.

Design:
- connected source list;
- connection/status;
- what each source contributes;
- permissions/availability state;
- sync/freshness status only where current architecture supports it;
- source detail page if useful/current.

At minimum audit Apple Health.

Show domains such as:
- Activity;
- workouts/cardio;
- Nutrition;
- Sleep;
- body composition writes/DEXA → Apple Health where applicable.

Distinguish:
- connected;
- permission limited;
- unavailable/not connected;
- syncing/stale only if current semantics support it.

Do NOT turn this into Evidence Hub.
Data Sources answers: Where does PhysiqueOS receive/send data?
Evidence answers: What does PhysiqueOS know?

Do not expose engineering diagnostics, raw identifiers or sensitive tokens.

PART E — APPEARANCE

Founder requires:
- System;
- Dark;
- Light.

System should be the natural default for new users unless source architecture dictates otherwise.

"Light" means the locked Mineral Light PhysiqueOS appearance.

Audit current theming architecture and determine:
- whether appearance is currently fixed;
- whether app already respects system appearance;
- what persistence mechanism exists;
- whether a new preference/store is required;
- app-wide surfaces affected.

Design a simple Appearance page/control with clear previews or selection state without overcomplication.

This is an implementation requirement later.

Add missing theme architecture/persistence to DESIGN_IMPLEMENTATION_DELTA_LEDGER.md if it does not exist.

PART F — SETTINGS ROOT IA

Recommended organization, subject to source audit:

Profile
Data Sources
Appearance

Then only current/relevant utility areas, potentially:
- Notifications;
- Units;
- Account / Sign out;
- App/version/about;
- privacy/data controls.

Do not include these automatically.

Include them only if:
- current app/backend already supports them; or
- they are clearly required for beta and can be truthfully designed with an explicit implementation requirement.

Keep initial Settings small.

PART G — BETA READINESS

Audit basic beta account needs.

Identify what is missing for multi-user beta, such as:
- durable user identity/profile;
- account ownership/scoping;
- onboarding defaults;
- source connection state per user;
- appearance preference per user/device;
- basic sign-out/account state;
- privacy/data deletion surfaces if required by current beta distribution strategy.

This is a design + architecture discovery task, NOT an implementation task.

Create a Beta Readiness Settings matrix:
Need | exists? | current authority | UI needed? | backend/model needed? | beta-blocking? | recommendation

Do not overbuild consumer account management if not needed yet.

PART H — VISUAL DESIGN

Use locked PhysiqueOS design language.

You/Settings should feel calmer and more utility-oriented than Home:
- compact grouped rows;
- clear section titles;
- semantic source icons;
- restrained cards;
- obvious selected states;
- minimal decorative color.

Dark + mineral light.

Profile forms:
- compact labels;
- clear units;
- accessible controls;
- keyboard-safe;
- no giant cards.

Data Sources:
- readable connection state;
- domain coverage;
- source icon/identity;
- no raw technical diagnostics.

Appearance:
- System/Dark/Light immediately understandable;
- selected state not color-only.

PART I — ROUTES / STATES

Produce route matrix:
Surface | entry | action | destination | current implementation? | target behavior | implementation required?

Cover materially distinct states:
- Profile populated;
- Profile edit if distinct;
- Apple Health connected;
- Apple Health permission-limited;
- source unavailable if current;
- Appearance System/Dark/Light selected;
- loading/error only if material.

PART J — IMPLEMENTATION DELTA LEDGER

Review:
agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md

This task is expected to discover implementation requirements.

Record concrete deltas for:
- missing Settings route/page;
- missing profile model/fields;
- appearance preference/theme persistence;
- Data Sources UI/state projection;
- any beta-account plumbing genuinely required.

Classify:
REQUIRED FOR DESIGN IMPLEMENTATION
FOUNDER DECISION
ARCHITECTURAL CONTEXT

Do not mark speculative nice-to-haves as required.

PART K — REVIEW OUTPUT

Mobile-friendly Founder review:

1. DEXA Since Prior Scan correction dark/light.
2. You/Settings root dark/light.
3. Profile dark/light.
4. Data Sources root dark/light.
5. Apple Health/source detail if materially useful.
6. Appearance dark/light.
7. one consolidated Settings family board.
8. one concise beta-readiness architecture summary board/document, not a fake product screen.

Primary composite PNG must be identified in report/latest metadata.

PART L — SHIPPING ISOLATION

No Native shipping changes.
No Server changes.
No schema changes.
No HealthKit permission changes.
No theme implementation.
No user/profile mutations.
No build/TestFlight.

Design/docs/audit only.

REPORT

agent-handoffs/reports/<timestamp>-you-settings-profile-ui-design.md

Follow agent-handoffs/README_REPORTING_STANDARD.md.

LOCK STATUS

Entire Evidence family = LOCKED after DEXA Since Prior Scan focused correction.
You/Settings/Profile/Data Sources/Appearance = exploration pending Founder review.

STOP when Settings family is fully audited/designed, implementation deltas recorded, dark/light review artifacts published, and beta-readiness gaps clearly documented.

END TASK.