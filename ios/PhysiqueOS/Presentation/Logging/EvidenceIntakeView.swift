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
    @State private var isPreparing = false
    @State private var isLoadingPhotos = false
    @State private var focusedNumericFieldID: String?
    @FocusState private var isDetailsFocused: Bool
    var initialScenario: EvidenceFixtureScenario? = nil
    var onNavigate: (AppDestination) -> Void = { _ in }

    private var store: LoggingSandboxStore { environment.loggingSandboxStore }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if isPreparing {
                    preparing
                } else {
                    editing
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .scrollDismissesKeyboard(.interactively)
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationTitle("Add Evidence")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Discard", role: .destructive) {
                    PhysiqueOSKeyboard.dismiss()
                    Task { @MainActor in showingDiscard = true }
                }
                    .foregroundStyle(PhysiqueOSTheme.destructive)
                    .disabled(!store.evidenceDraft.hasContent)
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") {
                    isDetailsFocused = false
                    focusedNumericFieldID = nil
                    PhysiqueOSKeyboard.dismiss()
                }
            }
        }
        .alert("Discard this upload?", isPresented: $showingDiscard) {
            Button("Cancel", role: .cancel) {}
            Button("Discard Upload", role: .destructive) {
                store.resetEvidenceDraft()
                dismiss()
            }
        } message: {
            Text("Selected files, date, and details will be removed.")
        }
        .photosPicker(isPresented: $isPhotosPickerPresented, selection: $photoItems, matching: .images)
        .onChange(of: photoItems) {
            guard !photoItems.isEmpty else { return }
            let items = photoItems
            photoItems = []
            isLoadingPhotos = true
            Task { @MainActor in
                let clock = ContinuousClock.now
                let start = store.evidenceDraft.attachments.filter { $0.source == .photos }.count
                let loaded = await EvidenceAttachmentLoader.photos(items, startingAt: start)
                store.addAttachments(loaded)
                store.recordAssetLoading(duration: elapsed(since: clock))
                reportLoadingFailures(in: loaded)
                isLoadingPhotos = false
            }
        }
        .fileImporter(isPresented: $isFilePickerPresented, allowedContentTypes: [.image, .pdf, .plainText], allowsMultipleSelection: true) { result in
            if case .success(let urls) = result {
                let clock = ContinuousClock.now
                let loaded = EvidenceAttachmentLoader.files(urls)
                store.addAttachments(loaded)
                store.recordAssetLoading(duration: elapsed(since: clock))
                reportLoadingFailures(in: loaded)
            }
        }
        .onAppear {
            guard let initialScenario,
                  store.interpretationState == .editing,
                  !store.evidenceDraft.hasContent else { return }
            store.setEvidenceScenario(initialScenario)
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

    private var preparing: some View {
        CardContainer {
            VStack(spacing: 14) {
                ProgressView().tint(PhysiqueOSTheme.accent)
                Text("Uploading your evidence…").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                Text("Keep this page open while your upload is prepared for review.")
                    .multilineTextAlignment(.center)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 12)
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
                    if isLoadingPhotos {
                        HStack(spacing: 8) {
                            ProgressView().tint(PhysiqueOSTheme.accent)
                            Text("Loading selected photos…")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
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
                                        Text(attachment.loadError ?? attachment.source.rawValue)
                                            .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                                            .foregroundStyle(attachment.loadError == nil ? PhysiqueOSTheme.textMuted : PhysiqueOSTheme.destructive)
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


            if store.evidenceDraft.scenario == .dexa { dexaConfirmation }
            if store.evidenceDraft.scenario == .progressPhotos { progressPhotoConfirmation }

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
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Evidence type").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        Text("Choose a type if it is not obvious from the files or details.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                    Spacer()
                    Picker("Evidence type", selection: draftScenario) {
                        ForEach(EvidenceFixtureScenario.allCases) { scenario in Text(scenario.title).tag(scenario) }
                    }
                    .labelsHidden()
                    .tint(PhysiqueOSTheme.accent)
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
                        .focused($isDetailsFocused)
                        .frame(minHeight: 96)
                        .padding(8)
                        .scrollContentBackground(.hidden)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }

            if let errorMessage { errorBanner(errorMessage) }
            PrimaryActionButton(title: "Submit evidence", tone: .dark, isEnabled: store.evidenceDraft.hasContent && !isLoadingPhotos) {
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
        .disabled(isLoadingPhotos)
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

    private var dexaConfirmation: some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                Text("Confirm extracted values").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                Text("Choose the raw BodySpec PDF, then review the scan values. Blank optional fields remain unknown.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    dexaField("Total Mass", id: "totalMass", keyPath: \.totalMass, unit: "lb")
                    dexaField("Body Fat", id: "bodyFat", keyPath: \.bodyFatPercentage, unit: "%")
                    dexaField("Fat Tissue", id: "fatMass", keyPath: \.fatMass, unit: "lb")
                    dexaField("Lean Tissue", id: "leanMass", keyPath: \.leanMass, unit: "lb")
                    dexaField("Bone Mineral", id: "boneMineral", keyPath: \.boneMineralContent, unit: "lb")
                    dexaField("RMR", id: "rmr", keyPath: \.restingMetabolicRate, unit: "kcal")
                    dexaField("VAT Mass", id: "vatMass", keyPath: \.vatMass, unit: "lb")
                    dexaField("VAT Volume", id: "vatVolume", keyPath: \.vatVolume, unit: "in³")
                }
                Toggle("I confirmed these extracted values.", isOn: Binding(
                    get: { store.evidenceDraft.dexa.valuesConfirmed },
                    set: { store.evidenceDraft.dexa.valuesConfirmed = $0 }
                ))
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold).tint(PhysiqueOSTheme.accent)
            }
        }
    }

    private func dexaField(_ label: String, id: String, keyPath: WritableKeyPath<DEXAIntakeDraft, String>, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased()).physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10).foregroundStyle(PhysiqueOSTheme.textMuted)
            HStack(spacing: 5) {
                NumericEditField(text: Binding(
                    get: { store.evidenceDraft.dexa[keyPath: keyPath] },
                    set: { store.evidenceDraft.dexa[keyPath: keyPath] = $0 }
                ), accessibilityLabel: label, fieldID: id, focusedFieldID: $focusedNumericFieldID,
                previousFieldID: KeyboardFocusOrder.previous(before: id, in: Self.dexaFocusOrder),
                nextFieldID: KeyboardFocusOrder.next(after: id, in: Self.dexaFocusOrder))
                Text(unit).physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10).foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            .padding(.horizontal, 9).frame(minHeight: 44).background(PhysiqueOSTheme.surfaceMuted).clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    static let dexaFocusOrder = ["totalMass", "bodyFat", "fatMass", "leanMass", "boneMineral", "rmr", "vatMass", "vatVolume"]

    private var progressPhotoConfirmation: some View {
        VStack(alignment: .leading, spacing: 14) {
            if !store.evidenceDraft.photoIdentities.isEmpty {
                Text("Identify each photo").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                ForEach(Array(store.evidenceDraft.photoIdentities.enumerated()), id: \.element.id) { index, identity in
                    CardContainer(background: (identity.confirmed ? PhysiqueOSTheme.chartSuccess : Color.yellow).opacity(0.10)) {
                        VStack(alignment: .leading, spacing: 10) {
                            if let attachment = store.evidenceDraft.attachments.first(where: { $0.id == identity.attachmentId }),
                               let data = attachment.data, let image = EvidenceAttachmentLoader.previewImage(data: data) {
                                Image(uiImage: image)
                                    .resizable()
                                    .scaledToFit()
                                    .frame(maxWidth: .infinity, maxHeight: 360)
                                    .background(Color.black.opacity(0.14))
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Photo \(index + 1)").physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10).foregroundStyle(PhysiqueOSTheme.textMuted)
                                    Text(identity.poseLabel).physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                }
                                Spacer()
                                Text(identity.confirmed ? "Confirmed" : "Review")
                                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                                    .padding(.horizontal, 8).padding(.vertical, 4)
                                    .foregroundStyle(identity.confirmed ? PhysiqueOSTheme.chartSuccess : Color.orange)
                                    .background((identity.confirmed ? PhysiqueOSTheme.chartSuccess : Color.yellow).opacity(0.16)).clipShape(Capsule())
                            }
                            HStack(spacing: 8) {
                                photoPicker("Orientation", selection: photoOrientationBinding(identity), values: ProgressPhotoOrientation.allCases)
                                photoPicker("Contraction", selection: photoContractionBinding(identity), values: ProgressPhotoContraction.allCases)
                            }
                            photoPicker("Pose", selection: photoVariantBinding(identity), values: ProgressPhotoPoseVariant.allCases)
                            if identity.poseVariant == .other {
                                TextField("Custom pose label", text: photoTextBinding(identity, keyPath: \.customLabel))
                                    .textFieldStyle(.roundedBorder)
                            }
                            Button(identity.confirmed ? "Pose confirmed" : "Confirm pose") {
                                store.updatePhotoIdentity(id: identity.id) { value in
                                    value.confirmed = value.orientation != .unconfirmed && value.contraction != .unconfirmed
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.regular)
                            .tint(identity.confirmed ? PhysiqueOSTheme.chartSuccess : Color.orange)
                            .frame(maxWidth: .infinity)
                            .disabled(identity.orientation == .unconfirmed || identity.contraction == .unconfirmed)
                        }
                    }
                }
            }
            CardContainer {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Session conditions").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        timeOfDayPicker
                        triStatePicker("Fasted", keyPath: \.fasted)
                        triStatePicker("Post-workout", keyPath: \.postWorkout)
                        triStatePicker("Pump", keyPath: \.pump, trueLabel: "Present", falseLabel: "None")
                    }
                    Toggle("These are original, unedited photos.", isOn: Binding(get: { store.evidenceDraft.photoSession.originalUnedited }, set: { store.evidenceDraft.photoSession.originalUnedited = $0 }))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .tint(PhysiqueOSTheme.chartSuccess)
                        .padding(10)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    private func photoPicker<Value: Hashable & Identifiable & CaseIterable & EvidenceLabeledChoice>(_ label: String, selection: Binding<Value>, values: Value.AllCases) -> some View where Value.AllCases: RandomAccessCollection {
        VStack(alignment: .leading, spacing: 5) {
            Text(label.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Menu {
                ForEach(values) { value in
                    Button(value.label) { selection.wrappedValue = value }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(selection.wrappedValue.label).lineLimit(1)
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.up.chevron.down").font(.caption2)
                }
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.accent)
                .padding(.horizontal, 10)
                .frame(maxWidth: .infinity, minHeight: 42)
                .background(PhysiqueOSTheme.surfaceMuted)
                .clipShape(Capsule())
                .contentShape(Capsule())
            }
            .accessibilityLabel(label)
            .accessibilityValue(selection.wrappedValue.label)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func photoOrientationBinding(_ identity: ProgressPhotoIdentityDraft) -> Binding<ProgressPhotoOrientation> {
        .init(get: { store.evidenceDraft.photoIdentities.first(where: { $0.id == identity.id })?.orientation ?? identity.orientation }, set: { value in store.updatePhotoIdentity(id: identity.id) { $0.orientation = value; $0.confirmed = false } })
    }
    private func photoContractionBinding(_ identity: ProgressPhotoIdentityDraft) -> Binding<ProgressPhotoContraction> {
        .init(get: { store.evidenceDraft.photoIdentities.first(where: { $0.id == identity.id })?.contraction ?? identity.contraction }, set: { value in store.updatePhotoIdentity(id: identity.id) { $0.contraction = value; $0.confirmed = false } })
    }
    private func photoVariantBinding(_ identity: ProgressPhotoIdentityDraft) -> Binding<ProgressPhotoPoseVariant> {
        .init(get: { store.evidenceDraft.photoIdentities.first(where: { $0.id == identity.id })?.poseVariant ?? identity.poseVariant }, set: { value in store.updatePhotoIdentity(id: identity.id) { $0.poseVariant = value; $0.confirmed = false } })
    }
    private func photoTextBinding(_ identity: ProgressPhotoIdentityDraft, keyPath: WritableKeyPath<ProgressPhotoIdentityDraft, String>) -> Binding<String> {
        .init(get: { store.evidenceDraft.photoIdentities.first(where: { $0.id == identity.id })?[keyPath: keyPath] ?? "" }, set: { value in store.updatePhotoIdentity(id: identity.id) { $0[keyPath: keyPath] = value; $0.confirmed = false } })
    }
    private var timeOfDayPicker: some View {
        sessionConditionMenu(
            label: "Time of day",
            value: store.evidenceDraft.photoSession.timeOfDay?.label ?? "Choose",
            choices: ProgressPhotoTimeOfDay.allCases.map { ($0.label, Optional($0)) }
        ) { store.evidenceDraft.photoSession.timeOfDay = $0 }
    }

    private func triStatePicker(
        _ label: String,
        keyPath: WritableKeyPath<ProgressPhotoSessionDraft, Bool?>,
        trueLabel: String = "Yes",
        falseLabel: String = "No"
    ) -> some View {
        let value = store.evidenceDraft.photoSession[keyPath: keyPath]
        return sessionConditionMenu(
            label: label,
            value: value.map { $0 ? trueLabel : falseLabel } ?? "Unknown",
            choices: [("Unknown", nil), (trueLabel, Optional(true)), (falseLabel, Optional(false))]
        ) { store.evidenceDraft.photoSession[keyPath: keyPath] = $0 }
    }

    private func sessionConditionMenu<Value>(
        label: String,
        value: String,
        choices: [(String, Value)],
        onSelect: @escaping (Value) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Menu {
                ForEach(Array(choices.enumerated()), id: \.offset) { _, choice in
                    Button(choice.0) { onSelect(choice.1) }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(value)
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.up.chevron.down").font(.caption2)
                }
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(value == "Choose" || value == "Unknown" ? Color.orange : PhysiqueOSTheme.textPrimary)
                .padding(.horizontal, 10)
                .frame(maxWidth: .infinity, minHeight: 42)
                .background(PhysiqueOSTheme.surfaceMuted)
                .clipShape(Capsule())
                .contentShape(Capsule())
            }
            .accessibilityLabel(label)
            .accessibilityValue(value)
        }
    }
    private func submit() {
        switch store.submitEvidence() {
        case .failure(let error): errorMessage = error.message
        case .success:
            errorMessage = nil
            isPreparing = true
            Task { @MainActor in
                switch await store.finishInterpretation() {
                case .failure(let error): errorMessage = error.message; isPreparing = false
                case .success(let reviewId):
                    isPreparing = false
                    if let reviewId { onNavigate(.localEvidenceReview(reviewId: reviewId)) }
                }
            }
        }
    }

    private var draftDate: Binding<Date> {
        .init(get: { store.evidenceDraft.occurrenceDate }, set: { store.evidenceDraft.occurrenceDate = $0 })
    }

    private var draftDetails: Binding<String> {
        .init(get: { store.evidenceDraft.details }, set: { store.evidenceDraft.details = $0 })
    }

    private var draftScenario: Binding<EvidenceFixtureScenario> {
        .init(get: { store.evidenceDraft.scenario }, set: { store.setEvidenceScenario($0) })
    }

    private func reportLoadingFailures(in attachments: [SandboxAttachment]) {
        let failures = attachments.filter { $0.loadError != nil }
        if !failures.isEmpty { errorMessage = "\(failures.count) selected item\(failures.count == 1 ? "" : "s") could not be loaded. Remove and reselect the highlighted item\(failures.count == 1 ? "" : "s")." }
    }

    private func elapsed(since start: ContinuousClock.Instant) -> Double {
        let duration = start.duration(to: .now)
        return Double(duration.components.seconds) + Double(duration.components.attoseconds) / 1_000_000_000_000_000_000
    }
}
