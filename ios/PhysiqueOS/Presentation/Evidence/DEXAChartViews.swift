import Charts
import SwiftUI

/// The primary, interactive DEXA chart — used for "Body Fat %", the one
/// chart `DEXAReportScreen.jsx` shows first and largest ("Core Trends"
/// drawer, default-open). Tap-and-drag nearest-scan selection via the
/// shared `chartScrub` gesture (see `ChartInteraction.swift`) — a single
/// tap and a continuous horizontal drag both resolve to the nearest scan,
/// the same touch equivalent of pointer-hover Weight's own chart provides —
/// with a below-chart "date: value" detail defaulting to the latest scan.
struct DEXATrendChartView: View {
    let series: DEXAMetricSeries
    let color: Color
    @Binding var selectedPointID: String?

    private var validPoints: [DEXATrendPoint] { series.points.filter { $0.value != nil } }
    private var selectedPoint: DEXATrendPoint? {
        (selectedPointID.flatMap { id in validPoints.first { $0.id == id } }) ?? validPoints.last
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if validPoints.count < 2 {
                Text("More scan history is needed to show a trend.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 100)
            } else {
                chart
                if let selectedPoint, let value = selectedPoint.value {
                    Text("\(TrainingDateFormatting.short(selectedPoint.date)): \(formatted(value))")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
    }

    private func formatted(_ value: Double) -> String {
        series.unit.isEmpty ? String(format: "%.2f", value) : "\(String(format: "%.1f", value))\(series.unit)"
    }

    private var chart: some View {
        Chart {
            ForEach(validPoints) { point in
                LineMark(x: .value("Date", point.date), y: .value("Value", point.value ?? 0))
                    .foregroundStyle(color)
                    .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
            }
            ForEach(validPoints) { point in
                let isSelected = point.id == selectedPoint?.id
                PointMark(x: .value("Date", point.date), y: .value("Value", point.value ?? 0))
                    .symbolSize(isSelected ? 80 : 24)
                    .foregroundStyle(color)
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .frame(height: 120)
        .chartScrub { location, proxy, geometry in selectNearest(at: location, proxy: proxy, geometry: geometry) }
        .accessibilityLabel("\(series.title) trend over \(validPoints.count) scans")
    }

    private func selectNearest(at location: CGPoint, proxy: ChartProxy, geometry: GeometryProxy) {
        let relativeX = geometry.relativeX(in: proxy, at: location)
        let touchedDate: String? = proxy.value(atX: relativeX)
        guard let nearest = ChartCategoricalSelection.nearestPoint(matching: touchedDate, in: validPoints, keyPath: \.date) else { return }
        selectedPointID = nearest.id
    }
}
