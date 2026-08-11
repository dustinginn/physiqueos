# DigitalOcean Phase 2 provisioning gate

Status: configuration prepared; **no DigitalOcean resource has been provisioned**.

Recommended region: App Platform `sfo`, colocated with Managed PostgreSQL and Spaces in `sfo3`. This is the closest approved US region for the Founder and permits same-region/VPC connectivity later.

Proposed staging resources and current monthly caps:

| Resource | Size | Monthly estimate |
|---|---|---:|
| App Platform web/API | `apps-s-1vcpu-0.5gb`, one instance | $5.00 |
| App Platform worker | `apps-s-1vcpu-0.5gb`, one instance | $5.00 |
| Managed PostgreSQL 17 | Basic Regular, 1 vCPU / 1 GiB, one node, minimum storage | $15.15 |
| Spaces Standard | One private versioned bucket; CDN disabled | $5.00 |
| **Base recurring total** | | **$30.15/month** |

Pricing was verified 2026-08-11 against DigitalOcean's current [App Platform pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/), [Managed Databases pricing](https://www.digitalocean.com/pricing/managed-databases), and [Spaces pricing](https://docs.digitalocean.com/products/spaces/details/pricing/). Recheck immediately before approval because provider prices can change.

Possible usage overages are not included: App Platform outbound transfer above the included allowances and Spaces storage/transfer above the base subscription. Do not add a dedicated egress IP ($25/month), database standby, load balancer, monitoring vendor, or second web instance at this gate because any of those would exceed or threaten the approved Founder-stage ceiling.

Provisioning requires explicit Founder approval of this exact plan. After approval, the operator must supply:

- the DigitalOcean account/team and billing-alert recipient;
- App Platform region `sfo` and database/Spaces datacenter `sfo3` confirmation;
- GitHub repository access and branch;
- a newly generated staging credential pepper;
- newly created least-privilege Spaces access keys scoped to the staging bucket;
- a Managed PostgreSQL connection string restricted to trusted staging sources;
- the staging build ID/Git SHA.

`app.template.yaml` is repository-safe and contains no credentials or resource IDs. `npm run infra:digitalocean:render` creates ignored `app.staging.yaml` only after all inputs are present. The rendered file contains secrets and must be deleted after the bounded deployment command. Automatic deploy-on-push is disabled, and the template does not create the PostgreSQL cluster or Space; those must be created explicitly after approval so cost, region, private/versioned settings, trusted sources, and deletion protection can be reviewed independently.

The current production web runtime does not use this configuration. Staging must contain synthetic data only.
