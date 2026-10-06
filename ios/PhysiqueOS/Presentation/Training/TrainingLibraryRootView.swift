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
    @State private var viewModelAuthority: NativeAPIEnvironment?

    private let m = EvidenceMetrics(family: .training)

    var body: some View {
        EvidenceScrollPage {
            content
        }
        .evidencePageChrome("Training Library")
        .evidenceFamily(.training)
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = TrainingLibraryRootViewModel(api: environment.trainingAPI)
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
        }
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(["training-library", "training-landing"])
            }
            await viewModel?.load()
        }
        .refreshesOnForegroundWhenVisible { await viewModel?.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStatePanel(kind: .loading("Loading Training Evidence"), identifier: "training.library.loading")
        case .failed(let message):
            EvidenceStatePanel(kind: .failure(message, nil), identifier: "training.library.failure")
        case .loaded(let landing):
            TrainingLibraryHeaderView(
                title: "Training Library",
                breadcrumbs: [
                    TrainingBreadcrumb(label: "Training", destination: .progressStream(streamId: "training")),
                ],
                summary: "Browse by muscle group and jump straight to exercises."
            )
            EvidenceScopePicker(scope: landing.scope) { pillID in
                Task { await viewModel?.selectScope(pillID: pillID) }
            }
            TrainingCatalogToggle(browseAll: viewModel?.browseAll == true) {
                Task { await viewModel?.selectCatalog(browseAll: viewModel?.browseAll != true) }
            }
            EvidenceSection(title: "Browse", style: .open, identifier: "training.library.browse") {
                EvidenceDividedList(data: landing.trainingAreas) { area in
                    NavigationLink(value: AppDestination.trainingLibraryArea(areaId: area.id, browseAll: viewModel?.browseAll == true)) {
                        EvidenceLinkRow(
                            label: area.label,
                            detail: area.exerciseCount > 0 ? "\(area.exerciseCount) exercise\(area.exerciseCount == 1 ? "" : "s")" : nil
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("training.library.area.\(area.id)")
                }
            }
        }
    }
}

/// The explicit catalog text toggle (`Browse All Exercises` /
/// `Show My Library`), a `.section-action` line.
struct TrainingCatalogToggle: View {
    let browseAll: Bool
    let action: () -> Void
    private let m = EvidenceMetrics(family: .training)

    var body: some View {
        Button(action: action) {
            Text(browseAll ? "Show My Library" : "Browse All Exercises")
                .evidenceText(.normal(10, 800))
                .foregroundStyle(m.c.purple)
                .frame(maxWidth: .infinity, alignment: .leading)
                .evidenceHitTarget(visualHeight: m.pt(12))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("training.catalogToggle")
    }
}
