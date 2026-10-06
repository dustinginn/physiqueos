PhysiqueOS shared Mac storage recovery — safe Xcode cleanup only

Continue in the current Claude Remote Control conversation and current provided work environment.

Do not create another session or another worktree.

This is an operational cleanup task only. Do not change PhysiqueOS product source, Server source, production, release metadata, credentials, or Git history.

Problem: the shared Mac recently reached about 0.7 GB free during Build 90 design work.

Goal: restore healthy development headroom using ONLY clearly regenerable Xcode/test/simulator artifacts. Target at least 30 GiB free if achievable within the allowed categories. Stop earlier if the remaining candidates are uncertain.

FIRST: inventory only and record free disk space plus sizes of these allowed categories:
1. Xcode DerivedData.
2. Xcode test result bundles / xcresult files in known build/test output locations.
3. Xcode build intermediates and temporary build products that are regenerable.
4. Dedicated simulator devices created specifically by completed PhysiqueOS test/design lanes, but only after proving each simulator is not booted and not needed by any current Claude/Codex task.
5. Temporary screenshot/capture intermediates only when the final review boards are already committed and remotely readable.

DO NOT DELETE OR MODIFY:
- any Xcode Archive or anything under ~/Library/Developer/Xcode/Archives;
- any Git repository or Git worktree;
- any source file, commit, branch, tag, stash, untracked source, or Git metadata;
- any Build 90 review board/package or committed artifact;
- any Founder media;
- any DigitalOcean/doctl configuration;
- any credential, certificate, provisioning profile, keychain item, App Store Connect material, or production access configuration;
- any database/data file;
- any active simulator;
- any file whose regenerability is uncertain.

This task is intentionally NOT authorized to clean Git worktrees. Leave all worktrees alone even if they appear stale.

SAFE CLEANUP ORDER

A. Delete only DerivedData associated with PhysiqueOS/Xcode builds and tests. If association is uncertain, retain it.

B. Delete only completed/stale PhysiqueOS xcresult bundles and test result output that can be regenerated. Do not delete reports/review boards.

C. Delete only clearly regenerable PhysiqueOS build intermediates/temp products.

D. If more space is still needed, inspect dedicated PhysiqueOS lane simulators. Delete a simulator only if ALL are true:
- it was created specifically for a completed PhysiqueOS lane;
- it is currently Shutdown;
- no current Claude/Codex session references it;
- no acceptance task still needs it;
- no unique data/artifact exists only inside it.
If any condition is uncertain, retain it.

E. Remove temporary capture intermediates only if their final corresponding review board is committed, pushed, remotely readable, and the temporary file is not itself part of the committed review package.

Do not use broad wildcard deletion outside an individually verified allowed directory.
Do not use commands that could traverse outside the intended directory.
Do not run system-wide cache cleaners.
Do not clean ~/Library broadly.
Do not clean Docker/Homebrew/npm caches.
Do not empty Trash.
Do not delete iOS runtimes.
Do not remove Xcode itself.

AFTER EACH MAJOR CATEGORY

Recheck free space. Once free space is at least 30 GiB, stop unless another obviously safe PhysiqueOS-only artifact category can bring it to 40 GiB with negligible risk.

FINAL VERIFICATION

Report:
- free space before;
- free space after;
- GiB reclaimed;
- sizes/categories actually removed;
- anything inspected but retained.

Verify by existence/readability only, without modifying:
- Build 89 archive PhysiqueOS-Build89-51399425.xcarchive still exists;
- Build 89 shipped SHA 51399425b683d6a6e36b5c91836290259e31a7e0 remains reachable;
- Build 90 Founder design package commit 3d7c54abdde81b937974d68f4da7f3a40d08ce50 remains reachable;
- Build 90 Energy/Recovery candidate 7e501714 remains reachable;
- progression candidate 999a225a38ced9ddb16a65bbe840896472265468 remains reachable;
- production-access operational branch/candidate remains reachable;
- current active worktree remains clean/healthy.

Do not run a full build or full test suite afterward. A lightweight filesystem/Git sanity check is enough.

REPORTING

Publish a main-visible report-only handoff with the before/after measurements and exact allowed categories removed.

No product-source changes.

Status: Shared Mac safe storage cleanup complete.

Notify: PhysiqueOS shared Mac — safe storage cleanup complete.

STOP.