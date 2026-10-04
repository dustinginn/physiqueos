# Widget visual specification

## Shared grammar

- SF/system typography; no new font family.
- Purple is a restrained `PHYSIQUEOS`/identity accent only.
- Teal anchors interaction and Training; green Nutrition; amber Activity/staleness; cyan Weight.
- State always includes words, values, icon geometry or position; color is supplementary.
- The large family uses line-separated rows rather than nested cards.
- The small family uses one compact numeric hierarchy and one action field.
- The subtle trajectory arc is decorative and never carries data.

## Dark palette

| Role | Value |
|---|---|
| container | `#06131E` |
| primary text | `#F5F8F7` |
| secondary text | `#91A6AE` |
| divider | `rgba(185,218,219,0.17)` |
| teal | `#3AD6C6` |
| green | `#5BDD94` |
| amber | `#F6BD50` |
| cyan | `#44BED6` |
| restrained purple | `#A18AFF` |
| action gradient | `#149E9B → #174B78` |

## Mineral-Light palette

| Role | Value |
|---|---|
| container | `#EEF1EB` |
| primary text | `#0A1C29` |
| secondary text | `#60737C` |
| divider | `rgba(21,65,72,0.16)` |
| teal | `#078F87` |
| green | `#0C9363` |
| amber | `#B47510` |
| cyan | `#0E8CA7` |
| restrained purple | `#7255DC` |
| action gradient | `#0B817F → #163F62` |

## Typography

Widget targets keep the source's compact scale and truncation intent:

- family title: 15 pt small / 17 pt large, bold;
- primary small metric: 23 pt, bold;
- large row value: 12 pt, semibold/bold;
- eyebrow/row labels: 7–9 pt, uppercase with tracking;
- freshness: 8 pt small / 10 pt large;
- action: 10 pt small / 13 pt large.

Implementation should use the system's widget-aware text fitting and preserve accessible labels. Small labels remain supplemental to larger values and are never the only place where status is expressed.

## Spacing and geometry

- `systemSmall`: 170 × 170 pt, 12 pt content margin, 22 pt preview corner.
- `systemLarge`: 360 × 376 pt, 16 pt content margin, 26 pt preview corner.
- effective interaction target: at least 44 pt;
- large domain rows: 58 pt in the target;
- large workout action: 49 pt;
- small widget's workout action is the whole-widget deep link.

Use WidgetKit container margins in shipping implementation rather than treating the preview numbers as universal device constants.
