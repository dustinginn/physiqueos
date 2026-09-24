import SwiftUI

/// A single TrainingSession (`/progress/training/session/:id`) — mirrors
/// `TrainingKnowledgeScreen.jsx`'s session mode (`getSessionContent`,
/// lines 740-826): a summary card (workout value, date, detail, source
/// evidence) and an Exercises card whose rows are the session's exercises,
/// with superset members grouped into one labeled block via
/// `TrainingSessionExerciseGrouping` — mirroring
/// `getTrainingSessionExerciseRenderItems` exactly. The web's correction
/// card (`TrainingSessionCorrectionCard`) is now reproduced as
/// `correctionCard(for:)` below: on the web it commits through the generic
/// canonical-evidence-confirmation pipeline (an additive merge into the
/// same canonical record, not a destructive rewrite — see
/// `EvidenceCorrectionService.createTrainingSessionCorrectionEvidencePackage`);
/// this fixture-only slice has no live command boundary for that yet, so
/// it keeps the identical entry CTA/copy/validation but only ever appends
/// to local, in-memory, per-view-instance draft state and never claims a
/// server-side save succeeded (see `submitCorrection()` and
/// `TrainingSessionCorrectionValidation`).
struct TrainingSessionDetailView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: TrainingSessionDetailViewModel?
    let sessionId: String

    @State private var correctionDraftText: String = ""
    @State private var correctionStatusMessage: String?
    @State private var localDraftCorrections: [String] = []
    @FocusState private var isCorrectionEditorFocused: Bool

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .scrollDismissesKeyboard(.immediately)
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .restoresInteractivePopGesture()
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { isCorrectionEditorFocused = false }
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            }
        }
        .task(id: environment.nativeAuthority) {
            viewModel = TrainingSessionDetailViewModel(api: environment.trainingAPI, sessionId: sessionId)
            await viewModel?.load()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            ProgressView()
                .tint(PhysiqueOSTheme.accent)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .failed(let message):
            Text(message)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.none):
            Text("This session could not be found.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.some(let session)):
            VStack(alignment: .leading, spacing: 24) {
                header(for: session)
                if let attachment = session.healthKitAttachment {
                    appleHealthAttachmentCard(attachment)
                } else if let telemetry = session.telemetry {
                    telemetryCard(telemetry)
                }
                if session.showsGeneratedSummaryInsteadOfStructuredExercises {
                    summaryCard(for: session)
                } else if !session.exercises.isEmpty {
                    exercisesCard(for: session)
                }
                if let media = session.supportingMedia, !media.isEmpty {
                    supportingMediaCard(media)
                }
                correctionCard(for: session)
            }
        }
    }

    /// Workout-level telemetry rendered once, structurally, instead of as
    /// part of `session.detail`'s generated one-line string — the fix for
    /// the Founder-observed duplicate summary above the structured exercise
    /// list. Each field renders only when present, since an Apple-only
    /// telemetry source may not carry all of them.
    private func telemetryCard(_ telemetry: TrainingSessionTelemetryReadModel) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading("Workout Summary")
                if let timeRange = Self.formatTimeRange(start: telemetry.startTime, end: telemetry.endTime) {
                    telemetryRow(timeRange)
                }
                if let duration = telemetry.durationSeconds, let label = Self.formatDuration(duration) {
                    telemetryRow(label)
                }
                if let calories = telemetry.activeCalories {
                    telemetryRow("\(Int(calories)) active cal")
                }
                if let heartRate = telemetry.averageHeartRate {
                    telemetryRow("\(Int(heartRate)) bpm avg HR")
                }
            }
        }
    }

    private func appleHealthAttachmentCard(_ attachment: HealthKitWorkoutAttachmentReadModel) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading("Apple Health")
                HStack(spacing: 8) {
                    Image(systemName: "applewatch")
                        .foregroundStyle(PhysiqueOSTheme.accent)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(attachment.source.sourceName)
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text("Confirmed with Workout Logger")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
                if let timeRange = Self.formatTimeRange(
                    start: attachment.session.startedAt,
                    end: attachment.session.endedAt
                ) { telemetryRow(timeRange) }
                if let duration = attachment.session.durationSeconds,
                   let label = Self.formatDuration(duration) { telemetryRow(label) }
                if let calories = attachment.session.activeCalories {
                    telemetryRow("\(Int(calories.rounded())) active cal")
                }
                if let calories = attachment.session.totalCalories {
                    telemetryRow("\(Int(calories.rounded())) total cal")
                }
                if let heartRate = attachment.session.averageHeartRate {
                    telemetryRow("\(Int(heartRate.rounded())) bpm avg HR")
                }
                if let distance = attachment.session.distance {
                    telemetryRow("\(distance.formatted(.number.precision(.fractionLength(0...2)))) \(attachment.session.distanceUnit ?? "")".trimmingCharacters(in: .whitespaces))
                }
            }
        }
    }

    private func telemetryRow(_ text: String) -> some View {
        Text(text)
            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
            .foregroundStyle(PhysiqueOSTheme.textPrimary)
    }

    private func supportingMediaCard(_ media: [TrainingSessionSupportingMedia]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading("Supporting Screenshots")
                ForEach(media) { item in
                    TrainingSupportingMediaImage(mediaId: item.media.mediaId)
                }
            }
        }
    }

    private func header(for session: TrainingSessionDetailReadModel) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Workout Detail")
                .physiqueOSFont(PhysiqueOSTypography.sectionLabel)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text(session.label)
                .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(session.showsWorkoutValueInHeader ? "\(session.value) · \(Self.formatDate(session.date))" : Self.formatDate(session.date))
                .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func summaryCard(for session: TrainingSessionDetailReadModel) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading("Session Details")
                Text(session.detail)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
            }
        }
    }

    /// Real web semantics (`EvidenceCorrectionService`,
    /// `CanonicalEvidenceConfirmationCommitService`, verified from source):
    /// a correction is an *additive* evidence package committed through the
    /// same generic canonical-evidence-confirmation pipeline every other
    /// evidence type uses — it merges into the existing canonical record
    /// (unioning `source_artifact_refs`, merging exercises/sets) rather
    /// than replacing it, so the original evidence is never discarded. This
    /// fixture-only slice has no live command boundary for that commit
    /// (POST-STABILIZATION INTEGRATION REQUIREMENT — see
    /// `docs/PHYSIQUEOS_NATIVE_V1.md`), so it reproduces the identical
    /// entry CTA, copy, and client-side validation, but only ever appends
    /// the trimmed text to local, in-memory `localDraftCorrections` state
    /// and reports an honest local-only status — never the web's own
    /// "Workout details saved." success copy, which would misrepresent a
    /// server-side commit that did not happen.
    private func submitCorrection() {
        guard environment.nativeAuthority == .sandbox else {
            correctionStatusMessage = "Workout corrections aren't available here yet. Your saved workout is unchanged."
            return
        }
        if let validationError = TrainingSessionCorrectionValidation.validationError(forText: correctionDraftText) {
            correctionStatusMessage = validationError
            return
        }
        localDraftCorrections.append(correctionDraftText.trimmingCharacters(in: .whitespacesAndNewlines))
        correctionDraftText = ""
        correctionStatusMessage = "Saved to this device only. Your original workout is unchanged."
    }

    /// Mirrors `TrainingSessionCorrectionCard`
    /// (`TrainingKnowledgeScreen.jsx:855-894`): title, body copy, a
    /// free-text field with the same placeholder example, and a submit
    /// button — same copy, same single-field shape, same "leaving the
    /// original evidence attached" framing as the real correction flow.
    private func correctionCard(for session: TrainingSessionDetailReadModel) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading("Add / Correct Workout Details")
                Text("Add missing exercises, sets, reps, or loads for this workout. The original source stays attached while this detail improves the workout record.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)

                if environment.nativeAuthority == .founderProduction {
                    Text("Workout corrections aren't available here yet. Your saved workout is unchanged.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                ZStack(alignment: .topLeading) {
                    if correctionDraftText.isEmpty {
                        Text("Shoulder Press Machine\n15 x #120\n12 x #130\n10 x #140\n8 x #150")
                            .physiqueOSFont(PhysiqueOSTypography.body14Regular)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 12)
                            .allowsHitTesting(false)
                    }
                    TextEditor(text: $correctionDraftText)
                        .focused($isCorrectionEditorFocused)
                        .physiqueOSFont(PhysiqueOSTypography.body14Regular)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        .scrollContentBackground(.hidden)
                        .padding(6)
                }
                .frame(minHeight: 120)
                .background(PhysiqueOSTheme.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: 12))

                if let correctionStatusMessage {
                    Text(correctionStatusMessage)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                PrimaryActionButton(title: "Save workout details", tone: .accent) {
                    submitCorrection()
                }

                if !localDraftCorrections.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Local draft corrections (not sent to PhysiqueOS)")
                            .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                        ForEach(Array(localDraftCorrections.enumerated()), id: \.offset) { _, text in
                            Text(text)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                .padding(10)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(PhysiqueOSTheme.surfaceMuted)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }
                }
            }
        }
    }

    private func exercisesCard(for session: TrainingSessionDetailReadModel) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 14) {
                SectionHeading("Exercises")
                ForEach(TrainingSessionExerciseGrouping.renderItems(for: session)) { item in
                    switch item {
                    case .exercise(let exercise):
                        TrainingExerciseOccurrenceView(exercise: exercise)
                    case .relationship(let group, let exercises):
                        TrainingSupersetGroupView(group: group, exercises: exercises)
                    }
                }
            }
        }
    }

    static func formatDate(_ value: String) -> String {
        if let date = parseISODate(value) ?? EvidenceDateParsing.date(fromLocalDateString: value) {
            let display = DateFormatter()
            display.dateStyle = .medium
            display.timeStyle = .none
            return display.string(from: date)
        }
        return "Date unavailable"
    }

    /// Formats a workout's telemetry time range in the device's own
    /// current time zone — the server sends raw ISO instants and never
    /// guesses a time zone for display (see `TrainingSessionTelemetryReadModel`).
    private static func formatTimeRange(start: String?, end: String?) -> String? {
        let startLabel = start.flatMap(parseISODate).map(Self.timeOfDayFormatter.string(from:))
        let endLabel = end.flatMap(parseISODate).map(Self.timeOfDayFormatter.string(from:))
        switch (startLabel, endLabel) {
        case (let start?, let end?): return "\(start)–\(end)"
        case (let start?, nil): return start
        case (nil, let end?): return end
        case (nil, nil): return nil
        }
    }

    private static func formatDuration(_ seconds: Double) -> String? {
        guard seconds > 0 else { return nil }
        let minutes = Int((seconds / 60).rounded())
        if minutes < 60 { return "\(minutes) min" }
        let hours = minutes / 60
        let remainingMinutes = minutes % 60
        return remainingMinutes > 0 ? "\(hours)h \(remainingMinutes)m" : "\(hours)h"
    }

    private static func parseISODate(_ value: String) -> Date? {
        let withFractionalSeconds = ISO8601DateFormatter()
        withFractionalSeconds.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFractionalSeconds.date(from: value) { return date }
        return ISO8601DateFormatter().date(from: value)
    }

    private static let timeOfDayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter
    }()
}

private struct TrainingSupportingMediaImage: View {
    @Environment(AppEnvironment.self) private var environment
    let mediaId: String

    var body: some View {
        Group {
            switch environment.founderProductionPhotoMediaStore.imageStates[mediaId] ?? .idle {
            case .idle, .loading:
                ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 120)
            case .loaded(let image):
                Image(uiImage: image).resizable().scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            case .failed:
                Button("Retry screenshot") {
                    Task { await environment.founderProductionPhotoMediaStore.retryImage(mediaId: mediaId) }
                }
            case .unavailable:
                Text("Screenshot unavailable")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
        .task(id: mediaId) { await environment.founderProductionPhotoMediaStore.loadImage(mediaId: mediaId) }
    }
}

private struct TrainingExerciseOccurrenceView: View {
    let exercise: TrainingExerciseOccurrence

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(exercise.occurrenceLabel)
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            ForEach(exercise.sets) { set in
                Text("Set \(set.setNumber): \(set.formattedDetail)")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }
}

/// Mirrors the session-detail screen's superset presentation: an
/// indigo-tinted section labeled "Superset" containing each member's
/// exercise block, rendered together once (`TrainingKnowledgeScreen.jsx:780-789`).
private struct TrainingSupersetGroupView: View {
    let group: TrainingExerciseRelationshipGroup
    let exercises: [TrainingExerciseOccurrence]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("SUPERSET")
                .physiqueOSFont(PhysiqueOSTypography.rowEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            ForEach(exercises) { exercise in
                TrainingExerciseOccurrenceView(exercise: exercise)
            }
        }
        .padding(12)
        .background(PhysiqueOSTheme.accent.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(PhysiqueOSTheme.accent.opacity(0.24), lineWidth: 1)
        )
    }
}
