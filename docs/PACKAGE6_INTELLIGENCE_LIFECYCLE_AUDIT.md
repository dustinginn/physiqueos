# Package 6 — PI / Briefing / Event Intelligence Lifecycle

## Authority and scope

Package 6 starts from `981f04f4812453e92e36dd84cbff99e6c28d0d02` on
`codex/server-plumbing-intelligence-lifecycle`. It changes server-owned
intelligence lifecycle plumbing only. It does not change PI scoring, Confidence
bands, coaching copy, historical artifacts, Native code, schema, or production
data.

## Live trigger and publication inventory

| Output | Live trigger | Canonical occurrence | Cutoff | Publication boundary |
| --- | --- | --- | --- | --- |
| PI / Confidence | authorized Briefing or Event finalization | owner + publisher + Goal + Phase + artifact + evidence window + idempotency key | frozen artifact/event cutoff | atomic artifact + Confidence publication |
| Midweek Briefing | provider worker cadence loop | owner + Midweek evidence-window ID | end of Tuesday in the owner's timezone | canonical Briefing/Confidence unit of work |
| Weekly Briefing | provider worker cadence loop | owner + Weekly evidence-window ID | end of Saturday in the owner's timezone | canonical Briefing/Confidence unit of work |
| Monthly Briefing | provider worker cadence loop on local day 1 | owner + prior calendar-month window ID | end of prior month in the owner's timezone | canonical Briefing/Confidence unit of work |
| DEXA Event | confirmed canonical DEXA Event path | exact Event artifact + exact DEXA binding | scan timestamp or local scan-day end | atomic Event/Confidence publication |
| Photo Event | confirmed canonical Photo Event path | exact Event artifact + exact Photo Session binding | capture timestamp or local capture-day end | atomic Event/Confidence publication, or historical matched-only binding |
| Late-evidence reconciliation | semantic evidence-change planner | current publication root + occurrence | original frozen publication window | explicit revision work item and replacement lineage |

Recurring cadence is independent of the durable evidence outbox. The provider
worker polls it directly and uses a PostgreSQL owner advisory lock plus one
durable operation row per occurrence. Event creation remains source-owned by the
confirmed evidence workflow. Package 6 does not invent an additional outbox or
invoke OpenAI during verification.

## Proven root causes

1. Monthly precedence was split between two services. The scheduled-cadence
   selector gave local day-1 Monthly work precedence, but the production
   cadence registry evaluated Monthly, Weekly, and Midweek independently. A
   day-1 Sunday or Wednesday could therefore publish two recurring artifacts.
2. Weekly and Midweek windows were expressed as local calendar dates but did
   not carry an absolute cutoff. Confidence finalization fell back to
   `23:59:59.999Z`, which ends a Pacific evidence day seven or eight hours too
   early.
3. Photo Event historical Confidence had a private history scan that differed
   from the canonical historical selector. It ignored publication chronology
   and replacement lineage, allowing Event binding to disagree with Monthly and
   other historical readers.
4. Cadence diagnostics labeled each retry with a random execution identity even
   though PostgreSQL already deduplicated on a deterministic occurrence row.
   Attempt identity and business execution identity were conflated.
5. Home could fall back to an older recurring Briefing while a day-1 Monthly
   occurrence was the intended recurring publication but had not completed yet.

## Canonical rules after Package 6

- A PI execution identity is deterministic for owner, publisher, Goal, Phase,
  occurrence, artifact, evidence window, cutoff, and idempotency key. Random
  worker invocation IDs remain attempt diagnostics only.
- Recurring operation identity retains the compatible
  `briefing-cadence:<owner>:<cadence>:<artifact>` form.
- Monthly is the sole recurring winner on local day 1. When day 1 collides with
  Sunday or Wednesday, the lower cadence is explicitly recorded as
  `superseded_by_monthly` and its generator is not invoked.
- Weekly, Midweek, and Monthly use calendar windows in the configured owner
  timezone. Their absolute cutoff is the UTC instant corresponding to the end
  of the final local evidence day.
- DEXA and Photo Event date-only evidence uses the same owner-timezone cutoff
  rule; a timestamp that already carries an instant is preserved.
- Historical Confidence selection is centralized. Valid replacements exclude
  the replaced assessment as of the requested cutoff, publication chronology
  is deterministic, and an indistinguishable competing publication fails
  closed. Photo Events use the canonical evidence-cutoff selector so a Weekly
  assessment published after its closed week can still describe that week;
  general point-in-time reads also require publication by the requested time.
- Artifact and Confidence publication remain one canonical transaction.
  Committed retries discover the matching artifact/assessment and return a
  no-op. Reconciliation uses explicit replacement lineage.
- DEXA and Photo Events remain independent of recurring cadence. They coexist
  with recurring Briefings and retain same-day Home relevance according to the
  existing Event rules.
- Stored Briefings and Events remain frozen. No read path reruns PI or replaces
  artifact-bound historical Confidence with current Confidence.

## Preservation and compatibility

The current `62 / Moderate / No meaningful change` assessment remains data, not
a code constant, and is not rewritten by this package. The two retained
defective `57 / Developing` Monthly records remain audit history; replacement
lineage prevents replaced records from regaining read authority. Product-language
formatters and coaching narrative generation are unchanged.

Existing artifact IDs, Confidence assessment IDs, event evidence bindings,
Goal/Phase chronology, and PostgreSQL operation IDs remain compatible. The new
run identity and cutoff fields are additive for future publications. No schema
migration or backfill is required.

## Native readiness

The server now owns deterministic lifecycle identity, cutoff, precedence,
historical Confidence selection, and artifact binding. Native can consume the
existing versioned Confidence and Briefing read models without recreating PI
logic. Remaining API work is presentation exposure: production Native still
needs explicit versioned endpoints/read-model coverage for Briefing history and
details, Event details, artifact-bound historical Confidence, and cadence
metadata. Those endpoints are not added speculatively in Package 6.
