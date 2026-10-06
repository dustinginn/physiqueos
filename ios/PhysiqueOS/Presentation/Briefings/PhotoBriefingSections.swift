import SwiftUI
import UIKit

/// Photo Event Briefing — visual-first — in the Founder-locked event family
/// (`dexa-photo-founder-flow-confirmation-20261004`): the exact production
/// flow Hero → This Photo Session (facts, conditions, every session pose) →
/// What Visibly Changed (one of three mutually exclusive branches:
/// completion-journey comparisons, ordinary comparisons, or text only) →
/// What The Complete Evidence Means → Coach's Insight (+ next milestone) →
/// optional Completion Decision.
///
/// No Confidence, forecast or Phase Review (Confidence is persisted but not
/// part of the Photo presentation), and no Recovery. Session poses open the
/// shared single-photo viewer (paging, pinch, pan, double-tap); a matched
/// comparison opens the locked paired Previous / Current viewer whose zoom
/// and pan are synchronized. Media renders through the same authenticated
/// `ProgressPhotoTile` seam as Progress Photos Evidence.
struct PhotoBriefingSections: View {
    static let sectionInventory = ["Hero", "Snapshot", "Progress", "Interpretation", "Coach's Insight", "Completion Decision"]
    static let heroTypeLabel = "PHOTO EVENT"
    @Environment(AppEnvironment.self) private var environment
    let content: PhotoBriefingContent
    var onNavigate: (AppDestination) -> Void = { _ in }
    /// The shared full-screen inspection viewer (`PhotoInspectionViewer`), the
    /// same one Progress Photos Evidence uses.
    @State private var inspection: PhotoInspectionRequest?
    /// The paired Previous / Current comparison viewer.
    @State private var comparison: PhotoComparisonInspection?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            hero
            sessionSection
            progressSection
            interpretationSection
            coachSection
            if let experience = content.completionExperience {
                completionDecisionSection(experience.decision)
            }
        }
        .photoInspection($inspection)
        .fullScreenCover(item: $comparison) { request in
            PhotoComparisonViewer(request: request)
        }
        .task(id: environment.nativeAuthority) {
            if environment.nativeAuthority == .sandbox {
                await environment.founderPhotoMediaStore.loadManifestIfNeeded()
            }
            #if DEBUG
            openReviewViewerIfRequested()
            #endif
        }
        .accessibilityIdentifier("briefing.photo")
    }

    // MARK: Hero

    private var hero: some View {
        BriefingEventHero(
            eyebrow: Self.heroTypeLabel,
            date: BriefingDateFormatting.monthDay(content.eventDate),
            title: content.heroTitle,
            summary: content.heroBody
        )
    }

    // MARK: This Photo Session

    private var sessionSection: some View {
        BriefingEventSection(identifier: "briefing.photo.session") {
            BriefingEventSectionHead(label: content.snapshotTitle, trailing: content.completionLabel)
            BriefingEventFactGrid(items: [
                ("Date", BriefingDateFormatting.monthDay(content.eventDate)),
                ("Set", content.completionLabel),
                ("Weight", content.weightLabel),
            ])
            BriefingEventConditions(lines: [content.poseLabels.joined(separator: " · "), content.conditionsSummary].filter { !$0.isEmpty })
            photoGrid
        }
    }

    private var photoGrid: some View {
        let items = content.activeViews.map { view in
            PhotoInspectionItem(
                id: view.id,
                title: view.displayLabel,
                caption: BriefingDateFormatting.shortDate(view.captureDate),
                source: mediaSource(for: view)
            )
        }
        return BriefingEventPoseGrid(count: content.activeViews.count) { index in
            let view = content.activeViews[index]
            // The photo is the tap target (the shared viewer); swiping there
            // pages through the rest of this session's poses.
            VStack(alignment: .leading, spacing: 0) {
                BriefingEventPhotoFrame(roleLabel: view.displayLabel, source: mediaSource(for: view), cornerRadius: 12)
                    .inspectsPhoto(items, tapped: view.id, presenting: $inspection)
                BriefingEventCaption(title: view.displayLabel, detail: BriefingDateFormatting.monthDay(view.captureDate))
            }
        }
    }

    // MARK: What Visibly Changed

    @ViewBuilder
    private var progressSection: some View {
        BriefingEventSection(identifier: "briefing.photo.progress") {
            BriefingEventLabel(text: content.progressTitle)
            if !content.progressBody.isEmpty {
                BriefingEventTitle(text: content.progressBody)
            }
            if let experience = content.completionExperience {
                if !experience.recentComparisons.isEmpty {
                    BriefingEventSubLabel(text: "Since Last Check-In")
                    comparisonList(experience.recentComparisons)
                }
                if !experience.journeyComparisons.isEmpty {
                    BriefingEventSubLabel(text: "From First Upload to Now")
                    comparisonList(experience.journeyComparisons)
                }
                if !experience.newBaselines.isEmpty {
                    BriefingEventSubLabel(text: "New Baselines")
                    ForEach(experience.newBaselines) { baseline in
                        BriefingEventComparisonNote(title: baseline.poseId.label, text: baseline.narrative)
                    }
                }
            } else if !content.ordinaryComparisons.isEmpty {
                comparisonList(content.ordinaryComparisons)
            }
        }
    }

    private func comparisonList(_ entries: [PhotoComparisonEntry]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                comparisonRow(entry, isFirst: index == 0)
            }
        }
    }

    private func comparisonRow(_ entry: PhotoComparisonEntry, isFirst: Bool) -> some View {
        let request = Self.comparisonRequest(
            for: entry,
            previousSource: comparisonMediaSource(entry, previous: true),
            currentSource: comparisonMediaSource(entry, previous: false)
        )
        return BriefingEventComparison(
            title: [entry.roleLabel, entry.displayLabel].compactMap { $0 }.joined(separator: " · "),
            range: entry.priorDate.map { "\(BriefingDateFormatting.monthDay($0)) → \(BriefingDateFormatting.monthDay(entry.currentDate))" },
            narrative: entry.narrative,
            isFirst: isFirst
        ) {
            HStack(alignment: .top, spacing: 8) {
                comparisonPane(entry, previous: true, request: request)
                comparisonPane(entry, previous: false, request: request)
            }
        }
    }

    private func comparisonPane(_ entry: PhotoComparisonEntry, previous: Bool, request: PhotoComparisonInspection?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            BriefingEventPhotoFrame(roleLabel: previous ? "Previous" : "Current", source: comparisonMediaSource(entry, previous: previous), cornerRadius: 14)
                .overlay(alignment: .topTrailing) {
                    if request != nil { BriefingEventExpandGlyph() }
                }
                .contentShape(Rectangle())
                .onTapGesture { if let request { comparison = request } }
                .accessibilityAddTraits(request != nil ? .isButton : [])
                .accessibilityHint(request != nil ? "Opens Previous and Current side by side to zoom together" : "")
            BriefingEventPaneCaption(
                role: previous ? "Previous" : "Current",
                date: previous ? entry.priorDate.map(BriefingDateFormatting.monthDay) : BriefingDateFormatting.monthDay(entry.currentDate)
            )
        }
        .frame(maxWidth: .infinity)
    }

    /// The two photos of one comparison, in swipe order (Previous, then
    /// Current). Only a side with real media can be inspected, so a new
    /// baseline's absent prior never advertises expansion.
    static func inspectionItems(
        for entry: PhotoComparisonEntry,
        previousSource: PhotoMediaSource,
        currentSource: PhotoMediaSource
    ) -> [PhotoInspectionItem] {
        [
            PhotoInspectionItem(
                id: "\(entry.id):previous",
                title: "\(entry.poseId.label) · Previous",
                caption: entry.priorDate.map(BriefingDateFormatting.shortDate),
                source: previousSource
            ),
            PhotoInspectionItem(
                id: "\(entry.id):current",
                title: "\(entry.poseId.label) · Current",
                caption: BriefingDateFormatting.shortDate(entry.currentDate),
                source: currentSource
            ),
        ]
    }

    /// A paired request needs at least one inspectable side; a missing prior
    /// stays an empty pane rather than borrowing another photo.
    static func comparisonRequest(for entry: PhotoComparisonEntry, previousSource: PhotoMediaSource, currentSource: PhotoMediaSource) -> PhotoComparisonInspection? {
        let items = inspectionItems(for: entry, previousSource: previousSource, currentSource: currentSource)
        guard items.contains(where: \.isInspectable) else { return nil }
        return PhotoComparisonInspection(
            title: entry.displayLabel,
            range: entry.priorDate.map { "\(BriefingDateFormatting.monthDay($0)) → \(BriefingDateFormatting.monthDay(entry.currentDate))" } ?? BriefingDateFormatting.monthDay(entry.currentDate),
            previous: items[0].isInspectable ? items[0] : nil,
            current: items[1].isInspectable ? items[1] : nil,
            previousLabel: "Previous\(entry.priorDate.map { " · \(BriefingDateFormatting.monthDay($0))" } ?? "")",
            currentLabel: "Current · \(BriefingDateFormatting.monthDay(entry.currentDate))"
        )
    }

    // MARK: What The Complete Evidence Means

    private var interpretationSection: some View {
        BriefingEventSection(identifier: "briefing.photo.interpretation") {
            BriefingEventLabel(text: content.interpretationTitle)
            BriefingEventParagraphRules(paragraphs: content.interpretationParagraphs)
        }
    }

    // MARK: Coach's Insight

    private var coachSection: some View {
        BriefingEventCoach(
            label: "Coach's Insight",
            text: content.coachInsightBody,
            // Verified real behavior: the next milestone shows only when there
            // is no completion-experience module below.
            milestone: content.completionExperience == nil ? content.nextMilestoneLabel : nil
        )
    }

    // MARK: Completion decision

    @ViewBuilder
    private func completionDecisionSection(_ decision: PhotoCompletionDecision) -> some View {
        BriefingEventSection(identifier: "briefing.photo.decision") {
            switch decision.state {
            case .completed:
                BriefingEventLabel(text: "Goal Achieved")
                if let title = decision.nextGoalTitle { BriefingEventBody(text: title) }
                if let label = decision.nextGoalActionLabel {
                    // Verified real behavior: an inert control on the live
                    // product ("· Coming next").
                    BriefingEventInertPill(text: label)
                }
            case .awaitingDecision:
                BriefingEventLabel(text: "Your Decision")
                if let question = decision.question { BriefingEventBody(text: question) }
                if let label = decision.keepOpenActionLabel, let destination = decision.keepOpenDestination {
                    BriefingEventAction(text: label) { onNavigate(destination) }
                }
            case .retry:
                BriefingEventLabel(text: "Upload Again")
                if let question = decision.retryQuestion { BriefingEventBody(text: question) }
                if let label = decision.retryActionLabel, let destination = decision.retryDestination {
                    BriefingEventAction(text: label, prominent: true) { onNavigate(destination) }
                }
            }
        }
    }

    #if DEBUG
    /// Capture seam (absent from Release): `-physiqueos.briefing-review.photo-compare <n>`
    /// opens the paired viewer on comparison n; `…photo-inspect <n>` opens
    /// the single viewer on session pose n.
    private func openReviewViewerIfRequested() {
        let arguments = ProcessInfo.processInfo.arguments
        func value(_ flag: String) -> Int? {
            guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else { return nil }
            return Int(arguments[index + 1])
        }
        if let n = value("-physiqueos.briefing-review.photo-compare") {
            let entries = content.completionExperience.map { $0.recentComparisons + $0.journeyComparisons } ?? content.ordinaryComparisons
            if entries.indices.contains(n) {
                let entry = entries[n]
                comparison = Self.comparisonRequest(for: entry, previousSource: comparisonMediaSource(entry, previous: true), currentSource: comparisonMediaSource(entry, previous: false))
            }
        } else if let n = value("-physiqueos.briefing-review.photo-inspect"), content.activeViews.indices.contains(n) {
            let items = content.activeViews.map { PhotoInspectionItem(id: $0.id, title: $0.displayLabel, caption: BriefingDateFormatting.shortDate($0.captureDate), source: mediaSource(for: $0)) }
            inspection = PhotoInspectionRequest.make(items: items, tappedID: content.activeViews[n].id)
        }
    }
    #endif

    // MARK: Media

    private func mediaSource(for view: PhotoBriefingView) -> PhotoMediaSource {
        #if DEBUG
        if SyntheticProgressPhoto.isEnabled { return .assetName(SyntheticProgressPhoto.name(poseId: view.poseId, date: view.captureDate)) }
        #endif
        if environment.nativeAuthority == .founderProduction {
            return view.mediaId.map(PhotoMediaSource.authenticatedProduction) ?? .placeholder
        }
        let item = environment.founderPhotoMediaStore.resolvedItem(
            setId: view.setId,
            captureDate: view.captureDate,
            poseId: view.poseId
        )
        return item.map { environment.founderPhotoMediaStore.source(viewIdentity: $0.viewIdentity) } ?? .placeholder
    }

    private func comparisonMediaSource(_ entry: PhotoComparisonEntry, previous: Bool) -> PhotoMediaSource {
        #if DEBUG
        if SyntheticProgressPhoto.isEnabled {
            guard let date = previous ? entry.priorDate : entry.currentDate else { return .placeholder }
            return .assetName(SyntheticProgressPhoto.name(poseId: entry.poseId, date: date))
        }
        #endif
        if environment.nativeAuthority == .founderProduction {
            let mediaId = previous ? entry.priorMediaId : entry.currentMediaId
            return mediaId.map(PhotoMediaSource.authenticatedProduction) ?? .placeholder
        }
        let resolved = environment.founderPhotoMediaStore.resolvedComparisonItems(
            priorSetId: entry.priorSetId,
            priorDate: entry.priorDate,
            currentSetId: entry.currentSetId,
            currentDate: entry.currentDate,
            poseId: entry.poseId
        )
        let item = previous ? resolved.prior : resolved.current
        return item.map { environment.founderPhotoMediaStore.source(viewIdentity: $0.viewIdentity) } ?? .placeholder
    }
}

// MARK: - Locked event family (Photo + DEXA)

/// `dexa-photo-founder-flow-confirmation` tokens (402 px Jakarta harness).
enum BriefingEventPalette {
    static let bg = BriefingPalette.d(0x06131C, 0xEDF0E9)
    static let surface = BriefingPalette.d(0x0D1D29, 0xF8F8F3)
    static let surface2 = BriefingPalette.d(0x112432, 0xDCE9E5)
    static let ink = BriefingPalette.d(0xF2F6F6, 0x102638)
    static let muted = BriefingPalette.d(0x91A4AD, 0x60727B)
    static let rule = BriefingPalette.d(0x203341, 0xC9D2CF)
    static let teal = BriefingPalette.d(0x35C8C1, 0x078F88)
    static let green = BriefingPalette.d(0x4BDC95, 0x138F63)
    static let purple = BriefingPalette.d(0xA68AF8, 0x7356D9)
    static let amber = BriefingPalette.d(0xF5BD4F, 0xB97912)
    static let coral = BriefingPalette.d(0xF06D84, 0xB7415A)
    static let viewer = BriefingPalette.d(0x02070C, 0xE3E9E5)
}

/// `.hero` (event): compact teal field, eyebrow + date, 31 px title.
struct BriefingEventHero<Extra: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    let eyebrow: String
    let date: String
    let title: String
    let summary: String
    @ViewBuilder var extra: Extra

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 10) {
                Text(eyebrow)
                    .briefingText(.jn(10, 850, tracking: 0.11, uppercase: true))
                    .foregroundStyle(colorScheme == .dark ? BriefingPalette.fixed(0xD6C9FF) : BriefingPalette.fixed(0x6B4FD0))
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
                Text(date)
                    .briefingText(.jn(11, 400))
                    .foregroundStyle(colorScheme == .dark ? BriefingPalette.fixed(0xF5FAF9, 0.7) : BriefingPalette.fixed(0x4F6670))
            }
            BriefingParagraph(title, .j(31, 700, 1.05, tracking: -0.03, relativeTo: .largeTitle), color: colorScheme == .dark ? BriefingPalette.fixed(0xF5FAF9) : BriefingPalette.fixed(0x102638))
                .padding(.top, 18)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("briefing.hero.headline")
            if !summary.isEmpty {
                BriefingParagraph(summary, .j(13, 400, 1.5), color: colorScheme == .dark ? BriefingPalette.fixed(0xD8E6E6) : BriefingPalette.fixed(0x3F5C63))
                    .padding(.top, 10)
            }
            extra
        }
        .padding(EdgeInsets(top: 28, leading: 22, bottom: 30, trailing: 22))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            BriefingAppearanceBackground {
                BriefingCSSGradient(angle: 150, stops: [.init(color: BriefingPalette.fixed(0x0A8C80), location: 0), .init(color: BriefingPalette.fixed(0x0B5366), location: 0.58), .init(color: BriefingPalette.fixed(0x172D5A), location: 1)])
            } light: {
                BriefingCSSGradient(angle: 150, stops: [.init(color: BriefingPalette.fixed(0xD6EEEA), location: 0), .init(color: BriefingPalette.fixed(0xC4E1DF), location: 0.58), .init(color: BriefingPalette.fixed(0xD7DFEF), location: 1)])
            }
            // `.hero:after` — 330 px circle, 54 px border, right −175, bottom −145.
            // An overlay keeps the field's own bounds (the ring never sizes it).
            .overlay(alignment: .bottomTrailing) {
                Circle()
                    .strokeBorder(BriefingPalette.fixed(0x4CE29F, 0.18), lineWidth: 54)
                    .frame(width: 330, height: 330)
                    .offset(x: 175, y: 145)
                    .accessibilityHidden(true)
            }
            .clipped()
        }
        .padding(.horizontal, -BriefingLayout.pageGutter)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("briefing.hero")
    }
}

extension BriefingEventHero where Extra == EmptyView {
    init(eyebrow: String, date: String, title: String, summary: String) {
        self.init(eyebrow: eyebrow, date: date, title: title, summary: summary) { EmptyView() }
    }
}

/// `.section` (event): 28 / 8 / 8 padding, bottom rule.
struct BriefingEventSection<Content: View>: View {
    var bottomPadding: CGFloat = 8
    var identifier: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(EdgeInsets(top: 28, leading: 8, bottom: bottomPadding, trailing: 8))
            .frame(maxWidth: .infinity, alignment: .leading)
            .briefingRule(.bottom, BriefingEventPalette.rule)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier(identifier)
    }
}

/// `.section-label` (10 px, 0.11 em, 850, uppercase; inline in a 14 px block).
struct BriefingEventLabel: View {
    let text: String
    var color: Color = BriefingEventPalette.ink

    var body: some View {
        Text(text)
            .briefingStrutText(.jn(10, 850, tracking: 0.11, uppercase: true), parentSize: 16, parentLineHeight: 21)
            .foregroundStyle(color)
            .accessibilityAddTraits(.isHeader)
    }
}

struct BriefingEventSectionHead: View {
    let label: String
    let trailing: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(label)
                .briefingText(.jn(10, 850, tracking: 0.11, uppercase: true))
                .foregroundStyle(BriefingEventPalette.ink)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            Text(trailing)
                .briefingText(.jn(10, 850, tracking: 0.11, uppercase: true))
                .foregroundStyle(BriefingEventPalette.ink)
        }
    }
}

struct BriefingEventTitle: View {
    let text: String

    var body: some View {
        BriefingParagraph(text, .j(24, 700, 1.08, tracking: -0.025, relativeTo: .title2), color: BriefingEventPalette.ink)
            .padding(.top, 12)
            .padding(.bottom, 8)
    }
}

struct BriefingEventBody: View {
    let text: String

    var body: some View {
        BriefingParagraph(text, .j(12, 400, 1.52), color: BriefingEventPalette.muted)
            .padding(.top, 10)
    }
}

/// A smaller tracked label separating completion-journey groups.
struct BriefingEventSubLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .briefingText(.j(9, 800, tracking: 0.07, uppercase: true))
            .foregroundStyle(BriefingEventPalette.teal)
            .padding(.top, 16)
            .accessibilityAddTraits(.isHeader)
    }
}

/// `.fact-grid`: three centered facts on 1 px rule gutters, full width.
struct BriefingEventFactGrid: View {
    let items: [(String, String)]

    var body: some View {
        HStack(spacing: 1) {
            ForEach(items.indices, id: \.self) { index in
                VStack(spacing: 5) {
                    Text(items[index].0)
                        .briefingStrutText(.jn(8, 400, tracking: 0.07, uppercase: true), parentSize: 16, parentLineHeight: 21)
                        .foregroundStyle(BriefingEventPalette.muted)
                    Text(items[index].1)
                        .briefingText(.jn(11, 700))
                        .foregroundStyle(BriefingEventPalette.ink)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, 13)
                .padding(.horizontal, 7)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .background(BriefingPalette.standard.page)
                .accessibilityElement(children: .combine)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .background(BriefingEventPalette.rule)
        .padding(.horizontal, -8)
        .padding(.top, 17)
    }
}

/// `.conditions`: muted lines above a rule.
struct BriefingEventConditions: View {
    let lines: [String]

    var body: some View {
        BriefingParagraph(lines.joined(separator: "\n"), .j(11, 400, 1.45), color: BriefingEventPalette.muted)
            .padding(.vertical, 13)
            .briefingRule(.bottom, BriefingEventPalette.rule)
            // `p.conditions` keeps the UA 1em block margins.
            .padding(.vertical, 11)
    }
}

/// `.pose-grid`: three columns, 8 px gaps.
struct BriefingEventPoseGrid<Cell: View>: View {
    let count: Int
    @ViewBuilder var cell: (Int) -> Cell

    var body: some View {
        let rows = stride(from: 0, to: count, by: 3).map { Array($0..<min($0 + 3, count)) }
        VStack(alignment: .leading, spacing: 8) {
            ForEach(rows.indices, id: \.self) { row in
                HStack(alignment: .top, spacing: 8) {
                    ForEach(rows[row], id: \.self) { index in cell(index).frame(maxWidth: .infinity, alignment: .topLeading) }
                    ForEach(0..<(3 - rows[row].count), id: \.self) { _ in Color.clear.frame(maxWidth: .infinity, maxHeight: 0) }
                }
            }
        }
        .padding(.top, 14 - 11)
    }
}

/// A 3:4 photo viewport using the shared record tile states.
struct BriefingEventPhotoFrame: View {
    let roleLabel: String
    let source: PhotoMediaSource
    var cornerRadius: CGFloat

    var body: some View {
        Color.clear
            .aspectRatio(3.0 / 4.0, contentMode: .fit)
            .overlay {
                ProgressPhotoTile(roleLabel: roleLabel, source: source, showsRoleLabel: false, style: .record, cornerRadius: cornerRadius)
            }
    }
}

/// `.expand`: 22 px corner glyph.
struct BriefingEventExpandGlyph: View {
    var body: some View {
        Text("↗")
            .briefingText(.j(11, 700))
            .foregroundStyle(.white)
            .frame(width: 22, height: 22)
            .background(BriefingPalette.fixed(0x030B10, 0.58), in: Circle())
            .padding(6)
            .accessibilityHidden(true)
            .allowsHitTesting(false)
    }
}

struct BriefingEventCaption: View {
    let title: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            BriefingParagraph(title, .j(9, 800, 1.3), color: BriefingEventPalette.ink)
            Text(detail)
                .briefingText(.jn(8, 400))
                .foregroundStyle(BriefingEventPalette.muted)
        }
        .padding(.top, 5)
        .accessibilityElement(children: .combine)
    }
}

struct BriefingEventPaneCaption: View {
    let role: String
    let date: String?

    var body: some View {
        HStack(spacing: 4) {
            Text(role)
                .briefingText(.jn(9, 700, tracking: 0.06, uppercase: true))
                .foregroundStyle(BriefingEventPalette.ink)
            Spacer(minLength: 0)
            if let date {
                Text(date)
                    .briefingText(.jn(9, 400))
                    .foregroundStyle(BriefingEventPalette.muted)
            }
        }
        .padding(.top, 6)
        .accessibilityElement(children: .combine)
    }
}

/// `.comparison`: pose title + range, the pair, then the canonical caption.
struct BriefingEventComparison<Pair: View>: View {
    let title: String
    let range: String?
    let narrative: String
    let isFirst: Bool
    @ViewBuilder var pair: Pair

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // `align-items: flex-end`: the range sits on the title box's bottom.
            HStack(alignment: .bottom, spacing: 10) {
                BriefingParagraph(title, .jn(16, 700), color: BriefingEventPalette.ink)
                    .accessibilityAddTraits(.isHeader)
                if let range {
                    Text(range)
                        .briefingText(.jn(9, 400, tracking: 0.07, uppercase: true))
                        .foregroundStyle(BriefingEventPalette.muted)
                        .fixedSize()
                }
            }
            pair.padding(.top, 10)
            if !narrative.isEmpty {
                BriefingParagraph(narrative, .j(11, 400, 1.48), color: BriefingEventPalette.muted)
                    .padding(.top, 10)
            }
        }
        .padding(.vertical, 20)
        .modifier(BriefingEventTopRule(enabled: !isFirst))
        .accessibilityElement(children: .contain)
    }
}

private struct BriefingEventTopRule: ViewModifier {
    let enabled: Bool
    func body(content: Content) -> some View {
        if enabled { content.briefingRule(.top, BriefingEventPalette.rule) } else { content }
    }
}

struct BriefingEventComparisonNote: View {
    let title: String
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            BriefingParagraph(title, .j(13, 700), color: BriefingEventPalette.ink)
            BriefingParagraph(text, .j(11, 400, 1.48), color: BriefingEventPalette.muted)
        }
        .padding(.vertical, 12)
        .briefingRule(.bottom, BriefingEventPalette.rule)
        .accessibilityElement(children: .combine)
    }
}

/// `.interpretation p`: paragraphs on top rules.
struct BriefingEventParagraphRules: View {
    let paragraphs: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(paragraphs.enumerated()), id: \.offset) { _, paragraph in
                BriefingParagraph(paragraph, .j(12, 400, 1.52), color: BriefingEventPalette.muted)
                    .padding(.vertical, 12)
                    .briefingRule(.top, BriefingEventPalette.rule)
            }
        }
    }
}

/// `.coach` (event): the navy insight card with the next milestone row.
struct BriefingEventCoach: View {
    @Environment(\.colorScheme) private var colorScheme
    let label: String
    let text: String
    var milestone: String?
    var milestoneLabel = "Next milestone"
    var rows: [(String, String)] = []
    enum RowStyle { case stacked, dexa }
    var rowStyle: RowStyle = .stacked

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .briefingStrutText(.jn(10, 850, tracking: 0.11, uppercase: true), parentSize: 16, parentLineHeight: 21)
                .foregroundStyle(BriefingPalette.fixed(0xCBBCFF))
                .accessibilityAddTraits(.isHeader)
            if !text.isEmpty {
                BriefingParagraph(text, .j(14, 400, 1.55), color: BriefingPalette.fixed(0xF5F7F8))
                    .padding(.top, 12)
            }
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                switch rowStyle {
                case .stacked:
                    VStack(alignment: .leading, spacing: 4) {
                        Text(row.0)
                            .briefingText(.j(9, 800, tracking: 0.08, uppercase: true))
                            .foregroundStyle(BriefingPalette.fixed(0xCBBCFF))
                        BriefingParagraph(row.1, .j(13, 400, 1.5), color: BriefingPalette.fixed(0xF5F7F8, 0.88))
                    }
                    .padding(.top, 14)
                case .dexa:
                    // `.coach-item`: 64 px label column + statement on a top rule.
                    HStack(alignment: .top, spacing: 9) {
                        BriefingParagraph(row.0, .jn(9, 800, uppercase: true), color: BriefingPalette.fixed(0x8FE5C1))
                            .frame(width: 64, alignment: .leading)
                        BriefingParagraph(row.1, .j(11, 700, 1.42), color: BriefingPalette.fixed(0xF5F7F8))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.vertical, 12)
                    .briefingRule(.top, Color.white.opacity(0.14))
                    .padding(.top, index == 0 ? 10 : 0)
                    .accessibilityElement(children: .combine)
                }
            }
            if let milestone, !milestone.isEmpty {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(milestoneLabel)
                        .briefingText(.jn(10, 400))
                        .foregroundStyle(BriefingPalette.fixed(0xF5F7F8))
                    Spacer(minLength: 0)
                    Text(milestone)
                        .briefingText(.jn(11, 700))
                        .foregroundStyle(BriefingPalette.fixed(0xF5F7F8))
                        .multilineTextAlignment(.trailing)
                }
                .padding(.top, 14)
                .briefingRule(.top, Color.white.opacity(0.14))
                .padding(.top, 18)
                .accessibilityElement(children: .combine)
            }
        }
        .padding(EdgeInsets(top: 22, leading: 18, bottom: 22, trailing: 18))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            BriefingAppearanceBackground {
                BriefingCSSGradient(angle: 135, stops: [.init(color: BriefingPalette.fixed(0x0E3141), location: 0), .init(color: BriefingPalette.fixed(0x1C315C), location: 1)])
            } light: {
                BriefingCSSGradient(angle: 135, stops: [.init(color: BriefingPalette.fixed(0x133C49), location: 0), .init(color: BriefingPalette.fixed(0x2A3665), location: 1)])
            }
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        // `.coach { margin: 24px -7px 0 }`.
        .padding(.horizontal, -7)
        .padding(.top, 24)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("briefing.event.coach")
    }
}

struct BriefingEventInertPill: View {
    let text: String

    var body: some View {
        Text(text)
            .briefingText(.j(11, 700))
            .foregroundStyle(BriefingEventPalette.muted)
            .padding(.horizontal, 12)
            .frame(minHeight: 32)
            .background(BriefingEventPalette.surface2, in: Capsule())
            .padding(.top, 12)
    }
}

struct BriefingEventAction: View {
    let text: String
    var prominent = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(text)
                .briefingText(.j(13, 800))
                .foregroundStyle(prominent ? Color.white : BriefingEventPalette.teal)
                .frame(maxWidth: prominent ? .infinity : nil, minHeight: 44)
                .padding(.horizontal, prominent ? 0 : 2)
                .background(prominent ? BriefingEventPalette.teal : .clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.top, 12)
    }
}

// MARK: - Paired Previous / Current viewer

/// A request to inspect one matched comparison side by side.
struct PhotoComparisonInspection: Identifiable, Equatable {
    let id = UUID()
    var title: String
    var range: String
    var previous: PhotoInspectionItem?
    var current: PhotoInspectionItem?
    var previousLabel: String
    var currentLabel: String
}

/// The locked paired comparison viewer: Previous and Current stay visible
/// side by side in one shared zoomable plane, so pinch and pan move both
/// together (equivalent scale and position). Read-only; swipe down or
/// Close dismisses; zoom resets on reopen.
struct PhotoComparisonViewer: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    let request: PhotoComparisonInspection
    @State private var zoom: CGFloat = 1
    @State private var resetToken = 0

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 8) {
                Button { dismiss() } label: {
                    Text("✕")
                        .briefingText(.j(17, 600))
                        .frame(width: 44, height: 44)
                        .background(colorScheme == .dark ? Color.white.opacity(0.12) : BriefingPalette.fixed(0x102638, 0.1), in: Circle())
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close comparison")
                .accessibilityIdentifier("briefing.photo.comparison.close")
                VStack(spacing: 2) {
                    Text(request.title).briefingText(.j(14, 700))
                    Text(request.range).briefingText(.j(10, 400)).foregroundStyle(BriefingPalette.fixed(0x99A8AE))
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .combine)
                Color.clear.frame(width: 44, height: 44)
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 4)
            BriefingPairedZoomView(
                previous: image(for: request.previous),
                current: image(for: request.current),
                resetToken: resetToken,
                paneColor: colorScheme == .dark ? UIColor(red: 0.04, green: 0.08, blue: 0.106, alpha: 1) : UIColor(red: 0.824, green: 0.867, blue: 0.847, alpha: 1),
                onZoom: { zoom = $0 }
            )
            .overlay(alignment: .topLeading) { paneLabels }
            .accessibilityElement()
            .accessibilityLabel("\(request.title) comparison, \(request.previousLabel), \(request.currentLabel)")
            .accessibilityValue("Zoom \(Self.zoomLabel(zoom))")
            .accessibilityHint("Pinch to zoom both photos together. Double tap to zoom in or out.")
            .accessibilityAction(named: "Reset zoom") { resetToken += 1 }
            HStack {
                Text("Pinch to zoom · synchronized pan")
                Spacer(minLength: 0)
                Text(Self.zoomLabel(zoom)).foregroundStyle(BriefingEventPalette.teal).briefingText(.j(10, 800))
            }
            .briefingText(.j(10, 400))
            .foregroundStyle(BriefingPalette.fixed(0x9AA9B0))
            .padding(.top, 11)
            .padding(.horizontal, 4)
        }
        .foregroundStyle(colorScheme == .dark ? Color.white : BriefingPalette.fixed(0x102638))
        .padding(.horizontal, 10)
        .padding(.bottom, 18)
        .background(BriefingEventPalette.viewer.ignoresSafeArea())
        .gesture(DragGesture(minimumDistance: 30).onEnded { value in
            if zoom <= 1.01, value.translation.height > 120, abs(value.translation.width) < 80 { dismiss() }
        })
        .accessibilityAction(.escape) { dismiss() }
        .task { await load() }
        .onDisappear { resetToken += 1 }
    }

    static func zoomLabel(_ zoom: CGFloat) -> String {
        zoom < 1.05 ? "1×" : String(format: "%.1f×", zoom)
    }

    private var paneLabels: some View {
        GeometryReader { geometry in
            let paneWidth = (geometry.size.width - 6) / 2
            HStack(spacing: 6) {
                label(request.previousLabel).frame(width: paneWidth, alignment: .topLeading)
                label(request.currentLabel).frame(width: paneWidth, alignment: .topLeading)
            }
        }
        .allowsHitTesting(false)
    }

    private func label(_ text: String) -> some View {
        Text(text)
            .briefingText(.j(9, 600))
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 7)
            .background(BriefingPalette.fixed(0x030B10, 0.7), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .padding(8)
    }

    private func image(for item: PhotoInspectionItem?) -> UIImage? {
        guard let item else { return nil }
        switch item.source {
        case .authenticatedProduction(let mediaId):
            let store = environment.founderProductionPhotoMediaStore
            if case .loaded(let full) = store.inspectionImageStates[mediaId] { return full }
            if case .loaded(let thumb) = store.imageStates[mediaId] { return thumb }
            return nil
        case .authenticatedSandbox(let viewIdentity, _):
            if case .loaded(let image) = environment.founderPhotoMediaStore.imageStates[viewIdentity] { return image }
            return nil
        case .assetName:
            return item.source.localImage
        case .placeholder, .remoteURL:
            return nil
        }
    }

    private func load() async {
        for item in [request.previous, request.current].compactMap({ $0 }) {
            switch item.source {
            case .authenticatedProduction(let mediaId):
                await environment.founderProductionPhotoMediaStore.loadInspectionImage(mediaId: mediaId)
            case .authenticatedSandbox(let viewIdentity, let mediaId):
                await environment.founderPhotoMediaStore.loadImage(viewIdentity: viewIdentity, mediaId: mediaId)
            default:
                break
            }
        }
    }
}

/// One `UIScrollView` whose zoomable content is the aligned pair, so a
/// single transform scales and pans both panes together (no drift between
/// two scroll views). Each image is aspect-fit inside its own pane.
struct BriefingPairedZoomView: UIViewRepresentable {
    var previous: UIImage?
    var current: UIImage?
    var resetToken: Int
    var paneColor: UIColor
    var onZoom: (CGFloat) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onZoom: onZoom) }

    func makeUIView(context: Context) -> UIScrollView {
        let scroll = UIScrollView()
        scroll.delegate = context.coordinator
        scroll.minimumZoomScale = 1
        scroll.maximumZoomScale = 5
        scroll.bouncesZoom = true
        scroll.showsVerticalScrollIndicator = false
        scroll.showsHorizontalScrollIndicator = false
        scroll.contentInsetAdjustmentBehavior = .never
        let content = context.coordinator.content
        scroll.addSubview(content)
        for view in [context.coordinator.previousView, context.coordinator.currentView] {
            view.contentMode = .scaleAspectFit
            view.clipsToBounds = true
            content.addSubview(view)
        }
        let doubleTap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.doubleTapped(_:)))
        doubleTap.numberOfTapsRequired = 2
        scroll.addGestureRecognizer(doubleTap)
        context.coordinator.scroll = scroll
        return scroll
    }

    func updateUIView(_ scroll: UIScrollView, context: Context) {
        let coordinator = context.coordinator
        coordinator.onZoom = onZoom
        coordinator.previousView.image = previous
        coordinator.currentView.image = current
        coordinator.previousView.backgroundColor = paneColor
        coordinator.currentView.backgroundColor = paneColor
        if coordinator.resetToken != resetToken {
            coordinator.resetToken = resetToken
            scroll.setZoomScale(1, animated: false)
        }
        coordinator.layout()
    }

    final class Coordinator: NSObject, UIScrollViewDelegate {
        let content = UIView()
        let previousView = UIImageView()
        let currentView = UIImageView()
        weak var scroll: UIScrollView?
        var onZoom: (CGFloat) -> Void
        var resetToken = 0

        init(onZoom: @escaping (CGFloat) -> Void) { self.onZoom = onZoom }

        func layout() {
            guard let scroll, scroll.zoomScale <= 1.001 else { return }
            let size = scroll.bounds.size
            guard size.width > 0 else {
                DispatchQueue.main.async { [weak self] in self?.layout() }
                return
            }
            content.frame = CGRect(origin: .zero, size: size)
            let paneWidth = (size.width - 6) / 2
            previousView.frame = CGRect(x: 0, y: 0, width: paneWidth, height: size.height)
            currentView.frame = CGRect(x: paneWidth + 6, y: 0, width: paneWidth, height: size.height)
            scroll.contentSize = size
        }

        func viewForZooming(in scrollView: UIScrollView) -> UIView? { content }

        func scrollViewDidZoom(_ scrollView: UIScrollView) {
            onZoom(scrollView.zoomScale)
        }

        @objc func doubleTapped(_ recognizer: UITapGestureRecognizer) {
            guard let scroll else { return }
            if scroll.zoomScale > 1.01 {
                scroll.setZoomScale(1, animated: true)
            } else {
                let point = recognizer.location(in: content)
                let scale: CGFloat = 2.5
                let size = CGSize(width: scroll.bounds.width / scale, height: scroll.bounds.height / scale)
                scroll.zoom(to: CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2, width: size.width, height: size.height), animated: true)
            }
        }
    }
}
