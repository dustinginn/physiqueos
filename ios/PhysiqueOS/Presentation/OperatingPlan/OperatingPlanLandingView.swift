import SwiftUI

/// The Operating Plan landing/overview — `src/app/profile/operating-plan/page.js`
/// → `OperatingPlanScreen.jsx`. Renders every section
/// `OperatingPlanReadService.buildOperatingPlan` returns, in the same
/// order the web builds them (Energy, Nutrition, Training, Recovery,
/// Peptides, Supplements, Tracking, Coaching Updates), each with its real
/// items and, for Supplements, the "Add Supplement" header action.
struct OperatingPlanLandingView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.scenePhase) private var scenePhase
    @State private var state: LoadState = .loading
    let onNavigate: (AppDestination) -> Void

    private enum LoadState {
        case loading
        case loaded(OperatingPlanReadModel)
        case failed
    }

    var body: some View {
        ScrollView {
            Group {
                switch state {
                case .loading:
                    ProgressView().frame(maxWidth: .infinity, minHeight: 300)
                case .failed:
                    Text("Operating Plan could not be loaded.")
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        .frame(maxWidth: .infinity, minHeight: 300)
                case .loaded(let model):
                    content(model)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationTitle("Operating Plan")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(["operating-plan"])
            }
            await load()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await load() }
        }
        .onChange(of: environment.nativeAuthority) { _, _ in Task { await load() } }
    }

    private func content(_ model: OperatingPlanReadModel) -> some View {
        VStack(alignment: .leading, spacing: 18) {
                OperatingPlanScreenHeader(
                    eyebrow: "OPERATING PLAN",
                    title: "Your Operating Plan",
                    subtitle: "Current strategy across every domain, and the protocols that support it."
                )
                ForEach(model.sections) { section in
                    OperatingPlanSection(section.title, trailing: {
                        if section.supplementsAction, environment.nativeAuthority.permitsProductWrites {
                            Button("Add Supplement") { onNavigate(.operatingPlanSupplementNew) }
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.accent)
                        }
                    }) {
                        VStack(spacing: 7) {
                            ForEach(section.items) { item in
                                if let destination = item.destination {
                                    Button { onNavigate(destination) } label: {
                                        OperatingPlanRow(
                                            iconKey: section.iconKey,
                                            color: section.tone.colorToken,
                                            title: item.title,
                                            detail: item.detail,
                                            status: item.status
                                        )
                                    }
                                    .buttonStyle(.plain)
                                } else {
                                    OperatingPlanRow(
                                        iconKey: section.iconKey,
                                        color: section.tone.colorToken,
                                        title: item.title,
                                        detail: item.detail,
                                        status: item.status,
                                        isInteractive: false
                                    )
                                }
                            }
                        }
                    }
                }
        }
    }

    @MainActor
    private func load() async {
        state = .loading
        if environment.nativeAuthority == .sandbox {
            state = .loaded(environment.operatingPlanStore.landing)
            return
        }
        guard let api = environment.operatingPlanAPI else {
            state = .failed
            return
        }
        do { state = .loaded(try await api.fetchOperatingPlan()) }
        catch { state = .failed }
    }
}
