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
    @State private var viewModel: WeightHistoryViewModel?
    @State private var isWeeklyAveragesExpanded = false
    @State private var isHistoryExpanded = false

    static let previewLimit = 3
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        EvidenceScrollPage(spacing: 0, top: 10) {
            content
        }
        .evidencePageChrome("Weight")
        .evidenceFamily(.weight)
        .task(id: environment.nativeAuthority) {
            // Recreate the provider when authority changes so a fixture
            // result can never remain visible in Founder Production mode.
            viewModel = WeightHistoryViewModel(api: environment.weightEvidenceAPI)
            await viewModel?.load()
        }
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(["weight"])
            }
            await viewModel?.load()
        }
        .refreshesOnForegroundWhenVisible { await viewModel?.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            WeightStatePanel(title: "Loading Weight Evidence…", loading: true, identifier: "weight.loading")
        case .failed(let message):
            WeightStatePanel(title: "Weight could not be loaded.", detail: message, identifier: "weight.failure")
        case .loaded(let report):
            header(for: report)
                .padding(.top, m.pt(4))
                .padding(.bottom, m.pt(18))
            WeightScopePills(scope: report.scope) { scopeID in
                Task { await viewModel?.selectScope(pillID: scopeID) }
            }
            .padding(.bottom, m.pt(18))
            summaryGrid(report.summary)
                .padding(.bottom, m.pt(19))
            trendSection(report.chart)
                .padding(.bottom, m.pt(19))
            if let rollingAverages = report.rollingAverages {
                rollingAveragesSection(rollingAverages)
                    .padding(.bottom, m.pt(19))
            }
            weeklyAveragesSection(report.weeklyAverages)
                .padding(.bottom, m.pt(19))
            historySection(report.history)
        }
    }

    private func header(for report: WeightReportReadModel) -> some View {
        HStack(alignment: .top, spacing: m.pt(12)) {
            Text("↘")
                .evidenceText(.normal(16, 900, jakarta: false))
                .foregroundStyle(m.c.accent)
                .frame(width: m.pt(38), height: m.pt(38))
                .background(m.c.accent.opacity(0.16), in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text("EVIDENCE REPORT")
                    .evidenceText(.normal(11, 800, jakarta: false, tracking: 1.43, uppercase: true))
                    .foregroundStyle(m.c.accent)
                Text(report.title)
                    .evidenceText(EvidenceTextStyle(size: 30, weight: 780, lineHeight: 31.5, tracking: -1.2))
                    .foregroundStyle(m.c.ink)
                    .accessibilityAddTraits(.isHeader)
                Text(report.subtitle)
                    .evidenceText(EvidenceTextStyle(size: 13, weight: 400, lineHeight: 17.55))
                    .foregroundStyle(m.c.muted)
                    .padding(.top, m.pt(4))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("evidence.page.header")
    }

    /// Literal Goal-dependent summary cards (Latest, Since Start, …).
    private func summaryGrid(_ cards: [WeightSummaryCard]) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: m.pt(7), alignment: .top), GridItem(.flexible(), spacing: m.pt(7), alignment: .top)], spacing: m.pt(7)) {
            ForEach(cards) { card in
                WeightStatTile(label: card.label, value: card.value)
                    .accessibilityLabel("\(card.label): \(card.value)")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("weight.summary")
    }

    private func trendSection(_ chart: WeightChartData) -> some View {
        WeightSection(title: "Weight Trend", identifier: "weight.trend") {
            WeightTrendChartView(
                chart: chart,
                selectedPointID: viewModel?.selectedChartPointID,
                onSelect: { id in viewModel?.selectChartPoint(id: id) }
            )
        }
    }

    private func rollingAveragesSection(_ averages: WeightRollingAverages) -> some View {
        WeightSection(title: "Rolling Averages", identifier: "weight.rollingAverages") {
            HStack(alignment: .top, spacing: m.pt(7)) {
                rollingAverageTile(title: "3-Day Average", window: averages.threeDay)
                rollingAverageTile(title: "7-Day Average", window: averages.sevenDay)
            }
        }
    }

    private func rollingAverageTile(title: String, window: WeightRollingAverageWindow) -> some View {
        let value = window.value.flatMap { v in window.unit.map { String(format: "%.1f %@", v, $0) } } ?? "Pending"
        return WeightStatTile(label: title, value: value, detail: "\(window.observationCount) of \(window.requestedDays) days")
    }

    private func weeklyAveragesSection(_ weeks: [WeightWeeklyAverage]) -> some View {
        let preview = Array(weeks.prefix(Self.previewLimit))
        return WeightSection(
            title: "Weekly Averages",
            identifier: "weight.weeklyAverages",
            action: weeks.count > Self.previewLimit ? (isWeeklyAveragesExpanded ? "Close" : "Show All") : nil,
            onAction: { withAnimation(.easeInOut(duration: 0.2)) { isWeeklyAveragesExpanded.toggle() } }
        ) {
            if weeks.isEmpty {
                WeightEmptyLine(text: "More history needed to compute weekly averages.")
            } else {
                VStack(spacing: 0) {
                    ForEach(isWeeklyAveragesExpanded ? weeks : preview) { week in
                        WeeklyAverageRow(week: week)
                    }
                }
            }
        }
    }

    private func historySection(_ history: [WeightHistoryEntry]) -> some View {
        let preview = Array(history.prefix(Self.previewLimit))
        return WeightSection(
            title: "Weight History",
            identifier: "weight.history",
            action: history.count > Self.previewLimit ? (isHistoryExpanded ? "Close" : "Show All") : nil,
            onAction: { withAnimation(.easeInOut(duration: 0.2)) { isHistoryExpanded.toggle() } }
        ) {
            if history.isEmpty {
                WeightEmptyLine(text: "Weight history will appear as weigh-ins are logged or connected.")
            } else {
                VStack(spacing: 0) {
                    ForEach(isHistoryExpanded ? history : preview) { entry in
                        WeightHistoryRow(entry: entry)
                    }
                }
            }
        }
    }
}

// MARK: - Weight family components (`energy-weight-recovery` harness)

/// `.section.contained`: 13 px inset, 15 px radius, 16 px title, accent
/// action (`Show All` / `Close` expands the rows inline — no new route).
private struct WeightSection<Content: View>: View {
    let title: String
    let identifier: String
    var action: String?
    var onAction: () -> Void = {}
    @ViewBuilder var content: Content
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: m.pt(8)) {
                Text(title)
                    .evidenceText(.normal(16, 800, jakarta: false, tracking: -0.32))
                    .foregroundStyle(m.c.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
                if let action {
                    Button(action: onAction) {
                        Text(action)
                            .evidenceText(.normal(10, 760, jakarta: false))
                            .foregroundStyle(m.c.accent)
                            .evidenceHitTarget(visualHeight: m.pt(12))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("\(identifier).toggle")
                }
            }
            .padding(.bottom, m.pt(10))
            content
        }
        .padding(m.pt(13 + 1))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(m.c.surface, in: RoundedRectangle(cornerRadius: m.pt(15)))
        .overlay(RoundedRectangle(cornerRadius: m.pt(15)).strokeBorder(m.c.line, lineWidth: m.pt(1)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(identifier)
    }
}

/// `.summary` / `.stat`: uppercase label, 14 px value, optional detail.
private struct WeightStatTile: View {
    let label: String
    let value: String
    var detail: String?
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .evidenceText(.normal(9, 800, jakarta: false, tracking: 0.54, uppercase: true))
                .foregroundStyle(m.c.quiet)
            Text(value)
                .evidenceText(.normal(14, 820, jakarta: false, digits: true))
                .foregroundStyle(m.c.ink)
                .padding(.top, m.pt(3))
            if let detail {
                Text(detail)
                    .evidenceText(.normal(9, 400, jakarta: false))
                    .foregroundStyle(m.c.quiet)
                    .padding(.top, m.pt(2))
            }
        }
        .padding(m.pt(10))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(11)))
        .accessibilityElement(children: .combine)
    }
}

/// `.pill` scope chips: 9 px radius; selected = surface-2 + lime ink + rule.
private struct WeightScopePills: View {
    let scope: TrainingScopeContext
    let onSelect: (String) -> Void
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: m.pt(5)) {
                row(scope.options)
                if !scope.phaseOptions.isEmpty { row(scope.phaseOptions) }
            }
            Text(scope.dateRangeLabel)
                .evidenceText(.normal(10, 400, jakarta: false))
                .foregroundStyle(m.c.quiet)
                .padding(.top, m.pt(7))
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("evidence.scope")
    }

    private func row(_ options: [TrainingScopeOption]) -> some View {
        HStack(spacing: m.pt(5)) {
            ForEach(options) { option in
                Button { onSelect(option.id) } label: {
                    Text(option.label)
                        .evidenceText(.normal(9, 760, jakarta: false))
                        .foregroundStyle(option.selected ? m.c.accent : m.c.quiet)
                        .padding(.horizontal, m.pt(8))
                        .padding(.vertical, m.pt(7))
                        .background(option.selected ? m.c.surface2 : m.c.surface, in: RoundedRectangle(cornerRadius: m.pt(9)))
                        .overlay {
                            if option.selected {
                                RoundedRectangle(cornerRadius: m.pt(9)).strokeBorder(m.c.accent.opacity(0.35), lineWidth: m.pt(1))
                            }
                        }
                        .evidenceHitTarget(visualHeight: m.pt(25))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(option.selected ? [.isButton, .isSelected] : .isButton)
                .accessibilityIdentifier("evidence.scope.\(option.id)")
            }
        }
    }
}

private struct WeightEmptyLine: View {
    let text: String
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        Text(text)
            .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
            .foregroundStyle(m.c.quiet)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// `.state-panel` for Weight's async states.
private struct WeightStatePanel: View {
    let title: String
    var detail: String?
    var loading = false
    let identifier: String
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        VStack(spacing: 0) {
            if loading {
                ProgressView().tint(m.c.accent).padding(.bottom, m.pt(8))
            }
            Text(title)
                .evidenceText(.normal(12, 800, jakarta: false))
                .foregroundStyle(m.c.ink)
            if let detail {
                Text(detail)
                    .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.6))
                    .foregroundStyle(m.c.quiet)
                    .padding(.top, m.pt(4))
            }
        }
        .multilineTextAlignment(.center)
        .padding(m.pt(15 + 1))
        .frame(maxWidth: .infinity, minHeight: m.pt(110))
        .background(m.c.surface, in: RoundedRectangle(cornerRadius: m.pt(14)))
        .overlay(RoundedRectangle(cornerRadius: m.pt(14)).strokeBorder(m.c.line, lineWidth: m.pt(1)))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }
}

/// Locked W1 trend: legend, a 140 px field with 25/50/75 % rules, the
/// blue weight line with filled points, dashed violet DEXA markers, then
/// the selected entry and the visible date range in one row. The
/// tight-domain calculation, markers and scrub selection are unchanged.
private struct WeightTrendChartView: View {
    let chart: WeightChartData
    let selectedPointID: String?
    let onSelect: (String) -> Void
    private let m = EvidenceMetrics(family: .weight)

    private var validPoints: [WeightChartPoint] { chart.points.filter { $0.value != nil } }

    private var selectedPoint: WeightChartPoint? {
        (selectedPointID.flatMap { id in validPoints.first { $0.id == id } }) ?? validPoints.last
    }

    var body: some View {
        if validPoints.count < 2 {
            VStack(spacing: m.pt(4)) {
                Text("More history needed")
                    .evidenceText(.normal(12, 800, jakarta: false))
                    .foregroundStyle(m.c.ink)
                Text("Shown when the trend has fewer than two valid points.")
                    .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.6))
                    .foregroundStyle(m.c.quiet)
            }
            .frame(maxWidth: .infinity, minHeight: m.pt(140))
            .accessibilityElement(children: .combine)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                legend
                chartField
                    .padding(.top, m.pt(9 - 7))
                selectionRow
            }
        }
    }

    private var legend: some View {
        HStack(spacing: m.pt(11)) {
            legendItem("Weight", m.c.blue)
            if !chart.markers.isEmpty { legendItem("DEXA marker", m.c.purple) }
        }
        .padding(.bottom, m.pt(7))
        .accessibilityElement(children: .combine)
    }

    private func legendItem(_ label: String, _ color: Color) -> some View {
        HStack(spacing: m.pt(4)) {
            RoundedRectangle(cornerRadius: m.pt(3)).fill(color).frame(width: m.pt(12), height: m.pt(3))
            Text(label)
                .evidenceText(.normal(9, 700, jakarta: false))
                .foregroundStyle(m.c.quiet)
        }
    }

    private var chartField: some View {
        let yDomain = WeightEvidenceCalculator.chartYDomain(points: validPoints)
        let firstDate = dateValue(validPoints.first!.date)
        let lastDate = dateValue(validPoints.last!.date)

        return ZStack {
            VStack(spacing: 0) {
                ForEach(0..<3, id: \.self) { _ in
                    Spacer(minLength: 0)
                    Rectangle().fill(m.c.line).frame(height: m.pt(1))
                }
                Spacer(minLength: 0)
            }
            Chart {
                ForEach(validPoints) { point in
                    LineMark(x: .value("Date", dateValue(point.date)), y: .value("Weight", point.value ?? 0))
                        .foregroundStyle(m.c.blue)
                        .lineStyle(StrokeStyle(lineWidth: m.pt(2.5), lineCap: .round, lineJoin: .round))
                        .interpolationMethod(.linear)
                }
                ForEach(validPoints) { point in
                    let isSelected = point.id == selectedPoint?.id
                    PointMark(x: .value("Date", dateValue(point.date)), y: .value("Weight", point.value ?? 0))
                        .symbol {
                            Circle().fill(m.c.blue).frame(width: m.pt(isSelected ? 9 : 5.4), height: m.pt(isSelected ? 9 : 5.4))
                                .overlay { if isSelected { Circle().stroke(m.c.page, lineWidth: m.pt(2)) } }
                        }
                }
                ForEach(chart.markers) { marker in
                    RuleMark(x: .value("DEXA", dateValue(marker.date)))
                        .foregroundStyle(m.c.purple)
                        .lineStyle(StrokeStyle(lineWidth: m.pt(1.5), dash: [m.pt(4), m.pt(4)]))
                }
            }
            .chartYScale(domain: yDomain)
            .chartXScale(domain: firstDate...lastDate)
            .chartXAxis(.hidden)
            .chartYAxis(.hidden)
            .padding(m.pt(10))
            .evidenceChartScrub { location, proxy, geometry in
                let relativeX = geometry.relativeX(in: proxy, at: location)
                guard let touchedDate: Date = proxy.value(atX: relativeX),
                      let nearest = WeightEvidenceCalculator.nearestPoint(to: touchedDate, in: validPoints, dateValue: dateValue) else { return }
                onSelect(nearest.id)
            }
            .accessibilityLabel("Weight trend over \(validPoints.count) recorded entries")
        }
        .frame(height: m.pt(140))
        .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(12)))
        .clipShape(RoundedRectangle(cornerRadius: m.pt(12)))
    }

    private var selectionRow: some View {
        HStack(alignment: .firstTextBaseline, spacing: m.pt(10)) {
            if let selectedPoint {
                Text("\(TrainingDateFormatting.short(selectedPoint.date)) / Weight: \(selectedPoint.label)")
                    .evidenceText(.normal(12, 790, jakarta: false))
                    .foregroundStyle(m.c.ink)
            }
            Spacer(minLength: 0)
            Text("\(TrainingDateFormatting.short(validPoints.first!.date)) → \(TrainingDateFormatting.short(validPoints.last!.date))")
                .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 13.5))
                .foregroundStyle(m.c.muted)
        }
        .padding(.vertical, m.pt(10))
        .padding(.horizontal, m.pt(2))
        .padding(.bottom, m.pt(1))
        .overlay(alignment: .bottom) { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("weight.trend.selection")
    }

    private func dateValue(_ dateString: String) -> Date {
        TrainingDateFormatting.date(from: dateString) ?? Date(timeIntervalSince1970: 0)
    }
}

/// `.row`: week label + entry count, average and week-over-week delta.
private struct WeeklyAverageRow: View {
    let week: WeightWeeklyAverage
    private let m = EvidenceMetrics(family: .weight)

    private var deltaText: String {
        guard let delta = week.weekOverWeek else { return "Base" }
        let sign = delta >= 0 ? "+" : ""
        return String(format: "%@%.1f lb", sign, delta)
    }

    var body: some View {
        WeightRow(
            label: "Week of \(week.week)",
            copy: "\(week.entryCount) \(week.entryCount == 1 ? "entry" : "entries")",
            trailing: String(format: "%.1f lb", week.average),
            trailingDetail: deltaText
        )
    }
}

private struct WeightHistoryRow: View {
    let entry: WeightHistoryEntry

    var body: some View {
        WeightRow(label: TrainingDayView.formatCompactDate(entry.date), copy: entry.detail, trailing: entry.value)
    }
}

/// `.row`: 10 px vertical inset, 1 px rule below, read-only.
private struct WeightRow: View {
    let label: String
    let copy: String
    let trailing: String
    var trailingDetail: String?
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        HStack(alignment: .center, spacing: m.pt(10)) {
            VStack(alignment: .leading, spacing: 0) {
                Text(label)
                    .evidenceText(.normal(12, 790, jakarta: false))
                    .foregroundStyle(m.c.ink)
                Text(copy)
                    .evidenceText(EvidenceTextStyle(size: 9.5, weight: 400, lineHeight: 12.825))
                    .foregroundStyle(m.c.quiet)
                    .padding(.top, m.pt(3))
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 0) {
                Text(trailing)
                    .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 13.5, monospacedDigits: true))
                    .foregroundStyle(m.c.muted)
                if let trailingDetail {
                    Text(trailingDetail)
                        .evidenceText(EvidenceTextStyle(size: 9.5, weight: 400, lineHeight: 12.825, monospacedDigits: true))
                        .foregroundStyle(m.c.quiet)
                }
            }
        }
        .padding(.vertical, m.pt(10))
        .padding(.horizontal, m.pt(2))
        .padding(.bottom, m.pt(1))
        .overlay(alignment: .bottom) { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
        .accessibilityElement(children: .combine)
    }
}
