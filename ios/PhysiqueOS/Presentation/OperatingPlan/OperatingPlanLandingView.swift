import SwiftUI

/// The Operating Plan landing/overview — `src/app/profile/operating-plan/page.js`
/// → `OperatingPlanScreen.jsx`. Renders every section
/// `OperatingPlanReadService.buildOperatingPlan` returns, in the same
/// order the web builds them (Energy, Nutrition, Training, Recovery,
/// Peptides, Supplements, Tracking, Coaching Updates), each with its real
/// items and, for Supplements, the "Add Supplement" header action.
struct OperatingPlanLandingView: View {
    @Environment(AppEnvironment.self) private var environment
    let onNavigate: (AppDestination) -> Void

    private var model: OperatingPlanReadModel { environment.operatingPlanStore.landing }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                OperatingPlanScreenHeader(
                    eyebrow: "OPERATING PLAN",
                    title: "Your Operating Plan",
                    subtitle: "Current strategy across every domain, and the protocols that support it."
                )
                ForEach(model.sections) { section in
                    OperatingPlanSection(section.title, trailing: {
                        if section.supplementsAction {
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
            .padding(.horizontal, 16)
            .padding(.top, 14)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationTitle("Operating Plan")
        .navigationBarTitleDisplayMode(.inline)
    }
}
