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
    @State private var viewModel: PhotosHistoryViewModel?
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
        .task {
            if viewModel == nil { viewModel = PhotosHistoryViewModel(api: environment.photosAPI) }
            await viewModel?.load()
            await environment.founderPhotoMediaStore.loadManifestIfNeeded()
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
            let displayed = environment.founderPhotoMediaStore.projectedLanding(
                from: landing,
                scope: viewModel?.scope ?? PhotosScopeDefault.selection
            ) ?? landing
            VStack(alignment: .leading, spacing: 24) {
                header(for: displayed)
                TrainingScopeSelectorView(scope: displayed.scope) { pillID in
                    Task { await viewModel?.selectScope(pillID: pillID) }
                }
                latestSetCard(displayed.latestSet)
                if let set = displayed.latestSet, let briefingID = photoBriefingID(for: set) {
                    NavigationLink(value: AppDestination.briefingDetail(briefingId: briefingID)) {
                        Text("Read Photo Briefing")
                            .physiqueOSFont(PhysiqueOSTypography.primaryActionLabel)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .background(PhysiqueOSTheme.accent)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                }
                historyCard(displayed.history)
                PhotosDataSourcesFooterView(items: displayed.dataSources)
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
                    Button { selectedPhotoSet = set } label: {
                        HStack(alignment: .top, spacing: 14) {
                            if let first = set.views.sorted(by: { $0.poseId.order < $1.poseId.order }).first {
                                ProgressPhotoTile(
                                    roleLabel: first.poseId.label,
                                    source: environment.founderPhotoMediaStore.source(viewIdentity: first.id),
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
                                Text(set.weightLabel)
                                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                Text("Compared against: \(set.comparisonAvailability)")
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                                Text("Open gallery →")
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(PhysiqueOSTheme.accent)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(TrainingDateFormatting.short(set.date)) photo set. \(set.weightLabel). Compared against \(set.comparisonAvailability).")
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
                            Button { selectedPhotoSet = set } label: {
                                PhotoSetHistoryRow(set: set)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private func photoBriefingID(for set: PhotoSetRecord) -> String? {
        environment.briefingSandboxStore.briefings.first(where: {
            $0.photo?.eventDate == set.date
        })?.id
    }
}

private struct PhotoSetHistoryRow: View {
    let set: PhotoSetRecord

    var body: some View {
        HStack(spacing: 10) {
            PhotoPoseThumbnailStrip(views: set.views, compact: true)
            VStack(alignment: .leading, spacing: 2) {
                Text(TrainingDateFormatting.short(set.date))
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(set.weightLabel)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                Text("Compared: \(set.comparisonAvailability)")
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
                    source: environment.founderPhotoMediaStore.source(viewIdentity: view.id),
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

private struct PhotosDataSourcesFooterView: View {
    let items: [PhotoDataSource]

    var body: some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Divider().overlay(PhysiqueOSTheme.divider)
                Text("Data Sources")
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                    .padding(.top, 6)
                ForEach(items) { item in
                    HStack {
                        Text(item.name)
                        Spacer(minLength: 8)
                        Text(item.status)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }
}
