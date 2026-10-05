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

    /// The screenshot/PDF/photo families Founder Production's evidence-intake endpoint
    /// actually accepts (`NativeEvidenceIntakeRequest.js`'s `TYPES` set).
    enum Scenario: String, CaseIterable, Identifiable {
        case nutrition, activity, training, dexa, progressPhotos
        var id: String { rawValue }
        var label: String {
            switch self {
            case .nutrition: "Nutrition"
            case .activity: "Activity"
            case .training: "Training"
            case .dexa: "DEXA"
            case .progressPhotos: "Progress Photos"
            }
        }
        var expectedEvidenceType: String {
            switch self {
            case .nutrition: "nutrition"
            case .activity: "activity_day"
            case .training: "training"
            case .dexa: "dexa_scan"
            case .progressPhotos: "photo_session"
            }
        }
        var writeGuardDomain: NativeProductWriteDomain {
            switch self {
            case .nutrition: .nutrition
            case .activity: .activityEvidence
            case .training: .workoutLogger
            case .dexa: .dexa
            case .progressPhotos: .progressPhotos
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
            case .progressPhotos: .progressPhotos
            case .training, .weight, .other: nil
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
            case .progressPhotos: .photoUpload
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
            case .other: "General evidence has no canonical intake type yet — choose Nutrition, Activity, or DEXA."
            default: nil
            }
        }
    }

    enum Phase: Equatable {
        case picking
        case classifying
        case uploading
        /// Transfer is durably accepted; briefly checking whether
        /// interpretation already finished before falling back to
        /// `.accepted`'s "check Log later" messaging.
        case processing
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
    /// True once Automatic ran and could not decide. Keeps Automatic selected
    /// (no domain is implied to have been detected) while requiring the
    /// Founder to choose one before submitting.
    @State private var automaticClassificationUnresolved = false
    /// Automatic is resolved per attachment. Mixed families are grouped into
    /// separate canonical intakes behind one Founder Upload action; only an
    /// actually ambiguous attachment needs a local explicit hint.
    @State private var attachmentScenarios: [String: Scenario] = [:]
    @State private var unresolvedAttachmentIDs = Set<String>()
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
    @State private var transferProgress: Double = 0
    @State private var groupedTransferProgress: [Scenario: Double] = [:]
    @State private var readyReviews: [Scenario: String] = [:]

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
    @State private var photoIdentities: [ProgressPhotoIdentityDraft] = []
    @State private var photoSession = ProgressPhotoSessionDraft()
    /// Staged Progress Photos transport state: live per-photo progress and a
    /// durable plan left pending by a lost response, suspension, or relaunch.
    @State private var stagedProgress: StagedPhotoIntakeProgress?
    @State private var pendingStagedPlan: StagedPhotoIntakePlan?
    /// One plain-language line per photo when choosing a pose moved a dependent choice (for example Double Biceps sets Flexed).
    @State private var poseNotices: [String: String] = [:]

    private var effectiveScenario: Scenario? { fixedScenario ?? resolvedScenario }

    /// Locked Evidence Intake (`85ef2a6c`): the explicit domain choice
    /// collapses to a summary row; tapping it reopens the full list.
    @State private var isChoosingDomain = false

    var body: some View {
        WorkflowPage {
            WorkflowHeader(eyebrow: "Add Evidence", title: fixedScenario == .dexa ? "DEXA Scan" : fixedScenario == .progressPhotos ? "Progress Photos" : "Add Evidence")
            switch phase {
            case .picking: pickingContent
            case .classifying: classifyingContent
            case .uploading: uploadingContent
            case .processing: processingContent
            case .accepted(let message): acceptedContent(message)
            case .confirmed: confirmedContent
            case .failed(let message): failedContent(message)
            }
        }
        .physiqueOSScrollBottomClearance()
        .workflowChrome(back: "Add Evidence")
        .photosPicker(
            isPresented: $isPhotosPickerPresented,
            selection: $photoItems,
            maxSelectionCount: effectiveScenario == .progressPhotos ? 0 : 4,
            matching: .images,
            // The default `.automatic` policy offers a HEIC asset as its
            // compatible JPEG transcode first, which would replace the
            // original before staging ever sees it. `.current` delivers the
            // asset's own bytes; the staged transport preserves them verbatim.
            preferredItemEncoding: .current
        )
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
        .onChange(of: attachments.count) {
            // A different attachment set is a different classification
            // question, so let Automatic try again.
            automaticClassificationUnresolved = false
            attachmentScenarios = [:]
            unresolvedAttachmentIDs = []
            syncPhotoIdentities()
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
                domainChoice = switch fixedScenario {
                case .dexa: .dexa
                case .progressPhotos: .progressPhotos
                default: .nutrition
                }
                resolvedScenario = fixedScenario
            }
            #if DEBUG
            applyReviewSeed()
            #endif
            Task { await refreshPendingStagedPlan() }
        }
    }

    // MARK: - Picking

    @ViewBuilder
    private var pickingContent: some View {
        if fixedScenario == nil, !(domainChoice == .automatic && hasAutomaticResult) {
            if domainChoice == .automatic || isChoosingDomain {
                domainSelectorCard
            } else if domainChoice.scenario == nil {
                domainSummaryCard(includesDate: false)
            }
        }
        if fixedScenario == nil, domainChoice.redirectDestination != nil || domainChoice.unavailableReason != nil, domainChoice.scenario == nil || domainChoice == .progressPhotos {
            handoffCard
        } else {
            submittableContent
        }
    }

    private var hasAutomaticResult: Bool {
        !attachmentScenarios.isEmpty || !unresolvedAttachmentIDs.isEmpty
    }

    /// `What kind of evidence?` — every canonical domain in order.
    private var domainSelectorCard: some View {
        WorkflowSurface(tone: .rich) {
            VStack(alignment: .leading, spacing: 0) {
                Text("What kind of evidence?")
                    .evidenceText(WorkflowText.h2)
                    .foregroundStyle(WorkflowColor.text)
                    .padding(.bottom, 11)
                ForEach(DomainChoice.allCases) { choice in
                    Button {
                        domainChoice = choice
                        resolvedScenario = choice.scenario
                        classificationNote = nil
                        automaticClassificationUnresolved = false
                        isChoosingDomain = false
                    } label: {
                        WorkflowRow(isLast: choice == DomainChoice.allCases.last) {
                            HStack(spacing: 10) {
                                HStack(spacing: 6) {
                                    Text(choice.label).evidenceText(WorkflowText.label).foregroundStyle(WorkflowColor.text)
                                    if choice == .automatic {
                                        Text("Recommended").evidenceText(WorkflowText.recommend).foregroundStyle(WorkflowColor.purple)
                                    }
                                }
                                Spacer(minLength: 0)
                                if domainChoice == choice {
                                    WorkflowCheck()
                                } else {
                                    Text("›").evidenceText(WorkflowText.secondary).foregroundStyle(WorkflowColor.muted)
                                }
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(domainChoice == choice ? [.isButton, .isSelected] : .isButton)
                    .accessibilityIdentifier("productionEvidenceUpload.domain.\(choice.rawValue)")
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("productionEvidenceUpload.domains")
    }

    /// The collapsed explicit choice: `What kind of evidence?` with the
    /// chosen type tag (and the Date row when the type submits here).
    private func domainSummaryCard(includesDate: Bool) -> some View {
        WorkflowSurface(tone: .rich) {
            VStack(alignment: .leading, spacing: 0) {
                Button { isChoosingDomain = true } label: {
                    HStack(alignment: .center, spacing: 12) {
                        Text("What kind of evidence?").evidenceText(WorkflowText.h2).foregroundStyle(WorkflowColor.text)
                        Spacer(minLength: 0)
                        WorkflowTag(text: domainChoice.label)
                    }
                    .frame(minHeight: 22)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("What kind of evidence? \(domainChoice.label)")
                .accessibilityHint("Choose a different type")
                .accessibilityIdentifier("productionEvidenceUpload.domainSummary")
                if includesDate {
                    WorkflowDateRow(date: $effectiveDate)
                        .padding(.top, 11)
                }
            }
        }
    }

    /// Training, Weight and Progress Photos open their own canonical entry
    /// points; Other / General has no canonical intake type.
    private var handoffCard: some View {
        WorkflowSurface(tone: .rich) {
            VStack(alignment: .leading, spacing: 0) {
                if let redirect = domainChoice.redirectDestination {
                    Text("\(domainChoice.label) has its own entry point.")
                        .evidenceText(WorkflowText.h2)
                        .foregroundStyle(WorkflowColor.text)
                    if let owner = Self.handoffOwner(domainChoice) {
                        Text(owner)
                            .evidenceText(WorkflowText.small)
                            .foregroundStyle(WorkflowColor.muted)
                            .padding(.top, 5)
                    }
                    WorkflowActions {
                        WorkflowButton(title: "Open \(domainChoice.label)", identifier: "productionEvidenceUpload.handoff") { onNavigate(redirect) }
                    }
                } else if let reason = domainChoice.unavailableReason {
                    Text(domainChoice.label)
                        .evidenceText(WorkflowText.h2)
                        .foregroundStyle(WorkflowColor.text)
                    Text(reason)
                        .evidenceText(WorkflowText.small)
                        .foregroundStyle(WorkflowColor.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 5)
                }
            }
            .padding(.vertical, 13)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("productionEvidenceUpload.handoffCard")
    }

    private static func handoffOwner(_ choice: DomainChoice) -> String? {
        switch choice {
        case .training: "Workout Logger owns canonical Training entry."
        case .weight: "Log Weight owns canonical backdated Weight entry."
        case .progressPhotos: "Progress Photos owns the staged original-photo upload."
        default: nil
        }
    }

    @ViewBuilder
    private var submittableContent: some View {
        if resolvedScenario == .progressPhotos { pendingStagedPhotosCard }
        let explicitScreenshotDomain = domainChoice != .automatic && resolvedScenario != .dexa && resolvedScenario != .progressPhotos
        if fixedScenario == nil, explicitScreenshotDomain {
            domainSummaryCard(includesDate: true)
            WorkflowSegmented(options: CaptureMode.allCases.map { ($0, $0.label) }, selection: $captureMode)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("productionEvidenceUpload.captureMode")
        } else {
            if let note = classificationNote {
                WorkflowNote {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(note).evidenceText(WorkflowText.label).foregroundStyle(WorkflowColor.text)
                        if !unresolvedAttachmentIDs.isEmpty {
                            Text("Choose a type only for the attachment that could not be classified unambiguously.")
                                .evidenceText(WorkflowText.small)
                                .foregroundStyle(WorkflowColor.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .accessibilityIdentifier("productionEvidenceUpload.classificationNote")
            }
            WorkflowSurface { WorkflowDateRow(date: $effectiveDate) }
        }
        if resolvedScenario == .dexa || domainChoice == .automatic || captureMode == .screenshot {
            attachmentCard
        } else {
            manualEntryContent
        }
        if resolvedScenario == .progressPhotos { sessionConditionsCard }
        WorkflowPrimaryButton(
            title: captureMode == .manual && domainChoice != .automatic && resolvedScenario != .dexa && resolvedScenario != .progressPhotos ? "Save" : "Upload",
            isEnabled: canSubmit,
            identifier: "productionEvidenceUpload.submit"
        ) {
            Task { await primarySubmit() }
        }
    }

    private var attachmentTitle: String {
        resolvedScenario == .dexa ? "BodySpec PDF" : resolvedScenario == .progressPhotos ? "Photo set" : domainChoice == .automatic ? "Screenshots or PDF" : "Screenshots"
    }

    private var attachmentEmptyCopy: String {
        resolvedScenario == .dexa ? "Attach one BodySpec PDF report." : resolvedScenario == .progressPhotos ? "Choose one or more original Progress Photos." : domainChoice == .automatic ? "Attach 1–4 screenshots or one PDF." : "Attach 1–4 screenshots."
    }

    @ViewBuilder
    private var attachmentCard: some View {
        WorkflowSurface(tone: attachments.isEmpty && resolvedScenario != .progressPhotos && resolvedScenario != .dexa ? .plain : .rich) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(attachmentTitle).evidenceText(WorkflowText.h2).foregroundStyle(WorkflowColor.text)
                        if attachments.isEmpty || resolvedScenario == .dexa || resolvedScenario == .progressPhotos {
                            Text(resolvedScenario == .dexa && !attachments.isEmpty ? "One PDF · \(Self.byteLabel(attachments.first))" : attachmentEmptyCopy)
                                .evidenceText(WorkflowText.small)
                                .foregroundStyle(WorkflowColor.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer(minLength: 0)
                    if !attachments.isEmpty {
                        WorkflowTag(text: resolvedScenario == .dexa ? "Ready" : resolvedScenario == .progressPhotos ? "\(attachments.count) photo\(attachments.count == 1 ? "" : "s")" : "\(attachments.count) file\(attachments.count == 1 ? "" : "s")")
                    }
                }
                .padding(.bottom, 11)
                if resolvedScenario == .progressPhotos {
                    ForEach(Array(photoIdentities.enumerated()), id: \.element.id) { index, identity in
                        photoIdentityBlock(index: index, identity: identity)
                    }
                } else {
                    ForEach(Array(attachments.enumerated()), id: \.element.id) { index, attachment in
                        // `.file-row` keeps its rule: the type picker or the
                        // buttons always follow it in the locked composition.
                        fileRow(attachment, isLast: false)
                        if domainChoice == .automatic, unresolvedAttachmentIDs.contains(attachment.id) {
                            typePicker(for: attachment)
                                .padding(.top, 10)
                        }
                    }
                }
                HStack(spacing: 9) {
                    if resolvedScenario == .dexa, !attachments.isEmpty {
                        WorkflowButton(title: "Remove", destructive: true, identifier: "productionEvidenceUpload.removePDF") { attachments.removeAll() }
                    }
                    if resolvedScenario != .dexa {
                        WorkflowButton(title: "Choose Photos", identifier: "productionEvidenceUpload.choosePhotos") { isPhotosPickerPresented = true }
                    }
                    if resolvedScenario == .dexa || domainChoice == .automatic {
                        WorkflowButton(title: "Choose PDF", identifier: "productionEvidenceUpload.choosePDF") { isFilePickerPresented = true }
                    }
                    if isLoadingAttachments { WorkflowSpinner() }
                }
                .padding(.top, attachments.isEmpty ? 0 : 12)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("productionEvidenceUpload.attachments")
    }

    /// `.file-row`: icon, name, kind · size and the resolved type tag. The
    /// row keeps the existing remove capability as an accessibility action
    /// and context menu.
    private func fileRow(_ attachment: SandboxAttachment, isLast: Bool) -> some View {
        WorkflowRow(isLast: isLast) {
            HStack(spacing: 10) {
                WorkflowFileIcon()
                    .frame(width: 42, alignment: .leading)
                VStack(alignment: .leading, spacing: 0) {
                    Text(attachment.displayName).evidenceText(WorkflowText.label).foregroundStyle(WorkflowColor.text).lineLimit(1)
                    Text("\(attachment.isPDF ? "PDF document" : "Screenshot") · \(Self.byteLabel(attachment))")
                        .evidenceText(WorkflowText.secondary)
                        .foregroundStyle(WorkflowColor.muted)
                }
                Spacer(minLength: 0)
                if let scenario = attachmentScenarios[attachment.id] {
                    WorkflowTag(text: scenario.label)
                }
            }
        }
        .contentShape(Rectangle())
        .contextMenu {
            Button("Remove", role: .destructive) { attachments.removeAll { $0.id == attachment.id } }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAction(named: "Remove") { attachments.removeAll { $0.id == attachment.id } }
        .accessibilityIdentifier("productionEvidenceUpload.file.\(attachment.displayName)")
    }

    private func typePicker(for attachment: SandboxAttachment) -> some View {
        WorkflowSelectField(label: "Choose type for \(attachment.displayName)", value: attachmentScenarios[attachment.id]?.label ?? "Choose type") {
            ForEach(Self.automaticScenarios) { scenario in
                Button(scenario.label) {
                    attachmentScenarios[attachment.id] = scenario
                    unresolvedAttachmentIDs.remove(attachment.id)
                    automaticClassificationUnresolved = !unresolvedAttachmentIDs.isEmpty
                }
            }
        }
        .accessibilityIdentifier("productionEvidenceUpload.typePicker")
    }

    static func byteLabel(_ attachment: SandboxAttachment?) -> String {
        guard let count = attachment?.data?.count else { return "Ready" }
        if count >= 1_000_000 { return String(format: "%.1f MB", Double(count) / 1_000_000) }
        return "\(max(1, count / 1_000)) KB"
    }

    private var canSubmit: Bool {
        guard !isLoadingAttachments else { return false }
        // Automatic already ran on these attachments and could not decide, so
        // re-submitting would only reclassify the same bytes to the same
        // answer. The Founder has to pick a domain to move forward.
        if domainChoice == .automatic { return !attachments.isEmpty && !automaticClassificationUnresolved }
        if resolvedScenario == .progressPhotos {
            return !attachments.isEmpty && photoSession.timeOfDay != nil && photoSession.originalUnedited &&
                photoIdentities.count == attachments.count && photoIdentities.allSatisfy { identity in
                    identity.confirmed && identity.isCanonicalPose
                }
        }
        if resolvedScenario == .dexa || captureMode == .screenshot { return !attachments.isEmpty }
        switch resolvedScenario {
        case .nutrition: return [caloriesText, proteinText, carbsText, fatText, fiberText].contains { !$0.isEmpty }
        case .activity: return [activeCaloriesText, totalCaloriesText, exerciseMinutesText, standHoursText, moveGoalText].contains { !$0.isEmpty }
        case .progressPhotos: return false
        case .training, .dexa, .none: return false
        }
    }

    /// One photo: the original image, its canonical pose identity and the
    /// local per-photo confirmation (never a claim about Server review).
    private func photoIdentityBlock(index: Int, identity: ProgressPhotoIdentityDraft) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // The actual photo being classified, shown with the controls, so
            // the Founder never has to correlate the two. Display-only
            // downsample: `previewImage` does not touch the uploaded bytes.
            if let attachment = attachments.first(where: { $0.id == identity.attachmentId }),
               let image = Self.previewImage(for: attachment) {
                Color(red: 7 / 255, green: 17 / 255, blue: 27 / 255)
                    .frame(height: 308)
                    .overlay { Image(uiImage: image).resizable().scaledToFill() }
                    .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
                    .accessibilityLabel("Photo \(index + 1)")
                    .padding(.bottom, 12)
            }
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("PHOTO \(index + 1)").evidenceText(WorkflowText.micro).foregroundStyle(WorkflowColor.muted)
                    Text(identity.confirmed ? identity.poseLabel : "Pose not confirmed")
                        .evidenceText(WorkflowText.h2)
                        .foregroundStyle(WorkflowColor.text)
                }
                Spacer(minLength: 0)
                WorkflowTag(text: identity.confirmed ? "Confirmed" : "Review", tone: identity.confirmed ? .green : .amber)
            }
            .padding(.bottom, 11)
            // Orientation, contraction, and pose are not independent: the
            // choices offered, and the adjustment when one is changed, come
            // from the Server's canonical pose contract.
            HStack(spacing: 8) {
                photoPicker("Orientation", selection: poseBinding(identity, \.orientation) { .orientation($0) }, values: ProgressPhotoPoseContract.selectableOrientations)
                photoPicker("Contraction", selection: poseBinding(identity, \.contraction) { .contraction($0) }, values: ProgressPhotoPoseContract.selectableContractions(for: identity.orientation))
            }
            photoPicker("Pose", selection: poseBinding(identity, \.poseVariant) { .variant($0) }, values: ProgressPhotoPoseContract.selectableVariants(for: identity.orientation))
                .padding(.top, 8)
            if let notice = poseNotices[identity.id] {
                Text(notice)
                    .evidenceText(WorkflowText.small)
                    .foregroundStyle(WorkflowColor.amber)
                    .padding(.top, 8)
                    .accessibilityIdentifier("productionEvidenceUpload.poseNotice.\(index + 1)")
            }
            Button {
                updatePhoto(identity.id) { draft in draft.confirmed = draft.isCanonicalPose }
            } label: {
                Text(identity.confirmed ? "✓ Pose confirmed" : "Confirm pose")
                    .evidenceText(WorkflowText.primary.with(lineHeight: 18))
                    .foregroundStyle(identity.confirmed ? WorkflowColor.green : WorkflowColor.teal)
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .background(identity.confirmed ? WorkflowColor.confirmDone : WorkflowColor.confirm, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(!identity.isCanonicalPose)
            .padding(.top, 10)
            .accessibilityIdentifier("productionEvidenceUpload.confirmPose.\(index + 1)")
        }
        .padding(.bottom, index == photoIdentities.count - 1 ? 0 : 16)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("productionEvidenceUpload.photo.\(index + 1)")
    }

    static func previewImage(for attachment: SandboxAttachment) -> UIImage? {
        if let data = attachment.data, let image = EvidenceAttachmentLoader.previewImage(data: data) { return image }
        #if DEBUG
        return SyntheticProgressPhoto.image(named: attachment.displayName)
        #else
        return nil
        #endif
    }

    /// `Session conditions`: Time of day, Fasted, Post-workout, Pump; the
    /// original/unedited confirmation; the Server-owned lifecycle note.
    private var sessionConditionsCard: some View {
        WorkflowSurface {
            VStack(alignment: .leading, spacing: 0) {
                Text("Session conditions")
                    .evidenceText(WorkflowText.h2)
                    .foregroundStyle(WorkflowColor.text)
                    .padding(.bottom, 11)
                WorkflowGrid(items: ProgressPhotoSessionDraft.conditionGrid.flatMap { $0 }) { field in
                    sessionConditionMenu(field)
                }
                WorkflowToggleRow(title: "These are original, unedited photos.", isOn: $photoSession.originalUnedited)
                Text("Every pose and condition is sent to the Server-owned Progress Photos review. Confirmation creates the canonical PhotoSession and starts the existing Photo Briefing lifecycle.")
                    .evidenceText(WorkflowText.small)
                    .foregroundStyle(WorkflowColor.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("productionEvidenceUpload.sessionConditions")
    }

    private var manualEntryContent: some View {
        WorkflowSurface {
            VStack(alignment: .leading, spacing: 0) {
                Text(resolvedScenario == .nutrition ? "Daily totals" : "Daily activity")
                    .evidenceText(WorkflowText.h2)
                    .foregroundStyle(WorkflowColor.text)
                Text("Blank fields remain unknown. Existing web-authored days require screenshot review so the server can enforce its revision fingerprint.")
                    .evidenceText(WorkflowText.small)
                    .foregroundStyle(WorkflowColor.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 11)
                if resolvedScenario == .nutrition {
                    manualField("Calories", text: $caloriesText)
                    manualField("Protein (g)", text: $proteinText)
                    manualField("Carbs (g)", text: $carbsText)
                    manualField("Fat (g)", text: $fatText)
                    manualField("Fiber (g)", text: $fiberText, isLast: true)
                } else {
                    manualField("Active calories", text: $activeCaloriesText)
                    manualField("Total calories", text: $totalCaloriesText)
                    manualField("Exercise minutes", text: $exerciseMinutesText)
                    manualField("Stand hours", text: $standHoursText)
                    manualField("Move goal", text: $moveGoalText, isLast: true)
                    Text("Manual entry only. HealthKit and direct device-health sync are not enabled.")
                        .evidenceText(WorkflowText.small)
                        .foregroundStyle(WorkflowColor.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 11)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("productionEvidenceUpload.manual")
    }

    private func manualField(_ label: String, text: Binding<String>, isLast: Bool = false) -> some View {
        WorkflowRow(isLast: isLast) {
            HStack(spacing: 12) {
                Text(label).evidenceText(WorkflowText.label).foregroundStyle(WorkflowColor.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                WorkflowNumericField(label: label, text: text)
            }
        }
    }

    // MARK: - Progress / result phases (`Transaction states`)

    private var classifyingContent: some View {
        WorkflowSurface(tone: .rich) {
            WorkflowStateRow(lead: .spinner, title: "Checking what kind of evidence this is…", isLast: true, identifier: "productionEvidenceUpload.classifying")
                .padding(.vertical, -13)
        }
    }

    private var uploadingContent: some View {
        WorkflowSurface(tone: .rich) {
            WorkflowStateRow(
                lead: .spinner,
                title: stagedTransferCopy ?? (transferProgress < 1 ? "Transferring… \(Int(transferProgress * 100))%" : "Transfer complete. Waiting for durable acceptance…"),
                progress: transferProgress,
                isLast: true,
                identifier: "productionEvidenceUpload.uploading"
            )
            .padding(.vertical, -13)
        }
    }

    private var processingContent: some View {
        WorkflowSurface(tone: .rich) {
            WorkflowStateRow(lead: .spinner, title: "Reading what you uploaded…", isLast: true, identifier: "productionEvidenceUpload.processing")
                .padding(.vertical, -13)
        }
    }

    private func acceptedContent(_ message: String) -> some View {
        WorkflowSurface(tone: .rich) {
            WorkflowStateRow(lead: .icon(.ok), title: "Evidence received", copy: message, isLast: true, identifier: "productionEvidenceUpload.accepted") {
                WorkflowActions {
                    ForEach(Self.automaticScenarios) { scenario in
                        if let reviewId = readyReviews[scenario] {
                            WorkflowButton(title: "Review \(scenario.label)", identifier: "productionEvidenceUpload.review.\(scenario.rawValue)") {
                                onNavigate(.evidenceReview(reviewId: reviewId))
                            }
                        }
                    }
                    WorkflowButton(title: "Return to Log", identifier: "productionEvidenceUpload.returnToLog") { onReturnToLog(); dismiss() }
                }
            }
            .padding(.vertical, -13)
        }
    }

    private var confirmedContent: some View {
        WorkflowSurface(tone: .rich) {
            WorkflowStateRow(lead: .icon(.ok), title: "Evidence saved", isLast: true, identifier: "productionEvidenceUpload.confirmed") {
                WorkflowActions {
                    WorkflowButton(title: "Return to Log", identifier: "productionEvidenceUpload.returnToLog") { onReturnToLog(); dismiss() }
                }
            }
            .padding(.vertical, -13)
        }
    }

    @ViewBuilder
    private func failedContent(_ message: String) -> some View {
        if fixedScenario == .dexa {
            // DEXA Scan: the Server's validation message as a red note, then
            // Try Again back to picking.
            WorkflowNote(tone: .red) {
                Text(message).evidenceText(WorkflowText.h2).foregroundStyle(WorkflowColor.text).fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityIdentifier("productionEvidenceUpload.failed")
            WorkflowPrimaryButton(title: "Try Again", identifier: "productionEvidenceUpload.tryAgain") { phase = .picking }
        } else {
            WorkflowSurface(tone: .rich) {
                WorkflowStateRow(lead: .icon(.error), title: message, isLast: true, identifier: "productionEvidenceUpload.failed") {
                    WorkflowActions {
                        if let plan = pendingStagedPlan, plan.rejectedArtifacts.isEmpty {
                            // The staged set is still durable on this device and the
                            // Server already holds every acknowledged photo; resuming
                            // sends only what is missing.
                            WorkflowButton(title: "Resume upload", identifier: "productionEvidenceUpload.resumeStaged") { Task { await resumeStagedPhotos() } }
                        }
                        WorkflowButton(title: "Try Again", identifier: "productionEvidenceUpload.tryAgain") { phase = .picking }
                    }
                }
                .padding(.vertical, -13)
            }
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
        if attachmentScenarios.count == attachments.count, unresolvedAttachmentIDs.isEmpty {
            await submitAutomaticGroups()
            return
        }
        phase = .classifying
        var draft = EvidenceIntakeDraft.fresh(now: effectiveDate)
        draft.attachments = attachments
        draft = await EvidenceLocalInterpretation.prepare(draft)
        attachments = draft.attachments
        var resolved: [String: Scenario] = [:]
        var unresolved = Set<String>()
        for attachment in draft.attachments {
            let matches = EvidenceSandboxRouter.detectedCategories(for: attachment)
                .compactMap(Self.scenario(for:))
            if matches.count == 1, let match = matches.first {
                resolved[attachment.id] = match
            } else {
                unresolved.insert(attachment.id)
                if matches.count > 1 {
                    print("EvidenceClassification: ambiguous attachment=\(attachment.id) categories=\(matches.map(\.rawValue).sorted())")
                }
            }
        }
        attachmentScenarios = resolved
        unresolvedAttachmentIDs = unresolved
        automaticClassificationUnresolved = !unresolved.isEmpty
        let counts = Dictionary(grouping: resolved.values, by: { $0 }).mapValues(\.count)
        classificationNote = unresolved.isEmpty
            ? "Grouped: \(Self.groupSummary(counts))."
            : "Choose a type only for the \(unresolved.count) attachment\(unresolved.count == 1 ? "" : "s") that could not be classified unambiguously. Other attachments keep their detected types."
        guard unresolved.isEmpty else {
            phase = .picking
            return
        }
        await submitAutomaticGroups()
    }

    private func submitAutomaticGroups() async {
        let grouped = Dictionary(grouping: attachments) { attachmentScenarios[$0.id] }
        guard !grouped.keys.contains(nil), grouped.count > 0 else {
            automaticClassificationUnresolved = true
            unresolvedAttachmentIDs.formUnion(attachments.filter { attachmentScenarios[$0.id] == nil }.map(\.id))
            phase = .picking
            return
        }
        phase = .uploading
        transferProgress = 0
        groupedTransferProgress = [:]
        let localDate = Self.localDateKey.string(from: effectiveDate)
        let startedAt = Date()
        let pipeline = environment.evidenceIntakePipeline
        let groupCount = grouped.count
        do {
            let intakes = try await withThrowingTaskGroup(of: (Scenario, ProductionEvidenceIntakeStatus).self) { group in
                for (scenarioOptional, groupAttachments) in grouped {
                    guard let scenario = scenarioOptional else { continue }
                    let files = Self.files(from: groupAttachments, scenario: scenario)
                    group.addTask {
                        let intake = try await pipeline.submitIntake(
                            scope: "automatic-\(scenario.rawValue)-intake.\(localDate)",
                            effectiveDate: localDate,
                            expectedEvidenceType: scenario.expectedEvidenceType,
                            clientExtractedText: Self.activityExtractedText(
                                from: groupAttachments, scenario: scenario
                            ),
                            files: files,
                            onUploadProgress: { progress in
                                Task { @MainActor in
                                    groupedTransferProgress[scenario] = progress
                                    transferProgress = groupedTransferProgress.values.reduce(0, +) / Double(groupCount)
                                }
                            }
                        )
                        return (scenario, intake)
                    }
                }
                var results: [(Scenario, ProductionEvidenceIntakeStatus)] = []
                for try await result in group { results.append(result) }
                return results
            }
            acceptanceSeconds = Date().timeIntervalSince(startedAt)
            await followUpOnAcceptedIntakes(intakes, effectiveDate: localDate)
        } catch {
            phase = .failed(Self.errorMessage(for: error))
        }
    }

    /// Submit and return control to the Founder immediately once durable
    /// acceptance is known — no long wait for interpretation or canonical
    /// commit, which continue entirely server-side either way. On top of
    /// that: a brief, tightly-bounded look to see whether interpretation
    /// already finished (it normally does, within a couple of seconds).
    /// When it has, skip the "check Log later" detour and go straight to
    /// the exact Evidence Review — that's the whole point of uploading
    /// through this flow rather than depositing a file somewhere. When it
    /// hasn't, this falls back to exactly the prior behavior; nothing here
    /// waits longer than `fastFollowUpMaxWait` for that answer.
    private func submitIntake(scenario: Scenario) async {
        if scenario == .progressPhotos {
            await submitStagedPhotos()
            return
        }
        phase = .uploading
        transferProgress = 0
        let localDate = Self.localDateKey.string(from: effectiveDate)
        if scenario == .activity {
            var prepared: [SandboxAttachment] = []
            prepared.reserveCapacity(attachments.count)
            for attachment in attachments {
                prepared.append(await EvidenceLocalInterpretation.prepare(attachment))
            }
            attachments = prepared
        }
        let files = Self.files(from: attachments, scenario: scenario)
        let startedAt = Date()
        do {
            let intake = try await environment.evidenceIntakePipeline.submitIntake(
                scope: "\(scenario.rawValue)-intake.\(localDate)",
                effectiveDate: localDate,
                expectedEvidenceType: scenario.expectedEvidenceType,
                clientExtractedText: Self.activityExtractedText(
                    from: attachments, scenario: scenario
                ),
                photoIdentitiesJSON: scenario == .progressPhotos ? try Self.photoIdentitiesJSON(photoIdentities) : nil,
                photoSessionTimeOfDay: scenario == .progressPhotos ? photoSession.timeOfDay?.rawValue : nil,
                photoSessionFasted: scenario == .progressPhotos ? photoSession.fasted : nil,
                photoSessionPostWorkout: scenario == .progressPhotos ? photoSession.postWorkout : nil,
                photoSessionPump: scenario == .progressPhotos ? photoSession.pump : nil,
                originalUnedited: scenario == .progressPhotos ? photoSession.originalUnedited : nil,
                files: files,
                onUploadProgress: { progress in
                    Task { @MainActor in transferProgress = progress }
                }
            )
            acceptanceSeconds = Date().timeIntervalSince(startedAt)
            await followUpOnAcceptedIntakes([(scenario, intake)], effectiveDate: localDate)
        } catch {
            phase = .failed(Self.errorMessage(for: error))
        }
    }

    /// Automatic and explicit uploads share one publication follow-up.
    /// Mixed groups are checked concurrently, so a slow group cannot hide
    /// another group's ready review. Only genuinely unresolved groups get
    /// the existing running-app notification fallback; never resubmit here.
    private func followUpOnAcceptedIntakes(
        _ intakes: [(Scenario, ProductionEvidenceIntakeStatus)], effectiveDate: String
    ) async {
        phase = .processing
        readyReviews = [:]
        var failedScenarios = Set<Scenario>()
        let pipeline = environment.evidenceIntakePipeline
        await withTaskGroup(of: (Scenario, String?, Bool).self) { group in
            for (scenario, intake) in intakes {
                group.addTask {
                    do {
                        let reviewId = try await pipeline.readyReview(
                            for: intake, pollInterval: Self.fastFollowUpPollInterval, maxPolls: Self.fastFollowUpMaxPolls
                        )
                        return (scenario, reviewId, false)
                    } catch ProductionEvidenceIntakePipeline.Error.interpretationFailed {
                        return (scenario, nil, true)
                    } catch {
                        return (scenario, nil, false)
                    }
                }
            }
            for await (scenario, reviewId, failed) in group {
                if let reviewId { readyReviews[scenario] = reviewId }
                if failed { failedScenarios.insert(scenario) }
            }
        }
        if intakes.count == 1, let reviewId = readyReviews.values.first {
            onNavigate(.evidenceReview(reviewId: reviewId))
            return
        }
        let unresolved = intakes.filter { readyReviews[$0.0] == nil && !failedScenarios.contains($0.0) }
        phase = .accepted(!failedScenarios.isEmpty
            ? "Your files were received, but some evidence could not be read. Open Log to check its status before uploading again."
            : unresolved.isEmpty
            ? "Your evidence is ready to review."
            : "You can leave. We’ll notify you when your evidence is ready to review.")
        for (scenario, intake) in unresolved {
            EvidenceReviewReadyNotifier.beginObservation(
                pipeline: pipeline, reviewAPI: environment.evidenceReviewAPI,
                intakeId: intake.intakeId, domainLabel: scenario.label,
                effectiveDate: effectiveDate, environment: environment
            )
        }
    }

    /// A couple of seconds, matching the Founder's expectation that a
    /// screenshot upload "normally" resolves in about that time. Anything
    /// slower falls back to the async "check Log later" path rather than
    /// holding this screen open indefinitely.
    private static let fastFollowUpPollInterval: Duration = .seconds(1)
    private static let fastFollowUpMaxPolls = 3

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
            case .training, .dexa, .progressPhotos:
                throw ProductionNativeError.invalidResponse
            }
            // Confirmation is durable; the widget refreshes independently.
            let relay = environment.homeWidgetRefreshRelay
            Task { await relay.request() }
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

    private static let automaticScenarios: [Scenario] = [.nutrition, .activity, .training, .dexa]

    private static func scenario(for category: EvidenceCategory) -> Scenario? {
        switch category {
        case .nutrition: .nutrition
        case .activity: .activity
        case .training: .training
        case .dexa: .dexa
        default: nil
        }
    }

    /// Aggregate multipart files for DEXA and screenshot intakes. Progress
    /// Photos no longer pass through here: they use the staged transport
    /// (`submitStagedPhotos`), which preserves every original byte for byte.
    private static func files(from attachments: [SandboxAttachment], scenario: Scenario) -> [(filename: String, contentType: String, data: Data)] {
        attachments.compactMap { attachment in
            guard let data = attachment.data else { return nil }
            return (attachment.displayName, attachment.contentType ?? (scenario == .dexa ? "application/pdf" : "image/jpeg"), data)
        }
    }

    // MARK: - Staged Progress Photos transport

    /// Build 44: the full-resolution set travels one bounded request per
    /// photo through a durable staged intake instead of one aggregate
    /// multipart body (Build 43's real upload stopped at the aggregate
    /// request ceiling). Originals are transferred verbatim; each HEIC/HEIF
    /// original adds a bounded JPEG rendition for review and analysis. The
    /// follow-up after durable acceptance is the same Server-driven Evidence
    /// Review transition every intake uses; nothing here completes the
    /// priority or writes canonical state.
    private func submitStagedPhotos() async {
        phase = .uploading
        transferProgress = 0
        stagedProgress = nil
        let localDate = Self.localDateKey.string(from: effectiveDate)
        let coordinator = environment.stagedPhotoIntakeCoordinator
        let startedAt = Date()
        do {
            let plan = try await coordinator.prepare(
                scope: "progressPhotos-intake.\(localDate)",
                effectiveDate: localDate,
                attachments: attachments,
                photoIdentitiesJSON: try Self.photoIdentitiesJSON(photoIdentities),
                session: photoSession
            )
            pendingStagedPlan = plan
            let intake = try await coordinator.submit(plan: plan) { progress in
                Task { @MainActor in
                    stagedProgress = progress
                    transferProgress = progress.fraction
                }
            }
            pendingStagedPlan = nil
            acceptanceSeconds = Date().timeIntervalSince(startedAt)
            await followUpOnAcceptedIntakes([(.progressPhotos, intake)], effectiveDate: localDate)
        } catch {
            pendingStagedPlan = await coordinator.pendingPlan()
            phase = .failed(Self.errorMessage(for: error))
        }
    }

    private func resumeStagedPhotos() async {
        guard let plan = pendingStagedPlan else { return }
        phase = .uploading
        transferProgress = 0
        stagedProgress = nil
        let coordinator = environment.stagedPhotoIntakeCoordinator
        let startedAt = Date()
        do {
            let intake = try await coordinator.resume { progress in
                Task { @MainActor in
                    stagedProgress = progress
                    transferProgress = progress.fraction
                }
            }
            pendingStagedPlan = nil
            acceptanceSeconds = Date().timeIntervalSince(startedAt)
            await followUpOnAcceptedIntakes([(.progressPhotos, intake)], effectiveDate: plan.effectiveDate)
        } catch {
            pendingStagedPlan = await coordinator.pendingPlan()
            phase = .failed(Self.errorMessage(for: error))
        }
    }

    private func discardStagedPhotos() async {
        await environment.stagedPhotoIntakeCoordinator.discardPending()
        pendingStagedPlan = nil
    }

    private func refreshPendingStagedPlan() async {
        guard effectiveScenario == .progressPhotos, environment.nativeAuthority == .founderProduction else { return }
        pendingStagedPlan = await environment.stagedPhotoIntakeCoordinator.pendingPlan()
    }

    private var stagedTransferCopy: String? {
        guard let progress = stagedProgress else { return nil }
        if progress.mediaComplete { return "All \(progress.totalOriginals) photos received. Waiting for durable acceptance…" }
        let current = min(progress.transferredOriginals + 1, max(progress.totalOriginals, 1))
        return "Uploading photo \(current) of \(progress.totalOriginals)… \(Int(progress.fraction * 100))%"
    }

    /// A durable staged plan left by a lost response, suspension or
    /// relaunch: resume the missing originals, or discard. A rejected plan
    /// exposes Discard only.
    @ViewBuilder
    private var pendingStagedPhotosCard: some View {
        if let plan = pendingStagedPlan {
            if plan.rejectedArtifacts.isEmpty {
                WorkflowSurface(tone: .rich) {
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(alignment: .top, spacing: 9) {
                            WorkflowFileIcon(glyph: "↑")
                            VStack(alignment: .leading, spacing: 0) {
                                Text("Photo upload waiting").evidenceText(WorkflowText.h2).foregroundStyle(WorkflowColor.text)
                                Text("\(plan.storedOriginalCount) of \(plan.originals.count) photos from \(plan.effectiveDate) reached PhysiqueOS. Resume to send the rest, or discard the set and choose again.")
                                    .evidenceText(WorkflowText.small)
                                    .foregroundStyle(WorkflowColor.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .padding(.bottom, 5)
                        WorkflowProgress(fraction: plan.originals.isEmpty ? 0 : Double(plan.storedOriginalCount) / Double(plan.originals.count))
                        HStack(spacing: 9) {
                            WorkflowButton(title: "Resume upload", identifier: "productionEvidenceUpload.resumeStaged") { Task { await resumeStagedPhotos() } }
                            WorkflowButton(title: "Discard", destructive: true, identifier: "productionEvidenceUpload.discardStaged") { Task { await discardStagedPhotos() } }
                        }
                        .padding(.top, 4)
                    }
                }
                WorkflowNote(tone: .amber) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Durable staged upload").evidenceText(WorkflowText.label).foregroundStyle(WorkflowColor.text)
                        Text("Resume sends only the missing originals. Discard removes the staged set from this iPhone.")
                            .evidenceText(WorkflowText.small)
                            .foregroundStyle(WorkflowColor.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            } else {
                WorkflowSurface(tone: .rich) {
                    WorkflowStateRow(
                        lead: .icon(.error),
                        title: "Photo set not accepted",
                        copy: "PhysiqueOS did not accept this photo set (\(plan.lastErrorCode ?? "rejected")). Discard it and choose the photos again.",
                        isLast: true,
                        identifier: "productionEvidenceUpload.stagedRejected"
                    ) {
                        WorkflowActions {
                            WorkflowButton(title: "Discard", destructive: true, identifier: "productionEvidenceUpload.discardStaged") { Task { await discardStagedPhotos() } }
                        }
                    }
                    .padding(.vertical, -13)
                }
            }
        }
    }

    private func syncPhotoIdentities() {
        let existing = Dictionary(uniqueKeysWithValues: photoIdentities.map { ($0.attachmentId, $0) })
        photoIdentities = EvidenceLocalInterpretation.defaultPhotoIdentities(for: attachments).map {
            existing[$0.attachmentId] ?? $0
        }
    }

    private func updatePhoto(_ id: String, mutation: (inout ProgressPhotoIdentityDraft) -> Void) {
        guard let index = photoIdentities.firstIndex(where: { $0.id == id }) else { return }
        mutation(&photoIdentities[index])
    }

    private func applyPoseChange(_ identityId: String, _ change: ProgressPhotoPoseContract.Change) {
        guard let index = photoIdentities.firstIndex(where: { $0.id == identityId }) else { return }
        let adjustment = ProgressPhotoPoseContract.applying(change, to: photoIdentities[index])
        photoIdentities[index] = adjustment.draft
        poseNotices[identityId] = adjustment.notice
    }

    private func poseBinding<Value>(
        _ identity: ProgressPhotoIdentityDraft,
        _ keyPath: KeyPath<ProgressPhotoIdentityDraft, Value>,
        _ change: @escaping (Value) -> ProgressPhotoPoseContract.Change
    ) -> Binding<Value> {
        Binding(
            get: { photoIdentities.first(where: { $0.id == identity.id })?[keyPath: keyPath] ?? identity[keyPath: keyPath] },
            set: { applyPoseChange(identity.id, change($0)) }
        )
    }

    private func photoBinding<Value>(_ identity: ProgressPhotoIdentityDraft, _ keyPath: WritableKeyPath<ProgressPhotoIdentityDraft, Value>) -> Binding<Value> {
        Binding(
            get: { photoIdentities.first(where: { $0.id == identity.id })?[keyPath: keyPath] ?? identity[keyPath: keyPath] },
            set: { value in updatePhoto(identity.id) { $0[keyPath: keyPath] = value; $0.confirmed = false } }
        )
    }

    /// Pose identity control: a labelled `.select` field whose menu offers
    /// only the contract's selectable values.
    private func photoPicker<Value: Hashable & Identifiable & EvidenceLabeledChoice>(
        _ label: String, selection: Binding<Value>, values: [Value]
    ) -> some View {
        WorkflowSelectField(label: label, value: selection.wrappedValue.label) {
            ForEach(values) { value in
                Button(value.label) { selection.wrappedValue = value }
            }
        }
        .accessibilityIdentifier("productionEvidenceUpload.pose.\(label)")
    }

    /// Session condition: the label stays visible beside its value, so all
    /// four conditions are readable without opening a single menu.
    private func sessionConditionMenu(_ field: ProgressPhotoConditionField) -> some View {
        let value = photoSession.selectedLabel(for: field)
        return WorkflowSelectField(label: field.label, value: value) {
            ForEach(field.options, id: \.label) { option in
                Button(option.label) { photoSession.apply(option, to: field) }
            }
        }
        .accessibilityIdentifier("productionEvidenceUpload.condition.\(field.label)")
    }

    private struct PhotoIdentityPayload: Encodable {
        var orientation: String
        var contractionState: String
        var poseVariant: String
        var customLabel: String?
        var goalValidationRole: String
        var tags: [String]
        var identityStatus = "confirmed"
        var userConfirmedIdentity = true
    }

    /// Goal role is no longer a Founder-facing control (Build 8 removed
    /// Goal relationship from Progress Photos after physical-device
    /// feedback), but the intake contract still carries the field, so every
    /// identity keeps the established `supporting` default. Internal rather
    /// than private so that default is covered by a regression test.
    ///
    /// Every identity must be a canonical pose, and is serialized in the
    /// contract's own spelling, so a combination the Server refuses (or could
    /// never confirm) can never be sent, whatever the controls allowed.
    static func photoIdentitiesJSON(_ identities: [ProgressPhotoIdentityDraft]) throws -> String {
        let payload = try identities.enumerated().map { index, identity in
            guard let pose = identity.canonicalPose,
                  let orientation = pose.orientation.contractValue,
                  let contraction = pose.contraction.contractValue else {
                throw ProgressPhotoIdentityError.nonCanonicalPose(photo: index + 1)
            }
            let customLabel = identity.customLabel.trimmingCharacters(in: .whitespacesAndNewlines)
            return PhotoIdentityPayload(
                orientation: orientation,
                contractionState: contraction,
                poseVariant: pose.variant.contractValue,
                customLabel: customLabel.isEmpty ? nil : customLabel,
                goalValidationRole: identity.goalRole.rawValue,
                tags: identity.tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
            )
        }
        return String(decoding: try JSONEncoder().encode(payload), as: UTF8.self)
    }

    /// Apple Vision provides a no-network, deterministic first pass for the
    /// explicit one-screen Activity path. The server remains authoritative:
    /// it accepts this text only when its strict Apple Activity parser can
    /// prove the ring metrics; otherwise the existing model interpreter is
    /// used unchanged. No image bytes or OCR text enter diagnostics.
    private static func activityExtractedText(
        from attachments: [SandboxAttachment], scenario: Scenario
    ) -> String? {
        guard scenario == .activity else { return nil }
        let value = attachments.compactMap(\.extractedText)
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n--- attachment ---\n\n")
        return value.isEmpty ? nil : value
    }

    private static func groupSummary(_ counts: [Scenario: Int]) -> String {
        automaticScenarios.compactMap { scenario in
            counts[scenario].map { "\(scenario.label) \($0)" }
        }.joined(separator: " · ")
    }

    private static func errorMessage(for error: Error) -> String {
        if let stagedError = error as? StagedPhotoIntakeError { return stagedError.errorDescription ?? "This photo set could not be uploaded." }
        if let identityError = error as? ProgressPhotoIdentityError { return identityError.errorDescription ?? "A photo pose is not supported." }
        if error is StagedPhotoIntakeStoreError { return "The staged photos on this iPhone could not be read. Discard the set and choose the photos again." }
        if let productionError = error as? ProductionNativeError { return productionError.errorDescription ?? "This evidence could not be uploaded." }
        if let dailyError = error as? DailyEvidenceWriteError { return dailyError.errorDescription ?? "This evidence could not be saved." }
        return "This evidence could not be uploaded."
    }
}

#if DEBUG
/// Review-only seeds for the locked Evidence Intake parity captures
/// (`-physiqueos.evidence-review.intake <state>`). They set presentation
/// state only; nothing is submitted. Absent from Release.
extension ProductionEvidenceUploadView {
    static var reviewIntakeState: String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let flag = arguments.firstIndex(of: "-physiqueos.evidence-review.intake"),
              arguments.indices.contains(flag + 1) else { return nil }
        return arguments[flag + 1]
    }

    static var reviewProductionIntake: Bool {
        ProcessInfo.processInfo.arguments.contains("-physiqueos.evidence-review.production-intake")
    }

    private static func reviewFile(_ name: String, bytes: Int, pdf: Bool = false) -> SandboxAttachment {
        SandboxAttachment(id: "review-\(name)", displayName: name, source: pdf ? .files : .photos, contentType: pdf ? "application/pdf" : "image/png", data: Data(count: bytes))
    }

    fileprivate func applyReviewSeed() {
        guard let state = Self.reviewIntakeState else { return }
        var components = DateComponents(); components.year = 2026; components.month = 9; components.day = 23
        effectiveDate = Calendar.current.date(from: components) ?? effectiveDate
        switch state {
        case "auto-review":
            attachments = [
                Self.reviewFile("MyFitnessPal-Sep-23.PNG", bytes: 1_400_000),
                Self.reviewFile("Fitness-Rings-Sep-23.PNG", bytes: 892_000),
                Self.reviewFile("IMG_4921.PNG", bytes: 1_100_000),
            ]
            DispatchQueue.main.async {
                attachmentScenarios = ["review-MyFitnessPal-Sep-23.PNG": .nutrition, "review-Fitness-Rings-Sep-23.PNG": .activity]
                unresolvedAttachmentIDs = ["review-IMG_4921.PNG"]
                automaticClassificationUnresolved = true
                classificationNote = "Grouped: Nutrition 1 · Activity 1."
            }
        case "training", "weight", "other":
            domainChoice = state == "training" ? .training : state == "weight" ? .weight : .other
            resolvedScenario = nil
        case "nutrition-manual":
            domainChoice = .nutrition; resolvedScenario = .nutrition; captureMode = .manual
            caloriesText = "2300"; proteinText = "198"; carbsText = "244"; fatText = "73"; fiberText = "31"
        case "activity-manual":
            domainChoice = .activity; resolvedScenario = .activity; captureMode = .manual
            activeCaloriesText = "650"; totalCaloriesText = "2740"; exerciseMinutesText = "45"; standHoursText = "12"; moveGoalText = "650"
        case "classifying": phase = .classifying
        case "uploading": transferProgress = 0.64; phase = .uploading
        case "processing": phase = .processing
        case "accepted":
            readyReviews = [.nutrition: "review-nutrition"]
            phase = .accepted("Your evidence is ready to review.")
        case "confirmed": phase = .confirmed
        case "failed": phase = .failed("This evidence could not be uploaded.")
        case "dexa-selected":
            attachments = [Self.reviewFile("BodySpec_DXA_2026-09-23.pdf", bytes: 2_800_000, pdf: true)]
        case "dexa-error": phase = .failed("DEXA intake requires exactly one BodySpec PDF.")
        case "photos-review", "photos-ready":
            let ready = state == "photos-ready"
            attachments = [SandboxAttachment(id: "review-photo-1", displayName: "synthetic:back-relaxed:2026-09-23", source: .photos, contentType: "image/png", data: nil)]
            DispatchQueue.main.async {
                guard var identity = photoIdentities.first else { return }
                identity.orientation = .rear
                identity.contraction = ready ? .relaxed : .flexed
                identity.poseVariant = ready ? .standard : .doubleBiceps
                identity.confirmed = ready
                photoIdentities = [identity]
                if !ready { poseNotices[identity.id] = "Double Biceps uses Flexed." }
                if ready {
                    photoSession.timeOfDay = .afternoon
                    photoSession.fasted = false
                    photoSession.postWorkout = false
                    photoSession.pump = false
                    photoSession.originalUnedited = true
                }
            }
        case "photos-resume", "photos-rejected":
            let rejected = state == "photos-rejected"
            func artifact(_ ordinal: Int, stored: Bool) -> StagedPhotoArtifactPlan {
                StagedPhotoArtifactPlan(artifactId: "artifact_review_\(ordinal)", ordinal: ordinal, role: .original, derivativeOf: nil, fileName: "IMG_\(ordinal).HEIC", mimeType: "image/heic", byteLength: 4_000_000, sha256: "review", sourceAttachmentId: "review-\(ordinal)", state: rejected && ordinal == 1 ? .rejected(code: "media_rejected") : stored ? .stored(at: Date()) : .pending)
            }
            pendingStagedPlan = StagedPhotoIntakePlan(
                submissionIdentity: "review", scope: "review", signature: "review", effectiveDate: "2026-09-23",
                session: StagedPhotoSessionDeclaration(originalUnedited: true, timeOfDay: "afternoon", fasted: nil, postWorkout: nil, pump: nil, photoIdentitiesJSON: "[]"),
                artifacts: [artifact(1, stored: true), artifact(2, stored: false), artifact(3, stored: false)],
                intakeId: nil, replacementForSubmissionIdentity: nil, createdAt: Date(),
                lastErrorCode: rejected ? "media_rejected" : nil
            )
        case "photos-uploading", "photos-received":
            let received = state == "photos-received"
            stagedProgress = StagedPhotoIntakeProgress(transferredArtifacts: received ? 6 : 2, totalArtifacts: 6, transferredOriginals: received ? 3 : 1, totalOriginals: 3, currentArtifactFraction: received ? 0 : 0.82, mediaComplete: received)
            transferProgress = received ? 1 : 0.47
            phase = .uploading
        default:
            break
        }
    }
}
#endif
