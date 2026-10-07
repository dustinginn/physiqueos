# Build 91 Operating Plan + Watch implementation: proof package

**Status: Build 91 Operating Plan + Watch implementation ready for tomorrow's feedback and later integration.**

## Scope

| Item | Value |
|---|---|
| Base | Build 90 `32baf1d5` |
| Branch | `claude/native-build91-op-watch-implementation-20261007` |
| Integration | Not integrated |
| Build number | Not bumped |
| TestFlight | No upload |
| Server | No change |

## Commits

| Commit | Area |
|---|---|
| `0bc2af7c` | Watch: Mineral panel footer + ready cue + additive `preparedAt` |
| `76bd0097` | Operating Plan: OP-A..D, Next DEXA Scan, Scheduled Evidence |
| `9861b0a2` | Operating Plan: authority guard follows the Next DEXA Scan contract |
| `bc34d790` | Watch: size-aware orphan reachability test |
| `4eb1b07a` | Operating Plan: You → Operating Plan row test asserts the new title |

Tomorrow's Watch/Logger feedback can stack on the Watch commits without touching the Operating Plan commits.

## Boards (`boards/`)

| Board | Content |
|---|---|
| `B91-IMPL-OP-A.png` | Root, Coaching Updates, Next DEXA Scan, editor opened at DEXA. Dark + Mineral, Sandbox fixtures |
| `B91-IMPL-OP-B.png` | Energy (read-only), Nutrition, Nutrition editor |
| `B91-IMPL-OP-C.png` | Peptides domain, peptide execution, Recovery support, Supplements domain |
| `B91-IMPL-OP-D.png` | Tracking |
| `B91-IMPL-WATCH.png` | Build 90 vs candidate, Mineral, 49/42 mm. Pixel-identical below the clock in all 16 captured states |

## Reproducing the captures

**iPhone (DEBUG only).** Launch with these arguments:
- `-physiqueos.appearance-review.route "op:landing;strategy=briefings/strategy_fixture_coaching"`
- `-physiqueos.appearance-review.value dark|light`

Route steps:
- `landing`
- `strategy=type/id`
- `edit=type/id[@dexa]`
- `dexa`
- `domain=id`
- `peptide=id`
- `recovery=id`
- `tracking`
- `trackingSupport=id`
- `supplementSupport=id`
- `supplementEdit=id`
- `tab=home`

**Watch.** Launch with:
- `-watchFixture start|idle|idle-unavailable|orphan`
- `-watchAppearance mineralLight|dark`

The full report, with gates, is on main under `agent-handoffs/reports/`.
