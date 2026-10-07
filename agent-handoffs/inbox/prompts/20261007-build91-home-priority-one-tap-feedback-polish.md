PhysiqueOS Build 91 Founder acceptance feedback — one-tap Home Priority Skip + transient acknowledgement

FOUNDER REQUEST (2026-10-07)
On Build 91 Home, Today's Priorities row currently shows a three-dot ellipsis for Skip. Replace it with an immediately actionable red circular Skip affordance. One tap should submit Skip, with no Menu and no second confirmation dialog. The UI should briefly show Skipped and fade away. Do the same for successful completion: brief Completed feedback that fades. This is the only Build 91 change requested so far.

SCOPE / AUTHORITY
This is a bounded Native post-Build-91 acceptance patch, not permission to alter the VALID Build 91 TestFlight artifact. Base implementation audit on shipped Native 106f05183ea3e2328496acce0636dc087116bbce. Use a new isolated minimal candidate branch for the next release/batched patch. Do NOT change Server 738ce668, canonical Skip semantics, native build number, TestFlight, release archive/pointers, Build 92 Training Variants or queued audits.

Existing exact source seams (from Build 91):
ios/PhysiqueOS/Presentation/Home/FocusTileView.swift:85-97: current ellipsis Menu -> Skip.
ios/PhysiqueOS/Presentation/Home/TodaysFocusCardView.swift:119-129: grouped child ellipsis Menu -> Skip.
ios/PhysiqueOS/Presentation/Home/HomeView.swift:99-113: Skip confirmationDialog (extra tap).
HomeView.swift:329-344: Skip handlers currently stage skipCandidate instead of submitting.
HomeView.swift:375-401: performSkip submits canonical projected priority.skip.v1 and acknowledges/fails.
HomeView.swift:291-327 & 353-370: completion canonical submit, transient completingIDs marker + 450 ms settle delay.

REQUIRED DESIGN AND BEHAVIOR
1. Replace the ellipsis with a distinct visible RED circular action, with a small, legible minus/skip glyph rather than three dots. Keep glyph/surface aesthetically consistent with locked Mineral and Dark palettes. Target must be at least 44x44 pt; the visible red circle may be smaller. It must not look like the green Complete circle. Accessible explicit label: Skip [priority name]. Do not use color as the only semantic indicator.
2. One tap directly calls the existing projected Skip command. Remove the Home Skip Menu and Home confirmationDialog entirely; do not create a different confirmation sheet or navigation step. When supported by canonical source the row stays actionable, regardless of reminder domain (Fadogia included).
3. The green Complete action remains one tap with existing semantics.
4. After the SERVER/authority confirms success, show a compact in-page transient acknowledgement near Today's Priorities (for example a toast over/just above the list): a Skip icon + Skipped, or green check + Completed. Keep visible briefly (roughly 1–1.5 seconds) and fade out. A row-level acknowledgement held briefly before removal is welcome, but success must remain visible even if the row disappears or list becomes empty. Respect Reduce Motion; do not produce distracting animation.
5. Feedback represents confirmed terminal state only, never the original tap or an in-flight optimistic guess. Keep existing canonical haptics, notification cleanup and reconciliation. Ensure no duplicate toast, duplicate network submission, repeat haptic or stuck marker across rapid taps, stale versions, simultaneous skips/completions or view refresh/reload. A failure remains visible/actionable with existing truthful failure information; do not show success toast. Do not automatically retry unsafe terminal writes.
6. Preserve capability gating, exact occurrence identity and expectedVersion, dated recurrence and evidence nonfabrication. No skip for already terminal, paused, informational, recovery-only or unscheduled priorities. No change to other domain-specific Skip confirmation UX outside Home.
7. Apply the same direct red circle to true daypart/grouped child rows when they have a canonical skip command, not to a non-actionable aggregate wrapper.
8. Ensure tapped target does not accidentally trigger row navigation or completion and vice versa. Accessibility test labels, independent hit regions, focus and Dynamic Type. No swipe-only discoverability reliance.
9. Existing compact Home card, Mineral palette and today's list geometry should remain clean; no unrelated layout redesign.

VERIFICATION
Source audit and focused Swift tests for direct action, confirmed-only transient acknowledgement, stale/failure states, double-tap suppression, single vs grouped child rows, no-skip capability, visible/VoiceOver semantics, and optional transient fade under Reduce Motion. Where UI tests are helpful, run only bounded impacted suites, not full simulator matrix for this small patch unless failures demand it. Do not hide regressions.

STORAGE / WORKFLOW
Mac recently had ~17.53 GiB free after Build 91; re-check before builds. Read mandatory storage addendum 4bcfe4d861eb5abeb0cdfef1dead1fdc1d926217. Preserve all archives 85–91, receipts, reports, worktrees, active processes and simulators. Safely clean only completed lane-owned regenerable outputs, no broad rm, no process interruptions, no additional subagents/child chats or redundant worktrees.

DELIVERABLE
Push exact isolated candidate to dustinginn/physiqueos only after verifying branch, remote and no unrelated history. Founder explicitly authorizes the exact scoped candidate branch push and reachable history for later integration/release (do not push generic branches). Publish one additive timestamped report under agent-handoffs/reports/ via installed guarded report-only publisher to dustinginn/physiqueos main; Founder authorizes the bounded necessary push once target/scope verified, no extra ownership approval needed. latest.json/latest.md unchanged at Build 91. Include changed paths, test results, before/after free storage, and quick Founder physical acceptance instructions.

HOLD this task until the Founder starts the post-Build-91 polish lane; do not interrupt ongoing physical acceptance. Do NOT bump, archive, upload, mutate production, or start the separate final redesign/HealthKit audits.

STOP after isolated candidate/report.