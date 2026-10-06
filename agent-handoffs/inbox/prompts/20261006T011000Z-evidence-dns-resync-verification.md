PhysiqueOS Evidence Reliability — verify GoDaddy authoritative DNS resync after Founder re-save

Continue in the EXISTING Claude Evidence Reliability Remote Control chat using High reasoning. Same chat.

FOUNDER ACTION COMPLETED

Founder has now edited/re-saved the existing GoDaddy DNS CNAME for:

physiqueos.dustinginn.com

The target was intentionally left unchanged.
Founder lowered TTL to 600 seconds / lowest available as previously instructed and clicked Save.

Do NOT make any DNS changes yourself.

GOAL

Verify whether GoDaddy's stale authoritative nameserver has resynchronized and whether production hostname resolution is recovering.

PRIOR PROVEN STATE

Before Founder re-save:

ns65.domaincontrol.com:
- SOA serial 2026090800
- physiqueos.dustinginn.com -> CNAME physiqueos-foundation-staging-a9or4.ondigitalocean.app

ns66.domaincontrol.com:
- stale SOA serial 2026082000
- physiqueos.dustinginn.com -> NXDOMAIN

This caused intermittent production hostname failures and up-to-3600-second negative caching.

Production Server itself was healthy:
b7eb1e397f0238df9ae904fd182ddbb51602e8d8
deployment 6fa4e887

VERIFICATION

Begin immediately.

Query both authoritative nameservers directly with recursion disabled:

ns65.domaincontrol.com
ns66.domaincontrol.com

Verify:
1. SOA serial on both.
2. physiqueos.dustinginn.com response status.
3. exact CNAME target.
4. TTL returned.
5. whether ns66 is still NXDOMAIN.

Also check representative public recursive resolvers:
- Cloudflare 1.1.1.1;
- Google 8.8.8.8;
- Quad9 9.9.9.9.

Check the production hostname itself for:
- successful DNS resolution;
- /api/v1/health/live;
- /api/v1/health/ready.

Do not treat recursive resolver NXDOMAIN immediately after the authoritative fix as failure if it is clearly an old negative cache. Distinguish authoritative correctness from recursive-cache convergence.

POLLING

If ns66 remains stale:
- poll authoritative state periodically for up to approximately 30 minutes;
- use a reasonable cadence (about every 3–5 minutes);
- do not hammer GoDaddy.

If ns66 updates:
- immediately verify ns65/ns66 parity and the exact CNAME;
- check public resolvers;
- report whether any remaining NXDOMAIN is consistent with cached negative TTL;
- stop polling once authoritative state is correct.

If after approximately 30 minutes ns66 still serves the stale zone:
- STOP;
- publish the exact latest ns65/ns66 serials and responses;
- state that GoDaddy support escalation is required;
- provide concise support-case wording Founder can paste.

Do not ask Founder to repeatedly re-save or delete/recreate the record.

APP / CODE

Do not modify the Native reliability candidate c3d9d257.
Do not modify Batch 3 preview 9fa2428c.
Do not deploy anything.
Do not touch production data.

The existing Native resilience fix remains valid regardless of DNS recovery.

REPORTING

Publish a short addendum to the Evidence Reliability report with:
- time Founder action was verified from this task;
- authoritative before/after;
- public resolver state;
- production health;
- whether the DNS incident is resolved at authority level;
- whether recursive caches are still converging;
- whether GoDaddy support is needed.

Update normal reporting pointers without erasing the separate Batch 3 integration lane.

NOTIFICATION

Notify Founder when either:
1. authoritative DNS is confirmed fixed:
PhysiqueOS DNS — GoDaddy authoritative nameservers are synchronized.

or

2. the 30-minute window expires with ns66 still stale:
PhysiqueOS DNS — GoDaddy ns66 is still stale; support escalation required.

STOP after one of those outcomes.

END TASK.