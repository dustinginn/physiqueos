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

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .task {
            if viewModel == nil { viewModel = TrainingSessionDetailViewModel(api: environment.trainingAPI, sessionId: sessionId) }
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
            VStack(alignment: .leading, spacing: 16) {
                header(for: session)
                summaryCard(for: session)
                if !session.exercises.isEmpty {
                    exercisesCard(for: session)
                }
                correctionCard(for: session)
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
            Text("\(session.value) · \(Self.formatDate(session.date))")
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
                if !session.sourceEvidence.isEmpty {
                    Text(Self.formatSourceLine(session.sourceEvidence))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    /// Mirrors `getSessionContent`'s
    /// `Source: {session.sourceEvidence.join(" + ")}`
    /// (`TrainingKnowledgeScreen.jsx:782-786`) exactly — a prior revision
    /// used `", "`, which every other Training source line in this app
    /// (`TrainingHistoryView`'s `TrainingRecordPreviewRow`,
    /// `DataSourcesFooterView`) already gets right with `" + "`.
    /// `internal` (not `private`) so this is directly testable.
    static func formatSourceLine(_ sources: [String]) -> String {
        "Source: \(sources.joined(separator: " + "))"
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
        if let validationError = TrainingSessionCorrectionValidation.validationError(forText: correctionDraftText) {
            correctionStatusMessage = validationError
            return
        }
        localDraftCorrections.append(correctionDraftText.trimmingCharacters(in: .whitespacesAndNewlines))
        correctionDraftText = ""
        correctionStatusMessage = "Saved to this device only — Native has no live correction endpoint yet. The original evidence above stays exactly as recorded."
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

    private static func formatDate(_ value: String) -> String {
        let isoWithTime = ISO8601DateFormatter()
        if let date = isoWithTime.date(from: value) {
            let display = DateFormatter()
            display.dateStyle = .medium
            display.timeStyle = .none
            return display.string(from: date)
        }
        return String(value.prefix(10))
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
