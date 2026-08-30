import SwiftUI

/// A Training Reporting page (`/progress/training/reporting/:reportId`) —
/// mirrors `getReportingContent` (`TrainingKnowledgeScreen.jsx`) exactly.
/// `reportId` is one of 6 fixed values (`getTrainingReportingLinks()`):
/// **resistance** and **history** have real content; **cardio**,
/// **volume**, **frequency**, and **consistency** all render the
/// identical static "Foundation" placeholder card on the web today —
/// verified directly from source, not a native shortcut. Header,
/// breadcrumbs (`Training` → `Reporting`, both pointing back to the
/// Training landing page — confirmed from `page.js`'s own `navigation`
/// prop, not assumed), and the scope selector are shared across all 6.
struct TrainingReportingView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: TrainingReportingViewModel?
    @State private var selectedStatusGroup: TrainingResistanceStatusGroup?
    @State private var expandedHistoryDayDates: Set<String> = []
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
            if viewModel == nil { viewModel = TrainingReportingViewModel(api: environment.trainingAPI, reportId: reportId) }
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
            Text("This report could not be found.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.some(let report)):
            VStack(alignment: .leading, spacing: 16) {
                header(for: report)
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

    private func header(for report: TrainingReportingReadModel) -> some View {
        TrainingLibraryHeaderView(
            eyebrow: report.eyebrow,
            title: report.title,
            breadcrumbs: [
                TrainingBreadcrumb(label: "Training", destination: .progressStream(streamId: "training")),
                TrainingBreadcrumb(label: "Reporting", destination: .progressStream(streamId: "training")),
            ],
            summary: report.summary
        )
    }

    // MARK: - Cardio / Volume / Frequency / Consistency (identical placeholder)

    /// Verbatim text every one of these four report pages shows today —
    /// reproduced exactly, not shortened or reworded, since it is the
    /// real current web copy.
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
        linkListCard(title: "Recent PRs", rows: resistance.recentPrs, emptyText: "No PRs yet.")
        linkListCard(title: "Highlights", rows: resistance.highlights, emptyText: "No clear positive signals yet.")
        linkListCard(title: "Needs Attention", rows: resistance.needsAttention, emptyText: "Nothing needs attention right now.")
        linkListCard(title: "Category Rollups", rows: resistance.categoryRollups, emptyText: nil)
        CardContainer(padding: .sm) {
            HStack {
                Text("Source")
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                Spacer(minLength: 8)
                Text("Training sessions")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
        .sheet(item: $selectedStatusGroup) { group in
            TrainingResistanceStatusSheet(group: group)
        }
    }

    /// `StatusDrawers`: 4 fixed categories (Improving/Stable/Plateauing/
    /// Regressing), each a tappable tile showing its count; tapping opens
    /// a sheet listing that group's exercises with real navigation —
    /// mirroring `TrainingAnalysisDrawerGroup`'s bottom-sheet drill-down.
    private func resistanceSummaryCard(_ groups: [TrainingResistanceStatusGroup]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Resistance Summary")
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    ForEach(groups) { group in
                        Button {
                            selectedStatusGroup = group
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(group.label)
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                Text("\(group.count)")
                                    .physiqueOSFont(PhysiqueOSTypography.metricValue)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(PhysiqueOSTheme.surfaceMuted)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func linkListCard(title: String, rows: [TrainingReportingLinkRow], emptyText: String?) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: title)
                if rows.isEmpty {
                    if let emptyText {
                        Text(emptyText)
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                } else {
                    VStack(spacing: 8) {
                        ForEach(rows) { row in
                            NavigationLink(value: row.destination) {
                                TrainingLinkRow(label: row.label, detail: row.detail)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    // MARK: - History

    /// `TrainingDayHistoryCard`: up to 20 days, newest first (reusing the
    /// same `TrainingDayReadModel` order `fetchTrainingDay`/`TrainingDayView`
    /// already established), each an inline-expand accordion revealing
    /// that day's sessions — tapping a session is real navigation to
    /// Workout Detail, unlike the exercise-detail page's history rows.
    private func historyCard(_ days: [TrainingDayReadModel]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Recent Training History")
                if days.isEmpty {
                    Text("Training days will appear here.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 8) {
                        ForEach(days.prefix(20), id: \.date) { day in
                            TrainingReportingHistoryDayRow(
                                day: day,
                                isExpanded: expandedHistoryDayDates.contains(day.date)
                            ) {
                                if expandedHistoryDayDates.contains(day.date) {
                                    expandedHistoryDayDates.remove(day.date)
                                } else {
                                    expandedHistoryDayDates.insert(day.date)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Resistance Summary drill-down sheet

/// `TrainingAnalysisDrawerGroup`'s bottom sheet: the tapped status
/// category's exercises, each a real link to its Training Library page.
private struct TrainingResistanceStatusSheet: View {
    let group: TrainingResistanceStatusGroup

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 8) {
                    if group.items.isEmpty {
                        Text("No exercises in this category yet.")
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    } else {
                        ForEach(group.items) { item in
                            NavigationLink(value: item.destination) {
                                TrainingLinkRow(label: item.label, detail: item.detail)
                            }
                            .buttonStyle(.plain)
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

// MARK: - History day accordion row

private struct TrainingReportingHistoryDayRow: View {
    let day: TrainingDayReadModel
    let isExpanded: Bool
    let onToggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onToggle) {
                HStack(alignment: .top, spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(day.label)
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text(TrainingDayView.formatSummary(day.summary))
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
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
                    VStack(spacing: 8) {
                        ForEach(day.sessions) { session in
                            NavigationLink(value: session.destination) {
                                TrainingLinkRow(label: session.title, detail: session.detail)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.top, 10)
            }
        }
        .padding(12)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
