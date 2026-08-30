import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct EvidenceIntakeView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var isPhotosPickerPresented = false
    @State private var isFilePickerPresented = false
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var errorMessage: String?
    @State private var showingDiscard = false
    @State private var ambiguityChoice: EvidenceCategory = .training
    var initialScenario: EvidenceFixtureScenario? = nil

    private var store: LoggingSandboxStore { environment.loggingSandboxStore }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                stateContent
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(PhysiqueOSTheme.background)
        .navigationTitle("Add Evidence")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Discard", role: .destructive) { showingDiscard = true }
                    .disabled(!store.evidenceDraft.hasContent)
            }
        }
        .confirmationDialog("Discard this local evidence draft?", isPresented: $showingDiscard, titleVisibility: .visible) {
            Button("Discard Draft", role: .destructive) {
                store.resetEvidenceDraft()
                dismiss()
            }
            Button("Keep Editing", role: .cancel) {}
        } message: {
            Text("Selected asset names, date, and details will be removed from this device-only session.")
        }
        .photosPicker(isPresented: $isPhotosPickerPresented, selection: $photoItems, matching: .images)
        .onChange(of: photoItems) {
            let start = store.evidenceDraft.attachments.filter { $0.source == .photos }.count
            store.addAttachments(photoItems.indices.map { index in
                .init(id: UUID().uuidString, displayName: "Photo \(start + index + 1)", source: .photos)
            })
            photoItems = []
        }
        .fileImporter(isPresented: $isFilePickerPresented, allowedContentTypes: [.image, .pdf, .plainText], allowsMultipleSelection: true) { result in
            if case .success(let urls) = result {
                store.addAttachments(urls.map {
                    .init(id: UUID().uuidString, displayName: $0.lastPathComponent, source: .files)
                })
            }
        }
        .onAppear {
            guard let initialScenario,
                  store.interpretationState == .editing,
                  !store.evidenceDraft.hasContent else { return }
            store.evidenceDraft.scenario = initialScenario
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("EVIDENCE INTAKE")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text("Add what happened")
                .physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text("Photos and Files are equal sources. Assets stay staged locally until you review or discard them.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
    }

    @ViewBuilder
    private var stateContent: some View {
        switch store.interpretationState {
        case .editing:
            editing
        case .pending:
            messageState(icon: "waveform.path.ecg", title: "Interpretation pending", body: "The assets are retained locally. Continue to run the selected deterministic fixture—no production AI or worker is being called.") {
                handle(store.finishInterpretation())
            }
        case .ambiguous:
            ambiguous
        case .needsMoreInformation:
            needsInformation
        case .unsupported:
            unsupported
        case .failed:
            messageState(icon: "exclamationmark.triangle.fill", title: "Local interpretation failed", body: "Your draft and selected assets are intact. Retry without reselecting anything.") {
                store.retryInterpretation()
            }
        case .ready(let reviewId):
            ready(reviewId: reviewId)
        }
    }

    private var editing: some View {
        VStack(alignment: .leading, spacing: 14) {
            CardContainer {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Sources")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    HStack(spacing: 10) {
                        sourceButton("Choose Photos", icon: "photo.on.rectangle") { isPhotosPickerPresented = true }
                        sourceButton("Choose Files", icon: "folder") { isFilePickerPresented = true }
                    }
                    if store.evidenceDraft.attachments.isEmpty {
                        Text("No assets selected. A typed note can also be submitted by itself.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    } else {
                        VStack(spacing: 8) {
                            ForEach(store.evidenceDraft.attachments) { attachment in
                                HStack(spacing: 10) {
                                    Image(systemName: attachment.source == .photos ? "photo" : "doc")
                                        .foregroundStyle(PhysiqueOSTheme.accent)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(attachment.displayName).lineLimit(1)
                                        Text(attachment.source.rawValue)
                                            .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                                    }
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    Spacer()
                                    Button { store.removeAttachment(id: attachment.id) } label: {
                                        Image(systemName: "xmark.circle.fill")
                                    }
                                    .accessibilityLabel("Remove \(attachment.displayName)")
                                }
                                .padding(10)
                                .background(PhysiqueOSTheme.surfaceMuted)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                        }
                        EvidenceSourceMenu { option in
                            switch option {
                            case .photos: isPhotosPickerPresented = true
                            case .files: isFilePickerPresented = true
                            }
                        } label: {
                            Text("Add or reselect assets")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.accent)
                        }
                    }
                }
            }

            CardContainer {
                VStack(alignment: .leading, spacing: 10) {
                    Text("When did this happen?")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    Text("Use the workout, meal, scan, measurement, or photo capture date—not the upload date.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    DateField(date: draftDate, maximumDate: Date(), label: "Evidence occurrence date")
                }
            }

            CardContainer {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Details / notes")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    TextEditor(text: draftDetails)
                        .frame(minHeight: 96)
                        .padding(8)
                        .scrollContentBackground(.hidden)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    Text("Typed details are retained as source evidence and remain visible during review.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }

            CardContainer(background: PhysiqueOSTheme.surfaceAccent) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Sandbox interpretation case")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    Picker("Fixture case", selection: draftScenario) {
                        ForEach(EvidenceFixtureScenario.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.menu)
                    Text("This selector makes recognized, ambiguous, incomplete, unsupported, and failure states deterministic and testable. It does not represent AI confidence.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    Button {
                        store.addAttachments([
                            .init(id: UUID().uuidString, displayName: "progress-front.jpg", source: .photos),
                            .init(id: UUID().uuidString, displayName: "historical-report.pdf", source: .files),
                        ])
                    } label: {
                        Label("Stage sample photo + PDF", systemImage: "shippingbox.fill")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.accent)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("evidenceIntake.sampleBatch")
                }
            }

            if let errorMessage { errorBanner(errorMessage) }
            PrimaryActionButton(title: "Continue to interpretation", tone: .dark, isEnabled: store.evidenceDraft.hasContent) {
                handle(store.submitEvidence())
            }
            .accessibilityIdentifier("evidenceIntake.continue")
        }
    }

    private var ambiguous: some View {
        VStack(alignment: .leading, spacing: 14) {
            messageCard(icon: "questionmark.diamond.fill", title: "Classification is ambiguous", body: "The fixture cannot choose a category honestly. Your date, notes, and every asset are still attached.")
            CardContainer {
                VStack(alignment: .leading, spacing: 10) {
                    Text("What is this primarily about?")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    Picker("Evidence type", selection: $ambiguityChoice) {
                        ForEach(EvidenceCategory.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.menu)
                    PrimaryActionButton(title: "Use \(ambiguityChoice.title)") {
                        _ = store.resolveAmbiguity(as: ambiguityChoice)
                    }
                }
            }
            editAgainButton
        }
    }

    private var needsInformation: some View {
        VStack(alignment: .leading, spacing: 14) {
            messageCard(icon: "text.bubble.fill", title: "More information needed", body: "The source does not contain enough context to create a category-specific review. Add what the evidence represents.")
            CardContainer {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Missing context")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    TextEditor(text: clarification)
                        .frame(minHeight: 90)
                        .padding(8)
                        .scrollContentBackground(.hidden)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    if let errorMessage { errorBanner(errorMessage) }
                    PrimaryActionButton(title: "Continue with context") {
                        switch store.continueAfterClarification() {
                        case .success: errorMessage = nil
                        case .failure(let error): errorMessage = error.message
                        }
                    }
                }
            }
            editAgainButton
        }
    }

    private var unsupported: some View {
        VStack(alignment: .leading, spacing: 14) {
            messageCard(icon: "doc.questionmark.fill", title: "Source not recognized", body: "No supported evidence type or values were inferred. You can preserve the upload as generic evidence using only your source and description.")
            PrimaryActionButton(title: "Review as generic evidence") {
                _ = store.continueUnsupportedAsGeneric()
            }
            editAgainButton
        }
    }

    private func ready(reviewId: String) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            messageCard(icon: "checkmark.shield.fill", title: "Ready for Evidence Review", body: "A local interpreted fixture is ready. Nothing has been canonically saved.")
            NavigationLink(value: AppDestination.localEvidenceReview(reviewId: reviewId)) {
                Text("Review interpreted evidence")
                    .physiqueOSFont(PhysiqueOSTypography.primaryActionLabel)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(PhysiqueOSTheme.accent)
                    .clipShape(Capsule())
            }
            .accessibilityIdentifier("evidenceIntake.review")
            editAgainButton
        }
    }

    private func messageState(icon: String, title: String, body: String, action: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            messageCard(icon: icon, title: title, body: body)
            PrimaryActionButton(title: store.interpretationState == .failed ? "Retry" : "Continue fixture interpretation", action: action)
            editAgainButton
        }
    }

    private func messageCard(icon: String, title: String, body: String) -> some View {
        CardContainer(background: PhysiqueOSTheme.surfaceAccent) {
            VStack(alignment: .leading, spacing: 10) {
                Label(title, systemImage: icon)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(body)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private var editAgainButton: some View {
        Button("Back to draft") {
            store.retryInterpretation()
            errorMessage = nil
        }
        .frame(maxWidth: .infinity)
        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
        .foregroundStyle(PhysiqueOSTheme.accent)
    }

    private func sourceButton(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(PhysiqueOSTheme.surfaceMuted)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .foregroundStyle(PhysiqueOSTheme.accent)
    }

    private func errorBanner(_ text: String) -> some View {
        Text(text)
            .physiqueOSFont(PhysiqueOSTypography.calloutStrong)
            .foregroundStyle(PhysiqueOSTheme.destructive)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PhysiqueOSTheme.destructive.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func handle(_ result: Result<String?, LoggingSandboxError>) {
        switch result {
        case .success: errorMessage = nil
        case .failure(let error): errorMessage = error.message
        }
    }

    private var draftDate: Binding<Date> {
        .init(get: { store.evidenceDraft.occurrenceDate }, set: { store.evidenceDraft.occurrenceDate = $0; store.retryInterpretation() })
    }

    private var draftDetails: Binding<String> {
        .init(get: { store.evidenceDraft.details }, set: { store.evidenceDraft.details = $0; store.retryInterpretation() })
    }

    private var draftScenario: Binding<EvidenceFixtureScenario> {
        .init(get: { store.evidenceDraft.scenario }, set: { store.evidenceDraft.scenario = $0; store.retryInterpretation() })
    }

    private var clarification: Binding<String> {
        .init(get: { store.evidenceDraft.clarification }, set: { store.evidenceDraft.clarification = $0 })
    }
}
