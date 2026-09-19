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
    }

    private var canRun: Bool {
        canaryEnabled &&
        environment.healthKitFounderCanaryCoordinator.authorizationWasExplicitlyRequested &&
        startDate != nil && endDate != nil && !isWorking
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
