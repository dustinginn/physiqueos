import SwiftUI

/// Mirrors `HomeConfidenceDetailBody` inside `HomeConfidenceDetail.jsx`: the
/// bottom-sheet explanation shown when the Confidence ring is tapped. The
/// web has no separate "Confidence" screen/route today — this is an
/// in-place detail sheet on Home, not a navigation destination, and native
/// preserves that rather than inventing a route the product doesn't have.
///
/// Locked Final Design Batch 2 (H02): a ring header, the qualitative band,
/// then divided factor groups. Only Server-authored copy is laid out; empty
/// groups are omitted and V3 never shows `assumptions`.
struct ConfidenceDetailSheet: View {
    let confidence: Int
    let detail: ConfidenceDetail
    @State private var detent: PresentationDetent = Self.initialDetent

    private static var initialDetent: PresentationDetent {
#if DEBUG
        if ConfidenceReviewFixture.requested != nil { return .large }
#endif
        return .medium
    }

    private var isV3: Bool { detail.schemaVersion == "home_confidence_presentation_v3" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                band
                if isV3 {
                    if let why = detail.whyConfidence, !why.isEmpty {
                        narrativeSection(symbol: "arrow.up.right", title: "Why confidence is here", text: why)
                    } else if !detail.summary.isEmpty {
                        narrative(detail.summary).padding(.bottom, 4)
                    }
                    factorGroup(symbol: "arrow.up", title: "What increased it", items: detail.whatIncreasedIt)
                    factorGroup(symbol: "checkmark", title: "What supports it now", items: detail.whatSupportsItNow)
                    factorGroup(symbol: "exclamationmark", title: "What is holding it back", items: detail.whatIsHoldingItBack)
                    factorGroup(symbol: "plus", title: "What could raise it", items: detail.whatCouldRaiseIt)
                    factorGroup(symbol: "minus", title: "What could lower it", items: detail.whatCouldLowerIt)
                    if let nextEvidence = detail.nextEvidence, !nextEvidence.isEmpty {
                        narrativeSection(symbol: "diamond", title: "Next evidence", text: nextEvidence)
                    }
                    if let coachTake = detail.coachTake, !coachTake.isEmpty {
                        narrativeSection(symbol: "sparkle", title: "Coach's take", text: coachTake)
                    }
                } else {
                    if let why = detail.whyConfidence, !why.isEmpty {
                        narrative(why).padding(.bottom, 4)
                    } else if !detail.summary.isEmpty {
                        narrative(detail.summary).padding(.bottom, 4)
                    }
                    factorGroup(symbol: "arrow.left.arrow.right", title: "What changed", items: detail.movementFactors)
                    factorGroup(symbol: "checkmark", title: "What supports confidence", items: detail.supportingFactors)
                    factorGroup(symbol: "questionmark", title: "What limits confidence", items: detail.limitingFactors)
                    factorGroup(symbol: "arrow.up.right", title: "What will make confidence clearer", items: detail.clarifyingFactors)
                    if !detail.uncertaintyStatement.isEmpty {
                        narrative(detail.uncertaintyStatement)
                            .padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(PhysiqueOSTheme.captureSurfaceTint)
                            .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                            .overlay(alignment: .leading) {
                                Rectangle().fill(PhysiqueOSTheme.capturePurple).frame(width: 3)
                            }
                            .padding(.top, 10)
                            .accessibilityIdentifier("confidence.uncertainty")
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 21)
            .padding(.bottom, 34)
        }
        .background(PhysiqueOSTheme.captureSurface)
        .presentationBackground(PhysiqueOSTheme.captureSurface)
        .presentationDetents([.medium, .large], selection: $detent)
        .presentationDragIndicator(.visible)
        .accessibilityIdentifier("confidence.sheet")
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Goal confidence").captureFont(CaptureType.eyebrow).foregroundStyle(PhysiqueOSTheme.capturePurple)
                Text("Why confidence is \(confidence)%")
                    .captureFont(CaptureType.title)
                    .foregroundStyle(PhysiqueOSTheme.captureInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 2)
                Text("The evidence currently supporting and limiting the overall trajectory.")
                    .captureFont(CaptureType.lede)
                    .foregroundStyle(PhysiqueOSTheme.captureSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            ConfidenceSheetRing(value: confidence)
        }
        .accessibilityElement(children: .combine)
    }

    private var band: some View {
        HStack(spacing: 7) {
            Circle().fill(PhysiqueOSTheme.captureGreen).frame(width: 8, height: 8).accessibilityHidden(true)
            Text("Current confidence: \(detail.qualitativeLevel)")
                .captureFont(CaptureType.date)
                .fontWeight(.heavy)
                .foregroundStyle(PhysiqueOSTheme.captureGreen)
        }
        .padding(.top, 15)
        .padding(.bottom, 5)
        .accessibilityIdentifier("confidence.band")
    }

    private func narrative(_ text: String) -> some View {
        Text(text)
            .captureFont(CaptureType.lede)
            .foregroundStyle(PhysiqueOSTheme.captureSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 6)
    }

    private func sectionTitle(symbol: String, title: String) -> some View {
        HStack(spacing: 9) {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(PhysiqueOSTheme.captureTeal)
                .frame(width: 22)
                .accessibilityHidden(true)
            Text(title)
                .captureFont(CaptureType.note)
                .fontWeight(.heavy)
                .foregroundStyle(PhysiqueOSTheme.captureInk)
                .accessibilityAddTraits(.isHeader)
        }
    }

    private var rule: some View {
        Rectangle().fill(PhysiqueOSTheme.captureRule).frame(height: 1).accessibilityHidden(true)
    }

    private func narrativeSection(symbol: String, title: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            rule
            sectionTitle(symbol: symbol, title: title).padding(.top, 17)
            narrative(text).padding(.bottom, 17)
        }
        .padding(.top, 14)
    }

    @ViewBuilder
    private func factorGroup(symbol: String, title: String, items: [String]) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                rule
                sectionTitle(symbol: symbol, title: title).padding(.top, 17)
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .firstTextBaseline, spacing: 9) {
                        Text("•").foregroundStyle(PhysiqueOSTheme.captureTeal).accessibilityHidden(true)
                        Text(item)
                            .foregroundStyle(PhysiqueOSTheme.captureSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .captureFont(CaptureType.Style(size: 14, weight: .regular))
                    .padding(.top, 8)
                }
                Spacer().frame(height: 17)
            }
        }
    }
}

/// The locked 80 pt ring: green progress on a muted track, value centered.
struct ConfidenceSheetRing: View {
    let value: Int

    var body: some View {
        ZStack {
            Circle().stroke(PhysiqueOSTheme.captureMuted.opacity(0.24), lineWidth: 8)
            Circle()
                .trim(from: 0, to: CGFloat(min(max(value, 0), 100)) / 100)
                .stroke(PhysiqueOSTheme.captureGreen, style: StrokeStyle(lineWidth: 8, lineCap: .butt))
                .rotationEffect(.degrees(-90))
            Text("\(value)%")
                .font(.system(size: 23, weight: .bold))
                .foregroundStyle(PhysiqueOSTheme.captureInk)
                .minimumScaleFactor(0.7)
        }
        .padding(4)
        .frame(width: 80, height: 80)
        .accessibilityElement()
        .accessibilityLabel("Confidence \(value) percent")
    }
}

#if DEBUG
/// Review captures with the locked board's exact V3/V2 copy
/// (`-physiqueos.confidence-review v3|v2`). DEBUG only.
enum ConfidenceReviewFixture {
    static var requested: (confidence: Int, detail: ConfidenceDetail)? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-physiqueos.confidence-review"),
              arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1] == "v2" ? (74, v2) : (79, v3)
    }

    static let v3 = ConfidenceDetail(
        qualitativeLevel: "Moderate", supportingFactors: [], limitingFactors: [], clarifyingFactors: [],
        uncertaintyStatement: "",
        schemaVersion: "home_confidence_presentation_v3",
        whyConfidence: "You are more than halfway to the 10 lb lean-mass goal. The build plan is clearly working. There is enough time to finish ahead of schedule if this level of progress continues.",
        whatIncreasedIt: ["You added 5.0 lb of lean mass since August 15.", "Body fat stayed controlled at 8.1%."],
        whatSupportsItNow: ["4.2 lb remain with 49 days left."],
        whatIsHoldingItBack: ["One excellent response does not guarantee the same result until the next DEXA."],
        whatCouldRaiseIt: ["Consistent execution can strengthen confidence before the next DEXA.",
                           "The next DEXA showing that the progress continues.", "Reaching the goal."],
        whatCouldLowerIt: ["Meaningful missed work or persistent departures from the plan.",
                           "Body fat moving outside the intended range of 8–9.",
                           "Training performance materially declining.",
                           "Progress stalling or a new result contradicting the current outlook.",
                           "Falling far enough behind that there is no longer enough time to finish the goal."],
        nextEvidence: "The next DEXA is about whether this kind of progress continues while body fat stays in a good place—not whether the plan works. That question has been answered.",
        coachTake: "Keep executing consistently. Keep the current setup in place."
    )

    static let v2 = ConfidenceDetail(
        qualitativeLevel: "Moderate",
        supportingFactors: ["Training has been consistently strong for the last few weeks."],
        limitingFactors: ["Calories still need more consistency before we can tell whether this intake is right."],
        clarifyingFactors: ["Another body-composition check will confirm the trend."],
        uncertaintyStatement: "",
        movementFactors: ["Confidence increased because training consistency improved."],
        summary: "Training and adherence have both been strong recently."
    )
}
#endif
