import SwiftUI

/// Mirrors `LatestAnalysisCard.jsx` as used inside `HomeBriefingCardStack`.
struct BriefingCardView: View {
    let card: HomeBriefingCard
    var onTap: (AppDestination) -> Void

    var body: some View {
        let content = CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading(card.sectionLabel) {
                    if card.destination != nil {
                        HStack(spacing: 2) {
                            Text("View")
                            Image(systemName: "arrow.right")
                        }
                        .physiqueOSFont(PhysiqueOSTypography.briefingViewLink)
                        .foregroundStyle(PhysiqueOSTheme.accent)
                    }
                }
                HStack(alignment: .top, spacing: 10) {
                    IconBadge(systemImage: "brain.head.profile", color: .evidence)
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .top) {
                            Text(card.title)
                                .physiqueOSFont(PhysiqueOSTypography.briefingTitle)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Spacer(minLength: 8)
                            if let relative = card.createdAt.flatMap({ Self.relativeDateLabel(from: $0) }) {
                                Text(relative)
                                    .physiqueOSFont(PhysiqueOSTypography.briefingTimestamp)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            }
                        }
                        Text(card.prompt)
                            .physiqueOSFont(PhysiqueOSTypography.briefingPrompt)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
            }
        }

        Group {
            if let destination = card.destination {
                Button { onTap(destination) } label: { content }.buttonStyle(.plain)
            } else {
                content
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(card.destination != nil ? .isButton : [])
    }

    /// Mirrors `LatestAnalysisCard.jsx`'s `formatRelativeDate`: "Today" for
    /// the current calendar day, otherwise a short month/day. Presentation
    /// formatting, not a domain calculation — the underlying date always
    /// comes from the read model.
    static func relativeDateLabel(from iso: String, now: Date = Date()) -> String? {
        guard let date = ISO8601DateFormatter.homeFixture.date(from: iso) else { return nil }
        let calendar = Calendar.current
        if calendar.isDate(date, inSameDayAs: now) { return "Today" }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
    }
}

extension ISO8601DateFormatter {
    // Only ever read after construction; safe to share across isolation
    // domains despite ISO8601DateFormatter not being marked Sendable.
    nonisolated(unsafe) static let homeFixture: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
