# Claude Goal Intelligence: reporting contract (standing guidance)

- Task id: `claude-goal-intelligence-reporting-contract-20261010`
- Established by: Founder request in inbox prompt `20261009-claude-goal-adaptation-v2-publish-and-reporting-contract.md` at `66fa8b28`
- Generated: 2026-10-10T04:34Z
- **Scope:** Claude tasks in the Goal Intelligence / Goal Adaptation lane, including every inbox prompt assigned to that conversation. It complements the handoff protocol (`agent-handoffs/README.md`), the Codex reporting standard (`README_REPORTING_STANDARD.md`) and `RELEASE_AUTHORITY.md`, and replaces none of them.
- **Where this lives:** this report is the durable guidance note. It was published through the guarded publisher, which commits only under `agent-handoffs/reports/`. A direct commit of a separate guidance file to `main` was blocked by this session's permission policy and was **not** made.

## A task is complete only when all three are true

1. **The work is pushed.**
   - The implementation or design branch is pushed to `origin`.
   - Every non-secret artifact a reviewer needs is pushed with it: source, screenshots, validation output and an index or README.
   - The report records the exact branch name and full commit SHA.
   - Earlier approved baselines are kept; new work is additive.
2. **A durable report is on `main`.** It lives at `agent-handoffs/reports/<YYYYMMDDTHHMMSSZ>-<slug>.md` and is published as an additive commit through `physiqueos-handoff-publish` (report-only mode). It must state:
   - the task id, and the prompt path and commit;
   - the branch and exact SHA of the work;
   - the artifacts: repository paths, Claude artifact URL and version, and GitHub commit or compare links;
   - the tests and validation that were run, with their results;
   - results, blockers and unexpected findings;
   - Founder decisions made and still outstanding;
   - safety: production access, deployment, TestFlight and release-pointer status.
3. **The chat reply returns the report path and the publication commit SHA on `main`.**

The following are **not** a completed report: a local file, a Claude artifact, a chat message, or an unpushed branch. A report counts only once it can be found in recent commits on `main`.

## Notes

- **How to recognize a completion report.** The publisher titles its commits `handoff(claude): <task id>`. Such a commit *is* the completion report for that task, not an acknowledgment. Example: `f13c0065` is the completed Goal Adaptation V2 report.
- **Release pointers.** `agent-handoffs/latest.json` and `latest.md` stay untouched unless the task is an explicitly authorized accepted Native release. Design or audit reporting never uses release authority.
- **Image links.** The publisher's secret scan refuses long raw URLs. Use one of these instead:
  - the GitHub commit page, with per-file anchors `#diff-<sha256 of the repository path>`;
  - the compare view;
  - plain file names.

  Never encode or split a URL to get past the gate.
- **Branches and scope.** Design-only branches are never merged. Production, Server, Native release and other lanes (for example Codex Build 94) are out of scope unless the task authorizes them.

## Safety

No code, production, deployment, TestFlight or release-pointer change.
