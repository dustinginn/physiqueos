import SwiftUI

/// Founder Production's Evidence Review detail. Confirm is wired against
/// the real, deployed `evidence-review.commit.v1` command (plus, for a
/// DEXA scan specifically, `dexa-review.measurements.v1` full-replace
/// correction beforehand) — both already exist and are production-
/// authorized (`ProductionEvidenceIntakePipeline`/`DEXAWriteAPI`).
///
/// Dismiss uses the bounded, version-protected production dispose command;
/// it never deletes evidence locally or creates canonical history.
struct EvidenceReviewDetailView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let reviewId: String
    @State private var state: LoadState = .loading
    @State private var actionState: ActionState = .idle
    @State private var editedMeasurements: DEXAScanMeasurements?
    @State private var measurementTexts: [String: String] = [:]
    @State private var showingDismissConfirmation = false

    enum LoadState: Equatable {
        case loading
        case loaded(EvidenceReviewDetailReadModel?)
        case failed(String)
    }

    enum ActionState: Equatable {
        case idle
        case editingMeasurements
        case savingMeasurements
        case confirming(String)
        case dismissing
        case dismissed
        case confirmed
        case stillProcessing
        case failed(String)
    }

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button { dismiss() } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.left")
                            .font(.system(size: 13, weight: .semibold))
                        Text("Back")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    }
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .task(id: environment.nativeAuthority) { await load() }
        .confirmationDialog(
            "Dismiss this Evidence Review?",
            isPresented: $showingDismissConfirmation,
            titleVisibility: .visible
        ) {
            Button("Dismiss Review", role: .destructive) {
                guard case .loaded(.some(let review)) = state else { return }
                Task { await dismissReview(review: review) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The pending review will be discarded without changing canonical history.")
        }
    }

    private func load() async {
        state = .loading
        do {
            state = .loaded(try await environment.evidenceReviewAPI.fetchReview(reviewId: reviewId))
        } catch {
            state = .failed("This Evidence Review could not be loaded.")
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
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.none):
            Text("This Evidence Review could not be found.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.some(let review)):
            VStack(alignment: .leading, spacing: 18) {
                header(for: review)
                itemsCard(review.items)
                if let dexaItem = review.items.first(where: { $0.dexaMeasurements != nil }), actionState == .editingMeasurements {
                    dexaMeasurementCard(review: review, item: dexaItem)
                }
                actionSection(for: review)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func header(for review: EvidenceReviewDetailReadModel) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Evidence Review")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text(Self.statusLabel(review.status))
                .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            HStack(spacing: 8) {
                if let createdAt = review.createdAt {
                    Text(TrainingDateFormatting.short(createdAt))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                if let version = review.version {
                    Text("Version \(version)")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func itemsCard(_ items: [EvidenceReviewDetailItem]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 10) {
                TrainingSectionHeaderView(title: "Captured Evidence")
                if items.isEmpty {
                    Text("No evidence items are attached to this review.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 6) {
                        ForEach(items) { item in
                            HStack {
                                Text(Self.typeLabel(item.type))
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                Spacer(minLength: 8)
                                if let date = item.date {
                                    Text(TrainingDateFormatting.short(date))
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                                }
                            }
                            .padding(.vertical, 6)
                            if let measurements = item.dexaMeasurements, actionState != .editingMeasurements {
                                dexaMeasurementSummary(measurements)
                            }
                        }
                    }
                }
            }
        }
    }

    private func dexaMeasurementSummary(_ measurements: DEXAScanMeasurements) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let totalMass = measurements.totalMassLb { Text("Total mass: \(Self.formatNumber(totalMass)) lb") }
            if let bodyFat = measurements.bodyFatPercentage { Text("Body fat: \(Self.formatNumber(bodyFat))%") }
            if let leanMass = measurements.leanMassLb { Text("Lean mass: \(Self.formatNumber(leanMass)) lb") }
            if let fatMass = measurements.fatMassLb { Text("Fat mass: \(Self.formatNumber(fatMass)) lb") }
        }
        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
        .foregroundStyle(PhysiqueOSTheme.textSecondary)
        .padding(.leading, 4)
    }

    @ViewBuilder
    private func actionSection(for review: EvidenceReviewDetailReadModel) -> some View {
        switch actionState {
        case .idle:
            if Self.isActionable(review.status) {
                VStack(spacing: 10) {
                    if review.items.contains(where: { $0.dexaMeasurements != nil }) {
                        Button("Correct Measurements") { beginEditingMeasurements(review: review) }
                            .buttonStyle(.bordered)
                            .accessibilityIdentifier("evidenceReview.correctMeasurements")
                    }
                    PrimaryActionButton(title: "Confirm", tone: .accent) {
                        Task { await confirm(review: review) }
                    }.accessibilityIdentifier("evidenceReview.confirm")
                    if ["pending", "commit_failed"].contains(review.status) {
                        Button("Dismiss", role: .destructive) { showingDismissConfirmation = true }
                            .buttonStyle(.bordered)
                            .accessibilityIdentifier("evidenceReview.dismiss")
                    }
                }
            } else if review.status == "confirmed" {
                Label("Already confirmed", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(PhysiqueOSTheme.chartSuccess)
            }
        case .editingMeasurements:
            EmptyView() // the measurement card itself carries its own Save action
        case .savingMeasurements:
            CardContainer { VStack(alignment: .leading, spacing: 8) {
                ProgressView().tint(PhysiqueOSTheme.accent)
                Text("Saving corrections…")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            }.frame(maxWidth: .infinity, alignment: .leading) }
        case .confirming(let message):
            CardContainer { VStack(alignment: .leading, spacing: 8) {
                ProgressView().tint(PhysiqueOSTheme.accent)
                Text(message)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            }.frame(maxWidth: .infinity, alignment: .leading) }
        case .dismissing:
            CardContainer { VStack(alignment: .leading, spacing: 8) {
                ProgressView().tint(PhysiqueOSTheme.accent)
                Text("Dismissing review…")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            }.frame(maxWidth: .infinity, alignment: .leading) }
        case .dismissed:
            Label("Dismissed", systemImage: "xmark.circle.fill").foregroundStyle(PhysiqueOSTheme.textSecondary)
        case .confirmed:
            Label("Confirmed", systemImage: "checkmark.circle.fill").foregroundStyle(PhysiqueOSTheme.chartSuccess)
        case .stillProcessing:
            CardContainer { VStack(alignment: .leading, spacing: 6) {
                Text("Still confirming").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                Text("This is taking longer than usual. Reopen this review in a moment to check its status — confirmation continues on the server regardless of this screen.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                Button("Check Now") { Task { await load(); actionState = .idle } }
            }.frame(maxWidth: .infinity, alignment: .leading) }
        case .failed(let message):
            VStack(alignment: .leading, spacing: 10) {
                Text(message).physiqueOSFont(PhysiqueOSTypography.calloutStrong).foregroundStyle(PhysiqueOSTheme.destructive)
                PrimaryActionButton(title: "Try Again", tone: .accent) { actionState = .idle }
            }
        }
    }

    // MARK: - DEXA correction

    private func beginEditingMeasurements(review: EvidenceReviewDetailReadModel) {
        guard let item = review.items.first(where: { $0.dexaMeasurements != nil }), let measurements = item.dexaMeasurements else { return }
        editedMeasurements = measurements
        measurementTexts = [
            "measuredAt": measurements.measuredAt ?? "",
            "totalMass": measurements.totalMassLb.map(Self.formatNumber) ?? "",
            "bodyFat": measurements.bodyFatPercentage.map(Self.formatNumber) ?? "",
            "fatMass": measurements.fatMassLb.map(Self.formatNumber) ?? "",
            "leanMass": measurements.leanMassLb.map(Self.formatNumber) ?? "",
            "boneMineral": measurements.boneMineralContentLb.map(Self.formatNumber) ?? "",
            "rmr": measurements.restingMetabolicRateKcal.map(Self.formatNumber) ?? "",
            "vatMass": measurements.visceralAdiposeTissueMassLb.map(Self.formatNumber) ?? "",
            "vatVolume": measurements.visceralAdiposeTissueVolumeIn3.map(Self.formatNumber) ?? "",
        ]
        actionState = .editingMeasurements
    }

    private func dexaMeasurementCard(review: EvidenceReviewDetailReadModel, item: EvidenceReviewDetailItem) -> some View {
        CardContainer { VStack(alignment: .leading, spacing: 12) {
            Text("Correct the interpreted scan").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
            Text("Every field is resent together — the server replaces the full measurement set, it does not merge.")
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            measurementField("Measured date (YYYY-MM-DD)", key: "measuredAt")
            measurementField("Total mass (lb)", key: "totalMass")
            measurementField("Body fat (%)", key: "bodyFat")
            measurementField("Fat mass (lb)", key: "fatMass")
            measurementField("Lean mass (lb)", key: "leanMass")
            measurementField("Bone mineral content (lb)", key: "boneMineral")
            measurementField("Resting metabolic rate (kcal/day)", key: "rmr")
            measurementField("Visceral fat mass (lb)", key: "vatMass")
            measurementField("Visceral fat volume (in³)", key: "vatVolume")
            HStack(spacing: 10) {
                Button("Cancel") { actionState = .idle }.buttonStyle(.bordered)
                PrimaryActionButton(title: "Save Corrections", tone: .accent) {
                    Task { await saveMeasurements(review: review, item: item) }
                }.accessibilityIdentifier("evidenceReview.saveMeasurements")
            }
        } }
    }

    private func measurementField(_ label: String, key: String) -> some View {
        HStack {
            Text(label).physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            Spacer()
            NumericEditField(text: Binding(get: { measurementTexts[key] ?? "" }, set: { measurementTexts[key] = $0 }), accessibilityLabel: label)
                .frame(width: 110, height: 36)
        }
    }

    private func saveMeasurements(review: EvidenceReviewDetailReadModel, item: EvidenceReviewDetailItem) async {
        guard let version = review.version else { return }
        actionState = .savingMeasurements
        let measurements = DEXAScanMeasurements(
            measuredAt: (measurementTexts["measuredAt"] ?? "").isEmpty ? nil : measurementTexts["measuredAt"],
            totalMassLb: Double(measurementTexts["totalMass"] ?? ""),
            bodyFatPercentage: Double(measurementTexts["bodyFat"] ?? ""),
            fatMassLb: Double(measurementTexts["fatMass"] ?? ""),
            leanMassLb: Double(measurementTexts["leanMass"] ?? ""),
            boneMineralContentLb: Double(measurementTexts["boneMineral"] ?? ""),
            restingMetabolicRateKcal: Double(measurementTexts["rmr"] ?? ""),
            visceralAdiposeTissueMassLb: Double(measurementTexts["vatMass"] ?? ""),
            visceralAdiposeTissueVolumeIn3: Double(measurementTexts["vatVolume"] ?? "")
        )
        do {
            _ = try await environment.dexaWriteAPI.editMeasurements(
                reviewId: reviewId, evidenceObjectId: item.id, expectedVersion: String(version), measurements: measurements
            )
            actionState = .idle
            await load()
        } catch {
            actionState = .failed(Self.errorMessage(for: error))
        }
    }

    // MARK: - Confirm

    private func confirm(review: EvidenceReviewDetailReadModel) async {
        guard let version = review.version else { return }
        let domain = Self.domain(for: review)
        actionState = .confirming("Confirming…")
        do {
            let confirmation = try await environment.evidenceIntakePipeline.commitReview(
                domain: domain, reviewId: reviewId, expectedVersion: String(version)
            )
            if confirmation?.state == "confirmed" {
                actionState = .confirmed
                return
            }
        } catch {
            // The commit call itself failed — nothing was kicked off.
            actionState = .failed(Self.errorMessage(for: error))
            return
        }
        // The commit call succeeded and is now processing durably on the
        // server (a background worker drives it forward regardless of
        // this screen). A failure from HERE on is never reported as "this
        // failed" — only as "still processing," since the confirm attempt
        // itself already landed.
        do {
            try await environment.evidenceIntakePipeline.awaitConfirmation(reviewAPI: environment.evidenceReviewAPI, reviewId: reviewId) { status in
                Task { @MainActor in actionState = .confirming("Confirming (\(Self.statusLabel(status)))…") }
            }
            actionState = .confirmed
        } catch ProductionEvidenceIntakePipeline.Error.commitFailed {
            actionState = .failed("This review needs another look — the canonical commit failed. Reopen it to try again.")
        } catch {
            actionState = .stillProcessing
        }
    }

    private func dismissReview(review: EvidenceReviewDetailReadModel) async {
        guard let version = review.version else { return }
        actionState = .dismissing
        do {
            try await environment.evidenceIntakePipeline.dismissReview(
                domain: Self.domain(for: review), reviewId: reviewId, expectedVersion: String(version)
            )
            actionState = .dismissed
        } catch {
            actionState = .failed(Self.errorMessage(for: error))
        }
    }

    private static func isActionable(_ status: String) -> Bool {
        ["pending", "commit_failed", "partially_committed"].contains(status)
    }

    private static func domain(for review: EvidenceReviewDetailReadModel) -> NativeProductWriteDomain {
        switch review.items.first?.type {
        case "nutrition": .nutrition
        case "activity_day", "activity": .activityEvidence
        case "training": .workoutLogger
        case "dexa_scan", "dexa", "body_composition": .dexa
        default: .evidenceReview
        }
    }

    private static func formatNumber(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }

    private static func errorMessage(for error: Error) -> String {
        if let productionError = error as? ProductionNativeError { return productionError.errorDescription ?? "This review could not be updated." }
        return "This review could not be updated."
    }

    private static func statusLabel(_ status: String) -> String {
        switch status {
        case "pending": "Pending Review"
        case "commit_failed": "Needs Attention"
        case "partially_committed": "Partially Confirmed"
        case "committing": "Confirming"
        case "confirmed": "Confirmed"
        default: status.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    private static func typeLabel(_ type: String) -> String {
        type.replacingOccurrences(of: "_", with: " ").capitalized
    }
}
