import SwiftUI

/// The bare Training Library root (`/progress/training/library`, no area
/// or exercise segment) — reached from the Training landing page's
/// "Training Areas" section header via its "Browse >" action. Verified
/// from source (`getLibraryContent`'s `path.length === 0` branch): the
/// body is the exact same 10 canonical areas the landing page's own
/// "Training Areas" grid already shows (`getFlatTrainingNavigationGroups`
/// returns the identical `FLAT_TRAINING_NAV_GROUPS` set), just rendered as
/// a plain "Browse" list instead of a 2-column tile grid — and, unlike a
/// specific area or exercise page, this root page has a real description
/// line ("Browse by muscle group and jump straight to exercises.";
/// `getLibraryContent` sets `summary: null` for every *other* library
/// page, but not this one).
struct TrainingLibraryRootView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: TrainingLibraryRootViewModel?

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
            if viewModel == nil { viewModel = TrainingLibraryRootViewModel(api: environment.trainingAPI) }
            await viewModel?.load()
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
            VStack(alignment: .leading, spacing: 16) {
                TrainingLibraryHeaderView(
                    title: "Training Library",
                    breadcrumbs: [
                        TrainingBreadcrumb(label: "Training", destination: .progressStream(streamId: "training")),
                    ],
                    summary: "Browse by muscle group and jump straight to exercises."
                )
                TrainingScopeSelectorView(scope: landing.scope)
                browseCard(landing.trainingAreas)
            }
        }
    }

    private func browseCard(_ areas: [TrainingAreaSummary]) -> some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Browse")
                VStack(spacing: 0) {
                    ForEach(areas) { area in
                        NavigationLink(value: area.destination) {
                            HStack(spacing: 8) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(area.label)
                                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    if area.exerciseCount > 0 {
                                        Text("\(area.exerciseCount) exercise\(area.exerciseCount == 1 ? "" : "s")")
                                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                    }
                                }
                                Spacer(minLength: 8)
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(PhysiqueOSTheme.accent)
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 8)
                            .frame(minHeight: 44)
                            .frame(maxWidth: .infinity)
                            .background(PhysiqueOSTheme.surfaceMuted)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)

                        if area.id != areas.last?.id {
                            Divider().overlay(PhysiqueOSTheme.divider)
                        }
                    }
                }
            }
        }
    }
}
