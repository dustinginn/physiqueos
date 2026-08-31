import SwiftUI

struct GoalStrategyView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: GoalStrategyViewModel?

    let goalId: String
    let focus: GoalPlanFocus

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
                viewModel = GoalStrategyViewModel(api: environment.goalsAPI, goalId: goalId, focus: focus)
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
            GoalUnavailableView(message: "This goal plan is unavailable.")
        case .failed(let message):
            GoalUnavailableView(message: message)
        case .loaded(let model):
            strategyContent(model)
        }
    }

    private func strategyContent(_ model: GoalStrategyReadModel) -> some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 7) {
                Text(model.focus == .strategy ? "Goal Strategy" : "Goal Protocols")
                    .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(model.goalTitle)
                    .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(model.objective)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }

            GoalSection(
                eyebrow: model.focus == .strategy ? "How the goal is supported" : "Current protocol support",
                title: model.focus == .strategy ? "Current Strategy" : "Active Protocol Categories"
            ) {
                VStack(spacing: 9) {
                    ForEach(model.items) { item in
                        CardContainer {
                            HStack(spacing: 12) {
                                Image(systemName: strategySymbol(item.label))
                                    .foregroundStyle(item.active ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.textMuted)
                                    .frame(width: 26)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(item.label)
                                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    Text("Goal support")
                                        .physiqueOSFont(PhysiqueOSTypography.goalProgressCaption)
                                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                                }
                                Spacer()
                                Text(item.active ? "Active" : "Not active")
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(item.active ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.textMuted)
                            }
                        }
                    }
                }
            }

            GoalAccentCard(tint: PhysiqueOSTheme.accent, eyebrow: "Non-negotiable", title: "Goal Guardrail") {
                VStack(alignment: .leading, spacing: 7) {
                    Text(model.guardrail.title)
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text("\(model.guardrail.state) · \(model.guardrail.scope)")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.accent)
                    Text(model.guardrail.body)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    private func strategySymbol(_ label: String) -> String {
        switch label {
        case "Energy": "bolt.fill"
        case "Nutrition": "fork.knife"
        case "Activity": "figure.walk"
        case "Training": "dumbbell.fill"
        case "Coaching Updates": "bubble.left.and.text.bubble.right.fill"
        case "Peptide": "cross.case.fill"
        case "Supplement": "pills.fill"
        default: "circle.grid.2x2.fill"
        }
    }
}
