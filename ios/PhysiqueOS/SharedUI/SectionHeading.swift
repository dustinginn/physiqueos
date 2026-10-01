import SwiftUI

/// Mirrors `SectionTitle.jsx`: the small uppercase accent-colored label at
/// the top of every Home card, with an optional trailing action/link.
struct SectionHeading<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: Trailing

    init(_ title: String, @ViewBuilder trailing: () -> Trailing = { EmptyView() }) {
        self.title = title
        self.trailing = trailing()
    }

    var body: some View {
        HStack {
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.sectionLabel)
                .foregroundStyle(PhysiqueOSTheme.accent)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            trailing
        }
    }
}
