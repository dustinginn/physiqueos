import Accessibility
import Charts
import SwiftUI

// Recovery / Sleep Evidence charts. Every value plotted comes straight from
// the Server read model; nothing is aggregated or inferred here.
//
// Presentation follows the Founder-locked Recovery design
// (`energy-weight-recovery-evidence-style-translation-20261004` R1–R6 and
// Founder correction `a21296ec` R1–R2) in the `.weight` harness family.
// Every interactive chart uses the shared Evidence arbitration: a tap
// selects, a predominantly horizontal pan scrubs, and a vertical swipe that
// starts on a chart scrolls the page.

/// The locked Recovery stage and series colors (`evidence.css`
/// `--cyan/--deep/--core/--rem/--awake`, dark / mineral light).
enum SleepPalette {
    static let total = color(0x5DD5CF, 0x167D78)
    static let deep = color(0x6F86FF, 0x4357C5)
    static let core = color(0x55AEF5, 0x2D78AD)
    static let rem = color(0xB184F5, 0x7954B1)
    static let awake = color(0xF0A45F, 0xB66B2D)
    static let unspecified = color(0x5DD5CF, 0x167D78, 0.72)
    static var inBed: Color { EvidenceFamily.weight.palette.line }

    static func stage(_ stage: RecoverySleepStage) -> Color {
        switch stage {
        case .deep: deep
        case .core: core
        case .rem: rem
        case .awake: awake
        case .unspecified, .unknown: unspecified
        }
    }

    private static func color(_ dark: UInt32, _ light: UInt32, _ opacity: CGFloat = 1) -> Color {
        Color(uiColor: UIColor { traits in
            let hex = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                           blue: CGFloat(hex & 0xFF) / 255, alpha: opacity)
        })
    }
}

private let chartMetrics = EvidenceMetrics(family: .weight, domain: .recovery)

private func axisLabel(_ text: String) -> some View {
    Text(text)
        .font(.system(size: chartMetrics.pt(8.5), weight: .medium))
        .monospacedDigit()
        .foregroundStyle(chartMetrics.c.quiet)
}

/// The shared vertical tick grid + labels every longitudinal Sleep chart draws
/// from the one `SleepAxisPolicy.Plan`, so labels align across charts.
@AxisContentBuilder
private func sleepDateAxisMarks(_ plan: SleepAxisPolicy.Plan, showsLabels: Bool = true) -> some AxisContent {
    AxisMarks(values: plan.tickDates) { value in
        AxisGridLine().foregroundStyle(chartMetrics.c.line.opacity(0.6))
        if showsLabels {
            AxisValueLabel(anchor: .top) {
                if let date = value.as(Date.self), let label = plan.label(for: date) { axisLabel(label) }
            }
        }
    }
}

/// Tap and horizontal-scrub arbitration for the Sleep charts. `onTap` and
/// `onScrub` receive the touch in the plot's coordinate space.
private struct SleepChartInteraction: ViewModifier {
    let onTap: (CGPoint, ChartProxy, GeometryProxy) -> Void
    let onScrub: (CGPoint, ChartProxy, GeometryProxy) -> Void

    func body(content: Content) -> some View {
        content.chartOverlay { proxy in
            GeometryReader { geometry in
                Rectangle().fill(.clear).contentShape(Rectangle())
                    .onTapGesture(coordinateSpace: .local) { location in onTap(location, proxy, geometry) }
                    .gesture(EvidenceHorizontalScrubGesture { location in onScrub(location, proxy, geometry) })
            }
        }
    }
}

private extension View {
    func sleepChartInteraction(
        onTap: @escaping (CGPoint, ChartProxy, GeometryProxy) -> Void,
        onScrub: @escaping (CGPoint, ChartProxy, GeometryProxy) -> Void
    ) -> some View {
        modifier(SleepChartInteraction(onTap: onTap, onScrub: onScrub))
    }
}

private func plotDate(at location: CGPoint, proxy: ChartProxy, geometry: GeometryProxy) -> Date? {
    guard let frame = proxy.plotFrame else { return nil }
    return proxy.value(atX: location.x - geometry[frame].origin.x)
}

/// `.legend` swatch: 12 × 3 px bar, 9 px label.
struct SleepLegendItem: View {
    let color: Color
    let label: String
    var dashed = false

    var body: some View {
        let m = chartMetrics
        HStack(spacing: m.pt(4)) {
            if dashed {
                HStack(spacing: m.pt(2)) {
                    RoundedRectangle(cornerRadius: m.pt(3)).fill(color).frame(width: m.pt(5), height: m.pt(3))
                    RoundedRectangle(cornerRadius: m.pt(3)).fill(color).frame(width: m.pt(5), height: m.pt(3))
                }
            } else {
                RoundedRectangle(cornerRadius: m.pt(3)).fill(color).frame(width: m.pt(12), height: m.pt(3))
            }
            Text(label)
                .evidenceText(.normal(9, 700, jakarta: false))
                .foregroundStyle(m.c.quiet)
        }
    }
}

// MARK: - Total sleep: nightly (or weekly) bars + Server trailing average

struct SleepTotalChartPoint: Identifiable, Equatable {
    let id: String
    let date: Date
    let asleepSeconds: Int?
    let averageSeconds: Int?
}

extension SleepTotalChartPoint {
    static func fromLanding(_ landing: RecoverySleepLanding) -> [SleepTotalChartPoint] {
        let averages = Dictionary(landing.trailingAverages.map { ($0.sleepDay, $0.asleepSeconds) }, uniquingKeysWith: { first, _ in first })
        return landing.nights.compactMap { night in
            SleepEvidenceFormat.chartDate(night.sleepDay).map {
                SleepTotalChartPoint(id: night.sleepDay, date: $0, asleepSeconds: night.asleepSeconds, averageSeconds: averages[night.sleepDay] ?? nil)
            }
        }
    }

    static func fromTrends(_ trends: RecoverySleepTrends) -> [SleepTotalChartPoint] {
        trends.totalSleep.compactMap { point in
            SleepEvidenceFormat.chartDate(point.periodStart).map {
                SleepTotalChartPoint(id: point.periodStart, date: $0, asleepSeconds: point.asleepSeconds, averageSeconds: point.trailingAverageSeconds)
            }
        }
    }
}

/// Root R1 histogram and Trends R3 weekly bars: cyan bars with the Server's
/// trailing 7-night average as a dashed ink line. Trends R2 nightly
/// (`style: .area`) draws the same values as the locked cyan line with a
/// soft area inside the surface-2 field. A tap toggles a night; a
/// horizontal pan scrubs.
struct SleepTotalChart: View {
    enum Style { case bars, area }

    /// Newest first.
    let points: [SleepTotalChartPoint]
    var isWeekly = false
    var style: Style = .bars
    let plan: SleepAxisPolicy.Plan
    @Binding var selectedId: String?
    var height: CGFloat = 176

    private let m = chartMetrics

    private var maximumHours: Double {
        max(9, ceil((points.compactMap(\.asleepSeconds).max().map { Double($0) / 3600 } ?? 8) + 0.5))
    }

    /// The nightly line sits in a tighter field (whole hours below the
    /// shortest night) so night-to-night variation stays readable; bars
    /// always start at zero.
    private var minimumHours: Double { Self.floorHours(points: points, style: style) }

    /// Approved delta 6: the nightly line's floor is one whole hour below the
    /// shortest night; bar summaries (root, weekly) always start at zero.
    static func floorHours(points: [SleepTotalChartPoint], style: Style) -> Double {
        guard style == .area, let low = points.compactMap(\.asleepSeconds).min() else { return 0 }
        return max(0, floor(Double(low) / 3600) - 1)
    }

    private var yTicks: [Double] {
        minimumHours == 0 ? [0, 3, 6, 9] : Array(stride(from: minimumHours, through: maximumHours, by: 1))
    }

    private func opacity(_ point: SleepTotalChartPoint) -> Double {
        selectedId == nil || selectedId == point.id ? 1 : 0.42
    }

    var body: some View {
        let ordered = Array(points.reversed())
        let selected = selectedId.flatMap { id in points.first { $0.id == id } }
        Chart {
            if style == .area {
                ForEach(ordered.filter { $0.asleepSeconds != nil }) { point in
                    AreaMark(x: .value("Night", point.date, unit: .day), yStart: .value("Floor", minimumHours), yEnd: .value("Asleep", Double(point.asleepSeconds ?? 0) / 3600))
                        .interpolationMethod(.linear)
                        .foregroundStyle(SleepPalette.total.opacity(0.16))
                    LineMark(x: .value("Night", point.date, unit: .day), y: .value("Asleep", Double(point.asleepSeconds ?? 0) / 3600),
                             series: .value("Series", "Total"))
                        .interpolationMethod(.linear)
                        .lineStyle(StrokeStyle(lineWidth: m.pt(3), lineCap: .round, lineJoin: .round))
                        .foregroundStyle(SleepPalette.total)
                }
                if let selected, let seconds = selected.asleepSeconds {
                    RuleMark(x: .value("Selected", selected.date, unit: .day))
                        .foregroundStyle(m.c.muted.opacity(0.45))
                    PointMark(x: .value("Night", selected.date, unit: .day), y: .value("Asleep", Double(seconds) / 3600))
                        .symbol {
                            Circle().fill(m.c.page).overlay(Circle().stroke(SleepPalette.total, lineWidth: m.pt(2)))
                                .frame(width: m.pt(8), height: m.pt(8))
                        }
                }
            } else {
                ForEach(ordered) { point in
                    if let seconds = point.asleepSeconds {
                        BarMark(
                            x: .value("Night", point.date, unit: isWeekly ? .weekOfYear : .day),
                            y: .value("Asleep", Double(seconds) / 3600),
                            width: .ratio(isWeekly ? 0.55 : 0.78)
                        )
                        .clipShape(UnevenRoundedRectangle(topLeadingRadius: m.pt(4), bottomLeadingRadius: m.pt(2), bottomTrailingRadius: m.pt(2), topTrailingRadius: m.pt(4)))
                        .foregroundStyle(SleepPalette.total.opacity(opacity(point)))
                    }
                }
            }
            ForEach(ordered.filter { $0.averageSeconds != nil }) { point in
                LineMark(
                    x: .value("Night", point.date, unit: .day),
                    y: .value("7-night average", Double(point.averageSeconds ?? 0) / 3600),
                    series: .value("Series", "Average")
                )
                .interpolationMethod(.monotone)
                .lineStyle(StrokeStyle(lineWidth: m.pt(1.6), dash: [m.pt(4), m.pt(3)]))
                .foregroundStyle(m.c.ink.opacity(0.72))
            }
        }
        .chartYScale(domain: minimumHours...maximumHours)
        .chartYAxis {
            AxisMarks(position: .leading, values: yTicks) { value in
                AxisGridLine().foregroundStyle(m.c.line)
                AxisValueLabel { axisLabel("\(Int(value.as(Double.self) ?? 0))h") }
            }
        }
        .chartXScale(domain: plan.domain)
        .chartXAxis { sleepDateAxisMarks(plan) }
        .sleepChartInteraction(
            onTap: { location, proxy, geometry in
                let nearest = nearestId(to: plotDate(at: location, proxy: proxy, geometry: geometry))
                selectedId = selectedId == nearest ? nil : nearest
            },
            onScrub: { location, proxy, geometry in
                if let nearest = nearestId(to: plotDate(at: location, proxy: proxy, geometry: geometry)) { selectedId = nearest }
            }
        )
        .padding(style == .area ? m.pt(10) : 0)
        .frame(height: height)
        .background {
            if style == .area { RoundedRectangle(cornerRadius: m.pt(12)).fill(m.c.surface2) }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(isWeekly ? "Average sleep per week" : "Total sleep per night")
        .accessibilityValue(summary)
        .accessibilityChartDescriptor(SleepTotalChartDescriptor(points: ordered, isWeekly: isWeekly))
        .accessibilityIdentifier("sleep.total.chart")
    }

    private func nearestId(to date: Date?) -> String? {
        guard let date else { return nil }
        return points.filter { $0.asleepSeconds != nil }
            .min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) }?.id
    }

    private var summary: String {
        let values = points.compactMap(\.asleepSeconds)
        guard !values.isEmpty else { return "No sleep data" }
        return "\(values.count) \(isWeekly ? "weeks" : "nights"), average \(SleepEvidenceFormat.spokenDuration(values.reduce(0, +) / values.count))"
    }
}

private struct SleepTotalChartDescriptor: AXChartDescriptorRepresentable {
    let points: [SleepTotalChartPoint]
    let isWeekly: Bool

    func makeChartDescriptor() -> AXChartDescriptor {
        let labels = points.map { $0.date.formatted(.dateTime.month(.abbreviated).day()) }
        let xAxis = AXCategoricalDataAxisDescriptor(title: isWeekly ? "Week" : "Night", categoryOrder: labels)
        let hours = points.compactMap(\.asleepSeconds).map { Double($0) / 3600 }
        let yAxis = AXNumericDataAxisDescriptor(
            title: "Hours asleep", range: 0...max(9, hours.max() ?? 9), gridlinePositions: [0, 3, 6, 9]
        ) { SleepEvidenceFormat.spokenDuration(Int($0 * 3600)) }
        let series = AXDataSeriesDescriptor(
            name: "Total sleep", isContinuous: false,
            dataPoints: zip(points, labels).compactMap { point, label in
                point.asleepSeconds.map { AXDataPoint(x: label, y: Double($0) / 3600) }
            }
        )
        return AXChartDescriptor(title: "Total sleep", summary: nil, xAxis: xAxis, yAxis: yAxis, additionalAxes: [], series: [series])
    }
}

// MARK: - Sleep window (consistency): one floating bar per night on a clock axis

struct SleepWindowChartRow: Identifiable, Equatable {
    let id: String
    let label: String
    let startMinutes: Int
    let endMinutes: Int
    let includedInConsistency: Bool
}

extension SleepWindowChartRow {
    /// Landing nights carry instants + zone; minutes after 18:00 are derived
    /// in the night's own (Server-provided) zone. Nights without a window
    /// are omitted.
    static func fromNights(_ nights: [RecoverySleepNightSummary]) -> [SleepWindowChartRow] {
        nights.compactMap { night in
            let clock = night.clock
            guard night.hasSleep, let start = clock.start, let end = clock.end else { return nil }
            let startMinutes = minutesAfterSix(start, clock.zone)
            let endMinutes = minutesAfterSix(end, clock.zone)
            return SleepWindowChartRow(
                id: night.sleepDay, label: SleepEvidenceFormat.sleepDay(night.sleepDay, style: "MMM d"),
                // Clamp a sleep that began before 18:00 so the bar never inverts.
                startMinutes: startMinutes <= endMinutes ? startMinutes : 0, endMinutes: endMinutes,
                includedInConsistency: night.includedInConsistency
            )
        }
    }

    static func fromTrends(_ rows: [RecoverySleepTrends.WindowRow]) -> [SleepWindowChartRow] {
        rows.map {
            SleepWindowChartRow(id: $0.sleepDay, label: SleepEvidenceFormat.sleepDay($0.sleepDay, style: "MMM d"),
                                startMinutes: $0.startMinutes, endMinutes: $0.endMinutes, includedInConsistency: $0.includedInConsistency)
        }
    }

    static func minutesAfterSix(_ date: Date, _ zone: TimeZone) -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return ((parts.hour ?? 0) * 60 + (parts.minute ?? 0) - 18 * 60 + 1440) % 1440
    }
}

/// Locked `.window-chart`: a 7 px surface-2 track per night with the cyan
/// sleep bar inside it, newest at the top, the typical window as a faint
/// band between dashed rules.
struct SleepWindowChart: View {
    /// Newest first (drawn at the top).
    let rows: [SleepWindowChartRow]
    let summary: RecoverySleepWindowSummary?
    /// The same plan the date charts use: rows are labelled on the plan's tick
    /// days so a night's label lines up with every other Sleep chart.
    let plan: SleepAxisPolicy.Plan
    var rowHeight: CGFloat = 13
    private let m = chartMetrics

    private var rowLabels: [String] {
        SleepAxisPolicy.rowLabels(plan: plan, rowDays: rows.map(\.id))
    }

    var body: some View {
        // Two empty hours on the left keep row labels clear of the bars.
        let rawLower = Double((rows.map(\.startMinutes).min() ?? 240) / 60 * 60 - 120)
        let rawUpper = Double(((rows.map(\.endMinutes).max() ?? 780) + 59) / 60 * 60 + 30)
        let lower = min(rawLower, rawUpper - 240)
        let upper = max(rawUpper, lower + 240)
        Chart {
            ForEach(rows) { row in
                BarMark(
                    xStart: .value("Track start", lower + 90),
                    xEnd: .value("Track end", upper),
                    y: .value("Night", row.label),
                    height: .fixed(m.pt(7))
                )
                .cornerRadius(m.pt(3.5))
                .foregroundStyle(m.c.surface2)
            }
            if let start = summary?.typicalStartMinutes, let end = summary?.typicalEndMinutes {
                RectangleMark(xStart: .value("Typical start", Double(start)), xEnd: .value("Typical end", Double(end)))
                    .foregroundStyle(SleepPalette.total.opacity(0.07))
                RuleMark(x: .value("Typical start", Double(start)))
                    .lineStyle(StrokeStyle(lineWidth: m.pt(1), dash: [m.pt(3), m.pt(3)]))
                    .foregroundStyle(m.c.quiet.opacity(0.7))
                RuleMark(x: .value("Typical end", Double(end)))
                    .lineStyle(StrokeStyle(lineWidth: m.pt(1), dash: [m.pt(3), m.pt(3)]))
                    .foregroundStyle(m.c.quiet.opacity(0.7))
            }
            ForEach(rows) { row in
                BarMark(
                    xStart: .value("Fell asleep", Double(row.startMinutes)),
                    xEnd: .value("Woke up", Double(row.endMinutes)),
                    y: .value("Night", row.label),
                    height: .fixed(m.pt(7))
                )
                .cornerRadius(m.pt(3.5))
                // Historical bars keep normal prominence: the Server's exclusion
                // of uncertain nights applies to the typical-window statistics,
                // not to how the night is drawn.
                .foregroundStyle(SleepPalette.total)
            }
        }
        .chartXScale(domain: lower...upper)
        .chartXAxis {
            AxisMarks(values: Array(stride(from: lower + 120, through: upper - 45, by: 120))) { value in
                AxisGridLine().foregroundStyle(m.c.line.opacity(0.6))
                AxisValueLabel { axisLabel(SleepEvidenceFormat.axisClock(value.as(Double.self) ?? 0)) }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: rowLabels) { value in
                AxisValueLabel(horizontalSpacing: m.pt(6)) { axisLabel(value.as(String.self) ?? "") }
            }
        }
        .frame(height: CGFloat(rows.count) * rowHeight + 28)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Sleep window for \(rows.count) nights")
        .accessibilityValue(accessibilitySummary)
        .accessibilityChartDescriptor(SleepWindowChartDescriptor(rows: Array(rows.reversed())))
    }

    private var accessibilitySummary: String {
        guard let start = summary?.typicalStartMinutes, let end = summary?.typicalEndMinutes else { return "No typical window yet" }
        let excluded = rows.filter { !$0.includedInConsistency }.count
        return "Typically \(SleepEvidenceFormat.clockFromMinutes(start)) to \(SleepEvidenceFormat.clockFromMinutes(end))"
            + (excluded > 0 ? ". \(excluded) nights have approximate clock times and are not counted in the typical window." : "")
    }
}

private struct SleepWindowChartDescriptor: AXChartDescriptorRepresentable {
    let rows: [SleepWindowChartRow]

    func makeChartDescriptor() -> AXChartDescriptor {
        let xAxis = AXCategoricalDataAxisDescriptor(title: "Night", categoryOrder: rows.map(\.label))
        let yAxis = AXNumericDataAxisDescriptor(title: "Clock time", range: 0...1440, gridlinePositions: []) {
            SleepEvidenceFormat.clockFromMinutes(Int($0))
        }
        let fell = AXDataSeriesDescriptor(name: "Fell asleep", isContinuous: false,
                                          dataPoints: rows.map { AXDataPoint(x: $0.label, y: Double($0.startMinutes)) })
        let woke = AXDataSeriesDescriptor(name: "Woke up", isContinuous: false,
                                          dataPoints: rows.map { AXDataPoint(x: $0.label, y: Double($0.endMinutes)) })
        return AXChartDescriptor(title: "Sleep window", summary: nil, xAxis: xAxis, yAxis: yAxis, additionalAxes: [], series: [fell, woke])
    }
}

// MARK: - Hypnogram (night detail only)

/// Founder correction R1: the contained interactive Timeline. Instruction
/// line, four stage lanes with transitions inside a surface-2 shell, a time
/// axis and the legend all stay inside the card at phone width. A tap
/// inspects a stage; a horizontal pan scrubs across the night.
struct SleepHypnogramView: View {
    let segments: [RecoverySleepNightDetail.Segment]
    let zone: TimeZone
    let inBedStart: Date?
    let inBedEnd: Date?
    /// Server-flagged uncertain clock times: readouts are marked approximate.
    var approximate = false
    @State private var selected: Date?
    private let m = chartMetrics

    private struct Parsed: Identifiable, Equatable {
        let id: Int
        let stage: RecoverySleepStage
        let start: Date
        let end: Date
    }

    private var parsed: [Parsed] {
        segments.enumerated().compactMap { index, segment in
            guard let start = SleepEvidenceFormat.instant(segment.start), let end = SleepEvidenceFormat.instant(segment.end), end > start else { return nil }
            return Parsed(id: index, stage: segment.stage, start: start, end: end)
        }
    }

    private var lanes: [String] {
        let stages = Set(parsed.map(\.stage))
        let ordered: [RecoverySleepStage] = stages.contains(.unspecified) && stages.isSubset(of: [.unspecified, .awake])
            ? [.awake, .unspecified] : [.awake, .rem, .core, .deep]
        return ordered.map(\.label)
    }

    private var domain: ClosedRange<Date> {
        let starts = parsed.map(\.start) + [inBedStart].compactMap { $0 }
        let ends = parsed.map(\.end) + [inBedEnd].compactMap { $0 }
        let low = (starts.min() ?? .now).addingTimeInterval(-20 * 60)
        let high = (ends.max() ?? .now).addingTimeInterval(20 * 60)
        return low...max(high, low.addingTimeInterval(3600))
    }

    private var hourMarks: [Date] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let range = domain
        guard var cursor = calendar.dateInterval(of: .hour, for: range.lowerBound)?.start else { return [] }
        var marks: [Date] = []
        while cursor < range.upperBound {
            if calendar.component(.hour, from: cursor) % 2 == 0,
               cursor.timeIntervalSince(range.lowerBound) > 25 * 60, range.upperBound.timeIntervalSince(cursor) > 25 * 60 {
                marks.append(cursor)
            }
            cursor = cursor.addingTimeInterval(3600)
        }
        return marks
    }

    private var selectedSegment: Parsed? {
        guard let selected else { return nil }
        return parsed.first { $0.start <= selected && selected < $0.end }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Group {
                if let segment = selectedSegment {
                    HStack(spacing: m.pt(5)) {
                        RoundedRectangle(cornerRadius: m.pt(2)).fill(SleepPalette.stage(segment.stage)).frame(width: m.pt(9), height: m.pt(7))
                        Text("\(segment.stage.label) · \(approximate ? "≈ " : "")\(SleepEvidenceFormat.clock(segment.start, in: zone))–\(SleepEvidenceFormat.clock(segment.end, in: zone))")
                    }
                } else {
                    Text(approximate ? "Touch and drag to inspect a stage. Clock times are approximate." : "Touch and drag across the timeline to inspect a stage.")
                }
            }
            .evidenceText(.normal(9, 600, jakarta: false))
            .foregroundStyle(m.c.muted)
            .frame(minHeight: m.pt(12), alignment: .leading)
            .padding(.bottom, m.pt(9))
            .accessibilityIdentifier("sleep.timeline.readout")

            HStack(alignment: .top, spacing: m.pt(7)) {
                // `.timeline-y`: a fixed 43 px lane-label column.
                VStack(spacing: 0) {
                    ForEach(lanes, id: \.self) { lane in
                        axisLabel(lane)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
                    }
                }
                .frame(width: m.pt(36), height: plotHeight)
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 0) {
                    plot
                    timeAxis
                }
            }
            HStack(spacing: m.pt(11)) {
                ForEach(lanes, id: \.self) { lane in
                    let stage = RecoverySleepStage.allCases.first { $0.label == lane } ?? .unknown
                    legendChip(SleepPalette.stage(stage), lane)
                }
                if inBedStart != nil { legendChip(SleepPalette.inBed, "In bed") }
            }
            .padding(.top, m.pt(9))
            .accessibilityHidden(true)
        }
        .padding(.horizontal, m.pt(10))
        .padding(.top, m.pt(12))
        .padding(.bottom, m.pt(10))
        .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(12)))
        .clipShape(RoundedRectangle(cornerRadius: m.pt(12)))
    }

    private var plotHeight: CGFloat { lanes.count > 2 ? m.pt(132) : m.pt(66) }

    private var plot: some View {
        Chart {
            if let inBedStart, let inBedEnd {
                RectangleMark(xStart: .value("In bed", inBedStart), xEnd: .value("Out of bed", inBedEnd))
                    .foregroundStyle(SleepPalette.inBed.opacity(0.35))
            }
            ForEach(Array(zip(parsed, parsed.dropFirst())), id: \.0.id) { pair in
                if pair.0.end == pair.1.start {
                    RuleMark(x: .value("Transition", pair.1.start), yStart: .value("From", pair.0.stage.label), yEnd: .value("To", pair.1.stage.label))
                        .lineStyle(StrokeStyle(lineWidth: m.pt(1)))
                        .foregroundStyle(m.c.quiet.opacity(selectedSegment == nil ? 0.45 : 0.2))
                }
            }
            ForEach(parsed) { segment in
                RectangleMark(
                    xStart: .value("Start", segment.start),
                    xEnd: .value("End", segment.end),
                    y: .value("Stage", segment.stage.label),
                    height: .ratio(0.73)
                )
                .cornerRadius(m.pt(3))
                .foregroundStyle(SleepPalette.stage(segment.stage).opacity(selectedSegment == nil || selectedSegment == segment ? 1 : 0.4))
            }
            if let selected {
                RuleMark(x: .value("Selected", selected)).foregroundStyle(m.c.ink.opacity(0.5))
            }
        }
        .chartYScale(domain: lanes)
        .chartXScale(domain: domain)
        .chartYAxis {
            AxisMarks(position: .leading) { _ in AxisGridLine().foregroundStyle(m.c.line.opacity(0.7)) }
        }
        .chartXAxis {
            AxisMarks(values: hourMarks) { _ in AxisGridLine().foregroundStyle(m.c.line.opacity(0.5)) }
        }
        .chartPlotStyle { plot in
            plot.overlay(alignment: .leading) { Rectangle().fill(m.c.line).frame(width: m.pt(1)) }
                .overlay(alignment: .bottom) { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
        }
        .sleepChartInteraction(
            onTap: { location, proxy, geometry in
                let date = plotDate(at: location, proxy: proxy, geometry: geometry)
                if let date, let current = selectedSegment, current.start <= date, date < current.end { selected = nil } else { selected = date }
            },
            onScrub: { location, proxy, geometry in selected = plotDate(at: location, proxy: proxy, geometry: geometry) }
        )
        .frame(height: plotHeight)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Sleep stage timeline")
        .accessibilityValue("\(parsed.count) stage segments")
        .accessibilityChartDescriptor(SleepHypnogramDescriptor(segments: parsed.map { ($0.stage, $0.start, $0.end) }, zone: zone))
        .accessibilityIdentifier("sleep.timeline.chart")
    }

    /// `.timeline-x`: hour labels placed at their true position.
    private var timeAxis: some View {
        GeometryReader { geometry in
            let span = domain.upperBound.timeIntervalSince(domain.lowerBound)
            ForEach(hourMarks, id: \.self) { mark in
                axisLabel((approximate ? "≈ " : "") + SleepEvidenceFormat.shortClock(mark, in: zone))
                    .fixedSize()
                    .position(x: geometry.size.width * mark.timeIntervalSince(domain.lowerBound) / span, y: m.pt(8))
            }
        }
        .frame(height: m.pt(16))
        .padding(.top, m.pt(4))
        .accessibilityHidden(true)
    }

    private func legendChip(_ color: Color, _ label: String) -> some View {
        HStack(spacing: m.pt(3)) {
            RoundedRectangle(cornerRadius: m.pt(2)).fill(color).frame(width: m.pt(9), height: m.pt(7))
            Text(label)
                .evidenceText(.normal(8, 400, jakarta: false))
                .foregroundStyle(m.c.quiet)
        }
    }
}

private struct SleepHypnogramDescriptor: AXChartDescriptorRepresentable {
    let segments: [(RecoverySleepStage, Date, Date)]
    let zone: TimeZone

    func makeChartDescriptor() -> AXChartDescriptor {
        let start = segments.first?.1 ?? .now
        let end = segments.last?.2 ?? start.addingTimeInterval(3600)
        let xAxis = AXNumericDataAxisDescriptor(title: "Time", range: 0...max(1, end.timeIntervalSince(start)), gridlinePositions: []) { offset in
            SleepEvidenceFormat.clock(start.addingTimeInterval(offset), in: zone)
        }
        // Stages as ordered lanes (Deep lowest, Awake highest) so the audio
        // graph's pitch follows the visual lanes.
        let order: [RecoverySleepStage] = [.deep, .core, .rem, .unspecified, .awake]
        let yAxis = AXNumericDataAxisDescriptor(title: "Stage", range: 0...Double(order.count - 1), gridlinePositions: []) { value in
            order[min(order.count - 1, max(0, Int(value.rounded())))].label
        }
        let series = AXDataSeriesDescriptor(name: "Stages", isContinuous: false, dataPoints: segments.map { segment in
            AXDataPoint(x: segment.1.timeIntervalSince(start), y: Double(order.firstIndex(of: segment.0) ?? 0),
                        label: "\(segment.0.label), \(SleepEvidenceFormat.clock(segment.1, in: zone)) to \(SleepEvidenceFormat.clock(segment.2, in: zone))")
        })
        return AXChartDescriptor(title: "Sleep stage timeline", summary: nil, xAxis: xAxis, yAxis: yAxis, additionalAxes: [], series: [series])
    }
}

// MARK: - Stage composition bar

/// Locked `.stagebar`: one 10 px capsule split Deep / Core / REM.
struct SleepStageBar: View {
    let deep: Int
    let core: Int
    let rem: Int
    private let m = chartMetrics

    var body: some View {
        let total = max(1, deep + core + rem)
        let parts: [(RecoverySleepStage, Int)] = [(.deep, deep), (.core, core), (.rem, rem)]
        GeometryReader { geometry in
            HStack(spacing: 0) {
                ForEach(parts, id: \.0) { stage, seconds in
                    Rectangle()
                        .fill(SleepPalette.stage(stage))
                        .frame(width: max(2, geometry.size.width * CGFloat(seconds) / CGFloat(total)))
                }
            }
        }
        .frame(height: m.pt(10))
        .clipShape(Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Stage composition")
        .accessibilityValue(parts.map { stage, seconds in
            "\(stage.label) \(SleepEvidenceFormat.spokenDuration(seconds)), \(Int((Double(seconds) / Double(total) * 100).rounded())) percent"
        }.joined(separator: ". "))
    }
}

// MARK: - Continuity trend (Server rows; non-available nights are gaps)

/// One Continuity panel's plotted values: ascending nights with a value,
/// split into runs at every night that is not `available` (or has no value),
/// plus the dotted bridges drawn across each gap. Nothing is interpolated.
struct SleepContinuitySeries {
    struct Point: Identifiable, Equatable {
        var id: String { day }
        let day: String
        let date: Date
        let value: Double
        let run: Int
    }

    struct Bridge: Identifiable, Equatable {
        let id: Int
        let from: Point
        let to: Point
    }

    let points: [Point]
    let bridges: [Bridge]

    /// `rows` newest first, as the Server sends them.
    init(rows: [RecoverySleepTrends.ContinuityRow], value: (RecoverySleepTrends.ContinuityRow) -> Double?) {
        var points: [Point] = []
        var run = 0
        var brokeSinceLast = false
        for row in rows.reversed() {
            guard row.status == .available, let date = SleepEvidenceFormat.chartDate(row.sleepDay), let v = value(row) else {
                brokeSinceLast = true
                continue
            }
            if brokeSinceLast, !points.isEmpty { run += 1 }
            brokeSinceLast = false
            points.append(Point(day: row.sleepDay, date: date, value: v, run: run))
        }
        var bridges: [Bridge] = []
        for index in points.indices.dropFirst() where points[index].run != points[index - 1].run {
            bridges.append(Bridge(id: index, from: points[index - 1], to: points[index]))
        }
        self.points = points
        self.bridges = bridges
    }
}

/// Founder correction R2: two related, separately scaled point/line panels
/// (Awake in sleep window, minutes; Longest continuous sleep, hours). A
/// night without stage detail stays a gap, bridged only by a dotted muted
/// line. The selected (default: newest) night's two values sit below.
struct SleepContinuityChart: View {
    /// Newest first.
    let rows: [RecoverySleepTrends.ContinuityRow]
    let plan: SleepAxisPolicy.Plan
    @State private var selectedDay: String?
    private let m = chartMetrics

    private typealias Point = SleepContinuitySeries.Point
    private typealias Bridge = SleepContinuitySeries.Bridge

    private func series(_ value: (RecoverySleepTrends.ContinuityRow) -> Double?) -> (points: [Point], bridges: [Bridge]) {
        let series = SleepContinuitySeries(rows: rows, value: value)
        return (series.points, series.bridges)
    }

    private var selectedRow: RecoverySleepTrends.ContinuityRow? {
        let available = rows.filter { $0.status == .available }
        return selectedDay.flatMap { day in available.first { $0.sleepDay == day } } ?? available.first
    }

    var body: some View {
        let awake = series { $0.awakeInWindowSeconds.map { Double($0) / 60 } }
        let longest = series { $0.longestAsleepStretchSeconds.map { Double($0) / 3600 } }
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: m.pt(14)) {
                SleepLegendItem(color: SleepPalette.awake, label: "Awake in window")
                SleepLegendItem(color: SleepPalette.total, label: "Longest continuous")
            }
            .padding(.bottom, m.pt(5))
            .accessibilityHidden(true)
            panel(title: "Awake in sleep window", unit: "minutes", color: SleepPalette.awake, lineWidth: 1.6,
                  data: awake, format: { "\(Int($0.rounded()))m" }, identifier: "sleep.continuity.awake")
            panel(title: "Longest continuous sleep", unit: "hours", color: SleepPalette.total, lineWidth: 2,
                  data: longest, format: { String(format: $0.truncatingRemainder(dividingBy: 1) == 0 ? "%.0fh" : "%.1fh", $0) }, identifier: "sleep.continuity.longest")
            if let row = selectedRow {
                let label = SleepEvidenceFormat.sleepDay(row.sleepDay, style: "MMM d")
                HStack(alignment: .top, spacing: m.pt(7)) {
                    WeightStatTile(label: "\(label) · Awake", value: SleepEvidenceFormat.duration(row.awakeInWindowSeconds), detail: "in sleep window")
                    WeightStatTile(label: "\(label) · Longest", value: SleepEvidenceFormat.duration(row.longestAsleepStretchSeconds), detail: "continuous sleep")
                }
                .padding(.top, m.pt(8))
                .accessibilityIdentifier("sleep.continuity.selected")
            }
        }
    }

    private func panel(title: String, unit: String, color: Color, lineWidth: CGFloat,
                       data: (points: [Point], bridges: [Bridge]), format: @escaping (Double) -> String, identifier: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .evidenceText(.normal(11, 780, jakarta: false))
                    .foregroundStyle(m.c.ink)
                Spacer(minLength: 0)
                Text(unit)
                    .evidenceText(.normal(8, 400, jakarta: false))
                    .foregroundStyle(m.c.quiet)
            }
            .padding(.bottom, m.pt(5))
            Chart {
                ForEach(data.bridges) { bridge in
                    LineMark(x: .value("Night", bridge.from.date, unit: .day), y: .value(unit, bridge.from.value), series: .value("Gap", "gap\(bridge.id)"))
                        .lineStyle(StrokeStyle(lineWidth: m.pt(1), dash: [m.pt(2), m.pt(3)]))
                        .foregroundStyle(m.c.quiet)
                    LineMark(x: .value("Night", bridge.to.date, unit: .day), y: .value(unit, bridge.to.value), series: .value("Gap", "gap\(bridge.id)"))
                        .lineStyle(StrokeStyle(lineWidth: m.pt(1), dash: [m.pt(2), m.pt(3)]))
                        .foregroundStyle(m.c.quiet)
                }
                ForEach(data.points) { point in
                    LineMark(x: .value("Night", point.date, unit: .day), y: .value(unit, point.value), series: .value("Run", "run\(point.run)"))
                        .lineStyle(StrokeStyle(lineWidth: m.pt(lineWidth), lineCap: .round, lineJoin: .round))
                        .foregroundStyle(color)
                }
                ForEach(data.points) { point in
                    let isSelected = point.day == selectedRow?.sleepDay
                    PointMark(x: .value("Night", point.date, unit: .day), y: .value(unit, point.value))
                        .symbol {
                            Circle().fill(isSelected ? color : m.c.surface)
                                .overlay(Circle().stroke(color, lineWidth: m.pt(lineWidth)))
                                .frame(width: m.pt(6.4), height: m.pt(6.4))
                        }
                }
            }
            .chartXScale(domain: plan.domain)
            .chartYAxis {
                AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { value in
                    AxisGridLine().foregroundStyle(m.c.line)
                    AxisValueLabel { axisLabel(format(value.as(Double.self) ?? 0)) }
                }
            }
            .chartXAxis { sleepDateAxisMarks(plan) }
            .sleepChartInteraction(
                onTap: { location, proxy, geometry in select(plotDate(at: location, proxy: proxy, geometry: geometry), in: data.points) },
                onScrub: { location, proxy, geometry in select(plotDate(at: location, proxy: proxy, geometry: geometry), in: data.points) }
            )
            .frame(height: m.pt(112))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(title) per night")
            .accessibilityValue("\(data.points.count) nights with continuity data\(data.bridges.isEmpty ? "" : ", \(data.bridges.count) gaps")")
            .accessibilityIdentifier(identifier)
        }
        .padding(.top, m.pt(10))
        .padding(.bottom, m.pt(4))
    }

    private func select(_ date: Date?, in points: [Point]) {
        guard let date else { return }
        selectedDay = points.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) }?.day
    }
}

// MARK: - Stage mix trend (100% stacked; inspection only)

struct SleepStageMixChart: View {
    let rows: [RecoverySleepTrends.StageMixRow]
    let plan: SleepAxisPolicy.Plan
    private let m = chartMetrics

    private struct Share: Identifiable {
        let id: String
        let date: Date
        let stage: String
        let seconds: Int
    }

    var body: some View {
        let shares: [Share] = rows.reversed().flatMap { row -> [Share] in
            guard row.status == .available, let date = SleepEvidenceFormat.chartDate(row.sleepDay) else { return [] }
            return [("Deep", row.deepSeconds), ("Core", row.coreSeconds), ("REM", row.remSeconds)].compactMap { label, seconds in
                seconds.map { Share(id: row.sleepDay + label, date: date, stage: label, seconds: $0) }
            }
        }
        VStack(alignment: .leading, spacing: 0) {
            Chart(shares) { share in
                BarMark(x: .value("Night", share.date, unit: .day), y: .value("Share", share.seconds), stacking: .normalized)
                    .foregroundStyle(by: .value("Stage", share.stage))
            }
            .chartForegroundStyleScale(["Deep": SleepPalette.deep, "Core": SleepPalette.core, "REM": SleepPalette.rem])
            .chartYAxis {
                AxisMarks(position: .leading, values: [0, 0.5, 1]) { _ in
                    AxisGridLine().foregroundStyle(m.c.line)
                }
            }
            .chartXScale(domain: plan.domain)
            .chartXAxis { sleepDateAxisMarks(plan) }
            .chartLegend(.hidden)
            .frame(height: m.pt(124))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Stage mix per night")
            .accessibilityValue("\(Set(shares.map(\.date)).count) nights with stage detail")
            HStack(spacing: m.pt(11)) {
                SleepLegendItem(color: SleepPalette.deep, label: "Deep")
                SleepLegendItem(color: SleepPalette.core, label: "Core")
                SleepLegendItem(color: SleepPalette.rem, label: "REM")
            }
            .padding(.top, m.pt(8))
            .accessibilityHidden(true)
        }
    }
}
