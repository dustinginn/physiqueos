import SwiftUI

/// Shared layout for the five Stage 1 tab placeholders.
///
/// Exists only to avoid duplicating the same screen scaffold five times
/// while the foundation slice proves navigation, not screen content. Each
/// tab supplies its own title/subtitle; none of this is final screen
/// composition or copy.
struct TabPlaceholderView: View {
    let tab: AppTab
    let subtitle: String

    var body: some View {
        ZStack {
            PhysiqueOSTheme.background.ignoresSafeArea()
            VStack(spacing: 12) {
                Image(systemName: tab.systemImageName)
                    .font(.system(size: 40, weight: .light))
                    .foregroundStyle(PhysiqueOSTheme.accent)
                    .accessibilityHidden(true)
                Text(tab.title)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
        }
        .navigationTitle(tab.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
    }
}
