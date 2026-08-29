import SwiftUI

/// Honest placeholder — Goals is a lower-frequency Stage 1 surface this
/// task explicitly permits leaving unbuilt. It is a real root tab (see
/// `AppTab`), not a dropped destination, so it renders its own named
/// placeholder rather than silently reusing another tab's.
struct GoalsPlaceholderView: View {
    var body: some View {
        TabPlaceholderView(tab: .goals, subtitle: "Goals arrives in a later slice.")
    }
}
