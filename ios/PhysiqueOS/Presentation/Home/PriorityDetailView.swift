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
    @Environment(\.colorScheme) private var colorScheme
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
                .padding(.horizontal, usesFoamRollingStyle ? 18 : 16)
                .padding(.top, usesFoamRollingStyle ? 0 : 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(activeBackground)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbarBackground(activeBackground, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbar(usesFoamRollingStyle ? .hidden : .visible, for: .navigationBar)
        .toolbar(usesFoamRollingStyle ? .hidden : .automatic, for: .tabBar)
        .toolbar {
            if !usesFoamRollingStyle {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { dismiss() } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "arrow.left")
                                .font(.system(size: 13, weight: .semibold))
                            Text("Home")
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        }
                        .foregroundStyle(activeSecondaryText)
                    }
                    .accessibilityLabel("Back to Home")
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
                feedback: environment.feedback,
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
                .tint(usesFoamRollingStyle ? foamPalette.teal : PhysiqueOSTheme.accent)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.none):
            Text("This priority could not be found.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(activeSecondaryText)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .failed(let message):
            Text(message)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(activeSecondaryText)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.some(let priority)):
            if PriorityDetailPresentation.isFoamRolling(priority) {
                foamRollingContent(priority)
            } else {
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
    }

    private var usesFoamRollingStyle: Bool {
        if priorityId == "reminder_foam_roll_daily" || priorityId == "execution_foam_roll" {
            return true
        }
        guard case .loaded(.some(let priority)) = viewModel?.state else { return false }
        return PriorityDetailPresentation.isFoamRolling(priority)
    }

    private var foamPalette: FoamRollingPriorityPalette {
        FoamRollingPriorityPalette(colorScheme: colorScheme)
    }

    private var activeBackground: Color {
        usesFoamRollingStyle ? foamPalette.background : PhysiqueOSTheme.background
    }

    private var activeSecondaryText: Color {
        usesFoamRollingStyle ? foamPalette.muted : PhysiqueOSTheme.textSecondary
    }

    /// First locked-design shipping pilot. Only the canonical Foam Rolling
    /// occurrence reaches this hierarchy; every other Priority continues to
    /// use the Build 85 presentation above until the Founder reviews the
    /// implementation method.
    private func foamRollingContent(_ priority: PriorityOccurrence) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { dismiss() } label: {
                HStack(spacing: 5) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 13, weight: .semibold))
                    Text("Home")
                        .physiqueOSFont(PhysiqueOSTypography.priorityDetailAction)
                }
                .foregroundStyle(foamPalette.muted)
                // Locked reference chrome: 46 pt crumb row beneath the
                // system status bar, followed immediately by the divider.
                .frame(height: 46)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Back to Home")

            foamDivider
            foamRollingHeader(priority)
            foamRollingActionSection(priority)

            if let sections = priority.detailSections, !sections.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    foamDivider
                    ForEach(PriorityDetailPresentation.visibleSections(sections)) { section in
                        foamRollingSection(section)
                        foamDivider
                    }
                }
            } else {
                // A production Priority supplies canonical sections. Keep the
                // existing honest fallback for an old Sandbox/cached payload;
                // never synthesize Server-owned execution copy in Native.
                whatCard(priority)
                    .padding(.top, 16)
            }
        }
    }

    private func foamRollingHeader(_ priority: PriorityOccurrence) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Priority")
                .physiqueOSFont(PhysiqueOSTypography.priorityDetailEyebrow)
                .foregroundStyle(foamPalette.purple)

            Text(priority.title)
                .physiqueOSFont(PhysiqueOSTypography.priorityDetailTitle)
                .foregroundStyle(foamPalette.text)
                .padding(.top, 7)

            HStack(spacing: 7) {
                Circle()
                    .fill(foamRollingStateColor(priority))
                    .frame(width: 7, height: 7)
                    .accessibilityHidden(true)
                Text(PriorityDetailPresentation.foamRollingStateLabel(priority))
                    .physiqueOSFont(PhysiqueOSTypography.priorityDetailState)
                    .foregroundStyle(foamRollingStateColor(priority))
            }
            .padding(.top, 12)

            if let subtitle = priority.subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .physiqueOSFont(PhysiqueOSTypography.priorityDetailSubtitle)
                    .foregroundStyle(foamPalette.muted)
                    .padding(.top, 10)
            }
        }
        .padding(.horizontal, 2)
        .padding(.top, 24)
        .padding(.bottom, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func foamRollingActionSection(_ priority: PriorityOccurrence) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if priority.skipped {
                foamRollingTerminalRow(
                    title: "Skipped for today.",
                    systemImage: "forward.end",
                    foreground: foamPalette.muted,
                    background: foamPalette.surface
                )
                .accessibilityIdentifier("priorityDetail.skipped")
            } else if priority.paused {
                foamRollingTerminalRow(
                    title: Self.pausedCopy(pausedFrom: priority.pauseContext?.pausedFrom),
                    systemImage: "pause.fill",
                    foreground: foamPalette.amber,
                    background: foamPalette.amber.opacity(0.09)
                )
            } else if priority.completed {
                foamRollingTerminalRow(
                    title: "Priority complete for today.",
                    systemImage: "checkmark",
                    foreground: foamPalette.green,
                    background: foamPalette.green.opacity(0.09)
                )
                .accessibilityIdentifier("priorityDetail.completed")
            } else if priority.completable {
                FoamRollingPriorityPrimaryButton(title: "Mark Complete", palette: foamPalette) {
                    Task { await viewModel?.complete() }
                }
                .accessibilityIdentifier("priorityDetail.markComplete")

                if priority.skippable {
                    Button("Mark Skipped") { isConfirmingSkip = true }
                        .buttonStyle(.plain)
                        .physiqueOSFont(PhysiqueOSTypography.priorityDetailAction)
                        .foregroundStyle(foamPalette.muted)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
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
                            Text(Self.skipConfirmationMessage(isDose: false))
                        }
                }
            } else if let destination = priority.continueActionDestination {
                FoamRollingPriorityPrimaryButton(
                    title: priority.actionLabel ?? "Review Support",
                    palette: foamPalette
                ) {
                    onNavigate(destination)
                }
                .accessibilityIdentifier("priorityDetail.reviewSupport")
            }
        }
        .padding(.top, 18)
        .padding(.bottom, 0)
    }

    private func foamRollingTerminalRow(
        title: String,
        systemImage: String,
        foreground: Color,
        background: Color
    ) -> some View {
        HStack(alignment: .center, spacing: 11) {
            Image(systemName: systemImage)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(foreground)
                .frame(width: 28)
                .accessibilityHidden(true)
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.calloutStrong)
                .foregroundStyle(foamPalette.text)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(15)
        .background(background)
        .clipShape(RoundedRectangle(cornerRadius: 17))
        .padding(.bottom, 1)
    }

    private func foamRollingSection(_ section: PrioritySectionReadModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 9) {
                Image(systemName: foamRollingSectionSymbol(section.title))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(foamPalette.teal)
                    .frame(width: 28, height: 28)
                    .background(foamPalette.teal.opacity(0.13))
                    .clipShape(RoundedRectangle(cornerRadius: 9))
                    .accessibilityHidden(true)
                Text(section.title)
                    .physiqueOSFont(PhysiqueOSTypography.priorityDetailSectionTitle)
                    .foregroundStyle(foamPalette.text)
                    .accessibilityAddTraits(.isHeader)
            }

            ForEach(Array(section.items.enumerated()), id: \.element.id) { index, item in
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.label)
                        .physiqueOSFont(PhysiqueOSTypography.priorityDetailFieldValue)
                        .foregroundStyle(foamPalette.text)
                    if let detail = item.detail, !detail.isEmpty {
                        Text(detail)
                            .physiqueOSFont(PhysiqueOSTypography.priorityDetailFieldDetail)
                            .foregroundStyle(foamPalette.muted)
                    }
                }
                .padding(.top, index == 0 ? 0 : 3)
            }
        }
        .padding(.horizontal, 2)
        .padding(.vertical, 15)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func foamRollingSectionSymbol(_ title: String) -> String {
        switch title.lowercased() {
        case "when": "clock"
        case "execution notes": "line.3.horizontal"
        case "why it matters": "scope"
        default: "diamond.fill"
        }
    }

    private func foamRollingStateColor(_ priority: PriorityOccurrence) -> Color {
        if priority.completed || (priority.completable && !priority.paused) { return foamPalette.green }
        if priority.urgency == .upcoming { return foamPalette.cyan }
        if priority.paused || (!priority.skipped && !priority.completable) { return foamPalette.amber }
        return foamPalette.muted
    }

    private var foamDivider: some View {
        Rectangle()
            .fill(foamPalette.divider)
            .frame(height: 1)
            .accessibilityHidden(true)
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
                // Only a peptide occurrence (the Server's `doseAdjustable`)
                // offers "Took a different amount?"; a supplement's or a
                // recovery item's dose text is never editable here.
                let plannedDose = priority.doseAdjustable ? priority.completionContext?.dose : nil
                let doseComponents = plannedDose.flatMap(PriorityDoseEntry.components(of:))
                let amountKey = priority.id + "|" + priority.date + "|" + (plannedDose ?? "")
                // Until the field is seeded for this dose the planned amount
                // is the value, so Mark Complete is never disabled on the
                // first frame.
                let amountText = amountSeededFor == amountKey ? amountTakenText : (doseComponents?.amount ?? "")
                let doseOutcome: PriorityDoseEntry.Outcome = plannedDose.map {
                    PriorityDoseEntry.outcome(text: amountText, plannedDose: $0)
                } ?? .unchanged
                if let doseComponents {
                    amountTakenCard(unit: doseComponents.unit, seed: doseComponents.amount, outcome: doseOutcome, key: amountKey)
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
                            Text(Self.skipConfirmationMessage(isDose: priority.doseAdjustable))
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

    /// Skipping a dose means it was intentionally not taken: no amount is
    /// recorded (the skip command carries none).
    static func skipConfirmationMessage(isDose: Bool) -> String {
        isDose
            ? "Today's dose will be recorded as skipped (not taken). No amount is recorded, and it can't be completed afterwards."
            : "Today's occurrence will be recorded as skipped and can't be completed afterwards."
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
        // The planned dose can change under the same occurrence (a re-read):
        // re-seed rather than keep a stale amount that reads as an edit.
        .onChange(of: key) { _, newKey in
            amountSeededFor = newKey
            amountTakenText = seed
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

/// Exact dark/Mineral-Light tokens from the locked Foam Rolling reference.
/// Local ownership is intentional for the pilot: it proves the translation
/// without prematurely converting the rest of Native to the future
/// Appearance architecture.
private struct FoamRollingPriorityPalette {
    let background: Color
    let text: Color
    let muted: Color
    let divider: Color
    let surface: Color
    let teal: Color
    let green: Color
    let amber: Color
    let cyan: Color
    let purple: Color
    let navy: Color

    init(colorScheme: ColorScheme) {
        if colorScheme == .light {
            background = Color(hex: 0xF0EEE6)
            text = Color(hex: 0x0A1B2C)
            muted = Color(hex: 0x65767D)
            divider = Color(hex: 0xCAD4CF)
            surface = Color(hex: 0xFBFAF6)
            teal = Color(hex: 0x0E9186)
            green = Color(hex: 0x138C60)
            amber = Color(hex: 0xB9780D)
            cyan = Color(hex: 0x168D9D)
            purple = Color(hex: 0x7655DC)
            navy = Color(hex: 0x143E60)
        } else {
            background = Color(hex: 0x06121D)
            text = Color(hex: 0xF4F7F5)
            muted = Color(hex: 0x95A6AE)
            divider = Color(hex: 0x203441)
            surface = Color(hex: 0x102432)
            teal = Color(hex: 0x20C5B7)
            green = Color(hex: 0x4EE09A)
            amber = Color(hex: 0xF3BA49)
            cyan = Color(hex: 0x40C7D7)
            purple = Color(hex: 0x9F7CFF)
            navy = Color(hex: 0x123D61)
        }
    }
}

private struct FoamRollingPriorityPrimaryButton: View {
    let title: String
    let palette: FoamRollingPriorityPalette
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.priorityDetailAction)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(palette.navy)
                .clipShape(RoundedRectangle(cornerRadius: 15))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(title)
    }
}
