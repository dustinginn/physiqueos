import SwiftUI
import UserNotifications

/// The real Stage 1 Home screen: the daily cockpit answering "Am I on
/// track?" and "What matters most today?" (docs/INFORMATION_ARCHITECTURE.md).
/// Composition and hierarchy mirror `HomeScreen.jsx` exactly: header, hero
/// (Trajectory/Confidence), next-best action, briefing cards, goals,
/// today's priorities — in that order, with the same "hide the section if
/// there's nothing to show" rule the web uses for briefing cards and
/// today's focus.
struct HomeView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var viewModel: HomeViewModel?
    /// The authority `viewModel` was actually built for. `.task(id:)`
    /// re-fires on ordinary tab-switch reappearance even when the id
    /// hasn't changed (a standard SwiftUI/TabView quirk, not just on a
    /// genuine authority change) — rebuilding `viewModel` unconditionally
    /// every time threw away its in-memory state and forced the spinner
    /// branch back on every visit. Comparing against this lets a mere
    /// reappearance reuse the existing instance (and its already-loaded
    /// state) while a real authority change still rebuilds correctly.
    @State private var viewModelAuthority: NativeAPIEnvironment?
    @State private var confidenceDetailPresentation: (confidence: Int, detail: ConfidenceDetail)?
    @State private var completingPriorityIDs: Set<String> = []
    @State private var completionError: String?
    var onNavigate: (AppDestination) -> Void

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = HomeViewModel(
                    api: environment.homeAPI,
                    priorityStore: environment.loggingSandboxStore,
                    goalsSandboxStore: environment.goalsSandboxStore,
                    briefingStore: environment.briefingSandboxStore,
                    appliesSandboxProjections: environment.nativeAuthority == .sandbox
                )
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.loadAndReconcileBeforePrefetch(
                reconcileNotifications: { await syncPriorityNotifications() },
                prefetch: { await prefetchLikelyDestinations() }
            )
        }
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(["home"], retainingLastKnown: true)
            }
            await viewModel?.loadAndReconcileBeforePrefetch(
                reconcileNotifications: { await syncPriorityNotifications() },
                prefetch: { await prefetchLikelyDestinations() }
            )
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active || phase == .inactive else { return }
            Task {
                // Re-evaluate first so a resume across midnight / a zone change
                // has invalidated the day-scoped caches before Home reads; Home
                // always loads here (visible or not) so the notification sync
                // below never runs on the previous day's model. On a crossing
                // resume a visible Home may also reload once via the day-change
                // path (at most one extra read, first resume of a day).
                if phase == .active {
                    await environment.reevaluateDailyDriverDay()
                    await viewModel?.load()
                }
                await syncPriorityNotifications()
            }
        }
        .onChange(of: environment.canonicalPriorityRefreshGeneration) { _, _ in
            Task { await viewModel?.load() }
        }
        // A foregrounded Home crossing local midnight or a zone change reloads
        // from a fresh read (the day-scoped cache was invalidated first).
        .reloadsOnDailyDriverDayChangeWhenVisible(environment.dailyDriverDay) {
            await viewModel?.load()
            await syncPriorityNotifications()
        }
        .alert("Priority could not be completed", isPresented: Binding(
            get: { completionError != nil },
            set: { if !$0 { completionError = nil } }
        )) {
            Button("OK", role: .cancel) { completionError = nil }
        } message: {
            Text(completionError ?? "Please try again.")
        }
        .sheet(item: Binding(
            get: { confidenceDetailPresentation.map(ConfidenceDetailPresentation.init) },
            set: { confidenceDetailPresentation = $0.map { ($0.confidence, $0.detail) } }
        )) { presentation in
            ConfidenceDetailSheet(confidence: presentation.confidence, detail: presentation.detail)
        }
    }

    /// Reconciles locally-scheduled priority notifications against the
    /// just-loaded canonical Home read. Authorization is requested here
    /// (a no-op after the Founder's first decision) rather than gating
    /// behind a separate settings screen — this is the natural point
    /// notification scheduling first becomes possible. A denied/not-yet-
    /// decided authorization simply means `sync` schedules nothing; there
    /// is no separate error state to show for that.
    private func syncPriorityNotifications() async {
        guard environment.nativeAuthority == .founderProduction,
              viewModel?.isShowingLastKnown == false,
              case .loaded(let home) = viewModel?.state
        else { return }
        let center = UNUserNotificationCenter.current()
        // A no-op after the Founder's first decision (iOS never re-prompts
        // once authorized/denied) — this remains the natural first point
        // scheduling becomes possible, rather than a separate settings
        // screen. The resulting status is what actually gates `sync`
        // below, and is published to `environment` so Home can show a
        // visible notice on denial instead of silently scheduling nothing.
        _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        environment.notificationAuthorizationStatus = await PriorityNotificationScheduler.sync(
            items: home.notificationScheduleItems,
            calendar: home.notificationCalendar,
            center: center
        )
        await BriefingReadyNotifier.reconcile(cards: home.briefingCards, center: center)
    }

    /// Whether at least one of today's focus items would actually have
    /// gotten a local notification if authorization were granted — the
    /// same eligibility `PriorityNotificationScheduler.reconciliationPlan`
    /// applies, so the denial notice only appears when denial is actually
    /// costing the Founder a reminder, never as unconditional noise.
    private func hasScheduleableFocusItem(
        _ items: [PriorityOccurrence],
        calendar: Calendar
    ) -> Bool {
        let now = Date()
        return items.contains { item in
            guard !item.completed,
                  let action = item.notificationAction,
                  let scheduledTime = action.scheduledTime,
                  let fireDate = PriorityNotificationScheduler.fireDate(
                    scheduledTime, occurrenceDate: item.date, calendar: calendar
                  )
            else { return false }
            return fireDate > now
        }
    }

    private func prefetchLikelyDestinations() async {
        guard environment.nativeAuthority == .founderProduction,
              case .loaded(let home) = viewModel?.state else { return }
        async let goals: Void = prefetchGoal(home.goals.first)
        async let briefing: Void = prefetchBriefing(home.briefingCards.first)
        _ = await (goals, briefing)
    }

    private func prefetchGoal(_ goal: HomeGoal?) async {
        guard let goal else { return }
        _ = try? await environment.goalsAPI.fetchGoalsHub()
        _ = try? await environment.goalsAPI.fetchGoalDetail(goalId: goal.id)
    }

    private func prefetchBriefing(_ card: HomeBriefingCard?) async {
        guard let card else { return }
        _ = try? await environment.briefingAPI.fetchBriefing(artifactId: card.id)
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
        case .loaded(let home):
            VStack(alignment: .leading, spacing: 10) {
                HomeHeaderView(header: home.header)

                if let viewModel, viewModel.isShowingLastKnown {
                    LastKnownHomeNotice(
                        refreshFailed: viewModel.lastKnownRefreshFailed,
                        generatedDate: viewModel.lastKnownGeneratedDate
                    )
                }

                HomeHeroCardView(hero: home.hero) {
                    if let confidence = home.hero.confidence, let detail = home.hero.confidenceDetail {
                        confidenceDetailPresentation = (confidence, detail)
                    }
                }

                NextBestActionView(action: home.nextBestAction, onTap: onNavigate)

                if home.hasBriefingCards {
                    VStack(spacing: 10) {
                        ForEach(home.briefingCards) { card in
                            BriefingCardView(card: card, onTap: onNavigate)
                        }
                    }
                }

                GoalsCardView(goals: home.goals, onTap: onNavigate)

                if home.hasTodaysFocus {
                    if environment.notificationAuthorizationStatus == .denied,
                       hasScheduleableFocusItem(
                        home.notificationScheduleItems,
                        calendar: home.notificationCalendar
                       ) {
                        NotificationsDisabledNotice()
                    }
                    TodaysFocusCardView(items: home.todaysFocus, completingIDs: completingPriorityIDs, onTap: onNavigate) { occurrence in
                        guard (try? NativeProductWriteGuard.authorize(.priorityCompletion, in: environment.nativeAuthority)) != nil else { return }
                        completingPriorityIDs.insert(occurrence.id)
                        Task { @MainActor in
                            if environment.nativeAuthority == .sandbox {
                                environment.loggingSandboxStore.completePriority(occurrenceId: occurrence.id, context: occurrence.completionContext)
                                await settlePriorityCompletion(occurrence.id) { viewModel?.refreshTodaysFocus() }
                                return
                            }
                            guard let version = occurrence.expectedVersion else {
                                completionError = "Refresh Home to obtain the current priority version."
                                completingPriorityIDs.remove(occurrence.id)
                                return
                            }
                            do {
                                try await environment.priorityCompletionWriteAPI.complete(
                                    priorityId: occurrence.routePriorityId ?? occurrence.id,
                                    occurrenceDate: occurrence.date,
                                    context: occurrence.completionContext,
                                    expectedVersion: version
                                )
                                await PriorityNotificationScheduler.cleanupCompletedOccurrence(
                                    priorityId: occurrence.routePriorityId ?? occurrence.id,
                                    occurrenceDate: occurrence.date
                                )
                                await settlePriorityCompletion(occurrence.id) {
                                    await viewModel?.reconcileAfterConfirmedPriorityCompletion(occurrenceID: occurrence.id)
                                }
                                await syncPriorityNotifications()
                            } catch {
                                completionError = "The priority was not marked complete. Refresh before retrying."
                                completingPriorityIDs.remove(occurrence.id)
                            }
                        }
                    }
                    .transition(.opacity)
                }
            }
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.35), value: home.todaysFocus.count)
        }
    }

    /// Lets a just-completed priority's checkmark (already shown via
    /// `isCompleting`) hold for a beat before the tile collapses and the
    /// remaining cards reflow — rather than the tile vanishing the instant
    /// the write settles. The completion itself is never delayed by this;
    /// only the animated removal is. `mutate` is what actually drops the
    /// occurrence from `home.todaysFocus` (sandbox's synchronous
    /// `refreshTodaysFocus` or production's async
    /// `reconcileAfterConfirmedPriorityCompletion`) — the `.animation(value:)`
    /// on the surrounding VStack picks up that change whenever it lands and
    /// animates the collapse/reflow (and, if this was the last priority, the
    /// whole card's fade-out) automatically.
    private func settlePriorityCompletion(_ occurrenceID: String, mutate: () async -> Void) async {
        if !reduceMotion {
            try? await Task.sleep(for: .milliseconds(450))
        }
        await mutate()
        completingPriorityIDs.remove(occurrenceID)
    }
}

private struct ConfidenceDetailPresentation: Identifiable {
    let confidence: Int
    let detail: ConfidenceDetail
    var id: String { detail.qualitativeLevel + String(confidence) }
}

/// Shown on Home instead of silently scheduling nothing when the Founder
/// has denied notification permission and at least one of today's
/// priorities would otherwise have gotten a reminder — the visible/
/// diagnostic failure state this feature must show rather than letting
/// priorities display as if reminders were active while none are pending.
private struct NotificationsDisabledNotice: View {
    var body: some View {
        CardContainer(padding: .sm) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "bell.slash.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Text("Notifications are off, so scheduled priority reminders won't fire. Enable them in Settings to get reminded.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
        .accessibilityIdentifier("home.notificationsDisabledNotice")
    }
}

/// Shown only while Home displays the device's last-known Home at cold
/// launch — the content is labelled, never passed off as current.
private struct LastKnownHomeNotice: View {
    let refreshFailed: Bool
    let generatedDate: Date?

    private var asOf: String {
        generatedDate.map { " from \($0.formatted(date: .omitted, time: .shortened))" } ?? ""
    }

    var body: some View {
        HStack(spacing: 6) {
            if !refreshFailed {
                ProgressView()
                    .controlSize(.mini)
                    .tint(PhysiqueOSTheme.textSecondary)
            }
            Text(refreshFailed
                ? "Couldn't refresh. Showing your last update\(asOf) — pull to refresh."
                : "Updating your last update\(asOf)…")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("home.lastKnownNotice")
    }
}
