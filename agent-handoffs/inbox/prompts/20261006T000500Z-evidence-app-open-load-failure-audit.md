PhysiqueOS Evidence intermittent app-open failure audit — "Evidence could not be loaded."

TASK TYPE

NEW Claude Remote Control chat.
Use High reasoning.
Separate reliability lane. Do not modify the active Batch 3 redesign lane or its accepted/review candidates.

FOUNDER OBSERVATION

On 2026-10-05 the Founder reports increasingly frequent occurrences when opening PhysiqueOS where the Evidence tab/root renders only:

"Evidence could not be loaded."

Screenshot supplied in chat shows:
- Dark appearance;
- Evidence tab selected;
- normal bottom tab bar present;
- otherwise blank page;
- centered terminal message "Evidence could not be loaded.";
- no visible Retry action;
- this occurs when pulling up/opening the app and has been happening more frequently lately.

This is not being reported as a Batch 3 candidate defect. Founder is currently running Build 87. Treat it as a Build 87 / production reliability audit unless evidence proves otherwise.

WORKTREE RULE

Use the single Remote Control-provided worktree.
No EnterWorktree.
No secondary worktree.

CONCURRENCY / DO NOT TOUCH

Do not modify:
- Batch 3 Evidence redesign branch/candidate;
- Batch 2 release candidate;
- workout reliability candidate;
- production Server unless separately authorized after audit.

Current relevant authorities:
- Apple-VALID Build 87: f66c7fc690b1b61094e620791ee2d4a40caf3799
- clean Batch 2 RC: 793462b11ff522f116413c5b081db0ad97954305
- workout reliability Native: e9f8a957be419d89a10b316c57b90afeb08d2f17
- workout reliability integration preview: 70ebf7534a90ec4256bbddd140cb98920a4025a4
- Batch 3 final review candidate: f5257ae1013dbb04e996bab27e144201b84da8b7
- current production Server: b7eb1e397f0238df9ae904fd182ddbb51602e8d8, deployment 6fa4e887

GOAL

Determine why Evidence increasingly enters a terminal load-failure state on ordinary app open/resume and make the smallest robust fix if the cause is sufficiently proven.

AUDIT FIRST

Before changing code, trace the complete Evidence-root loading path on Build 87:

app launch / foreground transition
-> pairing/auth/access readiness
-> environment/configuration readiness
-> Evidence root/view model initialization
-> request creation
-> transport
-> Server response
-> decoding
-> state transition
-> retry/reload behavior
-> cache/stale-data behavior
-> subsequent foreground/tab-selection behavior.

Explicitly identify the exact source of the string:
"Evidence could not be loaded."

Map every error condition that can put the root into that state.

APP-LIFECYCLE CASES

Audit separately:
- true cold launch;
- warm launch from suspended;
- foreground resume after meaningful background time;
- opening directly onto Evidence because it was the previously selected tab;
- opening on another tab and then selecting Evidence;
- rapid app foreground + Evidence selection;
- network unavailable then restored;
- server temporarily unavailable;
- auth/pairing token not yet ready;
- token refresh/revalidation in progress;
- stale/cached read model available vs unavailable;
- request cancellation caused by lifecycle/view recreation;
- concurrent refreshes;
- server response arriving after a newer request;
- background/foreground race;
- app process surviving a production deploy or authority change.

PAIRING / AUTH CONTEXT

There was a recent historical pairing-token outage where pairing-token refresh was lost and access required re-pairing. Persistent pairing was subsequently addressed.

Do not assume this incident is the same issue.

Audit whether Evidence requests can race:
- device pairing restoration;
- access token/session restoration;
- credential refresh;
- access-gate readiness.

If a request is made before auth/pairing is ready, determine whether the Evidence UI incorrectly treats that transient startup condition as terminal failure rather than waiting/retrying.

SERVER / PRODUCTION READ-ONLY AUDIT

Use safe read-only production/log inspection where useful.

Check recent production Server logs around Evidence/core-navigation requests and app-open periods for:
- 401/403;
- 408/timeout;
- 429;
- 5xx;
- connection resets;
- request abort/cancel;
- malformed/partial payload;
- decode-contract mismatches;
- latency spikes;
- deployment/restart correlation;
- access-gate failures.

Do not expose credentials.
Do not mutate production data.
Use established guarded read-only paths.

If exact Founder request correlation is unavailable, state that clearly rather than guessing.

CLIENT LOGGING

Inspect existing Build 87 client diagnostics for Evidence load failures, auth lifecycle and transport if available.

Do not require root/device log collection as the first step.

If existing telemetry is insufficient to identify intermittent failures, design bounded instrumentation for the next build:
- request correlation id;
- lifecycle state;
- selected tab;
- auth/pairing readiness;
- request start/end;
- HTTP status/error category;
- decode result;
- cancellation reason;
- retry count;
- state transition;
- cache availability/age.

Do not log secrets, tokens, raw private Evidence payloads or sensitive Founder content.

UX / RESILIENCE AUDIT

The current screenshot presents a blank terminal error with no visible recovery control.

Even if the underlying transport/auth issue is transient, evaluate whether Evidence should:
- automatically retry after startup readiness;
- retry on foreground;
- retry when network becomes available;
- retry when pairing/auth becomes ready;
- retain/render last-known-good Evidence with a non-blocking refresh indicator when safe;
- expose a clear Retry button/action;
- distinguish offline/transient failure from genuine terminal/contract failure;
- avoid replacing valid cached content with a transient error.

Do not implement speculative caching semantics without proving current data-authority constraints.

Compare with Home/Goals/You loading/retry patterns so Evidence follows the strongest existing app convention rather than inventing a new one.

BATCH 3 FORWARD-COMPATIBILITY

Audit whether the same underlying load-state/request behavior survives in Batch 3 f5257ae1.

Do not patch Batch 3 directly from this lane.

If the bug exists in both Build 87 and Batch 3, document the exact integration requirement so the eventual final build receives the reliability fix without undoing the Batch 3 visual redesign.

REPRODUCTION / TESTING

Attempt deterministic reproduction using controlled seams where available:
- delayed auth readiness;
- delayed network response;
- first request failure then success;
- foreground transition during request;
- cancellation/recreation;
- stale response ordering;
- 401/403 refresh path;
- timeout/5xx then recovery;
- cached model available;
- no cache.

Do not hammer production to reproduce.

ROOT-CAUSE CLASSIFICATION

For each plausible/observed cause classify:
- proven;
- strongly supported;
- possible but unproven;
- ruled out.

State whether the increasing frequency has an identifiable reason.

PATCH AUTHORITY

If root cause is proven and fix is bounded, Claude may implement a Native fix in this lane.

Safe examples:
- startup readiness gating;
- retry after transient failure;
- request-generation/race protection;
- cancellation handling;
- foreground retry;
- Retry action;
- preserve last-known-good state where existing architecture already supports it;
- bounded diagnostic instrumentation.

STOP before implementing if the proposed fix would:
- change canonical Evidence authority;
- introduce a new persistence/cache source of truth;
- alter Server schema;
- require production mutation;
- weaken auth/access controls;
- broadly restructure Batch 3.

TESTS IF PATCHED

Add deterministic tests for the proven failure and recovery path.

At minimum cover as applicable:
- cold launch Evidence request;
- warm resume;
- direct launch onto Evidence;
- auth not ready -> ready;
- first request fails -> retry succeeds;
- foreground retry;
- request cancellation does not become terminal error;
- stale response cannot overwrite newer success;
- valid last-known-good content is not unnecessarily blanked;
- Retry action;
- accessibility;
- no duplicate request storm.

Run focused Evidence/client lifecycle tests and generic Release compile.

If a fix will ultimately integrate with Batch 3, create an integration preview or exact map proving the redesigned Evidence UI retains the reliability behavior. Do not merge it into Batch 3 without Founder authorization.

REPORT

Publish a main-visible report containing:
- root cause/ranked findings;
- exact source paths/functions;
- production/log evidence;
- reproduction evidence;
- whether increasing frequency is explained;
- fix, if implemented;
- exact Native candidate SHA;
- tests;
- Batch 2/workout/Batch 3 integration map;
- any remaining telemetry needed.

NOTIFICATION

Notify Founder whenever Claude stops or needs input.

At audit completion notify:
PhysiqueOS Evidence Reliability — app-open load failure audit ready.

If a bounded fix is implemented:
PhysiqueOS Evidence Reliability — app-open load fix ready for integration.

STOP

No TestFlight upload.
No build bump.
No production Server deploy.
No final multi-lane merge.

END TASK.