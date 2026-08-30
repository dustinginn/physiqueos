import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct TrainingLoggerView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: TrainingLoggerViewModel?
    @State private var pastWorkoutDate = Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date()
    @State private var provisionalName = ""
    @State private var provisionalAreaId = ""
    @State private var showingCancelWorkoutConfirmation = false
    @State private var isNumericKeyboardVisible = false
    @State private var focusedNumericFieldID: String?
    @State private var numericEditBuffers: [String: String] = [:]
    @State private var isSupportingPhotosPickerPresented = false
    @State private var isSupportingFilePickerPresented = false
    @State private var supportingPhotoItems: [PhotosPickerItem] = []

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
        .background(PhysiqueOSTheme.background.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .toolbar {
            if let viewModel, let draft = viewModel.draft, draft.step != .complete, draft.step != .workout {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save & Leave") {
                        viewModel.persist()
                        dismiss()
                    }
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                    .accessibilityIdentifier("trainingLogger.saveAndLeave")
                }
            }
        }
        .task {
            if viewModel == nil {
                viewModel = TrainingLoggerViewModel(
                    api: environment.trainingLoggerAPI,
                    draftStore: environment.trainingLoggerDraftStore
                )
            }
            await viewModel?.load()
        }
        .onDisappear { viewModel?.persist() }
        .onChange(of: focusedNumericFieldID) { isNumericKeyboardVisible = focusedNumericFieldID != nil }
        .photosPicker(isPresented: $isSupportingPhotosPickerPresented, selection: $supportingPhotoItems, matching: .images)
        .onChange(of: supportingPhotoItems) {
            guard !supportingPhotoItems.isEmpty else { return }
            let start = viewModel?.draft?.supportingEvidenceAssets.filter { $0.source == .photos }.count ?? 0
            let assets = supportingPhotoItems.indices.map { index in
                TrainingLoggerSupportingEvidence(id: UUID().uuidString, displayName: "Apple Health Screenshot \(start + index + 1)", source: .photos)
            }
            viewModel?.update { $0.addSupportingEvidence(assets) }
            supportingPhotoItems = []
        }
        .fileImporter(isPresented: $isSupportingFilePickerPresented, allowedContentTypes: [.image, .pdf], allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            viewModel?.update { draft in
                draft.addSupportingEvidence(urls.map {
                    .init(id: UUID().uuidString, displayName: $0.lastPathComponent, source: .files)
                })
            }
        }
    }

    private func content(_ viewModel: TrainingLoggerViewModel) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                switch viewModel.draft?.step ?? .entry {
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
            .padding(.top, 12)
        }
        .scrollDismissesKeyboard(.interactively)
        .physiqueOSScrollBottomClearance()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            persistentAction(viewModel)
        }
    }

    @ViewBuilder
    private func persistentAction(_ viewModel: TrainingLoggerViewModel) -> some View {
        switch viewModel.draft?.step {
        case .exercises:
            let presentation = viewModel.selectionPresentation
            let adding = viewModel.draft?.isAddingExercises == true
            persistentActionBar {
                PrimaryActionButton(
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
                    PrimaryActionButton(title: "Finish Workout", isEnabled: presentation?.canFinish == true) {
                        viewModel.reviewWorkout()
                    }
                    .accessibilityIdentifier("trainingLogger.finishWorkout")
                }
            }
        default:
            EmptyView()
        }
    }

    private func persistentActionBar<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 6)
            .background(.ultraThinMaterial)
            .overlay(alignment: .top) { Divider().overlay(PhysiqueOSTheme.divider) }
    }

    private func entry(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            loggerHeader(eyebrow: "Training Logger", title: "Log the work. Keep the context.", subtitle: "Start now or capture a past workout with the same exercise and set details.")

            if viewModel.savedDraft != nil {
                CardContainer {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Saved workout")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text("Pick up where you left off without losing sets or exercise details.")
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        PrimaryActionButton(title: "Resume workout") { viewModel.resume() }
                            .accessibilityIdentifier("trainingLogger.resume")
                        Button("Discard saved draft", role: .destructive) { viewModel.discardSavedDraft() }
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    }
                }
            }

            actionCard(icon: "play.fill", title: "Start Workout", detail: "Begin a live session using today’s date.") {
                viewModel.start(mode: .live)
            }
            .accessibilityIdentifier("trainingLogger.start")

            CardContainer {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 12) {
                        IconBadge(systemImage: "calendar", color: .evidence, size: .md)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Log Past Workout")
                                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text("Choose when the workout happened.")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }
                    DatePicker("Workout date", selection: $pastWorkoutDate, in: ...Date(), displayedComponents: .date)
                        .datePickerStyle(.compact)
                        .tint(PhysiqueOSTheme.accent)
                    PrimaryActionButton(title: "Continue with past workout") {
                        viewModel.start(mode: .past, date: pastWorkoutDate)
                    }
                    .accessibilityIdentifier("trainingLogger.past")
                }
            }
        }
    }

    private func areaSelection(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            stepHeader(viewModel, step: "1 of 3", title: "What are you training?", subtitle: "Choose one or more Training Areas.")
            if let draft = viewModel.draft, draft.mode == .past {
                infoRow(icon: "calendar", title: "Workout date", value: draft.workoutDate)
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(viewModel.configuration?.areas ?? []) { area in
                    let selected = viewModel.draft?.selectedAreaIds.contains(area.id) == true
                    Button {
                        viewModel.update { $0.toggleArea(area.id) }
                    } label: {
                        HStack {
                            Text(area.label)
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            Spacer()
                            Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                        }
                        .foregroundStyle(selected ? PhysiqueOSTheme.textPrimary : PhysiqueOSTheme.textSecondary)
                        .padding(14)
                        .background(selected ? PhysiqueOSTheme.surfaceAccent : PhysiqueOSTheme.surfaceElevated)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(selected ? PhysiqueOSTheme.accent : PhysiqueOSTheme.divider))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("trainingLogger.area.\(area.id)")
                }
            }
            validation(viewModel)
            PrimaryActionButton(title: "Choose exercises") { viewModel.continueFromAreas() }
            secondaryButton("Back") { viewModel.draft = nil }
        }
    }

    private func exercisePicker(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            let adding = viewModel.draft?.isAddingExercises == true
            stepHeader(viewModel, step: adding ? "Active workout" : "2 of 3", title: adding ? "Add exercises" : "Choose exercises", subtitle: "Performed exercises first")

            TextField("Search exercises", text: Binding(
                get: { viewModel.searchText },
                set: { viewModel.searchText = $0 }
            ))
            .textInputAutocapitalization(.never)
            .padding(12)
            .background(PhysiqueOSTheme.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .accessibilityIdentifier("trainingLogger.exerciseSearch")

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(viewModel.isBrowsingAllExercises ? "Exercise registry" : "Previously performed")
                        .physiqueOSFont(PhysiqueOSTypography.sectionLabel)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                    Spacer()
                    Text("\(viewModel.selectionPresentation.selectedCount) selected")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.accent)
                }
                ForEach(viewModel.pickerExercises()) { exercise in
                    exerciseSelectionRow(exercise, viewModel: viewModel)
                }
                ForEach(viewModel.draft?.exercises.filter(\.isProvisional) ?? []) { exercise in
                    Button {
                        viewModel.update { $0.removeExercise(id: exercise.id) }
                    } label: {
                        exerciseSelectionLabel(
                            name: exercise.name,
                            detail: "\(viewModel.areaLabel(exercise.areaId)) · Provisional review",
                            selected: true
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("trainingLogger.provisional.\(exercise.id)")
                }
            }

            Button {
                viewModel.isBrowsingAllExercises.toggle()
            } label: {
                Label(
                    viewModel.isBrowsingAllExercises ? "Show performed exercises" : "Add New Exercise",
                    systemImage: viewModel.isBrowsingAllExercises ? "clock.arrow.circlepath" : "plus.circle"
                )
            }
            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            .foregroundStyle(PhysiqueOSTheme.accent)
            .accessibilityIdentifier("trainingLogger.browseAll")

            if viewModel.isBrowsingAllExercises {
                provisionalExerciseForm(viewModel)
            }

            validation(viewModel)
            secondaryButton(adding ? "Return to workout" : "Back to Training Areas") {
                if adding { viewModel.continueFromExercises() } else { viewModel.go(to: .areas) }
            }
        }
    }

    private func exerciseSelectionRow(_ exercise: TrainingLoggerCatalogExercise, viewModel: TrainingLoggerViewModel) -> some View {
        let selected = viewModel.isSelected(exercise)
        let locked = viewModel.isLockedDuringAdd(exercise)
        return Button {
            guard !locked else { return }
            viewModel.update { draft in
                if let selectedExercise = draft.exercises.first(where: { $0.canonicalExerciseId == exercise.canonicalExerciseId }) {
                    draft.removeExercise(id: selectedExercise.id)
                } else {
                    draft.addExercise(exercise)
                }
            }
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

    private func exerciseSelectionLabel(name: String, detail: String, selected: Bool) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(detail)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(selected ? PhysiqueOSTheme.textSecondary : PhysiqueOSTheme.textMuted)
            }
            Spacer(minLength: 8)
            Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(selected ? PhysiqueOSTheme.accent : PhysiqueOSTheme.textMuted)
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .padding(.horizontal, 13)
        .padding(.vertical, 8)
        .background(selected ? PhysiqueOSTheme.surfaceAccent : PhysiqueOSTheme.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(selected ? PhysiqueOSTheme.accent.opacity(0.8) : PhysiqueOSTheme.divider)
        )
    }

    private func provisionalExerciseForm(_ viewModel: TrainingLoggerViewModel) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 10) {
                Text("Create new exercise")
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("Give the exercise a name and choose its Training Area.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                TextField("Exercise name", text: $provisionalName)
                    .padding(10)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 9))
                Picker("Training Area", selection: $provisionalAreaId) {
                    Text("Choose an area").tag("")
                    ForEach((viewModel.configuration?.areas ?? []).filter { viewModel.draft?.selectedAreaIds.contains($0.id) == true }) {
                        Text($0.label).tag($0.id)
                    }
                }
                .tint(PhysiqueOSTheme.accent)
                Button("Add provisional exercise") {
                    viewModel.update { $0.addProvisionalExercise(name: provisionalName, areaId: provisionalAreaId) }
                    provisionalName = ""
                }
                .disabled(provisionalName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || provisionalAreaId.isEmpty)
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(PhysiqueOSTheme.accent)
            }
        }
    }

    private func workout(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let draft = viewModel.draft, let presentation = viewModel.workoutPresentation {
                workoutIdentity(draft: draft, presentation: presentation)

                HStack(spacing: 8) {
                    Button {
                        viewModel.persist()
                        dismiss()
                    } label: {
                        Label("Save & Leave", systemImage: "arrow.left")
                            .frame(maxWidth: .infinity)
                    }
                    .accessibilityIdentifier("trainingLogger.inlineSaveAndLeave")

                    Button(role: .destructive) {
                        showingCancelWorkoutConfirmation = true
                    } label: {
                        Label("Cancel Workout", systemImage: "trash")
                            .frame(maxWidth: .infinity)
                    }
                    .tint(PhysiqueOSTheme.destructive)
                    .accessibilityIdentifier("trainingLogger.cancelWorkout")
                }
                .buttonStyle(.bordered)
                .controlSize(.regular)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)

                Button {
                    focusedNumericFieldID = nil
                    viewModel.beginAddingExercises()
                } label: {
                    Label("Add Exercise", systemImage: "plus.circle.fill")
                        .frame(maxWidth: .infinity, minHeight: 38)
                }
                .buttonStyle(.bordered)
                .tint(PhysiqueOSTheme.accent)
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .accessibilityIdentifier("trainingLogger.addExercise")

                ForEach(draft.exercises) { exercise in
                    exerciseCard(exercise, viewModel: viewModel)
                }
            }
            validation(viewModel)
        }
        .confirmationDialog(
            "Cancel this workout?",
            isPresented: $showingCancelWorkoutConfirmation,
            titleVisibility: .visible
        ) {
            Button("Cancel Workout", role: .destructive) {
                viewModel.cancelWorkout()
            }
            Button("Keep Workout", role: .cancel) {}
        } message: {
            Text("This discards the workout and all set edits. Save & Leave keeps it.")
        }
    }

    private func workoutIdentity(
        draft: TrainingLoggerDraft,
        presentation: TrainingLoggerWorkoutPresentation
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 7) {
                        Circle()
                            .fill(draft.mode == .live ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.chartEffort)
                            .frame(width: 8, height: 8)
                        Text(presentation.eyebrow.uppercased())
                            .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                            .foregroundStyle(PhysiqueOSTheme.accent)
                    }
                    Text("Training Logger")
                        .physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(presentation.context)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                Spacer(minLength: 8)
                Text(presentation.progress)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(Capsule())
            }
            ProgressView(value: Double(presentation.completedSetCount), total: Double(max(1, presentation.totalSetCount)))
                .tint(PhysiqueOSTheme.chartSuccess)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("trainingLogger.workoutIdentity")
    }

    private func exerciseCard(_ exercise: TrainingLoggerDraftExercise, viewModel: TrainingLoggerViewModel) -> some View {
        CardContainer(padding: .none) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(exercise.name)
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text(exerciseContext(exercise, draft: viewModel.draft))
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.chartEffort)
                    }
                    Spacer()
                    exerciseMenu(exercise, viewModel: viewModel)
                }
                .padding(.horizontal, 12)
                .padding(.top, 10)
                .padding(.bottom, 6)

                if let previous = exercise.previousPerformance {
                    Text(previous.compactLine)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        .lineLimit(1)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 7)
                } else {
                    Text("No comparable prior performance for this variant and relationship context.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                        .padding(.horizontal, 12)
                        .padding(.bottom, 7)
                }

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
                    Label("Add set", systemImage: "plus")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .frame(maxWidth: .infinity, minHeight: 34)
                }
                .foregroundStyle(PhysiqueOSTheme.accent)
                .accessibilityIdentifier("trainingLogger.addSet.\(exercise.id)")
            }
        }
        .accessibilityIdentifier("trainingLogger.exerciseCard.\(exercise.name)")
    }

    private func progressionGuidance(
        _ recommendation: TrainingLoggerProgressionRecommendation,
        exercise: TrainingLoggerDraftExercise,
        viewModel: TrainingLoggerViewModel
    ) -> some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text(recommendation.eyebrow.uppercased())
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(recommendation.prescription)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
            }
            Spacer(minLength: 4)
            Button("Use suggestion") {
                viewModel.update { $0.applyProgressionSuggestion(to: exercise.id) }
            }
            .disabled(!recommendation.hasExplicitTarget)
            .buttonStyle(.borderedProminent)
            .tint(exercise.progressionChoice == .suggestion ? PhysiqueOSTheme.accent : PhysiqueOSTheme.surfaceMuted)
            Button("Keep previous") {
                viewModel.update { $0.keepPreviousPerformance(for: exercise.id) }
            }
            .buttonStyle(.bordered)
            .tint(exercise.progressionChoice == .previous ? PhysiqueOSTheme.accent : PhysiqueOSTheme.textSecondary)
        }
        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
        .controlSize(.small)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(PhysiqueOSTheme.surfaceAccent.opacity(0.7))
        .accessibilityIdentifier("trainingLogger.progression.\(exercise.id)")
    }

    private func exerciseMenu(_ exercise: TrainingLoggerDraftExercise, viewModel: TrainingLoggerViewModel) -> some View {
        Menu {
            Menu("Execution variant") {
                Button("Ordinary") { viewModel.update { $0.applyVariant(nil, to: exercise.id, catalog: viewModel.configuration?.exercises ?? []) } }
                ForEach(viewModel.configuration?.variants ?? [], id: \.key) { variant in
                    Button(variant.label) { viewModel.update { $0.applyVariant(variant, to: exercise.id, catalog: viewModel.configuration?.exercises ?? []) } }
                }
            }
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
            Button("Remove exercise", role: .destructive) { viewModel.update { $0.removeExercise(id: exercise.id) } }
        } label: {
            Image(systemName: "ellipsis.circle")
                .font(.system(size: 22))
                .foregroundStyle(PhysiqueOSTheme.accent)
        }
        .accessibilityLabel("Actions for \(exercise.name)")
        .accessibilityIdentifier("trainingLogger.exerciseActions.\(exercise.name)")
    }

    private func setColumnHeader(for measurement: TrainingLoggerMeasurement) -> some View {
        HStack(spacing: 8) {
            Text("Set").frame(width: 30)
            Text(measurement == .duration ? "Seconds" : "Reps").frame(maxWidth: .infinity)
            if measurement == .repsLoad { Text("Load (lb)").frame(maxWidth: .infinity) }
            Text("Done").frame(width: 42)
            Color.clear.frame(width: 24)
        }
        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
        .foregroundStyle(PhysiqueOSTheme.textMuted)
        .frame(height: 28)
        .padding(.horizontal, 10)
        .background(PhysiqueOSTheme.surfaceMuted.opacity(0.7))
    }

    private func setRow(exercise: TrainingLoggerDraftExercise, set: TrainingLoggerDraftSet, viewModel: TrainingLoggerViewModel) -> some View {
        let primaryKind: TrainingLoggerNumericFieldKind = exercise.measurement == .duration ? .duration : .reps
        let primaryID = TrainingLoggerNumericFieldTarget(exerciseId: exercise.id, setId: set.id, kind: primaryKind).id
        return HStack(spacing: 8) {
            Text("\(set.setNumber)")
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .frame(width: 30)
            NumericEditField(
                text: numericBinding(viewModel, exerciseId: exercise.id, setId: set.id, field: exercise.measurement == .duration ? "duration" : "reps", keyPath: exercise.measurement == .duration ? \.durationSeconds : \.reps),
                accessibilityLabel: exercise.measurement == .duration ? "Set \(set.setNumber) seconds" : "Set \(set.setNumber) reps",
                fieldID: primaryID,
                focusedFieldID: $focusedNumericFieldID,
                nextFieldID: viewModel.draft.flatMap { TrainingLoggerNumericFocusOrder.next(after: primaryID, in: $0) },
                onEditingChanged: numericEditingChanged
            )
                .frame(height: 34)
            if exercise.measurement == .repsLoad {
                let loadID = TrainingLoggerNumericFieldTarget(exerciseId: exercise.id, setId: set.id, kind: .load).id
                NumericEditField(
                    text: numericBinding(viewModel, exerciseId: exercise.id, setId: set.id, field: "load", keyPath: \.load),
                    accessibilityLabel: "Set \(set.setNumber) load",
                    fieldID: loadID,
                    focusedFieldID: $focusedNumericFieldID,
                    nextFieldID: viewModel.draft.flatMap { TrainingLoggerNumericFocusOrder.next(after: loadID, in: $0) },
                    onEditingChanged: numericEditingChanged
                )
                    .frame(height: 34)
            }
            Button {
                viewModel.update { draft in
                    guard let exerciseIndex = draft.exercises.firstIndex(where: { $0.id == exercise.id }),
                          let setIndex = draft.exercises[exerciseIndex].sets.firstIndex(where: { $0.id == set.id }) else { return }
                    draft.exercises[exerciseIndex].sets[setIndex].isCompleted.toggle()
                }
            } label: {
                Image(systemName: set.isCompleted ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 21))
                    .foregroundStyle(set.isCompleted ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.textMuted)
                    .frame(width: 42, height: 40)
            }
            .accessibilityLabel(set.isCompleted ? "Mark set incomplete" : "Mark set complete")
            Button {
                viewModel.update { $0.removeSet(exerciseId: exercise.id, setId: set.id) }
            } label: {
                Image(systemName: "trash")
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                    .frame(width: 24, height: 40)
            }
            .disabled(exercise.sets.count <= 1)
            .opacity(exercise.sets.count <= 1 ? 0.35 : 1)
        }
        .physiqueOSFont(PhysiqueOSTypography.body14Regular)
        .foregroundStyle(PhysiqueOSTheme.textPrimary)
        .frame(height: 42)
        .padding(.horizontal, 10)
        .background(set.isCompleted ? PhysiqueOSTheme.chartSuccess.opacity(0.08) : Color.clear)
        .overlay(alignment: .bottom) { Divider().overlay(PhysiqueOSTheme.divider) }
    }

    private func summary(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            stepHeader(viewModel, step: "Workout Review", title: "Review your workout", subtitle: "Check every completed set and add optional Apple Health screenshots.")
            if let draft = viewModel.draft {
                let summary = draft.summary()
                HStack(spacing: 8) {
                    summaryMetric("Exercises", summary.exerciseCount)
                    summaryMetric("Sets", summary.completedSetCount)
                    summaryMetric("Variants", summary.variantCount)
                    summaryMetric("Supersets", summary.supersetCount)
                }
                CardContainer {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(draft.exercises) { exercise in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(exercise.name).physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                Text(exerciseContext(exercise, draft: draft))
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                                ForEach(exercise.sets.filter(\.isCompleted)) { set in
                                    Text(reviewSetLine(set, measurement: exercise.measurement))
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                }
                            }
                            if exercise.id != draft.exercises.last?.id { Divider().overlay(PhysiqueOSTheme.divider) }
                        }
                    }
                }

                CardContainer {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Supporting Apple Health screenshots")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        Text("Optional · attach screenshots from the matching Apple Health workout.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        HStack(spacing: 10) {
                            Button { isSupportingPhotosPickerPresented = true } label: { Label("Photos", systemImage: "photo.on.rectangle").frame(maxWidth: .infinity) }
                            Button { isSupportingFilePickerPresented = true } label: { Label("Files", systemImage: "folder").frame(maxWidth: .infinity) }
                        }
                        .buttonStyle(.bordered)
                        .tint(PhysiqueOSTheme.accent)
                        ForEach(draft.supportingEvidenceAssets) { asset in
                            HStack {
                                Image(systemName: asset.source == .photos ? "photo" : "doc")
                                Text(asset.displayName).lineLimit(1)
                                Spacer()
                                Button { viewModel.update { $0.removeSupportingEvidence(id: asset.id) } } label: { Image(systemName: "xmark.circle.fill") }
                            }
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }
                }
            }
            PrimaryActionButton(title: "Continue to confirmation") { viewModel.go(to: .review) }
                .accessibilityIdentifier("trainingLogger.finishReview")
            secondaryButton("Back to set entry") { viewModel.go(to: .workout) }
        }
    }

    private func evidence(_ viewModel: TrainingLoggerViewModel) -> some View {
        summary(viewModel) // Build-5 saved drafts migrate directly to the combined review.
    }

    private func review(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            loggerHeader(eyebrow: "Final Confirmation", title: "Finish this workout?", subtitle: "Confirm the workout and any supporting screenshots together.")
            CardContainer {
                VStack(alignment: .leading, spacing: 10) {
                    Label("Workout ready", systemImage: "checkmark.circle")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    if let draft = viewModel.draft {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(draft.exercises.count) exercises · \(draft.completedSetCount) completed sets")
                            Text(draft.supportingEvidenceAssets.isEmpty ? "No supporting screenshots attached" : "\(draft.supportingEvidenceAssets.count) supporting screenshot\(draft.supportingEvidenceAssets.count == 1 ? "" : "s") attached")
                        }
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                    if viewModel.draft?.exercises.contains(where: \.isProvisional) == true {
                        Text("New exercises will remain attached to this workout.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.chartEffort)
                    }
                }
            }
            PrimaryActionButton(title: "Finish Workout") { viewModel.completeLocalCapture() }
                .accessibilityIdentifier("trainingLogger.completeLocal")
            secondaryButton("Back to Workout Review") { viewModel.go(to: .summary) }
        }
    }

    private func complete(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            loggerHeader(eyebrow: "Workout Complete", title: "Workout logged", subtitle: "Your workout review is complete.")
            CardContainer {
                Label("Ready to return to Log", systemImage: "checkmark.circle.fill")
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(PhysiqueOSTheme.chartSuccess)
            }
            PrimaryActionButton(title: "Return to Log") { dismiss() }
        }
    }

    private func loggerHeader(eyebrow: String, title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(eyebrow).physiqueOSFont(PhysiqueOSTypography.screenEyebrow).foregroundStyle(PhysiqueOSTheme.accent)
            Text(title).physiqueOSFont(PhysiqueOSTypography.screenTitle).foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(subtitle).physiqueOSFont(PhysiqueOSTypography.screenSubtitle).foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
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
        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
        .foregroundStyle(PhysiqueOSTheme.textSecondary)
    }

    private func validation(_ viewModel: TrainingLoggerViewModel) -> some View {
        Group {
            if let message = viewModel.validationMessage {
                Text(message)
                    .physiqueOSFont(PhysiqueOSTypography.calloutStrong)
                    .foregroundStyle(PhysiqueOSTheme.destructive)
            }
        }
    }

    private func secondaryButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            .foregroundStyle(PhysiqueOSTheme.textSecondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
    }

    private func summaryMetric(_ title: String, _ value: Int) -> some View {
        VStack(spacing: 3) {
            Text("\(value)").physiqueOSFont(PhysiqueOSTypography.metricValue).foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(title).physiqueOSFont(PhysiqueOSTypography.metricLabel).foregroundStyle(PhysiqueOSTheme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(PhysiqueOSTheme.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func failure(_ message: String) -> some View {
        Text(message)
            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
            .foregroundStyle(PhysiqueOSTheme.textSecondary)
            .padding()
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
        field: String,
        keyPath: WritableKeyPath<TrainingLoggerDraftSet, Double?>
    ) -> Binding<String> {
        let bufferKey = "\(exerciseId)|\(setId)|\(field)"
        return Binding(
            get: {
                if let buffer = numericEditBuffers[bufferKey] { return buffer }
                guard let value = viewModel.draft?.exercises.first(where: { $0.id == exerciseId })?.sets.first(where: { $0.id == setId })?[keyPath: keyPath] else { return "" }
                return value.rounded() == value ? String(Int(value)) : String(value)
            },
            set: { text in
                numericEditBuffers[bufferKey] = text
                viewModel.update { draft in
                    guard let exerciseIndex = draft.exercises.firstIndex(where: { $0.id == exerciseId }),
                          let setIndex = draft.exercises[exerciseIndex].sets.firstIndex(where: { $0.id == setId }) else { return }
                    draft.exercises[exerciseIndex].sets[setIndex][keyPath: keyPath] = NumericEditingContract.parsedValue(text)
                }
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
