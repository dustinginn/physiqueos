# Build 70 final candidate closeout v2 (status: candidate — all gates passed on exact SHAs; not deployed/uploaded)

Supersedes `20260929T182500Z-peptide-build70-final-candidate-closeout.md` (Native SHA changed by one review fix). Design map and scope unchanged; see that closeout for deploy order, rollback caveats and the Founder acceptance scope, all still valid.

## Exact SHAs (dustinginn/physiqueos, remote heads verified after push)
- Server candidate `claude/next-build-server-candidate-20260929`: **`b94ab533c19821a1f4276e4167c5dc080b86f4d0`** (unchanged)
- Native Build 70 `claude/peptide-ux-native-20260929`: **`4c93d9f50cd1a44238afb6111c87265d9b9bd903`** (was `bf7ba1e7`)
- Production authority: Server `98534bf8`, Native Build 69 `efa65db1` (not re-probed; nothing deployed)

## What changed since the previous checkpoint
Exact-SHA delta review (Native `9f71eeed..bf7ba1e7`, Server `5e7ff739..b94ab533`) found one major and otherwise no findings: a manual/custom plan could never be saved from Advanced, because Save gating used the read's `isManualPlan` instead of the draft; after "Start a new plan from today" seeded a steady plan, no Save button appeared. Fixed in `4c93d9f5` (one view condition: gate on `draft.dosing.pattern == .custom`, or manual-and-untouched). No Server change.
Confirmed clean by that review: pending-pause labelling, failure-context copy, dosing-only `advancedSave`/`legacySave`, Days/Time/Notes save gating, `.reload`/lenient decoding, scheduler orphan sweep + call sites, doseAdjustable/localDate wire consistency, byte-identical non-rewrite save signature and completed-cleanup wording vs Build 69. Known minor nits left: Time sheet cannot save a value equal to its seed; a narrow race if today's dose disappears while the Change-dose sheet is open with "Only the next dose" selected.

## Validation actually run on these exact SHAs
- Server `b94ab533`: full regression 9315/9623, 303 failures = production baseline, **0 new**; production build (`npm run build -- --webpack`) exit 0.
- Native `4c93d9f5`: full unit suite (`-only-testing:PhysiqueOSTests`, iPhone 17 Pro / iOS 26.5) **1564 tests, 0 failures**; Release compile (`-configuration Release -destination generic/platform=iOS`) **BUILD SUCCEEDED**; pbxproj deterministic (unchanged since `0e3a0da8`).
- Note: the change is a single view condition with no dedicated unit test (view logic is source-scan/VM tested); it is covered by the review and by Founder acceptance below.

## Not run
Simulator UI test bundle, simulator tour, rendered visual check of the peptide screen, real-Server integration and real notification withdrawal (need deployed Server). All deliberate/risk-scaled.

## Founder acceptance addition
In Advanced on a manual/custom plan (if any exists in production; the two known peptides are structured), confirm "Start a new plan from today" then "Save plan" works.

## Resources / status
Free disk 15.8 GiB after runs (floor 15; simulator erased after each run; no new deletions this round). Deploy: Server NOT deployed; Native NOT archived/uploaded; production not mutated. Blockers: none. Decision needed: Founder/ChatGPT review and explicit authorization (deploy Server first, then Native upload). Local-only state: none (worktrees clean and pushed; private Founder harness remains only in the local job dir, not pushed).
