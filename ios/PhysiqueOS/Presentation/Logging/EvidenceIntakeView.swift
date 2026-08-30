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
    var initialScenario: EvidenceFixtureScenario? = nil
    var onNavigate: (AppDestination) -> Void = { _ in }

    private var store: LoggingSandboxStore { environment.loggingSandboxStore }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                editing
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
        .confirmationDialog("Discard this upload?", isPresented: $showingDiscard, titleVisibility: .visible) {
            Button("Discard Upload", role: .destructive) {
                store.resetEvidenceDraft()
                dismiss()
            }
            Button("Keep Editing", role: .cancel) {}
        } message: {
            Text("Selected files, date, and details will be removed.")
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
            Text("UPLOAD")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text("What happened?")
                .physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text("Add one file, several files, or just a note.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
    }

    private var editing: some View {
        VStack(alignment: .leading, spacing: 14) {
            CardContainer {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Upload files")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    Text("Choose screenshots, photos, or PDFs. You can select more than one.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    HStack(spacing: 10) {
                        sourceButton("Choose Photos", icon: "photo.on.rectangle") { isPhotosPickerPresented = true }
                        sourceButton("Choose Files", icon: "folder") { isFilePickerPresented = true }
                    }
                    if store.evidenceDraft.attachments.isEmpty {
                        Text("No files selected")
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
                            Text("Add or reselect files")
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
                    Text("Use the date the workout, meal, scan, or activity happened.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    DateField(date: draftDate, maximumDate: Date(), label: "Evidence date")
                }
            }

            CardContainer {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Add details")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    Text("Add any details that help PhysiqueOS understand what you’re logging.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    TextEditor(text: draftDetails)
                        .frame(minHeight: 96)
                        .padding(8)
                        .scrollContentBackground(.hidden)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }

            if let errorMessage { errorBanner(errorMessage) }
            PrimaryActionButton(title: "Submit evidence", tone: .dark, isEnabled: store.evidenceDraft.hasContent) {
                submit()
            }
            .accessibilityIdentifier("evidenceIntake.continue")
        }
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

    private func submit() {
        switch store.submitEvidence() {
        case .failure(let error): errorMessage = error.message
        case .success:
            switch store.finishInterpretation() {
            case .failure(let error): errorMessage = error.message
            case .success(let reviewId):
                errorMessage = nil
                if let reviewId { onNavigate(.localEvidenceReview(reviewId: reviewId)) }
            }
        }
    }

    private var draftDate: Binding<Date> {
        .init(get: { store.evidenceDraft.occurrenceDate }, set: { store.evidenceDraft.occurrenceDate = $0 })
    }

    private var draftDetails: Binding<String> {
        .init(get: { store.evidenceDraft.details }, set: { store.evidenceDraft.details = $0 })
    }
}
