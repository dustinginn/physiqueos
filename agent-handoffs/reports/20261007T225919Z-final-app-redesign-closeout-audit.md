# PhysiqueOS final app-wide redesign closeout audit

- **Task:** `final-app-redesign-closeout-audit-20261007`, staged by the Founder at `287d8745f66cf997d50db2ca5efb123636361ece`.
- **Authority:** shipped Native **Build 91**, `106f05183ea3e2328496acce0636dc087116bbce`, TestFlight delivery `13cebc12-6572-4044-9950-8add928d8cd7` (**VALID**). Its product source is the validated integration `3697951cb530a6f7d2593e92de76fced9613eaef`; the release SHA adds the build-number bump only.
- **Server snapshot:** `738ce66849a1361b4ce0ed069a4a04eac6abc4ef`, deployment `f0f1d3b4-8b95-4bc5-85ce-739a4fd0e255`; inspected read-only.
- **GitHub baseline:** fresh `origin/main` `c961acb789c8cbbceb3baa59b08814a61ee2d976` after `git fetch origin --prune`.
- **Status:** **DESIGN COMPLETE. IMPLEMENTATION CLOSEOUT REQUIRED.** No genuinely undesigned app-owned route, sheet, reusable state family, Watch surface, widget or Live Activity was found. The remaining work is a bounded implementation/acceptance tail against already-approved design systems.
- **Safety:** audit and lightweight design reconciliation only. No app, Server or production-data mutation; no Xcode build, simulator, test suite, screenshot rendering, new worktree, lane interruption or cleanup of another lane.

## Executive finding

The previous 98-group audit had 64 fully designed groups, 15 family-covered groups, 9 groups awaiting final design and 10 intentionally excluded/system-owned groups. The three approved final-design packages closed all nine design gaps:

- Evidence intake/review: E20–E23.
- Daily capture/explanation: H02, L04, L05 and B06.
- Home widget: U04.

All nine are implemented in Build 91. Eight are direct, named feature commits; U04 is also shipped, through the global appearance implementation that translated the widget to neutral dynamic surfaces, per-domain semantic colors and the approved teal/navy action treatment. The old ledger and some intermediate reports did not credit that later shared-file implementation.

No new app-owned presentation family appeared after the source audit: Build 91 has 48 `AppDestination` cases (the two additions are Settings and Appearance, already represented below), five `NavigationStack` roots and 40 actual presentation modifiers. Every one maps to an existing group. Apple notification/Health permission prompts, document pickers, photo pickers and system date/PDF internals remain system-owned; their app-owned wrappers are accounted for.

Build 91 also turns the prior “candidate-only” column into shipped authority. Evidence Option A, Operating Plan/Next DEXA, Watch polish and universal priority skip are all present in the release. Founder physical-device acceptance is still pending and is exit evidence, not a missing design.

## Status legend

| Mark | Meaning |
|---|---|
| **SHIPPED** | Approved design or accepted family composition is present in Build 91. |
| **PARTIAL** | Design is locked and the principal surface ships, but a named implementation seam remains for the closeout RC. This is not a request for another design board. |
| **DEFERRED** | Intentionally belongs to the separate Settings/account architecture plan. |
| **EXCLUDED** | System-owned, debug/review-only, obsolete, or otherwise outside app-owned redesign scope. |

## Final 98-group coverage matrix

### S — Shell, navigation and shared system (8)

| ID | Surface family | Build 91 status | Build 91 delta / closeout disposition |
|---|---|---|---|
| S01 | App shell, launch and root routing | **SHIPPED** | Current authority; no visual action. |
| S02 | Tab bar and primary destinations | **SHIPPED** | Current authority; no visual action. |
| S03 | Navigation chrome, titles and back labels | **SHIPPED** | OP/navigation polish shipped; verify on device. |
| S04 | Shared cards, sections, buttons and tokens | **SHIPPED** | Accepted shared system; use it for the small state-tail sweep. |
| S05 | Shared loading, empty, failure and notice primitives | **SHIPPED** | Primitives ship; a few consumers remain under H04/E19/U01. |
| S06 | Presentation shells and modal navigation | **SHIPPED** | All app-owned wrappers map to approved families. |
| S07 | Settings entry and route plumbing | **SHIPPED** | Shell/route ships; account destinations remain separately deferred. |
| S08 | Global Dark/Mineral appearance infrastructure | **SHIPPED** | Includes widget palette propagation. |

### H — Home (5)

| ID | Surface family | Build 91 status | Build 91 delta / closeout disposition |
|---|---|---|---|
| H01 | Home hero and Today's Focus / priorities | **PARTIAL** | Universal skip ships, but fresh Founder direction on `origin/main` replaces the ellipsis/confirmation with a direct red circular one-tap skip and confirmed-only transient feedback. Translate remaining legacy priority-card internals in the same edit. |
| H02 | Confidence sheet | **SHIPPED** | Final daily-capture design and implementation ship. |
| H03 | Priority rows, grouped morning card and actions | **PARTIAL** | Apply the same direct skip and confirmed-only feedback to eligible grouped child rows; ≥44 pt effective targets, no optimistic or duplicate acknowledgement. |
| H04 | Home loading, failure and notices | **PARTIAL** | Directly compose from S05; no new design needed. |
| H05 | Additional-goal, no-goal and older-briefing states | **PARTIAL** | Bring still-emitted legacy card/state internals onto the accepted Home family; preserve content and behavior. |

### G — Goals (8)

| ID | Surface family | Build 91 status | Build 91 delta / closeout disposition |
|---|---|---|---|
| G01 | Goals landing and active goals | **SHIPPED** | Current authority. |
| G02 | Goal detail and progress | **SHIPPED** | Current authority. |
| G03 | Goal creation flow | **SHIPPED** | Current authority. |
| G04 | Goal evidence/photos presentation | **SHIPPED** | Intentional static treatment; no redesign gap. |
| G05 | Goal editing and confirmation states | **SHIPPED** | Current authority. |
| G06 | Goal history/completed state | **SHIPPED** | Current authority. |
| G07 | Review-only goal fixtures | **EXCLUDED** | Hidden review/debug material. |
| G08 | Obsolete goal experiments | **EXCLUDED** | Not shipping. |

### L — Log and daily capture (6)

| ID | Surface family | Build 91 status | Build 91 delta / closeout disposition |
|---|---|---|---|
| L01 | Log landing / daily log | **SHIPPED** | Current authority. |
| L02 | Nutrition capture | **SHIPPED** | Evidence Option A shared treatment ships. |
| L03 | Activity/recovery capture | **SHIPPED** | Evidence Option A shared treatment ships. |
| L04 | Morning Check-In | **SHIPPED** | Final capture design ships; Build 91 universal skip is included for eligible prior-day items. |
| L05 | Manual weight entry | **SHIPPED** | Final capture design and subsequent field fix ship. |
| L06 | Log completion/history states | **SHIPPED** | Current authority. |

### B — Briefing and explanation (8)

| ID | Surface family | Build 91 status | Build 91 delta / closeout disposition |
|---|---|---|---|
| B01 | Briefing landing/latest briefing | **SHIPPED** | Current authority. |
| B02 | Briefing summary and cards | **SHIPPED** | Current authority. |
| B03 | Training explanation | **SHIPPED** | Current authority. |
| B04 | Nutrition explanation | **SHIPPED** | Current authority. |
| B05 | Recovery/activity explanation | **SHIPPED** | Current authority. |
| B06 | Briefing history | **SHIPPED** | Final explanation design and implementation ship. |
| B07 | Briefing evidence links | **SHIPPED** | Current authority. |
| B08 | Briefing empty/failure states | **SHIPPED** | Approved shared-state composition. |

### E — Evidence, training, intake and review (28)

| ID | Surface family | Build 91 status | Build 91 delta / closeout disposition |
|---|---|---|---|
| E01 | Evidence Hub | **SHIPPED** | Option A neutral shell + semantic domain identity ships. |
| E02 | Training evidence landing | **SHIPPED** | Option A ships. |
| E03 | Training history/list | **SHIPPED** | Option A ships. |
| E04 | Training session detail | **PARTIAL** | Principal redesign ships; normalize supporting-media placeholders in the state-tail sweep. |
| E05 | Training logger entry | **SHIPPED** | Current redesign authority. |
| E06 | Training logger exercise/set flows | **SHIPPED** | Current redesign authority. |
| E07 | Training logger review/finish | **SHIPPED** | Current redesign authority. |
| E08 | Nutrition evidence landing | **SHIPPED** | Option A ships. |
| E09 | Nutrition history/detail | **SHIPPED** | Option A ships. |
| E10 | Activity evidence landing | **SHIPPED** | Option A ships. |
| E11 | Activity history/detail | **SHIPPED** | Option A ships. |
| E12 | Recovery evidence landing | **SHIPPED** | Option A ships. |
| E13 | Sleep/recovery detail | **SHIPPED** | Lighter sleep-continuity treatment ships. |
| E14 | Measurements evidence landing | **SHIPPED** | Option A ships. |
| E15 | Weight history/detail | **SHIPPED** | Option A ships. |
| E16 | Progress Photos history/detail | **SHIPPED** | Paired Previous/Current zoom/pan viewer ships. |
| E17 | DEXA history/detail | **PARTIAL** | Core flow ships; translate the app-owned PDF wrapper chrome. The PDF renderer itself remains system-owned. |
| E18 | Evidence-source/status treatment | **SHIPPED** | Current authority. |
| E19 | Shared evidence loading/empty/error/media states | **PARTIAL** | A small consumer sweep remains; reuse S05 and the Option A kit. |
| E20 | Generic evidence intake | **PARTIAL** | Final design and main intake flow ship; align the app-owned date-sheet wrapper while retaining the system date control. |
| E21 | Progress Photos intake | **SHIPPED** | Final intake design ships. |
| E22 | DEXA intake | **SHIPPED** | Final intake design ships. |
| E23 | Generic evidence review | **SHIPPED** | Final review design ships. |
| E24 | Workout Match | **PARTIAL** | Idle/main flow ships; apply the Evidence Workflow kit to confirming, refresh-required, processing, failed and dismissed states. |
| E25 | Apple Photos/document picker internals | **EXCLUDED** | System-owned; app-owned entry/review is covered above. |
| E26 | Internal evidence review fixtures | **EXCLUDED** | Hidden review/debug material. |
| E27 | Obsolete evidence experiments | **EXCLUDED** | Not shipping. |
| E28 | Apple Health authorization sheet | **EXCLUDED** | System-owned. Repeated prompts are a separate defect audit, not visual redesign. |

### P — Priority detail (4)

| ID | Surface family | Build 91 status | Build 91 delta / closeout disposition |
|---|---|---|---|
| P01 | Standard priority detail | **SHIPPED** | Universal skip ships. |
| P02 | Supplement/peptide/recovery priority variants | **SHIPPED** | Canonical skip and routing ship. |
| P03 | Photos/DEXA priority variants | **SHIPPED** | Build 91 maps `/evidence/photos`, `/evidence/dexa` and OP DEXA destinations correctly; Next DEXA action ships. |
| P04 | Priority status/actions | **SHIPPED** | Server-confirmed occurrence semantics ship; Home-only direct-action refinement is tracked under H01/H03. |

### O — Operating Plan (11)

| ID | Surface family | Build 91 status | Build 91 delta / closeout disposition |
|---|---|---|---|
| O01 | Operating Plan landing | **SHIPPED** | Build 91 OP chrome and navigation ship. |
| O02 | Energy strategy | **PARTIAL** | Native currently receives `energyPhaseHistory: []`; Server projects only the active strategy. Add canonical immutable prior-phase snapshots to the Server read model, then decode/render them natively. Never infer history client-side. |
| O03 | Recovery strategy | **SHIPPED** | Current authority. |
| O04 | Nutrition strategy | **SHIPPED** | Current authority. |
| O05 | Training strategy | **SHIPPED** | Current authority. |
| O06 | Supplements | **SHIPPED** | Build 91 polish ships. |
| O07 | Peptides | **SHIPPED** | Build 91 polish ships. |
| O08 | Tracking | **SHIPPED** | Build 91 polish ships. |
| O09 | Coaching Updates | **SHIPPED** | Current authority; DEXA-anchored edit uses the existing atomic save. |
| O10 | Next DEXA Scan | **SHIPPED** | Build 91 truthful scheduled/not-scheduled/no-coaching/failure states and edit path ship. |
| O11 | OP review fixtures/obsolete prototypes | **EXCLUDED** | Hidden or nonshipping. |

### Y — You, Settings and account (9)

| ID | Surface family | Build 91 status | Build 91 delta / closeout disposition |
|---|---|---|---|
| Y01 | You root | **SHIPPED** | Current authority. |
| Y02 | Settings route/family | **DEFERRED** | Minimal shell + Appearance entry ship. Full family stays in the separate approved Settings architecture plan. |
| Y03 | Profile | **DEFERRED** | Requires canonical read, versioned update and storage contract for name, height, time zone and weight units. |
| Y04 | Data Sources / Apple Health | **DEFERRED** | Requires a truthful user-safe HealthKit projection; do not infer denial from absence. |
| Y05 | Appearance | **SHIPPED** | Dark/Mineral selection and propagation ship. |
| Y06 | Sign Out | **DEFERRED** | Requires revocation plus cache, keychain, widget and Live Activity cleanup with truthful offline behavior. |
| Y07 | Public signup/password/recovery/billing/export/deletion | **EXCLUDED** | Outside the controlled beta and the approved Settings sequence. |
| Y08 | Founder connection/diagnostic tooling | **EXCLUDED** | Preserve as current tooling; do not visually redesign before architecture reactivation. |
| Y09 | System account/authentication sheets | **EXCLUDED** | System-owned or outside current beta scope. |

### U — Utilities, Watch, widgets and system integrations (11)

| ID | Surface family | Build 91 status | Build 91 delta / closeout disposition |
|---|---|---|---|
| U01 | Utility logger/error states | **PARTIAL** | Surface real validation/refusal states where currently silent (including entry/discard/note rejection seams) using existing copy/tokens. Any unresolved policy question returns to feature backlog. |
| U02 | Watch workout surfaces | **SHIPPED** | Timed-set duration, Complete Set gating, footer and truthful ready-haptic work ship; real-hardware acceptance remains. |
| U03 | Workout Live Activity | **SHIPPED** | Current authority. |
| U04 | Home widget | **PARTIAL** | Accepted visual system ships. Increase refresh interaction to an effective ≥44 pt hit target while retaining compact glyph, refresh behavior and distinct routing. |
| U05 | Notification permission prompt | **EXCLUDED** | System-owned. |
| U06 | Notification actions | **SHIPPED** | Build 91 universal skip ships. |
| U07 | HealthKit permission prompt | **EXCLUDED** | System-owned; separate repeated-prompt defect audit remains queued. |
| U08 | File/photo/date system controls | **EXCLUDED** | System-owned internals; app wrappers are covered under E17/E20–E23. |
| U09 | Deep links and notification routing | **SHIPPED** | Current authority. |
| U10 | Widget/Live Activity routing | **SHIPPED** | Current authority. |
| U11 | Internal review, debug and test harnesses | **EXCLUDED** | Not an app-owned production design surface. |

## Reconciled implementation gaps

These are the only required redesign-closeout gaps. They all have a design basis; none requires exploratory product design.

1. **Home priority interaction and visual tail — required, low/medium risk.** The post-Build-91 Founder prompt on fresh `origin/main` is authoritative future work: direct red circular one-tap skip on Home, confirmed-only 1–1.5 second “Skipped”/“Completed” feedback, duplicate suppression, Reduce Motion support and ≥44 pt targets, including grouped child rows. Combine it with the remaining legacy priority-card internals and Home subordinate states.
2. **Operating Plan Energy history — required, medium/high risk.** `EnergyStrategyDetail.readModel` hardcodes an empty history while the Server read projection exposes only the active phase. Add canonical prior-phase snapshots Server-first and decode them natively. This is the only closeout item with a cross-repository data-contract prerequisite.
3. **Widget refresh target — required, low risk.** The visual translation is shipped; current 24/28 pt frames need an effective ≥44 pt interaction target without changing visible density or routing.
4. **State-tail translation — required, low/medium risk.** One bounded pass over Home subordinate states, Workout Match non-idle states, the DEXA PDF wrapper, generic intake date wrapper, training supporting-media placeholders and Logger refusal/error truthfulness. Use the already-approved shared primitives and Evidence Workflow kit; no new boards or navigation behavior.
5. **Build 91 physical acceptance — required evidence, not implementation.** Run the release report's real-device checklist, especially Evidence Dark/Mineral, OP/DEXA routing, Watch footer/haptic, universal skip and cross-lane regressions. Roll only confirmed findings into the same closeout RC.

## Smallest consolidated closeout plan

Produce **one post-Build-91 closeout release candidate**, after Founder physical acceptance stabilizes the input:

| Order | Slice | Scope | Exit evidence |
|---|---|---|---|
| 1 | Canonical data prerequisite | Server Energy phase-history projection + contract fixtures; Native decode/render. No client inference and no rewriting the current phase as history. | Canonical fixture demonstrates active + immutable prior phases and backward-compatible decoding. |
| 2 | Native visual closeout | Home direct skip/acknowledgements and priority internals; Widget 44 pt target; the bounded state-tail list above. | Focused source/unit/UI coverage plus Dark/Mineral, Dynamic Type, VoiceOver and Reduce Motion checks. |
| 3 | One-device acceptance pass | Re-run the Build 91 checklist plus the changed Energy/Home/widget/state-tail seams. | Every non-deferred matrix row is shipped or explicitly system-owned; no required ledger entry remains open. |
| 4 | Close the ledger | Update stale implementation statuses and publish one final immutable acceptance report. | Ledger credits all nine final-design groups and records the RC release authority. |

Do not split these visual seams into additional design lanes. The Server prerequisite can be prepared first, but it should land with the same consolidated RC acceptance envelope.

## Intentionally separate work

### Deferred Settings/account architecture

The approved sequence remains: Settings family → Profile contract → Appearance → Data Sources projection → Sign Out. Appearance and the minimal Settings shell already ship; Profile, Data Sources and Sign Out remain intentionally deferred. Founder diagnostics and connection/DEXA writeback tooling stay untouched until that architecture is reactivated. This is not part of the visual closeout RC.

### Build 92 Training Variants

Training Variants and all Build 92 branch/foundation work are explicitly outside this audit and must not be bundled into the closeout RC.

### Feature/defect backlog, not redesign

- Repeated Apple Health permission sheets: separate queued audit `5c86fbde`; Apple controls are system-owned.
- The known Watch UI no-`WCSession` harness limitation.
- Sheet-local routing/exercise breadcrumb or other navigation defects discovered during device acceptance, unless directly caused by a closeout edit.
- Any Logger refusal that reveals an unresolved product-policy question rather than a missing presentation.

## Design completeness declaration

**DESIGN COMPLETE.** The accepted design packages, shared visual system and deliberate system-owned/deferred boundaries cover every discovered production app-owned surface. No additional image, mockup, review board or design artifact was warranted, so none was created or published. The remaining work is implementation and acceptance only.

## Audit method and evidence

- Read the staged task at `287d8745` and the prior 98-group coverage audit.
- Reconciled the three final design packages and `DESIGN_IMPLEMENTATION_DELTA_LEDGER.md` against Build 91 source and commit ancestry.
- Compared the 46-destination historical inventory to Build 91's 48 cases and accounted for Settings and Appearance.
- Inspected the actual presentation declarations, route surfaces, Watch app, widget, Live Activity, shared design kit and Server Operating Plan projection.
- Verified the named implementation commits are ancestors of Build 91, including capture, briefing history, intake/review, global appearance/widget, Evidence Option A, Operating Plan/Watch, photo comparison, recovery continuity and universal skip.
- Fetched `origin/main` immediately before closeout and included its new post-Build-91 Home interaction prompt in the plan; no stale main assumption was used.

No Xcode build, simulator, test suite or render was run. Rendering was unnecessary because the audit found no genuinely missing design surface.

## Storage and workspace safety

| Point | Free space | Notes |
|---|---:|---|
| Audit start | 18 GiB (96% used) | Checked before any possible rendering. |
| Audit closeout | 17 GiB (96% used) | Shared-volume drift observed; no rendering/build artifacts created by this task. |

The active checkout remained on `codex/universal-priority-skip-server-20261007` at `738ce668`. This task created no checkout files. During closeout, a concurrent HealthKit lane placed `.healthkit-repeat-authorization-audit-publication.json` and `agent-handoffs/reports/20261007T225840Z-healthkit-repeat-authorization-audit.md` in the shared checkout; both were left untouched. Publication uses the installed guarded report-only publisher from a throwaway worktree, adds only this timestamped report to `origin/main`, preserves `agent-handoffs/latest.json` and `latest.md`, and does not touch product code or another lane.

## Founder decision / next action

Accept this matrix as the final design coverage baseline, complete the Build 91 physical-device checklist, then authorize the single post-91 closeout RC above. The already-deferred Settings architecture and Build 92 Training Variants remain independent.
