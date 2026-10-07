PhysiqueOS production incident — Build 90 Home + Goals cannot load

Start/continue the dedicated Codex production incident conversation/work environment.

Do NOT create/delegate to sub-chats, child tasks, additional Codex sessions, or unnecessary worktrees.

INCIDENT

Founder physical iPhone on TestFlight Build 90 reports:

- Home screen: "Home could not be loaded."
- Goals screen: "Goals could not be loaded."
- Founder force-closed/reopened app twice; failure persists.
- Evidence remains usable.
- You -> Founder Production remains reachable and displays "Production session available."
- Do NOT ask Founder to re-pair, reinstall, clear app data, or otherwise destroy current session/cache evidence yet.

Approximate observed time:
2026-10-07 around 06:11 PDT.

NATIVE AUTHORITY

Build 90:
32baf1d5f43120cd07088df1210e1dc84ed26a78
TestFlight VALID.

SERVER AUTHORITY EXPECTED

Adaptive Progression V1:
1b6687ffbf016575e674d12406200c3792eb90a7

Deployment:
cbe6be96-12c5-474f-a8bf-f01ba8076121

Previous Server / rollback:
b7eb1e397f0238df9ae904fd182ddbb51602e8d8

Deployment report:
d65f60f666555251ed2b06980b45024b4b872166

Production-read tooling:
d789ce2770eda2f9bdb13a48bbc572901f2c61e2

Build 91 Claude work is isolated and NOT involved.

TASK TYPE

INCIDENT AUDIT FIRST.

No production write or rollback until root cause is proven and the established safety gates authorize the exact remediation.

GOALS

Determine why Build 90 Home and Goals reads fail while the Founder Production session remains available and other app surfaces such as Evidence/You remain usable.

Establish whether root cause is:
A. Server regression from 1b6687ff;
B. production data/projection issue;
C. pairing/auth/session issue affecting only some resources;
D. Build 90 Native decoding/cache/read orchestration;
E. transient/provider/network issue;
F. another bounded cause.

STEP 1 — FRESH AUTHORITY / HEALTH

Read-only verify:
- production ref;
- active deployment;
- no transitional deployment;
- web source;
- worker source;
- runtime SHA/build ID;
- /health/live;
- /health/ready and all checks.

Require expected 1b6687ff unless production has legitimately changed.

If authority drifted, report before further assumptions.

STEP 2 — SOURCE DIFF / COUPLING AUDIT

Diff:
b7eb1e397f0238df9ae904fd182ddbb51602e8d8
..
1b6687ffbf016575e674d12406200c3792eb90a7

Identify every changed Server file and route/service dependency.

Explicitly determine whether Adaptive Progression V1 touched or imports into:
- Home projection/read service;
- Goals projection/read service;
- operating-plan reads used by Home/Goals;
- goal confidence;
- priorities;
- briefing/home assembly;
- authentication/owner resolution;
- resource router;
- canonical protocol/evidence loaders;
- shared DB/read utilities;
- cache invalidation;
- serialization/JSON projection.

Do not assume isolation because the feature was Training-specific.

STEP 3 — REQUEST/LOG AUDIT

Using the established safe production operational path, inspect bounded recent logs around the incident window.

Focus only on requests/errors relevant to:
- Home;
- Goals;
- their underlying production resources;
- authentication/session/owner resolution;
- 4xx/5xx;
- decoding/serialization or projection errors.

Do not dump unrelated request logs or Founder data.

Sanitize all identifiers/secrets.

Determine:
- whether requests reached Server;
- endpoint/resource;
- response status;
- server-side error code/message;
- whether Home and Goals share a failing dependency;
- whether Evidence requests succeeded in the same window if logs establish that safely.

If request logging does not retain sufficient detail, say so; do not broaden indiscriminately.

STEP 4 — EXACT READ REPRODUCTION

Use the existing authorized read-only production path and/or existing application read tooling to reproduce the same Server resources Build 90 uses for:

HOME
and
GOALS.

First trace Build 90 Native source to establish exact endpoint/resource sequence and decoding contracts.

Then exercise the Server side read-only using canonical owner scope.

Do not write.

For each resource record:
- HTTP/application status if applicable;
- canonical response shape/version;
- whether data exists;
- whether server throws;
- whether projection is structurally compatible with Build 90;
- whether a shared child resource fails.

Also exercise one known-good Evidence resource only if needed as a control.

Do not emit raw Founder payloads in report.
Report schema/field presence and sanitized status only.

STEP 5 — BUILD 90 NATIVE CONTRACT AUDIT

Trace exact Build 90 Home and Goals load paths.

Identify:
- API calls;
- resource dependencies;
- decoding;
- all-or-nothing aggregation behavior;
- cache/fallback behavior;
- authentication/session gates;
- error mapping that produces the exact displayed strings.

Determine what exact failure conditions yield:
"Home could not be loaded."
and
"Goals could not be loaded."

Compare those conditions to live Server responses.

Inspect whether a single optional/new/invalid field can fail the whole page.

Do not modify Native yet.

STEP 6 — PAIRING / SESSION

The physical app displays:
"Production session available."

Treat this as evidence, not proof that every credential/read path is valid.

Audit whether Home/Goals and Evidence/You use:
- same auth token;
- same production session;
- same base URL;
- same owner scope;
- same request signer;
- different scopes/resources.

Do not rotate or invalidate pairing.

If token/session expiry is implicated, determine exact reason before asking Founder to take action.

STEP 7 — CLASSIFY ROOT CAUSE

Publish one of:

SERVER REGRESSION
SERVER/DATA PROJECTION DEFECT
NATIVE BUILD 90 DEFECT
SESSION/AUTH DEFECT
PROVIDER/TRANSIENT
UNKNOWN — bounded next diagnostic required

Include confidence and direct evidence.

STEP 8 — REMEDIATION RULES

If SERVER REGRESSION is conclusively caused by 1b6687ff and rollback to b7eb1e39 is safe:
STOP BEFORE ROLLBACK unless the existing Founder authorization for incident response explicitly covers rollback. Publish the exact rollback recommendation and ask for Founder authorization if required.

Do not sacrifice Adaptive Progression V1 blindly if a smaller isolated Server hotfix is safer.

If a tiny Server hotfix is clearly correct:
prepare/test an isolated candidate, but do NOT deploy without separate Founder authorization.

If Native Build 90 defect:
prepare exact Build 91/90.1 fix recommendation; do not upload a replacement build in this task.

If session/auth:
do not ask Founder to re-pair until we have captured all useful evidence and determined that re-pair is actually the correct remediation.

STEP 9 — TEST / REPRO ARTIFACT

If root cause can be reproduced locally from sanitized fixtures:
add a regression test in an isolated incident branch/candidate only if useful.

Do not mix with Claude Build 91 branches.

REPORTING

Publish a main-visible incident report containing:
- exact production authority;
- health;
- incident window;
- source-diff findings;
- bounded log findings;
- exact Home/Goals read dependencies;
- live reproduction result;
- Build 90 Native failure condition;
- pairing/session conclusion;
- root-cause classification;
- immediate Founder action, if any;
- safest remediation;
- whether rollback/hotfix/new Native build is required;
- confirmation no production mutation occurred during audit.

If immediate user-side action is NOT needed, explicitly say:
Founder: do not re-pair or reinstall yet.

Notify:
PhysiqueOS incident — Home/Goals production load root cause identified
or
PhysiqueOS incident — Home/Goals audit needs one bounded next diagnostic.

STOP.

END TASK.