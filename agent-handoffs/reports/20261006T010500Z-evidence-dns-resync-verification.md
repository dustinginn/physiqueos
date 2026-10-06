# Addendum — GoDaddy authoritative DNS resync verified

- Task id: `evidence-dns-resync-verification-20261006`
- Prompt: `agent-handoffs/inbox/prompts/20261006T011000Z-evidence-dns-resync-verification.md` (commit 82a3e89a)
- Addendum to: `agent-handoffs/reports/20261006T003500Z-evidence-app-open-load-failure-audit.md`
- Agent: Claude, Evidence Reliability lane (same chat)

No DNS change was made by Claude. No app code changed, nothing was deployed, and production was untouched. Native candidate `c3d9d257` and Batch 3 preview `9fa2428c` are unchanged.

## Verdict

**Resolved at authority level.** The Founder's GoDaddy re-save was verified at 00:52:01Z, the first check of this task. Both nameservers were already synchronized, so no polling window and no GoDaddy support escalation were needed. Recursive caches had converged by 01:03:51Z, including the home router.

## Authoritative state (recursion disabled)

| | Before (00:12–00:33Z) | After (00:52:01Z) |
|---|---|---|
| ns65.domaincontrol.com SOA serial | 2026090800 | **2026100600** |
| ns66.domaincontrol.com SOA serial | 2026082000 (stale) | **2026100600** |
| ns65 `physiqueos.dustinginn.com` | NOERROR CNAME, TTL 3600 | NOERROR CNAME `physiqueos-foundation-staging-a9or4.ondigitalocean.app.`, TTL 600 |
| ns66 `physiqueos.dustinginn.com` | **NXDOMAIN** | NOERROR CNAME `physiqueos-foundation-staging-a9or4.ondigitalocean.app.`, TTL 600 |

The SOA timers are unchanged (`28800 7200 604800 3600`), so a negative answer can still be cached for up to 1 h if the zone ever diverges again.

## Recursive resolvers

At 00:52:10Z, 3 queries each:
- Cloudflare 1.1.1.1: 3/3 NOERROR CNAME (TTL 600)
- Google 8.8.8.8: 3/3 NOERROR CNAME (TTL 600/599)
- Quad9 9.9.9.9: 3/3 NOERROR CNAME (TTL 600)
- Home router 10.0.0.1: 3/3 NXDOMAIN, carrying the old ns66 SOA serial 2026082000 with 630 s of negative TTL left.

The router result is a stale negative cache, not an authority fault. It is the same entry first observed at 00:12Z with 3069 s left.

Router convergence:
- I watched the local router only, one query per minute, until its cache expired.
- At 01:03:51Z the router returned NOERROR CNAME (TTL 582) with A records 162.159.140.98 and 172.66.0.96.
- The macOS system resolver also resolves the alias.

## Production health

Active deployment is unchanged: `6fa4e887` ACTIVE, web `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`.

| Check | Time | `/api/v1/health/live` | `/api/v1/health/ready` |
|---|---|---|---|
| DigitalOcean app host | 00:52Z | 200 | 200 |
| Custom domain, pinned to the 1.1.1.1-resolved address | 00:52Z | 200 | 200 |
| Custom domain over normal system DNS on the home network | 00:52Z | failed (stale router cache) | failed (stale router cache) |
| Custom domain over normal system DNS on the home network | 01:03:51Z | **200** (172.66.0.96) | **200** (172.66.0.96) |

## Answers

- DNS incident resolved at authority level: **yes**.
- Recursive caches still converging: **no** for every resolver checked, home router included, as of 01:03:51Z. Other ISP or carrier resolvers that cached the old NXDOMAIN expire within at most 1 h of their last query, by about 01:53Z at the very latest.
- GoDaddy support needed: **no**.
- Founder devices: an iPhone that still shows "Temporarily offline" should recover on the next foreground or Try Again. Build 87 has no Try Again on Evidence, so on Build 87 switch tabs away and back, or relaunch. Native `c3d9d257` adds Try Again, pull to refresh and foreground retry for the next build.
- Optional durable follow-up (unchanged): move the host's DNS to a provider with consistent anycast authority.
