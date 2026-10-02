import SwiftUI

enum WatchPhysiqueOSTheme {
    static let background = Color(red: 8 / 255, green: 13 / 255, blue: 24 / 255)
    static let surface = Color(red: 20 / 255, green: 31 / 255, blue: 49 / 255)
    static let secondarySurface = Color(red: 23 / 255, green: 34 / 255, blue: 53 / 255)
    static let purple = Color(red: 139 / 255, green: 140 / 255, blue: 255 / 255)
    static let text = Color(red: 244 / 255, green: 246 / 255, blue: 255 / 255)
    static let muted = Color(red: 154 / 255, green: 164 / 255, blue: 186 / 255)
    static let success = Color(red: 63 / 255, green: 214 / 255, blue: 141 / 255)
    static let warning = Color(red: 255 / 255, green: 190 / 255, blue: 92 / 255)
    static let destructive = Color(red: 255 / 255, green: 105 / 255, blue: 122 / 255)
}

struct WatchWorkoutRootView: View {
    @Bindable var store: WatchWorkoutStore
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced

    var body: some View {
        ZStack {
            WatchPhysiqueOSTheme.background.ignoresSafeArea()
            if store.controlsVisible {
                WatchWorkoutControlsView(store: store)
                    .transition(.move(edge: .leading))
            } else if let projection = store.projection {
                switch projection.phase {
                case .prepared:
                    WatchWorkoutStartView(store: store, projection: projection)
                case .active, .paused, .finishing:
                    execution(projection)
                case .committed:
                    WatchWorkoutSummaryView(store: store, projection: projection)
                case .unavailable:
                    unavailable
                }
            } else {
                unavailable
            }
        }
        .foregroundStyle(WatchPhysiqueOSTheme.text)
        .animation(isLuminanceReduced ? nil : .snappy(duration: 0.2), value: store.controlsVisible)
    }

    private func execution(_ projection: WatchWorkoutProjection) -> some View {
#if DEBUG
        if store.debugSurface == "metrics" {
            return AnyView(WatchWorkoutMetricsView(store: store, projection: projection))
        }
#endif
        return AnyView(TabView {
            WatchWorkoutExecutionView(
                store: store,
                projection: projection,
                forceReducedLuminance: store.debugSurface == "always-on"
            )
            WatchWorkoutMetricsView(store: store, projection: projection)
        }
        .tabViewStyle(.verticalPage)
        .gesture(
            DragGesture(minimumDistance: 36).onEnded { value in
                if value.translation.width < -42 { store.setControlsVisible(true) }
            }
        ))
    }

    private var unavailable: some View {
        VStack(spacing: 10) {
            Image(systemName: store.connectionState == .phoneUnavailable ? "iphone.slash" : "applewatch")
                .font(.title2)
                .foregroundStyle(WatchPhysiqueOSTheme.purple)
            Text(store.connectionState == .phoneUnavailable ? "Phone unavailable" : "Prepare a workout on iPhone")
                .font(.headline)
                .multilineTextAlignment(.center)
            Text(store.connectionState == .phoneUnavailable
                 ? "Health may continue. Set logging waits for iPhone."
                 : "Build the exercises and sets, then choose Ready for Watch.")
                .font(.caption2)
                .foregroundStyle(WatchPhysiqueOSTheme.muted)
                .multilineTextAlignment(.center)
            Button("Refresh") { store.refresh() }
                .buttonStyle(.borderedProminent)
                .tint(WatchPhysiqueOSTheme.purple)
        }
        .padding()
    }
}

struct WatchWorkoutStartView: View {
    @Bindable var store: WatchWorkoutStore
    let projection: WatchWorkoutProjection

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text("READY FOR WATCH")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(WatchPhysiqueOSTheme.purple)
                Text(projection.title)
                    .font(.title3.bold())
                    .multilineTextAlignment(.center)
                Text("\(projection.totalSets) planned sets")
                    .font(.caption)
                    .foregroundStyle(WatchPhysiqueOSTheme.muted)
                Button {
                    store.startPreparedWorkout()
                } label: {
                    Label("Start Workout", systemImage: "play.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(WatchPhysiqueOSTheme.purple)
                .disabled(store.isMutationPending || store.connectionState != .reachable)
            }
            .padding(.horizontal, 8)
        }
    }
}

struct WatchWorkoutExecutionView: View {
    @Bindable var store: WatchWorkoutStore
    let projection: WatchWorkoutProjection
    var forceReducedLuminance = false
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced

    var body: some View {
        TimelineView(.periodic(from: .now, by: (isLuminanceReduced || forceReducedLuminance) ? 15 : 1)) { context in
            ScrollView {
                VStack(spacing: 2) {
                    progress
                    if projection.phase == .paused { status("PAUSED", color: WatchPhysiqueOSTheme.warning) }
                    if store.connectionState != .reachable { status("OFFLINE · HEALTH CONTINUES", color: WatchPhysiqueOSTheme.warning) }
                    contextRows
                    if let row = store.currentRow { splitMetrics(row) }
                    rest(at: context.date)
                    primaryAction
                    notice
                }
                .padding(.horizontal, 6)
            }
        }
    }

    private var progress: some View {
        VStack(spacing: 3) {
            HStack {
                Text("\(projection.completedSets)/\(projection.totalSets) SETS")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(WatchPhysiqueOSTheme.muted)
                Spacer()
                Text(projection.title).font(.system(size: 10, weight: .semibold)).lineLimit(1)
            }
            ProgressView(value: Double(projection.completedSets), total: Double(max(projection.totalSets, 1)))
                .tint(WatchPhysiqueOSTheme.purple)
        }
    }

    private var contextRows: some View {
        VStack(spacing: 3) {
            ForEach(Array(projection.rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 5) {
                    Text(row.role.uppercased())
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(row.isCompletionTarget ? WatchPhysiqueOSTheme.purple : WatchPhysiqueOSTheme.muted)
                    Text([row.supersetLabel, row.exerciseName].compactMap { $0 }.joined(separator: " · "))
                        .font(.system(size: row.isCompletionTarget ? 13 : 10, weight: .bold))
                        .lineLimit(1)
                    Spacer()
                    Text(row.setCount == 1 ? "ONLY SET" : "\(row.setNumber)/\(row.setCount)")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(WatchPhysiqueOSTheme.muted)
                }
                .padding(.horizontal, 7)
                .padding(.vertical, 4)
                .background(row.isCompletionTarget ? WatchPhysiqueOSTheme.secondarySurface : WatchPhysiqueOSTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 9))
            }
        }
    }

    private func splitMetrics(_ row: WatchWorkoutProjection.Row) -> some View {
        HStack(spacing: 5) {
            metricTile(value: row.loadText ?? "—", label: "LOAD")
            metricTile(value: row.repsText ?? "—", label: "REPS")
        }
    }

    private func metricTile(value: String, label: String) -> some View {
        VStack(spacing: 0) {
            Text(value).font(.system(size: 24, weight: .black, design: .rounded)).minimumScaleFactor(0.6)
            Text(label).font(.system(size: 8, weight: .bold)).foregroundStyle(WatchPhysiqueOSTheme.muted)
        }
        .frame(maxWidth: .infinity, minHeight: 38)
        .background(WatchPhysiqueOSTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder
    private func rest(at date: Date) -> some View {
        if let rest = projection.rest {
            let seconds: TimeInterval = {
                if projection.phase == .paused {
                    return rest.mode == .countdown
                        ? max(0, rest.frozenRemainingSeconds ?? 0)
                        : max(0, rest.frozenElapsedSeconds ?? 0)
                }
                if rest.mode == .countdown, let endsAt = rest.endsAt { return max(0, endsAt.timeIntervalSince(date)) }
                return max(0, date.timeIntervalSince(rest.startedAt))
            }()
            VStack(spacing: 0) {
                Text(rest.mode == .countdown ? "REST COUNTDOWN" : "REST STOPWATCH")
                    .font(.system(size: 8, weight: .bold)).foregroundStyle(WatchPhysiqueOSTheme.muted)
                Text(clock(seconds)).font(.system(size: 30, weight: .black, design: .rounded)).monospacedDigit()
            }
        }
    }

    @ViewBuilder
    private var primaryAction: some View {
        if projection.phase == .finishing {
            HStack(spacing: 6) {
                ProgressView().tint(WatchPhysiqueOSTheme.purple)
                Text("Finishing safely…").font(.caption).foregroundStyle(WatchPhysiqueOSTheme.muted)
            }
        } else if projection.completedSets == projection.totalSets, projection.totalSets > 0 {
            executionButton("Finish Workout") { store.requestFinish() }
        } else {
            executionButton("Complete Set", enabled: projection.canCompleteSet) { store.completeSet() }
        }
    }

    private func executionButton(
        _ title: String,
        enabled: Bool = true,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 16, weight: .bold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 7)
                .background(WatchPhysiqueOSTheme.purple)
                .foregroundStyle(WatchPhysiqueOSTheme.background)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!enabled || store.isMutationPending || store.connectionState != .reachable)
        .opacity((enabled && !store.isMutationPending && store.connectionState == .reachable) ? 1 : 0.45)
    }

    @ViewBuilder
    private var notice: some View {
        switch store.notice {
        case .setPending: Text("Set pending…")
        case .staleRefreshed: Text("Stale state refreshed")
        case .healthStartFailed: Text("Health start failed · retry on controls")
        case .finishPending: Text("Finish pending…")
        case .rejected(let reason): Text("Not recorded · \(reason)")
        case nil: EmptyView()
        }
        if let finish = projection.finish {
            if finish.healthSaved && finish.serverPending {
                Text("Health saved · PhysiqueOS pending")
            } else if finish.serverCommitted && !finish.healthSaved {
                Text("PhysiqueOS saved · Health pending")
            } else if finish.healthFailed {
                Text("Health save needs retry")
            }
        }
    }

    private func status(_ text: String, color: Color) -> some View {
        Text(text).font(.system(size: 9, weight: .black)).foregroundStyle(color)
    }

    private func clock(_ seconds: TimeInterval) -> String {
        let rounded = max(0, Int(seconds.rounded(.down)))
        return String(format: "%d:%02d", rounded / 60, rounded % 60)
    }
}

struct WatchWorkoutMetricsView: View {
    @Bindable var store: WatchWorkoutStore
    let projection: WatchWorkoutProjection

    var body: some View {
        TimelineView(.periodic(from: .now, by: 3)) { context in
            VStack(spacing: 5) {
                Text("WORKOUT METRICS").font(.system(size: 9, weight: .bold)).foregroundStyle(WatchPhysiqueOSTheme.purple)
                metric("ELAPSED", elapsed(at: context.date), "timer")
                metric("HEART RATE", store.health.currentHeartRateBPM.map { "\(Int($0.rounded())) BPM" } ?? "—", "heart.fill")
                metric("ACTIVE", store.health.activeCalories.map { "\(Int($0.rounded())) CAL" } ?? "—", "flame.fill")
                metric("TOTAL", store.health.totalCalories.map { "\(Int($0.rounded())) CAL" } ?? "—", "sum")
            }
            .padding(.horizontal, 7)
        }
    }

    private func metric(_ label: String, _ value: String, _ icon: String) -> some View {
        HStack {
            Image(systemName: icon).foregroundStyle(label == "HEART RATE" ? WatchPhysiqueOSTheme.destructive : WatchPhysiqueOSTheme.purple)
            VStack(alignment: .leading, spacing: 0) {
                Text(label).font(.system(size: 8, weight: .bold)).foregroundStyle(WatchPhysiqueOSTheme.muted)
                Text(value).font(.system(size: 16, weight: .bold, design: .rounded)).monospacedDigit()
            }
            Spacer()
        }
        .padding(7).background(WatchPhysiqueOSTheme.surface).clipShape(RoundedRectangle(cornerRadius: 9))
    }

    private func elapsed(at date: Date) -> String {
        let base = projection.elapsedWorkoutSeconds ?? 0
        let running = projection.phase == .active ? max(0, date.timeIntervalSince(projection.startedAt ?? date) - projection.accumulatedPausedSeconds) : base
        let value = max(base, running)
        return String(format: "%d:%02d", Int(value) / 60, Int(value) % 60)
    }
}

struct WatchWorkoutControlsView: View {
    @Bindable var store: WatchWorkoutStore

    var body: some View {
        ScrollView {
        VStack(spacing: 8) {
            Text("WORKOUT CONTROLS").font(.system(size: 9, weight: .bold)).foregroundStyle(WatchPhysiqueOSTheme.muted)
            if store.projection?.finishEligibility == .confirmable {
                let remaining = max(0, (store.projection?.totalSets ?? 0) - (store.projection?.completedSets ?? 0))
                Text(remaining == 0
                     ? "Finish this workout?"
                     : "Finish with \(remaining) incomplete set\(remaining == 1 ? "" : "s")? Only completed sets count.")
                    .font(.caption2).foregroundStyle(WatchPhysiqueOSTheme.muted).multilineTextAlignment(.center)
                HStack {
                    Button("Cancel") { store.cancelFinish() }
                    Button("Finish", role: .destructive) { store.confirmFinish() }
                }
                .disabled(store.isMutationPending)
            } else {
                Button(store.projection?.phase == .paused ? "Resume" : "Pause") { store.pauseOrResume() }
                    .buttonStyle(.borderedProminent).tint(WatchPhysiqueOSTheme.purple)
                    .disabled(store.isMutationPending || store.connectionState != .reachable)
                Button("Finish Workout", role: .destructive) { store.requestFinish() }
                    .buttonStyle(.bordered).tint(WatchPhysiqueOSTheme.destructive)
                    .disabled(store.isMutationPending || store.connectionState != .reachable)
                if store.notice == .healthStartFailed {
                    Button("Retry Health Start") { store.retryHealthStart() }
                        .buttonStyle(.bordered).tint(WatchPhysiqueOSTheme.warning)
                }
                if store.projection?.finish?.healthFailed == true {
                    Button("Retry Health Save") { store.retryHealthFinish() }
                        .buttonStyle(.bordered).tint(WatchPhysiqueOSTheme.warning)
                }
            }
            Button("Back") { store.setControlsVisible(false) }
                .buttonStyle(.plain).foregroundStyle(WatchPhysiqueOSTheme.muted)
        }
        .padding(.horizontal, 8)
        }
        .gesture(DragGesture(minimumDistance: 36).onEnded { value in
            if value.translation.width > 42 { store.setControlsVisible(false) }
        })
    }
}

struct WatchWorkoutSummaryView: View {
    @Bindable var store: WatchWorkoutStore
    let projection: WatchWorkoutProjection

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Image(systemName: "checkmark.circle.fill").font(.title).foregroundStyle(WatchPhysiqueOSTheme.success)
                Text("WORKOUT SAVED").font(.headline)
                Text("\(projection.completedSets) completed sets").font(.caption).foregroundStyle(WatchPhysiqueOSTheme.muted)
                LazyVGrid(
                    columns: [.init(.flexible()), .init(.flexible()), .init(.flexible())],
                    spacing: 5
                ) {
                    if let duration = projection.summary?.activeDurationSeconds {
                        summaryMetric("\(Int(duration) / 60)m", "ACTIVE")
                    }
                    if let volume = projection.summary?.volume {
                        summaryMetric("\(Int(volume.rounded()).formatted())", "LB VOLUME")
                    }
                    if let calories = store.health.activeCalories {
                        summaryMetric("\(Int(calories.rounded()))", "ACTIVE CAL")
                    }
                    if let heartRate = store.health.averageHeartRateBPM {
                        summaryMetric("\(Int(heartRate.rounded()))", "AVG BPM")
                    }
                    if let prs = projection.summary?.authoritativePRCount {
                        summaryMetric("\(prs)", "PR\(prs == 1 ? "" : "S")")
                    }
                }
                if projection.finish?.correlationPending == true {
                    Text("Correlation pending")
                        .font(.caption2).foregroundStyle(WatchPhysiqueOSTheme.warning).multilineTextAlignment(.center)
                }
            }
        }
    }

    private func summaryMetric(_ value: String, _ label: String) -> some View {
        VStack(spacing: 0) {
            Text(value).font(.system(size: 15, weight: .bold, design: .rounded)).lineLimit(1).minimumScaleFactor(0.65)
            Text(label).font(.system(size: 8, weight: .bold)).foregroundStyle(WatchPhysiqueOSTheme.muted)
        }
        .frame(maxWidth: .infinity, minHeight: 39)
        .background(WatchPhysiqueOSTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 9))
    }
}
