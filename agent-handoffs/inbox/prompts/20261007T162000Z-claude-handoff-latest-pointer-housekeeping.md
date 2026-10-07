PhysiqueOS handoff housekeeping — restore release latest pointers and harden report publication rules

Start ONE new Claude Remote Control conversation dedicated to repository handoff/release-authority housekeeping.

Use the normal persistent PhysiqueOS Remote Control host/worktree workflow. Let Remote Control create the isolated worktree.

Do NOT reuse product implementation conversations.
Do NOT create child sessions/sub-chats/additional agents.

TASK TYPE

REPOSITORY HOUSEKEEPING / HANDOFF PROTOCOL ONLY.

No product code.
No Native behavior.
No Server behavior.
No production deployment.
No production data mutation.
No build bump.
No TestFlight upload.

PROBLEM

Two recent Build 92 audit/development tasks incorrectly moved:
agent-handoffs/latest.json
agent-handoffs/latest.md

away from the latest accepted Native release authority.

Commits involved:
63bf054e6991a0afa3f4239b54e62f6f09fc222d
786432ca602df875d7a279e10c3db902e17a771e

Those tasks were:
- Training variant audit/design;
- Build 92 Training Variant Server foundation candidate.

Neither was a release and neither should have replaced the release pointer.

The latest accepted Native release remains Build 90.

BUILD 90 RELEASE AUTHORITY

Report commit:
57877afcb3599a80c96e5720ed73a95337037a19

Native release SHA:
32baf1d5f43120cd07088df1210e1dc84ed26a78

Build:
1.0 (90)

TestFlight delivery:
68dc945f-cfaa-43bb-a1ff-d0020fed54ff

Build 90 report:
agent-handoffs/reports/20261007T025954Z-build90-testflight-valid.md

Current production Server has since advanced independently to:
e7ffc6716706ae4d2140008a1655bfed95a93889

That Server advancement must NOT cause the Native release pointer to stop representing Build 90 unless the repository protocol explicitly defines a separate Server pointer.

GOAL 1 — RESTORE POINTER

Restore:
agent-handoffs/latest.json
agent-handoffs/latest.md

to the accepted Build 90 release state from 57877afc.

Do not simply revert unrelated report commits.

Preserve all timestamped Build 92 reports.

The only content restoration should be the latest-pointer files unless protocol documentation/tests need a guard update.

Verify the restored pointer references:
- Build 90;
- Native SHA 32baf1d5;
- correct TestFlight state/report;
- no stale Build 89 values.

If the pointer schema contains production_server_sha, determine whether that field is intended as historical server-at-release snapshot or live-current Server authority.

Prefer historical release snapshot semantics unless existing protocol says otherwise.
Do not silently mix current live Server into an immutable release pointer.

GOAL 2 — DEFINE THE RULE

Audit:
agent-handoffs/README.md
related handoff scripts/templates/tests
Claude/Codex publication instructions
any helper that writes latest.json/latest.md.

Codify:

latest.json / latest.md represent the latest ACCEPTED RELEASE AUTHORITY, not the latest agent task/report.

Report-only/audit/design/candidate tasks:
- publish timestamped reports under agent-handoffs/reports/;
- may publish artifact packages on their branch;
- MUST NOT update latest.json/latest.md.

Implementation candidates:
- MUST NOT update latest.

Production incident audits/hotfix candidate reports:
- MUST NOT update Native latest unless they themselves constitute the accepted Native release workflow.

Native release workflow:
- may update latest only at the established accepted release point, currently after the guarded TestFlight delivery reaches the repository-defined accepted state.

If the repository needs separate concepts for:
- latest Native release;
- latest Server production deployment;
- latest task/report;

do NOT overload latest.json.

Audit whether separate pointers already exist.

If not, recommend separate pointer names but do not create broad new machinery unless a tiny clean addition is clearly useful.

Primary requirement is preventing non-release tasks from mutating release latest.

GOAL 3 — AUTOMATED GUARD

Implement the smallest practical guard.

Preferred:
a validation script/test that fails when a report-only/audit/design/candidate publication changes latest.json/latest.md without declaring an accepted release task.

Use existing handoff metadata/task conventions where possible.

Possible checks:
- task/result says testflight_uploaded false and/or deployed false;
- task class/status is report-only/audit/design/candidate;
- explicit releaseAuthorityUpdate flag;
- report publication helper mode.

Do not invent a fragile heuristic based only on commit-message text if structured metadata exists.

The guard should allow legitimate Build 90-style release updates.

Add regression fixtures/tests for:
- audit tries to change latest -> reject;
- design report tries -> reject;
- implementation candidate tries -> reject;
- report-only incident tries -> reject;
- accepted Native TestFlight release update -> allow.

If Server releases use a separate established pointer path, preserve it.

GOAL 4 — REPORT-ONLY MAIN PUBLICATION PERMISSION CONTRACT

We have repeatedly hit Claude permission friction when publishing an additive report-only commit to main.

Document the narrow safe publication contract:

A report-only main publication may be pre-authorized ONLY when:
- it adds a new file exclusively under agent-handoffs/reports/;
- it modifies no existing file;
- it touches no source/config/infrastructure;
- it does not modify latest.json/latest.md;
- it does not modify README/protocol files;
- main is freshly fetched and publication is a normal fast-forward;
- any unexpected delta stops the operation.

Do NOT weaken code/config/main protections.

If there is a repository-owned Remote Control permission/policy file that can safely encode this exact narrow rule, update it.

If the permission classifier lives outside repository control, do not pretend it can be fixed in source. Instead document the exact reusable authorization text/workflow and report that external policy configuration is still required.

Do not grant broad git push permission.

GOAL 5 — PREVENT FUTURE CLAUDE/CODEX PROMPT ERRORS

Update the handoff protocol/template so future agent tasks explicitly state:

For audit/design/report-only/implementation-candidate tasks:
latest.json and latest.md MUST remain unchanged.

Only an accepted release-authority workflow may move them.

Ensure the rule is easy for future prompts/tools to discover.

TESTS / VERIFICATION

Run:
- handoff protocol validation/tests;
- new latest-pointer guard tests;
- any report publication helper tests;
- git diff --check.

Verify no app/server source files changed.

Verify latest pointer is Build 90 after the housekeeping candidate.

MAIN PUBLICATION

This housekeeping itself modifies existing protocol/latest files, so it is NOT eligible for the narrow additive report-only publication rule.

Do NOT push/merge directly to main automatically unless existing repository authority explicitly permits this maintenance class.

Push an isolated housekeeping candidate and publish its report through the existing safe mechanism.

If publishing the report itself is blocked by the permission classifier:
- the report-only commit may use the narrow additive reports-only authorization;
- the housekeeping code/pointer changes must remain isolated pending Founder approval.

OUTPUT

Push one isolated housekeeping candidate.

Report:
- exact candidate SHA;
- latest pointer before/after;
- files changed;
- exact protocol rule;
- automated guard;
- report-only publication permission disposition;
- whether external Remote Control policy still needs manual configuration;
- tests;
- recommended merge procedure.

Status:
Handoff latest-pointer housekeeping ready for Founder merge authorization.

Notify:
PhysiqueOS handoff housekeeping — release pointer restored and guard ready.

STOP.

END TASK.