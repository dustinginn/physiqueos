import SwiftUI

/// A collapsed summary that expands in place — the native counterpart of
/// the web's plain `<details>`/`<summary>` drawers (`ReportDrawer`,
/// `ReportingLinks`). Promoted from `TrainingHistoryView`'s private
/// `TrainingDisclosureRow` so Training, Evidence and the Operating Plan
/// share one control instead of three private copies.
///
/// The expand/collapse transition honours Reduce Motion: with it on, the
/// state flips with no animation (the same branch `HomeView` and
/// `AnimatedProgressBar` take) rather than easing.
struct PhysiqueOSDisclosureRow<Summary: View, Expanded: View>: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Binding var isExpanded: Bool
    var summary: Summary
    var expanded: Expanded

    init(isExpanded: Binding<Bool>, @ViewBuilder summary: () -> Summary, @ViewBuilder expanded: () -> Expanded) {
        self._isExpanded = isExpanded
        self.summary = summary()
        self.expanded = expanded()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { isExpanded.toggle() }
            } label: {
                summary
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(.isButton)
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")

            if isExpanded {
                expanded
                    .padding(.top, 12)
            }
        }
        .padding(12)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
