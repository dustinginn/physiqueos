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
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var viewModel: PhotosHistoryViewModel?
    @State private var viewModelAuthority: NativeAPIEnvironment?
    @State private var isHistoryExpanded = false
    @State private var selectedPhotoSet: PhotoSetRecord?

    static let historyPreviewLimit = 3

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button {
                    dismiss()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.left")
                            .font(.system(size: 13, weight: .semibold))
                        Text("Evidence Hub")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    }
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
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
            ProgressView()
                .tint(PhysiqueOSTheme.accent)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .failed(let message):
            Text(message)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(let landing):
            let displayed = environment.nativeAuthority == .sandbox
                ? (environment.founderPhotoMediaStore.projectedLanding(
                    from: landing,
                    scope: viewModel?.scope ?? PhotosScopeDefault.selection
                ) ?? landing)
                : landing
            VStack(alignment: .leading, spacing: 24) {
                header(for: displayed)
                TrainingScopeSelectorView(scope: displayed.scope) { pillID in
                    Task { await viewModel?.selectScope(pillID: pillID) }
                }
                latestSetCard(displayed.latestSet)
                if let set = displayed.latestSet {
                    photoBriefingEntry(for: set)
                }
                historyCard(displayed.history)
            }
        }
    }

    private func header(for landing: PhotosLandingReadModel) -> some View {
        HStack(alignment: .top, spacing: 12) {
            IconBadge(systemImage: "list.clipboard.fill", color: landing.tone, size: .lg, isCircular: true)
            VStack(alignment: .leading, spacing: 4) {
                Text("Evidence Report")
                    .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(landing.title)
                    .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(landing.subtitle ?? "What PhysiqueOS currently understands.")
                    .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func latestSetCard(_ set: PhotoSetRecord?) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                if let set {
                    // Not a Button: a photo tile's own Retry is a Button, and a Button
                    // nested in another Button's label never receives its tap.
                    HStack(alignment: .top, spacing: 14) {
                        if let first = set.views.sorted(by: { $0.poseId.order < $1.poseId.order }).first {
                            ProgressPhotoTile(
                                roleLabel: first.poseId.label,
                                source: environment.photoMediaSource(for: first),
                                showsRoleLabel: false
                            )
                            .frame(width: 92, height: 118)
                        }
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("LATEST PHOTO SET")
                                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                                    .foregroundStyle(PhysiqueOSTheme.accent)
                                Spacer(minLength: 4)
                                StatusChip(text: "\(set.views.count) views", color: .primary)
                            }
                            Text(TrainingDateFormatting.short(set.date))
                                .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            if let weightLabel = set.weightLabel {
                                Text(weightLabel)
                                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            }
                            Text("Compared against: \(set.comparisonAvailability)")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                            Text("Open gallery →")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.accent)
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { selectedPhotoSet = set }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(TrainingDateFormatting.short(set.date)) photo set. \(set.weightLabel ?? ""). Compared against \(set.comparisonAvailability).")
                    .accessibilityAddTraits(.isButton)
                } else {
                    Text("Photo sets will appear here once matching photos are uploaded.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    private func historyCard(_ history: [PhotoSetRecord]) -> some View {
        let preview = Array(history.prefix(Self.historyPreviewLimit))
        return CardContainer {
            PhotosDisclosureRow(isExpanded: $isHistoryExpanded) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Uploaded Photos")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text("Tap any record to inspect the original image and comparison context.")
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                    Spacer(minLength: 8)
                    Text(isHistoryExpanded ? "Close" : "Show All")
                        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            } expanded: {
                if history.isEmpty {
                    Text("No photo sets available for this period.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 8) {
                        ForEach(isHistoryExpanded ? history : preview) { set in
                            // Not a Button: the row's thumbnail carries its own Retry.
                            PhotoSetHistoryRow(set: set)
                                .contentShape(Rectangle())
                                .onTapGesture { selectedPhotoSet = set }
                                .accessibilityAddTraits(.isButton)
                        }
                    }
                }
            }
        }
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
                CardContainer(padding: .sm) {
                    HStack(alignment: .top, spacing: 10) {
                        ProgressView().tint(PhysiqueOSTheme.accent)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Photo Briefing is being prepared")
                                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text("Your photos were received. The briefing will appear here when it is ready. No action needed.")
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .accessibilityIdentifier("photos.briefing.pending")
            case .unknown:
                EmptyView()
            }
        } else if let briefingID = sandboxPhotoBriefingID(for: set) {
            readPhotoBriefingLink(briefingID: briefingID)
        }
    }

    private func readPhotoBriefingLink(briefingID: String) -> some View {
        NavigationLink(value: AppDestination.briefingDetail(briefingId: briefingID)) {
            Text("Read Photo Briefing")
                .physiqueOSFont(PhysiqueOSTypography.primaryActionLabel)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(PhysiqueOSTheme.accent)
                .clipShape(RoundedRectangle(cornerRadius: 14))
        }
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
}

private struct PhotoSetHistoryRow: View {
    @Environment(AppEnvironment.self) private var environment
    let set: PhotoSetRecord

    var body: some View {
        HStack(spacing: 10) {
            if let representative = set.views.sorted(by: { $0.poseId.order < $1.poseId.order }).first {
                ProgressPhotoTile(
                    roleLabel: representative.poseId.label,
                    source: environment.photoMediaSource(for: representative),
                    showsRoleLabel: false
                )
                .frame(width: 68, height: 82)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(TrainingDateFormatting.short(set.date))
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if let weightLabel = set.weightLabel {
                    Text(weightLabel)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                Text("\(set.views.count) views · Compared against: \(set.comparisonAvailability)")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            Spacer(minLength: 8)
            Text("View")
                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }
}

private struct PhotoEvidenceDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    let set: PhotoSetRecord

    var body: some View {
        NavigationStack {
            PhotoSetDetailView(setId: set.id)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Close") { dismiss() }
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
        }
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
