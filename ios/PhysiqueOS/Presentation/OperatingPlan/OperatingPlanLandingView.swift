import SwiftUI

/// The Operating Plan landing/overview — `src/app/profile/operating-plan/page.js`
/// → `OperatingPlanScreen.jsx`. Renders every section
/// `OperatingPlanReadService.buildOperatingPlan` returns, in the same
/// order the web builds them (Energy, Nutrition, Training, Recovery,
/// Peptides, Supplements, Tracking, Coaching Updates), each with its real
/// items and, for Supplements, the "Add Supplement" header action.
///
/// Build 91 (Founder-locked Oct 4 root): one title (the in-page header; the
/// navigation bar shows only the "‹ You" crumb), domain cards in Server
/// order with Energy as the identity field, and a failed load that says
/// nothing changed and offers Try Again.
struct OperatingPlanLandingView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var state: LoadState = .loading
    let onNavigate: (AppDestination) -> Void
    var backTitle: String = "You"

    private enum LoadState {
        case loading
        case loaded(OperatingPlanReadModel)
        case failed
    }

    static let pageTitle = "Operating Plan"

    var body: some View {
        OperatingPlanScrollPage {
            OperatingPlanHeader(
                eyebrow: "Operating Plan",
                title: "Your Operating Plan",
                subtitle: "Current strategy across every domain, and the protocols that support it."
            )
            switch state {
            case .loading:
                OperatingPlanLoadingView()
            case .failed:
                OperatingPlanFailureView(
                    title: "Operating Plan couldn't be loaded",
                    message: "Nothing was changed. Check your connection and try again.",
                    retry: { Task { await load() } }
                )
            case .loaded(let model):
                content(model)
            }
        }
        .operatingPlanChrome(back: backTitle)
        .accessibilityIdentifier("operatingPlan.landing")
        .task { await load() }
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(["operating-plan"])
            }
            await load()
        }
        .refreshesOnForegroundWhenVisible { await load() }
        .onChange(of: environment.nativeAuthority) { _, _ in Task { await load() } }
    }

    private func content(_ model: OperatingPlanReadModel) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(model.sections) { section in
                ForEach(section.items) { item in
                    card(section: section, item: item)
                }
                if section.supplementsAction, environment.nativeAuthority.permitsProductWrites {
                    OperatingPlanButton(title: "Add Supplement", systemImage: "plus", style: .text) {
                        navigate(.operatingPlanSupplementNew)
                    }
                    .accessibilityIdentifier("operatingPlan.landing.addSupplement")
                }
            }
        }
    }

    @ViewBuilder
    private func card(section: OperatingPlanSectionReadModel, item: OperatingPlanSectionItemReadModel) -> some View {
        let domainCard = OperatingPlanDomainCard(
            eyebrow: section.title,
            iconKey: section.iconKey,
            title: item.title,
            detail: item.detail,
            status: item.status,
            isField: section.iconKey == "energy",
            isInteractive: item.destination != nil
        )
        if let destination = item.destination {
            Button { navigate(destination) } label: { domainCard }
                .buttonStyle(.plain)
                .accessibilityIdentifier("operatingPlan.landing.\(section.iconKey)")
        } else {
            domainCard
        }
    }

    private func navigate(_ destination: AppDestination) {
        OperatingPlanNavigationContext.navigate(destination, from: Self.pageTitle, using: onNavigate)
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
