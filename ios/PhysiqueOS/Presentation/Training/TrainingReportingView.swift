import SwiftUI

/// `/progress/training/reporting/:reportId`, matching the current web
/// hierarchy and behavior: Resistance and History have real content;
/// Cardio, Volume, Frequency, and Consistency intentionally share the
/// current Foundation placeholder. Goal/date scope remains the accepted
/// inert fixture snapshot rather than fake client-side filtering.
struct TrainingReportingView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: TrainingReportingViewModel?
    @State private var selectedStatusGroup: TrainingResistanceStatusGroup?
    @State private var selectedAnalysisSheet: TrainingReportingAnalysisSheet?
    let reportId: String

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
            if viewModel == nil {
                viewModel = TrainingReportingViewModel(api: environment.trainingAPI, reportId: reportId)
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
            ProgressView()
                .tint(PhysiqueOSTheme.accent)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .failed(let message):
            Text(message)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.none):
            Text("This report could not be found.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.some(let report)):
            VStack(alignment: .leading, spacing: 16) {
                header(for: report)
                TrainingScopeSelectorView(scope: report.scope)
                if let placeholderBody = report.placeholderBody {
                    foundationCard(placeholderBody)
                } else if let resistance = report.resistance {
                    resistanceSections(resistance)
                } else if let days = report.historyDays {
                    historyCard(days)
                }
            }
        }
    }

    /// `TrainingReportingHeader`: Training and Training Library are always
    /// present; only Training History also shows the Reporting parent.
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

    // MARK: - Cardio / Volume / Frequency / Consistency

    private func foundationCard(_ body: String) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 8) {
                Text("Foundation")
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(body)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    // MARK: - Resistance

    @ViewBuilder
    private func resistanceSections(_ resistance: TrainingResistanceReportReadModel) -> some View {
        resistanceSummaryCard(resistance.statusGroups)
        linkListCard(
            title: "Recent PRs",
            rows: resistance.recentPrs,
            emptyText: "No recent PRs yet.",
            previewLimit: 3,
            sheetTitle: "Recent PRs",
            sheetDescription: "All recent personal records in the current reporting order."
        )
        linkListCard(
            title: "Highlights",
            rows: resistance.highlights,
            emptyText: "No clear positive signals yet."
        )
        linkListCard(
            title: "Needs Attention",
            rows: resistance.needsAttention,
            emptyText: "No clear training concerns yet.",
            previewLimit: 3,
            sheetTitle: "Needs Attention",
            sheetDescription: "Exercises requiring review, with the latest supporting date."
        )
        linkListCard(
            title: "Category Rollups",
            rows: resistance.categoryRollups,
            emptyText: "Resistance category history will appear as exercises accumulate.",
            previewLimit: 3,
            sheetTitle: "All Categories",
            sheetDescription: "Choose a category to continue in the Training Library.",
            viewAllLabel: "View all categories →"
        )
        detailsCard()
    }

    private func resistanceSummaryCard(_ groups: [TrainingResistanceStatusGroup]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Resistance Summary")
                LazyVGrid(
                    columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)],
                    spacing: 8
                ) {
                    ForEach(groups) { group in
                        Button {
                            selectedStatusGroup = group
                        } label: {
                            HStack(spacing: 8) {
                                Text(group.label)
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                Spacer(minLength: 4)
                                Text("\(group.count)")
                                    .physiqueOSFont(PhysiqueOSTypography.metricValue)
                            }
                            .foregroundStyle(statusColor(group.tone))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .frame(maxWidth: .infinity, minHeight: 56)
                            .background(statusColor(group.tone).opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .strokeBorder(statusColor(group.tone).opacity(0.24), lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("Shows exercises in this status group")
                    }
                }
            }
        }
    }

    private func statusColor(_ tone: TrainingResistanceStatusTone) -> Color {
        switch tone {
        case .success: PhysiqueOSTheme.chartSuccess
        case .stable: PhysiqueOSTheme.chartEvidence
        case .warning: PhysiqueOSTheme.chartEffort
        case .danger: PhysiqueOSTheme.destructive
        }
    }

    private func linkListCard(
        title: String,
        rows: [TrainingReportingLinkRow],
        emptyText: String,
        previewLimit: Int? = nil,
        sheetTitle: String? = nil,
        sheetDescription: String? = nil,
        viewAllLabel: String = "View all →"
    ) -> some View {
        let visibleRows = previewLimit.map { Array(rows.prefix($0)) } ?? rows
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: title)
                if rows.isEmpty {
                    Text(emptyText)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 0) {
                        ForEach(visibleRows) { row in
                            NavigationLink(value: row.destination) {
                                TrainingLinkRow(label: row.label, detail: row.detail)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    if let previewLimit, rows.count > previewLimit {
                        Button {
                            selectedAnalysisSheet = TrainingReportingAnalysisSheet(
                                title: sheetTitle ?? title,
                                description: sheetDescription ?? "Select an exercise to review its training history.",
                                rows: rows
                            )
                        } label: {
                            Text(viewAllLabel)
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.accent)
                                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func detailsCard() -> some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 10) {
                TrainingSectionHeaderView(title: "Details")
                Divider().overlay(PhysiqueOSTheme.divider)
                HStack {
                    Text("Source")
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    Spacer(minLength: 8)
                    Text("Training sessions")
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
            }
        }
    }

    // MARK: - History

    /// Current web `TrainingDayHistoryCard`: up to 20 day rows, each a
    /// direct link to Training Day. Session drill-down happens from there.
    private func historyCard(_ days: [TrainingDayReadModel]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Recent Training History")
                if days.isEmpty {
                    Text("Training days will appear here.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 0) {
                        ForEach(days.prefix(20), id: \.date) { day in
                            NavigationLink(value: AppDestination.trainingDay(date: day.date)) {
                                TrainingLinkRow(
                                    label: day.label,
                                    detail: TrainingDayView.formatSummary(day.summary)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
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
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(sheet.description)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    VStack(spacing: 0) {
                        ForEach(sheet.rows) { row in
                            NavigationLink(value: row.destination) {
                                TrainingLinkRow(label: row.label, detail: row.detail)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(16)
            }
            .background(PhysiqueOSTheme.background)
            .navigationTitle(sheet.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
            .navigationDestination(for: AppDestination.self) { AppDestinationRouterView(destination: $0) }
        }
        .presentationDetents([.medium, .large])
    }
}

private struct TrainingResistanceStatusSheet: View {
    let group: TrainingResistanceStatusGroup

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("\(group.label) exercises from current resistance-training analysis.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    if group.items.isEmpty {
                        Text("No exercises in this group.")
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(group.items) { item in
                                NavigationLink(value: item.destination) {
                                    TrainingLinkRow(label: item.label, detail: item.detail)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding(16)
            }
            .background(PhysiqueOSTheme.background)
            .navigationTitle(group.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
            .navigationDestination(for: AppDestination.self) { AppDestinationRouterView(destination: $0) }
        }
        .presentationDetents([.medium, .large])
    }
}
