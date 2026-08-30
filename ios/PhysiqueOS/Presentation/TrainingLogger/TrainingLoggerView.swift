import SwiftUI

struct TrainingLoggerView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: TrainingLoggerViewModel?
    @State private var pastWorkoutDate = Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date()
    @State private var provisionalName = ""
    @State private var provisionalAreaId = ""

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
            if let viewModel, let draft = viewModel.draft, draft.step != .complete {
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
        .physiqueOSScrollBottomClearance()
    }

    private func entry(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            loggerHeader(eyebrow: "Training Logger", title: "Log the work. Keep the context.", subtitle: "Start now or capture a past workout with the same evidence-aware structure.")

            if viewModel.savedDraft != nil {
                CardContainer {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Saved workout")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text("Resume your device-only draft without losing sets or exercise context.")
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
                            Text("Use the workout date—no invented historical time.")
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
        VStack(alignment: .leading, spacing: 14) {
            stepHeader(viewModel, step: "2 of 3", title: "Choose exercises", subtitle: "Previously performed movements appear first. Browse the registry only when needed.")

            TextField("Search exercises", text: Binding(
                get: { viewModel.searchText },
                set: { viewModel.searchText = $0 }
            ))
            .textInputAutocapitalization(.never)
            .padding(12)
            .background(PhysiqueOSTheme.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .accessibilityIdentifier("trainingLogger.exerciseSearch")

            if let selected = viewModel.draft?.exercises, !selected.isEmpty {
                CardContainer {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Selected · \(selected.count)")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        ForEach(selected) { exercise in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(exercise.name)
                                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    Text(exercise.isProvisional ? "Provisional · review required" : viewModel.areaLabel(exercise.areaId))
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                        .foregroundStyle(exercise.isProvisional ? PhysiqueOSTheme.chartEffort : PhysiqueOSTheme.textMuted)
                                }
                                Spacer()
                                Button { viewModel.update { $0.removeExercise(id: exercise.id) } } label: {
                                    Image(systemName: "xmark.circle.fill")
                                }
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                                .accessibilityLabel("Remove \(exercise.name)")
                            }
                        }
                    }
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text(viewModel.isBrowsingAllExercises ? "Exercise registry" : "Previously performed")
                    .physiqueOSFont(PhysiqueOSTypography.sectionLabel)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                ForEach(viewModel.pickerExercises()) { exercise in
                    Button {
                        viewModel.update { $0.addExercise(exercise) }
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "plus.circle.fill").foregroundStyle(PhysiqueOSTheme.accent)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(exercise.name)
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                Text([viewModel.areaLabel(exercise.areaId), exercise.equipment].compactMap { $0 }.joined(separator: " · "))
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 9)
                    }
                    .buttonStyle(.plain)
                    .disabled(viewModel.draft?.exercises.contains(where: { $0.canonicalExerciseId == exercise.canonicalExerciseId }) == true)
                    .opacity(viewModel.draft?.exercises.contains(where: { $0.canonicalExerciseId == exercise.canonicalExerciseId }) == true ? 0.45 : 1)
                    .accessibilityIdentifier("trainingLogger.add.\(exercise.canonicalExerciseId)")
                }
            }

            Button(viewModel.isBrowsingAllExercises ? "Show performed exercises" : "Add new exercise") {
                viewModel.isBrowsingAllExercises.toggle()
            }
            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            .foregroundStyle(PhysiqueOSTheme.accent)
            .accessibilityIdentifier("trainingLogger.browseAll")

            if viewModel.isBrowsingAllExercises {
                provisionalExerciseForm(viewModel)
            }

            validation(viewModel)
            PrimaryActionButton(title: "Start set entry") { viewModel.continueFromExercises() }
            secondaryButton("Back to Training Areas") { viewModel.go(to: .areas) }
        }
    }

    private func provisionalExerciseForm(_ viewModel: TrainingLoggerViewModel) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 10) {
                Text("Create new exercise")
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("This stays provisional until canonical review. It does not modify the exercise registry.")
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
        VStack(alignment: .leading, spacing: 14) {
            stepHeader(viewModel, step: "3 of 3", title: "Log workout", subtitle: "Confirm or edit the prior setup. Only checked sets count as completed.")
            if let draft = viewModel.draft {
                HStack {
                    Label(draft.mode.title, systemImage: draft.mode == .live ? "bolt.fill" : "calendar")
                    Spacer()
                    Text(draft.workoutDate)
                }
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)

                Button {
                    viewModel.reviewWorkout()
                } label: {
                    HStack {
                        Label("Review workout", systemImage: "checklist")
                        Spacer()
                        Text("\(draft.completedSetCount) done")
                        Image(systemName: "chevron.right")
                    }
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    .padding(12)
                    .background(PhysiqueOSTheme.surfaceAccent)
                    .clipShape(RoundedRectangle(cornerRadius: 11))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("trainingLogger.headerReviewWorkout")

                ForEach(draft.exercises) { exercise in
                    exerciseCard(exercise, viewModel: viewModel)
                }
            }
            validation(viewModel)
            PrimaryActionButton(title: "Review workout") { viewModel.reviewWorkout() }
                .accessibilityIdentifier("trainingLogger.reviewWorkout")
            secondaryButton("Back to exercises") { viewModel.go(to: .exercises) }
        }
    }

    private func exerciseCard(_ exercise: TrainingLoggerDraftExercise, viewModel: TrainingLoggerViewModel) -> some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 12) {
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

                if let previous = exercise.previousPerformance {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Previous · \(previous.workoutDate)")
                            .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                        Text(previous.compactSummary)
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text(previous.contextLabel)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 9))
                } else {
                    Text("No comparable prior performance for this variant and relationship context.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }

                setColumnHeader(for: exercise.measurement)
                ForEach(exercise.sets) { set in
                    setRow(exercise: exercise, set: set, viewModel: viewModel)
                }
                Button {
                    viewModel.update { $0.addSet(to: exercise.id) }
                } label: {
                    Label("Add set", systemImage: "plus")
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                }
                .foregroundStyle(PhysiqueOSTheme.accent)
                .accessibilityIdentifier("trainingLogger.addSet.\(exercise.id)")
            }
        }
        .accessibilityIdentifier("trainingLogger.exerciseCard.\(exercise.name)")
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
    }

    private func setRow(exercise: TrainingLoggerDraftExercise, set: TrainingLoggerDraftSet, viewModel: TrainingLoggerViewModel) -> some View {
        HStack(spacing: 8) {
            Text("\(set.setNumber)")
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .frame(width: 30)
            TextField("0", text: numericBinding(viewModel, exerciseId: exercise.id, setId: set.id, keyPath: exercise.measurement == .duration ? \.durationSeconds : \.reps))
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.center)
                .padding(.vertical, 9)
                .background(PhysiqueOSTheme.surfaceMuted)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            if exercise.measurement == .repsLoad {
                TextField("0", text: numericBinding(viewModel, exerciseId: exercise.id, setId: set.id, keyPath: \.load))
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.center)
                    .padding(.vertical, 9)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
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
                    .frame(width: 42)
            }
            .accessibilityLabel(set.isCompleted ? "Mark set incomplete" : "Mark set complete")
            Button {
                viewModel.update { $0.removeSet(exerciseId: exercise.id, setId: set.id) }
            } label: {
                Image(systemName: "trash").foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            .disabled(exercise.sets.count <= 1)
            .opacity(exercise.sets.count <= 1 ? 0.35 : 1)
        }
        .physiqueOSFont(PhysiqueOSTypography.body14Regular)
        .foregroundStyle(PhysiqueOSTheme.textPrimary)
    }

    private func summary(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            stepHeader(viewModel, step: "Review workout", title: "Workout summary", subtitle: "Review captured work before the evidence boundary.")
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
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(exercise.name).physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    Text(exerciseContext(exercise, draft: draft))
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                                }
                                Spacer()
                                Text("\(exercise.sets.filter(\.isCompleted).count) sets")
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            }
                        }
                    }
                }
            }
            PrimaryActionButton(title: "Finish Workout / Review") { viewModel.go(to: .evidence) }
                .accessibilityIdentifier("trainingLogger.finishReview")
            secondaryButton("Back to set entry") { viewModel.go(to: .workout) }
        }
    }

    private func evidence(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            loggerHeader(eyebrow: "Evidence", title: "Apple Health reconciliation", subtitle: "Optional evidence can help reconcile duration and energy data before review.")
            CardContainer {
                VStack(alignment: .leading, spacing: 10) {
                    Label("No Apple Health workout linked", systemImage: "heart.slash")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text("Apple Health import is not connected in the Native sandbox. No health data has been read or written.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    Button("Add Apple Health evidence · unavailable in sandbox") { }
                        .disabled(true)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
            PrimaryActionButton(title: "Continue without Apple Health") { viewModel.go(to: .review) }
                .accessibilityIdentifier("trainingLogger.continueWithoutHealth")
            secondaryButton("Back to summary") { viewModel.go(to: .summary) }
        }
    }

    private func review(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            loggerHeader(eyebrow: "Evidence Review", title: "Ready for review", subtitle: "The workout is staged locally with its exercise, set, variant, and relationship context.")
            CardContainer {
                VStack(alignment: .leading, spacing: 10) {
                    Label("Local review boundary", systemImage: "checkmark.shield")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text("No canonical TrainingSession, Evidence Review, or production record has been created. A live confirmation command is intentionally not connected.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    if viewModel.draft?.exercises.contains(where: \.isProvisional) == true {
                        Text("Provisional exercises require canonical identity review before any future production confirmation.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.chartEffort)
                    }
                }
            }
            PrimaryActionButton(title: "Complete local demo") { viewModel.completeLocalCapture() }
                .accessibilityIdentifier("trainingLogger.completeLocal")
            secondaryButton("Back") { viewModel.go(to: .evidence) }
        }
    }

    private func complete(_ viewModel: TrainingLoggerViewModel) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            loggerHeader(eyebrow: "Device only", title: "Local capture complete", subtitle: "This sandbox walkthrough is complete. Nothing was synced or canonically saved.")
            CardContainer {
                Label("Draft cleared from this device", systemImage: "checkmark.circle.fill")
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
        keyPath: WritableKeyPath<TrainingLoggerDraftSet, Double?>
    ) -> Binding<String> {
        Binding(
            get: {
                guard let value = viewModel.draft?.exercises.first(where: { $0.id == exerciseId })?.sets.first(where: { $0.id == setId })?[keyPath: keyPath] else { return "" }
                return value.rounded() == value ? String(Int(value)) : String(value)
            },
            set: { text in
                viewModel.update { draft in
                    guard let exerciseIndex = draft.exercises.firstIndex(where: { $0.id == exerciseId }),
                          let setIndex = draft.exercises[exerciseIndex].sets.firstIndex(where: { $0.id == setId }) else { return }
                    draft.exercises[exerciseIndex].sets[setIndex][keyPath: keyPath] = Double(text)
                }
            }
        )
    }
}
