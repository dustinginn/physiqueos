import SwiftUI

/// Mirrors `TodaysFocusCard.jsx`'s density rule: a single column when there
/// is one item or any item needs setup (`actionLabel` present), otherwise
/// two columns. `SessionPriorityCard`'s grouped-session presentation is not
/// modeled in this slice — no Home fixture case needs it yet, and it is
/// closely tied to Training Logger, which is explicitly out of scope.
struct TodaysFocusCardView: View {
    let items: [HomeFocusItem]
    var onTap: (AppDestination) -> Void

    private var useSingleColumn: Bool {
        items.count == 1 || items.contains { $0.actionLabel != nil }
    }

    var body: some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading("Today's Priorities")
                if useSingleColumn {
                    VStack(spacing: 8) {
                        ForEach(items) { FocusTileView(item: $0, onTap: onTap) }
                    }
                } else {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible())], spacing: 8) {
                        ForEach(items) { FocusTileView(item: $0, onTap: onTap) }
                    }
                }
            }
        }
    }
}
