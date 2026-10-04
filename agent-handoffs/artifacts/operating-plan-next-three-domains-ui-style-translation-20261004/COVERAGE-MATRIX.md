# Coverage matrix

| Domain | Root row | Detail | Edit/action | History/protocol | Other current subpages/states | Production route | Target route |
|---|---|---|---|---|---|---|---|
| Recovery | Recovery → Recovery Strategy | Foam Rolling Current Support | inline Edit Support; Cancel; Save Support | no separate history/protocol page | shared frequency/timing/date/reminder/note editor | `/profile/protocols/:recoveryProtocolId` → execution support | unchanged Native protocol-domain → recurring-Support destination |
| Peptides | Peptides → Peptide Strategy | Retatrutide/Tesamorelin Manage | Dose/Days/Time/Notes sheets; Reminder toggle; Pause/Resume | Advanced dose plan + dose history inside Manage; no separate history route | active, paused, Today/Tomorrow pause confirmation; legacy fallback only for older contract | `/profile/protocols/:peptideProtocolId` → peptide execution support | unchanged Native protocol-domain → peptide Manage and focused sheets |
| Supplements | Supplements → Supplement Strategy; Add Supplement | per-method Support detail | Edit Support; Edit Strategy; Pause/Restore; Add Supplement | strategy versions retained canonically; no current user-facing history page | active/paused method cards; Support edit; strategy create/edit | `/profile/protocols/:supplementProtocolId` plus supplement support/strategy resources | unchanged Native protocol-domain → support, strategy create/edit and lifecycle commands |

## Render inventory

| Domain | Current surface/state | Preserved actions | Rendered |
|---|---|---|---|
| Recovery | domain overview | Edit Support | dark + light |
| Recovery | Foam Rolling detail | Edit Support | dark + light |
| Recovery | Foam Rolling inline edit | Cancel, Save Support | dark + light |
| Peptides | domain overview | Manage per method; Resume on paused Retatrutide | dark + light |
| Peptides | Retatrutide Manage, active/advanced | focused row sheets, Reminder, Pause, Advanced, dose history | dark + light |
| Peptides | Tesamorelin Manage, simple | focused row sheets, Reminder, Pause, Advanced summary | dark + light |
| Peptides | Retatrutide Manage, paused | Resume | dark + light |
| Peptides | Change dose | Cancel, Save; Today/Next dose/Pick date; persistent/one-dose scope | dark + light |
| Peptides | Change days | Cancel, Save; weekdays/interval | dark + light |
| Peptides | Change time | Cancel, Save | dark + light |
| Peptides | Edit notes | Cancel, Save | dark + light |
| Peptides | Pause confirmation | Today/Tomorrow, Pause, Cancel | dark + light |
| Supplements | domain overview, active + paused | Add Supplement; Edit Support; Edit Strategy; Pause; Restore | dark + light |
| Supplements | Support detail | Edit Support | dark + light |
| Supplements | Support edit | Cancel, Save Support | dark + light |
| Supplements | Strategy edit | Cancel, Save Strategy | dark + light |
| Supplements | Strategy create | Cancel, Add Supplement | dark + light |

Standard loading/error/retry presentation is inherited from the locked system and documented as behavior, not multiplied into review screenshots. A legacy peptide fallback exists only for older Servers lacking the simple-editor fields; current Build 85 production supports the current Manage contract and the fallback is not presented as a current Founder state.
