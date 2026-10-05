import SwiftUI

/// A single canonical exercise's detail/history page
/// (`/progress/training/library/:area/:exercise`) — mirrors
/// `getExerciseDetailContent` (`TrainingKnowledgeScreen.jsx:1154-1199`)
/// exactly: `TrainingLibraryHeaderView` (shared with `TrainingAreaView`) →
/// the shared Goal/Phase scope selector → Current Benchmark → Performance
/// Records → Last Session → Recent History. The selector genuinely re-scopes
/// this page (re-verified against source for this task's Training Library
/// pass): `getPlaceholderReport("training", ..., { dateWindow })` filters
/// sessions by the selected Goal/Phase window *before*
/// `getExerciseOccurrences` ever runs, so Current Benchmark/Last Session/
/// Recent History all narrow with it — `TrainingExerciseDetailViewModel
/// .selectScope` now re-fetches on selection rather than leaving the
/// selector inert, matching every other Evidence vertical's pattern (a
/// prior pass here left it display-only; corrected in this one). The web's
/// sixth section, a "Source workouts" metadata footer,
/// is deliberately not reproduced here — `page.js:84` passes
/// `showSourceWorkouts: false` on the real `/progress/training/library/...`
/// route, so it never renders there either. Performance Records
/// (`ExercisePerformanceRecordsCard`) is a pure presentation layer over
/// already-detected PR events (`TrainingPerformanceRecordsCalculator`
/// ports `createTrainingLibraryExerciseRecordsReadModel` exactly); it is
/// omitted entirely (not shown empty) whenever there are no qualifying
/// events for this exercise, matching the web's own `null`-model behavior.
///
/// History rows are inline-expand accordions, not navigation links: the
/// web's own `ExerciseHistoryCard` renders a plain `<details>/<summary>`
/// per occurrence with no `href` anywhere, confirmed directly from source
/// — tapping a historical occurrence on this page reveals its set table in
/// place, it does not push to Workout Detail or Training Day.
struct TrainingExerciseDetailView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: TrainingExerciseDetailViewModel?
    @State private var viewModelAuthority: NativeAPIEnvironment?
    @State private var expandedHistoryOccurrenceIds: Set<String> = []
    let exerciseId: String

    private let m = EvidenceMetrics(family: .training)

    var body: some View {
        EvidenceScrollPage {
            content
        }
        .evidencePageChrome(viewModel?.loadedExercise?.title ?? "Exercise")
        .evidenceFamily(.training)
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = TrainingExerciseDetailViewModel(api: environment.trainingAPI, exerciseId: exerciseId)
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStatePanel(kind: .loading("Loading Training Evidence"), identifier: "training.exercise.loading")
        case .failed(let message):
            EvidenceStatePanel(kind: .failure(message, nil), identifier: "training.exercise.failure")
        case .loaded(.none):
            EvidenceStatePanel(kind: .empty("This exercise could not be found.", "Not-found stays separate from empty benchmark or history."), identifier: "training.exercise.notFound")
        case .loaded(.some(let exercise)):
            TrainingLibraryHeaderView(title: exercise.title, breadcrumbs: exercise.breadcrumbs)
            EvidenceScopePicker(scope: exercise.scope) { pillID in
                Task { await viewModel?.selectScope(pillID: pillID) }
            }
            benchmarkSection(exercise.benchmark)
            performanceRecordsSection(exercise.performanceRecords)
            lastSessionSection(exercise.lastSession)
            historySection(exercise.history)
        }
    }

    // MARK: - Current Benchmark (analytical field)

    private func benchmarkSection(_ benchmark: TrainingExerciseBenchmark?) -> some View {
        EvidenceSection(style: .analytical, identifier: "training.exercise.benchmark") {
            VStack(alignment: .leading, spacing: 0) {
                eyebrowTitle("Today's Target", "Current Benchmark", tint: m.c.teal)
                if let benchmark {
                    EvidenceMetricGrid(items: [
                        .init(label: "Best Set", value: benchmark.bestSet),
                        .init(label: "Last Session", value: benchmark.lastSessionDate),
                        .init(label: "Working Weight", value: benchmark.workingWeight),
                    ])
                    .padding(.top, m.pt(8))
                    if let comparison = benchmark.comparison {
                        EvidenceCallout(text: comparison, tone: Self.calloutTone(benchmark.tone))
                            .padding(.top, m.pt(8))
                    }
                } else {
                    Text("No matching history yet.")
                        .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                        .foregroundStyle(m.c.muted)
                        .padding(.top, m.pt(8))
                }
            }
        }
    }

    private static func calloutTone(_ tone: TrainingExerciseBenchmark.Tone) -> EvidenceCallout.Tone {
        switch tone {
        case .newBest: .success
        case .matched: .stable
        case .belowOrUnknown: .warning
        }
    }

    private func eyebrowTitle(_ eyebrow: String, _ title: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(eyebrow.uppercased())
                .evidenceText(EvidenceTextStyle(size: 9, weight: 850, lineHeight: 10.8, tracking: 1.26, uppercase: true))
                .foregroundStyle(tint)
            Text(title)
                .evidenceText(.normal(14, 800, tracking: -0.14))
                .foregroundStyle(m.c.ink)
                .padding(.top, m.pt(6))
                .accessibilityAddTraits(.isHeader)
        }
    }

    // MARK: - Performance Records (current, durable; omitted when absent)

    @ViewBuilder
    private func performanceRecordsSection(_ model: TrainingPerformanceRecordsReadModel?) -> some View {
        if let model {
            EvidenceSection(identifier: "training.exercise.records") {
                VStack(alignment: .leading, spacing: 0) {
                    eyebrowTitle("Durable Achievements", model.heading, tint: m.c.green)
                    ForEach(Array(model.records.enumerated()), id: \.element.id) { index, record in
                        VStack(alignment: .leading, spacing: 0) {
                            HStack(alignment: .firstTextBaseline, spacing: m.pt(10)) {
                                Text(record.title)
                                    .evidenceText(.normal(11, 800))
                                    .foregroundStyle(m.c.ink)
                                Spacer(minLength: 0)
                                Text(TrainingDateFormatting.short(record.workoutDate))
                                    .evidenceText(.normal(9, 400))
                                    .foregroundStyle(m.c.quiet)
                            }
                            if let variant = record.executionVariant {
                                Text("Variant: \(variant.label)")
                                    .evidenceText(.normal(9, 750))
                                    .foregroundStyle(m.c.purple)
                            }
                            Text(record.value)
                                .evidenceText(.normal(16, 850, tracking: -0.32))
                                .foregroundStyle(m.c.green)
                                .padding(.top, m.pt(3))
                            if let detail = record.detail {
                                Text(detail)
                                    .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.6))
                                    .foregroundStyle(m.c.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .padding(.top, m.pt(2))
                            }
                        }
                        .padding(.vertical, m.pt(10))
                        .overlay(alignment: .top) {
                            if index > 0 { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
                        }
                        .accessibilityElement(children: .combine)
                    }
                    if let countLabel = model.countLabel {
                        EvidenceSmallNote(text: countLabel)
                    }
                }
            }
        }
    }

    // MARK: - Last Session

    private func lastSessionSection(_ occurrence: TrainingExerciseHistoryOccurrence?) -> some View {
        EvidenceSection(title: "Last Session", style: .open, identifier: "training.exercise.lastSession") {
            if let occurrence {
                VStack(alignment: .leading, spacing: 0) {
                    contextLabels(for: occurrence)
                    EvidenceMetricGrid(items: lastSessionMetrics(occurrence))
                    if !occurrence.exercise.sets.isEmpty {
                        TrainingExerciseSetTableView(sets: occurrence.exercise.sets)
                            .padding(.top, m.pt(8))
                    }
                }
            } else {
                Text("No matching history yet.")
                    .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                    .foregroundStyle(m.c.muted)
            }
        }
    }

    private func lastSessionMetrics(_ occurrence: TrainingExerciseHistoryOccurrence) -> [EvidenceMetricGrid.Item] {
        var items: [EvidenceMetricGrid.Item] = [
            .init(label: "Volume", value: TrainingExerciseHistoryCalculator.formattedVolume(TrainingExerciseHistoryCalculator.volume(of: occurrence.exercise.sets))),
        ]
        if let best = TrainingExerciseHistoryCalculator.bestSet(in: occurrence.exercise.sets) {
            items.append(.init(label: "Best Set", value: best.glance))
        }
        items.append(.init(label: "Sets", value: "\(occurrence.exercise.sets.count)"))
        return items
    }

    @ViewBuilder
    private func contextLabels(for occurrence: TrainingExerciseHistoryOccurrence) -> some View {
        if occurrence.exercise.executionVariant != nil {
            Text(occurrence.exercise.occurrenceLabel)
                .evidenceText(.normal(9, 750))
                .foregroundStyle(m.c.purple)
                .padding(.leading, m.pt(3))
                .padding(.bottom, m.pt(8))
        }
        if let relationship = occurrence.relationship {
            Text(relationship.label)
                .evidenceText(.normal(9, 750))
                .foregroundStyle(m.c.purple)
                .padding(.leading, m.pt(3))
                .padding(.bottom, m.pt(8))
        }
    }

    // MARK: - Recent History (read-only disclosure rows)

    private func historySection(_ occurrences: [TrainingExerciseHistoryOccurrence]) -> some View {
        EvidenceSection(title: "Recent History", style: .open, identifier: "training.exercise.history") {
            if occurrences.isEmpty {
                Text("Future sets will appear here.")
                    .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                    .foregroundStyle(m.c.muted)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(occurrences.enumerated()), id: \.element.id) { index, occurrence in
                        let expanded = expandedHistoryOccurrenceIds.contains(occurrence.id)
                        let previousExpanded = index > 0 && expandedHistoryOccurrenceIds.contains(occurrences[index - 1].id)
                        TrainingExerciseHistoryRowView(occurrence: occurrence, isExpanded: expanded) {
                            if expanded {
                                expandedHistoryOccurrenceIds.remove(occurrence.id)
                            } else {
                                expandedHistoryOccurrenceIds.insert(occurrence.id)
                            }
                        }
                        .overlay(alignment: .top) {
                            if index > 0, !expanded, !previousExpanded { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
                        }
                    }
                }
            }
        }
    }
}

extension TrainingExerciseDetailViewModel {
    var loadedExercise: TrainingExerciseDetailReadModel? {
        if case .loaded(let exercise) = state { return exercise }
        return nil
    }
}

// MARK: - Shared small pieces

/// The locked set table: `SET / REPS / LOAD` header, then canonical rows.
private struct TrainingExerciseSetTableView: View {
    let sets: [TrainingSet]
    private let m = EvidenceMetrics(family: .training)

    var body: some View {
        if sets.isEmpty {
            Text("Details pending.")
                .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                .foregroundStyle(m.c.muted)
        } else {
            VStack(spacing: 0) {
                EvidenceSetRow(first: "Set", second: "Reps", third: "Load", isHeader: true)
                ForEach(sets) { set in
                    EvidenceSetRow(first: "\(set.setNumber)", second: set.repsColumnText, third: set.formattedLoad)
                }
            }
        }
    }
}

/// Collapsed: an open row (date badge, context, meta, `›`). Expanded: the
/// same row inside a surface field with `⌄` and the set table below.
private struct TrainingExerciseHistoryRowView: View {
    let occurrence: TrainingExerciseHistoryOccurrence
    let isExpanded: Bool
    let onToggle: () -> Void
    private let m = EvidenceMetrics(family: .training)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onToggle) {
                HStack(spacing: m.pt(10)) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(TrainingExerciseHistoryCalculator.sessionBadge(for: occurrence.sessionDate))
                            .evidenceText(EvidenceTextStyle(size: 12, weight: 760, lineHeight: 15.84))
                            .foregroundStyle(m.c.ink)
                        if occurrence.exercise.executionVariant != nil {
                            Text(occurrence.exercise.occurrenceLabel)
                                .evidenceText(.normal(9, 750))
                                .foregroundStyle(m.c.purple)
                                .lineLimit(1)
                        }
                        if let relationship = occurrence.relationship {
                            Text(relationship.label)
                                .evidenceText(.normal(9, 750))
                                .foregroundStyle(m.c.purple)
                                .lineLimit(1)
                        }
                        Text(TrainingExerciseHistoryCalculator.historyMeta(for: occurrence.exercise.sets))
                            .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                            .foregroundStyle(m.c.muted)
                            .lineLimit(1)
                            .padding(.top, m.pt(2))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text(isExpanded ? "⌄" : "›")
                        .evidenceText(EvidenceTextStyle(size: 17, weight: 400, lineHeight: 17))
                        .foregroundStyle(m.c.purple)
                }
                .padding(.horizontal, m.pt(5))
                .padding(.vertical, m.pt(9))
                .frame(minHeight: max(44, m.pt(48)))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(.isButton)
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")
            .accessibilityIdentifier("training.exercise.history.\(occurrence.id)")

            if isExpanded {
                TrainingExerciseSetTableView(sets: occurrence.exercise.sets)
            }
        }
        .padding(isExpanded ? m.pt(10) : 0)
        .background(isExpanded ? m.c.surface2 : .clear, in: RoundedRectangle(cornerRadius: m.pt(11)))
    }
}
