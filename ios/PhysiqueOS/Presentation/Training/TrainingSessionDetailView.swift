import SwiftUI

/// A single TrainingSession (`/progress/training/session/:id`) — mirrors
/// `TrainingKnowledgeScreen.jsx`'s session mode (`getSessionContent`,
/// lines 740-826): a summary card (workout value, date, detail, source
/// evidence) and an Exercises card whose rows are the session's exercises,
/// with superset members grouped into one labeled block via
/// `TrainingSessionExerciseGrouping` — mirroring
/// `getTrainingSessionExerciseRenderItems` exactly. The web's correction
/// form (`TrainingSessionCorrectionCard`) is a canonical write action and
/// is intentionally not reproduced here: this is a read-only history
/// vertical, and no native command boundary exists for it yet.
struct TrainingSessionDetailView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: TrainingSessionDetailViewModel?
    let sessionId: String

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
                    Text("Source: \(session.sourceEvidence.joined(separator: ", "))")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
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
