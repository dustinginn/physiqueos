HealthKit Sleep Server — midnight-safe Sleep Window and closeout hardening

READ FIRST

Prospective activation / historical verification:
agent-handoffs/reports/20261001T061329Z-sleep-historical-import-verified-prospective-d0.md

Integrated Native:
agent-handoffs/reports/20261001T145408Z-healthkit-sleep-evidence-integrated-native.md

Build 76 polish:
agent-handoffs/reports/20261001T175947Z-healthkit-sleep-evidence-founder-polish.md

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

CURRENT AUTHORITY

Production Server:
b81c784e5b8a6d5b82ed02a649b5fa3d0edeeff8
deployment 8008f928-02b6-46b0-99ab-d403b870499a

Native Build 76 is VALID and Founder has accepted the Sleep Evidence UI fixes.

Prospective Sleep:
D0 2026-10-02
mode validation_only
Oura preferred
strategic Sleep OFF

Historical Sleep:
2026-07-06 through 2026-09-30
87 nights
8601 samples
sleep-canon-v2
permanently strategically quarantined

PURPOSE

Close the one known Server correctness issue in Recovery/Sleep Evidence before reliable prospective nights accumulate: Sleep Window median/spread calculations must be safe across midnight.

Then perform a bounded Server closeout audit without changing canonical Sleep, D0, strategic eligibility or Native contract.

SERVER ONLY.

Do NOT:
- modify Native;
- modify sleep-canon-v2;
- change historical Sleep records;
- change D0/policy;
- manually trigger prospective ingestion;
- enable strategic Sleep;
- change V3/Goals/Briefings/Confidence;
- alter Oura preference;
- delete validation corpus needed for the Oct 2-4 canary.

A. REVERIFY PRODUCTION

Reverify exact production authority/deployment/live/ready/schema.

If production has moved from b81c784e, inspect the delta and prove compatibility before patching.

Use current production authority as base.

B. ROOT ISSUE

Current HealthKitSleepEvidenceReadService consistency() computes medians of local minute-of-day in ordinary 0-1439 space.

That is not circular/midnight-safe.

Example:
23:50 and 00:20 are 30 minutes apart in sleep-time semantics, but raw minute-of-day values are near opposite ends of the numeric domain.

A conventional median/spread can therefore produce a nonsensical daytime typical Sleep Window.

Native Build 76 currently guards suspicious Server medians, but Server should own correct statistics.

C. MIDNIGHT-SAFE DOMAIN

Implement a deterministic night-clock transform.

Preferred conceptual domain:
minutes after a fixed evening anchor such as 18:00 local.

Example mapping:
18:00 -> 0
23:50 -> 350
00:20 -> 380
06:00 -> 720
17:59 -> 1439

Equivalent circular-statistics implementation is acceptable if simpler and rigorously tested.

Requirements:
- transform start and end clock times consistently;
- compute median/spread in transformed night space;
- map median back to minute-of-day for existing API output;
- preserve existing live contract field names/types;
- no Native contract change;
- deterministic integer/rounding behavior documented;
- do not infer timezone;
- use only nights already considered reliable by current eligibility logic.

D. ELIGIBILITY / UNCERTAINTY

Preserve current semantics:
- historical timeZoneUncertain nights are excluded from formal Sleep Window consistency;
- total sleep remains usable;
- prospective nights participate only when Server provenance marks clock time sufficiently reliable;
- mixed reliable/unreliable input counts and inferredNightsExcluded remain correct;
- no attempt to reconstruct Founder travel timezone.

E. ADVERSARIAL TEST MATRIX

Add tests for at least:

1. starts entirely before midnight;
2. starts entirely after midnight;
3. starts straddling midnight tightly;
4. 23:59 / 00:01;
5. wider but valid night distribution across midnight;
6. wake times entirely morning;
7. wake times that straddle noon/edge if representable;
8. sleep episode spanning midnight;
9. even sample count median;
10. odd sample count median;
11. one reliable night;
12. two reliable nights;
13. mixed reliable + uncertain nights;
14. all uncertain nights -> no formal typical window;
15. outlier night;
16. DST spring-forward boundary;
17. DST fall-back boundary;
18. different timezone provenance but only reliable local clocks included;
19. deterministic ordering independence;
20. same input repeated -> identical result.

Also test spread behavior around the anchor boundary.

F. API CONTRACT

Recovery landing must continue returning:
window {
 medianStartMinute,
 medianEndMinute,
 startSpreadMinutes,
 endSpreadMinutes,
 nightsUsed,
 inferredNightsExcluded
}

No schema bump unless strictly necessary.
No Native change expected.

Verify Build 76's adapter remains decode-compatible.

G. HISTORICAL INVARIANTS

Historical records must not be mutated.

Re-run read-only checks:
- 8601 samples;
- 87 days;
- first 2026-07-06;
- last 2026-09-30;
- sleep-canon-v2 87/87;
- permanent strategic quarantine 87/87;
- ordinary prospective pre-D0 remains as naturally observed, without manual writes;
- September validation parity remains intact;
- duplicate-copy correction remains intact.

Because all current historical clock times are uncertain/excluded, the visible formal consistency result should remain semantically no-typical-window for that historical-only range.

Do not rewrite stored canonical day objects merely because the read-model statistic changes.

H. STRATEGIC INVARIANTS

Re-prove zero strategic leakage:
- V3;
- Goal Confidence;
- Strategy Confidence;
- Goals;
- Briefings;
- Narrative;
- recommendations;
- strategic Evidence.

No policy mutation.

I. PERFORMANCE

Exercise:
- landing;
- 2W;
- 1M;
- 3M;
- 6M;
- All;
- paging;
- night detail.

Confirm owner/date scoping and bounded rows.

Measure read latency/query shape before/after if feasible.

The circular/night-clock math must be O(n) over already bounded nights and must not introduce new DB reads.

J. OCT 2 CANARY

Do not trigger or backfill anything.

Read current status only.

If a prospective Oct 2 record has appeared naturally:
- report sanitized existence/status;
- verify v2;
- verify source preference;
- verify whether timezone is reliable;
- verify read model includes it once;
- verify strategic leakage zero.

If none exists yet, simply report pending.

Do not make this patch dependent on a prospective record.

K. DIAGNOSTIC / VALIDATION CLEANUP

Audit obsolete Sleep diagnostic controls/artifacts.

Do NOT remove anything still useful for the Oct 2-4 empirical canary.

Safe candidates may be documented for later cleanup.

Do not delete:
- 2878-sample validation corpus;
- historical import audit state;
- prospective policy/audit;
- canary diagnostics needed to inspect background delivery.

Prefer defer cleanup until the 2-3-night canary is accepted.

L. TEST / REVIEW

Run Sleep Server suites.
Run relevant Evidence/read-service tests.
Run confidence/evidence quarantine tests.
Fresh independent review focused on circular math and contract compatibility.

M. DEPLOYMENT

If:
- patch is Server-only;
- contract unchanged;
- all tests/review pass;
- historical/strategic invariants pass;
then deploy through established guarded DigitalOcean workflow.

After deploy:
- exact SHA parity web/worker;
- live/ready;
- schema unchanged unless explicitly justified;
- read-only production acceptance;
- D0 policy unchanged;
- strategic Sleep OFF.

If any invariant fails, do not deploy.

N. ROLLBACK

Document prior authority b81c784e and exact rollback path.

This read-model math patch should be independently reversible without touching Sleep data.

O. REPORT

Publish:
agent-handoffs/reports/<timestamp>-healthkit-sleep-server-midnight-window-closeout.md

Include:
- exact base/candidate/deployed SHA;
- algorithm;
- adversarial tests;
- API compatibility;
- historical invariants;
- strategic leakage;
- performance;
- Oct 2 canary current status;
- diagnostic cleanup recommendation;
- deployment/live-ready;
- rollback.

Publish GH before every stop.

END TASK.
