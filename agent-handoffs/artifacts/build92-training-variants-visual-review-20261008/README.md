# Build 92 Training Execution Variants: visual review

This is a visual acceptance package. It is not shipping code.

* **What is shown:** real SwiftUI screens from Native candidate **`39b818e2`** (`claude/native-build92-training-execution-variants-20261007`), in Dark and Mineral Light.
* **Example used:** Spider Curls with Static Hold.

## How these were captured

* **Branch:** `claude/native-build92-training-variants-visual-review-20261008`, which is `39b818e2` plus one review-only commit. **Do not merge it.**
* **The review-only commit adds:**
  * a DEBUG-only harness, `TrainingVariantsReview`, enabled by `-physiqueos.training-variants-review existing|none|create-fails`, Sandbox only. It feeds the Logger the same per-exercise projection a Build 92 Server sends, and a stub create command (0.7 s; `create-fails` throws offline);
  * a DEBUG gate that lets that harness show Create Variant;
  * a Watch preview fixture, `-watchFixture variant`;
  * the capture UI test `TrainingVariantsVisualReviewUITests`.
* **All of it is compiled out of Release.** The candidate `39b818e2` itself is unchanged.
* **Captures:** iPhone 17 Pro simulator on iOS 27.0, a clean simulator, driven by XCUITest. Watch Series 12 46 mm on watchOS 27.0 via `simctl`.

## Boards (`boards/`)

| # | Board | What to check |
|---|---|---|
| 1 | `01-workout-ordinary.png` | Spider Curls with Ordinary selected; Previous comes from Ordinary history |
| 2 | `02-variant-menu-existing.png` | Menu: Ordinary (checked), Static Hold, divider, Create Variant… |
| 3 | `03-selected-static-hold.png` | Static Hold label on the card. Previous switches to Static Hold history; entered sets are kept |
| 4 | `04-variant-menu-selected.png` | Static Hold carries the checkmark |
| 5 | `05-variant-menu-no-variants.png` | No saved variants: Ordinary plus Create Variant… only |
| 6 | `06-create-sheet-empty.png` | New Variant sheet: name only, scope note, Create disabled while the name is empty |
| 7 | `07-create-sheet-named.png` | "Static Hold" typed |
| 8 | `08-created-and-selected.png` | Created and selected immediately |
| 9 | `09-create-error-retry.png` | Offline failure: inline message, Retry, selection unchanged |
| 10 | `10-watch-variant-label.png` | Watch row "Spider Curls · Static Hold" (display only) |

Raw full-resolution captures are in `captures/`.

## Direct image links

1. [Workout, Ordinary](https://raw.githubusercontent.com/dustinginn/physiqueos/claude/native-build92-training-variants-visual-review-20261008/agent-handoffs/artifacts/build92-training-variants-visual-review-20261008/boards/01-workout-ordinary.png)
2. [Execution variant menu with an existing Static Hold](https://raw.githubusercontent.com/dustinginn/physiqueos/claude/native-build92-training-variants-visual-review-20261008/agent-handoffs/artifacts/build92-training-variants-visual-review-20261008/boards/02-variant-menu-existing.png)
3. [Static Hold selected](https://raw.githubusercontent.com/dustinginn/physiqueos/claude/native-build92-training-variants-visual-review-20261008/agent-handoffs/artifacts/build92-training-variants-visual-review-20261008/boards/03-selected-static-hold.png)
4. [Menu with Static Hold checked](https://raw.githubusercontent.com/dustinginn/physiqueos/claude/native-build92-training-variants-visual-review-20261008/agent-handoffs/artifacts/build92-training-variants-visual-review-20261008/boards/04-variant-menu-selected.png)
5. [No saved variants yet](https://raw.githubusercontent.com/dustinginn/physiqueos/claude/native-build92-training-variants-visual-review-20261008/agent-handoffs/artifacts/build92-training-variants-visual-review-20261008/boards/05-variant-menu-no-variants.png)
6. [Create Variant sheet, empty](https://raw.githubusercontent.com/dustinginn/physiqueos/claude/native-build92-training-variants-visual-review-20261008/agent-handoffs/artifacts/build92-training-variants-visual-review-20261008/boards/06-create-sheet-empty.png)
7. [Create Variant sheet, "Static Hold"](https://raw.githubusercontent.com/dustinginn/physiqueos/claude/native-build92-training-variants-visual-review-20261008/agent-handoffs/artifacts/build92-training-variants-visual-review-20261008/boards/07-create-sheet-named.png)
8. [Created and selected immediately](https://raw.githubusercontent.com/dustinginn/physiqueos/claude/native-build92-training-variants-visual-review-20261008/agent-handoffs/artifacts/build92-training-variants-visual-review-20261008/boards/08-created-and-selected.png)
9. [Create failed offline, inline Retry](https://raw.githubusercontent.com/dustinginn/physiqueos/claude/native-build92-training-variants-visual-review-20261008/agent-handoffs/artifacts/build92-training-variants-visual-review-20261008/boards/09-create-error-retry.png)
10. [Apple Watch variant label](https://raw.githubusercontent.com/dustinginn/physiqueos/claude/native-build92-training-variants-visual-review-20261008/agent-handoffs/artifacts/build92-training-variants-visual-review-20261008/boards/10-watch-variant-label.png)
