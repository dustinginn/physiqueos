import Charts
import SwiftUI

enum EnergyExpenditureBarTreatment: Equatable { case filled }

enum EnergyChartPresentation {
    /// Intentional Native enhancement retained from Build 14: expenditure
    /// bars are solid blue rather than the web chart's outlined treatment.
    static let expenditureBarTreatment: EnergyExpenditureBarTreatment = .filled
}

/// "Energy Over Time" — the live web's dual-series weekly trend
/// (`EnergyOverTimeChart.jsx`): a solid amber Intake line, a dashed blue
/// Estimated Expenditure line, and its own 1M/3M/6M/1Y/All range selector
/// (`EvidenceChartRange`, shared with Nutrition Reporting's charts).
///
/// Locked E1 presentation: note, range pills, legend, a 140 px field with
/// 25/50/75 % rules on surface-2, the first/last week under the field and
/// the selected week's averages below. A tap selects the nearest week and a
/// horizontal pan scrubs (`evidenceChartScrub`); a vertical swipe that
/// starts on the chart scrolls the page.
struct EnergyOverTimeChartView: View {
    let weeksAscending: [EnergyWeekRecord]
    @Binding var selectedWeekID: String?
    @State private var range: EvidenceChartRange = .all
    private let m = EvidenceMetrics(family: .weight)

    private var filteredWeeks: [EnergyWeekRecord] {
        EnergyEvidenceCalculator.rangeFiltered(weeksAscending: weeksAscending, range: range)
    }

    private var selectedWeek: EnergyWeekRecord? {
        (selectedWeekID.flatMap { id in filteredWeeks.first { $0.id == id } }) ?? filteredWeeks.last
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            EnergySectionNote(text: "Weekly average intake and estimated expenditure over time.")
            rangeSelector
                .padding(.top, m.pt(4))
            if filteredWeeks.isEmpty {
                EnergyChartEmpty()
                    .padding(.top, m.pt(9))
            } else {
                EnergySeriesLegend()
                    .padding(.top, m.pt(7))
                chart
                    .padding(.top, m.pt(2))
                EnergyAxisLabels(first: filteredWeeks.first?.weekStart, last: filteredWeeks.last?.weekStart)
                if let selectedWeek {
                    EnergyWeekDetailView(week: selectedWeek, isExplicit: selectedWeekID != nil, identifier: "energy.overTime.selectedWeek")
                        .padding(.top, m.pt(10))
                }
            }
        }
    }

    private var rangeSelector: some View {
        HStack(spacing: m.pt(5)) {
            ForEach(EvidenceChartRange.allCases) { option in
                let isSelected = range == option
                Button {
                    range = option
                    selectedWeekID = nil
                } label: {
                    Text(option.label)
                        .evidenceText(.normal(9, 760, jakarta: false))
                        .foregroundStyle(isSelected ? m.c.accent : m.c.quiet)
                        .padding(.horizontal, m.pt(8))
                        .padding(.vertical, m.pt(7))
                        .background(isSelected ? m.c.surface2 : m.c.surface, in: RoundedRectangle(cornerRadius: m.pt(9)))
                        .overlay {
                            if isSelected {
                                RoundedRectangle(cornerRadius: m.pt(9)).strokeBorder(m.c.accent.opacity(0.35), lineWidth: m.pt(1))
                            }
                        }
                        .evidenceHitTarget(visualHeight: m.pt(25))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
                .accessibilityIdentifier("energy.range.\(option.rawValue)")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Energy over time date range")
    }

    private var yDomain: ClosedRange<Double> {
        let values = filteredWeeks.flatMap { [$0.averageIntake, $0.averageExpenditure].compactMap { $0 } }
        guard let low = values.min(), let high = values.max() else { return 0...1 }
        let pad = max((high - low) * 0.18, 60)
        return (low - pad)...(high + pad)
    }

    private var chart: some View {
        Chart {
            ForEach(filteredWeeks) { week in
                if let intake = week.averageIntake {
                    LineMark(x: .value("Week", week.weekStart), y: .value("Intake", intake), series: .value("Series", "Intake"))
                        .foregroundStyle(m.c.amber)
                        .lineStyle(StrokeStyle(lineWidth: m.pt(3), lineCap: .round, lineJoin: .round))
                }
                if let expenditure = week.averageExpenditure {
                    LineMark(x: .value("Week", week.weekStart), y: .value("Expenditure", expenditure), series: .value("Series", "Expenditure"))
                        .foregroundStyle(m.c.blue)
                        .lineStyle(StrokeStyle(lineWidth: m.pt(3), lineCap: .round, lineJoin: .round, dash: [m.pt(7), m.pt(5)]))
                }
            }
            if let selectedWeek {
                if selectedWeekID != nil {
                    RuleMark(x: .value("Selected", selectedWeek.weekStart))
                        .foregroundStyle(m.c.muted.opacity(0.45))
                        .lineStyle(StrokeStyle(lineWidth: m.pt(1)))
                }
                if let intake = selectedWeek.averageIntake {
                    PointMark(x: .value("Week", selectedWeek.weekStart), y: .value("Intake", intake))
                        .symbol { EnergyChartDot(color: m.c.amber) }
                }
                if let expenditure = selectedWeek.averageExpenditure {
                    PointMark(x: .value("Week", selectedWeek.weekStart), y: .value("Expenditure", expenditure))
                        .symbol { EnergyChartDot(color: m.c.blue) }
                }
            }
        }
        .chartYScale(domain: yDomain)
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .padding(m.pt(10))
        .evidenceChartScrub { location, proxy, geometry in selectNearest(at: location, proxy: proxy, geometry: geometry) }
        .frame(height: m.pt(140))
        .background { EnergyChartField() }
        .clipShape(RoundedRectangle(cornerRadius: m.pt(12)))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Weekly average intake and estimated expenditure over \(filteredWeeks.count) weeks")
        .accessibilityValue(selectedWeek.map(EnergyWeekDetailView.spokenSummary) ?? "")
        .accessibilityIdentifier("energy.overTime.chart")
    }

    private func selectNearest(at location: CGPoint, proxy: ChartProxy, geometry: GeometryProxy) {
        let relativeX = geometry.relativeX(in: proxy, at: location)
        let touchedWeek: String? = proxy.value(atX: relativeX)
        guard let nearest = ChartCategoricalSelection.nearestPoint(matching: touchedWeek, in: filteredWeeks, keyPath: \.weekStart) else { return }
        selectedWeekID = nearest.id
    }
}

/// "Weekly Energy Balance" — the live web's latest-4-weeks grouped bar
/// chart (`EnergyWeeklyChart.jsx`): one Intake bar + one Expenditure bar
/// per week. Locked E1 bars (15 px, 4 px apart, 4/2 px radius) with the
/// week starts beneath; the same tap / horizontal-scrub selection as the
/// chart above, with the non-selected weeks dimmed.
struct EnergyWeeklyBarChartView: View {
    /// Already the latest-4-weeks slice, ascending
    /// (`EnergyEvidenceCalculator.recentFourWeeks`).
    let weeksAscending: [EnergyWeekRecord]
    @Binding var selectedWeekID: String?
    private let m = EvidenceMetrics(family: .weight)

    private var selectedWeek: EnergyWeekRecord? {
        (selectedWeekID.flatMap { id in weeksAscending.first { $0.id == id } }) ?? weeksAscending.last
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            EnergySectionNote(text: "Average daily intake and estimated expenditure across the latest four weeks.")
            if weeksAscending.isEmpty {
                EnergyChartEmpty()
                    .padding(.top, m.pt(9))
            } else {
                EnergySeriesLegend(dashedExpenditure: false)
                    .padding(.top, m.pt(4))
                chart
                    .padding(.top, m.pt(2))
                if let selectedWeek {
                    EnergyWeekDetailView(week: selectedWeek, isExplicit: selectedWeekID != nil, identifier: "energy.weeklyBalance.selectedWeek")
                        .padding(.top, m.pt(10))
                }
            }
        }
    }

    private func opacity(for week: EnergyWeekRecord) -> Double {
        selectedWeekID == nil || selectedWeekID == week.id ? 1 : 0.42
    }

    private var chart: some View {
        Chart {
            ForEach(weeksAscending) { week in
                if let intake = week.averageIntake {
                    BarMark(x: .value("Week", week.weekStart), y: .value("Value", intake), width: .fixed(m.pt(15)))
                        .foregroundStyle(m.c.amber.opacity(opacity(for: week)))
                        .clipShape(UnevenRoundedRectangle(topLeadingRadius: m.pt(4), bottomLeadingRadius: m.pt(2), bottomTrailingRadius: m.pt(2), topTrailingRadius: m.pt(4)))
                        .position(by: .value("Series", "Intake"), axis: .horizontal, span: .fixed(m.pt(34)))
                }
                if let expenditure = week.averageExpenditure {
                    BarMark(x: .value("Week", week.weekStart), y: .value("Value", expenditure), width: .fixed(m.pt(15)))
                        .foregroundStyle(expenditureBarColor.opacity(opacity(for: week)))
                        .clipShape(UnevenRoundedRectangle(topLeadingRadius: m.pt(4), bottomLeadingRadius: m.pt(2), bottomTrailingRadius: m.pt(2), topTrailingRadius: m.pt(4)))
                        .position(by: .value("Series", "Expenditure"), axis: .horizontal, span: .fixed(m.pt(34)))
                }
            }
        }
        .chartXAxis {
            AxisMarks { value in
                AxisValueLabel {
                    if let week = value.as(String.self) {
                        Text(TrainingDateFormatting.short(week))
                            .evidenceText(.normal(9, 400, jakarta: false))
                            .foregroundStyle(m.c.quiet)
                    }
                }
            }
        }
        .chartYAxis(.hidden)
        .chartLegend(.hidden)
        .padding(.horizontal, m.pt(4))
        .padding(.top, m.pt(10))
        .evidenceChartScrub { location, proxy, geometry in selectNearest(at: location, proxy: proxy, geometry: geometry) }
        .frame(height: m.pt(132 + 18))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Average daily intake and estimated expenditure across the latest \(weeksAscending.count) weeks")
        .accessibilityValue(selectedWeek.map(EnergyWeekDetailView.spokenSummary) ?? "")
        .accessibilityIdentifier("energy.weeklyBalance.chart")
    }

    private func selectNearest(at location: CGPoint, proxy: ChartProxy, geometry: GeometryProxy) {
        let relativeX = geometry.relativeX(in: proxy, at: location)
        let touchedWeek: String? = proxy.value(atX: relativeX)
        guard let nearest = ChartCategoricalSelection.nearestPoint(matching: touchedWeek, in: weeksAscending, keyPath: \.weekStart) else { return }
        selectedWeekID = nearest.id
    }

    private var expenditureBarColor: Color {
        switch EnergyChartPresentation.expenditureBarTreatment {
        case .filled: m.c.blue
        }
    }
}

// MARK: - Shared chart parts

/// `.section-note`: 10 px quiet copy under a section title.
struct EnergySectionNote: View {
    let text: String
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        Text(text)
            .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
            .foregroundStyle(m.c.quiet)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.bottom, m.pt(5))
    }
}

/// Locked legend: 12 × 3 px swatches. Expenditure is dashed where its line
/// is dashed, so the estimate reads the same in the legend and the plot.
struct EnergySeriesLegend: View {
    var dashedExpenditure = true
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        HStack(spacing: m.pt(11)) {
            HStack(spacing: m.pt(4)) {
                RoundedRectangle(cornerRadius: m.pt(3)).fill(m.c.amber).frame(width: m.pt(12), height: m.pt(3))
                label("Intake")
            }
            HStack(spacing: m.pt(4)) {
                if dashedExpenditure {
                    HStack(spacing: m.pt(2)) {
                        RoundedRectangle(cornerRadius: m.pt(3)).fill(m.c.blue).frame(width: m.pt(5), height: m.pt(3))
                        RoundedRectangle(cornerRadius: m.pt(3)).fill(m.c.blue).frame(width: m.pt(5), height: m.pt(3))
                    }
                } else {
                    RoundedRectangle(cornerRadius: m.pt(3)).fill(m.c.blue).frame(width: m.pt(12), height: m.pt(3))
                }
                label("Estimated expenditure")
            }
        }
        .padding(.bottom, m.pt(7))
        .accessibilityElement(children: .combine)
    }

    private func label(_ text: String) -> some View {
        Text(text)
            .evidenceText(.normal(9, 700, jakarta: false))
            .foregroundStyle(m.c.quiet)
    }
}

/// `.chart` field: surface-2 with 25 / 50 / 75 % rules.
private struct EnergyChartField: View {
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<3, id: \.self) { _ in
                Spacer(minLength: 0)
                Rectangle().fill(m.c.line).frame(height: m.pt(1))
            }
            Spacer(minLength: 0)
        }
        .background(m.c.surface2)
    }
}

/// `.dot`: page-filled point with a 2 px series ring.
private struct EnergyChartDot: View {
    let color: Color
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        Circle()
            .fill(m.c.page)
            .overlay(Circle().stroke(color, lineWidth: m.pt(2)))
            .frame(width: m.pt(8), height: m.pt(8))
    }
}

private struct EnergyAxisLabels: View {
    let first: String?
    let last: String?
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        HStack {
            if let first { Text(TrainingDateFormatting.short(first)) }
            Spacer(minLength: 0)
            if let last { Text(TrainingDateFormatting.short(last)) }
        }
        .evidenceText(.normal(9, 400, jakarta: false))
        .foregroundStyle(m.c.quiet)
        .padding(.top, m.pt(5))
        .accessibilityHidden(true)
    }
}

private struct EnergyChartEmpty: View {
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        Text("No weekly energy evidence available")
            .evidenceText(.normal(12, 800, jakarta: false))
            .foregroundStyle(m.c.ink)
            .frame(maxWidth: .infinity, minHeight: m.pt(140))
            .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(12)))
    }
}

/// Shared selected-week readout for both charts (web `SelectedWeekDetail`):
/// average intake / estimated expenditure / balance + evidence coverage,
/// in the locked `.energy-grid` row grammar under a 1 px rule.
struct EnergyWeekDetailView: View {
    let week: EnergyWeekRecord
    /// The latest week is shown until a week is tapped or scrubbed.
    var isExplicit = false
    var identifier = "energy.selectedWeek"
    private let m = EvidenceMetrics(family: .weight)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: m.pt(8)) {
                Text("\(TrainingDateFormatting.short(week.weekStart)) – \(TrainingDateFormatting.short(week.weekEnd))")
                    .evidenceText(.normal(12, 790, jakarta: false))
                    .foregroundStyle(m.c.ink)
                if !isExplicit {
                    Text("Latest week")
                        .evidenceText(.normal(9, 400, jakarta: false))
                        .foregroundStyle(m.c.quiet)
                }
                Spacer(minLength: 0)
                if week.partial { EnergyTag(text: "Partial", warn: true) }
            }
            EnergyFieldGrid(fields: [
                ("Average intake", EnergyEvidenceCalculator.formatCalories(week.averageIntake)),
                (EnergyEvidenceCopy.weekExpenditureLabel, EnergyEvidenceCalculator.formatCalories(week.averageExpenditure)),
                ("Average balance", EnergyEvidenceCalculator.formatSignedCalories(week.averageBalance)),
                ("Evidence coverage", "\(week.completeDayCount) complete · \(week.evidenceDayCount) evidence"),
            ])
            .padding(.top, m.pt(7))
        }
        .padding(.top, m.pt(10))
        .overlay(alignment: .top) { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }

    static func spokenSummary(_ week: EnergyWeekRecord) -> String {
        "Week of \(TrainingDateFormatting.short(week.weekStart))\(week.partial ? ", partial" : ""). Intake \(EnergyEvidenceCalculator.formatCalories(week.averageIntake)), estimated expenditure \(EnergyEvidenceCalculator.formatCalories(week.averageExpenditure)), balance \(EnergyEvidenceCalculator.formatSignedCalories(week.averageBalance))."
    }
}
