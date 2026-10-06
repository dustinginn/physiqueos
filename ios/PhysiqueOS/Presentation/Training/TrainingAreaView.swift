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
///
/// The scope selector here is deliberately display-only (no `onSelect`),
/// re-verified against source for this task's Training Library pass rather
/// than left as an unexamined gap: `TrainingEvidenceContextService`'s own
/// `trainingLibrary: globalReport.trainingLibrary` keeps the Areas/exercise
/// catalog and per-exercise counts global even when a Goal/Phase is
/// selected — only an exercise's own occurrence history (Current Benchmark/
/// Last Session/Recent History on `TrainingExerciseDetailView`, which *does*
/// wire this selector) narrows with scope. Selecting a Goal/Phase here would
/// change nothing to select against, matching real product behavior exactly
/// rather than a Native-only limitation.
struct TrainingAreaView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: TrainingAreaViewModel?
    @State private var viewModelAuthority: NativeAPIEnvironment?
    let areaId: String
    var browseAll = false

    private let m = EvidenceMetrics(family: .training)

    var body: some View {
        EvidenceScrollPage {
            content
        }
        .evidencePageChrome(viewModel?.loadedArea?.title ?? "Training Library")
        .evidenceFamily(.training)
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = TrainingAreaViewModel(api: environment.trainingAPI, areaId: areaId, browseAll: browseAll)
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStatePanel(kind: .loading("Loading Training Evidence"), identifier: "training.area.loading")
        case .failed(let message):
            EvidenceStatePanel(kind: .failure(message, nil), identifier: "training.area.failure")
        case .loaded(.none):
            EvidenceStatePanel(kind: .empty("This training area could not be found.", nil), identifier: "training.area.notFound")
        case .loaded(.some(let area)):
            TrainingLibraryHeaderView(title: area.title, breadcrumbs: area.breadcrumbs)
            EvidenceScopePicker(scope: area.scope) { pillID in
                Task { await viewModel?.selectScope(pillID: pillID) }
            }
            TrainingCatalogToggle(browseAll: viewModel?.browseAll == true) {
                Task { await viewModel?.selectCatalog(browseAll: viewModel?.browseAll != true) }
            }
            EvidenceSection(title: "Browse", style: .open, identifier: "training.area.browse") {
                EvidenceDividedList(data: area.exercises) { exercise in
                    NavigationLink(value: exercise.destination) {
                        EvidenceLinkRow(label: exercise.label, detail: exercise.detail)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("training.area.exercise.\(exercise.id)")
                }
            }
        }
    }
}

extension TrainingAreaViewModel {
    var loadedArea: TrainingAreaReadModel? {
        if case .loaded(let area) = state { return area }
        return nil
    }
}
