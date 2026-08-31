import SwiftUI

struct GoalPhaseDetailView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: GoalPhaseDetailViewModel?

    let goalId: String
    let phaseId: String

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
                    Label("Goal", systemImage: "arrow.left")
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .task {
            if viewModel == nil {
                viewModel = GoalPhaseDetailViewModel(api: environment.goalsAPI, goalId: goalId, phaseId: phaseId)
            }
            await viewModel?.load()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 300)
        case .unavailable:
            GoalUnavailableView(message: "This phase is unavailable.")
        case .failed(let message):
            GoalUnavailableView(message: message)
        case .loaded(let detail):
            phaseContent(detail)
        }
    }

    private func phaseContent(_ detail: GoalPhaseDetailReadModel) -> some View {
        let phase = detail.phase
        let tint = phase.status == .completed ? PhysiqueOSTheme.chartEffort : PhysiqueOSTheme.chartSuccess
        return VStack(alignment: .leading, spacing: 22) {
            CardContainer(background: tint.opacity(0.10)) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Phase \(phase.order) · \(phase.status.label)")
                        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                        .foregroundStyle(tint)
                    Text(phase.name)
                        .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(phase.dates)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                    Text(phase.purpose)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    GoalProgressBlock(progress: phase.progress, color: tint, label: "Phase progress")
                }
            }

            GoalSection(eyebrow: "Phase evidence", title: "Evidence in View") {
                CardContainer { GoalLabeledBody(label: detail.goalTitle, text: phase.evidence) }
            }

            checklist(title: "Phase Strategy", eyebrow: "How this phase works", items: phase.strategy, tint: tint)
            checklist(title: "Success Criteria", eyebrow: "What completion requires", items: phase.successCriteria, tint: tint)
            checklist(title: "Guardrails", eyebrow: "What stays protected", items: phase.guardrails, tint: PhysiqueOSTheme.accent)

            GoalSection(eyebrow: "Distinct measures", title: "Goal Context") {
                CardContainer {
                    VStack(alignment: .leading, spacing: 16) {
                        GoalProgressBlock(progress: detail.goalProgress, color: PhysiqueOSTheme.accent, label: "Goal progress")
                        Divider().overlay(PhysiqueOSTheme.divider)
                        HStack {
                            GoalMetric(label: "Confidence", value: "\(detail.confidence.value)% · \(detail.confidence.band)")
                            GoalMetric(label: "Guardrail", value: detail.guardrail.state)
                        }
                    }
                }
            }
        }
    }

    private func checklist(title: String, eyebrow: String, items: [String], tint: Color) -> some View {
        GoalSection(eyebrow: eyebrow, title: title) {
            VStack(spacing: 9) {
                ForEach(items, id: \.self) { item in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(tint)
                        Text(item)
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }
}
