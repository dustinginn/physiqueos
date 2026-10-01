import SwiftUI

/// A small "Build Lean Mass" / "Visible Abs" chip shown on Evidence detail
/// screens (Training Day, Training Session, Nutrition Day) that previously
/// carried no Goal/Phase context at all once a Founder drilled in from the
/// scoped landing/history list — see `EvidenceChronology.swift`'s
/// `EvidenceScopeAttribution` for the underlying chronology fix this
/// displays. Renders nothing when `attribution?.label == nil` (a record
/// whose date falls outside every named goal window today), matching this
/// port's rule that an unattributable record stays honestly unattributed
/// rather than mislabeled with whichever goal happens to be current.
struct EvidenceScopeAttributionChip: View {
    let attribution: EvidenceScopeAttribution?

    var body: some View {
        if let label = attribution?.label {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.accent)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(PhysiqueOSTheme.accent.opacity(0.14))
                .clipShape(Capsule())
                .accessibilityLabel("Attributed to \(label)")
        }
    }
}
