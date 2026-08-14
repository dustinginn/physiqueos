# DigitalOcean Phase 2 staging

Status: **provider-backed synthetic staging accepted on 2026-08-11; production remains isolated and inactive.**

## Provisioned resources

| Resource | Provider identifier | Region / size | Recurring base |
|---|---|---|---:|
| App Platform app | `physiqueos-foundation-staging` / `bf57cf56-48cc-4cd6-90e4-a23ee5381741` | `sfo` | — |
| Web service | `web` | `apps-s-1vcpu-0.5gb`, one instance | $5.00/month |
| Worker | `worker` | `apps-s-1vcpu-0.5gb`, one instance | $5.00/month |
| Managed PostgreSQL 17 | `physiqueos-p2-staging-pg` / `f544596d-594e-4aa4-a0a8-533bda0992c6` | `sfo3`, `db-s-1vcpu-1gb`, one node, 10 GiB | $15.15/month |
| Private versioned Space | `physiqueos-p2-staging-20260811-b36ea183` | `sfo3`, CDN/public ACL disabled | $5.00/month |
| **Base recurring total** | | | **$30.15/month** |

The total is below the approved $50/month ceiling. The cluster contains `physiqueos_staging` plus an unbilled logical acceptance database, `physiqueos_phase2_test_provider_20260811`; no second database cluster exists. Temporary restore/final-validation logical databases were deleted after acceptance. Spaces has versioning enabled and a one-day incomplete-multipart abort lifecycle. The runtime Spaces key is bucket-scoped read/write; the temporary full-access provisioning key was deleted.

Pricing was reverified on 2026-08-11 against DigitalOcean's [App Platform pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/), [Managed Databases pricing](https://www.digitalocean.com/pricing/managed-databases), and [Spaces pricing](https://docs.digitalocean.com/products/spaces/details/pricing/). Usage exposure remains: App Platform outbound transfer beyond included allowances, and Spaces storage/transfer beyond the included 250 GiB storage and 1,024 GiB outbound transfer. Do not add another paid component, database cluster/standby, load balancer, dedicated egress IP, monitoring vendor, or support plan without a new cost review and approval.

## Deployment and secrets

The app uses the public Git source branch `phase2-provider-staging`; automatic deploy-on-push remains disabled. `origin/main` was not modified. The accepted runtime build is commit `55176896cb9bd2053c1092538ecbf0aa0a09eb56`, exposed as build ID `phase2-provider-staging-5517689`. Active acceptance deployment: `18151768-20b2-482a-adbe-169d06bd32c4`.

`Dockerfile.foundation` packages the shared contracts/platform foundation, the application/domain/repository modules required to construct the accepted provider composition, and the web/worker runners. It does not copy the Next product, private Founder runtime/media, generated migration packages, or private files; source tests are excluded from the image. Product routes are absent from the staging image. Public liveness/readiness are minimal; deeper status requires the operations bearer token.

Database connection/CA, bucket-scoped Spaces credentials, credential pepper, and operations token are DigitalOcean encrypted runtime variables. The app spec is rendered directly to `doctl apps update --spec -`; no plaintext rendered spec is retained. Operator copies are ignored, Windows DPAPI-protected files under `.tmp/digitalocean`, not source. Never commit, print, or copy them into docs. Rotate/revoke the short-lived provisioning API token after handoff.

The managed database firewall should retain the App Platform app trusted source only after operator acceptance is complete. Re-add a bounded operator IP temporarily for a later rehearsal, then remove it again.

## Acceptance evidence

- Migrations `000001_shared_platform_foundation` and `000002_phase2_platform_operations` applied to `physiqueos_staging`; fresh-up/down/reapply, schema, constraints, indexes, ownership, transactions, restart, and backup/restore passed in guarded logical databases with strict provider-CA verification.
- Real synthetic auth passed enrollment lock, peppered recovery hash, device/session/pairing, 10-minute access, 30-day idle and 90-day absolute fields, refresh reuse/family revoke, device/session revoke, replacement recovery, passkey server challenges/owner checks, and ten-failure PIN recovery semantics. Browser/device WebAuthn and Apple authentication were not claimed.
- Real Spaces passed private/no-unsigned-read, opaque owner keys, multipart upload, byte-derived SHA-256/length/MIME verification, five-minute maximum reads, expired handles, cross-owner denial, receipt replay/concurrency, abort cleanup, tombstones, versioning, inventory, and object-hash verification. Two intentional synthetic object versions remain; four obsolete versions from superseded harness attempts were removed.
- The App Platform worker passed successful acknowledgement, three-attempt bounded retry, redacted dead-letter, `SKIP LOCKED`, lease recovery, restart survival, heartbeat recovery, graceful stop in the guarded provider harness, and no repeat of completed work.
- Isolated backup/restore produced database semantic digest `0969c9a7390ed775f5adb6abbdb036c4185568691b5bafce6e4d3022be945e30` and manifest digest `47fdf5ebc37394405b6bff7c4f278fa11236a81000b7293ceedd901cc811b2d9`; counts, IDs, relationships, critical states, migration metadata, inventory, and both object hashes matched. The local dump and temporary restore database were deleted.
- Rollback validation reported valid with no warning payload, rolled back to deployment `961c09ff-fd71-44d7-ac2a-b66e1007181b` via rollback deployment `66e6ef16-dbb6-4d5e-8c22-c66ef57ce341`, remained fully ready, and restored the accepted build without database/object/worker-state loss.
- Final public liveness/readiness and protected operations status returned 200 with configuration, database, schema, object storage, and worker green. Missing/wrong operations auth returned 401; `/` and `/log` returned 404. DigitalOcean's ingress replaces the handler's deliberate `/api/v1/platform` 503 JSON with a provider 504/503 page; the route remains inactive and the handler contract is covered directly.

The current production web runtime does not use this app, database, Space, authentication system, or worker. Staging contains synthetic data only. No Founder data/evidence was copied and no production cutover occurred.

## Phase 5 bounded reuse

Phase 5 reuses only these existing paid resources and does not change the $30.15/month recurring base. Its all-42-collection package is generated synthetic data; no Phase 4 Founder snapshot may be uploaded. The intended logical database is `physiqueos_phase5_test_provider_20260811` on the existing cluster, and provider media uses the existing private bucket under the synthetic owner prefix.

Live Phase 5 execution passed with a short-lived custom-scope PAT limited to the existing app/database operations, the existing DPAPI-protected bucket-scoped Spaces credential, CA, and pepper. The temporary operator-IP firewall rule and isolated restore database were removed after acceptance. The retained `physiqueos_phase5_test_provider_20260811` database and three 111-byte synthetic objects are unbilled acceptance evidence. The app, one-node `db-s-1vcpu-1gb` cluster, Space, 512 MiB web, and 512 MiB worker are unchanged at the accepted $30.15/month recurring base. Do not grant Spaces-key creation, broad full access, or create a paid resource for later replay.

## Operational-readiness observation (2026-08-12)

During the earlier audit, the `phase5-staging` context could still read the accepted app and database. App deployment `dd3934a7-ff2a-4184-8c00-b5fc75b95ddf` was active; public liveness/readiness returned 200; PostgreSQL was online; managed backups existed at `2026-08-11T19:10:03Z` and `2026-08-12T07:10:12Z`. Resource topology and the $30.15 monthly base were unchanged.

That token deliberately lacked Monitoring, Uptime, and Billing scopes, so the earlier observation could not verify alert policies, utilization, billing alert, or delivery recipient. The later bounded audit below supersedes that limitation. No alert, resource, key, database, object, or recurring cost changed during the earlier observation.

## Operational alert and capacity acceptance (2026-08-12)

The later narrow audit supersedes the observation limitation above. Eight App Platform alerts are enabled to the Founder account email: deployment/domain failure and, for both `web` and `worker`, CPU/memory greater than 70% for 10 minutes plus restart count greater than 0.5 for 5 minutes. Alert-only deployment `e707a930-4a71-426d-a1f3-2d713917144b` is active and readiness remained 200.

The managed database has one enabled alert each for CPU, memory, and disk greater than 70% for 10 minutes. It remains online on the one-node PostgreSQL 17 `db-s-1vcpu-1gb` / 10,240 MiB plan; the latest observed managed backup is 0.0683214 GiB at `2026-08-12T07:10:12Z`. Its trusted source remains only App Platform app `bf57cf56-48cc-4cd6-90e4-a23ee5381741`. The operator did not add an IP or weaken the firewall solely to scrape raw metrics.

One credited Uptime check monitors staging `/api/v1/health/ready` from `us_east` and `us_west`, alerting the Founder email after two minutes globally down. Before repurposing, the same check targeted a harmless `.invalid` endpoint; both regions became down and the Founder confirmed actual email receipt. Both regions were up after the permanent readiness target was installed. DigitalOcean documents one monthly Uptime-check credit; no second check or recurring charge was added.

The Founder completed the user-only Billing control and attested that the account-email alert is active at $40/month. The alert is an early warning, not a cap. Resource topology and recurring base remain exactly $30.15/month. Fresh bucket-scoped inspection proved versioning enabled, anonymous bucket/object access denied, authenticated object readback successful, 5 live objects / 178 bytes, 11 versions / 400 bytes, zero delete markers, and zero incomplete multipart uploads. No provider object or Founder data was mutated. Full acceptance is in `docs/ENCRYPTED_MIGRATION_RECOVERY.md`.

After final verification, the revoked and short-lived operational-readiness contexts were removed from the workstation. Local context removal does not revoke a PAT; revoke the two successful short-lived operational-readiness PATs in the DigitalOcean control panel after accepting this patch.

## Read-only managed-backup freshness integration (2026-08-13)

The production migration runner now reads DigitalOcean API v2 cluster and backup metadata for the exact configured PostgreSQL cluster. It requires online status and a newest managed backup age of at most 24 hours, returns only nonsecret evidence, and blocks on unavailable/stale/missing/wrong-cluster metadata. Database uptime, staging readiness, the encrypted recovery packet, and prior documentation are not substitutes for this provider timestamp.

The check requires only a short-lived database-read PAT supplied as `DIGITALOCEAN_ACCESS_TOKEN` to the one operator process; it is never written to a manifest or result. Do not grant app/database mutation or broader provider scope. After the former context returned HTTP 401, a replacement read-only PAT verified exact cluster `f544596d-594e-4aa4-a0a8-533bda0992c6` (`physiqueos-p2-staging-pg`, PostgreSQL 17, `sfo3`) online and latest managed backup `2026-08-13T06:54:12.000Z`, age 13.527 hours at `2026-08-13T20:25:48.094Z`, size 0.06846476 GiB: **PASS** under the 24-hour rule. No DigitalOcean resource, database, backup, firewall, app, alert, object, or billing state was changed by this verification.

## Provider-side production migration dry-run boundary

Production provider validation must run in the existing App Platform boundary,
not from the Windows operator workstation. Cluster
`f544596d-594e-4aa4-a0a8-533bda0992c6` continues to trust only app
`bf57cf56-48cc-4cd6-90e4-a23ee5381741`; do not add an operator IP. The existing
web service is the authenticated control endpoint and the existing worker is
the durable executor. No service, worker, database cluster, load balancer, or
other paid component is added, so the recurring base remains approximately
`$30.15/month`.

The web service receives only nonsecret expected identities. The worker alone
receives the separate migration-target database URL, bucket-scoped Spaces
credential, credential pepper, narrow database-read PAT, cluster ID, accepted
recovery/control checksums, and canonical synthetic owner. These remain
DigitalOcean encrypted runtime variables. The narrow PAT requires database
read only; do not grant app/database mutation, Spaces-key creation, or broad
account access. The recovery passphrase and private Founder data never enter
App Platform.

The rendered spec enables the bounded feature on web and worker with
`PHYSIQUEOS_PROVIDER_EXECUTION_BOUNDARY=digitalocean-app-platform`. Web uses the
foundation database for operation/outbox audit durability. Worker uses
`PHYSIQUEOS_MIGRATION_DATABASE_URL` for the accepted migration target and the
existing Space for read-only verification. Source/build and expected Windows
production identity are pinned as nonsecret environment variables. No command
runs at startup; only an authenticated typed outbox message invokes a dry-run.

Deployment and synthetic rehearsal remain separately gated. Use the existing
app with automatic deploy disabled, render the spec directly to the provider,
verify liveness/readiness and wrong-token rejection, then submit one synthetic
operation and prove worker/status/replay/reconnect/no-mutation behavior. Never
place provider credentials in the Windows client or request payload.

## Live provider-side dry-run acceptance (2026-08-13)

The provider boundary is now accepted on deployment
`0d27de79-169a-4fda-a16c-ad868d46b7e4`, checkpoint
`73c612a539ba056e5dd3b0634a80859f83910787`, build
`provider-dry-run-73c612a`. The app still has one 512 MiB web and one 512 MiB
worker component, automatic deploy remains disabled, alerts/topology are
unchanged, and no paid resource was added.

The migration target secret is a DPAPI-sourced application credential stored
only as an encrypted worker variable. Its URI preserves the provider authority,
encoded application username/password, port, and query and selects only
`physiqueos_phase5_test_provider_20260811`. The app has no VPC, so the working
authority is the managed PostgreSQL public TLS hostname. The cluster firewall
still contains exactly one trusted source: this App Platform app. Do not add a
workstation IP or print/render the URI.

Operation `phase6-provider-dry-run-20260814-0330` completed once as
`succeeded` / `READY`. It verified PostgreSQL 17.10, schema
`000004_phase5_provider_readiness`, backup `2026-08-13T06:54:12Z` at age
19.759 hours, the private/versioned `sfo3` Space, zero incomplete multipart
uploads, worker health, package/manifest v2, and an unchanged before/after
canonical digest. Earlier connection/schema attempts failed closed; their only
permitted effect was noncanonical operations audit state. Preserve this exact
spec until a separately authorized change.

The operations credential itself did not require rotation. The workstation
must import its DPAPI artifact as a `PSCredential` and read the protected
password field; treating the object as the bearer string causes 401. Never log
the extracted token. This acceptance does not enable any startup operation,
fence, migration, canonical write, evidence movement, or product auth.
## Full-product compatibility target (source-only)

`Dockerfile.product`, `Dockerfile.provider-worker`, and `app.product.template.yaml` define the combined architecture's full Next.js web service and authority-gated worker. Render it with `PHYSIQUEOS_APP_SPEC_VARIANT=product`; the renderer derives required inputs from the selected template and must stream secret-bearing output or place it only in an ignored, bounded temporary file.

The target reuses the existing one 512 MiB web, one 512 MiB worker, Managed PostgreSQL, and private/versioned Space, so the proposed base remains $30.15/month. The database firewall remains exactly App-Platform-only. Compatibility mode is non-authoritative, restricted to isolated provider-safe data, and cannot enable public canonical writes or claim provider authority. No product-spec deployment or provider mutation occurred in the architecture patch; deployment requires separate authorization after checkpoint publication.

The full authority, routing, worker, transfer, first-write, and rollback model is documented in `docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md`.

## Full-product compatibility remediation (2026-08-14)

The product and worker Docker builds now exclude root `tmp` as well as `.tmp`, `private`, screenshots, logs, recovery material, and test output. Product standalone tracing carries the same exclusions. Both images invoke `scripts/scanProviderArtifact.mjs`, which rejects forbidden paths, Founder runtime/control filenames, recovery archives, credential-bearing database URIs, supplied private values/owner identifiers, and supplied production file hashes. The previously tracked Founder-derived Playwright runtime, private briefing PNG, and disposable render logs were removed from the current branch only; history was not rewritten.

The compatibility spec supplies `PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE=1` and the exact guarded database name to both web and worker. Both require a durable `provider-compatibility-nonauthoritative` authority row in an explicit compatibility environment. The tuple preserves Windows public/canonical authority and forbids production writes, combined execution, production operation binding, and a first-provider-write marker. `scripts/initializeProviderCompatibility.mjs` is the idempotent fail-closed initializer after schema `000005` exists.

Do not apply the migration or initializer until the exact live app spec, encrypted-variable names, alerts, topology, and rollback specification have been independently read with narrow App Platform read authorization. This source remediation does not change the existing $30.15/month footprint, firewall, app, database, Space, or deployment.

`Dockerfile.provider-worker` now collects only the worker's reachable local module graph and substitutes fail-closed provider runtime/control modules before scanning. Both provider images reject forbidden roots, credential signatures, recovery material, and `user_founder_*` owner identifiers; web tracing also excludes non-runtime scripts and tests.
