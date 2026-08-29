import SwiftUI

/// Mirrors `LoggedTodayCard`/`LoggedTodayRow` inside `LogHubScreen.jsx`:
/// always exactly three rows (training, nutrition, activity), each either
/// populated with a summary and tappable, or a plain, non-interactive
/// empty-state row when nothing has been logged for that kind today.
struct LoggedTodayCardView: View {
    let rows: [LoggedTodayRow]
    var onTap: (AppDestination) -> Void

    var body: some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Logged Today")
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    .padding(.horizontal, 4)
                    .padding(.bottom, 4)
                VStack(spacing: 0) {
                    ForEach(rows) { row in
                        LoggedTodayRowView(row: row, onTap: onTap)
                    }
                }
            }
        }
    }
}

private struct LoggedTodayRowView: View {
    let row: LoggedTodayRow
    var onTap: (AppDestination) -> Void

    var body: some View {
        let content = HStack(spacing: 12) {
            Image(systemName: row.kind.systemImage)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.accent)
                .frame(width: 20)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.kind.label)
                    .physiqueOSFont(PhysiqueOSTypography.rowEyebrow)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Text(row.summary)
                    .physiqueOSFont(PhysiqueOSTypography.rowSummary)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if let context = row.context {
                    Text(context)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
            Spacer(minLength: 4)
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 64)

        Group {
            if let destination = row.destination {
                Button { onTap(destination) } label: { content }.buttonStyle(.plain)
            } else {
                content
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(row.destination != nil ? .isButton : [])
    }
}
