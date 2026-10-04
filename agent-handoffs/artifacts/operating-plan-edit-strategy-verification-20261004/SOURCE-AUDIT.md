# Operating Plan Edit Strategy source audit

## Authority

- Prompt authority: `0f48134e058d651edcaee7408784917ff84501ca`.
- Accepted Operating Plan visual artifact: `89d05249f90cb65da5941d08d987eba50bfb18ce`.
- Exact Build 85 Native source: `b8ee8690b194cb90086f6f62816b9a2c8c400dc026`.
- Exact current Server source: `3c0f4aefddbb9a6886f6ad012443978303d47024`.

## Reachability

### Energy

There is no production Edit Strategy flow.

- Server Energy detail has no `editHref`.
- `ProductionEnergyStrategyAPI` rejects a payload unless `intentionallyReadOnly == true` and `editLabel == nil`.
- Native maps that payload to `editLabel: nil`, `editDestination: nil`.
- The generic editor’s default branch says `This strategy cannot be edited.`, but the accepted production Energy detail never routes there.

The review artifact therefore reuses the accepted Energy detail and proves the absence of an edit action. It does not invent a disabled button or a fictional form.

### Nutrition

The production detail supplies the editor object and `expectedCurrentVersionId`. Native exposes these exact controls, in order:

1. Protein Basis — `Per body weight` or `Fixed grams`.
2. Conditional protein value — body-weight ratio or fixed daily grams.
3. Carbohydrate Approach — Performance, Balanced, Lower carbohydrate.
4. Fat Approach — Sustainable minimum, Balanced, Higher fat.
5. Save Strategy.

Current Founder-shaped values are 1.0 g per lb bodyweight, Performance carbohydrates and Sustainable minimum fat. The hidden fixed-grams fallback is not rendered while body-weight basis is selected.

Native constrains the ratio to 0.5–2.0 in 0.1 steps and fixed grams to 50–400 in 5 g steps. The Server independently validates those ranges and exact allowlists. Nutrition does not expose calorie/intake strategy; the successor preserves the existing hidden `calorieStrategy` and unrelated Nutrition fields.

### Training

The production detail supplies ordered frequencies, priorities, progression and `expectedCurrentVersionId`. Native exposes these exact controls, in order:

1. Weekly Frequency — Arms, Core, Lower Body, Back, Chest, Shoulders; each 0–7 whole sessions per area.
2. Training Focus — the same six areas as selectable priorities.
3. Progression — Conservative, Moderate or Aggressive.
4. Save Strategy.

The current source-shaped values total nine area sessions: Arms 2, Core 2, Lower Body 2, Back 1, Chest 1, Shoulders 1; Chest and Back are selected priorities; progression is Moderate.

The Server requires at least one total weekly area session and at least one priority. Hidden phase/context fields and unrelated Training data are copied into the successor; the editor deliberately has no phase selector.

## Cancel, save and effective-date behavior

- `Cancel` dismisses the editor and discards the local draft. There is no dirty-state confirmation.
- Save is one direct `Save Strategy` action; there is no second confirmation step.
- Native sends `expectedCurrentVersionId`; stale saves fail closed.
- Server stamps the successor with the current `America/Los_Angeles` local date. Effective date is not user-editable.
- Server preserves the protocol’s existing Goal association as `supports`; Goal is not user-editable here.
- Valid changed saves append a successor version, supersede/end the prior version at the new effective date, advance `currentVersionId`, and retain historical date resolution.
- Unchanged saves return an idempotent unchanged success and Native dismisses exactly like an updated success.
- A successful Native save dismisses back to Strategy detail. There is no separate success page or toast.
- A failed save retains the local draft and renders `This strategy was not saved. Refresh before retrying.` Native does not expose the Server’s typed invalid/stale/persistence cause in this editor.

## Energy history

Energy remains outside these edit flows. Production’s missing phase-history projection is already recorded in the implementation-delta ledger. This verification adds no fabricated history UI and does not duplicate that ledger entry.
