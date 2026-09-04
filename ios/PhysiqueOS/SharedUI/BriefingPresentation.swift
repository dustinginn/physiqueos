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

/// Displays a persisted `BriefingConfidenceReadModel` verbatim. Native never
/// derives `score`/`band`/`delta`/reasons here — every value is exactly
/// what the fixture (a stand-in for the real server-computed artifact
/// field) already carries.
struct BriefingConfidenceCard: View {
    let confidence: BriefingConfidenceReadModel

    var body: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Goal Confidence")
                HStack(alignment: .top, spacing: 14) {
                    ConfidenceRing(value: confidence.score, label: confidence.bandLabel, size: 76, lineWidth: 6)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(confidence.movementLabel)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        Text(confidence.primaryReason)
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
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
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
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
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.metricLabel)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.metricValue)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                .lineLimit(1)
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
