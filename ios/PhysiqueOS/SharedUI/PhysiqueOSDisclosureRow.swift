import SwiftUI

/// A collapsed summary that expands in place — the native counterpart of
/// the web's plain `<details>`/`<summary>` drawers (`ReportDrawer`,
/// `ReportingLinks`). Promoted from `TrainingHistoryView`'s private
/// `TrainingDisclosureRow` so Training and the Operating Plan share one
/// control (Evidence keeps its own private copy).
///
/// The expand/collapse transition honours Reduce Motion: with it on, the
/// state flips with no animation (the same branch `HomeView` and
/// `AnimatedProgressBar` take) rather than easing.
///
/// `chrome: .card` (the default) is the muted rounded card. `.none` keeps the
/// same toggle, Reduce Motion and accessibility behavior but leaves the look
/// to the caller's summary — the locked Evidence pages draw their own row.
struct PhysiqueOSDisclosureRow<Summary: View, Expanded: View>: View {
    enum Chrome { case card, none }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Binding var isExpanded: Bool
    var chrome: Chrome
    var toggleLabel: String?
    var toggleHint: String?
    var toggleIdentifier: String?
    var summary: Summary
    var expanded: Expanded

    init(
        isExpanded: Binding<Bool>,
        chrome: Chrome = .card,
        toggleLabel: String? = nil,
        toggleHint: String? = nil,
        toggleIdentifier: String? = nil,
        @ViewBuilder summary: () -> Summary,
        @ViewBuilder expanded: () -> Expanded
    ) {
        self._isExpanded = isExpanded
        self.chrome = chrome
        self.toggleLabel = toggleLabel
        self.toggleHint = toggleHint
        self.toggleIdentifier = toggleIdentifier
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
            .modifier(DisclosureToggleAccessibility(label: toggleLabel, hint: toggleHint))
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")
            .modifier(DisclosureToggleIdentifier(identifier: toggleIdentifier))

            if isExpanded {
                expanded
                    .padding(.top, chrome == .card ? 12 : 0)
            }
        }
        .modifier(DisclosureCardChrome(isCard: chrome == .card))
    }
}

private struct DisclosureCardChrome: ViewModifier {
    let isCard: Bool

    func body(content: Content) -> some View {
        if isCard {
            content
                .padding(12)
                .background(PhysiqueOSTheme.surfaceMuted)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        } else {
            content
        }
    }
}

private struct DisclosureToggleAccessibility: ViewModifier {
    let label: String?
    let hint: String?

    func body(content: Content) -> some View {
        switch (label, hint) {
        case let (label?, hint?): content.accessibilityLabel(label).accessibilityHint(hint)
        case let (label?, nil): content.accessibilityLabel(label)
        case let (nil, hint?): content.accessibilityHint(hint)
        case (nil, nil): content
        }
    }
}

private struct DisclosureToggleIdentifier: ViewModifier {
    let identifier: String?

    func body(content: Content) -> some View {
        if let identifier { content.accessibilityIdentifier(identifier) } else { content }
    }
}
