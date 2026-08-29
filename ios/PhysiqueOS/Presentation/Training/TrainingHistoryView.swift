import SwiftUI

/// The Training evidence list/hub (`/progress/training`), reached from the
/// Evidence tab's Training row — the first complete evidence vertical:
/// list/history → Training Day → TrainingSession detail. Mirrors
/// `TrainingEvidenceReport`'s "Training Overview" / "Training
/// Understanding" summary stats and "Recent Training History" day list
/// (`src/screens/ProgressPlaceholderScreen.jsx`). The list page's own
/// "Training Areas" muscle-group grid and per-goal timeline selector are
/// deliberately out of scope — this slice implements the coherent
/// list → day → session read path the task requires, not every Training
/// Library/Reporting sub-surface.
///
/// Always pushed inside an existing `NavigationStack` (via
/// `AppDestinationRouterView`), so day rows use `NavigationLink(value:)`
/// to continue pushing onto that same stack's path rather than needing
/// their own `onNavigate` closure.
struct TrainingHistoryView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: TrainingHistoryViewModel?

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationTitle("Training")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .task {
            if viewModel == nil { viewModel = TrainingHistoryViewModel(api: environment.trainingAPI) }
            await viewModel?.load()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            ProgressView()
                .tint(PhysiqueOSTheme.accent)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .failed(let message):
            Text(message)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(let history) where history.trainingDays.isEmpty:
            Text("No training evidence yet.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(let history):
            VStack(alignment: .leading, spacing: 16) {
                statsCard(title: "Training Overview", stats: history.trainingOverview)
                statsCard(title: "Training Understanding", stats: history.trainingUnderstanding)

                VStack(alignment: .leading, spacing: 8) {
                    SectionHeading("Training History")
                    VStack(spacing: 8) {
                        ForEach(history.trainingDays) { day in
                            NavigationLink(value: day.destination) {
                                TrainingDayRowView(day: day)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private func statsCard(title: String, stats: [TrainingStat]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading(title)
                HStack(spacing: 16) {
                    ForEach(stats) { stat in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(stat.value)
                                .physiqueOSFont(PhysiqueOSTypography.metricValue)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text(stat.label)
                                .physiqueOSFont(PhysiqueOSTypography.metricLabel)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }
}

private struct TrainingDayRowView: View {
    let day: TrainingDaySummary

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(day.label)
                    .physiqueOSFont(PhysiqueOSTypography.rowSummary)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(day.summary)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textMuted)
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 56)
        .frame(maxWidth: .infinity)
        .background(PhysiqueOSTheme.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(PhysiqueOSTheme.divider, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}
