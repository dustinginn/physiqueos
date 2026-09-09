import SwiftUI

/// Shared presentation pieces for the recurring-Briefing vertical
/// (`Presentation/Briefings/*`) — the cadence badge, the server-owned
/// Confidence card (built on the existing `ConfidenceRing`), the top-of-
/// Detail navigation header the Founder explicitly asked for (clear access
/// to Home and to Briefing History from every Briefing Detail), and the
/// revision-disclosure banner. Kept here rather than duplicated per
/// cadence-detail view, matching this codebase's existing `SharedUI`
/// convention (`ConfidenceRing`, `StatusChip`, `SectionHeading`, …).

// MARK: - Date formatting

/// Date-only (`"YYYY-MM-DD"`) and true-instant (ISO-8601 timestamp)
/// formatting for Briefing fields. Date-only fields are UTC-anchored so a
/// device timezone never shifts a reporting-window boundary to the
/// adjacent calendar day (mirrors `TrainingDateFormatting.short`'s
/// contract); `generatedAt`/`capturedAt`/`replacementTimestamp` are real
/// instants and are shown in the device's local timezone, which is the
/// correct behavior for an instant (not a shift, a genuine local-time
/// read).
enum BriefingDateFormatting {
    private static let dateKeyParser: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func shortDate(_ dateKey: String) -> String {
        guard let date = dateKeyParser.date(from: String(dateKey.prefix(10))) else { return dateKey }
        let display = DateFormatter()
        display.calendar = Calendar(identifier: .gregorian)
        display.locale = Locale(identifier: "en_US_POSIX")
        display.timeZone = TimeZone(identifier: "UTC")
        display.dateFormat = "MMM d, yyyy"
        return display.string(from: date)
    }

    static func timestamp(_ iso: String) -> String {
        guard let date = ISO8601DateFormatter.briefingTimestamp.date(from: iso) else { return iso }
        let display = DateFormatter()
        display.dateStyle = .medium
        display.timeStyle = .short
        return display.string(from: date)
    }
}

extension ISO8601DateFormatter {
    nonisolated(unsafe) static let briefingTimestamp: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

// MARK: - Cadence badge

struct BriefingCadenceBadge: View {
    let briefing: BriefingReadModel

    private var color: HomeColorToken {
        switch briefing.cadence {
        case .weekly: .evidence
        case .midweek: .effort
        case .monthly: .primary
        case .daily: .evidence
        case .event: .success
        }
    }

    var body: some View {
        StatusChip(text: briefing.displayCadenceLabel, color: color)
    }
}

// MARK: - Confidence card (server-owned — displays only, never computes)

struct BriefingEditorialCard<Content: View>: View {
    var tint: Color = PhysiqueOSTheme.accent
    var background: Color = PhysiqueOSTheme.surfaceElevated
    var showsAccentBar = false
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(22)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: 22))
            .overlay(alignment: .leading) {
                if showsAccentBar {
                    RoundedRectangle(cornerRadius: 3).fill(tint).frame(width: 3).padding(.vertical, 18)
                }
            }
            .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(tint.opacity(0.22), lineWidth: 1))
    }
}

struct BriefingEditorialHeading: View {
    let title: String
    var body: some View {
        Text(title)
            .physiqueOSFont(PhysiqueOSTypography.editorialSection)
            .foregroundStyle(PhysiqueOSTheme.accent)
            .accessibilityAddTraits(.isHeader)
    }
}

/// One integrated opening composition for recurring Briefings. The live
/// web lead places Confidence, editorial headline, narrative, and strategy
/// context inside a single zine-style card; keeping those elements here
/// prevents cadence screens from reintroducing a duplicate hero card.
struct BriefingLeadCard: View {
    let eyebrow: String
    let rangeLabel: String
    let headline: String
    let narrative: String
    let confidence: BriefingConfidenceReadModel?
    var footerItems: [(String, String)] = []

    var body: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.accent, background: PhysiqueOSTheme.surfaceAccent) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top) {
                    Text(eyebrow)
                        .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                        .foregroundStyle(PhysiqueOSTheme.accent)
                    Spacer(minLength: 12)
                    Text(rangeLabel)
                        .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                        .multilineTextAlignment(.trailing)
                }
                if let confidence {
                    HStack(alignment: .center, spacing: 18) {
                        ConfidenceRing(value: confidence.score, size: 112, lineWidth: 8)
                        VStack(alignment: .leading, spacing: 7) {
                            Text(confidence.bandLabel)
                                .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                            Text(confidence.movementLabel)
                                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text(confidence.primaryReason)
                                .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }
                }
                Divider().overlay(PhysiqueOSTheme.divider)
                Text(headline)
                    .physiqueOSFont(PhysiqueOSTypography.editorialHero)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(narrative)
                    .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if !footerItems.isEmpty {
                    Divider().overlay(PhysiqueOSTheme.divider)
                    HStack(alignment: .top, spacing: 18) {
                        ForEach(Array(footerItems.enumerated()), id: \.offset) { _, item in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(item.0)
                                    .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                                Text(item.1)
                                    .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                        }
                    }
                }
            }
        }
    }
}

/// Displays a persisted `BriefingConfidenceReadModel` verbatim. Native never
/// derives `score`/`band`/`delta`/reasons here — every value is exactly
/// what the fixture (a stand-in for the real server-computed artifact
/// field) already carries.
struct BriefingConfidenceCard: View {
    let confidence: BriefingConfidenceReadModel

    var body: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartSuccess) {
            VStack(alignment: .leading, spacing: 16) {
                BriefingEditorialHeading(title: "Goal Confidence")
                HStack(alignment: .top, spacing: 14) {
                    ConfidenceRing(value: confidence.score, size: 92, lineWidth: 7)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(confidence.movementLabel)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        Text(confidence.primaryReason)
                        .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    }
                }
                if !confidence.supportingReasons.isEmpty {
                    reasonList(title: "What's supporting this", items: confidence.supportingReasons, tint: PhysiqueOSTheme.chartSuccess)
                }
                if !confidence.limitingReasons.isEmpty {
                    reasonList(title: "What's limiting this", items: confidence.limitingReasons, tint: PhysiqueOSTheme.chartEffort)
                }
                if !confidence.unresolvedUncertainty.isEmpty {
                    reasonList(title: "Still unresolved", items: confidence.unresolvedUncertainty, tint: PhysiqueOSTheme.textMuted)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Goal Confidence: \(confidence.score) percent, \(confidence.bandLabel). \(confidence.movementLabel). \(confidence.primaryReason)")
    }

    private func reasonList(title: String, items: [String], tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            ForEach(items, id: \.self) { item in
                HStack(alignment: .top, spacing: 6) {
                    Circle().fill(tint).frame(width: 5, height: 5).padding(.top, 6)
                    Text(item)
                        .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }
}

/// Saturated purple finale shared by Weekly and Midweek. It mirrors the
/// web's visual cadence: distinct emoji-led sections, separators, and
/// numbered actions rather than a stack of generic inset cards.
struct BriefingCoachFinale: View {
    let takeaway: String
    let recommendation: String
    let actionTitle: String
    let actions: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            Text("COACH'S TAKE")
                .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                .foregroundStyle(.white.opacity(0.82))
            finaleSection("💡 Biggest Takeaway", takeaway)
            Divider().overlay(Color.white.opacity(0.22))
            finaleSection("🧠 My Recommendation", recommendation)
            if !actions.isEmpty {
                Divider().overlay(Color.white.opacity(0.22))
                Text("🎯 \(actionTitle)")
                    .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                    .foregroundStyle(.white)
                VStack(alignment: .leading, spacing: 13) {
                    ForEach(Array(actions.enumerated()), id: \.offset) { index, action in
                        HStack(alignment: .top, spacing: 12) {
                            Text("\(index + 1)")
                                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                .foregroundStyle(Color(hex: 0xDDD6FE))
                                .frame(width: 28, height: 28)
                                .background(Color.white.opacity(0.12))
                                .clipShape(Circle())
                            Text(action)
                                .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                                .foregroundStyle(.white.opacity(0.94))
                        }
                    }
                }
            }
        }
        .padding(26)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [Color(hex: 0x6D28D9), Color(hex: 0x4338CA)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(Color.white.opacity(0.16)))
    }

    private func finaleSection(_ title: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                .foregroundStyle(.white)
            Text(text)
                .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                .foregroundStyle(.white.opacity(0.92))
        }
    }
}

// MARK: - Detail-top navigation header

/// The Founder's explicit requirement: clear navigation to Home and to
/// Briefing History from the top of every Briefing Detail screen.
struct BriefingDetailHeader: View {
    var onHome: () -> Void
    var onHistory: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            navButton(title: "Home", systemImage: "house.fill", action: onHome)
            navButton(title: "Briefing History", systemImage: "clock.arrow.circlepath", action: onHistory)
            Spacer(minLength: 0)
        }
    }

    private func navButton(title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(systemName: systemImage)
                Text(title)
            }
            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
            .foregroundStyle(PhysiqueOSTheme.textSecondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(PhysiqueOSTheme.surfaceMuted)
            .clipShape(Capsule())
        }
        .accessibilityLabel(title)
    }
}

// MARK: - Revision disclosure

/// Rendered only when `BriefingReadModel.isRevised` is true — discloses,
/// honestly, that this artifact replaced an earlier version rather than
/// silently presenting the revised content as if it always looked this way.
struct BriefingRevisionBanner: View {
    let provenance: BriefingRevisionProvenance
    let replacedHistory: [BriefingRevisionSnapshot]

    var body: some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                    Text("This Briefing was revised")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                }
                .foregroundStyle(PhysiqueOSTheme.accent)
                Text(provenance.reason)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if let original = replacedHistory.first {
                    Text("Originally published \(BriefingDateFormatting.timestamp(original.generatedAt)) as \u{201C}\(original.headline)\u{201D}")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Stat item

/// A plain label/value pair for Briefing stat rows (Energy averages,
/// Training counts, Body Composition figures, Monthly's Defining Moments)
/// — deliberately not `MetricRow`, which always renders a leading icon that
/// none of these figures have a meaningful one for.
struct BriefingStatItem: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.editorialMetric)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                .minimumScaleFactor(0.72)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Plain narrative list (Coach's Take / Priorities / Month Ahead)

struct BriefingNarrativeList: View {
    let title: String
    let items: [String]
    var numbered: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeading(title)
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .top, spacing: 8) {
                        if numbered {
                            Text("\(index + 1).")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.accent)
                        }
                        Text(item)
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
            }
        }
    }
}
