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
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            (
                Text(header.name).foregroundStyle(PhysiqueOSTheme.textPrimary)
                    + Text(".").foregroundStyle(PhysiqueOSTheme.accent)
            )
            .font(.system(size: 34, weight: .bold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
