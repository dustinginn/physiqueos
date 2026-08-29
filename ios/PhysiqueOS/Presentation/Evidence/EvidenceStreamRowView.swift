import SwiftUI

/// Mirrors `EvidenceStreamCard` (`EvidenceHubIndex.jsx:90-127`): an icon
/// badge, the stream's title, and a compact "label: value" summary line,
/// tappable to the stream's destination.
struct EvidenceStreamRowView: View {
    let stream: EvidenceStreamSummary
    let onTap: (AppDestination) -> Void

    private var presentation: EvidenceStreamPresentation.Style {
        EvidenceStreamPresentation.style(for: stream.id)
    }

    /// Mirrors `displayTitle` (`EvidenceHubIndex.jsx:152-154`): Progress
    /// Photos shows as "Photos" on the hub row.
    private var displayTitle: String {
        stream.id == "photos" ? "Photos" : stream.title
    }

    /// Mirrors `getCompactSummary` (`EvidenceHubIndex.jsx:129-150`).
    private var summary: (label: String, value: String?) {
        let datedLabels: [String: String] = [
            "training": "Last workout",
            "nutrition": "Last logged",
            "photos": "Last session",
            "dexa": "Last scan",
            "energy": "Latest",
        ]
        if let label = datedLabels[stream.id] {
            return (label, stream.lastUpdated.map(Self.formatDate) ?? stream.metric)
        }
        if stream.id == "weight" || stream.id == "activity" {
            return ("Latest", stream.metric)
        }
        return (stream.metric, nil)
    }

    var body: some View {
        Button {
            onTap(stream.destination)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: presentation.systemImage)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(presentation.color)
                    .frame(width: 32, height: 32)
                    .background(presentation.color.opacity(0.16))
                    .clipShape(Circle())
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text(displayTitle)
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    HStack(spacing: 4) {
                        Text(summary.label)
                        if let value = summary.value {
                            Text("·").foregroundStyle(PhysiqueOSTheme.textMuted)
                            Text(value)
                        }
                    }
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .lineLimit(1)
                }

                Spacer(minLength: 8)

                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 68)
            .frame(maxWidth: .infinity)
            .background(PhysiqueOSTheme.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(PhysiqueOSTheme.divider, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(displayTitle). \(summary.label)\(summary.value.map { ": \($0)" } ?? "")")
        .accessibilityAddTraits(.isButton)
    }

    private static func formatDate(_ value: String) -> String {
        let dateOnly = String(value.prefix(10))
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "UTC")
        guard let date = formatter.date(from: dateOnly) else { return dateOnly }
        let display = DateFormatter()
        display.dateFormat = "MMM d"
        display.timeZone = TimeZone(identifier: "UTC")
        return display.string(from: date)
    }
}
