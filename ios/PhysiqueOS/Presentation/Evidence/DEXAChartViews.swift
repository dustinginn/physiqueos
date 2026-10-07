import Charts
import SwiftUI

/// One locked DEXA `.chart-block`: title, source note, the 92-px trend
/// field (two quiet rules at 33% / 66%, an inset line and a ringed dot on
/// the selected scan), the selected `date / title: value` line and the
/// first-date · latest-value · last-date axis. Every DEXA series uses this
/// one interactive component: a tap selects the nearest scan and a
/// horizontal-only pan scrubs, while a vertical swipe that starts on the
/// chart still scrolls the page (`evidenceChartScrub`).
struct DEXATrendChartView: View {
    let series: DEXAMetricSeries
    let color: Color
    var note = "Structured values extracted from BodySpec reports."
    @Binding var selectedPointID: String?
    private let m = EvidenceMetrics(family: .record, domain: .dexa)

    private var validPoints: [DEXATrendPoint] { series.points.filter { $0.value != nil } }
    private var selectedPoint: DEXATrendPoint? {
        (selectedPointID.flatMap { id in validPoints.first { $0.id == id } }) ?? validPoints.last
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(series.title)
                .evidenceText(.normal(12, 800, jakarta: false, relativeTo: .subheadline))
                .foregroundStyle(m.c.ink)
            Text(note)
                .evidenceText(EvidenceTextStyle(size: 8, weight: 400, lineHeight: 10.8, relativeTo: .caption2))
                .foregroundStyle(m.c.quiet)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, m.pt(2))
            if validPoints.count < 2 {
                Text("More scan history is needed to show a trend.")
                    .evidenceText(RecordText.rowCopy)
                    .foregroundStyle(m.c.quiet)
                    .frame(maxWidth: .infinity, minHeight: m.pt(92), alignment: .center)
                    .padding(.top, m.pt(8))
            } else {
                field
                    .padding(.top, m.pt(8))
                if let selectedPoint, let value = selectedPoint.value {
                    Text("\(RecordDate.long(selectedPoint.date)) / \(series.title): \(formatted(value))")
                        .evidenceText(RecordText.rowCopy)
                        .foregroundStyle(m.c.quiet)
                        .padding(.top, m.pt(3))
                        .accessibilityIdentifier("dexa.chart.selection")
                }
                HStack(spacing: 0) {
                    Text(TrainingDateFormatting.short(validPoints.first!.date))
                    Spacer(minLength: m.pt(4))
                    if let latest = validPoints.last?.value { Text(formatted(latest)) }
                    Spacer(minLength: m.pt(4))
                    Text(TrainingDateFormatting.short(validPoints.last!.date))
                }
                .evidenceText(.normal(8, 400, jakarta: false, relativeTo: .caption2))
                .foregroundStyle(m.c.quiet)
                .padding(.top, m.pt(5))
                .accessibilityHidden(true)
            }
        }
        .padding(m.pt(11))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(12)))
        .accessibilityElement(children: .contain)
    }

    private func formatted(_ value: Double) -> String {
        series.unit.isEmpty ? String(format: "%.2f", value) : "\(String(format: "%.1f", value))\(series.unit)"
    }

    /// The locked field draws the series between 18/76 and 62/76 of its
    /// height (`viewBox 0 0 300 76`), so the domain is padded to place the
    /// highest scan 18 units from the top and the lowest 14 from the bottom.
    private var domain: ClosedRange<Double> {
        let values = validPoints.compactMap(\.value)
        var low = values.min() ?? 0, high = values.max() ?? 1
        if low == high { low -= 1; high += 1 }
        let span = high - low
        return (low - span * 14 / 44)...(high + span * 18 / 44)
    }

    /// `.chart`: 92 px, 9-px radius, rules at 33% and 66%; the series is
    /// inset 8 px inside it.
    private var field: some View {
        ZStack {
            VStack(spacing: 0) {
                Spacer().frame(height: m.pt(92) * 0.33)
                Rectangle().fill(m.c.line).frame(height: m.pt(1))
                Spacer().frame(height: m.pt(92) * 0.32)
                Rectangle().fill(m.c.line).frame(height: m.pt(1))
                Spacer(minLength: 0)
            }
            .accessibilityHidden(true)
            Chart {
                ForEach(validPoints) { point in
                    LineMark(x: .value("Date", point.date), y: .value("Value", point.value ?? 0))
                        .foregroundStyle(color)
                        .lineStyle(StrokeStyle(lineWidth: m.pt(2.5), lineCap: .round, lineJoin: .round))
                }
                if let selectedPoint, let value = selectedPoint.value {
                    PointMark(x: .value("Date", selectedPoint.date), y: .value("Value", value))
                        .symbol {
                            Circle()
                                .fill(m.c.page)
                                .overlay(Circle().stroke(m.c.blue, lineWidth: m.pt(2)))
                                .frame(width: m.pt(7), height: m.pt(7))
                        }
                }
            }
            .chartXAxis(.hidden)
            .chartYAxis(.hidden)
            .chartLegend(.hidden)
            .chartYScale(domain: domain)
            .chartXScale(range: .plotDimension(padding: m.pt(264 * 5 / 300)))
            .evidenceChartScrub { location, proxy, geometry in selectNearest(at: location, proxy: proxy, geometry: geometry) }
            .padding(m.pt(8))
            .accessibilityElement()
            .accessibilityLabel("\(series.title) trend over \(validPoints.count) scans")
            .accessibilityValue(selectedPoint.flatMap { point in point.value.map { "\(RecordDate.long(point.date)), \(formatted($0))" } } ?? "")
            .accessibilityIdentifier("dexa.chart.\(series.title)")
        }
        .frame(height: m.pt(92))
        .clipShape(RoundedRectangle(cornerRadius: m.pt(9)))
    }

    private func selectNearest(at location: CGPoint, proxy: ChartProxy, geometry: GeometryProxy) {
        let relativeX = geometry.relativeX(in: proxy, at: location)
        let touchedDate: String? = proxy.value(atX: relativeX)
        guard let nearest = ChartCategoricalSelection.nearestPoint(matching: touchedDate, in: validPoints, keyPath: \.date) else { return }
        selectedPointID = nearest.id
    }
}
