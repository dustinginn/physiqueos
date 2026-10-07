PhysiqueOS Build 92 — Native Training Execution Variant Create + Select candidate

OWNER: Use ONE dedicated Codex Build 92 Native Training Variants conversation/work environment. Do not spawn child chats, subagents, extra Codex sessions or duplicate worktrees. This lane exclusively owns Training Logger/variant Swift source and the optional Watch variantLabel presentation seam.

FOUNDER AUTHORIZATION: Implement the approved Native Create+Select V1 on shipped Native Build 91. Create an isolated candidate and report. Do NOT bump build, archive, TestFlight upload, deploy Server, seed Founder data, or merge other Build 92 lanes.

AUTHORITY
- Native released Build 91 SHA 106f05183ea3e2328496acce0636dc087116bbce, version 1.0 (91).
- Server variant design and existing foundation at 6ac19b8c2e224a91a04e53aa5029ad14d2f3e2a3. Foundation report agent-handoffs/reports/20261007T155922Z-build92-training-variant-server-foundation.md must be read IN FULL.
- New concurrent Server reconciliation task staged at 4ee8cf13a639ab278dd1a468302984f1130a9e07; it will adapt foundation to live production 738ce668. Coordinate read-model shapes and actual commit when available; do not rely on an unpushed SHA. No Server changes by this Native lane.
- Founder-approved Build 92 scope backlog update 49215f14056b9a695709d4d560597aba69b8af45.
- Initial design/audit agent-handoffs/reports/20261007T151537Z-training-variant-audit-build92-design.md.

V1 IMPLEMENTATION
1. Preserve historical Logger behavior, Ordinary sentinel and existing exercise set/reps/load semantics. No duration/timed-hold input, no generic new set type, no Super Set variant option.
2. Decode optional Server executionVariantsByExercise into canonical per-exercise choices. Missing field means old Server/Ordinary-only; never infer variants from old sessions. Add optional immutable variantId to executionVariant selection while keeping legacy keys/labels backward-compatible.
3. Variant picker for each catalog exercise: Ordinary, canonical active choices for THAT exercise, divider, Create Variant…. Show Create only when Server projection supports it; do not allow fake local-only variants, and do not leak one exercise's variants to others.
4. Create Variant sheet takes name only (max 40; server normalization authority). Use training-catalog.execution-variant.create.v1 with stable commandId/idempotency key for retries. On created/reactivated/already_exists, insert canonical returned choice and immediately select it; on offline/error keep the prior selection and show truthful inline retry, no duplicate definition.
5. Do not clear sets when switching variant; inherit same sets/reps/load. When selected, use stable canonical variant identity in previous-performance and finale payload, preserving partition from Ordinary and other variants.
6. Watch row may display optional variantLabel from projection, display-only; no Watch edit/create or duration. Preserve HealthKit workout session and WCSession authority.
7. Regression tests: no-variant old Server; per-exercise isolation; selection + create; idempotent repeat/offline/stale; persisted selection; existing Ordinary sessions unchanged; Static Hold existing history keyed properly after definition; no Superset choice; performance records/Adaptive Progression identity contract; Live Activity/Watch compatibility. Add focused iPhone UI/Watch tests where necessary.
8. Do not change home priority UI, Evidence shared colors, Widget controls, HealthKit authorization coordinator, Energy Strategy or the unfinished visual-state tail. Native Logger files belong to this lane; the separate design-closeout lane must not edit them concurrently. At integration, a bounded Logger refusal/error-state styling delta may be reviewed separately.

TEST/STORAGE
Follow mandatory 4bcfe4d861eb5abeb0cdfef1dead1fdc1d926217 storage safety: log free before/after, preserve archives Builds 85–91, active worktrees/processes and all relevant proof; reuse one dedicated DerivedData/simulator. Avoid simultaneous full Xcode UI/Release runs with other Native lanes; negotiate a sequential expensive-test slot. Run narrow unit/UI gates first and only larger suites when sufficient headroom and other build lanes idle. Never silently skip required final integration gates. Stop safely if free space insufficient; no broad cleanup.

PUBLICATION
Founder authorizes one exact Native candidate branch codex/build92-native-training-execution-variants-20261007 and full reachable history to verified dustinginn/physiqueos after clean diff and tests; normal push only, no force. Founder also authorizes final new timestamped report via installed guarded report-only publisher to main: add only new report file(s) under agent-handoffs/reports/, latest.json/latest.md unchanged, normal fast-forward, no other modification. Both bounded Git pushes approved; do not ask for duplicate remote-ownership permission once actual target/refs are verified.

FINAL
Report exact candidate SHA and branch, Server contract version expected, changed files and test gates, conflicts requiring integration, storage reclaimed. STOP before deployment/release. Build 91 physical acceptance remains pending for October 8; do not overwrite its archives or release authority.

Notify: PhysiqueOS Build 92 Training Variants Native Create + Select candidate ready.
END TASK.