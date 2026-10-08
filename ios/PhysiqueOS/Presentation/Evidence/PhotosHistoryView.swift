import SwiftUI

/// The Progress Photos Evidence landing/history page (`/progress/photos`),
/// reached from the Evidence tab's Progress Photos row. Section order
/// mirrors `ProgressPhotoGallery.jsx` exactly:
///
/// header → scope selector (Build Lean Mass / Visible Abs / All Photos) →
/// Latest Photo Set (hero card) → Uploaded Photos (collapsible history,
/// preview 3) → Data Sources.
///
/// When the authenticated acceptance manifest is available, its exact
/// session/pose identities replace only the fixture media projection; no
/// interpretation or unrelated Founder data is requested. Fixture mode
/// remains an honest labeled placeholder fallback.
struct PhotosHistoryView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.scenePhase) private var scenePhase
    @State private var viewModel: PhotosHistoryViewModel?
    @State private var viewModelAuthority: NativeAPIEnvironment?
    @State private var isHistoryExpanded = Self.reviewHistoryExpanded
    @State private var selectedPhotoSet: PhotoSetRecord?
    @State private var didOpenReviewDetail = false
    @ScaledMetric(relativeTo: .caption) private var tagScale: CGFloat = 1

    static let historyPreviewLimit = 3
    private let m = EvidenceMetrics(family: .record, domain: .photos)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                content
            }
            .padding(.horizontal, m.pt(15))
            .padding(.top, m.pt(14))
            .padding(.bottom, m.pt(42))
        }
        .physiqueOSScrollBottomClearance()
        .defaultScrollAnchor(Self.reviewScrollAnchor)
        .evidencePageChrome("Progress Photos")
        .evidenceFamily(.record)
        .evidenceDomain(.photos)
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = PhotosHistoryViewModel(
                    api: environment.photosAPI,
                    briefingAPI: environment.nativeAuthority == .founderProduction ? environment.briefingAPI : nil
                )
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
            if environment.nativeAuthority == .sandbox {
                await environment.founderPhotoMediaStore.loadManifestIfNeeded()
            }
        }
        // Production: ask the Server whether the latest set's Photo Briefing is
        // published, refreshing on a bounded cadence only while it is pending. The
        // task is cancelled when this screen leaves or the app backgrounds.
        .task(id: "\(viewModel?.latestSetId ?? "-"):\(scenePhase == .active)") {
            guard environment.nativeAuthority == .founderProduction, scenePhase == .active,
                  let viewModel, let sessionId = viewModel.latestSetId else { return }
            await viewModel.watchPhotoBriefing(sessionId: sessionId)
        }
        .sheet(item: $selectedPhotoSet) { set in
            PhotoEvidenceDetailSheet(set: set)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStateCard(kind: .loading("Loading Progress Photos…"), identifier: "photos.loading")
        case .failed(let message):
            EvidenceStateCard(kind: .failure(title: message, detail: "Pull to refresh or try again."), identifier: "photos.failure")
        case .loaded(let landing):
            let displayed = environment.nativeAuthority == .sandbox
                ? (environment.founderPhotoMediaStore.projectedLanding(
                    from: landing,
                    scope: viewModel?.scope ?? PhotosScopeDefault.selection
                ) ?? landing)
                : landing
            EvidenceHeaderView(
                domain: .photos,
                eyebrow: "Evidence Report",
                title: displayed.title,
                subtitle: displayed.subtitle ?? "What PhysiqueOS currently understands.",
                exposesTexts: true
            )
            EvidenceScopePicker(scope: displayed.scope) { pillID in
                Task { await viewModel?.selectScope(pillID: pillID) }
            }
            if !Self.reviewHidesLatest {
                latestSetCard(displayed.latestSet)
                if let set = displayed.latestSet {
                    photoBriefingEntry(for: set)
                }
            }
            historyCard(displayed.history)
                .onAppear { openReviewDetailIfRequested(displayed) }
        }
    }

    /// `Latest Photo Set`: the first canonical pose as a 92 × 118 thumbnail
    /// beside the set date, view count, comparison availability and Open
    /// gallery. The whole module opens the set.
    private func latestSetCard(_ set: PhotoSetRecord?) -> some View {
        RecordCard {
            if let set {
                // Not a Button: a photo tile's own Retry is a Button, and a Button
                // nested in another Button's label never receives its tap.
                HStack(alignment: .top, spacing: m.pt(14)) {
                    if let first = set.views.sorted(by: { $0.poseId.order < $1.poseId.order }).first {
                        ProgressPhotoTile(
                            roleLabel: first.poseId.label,
                            source: environment.photoMediaSource(for: first),
                            showsRoleLabel: false,
                            style: .record,
                            cornerRadius: m.pt(10)
                        )
                        .frame(width: m.pt(92), height: m.pt(118))
                    }
                    VStack(alignment: .leading, spacing: 0) {
                        RecordShrinkRow(spacing: m.pt(8), minimumWidths: [
                            RecordText.minContentWidth("Latest Photo Set", RecordText.eyebrow, scale: tagScale) + m.pt(1.43),
                            RecordText.minContentWidth("\(set.views.count) views", RecordText.tag, scale: tagScale) + m.pt(16),
                        ]) {
                            RecordGreedyText(text: "LATEST PHOTO SET", style: RecordText.eyebrow, color: m.c.accent)
                                // CSS letter-spacing also follows the last glyph.
                                .padding(.trailing, m.pt(1.43))
                            RecordTag(text: "\(set.views.count) views")
                        }
                        .padding(.bottom, m.pt(9))
                        Text(RecordDate.long(set.date))
                            .evidenceText(.normal(20, 800, jakarta: false, tracking: -0.3, relativeTo: .title3))
                            .foregroundStyle(m.c.ink)
                        if let weightLabel = set.weightLabel {
                            Text(weightLabel)
                                .evidenceText(RecordText.rowCopy)
                                .foregroundStyle(m.c.muted)
                                .padding(.top, m.pt(4))
                        }
                        Text("Compared against: \(set.comparisonAvailability)")
                            .evidenceText(RecordText.rowCopy)
                            .foregroundStyle(m.c.quiet)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, m.pt(7))
                        Text("Open gallery →")
                            .evidenceText(RecordText.action)
                            .foregroundStyle(m.c.accent)
                            .padding(.top, m.pt(13))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .contentShape(Rectangle())
                .onTapGesture { selectedPhotoSet = set }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Latest photo set, \(RecordDate.long(set.date)). \(set.views.count) views. \(set.weightLabel.map { "\($0). " } ?? "")Compared against \(set.comparisonAvailability).")
                .accessibilityHint("Opens the gallery.")
                .accessibilityAddTraits(.isButton)
                .accessibilityIdentifier("photos.latestSet")
            } else {
                Text("Photo sets will appear here once matching photos are uploaded.")
                    .evidenceText(RecordText.body)
                    .foregroundStyle(m.c.muted)
            }
        }
        .padding(.bottom, m.pt(17))
    }

    /// `Uploaded Photos`: one independent Show All / Close disclosure over
    /// thumbnail records (preview 3, newest first).
    private func historyCard(_ history: [PhotoSetRecord]) -> some View {
        let preview = Array(history.prefix(Self.historyPreviewLimit))
        return RecordCard {
            VStack(alignment: .leading, spacing: 0) {
                RecordDisclosureHead(
                    title: "Uploaded Photos",
                    subtitle: "Tap any record to inspect the original image and comparison context.",
                    isExpanded: isHistoryExpanded,
                    identifier: "photos.history.toggle"
                ) {
                    withAnimation(.easeInOut(duration: 0.2)) { isHistoryExpanded.toggle() }
                }
                if history.isEmpty {
                    Text("No photo sets available for this period.")
                        .evidenceText(RecordText.body)
                        .foregroundStyle(m.c.muted)
                        .padding(.top, m.pt(12))
                } else {
                    VStack(spacing: m.pt(8)) {
                        ForEach(isHistoryExpanded ? history : preview) { set in
                            // Not a Button: the row's thumbnail carries its own Retry.
                            PhotoSetHistoryRow(set: set)
                                .contentShape(Rectangle())
                                .onTapGesture { selectedPhotoSet = set }
                                .accessibilityAddTraits(.isButton)
                                .accessibilityIdentifier("photos.history.\(set.id)")
                        }
                    }
                    .padding(.top, m.pt(12))
                    .padding(.bottom, m.pt(8))
                }
            }
        }
        .padding(.bottom, m.pt(17))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("photos.history")
    }

    /// Production shows the actionable destination only once the Server reports the
    /// Photo Briefing published, and a plain pending state before that. Sandbox keeps
    /// its fixture-backed destination.
    @ViewBuilder
    private func photoBriefingEntry(for set: PhotoSetRecord) -> some View {
        if environment.nativeAuthority == .founderProduction {
            switch viewModel?.briefingAvailability ?? .unknown {
            case .published(let artifactId):
                readPhotoBriefingLink(briefingID: artifactId)
            case .pending:
                RecordCard {
                    HStack(alignment: .top, spacing: m.pt(10)) {
                        RecordSpinner()
                        VStack(alignment: .leading, spacing: m.pt(3)) {
                            Text("Photo Briefing is being prepared")
                                .evidenceText(RecordText.rowLabel)
                                .foregroundStyle(m.c.ink)
                            Text("Your photos were received. The briefing will appear here when it is ready. No action needed.")
                                .evidenceText(RecordText.rowCopy)
                                .foregroundStyle(m.c.quiet)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(.bottom, m.pt(17))
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("photos.briefing.pending")
            case .unknown:
                EmptyView()
            }
        } else if let briefingID = sandboxPhotoBriefingID(for: set) {
            readPhotoBriefingLink(briefingID: briefingID)
        }
    }

    /// `.primary-action`: full-width 52-px shared neutral action (ink fill,
    /// page-color label) — never a full-width category slab.
    private func readPhotoBriefingLink(briefingID: String) -> some View {
        NavigationLink(value: AppDestination.briefingDetail(briefingId: briefingID)) {
            Text("Read Photo Briefing")
                .evidenceText(.normal(13, 850, jakarta: false, relativeTo: .headline))
                .foregroundStyle(m.c.page)
                .frame(maxWidth: .infinity, minHeight: m.pt(52))
                .background(m.c.ink, in: RoundedRectangle(cornerRadius: m.pt(14)))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.bottom, m.pt(17))
        .accessibilityIdentifier("photos.briefing.read")
    }

    private func sandboxPhotoBriefingID(for set: PhotoSetRecord) -> String? {
        let photoBriefings = environment.briefingSandboxStore.briefings.filter { $0.photo != nil }
        if let exact = photoBriefings.first(where: { $0.photo?.eventDate == set.date }) { return exact.id }
        // The acceptance manifest can project an authorized Founder
        // session whose server date differs from the isolated fixture's
        // synthetic event date. The Latest Photo Set action still routes
        // to the latest canonical Photo Event artifact; the media store
        // resolves that artifact back onto the same manifest session by
        // stable pose identity.
        return photoBriefings.max(by: { ($0.photo?.eventDate ?? "") < ($1.photo?.eventDate ?? "") })?.id
    }

    private func openReviewDetailIfRequested(_ landing: PhotosLandingReadModel) {
        #if DEBUG
        guard !didOpenReviewDetail, ProcessInfo.processInfo.arguments.contains("-physiqueos.evidence-review.photo-detail") else { return }
        didOpenReviewDetail = true
        selectedPhotoSet = landing.latestSet
        #endif
    }
}

private extension PhotosHistoryView {
    static var reviewScrollAnchor: UnitPoint? {
        #if DEBUG
        EvidenceRedesignReview.scrollsToBottom ? .bottom : nil
        #else
        nil
        #endif
    }

    /// Review-only: P2 shows the expanded Uploaded Photos directly under the
    /// scope selector.
    static var reviewHistoryExpanded: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-physiqueos.evidence-review.photos-expanded")
        #else
        false
        #endif
    }

    static var reviewHidesLatest: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-physiqueos.evidence-review.photos-expanded")
        #else
        false
        #endif
    }
}

/// `.history-row`: 68 × 82 first-pose thumbnail, date, view count,
/// comparison availability and `View`, on `surface2`.
private struct PhotoSetHistoryRow: View {
    @Environment(AppEnvironment.self) private var environment
    let set: PhotoSetRecord
    private let m = EvidenceMetrics(family: .record, domain: .photos)

    var body: some View {
        HStack(spacing: m.pt(10)) {
            if let representative = set.views.sorted(by: { $0.poseId.order < $1.poseId.order }).first {
                ProgressPhotoTile(
                    roleLabel: representative.poseId.label,
                    source: environment.photoMediaSource(for: representative),
                    showsRoleLabel: false,
                    style: .record,
                    cornerRadius: m.pt(10)
                )
                .frame(width: m.pt(68), height: m.pt(82))
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(RecordDate.long(set.date))
                    .evidenceText(RecordText.rowLabel)
                    .foregroundStyle(m.c.ink)
                if let weightLabel = set.weightLabel {
                    Text(weightLabel)
                        .evidenceText(RecordText.rowCopy)
                        .foregroundStyle(m.c.quiet)
                        .padding(.top, m.pt(3))
                }
                Text("\(set.views.count) views")
                    .evidenceText(RecordText.rowCopy)
                    .foregroundStyle(m.c.quiet)
                    .padding(.top, m.pt(3))
                Text(set.comparisonAvailability)
                    .evidenceText(RecordText.rowCopy)
                    .foregroundStyle(m.c.quiet)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, m.pt(3))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text("View")
                .evidenceText(RecordText.rowLabel)
                .foregroundStyle(m.c.ink)
        }
        .padding(m.pt(10))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(12)))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(RecordDate.long(set.date)) photo set. \(set.views.count) views. \(set.comparisonAvailability).")
    }
}

private struct PhotoEvidenceDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    let set: PhotoSetRecord
    private let m = EvidenceMetrics(family: .record, domain: .photos)

    var body: some View {
        NavigationStack {
            PhotoSetDetailView(setId: set.id)
                .navigationBarTitleDisplayMode(.inline)
                .toolbarBackground(m.c.page, for: .navigationBar)
                .toolbarBackground(.visible, for: .navigationBar)
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        Text("Photo Set")
                            .evidenceText(.normal(12, 800, jakarta: false))
                            .foregroundStyle(m.c.ink)
                            .accessibilityAddTraits(.isHeader)
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { dismiss() } label: {
                            Text("Close")
                                .evidenceText(.normal(12, 800, jakarta: false))
                                .foregroundStyle(m.c.accent)
                                .frame(minWidth: 44, minHeight: 44, alignment: .trailing)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("photos.detail.close")
                    }
                    .evidenceFlatToolbarItem()
                }
                .safeAreaInset(edge: .top, spacing: 0) {
                    Rectangle().fill(m.c.line.opacity(0.74)).frame(height: m.pt(1)).accessibilityHidden(true)
                }
        }
        .environment(\.evidenceBackTrail, nil)
        .evidenceFamily(.record)
        .evidenceDomain(.photos)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }
}

/// A row of small pose thumbnails. Each source is resolved by stable
/// server-owned view identity; filtering never changes which pixels belong
/// to a pose.
struct PhotoPoseThumbnailStrip: View {
    @Environment(AppEnvironment.self) private var environment
    let views: [PhotoViewRecord]
    var compact: Bool = false

    var body: some View {
        HStack(spacing: 4) {
            ForEach(views.sorted { $0.poseId.order < $1.poseId.order }) { view in
                ProgressPhotoTile(
                    roleLabel: view.poseId.label,
                    source: environment.photoMediaSource(for: view),
                    showsRoleLabel: false
                )
                    .frame(width: compact ? 32 : 44, height: compact ? 42 : 58)
                    .clipped()
                    .accessibilityHidden(true)
            }
        }
    }
}

private struct PhotosDisclosureRow<Summary: View, Expanded: View>: View {
    @Binding var isExpanded: Bool
    var summary: Summary
    var expanded: Expanded

    init(isExpanded: Binding<Bool>, @ViewBuilder summary: () -> Summary, @ViewBuilder expanded: () -> Expanded) {
        self._isExpanded = isExpanded
        self.summary = summary()
        self.expanded = expanded()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { isExpanded.toggle() }
            } label: {
                summary
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(.isButton)
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")

            expanded
                .padding(.top, 12)
        }
    }
}
