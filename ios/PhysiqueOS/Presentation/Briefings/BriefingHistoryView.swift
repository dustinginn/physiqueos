import SwiftUI

/// `/briefings/review` — the complete chronological Briefing History.
/// Reads through the authority-switching `BriefingAPI` (`briefing-history`
/// under Founder Production, `BriefingSandboxStore.history` under
/// Sandbox) — never a second History-only fixture. Server-sorted
/// newest-first already (`ORDER BY observed_at DESC ..., record_id DESC`)
/// — Native does not re-sort.
///
/// Verified real behavior: History does NOT show Confidence or Goal/Phase
/// attribution in the row — only cadence, title, and date (the bounded
/// `briefing-history` row genuinely has no resolved attribution title to
/// show; see `BriefingHistoryRowReadModel`'s doc comment). This view
/// intentionally does not add either.
struct BriefingHistoryView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    var onNavigate: (AppDestination) -> Void = { _ in }

    @State private var state: LoadState = .loading

    enum LoadState: Equatable {
        case loading
        case loaded([BriefingHistoryRowReadModel])
        case failed(String)
    }

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .refreshable { await load(showLoading: false) }
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button { dismiss() } label: {
                    Label("Back", systemImage: "arrow.left")
                        .labelStyle(.titleAndIcon)
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .task(id: environment.nativeAuthority) {
            await load(showLoading: true)
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await load(showLoading: false) }
        }
    }

    @MainActor
    private func load(showLoading: Bool) async {
        if showLoading { state = .loading }
        do {
            state = .loaded(try await environment.briefingAPI.fetchHistory())
        } catch {
            state = .failed("Briefing History could not be loaded.")
        }
    }

    @ViewBuilder
    private var content: some View {
        switch state {
        case .loading:
            ProgressView()
                .tint(PhysiqueOSTheme.accent)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .failed(let message):
            Text(message)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(let briefings):
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Briefing History")
                        .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text("\(briefings.count) published \(briefings.count == 1 ? "briefing" : "briefings")")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }

                if briefings.isEmpty {
                    CardContainer(padding: .md) {
                        Text("No Briefings have been published yet.")
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            .frame(maxWidth: .infinity, minHeight: 120, alignment: .center)
                    }
                } else {
                    VStack(spacing: 10) {
                        ForEach(briefings) { briefing in
                            BriefingHistoryRow(briefing: briefing) {
                                onNavigate(.briefingDetail(briefingId: briefing.artifactId))
                            }
                        }
                    }
                }
            }
        }
    }
}

private struct BriefingHistoryRow: View {
    let briefing: BriefingHistoryRowReadModel
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            CardContainer(padding: .sm) {
                HStack(alignment: .top, spacing: 12) {
                    IconBadge(systemImage: briefing.iconName, color: briefing.colorToken)
                    VStack(alignment: .leading, spacing: 4) {
                        StatusChip(text: briefing.displayCadenceLabel, color: briefing.colorToken)
                        Text(briefing.label)
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            .multilineTextAlignment(.leading)
                        if let publicationDate = briefing.publicationDate {
                            Text(BriefingDateFormatting.timestamp(publicationDate))
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                        }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                        .font(.system(size: 13, weight: .semibold))
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(briefing.displayCadenceLabel), \(briefing.label)")
        .accessibilityAddTraits(.isButton)
    }
}
