# Build 92 Training Execution Variants visual review: boards ready for Founder acceptance

Task id: `build92-training-variants-visual-review-20261008`

**Status:** visual acceptance only. No implementation change to the candidate, no deploy, no release.

* **Reviewed candidate:** Native **`39b818e2`** (`claude/native-build92-training-execution-variants-20261007`). Verified unchanged on the remote.
* **Review package:** branch `claude/native-build92-training-variants-visual-review-20261008` @ **`7c17645e`**, which is the candidate plus the non-shipping review commits (`93b0e1e8` boards and harness, `7c17645e` README links). **Do not merge it.**
* **Example:** Spider Curls with Static Hold, in Dark and Mineral Light, on an iPhone 17 Pro simulator (iOS 27.0) and an Apple Watch Series 12 46 mm simulator (watchOS 27.0).

## Boards

* **Where:** branch `claude/native-build92-training-variants-visual-review-20261008` (head `7c17645e`: review commit `93b0e1e8` plus README links).
* **Folder:** `agent-handoffs/artifacts/build92-training-variants-visual-review-20261008/boards/`.
* **Direct image links:** each board is at
  `https://raw.githubusercontent.com/dustinginn/physiqueos/<branch>/<folder><file>`.
  The full links are in the Founder chat reply and in the package README. The guarded publisher's secret scanner refuses any 90+ character URL path, so they are not written out here.

| # | Board | File |
|---|---|---|
| 1 | Workout, Ordinary | `01-workout-ordinary.png` |
| 2 | Execution variant menu with an existing Static Hold | `02-variant-menu-existing.png` |
| 3 | Static Hold selected | `03-selected-static-hold.png` |
| 4 | Menu with Static Hold checked | `04-variant-menu-selected.png` |
| 5 | No saved variants yet (Ordinary + Create Variant…) | `05-variant-menu-no-variants.png` |
| 6 | Create Variant sheet, empty | `06-create-sheet-empty.png` |
| 7 | Create Variant sheet, "Static Hold" | `07-create-sheet-named.png` |
| 8 | Created and selected immediately | `08-created-and-selected.png` |
| 9 | Create failed offline, inline Retry | `09-create-error-retry.png` |
| 10 | Apple Watch variant label | `10-watch-variant-label.png` |

* **Raw full-resolution captures:** in the same package under `captures/`, as 20 PNGs.
* **Package README:** `agent-handoffs/artifacts/build92-training-variants-visual-review-20261008/README.md` on the review branch.
* All ten board URLs returned HTTP 200 when checked.

## What the screens show

* The **Execution variant** submenu is a native SwiftUI `Menu` from the exercise's ••• actions. It lists:
  * **Ordinary**, checked when selected;
  * that exercise's saved variants;
  * a divider;
  * **Create Variant…**.
* With no saved variants it shows only Ordinary and Create Variant…. Nothing is hard-coded or derived from history.
* **Selected state:**
  * the exercise card subtitle reads **Static Hold**, in the same amber context style as "Ordinary · Standalone";
  * Previous switches to the Static Hold history, "10 × 30 lb · 2026-09-26 · Static Hold";
  * the sets already entered (12/12/11 at 35 lb) **stay exactly as they were**.
* **Create Variant sheet:**
  * medium detent, titled **New Variant**, with Cancel and Create;
  * a single "Variant name" field;
  * a scope note: "For Spider Curls only. Uses the same sets, reps and load as Ordinary.";
  * Create is disabled while the field is empty.
* **On success** the sheet closes and the new variant is selected immediately.
* **On failure:**
  * the message is red: "This variant couldn't be created. Your current selection hasn't changed. Check your connection and try again.";
  * the primary button becomes **Retry**;
  * the selection is unchanged.
* **Watch:** context rows read "Spider Curls · Static Hold". The Load and Reps tiles and Complete Set are unchanged, and the Watch has no variant editing, creation or timing.

## Observations for Founder decision (no change made)

1. **The sheet uses system Form styling:** grouped field, system toolbar buttons, a red error row. It does not use the Logger's custom card and typography tokens. Restyling it to the locked Dark/Mineral Logger patterns could be folded into Codex's approved "truthful Logger validation/refusal displays" closeout at integration.
2. **The menu is the system glass menu**, the same component as the existing Superset and Substitute submenus.
3. **The Previous line uses ISO dates** ("2026-09-26"). This is the existing Logger format and was not introduced by variants.
4. **Watch row titles are one line** with 0.8 minimum scale. A long exercise plus a long variant name, for example "Cable Rope Pushdowns · Static Hold", will shrink and may truncate.
5. **Status bar time** in the captures is the simulator clock, not product data.

## How it was captured (non-shipping harness)

* **The review commit `93b0e1e8` adds only:**
  * the DEBUG `TrainingVariantsReview` Sandbox harness (`-physiqueos.training-variants-review existing|none|create-fails`). It applies the Build 92 Server projection shape to Sandbox Spider Curls and stubs the create command with a 0.7 s delay; `create-fails` makes it throw offline;
  * a DEBUG gate allowing that harness to show Create Variant;
  * the `-watchFixture variant` Watch fixture;
  * the `TrainingVariantsVisualReviewUITests` capture test.
* All of it is **compiled out of Release**.
* **Capture runs:** both journeys (Dark, Mineral Light) passed on a freshly erased dedicated simulator.
* **One re-shoot:** iOS's one-time "slide to type" keyboard tip covered the first Dark sheet captures, so those were re-shot. The capture test now dismisses that system tip.
* **Not run:** no Server, no Founder data, no production access.

## Safety and storage

* Candidate `39b818e2` is unchanged.
* No deploy, seed, build bump, archive or TestFlight upload.
* **Storage:** about 29 GiB free throughout. The lane's review DerivedData and its two dedicated review simulators are cleaned up after publication.
