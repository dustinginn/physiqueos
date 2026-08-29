import SwiftUI

/// Mirrors `IconBadge.jsx`: a small rounded, tinted icon chip. Used across
/// nearly every Home card (hero goal icon, goal rows, focus tiles, briefing
/// card icon), so it belongs in shared UI rather than any one screen.
struct IconBadge: View {
    enum Size {
        case xs, sm, md, lg

        var dimension: CGFloat {
            switch self {
            case .xs: 28
            case .sm: 32
            case .md: 40
            case .lg: 48
            }
        }

        var iconSize: CGFloat {
            switch self {
            case .xs: 14
            case .sm: 16
            case .md: 18
            case .lg: 22
            }
        }
    }

    let systemImage: String
    var color: HomeColorToken = .primary
    var size: Size = .md
    var isCircular: Bool = false

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: size.iconSize, weight: .semibold))
            .foregroundStyle(color.foreground)
            .frame(width: size.dimension, height: size.dimension)
            .background(color.background)
            .clipShape(isCircular ? AnyShape(Circle()) : AnyShape(RoundedRectangle(cornerRadius: 10)))
            .accessibilityHidden(true)
    }
}
