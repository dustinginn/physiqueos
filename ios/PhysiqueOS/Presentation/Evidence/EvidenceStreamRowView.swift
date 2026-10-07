import SwiftUI

/// One locked Evidence Hub row (H1 `.hub-row`): a 30-px icon tile in the
/// stream's domain accent (the Hub is the key to the category colors), the
/// stream title over its compact summary, and a neutral chevron, separated
/// from the next row by a full-width 1-px rule. The whole row is one
/// button; the summary families mirror `getCompactSummary`
/// (`EvidenceHubIndex.jsx:129-150`) unchanged.
struct EvidenceStreamRowView: View {
    let stream: EvidenceStreamSummary
    let onTap: (AppDestination) -> Void

    private typealias S = EvidenceLockedStyle

    /// Mirrors `displayTitle` (`EvidenceHubIndex.jsx:152-154`): Progress
    /// Photos shows as "Photos" on the hub row.
    private var displayTitle: String {
        stream.id == "photos" ? "Photos" : stream.title
    }

    private var domain: EvidenceDomain? { EvidenceDomain(streamId: stream.id) }

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

    private var summaryLine: String {
        if let value = summary.value { return "\(summary.label) · \(value)" }
        return summary.label
    }

    var body: some View {
        Button {
            onTap(stream.destination)
        } label: {
            HStack(spacing: 0) {
                EvidenceHubTile(domain: domain)
                    .frame(width: S.pt(32), alignment: .leading)
                    .padding(.trailing, S.pt(10))

                VStack(alignment: .leading, spacing: 0) {
                    Text(displayTitle)
                        .evidenceLockedText(S.rowLabel)
                        .foregroundStyle(S.ink)
                    Text(summaryLine)
                        .evidenceLockedText(S.rowCopy)
                        .foregroundStyle(S.muted)
                        .padding(.top, S.pt(3))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.trailing, S.pt(10))

                Text("›")
                    .evidenceLockedText(S.chevron)
                    .foregroundStyle(S.muted)
            }
            .padding(.horizontal, S.pt(1))
            .padding(.vertical, S.pt(10))
            .frame(minHeight: 44)
            .padding(.bottom, S.pt(1))
            .overlay(alignment: .bottom) {
                Rectangle().fill(S.line).frame(height: S.pt(1))
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(displayTitle). \(summary.label)\(summary.value.map { ": \($0)" } ?? "")")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("evidence.stream.\(stream.id)")
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

/// The Hub's 30-px rounded tile: the domain icon in its accent on the
/// accent-soft fill. A stream without a domain gets the neutral clipboard.
struct EvidenceHubTile: View {
    let domain: EvidenceDomain?

    private typealias S = EvidenceLockedStyle

    var body: some View {
        let accent = domain?.accent ?? .neutral
        Image(systemName: domain?.systemImage ?? "list.clipboard.fill")
            .font(.system(size: S.pt(13), weight: .semibold))
            .foregroundStyle(accent.color)
            .frame(width: S.pt(30), height: S.pt(30))
            .background(accent.soft, in: RoundedRectangle(cornerRadius: S.pt(9)))
            .accessibilityHidden(true)
    }
}
