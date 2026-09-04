import SwiftUI

/// `/briefings/review` — the complete chronological Briefing History.
/// Reads through `BriefingSandboxStore.history`, the exact same collection
/// Home's latest-Briefing projection is computed from (no second,
/// History-only fixture) and sorted the same way the real repository sorts
/// it: plain descending `generatedAt` string comparison, not array
/// position (`DailyBriefingHistory.js`). Superseded (in-place-revised)
/// artifacts are excluded here, mirroring the real repository's own
/// `listDailyBriefings()` — verified real behavior: the prior version is
/// hidden, not deleted (see `BriefingRevisionSnapshot`/`isRevised`).
///
/// Verified real behavior: History does NOT show Confidence in the row —
/// only cadence, title, and date. This view intentionally does not add it.
struct BriefingHistoryView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    var onNavigate: (AppDestination) -> Void = { _ in }

    private var briefings: [BriefingReadModel] {
        environment.briefingSandboxStore.history
    }

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button { dismiss() } label: {
                    Label("Back", systemImage: "arrow.left")
                        .labelStyle(.titleAndIcon)
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Briefing History")
                    .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("\(briefings.count) published \(briefings.count == 1 ? "briefing" : "briefings")")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }

            if briefings.isEmpty {
                CardContainer(padding: .md) {
                    Text("No Briefings have been published yet.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        .frame(maxWidth: .infinity, minHeight: 120, alignment: .center)
                }
            } else {
                VStack(spacing: 10) {
                    ForEach(briefings) { briefing in
                        BriefingHistoryRow(briefing: briefing) {
                            onNavigate(.briefingDetail(briefingId: briefing.id))
                        }
                    }
                }
            }
        }
    }
}

private struct BriefingHistoryRow: View {
    let briefing: BriefingReadModel
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            CardContainer(padding: .sm) {
                HStack(alignment: .top, spacing: 12) {
                    IconBadge(systemImage: iconName, color: .evidence)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            BriefingCadenceBadge(cadence: briefing.cadence)
                            if briefing.isRevised {
                                StatusChip(text: "Revised", color: .muted)
                            }
                        }
                        Text(briefing.historyTitle)
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            .multilineTextAlignment(.leading)
                        Text(briefing.historySubtitle)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                        if let attributionLabel {
                            Text(attributionLabel)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                        .font(.system(size: 13, weight: .semibold))
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(briefing.cadence.label), \(briefing.historyTitle), \(briefing.historySubtitle)\(briefing.isRevised ? ", revised" : "")")
        .accessibilityAddTraits(.isButton)
    }

    private var iconName: String {
        switch briefing.cadence {
        case .weekly: "calendar"
        case .midweek: "calendar.badge.clock"
        case .monthly: "calendar.circle"
        case .daily: "sun.max"
        }
    }

    private var attributionLabel: String? {
        guard let phaseName = briefing.attribution.phaseName else { return briefing.attribution.goalTitle }
        return "\(briefing.attribution.goalTitle) · \(phaseName)"
    }
}
