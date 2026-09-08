import SwiftUI

/// `/briefings/review/[artifactId]` — one router-level container for every
/// cadence, including DEXA Event Briefings. Looks the artifact up through
/// the SAME `BriefingSandboxStore` History reads from (never a duplicate
/// fixture), renders the shared top-of-Detail navigation the Founder asked
/// for (clear access to Home and to Briefing History from every Briefing
/// Detail), the shared revision disclosure, then dispatches to the
/// cadence-specific section content — Weekly, Midweek, Monthly, and DEXA
/// Event are genuinely distinct screens on the real product (verified
/// per-cadence across this and a prior task's audit), not one reskinned
/// template. DEXA Event Briefings reach this exact same architecture from
/// either Home or History — the real product actually splits this across
/// two different URL shapes for the same underlying artifact
/// (`/briefings/dexa/[scanId]` from Home, `/briefings/review/[artifactId]`
/// from History); Native unifies both onto the one existing
/// `briefingId`-keyed lookup rather than building a second navigation
/// path.
struct BriefingDetailView: View {
    @Environment(AppEnvironment.self) private var environment
    let briefingId: String
    var onNavigate: (AppDestination) -> Void = { _ in }
    var onReturnToHome: () -> Void = {}

    private var briefing: BriefingReadModel? {
        environment.briefingSandboxStore.briefing(id: briefingId)
    }

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 20)
                .padding(.top, 18)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
    }

    @ViewBuilder
    private var content: some View {
        if let briefing {
            VStack(alignment: .leading, spacing: 24) {
                BriefingDetailHeader(onHome: onReturnToHome, onHistory: { onNavigate(.briefingList) })

                if let provenance = briefing.revisionProvenance {
                    BriefingRevisionBanner(provenance: provenance, replacedHistory: briefing.replacedHistory)
                }

                header(for: briefing)

                switch briefing.cadence {
                case .weekly:
                    if let weekly = briefing.weekly {
                        WeeklyBriefingSections(content: weekly, confidence: briefing.confidence, onNavigate: onNavigate)
                    }
                case .midweek:
                    if let midweek = briefing.midweek {
                        MidweekBriefingSections(content: midweek, confidence: briefing.confidence)
                    }
                case .monthly:
                    if let monthly = briefing.monthly {
                        MonthlyBriefingSections(content: monthly, confidence: briefing.confidence, onNavigate: onNavigate)
                    }
                case .event:
                    if let dexa = briefing.dexa {
                        DEXABriefingSections(content: dexa, confidence: briefing.confidence, onNavigate: onNavigate)
                    } else if let photo = briefing.photo {
                        PhotoBriefingSections(content: photo, onNavigate: onNavigate)
                    }
                case .daily:
                    EmptyView()
                }
            }
        } else {
            VStack(spacing: 12) {
                BriefingDetailHeader(onHome: onReturnToHome, onHistory: { onNavigate(.briefingList) })
                Text("This Briefing is unavailable.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 200, alignment: .center)
            }
        }
    }

    private func header(for briefing: BriefingReadModel) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                BriefingCadenceBadge(briefing: briefing)
                Text(BriefingDateFormatting.timestamp(briefing.generatedAt))
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            Text(attributionLabel(for: briefing))
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .accessibilityElement(children: .combine)
    }

    private func attributionLabel(for briefing: BriefingReadModel) -> String {
        guard let phaseName = briefing.attribution.phaseName else { return briefing.attribution.goalTitle }
        return "\(briefing.attribution.goalTitle) · \(phaseName)"
    }
}
