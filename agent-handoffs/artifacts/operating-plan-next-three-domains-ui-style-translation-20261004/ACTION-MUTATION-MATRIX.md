# Action and mutation matrix

| Action | Canonical owner | Concurrency / validation | Result semantics |
|---|---|---|---|
| Save Foam Rolling Support | recurring Support command | execution revision; valid cadence/time/date window; reminder identity | execution + reminder update atomically; history preserved |
| Save peptide Dose/Days/Time/Notes/Reminder | peptide Support command | execution revision; field-specific validation; full canonical save | re-read after accepted write; unchanged is valid |
| Rewrite past peptide plan | peptide Support command | explicit `rewriteHistory` only after confirmation | history rewrite is never implicit |
| Pause peptide | peptide lifecycle command | execution revision; Today/Tomorrow boundary | suspension window; reminders stop; dose history remains |
| Resume peptide | peptide lifecycle command | execution revision | closes suspension; future cadence resumes; no backfill |
| Save Supplement Support | supplement Support command | supplement version + optional execution revision; schedule validation | execution/reminder update or canonical execution creation; history preserved |
| Save Supplement Strategy | supplement strategy command | current strategy version | creates versioned successor; execution settings remain separate |
| Add Supplement | supplement strategy command | required Name/Purpose/Role/Goal/Start Date; uniqueness and active goal enforced Server-side | creates active protocol root/version |
| Pause / Restore Supplement | supplement lifecycle command | current version id | versioned lifecycle transition; no delete; paused rows cannot edit |

Native keeps failure values on screen. Typed 400/409/412 behavior remains as implemented; the visual translation does not alter messages, retries or write authority.
