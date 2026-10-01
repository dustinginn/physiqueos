import Accessibility
import Charts
import SwiftUI

// Recovery / Sleep Evidence charts. Every value plotted comes straight from
// the Server read model; nothing is aggregated or inferred here.

private func axisLabel(_ text: String) -> some View {
    Text(text)
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(PhysiqueOSTheme.textMuted)
}

/// Day labels offset from the newest point so neither edge label clips.
private func labelDates(_ newestFirst: [Date], stride: Int) -> [Date] {
    let phase = stride >= 7 ? 3 : 1
    return newestFirst.enumerated().filter { $0.offset % stride == phase }.map(\.element)
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

struct SleepTotalChart: View {
    /// Newest first.
    let points: [SleepTotalChartPoint]
    var isWeekly = false
    @Binding var selectedId: String?
    var height: CGFloat = 176

    private var maximumHours: Double {
        max(9, ceil((points.compactMap(\.asleepSeconds).max().map { Double($0) / 3600 } ?? 8) + 0.5))
    }

    var body: some View {
        let ordered = Array(points.reversed())
        Chart {
            ForEach(ordered) { point in
                if let seconds = point.asleepSeconds {
                    BarMark(
                        x: .value("Night", point.date, unit: isWeekly ? .weekOfYear : .day),
                        y: .value("Asleep", Double(seconds) / 3600),
                        width: .ratio(0.62)
                    )
                    .cornerRadius(3)
                    .foregroundStyle(PhysiqueOSTheme.sleepTotal.opacity(selectedId == nil || selectedId == point.id ? 0.88 : 0.45))
                }
            }
            ForEach(ordered.filter { $0.averageSeconds != nil }) { point in
                LineMark(
                    x: .value("Night", point.date, unit: .day),
                    y: .value("7-night average", Double(point.averageSeconds ?? 0) / 3600),
                    series: .value("Series", "Average")
                )
                .interpolationMethod(.monotone)
                .lineStyle(StrokeStyle(lineWidth: 1.6, dash: [4, 3]))
                .foregroundStyle(PhysiqueOSTheme.textPrimary.opacity(0.72))
            }
        }
        .chartYScale(domain: 0...maximumHours)
        .chartYAxis {
            AxisMarks(position: .leading, values: [0, 3, 6, 9]) { value in
                AxisGridLine().foregroundStyle(PhysiqueOSTheme.divider)
                AxisValueLabel { axisLabel("\(value.as(Int.self) ?? 0)h") }
            }
        }
        .chartXAxis {
            AxisMarks(values: labelDates(points.map(\.date), stride: isWeekly ? 4 : (points.count > 20 ? 7 : 3))) { value in
                AxisValueLabel {
                    if let date = value.as(Date.self) { axisLabel(date.formatted(.dateTime.month(.abbreviated).day())) }
                }
            }
        }
        .chartOverlay { proxy in
            GeometryReader { geometry in
                Rectangle().fill(.clear).contentShape(Rectangle())
                    .onTapGesture { location in
                        guard let frame = proxy.plotFrame,
                              let date: Date = proxy.value(atX: location.x - geometry[frame].origin.x) else { return }
                        let nearest = points.filter { $0.asleepSeconds != nil }
                            .min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) }?.id
                        selectedId = selectedId == nearest ? nil : nearest
                    }
            }
        }
        .frame(height: height)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(isWeekly ? "Average sleep per week" : "Total sleep per night")
        .accessibilityValue(summary)
        .accessibilityChartDescriptor(SleepTotalChartDescriptor(points: ordered, isWeekly: isWeekly))
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
            return SleepWindowChartRow(
                id: night.sleepDay, label: SleepEvidenceFormat.sleepDay(night.sleepDay, style: "MMM d"),
                startMinutes: minutesAfterSix(start, clock.zone), endMinutes: minutesAfterSix(end, clock.zone),
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

struct SleepWindowChart: View {
    /// Newest first (drawn at the top).
    let rows: [SleepWindowChartRow]
    let summary: RecoverySleepWindowSummary?
    var rowHeight: CGFloat = 13

    private var rowLabels: [String] {
        let stride = rows.count > 14 ? 5 : 2
        return rows.enumerated().filter { $0.offset % stride == 0 }.map(\.element.label)
    }

    var body: some View {
        // Two empty hours on the left keep row labels clear of the bars.
        let lower = Double((rows.map(\.startMinutes).min() ?? 240) / 60 * 60 - 120)
        let upper = Double(((rows.map(\.endMinutes).max() ?? 780) + 59) / 60 * 60 + 30)
        Chart {
            if let start = summary?.typicalStartMinutes, let end = summary?.typicalEndMinutes {
                RectangleMark(xStart: .value("Typical start", Double(start)), xEnd: .value("Typical end", Double(end)))
                    .foregroundStyle(PhysiqueOSTheme.sleepTotal.opacity(0.07))
                RuleMark(x: .value("Typical start", Double(start)))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    .foregroundStyle(PhysiqueOSTheme.textMuted.opacity(0.6))
                RuleMark(x: .value("Typical end", Double(end)))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    .foregroundStyle(PhysiqueOSTheme.textMuted.opacity(0.6))
            }
            ForEach(rows) { row in
                BarMark(
                    xStart: .value("Fell asleep", Double(row.startMinutes)),
                    xEnd: .value("Woke up", Double(row.endMinutes)),
                    y: .value("Night", row.label),
                    height: .fixed(7)
                )
                .cornerRadius(3.5)
                .foregroundStyle(PhysiqueOSTheme.sleepTotal.opacity(row.includedInConsistency ? 0.88 : 0.3))
                .annotation(position: .trailing, spacing: 4) {
                    if !row.includedInConsistency {
                        Image(systemName: "circle.dashed")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                }
            }
        }
        .chartXScale(domain: lower...upper)
        .chartXAxis {
            AxisMarks(values: Array(stride(from: lower + 120, through: upper - 45, by: 120))) { value in
                AxisGridLine().foregroundStyle(PhysiqueOSTheme.divider)
                AxisValueLabel { axisLabel(SleepEvidenceFormat.axisClock(value.as(Double.self) ?? 0)) }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: rowLabels) { value in
                AxisValueLabel(horizontalSpacing: 8) { axisLabel(value.as(String.self) ?? "") }
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
            + (excluded > 0 ? ". \(excluded) nights with uncertain clock times are faded and not counted." : "")
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

struct SleepHypnogramView: View {
    let segments: [RecoverySleepNightDetail.Segment]
    let zone: TimeZone
    let inBedStart: Date?
    let inBedEnd: Date?
    @State private var selected: Date?

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
        VStack(alignment: .leading, spacing: 10) {
            Group {
                if let segment = selectedSegment {
                    HStack(spacing: 6) {
                        Circle().fill(PhysiqueOSTheme.sleepColor(segment.stage)).frame(width: 8, height: 8)
                        Text("\(segment.stage.label) · \(SleepEvidenceFormat.clock(segment.start, in: zone))–\(SleepEvidenceFormat.clock(segment.end, in: zone))")
                    }
                } else {
                    Text("Touch and drag across the timeline to inspect a stage.")
                }
            }
            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
            .foregroundStyle(PhysiqueOSTheme.textSecondary)
            .frame(minHeight: 16, alignment: .leading)

            Chart {
                if let inBedStart, let inBedEnd {
                    RectangleMark(xStart: .value("In bed", inBedStart), xEnd: .value("Out of bed", inBedEnd))
                        .foregroundStyle(PhysiqueOSTheme.sleepInBed)
                }
                ForEach(Array(zip(parsed, parsed.dropFirst())), id: \.0.id) { pair in
                    if pair.0.end == pair.1.start {
                        RuleMark(x: .value("Transition", pair.1.start), yStart: .value("From", pair.0.stage.label), yEnd: .value("To", pair.1.stage.label))
                            .lineStyle(StrokeStyle(lineWidth: 0.75))
                            .foregroundStyle(PhysiqueOSTheme.textMuted.opacity(selectedSegment == nil ? 0.35 : 0.15))
                    }
                }
                ForEach(parsed) { segment in
                    RectangleMark(
                        xStart: .value("Start", segment.start),
                        xEnd: .value("End", segment.end),
                        y: .value("Stage", segment.stage.label),
                        height: .ratio(0.78)
                    )
                    .cornerRadius(2)
                    .foregroundStyle(PhysiqueOSTheme.sleepColor(segment.stage).opacity(selectedSegment == nil || selectedSegment == segment ? 1 : 0.4))
                }
                if let selected {
                    RuleMark(x: .value("Selected", selected)).foregroundStyle(PhysiqueOSTheme.textPrimary.opacity(0.5))
                }
            }
            .chartYScale(domain: lanes)
            .chartXScale(domain: domain)
            .chartXSelection(value: $selected)
            .chartYAxis {
                AxisMarks(position: .leading) { value in AxisValueLabel { axisLabel(value.as(String.self) ?? "") } }
            }
            .chartXAxis {
                AxisMarks(values: hourMarks) { value in
                    AxisGridLine().foregroundStyle(PhysiqueOSTheme.divider)
                    AxisValueLabel {
                        if let date = value.as(Date.self) { axisLabel(SleepEvidenceFormat.shortClock(date, in: zone)) }
                    }
                }
            }
            .frame(height: lanes.count > 2 ? 176 : 96)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Sleep stage timeline")
            .accessibilityValue("\(parsed.count) stage segments")
            .accessibilityChartDescriptor(SleepHypnogramDescriptor(segments: parsed.map { ($0.stage, $0.start, $0.end) }, zone: zone))

            HStack(spacing: 12) {
                ForEach(lanes.reversed(), id: \.self) { lane in
                    let stage = RecoverySleepStage.allCases.first { $0.label == lane } ?? .unknown
                    HStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 2).fill(PhysiqueOSTheme.sleepColor(stage)).frame(width: 10, height: 8)
                        Text(lane)
                    }
                }
                if inBedStart != nil {
                    HStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 2).fill(PhysiqueOSTheme.sleepInBed).frame(width: 10, height: 8)
                            .overlay(RoundedRectangle(cornerRadius: 2).strokeBorder(PhysiqueOSTheme.divider))
                        Text("In bed")
                    }
                }
            }
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(PhysiqueOSTheme.textMuted)
            .accessibilityHidden(true)
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

struct SleepStageBar: View {
    let deep: Int
    let core: Int
    let rem: Int

    var body: some View {
        let total = max(1, deep + core + rem)
        let parts: [(RecoverySleepStage, Int)] = [(.deep, deep), (.core, core), (.rem, rem)]
        GeometryReader { geometry in
            HStack(spacing: 2) {
                ForEach(parts, id: \.0) { stage, seconds in
                    RoundedRectangle(cornerRadius: 3)
                        .fill(PhysiqueOSTheme.sleepColor(stage))
                        .frame(width: max(2, (geometry.size.width - 4) * CGFloat(seconds) / CGFloat(total)))
                }
            }
        }
        .frame(height: 14)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Stage composition")
        .accessibilityValue(parts.map { stage, seconds in
            "\(stage.label) \(SleepEvidenceFormat.spokenDuration(seconds)), \(Int((Double(seconds) / Double(total) * 100).rounded())) percent"
        }.joined(separator: ". "))
    }
}

// MARK: - Continuity trend (Server rows; non-available nights are gaps)

struct SleepContinuityChart: View {
    /// Newest first.
    let rows: [RecoverySleepTrends.ContinuityRow]

    private var available: [(Date, RecoverySleepTrends.ContinuityRow)] {
        rows.reversed().compactMap { row in
            guard row.status == .available, let date = SleepEvidenceFormat.chartDate(row.sleepDay) else { return nil }
            return (date, row)
        }
    }

    private var domain: ClosedRange<Date> {
        let dates = rows.compactMap { SleepEvidenceFormat.chartDate($0.sleepDay) }
        let low = (dates.min() ?? .now).addingTimeInterval(-43_200)
        let high = (dates.max() ?? .now).addingTimeInterval(43_200)
        return low...max(high, low.addingTimeInterval(86_400))
    }

    var body: some View {
        let dates = rows.compactMap { SleepEvidenceFormat.chartDate($0.sleepDay) }
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Awake in sleep window")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Chart {
                    ForEach(available, id: \.1.sleepDay) { date, row in
                        if let awake = row.awakeInWindowSeconds {
                            BarMark(x: .value("Night", date, unit: .day), y: .value("Awake minutes", Double(awake) / 60), width: .ratio(0.55))
                                .cornerRadius(2)
                                .foregroundStyle(PhysiqueOSTheme.sleepAwake.opacity(0.75))
                        }
                    }
                }
                .chartXScale(domain: domain)
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { value in
                        AxisGridLine().foregroundStyle(PhysiqueOSTheme.divider)
                        AxisValueLabel { axisLabel("\(value.as(Int.self) ?? 0)m") }
                    }
                }
                .chartXAxis(.hidden)
                .frame(height: 70)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Awake in sleep window per night")
                .accessibilityValue("\(available.count) nights with continuity data")
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("Longest continuous sleep")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Chart {
                    ForEach(available, id: \.1.sleepDay) { date, row in
                        if let longest = row.longestAsleepStretchSeconds {
                            PointMark(x: .value("Night", date, unit: .day), y: .value("Hours", Double(longest) / 3600))
                                .symbolSize(28)
                                .foregroundStyle(PhysiqueOSTheme.sleepTotal)
                        }
                    }
                }
                .chartXScale(domain: domain)
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { value in
                        AxisGridLine().foregroundStyle(PhysiqueOSTheme.divider)
                        AxisValueLabel { axisLabel(String(format: "%.0fh", value.as(Double.self) ?? 0)) }
                    }
                }
                .chartXAxis {
                    AxisMarks(values: labelDates(Array(dates), stride: dates.count > 20 ? 7 : 3)) { value in
                        AxisValueLabel {
                            if let date = value.as(Date.self) { axisLabel(date.formatted(.dateTime.month(.abbreviated).day())) }
                        }
                    }
                }
                .frame(height: 86)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Longest continuous sleep per night")
                .accessibilityValue("\(available.count) nights with continuity data")
            }
        }
    }
}

// MARK: - Stage mix trend (100% stacked; inspection only)

struct SleepStageMixChart: View {
    let rows: [RecoverySleepTrends.StageMixRow]

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
        Chart(shares) { share in
            BarMark(x: .value("Night", share.date, unit: .day), y: .value("Share", share.seconds), stacking: .normalized)
                .foregroundStyle(by: .value("Stage", share.stage))
        }
        .chartForegroundStyleScale(["Deep": PhysiqueOSTheme.sleepDeep, "Core": PhysiqueOSTheme.sleepCore, "REM": PhysiqueOSTheme.sleepREM])
        .chartYAxis {
            AxisMarks(position: .leading, values: [0, 0.5, 1]) { value in
                AxisGridLine().foregroundStyle(PhysiqueOSTheme.divider)
                AxisValueLabel { axisLabel("\(Int((value.as(Double.self) ?? 0) * 100))%") }
            }
        }
        .chartXAxis(.hidden)
        .chartLegend(position: .bottom, alignment: .leading)
        .frame(height: 140)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Stage mix per night")
        .accessibilityValue("\(Set(shares.map(\.date)).count) nights with stage detail")
    }
}
