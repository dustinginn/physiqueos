import SwiftUI

/// Photo set/session detail (`.photoSetDetail(setId:)`) — a Native-only
/// push destination replacing the web's `PhotoModal`
/// (`ProgressPhotoGallery.jsx:202-271`), which has no URL of its own (see
/// `PhotosReadModel.swift`'s doc comment). Mirrors the modal's own content
/// and Previous/Next paging through every pose view in the session:
///
/// per view — side-by-side Previous/Current comparison (or a single image
/// when no prior comparison exists) → "Interpretation" → "Capture
/// Conditions" → collapsible "Source History".
struct PhotoSetDetailView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: PhotoSetDetailViewModel?
    @State private var selectedViewIndex = 0
    @State private var didApplyInitialPose = false
    @State private var isSourceHistoryExpanded = false
    let setId: String
    let initialPoseId: PhotoPoseID?

    init(setId: String, initialPoseId: PhotoPoseID? = nil) {
        self.setId = setId
        self.initialPoseId = initialPoseId
    }

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .task {
            if viewModel == nil { viewModel = PhotoSetDetailViewModel(api: environment.photosAPI, setId: setId) }
            await viewModel?.load()
            await environment.founderPhotoMediaStore.loadManifestIfNeeded()
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
        case .loaded(.none):
            if let set = environment.founderPhotoMediaStore.projectedSetsByID[setId] {
                setContent(set)
            } else {
                Text("No photo set found for this date.")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 300)
            }
        case .loaded(.some(let set)):
            setContent(set)
        }
    }

    private func setContent(_ set: PhotoSetRecord) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            header(for: set)
            if !set.views.isEmpty {
                let clampedIndex = min(selectedViewIndex, set.views.count - 1)
                viewPager(set: set, currentIndex: clampedIndex)
                let view = set.views[clampedIndex]
                comparisonCard(view)
                interpretationCard(view)
                conditionsCard(view)
                sourceHistoryCard(view)
            }
        }
        .onAppear {
            guard !didApplyInitialPose else { return }
            if let initialPoseId,
               let index = set.views.firstIndex(where: { $0.poseId == initialPoseId }) {
                selectedViewIndex = index
            }
            didApplyInitialPose = true
        }
    }

    private func header(for set: PhotoSetRecord) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Photo Set")
                .physiqueOSFont(PhysiqueOSTypography.sectionLabel)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text(TrainingDateFormatting.short(set.date))
                .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text("\(set.weightLabel) · \(set.views.count) views")
                .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The Previous/Next paging control the web's own modal uses to cycle
    /// through a session's other views.
    private func viewPager(set: PhotoSetRecord, currentIndex: Int) -> some View {
        let sortedViews = set.views
        return HStack {
            Button {
                selectedViewIndex = max(0, currentIndex - 1)
            } label: {
                Image(systemName: "chevron.left.circle.fill")
                    .font(.system(size: 22))
            }
            .disabled(currentIndex == 0)
            .foregroundStyle(currentIndex == 0 ? PhysiqueOSTheme.textMuted : PhysiqueOSTheme.accent)

            Spacer(minLength: 8)
            VStack(spacing: 2) {
                Text(sortedViews[currentIndex].poseId.label)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("\(currentIndex + 1) of \(sortedViews.count)")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            Spacer(minLength: 8)

            Button {
                selectedViewIndex = min(sortedViews.count - 1, currentIndex + 1)
            } label: {
                Image(systemName: "chevron.right.circle.fill")
                    .font(.system(size: 22))
            }
            .disabled(currentIndex == sortedViews.count - 1)
            .foregroundStyle(currentIndex == sortedViews.count - 1 ? PhysiqueOSTheme.textMuted : PhysiqueOSTheme.accent)
        }
    }

    /// Side-by-side Previous/Current when a comparison exists, matching
    /// `ProgressPhotoGallery.jsx:238-244`'s literal 2-column layout; a
    /// single tile plus the exact empty-state string otherwise. Renders
    /// through the shared `ProgressPhotoTile` (`SharedUI/ProgressPhotoTile.swift`)
    /// — the same component the Photo Event Briefing uses. The selected
    /// pose comes from the destination's stable pose identity when a
    /// Briefing preview opened this page, never from the preview's index.
    private func comparisonCard(_ view: PhotoViewRecord) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 10) {
                if view.hasComparisonImage {
                    HStack(spacing: 8) {
                        ProgressPhotoTile(roleLabel: "Previous", source: previousSource(for: view), caption: view.comparedAgainst)
                        ProgressPhotoTile(roleLabel: "Current", source: environment.founderPhotoMediaStore.source(viewIdentity: view.id))
                    }
                } else {
                    ProgressPhotoTile(roleLabel: "Current", source: environment.founderPhotoMediaStore.source(viewIdentity: view.id))
                    Text(view.comparedAgainst)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
        }
    }

    /// Server-owned presentation copy — fixtured verbatim, never
    /// recomputed locally (see `PhotosReadModel.swift`'s doc comment on
    /// `PhotoViewRecord`).
    private func interpretationCard(_ view: PhotoViewRecord) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading("Interpretation")
                Text(view.interpretationSummary)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if !view.comparisonBullets.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(view.comparisonBullets, id: \.self) { bullet in
                            HStack(alignment: .top, spacing: 6) {
                                Text("•").foregroundStyle(PhysiqueOSTheme.textMuted)
                                Text(bullet)
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            }
                        }
                    }
                }
            }
        }
    }

    private func conditionsCard(_ view: PhotoViewRecord) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading("Capture Conditions")
                Text(view.conditionSummary)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private func sourceHistoryCard(_ view: PhotoViewRecord) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 0) {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { isSourceHistoryExpanded.toggle() }
                } label: {
                    HStack {
                        SectionHeading("Source History")
                        Spacer(minLength: 8)
                        Image(systemName: isSourceHistoryExpanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                if isSourceHistoryExpanded {
                    Text(view.sourceHistory)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        .padding(.top, 8)
                }
            }
        }
    }

    private func previousSource(for view: PhotoViewRecord) -> PhotoMediaSource {
        guard let item = environment.founderPhotoMediaStore.itemsByViewIdentity.values.first(where: {
            $0.poseId == view.poseId && TrainingDateFormatting.short($0.captureDate) == view.comparedAgainst
        }) else { return .placeholder }
        return environment.founderPhotoMediaStore.source(viewIdentity: item.viewIdentity)
    }
}
