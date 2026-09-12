import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// Founder Production's screenshot/manual evidence upload — Nutrition and
/// Activity screenshots, and DEXA PDF intake, all drive the SAME server
/// pipeline (`ProductionEvidenceIntakePipeline`): submit → interpret →
/// (DEXA only) review/correct measurements → confirm → poll until the
/// durable canonical-commit worker finishes. Native never simulates
/// on-device OCR/interpretation here (unlike the Sandbox `EvidenceIntakeView`
/// this replaces under Founder Production) — every number shown after
/// upload is the server's own interpretation.
struct ProductionEvidenceUploadView: View {
    enum CaptureMode: String, CaseIterable, Identifiable {
        case screenshot, manual
        var id: String { rawValue }
        var label: String { self == .screenshot ? "Screenshot" : "Manual" }
    }
    enum Scenario: String, CaseIterable, Identifiable {
        case nutrition, activity, dexa
        var id: String { rawValue }
        var label: String {
            switch self {
            case .nutrition: "Nutrition"
            case .activity: "Activity"
            case .dexa: "DEXA"
            }
        }
        var expectedEvidenceType: String {
            switch self {
            case .nutrition: "nutrition"
            case .activity: "activity_day"
            case .dexa: "dexa_scan"
            }
        }
        var writeGuardDomain: NativeProductWriteDomain {
            switch self {
            case .nutrition: .nutrition
            case .activity: .activityEvidence
            case .dexa: .dexa
            }
        }
    }

    enum Phase: Equatable {
        case picking
        case uploading
        case interpreting(String)
        case reviewingDEXA
        case confirming(String)
        case confirmed
        case failed(String)
    }

    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    /// `nil` — reached via the generic "Add Evidence" entry (Log screen);
    /// the Founder picks Nutrition or Activity. Fixed to `.dexa` when
    /// reached via the dedicated DEXA upload destination.
    var fixedScenario: Scenario?
    var onReturnToLog: () -> Void = {}

    @State private var scenario: Scenario = .nutrition
    @State private var captureMode: CaptureMode = .screenshot
    @State private var effectiveDate = Date()
    @State private var attachments: [SandboxAttachment] = []
    @State private var isPhotosPickerPresented = false
    @State private var isFilePickerPresented = false
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var isLoadingAttachments = false
    @State private var phase: Phase = .picking

    @State private var caloriesText = ""
    @State private var proteinText = ""
    @State private var carbsText = ""
    @State private var fatText = ""
    @State private var fiberText = ""
    @State private var activeCaloriesText = ""
    @State private var totalCaloriesText = ""
    @State private var exerciseMinutesText = ""
    @State private var standHoursText = ""
    @State private var moveGoalText = ""

    // DEXA review/correction state
    @State private var dexaReviewId: String?
    @State private var dexaReviewVersion: Int?
    @State private var dexaEvidenceObjectId: String?
    @State private var measuredAtText = ""
    @State private var totalMassText = ""
    @State private var bodyFatPercentageText = ""
    @State private var fatMassText = ""
    @State private var leanMassText = ""
    @State private var boneMineralContentText = ""
    @State private var restingMetabolicRateText = ""
    @State private var vatMassText = ""
    @State private var vatVolumeText = ""

    private var effectiveScenario: Scenario { fixedScenario ?? scenario }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                switch phase {
                case .picking: pickingContent
                case .uploading, .interpreting, .confirming: progressContent
                case .reviewingDEXA: dexaReviewContent
                case .confirmed: confirmedContent
                case .failed(let message): failedContent(message)
                }
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationTitle("Add Evidence")
        .navigationBarTitleDisplayMode(.inline)
        .photosPicker(isPresented: $isPhotosPickerPresented, selection: $photoItems, maxSelectionCount: 4, matching: .images)
        .onChange(of: photoItems) {
            guard !photoItems.isEmpty else { return }
            let items = photoItems
            photoItems = []
            isLoadingAttachments = true
            Task { @MainActor in
                let loaded = await EvidenceAttachmentLoader.photos(items, startingAt: attachments.count)
                attachments.append(contentsOf: loaded)
                isLoadingAttachments = false
            }
        }
        .fileImporter(isPresented: $isFilePickerPresented, allowedContentTypes: [.pdf], allowsMultipleSelection: false) { result in
            if case .success(let urls) = result {
                attachments.append(contentsOf: EvidenceAttachmentLoader.files(urls))
            }
        }
        .onAppear { if let fixedScenario { scenario = fixedScenario } }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("ADD EVIDENCE").physiqueOSFont(PhysiqueOSTypography.screenEyebrow).foregroundStyle(PhysiqueOSTheme.accent)
            Text(effectiveScenario == .dexa ? "DEXA Scan" : "\(effectiveScenario.label) Evidence").physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
        }
    }

    @ViewBuilder
    private var pickingContent: some View {
        if fixedScenario == nil {
            CardContainer { VStack(alignment: .leading, spacing: 10) {
                Text("What kind of evidence?").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                Picker("Evidence type", selection: $scenario) {
                    ForEach([Scenario.nutrition, .activity]) { Text($0.label).tag($0) }
                }.pickerStyle(.segmented)
                Picker("Entry method", selection: $captureMode) {
                    ForEach(CaptureMode.allCases) { Text($0.label).tag($0) }
                }.pickerStyle(.segmented)
            } }
        }
        CardContainer { VStack(alignment: .leading, spacing: 10) {
            DateField(date: $effectiveDate, maximumDate: Date(), label: "Date")
        } }
        if effectiveScenario == .dexa || captureMode == .screenshot {
        CardContainer { VStack(alignment: .leading, spacing: 12) {
            Text(effectiveScenario == .dexa ? "BodySpec PDF" : "Screenshots").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
            if attachments.isEmpty {
                Text(effectiveScenario == .dexa ? "Attach one BodySpec PDF report." : "Attach 1–4 screenshots.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            } else {
                ForEach(attachments) { attachment in
                    HStack {
                        Text(attachment.displayName).physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        Spacer()
                        Button { attachments.removeAll { $0.id == attachment.id } } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(PhysiqueOSTheme.textMuted)
                        }
                    }
                }
            }
            HStack(spacing: 10) {
                if effectiveScenario == .dexa {
                    Button("Choose PDF") { isFilePickerPresented = true }.buttonStyle(.bordered)
                } else {
                    Button("Choose Photos") { isPhotosPickerPresented = true }.buttonStyle(.bordered)
                }
            }
            if isLoadingAttachments { ProgressView() }
        } }
        } else {
            manualEntryContent
        }
        PrimaryActionButton(title: captureMode == .manual ? "Save" : "Upload", tone: .dark, isEnabled: canSubmit) {
            Task { await upload() }
        }.accessibilityIdentifier("productionEvidenceUpload.submit")
    }

    private var canSubmit: Bool {
        guard !isLoadingAttachments else { return false }
        if effectiveScenario == .dexa || captureMode == .screenshot { return !attachments.isEmpty }
        switch effectiveScenario {
        case .nutrition: return [caloriesText, proteinText, carbsText, fatText, fiberText].contains { !$0.isEmpty }
        case .activity: return [activeCaloriesText, totalCaloriesText, exerciseMinutesText, standHoursText, moveGoalText].contains { !$0.isEmpty }
        case .dexa: return false
        }
    }

    private var manualEntryContent: some View {
        CardContainer { VStack(alignment: .leading, spacing: 12) {
            Text(effectiveScenario == .nutrition ? "Daily totals" : "Daily activity")
                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
            Text("Blank fields remain unknown. Existing web-authored days require screenshot review so the server can enforce its revision fingerprint.")
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            if effectiveScenario == .nutrition {
                manualField("Calories", text: $caloriesText)
                manualField("Protein (g)", text: $proteinText)
                manualField("Carbs (g)", text: $carbsText)
                manualField("Fat (g)", text: $fatText)
                manualField("Fiber (g)", text: $fiberText)
            } else {
                manualField("Active calories", text: $activeCaloriesText)
                manualField("Total calories", text: $totalCaloriesText)
                manualField("Exercise minutes", text: $exerciseMinutesText)
                manualField("Stand hours", text: $standHoursText)
                manualField("Move goal", text: $moveGoalText)
                Text("Manual entry only. HealthKit and direct device-health sync are not enabled.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        } }
    }

    private func manualField(_ label: String, text: Binding<String>) -> some View {
        HStack {
            Text(label).physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
            Spacer()
            NumericEditField(text: text, accessibilityLabel: label).frame(width: 120, height: 38)
        }
    }

    private var progressContent: some View {
        CardContainer { VStack(alignment: .leading, spacing: 10) {
            ProgressView()
            Text(progressLabel).physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
        } }
    }

    private var progressLabel: String {
        switch phase {
        case .uploading: "Uploading…"
        case .interpreting(let message), .confirming(let message): message
        default: "Working…"
        }
    }

    private var dexaReviewContent: some View {
        CardContainer { VStack(alignment: .leading, spacing: 12) {
            Text("Review the interpreted scan").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
            Text("Correct any misread values before confirming — every field is resent together.")
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            measurementField("Measured date (YYYY-MM-DD)", text: $measuredAtText)
            measurementField("Total mass (lb)", text: $totalMassText)
            measurementField("Body fat (%)", text: $bodyFatPercentageText)
            measurementField("Fat mass (lb)", text: $fatMassText)
            measurementField("Lean mass (lb)", text: $leanMassText)
            measurementField("Bone mineral content (lb)", text: $boneMineralContentText)
            measurementField("Resting metabolic rate (kcal/day)", text: $restingMetabolicRateText)
            measurementField("Visceral fat mass (lb)", text: $vatMassText)
            measurementField("Visceral fat volume (in³)", text: $vatVolumeText)
            PrimaryActionButton(title: "Confirm DEXA Scan", tone: .dark, isEnabled: true) {
                Task { await confirmDEXA() }
            }.accessibilityIdentifier("productionEvidenceUpload.confirmDexa")
        } }
    }

    private func measurementField(_ label: String, text: Binding<String>) -> some View {
        HStack {
            Text(label).physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            Spacer()
            NumericEditField(text: text, accessibilityLabel: label).frame(width: 110, height: 36)
        }
    }

    private var confirmedContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            CardContainer { Label("Evidence confirmed", systemImage: "checkmark.circle.fill").foregroundStyle(PhysiqueOSTheme.chartSuccess) }
            PrimaryActionButton(title: "Return to Log") { onReturnToLog(); dismiss() }
        }
    }

    private func failedContent(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(message).physiqueOSFont(PhysiqueOSTypography.calloutStrong).foregroundStyle(PhysiqueOSTheme.destructive)
            PrimaryActionButton(title: "Try Again") { phase = .picking }
        }
    }

    private func upload() async {
        guard (try? NativeProductWriteGuard.authorize(effectiveScenario.writeGuardDomain, in: .founderProduction)) != nil else { return }
        if fixedScenario == nil, captureMode == .manual {
            await submitManualEntry()
            return
        }
        phase = .uploading
        let localDate = Self.localDateKey.string(from: effectiveDate)
        let files = attachments.compactMap { attachment -> (filename: String, contentType: String, data: Data)? in
            guard let data = attachment.data else { return nil }
            return (attachment.displayName, attachment.contentType ?? (effectiveScenario == .dexa ? "application/pdf" : "image/jpeg"), data)
        }
        do {
            let pipeline = environment.evidenceIntakePipeline
            let status = try await pipeline.submitIntake(
                scope: "\(effectiveScenario.rawValue)-intake.\(localDate)",
                effectiveDate: localDate,
                expectedEvidenceType: effectiveScenario.expectedEvidenceType,
                files: files
            )
            phase = .interpreting("Reading your \(effectiveScenario == .dexa ? "scan" : "screenshots")…")
            let reviewId = try await pipeline.awaitReadyIntake(intakeId: status.intakeId) { intakeStatus in
                Task { @MainActor in phase = .interpreting("Still reading your \(effectiveScenario == .dexa ? "scan" : "screenshots")…") }
            }
            if effectiveScenario == .dexa {
                try await beginDEXAReview(reviewId: reviewId)
            } else {
                try await commitAndAwait(reviewId: reviewId)
            }
        } catch {
            phase = .failed(Self.errorMessage(for: error))
        }
    }

    private func submitManualEntry() async {
        phase = .uploading
        let localDate = Self.localDateKey.string(from: effectiveDate)
        do {
            switch effectiveScenario {
            case .nutrition:
                let landing = try await environment.nutritionAPI.fetchNutritionLanding(scope: .all)
                let result = try await environment.dailyEvidenceWriteAPI.upsertNutrition(
                    NutritionDayWrite(
                        localDate: localDate,
                        calories: Double(caloriesText), proteinG: Double(proteinText), carbsG: Double(carbsText),
                        fatG: Double(fatText), fiberG: Double(fiberText)
                    ),
                    existingDayPresent: landing.nutritionHistory.contains { $0.date == localDate }
                )
                guard result.intendedDate == nil || result.intendedDate == localDate else { throw ProductionNativeError.invalidResponse }
                let refreshed = try await environment.nutritionAPI.fetchNutritionLanding(scope: .all)
                guard refreshed.nutritionHistory.contains(where: { $0.date == localDate }) else { throw ProductionNativeError.invalidResponse }
            case .activity:
                let landing = try await environment.activityAPI.fetchActivityLanding(scope: .all)
                _ = try await environment.dailyEvidenceWriteAPI.upsertActivity(
                    ActivityDayWrite(
                        localDate: localDate,
                        activeCalories: Double(activeCaloriesText), totalCalories: Double(totalCaloriesText),
                        exerciseMinutes: Double(exerciseMinutesText), standHours: Double(standHoursText),
                        moveGoal: Double(moveGoalText)
                    ),
                    existingDayPresent: landing.activityHistory.contains { $0.date == localDate }
                )
                let refreshed = try await environment.activityAPI.fetchActivityLanding(scope: .all)
                guard refreshed.activityHistory.contains(where: { $0.date == localDate }) else { throw ProductionNativeError.invalidResponse }
            case .dexa:
                throw ProductionNativeError.invalidResponse
            }
            phase = .confirmed
        } catch {
            phase = .failed(Self.errorMessage(for: error))
        }
    }

    private func beginDEXAReview(reviewId: String) async throws {
        guard let review = try await environment.evidenceReviewAPI.fetchReview(reviewId: reviewId),
              let item = review.items.first(where: { $0.dexaMeasurements != nil }),
              let measurements = item.dexaMeasurements
        else {
            phase = .failed("The DEXA scan could not be read from this review.")
            return
        }
        dexaReviewId = reviewId
        dexaReviewVersion = review.version
        dexaEvidenceObjectId = item.id
        measuredAtText = measurements.measuredAt ?? Self.localDateKey.string(from: effectiveDate)
        totalMassText = measurements.totalMassLb.map(Self.formatNumber) ?? ""
        bodyFatPercentageText = measurements.bodyFatPercentage.map(Self.formatNumber) ?? ""
        fatMassText = measurements.fatMassLb.map(Self.formatNumber) ?? ""
        leanMassText = measurements.leanMassLb.map(Self.formatNumber) ?? ""
        boneMineralContentText = measurements.boneMineralContentLb.map(Self.formatNumber) ?? ""
        restingMetabolicRateText = measurements.restingMetabolicRateKcal.map(Self.formatNumber) ?? ""
        vatMassText = measurements.visceralAdiposeTissueMassLb.map(Self.formatNumber) ?? ""
        vatVolumeText = measurements.visceralAdiposeTissueVolumeIn3.map(Self.formatNumber) ?? ""
        phase = .reviewingDEXA
    }

    private func confirmDEXA() async {
        guard let reviewId = dexaReviewId, let evidenceObjectId = dexaEvidenceObjectId, let version = dexaReviewVersion else { return }
        phase = .confirming("Saving corrections…")
        let measurements = DEXAScanMeasurements(
            measuredAt: measuredAtText.isEmpty ? nil : measuredAtText,
            totalMassLb: Double(totalMassText),
            bodyFatPercentage: Double(bodyFatPercentageText),
            fatMassLb: Double(fatMassText),
            leanMassLb: Double(leanMassText),
            boneMineralContentLb: Double(boneMineralContentText),
            restingMetabolicRateKcal: Double(restingMetabolicRateText),
            visceralAdiposeTissueMassLb: Double(vatMassText),
            visceralAdiposeTissueVolumeIn3: Double(vatVolumeText)
        )
        do {
            let result = try await environment.dexaWriteAPI.editMeasurements(
                reviewId: reviewId, evidenceObjectId: evidenceObjectId, expectedVersion: String(version), measurements: measurements
            )
            try await commitAndAwait(reviewId: reviewId, expectedVersion: result.revision.map(String.init) ?? String(version))
        } catch {
            phase = .failed(Self.errorMessage(for: error))
        }
    }

    private func commitAndAwait(reviewId: String, expectedVersion: String? = nil) async throws {
        phase = .confirming("Confirming…")
        let version: String
        if let expectedVersion {
            version = expectedVersion
        } else {
            guard let review = try await environment.evidenceReviewAPI.fetchReview(reviewId: reviewId), let reviewVersion = review.version else {
                phase = .failed("This review could not be confirmed.")
                return
            }
            version = String(reviewVersion)
        }
        let pipeline = environment.evidenceIntakePipeline
        let confirmation = try await pipeline.commitReview(
            domain: effectiveScenario.writeGuardDomain,
            reviewId: reviewId,
            expectedVersion: version
        )
        if confirmation?.state == "confirmed" {
            try await refreshCanonicalRead()
            phase = .confirmed
            return
        }
        try await pipeline.awaitConfirmation(reviewAPI: environment.evidenceReviewAPI, reviewId: reviewId) { status in
            Task { @MainActor in phase = .confirming("Confirming (\(status))…") }
        }
        try await refreshCanonicalRead()
        phase = .confirmed
    }

    private func refreshCanonicalRead() async throws {
        let localDate = Self.localDateKey.string(from: effectiveDate)
        switch effectiveScenario {
        case .nutrition:
            let refreshed = try await environment.nutritionAPI.fetchNutritionLanding(scope: .all)
            guard refreshed.nutritionHistory.contains(where: { $0.date == localDate }) else {
                throw ProductionNativeError.invalidResponse
            }
        case .activity:
            let refreshed = try await environment.activityAPI.fetchActivityLanding(scope: .all)
            guard refreshed.activityHistory.contains(where: { $0.date == localDate }) else {
                throw ProductionNativeError.invalidResponse
            }
        case .dexa:
            let refreshed = try await environment.dexaAPI.fetchDEXAReport(scope: .all)
            guard refreshed.history.contains(where: { $0.date == localDate }) else {
                throw ProductionNativeError.invalidResponse
            }
        }
    }

    private static let localDateKey: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static func formatNumber(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }

    private static func errorMessage(for error: Error) -> String {
        if let productionError = error as? ProductionNativeError { return productionError.errorDescription ?? "This evidence could not be saved." }
        if let dailyError = error as? DailyEvidenceWriteError { return dailyError.errorDescription ?? "This evidence could not be saved." }
        if error is ProductionEvidenceIntakePipeline.Error { return "This evidence is taking longer than expected to process. Check back shortly." }
        return "This evidence could not be saved."
    }
}
