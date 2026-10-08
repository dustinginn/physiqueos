# Build 93 — Founder-approved Recovery content correction (Claude B)
Date: 2026-10-08 Pacific
Authority: Founder explicitly approved the October 4 locked Weekly Dark/Mineral Light and Monthly Dark/Mineral Light designs and all seven coordinator content decisions. This authorizes an isolated implementation/test candidate only, NOT integration, deploy, activation, real Sleep reads, data mutation, Build bump, archive, or TestFlight.

## Sources and precedence
Read agent-handoffs/reports/20261008T163000Z-chatgpt-new-chat-comprehensive-build93-handoff.md; agent-handoffs/reports/20261008T153634Z-build93-recovery-approved-design-foam-audit.md; agent-handoffs/reports/20261008T144707Z-build93-recovery-native-card-and-wiring.md; agent-handoffs/reports/20261008T162434Z-build93-logger-server-integration.md; agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md; agent-handoffs/latest.json. Check latest main and candidate heads before edits. Do not treat older backlog staged statuses as newer than tested reports.

Locked visual assets:
Weekly Dark agent-handoffs/artifacts/weekly-midweek-light-translation-final-20261004/screens/weekly-recovery-dark.png
Weekly Mineral Light rich field agent-handoffs/artifacts/briefing-light-log-density-final-polish-20261004/screens/weekly-light-rich-fields-full.png
Monthly Dark and Mineral Light agent-handoffs/artifacts/monthly-correction-dexa-photo-briefing-ui-20261004/screens/monthly-corrected-{dark,light}-full.png
Older V1 Green/Yellow/Red assets are content references, not layout authority.

## Seven approved decisions
1. Restore the small Foam Rolling row on BOTH Weekly and Monthly.
2. Derive real completed/missed/excused counts from canonical reminder_foam_roll_daily completionHistory, dailyCheckIns Skip/reconciliation, execution_foam_roll schedule; explicit Skips are excused; no pre-effective-date denominator, no invented occurrences. Cutoff-aware, one disposition per date, deterministic precedence, no future lookahead. Schedule authority starts 2026-09-15 in prior audit; verify from canonical source, never hardcode as a global date.
3. Preserve editorial titles, with Green fixed and Yellow/Red Server-authored editorial title; retain the distinct Monthly titled amber-ruled commentary block as locked.
4. Match October 4 summary layout exactly; remove candidate extra baseline-delta fragment from summary (keep existing baseline metric/graph).
5. Restore only defensible NON-ESCALATING training context such as 'Training performance held' or 'No downstream training constraint was established' when period and comparison evidence warrant. Missing evidence => omit/unknown; never imply causation.
6. Keep training-corroborated Red disabled until travel/illness/injury/planned-rest/deload exclusions have authoritative handling; do not alter sleep-only Recovery status policy.
7. Foam is execution context only: never affects Recovery classification, Confidence, or coaching authority. Preserve no Confidence coupling, fixture-only flags only in fixture, and approved caveat semantics.

## Implementation boundaries
Use existing isolated Recovery Native candidate e0a4706d (code 5de2f37b), Server candidate c493eb06, and tested integrated Server candidate d2b39b6d only as references. Coordinate clean non-overlapping candidate branches with Codex A; avoid overwriting integrated Server changes. Add pure bounded in-memory RecoveryFoamContextProjectionV1 or equivalent to the already loaded canonical snapshot, not new production queries/permissions. Source completions and Skip dispositions by occurrence date and generation cutoff; test duplicates, conflict precedence, absent schedule, pre-schedule dates, late changes, empty/missing periods, partial month, and exact counts. Preserve prospective-only Sleep and OFF-by-default feature, no backfill or new sleep reads. Recovery only Weekly/Monthly, never Midweek/DEXA/Photo. Do not silently activate, publish real recovery, or enable training corroboration.

Native: faithfully match locked Dark and Mineral Light sections; foam subline separates missed/excused and shows status unchanged; preserve graph, placements, titled commentary and theme. Capture truthful synthetic/fixture screenshots for both cadences and appearances; compare to locked images. Avoid fake real-device claims.

Test focused pure/Server/Native contracts and release builds as feasible; serialize heavy Xcode work with Codex, verify storage before heavy builds (prefer >=20 GiB, HOLD below 12 GiB), preserve Archives 85–92, paired devices, credentials, other lanes' worktrees/simulators and backups. Respect generator/pbxproj 0x20FF/0x21FF pinning and avoid conflicts with Claude theme branch. Do not incorporate held Energy history code. Do not alter Codex Logger/Home/Morning/DEXA or unfinished Widget amber CTA.

## Output and permissions
Produce isolated candidate SHAs, changed-file/test matrix, four-surface Recovery screenshot comparison, explicit known limitations, Server merge guidance against d2b39b6d, and a detailed GitHub report in agent-handoffs/reports; reconcile backlog only for proven candidate status. Normal narrow non-force pushes to verified dustinginn/physiqueos candidate branches and additive report-only main publication are preapproved for this task; verify current authority and avoid overwrites. No broad push/force, secrets, production evidence in reports. Do NOT change latest.json/latest.md release pointers. No Server deploy, production mutation, real Sleep calibration, feature enablement, Build 93 release, or TestFlight without separately scoped Founder authorization. If any requirement conflicts with locked design or available evidence, HOLD that subpart and report rather than invent.
