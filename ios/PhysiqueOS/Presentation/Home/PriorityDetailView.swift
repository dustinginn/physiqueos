import SwiftUI

/// `/priorities/[priorityId]` — the one real Priority child route this
/// task's audit confirmed exists (there is no `/priorities` landing page
/// or history route on the live product; Home's "Today's Priorities" *is*
/// the landing surface — see `PriorityReadModel.swift`'s doc comment).
///
/// Mirrors `PriorityDetailScreen.jsx`'s confirmed real content: title,
/// timing/dose context, Goal/Phase ownership, and exactly one action —
/// either "Mark Complete" (`priority.completable`) or a "Continue"/"View
/// Execution" link (`priority.action`). The real page composes a variable
/// `priority.sections` array whose exact per-type membership is server-
/// owned narrative composition this port does not recreate; the
/// informational content and action semantics below are faithful without
/// claiming to reproduce that exact section algorithm.
struct PriorityDetailView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    var onNavigate: (AppDestination) -> Void
    @State private var viewModel: PriorityDetailViewModel?
    @State private var isConfirmingSkip = false
    /// "Took a different amount": the decimal-pad buffer for a peptide
    /// occurrence's dose, seeded once per loaded occurrence from the
    /// Server's planned dose so an untouched field sends the default path.
    @State private var amountTakenText = ""
    @State private var amountSeededFor: String?
    let priorityId: String
    var occurrenceDate: String? = nil

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button { dismiss() } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.left")
                            .font(.system(size: 13, weight: .semibold))
                        Text("Home")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    }
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .task(id: environment.nativeAuthority) {
            viewModel = PriorityDetailViewModel(
                api: environment.priorityAPI,
                writeAPI: environment.priorityCompletionWriteAPI,
                morningCheckInAPI: environment.morningCheckInAPI,
                store: environment.loggingSandboxStore,
                authority: environment.nativeAuthority,
                priorityId: priorityId,
                occurrenceDate: occurrenceDate,
                notificationCleanup: { priorityId, occurrenceDate in
                    await PriorityNotificationScheduler.cleanupCompletedOccurrence(
                        priorityId: priorityId,
                        occurrenceDate: occurrenceDate
                    )
                    await environment.reconcileCanonicalPriorityNotifications()
                }
            )
            await viewModel?.load()
        }
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(["priority"])
            }
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
        case .loaded(.none):
            Text("This priority could not be found.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .failed(let message):
            Text(message)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.some(let priority)):
            VStack(alignment: .leading, spacing: 16) {
                header(for: priority)
                if let relatedWeight = priority.relatedWeight {
                    relatedWeightCard(relatedWeight)
                } else if let morningCheckIn = viewModel?.morningCheckIn {
                    morningWeightCard(morningCheckIn)
                }
                if let sections = priority.detailSections, !sections.isEmpty {
                    ForEach(PriorityDetailPresentation.visibleSections(sections)) { section in sectionCard(section) }
                } else {
                    whatCard(priority)
                }
                actionSection(priority)
            }
        }
    }

    /// Founder Production's real, complete information hierarchy —
    /// renders the execution-relevant `sections[]` entries the `priority`
    /// resource sends, omitting only Related Goals and Completion cards.
    /// Completion commands still use the untouched canonical context. A section's own
    /// `label`/`detail` text already carries whatever the server decided
    /// to say — including a real scheduled clock time when one exists —
    /// so this never re-derives or guesses at timing.
    private func sectionCard(_ section: PrioritySectionReadModel) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading(section.title)
                ForEach(section.items) { item in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.label)
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        if let detail = item.detail, !detail.isEmpty {
                            Text(detail)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }
                }
            }
        }
    }

    private func header(for priority: PriorityOccurrence) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Priority")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text(priority.title)
                .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            if let subtitle = priority.subtitle {
                Text(subtitle)
                    .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                    .foregroundStyle(urgencyColor(priority.urgency))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func whatCard(_ priority: PriorityOccurrence) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading("What")
                if let metadata = priority.metadata {
                    Text(metadata)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                }
                Text("Scheduled for \(TrainingDateFormatting.short(priority.date)).")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if priority.completed {
                    Label("Completed", systemImage: "checkmark.circle.fill")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                }
            }
        }
    }

    @ViewBuilder
    private func actionSection(_ priority: PriorityOccurrence) -> some View {
        if priority.skipped {
            CardContainer {
                Label("Skipped for today.", systemImage: "forward.end.circle.fill")
                    .physiqueOSFont(PhysiqueOSTypography.calloutStrong)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        } else if priority.paused {
            pausedCard(priority)
        } else if priority.completable {
            if priority.completed {
                CardContainer {
                    Label("Priority complete for today.", systemImage: "checkmark.circle.fill")
                        .physiqueOSFont(PhysiqueOSTypography.calloutStrong)
                        .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                }
            } else {
                let plannedDose = priority.completionContext?.dose
                let doseComponents = plannedDose.flatMap(PriorityDoseEntry.components(of:))
                let doseOutcome: PriorityDoseEntry.Outcome = plannedDose.map {
                    PriorityDoseEntry.outcome(text: amountTakenText, plannedDose: $0)
                } ?? .unchanged
                if let doseComponents {
                    amountTakenCard(unit: doseComponents.unit, seed: doseComponents.amount, outcome: doseOutcome, key: priority.id + "|" + priority.date)
                }
                PrimaryActionButton(title: "Mark Complete") {
                    Task {
                        if case .changed(let dose) = doseOutcome {
                            await viewModel?.complete(dose: dose)
                        } else {
                            await viewModel?.complete()
                        }
                    }
                }
                .disabled(doseOutcome == .invalid)
                .accessibilityIdentifier("priorityDetail.markComplete")
                if priority.skippable {
                    Button("Mark Skipped") { isConfirmingSkip = true }
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .accessibilityIdentifier("priorityDetail.markSkipped")
                        .confirmationDialog(
                            "Skip \(priority.title) today?",
                            isPresented: $isConfirmingSkip,
                            titleVisibility: .visible
                        ) {
                            Button("Mark Skipped", role: .destructive) {
                                Task { await viewModel?.skip() }
                            }
                            Button("Cancel", role: .cancel) {}
                        } message: {
                            Text("Today's occurrence will be recorded as skipped and can't be completed afterwards.")
                        }
                }
            }
        } else if let destination = priority.continueActionDestination {
            PrimaryActionButton(title: priority.actionLabel ?? "Continue") {
                onNavigate(destination)
            }
        }
    }

    /// Design S3: a suspended occurrence has no Mark Complete or Mark
    /// Skipped — Resume lives on the Operating Plan's peptide screen.
    @ViewBuilder
    private func pausedCard(_ priority: PriorityOccurrence) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 8) {
                Label(Self.pausedCopy(pausedFrom: priority.pauseContext?.pausedFrom), systemImage: "pause.circle.fill")
                    .physiqueOSFont(PhysiqueOSTypography.calloutStrong)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
        .accessibilityIdentifier("priorityDetail.paused")
        if let destination = priority.continueActionDestination {
            PrimaryActionButton(title: "Go to \(priority.title)") {
                onNavigate(destination)
            }
            .accessibilityIdentifier("priorityDetail.goToPeptide")
        }
    }

    /// "Paused since Sep 12. Resume from the Operating Plan to continue."
    static func pausedCopy(pausedFrom: String?) -> String {
        if let pausedFrom, !pausedFrom.isEmpty {
            return "Paused since \(TrainingDateFormatting.short(pausedFrom)). Resume from the Operating Plan to continue."
        }
        return "Paused. Resume from the Operating Plan to continue."
    }

    /// "Took a different amount" — the planned dose is pre-filled; leaving
    /// it untouched sends the untouched completion context (the Build 69
    /// path), editing it records the amount actually taken as
    /// `effectiveDose` without touching the dose plan.
    private func amountTakenCard(unit: String, seed: String, outcome: PriorityDoseEntry.Outcome, key: String) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading("Took a different amount?")
                HStack(spacing: 10) {
                    Text("Amount taken")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Spacer(minLength: 8)
                    NumericEditField(text: $amountTakenText, accessibilityLabel: "Amount taken", placeholder: seed)
                        .frame(width: 96, height: 44)
                        .accessibilityIdentifier("priorityDetail.amountTaken")
                    Text(unit)
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                }
                Text(Self.amountCaption(outcome: outcome, seed: seed, unit: unit))
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(outcome == .invalid ? PhysiqueOSTheme.chartEffort : PhysiqueOSTheme.textSecondary)
            }
        }
        .onAppear {
            if amountSeededFor != key {
                amountSeededFor = key
                amountTakenText = seed
            }
        }
    }

    static func amountCaption(outcome: PriorityDoseEntry.Outcome, seed: String, unit: String) -> String {
        switch outcome {
        case .unchanged: "Planned \(seed) \(unit). Edit only if you took a different amount."
        case .changed(let dose): "\(dose) will be recorded for this dose. Your dose plan is unchanged."
        case .invalid: "Enter the amount you took, or leave the planned \(seed) \(unit)."
        }
    }

    /// Canonical same-day Weight, resolved server-side by exact intended-
    /// date match (`morning-check-in`'s `existingWeight`/`today`) — never
    /// a "latest weight" fallback Native picks itself.
    private func morningWeightCard(_ morningCheckIn: MorningCheckInReadModel) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 6) {
                SectionHeading("Today's Weight")
                if let weight = morningCheckIn.existingWeight {
                    Text("\(Self.formatWeight(weight)) lb")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text("Recorded for \(TrainingDateFormatting.short(morningCheckIn.today)).")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    Button("View Weight evidence") { onNavigate(.progressStream(streamId: "weight")) }
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                } else {
                    Text("Nothing logged yet for \(TrainingDateFormatting.short(morningCheckIn.today)).")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    private func relatedWeightCard(_ weight: PriorityRelatedWeight) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 6) {
                SectionHeading("Occurrence Weight")
                Text("\(Self.formatWeight(weight.value)) \(weight.unit)")
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("Recorded for \(TrainingDateFormatting.short(weight.date)).")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Button("View Weight evidence") { onNavigate(.progressStream(streamId: "weight")) }
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
            }
        }
    }

    private static func formatWeight(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }

    private func urgencyColor(_ urgency: PriorityUrgency) -> Color {
        switch urgency {
        case .overdue: PhysiqueOSTheme.destructive
        case .upcoming: PhysiqueOSTheme.textSecondary
        case .available: PhysiqueOSTheme.chartSuccess
        }
    }
}
