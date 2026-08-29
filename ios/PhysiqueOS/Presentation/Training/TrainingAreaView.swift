import SwiftUI

/// A single Training Area (`/progress/training/library/:areaId`) — fully
/// generic over `areaId`, fixture-backed for all 10 canonical areas
/// (Chest, Back, Shoulders, Biceps, Triceps, Core, Quads, Hamstrings,
/// Glutes, Calves; see `TrainingFixture.json`'s `areas` array). Areas with
/// zero exercises today (Biceps, Core, Quads, Hamstrings, Glutes, Calves)
/// render this exact screen with an honest empty "Browse" section — no
/// exercises and no placeholder copy — matching real web behavior for an
/// area with no logged exercises (`InformationList` renders nothing, not a
/// "come back later" message; verified directly from source).
///
/// Reproduces `TrainingKnowledgeScreen.jsx`'s `mode="library"` render path
/// for a bare area path exactly: `TrainingLibraryHeader` (eyebrow, title,
/// breadcrumb pill row, no description — `getLibraryContent` sets
/// `summary: null` for every area) → the shared scope selector → one
/// "Browse" card listing every exercise resolved to this area
/// (`BrowseCard`/`InformationList`/`InformationListItem`,
/// `DeepPagePrimitives.jsx`). Exercise rows push the same
/// `AppDestination.trainingExercise` case the Training landing's area rows
/// already use — `AppDestinationRouterView` tells the two apart by id
/// membership in `TrainingAreaIcon.canonicalAreaIds` and routes a real
/// exercise id to `TrainingExerciseDetailView`.
struct TrainingAreaView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: TrainingAreaViewModel?
    let areaId: String

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
            if viewModel == nil { viewModel = TrainingAreaViewModel(api: environment.trainingAPI, areaId: areaId) }
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
        case .loaded(.none):
            Text("This training area could not be found.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.some(let area)):
            VStack(alignment: .leading, spacing: 16) {
                TrainingLibraryHeaderView(title: area.title, breadcrumbs: area.breadcrumbs)
                TrainingScopeSelectorView(scope: area.scope)
                browseCard(area.exercises)
            }
        }
    }

    /// `BrowseCard` (`DeepPagePrimitives.jsx:53-69`): `SectionHeader`
    /// title="Browse" (no action) + `InformationList` — a flat, divided
    /// list rather than individually-spaced cards like Training Areas'
    /// own grid.
    private func browseCard(_ exercises: [TrainingAreaExerciseRow]) -> some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Browse")
                VStack(spacing: 0) {
                    ForEach(exercises) { exercise in
                        NavigationLink(value: exercise.destination) {
                            HStack(spacing: 8) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(exercise.label)
                                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    if let detail = exercise.detail {
                                        Text(detail)
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

                        if exercise.id != exercises.last?.id {
                            Divider().overlay(PhysiqueOSTheme.divider)
                        }
                    }
                }
            }
        }
    }
}
