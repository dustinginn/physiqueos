URGENT PRODUCTION INCIDENT — Native app unusable / Home could not be loaded

Founder report: Sep 28, 2026 around 08:47 local time. Native app currently shows a blank Home surface with only:
"Home could not be loaded."

Treat this as the highest-priority production incident. Pause the current Monthly/Briefing Intelligence feature work. Do not deploy the briefing candidate while this incident is unresolved.

GOAL

Restore Founder production app availability first, then establish exact root cause and publish a post-incident report.

IMMEDIATE TRIAGE

1. Reverify current production authority before touching anything:
- current production Server/Web branch/SHA/deployment;
- current schema/migration state;
- /live and /ready;
- current Native build expected by Founder;
- whether any deployment/config/database change occurred since the last known-good state.

2. Reproduce/read the failing Native Home request using bounded diagnostics:
- inspect production application logs around the Founder report time;
- inspect /api/v1/native/read/home behavior for Founder using approved read-only paths;
- determine HTTP status, latency, exception/error class and failing dependency;
- check whether Goals, Log, Evidence and other Native read surfaces fail too, or Home only;
- check whether this is Server availability, database, read-model, auth, serialization/presentationVersion, timeout/performance, or client-specific.

3. Check infrastructure health:
- DigitalOcean app/component status;
- deployment status;
- database connectivity/readiness;
- error/latency spike;
- domain/TLS only if evidence points there.
Do not assume the screenshot proves Server-wide outage.

4. Preserve evidence before remediation:
- exact timestamps;
- request/path;
- relevant bounded logs;
- production SHA/deployment;
- error signature;
- affected surface(s).

REMEDIATION AUTHORITY

Founder is authorizing immediate bounded remediation necessary to restore the production app, subject to the established production safety rules.

Prefer the smallest reversible fix.

If there is a clear recent production regression and rollback is safer/faster than a new patch, prepare/execute the established rollback path after verifying exact authority and blast radius.

If a small hotfix is clearly safer, implement with deterministic regression coverage, fresh-context review, deploy through the established guarded production workflow, and verify.

Do not deploy unrelated Briefing Intelligence changes as part of the incident fix.
Do not bundle backlog items.
Do not mutate Founder data except where an explicit data repair is proven necessary; if data mutation would be required, stop and request Founder authorization with the exact bounded mutation plan.
Do not run destructive SQL.
Any SQL diagnosis must use the approved read-only production path and BEGIN READ ONLY / transaction_read_only verification.

ACCEPTANCE

Incident is not resolved merely because /live or /ready is 200.

Verify:
- affected Native read endpoint(s) return successfully for Founder;
- Home loads from authoritative production data;
- no material regression on Goals, Log, Evidence and You/read surfaces;
- latency is within normal/acceptable range;
- production authority is documented;
- any rollback/hotfix is independently verified.

If the issue disappears without remediation, still identify the strongest supported cause and verify the app path is stable before closing.

BRIEFING WORK

Freeze the current Briefing Intelligence / September Monthly candidate exactly where it is. Do not lose or rewrite the Founder preview work. Resume only after this incident is formally closed and Founder/ChatGPT authorizes continuation.

REPORTING

Publish a GH incident report with:
- impact/window;
- root cause;
- evidence;
- remediation;
- exact deployed/rolled-back SHA and deployment ID if changed;
- verification;
- whether any Founder data was affected;
- whether Briefing candidate remains unchanged.

STANDING NOTIFICATION RULE

Push-notify Founder immediately:
- when you identify the root cause;
- before any action that requires new Founder authorization;
- when service is restored;
- whenever you stop or need input for any reason.

Do not silently stop.

END TASK.
