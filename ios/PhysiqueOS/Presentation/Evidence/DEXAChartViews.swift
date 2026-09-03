import Charts
import SwiftUI

/// The primary, interactive DEXA chart — used for "Body Fat %", the one
/// chart `DEXAReportScreen.jsx` shows first and largest ("Core Trends"
/// drawer, default-open). Tap-to-select nearest scan (matching the
/// interaction convention already established for every other Reporting
/// chart in this codebase except Weight's own richer drag-scrub), with a
/// below-chart "date: value" detail defaulting to the latest scan.
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
        .chartOverlay { proxy in
            GeometryReader { geometry in
                Rectangle().fill(.clear).contentShape(Rectangle())
                    .onTapGesture { location in selectNearest(at: location, proxy: proxy, geometry: geometry) }
            }
        }
        .accessibilityLabel("\(series.title) trend over \(validPoints.count) scans")
    }

    private func selectNearest(at location: CGPoint, proxy: ChartProxy, geometry: GeometryProxy) {
        let plotFrame = geometry[proxy.plotAreaFrame]
        let relativeX = location.x - plotFrame.origin.x
        guard let touchedDate: String = proxy.value(atX: relativeX) else { return }
        guard let nearest = validPoints.first(where: { $0.date == touchedDate }) ?? validPoints.last else { return }
        selectedPointID = nearest.id
    }
}

/// A compact, non-interactive sparkline row — used for the secondary DEXA
/// trend series (core mass/RMR, supplemental, regional) where a dozen full
/// interactive charts on one screen would be more clutter than signal.
/// Still a real chart of real trend data, not text-only: label, latest
/// value, and a small line sparkline.
struct DEXASparklineRow: View {
    let series: DEXAMetricSeries
    let color: Color

    private var validPoints: [DEXATrendPoint] { series.points.filter { $0.value != nil } }

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(series.title)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if let latest = validPoints.last?.value {
                    Text(series.unit.isEmpty ? String(format: "%.2f", latest) : "\(String(format: "%.1f", latest))\(series.unit)")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                } else {
                    Text("Pending")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
            Spacer(minLength: 8)
            if validPoints.count >= 2 {
                Chart {
                    ForEach(validPoints) { point in
                        LineMark(x: .value("Date", point.date), y: .value("Value", point.value ?? 0))
                            .foregroundStyle(color)
                            .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    }
                }
                .chartXAxis(.hidden)
                .chartYAxis(.hidden)
                .frame(width: 90, height: 32)
                .accessibilityHidden(true)
            }
        }
        .padding(.vertical, 4)
    }
}
