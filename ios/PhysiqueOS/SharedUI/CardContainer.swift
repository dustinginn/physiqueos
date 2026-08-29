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
    /// `Card.jsx`'s `variant` prop — defaults to the elevated surface;
    /// pass `PhysiqueOSTheme.surfaceAccent` for a promotional card like
    /// Log's Training Logger entry (`variant="accent"`).
    var background: Color = PhysiqueOSTheme.surfaceElevated
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding.value)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(PhysiqueOSTheme.divider, lineWidth: 1)
            )
    }
}
