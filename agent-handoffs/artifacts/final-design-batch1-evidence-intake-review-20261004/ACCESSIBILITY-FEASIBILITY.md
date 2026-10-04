# Accessibility and implementation feasibility

- The mockups use the actual 402 pt iPhone target and preserve safe status/navigation regions.
- Primary, secondary, picker, segmented and navigation targets are at least 44 pt. Toggle labels should own the full 52 pt SwiftUI row.
- Text inputs use at least 16 pt implementation sizing even where the static prototype visually follows the compact scale; labels never depend on placeholder text.
- State is always communicated with text and icon/shape in addition to color: Included/Excluded, Review/Confirmed, error copy and lifecycle headings remain legible in grayscale.
- Dark and Mineral Light tokens maintain strong text/surface separation. Mineral Light uses selective teal/mineral fields rather than a wall of white; purple stays an eyebrow/brand accent instead of carrying status semantics.
- The compact type scale can map to the locked Dynamic Type styles. At accessibility sizes: metric grids become one column, pose/condition grids become one column, field label/value rows stack, and action groups wrap. No information may be hidden to preserve a screenshot composition.
- File names may wrap to two lines; full values remain available to VoiceOver. Numeric DEXA units live in persistent labels, not only suffix styling.
- Progress indicators require accessible progress values and state announcements. Processing copy should announce once per phase, not on every byte update.
- Real Progress Photo previews preserve aspect fit/crop feasibility and require descriptive accessibility labels without exposing file paths.
- System Photos/Files/date pickers, keyboard and the destructive Dismiss alert remain native controls.
- All visual changes are implementable with existing `ScrollView`, `Picker`, `Menu`, `Toggle`, `ProgressView`, `CardContainer`, `PrimaryActionButton`, `NumericEditField` and existing photo preview paths. No new Server data is required.
