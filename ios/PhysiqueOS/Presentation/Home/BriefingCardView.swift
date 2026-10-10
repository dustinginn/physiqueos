import SwiftUI

/// Founder-approved Option B — Editorial Rail — for every Home briefing
/// after the event-first primary tile. The read order and destination remain
/// owned by `HomeView`; this view changes presentation only.
struct BriefingCardView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let card: HomeBriefingCard
    var accessibilityIdentifier = HomeBriefingAccessibility.latestIdentifier
    var onTap: (AppDestination) -> Void

    var body: some View {
        Group {
            if let destination = card.destination {
                Button { onTap(destination) } label: { editorialRail }.buttonStyle(.plain)
            } else {
                editorialRail
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityIdentifier(accessibilityIdentifier)
        .accessibilityLabel(Text(Self.accessibilityLabel(for: card)))
        .accessibilityHint(card.destination == nil ? "" : "Opens this briefing.")
        .accessibilityAddTraits(card.destination != nil ? .isButton : [])
    }

    private var editorialRail: some View {
        let shape = RoundedRectangle(
            cornerRadius: HomeSecondaryBriefingLayout.cornerRadius,
            style: .continuous
        )

        return ZStack(alignment: .leading) {
            shape.fill(PhysiqueOSTheme.redesignSoft)

            Rectangle()
                .fill(PhysiqueOSTheme.redesignTeal)
                .frame(width: HomeSecondaryBriefingLayout.railWidth)

            VStack(alignment: .leading, spacing: 10) {
                header

                Text(card.title)
                    .physiqueOSFont(PhysiqueOSTypography.briefingTitle)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                    .fixedSize(horizontal: false, vertical: true)

                Rectangle()
                    .fill(PhysiqueOSTheme.redesignHairline)
                    .frame(height: 1)

                Text(card.prompt)
                    .physiqueOSFont(PhysiqueOSTypography.briefingPrompt)
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.leading, HomeSecondaryBriefingLayout.contentLeadingPadding)
            .padding(.trailing, HomeSecondaryBriefingLayout.contentTrailingPadding)
            .padding(.vertical, HomeSecondaryBriefingLayout.verticalPadding)
        }
        .frame(maxWidth: .infinity, minHeight: HomeSecondaryBriefingLayout.minimumHeight, alignment: .leading)
        .clipShape(shape)
        .overlay(shape.strokeBorder(PhysiqueOSTheme.redesignHairline, lineWidth: 1))
        .overlay(alignment: .trailing) {
            if card.destination != nil {
                Image(systemName: "arrow.right")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(PhysiqueOSTheme.redesignTeal)
                    .frame(width: HomeSecondaryBriefingLayout.arrowHitWidth, height: 44)
            }
        }
        .contentShape(shape)
    }

    @ViewBuilder
    private var header: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 5) {
                cadenceLabel
                if let relativeDate { dateLabel(relativeDate) }
            }
        } else {
            HStack(alignment: .center, spacing: 9) {
                cadenceLabel
                Spacer(minLength: 8)
                if let relativeDate { dateLabel(relativeDate) }
            }
        }
    }

    private var cadenceLabel: some View {
        HStack(spacing: 8) {
            Image(systemName: "doc.text.fill")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(PhysiqueOSTheme.redesignTeal)
                .frame(width: 24, height: 24)
                .background(PhysiqueOSTheme.redesignTeal.opacity(0.13), in: RoundedRectangle(cornerRadius: 7, style: .continuous))

            Text(card.sectionLabel)
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.redesignTeal)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func dateLabel(_ value: String) -> some View {
        Text(value)
            .physiqueOSFont(PhysiqueOSTypography.briefingTimestamp)
            .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var relativeDate: String? {
        card.createdAt.flatMap { Self.relativeDateLabel(from: $0) }
    }

    /// Explicit reading order keeps VoiceOver on cadence → title → prompt →
    /// date even though the visual date sits at the trailing edge of the
    /// header. Server-owned strings are preserved verbatim.
    static func accessibilityLabel(for card: HomeBriefingCard, now: Date = Date()) -> String {
        [
            card.sectionLabel,
            card.title,
            card.prompt,
            card.createdAt.flatMap { relativeDateLabel(from: $0, now: now) },
        ]
        .compactMap { $0 }
        .filter { !$0.isEmpty }
        .joined(separator: ", ")
    }

    /// Mirrors the established Home relative-date presentation: "Today"
    /// for the current calendar day, otherwise a short month/day.
    static func relativeDateLabel(from iso: String, now: Date = Date()) -> String? {
        guard let date = ISO8601DateFormatter.homeFixture.date(from: iso) else { return nil }
        let calendar = Calendar.current
        if calendar.isDate(date, inSameDayAs: now) { return "Today" }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
    }
}

/// Reviewable constants for the approved secondary-card geometry. Keeping
/// them named prevents later cleanup from drifting the 18pt Editorial Rail
/// into the legacy Home analysis card.
enum HomeSecondaryBriefingLayout {
    static let cornerRadius: CGFloat = 18
    static let railWidth: CGFloat = 5
    static let contentLeadingPadding: CGFloat = 18
    static let contentTrailingPadding: CGFloat = 44
    static let verticalPadding: CGFloat = 14
    static let minimumHeight: CGFloat = 118
    static let arrowHitWidth: CGFloat = 44
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
