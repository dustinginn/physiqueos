import SwiftUI

/// TEMPORARY Founder-only controls for the active HealthKit Sleep canary.
/// Everything that already graduated to automatic operation (Activity,
/// Nutrition, Workouts, Strength reconciliation, notifications) runs without
/// any control here. Remove this view when Sleep itself graduates.
///
/// Enablement is in-memory and resets when the page closes; authorization and
/// the historical read are separate explicit taps.
struct HealthKitSleepCanaryView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var canaryEnabled = false
    @State private var isWorking = false
    @State private var authorizationMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Divider().overlay(PhysiqueOSTheme.divider)
            Text("SLEEP CANARY (TEMPORARY)")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text("Founder-only controls for validating Apple Health Sleep before it becomes automatic. Nothing here runs on its own.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)

            CardContainer(padding: .md) {
                VStack(alignment: .leading, spacing: 12) {
                    Toggle("Enable Sleep canary", isOn: $canaryEnabled)
                        .tint(PhysiqueOSTheme.accent)
                        .onChange(of: canaryEnabled) { _, enabled in
                            environment.healthKitFounderCanaryCoordinator.setEnabled(enabled)
                            if !enabled { authorizationMessage = nil }
                        }
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

            HealthKitSleepValidationSection(
                isEnabled: canaryEnabled && environment.healthKitFounderCanaryCoordinator.authorizationWasExplicitlyRequested
            )
            HealthKitSleepHistoricalEvidenceSection()
        }
    }

    private func requestAuthorization() {
        isWorking = true
        Task {
            let outcome = await environment.healthKitFounderCanaryCoordinator.requestAuthorization()
            await MainActor.run {
                switch outcome {
                case .completed: authorizationMessage = "Apple Health authorization flow completed. If Sleep reads return nothing, check Health › Apps › PhysiqueOS › Sleep."
                case .blockedByFeatureGate: authorizationMessage = "Enable the Sleep canary first."
                case .unavailable: authorizationMessage = "HealthKit is unavailable on this device."
                case .requestRequired: authorizationMessage = "Apple Health authorization requires the app to be active."
                case let .failed(availability): authorizationMessage = "Authorization did not complete: \(String(describing: availability))."
                }
                isWorking = false
            }
        }
    }
}

/// Explicit Stage 2 coverage preview for the Founder's completed Visible Abs
/// cut and the following period. The runner is metadata-only and local: this
/// view has no authorization-request, upload, ingestion, or write action.
struct HealthKitHistoricalCutPreviewSection: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var previewTask: Task<Void, Never>?
    @State private var summary: HealthKitHistoricalCutPreviewSummary?

    private var isWorking: Bool { previewTask != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Divider().overlay(PhysiqueOSTheme.divider)
            Text("APPLE HEALTH HISTORY PREVIEW")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text("Founder-initiated, local, and value-free. Counts source apps and covered days from May 21–Oct 10 in cancelable 7-day chunks. It never requests permission, uploads Health data, imports records, or triggers coaching.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)

            CardContainer(padding: .md) {
                VStack(alignment: .leading, spacing: 12) {
                    PrimaryActionButton(
                        title: isWorking ? "Reading 7-day chunks…" : "Preview May–July Apple Health",
                        isEnabled: environment.healthKitHistoricalCutPreviewRunner != nil && !isWorking
                    ) {
                        beginPreview()
                    }
                    if isWorking {
                        Button("Cancel preview", role: .cancel) { previewTask?.cancel() }
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    }
                    if let summary { preview(summary) }
                }
            }
        }
        .onDisappear { previewTask?.cancel() }
    }

    @ViewBuilder
    private func preview(_ summary: HealthKitHistoricalCutPreviewSummary) -> some View {
        statusRow("Chunks", "\(summary.processedChunks) / \(summary.totalChunks)")
        statusRow("Existing nutrition days", String(summary.canonicalNutritionDays))
        statusRow("Existing activity days", String(summary.canonicalActivityDays))
        statusRow("Safe new nutrition days", String(summary.recoverableNutritionDays))
        statusRow("Safe new activity days", String(summary.recoverableActivityDays))
        statusRow("Visible Abs nutrition", "+\(summary.cutRecoverableNutritionDays) days")
        statusRow("Visible Abs activity", "+\(summary.cutRecoverableActivityDays) days")
        statusRow("Nutrition source review", String(summary.nutritionDaysRequiringSourceReview))
        statusRow("Workout days found", String(summary.workoutDaysFound))
        statusRow("Remaining nutrition gaps", String(summary.missingNutritionDates.count))
        statusRow("Remaining activity gaps", String(summary.missingActivityDates.count))
        if !summary.missingNutritionDates.isEmpty {
            gapRow("Nutrition gaps", summary.missingNutritionDates)
        }
        if !summary.missingActivityDates.isEmpty {
            gapRow("Activity gaps", summary.missingActivityDates)
        }

        if !summary.coverage.isEmpty {
            Text("SOURCE COVERAGE")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            ForEach(Array(summary.coverage.enumerated()), id: \.offset) { _, row in
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(row.domain.rawValue.capitalized) · \(row.metric.replacingOccurrences(of: "_", with: " ").capitalized)")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text("\(row.sourceName) (\(row.sourceBundleIdentifier)) · \(row.sampleCount) samples · \(row.localDates.count) days")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        if let failure = summary.failureCode {
            Text(failure == "healthkit_historical_preview_authorization_required"
                 ? "Apple Health access is not already complete. This preview will not open a permission sheet."
                 : failure)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.chartEffort)
        } else if summary.cancelled {
            Text("Preview cancelled. No data was changed.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        } else if summary.processedChunks == summary.totalChunks, summary.totalChunks > 0 {
            Text("Preview complete. No Health values left this iPhone and no records changed.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
    }

    private func beginPreview() {
        guard let runner = environment.healthKitHistoricalCutPreviewRunner else { return }
        summary = nil
        previewTask = Task {
            let result = await runner.run()
            await MainActor.run {
                summary = result
                previewTask = nil
            }
        }
    }

    private func statusRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).foregroundStyle(PhysiqueOSTheme.textSecondary)
            Spacer()
            Text(value).foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
    }

    private func gapRow(_ label: String, _ dates: [String]) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            Text(Self.compactDateRanges(dates))
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
    }

    private static func compactDateRanges(_ dates: [String]) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        let parsed = dates.compactMap(formatter.date).sorted()
        guard let first = parsed.first else { return "None" }

        var ranges: [(Date, Date)] = []
        var start = first
        var end = first
        for date in parsed.dropFirst() {
            if calendar.date(byAdding: .day, value: 1, to: end) == date {
                end = date
            } else {
                ranges.append((start, end))
                start = date
                end = date
            }
        }
        ranges.append((start, end))
        return ranges.map { start, end in
            let first = formatter.string(from: start)
            let last = formatter.string(from: end)
            return first == last ? first : "\(first)–\(last)"
        }.joined(separator: ", ")
    }
}
