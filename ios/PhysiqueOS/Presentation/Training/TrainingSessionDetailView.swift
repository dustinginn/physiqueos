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
    @State private var viewModelAuthority: NativeAPIEnvironment?
    let sessionId: String

    @State private var correctionDraftText: String = ""
    @State private var correctionStatusMessage: String?
    @State private var localDraftCorrections: [String] = []
    @FocusState private var isCorrectionEditorFocused: Bool

    private let m = EvidenceMetrics(family: .training)

    var body: some View {
        EvidenceScrollPage {
            content
        }
        .scrollDismissesKeyboard(.immediately)
        .evidencePageChrome(viewModel?.loadedSession?.label ?? "Workout")
        .evidenceFamily(.training)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { isCorrectionEditorFocused = false }
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            }
        }
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = TrainingSessionDetailViewModel(api: environment.trainingAPI, sessionId: sessionId)
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStatePanel(kind: .loading("Loading Training Evidence"), identifier: "training.session.loading")
        case .failed(let message):
            EvidenceStatePanel(kind: .failure(message, nil), identifier: "training.session.failure")
        case .loaded(.none):
            EvidenceStatePanel(kind: .empty("This session could not be found.", nil), identifier: "training.session.notFound")
        case .loaded(.some(let session)):
            let cardio = session.showsGeneratedSummaryInsteadOfStructuredExercises ? TrainingSessionDetailSummary(detail: session.detail) : nil
            header(for: session, metricsShown: cardio?.hasMetrics == true)
            if let attachment = session.healthKitAttachment {
                appleHealthAttachmentSection(attachment)
            } else {
                if session.showsGeneratedSummaryInsteadOfStructuredExercises {
                    ForEach(session.sourceEvidence, id: \.self) { source in
                        EvidenceProvenance(title: source, detail: "Source evidence for this workout")
                    }
                }
                if let telemetry = session.telemetry {
                    telemetrySection(telemetry)
                }
            }
            if session.showsGeneratedSummaryInsteadOfStructuredExercises {
                summarySection(for: session, parsed: cardio)
            } else if !session.exercises.isEmpty {
                exercisesSection(for: session)
            }
            if let media = session.supportingMedia, !media.isEmpty {
                supportingMediaSection(media)
            }
            correctionSection(for: session)
        }
    }

    /// Workout-level telemetry rendered once (never duplicating the
    /// structured exercise list); each field only when present.
    private func telemetrySection(_ telemetry: TrainingSessionTelemetryReadModel) -> some View {
        var rows: [(key: String, value: String)] = []
        if let timeRange = Self.formatTimeRange(start: telemetry.startTime, end: telemetry.endTime) { rows.append(("Time", timeRange)) }
        if let duration = telemetry.durationSeconds, let label = Self.formatDuration(duration) { rows.append(("Duration", label)) }
        if let calories = telemetry.activeCalories { rows.append(("Active energy", "\(Int(calories)) active cal")) }
        if let heartRate = telemetry.averageHeartRate { rows.append(("Average heart rate", "\(Int(heartRate)) bpm avg HR")) }
        return EvidenceSection(title: "Workout Summary", identifier: "training.session.summary") {
            EvidenceDefinitionList(rows: rows)
        }
    }

    /// Confirmed attachments read as a teal source field; a candidate match
    /// is amber and says so literally — never "Confirmed".
    private func appleHealthAttachmentSection(_ attachment: HealthKitWorkoutAttachmentReadModel) -> some View {
        var rows: [(key: String, value: String)] = []
        if let timeRange = Self.formatTimeRange(start: attachment.session.startedAt, end: attachment.session.endedAt) { rows.append(("Time", timeRange)) }
        if let duration = attachment.session.durationSeconds, let label = Self.formatDuration(duration) { rows.append(("Duration", label)) }
        if let calories = attachment.session.activeCalories { rows.append(("Active energy", "\(Int(calories.rounded())) active cal")) }
        if let calories = attachment.session.totalCalories { rows.append(("Total energy", "\(Int(calories.rounded())) total cal")) }
        if let heartRate = attachment.session.averageHeartRate { rows.append(("Average heart rate", "\(Int(heartRate.rounded())) bpm avg HR")) }
        if let distance = attachment.session.distance {
            rows.append(("Distance", "\(distance.formatted(.number.precision(.fractionLength(0...2)))) \(attachment.session.distanceUnit ?? "")".trimmingCharacters(in: .whitespaces)))
        }
        let confirmed = attachment.relationship.status == "confirmed"
        return VStack(alignment: .leading, spacing: m.pt(16)) {
            EvidenceProvenance(
                title: attachment.source.sourceName,
                detail: Self.relationshipLabel(for: attachment.relationship),
                tint: confirmed ? nil : m.c.amber
            )
            .accessibilityIdentifier("training.session.appleHealth")
            if !rows.isEmpty {
                EvidenceSection(title: "Workout Summary", identifier: "training.session.summary") {
                    EvidenceDefinitionList(rows: rows)
                }
            }
        }
    }

    private func supportingMediaSection(_ media: [TrainingSessionSupportingMedia]) -> some View {
        EvidenceSection(title: "Supporting Screenshots", identifier: "training.session.media") {
            VStack(spacing: m.pt(10)) {
                ForEach(media) { item in
                    TrainingSupportingMediaImage(mediaId: item.media.mediaId)
                }
            }
        }
    }

    private func header(for session: TrainingSessionDetailReadModel, metricsShown: Bool) -> some View {
        let date = Self.formatDate(session.date)
        let subtitle = session.showsWorkoutValueInHeader && !metricsShown ? "\(session.value) · \(date)" : date
        return EvidencePageHeader(eyebrow: "Workout Detail", title: session.label, subtitle: subtitle)
    }

    /// Apple-only workouts with no structured exercises: the Server's own
    /// detail tokens shown as labeled cells (only when every token is
    /// recognized), otherwise the detail line verbatim.
    private func summarySection(for session: TrainingSessionDetailReadModel, parsed: TrainingSessionDetailSummary?) -> some View {
        EvidenceSection(title: "Session Details", style: .analytical, identifier: "training.session.details") {
            if let parsed, parsed.hasMetrics {
                EvidenceMetricGrid(items: parsed.metrics.map { .init(label: $0.label, value: $0.value) })
                if let timeRange = parsed.timeRange {
                    Text(timeRange)
                        .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                        .foregroundStyle(m.c.muted)
                        .padding(.top, m.pt(8))
                }
            } else {
                Text(session.detail)
                    .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                    .foregroundStyle(m.c.ink)
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

    /// Mirrors `TrainingSessionCorrectionCard`: Founder Production states
    /// honestly that corrections are not available here; Sandbox keeps the
    /// local-only draft editor (never claims a server save).
    private func correctionSection(for session: TrainingSessionDetailReadModel) -> some View {
        EvidenceSection(title: "Add / Correct Workout Details", identifier: "training.session.correction") {
            if environment.nativeAuthority == .founderProduction {
                Text("Workout corrections aren't available here yet. Your saved workout is unchanged.")
                    .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 13.05))
                    .foregroundStyle(m.c.quiet)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                VStack(alignment: .leading, spacing: m.pt(10)) {
                    Text("Add missing exercises, sets, reps, or loads for this workout. The original source stays attached while this detail improves the workout record.")
                        .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 13.05))
                        .foregroundStyle(m.c.quiet)
                        .fixedSize(horizontal: false, vertical: true)
                    ZStack(alignment: .topLeading) {
                        if correctionDraftText.isEmpty {
                            Text("Shoulder Press Machine\n15 x #120\n12 x #130\n10 x #140\n8 x #150")
                                .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                                .foregroundStyle(m.c.quiet)
                                .padding(.horizontal, m.pt(10))
                                .padding(.vertical, m.pt(10))
                                .allowsHitTesting(false)
                        }
                        TextEditor(text: $correctionDraftText)
                            .focused($isCorrectionEditorFocused)
                            .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                            .foregroundStyle(m.c.ink)
                            .scrollContentBackground(.hidden)
                            .padding(m.pt(5))
                    }
                    .frame(minHeight: 120)
                    .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(11)))

                    if let correctionStatusMessage {
                        EvidenceCallout(text: correctionStatusMessage, tone: .neutral)
                    }

                    Button {
                        submitCorrection()
                    } label: {
                        Text("Save workout details")
                            .evidenceText(.normal(12, 800))
                            .foregroundStyle(m.c.page)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(m.c.purple, in: RoundedRectangle(cornerRadius: m.pt(11)))
                    }
                    .buttonStyle(.plain)

                    if !localDraftCorrections.isEmpty {
                        VStack(alignment: .leading, spacing: m.pt(8)) {
                            Text("Local draft corrections (not sent to PhysiqueOS)")
                                .evidenceText(.normal(8, 850, tracking: 0.8, uppercase: true))
                                .foregroundStyle(m.c.quiet)
                            ForEach(Array(localDraftCorrections.enumerated()), id: \.offset) { _, text in
                                EvidenceCallout(text: text, tone: .neutral)
                            }
                        }
                    }
                }
            }
        }
    }

    private func exercisesSection(for session: TrainingSessionDetailReadModel) -> some View {
        EvidenceSection(title: "Exercises", style: .open, identifier: "training.session.exercises") {
            EvidenceSmallNote(text: "read-only history")
        } content: {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(TrainingSessionExerciseGrouping.renderItems(for: session).enumerated()), id: \.element.id) { index, item in
                    Group {
                        switch item {
                        case .exercise(let exercise):
                            TrainingExerciseOccurrenceView(exercise: exercise)
                        case .relationship(let group, let exercises):
                            TrainingSupersetGroupView(group: group, exercises: exercises)
                        }
                    }
                    .overlay(alignment: .top) {
                        if index > 0, case .exercise = item {
                            Rectangle().fill(m.c.line).frame(height: m.pt(1))
                        }
                    }
                }
            }
        }
    }

    /// Never claims confirmation for an unconfirmed match. Before the
    /// Sep24 decode fix, only a `confirmed` relationship could ever
    /// successfully decode at all (a `candidate` shape always threw), so
    /// this label was safe to hardcode; now that `candidate` decodes too,
    /// it must say so honestly rather than showing "Confirmed" for a
    /// merely possible match.
    static func relationshipLabel(for relationship: HealthKitWorkoutAttachmentReadModel.Relationship) -> String {
        relationship.status == "confirmed" ? "Confirmed with Workout Logger" : "Possible match with Workout Logger"
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

/// One read-only exercise: name (+ variant suffix) over a set table of
/// canonical reps/duration and load (`Timed`, `BW`, or weight + unit).
private struct TrainingExerciseOccurrenceView: View {
    let exercise: TrainingExerciseOccurrence
    private let m = EvidenceMetrics(family: .training)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            (Text(exercise.name)
                .foregroundStyle(m.c.ink)
             + Text(exercise.executionVariant.map { "  · \($0.label)" } ?? "")
                .font(Font(PlusJakartaSans.uiFont(size: m.pt(9), weight: 750)))
                .foregroundStyle(m.c.purple))
                .evidenceText(.normal(12, 800))
            ForEach(exercise.sets) { set in
                EvidenceSetRow(
                    first: "Set \(set.setNumber)",
                    second: set.durationSeconds != nil ? set.repsColumnText : "\(set.repsColumnText) reps",
                    third: set.formattedLoad
                )
            }
        }
        .padding(.vertical, m.pt(10))
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(exercise.occurrenceLabel). " + exercise.sets.map { "Set \($0.setNumber): \($0.formattedDetail) \($0.formattedLoad)" }.joined(separator: ", "))
    }
}

/// `SUPERSET`: one purple relationship field holding every member in order.
private struct TrainingSupersetGroupView: View {
    let group: TrainingExerciseRelationshipGroup
    let exercises: [TrainingExerciseOccurrence]
    private let m = EvidenceMetrics(family: .training)

    var body: some View {
        EvidenceRelationshipGroup(label: "Superset") {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(exercises.enumerated()), id: \.element.id) { index, exercise in
                    TrainingExerciseOccurrenceView(exercise: exercise)
                        .overlay(alignment: .top) {
                            if index > 0 { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
                        }
                }
            }
        }
        .accessibilityIdentifier("training.session.superset.\(group.id)")
    }
}

/// The Server's generated Apple-workout detail line split into its own
/// labeled tokens. Every token must be recognized; otherwise the caller
/// shows the line verbatim.
struct TrainingSessionDetailSummary: Equatable {
    struct Metric: Equatable {
        let label: String
        let value: String
    }

    let timeRange: String?
    let metrics: [Metric]

    var hasMetrics: Bool { !metrics.isEmpty }

    init(detail: String) {
        var timeRange: String?
        var metrics: [Metric] = []
        var recognized = true
        for token in detail.components(separatedBy: " · ").map({ $0.trimmingCharacters(in: .whitespaces) }) where !token.isEmpty {
            if token.contains("–"), token.range(of: #"\d{1,2}:\d{2}"#, options: .regularExpression) != nil {
                timeRange = token
            } else if token.hasSuffix(" min") || token.range(of: #"^\d+h( \d+m)?$"#, options: .regularExpression) != nil {
                metrics.append(.init(label: "Duration", value: token))
            } else if token.hasSuffix(" mi") || token.hasSuffix(" km") {
                metrics.append(.init(label: "Distance", value: token))
            } else if token.hasSuffix(" active cal") {
                metrics.append(.init(label: "Active energy", value: token.replacingOccurrences(of: " active cal", with: " cal")))
            } else if token.hasSuffix(" bpm avg HR") {
                metrics.append(.init(label: "Avg heart rate", value: token.replacingOccurrences(of: " avg HR", with: "")))
            } else {
                recognized = false
            }
        }
        self.timeRange = recognized ? timeRange : nil
        self.metrics = recognized ? metrics : []
    }
}

extension TrainingSessionDetailViewModel {
    var loadedSession: TrainingSessionDetailReadModel? {
        if case .loaded(let session) = state { return session }
        return nil
    }
}
