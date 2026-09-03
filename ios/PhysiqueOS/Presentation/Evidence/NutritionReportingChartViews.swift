import Charts
import SwiftUI

/// Shared chart primitives for the 3 Nutrition Reporting screens — one
/// weekly line-trend chart type (Calories, Macros, Meals each show exactly
/// one), one bar-chart type (Average Daily Macros, Meal Distribution), and
/// one donut type (Macro Distribution, reused verbatim for Meal Macro Mix
/// — matching the web reusing `NutritionMacroDistributionChart` for both).
/// Interaction is **tap-to-select**, not drag-scrub: verified directly from
/// source that none of the 3 report charts has hover/pointer-scrub — each
/// point is a discrete `role="button"` the web selects via click or
/// Enter/Space, defaulting to the latest week until touched. This
/// deliberately differs from the Weight Trend chart's own drag-scrub
/// (`WeightHistoryView.swift`), which genuinely does have that richer
/// pointer interaction on the web.

/// One weekly point on a line-trend chart, tap-selectable. Falls back to a
/// single centered dot + caption for exactly one point, and an empty
/// message for zero — mirroring `buildNutritionCalorieSeriesPaths`'s own
/// gap-preserving, no-fabricated-line behavior.
struct NutritionTrendChartView: View {
    let points: [NutritionTrendPoint]
    let color: Color
    let valueLabel: (Double) -> String
    let emptyMessage: String
    @Binding var selectedWeekID: String?

    private var validPoints: [NutritionTrendPoint] { points.filter { $0.value != nil } }

    private var selectedPoint: NutritionTrendPoint? {
        (selectedWeekID.flatMap { id in validPoints.first { $0.id == id } }) ?? validPoints.last
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if validPoints.isEmpty {
                Text(emptyMessage)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 100)
            } else if validPoints.count == 1, let only = validPoints.first, let value = only.value {
                VStack(spacing: 4) {
                    Circle().fill(color).frame(width: 10, height: 10)
                    Text(valueLabel(value))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text("More weekly history is needed to show a trend.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                .frame(maxWidth: .infinity, minHeight: 100)
            } else {
                chart
                detail
            }
        }
    }

    private var chart: some View {
        Chart {
            ForEach(validPoints) { point in
                LineMark(x: .value("Week", point.weekStart), y: .value("Value", point.value ?? 0))
                    .foregroundStyle(color)
                    .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
            }
            ForEach(validPoints) { point in
                let isSelected = point.id == selectedPoint?.id
                PointMark(x: .value("Week", point.weekStart), y: .value("Value", point.value ?? 0))
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
        .accessibilityLabel("Weekly trend over \(validPoints.count) weeks")
    }

    private func selectNearest(at location: CGPoint, proxy: ChartProxy, geometry: GeometryProxy) {
        let plotFrame = geometry[proxy.plotAreaFrame]
        let relativeX = location.x - plotFrame.origin.x
        guard let touchedWeek: String = proxy.value(atX: relativeX) else { return }
        guard let nearest = validPoints.first(where: { $0.weekStart == touchedWeek }) ?? validPoints.last else { return }
        selectedWeekID = nearest.id
    }

    /// The below-chart "Selected Week" detail — week range, average value,
    /// logged days. (Per-week Lowest/Highest-day breakdown, which the web
    /// also shows here, is not modeled in this pass's `NutritionTrendPoint`
    /// — a disclosed simplification, see this port's final report.)
    private var detail: some View {
        Group {
            if let selectedPoint, let value = selectedPoint.value {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(TrainingDateFormatting.short(selectedPoint.weekStart)) – \(TrainingDateFormatting.short(selectedPoint.weekEnd))")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text("\(valueLabel(value)) average · \(selectedPoint.loggedDayCount) logged day\(selectedPoint.loggedDayCount == 1 ? "" : "s")")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(PhysiqueOSTheme.surfaceMuted)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }
}

/// A simple proportional-height vertical bar chart — "Average Daily
/// Macros" and "Meal Distribution" both use this shape (label + value +
/// caption per bar, colored per-bar).
struct NutritionBarChartView: View {
    struct Bar: Identifiable {
        var id: String
        var label: String
        var value: Double
        var caption: String
        var color: Color
    }

    let bars: [Bar]
    let emptyMessage: String

    var body: some View {
        let maxValue = bars.map(\.value).max() ?? 0
        if maxValue <= 0 {
            Text(emptyMessage)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 80)
        } else {
            HStack(alignment: .bottom, spacing: 12) {
                ForEach(bars) { bar in
                    VStack(spacing: 4) {
                        Text(bar.value > 0 ? String(Int(bar.value.rounded())) : "—")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        RoundedRectangle(cornerRadius: 4)
                            .fill(bar.color)
                            .frame(height: max(4, 84 * bar.value / maxValue))
                        Text(bar.label)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        Text(bar.caption)
                            .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 140, alignment: .bottom)
        }
    }
}

/// A ring/donut chart built from `Circle().trim` arcs — approximates the
/// web's CSS `conic-gradient` donut visually (segments, center label,
/// legend rows with a color dot + "{pct}% · {grams}g"). Reused verbatim by
/// both "Macro Distribution" and "Meal Macro Mix", matching the web's own
/// component reuse.
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

    var body: some View {
        if slices.isEmpty || slices.allSatisfy({ $0.percentage == 0 }) {
            Text(emptyMessage)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 100)
        } else {
            HStack(spacing: 16) {
                ring
                    .frame(width: 96, height: 96)
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(slices) { slice in
                        HStack(spacing: 6) {
                            Circle().fill(slice.color).frame(width: 8, height: 8)
                            Text("\(slice.label) \(slice.percentage)% · \(Int(slice.grams))g")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }

    private var ring: some View {
        ZStack {
            ForEach(Array(segments.enumerated()), id: \.offset) { _, segment in
                Circle()
                    .trim(from: segment.start, to: segment.end)
                    .stroke(segment.slice.color, style: StrokeStyle(lineWidth: 16, lineCap: .butt))
                    .rotationEffect(.degrees(-90))
            }
            Text(centerLabel)
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
                .multilineTextAlignment(.center)
                .padding(8)
        }
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
