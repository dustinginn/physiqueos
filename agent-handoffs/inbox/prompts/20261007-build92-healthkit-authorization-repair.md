PhysiqueOS Build 92 — Phone and Watch HealthKit repeated-authorization repair

OWNER: Continue the EXISTING PC Codex HealthKit project/audit conversation (audit result at main commit 0fee162b2f64c427053acdd5a05e219d51ef2c6b). Keep this lane completely separate from Training Variants and final UI redesign. Do not start a child chat, subagent or a duplicate session/worktree.

FOUNDER AUTHORIZATION: Implement the bounded post-Build-91 authorization repair, commit/push an isolated candidate, publish a report. This is implementation-candidate authorization only: NO TestFlight upload/bump, no Server deployment, production mutation, iPhone/Watch permission reset, reinstall/pairing, or workout start on Founder hardware.

AUTHORITIES:
- Native shipped Build 91 106f05183ea3e2328496acce0636dc087116bbce, 1.0(91).
- Full source forensic report agent-handoffs/reports/20261007T225840Z-healthkit-repeat-authorization-audit.md.
- Founder decision approving this fix in Build 92 is on origin/main at commit 49215f14056b9a695709d4d560597aba69b8af45.
- Apple permission sheets on phone and Watch should only occur for genuinely unanswered type/direction or altered OS authorization state. Do not try to suppress actual OS-required consent or infer grants for read types.

IMPLEMENTATION REQUIREMENTS
1. Phone iOS: reuse/integrate HealthKit getRequestStatusForAuthorization(toShare:read:) for exact requested scopes before raw authorization; status unnecessary must not call raw request. Status shouldRequest may request only in deliberate foreground user-visible context; unknown/errors fail closed with truthful recoverable status, not a false grant.
2. One shared iPhone authorization coordinator, per-target serialization and coalescing of duplicate scope-in-flight requests across process-launch observer registration, foreground bootstrap, protected-data recovery and Founder diagnostic. Background HealthKit observer launch must never present a permission sheet.
3. Scope types by active feature; avoid requesting dormant Sleep with every startup merely because in the registry. Preserve source observation and existing HealthKit ingestion/strategic evidence separation. Diagnostic Sleep should request only Sleep, not the entire phone V1 union. Preserve explicit DEXA write-only consent and write-status handling; do not request DEXA read or Weight write.
4. Watch: preflight its exact separate workout share/read type set before raw request; don't call raw authorization again for answered types. If first/new unanswered Watch consent is required, present only from a direct Watch action, not silently from phone-start auto HealthKit session trigger. Preserve exactly-once HealthKit workout starts, late phone-start recovery, Active Health status truthfulness, no duplicate workout and correct finish/save.
5. HealthKit status may tell whether to request, NOT whether READ was granted. Empty read remains no visible data. No durable invented-granted cache; no health values in logs. Can instrument privacy-safe scope digest, app target, trigger, OS status, coalescing and request count.
6. Prove race-safe deterministic unit tests with injectable fake service and controlled async behavior. Cover phone foreground/background race, cold launch, upgrade with already-answered set, new type prompt, unknown status, dormant Sleep, diagnostic, explicit DEXA write consent, Watch first/second workouts, phone-start auto-recovery, rejected/empty read, concurrent duplicate requests. Include focused Watch and iPhone UI assertions where feasible. Avoid changing HealthKit canonical ingestion/protocol content or Trust correlation policies.

OWNERSHIP/INTEGRATION
Own HealthKit coordinator/service and Watch HealthKit lifecycle code only; do not edit Training Logger variant picker, Watch row variantLabel source unless unavoidable. If any overlap with Variant lane on WatchWorkoutStore/WatchWorkoutContracts, document exact overlapping hunks and preserve both semantics at later integration. Do not rewrite shared feature files to make conflict magically disappear; report overlaps.
The next release is Build 92 but this task MUST leave build number 91 in isolated candidate and not upload.

STORAGE
Read 4bcfe4d861eb5abeb0cdfef1dead1fdc1d926217; start with free-space/process census, use only necessary focused tests and one reusable DerivedData. Never run parallel large Xcode test/Release builds with Native Variant lane or UI closeout lane; serialize expensive gates via owner agreement. Preserve all archives, release receipts, active simulators/processes and protected data; no broad cache purge.

PUBLICATION
Founder explicitly authorizes pushing exact isolated candidate branch codex/build92-healthkit-authorization-repair-20261007, with its reachable Git history, to freshly verified dustinginn/physiqueos via normal non-force push. Founder also authorizes final NEW report-only publication to main with installed guarded publisher, adding only new file(s) under agent-handoffs/reports/, preserving latest.json/latest.md and all existing files. Bounded push authorization includes verified destination, no extra remote-ownership approval is needed; stop if mismatched.

FINAL REPORT
Root cause addressed vs still unproven OS behavior, exact changed files/SHA, tests and runtime cases, any Watch/variant overlap, storage before/after. No app update claimed until separate Build 92 integration/release.

Notify: PhysiqueOS Build 92 HealthKit authorization repair candidate ready.
STOP.