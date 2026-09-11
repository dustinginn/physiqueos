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
        .task(id: environment.nativeAuthority) {
            viewModel = PhotoSetDetailViewModel(api: environment.photosAPI, setId: setId)
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
            ProgressView()
                .tint(PhysiqueOSTheme.accent)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .failed(let message):
            Text(message)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.none):
            if environment.nativeAuthority == .sandbox,
               let set = environment.founderPhotoMediaStore.projectedSetsByID[setId] {
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
        Group {
            if set.views.isEmpty {
                Text("No confirmed views are available for this photo set.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            } else {
                let clampedIndex = min(selectedViewIndex, set.views.count - 1)
                let view = set.views[clampedIndex]
                VStack(alignment: .leading, spacing: 18) {
                    header(for: set, view: view)
                comparisonCard(view)
                if view.interpretationSummary != nil { interpretationCard(view) }
                if view.conditionSummary != nil { conditionsCard(view) }
                if view.sourceHistory != nil { sourceHistoryCard(view) }
                    viewPager(set: set, currentIndex: clampedIndex)
                }
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

    private func header(for set: PhotoSetRecord, view: PhotoViewRecord) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("PROGRESS PHOTO EVIDENCE")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text(view.poseId.label)
                .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(TrainingDateFormatting.short(set.date))
                .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The large footer control the web modal uses to cycle through the
    /// other confirmed views in a session.
    private func viewPager(set: PhotoSetRecord, currentIndex: Int) -> some View {
        HStack(spacing: 12) {
            Button {
                selectedViewIndex = max(0, currentIndex - 1)
            } label: {
                Text("Previous")
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .frame(maxWidth: .infinity, minHeight: 58)
                    .background(PhysiqueOSTheme.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .disabled(currentIndex == 0)
            .foregroundStyle(currentIndex == 0 ? PhysiqueOSTheme.textMuted : PhysiqueOSTheme.textPrimary)

            Button {
                selectedViewIndex = min(set.views.count - 1, currentIndex + 1)
            } label: {
                Text("Next")
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .frame(maxWidth: .infinity, minHeight: 58)
                    .background(PhysiqueOSTheme.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .disabled(currentIndex == set.views.count - 1)
            .foregroundStyle(currentIndex == set.views.count - 1 ? PhysiqueOSTheme.textMuted : PhysiqueOSTheme.textPrimary)
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
                        evidencePhoto(
                            role: "Previous",
                            date: view.comparedAgainst,
                            source: previousSource(for: view)
                        )
                        evidencePhoto(
                            role: "Current",
                            date: TrainingDateFormatting.short(view.captureDate),
                            source: environment.photoMediaSource(for: view)
                        )
                    }
                } else {
                    evidencePhoto(
                        role: "Current",
                        date: TrainingDateFormatting.short(view.captureDate),
                        source: environment.photoMediaSource(for: view)
                    )
                    Text(view.comparedAgainst)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
        }
    }

    private func evidencePhoto(role: String, date: String, source: PhotoMediaSource) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            ProgressPhotoTile(roleLabel: role, source: source, showsRoleLabel: false)
            Text(date)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(role.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Server-owned presentation copy — fixtured verbatim, never
    /// recomputed locally (see `PhotosReadModel.swift`'s doc comment on
    /// `PhotoViewRecord`).
    private func interpretationCard(_ view: PhotoViewRecord) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading("Interpretation")
                if let interpretationSummary = view.interpretationSummary {
                    Text(interpretationSummary)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                }
                if let bullets = view.comparisonBullets, !bullets.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(bullets, id: \.self) { bullet in
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
                if let conditionSummary = view.conditionSummary {
                    Text(conditionSummary)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
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

                if isSourceHistoryExpanded, let sourceHistory = view.sourceHistory {
                    Text(sourceHistory)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        .padding(.top, 8)
                }
            }
        }
    }

    private func previousSource(for view: PhotoViewRecord) -> PhotoMediaSource {
        // Founder Production: the prior photo's opaque media id is already
        // embedded on the view record itself — no lookup needed.
        if let priorMediaId = view.priorMediaId { return .authenticatedProduction(mediaId: priorMediaId) }
        guard let item = environment.founderPhotoMediaStore.itemsByViewIdentity.values.first(where: {
            $0.poseId == view.poseId && TrainingDateFormatting.short($0.captureDate) == view.comparedAgainst
        }) else { return .placeholder }
        return environment.founderPhotoMediaStore.source(viewIdentity: item.viewIdentity)
    }
}
