import SwiftUI

/// Mirrors `Card.jsx`: the elevated rounded surface every Home section sits
/// inside. Padding follows the same small/medium/none scale the web
/// component exposes.
struct CardContainer<Content: View>: View {
    enum Padding {
        case none, sm, md

        var value: CGFloat {
            switch self {
            case .none: 0
            case .sm: 14
            case .md: 16
            }
        }
    }

    var padding: Padding = .md
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding.value)
            .background(PhysiqueOSTheme.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(PhysiqueOSTheme.divider, lineWidth: 1)
            )
    }
}
