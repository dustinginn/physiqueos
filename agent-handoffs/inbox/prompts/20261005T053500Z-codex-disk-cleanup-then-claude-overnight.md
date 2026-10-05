PhysiqueOS overnight handoff orchestration — safe Mac disk cleanup, then resume existing Claude Batch 2 session

TASK TYPE

Codex orchestration/operations task.
Use High reasoning.

Founder wants to send this one instruction and go to bed.

GOAL

Safely reclaim enough Mac development storage for Claude to complete Batch 2 Checkpoints 2–5 overnight, then as the FINAL step hand the already-staged overnight prompt to the EXISTING Claude Batch 2 Remote Control session and confirm it resumes working.

Do not create a new Claude conversation.

CURRENT STORAGE CONDITION

Claude reported approximately 5.7 GB free disk.

Claude intentionally retained this Batch 2 lane's multi-GB build folder because Checkpoint 2 will reuse it.

Four remaining checkpoints will involve Xcode builds/tests, simulator captures, image/diff artifacts and a final Release compile.

Target before overnight handoff:
- minimum acceptable free disk: 20 GB;
- preferred: 25 GB or more.

Safety is more important than reaching the target. Do not delete ambiguous data merely to hit a number.

PART A — VERIFY ACTIVE AUTHORITIES / PROCESSES

Before deleting anything:
- identify the active Claude Batch 2 Remote Control session/process;
- confirm it is currently stopped/waiting after Checkpoint 1 rather than actively writing build artifacts;
- identify its current RC-provided worktree and current reusable build/DerivedData folder;
- identify active PhysiqueOS Codex/Claude worktrees;
- identify Build 86 and Build 87 retained release archives/receipts/logs;
- verify current free disk.

Do not stop or restart the Claude session.

PART B — STORAGE AUDIT

Perform a bounded disk-usage audit focused on developer-generated storage.

Prioritize inspection of:
- Xcode DerivedData;
- old Xcode build products;
- stale .xcresult bundles;
- old simulator/device data and caches;
- obsolete simulator runtimes only if clearly safe and not required by current project;
- old temporary build folders;
- stale PhysiqueOS review/render temporary artifacts that are reproducible and not committed authorities;
- other obvious disposable Xcode/Swift build caches.

Do not perform a broad destructive home-directory cleanup.

PRESERVE — MANDATORY

Do NOT delete:
- any Git repository source;
- any uncommitted work;
- any active RC/Codex worktree;
- Claude's current Batch 2 reusable build/DerivedData folder;
- Build 86 release archive/evidence;
- Build 87 release archive/evidence;
- current guarded uploader receipts/logs needed for release provenance;
- current Batch 1/Batch 2 GH review artifacts;
- simulator/runtime/device needed for the current iPhone 17 Pro Batch 2 screenshot workflow;
- signing credentials, provisioning profiles, certificates, keychain material or Apple auth state;
- production credentials/configuration;
- anything whose ownership/purpose is ambiguous.

Do not empty Trash or delete user documents/media.

PART C — SAFE CLEANUP

Delete only clearly stale/reproducible development artifacts.

Prefer:
1. stale DerivedData for superseded builds/worktrees;
2. old .xcresult bundles;
3. obsolete temporary Xcode build folders;
4. clearly unused simulator caches/devices;
5. other reproducible development caches.

Before each large deletion category, establish why it is safe.

If cleanup can reach >=20 GB without touching anything ambiguous, stop cleanup there. Prefer >=25 GB when safely available.

If safe cleanup cannot reach 20 GB, STOP before Claude handoff and report exactly what large remaining categories require Founder judgment.

PART D — VERIFY AFTER CLEANUP

Report:
- free disk before;
- categories removed and approximate reclaimed size;
- free disk after;
- confirmation Claude's current Batch 2 build folder still exists;
- confirmation active worktrees are intact;
- confirmation Build 86/87 release evidence is intact;
- confirmation required simulator remains usable.

Run a lightweight non-destructive check sufficient to prove Xcode/simulator tooling still sees the required environment. Do not launch a redundant full build solely for cleanup validation.

PART E — FINAL STEP: HAND OFF TO EXISTING CLAUDE SESSION

ONLY if safe free disk is >=20 GB and the environment checks pass:

Use the existing Claude Batch 2 Remote Control conversation/session that produced Checkpoint 1.

Do NOT create a new Claude chat.
Do NOT restart it.
Do NOT use EnterWorktree.
Do NOT create a secondary worktree.

Send Claude the overnight execution instruction already staged at:

Commit:
a7c997ae511e46fb9611b4a86b96516768313556

Prompt:
agent-handoffs/inbox/prompts/20261005T052000Z-batch2-overnight-complete-cp2-cp5.md

The message to Claude should be concise and say, in substance:

Continue in this existing Batch 2 Claude chat using High reasoning. Founder is going to bed and authorizes overnight completion of all remaining Batch 2 checkpoints. The overnight override is staged in GH at commit a7c997ae511e46fb9611b4a86b96516768313556. Read and follow it exactly. Complete Checkpoints 2, 3, 4 and 5 sequentially without waiting for Founder approval between them, but perform the full pixel-by-pixel Dark/Mineral parity loop and publish a distinct review package for every checkpoint. Complete the authorized D1 deployment if safe, reconcile the accepted Home and You/Settings fixes, run final regression/Release gates, send notifications as specified, and stop after publishing the morning review index. Do not upload TestFlight. Stay in the single RC-provided worktree; no EnterWorktree.

Confirm the SAME Claude session transitions to working.

Do not wait for Claude to finish the overnight work.

PART F — CODEX STOP

After confirming the existing Claude session is working on the overnight task:
- publish a concise GH operations note if that is the established orchestration pattern;
- report the cleanup result and Claude session state;
- STOP.

Do not perform Batch 2 implementation yourself.
Do not create another Claude conversation.
Do not upload TestFlight.

NOTIFICATION

If cleanup cannot safely reach 20 GB, if the existing Claude session cannot be resumed, or if any Founder action is required, notify Founder immediately rather than silently stopping.

END TASK.