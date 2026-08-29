import SwiftUI

/// A single canonical exercise's detail/history page
/// (`/progress/training/library/:area/:exercise`) — mirrors
/// `getExerciseDetailContent` (`TrainingKnowledgeScreen.jsx:1154-1199`)
/// exactly: `TrainingLibraryHeaderView` (shared with `TrainingAreaView`) →
/// the same inert scope selector every Training Library page shows →
/// Current Benchmark → Last Session → Recent History. The web's fifth
/// section, a "Source workouts" metadata footer, is deliberately not
/// reproduced here — `page.js:84` passes `showSourceWorkouts: false` on
/// the real `/progress/training/library/...` route, so it never renders
/// there either. A "Performance Records" card (`ExercisePerformanceRecordsCard`)
/// also exists on the web between Benchmark and Last Session, gated on a
/// separate PR-detection read model (`TrainingLibraryExerciseRecordsService`,
/// session-volume/reps-at-load records); it is not ported this slice — see
/// this slice's final report for the reasoning and its own tracked
/// decision.
///
/// History rows are inline-expand accordions, not navigation links: the
/// web's own `ExerciseHistoryCard` renders a plain `<details>/<summary>`
/// per occurrence with no `href` anywhere, confirmed directly from source
/// — tapping a historical occurrence on this page reveals its set table in
/// place, it does not push to Workout Detail or Training Day.
struct TrainingExerciseDetailView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: TrainingExerciseDetailViewModel?
    @State private var expandedHistoryOccurrenceIds: Set<String> = []
    let exerciseId: String

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .task {
            if viewModel == nil { viewModel = TrainingExerciseDetailViewModel(api: environment.trainingAPI, exerciseId: exerciseId) }
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
        case .loaded(.none):
            Text("This exercise could not be found.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.some(let exercise)):
            VStack(alignment: .leading, spacing: 16) {
                TrainingLibraryHeaderView(title: exercise.title, breadcrumbs: exercise.breadcrumbs)
                TrainingScopeSelectorView(scope: exercise.scope)
                benchmarkCard(exercise.benchmark)
                lastSessionCard(exercise.lastSession)
                historyCard(exercise.history)
            }
        }
    }

    // MARK: - Current Benchmark

    /// `CurrentExerciseBenchmarkCard` (`TrainingKnowledgeScreen.jsx:1279-1330`):
    /// a blue-tinted card, "Today's Target" eyebrow, "Current Benchmark"
    /// heading, three metric tiles, and a tone-colored comparison sentence.
    private func benchmarkCard(_ benchmark: TrainingExerciseBenchmark?) -> some View {
        CardContainer(background: PhysiqueOSTheme.chartEvidence.opacity(0.08)) {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Today's Target")
                        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                        .foregroundStyle(PhysiqueOSTheme.chartEvidence)
                    Text("Current Benchmark")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                }
                if let benchmark {
                    HStack(spacing: 8) {
                        TrainingExerciseMetricTile(label: "Best Set", value: benchmark.bestSet)
                        TrainingExerciseMetricTile(label: "Last Session", value: benchmark.lastSessionDate)
                        TrainingExerciseMetricTile(label: "Current Working Weight", value: benchmark.workingWeight)
                    }
                    if let comparison = benchmark.comparison {
                        Text(comparison)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(Self.toneColor(benchmark.tone))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Self.toneColor(benchmark.tone).opacity(0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .strokeBorder(Self.toneColor(benchmark.tone).opacity(0.3), lineWidth: 1)
                            )
                    }
                } else {
                    Text("No matching history yet.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    private static func toneColor(_ tone: TrainingExerciseBenchmark.Tone) -> Color {
        switch tone {
        case .newBest: PhysiqueOSTheme.accent
        case .matched: PhysiqueOSTheme.chartSuccess
        case .belowOrUnknown: PhysiqueOSTheme.chartEffort
        }
    }

    // MARK: - Last Session

    /// `LastExerciseSessionCard` (`TrainingKnowledgeScreen.jsx:1374-1400`).
    private func lastSessionCard(_ occurrence: TrainingExerciseHistoryOccurrence?) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 10) {
                TrainingSectionHeaderView(title: "Last Session")
                if let occurrence {
                    VStack(alignment: .leading, spacing: 8) {
                        contextLabels(for: occurrence)
                        HStack(spacing: 8) {
                            TrainingExerciseMetricTile(label: "Volume", value: TrainingExerciseHistoryCalculator.formattedVolume(TrainingExerciseHistoryCalculator.volume(of: occurrence.exercise.sets)))
                            if let best = TrainingExerciseHistoryCalculator.bestSet(in: occurrence.exercise.sets) {
                                TrainingExerciseMetricTile(label: "Best Set", value: best.glance)
                            }
                            TrainingExerciseMetricTile(label: "Sets", value: "\(occurrence.exercise.sets.count)")
                        }
                        TrainingExerciseSetTableView(sets: occurrence.exercise.sets)
                    }
                } else {
                    Text("No matching history yet.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    /// The optional variant line (`"Bench Press · Static Hold"`) and
    /// optional superset line (`"Superset with Cable Fly"`) shown above an
    /// occurrence's metrics — `formatTrainingExerciseOccurrenceLabel` +
    /// `formatRelationshipContext`, both only rendered when they apply.
    @ViewBuilder
    private func contextLabels(for occurrence: TrainingExerciseHistoryOccurrence) -> some View {
        if occurrence.exercise.executionVariant != nil {
            Text(occurrence.exercise.occurrenceLabel)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.accent)
        }
        if let relationship = occurrence.relationship {
            Text(relationship.label)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.accent)
        }
    }

    // MARK: - Recent History

    /// `ExerciseHistoryCard` (`TrainingKnowledgeScreen.jsx:1416-1460`): up
    /// to 10 occurrences, newest first, each an inline-expand row — not a
    /// navigation link (see this file's top doc comment).
    private func historyCard(_ occurrences: [TrainingExerciseHistoryOccurrence]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Recent History")
                if occurrences.isEmpty {
                    Text("Future sets will appear here.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 8) {
                        ForEach(occurrences) { occurrence in
                            TrainingExerciseHistoryRowView(
                                occurrence: occurrence,
                                isExpanded: expandedHistoryOccurrenceIds.contains(occurrence.id)
                            ) {
                                if expandedHistoryOccurrenceIds.contains(occurrence.id) {
                                    expandedHistoryOccurrenceIds.remove(occurrence.id)
                                } else {
                                    expandedHistoryOccurrenceIds.insert(occurrence.id)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Shared small pieces

/// `BenchmarkMetric`/`MetricGroup`'s tile — a small labeled value box
/// reused by both the Benchmark card and the Last Session card.
private struct TrainingExerciseMetricTile: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.metricLabel)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.metricValue)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

/// `SessionBadge` — a small pill showing "Today"/"Yesterday"/"Mon D".
private struct TrainingSessionBadgeView: View {
    let date: String

    var body: some View {
        Text(TrainingExerciseHistoryCalculator.sessionBadge(for: date))
            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
            .foregroundStyle(PhysiqueOSTheme.textSecondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(PhysiqueOSTheme.surfaceMuted)
            .clipShape(Capsule())
    }
}

/// `ExerciseSetList` (`TrainingKnowledgeScreen.jsx:1476-1502`): a compact
/// 3-column table (Set / Reps / Load), not the "Set N: ..." sentence form
/// Workout Detail uses — the web keeps these as two distinct set-list
/// renderers for two different screens, and so does this port.
private struct TrainingExerciseSetTableView: View {
    let sets: [TrainingSet]

    var body: some View {
        if sets.isEmpty {
            Text("Details pending.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        } else {
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 6) {
                GridRow {
                    Text("Set")
                    Text("Reps").gridColumnAlignment(.trailing)
                    Text("Load").gridColumnAlignment(.trailing)
                }
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)

                ForEach(sets) { set in
                    GridRow {
                        Text("\(set.setNumber)")
                        Text(set.repsColumnText).gridColumnAlignment(.trailing)
                        Text(set.formattedLoad).gridColumnAlignment(.trailing)
                    }
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                }
            }
        }
    }
}

/// One `ExerciseHistoryCard` row: a `SessionBadge` + optional variant/
/// superset label + meta line, tap-to-expand into the full set table —
/// mirroring the web's `<details>/<summary>` accordion, using the same
/// manual-toggle convention already established for Latest Training Day
/// (`TrainingHistoryView.swift`'s disclosure pattern) rather than
/// SwiftUI's `DisclosureGroup`.
private struct TrainingExerciseHistoryRowView: View {
    let occurrence: TrainingExerciseHistoryOccurrence
    let isExpanded: Bool
    let onToggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onToggle) {
                HStack(alignment: .top, spacing: 8) {
                    TrainingSessionBadgeView(date: occurrence.sessionDate)
                    VStack(alignment: .leading, spacing: 2) {
                        if occurrence.exercise.executionVariant != nil {
                            Text(occurrence.exercise.occurrenceLabel)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.accent)
                                .lineLimit(1)
                        }
                        if let relationship = occurrence.relationship {
                            Text(relationship.label)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.accent)
                                .lineLimit(1)
                        }
                        Text(TrainingExerciseHistoryCalculator.historyMeta(for: occurrence.exercise.sets))
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(PhysiqueOSTheme.accent)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(.isButton)
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")

            if isExpanded {
                VStack(alignment: .leading, spacing: 8) {
                    Divider().overlay(PhysiqueOSTheme.divider)
                    TrainingExerciseSetTableView(sets: occurrence.exercise.sets)
                }
                .padding(.top, 10)
            }
        }
        .padding(12)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
