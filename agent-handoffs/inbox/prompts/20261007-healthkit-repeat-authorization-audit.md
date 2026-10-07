PhysiqueOS — Apple Health repeated permission prompt audit (iPhone and Watch)

Use the EXISTING PC Codex HealthKit/Apple Health project conversation, not the Universal Priority Skip conversation and not the Claude Build 91 Native integration worktree. No new child conversations, subagents or worktrees unless an already available isolated HealthKit worktree is necessary; prefer source-only review.

FOUNDER ISSUE

Founder reports repeated Apple Health authorization sheets lately on both iPhone and Watch after recent TestFlight updates/workouts. Screenshot shows native Apple Health Access screen, PhysiqueOS asking to READ Workouts (one topic, already selected). Founder wants authorizations to persist normally between builds; repeated prompts for already authorized identical scopes are not acceptable.

AUDIT ONLY. DO NOT INTERRUPT ACTIVE BUILD 91 INTEGRATION.

Inspect actual shipped Build 90 authority Native 32baf1d5f43120cd07088df1210e1dc84ed26a78; relevant Build 86–90 HealthKit/Watch changes; Build 91 three input candidates and preliminary integrated SHA 3697951c if safely remotely available (never assume unpushed local SHA is reachable). Compare iPhone and Watch independently.

Investigate:
- all HKHealthStore.requestAuthorization(toShare:read:) call sites, triggers and call frequency;
- requested readable and writable object type sets; type-set differences by feature and by app target;
- when workout start/restore, Watch activation, HealthKit readiness, Watch session continuation, startup/background reconcile, onboarding, pairing, app updates and DEXA writeback invoke authorization;
- whether expected persistence applies to same app identity/type set and same device and the situations iOS legitimately prompts again (new type, device, reinstall, revoked/reset permission, changed bundle identity/entitlements);
- entitlements, bundle IDs, signing/team profiles, provisioning, Watch extension identity and HealthKit capability across Build 86–91 without exposing signing secrets;
- whether code can accidentally invoke repeated separate requests or lack an idempotent in-flight/session guard;
- whether an app can truthfully distinguish grant/deny for HealthKit READ access (do not claim Apple reveals read denial);
- whether phone and Watch have independently necessary requests and whether unnecessary cross-target requests exist;
- no inappropriate attempt to skip required consent, silently request broader types, or rely on cached approval where Apple requires a prompt.

Static source audit and deterministic lightweight tests only if they do not use heavy Xcode/simulator resources. Capture exact path/line/commit evidence. Classify each suspected root cause as verified, likely, or unknown (must not infer causation from screenshot alone). Do not imply TestFlight install should always prompt.

Output finite repair recommendation:
- explain expected user behavior now;
- patch plan bounded by app target/type scope, idempotent authorization coordinator and lifecycle timing (if evidence indicates necessary);
- a regression matrix for same-type repeat Build update, new-type prompt, iPhone, Watch, workout start/restore, HealthKit save and denied read access semantics;
- whether safe to defer fix until a post-Build-91 follow-up or whether release-blocking severe;
- never change production or personal health data, perform pair/unpair, reset Health permissions, or start workouts for testing.

Storage: mandatory low-disk rules from 4bcfe4d861eb5abeb0cdfef1dead1fdc1d926217; do not launch heavy simulator/full Xcode jobs while Build 91 testing uses shared Mac. No cleanup of artifacts owned by other lanes.

Publication authorization:
Founder explicitly authorizes report-only publication of ONE new timestamped report under agent-handoffs/reports/ on dustinginn/physiqueos main using the installed guarded report-only publisher. Includes necessary bounded Git push after verifying exact destination and fresh fast-forward authority; latest.json/latest.md unchanged; no existing report/file modified. No additional report-publication or remote-ownership approval is needed for this exact verified destination and scope. Do not push any new candidate/code without separate scoped approval.

Notify: PhysiqueOS Apple Health repeat authorization audit ready; candidate fix recommendation and Build 91 release impact stated.

STOP.