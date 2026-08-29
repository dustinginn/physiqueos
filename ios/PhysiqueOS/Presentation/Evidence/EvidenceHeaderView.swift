import SwiftUI

/// Mirrors `ProgressHubScreen.jsx`'s header: title + subtitle, no back
/// link (Evidence is a peer root tab here, not a pushed page — the same
/// sanctioned native-convention difference already recorded for Log).
struct EvidenceHeaderView: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(subtitle)
                .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
