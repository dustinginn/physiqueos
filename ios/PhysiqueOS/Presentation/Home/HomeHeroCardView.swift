import SwiftUI

/// Mirrors `HomeHeroCard.jsx`'s active, phase-trajectory, and terminal modes: a goal label
/// badge, headline, support line, the Confidence ring (active) or a primary
/// action button (terminal), and — in active mode — Projected Finish/Days
/// Remaining metrics.
struct HomeHeroCardView: View {
    let hero: HomeHero
    var onOpenConfidenceDetail: () -> Void

    var body: some View {
        CardContainer(
            padding: .sm,
            background: hero.mode == .phaseTrajectory
                ? PhysiqueOSTheme.trajectorySurface
                : PhysiqueOSTheme.surfaceElevated
        ) {
            VStack(alignment: .leading, spacing: 0) {
                SectionHeading("Trajectory")

                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 8) {
                            IconBadge(systemImage: "target", color: .primary, size: .xs, isCircular: true)
                            Text(hero.goalLabel)
                                .physiqueOSFont(PhysiqueOSTypography.heroEyebrow)
                                .foregroundStyle(PhysiqueOSTheme.accent)
                                .lineLimit(1)
                        }
                        Text(hero.headline)
                            .physiqueOSFont(PhysiqueOSTypography.heroHeadline)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        if hero.mode == .phaseTrajectory, let timeline = hero.primaryTimeline {
                            Text(timeline)
                                .font(.system(size: 18, weight: .bold))
                                .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                        }
                        Text(hero.supportLine)
                            .physiqueOSFont(PhysiqueOSTypography.heroSupportLine)
                            .lineSpacing(2)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 8)
                    confidenceSlot
                }
                .padding(.top, 10)

                if hero.mode == .terminal {
                    terminalAction
                } else if hero.projectedFinish != nil || hero.daysRemaining != nil {
                    HStack {
                        if let projectedFinish = hero.projectedFinish {
                            MetricRow(systemImage: "calendar", label: "Projected Finish", value: projectedFinish)
                        }
                        Spacer(minLength: 12)
                        if let daysRemaining = hero.daysRemaining {
                            MetricRow(systemImage: "clock", label: "Days Remaining", value: daysRemaining)
                        }
                    }
                    .padding(.top, 14)
                }
            }
        }
    }

    @ViewBuilder
    private var confidenceSlot: some View {
        if let confidence = hero.confidence, hero.confidenceDetail != nil {
            Button(action: onOpenConfidenceDetail) {
                ConfidenceRing(value: confidence)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("View why goal confidence is \(confidence) percent")
            .accessibilityHint("Opens an explanation of what supports and limits this confidence")
        } else {
            ZStack {
                Circle().stroke(PhysiqueOSTheme.divider, lineWidth: 6)
                VStack(spacing: 2) {
                    Text("—")
                        .font(.system(size: 18, weight: .heavy))
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text("Confidence")
                        .physiqueOSFont(.init(size: 9, weight: .bold))
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
            .frame(width: 82, height: 82)
        }
    }

    @ViewBuilder
    private var terminalAction: some View {
        if let label = hero.actionLabel {
            HStack {
                Spacer()
                Text(label)
                Image(systemName: "arrow.right")
                Spacer()
            }
            .physiqueOSFont(.init(size: 14, weight: .heavy))
            .foregroundStyle(.white)
            .padding(.vertical, 12)
            .background(PhysiqueOSTheme.accent)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .padding(.top, 12)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
        }
    }
}
