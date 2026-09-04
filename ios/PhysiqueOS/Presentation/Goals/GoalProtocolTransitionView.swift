import SwiftUI

/// `/goals/transition/protocols` (Route B of 5) —
/// `ProtocolTransitionPreviewScreen.jsx`. Only reachable after Route A's
/// "Create Goal" (`markTransitionReady`) — mirrors the real screen's own
/// "Your current goal and protocols remain unchanged while you prepare
/// what comes next" framing. Categories with a `Review and update`/
/// `Replace` disposition route to Route C
/// (`.goalProtocolTransitionEdit(category:)`) before "Ready for
/// Activation" advances to Route D.
struct GoalProtocolTransitionView: View {
    @Environment(AppEnvironment.self) private var environment
    let onNavigate: (AppDestination) -> Void

    var body: some View {
        if let reviews = environment.goalsSandboxStore.protocolTransitionContext() {
            GoalProtocolTransitionWizard(reviews: reviews, store: environment.goalsSandboxStore, onNavigate: onNavigate)
        } else {
            GoalUnavailableView(message: "Finish the goal step first.")
        }
    }
}

private enum ProtocolTransitionSection: Int, CaseIterable {
    case overview, protocols, routine, commitments, review

    var title: String {
        switch self {
        case .overview: "Let's update the protocols for your new goal"
        case .protocols: "Let's decide how each protocol should carry forward."
        case .routine: "Your future routine"
        case .commitments: "What the new strategy expects"
        case .review: "Review the strategy for your new goal"
        }
    }
}

private struct GoalProtocolTransitionWizard: View {
    let store: GoalsSandboxStore
    let onNavigate: (AppDestination) -> Void

    @State private var step = ProtocolTransitionSection.overview
    @State private var errorMessage: String?

    /// Read live from the store (not a static snapshot) so returning from
    /// Route C's category editor reflects the just-completed edit.
    private var reviews: [GoalTransitionProtocolReview] { store.protocolTransitionContext() ?? [] }

    init(reviews: [GoalTransitionProtocolReview], store: GoalsSandboxStore, onNavigate: @escaping (AppDestination) -> Void) {
        self.store = store
        self.onNavigate = onNavigate
    }

    var body: some View {
        ProtocolBuilderShell(
            eyebrow: "Protocol Transition",
            title: step.title,
            currentStep: step.rawValue + 1,
            totalSteps: ProtocolTransitionSection.allCases.count,
            primaryLabel: step == .review ? "Ready for Activation" : "Continue",
            errorMessage: errorMessage,
            onBack: step.rawValue > 0 ? { step = ProtocolTransitionSection(rawValue: step.rawValue - 1)! } : nil,
            onContinue: { advance() }
        ) {
            content
        }
    }

    private func advance() {
        errorMessage = nil
        if step == .review {
            switch store.markProtocolTransitionReady() {
            case .success: onNavigate(.goalTransitionReview)
            case .failure(let error): errorMessage = error.message
            }
            return
        }
        step = ProtocolTransitionSection(rawValue: step.rawValue + 1)!
    }

    @ViewBuilder private var content: some View {
        switch step {
        case .overview:
            let carrying = reviews.filter { $0.disposition == .keep }.count
            let updates = reviews.filter { $0.disposition.requiresEditor }.count
            let pausedOrLeft = reviews.filter { $0.disposition == .pause || $0.disposition == .remove }.count
            VStack(alignment: .leading, spacing: 10) {
                summaryRow("Carrying forward", carrying)
                summaryRow("Recommended updates", updates)
                summaryRow("Pause or leave behind", pausedOrLeft)
                Text("Your current goal and protocols remain unchanged while you prepare what comes next.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        case .protocols:
            VStack(alignment: .leading, spacing: 10) {
                ForEach(reviews.indices, id: \.self) { index in
                    Button {
                        if reviews[index].disposition.requiresEditor {
                            onNavigate(.goalProtocolTransitionEdit(category: reviews[index].category.rawValue))
                        }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(reviews[index].category.label).physiqueOSFont(PhysiqueOSTypography.label14Heavy).foregroundStyle(PhysiqueOSTheme.textPrimary)
                                Text(reviews[index].disposition.label).physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                            }
                            Spacer()
                            if reviews[index].disposition.requiresEditor {
                                Image(systemName: reviews[index].edited ? "checkmark.circle.fill" : "chevron.right")
                                    .foregroundStyle(reviews[index].edited ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.textMuted)
                            }
                        }
                        .padding(12)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)
                    .disabled(!reviews[index].disposition.requiresEditor)
                }
            }
        case .routine:
            VStack(alignment: .leading, spacing: 8) {
                ForEach(reviews.filter { $0.disposition != .remove }) { review in
                    Label(review.category.label, systemImage: "checkmark.circle.fill")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        case .commitments:
            let prepared = reviews.filter { !$0.disposition.requiresEditor || $0.edited }
            VStack(alignment: .leading, spacing: 8) {
                Text("Derived only from prepared protocol drafts.").physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textMuted)
                ForEach(prepared) { review in
                    Text("• \(review.category.label) — \(review.disposition.label)")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        case .review:
            ProtocolBuilderReview(sections: [
                .init(label: "New goal", value: store.currentTransitionDraft().objectiveTitle),
                .init(label: "Guardrail", value: store.currentTransitionDraft().guardrails.first(where: \.accepted)?.title ?? "None selected"),
                .init(label: "How we'll start", value: "Maintenance calibration"),
                .init(label: "Briefing rhythm", value: store.currentTransitionDraft().cadence.label),
                .init(label: "Protocol outcomes", value: "\(reviews.filter { $0.disposition != .remove }.count) of \(reviews.count) carrying forward"),
            ], footer: "Nothing has been activated yet. Your current goal and its protocols remain unchanged.")
        }
    }

    private func summaryRow(_ label: String, _ count: Int) -> some View {
        HStack {
            Text(label).physiqueOSFont(PhysiqueOSTypography.label14Heavy).foregroundStyle(PhysiqueOSTheme.textPrimary)
            Spacer()
            Text("\(count)").physiqueOSFont(PhysiqueOSTypography.label14Heavy).foregroundStyle(PhysiqueOSTheme.accent)
        }
        .padding(12)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
