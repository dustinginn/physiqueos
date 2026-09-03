import Charts
import SwiftUI

/// The Weight Evidence page (`/progress/weight`), reached from the
/// Evidence tab's Weight row. Unlike every other ported Evidence vertical,
/// the web has genuinely **one single page** for Weight — no separate
/// history sheet, no day-detail route, no clickable history rows
/// (verified directly from source: `WeightReportScreen.jsx`'s history rows
/// are plain `<div>`s). Section order mirrors that page exactly:
///
/// header → scope selector (Build Lean Mass / Visible Abs / All Weight) →
/// 4 summary cards (semantics depend on scope — see
/// `WeightEvidenceCalculator`) → Weight Trend chart (with DEXA markers) →
/// Weekly Averages (collapsible, preview 3) → Weight History (collapsible,
/// preview 3) → Data Sources.
///
/// Deliberately absent, matching the live product exactly (not omissions):
/// no day/detail navigation, no moving (3-day/7-day) averages — confirmed
/// not live anywhere on this page during this port's audit — no streaks,
/// no Related Goals (both test-enforced absent on web).
struct WeightHistoryView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: WeightHistoryViewModel?
    @State private var isWeeklyAveragesExpanded = false
    @State private var isHistoryExpanded = false

    static let previewLimit = 3

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
                Button {
                    dismiss()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.left")
                            .font(.system(size: 13, weight: .semibold))
                        Text("Evidence Hub")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    }
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .task {
            if viewModel == nil { viewModel = WeightHistoryViewModel(api: environment.weightEvidenceAPI) }
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
        case .loaded(let report):
            VStack(alignment: .leading, spacing: 16) {
                header(for: report)
                TrainingScopeSelectorView(scope: report.scope) { scopeID in
                    Task { await viewModel?.selectScope(pillID: scopeID) }
                }
                summaryGrid(report.summary)
                trendCard(report.chart)
                weeklyAveragesCard(report.weeklyAverages)
                historyCard(report.history)
                DataSourcesFooterView(items: report.dataSources)
            }
        }
    }

    private func header(for report: WeightReportReadModel) -> some View {
        HStack(alignment: .top, spacing: 12) {
            IconBadge(systemImage: "list.clipboard.fill", color: .evidence, size: .lg, isCircular: true)
            VStack(alignment: .leading, spacing: 4) {
                Text("Evidence Report")
                    .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(report.title)
                    .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(report.subtitle)
                    .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// 4 cards, 2 columns — `report.summary`'s labels/values already carry
    /// the correct per-scope semantics (see `WeightEvidenceCalculator`);
    /// this view only lays them out.
    private func summaryGrid(_ cards: [WeightSummaryCard]) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            ForEach(cards) { card in
                VStack(alignment: .leading, spacing: 2) {
                    Text(card.label)
                        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                    Text(card.value)
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(PhysiqueOSTheme.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(card.label): \(card.value)")
            }
        }
    }

    private func trendCard(_ chart: WeightChartData) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Weight Trend")
                WeightTrendChartView(chart: chart)
            }
        }
    }

    private func weeklyAveragesCard(_ weeks: [WeightWeeklyAverage]) -> some View {
        let preview = Array(weeks.prefix(Self.previewLimit))
        return CardContainer {
            EvidenceDisclosureRow(isExpanded: $isWeeklyAveragesExpanded) {
                TrainingSectionHeaderView(title: "Weekly Averages")
            } expanded: {
                if weeks.isEmpty {
                    Text("More history needed to compute weekly averages.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 6) {
                        ForEach(isWeeklyAveragesExpanded ? weeks : preview) { week in
                            WeeklyAverageRow(week: week)
                        }
                    }
                }
            }
        }
    }

    private func historyCard(_ history: [WeightHistoryEntry]) -> some View {
        let preview = Array(history.prefix(Self.previewLimit))
        return CardContainer {
            EvidenceDisclosureRow(isExpanded: $isHistoryExpanded) {
                TrainingSectionHeaderView(title: "Weight History")
            } expanded: {
                if history.isEmpty {
                    Text("Weight history will appear as weigh-ins are logged or connected.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 6) {
                        ForEach(isHistoryExpanded ? history : preview) { entry in
                            WeightHistoryRow(entry: entry)
                        }
                    }
                }
            }
        }
    }
}

/// Swift Charts line chart with DEXA markers as dashed `RuleMark`s —
/// deliberately unlabeled (no in-chart text, no legend), matching the live
/// web chart exactly: `ProgressLineChart.jsx` decodes a `label: "DEXA"`
/// field but never actually renders it as visible text (verified directly
/// from source — no `<text>` element for it). Falls back to a "More
/// history needed" placeholder for fewer than 2 points, mirroring
/// `ProgressLineChart.jsx:41-47`'s own sparse-data guard.
private struct WeightTrendChartView: View {
    let chart: WeightChartData

    var body: some View {
        let validPoints = chart.points.filter { $0.value != nil }
        if validPoints.count < 2 {
            Text("More history needed")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 140)
        } else {
            Chart {
                ForEach(validPoints) { point in
                    LineMark(x: .value("Date", point.date), y: .value("Weight", point.value ?? 0))
                        .foregroundStyle(PhysiqueOSTheme.chartEvidence)
                        .interpolationMethod(.monotone)
                    PointMark(x: .value("Date", point.date), y: .value("Weight", point.value ?? 0))
                        .foregroundStyle(PhysiqueOSTheme.chartEvidence)
                        .symbolSize(18)
                }
                ForEach(chart.markers) { marker in
                    RuleMark(x: .value("DEXA", marker.date))
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                }
            }
            .chartXAxis(.hidden)
            .frame(height: 160)
            .accessibilityLabel("Weight trend over \(validPoints.count) recorded entries")
        }
    }
}

private struct WeeklyAverageRow: View {
    let week: WeightWeeklyAverage

    private var deltaText: String {
        guard let delta = week.weekOverWeek else { return "Base" }
        let sign = delta >= 0 ? "+" : ""
        return String(format: "%@%.1f", sign, delta)
    }

    private var deltaColor: Color {
        guard let delta = week.weekOverWeek, delta < 0 else { return PhysiqueOSTheme.textMuted }
        return PhysiqueOSTheme.chartSuccess
    }

    var body: some View {
        HStack {
            Text(week.week)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Spacer(minLength: 8)
            Text(String(format: "%.1f", week.average))
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(deltaText)
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(deltaColor)
                .frame(width: 52, alignment: .trailing)
        }
        .padding(.vertical, 4)
    }
}

private struct WeightHistoryRow: View {
    let entry: WeightHistoryEntry

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(TrainingDateFormatting.short(entry.date))
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(entry.detail)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                EvidenceScopeAttributionChip(attribution: entry.attributedScope)
            }
            Spacer(minLength: 8)
            Text(entry.value)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

/// A local disclosure (collapsed summary / expanded content) — mirrors
/// `TrainingHistoryView.swift`'s private `TrainingDisclosureRow` exactly
/// (matching the web's plain `<details>`/`<summary>` `ReportDrawer`
/// styling), redefined here rather than exposed from that file since
/// Training's own version stays `private` to its file by design.
private struct EvidenceDisclosureRow<Summary: View, Expanded: View>: View {
    @Binding var isExpanded: Bool
    var summary: Summary
    var expanded: Expanded

    init(isExpanded: Binding<Bool>, @ViewBuilder summary: () -> Summary, @ViewBuilder expanded: () -> Expanded) {
        self._isExpanded = isExpanded
        self.summary = summary()
        self.expanded = expanded()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { isExpanded.toggle() }
            } label: {
                summary
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(.isButton)
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")

            expanded
                .padding(.top, 12)
        }
    }
}

/// `TrainingSourceMetadataFooter`'s sibling for Weight's own
/// `getDataSources("weight")` shape — same per-vertical convention as
/// Nutrition's/Activity's own private copies.
private struct DataSourcesFooterView: View {
    let items: [WeightDataSource]

    var body: some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Divider().overlay(PhysiqueOSTheme.divider)
                Text("Data Sources")
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                    .padding(.top, 6)
                ForEach(items) { item in
                    HStack {
                        Text(item.name)
                        Spacer(minLength: 8)
                        Text(item.status)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }
}
