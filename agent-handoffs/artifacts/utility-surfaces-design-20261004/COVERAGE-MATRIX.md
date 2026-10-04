# Complete utility-surface coverage matrix

Authority: Build 85 at `b8ee8690b194cb90086b62816b9a2c8c400dc026`.

## Founder acceptance correction overlay

Prompt `2b780cd80c15e0c8d057d3c9f4b9f752dd39d1b2` accepts the overall package with two corrections. The focused authoritative proofs are in `../utility-surfaces-acceptance-corrections-20261004/`.

- W2 Workout Metrics and W3 Daily Totals retain their existing templates but restore exact Build 85 SF Symbol roles and per-metric accents. The correction propagates to present/missing metrics, Always-On, fresh/stale/offline totals, partial-day captions, and suppressed other-day values.
- Every active Logger set-entry row replaces the proposed subtle circle with the restored `circle` / `checkmark.circle.fill` Done affordance at a 44×44 target. The correction propagates to weighted, reps-only, bodyweight, weighted-bodyweight, timed, superset/linked, numeric-focus, and Watch-coordinated active rows. Review/Confirmation remains read-only.
- Live Activity remains accepted unchanged.

No source state or prior template mapping changes; corrected-state uncovered count remains **0**.

Every proof screen is rendered in dark and mineral-light. A light file adds `-light` to the listed PNG name. “Platform” means the state is fully governed by an Apple system surface and should not receive a PhysiqueOS facsimile.

## Apple Watch

| Surface / state | Current source component | Proposed visual template | Mock / proof | Covered? |
|---|---|---|---|---|
| App activating / store bootstrap | Watch views · root/loading branch | W-A idle/bootstrap | W0 | Yes |
| Refreshing phone projection | Watch views · root/loading branch | W-A idle/bootstrap | W0 | Yes |
| Reachable but no prepared workout | Watch views · idle branch | W-A idle/bootstrap | W0 | Yes |
| Phone unavailable before workout | Watch views · idle availability branch | W-A idle/bootstrap + explicit status | W0 | Yes |
| Schema/contract rejected before workout | Watch mapper/router fail-closed path | W-A idle/bootstrap + explicit status | W0 | Yes |
| Phone-prepared workout available | Watch views · prepared branch | W-C ready | W0B | Yes |
| Prepared Start enabled | Watch views · prepared branch | W-C ready / primary action | W0B | Yes |
| Prepared Start disabled by pending mutation | Watch store · command pending | W-C ready / disabled action | W0B | Yes |
| Prepared Start disabled by phone lane | Watch connectivity state | W-C ready / authority status | W0B | Yes |
| Orphaned Health workout detected | Watch Health controller orphan branch | W-B orphan resolution | W0C | Yes |
| Orphan End & Save | Watch Health controller orphan action | W-B orphan resolution / primary | W0C | Yes |
| Orphan Discard | Watch Health controller orphan action | W-B orphan resolution / destructive | W0C | Yes |
| System Health authorization request | HealthKit authorization sheet | W-S platform sheet | Platform | Yes |
| Active fixed workout page | Watch execution view | W-D execution | W1 | Yes |
| Normal weighted set | Watch projection mapper + execution | W-D split Load/Reps | W1 | Yes |
| Weighted bodyweight set (`BW + N`) | Watch projection mapper + execution | W-D split Load/Reps | W1 | Yes |
| Bodyweight set (`BW`) | Watch projection mapper + execution | W-D split Load/Reps | W10 | Yes |
| Superset / linked current set | Watch projection relationship labels | W-D relationship label | W10 | Yes |
| Previous set exists | Watch execution context row | W-D execution | W1 | Yes |
| No previous set | Watch execution optional context | W-D execution with omitted row | W1 | Yes |
| Next set / next exercise exists | Watch execution context row | W-D execution | W10 | Yes |
| No next set / final set | Watch execution optional context | W-D final-set variant | W6 | Yes |
| Final set completed | Watch store projection | W-D all-complete + explicit Finish | W6 | Yes |
| Timed set | Shared projection `valueText`; Watch mapper drops duration | W-D source-gap variant | W10B | Yes |
| Rest stopwatch visible | Watch execution rest block | W-D execution | W1 | Yes |
| Rest countdown / projected rest | Watch execution rest block | W-D execution | W10 | Yes |
| No rest timer | Watch execution optional rest | W-D execution with omitted block | W1 | Yes |
| Complete Set enabled | Watch mutation control | W-D primary action | W1 | Yes |
| Complete Set pending | Watch store one-command lane | W-DE pending/disabled action | W9 | Yes |
| Complete Set stale revision | Watch router/store rejection | W-DE authority warning | W9 | Yes |
| Complete Set retrying same mutation | Watch store retry path | W-DE authority warning / retry | W9 | Yes |
| Complete Set rejected / invalid state | Watch router fail-closed path | W-DE explicit status | W9 | Yes |
| Paused workout execution | Watch session phase | W-DP paused execution | W5 | Yes |
| Health active while phone authority unavailable | Watch Health + connectivity state | W-DE genuine authority warning | W9 | Yes |
| Display inactive / Always-On | `scenePhase` / timeline cadence | W-D AOD treatment | W12 | Yes |
| Workout page Crown position 1 | Watch pager | W-D execution | W1 | Yes |
| Metrics page Crown position 2 | Watch pager + Health metrics | W-F metrics | W2 | Yes |
| Elapsed time available | Watch metrics | W-F metric cell | W2 | Yes |
| Active calories available | Watch metrics | W-F metric cell | W2 | Yes |
| Total calories available | Watch metrics | W-F metric cell | W2 | Yes |
| Heart rate available | Watch metrics | W-F metric cell | W2 | Yes |
| Any metric missing | Watch metrics optional value | W-F honest em-dash variant | W2 | Yes |
| Daily Totals page Crown position 3 | Watch pager + daily summary | W-G daily totals | W3 | Yes |
| Daily totals fresh | Watch daily totals projection | W-G + freshness line | W3 | Yes |
| Daily totals stale | Watch daily totals projection | W-G + stale line | W3 | Yes |
| Daily totals offline | Watch daily totals projection | W-G + offline line | W3 | Yes |
| Daily totals partial-day | Watch daily totals projection | W-G “so far” label | W3 | Yes |
| Daily totals value missing | Watch daily totals optional value | W-G honest em-dash variant | W3 | Yes |
| Swipe-right controls while active | Watch pager left page | W-H controls | W4 | Yes |
| Pause action | Watch controls | W-H controls / primary | W4 | Yes |
| Resume action | Watch controls | W-HP paused controls | W5 | Yes |
| Finish action from controls | Watch controls | W-H controls / terminal | W4 | Yes |
| Cancel action from controls | Watch controls | W-H controls / destructive | W4 | Yes |
| Retry iPhone / command | Watch controls recovery | W-H warning action | W9 | Yes |
| Health start failed | Watch Health controller | W-H explicit Health recovery | W13 | Yes |
| Retry Health Start | Watch controls recovery | W-H warning action | W13 | Yes |
| Finish requested after all sets | Watch finish coordinator | W-I Finish confirmation | W6 | Yes |
| Early Finish with incomplete sets | Watch finish coordinator | W-I count-aware confirmation | W6 | Yes |
| Finish “Not Yet” | Watch finish confirmation | W-I secondary action | W6 | Yes |
| Finish confirmed | Watch finish coordinator | W-K two-leg finish | W7 | Yes |
| Cancel requested | Watch controls | W-J Cancel confirmation | W11 | Yes |
| Cancel “Keep Workout” | Watch Cancel confirmation | W-J secondary action | W11 | Yes |
| Cancel confirmed | Watch Cancel confirmation | W-J destructive action | W11 | Yes |
| PhysiqueOS save pending | Watch finish coordinator | W-K two-leg progress | W7 | Yes |
| PhysiqueOS committed, Health pending | Watch finish coordinator | W-K two-leg progress | W7 | Yes |
| Long save / bounded wait | Watch finish coordinator | W-K reason + same-operation retry | W7 | Yes |
| Retry finish | Watch finish coordinator | W-K same-operation recovery | W7 | Yes |
| Retry Health Save during finishing | Watch controls recovery | W-K/W-H recovery | W7, W13 | Yes |
| Structured save failed safely | Watch finish coordinator | W-K explicit recoverable failure | W7 | Yes |
| Saved summary basic | Watch saved summary | W-L summary | W8 | Yes |
| Saved summary with Health confirmation | Watch saved summary status | W-L summary | W8 | Yes |
| Saved summary with Health retry needed | Watch saved summary status | W-L status line; source limitation documented | W8 | Yes |
| Summary optional duration | Watch summary tiles | W-L adaptive tile | W8 | Yes |
| Summary optional volume | Watch summary tiles | W-L adaptive tile | W8 | Yes |
| Summary optional calories | Watch summary tiles | W-L adaptive tile | W8 | Yes |
| Summary optional PR count | Watch summary tiles | W-L metric only | W8 | Yes |
| Done / dismiss | Watch saved summary | W-L primary Done | W8 | Yes |
| Cancel success (no dedicated UI) | Watch dismissal path | W-J → W-A transition | W11, W0 | Yes |
| Duplicate response ignored | Watch store idempotency | No new visual; current template remains | W1/W7 | Yes |
| Stale projection ignored | Watch revision guard | W-DE if user-facing; otherwise unchanged | W9 | Yes |

## Live Activity / Dynamic Island

| Surface / state | Current source component | Proposed visual template | Mock / proof | Covered? |
|---|---|---|---|---|
| Activity not requested / not eligible | Activity coordinator | LA-Ø no surface | No custom surface | Yes |
| Activity request pending | Activity coordinator | LA-Ø until system publishes | No custom surface | Yes |
| Active Lock Screen, weighted set | `WorkoutLiveActivityViews` | LA-L1 active | LA1 | Yes |
| Active Lock Screen, bodyweight set | Shared `valueText` | LA-L1 active | LA4 | Yes |
| Active Lock Screen, weighted-bodyweight | Shared `valueText` | LA-L1 active | LA1 | Yes |
| Active Lock Screen, timed set | Shared `valueText` | LA-L1 active | LA4 | Yes |
| Active Lock Screen, superset/linked label | Shared projected row | LA-L1 active | LA1 | Yes |
| Current and up-next rows | Live Activity content state | LA-L1 max-two-row | LA1 | Yes |
| Current row only / no next | Live Activity optional next row | LA-L1 single-row variant | LA1 | Yes |
| Complete Set enabled | Complete Set App Intent | LA-L1 action | LA1 | Yes |
| Complete Set request pending | App Intent / projection update | Existing LA-L1; no invented spinner | LA1 | Yes |
| Complete Set failure | App Intent error without surface state | Existing LA-L1; source gap documented | LA1 | Yes |
| Stopwatch rest | ActivityKit timer presentation | LA-L1 active rest | LA1 | Yes |
| Countdown rest | ActivityKit date timer | LA-L1 countdown | LA4 | Yes |
| Countdown reaches zero | ActivityKit timer clamps | LA-L1 `0:00` variant | LA4 | Yes |
| No rest | Content state without rest | LA-L1 workout clock | LA1 | Yes |
| Privacy-redacted Lock Screen | WidgetKit redaction | LA-L2 redacted | LA9 | Yes |
| Explicitly paused | Lifecycle content state | LA-L3 safe status; source conflates with stale | LA5 | Yes |
| Stale non-countdown projection | Staleness handling | LA-L3 safe status | LA5 | Yes |
| Workout needs update | Lifecycle content state | LA-L3 safe status | LA5 | Yes |
| All sets complete / reviewing | Lifecycle content state | LA-L3 completion status | LA6 | Yes |
| Finishing | Lifecycle content state | LA-L3 finishing status | LA7 | Yes |
| Saved | Lifecycle content state | LA-L3 saved status | LA8 | Yes |
| Activity ended / dismissed | Activity coordinator | LA-Ø no surface | LA8 → none | Yes |
| Expanded Island active | Dynamic Island expanded regions | LA-E1 active | LA2 | Yes |
| Expanded Island with countdown | Dynamic Island expanded regions | LA-E1 active rest | LA2/LA4 | Yes |
| Expanded Island privacy-redacted | WidgetKit redaction | LA-E2 redacted | LA9 | Yes |
| Expanded Island paused/stale | Expanded lifecycle content | LA-E3 safe status | LA5 | Yes |
| Expanded Island all sets complete | Expanded lifecycle content | LA-E3 completion status | LA6 | Yes |
| Expanded Island finishing | Expanded lifecycle content | LA-E3 finishing status | LA7 | Yes |
| Expanded Island saved | Expanded lifecycle content | LA-E3 saved status | LA8 | Yes |
| Compact Island active workout | Compact leading/trailing | LA-C1 workout | LA3 | Yes |
| Compact Island active rest | Compact leading/trailing | LA-C2 rest | LA3 | Yes |
| Compact Island lifecycle status | Compact leading/trailing | LA-C1 generic status | LA3 | Yes |
| Minimal Island active workout | Minimal region | LA-M1 workout glyph | LA3 | Yes |
| Minimal Island paused/status | Minimal region | LA-M1 status glyph | LA3 | Yes |
| Minimal Island rest | Minimal region | LA-M2 rest ring | LA3 | Yes |
| In-app phone banner | No current component | LA-Ø no surface | No custom surface | Yes |
| ActivityKit alert | No current configuration | LA-Ø no surface | No custom surface | Yes |
| Finish / Cancel / Pause / Resume actions | Not owned by ActivityKit | LA-Ø; do not add | No custom surface | Yes |
| HealthKit/evidence/PR content | Not in activity contract | LA-Ø; do not add | No custom surface | Yes |

## Training Logger

| Surface / state | Current source component | Proposed visual template | Mock / proof | Covered? |
|---|---|---|---|---|
| Logger route loading | Training Logger root | LG-System loading | L1 shell | Yes |
| Logger route error | Training Logger root | LG-System inline error/retry | L16 | Yes |
| Entry: start live workout | Training Logger entry | LG-Entry | L1 | Yes |
| Entry: log past workout | Training Logger entry | LG-Entry | L1 | Yes |
| Past workout date selection | System date control | LG-Entry + platform picker | L1 / Platform | Yes |
| Saved draft exists | Saved-workout entry branch | LG-Entry/Saved | L1 | Yes |
| Resume saved draft | Saved-workout entry branch | LG-Entry/Saved primary | L1 | Yes |
| Discard saved draft | Saved-workout entry branch | LG-Entry/Saved immediate destructive | L1 | Yes |
| Suggested Training Areas | Training Areas step | LG-Selection suggestion | L2 | Yes |
| Training Area unselected | Training Areas step | LG-Selection choice | L2 | Yes |
| Training Area selected | Training Areas step | LG-Selection selected choice | L2 | Yes |
| Multiple Training Areas selected | Training Areas step | LG-Selection selected choices | L2 | Yes |
| Continue disabled with no area | Training Areas validation | LG-Selection disabled primary | L2 | Yes |
| My Library picker | Exercise picker | LG-Picker library | L3 | Yes |
| All Exercises picker | Exercise picker | LG-Picker catalog | L3/L4 | Yes |
| Picker search empty | Exercise picker search | LG-Picker empty | L3 | Yes |
| Picker search results | Exercise picker search | LG-Picker result rows | L3 | Yes |
| Picker no results | Exercise picker search | LG-Picker empty-result message | L3 | Yes |
| Exercise selected | Exercise picker row | LG-Picker selected row | L3 | Yes |
| Exercise deselected | Exercise picker row | LG-Picker unselected row | L3 | Yes |
| Selection count | Exercise picker footer | LG-Picker count/primary | L3 | Yes |
| Browse full catalog | Exercise picker mode action | LG-Picker mode action | L3 | Yes |
| Create new exercise form | Exercise picker creation | LG-Picker/Create | L4 | Yes |
| Existing canonical candidate found | Catalog collision check | LG-Picker/Candidate | L4 | Yes |
| Use existing exercise | Catalog collision candidate | LG-Picker/Candidate action | L4 | Yes |
| Preserve provisional exercise | Catalog creation path | LG-Picker/Create action | L4 | Yes |
| Active workout header/progress | Training Logger active step | LG-Active | L5 | Yes |
| Pre-first-set Ready for Watch | Training Logger Watch preparation | LG-Active teal functional field | L5B | Yes |
| Ready for Watch pending/failure | Logger Watch preparation state | LG-Active state field | L16 template | Yes |
| Watch active after start | Same active Logger; no banner | LG-Active source-gap mapping | L9 | Yes |
| Watch paused / reconnecting | No dedicated Logger state | LG-Active unchanged; source gap documented | L9 | Yes |
| Phone edit while Watch active | Active Logger + projected update | LG-Exercise inline fields | L9 | Yes |
| Phone edit rejected while Watch paused | Mutation rejection without dedicated explanation | LG-System inline error if surfaced; source gap | L9/L16 | Yes |
| Save & Leave | Active Logger controls | LG-Active secondary | L5 | Yes |
| Add Exercise during workout | Active Logger controls | LG-Active secondary → LG-Picker | L5/L3 | Yes |
| Cancel Workout | Active Logger controls | LG-Destructive Alert | L10 | Yes |
| Keep Workout from Cancel | Cancel alert | LG-Destructive Alert secondary | L10 | Yes |
| Confirm Cancel | Cancel alert | LG-Destructive Alert destructive | L10 | Yes |
| Exercise ordinary variant | Exercise card | LG-Exercise | L5 | Yes |
| Exercise timed variant | Exercise card/set fields | LG-Set Editor timed | L5/L6 template | Yes |
| Exercise bodyweight variant | Exercise card/set fields | LG-Set Editor bodyweight | L8 | Yes |
| Exercise weighted-bodyweight | Exercise card/set fields | LG-Set Editor load modifier | L8 | Yes |
| Exercise expanded / multiple sets | Exercise card | LG-Exercise | L5 | Yes |
| Previous-performance context | Exercise card | LG-Exercise prior row | L5 | Yes |
| Set incomplete | Set row | LG-Set Editor open row | L5 | Yes |
| Set complete | Set row | LG-Set Editor semantic complete row | L5 | Yes |
| Edit reps | Inline numeric field | LG-Set Editor + keyboard | L6 | Yes |
| Edit load | Inline numeric field | LG-Set Editor + keyboard | L6 | Yes |
| Edit timed duration | Inline numeric field | LG-Set Editor + keyboard | L6 | Yes |
| Numeric field focus | Inline field state | LG-Keyboard | L6 | Yes |
| Previous / Next keyboard focus | Keyboard toolbar | LG-Keyboard | L6 | Yes |
| Add set | Exercise card action | LG-Set Editor inline add | L5 | Yes |
| Delete set | Set row action | LG-Set Editor immediate destructive | L5 | Yes |
| Exercise overflow menu | Exercise card menu | LG-Relationship Menu | L7 | Yes |
| Change execution variant | Exercise menu | LG-Relationship Menu | L7 | Yes |
| Create/change superset | Exercise menu | LG-Relationship Menu | L7/L8 | Yes |
| Linked/superset exercise cards | Exercise relationship state | LG-Exercise relationship label | L8 | Yes |
| Substitute same-area exercise | Exercise menu/picker | LG-Relationship Menu → LG-Picker | L7/L3 | Yes |
| Move exercise earlier | Exercise menu | LG-Relationship Menu | L7 | Yes |
| Move exercise later | Exercise menu | LG-Relationship Menu | L7 | Yes |
| Remove exercise | Exercise menu | LG-Relationship Menu immediate destructive | L7 | Yes |
| Active rest timer | No current rendered component | No visual; do not invent | L5 | Yes |
| Workout elapsed timer | No current rendered component | No visual; do not invent | L5 | Yes |
| Pause/resume session | No current control | No visual; do not invent | L5 | Yes |
| Notes/favorites/workout type | No current controls | No visual; do not invent | L1/L3 | Yes |
| Finish from active workout | Active Logger footer | LG-Active primary → review | L5/L11 | Yes |
| Workout Review summary | Review step | LG-Review | L11 | Yes |
| Review completed sets | Review step | LG-Review exercise summary | L11 | Yes |
| Review with no screenshots | Review step | LG-Review empty evidence | L11/L12 | Yes |
| Add screenshot from Photos | Review evidence control | LG-Review/Evidence | L11 | Yes |
| Add screenshot from Files importer | Review evidence control; image-only | LG-Review/Evidence | L11 | Yes |
| Evidence asset pending | Evidence processing state | LG-Review/Evidence pending row | L11 | Yes |
| Evidence asset interpreted | Evidence processing state | LG-Review/Evidence ready row | L11 | Yes |
| Evidence asset failed/read error | Evidence processing state | LG-Review/Evidence error/retry row | L11/L16 | Yes |
| Remove evidence asset | Evidence row action | LG-Review/Evidence immediate remove | L11 | Yes |
| Back to active workout | Review navigation | LG-Review secondary/back | L11 | Yes |
| Continue to final confirmation | Review action | LG-Review primary | L11 | Yes |
| Final confirmation ready | Final confirmation step | LG-Finish confirmation | L12 | Yes |
| Final confirmation back | Final confirmation action | LG-Finish secondary | L12 | Yes |
| Confirm semantic Finish | Final confirmation action | LG-Finish primary | L12 | Yes |
| Submission/saving | Finish operation | LG-Finish progress | L16 | Yes |
| Bounded long save | Finish operation | LG-Finish safe-local message | L16 | Yes |
| Retry same save operation | Finish operation | LG-Finish same-key retry | L16 | Yes |
| Duplicate response / already committed | Finish idempotency | LG-Finish → Complete, no duplicate modal | L16/L15 | Yes |
| Finish error before commit | Finish operation | LG-Finish recoverable error | L16 | Yes |
| Post-Finish discard saved workout | Finish recovery action | LG-Destructive Alert | L16/L10 template | Yes |
| Workout Complete, no records | Completion step | LG-Complete | L14 | Yes |
| Workout Complete with records | Completion step | LG-Complete/Records | L15 | Yes |
| One-time confetti | Completion visibility + motion policy | LG-Complete/Records | L15 | Yes |
| Reduce Motion completion | Completion motion policy | LG-Complete without confetti | L14 | Yes |
| Return to Log | Completion action | LG-Complete primary | L14/L15 | Yes |
| Ambiguous Health workout enters pending review | Log pending-evidence card | LG-Match entry | L13 | Yes |
| Workout Match with one candidate | `EvidenceReviewDetailView` | LG-Match candidate | L13 | Yes |
| Workout Match with multiple candidates | `EvidenceReviewDetailView` | LG-Match candidates | L13 | Yes |
| Choose Logger session | `EvidenceReviewDetailView` action | LG-Match primary/secondary | L13 | Yes |
| Choose No match | `EvidenceReviewDetailView` action | LG-Match destructive boundary | L13 | Yes |
| Trusted exact Watch correlation | Correlation/reconciliation path | LG-Complete; no Match UI | L14 | Yes |
| Pending review remains unresolved | Log pending-evidence card | LG-Match entry/status | L13 | Yes |

## Coverage result

- Watch: every source state maps to W-A through W-S; 17 representative screens prove all materially distinct custom templates.
- Live Activity: every state maps to LA-Ø or LA-L/E/C/M; 9 representative screens prove all material presentations.
- Logger: every state maps to LG-System through LG-Match; 19 representative screens prove the complete entry-to-confirmation flow plus later ambiguous reconciliation.
- Uncovered states: **0**.
