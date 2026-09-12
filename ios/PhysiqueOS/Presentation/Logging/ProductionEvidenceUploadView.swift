import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// Founder Production's screenshot/manual evidence upload — Nutrition and
/// Activity screenshots, and DEXA PDF intake, all drive the SAME server
/// pipeline (`ProductionEvidenceIntakePipeline`): submit → release the
/// Founder immediately → asynchronous server interpretation → a pending
/// Evidence Review the Founder confirms/corrects later
/// (`EvidenceReviewDetailView`). Native never blocks on interpretation or
/// canonical commit here (Build 20 regression: it did, for up to two
/// minutes, and a transient network hiccup anywhere in that long chain
/// surfaced as a false "PhysiqueOS could not be reached" even after the
/// server had already durably accepted — sometimes already committed —
/// the write). Native never simulates on-device OCR/interpretation for
/// the SCREENSHOT path either (unlike the Sandbox `EvidenceIntakeView`
/// this replaces under Founder Production) — every number shown once a
/// review is ready is the server's own interpretation. "Automatic" mode
/// is the one exception: it reuses the exact same on-device Vision/PDF
/// classification Sandbox's Automatic mode already uses
/// (`EvidenceLocalInterpretation`/`EvidenceSandboxRouter`) purely to pick
/// WHICH of the three server-supported intake types to submit as — the
/// server still does its own authoritative interpretation once the file
/// arrives at that type's intake endpoint; Native never fabricates
/// evidence content itself.
struct ProductionEvidenceUploadView: View {
    enum CaptureMode: String, CaseIterable, Identifiable {
        case screenshot, manual
        var id: String { rawValue }
        var label: String { self == .screenshot ? "Screenshot" : "Manual" }
    }

    /// The three types Founder Production's evidence-intake endpoint
    /// actually accepts (`NativeEvidenceIntakeRequest.js`'s `TYPES` set).
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

    /// The full domain menu the Founder sees, mirroring the accepted
    /// Sandbox Add Evidence architecture's breadth — but every entry is
    /// honest about what Founder Production can actually do with it today.
    enum DomainChoice: String, CaseIterable, Identifiable {
        case automatic, nutrition, activity, dexa, training, weight, progressPhotos, other
        var id: String { rawValue }
        var label: String {
            switch self {
            case .automatic: "Automatic"
            case .nutrition: "Nutrition"
            case .activity: "Activity"
            case .dexa: "DEXA"
            case .training: "Training"
            case .weight: "Weight"
            case .progressPhotos: "Progress Photos"
            case .other: "Other / General"
            }
        }
        /// `nil` means this choice doesn't submit through THIS screen at
        /// all — see `redirectDestination`/`unavailableReason`.
        var scenario: Scenario? {
            switch self {
            case .automatic: nil
            case .nutrition: .nutrition
            case .activity: .activity
            case .dexa: .dexa
            case .training, .weight, .progressPhotos, .other: nil
            }
        }
        /// Training and Weight already have their own accepted, purpose-
        /// built Native entry points (Workout Logger, Log Weight) — there
        /// is no screenshot-intake server contract for either, so this
        /// screen redirects rather than pretending to support them.
        var redirectDestination: AppDestination? {
            switch self {
            case .training: .trainingLogger
            case .weight: .manualWeighIn
            default: nil
            }
        }
        /// Progress Photos and general/"Other" evidence have no Founder
        /// Production write command at all today (not in the 8-command
        /// allowlist, no intake `expectedEvidenceType` for either) —
        /// shown, per the accepted Sandbox breadth, but explicitly
        /// unavailable rather than silently broken or faked.
        var unavailableReason: String? {
            switch self {
            case .progressPhotos: "Progress Photo writes are not yet available in Founder Production."
            case .other: "General evidence has no canonical intake type yet — choose Nutrition, Activity, or DEXA."
            default: nil
            }
        }
    }

    enum Phase: Equatable {
        case picking
        case classifying
        case uploading
        case accepted(String)
        case confirmed
        case failed(String)
    }

    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    /// `nil` — reached via the generic "Add Evidence" entry (Log screen);
    /// the Founder picks a domain, defaulting to Automatic. Fixed to
    /// `.dexa` when reached via the dedicated DEXA upload destination.
    var fixedScenario: Scenario?
    var onNavigate: (AppDestination) -> Void = { _ in }
    var onReturnToLog: () -> Void = {}

    @State private var domainChoice: DomainChoice = .automatic
    /// Set once Automatic classification resolves, or immediately when an
    /// explicit domain is chosen — this is what actually drives the
    /// attachment UI and submission, never `domainChoice` directly.
    @State private var resolvedScenario: Scenario?
    @State private var classificationNote: String?
    @State private var captureMode: CaptureMode = .screenshot
    @State private var effectiveDate = Date()
    @State private var attachments: [SandboxAttachment] = []
    @State private var isPhotosPickerPresented = false
    @State private var isFilePickerPresented = false
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var isLoadingAttachments = false
    @State private var phase: Phase = .picking
    @State private var uploadStartedAt: Date?
    @State private var acceptanceSeconds: Double?

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

    private var effectiveScenario: Scenario? { fixedScenario ?? resolvedScenario }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                switch phase {
                case .picking: pickingContent
                case .classifying: classifyingContent
                case .uploading: uploadingContent
                case .accepted(let message): acceptedContent(message)
                case .confirmed: confirmedContent
                case .failed(let message): failedContent(message)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
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
        .fileImporter(
            isPresented: $isFilePickerPresented,
            allowedContentTypes: domainChoice == .automatic ? [.pdf, .image] : [.pdf],
            allowsMultipleSelection: false
        ) { result in
            if case .success(let urls) = result {
                attachments.append(contentsOf: EvidenceAttachmentLoader.files(urls))
            }
        }
        .onAppear {
            if let fixedScenario {
                domainChoice = fixedScenario == .dexa ? .dexa : .nutrition
                resolvedScenario = fixedScenario
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("ADD EVIDENCE").physiqueOSFont(PhysiqueOSTypography.screenEyebrow).foregroundStyle(PhysiqueOSTheme.accent)
            Text(fixedScenario == .dexa ? "DEXA Scan" : "Add Evidence").physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
        }
    }

    // MARK: - Picking

    @ViewBuilder
    private var pickingContent: some View {
        if fixedScenario == nil {
            domainSelectorCard
        }
        if let redirect = domainChoice.redirectDestination {
            CardContainer { VStack(alignment: .leading, spacing: 10) {
                Text("\(domainChoice.label) has its own entry point.").physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                PrimaryActionButton(title: "Open \(domainChoice.label)") { onNavigate(redirect) }
            } }
        } else if let reason = domainChoice.unavailableReason {
            CardContainer {
                Text(reason).physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        } else {
            submittableContent
        }
    }

    private var domainSelectorCard: some View {
        CardContainer { VStack(alignment: .leading, spacing: 10) {
            Text("What kind of evidence?").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
            ForEach(DomainChoice.allCases) { choice in
                Button {
                    domainChoice = choice
                    resolvedScenario = choice.scenario
                    classificationNote = nil
                } label: {
                    HStack {
                        Text(choice.label).physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        if choice == .automatic {
                            Text("Recommended").physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.accent)
                        }
                        Spacer()
                        if domainChoice == choice { Image(systemName: "checkmark.circle.fill").foregroundStyle(PhysiqueOSTheme.accent) }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                .accessibilityIdentifier("productionEvidenceUpload.domain.\(choice.rawValue)")
                if choice != DomainChoice.allCases.last { Divider().overlay(PhysiqueOSTheme.divider) }
            }
        } }
    }

    @ViewBuilder
    private var submittableContent: some View {
        CardContainer { VStack(alignment: .leading, spacing: 10) {
            DateField(date: $effectiveDate, maximumDate: Date(), label: "Date")
        } }
        if domainChoice != .automatic, resolvedScenario != .dexa {
            CardContainer { VStack(alignment: .leading, spacing: 10) {
                Picker("Entry method", selection: $captureMode) {
                    ForEach(CaptureMode.allCases) { Text($0.label).tag($0) }
                }.pickerStyle(.segmented)
            } }
        }
        if let note = classificationNote {
            CardContainer {
                Text(note).physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.chartEffort)
            }
        }
        if resolvedScenario == .dexa || domainChoice == .automatic || captureMode == .screenshot {
            attachmentCard
        } else {
            manualEntryContent
        }
        PrimaryActionButton(
            title: captureMode == .manual && domainChoice != .automatic ? "Save" : "Upload",
            tone: .accent,
            isEnabled: canSubmit
        ) {
            Task { await primarySubmit() }
        }.accessibilityIdentifier("productionEvidenceUpload.submit")
    }

    private var attachmentCard: some View {
        CardContainer { VStack(alignment: .leading, spacing: 12) {
            Text(resolvedScenario == .dexa ? "BodySpec PDF" : domainChoice == .automatic ? "Screenshots or PDF" : "Screenshots")
                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
            if attachments.isEmpty {
                Text(resolvedScenario == .dexa ? "Attach one BodySpec PDF report." : "Attach 1–4 screenshots.")
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
                if resolvedScenario != .dexa {
                    Button("Choose Photos") { isPhotosPickerPresented = true }.buttonStyle(.bordered)
                }
                if resolvedScenario == .dexa || domainChoice == .automatic {
                    Button("Choose PDF") { isFilePickerPresented = true }.buttonStyle(.bordered)
                }
            }
            if isLoadingAttachments { ProgressView() }
        } }
    }

    private var canSubmit: Bool {
        guard !isLoadingAttachments else { return false }
        if domainChoice == .automatic { return !attachments.isEmpty }
        if resolvedScenario == .dexa || captureMode == .screenshot { return !attachments.isEmpty }
        switch resolvedScenario {
        case .nutrition: return [caloriesText, proteinText, carbsText, fatText, fiberText].contains { !$0.isEmpty }
        case .activity: return [activeCaloriesText, totalCaloriesText, exerciseMinutesText, standHoursText, moveGoalText].contains { !$0.isEmpty }
        case .dexa, .none: return false
        }
    }

    private var manualEntryContent: some View {
        CardContainer { VStack(alignment: .leading, spacing: 12) {
            Text(resolvedScenario == .nutrition ? "Daily totals" : "Daily activity")
                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
            Text("Blank fields remain unknown. Existing web-authored days require screenshot review so the server can enforce its revision fingerprint.")
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            if resolvedScenario == .nutrition {
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

    // MARK: - Progress / result phases (each forced full-width — Build 20's
    // sparse single-card progress screen had no full-width element at all,
    // which let the ScrollView/VStack collapse to its content's intrinsic
    // width and rendered as a narrow centered column with the page
    // background showing on both sides).

    private var classifyingContent: some View {
        CardContainer { VStack(alignment: .leading, spacing: 10) {
            ProgressView().tint(PhysiqueOSTheme.accent)
            Text("Checking what kind of evidence this is…").physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
        }.frame(maxWidth: .infinity, alignment: .leading) }
    }

    private var uploadingContent: some View {
        CardContainer { VStack(alignment: .leading, spacing: 10) {
            ProgressView().tint(PhysiqueOSTheme.accent)
            Text("Uploading…").physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
        }.frame(maxWidth: .infinity, alignment: .leading) }
    }

    private func acceptedContent(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            CardContainer { VStack(alignment: .leading, spacing: 8) {
                Label("Uploaded", systemImage: "checkmark.circle.fill").foregroundStyle(PhysiqueOSTheme.chartSuccess)
                Text(message).physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                Text("PhysiqueOS is reading it now. Check Log's pending review list shortly — no need to wait here.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textMuted)
            }.frame(maxWidth: .infinity, alignment: .leading) }
            PrimaryActionButton(title: "Return to Log", tone: .accent) { onReturnToLog(); dismiss() }
                .accessibilityIdentifier("productionEvidenceUpload.returnToLog")
        }
    }

    private var confirmedContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            CardContainer { Label("Evidence saved", systemImage: "checkmark.circle.fill").foregroundStyle(PhysiqueOSTheme.chartSuccess).frame(maxWidth: .infinity, alignment: .leading) }
            PrimaryActionButton(title: "Return to Log", tone: .accent) { onReturnToLog(); dismiss() }
        }
    }

    private func failedContent(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(message).physiqueOSFont(PhysiqueOSTypography.calloutStrong).foregroundStyle(PhysiqueOSTheme.destructive)
                .frame(maxWidth: .infinity, alignment: .leading)
            PrimaryActionButton(title: "Try Again", tone: .accent) { phase = .picking }
        }
    }

    // MARK: - Submission

    private func primarySubmit() async {
        if domainChoice == .automatic {
            await classifyThenUpload()
            return
        }
        guard let scenario = effectiveScenario else { return }
        guard (try? NativeProductWriteGuard.authorize(scenario.writeGuardDomain, in: .founderProduction)) != nil else { return }
        if captureMode == .manual, fixedScenario == nil {
            await submitManualEntry(scenario: scenario)
            return
        }
        await submitIntake(scenario: scenario)
    }

    /// Reuses the exact same on-device classification Sandbox's Automatic
    /// mode already uses — a pure local Vision/PDF-text heuristic, no
    /// server round trip, no fabricated canonical evidence. It only picks
    /// which of the three server-supported intake types to submit as; the
    /// server still authoritatively interprets the file itself.
    private func classifyThenUpload() async {
        phase = .classifying
        var draft = EvidenceIntakeDraft.fresh(now: effectiveDate)
        draft.attachments = attachments
        draft = await EvidenceLocalInterpretation.prepare(draft)
        attachments = draft.attachments
        let categories = EvidenceSandboxRouter.detectedCategories(for: draft)
        let scenario: Scenario?
        let note: String?
        switch categories.first {
        case _ where categories.count > 1:
            // Bounded diagnostic: only the matched CATEGORY NAMES (a fixed,
            // small enum) — never the document's extracted text, filename,
            // or any other content — so a real ambiguous classification can
            // be understood from the device console without exposing the
            // Founder's evidence. This is what should be captured the next
            // time Automatic reports "more than one kind of evidence" on a
            // real document, instead of guessing at more keywords blind.
            print("EvidenceClassification: ambiguous categories=\(categories.map(\.rawValue).sorted())")
            scenario = nil
            note = "This looks like more than one kind of evidence. Choose the right one below."
        case .nutrition: scenario = .nutrition; note = "Detected: Nutrition."
        case .activity: scenario = .activity; note = "Detected: Activity."
        case .dexa: scenario = .dexa; note = "Detected: DEXA."
        case .training:
            scenario = nil
            note = "This looks like a workout — use Workout Logger instead of Add Evidence."
        case .weight:
            scenario = nil
            note = "This looks like a weigh-in — use Log Weight instead of Add Evidence."
        case .progressPhotos, .labs, .recovery, .generic, .none:
            scenario = nil
            note = "Couldn't automatically tell what this is. Choose the right kind below."
        }
        guard let scenario else {
            classificationNote = note
            domainChoice = .nutrition // surfaces the explicit Nutrition/Activity/DEXA choices without losing attachments
            resolvedScenario = nil
            phase = .picking
            return
        }
        resolvedScenario = scenario
        classificationNote = note
        guard (try? NativeProductWriteGuard.authorize(scenario.writeGuardDomain, in: .founderProduction)) != nil else {
            phase = .picking
            return
        }
        await submitIntake(scenario: scenario)
    }

    /// The whole point of this rewrite: submit and return control to the
    /// Founder immediately. No polling, no waiting for interpretation or
    /// canonical commit — those continue entirely server-side, and the
    /// Founder finds the result later via Log's pending-review list and
    /// `EvidenceReviewDetailView`'s Confirm/Correct actions.
    private func submitIntake(scenario: Scenario) async {
        phase = .uploading
        let localDate = Self.localDateKey.string(from: effectiveDate)
        let files = attachments.compactMap { attachment -> (filename: String, contentType: String, data: Data)? in
            guard let data = attachment.data else { return nil }
            return (attachment.displayName, attachment.contentType ?? (scenario == .dexa ? "application/pdf" : "image/jpeg"), data)
        }
        let startedAt = Date()
        do {
            let status = try await environment.evidenceIntakePipeline.submitIntake(
                scope: "\(scenario.rawValue)-intake.\(localDate)",
                effectiveDate: localDate,
                expectedEvidenceType: scenario.expectedEvidenceType,
                files: files
            )
            acceptanceSeconds = Date().timeIntervalSince(startedAt)
            let noun = scenario == .dexa ? "scan" : "screenshots"
            phase = .accepted("Your \(noun) \(files.count == 1 && scenario != .dexa ? "was" : "were") accepted for \(Self.mediumDate.string(from: effectiveDate)).")
        } catch {
            phase = .failed(Self.errorMessage(for: error))
        }
    }

    private func submitManualEntry(scenario: Scenario) async {
        phase = .uploading
        let localDate = Self.localDateKey.string(from: effectiveDate)
        do {
            switch scenario {
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

    private static let localDateKey: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let mediumDate: DateFormatter = { let f = DateFormatter(); f.dateStyle = .medium; return f }()

    private static func errorMessage(for error: Error) -> String {
        if let productionError = error as? ProductionNativeError { return productionError.errorDescription ?? "This evidence could not be uploaded." }
        if let dailyError = error as? DailyEvidenceWriteError { return dailyError.errorDescription ?? "This evidence could not be saved." }
        return "This evidence could not be uploaded."
    }
}
