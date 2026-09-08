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
            VStack(alignment: .leading, spacing: 24) {
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
                .padding(18)
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
                WeightTrendChartView(
                    chart: chart,
                    selectedPointID: viewModel?.selectedChartPointID,
                    onSelect: { id in viewModel?.selectChartPoint(id: id) }
                )
            }
        }
    }

    private func weeklyAveragesCard(_ weeks: [WeightWeeklyAverage]) -> some View {
        let preview = Array(weeks.prefix(Self.previewLimit))
        return CardContainer {
            EvidenceDisclosureRow(isExpanded: $isWeeklyAveragesExpanded) {
                evidenceSectionHeader(
                    title: "Weekly Averages",
                    subtitle: "Weekly trend smoothing for scale noise.",
                    expanded: isWeeklyAveragesExpanded
                )
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
                evidenceSectionHeader(title: "Weight History", subtitle: nil, expanded: isHistoryExpanded)
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

    private func evidenceSectionHeader(title: String, subtitle: String?, expanded: Bool) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if let subtitle {
                    Text(subtitle)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
            Spacer(minLength: 8)
            Text(expanded ? "Close" : "Show All")
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
        }
    }
}

/// A faithful Swift Charts port of `ProgressLineChart.jsx`, re-audited
/// specifically for this correction pass (the first native attempt was too
/// simplified). Reproduces, from the live web source:
///
/// - The trend line: a fixed `#0EA5E9` (`weightTrendLine`), 3pt, round cap —
///   `WeightReportScreen.jsx` passes this literal color to the chart
///   component rather than a semantic token, so this stays a literal here
///   too.
/// - Individual observation points as small hollow-ring dots (surface fill,
///   line-color stroke) — the selected/active point enlarges into a solid
///   filled dot, exactly matching the web's own `r=3` → `r=5`,
///   hollow → solid transition on selection.
/// - DEXA markers as full-height dashed **purple** (`dexaMarker`) rules
///   with a small solid dot at the top — verified corrected color from a
///   prior audit pass that mis-read this as an unlabeled neutral line; the
///   web's `--chart-marker` token really is violet/purple in the dark
///   theme, just easy to miss at 1.5pt.
/// - A **data-driven y-domain** (tight to the actual plotted min/max, no
///   padding) — replacing a prior arbitrary fixed 0–200 scale that
///   flattened real weight variation. An x-domain tight to the first/last
///   *plotted* point (not the selected scope's window bounds), also
///   matching source exactly.
/// - Touch equivalent of the web's pointer-scrub interaction: a
///   `minimumDistance: 0` drag gesture over the full plot area snaps to
///   the nearest observation by date and reports it up via `onSelect`,
///   mirroring `updateActivePoint`'s own nearest-x-neighbor scan. A single
///   tap and a horizontal drag both work through the same gesture.
/// - A below-chart tooltip ("`MMM d` / Weight: `value` lb") for the
///   selected point, defaulting to the latest point when nothing has been
///   touched yet — matching the web's own `activeIndex === null → latest
///   point` default — plus the web's separate, always-present summary row
///   (first date / latest value / last date).
///
/// Falls back to a "More history needed" placeholder for fewer than 2
/// points, mirroring `ProgressLineChart.jsx:41-47`'s own sparse-data guard
/// and exact copy/threshold.
private struct WeightTrendChartView: View {
    let chart: WeightChartData
    let selectedPointID: String?
    let onSelect: (String) -> Void

    private var validPoints: [WeightChartPoint] { chart.points.filter { $0.value != nil } }

    private var selectedPoint: WeightChartPoint? {
        (selectedPointID.flatMap { id in validPoints.first { $0.id == id } }) ?? validPoints.last
    }

    var body: some View {
        if validPoints.count < 2 {
            Text("More history needed")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 140)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                chartBody
                selectedPointDetail
                summaryRow
            }
        }
    }

    private var chartBody: some View {
        let yDomain = WeightEvidenceCalculator.chartYDomain(points: validPoints)
        let firstDate = dateValue(validPoints.first!.date)
        let lastDate = dateValue(validPoints.last!.date)

        return Chart {
            ForEach(validPoints) { point in
                LineMark(x: .value("Date", dateValue(point.date)), y: .value("Weight", point.value ?? 0))
                    .foregroundStyle(PhysiqueOSTheme.weightTrendLine)
                    .lineStyle(StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                    .interpolationMethod(.linear)
            }
            ForEach(validPoints) { point in
                let isSelected = point.id == selectedPoint?.id
                PointMark(x: .value("Date", dateValue(point.date)), y: .value("Weight", point.value ?? 0))
                    .symbol {
                        if isSelected {
                            Circle().fill(PhysiqueOSTheme.weightTrendLine).frame(width: 10, height: 10)
                        } else {
                            Circle().fill(PhysiqueOSTheme.surfaceElevated).frame(width: 6, height: 6)
                                .overlay(Circle().strokeBorder(PhysiqueOSTheme.weightTrendLine, lineWidth: 2))
                        }
                    }
            }
            ForEach(chart.markers) { marker in
                RuleMark(x: .value("DEXA", dateValue(marker.date)))
                    .foregroundStyle(PhysiqueOSTheme.dexaMarker)
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [3, 4]))
                    .annotation(position: .top, spacing: 0) {
                        Circle().fill(PhysiqueOSTheme.dexaMarker).frame(width: 6, height: 6)
                    }
            }
            if let selectedPoint {
                RuleMark(x: .value("Selected", dateValue(selectedPoint.date)))
                    .foregroundStyle(PhysiqueOSTheme.divider)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
            }
        }
        .chartYScale(domain: yDomain)
        .chartXScale(domain: firstDate...lastDate)
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .frame(height: 160)
        .chartScrub { location, proxy, geometry in selectNearestPoint(at: location, proxy: proxy, geometry: geometry) }
        .accessibilityLabel("Weight trend over \(validPoints.count) recorded entries")
    }

    /// The below-chart tooltip — mirrors `ProgressLineChart.jsx`'s own
    /// info bar exactly: date, a "/" separator, then "Weight: {value}".
    private var selectedPointDetail: some View {
        Group {
            if let selectedPoint {
                Text("\(TrainingDateFormatting.short(selectedPoint.date)) / Weight: \(selectedPoint.label)")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    /// The web's own always-present static row, independent of any
    /// interaction: first date (left), latest value (center), last date
    /// (right).
    private var summaryRow: some View {
        HStack {
            Text(TrainingDateFormatting.short(validPoints.first!.date))
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Spacer()
            Text(validPoints.last!.label)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Spacer()
            Text(TrainingDateFormatting.short(validPoints.last!.date))
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
        }
    }

    /// Nearest-x-neighbor scan, mirroring `updateActivePoint`
    /// (`ProgressLineChart.jsx:49-62`) exactly: a tap or drag anywhere over
    /// the plot area snaps to whichever observation's date is closest to
    /// the touch location, not whichever dot the finger happens to land on
    /// — the same "move across observations quickly" behavior the web's
    /// pointer-scrub already provides.
    private func selectNearestPoint(at location: CGPoint, proxy: ChartProxy, geometry: GeometryProxy) {
        let relativeX = geometry.relativeX(in: proxy, at: location)
        guard let touchedDate: Date = proxy.value(atX: relativeX) else { return }
        guard let nearest = WeightEvidenceCalculator.nearestPoint(to: touchedDate, in: validPoints, dateValue: dateValue) else { return }
        onSelect(nearest.id)
    }

    private func dateValue(_ dateString: String) -> Date {
        TrainingDateFormatting.date(from: dateString) ?? Date(timeIntervalSince1970: 0)
    }
}

private struct WeeklyAverageRow: View {
    let week: WeightWeeklyAverage

    private var deltaText: String {
        guard let delta = week.weekOverWeek else { return "Base" }
        let sign = delta >= 0 ? "+" : ""
        return String(format: "%@%.1f lb", sign, delta)
    }

    private var deltaColor: Color {
        guard let delta = week.weekOverWeek, delta < 0 else { return PhysiqueOSTheme.textMuted }
        return PhysiqueOSTheme.chartSuccess
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Week of \(week.week)")
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("\(week.entryCount) \(week.entryCount == 1 ? "entry" : "entries")")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            Spacer(minLength: 8)
            HStack(spacing: 14) {
                Text(String(format: "%.1f lb", week.average))
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(deltaText)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(deltaColor)
                    .frame(minWidth: 62, alignment: .trailing)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 18)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
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
            }
            Spacer(minLength: 8)
            Text(entry.value)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 18)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
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
