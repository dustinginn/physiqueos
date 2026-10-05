import SwiftUI

/// The Founder-locked Home composition: trajectory, journey and persistent
/// guardrail share one information field. All strings and values continue to
/// come from `home.v1`; this view only changes their visual composition.
struct HomeJourneyFieldView: View {
    @Environment(\.colorScheme) private var colorScheme
    let hero: HomeHero
    let goal: HomeGoal
    let onOpenConfidenceDetail: () -> Void
    let onOpenGoal: (AppDestination) -> Void

    private var trajectory: HomePhaseTrajectory? {
        guard case .phaseTrajectory(let value) = goal.presentation else { return nil }
        return value
    }

    private var progress: Int? {
        switch goal.presentation {
        case .primary(let value, _): value
        case .phaseTrajectory(let value): value.phases.first(where: { $0.status == "active" })?.clampedProgressPercentage
        case .supporting: nil
        }
    }

    private var fieldInk: Color { colorScheme == .dark ? .white : PhysiqueOSTheme.redesignInk }
    private var fieldSecondary: Color { colorScheme == .dark ? .white.opacity(0.72) : PhysiqueOSTheme.redesignInkSecondary }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            trajectorySummary
            metrics
                .padding(.top, 14)
                .padding(.bottom, 16)
            journey
            if let guardrail = trajectory?.guardrail {
                guardrailField(guardrail).padding(.top, 14)
            }
        }
        .padding(18)
        .background {
            ZStack(alignment: .bottomTrailing) {
                LinearGradient(
                    colors: [PhysiqueOSTheme.redesignFieldStart, PhysiqueOSTheme.redesignFieldEnd],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                Circle()
                    .stroke(PhysiqueOSTheme.redesignGreen.opacity(colorScheme == .dark ? 0.12 : 0.10), lineWidth: 48)
                    .frame(width: 265, height: 265)
                    .offset(x: 92, y: 70)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private var trajectorySummary: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 5) {
                Text("TRAJECTORY")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(1.1)
                    .foregroundStyle(fieldSecondary)
                Text(hero.headline)
                    .font(.system(size: 24, weight: .heavy))
                    .foregroundStyle(fieldInk)
                    .minimumScaleFactor(0.82)
                HStack(spacing: 6) {
                    Circle().fill(PhysiqueOSTheme.redesignGreen).frame(width: 7, height: 7)
                    Text(hero.primaryTimeline ?? hero.goalLabel)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(PhysiqueOSTheme.redesignGreen)
                }
                Text(hero.supportLine)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(fieldSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 2)
            if let confidence = hero.confidence {
                Button(action: onOpenConfidenceDetail) {
                    ConfidenceRing(value: confidence)
                        .frame(width: 110, height: 110)
                }
                .buttonStyle(.plain)
                .frame(minWidth: 44, minHeight: 44)
                .accessibilityLabel("View why goal confidence is \(confidence) percent")
            }
        }
    }

    private var metrics: some View {
        HStack(alignment: .top, spacing: 10) {
            fieldMetric("TARGET DATE", value: trajectory?.overallTargetDate.map(TrainingDateFormatting.short) ?? hero.projectedFinish ?? "—")
            fieldMetric("REMAINING", value: hero.daysRemaining ?? "—")
            fieldMetric("PROGRESS", value: progress.map { "\($0)%" } ?? "—")
            fieldMetric("DESTINATION", value: [goal.target, goal.unit].filter { !$0.isEmpty }.joined(separator: " "))
        }
    }

    private func fieldMetric(_ label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Rectangle()
                .fill(colorScheme == .dark ? Color.white.opacity(0.09) : PhysiqueOSTheme.redesignInk.opacity(0.10))
                .frame(height: 1)
                .padding(.bottom, 5)
            Text(label)
                .font(.system(size: 9, weight: .bold))
                .tracking(0.6)
                .foregroundStyle(fieldSecondary)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            Text(value)
                .font(.system(size: 14, weight: .heavy))
                .foregroundStyle(fieldInk)
                .lineLimit(2)
                .minimumScaleFactor(0.72)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var journey: some View {
        let content = VStack(alignment: .leading, spacing: 12) {
            Text("PRIMARY GOAL")
                .font(.system(size: 11, weight: .bold))
                .tracking(1)
                .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                .padding(.horizontal, colorScheme == .dark ? 8 : 0)
                .padding(.vertical, colorScheme == .dark ? 4 : 0)
                .background {
                    if colorScheme == .dark {
                        RoundedRectangle(cornerRadius: 5, style: .continuous)
                            .fill(Color(hex: 0xE9E2FF))
                    }
                }
            if let dateRange = goalDateRange {
                Text(dateRange)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(fieldSecondary)
            }
            if let phases = trajectory?.phases, !phases.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(phases) { phase in
                        HomeJourneyPhaseRow(phase: phase, remaining: hero.daysRemaining)
                    }
                }
                .background(alignment: .topLeading) {
                    GeometryReader { proxy in
                        LinearGradient(
                            stops: [
                                .init(color: PhysiqueOSTheme.redesignAmber.opacity(0.82), location: 0),
                                .init(color: PhysiqueOSTheme.redesignAmber.opacity(0.82), location: 0.43),
                                .init(color: PhysiqueOSTheme.redesignGreen.opacity(0.82), location: 0.57),
                                .init(color: PhysiqueOSTheme.redesignGreen.opacity(0.82), location: 1)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                        .frame(width: 2, height: max(0, proxy.size.height - 8))
                        .offset(x: 11, y: 8)
                    }
                    .allowsHitTesting(false)
                }
            } else {
                Text(goal.title)
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundStyle(fieldInk)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)

        if let destination = goal.destination {
            Button { onOpenGoal(destination) } label: { content }
                .buttonStyle(.plain)
        } else { content }
    }

    private var goalDateRange: String? {
        guard let target = trajectory?.overallTargetDate else { return nil }
        let start = trajectory?.phases
            .compactMap(\.startDate)
            .sorted()
            .first
        guard let start else { return TrainingDateFormatting.short(target) }
        return "\(TrainingDateFormatting.short(start)) – \(TrainingDateFormatting.short(target))"
    }

    private func guardrailField(_ text: String) -> some View {
        let parts = text.components(separatedBy: " · ")
        let title = parts.first ?? text
        let detail = parts.dropFirst().joined(separator: " · ")
        return VStack(alignment: .leading, spacing: 4) {
            Text("GUARDRAIL")
                .font(.system(size: 10, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(PhysiqueOSTheme.redesignCyan)
            Text(title)
                .font(.system(size: 14, weight: .heavy))
                .foregroundStyle(fieldInk)
            if !detail.isEmpty {
                Text(detail)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(fieldSecondary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(width: 304, alignment: .leading)
        .background(colorScheme == .dark ? Color(hex: 0x0B2231).opacity(0.92) : Color(hex: 0xF8FBF7).opacity(0.88))
        .overlay(alignment: .leading) { Rectangle().fill(PhysiqueOSTheme.redesignCyan).frame(width: 4) }
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct HomeJourneyPhaseRow: View {
    @Environment(\.colorScheme) private var colorScheme
    let phase: HomeGoalPhase
    let remaining: String?

    private var tint: Color {
        phase.status == "active" ? PhysiqueOSTheme.redesignGreen : PhysiqueOSTheme.redesignAmber
    }
    private var fieldInk: Color { colorScheme == .dark ? .white : PhysiqueOSTheme.redesignInk }
    private var fieldSecondary: Color { colorScheme == .dark ? .white.opacity(0.70) : PhysiqueOSTheme.redesignInkSecondary }

    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            ZStack {
                Circle().fill(tint.opacity(0.18)).frame(width: 24, height: 24)
                Circle().fill(tint).frame(width: 12, height: 12)
            }
            .frame(width: 24, height: 24)
            VStack(alignment: .leading, spacing: 3) {
                Text("PHASE\(phase.order + 1) · \(phase.status == "completed" ? "COMPLETE" : phase.status.uppercased())")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(0.4)
                    .foregroundStyle(tint)
                Text(phase.phaseName)
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(fieldInk)
                if let detail = phaseDetail {
                    Text(detail)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(fieldSecondary)
                }
                if phase.status == "active", let label = phase.presentationLabel {
                    Text(label)
                        .font(.system(size: 12, weight: .heavy))
                        .foregroundStyle(fieldInk)
                        .padding(.top, 2)
                }
            }
        }
    }

    private var phaseDetail: String? {
        guard phase.status == "active" else { return phase.presentationLabel }
        let range: String? = {
            guard let start = phase.startDate,
                  let end = phase.calculatedPlannedReviewDate else { return nil }
            return "\(TrainingDateFormatting.short(start)) – \(TrainingDateFormatting.short(end))"
        }()
        return [range, remaining.map { "about \($0) remaining" }]
            .compactMap { $0 }
            .joined(separator: " · ")
    }
}

struct HomeActionBriefingStrip: View {
    let action: HomeNextBestAction
    let briefing: HomeBriefingCard?
    let onNavigate: (AppDestination) -> Void

    var body: some View {
        GeometryReader { proxy in
            let availableWidth = proxy.size.width - (briefing == nil ? 0 : 10)
            HStack(spacing: 10) {
                actionButton
                    .frame(width: briefing == nil ? availableWidth : availableWidth * 0.58)
                if let briefing {
                    briefingButton(briefing)
                        .frame(width: availableWidth * 0.42)
                }
            }
        }
        .frame(height: 104)
    }

    private var actionButton: some View {
        Button { onNavigate(action.destination) } label: {
            HStack(alignment: .bottom) {
                Text(action.title)
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundStyle(Color(hex: 0x102431))
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 8)
                Image(systemName: "plus")
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundStyle(Color(hex: 0x102431))
                    .frame(width: 38, height: 38)
                    .background(.white.opacity(0.18), in: RoundedRectangle(cornerRadius: 11))
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 104, alignment: .bottomLeading)
            .background(PhysiqueOSTheme.redesignAmberField)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
    }

    private func briefingButton(_ card: HomeBriefingCard) -> some View {
        Group {
            if let destination = card.destination {
                Button { onNavigate(destination) } label: { briefingLabel(card) }.buttonStyle(.plain)
            } else { briefingLabel(card) }
        }
        .frame(maxWidth: .infinity)
    }

    private func briefingLabel(_ card: HomeBriefingCard) -> some View {
        HStack(spacing: 9) {
            Image(systemName: "doc.text.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(PhysiqueOSTheme.redesignTeal)
                .frame(width: 34, height: 34)
                .background(PhysiqueOSTheme.redesignTeal.opacity(0.13), in: RoundedRectangle(cornerRadius: 9))
            VStack(alignment: .leading, spacing: 2) {
                Text(card.title)
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                    .lineLimit(2)
                    .minimumScaleFactor(0.82)
                    .fixedSize(horizontal: false, vertical: true)
                if let date = card.createdAt.flatMap({ BriefingCardView.relativeDateLabel(from: $0) }) {
                    Text(date).font(.system(size: 11, weight: .medium)).foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                }
            }
            Spacer(minLength: 2)
        }
        .padding(12)
        .overlay(alignment: .trailing) {
            Image(systemName: "arrow.right")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(PhysiqueOSTheme.redesignTeal)
                .padding(.trailing, 8)
        }
        .frame(maxWidth: .infinity, minHeight: 104, alignment: .bottomLeading)
        .background(PhysiqueOSTheme.redesignPaper)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(PhysiqueOSTheme.redesignTeal.opacity(0.42)))
    }
}
