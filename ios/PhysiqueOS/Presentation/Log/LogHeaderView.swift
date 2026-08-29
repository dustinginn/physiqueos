import SwiftUI

/// Mirrors `LogHubScreen.jsx`'s header: an eyebrow, a headline, and a
/// subtitle. The web also renders a "Back to Home" link above this, which
/// native intentionally omits — Log is a peer tab of Home, not a pushed
/// page requiring its own way back (see `docs/PHYSIQUEOS_NATIVE_V1.md`).
struct LogHeaderView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Log")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text("What happened?")
                .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text("Upload a screenshot, photo, PDF, or note and PhysiqueOS will organize it.")
                .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
