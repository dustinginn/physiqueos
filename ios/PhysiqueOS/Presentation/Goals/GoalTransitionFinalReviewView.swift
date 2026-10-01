import SwiftUI

/// `/goals/transition/review` (Route D of 5) —
/// `ProductionGoalTransitionFinalReview.jsx`. A single-use review token is
/// minted on appear (`createFinalReview`) and consumed by
/// `activateGoalTransition` — mirrors the real single-use, TTL-scoped
/// token's *intent* (the app is single-device/single-session, so the full
/// multi-actor token infrastructure the web needs is not reproduced).
struct GoalTransitionFinalReviewView: View {
    @Environment(AppEnvironment.self) private var environment
    let onNavigate: (AppDestination) -> Void

    @State private var token: GoalTransitionReviewToken?
    @State private var errorMessage: String?
    @State private var isActivating = false

    var body: some View {
        let store = environment.goalsSandboxStore
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                OperatingPlanScreenHeader(
                    eyebrow: "Final review",
                    title: "Activate \(store.currentTransitionDraft().objectiveTitle)",
                    subtitle: "This will complete your current goal and atomically activate the accepted goal, protocols, commitments, reminders, and coaching cadence."
                )
                if let token {
                    let summary = store.finalReviewSummary()
                    ProtocolBuilderReview(sections: [
                        .init(label: "Opening phase", value: summary.openingPhaseLabel),
                        .init(label: "Guardrail", value: summary.guardrailSummary),
                        .init(label: "Coaching cadence", value: summary.coachingCadenceSummary),
                        .init(label: "Protocols prepared", value: "\(summary.protocolsPreparedCount)"),
                        .init(label: "Commitments", value: summary.commitmentsSummary),
                        .init(label: "Reminder intents", value: summary.reminderIntentsSummary),
                    ], footer: "The review token expires shortly and can be used only once.")
                    if let errorMessage { OperatingPlanEditorErrorBanner(message: errorMessage) }
                    PrimaryActionButton(title: isActivating ? "Activating…" : "Confirm and activate", isEnabled: !isActivating) {
                        activate(store: store, token: token)
                    }
                    .accessibilityIdentifier("goalTransition.finalReview.confirm")
                } else {
                    GoalUnavailableView(message: "Finish the protocol review first.")
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { if token == nil { token = store.createFinalReview() } }
    }

    private func activate(store: GoalsSandboxStore, token: GoalTransitionReviewToken) {
        isActivating = true
        switch store.activateGoalTransition(reviewToken: token) {
        case .success:
            onNavigate(.goalTransitionSuccess)
        case .failure(let error):
            errorMessage = error.message
            isActivating = false
        }
    }
}

/// `/goals/transition/success` (Route E of 5).
struct GoalTransitionSuccessView: View {
    @Environment(AppEnvironment.self) private var environment
    let onNavigate: (AppDestination) -> Void

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "checkmark.seal.fill").font(.system(size: 48)).foregroundStyle(PhysiqueOSTheme.chartSuccess)
            Text("Goal transition committed").physiqueOSFont(PhysiqueOSTypography.screenTitle).foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text("\(environment.goalsSandboxStore.hub.activeGoal!.title) is active")
                .physiqueOSFont(PhysiqueOSTypography.cardHeading20).foregroundStyle(PhysiqueOSTheme.accent)
            Text("The accepted transition was saved as one atomic change.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                .multilineTextAlignment(.center)
            CardContainer {
                Text("Scheduler synchronization is pending. The committed goal transition is not affected, and no automatic retry was started.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            PrimaryActionButton(title: "Go to your new goal") {
                onNavigate(.goalDetail(goalId: environment.goalsSandboxStore.hub.activeGoal!.id))
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
    }
}
