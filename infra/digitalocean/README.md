# DigitalOcean target — inactive Phase 1 record

DigitalOcean is the approved eventual production target, but this Phase 1 patch does not provision, deploy, or require any DigitalOcean resource.

The later app specification will contain one immutable source/image with:

- a Next.js web/API service;
- a non-routable background worker;
- narrowly scoped scheduled jobs;
- Managed PostgreSQL 17 attached as a trusted source;
- a private versioned Space accessed only through runtime secrets;
- health/liveness checks, alerts, and manual production promotion.

Founder-stage recurring infrastructure must target approximately $25–35/month and may not exceed $50/month without explicit approval. Do not commit credentials or provider-generated resource identifiers. An executable `app.yaml` is intentionally deferred until the application, worker, database, and object adapters can pass isolated staging validation.
