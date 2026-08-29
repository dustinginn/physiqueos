import SwiftUI

/// Generic landing view for any `AppDestination` that does not yet have a
/// real screen. Home's interactions push a correctly typed destination
/// (see `AppDestination`); the destination screen itself is deliberately
/// out of scope for this slice and lands here instead of silently doing
/// nothing, so the route intent is verifiable even before the real screen
/// exists.
struct DestinationPlaceholderView: View {
    let destination: AppDestination

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "arrow.turn.down.right")
                .font(.system(size: 28, weight: .light))
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text("Not implemented yet")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(destination.serverDestinationId)
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PhysiqueOSTheme.background)
        .navigationTitle("Coming Soon")
        .navigationBarTitleDisplayMode(.inline)
    }
}
