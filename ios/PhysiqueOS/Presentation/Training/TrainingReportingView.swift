import SwiftUI

/// `/progress/training/reporting/:reportId`, matching the current web
/// hierarchy and behavior: Resistance and History have real content;
/// Cardio, Volume, Frequency, and Consistency intentionally share the
/// current Foundation placeholder. Goal/Phase scope re-queries the fixture
/// read service so the report's underlying rows, PRs, and rollups change.
struct TrainingReportingView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: TrainingReportingViewModel?
    @State private var viewModelAuthority: NativeAPIEnvironment?
    @State private var selectedStatusGroup: TrainingResistanceStatusGroup?
    @State private var selectedAnalysisSheet: TrainingReportingAnalysisSheet?
    let reportId: String

    private let m = EvidenceMetrics(family: .training)

    var body: some View {
        EvidenceScrollPage {
            content
        }
        .evidencePageChrome(viewModel?.loadedReport?.title ?? "Reporting")
        .evidenceFamily(.training)
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = TrainingReportingViewModel(api: environment.trainingAPI, reportId: reportId)
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
        }
        .sheet(item: $selectedStatusGroup) { group in
            TrainingResistanceStatusSheet(group: group)
        }
        .sheet(item: $selectedAnalysisSheet) { sheet in
            TrainingReportingAnalysisSheetView(sheet: sheet)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStatePanel(kind: .loading("Loading Training Evidence"), identifier: "training.report.loading")
        case .failed(let message):
            EvidenceStatePanel(kind: .failure(message, nil), identifier: "training.report.failure")
        case .loaded(.none):
            EvidenceStatePanel(kind: .empty("This report could not be found.", nil), identifier: "training.report.notFound")
        case .loaded(.some(let report)):
            header(for: report)
            if report.placeholderBody == nil {
                EvidenceScopePicker(scope: report.scope) { pillID in
                    Task { await viewModel?.selectScope(pillID: pillID) }
                }
            }
            if let placeholderBody = report.placeholderBody {
                EvidencePlaceholder(title: "Foundation", detail: placeholderBody)
                    .accessibilityIdentifier("training.report.foundation")
            } else if let resistance = report.resistance {
                resistanceSections(resistance)
            } else if let days = report.historyDays {
                historySection(days.prefix(20).map {
                    TrainingReportHistoryRow(date: $0.date, label: $0.label, detail: TrainingDayView.formatSummary($0.summary), tone: Self.tone(for: $0.summary))
                })
            } else if let days = report.productionHistoryDays {
                historySection(days.prefix(20).map {
                    TrainingReportHistoryRow(date: $0.date, label: $0.label ?? TrainingDateFormatting.short($0.date), detail: $0.sessions.compactMap(\.label).joined(separator: ", "), tone: .neutral)
                })
            }
        }
    }

    private func header(for report: TrainingReportingReadModel) -> some View {
        var breadcrumbs = [
            TrainingBreadcrumb(label: "Training", destination: .progressStream(streamId: "training")),
            TrainingBreadcrumb(label: "Training Library", destination: .progressStream(streamId: "training/library")),
        ]
        if report.id == "history" {
            breadcrumbs.append(
                TrainingBreadcrumb(label: "Reporting", destination: .progressStream(streamId: "training"))
            )
        }
        return TrainingLibraryHeaderView(
            eyebrow: report.eyebrow,
            title: report.title,
            breadcrumbs: breadcrumbs,
            summary: report.summary
        )
    }

    // MARK: - Resistance

    @ViewBuilder
    private func resistanceSections(_ resistance: TrainingResistanceReportReadModel) -> some View {
        resistanceSummarySection(resistance.statusGroups)
        linkListSection(
            title: "Recent PRs",
            rows: resistance.recentPrs,
            emptyText: "No recent PRs yet.",
            previewLimit: 3,
            sheetTitle: "Recent PRs",
            sheetDescription: "All recent personal records in the current reporting order."
        )
        linkListSection(
            title: "Highlights",
            rows: resistance.highlights,
            emptyText: "No clear positive signals yet."
        )
        linkListSection(
            title: "Needs Attention",
            rows: resistance.needsAttention,
            emptyText: "No clear training concerns yet.",
            previewLimit: 3,
            sheetTitle: "Needs Attention",
            sheetDescription: "Exercises requiring review, with the latest supporting date."
        )
        linkListSection(
            title: "Category Rollups",
            rows: resistance.categoryRollups,
            emptyText: "Resistance category history will appear as exercises accumulate.",
            previewLimit: 3,
            sheetTitle: "All Categories",
            sheetDescription: "Choose a category to continue in the Training Library.",
            viewAllLabel: "View all categories →"
        )
        sourceLine()
    }

    /// `.status-grid`: label + count in the status's semantic color (text,
    /// not color alone); each opens its exercise sheet.
    private func resistanceSummarySection(_ groups: [TrainingResistanceStatusGroup]) -> some View {
        EvidenceSection(title: "Resistance Summary", identifier: "training.report.resistanceSummary") {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: m.pt(7)), GridItem(.flexible(), spacing: m.pt(7))], spacing: m.pt(7)) {
                ForEach(groups) { group in
                    Button {
                        selectedStatusGroup = group
                    } label: {
                        HStack(spacing: m.pt(8)) {
                            Text(group.label)
                            Spacer(minLength: 0)
                            Text("\(group.count)")
                        }
                        .evidenceText(.normal(10, 800))
                        .foregroundStyle(statusColor(group.tone))
                        .padding(m.pt(10))
                        .frame(maxWidth: .infinity)
                        .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(10)))
                        .evidenceHitTarget(visualHeight: m.pt(32))
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Shows exercises in this status group")
                    .accessibilityIdentifier("training.report.status.\(group.id)")
                }
            }
        }
    }

    private func statusColor(_ tone: TrainingResistanceStatusTone) -> Color {
        switch tone {
        case .success: m.c.green
        case .stable: m.c.teal
        case .warning: m.c.amber
        case .danger: m.c.red
        }
    }

    private func linkListSection(
        title: String,
        rows: [TrainingReportingLinkRow],
        emptyText: String,
        previewLimit: Int? = nil,
        sheetTitle: String? = nil,
        sheetDescription: String? = nil,
        viewAllLabel: String = "View all →"
    ) -> some View {
        let visibleRows = previewLimit.map { Array(rows.prefix($0)) } ?? rows
        let showsViewAll = previewLimit.map { rows.count > $0 } ?? false
        return EvidenceSection(title: title, style: .open, identifier: "training.report.\(title)") {
            if showsViewAll {
                Button {
                    selectedAnalysisSheet = TrainingReportingAnalysisSheet(
                        title: sheetTitle ?? title,
                        description: sheetDescription ?? "Select an exercise to review its training history.",
                        rows: rows
                    )
                } label: {
                    EvidenceSectionAction(label: viewAllLabel)
                }
                .buttonStyle(.plain)
            }
        } content: {
            if rows.isEmpty {
                Text(emptyText)
                    .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                    .foregroundStyle(m.c.muted)
            } else {
                EvidenceDividedList(data: visibleRows) { row in
                    NavigationLink(value: row.destination) {
                        EvidenceLinkRow(label: row.label, detail: row.detail)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    /// `.source-line`: the report's provenance, ruled above.
    private func sourceLine() -> some View {
        HStack {
            Text("Source")
                .evidenceText(.normal(9, 700))
                .foregroundStyle(m.c.quiet)
            Spacer(minLength: m.pt(8))
            Text("Training sessions")
                .evidenceText(.normal(9, 400))
                .foregroundStyle(m.c.muted)
        }
        .padding(.top, m.pt(9))
        .overlay(alignment: .top) { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
        // The report's Details row (the shipping section was titled
        // "Details"): read as "Details, Source, Training sessions".
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Details")
        .accessibilityValue("Source, Training sessions")
        .accessibilityAddTraits(.isStaticText)
    }

    // MARK: - History (up to 20 days, newest first)

    private func historySection(_ rows: [TrainingReportHistoryRow]) -> some View {
        EvidenceSection(title: "Recent Training History", style: .open, identifier: "training.report.history") {
            if rows.isEmpty {
                Text("Training days will appear here.")
                    .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                    .foregroundStyle(m.c.muted)
            } else {
                EvidenceDividedList(data: rows) { row in
                    NavigationLink(value: AppDestination.trainingDay(date: row.date)) {
                        EvidenceRailRow(label: row.label, detail: row.detail, tone: row.tone)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private static func tone(for summary: TrainingDaySummaryDetail) -> EvidenceRailTone {
        if summary.strengthSessions > 0 { return .strength }
        if summary.hasCardio { return .cardio }
        if summary.hasWalking { return .walking }
        return .neutral
    }
}

private struct TrainingReportHistoryRow: Identifiable {
    let date: String
    let label: String
    let detail: String
    let tone: EvidenceRailTone
    var id: String { date }
}

extension TrainingReportingViewModel {
    var loadedReport: TrainingReportingReadModel? {
        if case .loaded(let report) = state { return report }
        return nil
    }
}

// MARK: - Reporting sheets

private struct TrainingReportingAnalysisSheet: Identifiable {
    let id = UUID()
    let title: String
    let description: String
    let rows: [TrainingReportingLinkRow]
}

private struct TrainingReportingAnalysisSheetView: View {
    let sheet: TrainingReportingAnalysisSheet

    var body: some View {
        TrainingReportListSheet(title: sheet.title, description: sheet.description, rows: sheet.rows.map { ($0.id, $0.label, $0.detail, $0.destination) }, emptyText: nil)
    }
}

private struct TrainingResistanceStatusSheet: View {
    let group: TrainingResistanceStatusGroup

    var body: some View {
        TrainingReportListSheet(
            title: group.label,
            description: "\(group.label) exercises from current resistance-training analysis.",
            rows: group.items.map { ($0.id, $0.label, $0.detail, $0.destination) },
            emptyText: "No exercises in this group."
        )
    }
}

/// The locked open-list sheet used by every Resistance drill-in.
private struct TrainingReportListSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let description: String
    let rows: [(id: String, label: String, detail: String?, destination: AppDestination)]
    let emptyText: String?
    private let m = EvidenceMetrics(family: .training)

    private struct Row: Identifiable {
        let id: String
        let label: String
        let detail: String?
        let destination: AppDestination
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: m.pt(10)) {
                    Text(description)
                        .evidenceText(EvidenceTextStyle(size: 12, weight: 400, lineHeight: 17.04))
                        .foregroundStyle(m.c.muted)
                    if rows.isEmpty, let emptyText {
                        Text(emptyText)
                            .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                            .foregroundStyle(m.c.muted)
                    } else {
                        EvidenceDividedList(data: rows.map { Row(id: $0.id, label: $0.label, detail: $0.detail, destination: $0.destination) }) { row in
                            NavigationLink(value: row.destination) {
                                EvidenceLinkRow(label: row.label, detail: row.detail)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.horizontal, m.pt(16))
                .padding(.top, m.pt(10))
                .padding(.bottom, m.pt(30))
            }
            .background(m.c.page)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(m.c.page, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: {
                        Text("Done")
                            .evidenceText(.normal(13, 750))
                            .foregroundStyle(m.c.muted)
                            .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                .evidenceFlatToolbarItem()
                ToolbarItem(placement: .principal) {
                    Text(title)
                        .evidenceText(.normal(13, 750))
                        .foregroundStyle(m.c.ink)
                }
            }
            .navigationDestination(for: AppDestination.self) { AppDestinationRouterView(destination: $0) }
        }
        .environment(\.evidenceBackTrail, nil)
        .evidenceFamily(.training)
        .presentationDetents([.medium, .large])
    }
}
