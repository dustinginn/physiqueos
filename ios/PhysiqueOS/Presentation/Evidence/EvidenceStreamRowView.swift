import SwiftUI

/// Founder-locked flat Evidence index row. Canonical summary copy and
/// destination remain owned by the read model; this view only translates
/// them into the accepted next-generation visual grammar.
struct EvidenceStreamRowView: View {
    let stream: EvidenceStreamSummary
    let onTap: (AppDestination) -> Void

    /// Mirrors `displayTitle` (`EvidenceHubIndex.jsx:152-154`): Progress
    /// Photos shows as "Photos" on the hub row.
    private var displayTitle: String {
        stream.id == "photos" ? "Photos" : stream.title
    }

    private var rowLetter: String {
        if stream.id == "timeline" { return "↝" }
        return String(displayTitle.prefix(1)).uppercased()
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
            HStack(spacing: 14) {
                Text(rowLetter)
                    .font(.system(size: 16, weight: .black, design: .rounded))
                    .foregroundStyle(EvidenceRedesignPalette.lime)
                    .frame(width: 38, height: 38)
                    .background(PhysiqueOSTheme.redesignSoft)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 3) {
                    Text(displayTitle)
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundStyle(PhysiqueOSTheme.redesignInk)
                    HStack(spacing: 4) {
                        Text(summary.label)
                        if let value = summary.value {
                            Text("·")
                            Text(value)
                        }
                    }
                    .font(.system(size: 13, weight: .medium, design: .rounded))
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                    .lineLimit(1)
                }

                Spacer(minLength: 8)

                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .black))
                    .foregroundStyle(EvidenceRedesignPalette.lime)
            }
            .padding(.horizontal, 1)
            .frame(minHeight: 61)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) {
            Rectangle().fill(PhysiqueOSTheme.redesignRule).frame(height: 1)
        }
        .accessibilityIdentifier("evidence.stream.\(stream.id)")
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
