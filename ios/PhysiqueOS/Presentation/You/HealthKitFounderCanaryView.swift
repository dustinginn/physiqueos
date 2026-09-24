import SwiftUI

/// Temporary Founder-only acceptance surface. Nothing in this view runs at
/// launch: enablement, Apple Health authorization, and each foreground read
/// are three separate explicit actions.
struct HealthKitFounderCanaryView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var canaryEnabled = false
    @State private var startDate: Date?
    @State private var endDate: Date?
    @State private var editingDate: ValidationDateField?
    @State private var draftDate = Date()
    @State private var isWorking = false
    @State private var authorizationMessage: String?
    @State private var result: HealthKitFounderCanaryRunResult?
    @State private var errorMessage: String?
    @State private var testDayDate = Date()
    @State private var isEditingTestDay = false
    @State private var isTestDayWorking = false
    @State private var testDayResult: HealthKitCanonicalTestDayRunResult?
    @State private var testDayError: String?
    @State private var workoutDayDate = Date()
    @State private var isEditingWorkoutDay = false
    @State private var isWorkoutWorking = false
    @State private var workoutResult: HealthKitWorkoutCanaryRunResult?
    @State private var workoutError: String?
    @State private var automaticDiagnostics: [HealthKitSynchronizationStream: HealthKitStreamDiagnostics] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Divider().overlay(PhysiqueOSTheme.divider)
            Text("HEALTHKIT FOUNDER CANARY")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text("Experimental, foreground-only Activity validation. Selected historical days are uploaded as permanently raw validation data—not canonical Activity or Evidence.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)

            CardContainer(padding: .md) {
                VStack(alignment: .leading, spacing: 12) {
                    Toggle("Enable this canary", isOn: $canaryEnabled)
                        .tint(PhysiqueOSTheme.accent)
                        .onChange(of: canaryEnabled) { _, enabled in
                            environment.healthKitFounderCanaryCoordinator.setEnabled(enabled)
                            if !enabled { result = nil }
                        }
                    statusRow("HealthKit", availabilityText)
                    statusRow("Authorization", authorizationText)
                    statusRow("Background delivery", "Inactive")
                    statusRow("HealthKit writes", "Disabled")

                    PrimaryActionButton(
                        title: "Request Apple Health authorization",
                        isEnabled: canaryEnabled && !isWorking
                    ) {
                        requestAuthorization()
                    }
                    if let authorizationMessage {
                        Text(authorizationMessage)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
            }

            CardContainer(padding: .md) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Bounded historical validation window")
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text("Choose both frozen local dates. Maximum: 31 inclusive days. Apple Health—not existing PhysiqueOS Activity—is the acceptance reference.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    dateButton(label: "Start date", value: startDate, field: .start)
                    dateButton(label: "End date", value: endDate, field: .end)
                    if let endDate, Calendar.autoupdatingCurrent.isDateInToday(endDate) {
                        Text("The selected end date is today and is provisional, not a completed-day acceptance sample.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.chartEffort)
                    }
                    PrimaryActionButton(
                        title: isWorking ? "Running foreground validation…" : "Run foreground Activity validation",
                        isEnabled: canRun
                    ) {
                        runValidation()
                    }
                }
            }

            if let errorMessage {
                Text(errorMessage)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.chartEffort)
            }
            if let result { resultView(result) }

            automaticDiagnosticsCard
            canonicalTestDayCard
            workoutCanaryCard
        }
        .sheet(isPresented: $isEditingWorkoutDay) {
            NavigationStack {
                VStack {
                    DatePicker("Workout canary day", selection: $workoutDayDate, in: ...Date(), displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .padding()
                    Spacer()
                }
                .background(PhysiqueOSTheme.background)
                .navigationTitle("Workout day")
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Use date") {
                            workoutResult = nil
                            isEditingWorkoutDay = false
                        }
                    }
                }
            }
            .preferredColorScheme(.dark)
        }
        .sheet(isPresented: $isEditingTestDay) {
            NavigationStack {
                VStack {
                    DatePicker(
                        "Canonical test day",
                        selection: $testDayDate,
                        in: ...Date(),
                        displayedComponents: .date
                    )
                    .datePickerStyle(.graphical)
                    .padding()
                    Spacer()
                }
                .background(PhysiqueOSTheme.background)
                .navigationTitle("Test day")
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Use date") {
                            testDayResult = nil
                            isEditingTestDay = false
                        }
                    }
                }
            }
            .preferredColorScheme(.dark)
        }
        .sheet(item: $editingDate) { field in
            NavigationStack {
                VStack {
                    DatePicker(
                        field == .start ? "Validation start date" : "Validation end date",
                        selection: $draftDate,
                        in: ...Date(),
                        displayedComponents: .date
                    )
                    .datePickerStyle(.graphical)
                    .padding()
                    Spacer()
                }
                .background(PhysiqueOSTheme.background)
                .navigationTitle(field == .start ? "Start date" : "End date")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { editingDate = nil }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Use date") {
                            if field == .start { startDate = draftDate } else { endDate = draftDate }
                            result = nil
                            editingDate = nil
                        }
                    }
                }
            }
            .preferredColorScheme(.dark)
        }
        .task {
            automaticDiagnostics = await environment.healthKitAutomaticSynchronizationCoordinator.diagnosticSnapshot()
        }
    }

    private var automaticDiagnosticsCard: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Automatic sync diagnostics")
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("Read-only protected-device state for the permanent automatic scopes. This card does not start a sync.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                automaticDiagnosticRows("Activity", stream: .activitySummary)
                automaticDiagnosticRows("Nutrition", stream: .nutritionDailyTotal)
                automaticDiagnosticRows("Workouts", stream: .workouts)
            }
        }
    }

    @ViewBuilder
    private func automaticDiagnosticRows(_ label: String, stream: HealthKitSynchronizationStream) -> some View {
        if let diagnostic = automaticDiagnostics[stream] {
            statusRow("\(label) scope", "automatic / \(stream.rawValue)")
            statusRow("\(label) last attempt", diagnostic.lastUploadAttempt?.formatted() ?? "None")
            statusRow("\(label) last query", diagnostic.lastSuccessfulAnchoredQuery?.formatted() ?? "None")
            statusRow("\(label) pending", String(diagnostic.pendingBatchCount))
            statusRow("\(label) abandoned", String(diagnostic.abandonedBatchCount ?? 0))
            statusRow("\(label) cursor generation", diagnostic.cursorGeneration.map(String.init) ?? "None")
            statusRow("\(label) revision floors", String(diagnostic.dailyRevisionFloorCount ?? 0))
            if let localDate = diagnostic.lastDailyRevisionRecoveryLocalDate,
               let nextExpected = diagnostic.lastDailyRevisionNextExpected {
                statusRow("\(label) last rebase", "\(localDate) → \(nextExpected)")
            }
            statusRow("\(label) acknowledgement", diagnostic.lastDurableAcknowledgement?.formatted() ?? "None")
            statusRow("\(label) error", diagnostic.lastErrorCode ?? "None")
        } else {
            statusRow("\(label)", "No local automatic state")
        }
    }

    /// Controlled canonical proving day. The exact date is the Founder-approved
    /// activation date. Apple Health is uploaded for that one day only; the
    /// Server decides whether it canonicalizes and always keeps it out of V3,
    /// Confidence, and briefings.
    private var canonicalTestDayCard: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Controlled canonical test day")
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("Uploads Apple Health Activity and Nutrition daily totals for one exact day. Server canonicalization is limited to the approved test date, is never used for V3, Confidence, or briefings, and no meals are created. Workouts are not uploaded.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Button {
                    isEditingTestDay = true
                } label: {
                    HStack {
                        Text("Test day")
                        Spacer()
                        Text(Self.localDate(testDayDate))
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    }
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .padding(12)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                PrimaryActionButton(
                    title: isTestDayWorking ? "Syncing test day…" : "Sync test day now",
                    isEnabled: canSyncTestDay
                ) {
                    runCanonicalTestDay()
                }
                if let testDayError {
                    Text(testDayError)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.chartEffort)
                }
                if let testDayResult {
                    statusRow("Test day", testDayResult.testDay.localDate)
                    statusRow("Day status", testDayResult.endDateIsProvisional ? "Current day (partial until it ends)" : "Completed day")
                    statusRow("Activity observations uploaded", String(testDayResult.activity.additionsDiscovered))
                    statusRow("Nutrition observations uploaded", String(testDayResult.nutrition.additionsDiscovered))
                    statusRow("Pending batches", String(testDayResult.activityDiagnostics.pendingBatchCount + testDayResult.nutritionDiagnostics.pendingBatchCount))
                    statusRow("Last acknowledgement", (testDayResult.nutritionDiagnostics.lastDurableAcknowledgement ?? testDayResult.activityDiagnostics.lastDurableAcknowledgement)?.formatted() ?? "None")
                    let reports = testDayResult.canonicalization
                    let canonicalized = reports.filter(\.wasCanonicalized)
                    statusRow("Server canonicalized", canonicalized.isEmpty ? "Nothing new" : canonicalized.map { Self.observationLabel($0.observationType) }.joined(separator: ", "))
                    let deferred = reports.filter { !$0.wasCanonicalized && $0.reconciliationState?.contains("canonicalization_deferred") == true }
                    if let reason = deferred.compactMap(\.reason).first {
                        Text("The Server stored this day raw and did not canonicalize it (\(reason.replacingOccurrences(of: "_", with: " "))). Tell the coordinating agent before syncing again.")
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.chartEffort)
                    }
                    if testDayResult.activity.resumedPendingBatch || testDayResult.nutrition.resumedPendingBatch {
                        Text("Resumed an interrupted upload for this day.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    } else if testDayResult.activity.additionsDiscovered == 0 && testDayResult.nutrition.additionsDiscovered == 0 {
                        Text("Nothing changed since the last sync for this day.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
            }
        }
    }

    private static func observationLabel(_ type: String) -> String {
        switch type {
        case "activity_summary": "Activity"
        case "nutrition_daily_total": "Nutrition"
        default: type
        }
    }

    private var canSyncTestDay: Bool {
        canaryEnabled &&
        environment.healthKitFounderCanaryCoordinator.authorizationWasExplicitlyRequested &&
        !isTestDayWorking && !isWorking && !isWorkoutWorking
    }

    private func runCanonicalTestDay() {
        isTestDayWorking = true
        testDayResult = nil
        testDayError = nil
        Task {
            do {
                let testDay = try HealthKitCanonicalTestDay(localDate: Self.localDate(testDayDate))
                let completed = try await environment.healthKitFounderCanaryCoordinator.synchronizeCanonicalTestDay(testDay)
                await MainActor.run {
                    testDayResult = completed
                    isTestDayWorking = false
                }
            } catch {
                await MainActor.run {
                    testDayError = (error as? LocalizedError)?.errorDescription
                        ?? "The canonical test-day sync did not complete."
                    isTestDayWorking = false
                }
            }
        }
    }

    /// Dormant Workout canary. It only uploads workouts for one exact day. The
    /// Server canonicalizes them only inside its own separate Workout window
    /// (off unless the Founder activates it), never treats them as V3,
    /// Confidence, or briefing evidence, and never changes the Workout Logger.
    private var workoutCanaryCard: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Workout canary")
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("Uploads Apple Health workouts for one exact day so a strength session can be matched to your Workout Logger session as a candidate. Nothing is linked automatically, the Logger keeps exercises, sets, and load, and workouts are never used for V3, Confidence, or briefings. Only sync after the coordinating agent confirms the Workout canary is active for that day: a workout uploaded before activation is stored raw and cannot be canonicalized afterward.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Button {
                    isEditingWorkoutDay = true
                } label: {
                    HStack {
                        Text("Workout day")
                        Spacer()
                        Text(Self.localDate(workoutDayDate)).foregroundStyle(PhysiqueOSTheme.textPrimary)
                    }
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .padding(12)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                PrimaryActionButton(
                    title: isWorkoutWorking ? "Syncing workouts…" : "Sync workouts for this day",
                    isEnabled: canSyncWorkouts
                ) {
                    runWorkoutCanary()
                }
                if let workoutError {
                    Text(workoutError)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.chartEffort)
                }
                if let workoutResult {
                    statusRow("Workout day", workoutResult.day.localDate)
                    statusRow("Workouts uploaded", String(workoutResult.synchronization.additionsDiscovered))
                    statusRow("Pending batches", String(workoutResult.diagnostics.pendingBatchCount))
                    let canonicalized = workoutResult.canonicalization.filter(\.wasCanonicalized).count
                    statusRow("Server canonicalized", canonicalized == 0 ? "Nothing new" : "\(canonicalized) workout(s)")
                    if canonicalized == 0 && workoutResult.synchronization.additionsDiscovered > 0 {
                        Text("The Server stored these workouts without canonicalizing them. Tell the coordinating agent before syncing this day again.")
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.chartEffort)
                    }
                    if workoutResult.synchronization.resumedPendingBatch {
                        Text("Resumed an interrupted upload for this day.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    } else if workoutResult.synchronization.additionsDiscovered == 0 {
                        Text("No new workouts found for this day.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
            }
        }
    }

    private var canSyncWorkouts: Bool {
        canaryEnabled &&
        environment.healthKitFounderCanaryCoordinator.authorizationWasExplicitlyRequested &&
        !isWorkoutWorking && !isTestDayWorking && !isWorking
    }

    private func runWorkoutCanary() {
        isWorkoutWorking = true
        workoutResult = nil
        workoutError = nil
        Task {
            do {
                let day = try HealthKitWorkoutCanaryDay(localDate: Self.localDate(workoutDayDate))
                let completed = try await environment.healthKitFounderCanaryCoordinator.synchronizeWorkoutCanary(day)
                await MainActor.run {
                    workoutResult = completed
                    isWorkoutWorking = false
                }
            } catch {
                await MainActor.run {
                    workoutError = (error as? LocalizedError)?.errorDescription
                        ?? "The workout canary sync did not complete."
                    isWorkoutWorking = false
                }
            }
        }
    }

    private var canRun: Bool {
        canaryEnabled &&
        environment.healthKitFounderCanaryCoordinator.authorizationWasExplicitlyRequested &&
        startDate != nil && endDate != nil && !isWorking && !isTestDayWorking && !isWorkoutWorking
    }

    private var availabilityText: String {
        switch environment.healthKitFounderCanaryCoordinator.availability {
        case .unavailableOnDevice: "Unavailable on this device"
        case .availableAuthorizationNotRequested: "Available; authorization not requested"
        case .authorizationRequestRequired: "Authorization request required"
        case .available: "Available"
        case .availableNoVisibleData: "Available; no visible data"
        case .restrictedOrUnavailable: "Restricted or unavailable"
        case let .operationalError(code): "Error: \(code)"
        }
    }

    private var authorizationText: String {
        environment.healthKitFounderCanaryCoordinator.authorizationWasExplicitlyRequested
            ? "Explicit flow completed; empty data does not imply denial"
            : "Not requested"
    }

    @ViewBuilder
    private func dateButton(label: String, value: Date?, field: ValidationDateField) -> some View {
        Button {
            let calendar = Calendar.autoupdatingCurrent
            draftDate = value
                ?? calendar.date(byAdding: .day, value: -1, to: calendar.startOfDay(for: Date()))
                ?? Date()
            editingDate = field
        } label: {
            HStack {
                Text(label)
                Spacer()
                Text(value.map(Self.localDate) ?? "Required")
                    .foregroundStyle(value == nil ? PhysiqueOSTheme.chartEffort : PhysiqueOSTheme.textPrimary)
            }
            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            .padding(12)
            .background(PhysiqueOSTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func statusRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label).foregroundStyle(PhysiqueOSTheme.textSecondary)
            Spacer()
            Text(value).foregroundStyle(PhysiqueOSTheme.textPrimary).multilineTextAlignment(.trailing)
        }
        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
    }

    private func requestAuthorization() {
        isWorking = true
        errorMessage = nil
        Task {
            let outcome = await environment.healthKitFounderCanaryCoordinator.requestAuthorization()
            await MainActor.run {
                switch outcome {
                case .completed: authorizationMessage = "Apple Health authorization flow completed. Read access is never inferred per type."
                case .blockedByFeatureGate: authorizationMessage = "Enable the canary first."
                case .unavailable: authorizationMessage = "HealthKit is unavailable on this device."
                case let .failed(availability): authorizationMessage = "Authorization did not complete: \(String(describing: availability))."
                }
                isWorking = false
            }
        }
    }

    private func runValidation() {
        guard let startDate, let endDate else { return }
        isWorking = true
        result = nil
        errorMessage = nil
        Task {
            do {
                let window = try HealthKitActivityValidationWindow(
                    startDate: Self.localDate(startDate),
                    endDate: Self.localDate(endDate)
                )
                let completed = try await environment.healthKitFounderCanaryCoordinator.synchronize(window: window)
                await MainActor.run {
                    result = completed
                    isWorking = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = (error as? LocalizedError)?.errorDescription
                        ?? "The foreground HealthKit validation did not complete."
                    isWorking = false
                }
            }
        }
    }

    @ViewBuilder
    private func resultView(_ result: HealthKitFounderCanaryRunResult) -> some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Server validation readback")
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                statusRow("Window", "\(result.window.startDate) through \(result.window.endDate)")
                statusRow("Day status", result.endDateIsProvisional ? "Includes provisional current day" : "Completed historical window")
                statusRow("Additions discovered", String(result.synchronization.additionsDiscovered))
                statusRow("Deletions discovered", String(result.synchronization.deletionsDiscovered))
                statusRow("Additions filtered outside window", String(result.synchronization.additionsFilteredByWindow))
                statusRow("Deletions filtered outside window", String(result.synchronization.deletionsFilteredByWindow))
                statusRow("Pending batches", String(result.diagnostics.pendingBatchCount))
                statusRow("Cursor", result.diagnostics.cursorDigest.map { String($0.prefix(12)) } ?? "None")
                statusRow("Last acknowledgement", result.diagnostics.lastDurableAcknowledgement?.formatted() ?? "None")
            }
        }
        ForEach(result.readback.items) { item in
            CardContainer(padding: .md) {
                VStack(alignment: .leading, spacing: 7) {
                    Text(item.frozenLocalDate)
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    ForEach(item.activity.metrics.keys.sorted(), id: \.self) { key in
                        if let metric = item.activity.metrics[key] {
                            statusRow(Self.metricLabel(key), "\(metric.value.formatted(.number.precision(.fractionLength(0...4)))) \(metric.unit)")
                        }
                    }
                    statusRow("Coverage", item.activity.coverage ?? "Unknown")
                    statusRow("Time zone", item.occurrence.timeZone ?? "Unavailable")
                    statusRow("UTC offset", item.occurrence.utcOffsetSeconds.map(String.init) ?? "Unavailable")
                    statusRow("Source bundle", item.source.bundleIdentifier ?? "Unavailable")
                    statusRow("Source name", item.source.sourceName ?? "Unavailable")
                    statusRow("Source revision", item.source.sourceRevision ?? "Unavailable")
                    statusRow("Device provenance", item.source.privacySafeDeviceProvenance ?? item.source.productType ?? "Unavailable")
                    statusRow("Daily total", item.activity.aggregationScope ?? "Unknown")
                    statusRow("Workout calories additive", item.activity.workoutActiveCaloriesAdditive ? "Yes" : "No")
                    statusRow("Purpose", item.ingestionPurpose)
                    statusRow("Reconciliation", item.reconciliation.state ?? "Unknown")
                    statusRow("Canonicalization permanently barred", item.reconciliation.canonicalizationPermanentBar ? "Yes" : "No")
                    statusRow("Evidence eligibility", item.evidenceEligibility ?? "Unknown")
                }
            }
        }
    }

    private static func localDate(_ date: Date) -> String {
        HealthKitActivityValidationWindow.localDate(date, calendar: .autoupdatingCurrent)
    }

    private static func metricLabel(_ key: String) -> String {
        switch key {
        case "move_calories": "Active energy"
        case "exercise_minutes": "Exercise time"
        case "stand_hours": "Stand"
        case "steps": "Steps"
        case "walking_running_distance": "Walking + running distance"
        case "flights_climbed": "Flights climbed"
        default: key.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

private enum ValidationDateField: String, Identifiable {
    case start
    case end
    var id: String { rawValue }
}
