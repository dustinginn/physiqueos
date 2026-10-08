import SwiftUI

/// The approved single Recovery card, shared by Weekly and Monthly only.
///
/// Implements the accepted Recovery Briefing V1 one-card hierarchy in the
/// locked Briefing family (`weekly-midweek-light-translation-final-20261004`
/// Recovery section; `monthly-correction-dexa-photo-briefing-ui-20261004`
/// Monthly Recovery; the accepted Mineral Light rich `.recovery` field):
/// RECOVERY head → statement + coverage line + textual status → period
/// average vs prior-28-night personal baseline → Sleep trend (nights for
/// Weekly, Sunday-anchored week aggregates for Monthly) → inline Yellow/Red
/// commentary → conditional foam-rolling row → caveat.
///
/// No Recovery Score, no causal claims, no Confidence coupling. Green stays
/// quiet (no commentary); Not enough data is neutral. Every value is the
/// published card's; nothing here recomputes a status.
struct BriefingRecoverySection: View {
    static let identifier = "briefing.section.recovery"
    @Environment(\.colorScheme) private var colorScheme
    let card: BriefingRecoveryCard

    var body: some View {
        BriefingSection(field: .recovery, verticalPadding: card.cadence == .monthly ? 27 : 24, identifier: Self.identifier) {
            BriefingRecoveryContent(card: card)
        }
        .background {
            // Dark keeps the open canvas with the accepted Recovery tint
            // (Weekly) or the Monthly navy field; Mineral Light uses the
            // rich `.recovery` field drawn by `BriefingSection` itself.
            if colorScheme == .dark { darkBackground }
        }
    }

    @ViewBuilder
    private var darkBackground: some View {
        switch card.cadence {
        case .weekly:
            BriefingCSSGradient(angle: 120, stops: [
                .init(color: BriefingPalette.fixed(0x44D3DF, 0.07), location: 0),
                .init(color: BriefingPalette.fixed(0xAA8CFF, 0.025), location: 0.72),
                .init(color: BriefingPalette.fixed(0xAA8CFF, 0.025), location: 1),
            ])
        case .monthly:
            BriefingCSSGradient(angle: 130, stops: [
                .init(color: BriefingPalette.fixed(0x123243), location: 0),
                .init(color: BriefingPalette.fixed(0x18254B), location: 1),
            ])
        }
    }
}

private struct BriefingRecoveryContent: View {
    @Environment(\.briefingPalette) private var c
    let card: BriefingRecoveryCard

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BriefingSectionHead(glyph: "◒", label: "Recovery", tone: .cyan)
            lead
            metrics
            if card.status == .unavailable {
                unavailableNote
            } else {
                BriefingRecoveryTrendChart(card: card)
                if let commentary = card.commentary {
                    BriefingRecoveryCommentary(commentary: commentary, accent: statusColor)
                }
            }
            if let foam = card.foamRolling { foamRow(foam) }
            BriefingParagraph(BriefingRecoveryCopy.caveat(card), .j(10, 400, 1.45), color: c.muted)
                .padding(.top, 13)
                .accessibilityIdentifier("briefing.recovery.caveat")
        }
    }

    private var lead: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                BriefingParagraph(BriefingRecoveryCopy.title(card), .j(24, 700, 1.12, relativeTo: .title2), color: c.ink)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("briefing.recovery.title")
                Text(BriefingRecoveryCopy.summary(card))
                    .briefingText(.j(12, 400))
                    .foregroundStyle(c.muted)
                    .padding(.top, 5)
                    .accessibilityIdentifier("briefing.recovery.summary")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 6) {
                Circle().fill(statusColor).frame(width: 7, height: 7).accessibilityHidden(true)
                Text(card.status.label)
                    .briefingText(.j(12, 800))
                    .foregroundStyle(statusColor)
                    .fixedSize()
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Recovery status: \(card.status.label)")
            .accessibilityIdentifier("briefing.recovery.status")
        }
        .padding(.top, 16)
    }

    private var metrics: some View {
        HStack(alignment: .bottom, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(card.averageMinutes.map(BriefingRecoveryCopy.duration) ?? "—")
                    .briefingText(.j(30, 800, 1))
                    .foregroundStyle(c.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(card.cadence == .monthly ? "Month average" : "Period average")
                    .briefingText(.j(9, 800, tracking: 0.08, uppercase: true))
                    .foregroundStyle(c.muted)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(card.averageMinutes.map { "\(card.cadence == .monthly ? "Month" : "Period") average \(BriefingRecoveryCopy.spokenDuration($0))" } ?? "Period average unavailable")
            .accessibilityIdentifier("briefing.recovery.average")
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 6) {
                Text("28-night baseline · \(BriefingRecoveryCopy.duration(card.baselineMinutes))")
                    .briefingText(.j(12, 800))
                    .foregroundStyle(c.secondary)
                    .multilineTextAlignment(.trailing)
                Text("Personal baseline")
                    .briefingText(.j(9, 800, tracking: 0.08, uppercase: true))
                    .foregroundStyle(c.muted)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Personal baseline, prior 28 nights, \(BriefingRecoveryCopy.spokenDuration(card.baselineMinutes))")
            .accessibilityIdentifier("briefing.recovery.baseline")
        }
        .padding(.top, 17)
    }

    private var unavailableNote: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Keep wearing Apple Watch to sleep")
                .briefingText(.j(13, 800))
                .foregroundStyle(c.secondary)
            BriefingParagraph(BriefingRecoveryCopy.unavailableDetail(card), .j(11, 600, 1.55), color: c.muted)
        }
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { BriefingRecoveryDashedRule(color: c.line) }
        .overlay(alignment: .bottom) { BriefingRecoveryDashedRule(color: c.line) }
        .padding(.top, 14)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("briefing.recovery.unavailable")
    }

    private func foamRow(_ foam: BriefingRecoveryCard.FoamRolling) -> some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Foam rolling")
                    .briefingText(.j(12, 800))
                    .foregroundStyle(c.ink)
                Text(BriefingRecoveryCopy.foamDetail(foam))
                    .briefingText(.j(10, 400))
                    .foregroundStyle(c.muted)
            }
            Spacer(minLength: 0)
            Text("\(foam.completed) of \(foam.scheduled) completed")
                .briefingText(.j(13, 800))
                .foregroundStyle(c.ink)
                .fixedSize()
        }
        .padding(.top, 13)
        .briefingRule(.top, c.line)
        .padding(.top, 16)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("briefing.recovery.foam")
    }

    private var statusColor: Color { BriefingRecoveryCopy.statusColor(card.status, c) }
}

/// `.recovery-comment`: one inline block with a status-colored rule; never a
/// nested card. Yellow/Red only.
private struct BriefingRecoveryCommentary: View {
    @Environment(\.briefingPalette) private var c
    let commentary: BriefingRecoveryCard.Commentary
    let accent: Color

    var body: some View {
        BriefingParagraph(commentary.body, .j(12, 400, 1.5), color: c.secondary)
            .padding(.vertical, 13)
            .padding(.horizontal, 14)
            .padding(.leading, 3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(c.ink.opacity(0.055))
            .overlay(alignment: .leading) { Rectangle().fill(accent).frame(width: 3) }
            .padding(.top, 17)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(commentary.body)
            .accessibilityIdentifier("briefing.recovery.commentary")
    }
}

private struct BriefingRecoveryDashedRule: View {
    let color: Color
    var body: some View {
        Line().stroke(color, style: StrokeStyle(lineWidth: 1, dash: [4, 4])).frame(height: 1)
    }

    private struct Line: Shape {
        func path(in rect: CGRect) -> Path {
            var path = Path()
            path.move(to: CGPoint(x: rect.minX, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
            return path
        }
    }
}

/// `.sleep-chart`: a 144 pt plate with two grid rules, the dashed personal
/// baseline, the purple area + line and one point per published value.
/// Weekly x positions are the night's weekday (a missing night leaves a gap
/// instead of being invented); Monthly points are evenly spaced weeks.
struct BriefingRecoveryTrendChart: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.briefingPalette) private var c
    let card: BriefingRecoveryCard

    struct Plot: Equatable {
        var slots: Int
        var positions: [Int]
        var values: [Double]
        var labels: [String]
        var minimum: Double
        var maximum: Double
    }

    static func plot(_ card: BriefingRecoveryCard) -> Plot {
        let values = card.points.map(\.totalSleepMinutes)
        let all = values + [card.baselineMinutes]
        let minimum = (all.min() ?? 0) - 18
        let maximum = (all.max() ?? 0) + 18
        switch card.granularity {
        case .night:
            let start = BriefingRecoveryCardDecoder.calendarDate(card.periodStartDate)
            let positions = card.points.map { point -> Int in
                guard let start, let date = BriefingRecoveryCardDecoder.calendarDate(point.date) else { return 0 }
                return Int((date.timeIntervalSince(start) / 86_400).rounded())
            }
            return Plot(slots: 7, positions: positions, values: values, labels: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"], minimum: minimum, maximum: maximum)
        case .week:
            return Plot(slots: values.count, positions: Array(values.indices), values: values,
                        labels: values.indices.map { "W\($0 + 1)" }, minimum: minimum, maximum: maximum)
        }
    }

    var body: some View {
        let plot = Self.plot(card)
        VStack(spacing: 0) {
            Canvas { context, size in draw(plot, in: &context, size: size) }
                .frame(height: 144)
                .background(plateColor, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            HStack(spacing: 0) {
                ForEach(plot.labels.indices, id: \.self) { index in
                    Text(plot.labels[index])
                        .briefingText(.j(9, 700))
                        .foregroundStyle(c.muted)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, 8)
            .padding(.top, 6)
            .accessibilityHidden(true)
        }
        .padding(.top, 12)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(BriefingRecoveryCopy.chartSummary(card))
        .accessibilityIdentifier("briefing.recovery.chart")
    }

    private var plateColor: Color {
        colorScheme == .dark ? BriefingPalette.fixed(0x091A28, 0.62) : BriefingPalette.fixed(0x0E1C2B, 0.55)
    }

    private func draw(_ plot: Plot, in context: inout GraphicsContext, size: CGSize) {
        let inset: CGFloat = 14
        let range = max(plot.maximum - plot.minimum, 1)
        // Labels sit in equal columns; points sit on each column's center.
        let column = (size.width - 16) / CGFloat(max(plot.slots, 1))
        let x: (Int) -> CGFloat = { slot in 8 + column * (CGFloat(slot) + 0.5) }
        let y: (Double) -> CGFloat = { value in inset + CGFloat((plot.maximum - value) / range) * (size.height - 2 * inset) }

        let grid = BriefingPalette.fixed(0x9BB3BB, 0.17)
        for fraction in [0.32, 0.67] {
            var rule = Path()
            rule.move(to: CGPoint(x: inset, y: size.height * fraction))
            rule.addLine(to: CGPoint(x: size.width - inset, y: size.height * fraction))
            context.stroke(rule, with: .color(grid), lineWidth: 1)
        }
        var baseline = Path()
        baseline.move(to: CGPoint(x: inset, y: y(card.baselineMinutes)))
        baseline.addLine(to: CGPoint(x: size.width - inset, y: y(card.baselineMinutes)))
        context.stroke(baseline, with: .color(BriefingPalette.fixed(0x91A5AD)), style: StrokeStyle(lineWidth: 1.2, dash: [4, 4]))

        let points = zip(plot.positions, plot.values).map { CGPoint(x: x($0), y: y($1)) }
        guard let first = points.first, let last = points.last else { return }
        let purple = BriefingPalette.fixed(0xAA8CFF)
        if points.count > 1 {
            var area = Path()
            area.move(to: CGPoint(x: first.x, y: size.height - inset))
            points.forEach { area.addLine(to: $0) }
            area.addLine(to: CGPoint(x: last.x, y: size.height - inset))
            area.closeSubpath()
            context.fill(area, with: .linearGradient(
                Gradient(colors: [purple.opacity(0.28), purple.opacity(0)]),
                startPoint: CGPoint(x: 0, y: 0), endPoint: CGPoint(x: 0, y: size.height)
            ))
            var line = Path()
            line.addLines(points)
            context.stroke(line, with: .color(purple), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
        }
        for point in points {
            let dot = Path(ellipseIn: CGRect(x: point.x - 4, y: point.y - 4, width: 8, height: 8))
            context.fill(dot, with: .color(purple))
            context.stroke(dot, with: .color(BriefingPalette.fixed(0x102A39)), lineWidth: 2)
        }
    }
}

/// Every user-facing Recovery string, derived from the card's published
/// values (never from diagnostic codes).
enum BriefingRecoveryCopy {
    static func title(_ card: BriefingRecoveryCard) -> String {
        switch card.status {
        case .green: "Sleep stayed in your usual range"
        case .yellow: card.commentary?.headline ?? "Sleep was below your usual range"
        case .red: card.commentary?.headline ?? "Sleep was well below your usual range"
        case .unavailable: card.cadence == .monthly ? "Not enough nights for a monthly status" : "Not enough nights for a weekly status"
        }
    }

    static func summary(_ card: BriefingRecoveryCard) -> String {
        let coverage = "\(card.observedNights) of \(card.expectedNights) nights"
        guard let average = card.averageMinutes else { return "\(coverage) available" }
        var parts = ["\(duration(average)) average"]
        if let delta = card.deltaMinutes { parts.append("\(signedMinutes(delta)) vs baseline") }
        parts.append(coverage)
        return parts.joined(separator: " · ")
    }

    static func unavailableDetail(_ card: BriefingRecoveryCard) -> String {
        card.cadence == .monthly
            ? "Recovery needs at least 20 nights in the month for a monthly status. Your personal baseline is ready."
            : "Recovery needs at least 5 of 7 nights for a weekly status. Your personal baseline is ready."
    }

    static func foamDetail(_ foam: BriefingRecoveryCard.FoamRolling) -> String {
        let remaining = foam.scheduled - foam.completed
        return remaining == 0 ? "Full execution · status unchanged" : "\(remaining) not completed · status unchanged"
    }

    static func caveat(_ card: BriefingRecoveryCard) -> String {
        var sentences = ["Sleep uses the prior 28 reliable nights and excludes this period."]
        if card.foamRolling != nil { sentences.append("Foam rolling cannot set the Recovery status.") }
        sentences.append("Associations do not imply causation.")
        return sentences.joined(separator: " ")
    }

    static func chartSummary(_ card: BriefingRecoveryCard) -> String {
        let plot = BriefingRecoveryTrendChart.plot(card)
        let names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        let values = zip(plot.positions, card.points).map { position, point -> String in
            let name = card.granularity == .night ? names[min(max(position, 0), 6)] : "Week \(position + 1)"
            return "\(name) \(spokenDuration(point.totalSleepMinutes))"
        }
        let kind = card.granularity == .night ? "Weekly Sleep trend" : "Monthly Sleep trend by week"
        return "\(kind): \(values.joined(separator: ", ")). Personal baseline \(spokenDuration(card.baselineMinutes)). Status \(card.status.label)."
    }

    /// `6h 47m`.
    static func duration(_ minutes: Double) -> String {
        let total = Int(minutes.rounded())
        return "\(total / 60)h \(String(format: "%02d", total % 60))m"
    }

    static func spokenDuration(_ minutes: Double) -> String {
        let total = Int(minutes.rounded())
        return "\(total / 60) hours \(total % 60) minutes"
    }

    /// `+2m` / `−43m` (true minus) / `±0m`.
    static func signedMinutes(_ value: Double) -> String {
        let rounded = Int(value.rounded())
        if rounded > 0 { return "+\(rounded)m" }
        if rounded < 0 { return "−\(abs(rounded))m" }
        return "±0m"
    }

    static func statusColor(_ status: BriefingRecoveryCard.Status, _ c: BriefingPalette) -> Color {
        switch status {
        case .green: c.green
        case .yellow: c.amber
        case .red: BriefingPalette.d(0xFF697A, 0xFF8A97)
        case .unavailable: c.muted
        }
    }
}
