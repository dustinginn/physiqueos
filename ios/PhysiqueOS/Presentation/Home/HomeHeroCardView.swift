import SwiftUI

/// Mirrors `HomeHeroCard.jsx`'s `active` and `terminal` modes: a goal label
/// badge, headline, support line, the Confidence ring (active) or a primary
/// action button (terminal), and — in active mode — Projected Finish/Days
/// Remaining metrics. `calibration` and `phase_trajectory` hero modes exist
/// on the web but are not modeled in this slice.
struct HomeHeroCardView: View {
    let hero: HomeHero
    var onOpenConfidenceDetail: () -> Void

    var body: some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 0) {
                SectionHeading("Trajectory")

                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 8) {
                            IconBadge(systemImage: "target", color: .primary, size: .xs, isCircular: true)
                            Text(hero.goalLabel.uppercased())
                                .font(.system(size: 10, weight: .heavy))
                                .tracking(0.8)
                                .foregroundStyle(PhysiqueOSTheme.accent)
                                .lineLimit(1)
                        }
                        Text(hero.headline)
                            .font(.system(size: 18, weight: .heavy))
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text(hero.supportLine)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
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
                ConfidenceRing(value: confidence, label: "Goal")
            }
            .buttonStyle(.plain)
            .accessibilityLabel("View why goal confidence is \(confidence) percent")
            .accessibilityHint("Opens an explanation of what supports and limits this confidence")
        } else {
            ZStack {
                Circle().stroke(PhysiqueOSTheme.divider, lineWidth: 6)
                VStack(spacing: 2) {
                    Text("—").font(.system(size: 18, weight: .heavy))
                    Text("CONFIDENCE").font(.system(size: 9, weight: .bold)).tracking(0.5)
                }
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
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
            .font(.system(size: 15, weight: .heavy))
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
