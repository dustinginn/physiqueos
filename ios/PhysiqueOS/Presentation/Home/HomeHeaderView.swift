import SwiftUI

/// Mirrors `PageHeader.jsx` as used on Home: a greeting line, the Founder's
/// name with an accent-colored trailing period, nothing else. The web
/// header also supports a subtitle/avatar/actions slot Home itself doesn't
/// use — not ported here.
struct HomeHeaderView: View {
    let header: HomeHeader

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(header.greeting)
                .physiqueOSFont(PhysiqueOSTypography.greeting)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            (
                Text(header.name).foregroundStyle(PhysiqueOSTheme.textPrimary)
                    + Text(".").foregroundStyle(PhysiqueOSTheme.accent)
            )
            .physiqueOSFont(PhysiqueOSTypography.displayName)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
