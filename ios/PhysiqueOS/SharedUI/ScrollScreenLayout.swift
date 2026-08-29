import SwiftUI

/// Shared root-navigation fix, not a per-screen patch: on this SDK, a
/// `ScrollView` nested inside `TabView` → `NavigationStack` does not
/// reliably reserve enough space for the floating tab bar's actual height
/// (bar + its own margin + the home-indicator safe area) — verified by
/// screenshot, where the last card's content was visibly drawn behind the
/// bar. `.safeAreaPadding`/automatic safe-area propagation alone was not
/// sufficient; `.contentMargins(.bottom:for:.scrollContent)` is the
/// first-class SwiftUI API for reserving additional scrollable bottom
/// space without disturbing scroll-indicator layout, so every Stage 1
/// scrollable screen applies the same named constant through it instead of
/// guessing its own padding value.
enum PhysiqueOSLayout {
    /// Clears the floating tab bar's rendered height plus a comfortable
    /// gap, so the last card on any tab is fully visible and reachable
    /// when scrolled to the bottom. One named value, reused everywhere,
    /// so a future correction (if the system bar's own height changes)
    /// happens once.
    static let scrollBottomClearance: CGFloat = 110
}

extension View {
    /// Applies the shared bottom-of-scroll clearance. Use on the
    /// `ScrollView` itself (not its content), so it composes correctly
    /// with the scroll view's own content-margin system.
    func physiqueOSScrollBottomClearance() -> some View {
        contentMargins(.bottom, PhysiqueOSLayout.scrollBottomClearance, for: .scrollContent)
    }
}
