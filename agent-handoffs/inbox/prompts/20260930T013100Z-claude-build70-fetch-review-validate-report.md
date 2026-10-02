Claude Build 70 continuation/checkpoint instruction

First read and obey:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

Then fetch/review the current Build 70 work and continue from the latest pushed state.

Known branches to independently verify:
- Server combined candidate: claude/next-build-server-candidate-20260929
- Native peptide/Build 70: claude/peptide-ux-native-20260929

Do not assume the SHAs in prior chat messages are still current. Reverify remote heads.

Review the existing candidate/status report:
agent-handoffs/reports/20260929T175500Z-peptide-build70-candidate-status.md

Also review any later commits/reports on the branches and reconcile the report against the actual current remote state.

OBJECTIVE

Bring Build 70 to a clearly reported candidate state, not necessarily deployment.

1. Confirm all intended scope is present:
- simplified peptide editor;
- canonical Pause/Resume;
- history-preserving dose/schedule semantics;
- Build 69 roll-forwards:
  - Logged Today Apple Health provenance placement;
  - Foam Rolling Mark Skipped;
  - Weight Weekly Averages full selected-Goal range.
- preserve accepted Build 69 behavior.

2. Confirm exact Server and Native candidate SHAs.

3. Review the current disk/resource state.

Do not violate the established 15 GiB free-space floor for heavy validation.

If safely possible, free disposable build/cache artifacts without deleting:
- source;
- uncommitted work;
- credentials;
- private Founder evidence;
- rollback/reproducibility material.

Prefer comfortably above 15 GiB, ideally approximately 18–20 GiB, before heavy Native suite/Release operations.

4. Run remaining exact-candidate gates when resource-safe:
- Native full suite;
- Native Release compile;
- exact Server candidate production build;
- any targeted deterministic tests required by commits made since the last review.

Risk-scaled validation:
- do not add a broad simulator tour;
- manual/simulator testing only for a specific changed interaction where automated tests cannot provide sufficient evidence.

5. If a gate fails, diagnose/fix only if bounded and safe. If it requires material scope expansion, stop and request review.

6. Run/finalize exact-SHA review after the candidate is stable.

DO NOT:
- deploy Server;
- upload TestFlight;
- integrate Codex auth work;
- touch Photo Intelligence;
- expand into HealthKit reconciliation-notification debugging unless separately authorized;
- delete private evidence or important rollback material merely to create disk space.

MANDATORY STOP CHECKPOINT

Whether you:
- finish;
- hit usage limits;
- hit disk limits;
- hit a test/build failure;
- need a decision;
- or pause for any reason,

publish a GH checkpoint BEFORE stopping.

The checkpoint must include:
- exact Server branch/SHA;
- exact Native branch/SHA;
- scope actually present;
- validation actually run + exact results;
- validation still outstanding;
- disk free space;
- review status;
- deploy/TestFlight status;
- blockers/decision needed;
- safe next step;
- any local-only/untracked state.

If all gates pass, publish a final Build 70 candidate closeout for Founder/ChatGPT review.

Do not deploy or upload until explicitly authorized.

END INSTRUCTION.
