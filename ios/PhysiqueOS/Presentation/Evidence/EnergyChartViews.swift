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
/// Re-verified against source alongside every other Evidence chart this
/// task standardizes: web's own interaction here is discrete tap-to-select,
/// not hover/drag-scrub — Native's touch equivalent standardizes on the
/// same tap-and-drag `chartScrub` gesture every interactive Evidence chart
/// now uses (see `ChartInteraction.swift`), a strict superset of web's own
/// click-only input.
struct EnergyOverTimeChartView: View {
    let weeksAscending: [EnergyWeekRecord]
    @Binding var selectedWeekID: String?
    @State private var range: EvidenceChartRange = .all

    private var filteredWeeks: [EnergyWeekRecord] {
        EnergyEvidenceCalculator.rangeFiltered(weeksAscending: weeksAscending, range: range)
    }

    private var selectedWeek: EnergyWeekRecord? {
        (selectedWeekID.flatMap { id in filteredWeeks.first { $0.id == id } }) ?? filteredWeeks.last
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            rangeSelector
            if filteredWeeks.isEmpty {
                Text("No weekly energy evidence available")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 140)
            } else {
                chart
                EnergySeriesLegend()
                if let selectedWeek { EnergyWeekDetailView(week: selectedWeek) }
            }
        }
    }

    private var rangeSelector: some View {
        HStack(spacing: 4) {
            ForEach(EvidenceChartRange.allCases) { option in
                Button {
                    range = option
                } label: {
                    Text(option.label)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(range == option ? PhysiqueOSTheme.accent : PhysiqueOSTheme.textMuted)
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .background(range == option ? PhysiqueOSTheme.surfaceElevated : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 9))
                }
            }
        }
        .padding(4)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityLabel("Energy over time date range")
    }

    private var chart: some View {
        Chart {
            ForEach(filteredWeeks) { week in
                if let intake = week.averageIntake {
                    LineMark(x: .value("Week", week.weekStart), y: .value("Intake", intake), series: .value("Series", "Intake"))
                        .foregroundStyle(PhysiqueOSTheme.energyIntake)
                        .lineStyle(StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                }
                if let expenditure = week.averageExpenditure {
                    LineMark(x: .value("Week", week.weekStart), y: .value("Expenditure", expenditure), series: .value("Series", "Expenditure"))
                        .foregroundStyle(PhysiqueOSTheme.energyExpenditure)
                        .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round, dash: [6, 4]))
                }
            }
            ForEach(filteredWeeks) { week in
                let isSelected = week.id == selectedWeek?.id
                if let intake = week.averageIntake {
                    PointMark(x: .value("Week", week.weekStart), y: .value("Intake", intake))
                        .symbolSize(isSelected ? 80 : 24)
                        .foregroundStyle(PhysiqueOSTheme.energyIntake)
                }
                if let expenditure = week.averageExpenditure {
                    PointMark(x: .value("Week", week.weekStart), y: .value("Expenditure", expenditure))
                        .symbol {
                            Circle().fill(PhysiqueOSTheme.surfaceElevated).frame(width: isSelected ? 10 : 7, height: isSelected ? 10 : 7)
                                .overlay(Circle().strokeBorder(PhysiqueOSTheme.energyExpenditure, lineWidth: 2))
                        }
                }
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .frame(height: 160)
        .chartScrub { location, proxy, geometry in selectNearest(at: location, proxy: proxy, geometry: geometry) }
        .accessibilityLabel("Weekly intake and estimated expenditure over \(filteredWeeks.count) weeks")
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
/// per week. Same standardized tap-and-drag selection as the chart above.
struct EnergyWeeklyBarChartView: View {
    /// Already the latest-4-weeks slice, ascending
    /// (`EnergyEvidenceCalculator.recentFourWeeks`).
    let weeksAscending: [EnergyWeekRecord]
    @Binding var selectedWeekID: String?

    private var selectedWeek: EnergyWeekRecord? {
        (selectedWeekID.flatMap { id in weeksAscending.first { $0.id == id } }) ?? weeksAscending.last
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if weeksAscending.isEmpty {
                Text("No weekly energy evidence available")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 140)
            } else {
                chart
                EnergySeriesLegend()
                if let selectedWeek { EnergyWeekDetailView(week: selectedWeek) }
            }
        }
    }

    private var chart: some View {
        Chart {
            ForEach(weeksAscending) { week in
                if let intake = week.averageIntake {
                    BarMark(x: .value("Week", week.weekStart), y: .value("Value", intake))
                        .foregroundStyle(PhysiqueOSTheme.energyIntake)
                        .position(by: .value("Series", "Intake"))
                }
                if let expenditure = week.averageExpenditure {
                    BarMark(x: .value("Week", week.weekStart), y: .value("Value", expenditure))
                        .foregroundStyle(expenditureBarColor)
                        .position(by: .value("Series", "Expenditure"))
                }
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .frame(height: 150)
        .chartScrub { location, proxy, geometry in selectNearest(at: location, proxy: proxy, geometry: geometry) }
        .accessibilityLabel("Average daily intake and estimated expenditure across the latest \(weeksAscending.count) weeks")
    }

    private func selectNearest(at location: CGPoint, proxy: ChartProxy, geometry: GeometryProxy) {
        let relativeX = geometry.relativeX(in: proxy, at: location)
        let touchedWeek: String? = proxy.value(atX: relativeX)
        guard let nearest = ChartCategoricalSelection.nearestPoint(matching: touchedWeek, in: weeksAscending, keyPath: \.weekStart) else { return }
        selectedWeekID = nearest.id
    }

    private var expenditureBarColor: Color {
        switch EnergyChartPresentation.expenditureBarTreatment {
        case .filled: PhysiqueOSTheme.energyExpenditure
        }
    }
}

/// Shared between both Energy charts — matches web's own duplicated
/// legend markup verbatim ("Intake" solid swatch / "Estimated expenditure"
/// outlined swatch).
struct EnergySeriesLegend: View {
    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 4) {
                RoundedRectangle(cornerRadius: 2).fill(PhysiqueOSTheme.energyIntake).frame(width: 10, height: 10)
                Text("Intake")
            }
            HStack(spacing: 4) {
                RoundedRectangle(cornerRadius: 2).fill(PhysiqueOSTheme.energyExpenditure).frame(width: 10, height: 10)
                Text("Estimated expenditure")
            }
        }
        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
        .foregroundStyle(PhysiqueOSTheme.textMuted)
    }
}

/// Shared selected-week detail panel — matches both `SelectedWeekDetail`
/// (over-time chart) and the weekly bar chart's own identical detail
/// markup (average intake/expenditure/balance + evidence coverage).
struct EnergyWeekDetailView: View {
    let week: EnergyWeekRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(TrainingDateFormatting.short(week.weekStart)) – \(TrainingDateFormatting.short(week.weekEnd))\(week.partial ? " · Partial" : "")")
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                detailItem("Average intake", EnergyEvidenceCalculator.formatCalories(week.averageIntake))
                detailItem("Average estimated expenditure", EnergyEvidenceCalculator.formatCalories(week.averageExpenditure))
                detailItem("Average balance", EnergyEvidenceCalculator.formatSignedCalories(week.averageBalance))
                detailItem("Evidence coverage", "\(week.completeDayCount) complete · \(week.evidenceDayCount) evidence")
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func detailItem(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
