import SwiftUI

/// Small pill used for short status words ("Continue", "Needs Setup").
/// Mirrors the inline badge markup repeated across `FocusTile.jsx` and
/// `TodaysFocusCard.jsx` rather than duplicating that styling per call site.
struct StatusChip: View {
    let text: String
    var color: HomeColorToken = .effort

    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .heavy))
            .foregroundStyle(color.foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.foreground.opacity(0.14))
            .clipShape(Capsule())
    }
}
