import SwiftUI

/// Photo set/session detail (`.photoSetDetail(setId:)`) — the content of
/// the web-style Photo Evidence sheet, which has no URL of its own. Mirrors
/// the modal's own content and Previous/Next paging through every pose view
/// in the session:
///
/// per view — side-by-side Previous/Current comparison (or a single image
/// when no prior comparison exists) → "Interpretation" → "Capture
/// Conditions" → collapsible "Source History".
struct PhotoSetDetailView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: PhotoSetDetailViewModel?
    @State private var viewModelAuthority: NativeAPIEnvironment?
    @State private var selectedViewIndex = 0
    @State private var didApplyInitialPose = false
    @State private var isSourceHistoryExpanded = false
    /// The shared full-screen inspection viewer (`PhotoInspectionViewer`), the
    /// same one the Photo Briefing uses.
    @State private var inspection: PhotoInspectionRequest?
    let setId: String
    let initialPoseId: PhotoPoseID?

    init(setId: String, initialPoseId: PhotoPoseID? = nil) {
        self.setId = setId
        self.initialPoseId = initialPoseId
    }

    private let m = EvidenceMetrics(family: .record)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                content
            }
            .padding(.horizontal, m.pt(15))
            .padding(.top, m.pt(14))
            .padding(.bottom, m.pt(42))
        }
        .background(m.c.page)
        .photoInspection($inspection, chrome: .record)
        .navigationBarTitleDisplayMode(.inline)
        .evidenceFamily(.record)
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = PhotoSetDetailViewModel(api: environment.photosAPI, setId: setId)
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
            if environment.nativeAuthority == .sandbox {
                await environment.founderPhotoMediaStore.loadManifestIfNeeded()
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStateCard(kind: .loading("Loading photo set…"), identifier: "photos.detail.loading")
        case .failed(let message):
            EvidenceStateCard(kind: .message(title: message, detail: nil), identifier: "photos.detail.failure")
        case .loaded(.none):
            if environment.nativeAuthority == .sandbox,
               let set = environment.founderPhotoMediaStore.projectedSetsByID[setId] {
                setContent(set)
            } else {
                EvidenceStateCard(kind: .message(title: "No photo set found for this date.", detail: nil), identifier: "photos.detail.empty")
            }
        case .loaded(.some(let set)):
            setContent(set)
        }
    }

    private func setContent(_ set: PhotoSetRecord) -> some View {
        Group {
            if set.views.isEmpty {
                EvidenceStateCard(kind: .message(title: "No confirmed views are available for this photo set.", detail: nil), identifier: "photos.detail.empty")
            } else {
                let clampedIndex = min(selectedViewIndex, set.views.count - 1)
                let view = set.views[clampedIndex]
                VStack(alignment: .leading, spacing: 0) {
                    header(for: set, view: view, index: clampedIndex)
                    comparisonCard(view)
                    if view.interpretationSummary != nil { interpretationCard(view) }
                    if view.conditionSummary != nil { conditionsCard(view) }
                    if view.sourceHistory != nil { sourceHistoryCard(view) }
                    viewPager(set: set, currentIndex: clampedIndex)
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("photos.detail")
            }
        }
        .onAppear {
            guard !didApplyInitialPose else { return }
            if let initialPoseId,
               let index = set.views.firstIndex(where: { $0.poseId == initialPoseId }) {
                selectedViewIndex = index
            }
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-physiqueos.evidence-review.source-expanded") {
                isSourceHistoryExpanded = true
            }
            if let role = Self.reviewInspectRole {
                let view = set.views[min(selectedViewIndex, set.views.count - 1)]
                let items = Self.inspectionItems(
                    for: view,
                    previousSource: view.hasComparisonImage ? previousSource(for: view) : nil,
                    currentSource: environment.photoMediaSource(for: view),
                    currentDate: RecordDate.long(view.captureDate)
                )
                inspection = PhotoInspectionRequest.make(items: items, tappedID: "\(view.id):\(role)")
            }
            #endif
            didApplyInitialPose = true
        }
    }

    /// Pose is the title; set date and canonical position below.
    private func header(for set: PhotoSetRecord, view: PhotoViewRecord, index: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("PROGRESS PHOTO EVIDENCE")
                .evidenceText(RecordText.eyebrow)
                .foregroundStyle(m.c.accent)
            Text(view.poseId.label)
                .evidenceText(EvidenceTextStyle(size: 25, weight: 780, lineHeight: 26.25, tracking: -1, relativeTo: .title))
                .foregroundStyle(m.c.ink)
                .accessibilityAddTraits(.isHeader)
                // CoreText sets SF Pro Display 1 pt lower in the tight
                // 26.25-px box and ends the box 1 pt early (measured).
                .offset(y: -1)
                .padding(.bottom, 1)
                .padding(.top, m.pt(5))
            Text("\(RecordDate.long(set.date)) · \(index + 1) of \(set.views.count) poses")
                .evidenceText(EvidenceTextStyle(size: 12, weight: 400, lineHeight: 16.2, relativeTo: .subheadline))
                .foregroundStyle(m.c.muted)
                .padding(.top, m.pt(2))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, m.pt(16))
        .accessibilityElement(children: .contain)
    }

    /// Two equal 58-px controls stepping through the canonical pose order.
    private func viewPager(set: PhotoSetRecord, currentIndex: Int) -> some View {
        HStack(spacing: m.pt(10)) {
            pagerButton("Previous", disabled: currentIndex == 0, identifier: "photos.detail.previousPose") {
                selectedViewIndex = max(0, currentIndex - 1)
            }
            pagerButton("Next", disabled: currentIndex == set.views.count - 1, identifier: "photos.detail.nextPose") {
                selectedViewIndex = min(set.views.count - 1, currentIndex + 1)
            }
        }
    }

    private func pagerButton(_ title: String, disabled: Bool, identifier: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .evidenceText(.normal(12, 800, jakarta: false))
                .foregroundStyle(disabled ? m.c.quiet : m.c.ink)
                .opacity(disabled ? 0.55 : 1)
                .frame(maxWidth: .infinity, minHeight: m.pt(58))
                .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(14)))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .accessibilityValue(disabled ? "Unavailable" : "")
        .accessibilityIdentifier(identifier)
    }

    /// Previous + Current side by side when a comparison exists; otherwise
    /// the Current photo with the exact comparison absence. Renders through
    /// the shared `ProgressPhotoTile`. The selected pose comes from the
    /// destination's stable pose identity, never from a preview index.
    private func comparisonCard(_ view: PhotoViewRecord) -> some View {
        let group = Self.inspectionItems(
            for: view,
            previousSource: view.hasComparisonImage ? previousSource(for: view) : nil,
            currentSource: environment.photoMediaSource(for: view),
            currentDate: RecordDate.long(view.captureDate)
        )
        return RecordCard {
            if view.hasComparisonImage {
                HStack(alignment: .top, spacing: m.pt(8)) {
                    evidencePhoto(role: "Previous", date: RecordDate.long(shortLabel: view.comparedAgainst, before: view.captureDate), source: previousSource(for: view), group: group, id: "\(view.id):previous")
                    evidencePhoto(role: "Current", date: RecordDate.long(view.captureDate), source: environment.photoMediaSource(for: view), group: group, id: "\(view.id):current")
                }
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    evidencePhoto(role: "Current", date: RecordDate.long(view.captureDate), source: environment.photoMediaSource(for: view), group: group, id: "\(view.id):current")
                    Text(view.comparedAgainst)
                        .evidenceText(RecordText.rowCopy)
                        .foregroundStyle(m.c.quiet)
                        .padding(.top, m.pt(7))
                }
            }
        }
        .padding(.bottom, m.pt(17))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("photos.detail.comparison")
    }

    /// Previous (when a comparison exists) then Current, in swipe order.
    static func inspectionItems(
        for view: PhotoViewRecord,
        previousSource: PhotoMediaSource?,
        currentSource: PhotoMediaSource,
        currentDate: String
    ) -> [PhotoInspectionItem] {
        var items: [PhotoInspectionItem] = []
        if let previousSource {
            items.append(PhotoInspectionItem(
                id: "\(view.id):previous",
                title: "\(view.poseId.label) · Previous",
                caption: RecordDate.long(shortLabel: view.comparedAgainst, before: view.captureDate),
                source: previousSource
            ))
        }
        items.append(PhotoInspectionItem(
            id: "\(view.id):current",
            title: "\(view.poseId.label) · Current",
            caption: currentDate,
            source: currentSource
        ))
        return items
    }

    /// `.photo-tile` (240 px), date and role.
    private func evidencePhoto(
        role: String,
        date: String,
        source: PhotoMediaSource,
        group: [PhotoInspectionItem],
        id: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ProgressPhotoTile(roleLabel: role, source: source, caption: date, showsRoleLabel: false, style: .record, cornerRadius: m.pt(10))
                .frame(height: m.pt(240))
                .inspectsPhoto(group, tapped: id, presenting: $inspection, showsCornerGlyph: false)
                .accessibilityIdentifier("photos.detail.\(role.lowercased())")
            Text(date)
                .evidenceText(.normal(10, 760, jakarta: false))
                .foregroundStyle(m.c.ink)
                .padding(.top, m.pt(3))
            Text(role.uppercased())
                .evidenceText(.normal(9, 850, jakarta: false, tracking: 0.72))
                .foregroundStyle(m.c.quiet)
                .padding(.top, m.pt(5))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Server-owned presentation copy — fixtured verbatim, never
    /// recomputed locally (see `PhotosReadModel.swift`'s doc comment on
    /// `PhotoViewRecord`).
    private func interpretationCard(_ view: PhotoViewRecord) -> some View {
        RecordCard {
            VStack(alignment: .leading, spacing: 0) {
                Text("INTERPRETATION")
                    .evidenceText(RecordText.eyebrow)
                    .foregroundStyle(m.c.accent)
                if let interpretationSummary = view.interpretationSummary {
                    Text(interpretationSummary)
                        .evidenceText(RecordText.body)
                        .foregroundStyle(m.c.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, m.pt(7))
                }
                if let bullets = view.comparisonBullets, !bullets.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(bullets, id: \.self) { bullet in
                            HStack(alignment: .firstTextBaseline, spacing: 0) {
                                Text("•")
                                    .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 13.05, relativeTo: .caption2))
                                    .frame(width: m.pt(14), alignment: .center)
                                Text(bullet)
                                    .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 13.05, relativeTo: .caption2))
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .foregroundStyle(m.c.muted)
                        }
                    }
                    .padding(.top, m.pt(7))
                }
            }
        }
        .padding(.bottom, m.pt(17))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("photos.detail.interpretation")
    }

    private func conditionsCard(_ view: PhotoViewRecord) -> some View {
        RecordCard {
            VStack(alignment: .leading, spacing: 0) {
                Text("CAPTURE CONDITIONS")
                    .evidenceText(RecordText.eyebrow)
                    .foregroundStyle(m.c.quiet)
                if let conditionSummary = view.conditionSummary {
                    Text(conditionSummary)
                        .evidenceText(RecordText.body)
                        .foregroundStyle(m.c.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, m.pt(7))
                }
            }
        }
        .padding(.bottom, m.pt(17))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("photos.detail.conditions")
    }

    /// Independent disclosure; expands in place with a ruled body.
    private func sourceHistoryCard(_ view: PhotoViewRecord) -> some View {
        RecordCard {
            VStack(alignment: .leading, spacing: 0) {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { isSourceHistoryExpanded.toggle() }
                } label: {
                    HStack(alignment: .top) {
                        Text("SOURCE HISTORY")
                            .evidenceText(RecordText.eyebrow)
                            .foregroundStyle(m.c.quiet)
                        Spacer(minLength: m.pt(12))
                        Text(isSourceHistoryExpanded ? "⌃" : "⌄")
                            .evidenceText(.normal(16, 400, jakarta: false))
                            .foregroundStyle(m.c.accent)
                    }
                    .frame(height: m.pt(19), alignment: .top)
                    .contentShape(Rectangle().inset(by: -m.pt(12)))
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Source History")
                .accessibilityValue(isSourceHistoryExpanded ? "Expanded" : "Collapsed")
                .accessibilityAddTraits(.isButton)
                .accessibilityIdentifier("photos.detail.sourceHistory")

                if isSourceHistoryExpanded, let sourceHistory = view.sourceHistory {
                    Text(sourceHistory)
                        .evidenceText(RecordText.body)
                        .foregroundStyle(m.c.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, m.pt(9))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(alignment: .top) { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
                        .padding(.top, m.pt(9))
                }
            }
        }
        .padding(.bottom, m.pt(17))
    }

    private func previousSource(for view: PhotoViewRecord) -> PhotoMediaSource {
        // Founder Production: the prior photo's opaque media id is already
        // embedded on the view record itself — no lookup needed.
        if let priorMediaId = view.priorMediaId { return .authenticatedProduction(mediaId: priorMediaId) }
        #if DEBUG
        if SyntheticProgressPhoto.isEnabled {
            return .assetName(SyntheticProgressPhoto.name(poseId: view.poseId, date: "prior-\(view.comparedAgainst)"))
        }
        #endif
        guard let item = environment.founderPhotoMediaStore.itemsByViewIdentity.values.first(where: {
            $0.poseId == view.poseId && TrainingDateFormatting.short($0.captureDate) == view.comparedAgainst
        }) else { return .placeholder }
        return environment.founderPhotoMediaStore.source(viewIdentity: item.viewIdentity)
    }

    #if DEBUG
    /// `-physiqueos.evidence-review.photo-inspect previous|current` opens the
    /// inspector on that role for the locked P5 review.
    static var reviewInspectRole: String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let flag = arguments.firstIndex(of: "-physiqueos.evidence-review.photo-inspect"),
              arguments.indices.contains(flag + 1) else { return nil }
        return arguments[flag + 1]
    }
    #endif
}
