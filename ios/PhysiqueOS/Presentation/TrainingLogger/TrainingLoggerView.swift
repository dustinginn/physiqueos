import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

enum PerformanceRecordConfettiStyle {
    static let particleCount = 36
    static let minimumParticleSize: CGFloat = 7
    static let particleSizeVariants = 4
    static let horizontalBaseSpread: CGFloat = 75
    static let horizontalSpreadVariants = 85
    static let verticalBaseSpread: CGFloat = 50
    static let verticalSpreadVariants = 70
    static let verticalDrop: CGFloat = 95
    static let duration: TimeInterval = 0.95
    static var maximumParticleSize: CGFloat {
        minimumParticleSize + CGFloat(particleSizeVariants - 1)
    }
}

struct TrainingLoggerSuggestedAreaSelectionPresentation: Equatable {
    static let minimumControlTarget: CGFloat = 44

    let suggestionLabel: String
    let isSelected: Bool

    var systemImage: String { isSelected ? "checkmark.circle.fill" : "circle" }
    var accessibilityLabel: String {
        "\(isSelected ? "Deselect" : "Select") suggested \(suggestionLabel)"
    }
    var accessibilityValue: String { isSelected ? "Selected" : "Not selected" }
}

/// Suggested Today and the Training Area grid are two presentations of the
/// same draft selection. This card owns no state: its action mutates the
/// Logger's canonical draft through `TrainingLoggerViewModel`.
struct TrainingLoggerSuggestedAreaCard: View {
    let suggestion: TrainingLoggerCategorySuggestion
    let isSelected: Bool
    let action: () -> Void

    private var presentation: TrainingLoggerSuggestedAreaSelectionPresentation {
        .init(suggestionLabel: suggestion.label, isSelected: isSelected)
    }

    private var field: LinearGradient {
        LinearGradient(
            colors: [PhysiqueOSTheme.redesignUtilityField, PhysiqueOSTheme.redesignUtilityNavy],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 8) {
                    HStack(spacing: 4) {
                        Image(systemName: "sparkle").font(.system(size: 8, weight: .bold))
                        Text("Suggested Today").logText(LoggerType.eyebrow10)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: presentation.systemImage)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(PhysiqueOSTheme.redesignSuggestionInk)
                        .frame(
                            width: TrainingLoggerSuggestedAreaSelectionPresentation.minimumControlTarget,
                            height: TrainingLoggerSuggestedAreaSelectionPresentation.minimumControlTarget
                        )
                        .contentShape(Circle())
                        .accessibilityHidden(true)
                }
                .foregroundStyle(PhysiqueOSTheme.redesignSuggestionInk)
                Text(suggestion.label)
                    .logText(LoggerType.surfaceTitle16)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                    .padding(.top, 2)
                    .padding(.bottom, 4)
                Text(suggestion.reason)
                    .logText(LoggerType.body11)
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(field, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(presentation.accessibilityLabel)
        .accessibilityValue(presentation.accessibilityValue)
        .accessibilityHint(suggestion.reason)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("trainingLogger.suggestedToday")
    }
}

struct TrainingLoggerAreaChoiceLabel: View {
    let title: String
    let isSelected: Bool

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        HStack {
            Text(title).logText(LoggerType.choice12)
            Spacer(minLength: 4)
            Image(systemName: isSelected ? "circle.fill" : "circle")
                .font(.system(size: 9, weight: .bold))
                .accessibilityHidden(true)
        }
        .foregroundStyle(PhysiqueOSTheme.redesignInk)
        .padding(.horizontal, 11)
        .frame(maxWidth: .infinity, minHeight: 54)
        .background {
            shape.fill(PhysiqueOSTheme.redesignPaper)
            if isSelected { shape.fill(PhysiqueOSTheme.redesignPurple.opacity(0.12)) }
        }
        .overlay(shape.strokeBorder(isSelected ? PhysiqueOSTheme.redesignPurple : PhysiqueOSTheme.redesignHairline, lineWidth: 1))
        .contentShape(shape)
    }
}

struct TrainingLoggerView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var viewModel: TrainingLoggerViewModel?
    /// The authority `viewModel` was built for; guards against rebuilding
    /// (and losing the on-screen workout) when the tab is revisited.
    @State private var viewModelAuthority: NativeAPIEnvironment?
    @State private var pastWorkoutDate = Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date()
    @State private var provisionalName = ""
    @State private var provisionalAreaId = ""
    @State private var showingCancelWorkoutConfirmation = false
    @State private var showingDiscardFailedFinishConfirmation = false
    @State private var isNumericKeyboardVisible = false
    @State private var focusedNumericFieldID: String?
    @State private var numericEditBuffers: [String: String] = [:]
    @State private var isSupportingPhotosPickerPresented = false
    @State private var isSupportingFilePickerPresented = false
    @State private var supportingPhotoItems: [PhotosPickerItem] = []
    /// Assets currently being locally interpreted — transient UI-only
    /// state, not persisted to the draft, so a mid-read screen rotation
    /// or draft reload never leaves a stuck "reading" row.
    @State private var pendingInterpretationAssetIDs: Set<String> = []
    /// SwiftUI may keep a tab's hierarchy alive while another tab is visible.
    /// A late PR read must not consume the one-shot celebration off-screen.
    @State private var isSurfaceVisible = false
    /// Guided Watch handoff presentation (state lives in the authority).
    @State private var watchHandoff = TrainingWatchHandoffModel()

    var body: some View {
        Group {
            if let viewModel {
                switch viewModel.loadState {
                case .loading:
                    ProgressView().tint(PhysiqueOSTheme.accent)
                case .failed(let message):
                    failure(message)
                case .loaded:
                    content(viewModel)
                }
            } else {
                ProgressView().tint(PhysiqueOSTheme.accent)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PhysiqueOSTheme.redesignCanvas.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(PhysiqueOSTheme.redesignCanvas, for: .navigationBar)
        .toolbar {
            if let viewModel, let draft = viewModel.draft, draft.step == .workout, draft.expectsWatchHealthWorkout,
               !viewModel.isFinishConfirmed {
                ToolbarItem(placement: .navigationBarTrailing) { TrainingLoggerWatchStatusChip() }
            }
            if let viewModel, let draft = viewModel.draft, draft.step != .complete, draft.step != .workout,
               !viewModel.isFinishConfirmed {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save & Leave") {
                        viewModel.saveAndLeave()
                        dismiss()
                    }
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                    .accessibilityIdentifier("trainingLogger.saveAndLeave")
                }
            }
        }
        .task(id: environment.nativeAuthority) {
            // `.task(id:)` re-fires when the tab is revisited; rebuilding here
            // used to drop a mid-workout Founder back to the entry screen.
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = TrainingLoggerViewModel(
                    api: environment.trainingLoggerAPI,
                    writeAPI: environment.trainingWriteAPI,
                    catalogWriteAPI: environment.trainingExerciseCatalogWriteAPI,
                    sessionAuthority: environment.trainingSessionAuthority(for: environment.nativeAuthority),
                    attachmentStore: environment.trainingLoggerAttachmentStore,
                    authority: environment.nativeAuthority,
                    backgroundScheduler: UIKitBackgroundTaskScheduler()
                )
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
            // Opened from the Log tab for an in-progress session: resume that
            // exact draft (if it still exists) instead of the entry screen.
            // It also wins over a relaunch-recovered completion of an earlier
            // workout (already durable on the Server), so the Founder lands in
            // the workout they are doing, not an older Workout Complete.
            if let draftId = environment.consumeTrainingLoggerResumeDraftId(),
               viewModel?.draft == nil || (viewModel?.draft?.step == .complete && viewModel?.draft?.id != draftId) {
                viewModel?.resume(draftId: draftId)
            }
        }
        .onAppear { isSurfaceVisible = true }
        .onDisappear {
            isSurfaceVisible = false
            viewModel?.persist()
        }
        .onChange(of: focusedNumericFieldID) { isNumericKeyboardVisible = focusedNumericFieldID != nil }
        .photosPicker(isPresented: $isSupportingPhotosPickerPresented, selection: $supportingPhotoItems, matching: .images)
        .onChange(of: supportingPhotoItems) {
            let items = supportingPhotoItems
            supportingPhotoItems = []
            attachAndInterpretPhotos(items)
        }
        .fileImporter(isPresented: $isSupportingFilePickerPresented, allowedContentTypes: [.image], allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            attachAndInterpretFiles(urls)
        }
        .sheet(item: Binding(
            get: { viewModel?.variantCreation },
            set: { if $0 == nil { viewModel?.cancelCreatingVariant() } }
        )) { request in
            if let viewModel {
                TrainingExecutionVariantCreateSheet(viewModel: viewModel, request: request)
            }
        }
        .alert(
            "Discard this saved workout?",
            isPresented: $showingDiscardFailedFinishConfirmation
        ) {
            Button("Discard Saved Workout", role: .destructive) {
                viewModel?.discardFailedConfirmedFinish()
            }
            Button("Keep Workout", role: .cancel) {}
        } message: {
            Text("This removes the structured workout from this iPhone. Because Finish was already confirmed, a paired Watch will still end and save its HealthKit workout.")
        }
    }

    /// Attaches picked Photos items immediately (so the list responds
    /// right away), then loads each item's real bytes and runs the shared
    /// local interpretation path — the reconciliation screen never shows a
    /// result until that real read actually completes.
    private func attachAndInterpretPhotos(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty else { return }
        let start = viewModel?.draft?.supportingEvidenceAssets.filter { $0.source == .photos }.count ?? 0
        let newAssets = items.indices.map { index in
            TrainingLoggerSupportingEvidence(id: UUID().uuidString, displayName: "Apple Health Screenshot \(start + index + 1).jpg", source: .photos)
        }
        viewModel?.update { $0.addSupportingEvidence(newAssets) }
        for (asset, item) in zip(newAssets, items) {
            pendingInterpretationAssetIDs.insert(asset.id)
            Task {
                let data = try? await item.loadTransferable(type: Data.self)
                let contentType = item.supportedContentTypes.first?.preferredMIMEType ?? "image/jpeg"
                await interpretAndStoreSupportingEvidence(assetId: asset.id, data: data, contentType: contentType, source: .photos)
            }
        }
    }

    /// Same real-interpretation path as `attachAndInterpretPhotos`, for
    /// files picked via the Files importer (image or PDF).
    private func attachAndInterpretFiles(_ urls: [URL]) {
        guard !urls.isEmpty else { return }
        let newAssets = urls.map { TrainingLoggerSupportingEvidence(id: UUID().uuidString, displayName: $0.lastPathComponent, source: .files) }
        viewModel?.update { $0.addSupportingEvidence(newAssets) }
        for (asset, url) in zip(newAssets, urls) {
            pendingInterpretationAssetIDs.insert(asset.id)
            Task {
                let accessed = url.startAccessingSecurityScopedResource()
                defer { if accessed { url.stopAccessingSecurityScopedResource() } }
                let data = try? Data(contentsOf: url)
                await interpretAndStoreSupportingEvidence(assetId: asset.id, data: data, contentType: UTType(filenameExtension: url.pathExtension)?.preferredMIMEType, filename: url.lastPathComponent, source: .files)
            }
        }
    }

    /// Runs the shared `EvidenceLocalInterpretation` OCR/extraction path
    /// (the same one Evidence Review's cardio/strength parsing uses) on
    /// one asset's real bytes, then records the outcome — a real workout,
    /// or an explicit "could not read" failure — via
    /// `setSupportingWorkoutInterpretation`. Never synthesizes a fixture
    /// result on failure.
    @MainActor
    private func interpretAndStoreSupportingEvidence(
        assetId: String,
        data: Data?,
        contentType: String?,
        filename: String? = nil,
        source: SandboxAttachment.Source
    ) async {
        defer { pendingInterpretationAssetIDs.remove(assetId) }
        guard let data else {
            viewModel?.update { $0.setSupportingWorkoutInterpretation(assetId: assetId, workout: nil) }
            return
        }
        let resolvedContentType = contentType ?? "application/octet-stream"
        do {
            try viewModel?.retainSupportingEvidence(assetId: assetId, data: data, contentType: resolvedContentType)
        } catch {
            viewModel?.update { $0.setSupportingWorkoutInterpretation(assetId: assetId, workout: nil) }
            return
        }
        let attachment = SandboxAttachment(id: assetId, displayName: filename ?? assetId, source: source, contentType: resolvedContentType, data: data)
        let prepared = await EvidenceLocalInterpretation.prepare(attachment)
        let workout = prepared.extractedText.flatMap {
            EvidenceLocalInterpretation.supportingWorkout(id: "supporting-\(assetId)", sourceEvidenceIds: [assetId], from: $0)
        }
        viewModel?.update { $0.setSupportingWorkoutInterpretation(assetId: assetId, workout: workout) }
    }

    private func content(_ viewModel: TrainingLoggerViewModel) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // A confirmed finish (from this phone or the Watch) is frozen:
                // whatever step was showing, the screen becomes the saving /
                // Retry state of Final Confirmation.
                switch viewModel.isFinishConfirmed ? .review : (viewModel.draft?.step ?? .entry) {
                case .entry: entry(viewModel)
                case .areas: areaSelection(viewModel)
                case .exercises: exercisePicker(viewModel)
                case .workout: workout(viewModel)
                case .summary: summary(viewModel)
                case .evidence: evidence(viewModel)
                case .review: review(viewModel)
                case .complete: complete(viewModel)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
        }
        .scrollDismissesKeyboard(.interactively)
        .physiqueOSScrollBottomClearance()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            persistentAction(viewModel)
        }
        .overlay { watchHandoffOverlay(viewModel) }
        .onAppear { watchHandoff.sync(watchHandoffInputs(viewModel)) }
        .onChange(of: watchHandoffInputs(viewModel)) { _, inputs in watchHandoff.sync(inputs) }
    }

    private func watchHandoffInputs(_ viewModel: TrainingLoggerViewModel) -> TrainingWatchHandoffModel.Inputs {
        let draft = viewModel.isFinishConfirmed ? nil : viewModel.draft
        let otherLive = draft.flatMap { current in
            viewModel.sessionAuthority.activeLiveSession().map { $0.id != current.id }
        } ?? false
        return .init(
            draft: draft,
            canOfferHandoff: environment.watchCompanion.canOfferHandoff,
            otherLiveSessionExists: otherLive,
            canWrite: viewModel.canWrite
        )
    }

    /// Founder Build 90 Option B: a centered card over the dimmed Logger.
    @ViewBuilder
    private func watchHandoffOverlay(_ viewModel: TrainingLoggerViewModel) -> some View {
        let phase = watchHandoff.phase
        if phase != .hidden, let sessionId = viewModel.draft?.id {
            ZStack {
                Color.black.opacity(0.38).ignoresSafeArea()
                    .accessibilityHidden(true)
                TrainingWatchHandoffCard(
                    phase: phase,
                    primary: {
                        let launcher = environment.watchAppLauncher
                        Task {
                            if phase == .unreachable {
                                await watchHandoff.tryAgain(sessionId: sessionId, launcher: launcher)
                            } else {
                                await watchHandoff.ready(
                                    sessionId: sessionId,
                                    prepare: { viewModel.setReadyForWatch(true) },
                                    launcher: launcher
                                )
                            }
                        }
                    },
                    secondary: {
                        watchHandoff.useWithoutWatch { viewModel.declineWatchHandoff() }
                    }
                )
                .padding(.horizontal, 22)
            }
            .transition(.opacity)
        }
    }

    @ViewBuilder
    private func persistentAction(_ viewModel: TrainingLoggerViewModel) -> some View {
        switch viewModel.isFinishConfirmed ? .review : viewModel.draft?.step {
        case .exercises:
            let presentation = viewModel.selectionPresentation
            let adding = viewModel.draft?.isAddingExercises == true
            persistentActionBar {
                LoggerExecutionButton(
                    title: adding ? "Return to workout · \(viewModel.draft?.addedExerciseCount ?? 0) added" : presentation.startTitle,
                    isEnabled: adding || presentation.canStart
                ) {
                    viewModel.continueFromExercises()
                }
                .accessibilityIdentifier("trainingLogger.startLogging")
            }
        case .workout:
            if NumericEditingContract.finishActionVisible(step: viewModel.draft?.step, keyboardVisible: isNumericKeyboardVisible) {
                let presentation = viewModel.workoutPresentation
                persistentActionBar {
                    // Founder Build 90 Option A: the canonical clock docked
                    // beside Finish Workout (phone-only rest timing).
                    HStack(spacing: 8) {
                        if let clock = TrainingLoggerClockPresentation.make(draft: viewModel.draft) {
                            TrainingLoggerClockTile(presentation: clock) { restId in
                                viewModel.endRest(restId: restId)
                            }
                        }
                        LoggerExecutionButton(title: "Finish Workout", isEnabled: presentation?.canFinish == true) {
                            viewModel.reviewWorkout()
                        }
                        .accessibilityIdentifier("trainingLogger.finishWorkout")
                    }
                }
            }
        default:
            EmptyView()
        }
    }

    /// Locked sticky action bar: 92% canvas over a blur, hairline top rule.
    private func persistentActionBar<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 11)
            .background {
                ZStack {
                    Rectangle().fill(.ultraThinMaterial)
                    Rectangle().fill(PhysiqueOSTheme.redesignCanvas.opacity(0.92))
                }
                .ignoresSafeArea(edges: .bottom)
            }
            .overlay(alignment: .top) { Rectangle().fill(PhysiqueOSTheme.redesignHairline).frame(height: 1) }
    }

    private func entry(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            loggerHeader(eyebrow: "Training Logger", title: "Log the work. Keep the context.", subtitle: "Start now or capture a past workout with the same exercise and set details.")

            if !viewModel.canWrite {
                Label("Founder Production is read-only. Training history and the canonical exercise library remain available.", systemImage: "lock.fill")
                    .logText(LoggerType.body11)
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                    .loggerSurface()
            }

            validation(viewModel)

            // L1 order: Start Workout, Saved workouts, Log Past Workout.
            Button { viewModel.start(mode: .live) } label: {
                loggerActionRow(icon: "play.fill", title: "Start Workout", detail: "Begin a live session using today’s date.")
                    .padding(14)
                    .background(loggerTealField, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                    .contentShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
            }
            .buttonStyle(.plain)
            .allowsHitTesting(viewModel.canWrite)
            .opacity(viewModel.canWrite ? 1 : 0.55)
            .accessibilityIdentifier("trainingLogger.start")

            if !viewModel.savedDrafts.isEmpty {
                // Build 20 regression: this card (and therefore the only
                // way to reach `resume()`) was gated to Sandbox even
                // though `savedDraft`/`canWrite` are both already valid
                // under Founder Production — Save & Leave genuinely
                // persisted the draft, but nothing in Production could
                // ever surface it again. Restoring for both authorities.
                VStack(alignment: .leading, spacing: 0) {
                    Text("Saved workouts")
                        .logText(LoggerType.eyebrow10)
                        .foregroundStyle(PhysiqueOSTheme.redesignUtilityMuted)
                    ForEach(Array(viewModel.savedDrafts.enumerated()), id: \.element.id) { index, draft in
                        let presentation = viewModel.savedDraftPresentation(draft)
                        VStack(alignment: .leading, spacing: 0) {
                            if index > 0 {
                                Rectangle().fill(PhysiqueOSTheme.redesignHairline).frame(height: 1).padding(.vertical, 12)
                            }
                            Text([presentation.date, presentation.time].compactMap { $0 }.joined(separator: " · "))
                                .logText(LoggerType.surfaceTitle16)
                                .foregroundStyle(PhysiqueOSTheme.redesignInk)
                                .padding(.bottom, 4)
                            if !presentation.detail.isEmpty {
                                Text(presentation.detail)
                                    .logText(LoggerType.body11)
                                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                            }
                            LoggerExecutionButton(title: "Resume", minHeight: 48) { viewModel.resume(draftId: draft.id) }
                                .padding(.top, 10)
                                .accessibilityIdentifier("trainingLogger.resume.\(draft.id)")
                            Button(role: .destructive) {
                                viewModel.discardSavedDraft(draftId: draft.id)
                            } label: {
                                Text("Discard draft")
                                    .logText(LoggerType.meta11)
                                    .foregroundStyle(PhysiqueOSTheme.redesignRed)
                                    .frame(maxWidth: .infinity, minHeight: 44)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            // 44 pt target centered on the locked 8 pt gap +
                            // 11 pt line (CSS normal line height).
                            .padding(.top, -7.07)
                            .padding(.bottom, -15.03)
                            .accessibilityIdentifier("trainingLogger.discard.\(draft.id)")
                        }
                    }
                }
                .loggerSurface()
            }

            VStack(alignment: .leading, spacing: 0) {
                Button { viewModel.start(mode: .past, date: pastWorkoutDate) } label: {
                    loggerActionRow(icon: "square.inset.filled", title: "Log Past Workout", detail: "Choose when the workout happened.")
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(!viewModel.canWrite)
                .accessibilityHint("Continues with the chosen workout date")
                .accessibilityIdentifier("trainingLogger.past")
                DatePicker("Workout date", selection: $pastWorkoutDate, in: ...Date(), displayedComponents: .date)
                    .datePickerStyle(.compact)
                    .labelsHidden()
                    .tint(PhysiqueOSTheme.redesignPurple)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(PhysiqueOSTheme.redesignSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(PhysiqueOSTheme.redesignHairline, lineWidth: 1))
                    .padding(.top, 10)
            }
            .loggerSurface()
        }
    }

    private var loggerTealField: LinearGradient {
        LinearGradient(colors: [PhysiqueOSTheme.redesignUtilityField, PhysiqueOSTheme.redesignUtilityNavy],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    /// Locked action row: 36 pt teal icon tile, title/detail, trailing chevron.
    private func loggerActionRow(icon: String, title: String, detail: String) -> some View {
        HStack(spacing: 11) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(PhysiqueOSTheme.redesignTeal)
                .frame(width: 36, height: 36)
                .background(PhysiqueOSTheme.redesignTeal.opacity(0.18), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .logText(LoggerType.rowTitle14)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                Text(detail)
                    .logText(LoggerType.context10)
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(PhysiqueOSTheme.redesignInk)
                .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
    }

    private func areaSelection(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            stepHeader(viewModel, step: "1 of 3", title: "What are you training?", subtitle: "Choose one or more Training Areas.")
            if let draft = viewModel.draft, draft.mode == .past {
                infoRow(icon: "calendar", title: "Workout date", value: draft.workoutDate)
            }
            if let suggestion = viewModel.availableCategorySuggestion {
                TrainingLoggerSuggestedAreaCard(
                    suggestion: suggestion,
                    isSelected: viewModel.isCategorySuggestionAccepted,
                    action: { viewModel.toggleCategorySuggestion() }
                )
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 9), GridItem(.flexible(), spacing: 9)], spacing: 9) {
                ForEach(viewModel.configuration?.areas ?? []) { area in
                    let selected = viewModel.isAreaSelected(area.id)
                    Button {
                        viewModel.update { $0.toggleArea(area.id) }
                    } label: {
                        loggerChoice(area.label, selected: selected)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                    .accessibilityIdentifier("trainingLogger.area.\(area.id)")
                }
            }
            validation(viewModel)
            LoggerExecutionButton(title: "Choose exercises", minHeight: 48) { viewModel.continueFromAreas() }
            secondaryButton("Back") { viewModel.draft = nil }
        }
    }

    /// Locked selection chip: 54 pt, 12 pt radius; selected adds the purple
    /// rule and 12% purple tint plus a filled marker (never color alone).
    private func loggerChoice(_ title: String, selected: Bool) -> some View {
        TrainingLoggerAreaChoiceLabel(title: title, isSelected: selected)
    }

    private func exercisePicker(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            let adding = viewModel.draft?.isAddingExercises == true
            stepHeader(
                viewModel, step: adding ? "Active workout" : "2 of 3",
                title: adding ? "Add exercises" : "Choose exercises",
                subtitle: viewModel.isBrowsingAllExercises
                    ? "All Exercises · the full exercise catalog"
                    : "My Library · performed exercises first"
            )

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PhysiqueOSTheme.redesignUtilityMuted)
                    .accessibilityHidden(true)
                TextField("", text: Binding(
                    get: { viewModel.searchText },
                    set: { viewModel.searchText = $0 }
                ), prompt: Text("Search exercises").foregroundStyle(PhysiqueOSTheme.redesignUtilityMuted))
                .font(Font(PlusJakartaSans.uiFont(size: 12, weight: 400)))
                .foregroundStyle(PhysiqueOSTheme.redesignInk)
                .textInputAutocapitalization(.never)
                .accessibilityLabel("Search exercises")
                .accessibilityIdentifier("trainingLogger.exerciseSearch")
            }
            .padding(.horizontal, 12)
            .frame(height: 44)
            .loggerInputSurface()

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(viewModel.isBrowsingAllExercises ? "All Exercises" : "My Library")
                        .logText(LoggerType.eyebrow10)
                        .foregroundStyle(PhysiqueOSTheme.redesignUtilityMuted)
                    Spacer()
                    Text("\(viewModel.selectionPresentation.selectedCount) selected")
                        .logText(LoggerType.pill10)
                        .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                }
                let rows = viewModel.pickerExercises()
                let provisional = viewModel.draft?.exercises.filter(\.isProvisional) ?? []
                if !rows.isEmpty || !provisional.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(rows) { exercise in
                            exerciseSelectionRow(exercise, viewModel: viewModel)
                            if exercise.id != rows.last?.id || !provisional.isEmpty { loggerRule }
                        }
                        ForEach(provisional) { exercise in
                            Button {
                                viewModel.update { $0.removeExercise(id: exercise.id, catalog: viewModel.configuration?.exercises ?? []) }
                            } label: {
                                exerciseSelectionLabel(
                                    name: exercise.name,
                                    detail: "\(viewModel.areaLabel(exercise.areaId)) · Provisional review",
                                    selected: true
                                )
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("trainingLogger.provisional.\(exercise.id)")
                            if exercise.id != provisional.last?.id { loggerRule }
                        }
                    }
                    .loggerSurface(padding: 0)
                }
            }

            HStack {
                Button {
                    viewModel.isBrowsingAllExercises.toggle()
                } label: {
                    loggerLink(
                        viewModel.isBrowsingAllExercises ? "Back to My Library" : "Browse All Exercises",
                        systemImage: viewModel.isBrowsingAllExercises ? "books.vertical.fill" : "magnifyingglass"
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("trainingLogger.browseAll")
                Spacer(minLength: 8)
                Button {
                    viewModel.isCreatingNewExercise.toggle()
                } label: {
                    loggerLink(
                        viewModel.isCreatingNewExercise ? "Cancel" : "Create New Exercise",
                        systemImage: viewModel.isCreatingNewExercise ? "minus" : "plus"
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("trainingLogger.createNewExercise")
            }

            if viewModel.isCreatingNewExercise {
                provisionalExerciseForm(viewModel)
            }

            validation(viewModel)
            secondaryButton(adding ? "Return to workout" : "Back to Training Areas") {
                if adding { viewModel.continueFromExercises() } else { viewModel.go(to: .areas) }
            }
        }
    }

    private var loggerRule: some View {
        Rectangle().fill(PhysiqueOSTheme.redesignHairline).frame(height: 1)
    }

    private func loggerLink(_ title: String, systemImage: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: systemImage).font(.system(size: 10, weight: .bold)).accessibilityHidden(true)
            Text(title).logText(LoggerType.link11)
        }
        .foregroundStyle(PhysiqueOSTheme.redesignPurple)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }

    private func exerciseSelectionRow(_ exercise: TrainingLoggerCatalogExercise, viewModel: TrainingLoggerViewModel) -> some View {
        let selected = viewModel.isSelected(exercise)
        let locked = viewModel.isLockedDuringAdd(exercise)
        return Button {
            guard !locked else { return }
            viewModel.toggleExerciseSelection(exercise)
        } label: {
            exerciseSelectionLabel(
                name: exercise.name,
                detail: [viewModel.areaLabel(exercise.areaId), exercise.equipment].compactMap { $0 }.joined(separator: " · "),
                selected: selected
            )
        }
        .buttonStyle(.plain)
        .disabled(locked)
        .accessibilityLabel("\(exercise.name), \(selected ? "selected" : "not selected")")
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier("trainingLogger.exercise.\(exercise.canonicalExerciseId)")
    }

    /// Locked picker row: 54 pt, name over muted detail, green check when
    /// selected and an open ring otherwise.
    private func exerciseSelectionLabel(name: String, detail: String, selected: Bool) -> some View {
        HStack(spacing: 9) {
            VStack(alignment: .leading, spacing: 0) {
                Text(name)
                    .logText(LoggerType.rowTitle13)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                Text(detail)
                    .logText(LoggerType.context10)
                    .foregroundStyle(PhysiqueOSTheme.redesignUtilityMuted)
            }
            Spacer(minLength: 8)
            Image(systemName: selected ? "checkmark" : "circle")
                .font(.system(size: selected ? 15 : 14, weight: selected ? .bold : .regular))
                .foregroundStyle(selected ? PhysiqueOSTheme.redesignGreen : PhysiqueOSTheme.redesignUtilityMuted)
                .frame(width: 20)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func provisionalExerciseForm(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Create new exercise")
                .logText(LoggerType.surfaceTitle16)
                .foregroundStyle(PhysiqueOSTheme.redesignInk)
                .padding(.bottom, 4)
            Text(
                viewModel.authority == .founderProduction
                    ? "Checked against the full exercise catalog first, so an existing match is never duplicated."
                    : "Give the exercise a name and choose its Training Area."
            )
            .logText(LoggerType.body11)
            .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
            TextField("", text: $provisionalName, prompt: Text("Exercise name").foregroundStyle(PhysiqueOSTheme.redesignUtilityMuted))
                .font(Font(PlusJakartaSans.uiFont(size: 12, weight: 400)))
                .foregroundStyle(PhysiqueOSTheme.redesignInk)
                .padding(.horizontal, 12)
                .frame(height: 44)
                .loggerInputSurface()
                .padding(.top, 10)
            Picker("Training Area", selection: $provisionalAreaId) {
                Text("Choose an area").tag("")
                ForEach((viewModel.configuration?.areas ?? []).filter { viewModel.draft?.selectedAreaIds.contains($0.id) == true }) {
                    Text($0.label).tag($0.id)
                }
            }
            .pickerStyle(.menu)
            .tint(PhysiqueOSTheme.redesignInk)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(PhysiqueOSTheme.redesignSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(PhysiqueOSTheme.redesignHairline, lineWidth: 1))
            .padding(.top, 8)
            if let newExerciseMessage = viewModel.newExerciseMessage {
                Text(newExerciseMessage)
                    .logText(LoggerType.body11)
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                    .padding(.top, 8)
            }
            ForEach(viewModel.newExerciseCandidates) { candidate in
                Button {
                    Task { await viewModel.selectExistingExercise(candidate) }
                } label: {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Possible match")
                            .logText(LoggerType.eyebrow8)
                            .foregroundStyle(PhysiqueOSTheme.redesignUtilityMuted)
                        Text(candidate.name)
                            .logText(LoggerType.fieldTitle12)
                            .foregroundStyle(PhysiqueOSTheme.redesignInk)
                        Text("Use \(candidate.name)")
                            .logText(LoggerType.link11)
                            .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .loggerSurface(tone: PhysiqueOSTheme.redesignAmber)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(viewModel.isSubmittingNewExercise)
                .padding(.top, 8)
            }
            LoggerExecutionButton(
                title: viewModel.isSubmittingNewExercise ? "Checking catalog…" : "Create New Exercise",
                isEnabled: !(provisionalName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                    provisionalAreaId.isEmpty || viewModel.isSubmittingNewExercise),
                minHeight: 48
            ) {
                viewModel.submitNewExercise(name: provisionalName, areaId: provisionalAreaId)
                provisionalName = ""
            }
            .padding(.top, 10)
            .accessibilityIdentifier("trainingLogger.submitNewExercise")
        }
        .loggerSurface()
#if DEBUG
        // Visual-parity seam only: the collision candidate state is
        // Production-only (Server catalog check), so DEBUG review runs can
        // show one sample candidate. Presentation state; no write occurs.
        .onAppear {
            guard ProcessInfo.processInfo.arguments.contains("-physiqueos.logger-review.candidate"),
                  viewModel.newExerciseCandidates.isEmpty else { return }
            viewModel.newExerciseMessage = "Choose the matching exercise to add to My Library and this workout."
            viewModel.newExerciseCandidates = [CanonicalExerciseMatch(id: "review-candidate", name: "Incline Barbell Press")]
        }
#endif
    }

    private func workout(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if let draft = viewModel.draft, let presentation = viewModel.workoutPresentation {
                workoutIdentity(draft: draft, presentation: presentation)

                HStack(spacing: 8) {
                    Button {
                        viewModel.saveAndLeave()
                        dismiss()
                    } label: {
                        loggerControlLabel("Save & Leave", systemImage: "arrow.left", tone: .secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("trainingLogger.inlineSaveAndLeave")

                    Button {
                        showingCancelWorkoutConfirmation = true
                    } label: {
                        loggerControlLabel("Cancel Workout", systemImage: "delete.left", tone: .destructive)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("trainingLogger.cancelWorkout")
                }

                // Rest preference is a shipping control the locked active
                // screen does not draw; it is retained in the same quiet
                // secondary-control grammar (canonical behavior wins).
                TrainingRestPreferenceMenu(preferences: environment.trainingRestPreferences)

                Button {
                    focusedNumericFieldID = nil
                    viewModel.beginAddingExercises()
                } label: {
                    loggerControlLabel("Add Exercise", systemImage: "plus", tone: .primaryRow)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("trainingLogger.addExercise")

                ForEach(draft.exercises) { exercise in
                    exerciseCard(exercise, viewModel: viewModel)
                }
            }
            validation(viewModel)
        }
        .alert(
            "Cancel this workout?",
            isPresented: $showingCancelWorkoutConfirmation
        ) {
            Button("Cancel Workout", role: .destructive) {
                viewModel.cancelWorkout()
            }
            Button("Keep Workout", role: .cancel) {}
        } message: {
            Text("This discards the workout and all set edits. Save & Leave keeps it.")
        }
    }

    private enum LoggerControlTone { case secondary, destructive, primaryRow, secondaryTall, destructiveTall }

    /// Locked utility controls: 14 pt radius secondary (soft surface + rule),
    /// destructive (red rule + 8% tint) and the full-width Add Exercise row.
    private func loggerControlLabel(_ title: String, systemImage: String, tone: LoggerControlTone) -> some View {
        let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
        let isRow = tone == .primaryRow || tone == .secondaryTall || tone == .destructiveTall
        let isDestructive = tone == .destructive || tone == .destructiveTall
        let ink = isDestructive ? PhysiqueOSTheme.redesignRed : PhysiqueOSTheme.redesignInk
        return HStack(spacing: isRow ? 6 : 4) {
            Image(systemName: systemImage)
                .font(.system(size: isRow ? 14 : 10, weight: .bold))
                .accessibilityHidden(true)
            Text(title)
                .logText(isRow ? LoggerType.control14 : LoggerType.control11)
        }
        .foregroundStyle(ink)
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, minHeight: isRow ? 48 : 42)
        .background {
            if isDestructive {
                shape.fill(PhysiqueOSTheme.redesignRed.opacity(0.08))
            } else {
                shape.fill(PhysiqueOSTheme.redesignSoft)
            }
        }
        .overlay {
            shape.strokeBorder(isDestructive ? PhysiqueOSTheme.redesignRed.opacity(0.55) : PhysiqueOSTheme.redesignHairline, lineWidth: 1)
        }
        .contentShape(shape)
    }

    private func workoutIdentity(
        draft: TrainingLoggerDraft,
        presentation: TrainingLoggerWorkoutPresentation
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(draft.mode == .live ? PhysiqueOSTheme.redesignGreen : PhysiqueOSTheme.redesignAmber)
                            .frame(width: 6.5, height: 6.5)
                        Text(presentation.eyebrow)
                            .logText(LoggerType.eyebrow10)
                            .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                    }
                    Text("Training Logger")
                        .logText(LoggerType.workoutTitle23)
                        .foregroundStyle(PhysiqueOSTheme.redesignInk)
                        .padding(.top, 3)
                        .padding(.bottom, 2)
                    Text(presentation.context)
                        .logText(LoggerType.meta11)
                        .foregroundStyle(PhysiqueOSTheme.redesignUtilityMuted)
                }
                Spacer(minLength: 8)
                Text(presentation.progress)
                    .logText(LoggerType.pill10)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 6)
                    .background(PhysiqueOSTheme.redesignSoft, in: Capsule())
            }
            GeometryReader { proxy in
                let fraction = Double(presentation.completedSetCount) / Double(max(1, presentation.totalSetCount))
                ZStack(alignment: .leading) {
                    Capsule().fill(PhysiqueOSTheme.redesignSoft)
                    Capsule().fill(PhysiqueOSTheme.redesignGreen)
                        .frame(width: proxy.size.width * min(1, max(0, fraction)))
                }
            }
            .frame(height: 5)
        }
        .accessibilityElement(children: .combine)
        .accessibilityValue("\(presentation.completedSetCount) of \(presentation.totalSetCount) sets complete")
        .accessibilityIdentifier("trainingLogger.workoutIdentity")
    }

    private func exerciseCard(_ exercise: TrainingLoggerDraftExercise, viewModel: TrainingLoggerViewModel) -> some View {
        let shape = RoundedRectangle(cornerRadius: 15, style: .continuous)
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Text(exercise.name)
                    .logText(LoggerType.cardTitle15)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                    .padding(.trailing, 44)
                exerciseContextText(exercise, draft: viewModel.draft)
                    .logText(LoggerType.context10)
                    .foregroundStyle(PhysiqueOSTheme.redesignAmber)
                    .padding(.top, 3)
                    .padding(.trailing, 44)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.top, 11)
            .padding(.bottom, 8)
            // The 44 pt menu target overlays the header so it never adds height.
            .overlay(alignment: .topTrailing) {
                // Dots sit on the first header line (CSS flex-start), 12 pt
                // from the trailing edge; the 44 pt target centers on them.
                exerciseMenu(exercise, viewModel: viewModel)
                    .padding(.top, -2)
                    .padding(.trailing, 2)
            }

            Group {
                if let previous = exercise.previousPerformance {
                    Text(previous.compactLine).lineLimit(1)
                } else {
                    Text("No comparable prior performance for this variant and relationship context.")
                }
            }
            .logText(LoggerType.context10)
            .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
            .padding(.horizontal, 12)
            .padding(.bottom, 8)

            if let recommendation = exercise.progressionRecommendation {
                progressionGuidance(recommendation, exercise: exercise, viewModel: viewModel)
            }

            setColumnHeader(for: exercise.measurement)
            ForEach(exercise.sets) { set in
                setRow(exercise: exercise, set: set, viewModel: viewModel)
            }
            Button {
                viewModel.update { $0.addSet(to: exercise.id) }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "plus").font(.system(size: 10, weight: .bold)).accessibilityHidden(true)
                    Text("Add set").logText(LoggerType.addSet11)
                }
                .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(height: 36)
            .accessibilityIdentifier("trainingLogger.addSet.\(exercise.id)")
        }
        .background(PhysiqueOSTheme.redesignPaper, in: shape)
        .clipShape(shape)
        .overlay(shape.strokeBorder(PhysiqueOSTheme.redesignHairline, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("trainingLogger.exerciseCard.\(exercise.name)")
    }

    /// Progression guidance is a shipping control the locked card does not
    /// draw; it stays inside the card in the soft utility band.
    private func progressionGuidance(
        _ recommendation: TrainingLoggerProgressionRecommendation,
        exercise: TrainingLoggerDraftExercise,
        viewModel: TrainingLoggerViewModel
    ) -> some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text(recommendation.eyebrow)
                    .logText(LoggerType.eyebrow8)
                    .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                Text(recommendation.prescription)
                    .logText(LoggerType.control11)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
            }
            Spacer(minLength: 4)
            progressionChoice("Use suggestion", selected: exercise.progressionChoice == .suggestion, enabled: recommendation.hasExplicitTarget) {
                viewModel.update { $0.applyProgressionSuggestion(to: exercise.id) }
            }
            progressionChoice("Keep previous", selected: exercise.progressionChoice == .previous, enabled: true) {
                viewModel.update { $0.keepPreviousPerformance(for: exercise.id) }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(PhysiqueOSTheme.redesignSoft)
        .accessibilityIdentifier("trainingLogger.progression.\(exercise.id)")
    }

    private func progressionChoice(_ title: String, selected: Bool, enabled: Bool, action: @escaping () -> Void) -> some View {
        let shape = Capsule()
        return Button(action: action) {
            Text(title)
                .logText(LoggerType.pill10Strong)
                .foregroundStyle(selected ? PhysiqueOSTheme.redesignPurple : PhysiqueOSTheme.redesignInk)
                .padding(.horizontal, 9)
                .frame(minHeight: 30)
                .background(shape.fill(selected ? PhysiqueOSTheme.redesignPurple.opacity(0.14) : PhysiqueOSTheme.redesignPaper))
                .overlay(shape.strokeBorder(selected ? PhysiqueOSTheme.redesignPurple : PhysiqueOSTheme.redesignHairline, lineWidth: 1))
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    /// Build 92: Ordinary, then the Server's canonical choices for THIS
    /// exercise only, then Create Variant… when the Server supports it.
    /// Switching keeps the exercise's sets/reps/load (variants inherit them).
    @ViewBuilder
    private func executionVariantMenu(_ exercise: TrainingLoggerDraftExercise, viewModel: TrainingLoggerViewModel) -> some View {
        let choices = viewModel.variantChoices(for: exercise)
        let selectedIdentity = TrainingExecutionVariantIdentity.identity(of: exercise.executionVariant, choices: choices)
        Menu("Execution variant") {
            Button {
                viewModel.selectVariant(nil, for: exercise.id)
            } label: {
                variantMenuLabel("Ordinary", selected: exercise.executionVariant == nil)
            }
            .accessibilityIdentifier("trainingLogger.variant.ordinary.\(exercise.name)")
            ForEach(choices) { choice in
                Button {
                    viewModel.selectVariant(choice, for: exercise.id)
                } label: {
                    variantMenuLabel(choice.label, selected: selectedIdentity == choice.variantId)
                }
                .accessibilityIdentifier("trainingLogger.variant.choice.\(choice.label)")
            }
            // A restored selection that is no longer offered (retired, or a
            // legacy label) stays visible and truthful, never silently dropped.
            if let current = exercise.executionVariant, !choices.contains(where: { $0.variantId == selectedIdentity }) {
                Button {} label: { variantMenuLabel(current.label, selected: true) }
                    .disabled(true)
            }
            if viewModel.canCreateVariant(for: exercise) {
                Divider()
                Button("Create Variant…") { viewModel.beginCreatingVariant(for: exercise) }
                    .accessibilityIdentifier("trainingLogger.variant.create.\(exercise.name)")
            }
        }
    }

    @ViewBuilder
    private func variantMenuLabel(_ title: String, selected: Bool) -> some View {
        if selected {
            Label(title, systemImage: "checkmark")
        } else {
            Text(title)
        }
    }

    private func exerciseMenu(_ exercise: TrainingLoggerDraftExercise, viewModel: TrainingLoggerViewModel) -> some View {
        Menu {
            executionVariantMenu(exercise, viewModel: viewModel)
            if let others = viewModel.draft?.exercises.filter({ $0.id != exercise.id }), !others.isEmpty {
                Menu("Superset") {
                    ForEach(others) { other in
                        Button("Pair with \(other.name)") {
                            viewModel.update { $0.setSuperset(firstId: exercise.id, secondId: other.id, catalog: viewModel.configuration?.exercises ?? []) }
                        }
                    }
                    if viewModel.draft?.relationshipContext(for: exercise.id) != nil {
                        Button("Remove superset", role: .destructive) {
                            viewModel.update { $0.removeSuperset(containing: exercise.id, catalog: viewModel.configuration?.exercises ?? []) }
                        }
                    }
                }
            }
            Menu("Substitute exercise") {
                ForEach((viewModel.configuration?.exercises ?? []).filter { $0.areaId == exercise.areaId && $0.canonicalExerciseId != exercise.canonicalExerciseId }) { replacement in
                    Button(replacement.name) { viewModel.update { $0.swapExercise(id: exercise.id, with: replacement) } }
                }
            }
            Button("Move earlier") { viewModel.update { $0.moveExercise(id: exercise.id, offset: -1) } }
            Button("Move later") { viewModel.update { $0.moveExercise(id: exercise.id, offset: 1) } }
            Button("Remove exercise", role: .destructive) { viewModel.update { $0.removeExercise(id: exercise.id, catalog: viewModel.configuration?.exercises ?? []) } }
        } label: {
            Text("•••")
                .logText(LoggerType.menuDots)
                .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Actions for \(exercise.name)")
        .accessibilityIdentifier("trainingLogger.exerciseActions.\(exercise.name)")
    }

    /// Locked set grid: SET 28 · primary · load · DONE 48 · remove 36, gap 6,
    /// 8 pt horizontal inset.
    private func setGrid<A: View, B: View, C: View, D: View, E: View>(
        @ViewBuilder _ number: () -> A,
        @ViewBuilder _ primary: () -> B,
        @ViewBuilder _ load: () -> C,
        @ViewBuilder _ done: () -> D,
        @ViewBuilder _ remove: () -> E
    ) -> some View {
        HStack(spacing: 6) {
            number().frame(width: 28)
            primary().frame(maxWidth: .infinity)
            load().frame(maxWidth: .infinity)
            // CSS grid places the fixed-width Done (44) and Remove (32)
            // buttons at the start of their 48 / 36 tracks.
            done().frame(width: 48, alignment: .leading)
            remove().frame(width: 36, alignment: .leading)
        }
        .padding(.horizontal, 8)
    }

    private func setColumnHeader(for measurement: TrainingLoggerMeasurement) -> some View {
        setGrid {
            Text("Set")
        } _: {
            Text(measurement == .duration ? "Seconds" : "Reps")
        } _: {
            Text("Load (lb)")
        } _: {
            Text("Done").frame(maxWidth: .infinity)
        } _: {
            Color.clear
        }
        .logText(LoggerType.columnHeader8)
        .foregroundStyle(PhysiqueOSTheme.redesignUtilityMuted)
        .frame(height: 28)
        .background { Rectangle().fill(PhysiqueOSTheme.redesignSoft) }
    }

    private func setRow(exercise: TrainingLoggerDraftExercise, set: TrainingLoggerDraftSet, viewModel: TrainingLoggerViewModel) -> some View {
        let primaryKind: TrainingLoggerNumericFieldKind = exercise.measurement == .duration ? .duration : .reps
        let primaryID = TrainingLoggerNumericFieldTarget(exerciseId: exercise.id, setId: set.id, kind: primaryKind).id
        let loadID = TrainingLoggerNumericFieldTarget(exerciseId: exercise.id, setId: set.id, kind: .load).id
        return setGrid {
            Text("\(set.setNumber)")
                .logText(LoggerType.setNumber12)
                .foregroundStyle(PhysiqueOSTheme.redesignInk)
        } _: {
            NumericEditField(
                text: numericBinding(viewModel, exerciseId: exercise.id, setId: set.id, field: exercise.measurement == .duration ? .durationSeconds : .reps),
                accessibilityLabel: exercise.measurement == .duration ? "Set \(set.setNumber) seconds" : "Set \(set.setNumber) reps",
                fieldID: primaryID,
                focusedFieldID: $focusedNumericFieldID,
                previousFieldID: viewModel.draft.flatMap { TrainingLoggerNumericFocusOrder.previous(before: primaryID, in: $0) },
                nextFieldID: viewModel.draft.flatMap { TrainingLoggerNumericFocusOrder.next(after: primaryID, in: $0) },
                onEditingChanged: numericEditingChanged,
                fieldBackground: PhysiqueOSTheme.redesignSoft,
                font: LoggerType.fieldValueFont,
                textColor: PhysiqueOSTheme.redesignInk,
                placeholderColor: PhysiqueOSTheme.redesignUtilityMuted
            )
            .frame(height: 36)
            .modifier(LoggerFieldFocus(isFocused: focusedNumericFieldID == primaryID))
        } _: {
            NumericEditField(
                text: numericBinding(viewModel, exerciseId: exercise.id, setId: set.id, field: .load),
                accessibilityLabel: "Set \(set.setNumber) optional external load",
                placeholder: exercise.measurement == .bodyweightReps ? "BW" : nil,
                fieldID: loadID,
                focusedFieldID: $focusedNumericFieldID,
                previousFieldID: viewModel.draft.flatMap { TrainingLoggerNumericFocusOrder.previous(before: loadID, in: $0) },
                nextFieldID: viewModel.draft.flatMap { TrainingLoggerNumericFocusOrder.next(after: loadID, in: $0) },
                onEditingChanged: numericEditingChanged,
                fieldBackground: PhysiqueOSTheme.redesignSoft,
                font: LoggerType.fieldValueFont,
                textColor: PhysiqueOSTheme.redesignInk,
                placeholderColor: PhysiqueOSTheme.redesignInkSecondary
            )
            .frame(height: 36)
            .modifier(LoggerFieldFocus(isFocused: focusedNumericFieldID == loadID))
        } _: {
            Button {
                viewModel.setCompletion(exerciseId: exercise.id, setId: set.id, completed: !set.isCompleted)
            } label: {
                // Founder-corrected Done control: production circle /
                // checkmark.circle.fill identity at a 28 pt visible circle in
                // a 44 × 44 target; explicit end state, never a blind toggle.
                Image(systemName: set.isCompleted ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 32, weight: .regular))
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(
                        set.isCompleted ? PhysiqueOSTheme.redesignCanvas : PhysiqueOSTheme.redesignUtilityMuted,
                        set.isCompleted ? PhysiqueOSTheme.redesignGreen : PhysiqueOSTheme.redesignUtilityMuted
                    )
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(set.isCompleted ? "Mark set incomplete" : "Mark set complete")
        } _: {
            Button {
                viewModel.update { $0.removeSet(exerciseId: exercise.id, setId: set.id) }
            } label: {
                Image(systemName: "delete.left")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(PhysiqueOSTheme.redesignUtilityMuted)
                    .frame(width: 32, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(exercise.sets.count <= 1)
            .opacity(exercise.sets.count <= 1 ? 0.35 : 1)
            .accessibilityLabel("Remove set \(set.setNumber)")
        }
        .frame(minHeight: 52)
        .background { Rectangle().fill(set.isCompleted ? PhysiqueOSTheme.redesignGreen.opacity(0.09) : Color.clear) }
        .overlay(alignment: .bottom) {
            Rectangle().fill(PhysiqueOSTheme.redesignHairline).frame(height: 1)
        }
    }

    private func summary(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            stepHeader(viewModel, step: "Workout Review", title: "Review your workout", subtitle: "Check every completed set and add optional Apple Health screenshots.")
            if let draft = viewModel.draft {
                let summary = draft.summary()
                HStack(spacing: 6) {
                    summaryMetric("Exercises", summary.exerciseCount)
                    summaryMetric("Sets", summary.completedSetCount)
                    summaryMetric("Variants", summary.variantCount)
                    summaryMetric("Supersets", summary.supersetCount)
                }
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(draft.exercises) { exercise in
                        VStack(alignment: .leading, spacing: 0) {
                            Text(exercise.name)
                                .logText(LoggerType.surfaceTitle16)
                                .foregroundStyle(PhysiqueOSTheme.redesignInk)
                                .padding(.bottom, 4)
                            Text(exerciseContext(exercise, draft: draft))
                                .logText(LoggerType.body11)
                                .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                            ForEach(exercise.sets.filter(\.isCompleted)) { set in
                                Text(reviewSetLine(set, measurement: exercise.measurement))
                                    .logText(LoggerType.body11)
                                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                            }
                        }
                        if exercise.id != draft.exercises.last?.id {
                            loggerRule.padding(.vertical, 10)
                        }
                    }
                }
                .loggerSurface()

                do {
                    // Build 20 regression: this whole card (and the only
                    // picker for it) was Sandbox-only despite
                    // `TrainingLoggerDraft`/`EvidenceLocalInterpretation`
                    // being fully authority-agnostic. Restored for both.
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Supporting workout screenshots")
                            .logText(LoggerType.surfaceTitle16)
                            .foregroundStyle(PhysiqueOSTheme.redesignInk)
                            .padding(.bottom, 4)
                        Text("Optional · attach Apple Health screenshots to the exact workout.")
                            .logText(LoggerType.body11)
                            .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                        HStack(spacing: 9) {
                            Button { isSupportingPhotosPickerPresented = true } label: {
                                loggerControlLabel("Photos", systemImage: "photo", tone: .secondaryTall)
                            }
                            .buttonStyle(.plain)
                            Button { isSupportingFilePickerPresented = true } label: {
                                loggerControlLabel("Files", systemImage: "folder", tone: .secondaryTall)
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.top, 10)
                        ForEach(draft.supportingEvidenceAssets) { asset in
                            HStack {
                                Image(systemName: asset.source == .photos ? "photo" : "doc")
                                Text(asset.displayName).lineLimit(1)
                                Spacer()
                                Button { viewModel.removeSupportingEvidence(assetId: asset.id) } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .frame(width: 44, height: 44)
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Remove \(asset.displayName)")
                            }
                            .logText(LoggerType.control11)
                            .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                            .padding(.top, 6)
                        }

                        ForEach(draft.supportingWorkoutObservations) { workout in
                            loggerRule.padding(.top, 10)
                            supportingEvidenceRow(
                                icon: workout.category == "Strength" ? "dumbbell" : "figure.stair.stepper",
                                tone: PhysiqueOSTheme.redesignTeal,
                                title: workout.activityName,
                                lines: [supportingWorkoutMetrics(workout), "\(workout.category) · Apple Health screenshot"]
                            )
                            .accessibilityIdentifier("trainingLogger.supportingWorkout.\(workout.id)")
                        }
                        ForEach(pendingSupportingAssets(draft)) { asset in
                            loggerRule.padding(.top, 10)
                            HStack(spacing: 10) {
                                ProgressView().controlSize(.small).tint(PhysiqueOSTheme.redesignAmber)
                                Text("Reading \(asset.displayName)…")
                                    .logText(LoggerType.control11)
                                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                            }
                            .padding(.top, 10)
                            .accessibilityIdentifier("trainingLogger.supportingWorkout.pending.\(asset.id)")
                        }
                        ForEach(failedSupportingAssets(draft)) { asset in
                            loggerRule.padding(.top, 10)
                            supportingEvidenceRow(
                                icon: "exclamationmark.triangle.fill",
                                tone: PhysiqueOSTheme.redesignAmber,
                                title: "Couldn't read workout details",
                                lines: ["\(asset.displayName) · Workout details weren’t recognized. You can continue without this screenshot."]
                            )
                            .accessibilityIdentifier("trainingLogger.supportingWorkout.failed.\(asset.id)")
                        }
                    }
                    .loggerSurface()
                }
            }
            LoggerExecutionButton(title: "Continue to confirmation", minHeight: 48) { viewModel.go(to: .review) }
                .accessibilityIdentifier("trainingLogger.finishReview")
            secondaryButton("Back to set entry") { viewModel.go(to: .workout) }
        }
    }

    private func supportingEvidenceRow(icon: String, tone: Color, title: String, lines: [String]) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(tone)
                .frame(width: 28, height: 28)
                .background(tone.opacity(0.16), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .logText(LoggerType.rowTitle13)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                ForEach(lines, id: \.self) { line in
                    Text(line)
                        .logText(LoggerType.context10)
                        .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.top, 10)
        .accessibilityElement(children: .combine)
    }

    private func evidence(_ viewModel: TrainingLoggerViewModel) -> some View {
        summary(viewModel) // Build-5 saved drafts migrate directly to the combined review.
    }

    private func review(_ viewModel: TrainingLoggerViewModel) -> some View {
        let finish = LoggerFinishPresentation(viewModel: viewModel)
        return VStack(alignment: .leading, spacing: 12) {
            loggerHeader(
                eyebrow: "Final Confirmation",
                title: "Finish this workout?",
                subtitle: viewModel.authority == .founderProduction
                    ? "Confirm your exercises and completed sets."
                    : "Confirm the workout and any supporting screenshots together."
            )
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark").font(.system(size: 13, weight: .heavy)).accessibilityHidden(true)
                    Text("Workout ready").logText(LoggerType.surfaceTitle16)
                }
                .foregroundStyle(PhysiqueOSTheme.redesignInk)
                .padding(.bottom, 4)
                if let draft = viewModel.draft {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("\(draft.exercises.count) exercises · \(draft.completedSetCount) completed sets")
                            .logText(LoggerType.body11)
                        let strengthCount = draft.supportingWorkoutObservations.filter { $0.category == "Strength" }.count
                        let cardioCount = draft.supportingWorkoutObservations.filter { $0.category == "Cardio" }.count
                        if strengthCount > 0 {
                            Text("\(strengthCount) supporting strength workout\(strengthCount == 1 ? "" : "s")")
                                .logText(LoggerType.body11)
                        }
                        if cardioCount > 0 {
                            Text("\(cardioCount) supporting cardio workout\(cardioCount == 1 ? "" : "s")")
                                .logText(LoggerType.body11)
                        }
                        Text(draft.supportingEvidenceAssets.isEmpty ? "No supporting screenshots attached" : "\(draft.supportingEvidenceAssets.count) supporting screenshot\(draft.supportingEvidenceAssets.count == 1 ? "" : "s") attached")
                            .logText(LoggerType.body11)
                    }
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                }
                if viewModel.authority == .sandbox, viewModel.draft?.exercises.contains(where: \.isProvisional) == true {
                    Text("New exercises will remain attached to this workout.")
                        .logText(LoggerType.control11)
                        .foregroundStyle(PhysiqueOSTheme.redesignAmber)
                        .padding(.top, 6)
                }
            }
            .loggerSurface(tone: PhysiqueOSTheme.redesignGreen, toneFill: 0.13, toneRule: 0.36)
            validation(viewModel)
            if let message = viewModel.processingMessage {
                Text(message)
                    .logText(LoggerType.fieldTitle12)
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
            }
            FinishProgressStatus(viewModel: viewModel)
            // D2: finish legs bound to real state only.
            VStack(spacing: 0) {
                finishLegRow("PhysiqueOS", value: finish.physiqueOSLeg.label, tone: finish.physiqueOSLeg.tone)
                if let health = finish.appleHealthLeg {
                    loggerRule.padding(.vertical, 9)
                    finishLegRow("Apple Health", value: health.label, tone: health.tone)
                }
                if finish.showsOperationRow {
                    loggerRule.padding(.vertical, 9)
                    finishLegRow("Workout operation", value: "same key", tone: PhysiqueOSTheme.redesignUtilityMuted)
                }
            }
            .loggerSurface()
            .accessibilityElement(children: .contain)
            LoggerExecutionButton(
                title: finish.buttonTitle,
                isEnabled: !(viewModel.isSubmitting || viewModel.isAwaitingDurability) && !finish.forcedBusy,
                minHeight: 48
            ) {
                viewModel.finish()
            }
                .accessibilityIdentifier("trainingLogger.completeLocal")
            if !viewModel.isSubmitting, !viewModel.isAwaitingDurability, !viewModel.isFinishConfirmed, !finish.forcedBusy {
                secondaryButton("Back to Workout Review") { viewModel.go(to: .summary) }
            }
            if viewModel.canDiscardFailedConfirmedFinish || finish.forcedDiscard {
                Button {
                    showingDiscardFailedFinishConfirmation = true
                } label: {
                    loggerControlLabel("Discard Saved Workout", systemImage: "trash", tone: .destructiveTall)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("trainingLogger.discardFailedConfirmedFinish")
            }
        }
    }

    private func finishLegRow(_ title: String, value: String, tone: Color) -> some View {
        HStack {
            Text(title).foregroundStyle(PhysiqueOSTheme.redesignInk)
            Spacer(minLength: 8)
            Text(value).foregroundStyle(tone)
        }
        .logText(LoggerType.leg14)
        .accessibilityElement(children: .combine)
    }

    private func complete(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            loggerHeader(eyebrow: "Workout Complete", title: "Workout logged", subtitle: "Your workout review is complete.")
            if let warning = viewModel.refreshWarning {
                Text(warning)
                    .logText(LoggerType.body11)
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
            }
            WorkoutCompleteConfirmation(compact: !viewModel.completedPerformanceRecords.isEmpty)
            if !viewModel.completedPerformanceRecords.isEmpty {
                NewPerformanceRecordsCard(
                    records: viewModel.completedPerformanceRecords,
                    celebrationKey: viewModel.draft.map { "physiqueos.workoutComplete.celebrated.\($0.id)" },
                    // Hidden behind another tab, or the app is not on screen
                    // (phone locked / app switched): the one-shot must wait.
                    isPresentationVisible: isSurfaceVisible && scenePhase == .active
                )
            }
            LoggerExecutionButton(title: "Return to Log", minHeight: 48) {
                viewModel.acknowledgeCompletion()
                dismiss()
            }
        }
#if DEBUG
        .onAppear { LoggerReviewSeam.injectRecordsIfRequested(into: viewModel) }
#endif
        // A Watch Finish can complete while the phone is suspended; records
        // still unknown are re-read from the Server once the screen is back.
        .onAppear { viewModel.refreshCompletedPerformanceRecordsIfUnknown() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { viewModel.refreshCompletedPerformanceRecordsIfUnknown() }
        }
    }

    /// Honest, bounded Finish progress: after `stillSavingThreshold` the
    /// screen says the workout is safe on this iPhone, whether the network is
    /// the reason, and offers a same-key Retry. Never a destructive Cancel.
    private struct FinishProgressStatus: View {
        let viewModel: TrainingLoggerViewModel
        @State private var connectivity = CommandConnectivityStatus.shared

        var body: some View {
            SwiftUI.TimelineView(.periodic(from: .now, by: 1)) { context in
                let forced = LoggerReviewSeam.forcedFinish
                if viewModel.isStillSaving(at: context.date) || forced == "waiting" || forced == "still-saving" {
                    let waiting = forced == "waiting" || (forced == nil && connectivity.isWaitingForNetwork)
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: 4) {
                            Image(systemName: waiting ? "wifi.exclamationmark" : "clock")
                                .font(.system(size: 12, weight: .bold))
                                .accessibilityHidden(true)
                            Text(waiting ? "Waiting for network" : "Still saving")
                                .logText(LoggerType.surfaceTitle16)
                        }
                        .foregroundStyle(PhysiqueOSTheme.redesignInk)
                        .padding(.bottom, 4)
                        Text("Your workout is safe on this iPhone. Retry sends the same workout again; it can never be saved twice.")
                            .logText(LoggerType.body11)
                            .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Button { viewModel.retryFinish() } label: {
                            Text("Retry")
                                .logText(LoggerType.control14)
                                .foregroundStyle(PhysiqueOSTheme.redesignInk)
                                .frame(maxWidth: .infinity, minHeight: 48)
                                .background(PhysiqueOSTheme.redesignSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(PhysiqueOSTheme.redesignHairline, lineWidth: 1))
                                .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 10)
                        .accessibilityIdentifier("trainingLogger.retryFinish")
                    }
                    .loggerSurface(tone: PhysiqueOSTheme.redesignAmber)
                }
            }
        }
    }

    /// The canonical records this session established, exactly as the Server
    /// reported them, with a small one-time celebration. Absent entirely when
    /// there is no new record.
    private struct NewPerformanceRecordsCard: View {
        let records: [TrainingPerformanceRecord]
        /// Per-session key: the confetti plays on the first presentation only.
        let celebrationKey: String?
        let isPresentationVisible: Bool
        static let visibleLimit = 3
        @Environment(AppEnvironment.self) private var environment
        @Environment(\.accessibilityReduceMotion) private var reduceMotion
        @State private var celebrate = false

        var body: some View {
            let presentation = NewPerformanceRecordsPresentation(records: records, visibleLimit: Self.visibleLimit)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 5) {
                    Image(systemName: "star.fill").font(.system(size: 13, weight: .bold)).accessibilityHidden(true)
                    Text("New performance records").logText(LoggerType.surfaceTitle16)
                }
                .foregroundStyle(PhysiqueOSTheme.redesignGreen)
                .padding(.bottom, 4)
                .accessibilityAddTraits(.isHeader)
                ForEach(Array(presentation.groups.enumerated()), id: \.element.id) { index, group in
                    VStack(alignment: .leading, spacing: 0) {
                        Text(group.canonicalExerciseName)
                            .logText(LoggerType.fieldTitle12)
                            .foregroundStyle(PhysiqueOSTheme.redesignInk)
                        ForEach(group.records) { record in
                            VStack(alignment: .leading, spacing: 0) {
                                Text("\(record.title) · \(record.value)").logText(LoggerType.recordLine10)
                                if let detail = record.detail { Text(detail).logText(LoggerType.context10) }
                            }
                            .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                            .accessibilityElement(children: .combine)
                        }
                    }
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .bottom) {
                        if index < presentation.groups.count - 1 || presentation.moreLabel != nil {
                            Rectangle().fill(PhysiqueOSTheme.redesignHairline).frame(height: 1)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
                if let more = presentation.moreLabel {
                    Text(more)
                        .logText(LoggerType.context10)
                        .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                        .padding(.top, 10)
                }
            }
            .loggerSurface(tone: PhysiqueOSTheme.redesignGreen, toneFill: 0.13, toneRule: 0.36)
            .overlay(alignment: .top) {
                if celebrate { ConfettiBurst().allowsHitTesting(false).accessibilityHidden(true) }
            }
            .onAppear {
                attemptCelebration()
            }
            .onChange(of: isPresentationVisible) {
                attemptCelebration()
            }
        }

        private func attemptCelebration() {
            guard WorkoutCelebrationGate.present(
                key: celebrationKey,
                hasRecords: !records.isEmpty,
                reduceMotion: reduceMotion,
                presentationVisible: isPresentationVisible,
                feedback: environment.feedback
            ) else { return }
            celebrate = true
        }
    }

    /// A short, self-contained confetti pop (under one second), then gone.
    /// Build 85 increases only the local particle size/count/spread; the
    /// one-time and Reduce Motion gates remain owned by the card above.
    private struct ConfettiBurst: View {
        private struct Piece: Identifiable {
            let id: Int
            let dx: CGFloat, dy: CGFloat, spin: Double, color: Color, size: CGFloat
        }
        @State private var launched = false
        private let pieces: [Piece] = (0..<PerformanceRecordConfettiStyle.particleCount).map { index in
            let colors: [Color] = [PhysiqueOSTheme.chartSuccess, PhysiqueOSTheme.accent, PhysiqueOSTheme.chartEvidence, PhysiqueOSTheme.chartEffort]
            let angle = Double(index) / Double(PerformanceRecordConfettiStyle.particleCount) * 2 * .pi
            return Piece(id: index,
                         dx: CGFloat(cos(angle)) * (PerformanceRecordConfettiStyle.horizontalBaseSpread
                            + CGFloat((index * 37) % PerformanceRecordConfettiStyle.horizontalSpreadVariants)),
                         dy: CGFloat(sin(angle)) * (PerformanceRecordConfettiStyle.verticalBaseSpread
                            + CGFloat((index * 53) % PerformanceRecordConfettiStyle.verticalSpreadVariants))
                            + PerformanceRecordConfettiStyle.verticalDrop,
                         spin: Double((index * 97) % 360),
                         color: colors[index % colors.count],
                         size: PerformanceRecordConfettiStyle.minimumParticleSize
                            + CGFloat(index % PerformanceRecordConfettiStyle.particleSizeVariants))
        }

        var body: some View {
            ZStack {
                ForEach(pieces) { piece in
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(piece.color)
                        .frame(width: piece.size, height: piece.size * 1.8)
                        .rotationEffect(.degrees(launched ? piece.spin : 0))
                        .offset(x: launched ? piece.dx : 0, y: launched ? piece.dy : 0)
                        .opacity(launched ? 0 : 1)
                }
            }
            .frame(maxWidth: .infinity)
            .onAppear {
                withAnimation(.easeOut(duration: PerformanceRecordConfettiStyle.duration)) { launched = true }
            }
        }
    }

    /// Locked completion mark: a large green check and "Workout confirmed";
    /// compact above the records card (L15), roomy without records (L14).
    private struct WorkoutCompleteConfirmation: View {
        var compact = false
        @State private var scale: CGFloat = 0.6
        @State private var opacity: Double = 0
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        var body: some View {
            VStack(spacing: 8) {
                Image(systemName: "checkmark")
                    .font(.system(size: compact ? 40 : 44, weight: .heavy))
                    .foregroundStyle(PhysiqueOSTheme.redesignGreen)
                    .scaleEffect(scale)
                    .accessibilityHidden(true)
                Text("Workout confirmed")
                    .logText(LoggerType.confirmed20)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
            }
            .opacity(opacity)
            .frame(maxWidth: .infinity)
            .padding(.vertical, compact ? 13 : 30)
            .accessibilityElement(children: .combine)
            .onAppear {
                guard !reduceMotion else {
                    scale = 1
                    opacity = 1
                    return
                }
                withAnimation(.spring(response: 0.45, dampingFraction: 0.65)) { scale = 1 }
                withAnimation(.easeOut(duration: 0.3)) { opacity = 1 }
            }
        }
    }

    /// Locked Logger step header: purple eyebrow, 28 pt tight display title,
    /// 13 pt secondary subtitle.
    private func loggerHeader(eyebrow: String, title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(eyebrow).logText(LoggerType.eyebrow10).foregroundStyle(PhysiqueOSTheme.redesignPurple)
            Text(title)
                .logText(LoggerType.stepTitle28)
                .foregroundStyle(PhysiqueOSTheme.redesignInk)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 5)
                .padding(.bottom, 6)
            Text(subtitle)
                .logText(LoggerType.stepSubtitle13)
                .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    private func stepHeader(_ viewModel: TrainingLoggerViewModel, step: String, title: String, subtitle: String) -> some View {
        loggerHeader(eyebrow: step, title: title, subtitle: subtitle)
    }

    private func actionCard(icon: String, title: String, detail: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            CardContainer(background: PhysiqueOSTheme.surfaceAccent) {
                HStack(spacing: 12) {
                    IconBadge(systemImage: icon, color: .primary, size: .md)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(title).physiqueOSFont(PhysiqueOSTypography.cardHeading16).foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text(detail).physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(PhysiqueOSTheme.accent)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func infoRow(icon: String, title: String, value: String) -> some View {
        HStack {
            Label(title, systemImage: icon)
            Spacer()
            Text(value)
        }
        .logText(LoggerType.control11)
        .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
    }

    private func validation(_ viewModel: TrainingLoggerViewModel) -> some View {
        Group {
            if let message = viewModel.validationMessage {
                HStack(alignment: .top, spacing: 9) {
                    Image(systemName: "exclamationmark")
                        .font(.system(size: 11, weight: .black))
                        .foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(PhysiqueOSTheme.redesignRed, in: Circle())
                        .accessibilityHidden(true)
                    Text(message)
                        .logText(LoggerType.fieldTitle12)
                        .foregroundStyle(PhysiqueOSTheme.redesignInk)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(PhysiqueOSTheme.redesignRed.opacity(0.09), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(PhysiqueOSTheme.redesignRed.opacity(0.42), lineWidth: 1))
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Training Logger issue. \(message)")
                .accessibilityIdentifier("trainingLogger.validation")
            }
        }
    }

    /// Quiet secondary action (locked secondary-btn: soft surface + rule).
    private func secondaryButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .logText(LoggerType.control14)
                .foregroundStyle(PhysiqueOSTheme.redesignInk)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(PhysiqueOSTheme.redesignSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(PhysiqueOSTheme.redesignHairline, lineWidth: 1))
                .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func summaryMetric(_ title: String, _ value: Int) -> some View {
        VStack(spacing: 0) {
            Text("\(value)").logText(LoggerType.metricValue15).foregroundStyle(PhysiqueOSTheme.redesignInk)
            Text(title).logText(LoggerType.metricLabel8).foregroundStyle(PhysiqueOSTheme.redesignUtilityMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .padding(.horizontal, 5)
        .background(PhysiqueOSTheme.redesignPaper, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func failure(_ message: String) -> some View {
        Text(message)
            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
            .foregroundStyle(PhysiqueOSTheme.textSecondary)
            .padding()
    }

    /// Card context line. A superset member leads with its locked group
    /// label ("SUPERSET A"), derived from relationship order without
    /// reordering anything; other cards keep the canonical context copy.
    private func exerciseContextText(_ exercise: TrainingLoggerDraftExercise, draft: TrainingLoggerDraft?) -> Text {
        guard let draft, let letter = LoggerSupersetLabel.letter(for: exercise.id, in: draft) else {
            return Text(exerciseContext(exercise, draft: draft))
        }
        var parts: [String] = [exercise.executionVariant?.label ?? "Ordinary"]
        if exercise.isProvisional { parts.append("Provisional") }
        return Text("SUPERSET \(letter)").fontWeight(.bold).tracking(0.6)
            + Text(" · " + parts.joined(separator: " · "))
    }

    private func exerciseContext(_ exercise: TrainingLoggerDraftExercise, draft: TrainingLoggerDraft?) -> String {
        var parts: [String] = []
        if let variant = exercise.executionVariant { parts.append(variant.label) }
        if let relationship = draft?.relationshipContext(for: exercise.id) { parts.append(relationship.label) }
        if exercise.isProvisional { parts.append("Provisional") }
        return parts.isEmpty ? "Ordinary · Standalone" : parts.joined(separator: " · ")
    }

    private func numericBinding(
        _ viewModel: TrainingLoggerViewModel,
        exerciseId: String,
        setId: String,
        field: TrainingSessionSetField
    ) -> Binding<String> {
        let bufferKey = "\(exerciseId)|\(setId)|\(field.bufferName)"
        return Binding(
            get: {
                if let buffer = numericEditBuffers[bufferKey] { return buffer }
                guard let value = viewModel.draft?.exercises.first(where: { $0.id == exerciseId })?.sets.first(where: { $0.id == setId })?[keyPath: field.keyPath] else { return "" }
                return value.rounded() == value ? String(Int(value)) : String(value)
            },
            set: { text in
                numericEditBuffers[bufferKey] = text
                viewModel.setValue(exerciseId: exerciseId, setId: setId, field: field, value: NumericEditingContract.parsedValue(text))
            }
        )
    }

    private func reviewSetLine(_ set: TrainingLoggerDraftSet, measurement: TrainingLoggerMeasurement) -> String {
        switch measurement {
        case .repsLoad:
            return "Set \(set.setNumber) · \(formatNumber(set.reps)) reps × \(formatNumber(set.load)) lb"
        case .bodyweightReps:
            return "Set \(set.setNumber) · \(formatNumber(set.reps)) reps · Bodyweight"
        case .duration:
            return "Set \(set.setNumber) · \(formatNumber(set.durationSeconds)) seconds"
        }
    }

    private func formatNumber(_ value: Double?) -> String {
        guard let value else { return "—" }
        return value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }

    private func supportingWorkoutMetrics(_ workout: TrainingLoggerSupportingWorkout) -> String {
        var parts = ["\(formatNumber(workout.durationMinutes)) min"]
        if let calories = workout.activeCalories { parts.append("\(formatNumber(calories)) active cal") }
        if let totalCalories = workout.totalCalories { parts.append("\(formatNumber(totalCalories)) total cal") }
        if let heartRate = workout.averageHeartRate { parts.append("\(formatNumber(heartRate)) bpm avg") }
        if let distance = workout.distance { parts.append("\(formatNumber(distance)) \(workout.distanceUnit ?? "mi")") }
        return parts.joined(separator: " · ")
    }

    /// Assets currently mid-read — cross-referenced against the transient
    /// `pendingInterpretationAssetIDs` set rather than anything persisted
    /// on the draft.
    private func pendingSupportingAssets(_ draft: TrainingLoggerDraft) -> [TrainingLoggerSupportingEvidence] {
        draft.supportingEvidenceAssets.filter { pendingInterpretationAssetIDs.contains($0.id) }
    }

    private func failedSupportingAssets(_ draft: TrainingLoggerDraft) -> [TrainingLoggerSupportingEvidence] {
        let failedIds = Set(draft.supportingWorkoutFailureIds)
        return draft.supportingEvidenceAssets.filter { failedIds.contains($0.id) }
    }

    private func numericEditingChanged(_ editing: Bool) {
        if editing {
            isNumericKeyboardVisible = true
        } else {
            DispatchQueue.main.async {
                isNumericKeyboardVisible = focusedNumericFieldID != nil
            }
        }
    }
}

// MARK: - Locked utility presentation (Batch 2)

/// Text roles from the locked Training Logger utility package, expressed as
/// CSS-faithful `LogType`s (the harness uses the font's natural line height
/// unless a role sets one).
enum LoggerType {
    static let eyebrow10 = LogType(size: 10, weight: 760, lineHeight: 1.26, trackingEm: 0.12, uppercase: true)
    static let eyebrow8 = LogType(size: 8, weight: 760, lineHeight: 1.26, trackingEm: 0.06, uppercase: true)
    static let workoutTitle23 = LogType(size: 23, weight: 700, lineHeight: 1.26)
    static let meta11 = LogType(size: 11, weight: 400, lineHeight: 1.26)
    static let pill10 = LogType(size: 10, weight: 400, lineHeight: 1.26)
    static let pill10Strong = LogType(size: 10, weight: 700, lineHeight: 1.26)
    static let control11 = LogType(size: 11, weight: 760, lineHeight: 1.26)
    static let control14 = LogType(size: 14, weight: 760, lineHeight: 1.26)
    static let fieldTitle12 = LogType(size: 12, weight: 700, lineHeight: 1.26)
    static let fieldCaption9 = LogType(size: 9, weight: 400, lineHeight: 1.26)
    static let cardTitle15 = LogType(size: 15, weight: 700, lineHeight: 1.26)
    static let context10 = LogType(size: 10, weight: 400, lineHeight: 1.26)
    static let columnHeader8 = LogType(size: 8, weight: 760, lineHeight: 1.26, uppercase: true)
    static let setNumber12 = LogType(size: 12, weight: 700, lineHeight: 1.26)
    static let addSet11 = LogType(size: 11, weight: 760, lineHeight: 1.26)
    static let menuDots = LogType(size: 15, weight: 700, lineHeight: 1.26)
    static let execution14 = LogType(size: 14, weight: 760, lineHeight: 1.26)
    static let stepTitle28 = LogType(size: 28, weight: 700, lineHeight: 1.05, trackingEm: -0.04)
    static let stepSubtitle13 = LogType(size: 13, weight: 400, lineHeight: 1.4)
    static let surfaceTitle16 = LogType(size: 16, weight: 700, lineHeight: 1.26)
    static let body11 = LogType(size: 11, weight: 400, lineHeight: 1.4)
    static let rowTitle14 = LogType(size: 14, weight: 700, lineHeight: 1.26)
    static let rowTitle13 = LogType(size: 13, weight: 700, lineHeight: 1.26)
    static let choice12 = LogType(size: 12, weight: 700, lineHeight: 1.26)
    static let link11 = LogType(size: 11, weight: 700, lineHeight: 1.26)
    static let leg14 = LogType(size: 16, weight: 400, lineHeight: 1.26)
    static let metricValue15 = LogType(size: 15, weight: 700, lineHeight: 1.26)
    // The locked label is an inline <small> inside the tile, so its line box
    // follows the 16 px parent strut (20.2 pt), not the 8 pt glyphs.
    static let metricLabel8 = LogType(size: 8, weight: 400, lineHeight: 2.52, uppercase: true)
    // Record values are inline spans after a block title: 16 px strut line.
    static let recordLine10 = LogType(size: 10, weight: 400, lineHeight: 2.02)
    static let candidateLine10 = LogType(size: 10, weight: 400, lineHeight: 1.26)
    // Inline <strong> titles sit on the 16 px parent strut (20.2 pt line).
    static let strutTitle12 = LogType(size: 12, weight: 700, lineHeight: 1.68)
    static let strutTitle13 = LogType(size: 13, weight: 700, lineHeight: 1.55)
    static let confirmed20 = LogType(size: 20, weight: 700, lineHeight: 1.26)
    static let fieldValuePointSize: CGFloat = 16
    static let fieldValueWeight: CGFloat = 600
    static var fieldValueFont: UIFont {
        PlusJakartaSans.uiFont(size: UIFontMetrics.default.scaledValue(for: fieldValuePointSize), weight: fieldValueWeight)
    }
}

/// Superset group letters in the order groups first appear in the workout.
/// Presentation only: it never reorders exercises or relationships.
enum LoggerSupersetLabel {
    static func letter(for exerciseId: String, in draft: TrainingLoggerDraft) -> String? {
        let groups = draft.relationships.filter { $0.relationshipType == "superset" }
        guard let group = groups.first(where: { $0.memberExerciseIds.contains(exerciseId) }) else { return nil }
        func firstPosition(_ g: TrainingLoggerDraftRelationship) -> Int {
            g.memberExerciseIds.compactMap { id in draft.exercises.firstIndex(where: { $0.id == id }) }.min() ?? Int.max
        }
        let ordered = groups.sorted { firstPosition($0) < firstPosition($1) }
        guard let index = ordered.firstIndex(where: { $0.id == group.id }) else { return nil }
        let scalars = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        return index < scalars.count ? String(scalars[index]) : "\(index + 1)"
    }
}

/// Locked focused numeric field: teal border plus a 2 pt 22% teal halo.
struct LoggerFieldFocus: ViewModifier {
    let isFocused: Bool

    func body(content: Content) -> some View {
        content.overlay {
            if isFocused {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(PhysiqueOSTheme.redesignTeal, lineWidth: 1)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .stroke(PhysiqueOSTheme.redesignTeal.opacity(0.22), lineWidth: 2)
                            .padding(-1)
                    )
                    .allowsHitTesting(false)
            }
        }
    }
}

/// Locked amber execution action (Finish): 52 pt, 14 pt radius, dark ink in
/// both appearances; disabled keeps the label legible at reduced opacity.
struct LoggerExecutionButton: View {
    let title: String
    var isEnabled: Bool = true
    var minHeight: CGFloat = 52
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .logText(LoggerType.execution14)
                .foregroundStyle(PhysiqueOSTheme.redesignOnExecution)
                .frame(maxWidth: .infinity, minHeight: minHeight)
                .background(PhysiqueOSTheme.redesignAmber, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1 : 0.5)
    }
}

extension View {
    /// Locked utility surface: 15 pt radius, hairline, paper fill; an
    /// optional semantic tone gives the amber/green 17%/44% field variant.
    func loggerSurface(padding: CGFloat = 14, tone: Color? = nil, toneFill: Double = 0.17, toneRule: Double = 0.44) -> some View {
        let shape = RoundedRectangle(cornerRadius: 15, style: .continuous)
        return self
            .padding(padding)
            // The 1 pt border belongs to the box (CSS default content-box).
            .padding(1)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                shape.fill(PhysiqueOSTheme.redesignPaper)
                if let tone { shape.fill(tone.opacity(toneFill)) }
            }
            .clipShape(shape)
            .overlay(shape.strokeBorder(tone.map { $0.opacity(toneRule) } ?? PhysiqueOSTheme.redesignHairline, lineWidth: 1))
    }

    /// Locked search/input field: 12 pt radius, hairline, paper fill.
    func loggerInputSurface() -> some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        return self
            .background(PhysiqueOSTheme.redesignPaper, in: shape)
            .overlay(shape.strokeBorder(PhysiqueOSTheme.redesignHairline, lineWidth: 1))
    }
}

/// Final Confirmation presentation (Batch 2 D2): every leg is bound to real
/// state. PhysiqueOS follows the actual submission; Apple Health appears only
/// when this workout expects a Watch-recorded HealthKit workout.
struct LoggerFinishPresentation {
    struct Leg {
        var label: String
        var tone: Color
    }

    var physiqueOSLeg: Leg
    var appleHealthLeg: Leg?
    var buttonTitle: String
    var showsOperationRow: Bool
    /// DEBUG parity seam only; always false in Release.
    var forcedBusy = false
    var forcedDiscard = false

    @MainActor
    init(viewModel: TrainingLoggerViewModel) {
        let forced = LoggerReviewSeam.forcedFinish
        forcedBusy = ["saving", "waiting", "still-saving"].contains(forced ?? "")
        forcedDiscard = forced == "retry"
        let awaiting = viewModel.isAwaitingDurability || forced == "waiting" || forced == "still-saving"
        let submitting = viewModel.isSubmitting || forced == "saving"
        let confirmed = viewModel.isFinishConfirmed || forced != nil
        // Same precedence as the canonical button title.
        buttonTitle = awaiting ? "Finishing workout…"
            : submitting ? "Saving…"
            : confirmed ? "Retry Finish" : "Finish Workout"
        physiqueOSLeg = awaiting || submitting
            ? Leg(label: "Pending", tone: PhysiqueOSTheme.redesignAmberInk)
            : confirmed
                ? Leg(label: "Not saved yet", tone: PhysiqueOSTheme.redesignRed)
                : Leg(label: "Ready", tone: PhysiqueOSTheme.redesignGreen)
        let draft = viewModel.draft
        if let draft, draft.expectsWatchHealthWorkout {
            switch draft.watchHealthSaveState {
            case nil: appleHealthLeg = Leg(label: "After save", tone: PhysiqueOSTheme.redesignUtilityMuted)
            case .pending: appleHealthLeg = Leg(label: "Saving", tone: PhysiqueOSTheme.redesignAmberInk)
            case .succeeded: appleHealthLeg = Leg(label: "Saved", tone: PhysiqueOSTheme.redesignGreen)
            case .failed: appleHealthLeg = Leg(label: "Not saved", tone: PhysiqueOSTheme.redesignRed)
            }
        } else {
            appleHealthLeg = nil
        }
        showsOperationRow = draft?.watchFinishOperationId != nil || (forced != nil && forced != "ready")
    }
}

/// DEBUG-only parity seams for states the sandbox cannot reach (Server
/// durability waits, Server-only performance records). Presentation only:
/// nothing here touches the session authority. Release builds compile to nil.
enum LoggerReviewSeam {
    static var forcedFinish: String? {
#if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-physiqueos.logger-review.finish"),
              arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
#else
        return nil
#endif
    }

#if DEBUG
    @MainActor
    static func injectRecordsIfRequested(into viewModel: TrainingLoggerViewModel) {
        guard ProcessInfo.processInfo.arguments.contains("-physiqueos.logger-review.records"),
              viewModel.completedPerformanceRecords.isEmpty else { return }
        let json = #"""
        [{"id":"review-pr-1","canonicalExerciseId":"bench_press","canonicalExerciseName":"Bench Press","title":"Reps at load","value":"10 reps at 135 lb","workoutDate":"2026-10-03","achievedValue":10,"achievementType":"reps_at_load_pr","sourceEventId":"review-event-1"},
         {"id":"review-pr-2","canonicalExerciseId":"session","canonicalExerciseName":"Chest session","title":"Volume","value":"8,450 lb","workoutDate":"2026-10-03","achievedValue":8450,"achievementType":"session_volume_pr","sourceEventId":"review-event-2"}]
        """#
        if let records = try? JSONDecoder().decode([TrainingPerformanceRecord].self, from: Data(json.utf8)) {
            viewModel.completedPerformanceRecords = records
        }
    }
#endif
}

// MARK: - Docked Logger clock (Founder Build 90, Option A)

/// What the docked clock beside Finish Workout shows, derived only from the
/// canonical session (`draft.rest` and the start/pause anchors) that also
/// feeds the Watch and the Live Activity; nothing here ticks or owns state.
/// Hidden exactly where every other surface hides rest (Build 83): Finish
/// confirmation, after finish, and during submission.
struct TrainingLoggerClockPresentation: Equatable {
    enum Kind: Equatable {
        /// The canonical rest interval (stopwatch counts up, countdown down).
        case rest(id: String, mode: TrainingRestMode)
        /// No rest running: elapsed workout time (the Live Activity rule).
        case workout
    }

    var kind: Kind
    /// Count-up origin (rest start, or workout start shifted by pauses).
    var anchor: Date
    /// Countdown end.
    var endsAt: Date?
    /// Paused (from the Watch): the clock holds this value.
    var frozenSeconds: Double?

    var isRest: Bool { if case .rest = kind { true } else { false } }
    var restId: String? { if case .rest(let id, _) = kind { id } else { nil } }
    var isCountdown: Bool { if case .rest(_, .countdown) = kind { true } else { false } }
    var glyph: String { isCountdown ? "timer" : "stopwatch" }
    var label: String { isRest ? "Rest" : "Workout" }
    var accessibilityLabel: String { isRest ? (isCountdown ? "Rest countdown" : "Rest stopwatch") : "Workout time" }
    /// End Rest is offered while a rest is running (not while paused: the
    /// authority refuses content changes on a paused session).
    var canEndRest: Bool { isRest && frozenSeconds == nil }

    static func make(draft: TrainingLoggerDraft?) -> Self? {
        guard let draft, draft.mode == .live, draft.step == .workout,
              draft.finishConfirmationRequestedAt == nil, draft.finishedAt == nil,
              draft.submissionState == nil,
              let started = draft.startedAt.flatMap(TrainingSessionClock.date(from:))
        else { return nil }
        if let rest = draft.rest, let restStart = rest.startedAtDate {
            let frozen = rest.mode == .countdown ? rest.frozenRemainingSeconds : rest.frozenElapsedSeconds
            return .init(kind: .rest(id: rest.id, mode: rest.mode), anchor: restStart, endsAt: rest.endsAtDate, frozenSeconds: frozen)
        }
        let paused = draft.accumulatedPausedSeconds ?? 0
        let anchor = started.addingTimeInterval(paused)
        let frozen = draft.pausedAt.flatMap(TrainingSessionClock.date(from:)).map { max(0, $0.timeIntervalSince(anchor)) }
        return .init(kind: .workout, anchor: anchor, endsAt: nil, frozenSeconds: frozen)
    }

    static func clockText(_ seconds: Double) -> String {
        let total = max(0, Int(seconds))
        return total >= 3600
            ? String(format: "%d:%02d:%02d", total / 3600, (total % 3600) / 60, total % 60)
            : String(format: "%d:%02d", total / 60, total % 60)
    }
}

/// The docked clock tile beside Finish Workout: green glyph, label and a
/// declarative clock (`Text(timerInterval:)`, the Live Activity's renderer),
/// with a restrained End action while rest is running.
struct TrainingLoggerClockTile: View {
    let presentation: TrainingLoggerClockPresentation
    let onEndRest: (String) -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
        HStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: presentation.glyph)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(PhysiqueOSTheme.redesignGreen)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    Text(presentation.label)
                        .logText(LoggerType.eyebrow8)
                        .foregroundStyle(presentation.isRest ? PhysiqueOSTheme.redesignGreen : PhysiqueOSTheme.redesignUtilityMuted)
                    clock
                        .font(Font(PlusJakartaSans.uiFont(size: 19, weight: 700)))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .foregroundStyle(PhysiqueOSTheme.redesignInk)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(presentation.accessibilityLabel)
            .accessibilityIdentifier("trainingLogger.workoutClock")
            if presentation.canEndRest, let restId = presentation.restId {
                Spacer(minLength: 0)
                Button { onEndRest(restId) } label: {
                    Text("End")
                        .logText(LoggerType.control11)
                        .foregroundStyle(PhysiqueOSTheme.redesignInk)
                        .padding(.horizontal, 10)
                        .frame(height: 28)
                        .background(PhysiqueOSTheme.redesignSoft, in: Capsule())
                        .overlay(Capsule().strokeBorder(PhysiqueOSTheme.redesignHairline, lineWidth: 1))
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("End rest")
                .accessibilityIdentifier("trainingLogger.endRest")
            }
        }
        .padding(.leading, 12)
        .padding(.trailing, presentation.canEndRest ? 4 : 12)
        .frame(width: presentation.canEndRest ? 168 : 120, height: 52, alignment: .leading)
        .background(presentation.isRest ? PhysiqueOSTheme.redesignGreen.opacity(0.1) : PhysiqueOSTheme.redesignSoft, in: shape)
        .overlay(shape.strokeBorder(presentation.isRest ? PhysiqueOSTheme.redesignGreen.opacity(0.55) : PhysiqueOSTheme.redesignHairline, lineWidth: 1))
    }

    @ViewBuilder private var clock: some View {
        if let frozen = presentation.frozenSeconds {
            Text(TrainingLoggerClockPresentation.clockText(frozen))
        } else if presentation.isCountdown {
            let end = max(presentation.endsAt ?? presentation.anchor, presentation.anchor.addingTimeInterval(1))
            Text(timerInterval: presentation.anchor...end, countsDown: true, showsHours: false)
        } else {
            Text(timerInterval: presentation.anchor...presentation.anchor.addingTimeInterval(24 * 3600), countsDown: false, showsHours: false)
        }
    }
}

// MARK: - Guided Watch handoff card (Founder Build 90, Option B)

/// The centered handoff card shown over the dimmed Logger.
struct TrainingWatchHandoffCard: View {
    let phase: TrainingWatchHandoffModel.Phase
    let primary: () -> Void
    let secondary: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                glyph
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .logText(LoggerType.surfaceTitle16)
                        .foregroundStyle(PhysiqueOSTheme.redesignInk)
                        .accessibilityAddTraits(.isHeader)
                    Text(message)
                        .logText(LoggerType.body11)
                        .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            if let primaryTitle {
                Button(action: primary) {
                    Text(primaryTitle)
                        .logText(LoggerType.execution14)
                        // Paper reads near-white on Mineral's deep purple and
                        // deep ink on Dark's light purple.
                        .foregroundStyle(PhysiqueOSTheme.redesignPaper)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(PhysiqueOSTheme.redesignPurple, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("trainingLogger.watchHandoff.primary")
            }
            if let secondaryTitle {
                Button(action: secondary) {
                    Text(secondaryTitle)
                        .logText(LoggerType.control14)
                        .foregroundStyle(PhysiqueOSTheme.redesignInk)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(PhysiqueOSTheme.redesignSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(PhysiqueOSTheme.redesignHairline, lineWidth: 1))
                        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("trainingLogger.watchHandoff.useWithoutWatch")
            }
            if let footnote {
                Text(footnote)
                    .logText(LoggerType.fieldCaption9)
                    .foregroundStyle(PhysiqueOSTheme.redesignUtilityMuted)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(18)
        .background(PhysiqueOSTheme.redesignPaper, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(PhysiqueOSTheme.redesignHairline, lineWidth: 1))
        .shadow(color: .black.opacity(0.25), radius: 24, y: 8)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        .accessibilityIdentifier("trainingLogger.watchHandoff")
    }

    @ViewBuilder private var glyph: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12, style: .continuous).fill(tint.opacity(0.14))
            if phase == .waiting {
                ProgressView().tint(tint)
            } else {
                Image(systemName: symbol).font(.system(size: 19, weight: .semibold)).foregroundStyle(tint)
            }
        }
        .frame(width: 42, height: 42)
        .accessibilityHidden(true)
    }

    private var symbol: String {
        switch phase {
        case .acknowledged: "checkmark.circle.fill"
        case .unreachable: "applewatch.slash"
        default: "applewatch"
        }
    }

    private var tint: Color {
        switch phase {
        case .acknowledged: PhysiqueOSTheme.redesignGreen
        case .unreachable: PhysiqueOSTheme.redesignAmber
        default: PhysiqueOSTheme.redesignPurple
        }
    }

    var title: String {
        switch phase {
        case .offer: "Log this workout on Apple Watch?"
        case .waiting: "Waiting for your Watch"
        case .acknowledged: "Started on Watch"
        case .unreachable: "Watch not reachable"
        case .hidden: ""
        }
    }

    /// Truthful: watchOS may not bring PhysiqueOS to the front (locked,
    /// asleep, off-wrist, out of range), so waiting always says how to start
    /// it by hand.
    var message: String {
        switch phase {
        case .offer: "Your Watch records heart rate and Apple Health. Sets stay in sync with this iPhone."
        case .waiting: "Asking your Watch to open PhysiqueOS. If it doesn’t appear, raise your wrist, open PhysiqueOS and tap Start Workout."
        case .acknowledged: "Your Watch confirmed the start. Log sets on either device."
        case .unreachable: "Open PhysiqueOS on your Apple Watch, keep it unlocked and nearby, then tap Start Workout there."
        case .hidden: ""
        }
    }

    private var primaryTitle: String? {
        switch phase {
        case .offer: "Ready on Watch"
        case .unreachable: "Try Again"
        default: nil
        }
    }

    private var secondaryTitle: String? {
        switch phase {
        case .offer, .waiting, .unreachable: "Use without Watch"
        default: nil
        }
    }

    private var footnote: String? {
        switch phase {
        case .waiting: "This iPhone keeps the workout until the Watch confirms."
        case .acknowledged: "Opening your workout…"
        default: nil
        }
    }
}

/// Quiet status after the Watch started (or is recording Apple Health for)
/// this workout; replaces the former Ready for Watch card.
struct TrainingLoggerWatchStatusChip: View {
    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(PhysiqueOSTheme.redesignGreen).frame(width: 6, height: 6)
            Image(systemName: "applewatch").font(.system(size: 11, weight: .semibold))
            Text("On Watch").logText(LoggerType.pill10Strong)
        }
        .foregroundStyle(PhysiqueOSTheme.redesignInk)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(PhysiqueOSTheme.redesignSoft, in: Capsule())
        .overlay(Capsule().strokeBorder(PhysiqueOSTheme.redesignHairline, lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Recording on Apple Watch")
        .accessibilityIdentifier("trainingLogger.watchStatus")
    }
}

/// Build 92 Create Variant: name only. The Server owns normalization,
/// identity and duplicates; a created, reused or reactivated variant is
/// selected immediately. On failure the sheet stays open with the Server's
/// or the network's truthful message and the current selection is unchanged.
struct TrainingExecutionVariantCreateSheet: View {
    let viewModel: TrainingLoggerViewModel
    let request: TrainingExecutionVariantCreationRequest
    @State private var name = ""
    @FocusState private var isNameFocused: Bool

    private var trimmedName: String {
        name.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Variant name", text: $name)
                        .focused($isNameFocused)
                        .textInputAutocapitalization(.words)
                        .submitLabel(.done)
                        .onSubmit(submit)
                        .onChange(of: name) {
                            if name.count > TrainingLoggerViewModel.variantNameMaximumLength {
                                name = String(name.prefix(TrainingLoggerViewModel.variantNameMaximumLength))
                            }
                        }
                        .disabled(viewModel.isSubmittingVariant)
                        .accessibilityIdentifier("trainingLogger.variant.createName")
                } footer: {
                    Text("For \(request.exerciseName) only. Uses the same sets, reps and load as Ordinary.")
                }
                if let message = viewModel.variantCreationMessage {
                    Section {
                        Text(message)
                            .foregroundStyle(PhysiqueOSTheme.redesignRed)
                            .accessibilityIdentifier("trainingLogger.variant.createError")
                    }
                }
            }
            .navigationTitle("New Variant")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { viewModel.cancelCreatingVariant() }
                        .disabled(viewModel.isSubmittingVariant)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if viewModel.isSubmittingVariant {
                        ProgressView()
                    } else {
                        Button(viewModel.variantCreationMessage == nil ? "Create" : "Retry", action: submit)
                            .disabled(trimmedName.isEmpty)
                            .accessibilityIdentifier("trainingLogger.variant.createSubmit")
                    }
                }
            }
        }
        .presentationDetents([.medium])
        .interactiveDismissDisabled(viewModel.isSubmittingVariant)
        .onAppear { isNameFocused = true }
    }

    private func submit() {
        guard !trimmedName.isEmpty, !viewModel.isSubmittingVariant else { return }
        let submitted = trimmedName
        Task { await viewModel.submitNewVariant(name: submitted) }
    }
}
