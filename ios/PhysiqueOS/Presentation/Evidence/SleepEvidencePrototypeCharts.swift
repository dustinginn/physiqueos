import Charts
import SwiftUI

// NON-SHIPPING Sleep Evidence prototype charts (see SleepEvidencePrototype).

extension SleepPrototypeNight {
    /// Local-noon date of the wake day in the viewer's calendar, so day-unit
    /// chart axes never shift a night onto the neighbouring day.
    var chartDate: Date {
        Calendar.current.date(from: SleepFormat.components(of: sleepDay))!.addingTimeInterval(12 * 3600)
    }
}

/// Day labels offset from the newest night so neither edge label clips.
func sleepDayLabelDates(_ nightsNewestFirst: [SleepPrototypeNight]) -> [Date] {
    let stride = nightsNewestFirst.count > 20 ? 7 : 3
    let phase = stride == 7 ? 3 : 1
    return nightsNewestFirst.enumerated().filter { $0.offset % stride == phase }.map { $0.element.chartDate }
}

/// Two-hourly marks in the night's zone, kept away from the plot edges.
func sleepHourMarks(_ night: SleepPrototypeNight, from start: Date, to end: Date) -> [Date] {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = night.timeZone
    var cursor = calendar.dateInterval(of: .hour, for: start)!.start
    var marks: [Date] = []
    while cursor < end {
        let hour = calendar.component(.hour, from: cursor)
        if hour % 2 == 0, cursor.timeIntervalSince(start) > 25 * 60, end.timeIntervalSince(cursor) > 25 * 60 { marks.append(cursor) }
        cursor = cursor.addingTimeInterval(3600)
    }
    return marks
}

private func axisLabel(_ text: String) -> some View {
    Text(text)
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(PhysiqueOSTheme.textMuted)
}

// MARK: - Total sleep (nightly bars + trailing 7-night average)

struct SleepTotalChart: View {
    /// Newest first.
    let nights: [SleepPrototypeNight]
    let fixture: SleepPrototypeFixture
    @Binding var selectedDay: String?
    var height: CGFloat = 176

    private struct AveragePoint: Identifiable {
        let id: String
        let date: Date
        let hours: Double
    }

    private var averagePoints: [AveragePoint] {
        nights.compactMap { night in
            guard let index = fixture.nights.firstIndex(of: night),
                  let seconds = fixture.trailingAverageSeconds(endingAt: index) else { return nil }
            return AveragePoint(id: night.sleepDay, date: night.chartDate, hours: Double(seconds) / 3600)
        }
    }

    var body: some View {
        let ordered = Array(nights.reversed())
        Chart {
            ForEach(ordered) { night in
                BarMark(
                    x: .value("Night", night.chartDate, unit: .day),
                    y: .value("Asleep", Double(night.asleepSeconds) / 3600),
                    width: .ratio(0.62)
                )
                .cornerRadius(3)
                .foregroundStyle(PhysiqueOSTheme.sleepTotal.opacity(selectedDay == nil || selectedDay == night.sleepDay ? 0.88 : 0.45))
            }
            ForEach(averagePoints) { point in
                LineMark(
                    x: .value("Night", point.date, unit: .day),
                    y: .value("7-night average", point.hours),
                    series: .value("Series", "Average")
                )
                .interpolationMethod(.monotone)
                .lineStyle(StrokeStyle(lineWidth: 1.6, dash: [4, 3]))
                .foregroundStyle(PhysiqueOSTheme.textPrimary.opacity(0.72))
            }
        }
        .chartYScale(domain: 0...9)
        .chartYAxis {
            AxisMarks(position: .leading, values: [0, 3, 6, 9]) { value in
                AxisGridLine().foregroundStyle(PhysiqueOSTheme.divider)
                AxisValueLabel { axisLabel("\(value.as(Int.self) ?? 0)h") }
            }
        }
        .chartXAxis {
            AxisMarks(values: sleepDayLabelDates(nights)) { value in
                AxisValueLabel {
                    if let date = value.as(Date.self) {
                        axisLabel(date.formatted(.dateTime.month(.abbreviated).day()))
                    }
                }
            }
        }
        .chartOverlay { proxy in
            GeometryReader { geometry in
                Rectangle().fill(.clear).contentShape(Rectangle())
                    .onTapGesture { location in
                        guard let frame = proxy.plotFrame else { return }
                        let x = location.x - geometry[frame].origin.x
                        guard let date: Date = proxy.value(atX: x) else { return }
                        let day = nights.min { abs($0.chartDate.timeIntervalSince(date)) < abs($1.chartDate.timeIntervalSince(date)) }?.sleepDay
                        selectedDay = selectedDay == day ? nil : day
                    }
            }
        }
        .frame(height: height)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilitySummary)
    }

    private var accessibilitySummary: String {
        let average = nights.isEmpty ? 0 : nights.reduce(0) { $0 + $1.asleepSeconds } / nights.count
        return "Total sleep for the last \(nights.count) nights. Average \(SleepFormat.spokenDuration(average))."
    }
}

// MARK: - Sleep window (consistency): one floating bar per night on a clock axis

struct SleepWindowStats {
    let medianStart: Double
    let medianEnd: Double
    let startSpreadMinutes: Int
    let endSpreadMinutes: Int

    init(nights: [SleepPrototypeNight]) {
        let starts = nights.map { $0.clockMinutes($0.start) }.sorted()
        let ends = nights.map { $0.clockMinutes($0.end) }.sorted()
        func median(_ values: [Double]) -> Double {
            guard !values.isEmpty else { return 0 }
            let mid = values.count / 2
            return values.count.isMultiple(of: 2) ? (values[mid - 1] + values[mid]) / 2 : values[mid]
        }
        func mad(_ values: [Double], around center: Double) -> Int {
            Int(median(values.map { abs($0 - center) }.sorted()).rounded())
        }
        medianStart = median(starts)
        medianEnd = median(ends)
        startSpreadMinutes = mad(starts, around: medianStart)
        endSpreadMinutes = mad(ends, around: medianEnd)
    }
}

struct SleepWindowChart: View {
    /// Newest first (newest drawn at the top).
    let nights: [SleepPrototypeNight]
    var rowHeight: CGFloat = 13

    /// Every row is labelled on short ranges; longer ranges label a subset.
    private var windowRowLabels: [String] {
        let stride = nights.count > 14 ? 5 : 2
        return nights.enumerated().filter { $0.offset % stride == 0 }.map { SleepFormat.wakeDate($0.element.sleepDay, style: "MMM d") }
    }

    var body: some View {
        let stats = SleepWindowStats(nights: nights)
        // Two empty hours on the left hold the night labels clear of the bars.
        let lower = floor((nights.map { $0.clockMinutes($0.start) }.min() ?? 240) / 60) * 60 - 120
        let upper = ceil((nights.map { $0.clockMinutes($0.end) }.max() ?? 780) / 60 + 0.5) * 60
        Chart {
            RectangleMark(
                xStart: .value("Typical start", stats.medianStart),
                xEnd: .value("Typical end", stats.medianEnd)
            )
            .foregroundStyle(PhysiqueOSTheme.sleepTotal.opacity(0.07))
            ForEach(nights) { night in
                BarMark(
                    xStart: .value("Fell asleep", night.clockMinutes(night.start)),
                    xEnd: .value("Woke up", night.clockMinutes(night.end)),
                    y: .value("Night", SleepFormat.wakeDate(night.sleepDay, style: "MMM d")),
                    height: .fixed(7)
                )
                .cornerRadius(3.5)
                .foregroundStyle(PhysiqueOSTheme.sleepTotal.opacity(night.timeZoneInferred ? 0.34 : 0.88))
                .annotation(position: .trailing, spacing: 4) {
                    if night.timeZoneInferred {
                        Image(systemName: "circle.dashed")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                }
            }
            RuleMark(x: .value("Typical start", stats.medianStart))
                .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                .foregroundStyle(PhysiqueOSTheme.textMuted.opacity(0.6))
            RuleMark(x: .value("Typical end", stats.medianEnd))
                .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                .foregroundStyle(PhysiqueOSTheme.textMuted.opacity(0.6))
        }
        .chartXScale(domain: lower...upper)
        .chartXAxis {
            AxisMarks(values: Array(stride(from: lower + 120, through: upper, by: 120))) { value in
                AxisGridLine().foregroundStyle(PhysiqueOSTheme.divider)
                AxisValueLabel { axisLabel(SleepFormat.clockAxisLabel(value.as(Double.self) ?? 0)) }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: windowRowLabels) { value in
                AxisValueLabel(horizontalSpacing: 8) { axisLabel(value.as(String.self) ?? "") }
            }
        }
        .frame(height: CGFloat(nights.count) * rowHeight + 28)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Sleep window for \(nights.count) nights. Typically \(SleepFormat.clockFromAxis(stats.medianStart)) to \(SleepFormat.clockFromAxis(stats.medianEnd)).")
    }
}

// MARK: - Hypnogram (night detail only)

struct SleepHypnogramView: View {
    let night: SleepPrototypeNight
    @State private var selected: Date?

    private var lanes: [String] { SleepStage.allCases.map(\.label) }

    private var selectedSegment: SleepSegment? {
        guard let selected else { return nil }
        return night.segments.first { $0.start <= selected && selected < $0.end }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Group {
                if let segment = selectedSegment {
                    HStack(spacing: 6) {
                        Circle().fill(PhysiqueOSTheme.sleepColor(segment.stage)).frame(width: 8, height: 8)
                        Text("\(segment.stage.label) · \(SleepFormat.clock(segment.start, in: night.timeZone))–\(SleepFormat.clock(segment.end, in: night.timeZone))")
                    }
                } else {
                    Text("Touch and drag across the timeline to inspect a stage.")
                }
            }
            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
            .foregroundStyle(PhysiqueOSTheme.textSecondary)
            .frame(height: 16, alignment: .leading)

            Chart {
                RectangleMark(
                    xStart: .value("In bed", night.inBedStart),
                    xEnd: .value("Out of bed", night.inBedEnd)
                )
                .foregroundStyle(PhysiqueOSTheme.sleepInBed)
                // Thin stage-transition connectors so the lanes read as one
                // continuous hypnogram rather than isolated blocks.
                ForEach(Array(zip(night.segments, night.segments.dropFirst())), id: \.0.id) { pair in
                    RuleMark(
                        x: .value("Transition", pair.1.start),
                        yStart: .value("From", pair.0.stage.label),
                        yEnd: .value("To", pair.1.stage.label)
                    )
                    .lineStyle(StrokeStyle(lineWidth: 0.75))
                    .foregroundStyle(PhysiqueOSTheme.textMuted.opacity(selectedSegment == nil ? 0.35 : 0.15))
                }
                ForEach(night.segments) { segment in
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
                    RuleMark(x: .value("Selected", selected))
                        .foregroundStyle(PhysiqueOSTheme.textPrimary.opacity(0.5))
                }
            }
            .chartYScale(domain: lanes)
            .chartXScale(domain: night.inBedStart.addingTimeInterval(-20 * 60)...night.inBedEnd.addingTimeInterval(20 * 60))
            .chartXSelection(value: $selected)
            .chartYAxis {
                AxisMarks(position: .leading) { value in
                    AxisValueLabel { axisLabel(value.as(String.self) ?? "") }
                }
            }
            .chartXAxis {
                AxisMarks(values: sleepHourMarks(night, from: night.inBedStart.addingTimeInterval(-20 * 60), to: night.inBedEnd.addingTimeInterval(20 * 60))) { value in
                    AxisGridLine().foregroundStyle(PhysiqueOSTheme.divider)
                    AxisValueLabel {
                        if let date = value.as(Date.self) { axisLabel(SleepFormat.clock(date, in: night.timeZone).replacingOccurrences(of: ":00", with: "")) }
                    }
                }
            }
            .environment(\.timeZone, night.timeZone)
            .frame(height: 176)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Sleep timeline with \(night.segments.count) stage segments from \(SleepFormat.clock(night.start, in: night.timeZone)) to \(SleepFormat.clock(night.end, in: night.timeZone)).")

            HStack(spacing: 12) {
                ForEach(SleepStage.allCases.reversed()) { stage in
                    HStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 2).fill(PhysiqueOSTheme.sleepColor(stage)).frame(width: 10, height: 8)
                        Text(stage.label)
                    }
                }
                HStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 2).fill(PhysiqueOSTheme.sleepInBed).frame(width: 10, height: 8)
                        .overlay(RoundedRectangle(cornerRadius: 2).strokeBorder(PhysiqueOSTheme.divider))
                    Text("In bed")
                }
            }
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(PhysiqueOSTheme.textMuted)
        }
    }
}

/// Pending-correction stand-in: the asleep window is final, stages are not.
struct SleepTimelinePendingView: View {
    let night: SleepPrototypeNight

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Chart {
                RectangleMark(xStart: .value("In bed", night.inBedStart), xEnd: .value("Out of bed", night.inBedEnd))
                    .foregroundStyle(PhysiqueOSTheme.sleepInBed)
                RectangleMark(xStart: .value("Fell asleep", night.start), xEnd: .value("Woke up", night.end), y: .value("Lane", "Asleep"), height: .ratio(0.5))
                    .cornerRadius(3)
                    .foregroundStyle(PhysiqueOSTheme.sleepTotal.opacity(0.55))
            }
            .chartXScale(domain: night.inBedStart.addingTimeInterval(-20 * 60)...night.inBedEnd.addingTimeInterval(20 * 60))
            .chartYAxis {
                AxisMarks(position: .leading) { value in AxisValueLabel { axisLabel(value.as(String.self) ?? "") } }
            }
            .chartXAxis {
                AxisMarks(values: sleepHourMarks(night, from: night.inBedStart.addingTimeInterval(-20 * 60), to: night.inBedEnd.addingTimeInterval(20 * 60))) { value in
                    AxisGridLine().foregroundStyle(PhysiqueOSTheme.divider)
                    AxisValueLabel {
                        if let date = value.as(Date.self) { axisLabel(SleepFormat.clock(date, in: night.timeZone).replacingOccurrences(of: ":00", with: "")) }
                    }
                }
            }
            .frame(height: 72)
            SleepRecalculatingNote(text: "The stage timeline will appear once this night is recalculated.")
        }
    }
}

struct SleepRecalculatingNote: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textMuted)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                Text("Stage detail is being recalculated.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Text(text)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Stage composition bar

struct SleepStageBar: View {
    let night: SleepPrototypeNight

    private var asleepStages: [SleepStage] { [.deep, .core, .rem] }

    var body: some View {
        let total = max(1, night.asleepSeconds)
        GeometryReader { geometry in
            HStack(spacing: 2) {
                ForEach(asleepStages) { stage in
                    RoundedRectangle(cornerRadius: 3)
                        .fill(PhysiqueOSTheme.sleepColor(stage))
                        .frame(width: max(2, (geometry.size.width - 4) * CGFloat(night.seconds(stage)) / CGFloat(total)))
                }
            }
        }
        .frame(height: 14)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(asleepStages.map { stage in
            "\(stage.label) \(SleepFormat.spokenDuration(night.seconds(stage))), \(Int((Double(night.seconds(stage)) / Double(total) * 100).rounded())) percent"
        }.joined(separator: ". "))
    }
}

// MARK: - Continuity trend (awake in window + longest continuous sleep)

struct SleepContinuityChart: View {
    /// Newest first; pending-correction nights render as gaps.
    let nights: [SleepPrototypeNight]

    var body: some View {
        let ordered = Array(nights.reversed())
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Awake in sleep window")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Chart {
                    ForEach(ordered.filter { $0.stageStatus == .available }) { night in
                        BarMark(
                            x: .value("Night", night.chartDate, unit: .day),
                            y: .value("Awake minutes", Double(night.awakeSeconds) / 60),
                            width: .ratio(0.55)
                        )
                        .cornerRadius(2)
                        .foregroundStyle(PhysiqueOSTheme.sleepAwake.opacity(0.75))
                    }
                }
                .chartXScale(domain: (ordered.first?.chartDate.addingTimeInterval(-43_200) ?? .now)...(ordered.last?.chartDate.addingTimeInterval(43_200) ?? .now))
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { value in
                        AxisGridLine().foregroundStyle(PhysiqueOSTheme.divider)
                        AxisValueLabel { axisLabel("\(value.as(Int.self) ?? 0)m") }
                    }
                }
                .chartXAxis(.hidden)
                .frame(height: 70)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("Longest continuous sleep")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Chart {
                    ForEach(ordered.filter { $0.stageStatus == .available }) { night in
                        PointMark(
                            x: .value("Night", night.chartDate, unit: .day),
                            y: .value("Hours", Double(night.longestAsleepStretchSeconds) / 3600)
                        )
                        .symbolSize(28)
                        .foregroundStyle(PhysiqueOSTheme.sleepTotal)
                    }
                }
                .chartXScale(domain: (ordered.first?.chartDate.addingTimeInterval(-43_200) ?? .now)...(ordered.last?.chartDate.addingTimeInterval(43_200) ?? .now))
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { value in
                        AxisGridLine().foregroundStyle(PhysiqueOSTheme.divider)
                        AxisValueLabel { axisLabel(String(format: "%.0fh", value.as(Double.self) ?? 0)) }
                    }
                }
                .chartXAxis {
                    AxisMarks(values: sleepDayLabelDates(nights)) { value in
                        AxisValueLabel {
                            if let date = value.as(Date.self) { axisLabel(date.formatted(.dateTime.month(.abbreviated).day())) }
                        }
                    }
                }
                .frame(height: 86)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Stage mix trend (100% stacked; inspection only)

struct SleepStageMixChart: View {
    let nights: [SleepPrototypeNight]

    private struct Share: Identifiable {
        let id: String
        let date: Date
        let stage: String
        let seconds: Int
    }

    var body: some View {
        let shares = nights.filter { $0.stageStatus == .available }.reversed().flatMap { night in
            [SleepStage.deep, .core, .rem].map { Share(id: night.sleepDay + $0.rawValue, date: night.chartDate, stage: $0.label, seconds: night.seconds($0)) }
        }
        Chart(shares) { share in
            BarMark(
                x: .value("Night", share.date, unit: .day),
                y: .value("Share", share.seconds),
                stacking: .normalized
            )
            .foregroundStyle(by: .value("Stage", share.stage))
        }
        .chartForegroundStyleScale([
            "Deep": PhysiqueOSTheme.sleepDeep,
            "Core": PhysiqueOSTheme.sleepCore,
            "REM": PhysiqueOSTheme.sleepREM,
        ])
        .chartYAxis {
            AxisMarks(position: .leading, values: [0, 0.5, 1]) { value in
                AxisGridLine().foregroundStyle(PhysiqueOSTheme.divider)
                AxisValueLabel { axisLabel("\(Int((value.as(Double.self) ?? 0) * 100))%") }
            }
        }
        .chartXAxis(.hidden)
        .chartLegend(position: .bottom, alignment: .leading)
        .frame(height: 140)
    }
}
