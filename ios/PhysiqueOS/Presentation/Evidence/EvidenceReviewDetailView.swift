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
    var onReturnToLog: () -> Void = {}
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
        case accepted
        case confirmed
        case workoutReconciliationResolved(String)
        case stillProcessing
        case refreshRequired(String)
        case failed(String)
    }

    var body: some View {
        presentation
        .task(id: environment.nativeAuthority) { await load() }
        .onAppear { environment.currentlyViewingReviewId = reviewId }
        .onDisappear {
            if environment.currentlyViewingReviewId == reviewId { environment.currentlyViewingReviewId = nil }
        }
        .alert(
            "Dismiss this Evidence Review?",
            isPresented: $showingDismissConfirmation
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

    /// Generic reviews use the locked Evidence Review workflow (`85ef2a6c`);
    /// Workout Match (`workoutReconciliation`) keeps its own branch, which
    /// the Founder-approved Batch 2 L13 presentation owns.
    @ViewBuilder
    private var presentation: some View {
        if EvidenceReviewPresentationRoute(state: state) == .workoutMatch {
            workoutMatchScroll
        } else {
            genericWorkflowBody
        }
    }

    private var workoutMatchScroll: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(isWorkoutMatch ? PhysiqueOSTheme.redesignCanvas : PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbarBackground(isWorkoutMatch ? PhysiqueOSTheme.redesignCanvas : PhysiqueOSTheme.background, for: .navigationBar)
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
    }

    private func load() async {
        state = .loading
        #if DEBUG
        if let fixture = EvidenceReviewWorkflowFixture.review(for: reviewId) {
            applyReviewFixture(fixture)
            return
        }
        #endif
        do {
            let review = try await environment.evidenceReviewAPI.fetchReview(reviewId: reviewId)
            state = .loaded(review)
            if let review, review.status == "committing" {
                actionState = .accepted
            }
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
        case .loaded(.some(let review)) where review.workoutReconciliation != nil:
            // Batch 2 L13: the locked Workout Match. Generic Evidence Review
            // (every other review kind) keeps its current presentation.
            workoutMatchContent(review)
        case .loaded(.some(let review)):
            VStack(alignment: .leading, spacing: 18) {
                header(for: review)
                itemsCard(review)
                if let dexaItem = review.items.first(where: { $0.dexaMeasurements != nil }), actionState == .editingMeasurements {
                    dexaMeasurementCard(review: review, item: dexaItem)
                }
                actionSection(for: review)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var isWorkoutMatch: Bool {
        guard case .loaded(.some(let review)) = state else { return false }
        return review.workoutReconciliation != nil
    }

    // MARK: - Workout Match (locked L13)

    private func workoutMatchContent(_ review: EvidenceReviewDetailReadModel) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Workout Match").logText(LoggerType.eyebrow10).foregroundStyle(PhysiqueOSTheme.redesignPurple)
                Text(Self.statusLabel(review.status))
                    .logText(LoggerType.stepTitle28)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                    .padding(.top, 5)
                    .padding(.bottom, 6)
                Text([Self.occurrenceDateLabel(for: review), review.version.map { "Version \($0)" }].compactMap { $0 }.joined(separator: " · "))
                    .logText(LoggerType.stepSubtitle13)
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                    .accessibilityIdentifier("evidenceReviewDetail.occurrenceDate")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            if let reconciliation = review.workoutReconciliation {
                workoutMatchCard(reconciliation)
                let best = reconciliation.candidates.map(\.confidence).max()
                ForEach(Array(reconciliation.candidates.enumerated()), id: \.element.id) { index, candidate in
                    // Locked candidates carry an 8 pt top margin.
                    workoutMatchCandidate(index: index, candidate: candidate, isStrongest: candidate.confidence == best)
                        .padding(.top, 8)
                }
            }
            workoutMatchActions(review)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func workoutMatchCard(_ reconciliation: WorkoutReconciliationDetail) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(reconciliation.title)
                .logText(LoggerType.surfaceTitle16)
                .foregroundStyle(PhysiqueOSTheme.redesignInk)
                .padding(.bottom, 4)
            Text(reconciliation.summary)
                .logText(LoggerType.body11)
                .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Rectangle().fill(PhysiqueOSTheme.redesignHairline).frame(height: 1).padding(.vertical, 10)
            Text("Apple Health workout").logText(LoggerType.eyebrow10).foregroundStyle(PhysiqueOSTheme.redesignPurple)
            Text(Self.workoutTypeLabel(reconciliation.workout.canonicalType))
                .logText(LoggerType.strutTitle13)
                .foregroundStyle(PhysiqueOSTheme.redesignInk)
            Text(Self.timeRange(start: reconciliation.workout.startedAt, end: reconciliation.workout.endedAt))
                .logText(LoggerType.body11)
                .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
        }
        .loggerSurface(tone: PhysiqueOSTheme.redesignAmber)
        .accessibilityElement(children: .combine)
    }

    private func workoutMatchCandidate(index: Int, candidate: WorkoutReconciliationCandidate, isStrongest: Bool) -> some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        return VStack(alignment: .leading, spacing: 0) {
            Text("Logger session \(index + 1)")
                .logText(LoggerType.strutTitle12)
                .foregroundStyle(PhysiqueOSTheme.redesignInk)
            Text("\(Self.workoutTypeLabel(candidate.activityType)) · \(Self.timeRange(start: candidate.startedAt, end: candidate.endedAt))")
                .logText(LoggerType.candidateLine10)
                .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                .padding(.vertical, 3)
            Text("\(candidate.confidence)% match · \(Self.matchBasisLabel(candidate.basis))")
                .logText(LoggerType.recordLine10)
                .foregroundStyle(isStrongest ? PhysiqueOSTheme.redesignAmberInk : PhysiqueOSTheme.redesignUtilityMuted)
        }
        .padding(11)
        .padding(1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.redesignSoft, in: shape)
        .overlay(shape.strokeBorder(PhysiqueOSTheme.redesignHairline, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func workoutMatchActions(_ review: EvidenceReviewDetailReadModel) -> some View {
        switch actionState {
        case .idle where review.status == "pending":
            if let reconciliation = review.workoutReconciliation {
                VStack(spacing: 12) {
                    ForEach(Array(reconciliation.candidates.enumerated()), id: \.element.id) { index, candidate in
                        Group {
                            if index == 0 {
                                LoggerExecutionButton(title: "Use Logger session \(index + 1)", minHeight: 48) {
                                    Task { await resolveWorkoutReconciliation(review: review, loggerSessionCanonicalId: candidate.loggerSessionCanonicalId) }
                                }
                            } else {
                                workoutMatchButton("Use Logger session \(index + 1)", destructive: false) {
                                    Task { await resolveWorkoutReconciliation(review: review, loggerSessionCanonicalId: candidate.loggerSessionCanonicalId) }
                                }
                            }
                        }
                        .accessibilityIdentifier("evidenceReview.workoutReconciliation.confirm.\(index + 1)")
                    }
                    workoutMatchButton("No match", destructive: true) {
                        Task { await resolveWorkoutReconciliation(review: review, loggerSessionCanonicalId: nil) }
                    }
                    .accessibilityIdentifier("evidenceReview.workoutReconciliation.noMatch")
                }
            }
        case .workoutReconciliationResolved(let action):
            workoutMatchResolved(
                label: action == "no_match" ? "No match recorded" : "Match confirmed",
                detail: action == "no_match"
                    ? "The Apple Health workout remains unlinked. Logger detail and strategic eligibility were not changed."
                    : "The Apple Health workout is linked to the selected Logger session. Logger detail and strategic eligibility were not changed."
            )
        default:
            // Confirming, refresh-required, still-processing, failure and
            // terminal states keep their existing canonical presentation.
            actionSection(for: review)
        }
    }

    private func workoutMatchButton(_ title: String, destructive: Bool, action: @escaping () -> Void) -> some View {
        let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
        let tone = destructive ? PhysiqueOSTheme.redesignRed : PhysiqueOSTheme.redesignInk
        return Button(action: action) {
            Text(title)
                .logText(LoggerType.control14)
                .foregroundStyle(tone)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background {
                    if destructive { shape.fill(PhysiqueOSTheme.redesignRed.opacity(0.08)) } else { shape.fill(PhysiqueOSTheme.redesignSoft) }
                }
                .overlay(shape.strokeBorder(destructive ? PhysiqueOSTheme.redesignRed.opacity(0.55) : PhysiqueOSTheme.redesignHairline, lineWidth: 1))
                .contentShape(shape)
        }
        .buttonStyle(.plain)
    }

    private func workoutMatchResolved(label: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 5) {
                    Image(systemName: "checkmark").font(.system(size: 13, weight: .heavy)).accessibilityHidden(true)
                    Text(label).logText(LoggerType.surfaceTitle16)
                }
                .foregroundStyle(PhysiqueOSTheme.redesignGreen)
                .padding(.bottom, 4)
                Text(detail)
                    .logText(LoggerType.body11)
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .loggerSurface(tone: PhysiqueOSTheme.redesignGreen, toneFill: 0.13, toneRule: 0.36)
            .accessibilityElement(children: .combine)
            LoggerExecutionButton(title: "Back to Log", minHeight: 48) {
                onReturnToLog()
                dismiss()
            }
            .accessibilityIdentifier("evidenceReview.backToLog")
        }
    }

    private func header(for review: EvidenceReviewDetailReadModel) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(review.workoutReconciliation == nil ? "Evidence Review" : "Workout Match")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text(Self.statusLabel(review.status))
                .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            HStack(spacing: 8) {
                if let occurrence = Self.occurrenceDateLabel(for: review) {
                    Text(occurrence)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                        .accessibilityIdentifier("evidenceReviewDetail.occurrenceDate")
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

    /// The date the evidence actually occurred, read from the review's own
    /// items — deliberately never `review.createdAt`.
    ///
    /// The header used to hand `createdAt` to `TrainingDateFormatting.short`,
    /// which is a *date-key* formatter: it keeps the first ten characters and
    /// renders them in UTC. `createdAt` is an instant, so a review the Founder
    /// created at 7:11 PM on Sep 12 is `2026-09-13T02:11Z`, and the header read
    /// "Sep 13" for a DEXA scan that the Captured Evidence card on the same
    /// screen correctly listed as Sep 12, 2026. A review's creation instant is
    /// not the evidence's date under any time zone, so it is not shown at all.
    static func occurrenceDateLabel(for review: EvidenceReviewDetailReadModel) -> String? {
        if let localDate = review.workoutReconciliation?.localDate {
            return evidenceDateLabel(localDate)
        }
        let included = review.items.filter(\.included)
        let sourceItems = included.isEmpty ? review.items : included
        var unique: [String] = []
        for label in sourceItems.compactMap(\.date).map(evidenceDateLabel) where !unique.contains(label) {
            unique.append(label)
        }
        switch unique.count {
        case 0: return nil
        case 1: return unique[0]
        default: return "\(unique.count) dates"
        }
    }

    /// Item dates arrive either as a `"YYYY-MM-DD"` key or already formatted by
    /// the server. Both are calendar dates, never instants — which is what
    /// makes the UTC date-key formatter the right one here.
    static func evidenceDateLabel(_ value: String) -> String {
        value.contains(",") ? value : TrainingDateFormatting.short(value)
    }

    @ViewBuilder
    private func itemsCard(_ review: EvidenceReviewDetailReadModel) -> some View {
        if let reconciliation = review.workoutReconciliation {
            workoutReconciliationCard(reconciliation)
        } else {
            CardContainer {
                VStack(alignment: .leading, spacing: 10) {
                TrainingSectionHeaderView(title: "Captured Evidence")
                if let summary = review.summary {
                    Text(summary)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                if let excluded = review.excludedSummary {
                    Label(excluded, systemImage: "minus.circle")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                if review.items.isEmpty {
                    Text("No evidence items are attached to this review.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 6) {
                        ForEach(review.items) { item in
                            VStack(alignment: .leading, spacing: 9) {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.title ?? Self.typeLabel(item.type))
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    if let source = item.sourceLabel {
                                        Text(source)
                                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                                    }
                                }
                                Spacer(minLength: 8)
                                VStack(alignment: .trailing, spacing: 3) {
                                    Label(item.included ? "Included" : "Excluded", systemImage: item.included ? "checkmark.circle.fill" : "minus.circle.fill")
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                        .foregroundStyle(item.included ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.textMuted)
                                    if let date = item.date {
                                        Text(Self.evidenceDateLabel(date))
                                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                                    }
                                }
                            }
                            if !item.metrics.isEmpty {
                                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                                    ForEach(item.metrics) { metric in
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(metric.label.uppercased())
                                                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                                                .foregroundStyle(item.type == "nutrition" ? Self.nutritionMetricColor(metric.label) : PhysiqueOSTheme.accent)
                                            Text(metric.value)
                                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                        }
                                        .padding(10)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .background(PhysiqueOSTheme.surfaceMuted)
                                        .clipShape(RoundedRectangle(cornerRadius: 12))
                                    }
                                }
                            }
                            ForEach(item.exercises) { exercise in
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(exercise.name)
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    if let occurrence = exercise.occurrenceLabel { detailText(occurrence) }
                                    if let variant = exercise.variantLabel { detailText(variant) }
                                    if !exercise.sets.isEmpty { detailText(exercise.sets.joined(separator: " · ")) }
                                    if exercise.proposedNewExercise {
                                        Label("New exercise definition", systemImage: "plus.circle.fill")
                                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                            .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                                    }
                                    if !exercise.supersetWith.isEmpty { detailText("Superset with \(exercise.supersetWith.joined(separator: ", "))") }
                                }
                            }
                            ForEach(item.meals) { meal in
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(meal.name)
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    if !meal.summary.isEmpty { detailText(meal.summary) }
                                    ForEach(meal.foods) { food in
                                        let details = [food.brand, food.serving, food.calories].compactMap { $0 }.joined(separator: " · ")
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(food.name).physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                            if !details.isEmpty { detailText(details) }
                                        }
                                        .padding(.leading, 8)
                                    }
                                }
                                .padding(.top, 2)
                            }
                            if let reconciliation = item.reconciliation { detailText(reconciliation) }
                            if let typedEvidence = item.typedEvidence, !typedEvidence.isEmpty {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text("SUBMITTED TEXT")
                                        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                                        .foregroundStyle(PhysiqueOSTheme.accent)
                                    detailText(typedEvidence)
                                }
                            }
                            if let measurements = item.dexaMeasurements, actionState != .editingMeasurements {
                                dexaMeasurementSummary(measurements)
                            }
                            if let photoSession = item.photoSession {
                                photoSessionSummary(photoSession)
                            }
                            }
                            .padding(.vertical, 8)
                        }
                    }
                }
                }
            }
        }
    }

    private func workoutReconciliationCard(_ reconciliation: WorkoutReconciliationDetail) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: reconciliation.title)
                Text(reconciliation.summary)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                VStack(alignment: .leading, spacing: 4) {
                    Text("APPLE HEALTH WORKOUT")
                        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                        .foregroundStyle(PhysiqueOSTheme.accent)
                    Text(Self.workoutTypeLabel(reconciliation.workout.canonicalType))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(Self.timeRange(start: reconciliation.workout.startedAt, end: reconciliation.workout.endedAt))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                Divider().overlay(PhysiqueOSTheme.divider)
                Text("POSSIBLE LOGGER SESSIONS")
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                ForEach(Array(reconciliation.candidates.enumerated()), id: \.element.id) { index, candidate in
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Logger session \(index + 1)")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text(Self.workoutTypeLabel(candidate.activityType))
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        Text(Self.timeRange(start: candidate.startedAt, end: candidate.endedAt))
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                        Text("\(candidate.confidence)% match · \(Self.matchBasisLabel(candidate.basis))")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 5)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func detailText(_ value: String) -> some View {
        Text(value)
            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
            .foregroundStyle(PhysiqueOSTheme.textSecondary)
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

    private func photoSessionSummary(_ session: EvidenceReviewPhotoSession) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("PHOTO SESSION").physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10).foregroundStyle(PhysiqueOSTheme.accent)
            detailText("Session \(session.sessionId)")
            if let time = session.timeOfDay { detailText("Time of day: \(time.capitalized)") }
            if let goal = session.goalRelationship { detailText("Goal relationship: \(goal)") }
            ForEach(session.photos) { photo in
                let identity = photo.label ?? photo.poseId ?? [photo.orientation, photo.contractionState, photo.poseVariant]
                    .compactMap { $0 }.joined(separator: " · ")
                Label(identity.isEmpty ? "Pose needs review" : identity, systemImage: "photo")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
            }
        }
        .padding(.top, 3)
    }

    @ViewBuilder
    private func actionSection(for review: EvidenceReviewDetailReadModel) -> some View {
        switch actionState {
        case .idle:
            if review.status == "confirmed" {
                completionActions(label: "Confirmed")
            } else if let reconciliation = review.workoutReconciliation, review.status == "pending" {
                VStack(spacing: 10) {
                    ForEach(Array(reconciliation.candidates.enumerated()), id: \.element.id) { index, candidate in
                        PrimaryActionButton(title: "Use Logger session \(index + 1)", tone: .accent) {
                            Task { await resolveWorkoutReconciliation(review: review, loggerSessionCanonicalId: candidate.loggerSessionCanonicalId) }
                        }
                        .accessibilityIdentifier("evidenceReview.workoutReconciliation.confirm.\(index + 1)")
                    }
                    Button("No match", role: .destructive) {
                        Task { await resolveWorkoutReconciliation(review: review, loggerSessionCanonicalId: nil) }
                    }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("evidenceReview.workoutReconciliation.noMatch")
                }
            } else if Self.isActionable(review.status) {
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
        case .accepted:
            completionActions(label: "Confirmation accepted")
        case .confirmed:
            completionActions(label: "Confirmed")
        case .workoutReconciliationResolved(let action):
            if action == "no_match" {
                completionActions(
                    label: "No match recorded",
                    detail: "The Apple Health workout remains unlinked. Logger detail and strategic eligibility were not changed."
                )
            } else {
                completionActions(
                    label: "Match confirmed",
                    detail: "The Apple Health workout is linked to the selected Logger session. Logger detail and strategic eligibility were not changed."
                )
            }
        case .stillProcessing:
            CardContainer { VStack(alignment: .leading, spacing: 6) {
                Text("Still confirming").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                Text("This is taking longer than usual. Reopen this review in a moment to check its status — confirmation continues on the server regardless of this screen.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                Button("Check Now") { Task { await load(); actionState = .idle } }
            }.frame(maxWidth: .infinity, alignment: .leading) }
        case .refreshRequired(let message):
            CardContainer { VStack(alignment: .leading, spacing: 8) {
                Text("Refresh required").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                Text(message)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Button("Refresh Review") { Task { actionState = .idle; await load() } }
            }.frame(maxWidth: .infinity, alignment: .leading) }
        case .failed(let message):
            VStack(alignment: .leading, spacing: 10) {
                Text(message).physiqueOSFont(PhysiqueOSTypography.calloutStrong).foregroundStyle(PhysiqueOSTheme.destructive)
                PrimaryActionButton(title: "Try Again", tone: .accent) { actionState = .idle }
            }
        }
    }

    private func completionActions(
        label: String,
        detail: String = "PhysiqueOS owns this confirmation. Remaining analysis and briefing updates continue in the background."
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(label, systemImage: "checkmark.circle.fill")
                .foregroundStyle(PhysiqueOSTheme.chartSuccess)
            Text(detail)
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            PrimaryActionButton(title: "Back to Log", tone: .accent) {
                onReturnToLog()
                dismiss()
            }
            .accessibilityIdentifier("evidenceReview.backToLog")
        }
    }

    // MARK: - DEXA correction

    private func beginEditingMeasurements(review: EvidenceReviewDetailReadModel) {
        guard let item = review.items.first(where: { $0.dexaMeasurements != nil }), let measurements = item.dexaMeasurements else { return }
        editedMeasurements = measurements
        measurementTexts = [
            "measuredAt": measurements.measuredAt ?? "",
            "totalMass": measurements.totalMassLb.map(Self.editableNumber) ?? "",
            "bodyFat": measurements.bodyFatPercentage.map(Self.editableNumber) ?? "",
            "fatMass": measurements.fatMassLb.map(Self.editableNumber) ?? "",
            "leanMass": measurements.leanMassLb.map(Self.editableNumber) ?? "",
            "boneMineral": measurements.boneMineralContentLb.map(Self.editableNumber) ?? "",
            "rmr": measurements.restingMetabolicRateKcal.map(Self.editableNumber) ?? "",
            "vatMass": measurements.visceralAdiposeTissueMassLb.map(Self.editableNumber) ?? "",
            "vatVolume": measurements.visceralAdiposeTissueVolumeIn3.map(Self.editableNumber) ?? "",
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
        guard let version = review.version else {
            actionState = .failed("This review's version could not be read. Refresh before trying again.")
            return
        }
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
            if ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: error) {
                do {
                    let refreshed = try await environment.evidenceReviewAPI.fetchReview(reviewId: reviewId)
                    if let refreshed, refreshed.version != review.version {
                        state = .loaded(refreshed)
                        actionState = .idle
                    } else {
                        actionState = .refreshRequired("The correction may have been accepted, but its final state could not be verified. Refresh before making another change.")
                    }
                } catch {
                    actionState = .refreshRequired("The correction may have been accepted, but its final state could not be verified. Refresh before making another change.")
                }
            } else {
                actionState = .failed(Self.errorMessage(for: error))
            }
        }
    }

    // MARK: - Confirm

    private func resolveWorkoutReconciliation(
        review: EvidenceReviewDetailReadModel,
        loggerSessionCanonicalId: String?
    ) async {
        let requestedAction = loggerSessionCanonicalId == nil ? "no_match" : "confirm"
        // Diagnostic-only, additive: makes a previously-silent guard failure
        // observable (no retry, no behavior change beyond surfacing state
        // the Founder can see instead of a dead button), and records each
        // stage so the NEXT real attempt is self-diagnosing rather than
        // needing another round of speculation. See
        // WorkoutReconciliationDiagnostics's own doc comment for why.
        guard let version = review.version else {
            WorkoutReconciliationDiagnostics.record(.init(
                capturedAt: Date(), stage: "guard_check_failed", reviewId: review.id, action: requestedAction,
                rawVersionValue: nil, rawVersionType: "nil"
            ))
            actionState = .failed("This review's version could not be read. Refresh before trying again.")
            return
        }
        WorkoutReconciliationDiagnostics.record(.init(
            capturedAt: Date(), stage: "guard_check_passed", reviewId: review.id, action: requestedAction,
            rawVersionValue: String(version), rawVersionType: "Int", expectedVersion: String(version)
        ))
        actionState = .confirming(loggerSessionCanonicalId == nil ? "Recording no match…" : "Confirming workout match…")
        WorkoutReconciliationDiagnostics.record(.init(
            capturedAt: Date(), stage: "submit_attempt", reviewId: review.id, action: requestedAction,
            expectedVersion: String(version)
        ))
        do {
            let result = try await environment.evidenceReviewAPI.resolveWorkoutReconciliation(
                reviewId: review.id,
                expectedVersion: String(version),
                loggerSessionCanonicalId: loggerSessionCanonicalId
            )
            WorkoutReconciliationDiagnostics.record(.init(
                capturedAt: Date(), stage: "submit_result", reviewId: review.id, action: requestedAction,
                expectedVersion: String(version), outcome: "submitCommand_returned"
            ))
            await environment.productionNativeAPI.invalidateReadResources([
                "evidence-review", "evidence-review-queue", "training-landing", "training-day",
            ])
            if Self.reconciliationCommandResultMatches(
                result,
                requestedReviewId: review.id,
                requestedAction: requestedAction,
                loggerSessionCanonicalId: loggerSessionCanonicalId
            ) {
                actionState = .workoutReconciliationResolved(requestedAction)
            } else if let refreshed = try? await environment.evidenceReviewAPI.fetchReview(reviewId: review.id) {
                state = .loaded(refreshed)
                actionState = Self.reconciliationResolutionMatches(
                    refreshed,
                    requestedReviewId: review.id,
                    requestedAction: requestedAction,
                    loggerSessionCanonicalId: loggerSessionCanonicalId
                )
                    ? .workoutReconciliationResolved(requestedAction)
                    : .refreshRequired("The reconciliation outcome could not be verified as the action you requested. Review the current result before trying again.")
            } else {
                actionState = .refreshRequired("The reconciliation may have been accepted, but its exact outcome could not be verified. Refresh before making another change.")
            }
        } catch {
            let underlying = WorkoutReconciliationDiagnostics.describe(error)
            // Read before anything else in this block: a later `await` (the
            // verification fetch below) would run under a fresh check of its
            // own, so this must be the state at the moment the throw was
            // caught, not after any further suspension.
            let taskWasCancelledAtCatch = Task.isCancelled
            WorkoutReconciliationDiagnostics.record(.init(
                capturedAt: Date(), stage: "submit_threw", reviewId: review.id, action: requestedAction,
                expectedVersion: String(version),
                outcome: ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: error) ? "acceptance_uncertain" : "definite_failure",
                underlyingErrorDomain: underlying.domain, underlyingErrorCode: underlying.code,
                underlyingErrorDescription: underlying.description,
                taskWasCancelledAtCatch: taskWasCancelledAtCatch
            ))
            if ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: error) {
                if let refreshed = try? await environment.evidenceReviewAPI.fetchReview(reviewId: review.id) {
                    state = .loaded(refreshed)
                    actionState = Self.reconciliationResolutionMatches(
                        refreshed,
                        requestedReviewId: review.id,
                        requestedAction: requestedAction,
                        loggerSessionCanonicalId: loggerSessionCanonicalId
                    )
                        ? .workoutReconciliationResolved(requestedAction)
                        : .refreshRequired("The reconciliation outcome could not be verified as the action you requested. Review the current result before trying again.")
                } else {
                    actionState = .refreshRequired("The reconciliation may have been accepted, but its exact outcome could not be verified. Refresh before making another change.")
                }
            } else {
                actionState = .failed(Self.errorMessage(for: error))
            }
        }
    }

    static func reconciliationResolutionMatches(
        _ review: EvidenceReviewDetailReadModel,
        requestedReviewId: String,
        requestedAction: String,
        loggerSessionCanonicalId: String?
    ) -> Bool {
        guard review.id == requestedReviewId, let version = review.version, version > 0 else { return false }
        guard let resolution = review.workoutReconciliation?.resolution else { return false }
        if requestedAction == "no_match" {
            return review.status == "resolved_no_match" &&
                resolution.action == "no_match" &&
                resolution.selectedLoggerSessionCanonicalId == nil &&
                resolution.linkId == nil
        }
        return review.status == "resolved_confirmed" &&
            resolution.action == "confirm" &&
            resolution.selectedLoggerSessionCanonicalId == loggerSessionCanonicalId &&
            !(resolution.linkId ?? "").isEmpty
    }

    static func reconciliationCommandResultMatches(
        _ result: WorkoutReconciliationCommandResult,
        requestedReviewId: String,
        requestedAction: String,
        loggerSessionCanonicalId: String?
    ) -> Bool {
        guard result.reviewId == requestedReviewId,
              let revision = result.revision, revision > 0,
              result.status == (requestedAction == "no_match" ? "resolved_no_match" : "resolved_confirmed"),
              let resolution = result.resolution,
              resolution.action == requestedAction
        else { return false }
        if requestedAction == "no_match" {
            return resolution.selectedLoggerSessionCanonicalId == nil && resolution.linkId == nil
        }
        return resolution.selectedLoggerSessionCanonicalId == loggerSessionCanonicalId &&
            !(resolution.linkId ?? "").isEmpty
    }

    private func confirm(review: EvidenceReviewDetailReadModel) async {
        guard let version = review.version else {
            actionState = .failed("This review's version could not be read. Refresh before trying again.")
            return
        }
        let domain = Self.domain(for: review)
        let confirmationStartedAt = ContinuousClock.now
        actionState = .confirming("Confirming…")
        do {
            let confirmation = try await environment.evidenceIntakePipeline.commitReview(
                domain: domain, reviewId: reviewId, expectedVersion: String(version)
            )
            if confirmation?.accepted == true || confirmation?.state == "confirmed" {
                await acknowledgeAcceptedProcessing(review: review, domain: domain)
            }
            if confirmation?.canonicalStateDurable == true {
                // The server has crossed the canonical durability boundary,
                // but Log may still hold a pre-confirm cache. Detach it and
                // prove this review's own date is immediately readable before
                // showing any accepted/success state.
                guard await verifyImmediateCanonicalReadback(review: review, domain: domain) else {
                    actionState = .stillProcessing
                    await invalidateAcceptedProcessingReads()
                    Self.recordConfirmationTiming(from: confirmationStartedAt, outcome: "durable_readback_pending")
                    return
                }
                if confirmation?.state == "confirmed" {
                    Self.recordConfirmationTiming(from: confirmationStartedAt, outcome: "confirmed")
                    actionState = .confirmed
                } else {
                    Self.recordConfirmationTiming(from: confirmationStartedAt, outcome: "canonical_durable_readback")
                    actionState = .accepted
                }
                return
            }
            if confirmation?.state == "confirmed" {
                Self.recordConfirmationTiming(from: confirmationStartedAt, outcome: "confirmed")
                actionState = .confirmed
                return
            }
            // A successful command response represents the durable,
            // version-protected acceptance boundary — the outbox owns the
            // remaining canonical/post-confirm checkpoints regardless of
            // what happens next on this screen. But that finishes in a
            // couple of seconds in the ordinary case, so take one brief,
            // tightly-bounded look before settling for "accepted, continues
            // in the background": if it's already done, show that instead
            // of making the Founder wonder or come back later.
            do {
                try await environment.evidenceIntakePipeline.awaitConfirmation(
                    reviewAPI: environment.evidenceReviewAPI, reviewId: reviewId,
                    pollInterval: Self.fastFollowUpPollInterval, maxPolls: Self.fastFollowUpMaxPolls
                )
                await acknowledgeAcceptedProcessing(review: review, domain: domain)
                actionState = .confirmed
                Self.recordConfirmationTiming(from: confirmationStartedAt, outcome: "confirmed_readback")
                return
            } catch ProductionEvidenceIntakePipeline.Error.commitFailed {
                actionState = .failed("This review needs another look — the canonical commit failed. Reopen it to try again.")
                return
            } catch {
                // Not resolved within the fast window — keeping this screen
                // blocked any longer would only turn ordinary latency into a
                // false Confirm failure. The outbox still owns finishing it.
            }
            actionState = .accepted
            await invalidateAcceptedProcessingReads()
            Self.recordConfirmationTiming(from: confirmationStartedAt, outcome: "accepted_processing")
            return
        } catch {
            if !ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: error) {
                actionState = .failed(Self.errorMessage(for: error))
                return
            }
            // The response is ambiguous after dispatch. Poll the canonical
            // review before allowing any retry; the stable idempotency key
            // remains the sole identity for this attempt.
        }
        // The response was lost after dispatch. Perform one read-only status
        // resolution, never a second mutation. Check Now remains available
        // only when that single recovery read is also inconclusive.
        do {
            guard let refreshed = try await environment.evidenceReviewAPI.fetchReview(reviewId: reviewId) else {
                actionState = .stillProcessing
                return
            }
            state = .loaded(refreshed)
            switch refreshed.status {
            case "confirmed": actionState = .confirmed
            case "committing":
                await acknowledgeAcceptedProcessing(review: refreshed, domain: domain)
                actionState = .accepted
                await invalidateAcceptedProcessingReads()
            case "partially_committed":
                actionState = .failed("This review needs another look — processing stopped after a partial commit. Reopen it to continue safely.")
            case "commit_failed": actionState = .failed("This review needs another look — the canonical commit failed. Reopen it to try again.")
            default: actionState = .stillProcessing
            }
        } catch {
            actionState = .stillProcessing
        }
    }

    @MainActor
    private func invalidateAcceptedProcessingReads() async {
        // The queue projection owns READY_FOR_REVIEW vs ACCEPTED_PROCESSING.
        // Detach the pre-confirm cache immediately so returning to Log cannot
        // continue offering a second Confirm for a server-owned operation.
        await environment.productionNativeAPI.invalidateReadResources(["evidence-review-queue"])
    }

    @MainActor
    private func acknowledgeAcceptedProcessing(
        review: EvidenceReviewDetailReadModel,
        domain: NativeProductWriteDomain
    ) async {
        let projection: (domain: String, label: String) = switch domain {
        case .workoutLogger: ("training", "Training")
        case .nutrition: ("nutrition", "Nutrition")
        case .activityEvidence: ("activity", "Activity")
        case .dexa: ("dexa", "DEXA")
        case .progressPhotos: ("photos", "Progress Photos")
        default: ("evidence", "Evidence")
        }
        await environment.productionNativeAPI.acknowledgeAcceptedEvidenceReviewProcessing(.init(
            id: review.id,
            localDate: review.items.compactMap(\.date).first,
            domain: projection.domain,
            label: projection.label
        ))
        await invalidateAcceptedProcessingReads()
    }

    @MainActor
    private func verifyImmediateCanonicalReadback(
        review: EvidenceReviewDetailReadModel,
        domain: NativeProductWriteDomain
    ) async -> Bool {
        guard let date = review.items.compactMap({ $0.canonicalDate ?? $0.date }).first else { return false }
        switch domain {
        case .activityEvidence:
            await environment.productionNativeAPI.invalidateReadResources([
                "activity", "evidence-review-queue",
            ])
            return (try? await environment.activityAPI.fetchActivityDay(date: date)) != nil
        case .nutrition:
            await environment.productionNativeAPI.invalidateReadResources([
                "nutrition", "evidence-review-queue",
            ])
            guard let landing = try? await environment.nutritionAPI.fetchNutritionLanding(scope: .all) else {
                return false
            }
            return landing.nutritionHistory.contains(where: { $0.date == date })
        case .workoutLogger:
            await environment.productionNativeAPI.invalidateReadResources([
                "training-landing", "training-day", "evidence-review-queue",
            ])
            return true
        case .dexa:
            await environment.productionNativeAPI.invalidateReadResources([
                "dexa", "evidence-review-queue",
            ])
            return true
        case .progressPhotos:
            await environment.productionNativeAPI.invalidateReadResources([
                "photos", "home", "briefing-history", "evidence-review-queue",
                "photo-event", "briefing",
            ])
            guard let landing = try? await environment.photosAPI.fetchPhotosLanding(scope: .all) else {
                return false
            }
            return landing.history.contains(where: { $0.date == date })
        default:
            await environment.productionNativeAPI.invalidateReadResources(["evidence-review-queue"])
            return true
        }
    }

    private static func recordConfirmationTiming(from start: ContinuousClock.Instant, outcome: String) {
        let components = start.duration(to: .now).components
        let milliseconds = Int(components.seconds * 1_000 + components.attoseconds / 1_000_000_000_000_000)
        EvidenceLifecycleDiagnostics.recordConfirmation(milliseconds: milliseconds, outcome: outcome)
    }

    private func dismissReview(review: EvidenceReviewDetailReadModel) async {
        guard let version = review.version else {
            actionState = .failed("This review's version could not be read. Refresh before trying again.")
            return
        }
        actionState = .dismissing
        do {
            try await environment.evidenceIntakePipeline.dismissReview(
                domain: Self.domain(for: review), reviewId: reviewId, expectedVersion: String(version)
            )
            actionState = .dismissed
        } catch {
            if ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: error) {
                do {
                    let refreshed = try await environment.evidenceReviewAPI.fetchReview(reviewId: reviewId)
                    if refreshed == nil || refreshed?.status == "discarded" {
                        actionState = .dismissed
                    } else {
                        if let refreshed { state = .loaded(refreshed) }
                        actionState = .refreshRequired("Dismissal may have been accepted. Refresh this review before trying again.")
                    }
                } catch {
                    actionState = .refreshRequired("Dismissal may have been accepted. Refresh this review before trying again.")
                }
            } else {
                actionState = .failed(Self.errorMessage(for: error))
            }
        }
    }

    private static func isActionable(_ status: String) -> Bool {
        ["pending", "commit_failed", "partially_committed"].contains(status)
    }

    /// A couple of seconds, matching the Founder's expectation that
    /// confirmation "normally" finishes about that fast. Anything slower
    /// falls back to the existing "accepted, continues in the background"
    /// messaging rather than holding this screen open indefinitely.
    private static let fastFollowUpPollInterval: Duration = .seconds(1)
    private static let fastFollowUpMaxPolls = 3

    /// Reuses the exact same Calories/Protein/Carbs/Fat tokens the
    /// established Nutrition presentation (`PhysiqueOSTheme.nutritionCalories`/
    /// `macroProtein`/`macroCarbohydrates`/`macroFat`) already uses, rather
    /// than inventing a second palette — matches the server's own
    /// `EvidenceReviewPresentationService` metric labels exactly.
    private static func nutritionMetricColor(_ label: String) -> Color {
        switch label {
        case "Calories": PhysiqueOSTheme.nutritionCalories
        case "Protein": PhysiqueOSTheme.macroProtein
        case "Carbs": PhysiqueOSTheme.macroCarbohydrates
        case "Fat": PhysiqueOSTheme.macroFat
        default: PhysiqueOSTheme.accent
        }
    }

    private static func domain(for review: EvidenceReviewDetailReadModel) -> NativeProductWriteDomain {
        switch review.items.first?.type {
        case "nutrition": .nutrition
        case "activity_day", "activity": .activityEvidence
        case "training": .workoutLogger
        case "dexa_scan", "dexa", "body_composition": .dexa
        case "photo_session", "progress_photo", "photos": .progressPhotos
        default: .evidenceReview
        }
    }

    private static func formatNumber(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }

    /// The correction form's starting text: the exact interpreted value
    /// (trailing zeros trimmed). The correction is a full replacement, so a
    /// display-rounded pre-fill (`0.24` → `0.2`) would silently rewrite every
    /// field the Founder did not touch.
    static func editableNumber(_ value: Double) -> String {
        var text = String(format: "%.6f", value)
        while text.hasSuffix("0") { text.removeLast() }
        if text.hasSuffix(".") { text.removeLast() }
        return text
    }

    /// What the Founder reads when the Server refuses a confirmation. A refusal
    /// is a failure, never an acknowledgement: the review stays pending and the
    /// message says why and what to do.
    nonisolated static func errorMessage(for error: Error) -> String {
        if let productionError = error as? ProductionNativeError {
            let problem: ProductionProblemDetails? = switch productionError {
            case .validation(let value), .failedPrecondition(let value),
                 .preconditionRequired(let value), .conflict(let value): value
            default: nil
            }
            if problem?.code == "NUTRITION_DAILY_TOTALS_CONFLICT" {
                let fields = problem?.fieldErrors.compactMap { field -> String? in
                    guard field.code == "conflicts_with_meal_totals" else { return nil }
                    return field.field.split(separator: ".").last.map {
                        String($0).replacingOccurrences(of: "_", with: " ")
                    }
                } ?? []
                let fieldCopy = fields.isEmpty ? "one or more totals" : fields.joined(separator: ", ")
                return "The meal sum conflicts with the daily total for \(fieldCopy). Dismiss this review, correct the source totals, and upload it again."
            }
            if let code = problem?.code, ["PHOTO_POSE_UNRESOLVED", "PHOTO_SESSION_DETAILS_UNRESOLVED"].contains(code) {
                let reason = problem?.detail ?? problem?.title ?? "It needs a correction before it can be confirmed."
                return "This photo review can't be confirmed yet. \(reason) Dismiss it and upload the photos again."
            }
            return productionError.errorDescription ?? "This review could not be updated."
        }
        return "This review could not be updated."
    }

    private static func statusLabel(_ status: String) -> String {
        switch status {
        case "pending": "Pending Review"
        case "commit_failed": "Needs Attention"
        case "partially_committed": "Partially Confirmed"
        case "committing": "Confirming"
        case "confirmed": "Confirmed"
        case "resolved_confirmed": "Match Confirmed"
        case "resolved_no_match": "No Match"
        default: "Review unavailable"
        }
    }

    private static func typeLabel(_ type: String) -> String {
        switch type {
        case "training": "Workout"
        case "nutrition": "Nutrition"
        case "activity": "Activity"
        case "weight": "Weight"
        case "dexa", "dexa_scan", "body_composition": "DEXA"
        case "photo_session", "progress_photo": "Progress Photos"
        case "recovery": "Recovery"
        case "labs", "lab_result": "Labs"
        default: "Evidence"
        }
    }

    private static func workoutTypeLabel(_ value: String) -> String {
        value.replacingOccurrences(of: "_", with: " ")
            .split(separator: " ")
            .map { $0.capitalized }
            .joined(separator: " ")
    }

    private static func matchBasisLabel(_ value: String) -> String {
        switch value {
        case "explicit_source_identity": "Exact source identity"
        case "logger_session_window": "Logger time window"
        case "temporal_and_telemetry": "Time and telemetry"
        default: workoutTypeLabel(value)
        }
    }

    private static func timeRange(start: String?, end: String?) -> String {
        guard let start else { return "Time unavailable" }
        let startLabel = displayTime(start)
        guard let end else { return startLabel }
        return "\(startLabel) – \(displayTime(end))"
    }

    private static func displayTime(_ value: String) -> String {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let ordinary = ISO8601DateFormatter()
        ordinary.formatOptions = [.withInternetDateTime]
        guard let date = fractional.date(from: value) ?? ordinary.date(from: value) else { return value }
        return date.formatted(date: .omitted, time: .shortened)
    }
}

// MARK: - Presentation route

/// Which presentation a review uses. Only a Workout Match
/// (`workoutReconciliation`) keeps its specialised branch (Founder-approved
/// Batch 2 L13); every other review — Nutrition, Activity, DEXA, Progress
/// Photos, typed and mixed — uses the locked generic Evidence Review.
enum EvidenceReviewPresentationRoute: Equatable {
    case generic
    case workoutMatch

    init(review: EvidenceReviewDetailReadModel?) {
        self = review?.workoutReconciliation == nil ? .generic : .workoutMatch
    }

    init(state: EvidenceReviewDetailView.LoadState) {
        if case .loaded(let review) = state { self.init(review: review) } else { self = .generic }
    }
}

// MARK: - Generic Evidence Review (locked Final Design Batch 1, `85ef2a6c`)

extension EvidenceReviewDetailView {
    var genericWorkflowBody: some View {
        WorkflowPage {
            genericContent
        }
        .physiqueOSScrollBottomClearance()
        .workflowChrome(back: "Back")
    }

    @ViewBuilder
    private var genericContent: some View {
        switch state {
        case .loading:
            WorkflowSurface(tone: .rich) {
                WorkflowStateRow(lead: .spinner, title: "Loading Evidence Review", isLast: true, identifier: "evidenceReview.loading")
                    .padding(.vertical, -13)
            }
        case .failed(let message):
            WorkflowSurface(tone: .rich) {
                WorkflowStateRow(lead: .icon(.error), title: message, isLast: true, identifier: "evidenceReview.loadFailed")
                    .padding(.vertical, -13)
            }
        case .loaded(.none):
            WorkflowSurface(tone: .rich) {
                WorkflowStateRow(lead: .icon(.question), title: "This Evidence Review could not be found.", isLast: true, identifier: "evidenceReview.notFound")
                    .padding(.vertical, -13)
            }
        case .loaded(.some(let review)):
            WorkflowReviewHero(
                title: Self.statusLabel(review.status),
                date: Self.genericOccurrenceDate(for: review),
                version: review.version.map { "Version \($0)" }
            )
            if actionState == .editingMeasurements,
               let dexaItem = review.items.first(where: { $0.dexaMeasurements != nil }) {
                genericCorrectionForm(review: review, item: dexaItem)
            } else {
                genericItems(review)
                genericActions(review)
            }
        }
    }

    /// The occurrence date in the locked long form (`Sep 23, 2026`): the
    /// same items and rules as `occurrenceDateLabel`, never `createdAt`.
    static func genericOccurrenceDate(for review: EvidenceReviewDetailReadModel) -> String? {
        let included = review.items.filter(\.included)
        let sourceItems = included.isEmpty ? review.items : included
        var unique: [String] = []
        for label in sourceItems.compactMap(\.date).map(longEvidenceDate) where !unique.contains(label) {
            unique.append(label)
        }
        switch unique.count {
        case 0: return nil
        case 1: return unique[0]
        default: return "\(unique.count) dates"
        }
    }

    /// `Sep 23, 2026` for a `YYYY-MM-DD` key; Server-formatted labels pass through.
    static func longEvidenceDate(_ value: String) -> String {
        value.contains(",") ? value : TimelineDateFormatting.long(value)
    }

    // MARK: Captured evidence

    private func genericItems(_ review: EvidenceReviewDetailReadModel) -> some View {
        WorkflowSurface(tone: review.items.count == 1 ? .rich : .plain) {
            VStack(alignment: .leading, spacing: 0) {
                if review.items.count != 1 || review.summary != nil {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("CAPTURED EVIDENCE").evidenceText(WorkflowText.micro).foregroundStyle(WorkflowColor.muted)
                        if let summary = review.summary {
                            Text(summary)
                                .evidenceText(WorkflowText.h2)
                                .foregroundStyle(WorkflowColor.text)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(.bottom, 11)
                }
                if review.items.isEmpty {
                    Text("No evidence items are attached to this review.")
                        .evidenceText(WorkflowText.small)
                        .foregroundStyle(WorkflowColor.muted)
                        .padding(.top, 11)
                } else {
                    ForEach(Array(review.items.enumerated()), id: \.element.id) { index, item in
                        genericItem(item, review: review, isLast: index == review.items.count - 1)
                    }
                }
                if let excluded = review.excludedSummary {
                    Text(excluded)
                        .evidenceText(WorkflowText.small)
                        .foregroundStyle(WorkflowColor.muted)
                        .padding(.top, 10)
                        .accessibilityIdentifier("evidenceReview.excludedSummary")
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("evidenceReview.items")
    }

    private func genericItem(_ item: EvidenceReviewDetailItem, review: EvidenceReviewDetailReadModel, isLast: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(item.title ?? Self.typeLabel(item.type)).evidenceText(WorkflowText.h3).foregroundStyle(WorkflowColor.text)
                        .accessibilityIdentifier("evidenceReview.item.\(item.type)")
                    if let source = item.sourceLabel {
                        Text(source).evidenceText(WorkflowText.secondary).foregroundStyle(WorkflowColor.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing, spacing: 5) {
                    WorkflowTag(text: item.included ? "✓ Included" : "− Excluded", tone: item.included ? .green : .muted)
                    if let date = item.date {
                        Text(Self.longEvidenceDate(date)).evidenceText(WorkflowText.secondary).foregroundStyle(WorkflowColor.muted)
                    }
                }
            }
            .padding(.bottom, 10)
            if !item.metrics.isEmpty {
                WorkflowGrid(items: item.metrics) { metric in
                    WorkflowMetricTile(label: metric.label, value: metric.value, tone: Self.metricTone(metric.label, itemType: item.type))
                }
            } else if let measurements = item.dexaMeasurements {
                // Server metrics own the DEXA presentation; the measurement
                // set is shown only when the Server sent no metrics.
                WorkflowGrid(items: Self.measurementTiles(measurements)) { tile in
                    WorkflowMetricTile(label: tile.0, value: tile.1, tone: tile.0 == "Body fat" ? .amber : tile.0 == "RMR" ? .purple : .teal)
                }
            }
            ForEach(item.meals) { meal in
                VStack(alignment: .leading, spacing: 0) {
                    Text(meal.name).evidenceText(WorkflowText.h3).foregroundStyle(WorkflowColor.text)
                    if !meal.summary.isEmpty {
                        Text(meal.summary).evidenceText(WorkflowText.small).foregroundStyle(WorkflowColor.muted).fixedSize(horizontal: false, vertical: true)
                    }
                    ForEach(meal.foods) { food in
                        let details = [food.brand, food.serving, food.calories].compactMap { $0 }.joined(separator: " · ")
                        VStack(alignment: .leading, spacing: 0) {
                            Text(food.name).evidenceText(WorkflowText.label).foregroundStyle(WorkflowColor.text)
                            if !details.isEmpty { Text(details).evidenceText(WorkflowText.small).foregroundStyle(WorkflowColor.muted) }
                        }
                        .padding(.top, 6)
                        .padding(.leading, 8)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 10)
                .overlay(alignment: .top) { Rectangle().fill(WorkflowColor.line).frame(height: 1) }
            }
            ForEach(item.exercises) { exercise in
                VStack(alignment: .leading, spacing: 2) {
                    Text(exercise.name).evidenceText(WorkflowText.h3).foregroundStyle(WorkflowColor.text)
                    ForEach([exercise.occurrenceLabel, exercise.variantLabel, exercise.sets.isEmpty ? nil : exercise.sets.joined(separator: " · "), exercise.supersetWith.isEmpty ? nil : "Superset with \(exercise.supersetWith.joined(separator: ", "))"].compactMap { $0 }, id: \.self) { line in
                        Text(line).evidenceText(WorkflowText.small).foregroundStyle(WorkflowColor.muted)
                    }
                    if exercise.proposedNewExercise {
                        WorkflowTag(text: "New exercise definition", tone: .green).padding(.top, 4)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 10)
                .overlay(alignment: .top) { Rectangle().fill(WorkflowColor.line).frame(height: 1) }
            }
            if let reconciliation = item.reconciliation {
                Text(reconciliation).evidenceText(WorkflowText.small).foregroundStyle(WorkflowColor.muted).padding(.top, 8)
            }
            if let typed = item.typedEvidence, !typed.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("SUBMITTED TEXT").evidenceText(WorkflowText.micro).foregroundStyle(WorkflowColor.teal)
                    Text(typed).evidenceText(WorkflowText.small).foregroundStyle(WorkflowColor.muted).fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 10)
            }
            if let session = item.photoSession {
                genericPhotoSession(session)
            }
        }
        .padding(.vertical, 13)
        .overlay(alignment: .bottom) {
            if !isLast { Rectangle().fill(WorkflowColor.line).frame(height: 1) }
        }
    }

    private func genericPhotoSession(_ session: EvidenceReviewPhotoSession) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("PHOTO SESSION").evidenceText(WorkflowText.micro).foregroundStyle(WorkflowColor.muted)
            Text("Session \(session.sessionId)").evidenceText(WorkflowText.small).foregroundStyle(WorkflowColor.muted).padding(.vertical, 6)
            if let time = session.timeOfDay {
                Text("Time of day: \(time.capitalized)").evidenceText(WorkflowText.small).foregroundStyle(WorkflowColor.muted)
            }
            if let goal = session.goalRelationship {
                Text("Goal relationship: \(goal)").evidenceText(WorkflowText.small).foregroundStyle(WorkflowColor.muted)
            }
            ForEach(Array(session.photos.enumerated()), id: \.element.id) { index, photo in
                let identity = photo.label ?? photo.poseId ?? [photo.orientation, photo.contractionState, photo.poseVariant].compactMap { $0 }.joined(separator: " · ")
                HStack(spacing: 9) {
                    WorkflowFileIcon(size: 32)
                    Text(identity.isEmpty ? "Pose needs review" : identity).evidenceText(WorkflowText.label).foregroundStyle(WorkflowColor.text)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .overlay(alignment: .bottom) {
                    if index < session.photos.count - 1 { Rectangle().fill(WorkflowColor.line).frame(height: 1) }
                }
            }
        }
        .padding(.top, 7)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("evidenceReview.photoSession")
    }

    /// Nutrition macros resolve through `NutritionEvidenceMacro`, the same
    /// authority as the Nutrition Evidence page; other metrics keep the
    /// locked review tones.
    static func metricTone(_ label: String, itemType: String) -> WorkflowMetricTile.Tone {
        if itemType == "nutrition", let macro = NutritionEvidenceMacro(metricLabel: label) {
            return .nutrition(macro)
        }
        return switch label.lowercased() {
        case "protein", "rmr", "goal relationship": .purple
        case "fat", "body fat": .amber
        default: .teal
        }
    }

    private static func measurementTiles(_ m: DEXAScanMeasurements) -> [(String, String)] {
        [
            m.totalMassLb.map { ("Total mass", "\(formatNumber($0)) lb") },
            m.bodyFatPercentage.map { ("Body fat", "\(formatNumber($0))%") },
            m.fatMassLb.map { ("Fat mass", "\(formatNumber($0)) lb") },
            m.leanMassLb.map { ("Lean mass", "\(formatNumber($0)) lb") },
            m.boneMineralContentLb.map { ("Bone mineral", "\(formatNumber($0)) lb") },
            m.restingMetabolicRateKcal.map { ("RMR", "\(formatNumber($0)) kcal/day") },
            m.visceralAdiposeTissueMassLb.map { ("VAT mass", "\(formatNumber($0)) lb") },
            m.visceralAdiposeTissueVolumeIn3.map { ("VAT volume", "\(formatNumber($0)) in³") },
        ].compactMap { $0 }
    }

    // MARK: Actions and lifecycle

    @ViewBuilder
    private func genericActions(_ review: EvidenceReviewDetailReadModel) -> some View {
        switch actionState {
        case .idle:
            if review.status == "confirmed" {
                lifecycleCard(.icon(.ok), "Confirmed", copy: Self.backgroundCopy, back: true)
            } else if review.status == "committing" {
                lifecycleCard(.spinner, "Confirming…")
            } else if Self.isActionable(review.status) {
                if review.items.contains(where: { $0.dexaMeasurements != nil }) {
                    HStack(spacing: 9) {
                        WorkflowButton(title: "Correct Measurements", identifier: "evidenceReview.correctMeasurements") { beginEditingMeasurements(review: review) }
                    }
                }
                WorkflowPrimaryButton(title: "Confirm", identifier: "evidenceReview.confirm") { Task { await confirm(review: review) } }
                if ["pending", "commit_failed"].contains(review.status) {
                    WorkflowButton(title: "Dismiss", destructive: true, fullWidth: true, identifier: "evidenceReview.dismiss") { showingDismissConfirmation = true }
                        .padding(.top, 10)
                }
            } else {
                lifecycleCard(.icon(.muted), "Review unavailable")
            }
        case .editingMeasurements:
            EmptyView()
        case .savingMeasurements:
            lifecycleCard(.spinner, "Saving corrections…")
        case .confirming(let message):
            lifecycleCard(.spinner, message)
        case .dismissing:
            lifecycleCard(.spinner, "Dismissing review…")
        case .dismissed:
            lifecycleCard(.icon(.muted), "Dismissed")
        case .accepted:
            lifecycleCard(.icon(.ok), "Confirmation accepted", copy: Self.backgroundCopy, back: true)
        case .confirmed:
            lifecycleCard(.icon(.ok), "Confirmed", copy: Self.backgroundCopy, back: true)
        case .workoutReconciliationResolved:
            lifecycleCard(.icon(.ok), "Confirmed", copy: Self.backgroundCopy, back: true)
        case .stillProcessing:
            WorkflowSurface(tone: .rich) {
                WorkflowStateRow(lead: .icon(.wait), title: "Still confirming", copy: "This is taking longer than usual. Reopen this review in a moment to check its status — confirmation continues on the server regardless of this screen.", isLast: true, identifier: "evidenceReview.stillConfirming") {
                    WorkflowActions { WorkflowButton(title: "Check Now", identifier: "evidenceReview.checkNow") { Task { await load(); actionState = .idle } } }
                }
                .padding(.vertical, -13)
            }
        case .refreshRequired(let message):
            WorkflowSurface(tone: .rich) {
                WorkflowStateRow(lead: .icon(.wait), title: "Refresh required", copy: message, isLast: true, identifier: "evidenceReview.refreshRequired") {
                    WorkflowActions { WorkflowButton(title: "Refresh Review", identifier: "evidenceReview.refresh") { Task { actionState = .idle; await load() } } }
                }
                .padding(.vertical, -13)
            }
        case .failed(let message):
            WorkflowSurface(tone: .rich) {
                WorkflowStateRow(lead: .icon(.error), title: message, isLast: true, identifier: "evidenceReview.failed") {
                    WorkflowActions { WorkflowButton(title: "Try Again", identifier: "evidenceReview.tryAgain") { actionState = .idle } }
                }
                .padding(.vertical, -13)
            }
        }
    }

    static let backgroundCopy = "PhysiqueOS owns this confirmation. Remaining analysis and briefing updates continue in the background."

    private func lifecycleCard(_ lead: WorkflowStateRow<EmptyView>.Lead, _ title: String, copy: String? = nil, back: Bool = false) -> some View {
        WorkflowSurface(tone: .rich) {
            Group {
                if back {
                    WorkflowStateRow<WorkflowActions<WorkflowButton>>(lead: lead == .spinner ? .spinner : Self.iconLead(lead), title: title, copy: copy, isLast: true, identifier: "evidenceReview.lifecycle") {
                        WorkflowActions {
                            WorkflowButton(title: "Back to Log", identifier: "evidenceReview.backToLog") { onReturnToLog(); dismiss() }
                        }
                    }
                } else {
                    WorkflowStateRow(lead: lead, title: title, copy: copy, isLast: true, identifier: "evidenceReview.lifecycle")
                }
            }
            .padding(.vertical, -13)
        }
    }

    private static func iconLead(_ lead: WorkflowStateRow<EmptyView>.Lead) -> WorkflowStateRow<WorkflowActions<WorkflowButton>>.Lead {
        switch lead {
        case .spinner: .spinner
        case .icon(let tone): .icon(tone)
        }
    }

    // MARK: DEXA correction (full replacement)

    private func genericCorrectionForm(review: EvidenceReviewDetailReadModel, item: EvidenceReviewDetailItem) -> some View {
        WorkflowSurface {
            VStack(alignment: .leading, spacing: 0) {
                Text("Correct the interpreted scan").evidenceText(WorkflowText.h2).foregroundStyle(WorkflowColor.text)
                Text("Every field is resent together — the server replaces the full measurement set, it does not merge.")
                    .evidenceText(WorkflowText.small)
                    .foregroundStyle(WorkflowColor.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
                    .padding(.bottom, 8)
                ForEach(Array(Self.correctionFields.enumerated()), id: \.offset) { index, field in
                    WorkflowRow(isLast: index == Self.correctionFields.count - 1) {
                        HStack(spacing: 12) {
                            Text(field.0).evidenceText(WorkflowText.label).foregroundStyle(WorkflowColor.text).fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            WorkflowNumericField(
                                label: field.0,
                                text: Binding(get: { measurementTexts[field.1] ?? "" }, set: { measurementTexts[field.1] = $0 }),
                                width: 112,
                                keyboard: field.1 == "measuredAt" ? .numbersAndPunctuation : .decimalPad
                            )
                        }
                    }
                }
                HStack(spacing: 9) {
                    WorkflowButton(title: "Cancel", identifier: "evidenceReview.cancelCorrection") { actionState = .idle }
                    WorkflowButton(title: "Save Corrections", identifier: "evidenceReview.saveMeasurements") {
                        Task { await saveMeasurements(review: review, item: item) }
                    }
                }
                .padding(.top, 12)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("evidenceReview.correction")
    }

    /// Exact order and units of `dexa-review.measurements.v1`.
    static let correctionFields: [(String, String)] = [
        ("Measured date (YYYY-MM-DD)", "measuredAt"),
        ("Total mass (lb)", "totalMass"),
        ("Body fat (%)", "bodyFat"),
        ("Fat mass (lb)", "fatMass"),
        ("Lean mass (lb)", "leanMass"),
        ("Bone mineral content (lb)", "boneMineral"),
        ("Resting metabolic rate (kcal/day)", "rmr"),
        ("Visceral fat mass (lb)", "vatMass"),
        ("Visceral fat volume (in³)", "vatVolume"),
    ]
}

extension WorkflowStateRow.Lead: Equatable {
    static func == (lhs: Self, rhs: Self) -> Bool {
        switch (lhs, rhs) {
        case (.spinner, .spinner): true
        case (.icon(let a), .icon(let b)): a == b
        default: false
        }
    }
}

#if DEBUG
// MARK: - Review-only fixtures (`evidence:review=<id>`), never in Release

enum EvidenceReviewWorkflowFixture {
    enum Load { case review(EvidenceReviewDetailReadModel, EvidenceReviewDetailView.ActionState), loading, failed, notFound }

    static func review(for reviewId: String) -> Load? {
        guard reviewId.hasPrefix("fixture-") else { return nil }
        let key = String(reviewId.dropFirst("fixture-".count))
        switch key {
        case "loading": return .loading
        case "failed": return .failed
        case "notfound": return .notFound
        case "mixed": return .review(mixed(status: "pending"), .idle)
        case "photo": return .review(photo, .idle)
        case "dexa": return .review(dexa, .idle)
        case "dexa-correction": return .review(dexa, .editingMeasurements)
        case "workout": return .review(workout, .idle)
        default:
            if key.hasPrefix("status-") { return .review(mixed(status: String(key.dropFirst("status-".count))), .idle) }
            if key.hasPrefix("state-") {
                let state: EvidenceReviewDetailView.ActionState = switch key.dropFirst("state-".count) {
                case "saving": .savingMeasurements
                case "confirming": .confirming("Confirming…")
                case "dismissing": .dismissing
                case "dismissed": .dismissed
                case "accepted": .accepted
                case "confirmed": .confirmed
                case "still": .stillProcessing
                case "refresh": .refreshRequired("The correction may have been accepted, but its final state could not be verified. Refresh before making another change.")
                default: .failed("This review could not be updated.")
                }
                return .review(mixed(status: "pending"), state)
            }
            return nil
        }
    }

    static func mixed(status: String) -> EvidenceReviewDetailReadModel {
        EvidenceReviewDetailReadModel(
            id: "fixture-mixed", status: status, createdAt: nil, version: 4,
            items: [
                EvidenceReviewDetailItem(id: "n1", type: "nutrition", date: "2026-09-23", title: "Nutrition", sourceLabel: "Screenshot", included: true,
                    metrics: [.init(label: "Calories", value: "2,300 cal"), .init(label: "Protein", value: "198 g"), .init(label: "Carbs", value: "244 g"), .init(label: "Fat", value: "73 g")],
                    meals: [.init(id: "m1", name: "Daily totals", summary: "Meal totals match the daily total.", foods: [])]),
                EvidenceReviewDetailItem(id: "a1", type: "activity", date: "2026-09-23", title: "Activity", sourceLabel: "Screenshot", included: false,
                    metrics: [.init(label: "Active calories", value: "650 cal"), .init(label: "Exercise", value: "45 min")]),
            ],
            summary: "1 nutrition entry and 1 activity entry",
            excludedSummary: "1 activity entry excluded"
        )
    }

    static let photo = EvidenceReviewDetailReadModel(
        id: "fixture-photo", status: "pending", createdAt: nil, version: 4,
        items: [EvidenceReviewDetailItem(id: "p1", type: "photo_session", date: "2026-09-23", title: "Progress Photos", sourceLabel: "Progress photos", included: true,
            metrics: [.init(label: "Poses", value: "1 photo · Rear Relaxed"), .init(label: "Time of day", value: "Afternoon"), .init(label: "Goal relationship", value: "Build Lean Mass"), .init(label: "Source", value: "Progress photos")],
            photoSession: EvidenceReviewPhotoSession(sessionId: "photo_session_20260923", timeOfDay: "afternoon", goalRelationship: "Build Lean Mass", photos: [EvidenceReviewPhotoIdentity(id: "ph1", poseId: nil, label: "Rear Relaxed", orientation: nil, contractionState: nil, poseVariant: nil)]))]
    )

    static let dexa = EvidenceReviewDetailReadModel(
        id: "fixture-dexa", status: "pending", createdAt: nil, version: 4,
        items: [EvidenceReviewDetailItem(id: "d1", type: "dexa_scan", date: "2026-09-23", title: "DEXA", sourceLabel: "Submitted evidence", included: true,
            metrics: [.init(label: "Total mass", value: "172.9 lb"), .init(label: "Body fat", value: "8.1%"), .init(label: "Fat tissue", value: "14.0 lb"), .init(label: "Lean tissue", value: "152.3 lb"), .init(label: "Bone mineral", value: "6.6 lb"), .init(label: "RMR", value: "1,774 kcal/day"), .init(label: "VAT mass", value: "0.24 lb"), .init(label: "VAT volume", value: "7.1 in³"), .init(label: "PDF", value: "BodySpec_DXA_2026-09-23.pdf")],
            dexaMeasurements: DEXAScanMeasurements(measuredAt: "2026-09-23", totalMassLb: 172.9, bodyFatPercentage: 8.1, fatMassLb: 14.0, leanMassLb: 152.3, boneMineralContentLb: 6.6, restingMetabolicRateKcal: 1774, visceralAdiposeTissueMassLb: 0.24, visceralAdiposeTissueVolumeIn3: 7.1))]
    )

    static let workout = EvidenceReviewDetailReadModel(
        id: "fixture-workout", status: "pending", createdAt: nil, version: 2,
        items: [],
        workoutReconciliation: WorkoutReconciliationDetail(
            localDate: "2026-09-23", title: "Apple Health strength workout", summary: "Choose the Logger session this workout belongs to.",
            workout: .init(family: "strength", canonicalType: "traditional_strength_training", startedAt: "2026-09-23T17:02:00-07:00", endedAt: "2026-09-23T18:05:00-07:00"),
            candidates: [.init(loggerSessionCanonicalId: "logger-1", confidence: 92, basis: "logger_session_window", activityType: "traditional_strength_training", startedAt: "2026-09-23T17:00:00-07:00", endedAt: "2026-09-23T18:04:00-07:00")]
        )
    )
}

extension EvidenceReviewDetailView {
    func applyReviewFixture(_ fixture: EvidenceReviewWorkflowFixture.Load) {
        switch fixture {
        case .loading: state = .loading
        case .failed: state = .failed("This Evidence Review could not be loaded.")
        case .notFound: state = .loaded(nil)
        case .review(let review, let action):
            state = .loaded(review)
            if action == .editingMeasurements {
                beginEditingMeasurements(review: review)
            } else {
                // Same as a real load: a committing review is accepted.
                actionState = review.status == "committing" ? .accepted : action
            }
        }
    }
}
#endif
