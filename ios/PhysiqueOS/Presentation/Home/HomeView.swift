import SwiftUI
import UserNotifications

/// One identity for every automatic Home refresh source. SwiftUI cancels the
/// prior task when any input changes, so appearance, foreground activation,
/// day rollover and a canonical Priority mutation cannot start independent
/// competing loads during the same lifecycle transition.
struct HomeAutomaticLoadPlan: Hashable {
    let authority: NativeAPIEnvironment
    let isActive: Bool
    let day: DailyDriverLocalDay
    let canonicalPriorityRefreshGeneration: Int

    var shouldLoad: Bool { isActive }
}

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
    @State private var skippingPriorityIDs: Set<String> = []
    @State private var priorityAcknowledgements: [HomePriorityAcknowledgement] = []
    @State private var priorityActionError: String?
    var onNavigate: (AppDestination) -> Void

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 18)
                .padding(.top, 10)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.redesignCanvas)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: automaticLoadPlan) {
            let plan = automaticLoadPlan
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = HomeViewModel(
                    api: environment.homeAPI,
                    priorityStore: environment.loggingSandboxStore,
                    goalsSandboxStore: environment.goalsSandboxStore,
                    briefingStore: environment.briefingSandboxStore,
                    appliesSandboxProjections: appliesSandboxProjections
                )
                viewModelAuthority = environment.nativeAuthority
            }
            guard plan.shouldLoad else { return }
            await viewModel?.loadAndReconcileBeforePrefetch(
                trigger: .automatic,
                reconcileNotifications: { await syncPriorityNotifications() },
                prefetch: { await prefetchLikelyDestinations() }
            )
        }
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(["home"], retainingLastKnown: true)
            }
            await viewModel?.loadAndReconcileBeforePrefetch(
                trigger: .manualRefresh,
                reconcileNotifications: { await syncPriorityNotifications() },
                prefetch: { await prefetchLikelyDestinations() }
            )
        }
        .alert("Priority action could not be saved", isPresented: Binding(
            get: { priorityActionError != nil },
            set: { if !$0 { priorityActionError = nil } }
        )) {
            Button("OK", role: .cancel) { priorityActionError = nil }
        } message: {
            Text(priorityActionError ?? "Please try again.")
        }
        .sheet(item: Binding(
            get: { confidenceDetailPresentation.map(ConfidenceDetailPresentation.init) },
            set: { confidenceDetailPresentation = $0.map { ($0.confidence, $0.detail) } }
        )) { presentation in
            ConfidenceDetailSheet(confidence: presentation.confidence, detail: presentation.detail)
        }
#if DEBUG
        // Review captures of the locked Confidence sheet (DEBUG only).
        .onAppear {
            if let review = ConfidenceReviewFixture.requested { confidenceDetailPresentation = review }
        }
#endif
    }

    private var automaticLoadPlan: HomeAutomaticLoadPlan {
        HomeAutomaticLoadPlan(
            authority: environment.nativeAuthority,
            isActive: scenePhase == .active,
            day: environment.dailyDriverDay,
            canonicalPriorityRefreshGeneration: environment.canonicalPriorityRefreshGeneration
        )
    }

    /// The review fixture is a source-shaped snapshot of the accepted Home
    /// state. Keeping sandbox overlays off for this DEBUG-only launch mode
    /// lets parity captures exercise realistic long production briefing copy
    /// instead of replacing it with the shorter sandbox History title.
    private var appliesSandboxProjections: Bool {
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-physiqueos.redesign-review") { return false }
#endif
        return environment.nativeAuthority == .sandbox
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
            center: center,
            sweepsDeliveredOrphans: home.notificationOccurrences != nil
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
            HomeStatePanel(
                icon: nil,
                title: "Loading today…",
                detail: "Checking your latest priorities, evidence, and goal progress.",
                isLoading: true
            )
        case .failed(let message):
            HomeStatePanel(
                icon: "exclamationmark.triangle.fill",
                title: "Home couldn't refresh",
                detail: Self.failureDetail(message)
            )
        case .reconnectRequired:
            HomeStatePanel(
                icon: "iphone.and.arrow.forward",
                title: "Reconnect this iPhone",
                detail: "This secure session ended. Canonical data is unchanged."
            ) {
                Button { onNavigate(.founderServerConnection) } label: {
                    Text("Reconnect this iPhone")
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(PhysiqueOSTheme.redesignPurple, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        case .loaded(let home):
            VStack(alignment: .leading, spacing: 12) {
                HomeHeaderView(header: home.header)

                if let viewModel, viewModel.isShowingLastKnown {
                    LastKnownHomeNotice(
                        refreshFailed: viewModel.lastKnownRefreshFailed,
                        generatedDate: viewModel.lastKnownGeneratedDate
                    )
                }

                if let primaryGoal = home.goals.first {
                    HomeJourneyFieldView(hero: home.hero, goal: primaryGoal, onOpenConfidenceDetail: {
                        if let confidence = home.hero.confidence, let detail = home.hero.confidenceDetail {
                            confidenceDetailPresentation = (confidence, detail)
                        }
                    }, onOpenGoal: onNavigate)
                    .padding(.horizontal, -18)
                } else {
                    HomeHeroCardView(hero: home.hero) {
                        if let confidence = home.hero.confidence, let detail = home.hero.confidenceDetail {
                            confidenceDetailPresentation = (confidence, detail)
                        }
                    }
                }

                HomeActionBriefingStrip(
                    action: home.nextBestAction,
                    briefing: home.briefingCards.first,
                    onNavigate: onNavigate
                )

                if home.briefingCards.count > 1 {
                    ForEach(Array(home.briefingCards.dropFirst())) { card in
                        BriefingCardView(
                            card: card,
                            accessibilityIdentifier: HomeBriefingAccessibility.olderIdentifier(for: card),
                            onTap: onNavigate
                        )
                    }
                }

                if home.goals.count > 1 {
                    GoalsCardView(goals: Array(home.goals.dropFirst()), onTap: onNavigate)
                }

                if let acknowledgement = priorityAcknowledgements.first {
                    HomePriorityAcknowledgementView(acknowledgement: acknowledgement)
                        .transition(.opacity.combined(with: .scale(scale: 0.96)))
                        .task(id: acknowledgement.id) {
                            try? await Task.sleep(for: .milliseconds(1_300))
                            guard priorityAcknowledgements.first?.id == acknowledgement.id else { return }
                            if reduceMotion {
                                priorityAcknowledgements.removeFirst()
                            } else {
                                withAnimation(.easeOut(duration: 0.22)) {
                                    priorityAcknowledgements.removeFirst()
                                }
                            }
                        }
                }

                if home.hasTodaysFocus {
                    if environment.notificationAuthorizationStatus == .denied,
                       hasScheduleableFocusItem(
                        home.notificationScheduleItems,
                        calendar: home.notificationCalendar
                       ) {
                        NotificationsDisabledNotice()
                    }
                    TodaysFocusCardView(
                        items: home.todaysFocus,
                        completingIDs: completingPriorityIDs,
                        skippingIDs: skippingPriorityIDs,
                        onTap: onNavigate,
                        onComplete: { occurrence in
                        guard occurrence.allowsHomeInlineCompletion else { return }
                        guard (try? NativeProductWriteGuard.authorize(.priorityCompletion, in: environment.nativeAuthority)) != nil else { return }
                        guard !completingPriorityIDs.contains(occurrence.id),
                              !skippingPriorityIDs.contains(occurrence.id) else { return }
                        completingPriorityIDs.insert(occurrence.id)
                        Task { @MainActor in
                            if environment.nativeAuthority == .sandbox {
                                environment.loggingSandboxStore.completePriority(occurrenceId: occurrence.id, context: occurrence.completionContext)
                                environment.feedback.play(.priorityCompleted)
                                enqueuePriorityAcknowledgement(.init(occurrenceID: occurrence.id, kind: .completed))
                                await settlePriorityCompletion(occurrence.id) { viewModel?.refreshTodaysFocus() }
                                return
                            }
                            guard let version = occurrence.expectedVersion else {
                                priorityActionError = "Refresh Home to obtain the current priority version."
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
                                // Confirmed canonical completion only, never the tap.
                                environment.feedback.play(.priorityCompleted)
                                enqueuePriorityAcknowledgement(.init(occurrenceID: occurrence.id, kind: .completed))
                                await PriorityNotificationScheduler.cleanupCompletedOccurrence(
                                    priorityId: occurrence.routePriorityId ?? occurrence.id,
                                    occurrenceDate: occurrence.date
                                )
                                await settlePriorityCompletion(occurrence.id) {
                                    await viewModel?.reconcileAfterConfirmedPriorityCompletion(occurrenceID: occurrence.id)
                                }
                                await syncPriorityNotifications()
                            } catch {
                                priorityActionError = "The priority was not marked complete. Refresh before retrying."
                                completingPriorityIDs.remove(occurrence.id)
                            }
                        }
                        },
                        onSkip: { occurrence in
                            guard let command = occurrence.canonicalSkipCommand else { return }
                            performSkip(.init(
                                occurrenceID: occurrence.id,
                                title: occurrence.title,
                                command: command
                            ))
                        },
                        onSkipSessionItem: { _, child in
                            guard let command = child.canonicalSkipCommand else { return }
                            performSkip(.init(
                                occurrenceID: child.id,
                                title: child.label,
                                command: command
                            ))
                        }
                    )
                    .transition(.opacity)
                }
            }
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.35), value: home.todaysFocus.count)
        }
    }

    /// The view owns the pull-to-refresh affordance copy. Keep it singular
    /// even if a future domain error already includes the same instruction.
    nonisolated static func failureDetail(_ message: String) -> String {
        if message.localizedCaseInsensitiveContains("pull to refresh") { return message }
        return message + " Pull to refresh."
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

    /// Home consumes the same projected command as Detail and notifications.
    /// The acknowledged occurrence is removed only after the canonical write;
    /// uncertain/stale failures remain visible and invite a truthful refresh.
    private func performSkip(_ candidate: HomePrioritySkipCandidate) {
        guard (try? NativeProductWriteGuard.authorize(.priorityCompletion, in: environment.nativeAuthority)) != nil,
              environment.nativeAuthority == .founderProduction,
              !skippingPriorityIDs.contains(candidate.occurrenceID),
              !completingPriorityIDs.contains(candidate.occurrenceID)
        else { return }
        skippingPriorityIDs.insert(candidate.occurrenceID)
        Task { @MainActor in
            do {
                try await environment.priorityCompletionWriteAPI.skip(command: candidate.command)
                environment.feedback.play(.prioritySkipped)
                enqueuePriorityAcknowledgement(.init(occurrenceID: candidate.occurrenceID, kind: .skipped))
                await PriorityNotificationScheduler.cleanupCompletedOccurrence(
                    priorityId: candidate.command.payload.priorityId,
                    occurrenceDate: candidate.command.payload.occurrenceDate
                )
                await viewModel?.reconcileAfterConfirmedPriorityDisposition(
                    occurrenceID: candidate.occurrenceID
                )
                skippingPriorityIDs.remove(candidate.occurrenceID)
                await syncPriorityNotifications()
            } catch PrioritySkipError.alreadyCompleted {
                skippingPriorityIDs.remove(candidate.occurrenceID)
                await viewModel?.load()
            } catch {
                skippingPriorityIDs.remove(candidate.occurrenceID)
                priorityActionError = "The priority was not marked skipped. Refresh before retrying."
            }
        }
    }

    /// Confirmed terminal writes are queued so simultaneous child and
    /// top-level actions never replace or duplicate one another's feedback.
    /// The acknowledgement lives above the list, so it remains visible when
    /// reconciliation removes the final priority row.
    private func enqueuePriorityAcknowledgement(_ acknowledgement: HomePriorityAcknowledgement) {
        guard !priorityAcknowledgements.contains(where: { $0.id == acknowledgement.id }) else { return }
        priorityAcknowledgements.append(acknowledgement)
    }
}

private struct HomePrioritySkipCandidate: Identifiable {
    let occurrenceID: String
    let title: String
    let command: PriorityNotificationSkipCommand
    var id: String { "\(command.payload.priorityId)|\(command.payload.occurrenceDate)" }
}

enum HomePriorityAcknowledgementKind: String, Equatable {
    case completed
    case skipped

    var title: String { rawValue.capitalized }
    var systemImage: String { self == .completed ? "checkmark" : "minus" }
}

struct HomePriorityAcknowledgement: Identifiable, Equatable {
    let occurrenceID: String
    let kind: HomePriorityAcknowledgementKind
    var id: String { "\(occurrenceID)|\(kind.rawValue)" }
}

private struct HomePriorityAcknowledgementView: View {
    let acknowledgement: HomePriorityAcknowledgement

    private var tone: Color {
        acknowledgement.kind == .completed ? PhysiqueOSTheme.redesignGreen : PhysiqueOSTheme.redesignRed
    }

    var body: some View {
        HStack(spacing: 9) {
            Image(systemName: acknowledgement.kind.systemImage)
                .font(.system(size: 12, weight: .black))
                .foregroundStyle(.white)
                .frame(width: 26, height: 26)
                .background(tone, in: Circle())
                .accessibilityHidden(true)
            Text(acknowledgement.kind.title)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(PhysiqueOSTheme.redesignInk)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, minHeight: 48)
        .background(PhysiqueOSTheme.redesignPaper, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).strokeBorder(tone.opacity(0.42), lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(acknowledgement.kind.title)
        .accessibilityIdentifier("home.priority.acknowledgement.\(acknowledgement.kind.rawValue)")
    }
}

private struct HomeStatePanel<Action: View>: View {
    let icon: String?
    let title: String
    let detail: String?
    var isLoading = false
    @ViewBuilder var action: Action

    init(
        icon: String?,
        title: String,
        detail: String? = nil,
        isLoading: Bool = false,
        @ViewBuilder action: () -> Action
    ) {
        self.icon = icon
        self.title = title
        self.detail = detail
        self.isLoading = isLoading
        self.action = action()
    }

    var body: some View {
        VStack(spacing: 12) {
            if isLoading {
                ProgressView().tint(PhysiqueOSTheme.redesignTeal)
            } else if let icon {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                    .accessibilityHidden(true)
            }
            Text(title)
                .font(.system(size: 17, weight: .heavy))
                .foregroundStyle(PhysiqueOSTheme.redesignInk)
            if let detail {
                Text(detail)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                    .multilineTextAlignment(.center)
            }
            action
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 220)
        .background(PhysiqueOSTheme.redesignPaper, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(PhysiqueOSTheme.redesignRule))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home.state.\(isLoading ? "loading" : "message")")
    }
}

private extension HomeStatePanel where Action == EmptyView {
    init(icon: String?, title: String, detail: String? = nil, isLoading: Bool = false) {
        self.init(icon: icon, title: title, detail: detail, isLoading: isLoading) { EmptyView() }
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
                    .foregroundStyle(PhysiqueOSTheme.redesignAmberInk)
                Text("Notifications are off, so scheduled priority reminders won't fire. Enable them in Settings to get reminded.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
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
                .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("home.lastKnownNotice")
    }
}
