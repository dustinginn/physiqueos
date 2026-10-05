import Charts
import SwiftUI

/// Shared chart primitives for the 3 Nutrition Reporting screens — one
/// weekly line-trend chart type (Calories, Macros, Meals each show exactly
/// one), one bar-chart type (Average Daily Macros, Meal Distribution), and
/// one donut type (Macro Distribution, reused verbatim for Meal Macro Mix
/// — matching the web reusing `NutritionMacroDistributionChart` for both).
///
/// The web itself is **tap-to-select**, not drag-scrub: verified directly
/// from source that none of the 3 report charts has hover/pointer-scrub —
/// each point is a discrete `role="button"` the web selects via click or
/// Enter/Space, defaulting to the latest week until touched. Native's touch
/// equivalent standardizes on the same tap-and-drag `chartScrub` gesture
/// every other interactive Evidence chart uses (see `ChartInteraction.swift`
/// and this task's chart-interaction standardization pass): a continuous
/// horizontal drag is the natural mobile equivalent of "moving across
/// points to inspect them" even though web's own input is click-only, and a
/// plain tap still resolves identically to before (drag distance zero).

/// One weekly point on a line-trend chart, tap-selectable. Falls back to a
/// single centered dot + caption for exactly one point, and an empty
/// message for zero — mirroring `buildNutritionCalorieSeriesPaths`'s own
/// gap-preserving, no-fabricated-line behavior.
/// Locked `.chart`: teal-tinted field, 32 px grid, area + 3 px line,
/// ringed points, the selected week's value at top right, and the
/// selected-week detail line below. Scrubbing selects the nearest week.
struct NutritionTrendChartView: View {
    let points: [NutritionTrendPoint]
    let color: Color
    let valueLabel: (Double) -> String
    let emptyMessage: String
    @Binding var selectedWeekID: String?

    private let m = EvidenceMetrics(family: .daily)
    private var validPoints: [NutritionTrendPoint] { points.filter { $0.value != nil } }

    private var selectedPoint: NutritionTrendPoint? {
        (selectedWeekID.flatMap { id in validPoints.first { $0.id == id } }) ?? validPoints.last
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if validPoints.isEmpty {
                Text(emptyMessage)
                    .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.6))
                    .foregroundStyle(m.c.muted)
                    .frame(maxWidth: .infinity, minHeight: m.pt(100))
            } else if validPoints.count == 1, let only = validPoints.first, let value = only.value {
                VStack(spacing: m.pt(4)) {
                    Circle().fill(color).frame(width: m.pt(10), height: m.pt(10))
                    Text(valueLabel(value))
                        .evidenceText(.normal(11, 840))
                        .foregroundStyle(m.c.ink)
                    Text("More weekly history is needed to show a trend.")
                        .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.6))
                        .foregroundStyle(m.c.muted)
                }
                .frame(maxWidth: .infinity, minHeight: m.pt(100))
            } else {
                chartField
                detail
            }
        }
    }

    private var chartField: some View {
        ZStack(alignment: .topTrailing) {
            VStack(spacing: 0) {
                ForEach(0..<4, id: \.self) { _ in
                    Spacer(minLength: 0)
                    Rectangle().fill(m.c.line.opacity(0.75)).frame(height: m.pt(1))
                }
            }
            .padding(m.pt(12))
            Chart {
                ForEach(validPoints) { point in
                    AreaMark(x: .value("Week", point.weekStart), y: .value("Value", point.value ?? 0))
                        .foregroundStyle(color.opacity(0.13))
                        .interpolationMethod(.linear)
                    LineMark(x: .value("Week", point.weekStart), y: .value("Value", point.value ?? 0))
                        .foregroundStyle(color)
                        .lineStyle(StrokeStyle(lineWidth: m.pt(3), lineCap: .round, lineJoin: .round))
                }
                ForEach(validPoints) { point in
                    let isSelected = point.id == selectedPoint?.id
                    PointMark(x: .value("Week", point.weekStart), y: .value("Value", point.value ?? 0))
                        .symbol {
                            Circle()
                                .fill(m.c.page)
                                .overlay(Circle().stroke(color, lineWidth: m.pt(3)))
                                .frame(width: m.pt(isSelected ? 9.5 : 6), height: m.pt(isSelected ? 9.5 : 6))
                        }
                }
            }
            .chartXAxis(.hidden)
            .chartYAxis(.hidden)
            .chartYScale(domain: .automatic(includesZero: false))
            .padding(.horizontal, m.pt(12))
            .padding(.top, m.pt(30))
            .padding(.bottom, m.pt(12))
            .evidenceChartScrub { location, proxy, geometry in
                let relativeX = geometry.relativeX(in: proxy, at: location)
                let touchedWeek: String? = proxy.value(atX: relativeX)
                guard let nearest = ChartCategoricalSelection.nearestPoint(matching: touchedWeek, in: validPoints, keyPath: \.weekStart) else { return }
                selectedWeekID = nearest.id
            }
            .accessibilityLabel("Weekly trend over \(validPoints.count) weeks")
            if let selectedPoint, let value = selectedPoint.value {
                Text("\(valueLabel(value)) avg")
                    .evidenceText(.normal(10, 850, digits: true))
                    .foregroundStyle(color)
                    .padding(.top, m.pt(10))
                    .padding(.trailing, m.pt(12))
            }
        }
        .frame(height: m.pt(145))
        .background(
            LinearGradient(colors: [m.c.tealSoft, .clear], startPoint: .top, endPoint: .bottom),
            in: RoundedRectangle(cornerRadius: m.pt(12))
        )
        .clipShape(RoundedRectangle(cornerRadius: m.pt(12)))
    }

    @ViewBuilder
    private var detail: some View {
        if let selectedPoint, let value = selectedPoint.value {
            HStack {
                Text("\(TrainingDateFormatting.short(selectedPoint.weekStart)) – \(TrainingDateFormatting.short(selectedPoint.weekEnd))")
                    .evidenceText(.normal(9, 400))
                    .foregroundStyle(m.c.muted)
                Spacer(minLength: m.pt(8))
                Text("\(valueLabel(value)) average · \(selectedPoint.loggedDayCount) logged day\(selectedPoint.loggedDayCount == 1 ? "" : "s")")
                    .evidenceText(.normal(9, 700, digits: true))
                    .foregroundStyle(m.c.ink)
            }
            .padding(.top, m.pt(7))
            .accessibilityElement(children: .combine)
        }
    }
}

/// Locked `.bars`: 108 px tracks with colored fills (82 %), label then
/// value under each bar.
struct NutritionBarChartView: View {
    struct Bar: Identifiable {
        var id: String
        var label: String
        var value: Double
        var caption: String
        var color: Color
        var valueText: String? = nil
    }

    let bars: [Bar]
    let emptyMessage: String
    private let m = EvidenceMetrics(family: .daily)

    var body: some View {
        let maxValue = bars.map(\.value).max() ?? 0
        if maxValue <= 0 {
            Text(emptyMessage)
                .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.6))
                .foregroundStyle(m.c.muted)
                .frame(maxWidth: .infinity, minHeight: m.pt(80))
        } else {
            HStack(alignment: .bottom, spacing: m.pt(10)) {
                ForEach(bars) { bar in
                    VStack(spacing: 0) {
                        ZStack(alignment: .bottom) {
                            RoundedRectangle(cornerRadius: m.pt(7)).fill(m.c.surface2)
                            Rectangle()
                                .fill(bar.color.opacity(0.82))
                                .frame(height: m.pt(108) * CGFloat(bar.value / maxValue))
                        }
                        .frame(height: m.pt(108))
                        .clipShape(RoundedRectangle(cornerRadius: m.pt(7)))
                        Text(bar.label)
                            .evidenceText(.normal(8, 800))
                            .foregroundStyle(m.c.muted)
                            .lineLimit(1)
                            .padding(.top, m.pt(5))
                        Text(bar.value > 0 ? "\(bar.valueText ?? String(Int(bar.value.rounded()))) · \(bar.caption)" : "—")
                            .evidenceText(.normal(8, 850, digits: true))
                            .foregroundStyle(m.c.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.horizontal, m.pt(8))
            .padding(.top, m.pt(12))
            .padding(.bottom, m.pt(5))
        }
    }
}

/// Locked `.donut-wrap`: 128 px ring (25 px band) with a centered label and
/// a swatch legend (label left, percentage and grams right).
struct NutritionDonutChartView: View {
    struct Slice: Identifiable {
        var id: String
        var label: String
        var percentage: Int
        var grams: Double
        var color: Color
    }

    let slices: [Slice]
    let centerLabel: String
    let emptyMessage: String
    private let m = EvidenceMetrics(family: .daily)

    var body: some View {
        if slices.isEmpty || slices.allSatisfy({ $0.percentage == 0 }) {
            Text(emptyMessage)
                .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.6))
                .foregroundStyle(m.c.muted)
                .frame(maxWidth: .infinity, minHeight: m.pt(100))
        } else {
            HStack(spacing: m.pt(18)) {
                ring
                    .frame(width: m.pt(128), height: m.pt(128))
                VStack(alignment: .leading, spacing: m.pt(8)) {
                    ForEach(slices) { slice in
                        HStack(spacing: m.pt(7)) {
                            RoundedRectangle(cornerRadius: m.pt(3)).fill(slice.color).frame(width: m.pt(8), height: m.pt(8))
                            Text(slice.label)
                                .evidenceText(.normal(9, 400))
                                .foregroundStyle(m.c.muted)
                            Spacer(minLength: m.pt(4))
                            Text("\(slice.percentage)% · \(Int(slice.grams))g")
                                .evidenceText(.normal(9, 700, digits: true))
                                .foregroundStyle(m.c.ink)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            .padding(.vertical, m.pt(4))
            .padding(.horizontal, m.pt(3))
        }
    }

    private var ring: some View {
        let band = m.pt(25)
        return ZStack {
            ForEach(Array(segments.enumerated()), id: \.offset) { _, segment in
                Circle()
                    .trim(from: segment.start, to: segment.end)
                    .stroke(segment.slice.color, style: StrokeStyle(lineWidth: band, lineCap: .butt))
                    .rotationEffect(.degrees(-90))
                    .padding(band / 2)
            }
            Text(centerLabel)
                .evidenceText(EvidenceTextStyle(size: 8, weight: 800, lineHeight: 9.6))
                .foregroundStyle(m.c.muted)
                .multilineTextAlignment(.center)
                .padding(m.pt(38))
        }
        .accessibilityHidden(true)
    }

    private var segments: [(slice: Slice, start: CGFloat, end: CGFloat)] {
        var cursor: CGFloat = 0
        return slices.map { slice in
            let start = cursor
            let fraction = CGFloat(slice.percentage) / 100
            cursor += fraction
            return (slice, start, cursor.isFinite ? min(cursor, 1) : start)
        }
    }
}
