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
            VStack(alignment: .leading, spacing: 0) {
                backCrumb
                divider
                content
            }
            .padding(.horizontal, 18)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.priorityCanvas)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        // Locked family chrome: the crumb row replaces the navigation bar,
        // and the detail has no persistent tab bar.
        .toolbar(.hidden, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
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
        .refreshable { await reload() }
    }

    private func reload() async {
        if environment.nativeAuthority == .founderProduction {
            await environment.productionNativeAPI.invalidateReadResources(["priority"])
        }
        await viewModel?.load()
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            ProgressView()
                .tint(PhysiqueOSTheme.priorityTeal)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.none):
            unavailablePage(title: "This priority could not be found.", message: nil)
        case .failed(let message):
            unavailablePage(
                title: Self.failureTitle(message),
                message: Self.failureDetail(message)
            )
        case .loaded(.some(let priority)):
            loadedContent(priority)
        }
    }

    // MARK: Chrome

    /// Locked reference chrome: a 46 pt crumb row beneath the status bar,
    /// followed immediately by the divider.
    private var backCrumb: some View {
        Button { dismiss() } label: {
            HStack(spacing: 5) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 13, weight: .semibold))
                Text("Home")
                    .physiqueOSFont(PhysiqueOSTypography.priorityDetailAction)
            }
            .foregroundStyle(PhysiqueOSTheme.priorityMuted)
            .frame(height: 46)
            .frame(minWidth: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Back to Home")
    }

    private var divider: some View {
        Rectangle()
            .fill(PhysiqueOSTheme.priorityRule)
            .frame(height: 1)
            .accessibilityHidden(true)
    }

    // MARK: Loaded family template

    private func loadedContent(_ priority: PriorityOccurrence) -> some View {
        let template = PriorityDetailPresentation.template(priority)
        return VStack(alignment: .leading, spacing: 0) {
            header(priority)
            switch template {
            case .morningEvidence:
                morningEvidenceCard(priority)
            case .photoEvidence, .dexaEvidence:
                evidenceBanner(template)
                actionZone(priority, template: template)
            default:
                actionZone(priority, template: template)
            }

            if let sections = priority.detailSections, !sections.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    divider
                    ForEach(PriorityDetailPresentation.groupedSections(sections)) { section in
                        sectionView(section)
                        divider
                    }
                }
                .padding(.top, 18)
            } else {
                // A production Priority supplies canonical sections. Keep the
                // honest Sandbox/cached fallback; never synthesize Server-owned
                // execution copy in Native.
                fallbackWhatSection(priority)
                    .padding(.top, 18)
            }
        }
    }

    private func header(_ priority: PriorityOccurrence) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Priority")
                .physiqueOSFont(PhysiqueOSTypography.priorityDetailEyebrow)
                .foregroundStyle(PhysiqueOSTheme.priorityPurple)

            Text(priority.title)
                .physiqueOSFont(PhysiqueOSTypography.priorityDetailTitle)
                .foregroundStyle(PhysiqueOSTheme.priorityInk)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 7)

            HStack(spacing: 7) {
                Circle()
                    .fill(stateColor(priority))
                    .frame(width: 7, height: 7)
                    .accessibilityHidden(true)
                Text(PriorityDetailPresentation.stateLabel(priority))
                    .physiqueOSFont(PhysiqueOSTypography.priorityDetailState)
                    .foregroundStyle(stateColor(priority))
            }
            .padding(.top, 12)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("priorityDetail.state")

            if let subtitle = priority.subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .physiqueOSFont(PhysiqueOSTypography.priorityDetailSubtitle)
                    .foregroundStyle(PhysiqueOSTheme.priorityMuted)
                    .padding(.top, 10)
            }
        }
        .padding(.horizontal, 2)
        .padding(.top, 24)
        .padding(.bottom, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func stateColor(_ priority: PriorityOccurrence) -> Color {
        switch PriorityDetailPresentation.stateTone(priority) {
        case .green: PhysiqueOSTheme.priorityGreen
        case .cyan: PhysiqueOSTheme.priorityCyan
        case .amber: PhysiqueOSTheme.priorityAmber
        case .muted: PhysiqueOSTheme.priorityMuted
        }
    }

    // MARK: Action zone

    @ViewBuilder
    private func actionZone(_ priority: PriorityOccurrence, template: PriorityDetailPresentation.Template) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            switch template {
            case .skipped:
                terminalRow(title: "Skipped for today.", systemImage: "forward.end",
                            foreground: PhysiqueOSTheme.priorityMuted, background: PhysiqueOSTheme.prioritySurface)
                    .accessibilityIdentifier("priorityDetail.skipped")
            case .completed:
                terminalRow(title: "Priority complete for today.", systemImage: "checkmark",
                            foreground: PhysiqueOSTheme.priorityGreen, background: PhysiqueOSTheme.priorityGreen.opacity(0.09))
                    .accessibilityIdentifier("priorityDetail.completed")
            case .paused:
                pausedNotice(priority)
            case .manual, .doseAware:
                completionControls(priority, doseAware: template == .doseAware)
            case .photoEvidence, .dexaEvidence:
                if let destination = priority.continueActionDestination {
                    PriorityDetailButton(
                        title: priority.actionLabel ?? (template == .photoEvidence ? "Upload Photos" : "View DEXA Appointment"),
                        style: template == .photoEvidence ? .evidence : .navy
                    ) { onNavigate(destination) }
                    .accessibilityIdentifier("priorityDetail.evidenceAction")
                }
            case .continueAction:
                if let destination = priority.continueActionDestination {
                    PriorityDetailButton(title: priority.actionLabel ?? "Continue", style: .navy) {
                        onNavigate(destination)
                    }
                    .accessibilityIdentifier(PriorityDetailPresentation.isFoamRolling(priority)
                                             ? "priorityDetail.reviewSupport" : "priorityDetail.continue")
                }
            case .morningEvidence, .noAction:
                EmptyView()
            }
        }
    }

    /// Mark Complete (+ optional Mark Skipped). A peptide with a planned
    /// dose first offers "Took a different amount?"; an untouched field
    /// sends the untouched completion context (the Build 69 path).
    @ViewBuilder
    private func completionControls(_ priority: PriorityOccurrence, doseAware: Bool) -> some View {
        let plannedDose = doseAware ? priority.completionContext?.dose : nil
        let doseComponents = plannedDose.flatMap(PriorityDoseEntry.components(of:))
        let amountKey = priority.id + "|" + priority.date + "|" + (plannedDose ?? "")
        // Until the field is seeded for this dose the planned amount is the
        // value, so Mark Complete is never disabled on the first frame.
        let amountText = amountSeededFor == amountKey ? amountTakenText : (doseComponents?.amount ?? "")
        let doseOutcome: PriorityDoseEntry.Outcome = plannedDose.map {
            PriorityDoseEntry.outcome(text: amountText, plannedDose: $0)
        } ?? .unchanged
        if let doseComponents {
            amountTakenEditor(unit: doseComponents.unit, seed: doseComponents.amount, outcome: doseOutcome, key: amountKey)
                .padding(.bottom, 12)
        }
        PriorityDetailButton(title: "Mark Complete", style: .navy, enabled: doseOutcome != .invalid) {
            Task {
                if case .changed(let dose) = doseOutcome {
                    await viewModel?.complete(dose: dose)
                } else {
                    await viewModel?.complete()
                }
            }
        }
        .accessibilityIdentifier("priorityDetail.markComplete")
        if priority.skippable {
            Button("Mark Skipped") { isConfirmingSkip = true }
                .buttonStyle(.plain)
                .physiqueOSFont(PhysiqueOSTypography.priorityDetailAction)
                .foregroundStyle(PhysiqueOSTheme.priorityMuted)
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
                    Text(Self.skipConfirmationMessage(isDose: priority.doseAdjustable))
                }
        }
    }

    /// "Took a different amount?" — the planned dose is pre-filled; editing
    /// records the amount actually taken without touching the dose plan.
    private func amountTakenEditor(unit: String, seed: String, outcome: PriorityDoseEntry.Outcome, key: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Took a different amount?")
                .physiqueOSFont(PhysiqueOSTypography.priorityDetailEyebrow)
                .foregroundStyle(PhysiqueOSTheme.priorityPurple)
            HStack(spacing: 10) {
                Text("Amount taken")
                    .physiqueOSFont(PhysiqueOSTypography.priorityDetailFieldValue)
                    .foregroundStyle(PhysiqueOSTheme.priorityInk)
                Spacer(minLength: 8)
                NumericEditField(text: $amountTakenText, accessibilityLabel: "Amount taken", placeholder: seed)
                    .frame(width: 86, height: 44)
                    .background(PhysiqueOSTheme.priorityCanvas)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(PhysiqueOSTheme.priorityRule))
                    .accessibilityIdentifier("priorityDetail.amountTaken")
                Text(unit)
                    .physiqueOSFont(PhysiqueOSTypography.priorityDetailFieldValue)
                    .foregroundStyle(PhysiqueOSTheme.priorityInk)
            }
            .padding(.top, 11)
            Text(Self.amountCaption(outcome: outcome, seed: seed, unit: unit))
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(outcome == .invalid ? PhysiqueOSTheme.priorityAmber : PhysiqueOSTheme.priorityMuted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [PhysiqueOSTheme.prioritySurfaceRaised, PhysiqueOSTheme.prioritySurface],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
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

    /// Design S3: a suspended occurrence has no Mark Complete or Mark
    /// Skipped — Resume lives on the Operating Plan's peptide screen.
    @ViewBuilder
    private func pausedNotice(_ priority: PriorityOccurrence) -> some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: "pause.fill")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(PhysiqueOSTheme.priorityAmber)
                .frame(width: 22)
                .padding(.top, 2)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text("Paused")
                    .physiqueOSFont(PhysiqueOSTypography.calloutStrong)
                    .foregroundStyle(PhysiqueOSTheme.priorityInk)
                Text(Self.pausedCopy(pausedFrom: priority.pauseContext?.pausedFrom))
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.priorityMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(15)
        .background(PhysiqueOSTheme.priorityAmber.opacity(0.09))
        .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("priorityDetail.paused")
        if let destination = priority.continueActionDestination {
            PriorityDetailButton(title: "Go to \(priority.title)", style: .amber) {
                onNavigate(destination)
            }
            .padding(.top, 11)
            .accessibilityIdentifier("priorityDetail.goToPeptide")
        }
    }

    private func terminalRow(title: String, systemImage: String, foreground: Color, background: Color) -> some View {
        HStack(alignment: .center, spacing: 11) {
            Image(systemName: systemImage)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(foreground)
                .frame(width: 28)
                .accessibilityHidden(true)
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.calloutStrong)
                .foregroundStyle(PhysiqueOSTheme.priorityInk)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(15)
        .background(background)
        .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
        .padding(.bottom, 1)
        .accessibilityElement(children: .combine)
    }

    // MARK: Evidence-driven templates

    /// Progress Photos / DEXA: the occurrence completes only from confirmed
    /// evidence; the banner says so in words, never by color alone.
    private func evidenceBanner(_ template: PriorityDetailPresentation.Template) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Canonical evidence")
                .physiqueOSFont(PhysiqueOSTypography.priorityDetailEyebrow)
            Text(template == .dexaEvidence ? "The scan completes with evidence." : "The photo set completes with evidence.")
                .physiqueOSFont(PhysiqueOSTypography.priorityDetailEvidenceTitle)
                .fixedSize(horizontal: false, vertical: true)
            Text("No separate manual completion is recorded here.")
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .opacity(0.72)
        }
        .foregroundStyle(PhysiqueOSTheme.priorityEvidenceInk)
        .padding(17)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [PhysiqueOSTheme.priorityEvidenceStart, PhysiqueOSTheme.priorityEvidenceEnd],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 19, style: .continuous))
        .padding(.bottom, 16)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("priorityDetail.evidenceBanner")
    }

    /// Morning Weigh-In: evidence-driven. Open shows the exact occurrence's
    /// missing Weight with Log Weight; completed shows the occurrence-bound
    /// related Weight (never a current-day fallback).
    private func morningEvidenceCard(_ priority: PriorityOccurrence) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(priority.relatedWeight == nil ? "Evidence state" : "Occurrence weight")
                    .physiqueOSFont(PhysiqueOSTypography.priorityDetailFieldLabel)
                    .foregroundStyle(PhysiqueOSTheme.priorityMuted)
                if let weight = priority.relatedWeight {
                    Text("\(Self.formatWeight(weight.value)) \(weight.unit)")
                        .physiqueOSFont(PhysiqueOSTypography.priorityDetailMetric)
                        .foregroundStyle(PhysiqueOSTheme.priorityInk)
                    Text("Recorded for \(TrainingDateFormatting.short(weight.date)).")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.priorityMuted)
                } else {
                    Text("Evidence-driven")
                        .physiqueOSFont(PhysiqueOSTypography.priorityDetailMetric)
                        .foregroundStyle(PhysiqueOSTheme.priorityInk)
                    Text("No valid Weight yet for \(TrainingDateFormatting.short(priority.date)).")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.priorityMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            if priority.relatedWeight != nil {
                miniButton("View Weight") { onNavigate(.progressStream(streamId: "weight")) }
                    .accessibilityIdentifier("priorityDetail.viewWeight")
            } else if let destination = priority.continueActionDestination, !priority.completed {
                miniButton(priority.actionLabel ?? "Log Weight") { onNavigate(destination) }
                    .accessibilityIdentifier("priorityDetail.logWeight")
            }
        }
        .padding(15)
        .background(
            LinearGradient(colors: [PhysiqueOSTheme.priorityTeal.opacity(0.17), PhysiqueOSTheme.priorityNavy.opacity(0.18)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .padding(.bottom, 16)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("priorityDetail.morningEvidence")
    }

    private func miniButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(.white)
                .padding(.horizontal, 13)
                .frame(minHeight: 44)
                .background(PhysiqueOSTheme.priorityNavy)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    // MARK: Sections

    private func sectionView(_ section: PrioritySectionReadModel) -> some View {
        let kind = PriorityDetailPresentation.sectionKind(section.title)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 9) {
                Image(systemName: Self.sectionSymbol(kind))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(sectionTint(kind))
                    .frame(width: 28, height: 28)
                    .background(sectionTint(kind).opacity(0.13))
                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                    .accessibilityHidden(true)
                Text(section.title)
                    .physiqueOSFont(PhysiqueOSTypography.priorityDetailSectionTitle)
                    .foregroundStyle(PhysiqueOSTheme.priorityInk)
                    .accessibilityAddTraits(.isHeader)
            }

            ForEach(Array(section.items.enumerated()), id: \.offset) { index, item in
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.label)
                        .physiqueOSFont(PhysiqueOSTypography.priorityDetailFieldValue)
                        .foregroundStyle(PhysiqueOSTheme.priorityInk)
                        .fixedSize(horizontal: false, vertical: true)
                    if let detail = item.detail, !detail.isEmpty {
                        Text(detail)
                            .physiqueOSFont(PhysiqueOSTypography.priorityDetailFieldDetail)
                            .foregroundStyle(PhysiqueOSTheme.priorityMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.top, index == 0 ? 0 : 3)
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.horizontal, 2)
        .padding(.vertical, 15)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    static func sectionSymbol(_ kind: PriorityDetailPresentation.SectionKind) -> String {
        switch kind {
        case .when: "clock"
        case .dose: "circle.dotted"
        case .preparation: "sparkle"
        case .nextChange: "arrow.up.right"
        case .notes: "line.3.horizontal"
        case .why: "scope"
        case .plain: "diamond.fill"
        }
    }

    private func sectionTint(_ kind: PriorityDetailPresentation.SectionKind) -> Color {
        switch kind {
        case .dose, .nextChange: PhysiqueOSTheme.priorityPurple
        case .preparation: PhysiqueOSTheme.priorityAmber
        default: PhysiqueOSTheme.priorityTeal
        }
    }

    /// Sandbox / cached payloads without canonical sections.
    private func fallbackWhatSection(_ priority: PriorityOccurrence) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            divider
            sectionView(PrioritySectionReadModel(title: "What", items: [
                PriorityDetailFieldReadModel(
                    label: priority.metadata ?? priority.title,
                    detail: "Scheduled for \(TrainingDateFormatting.short(priority.date))."
                )
            ]))
            divider
        }
    }

    // MARK: Unavailable

    private func unavailablePage(title: String, message: String?) -> some View {
        VStack(spacing: 0) {
            Image(systemName: "exclamationmark")
                .font(.system(size: 22, weight: .heavy))
                .foregroundStyle(PhysiqueOSTheme.priorityRed)
                .frame(width: 54, height: 54)
                .background(PhysiqueOSTheme.priorityRed.opacity(0.09))
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .accessibilityHidden(true)
            Text("Priority")
                .physiqueOSFont(PhysiqueOSTypography.priorityDetailEyebrow)
                .foregroundStyle(PhysiqueOSTheme.priorityPurple)
                .padding(.top, 15)
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.priorityDetailErrorTitle)
                .foregroundStyle(PhysiqueOSTheme.priorityInk)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 7)
            if let message {
                Text(message)
                    .physiqueOSFont(PhysiqueOSTypography.priorityDetailSubtitle)
                    .foregroundStyle(PhysiqueOSTheme.priorityMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 285)
                    .padding(.top, 8)
            }
            PriorityDetailButton(title: "Try Again", style: .navy) {
                Task { await reload() }
            }
            .frame(width: 200)
            .padding(.top, 18)
            .accessibilityIdentifier("priorityDetail.retry")
        }
        .frame(maxWidth: .infinity, minHeight: 600)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("priorityDetail.unavailable")
    }

    /// "This priority could not be loaded. Pull to refresh and try again."
    /// splits into the locked title and supporting line.
    static func failureTitle(_ message: String) -> String {
        guard let range = message.range(of: ". ") else { return message }
        return String(message[..<range.lowerBound]) + "."
    }

    static func failureDetail(_ message: String) -> String? {
        guard let range = message.range(of: ". ") else { return nil }
        let rest = message[range.upperBound...].trimmingCharacters(in: .whitespaces)
        return rest.isEmpty ? nil : rest
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

    static func amountCaption(outcome: PriorityDoseEntry.Outcome, seed: String, unit: String) -> String {
        switch outcome {
        case .unchanged: "Planned \(seed) \(unit). Edit only if you took a different amount."
        case .changed(let dose): "\(dose) will be recorded for this dose. Your dose plan is unchanged."
        case .invalid: "Enter the amount you took, or leave the planned \(seed) \(unit)."
        }
    }

    private static func formatWeight(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }

}

/// The family's full-width 52 pt action: navy (Mark Complete, Continue),
/// the teal-to-navy evidence field (Upload Photos), or amber (Go to a
/// paused peptide). White label in both appearances, as locked.
struct PriorityDetailButton: View {
    enum Style { case navy, evidence, amber }

    let title: String
    var style: Style = .navy
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.priorityDetailAction)
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(background)
                .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.5)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(title)
    }

    @ViewBuilder
    private var background: some View {
        switch style {
        case .navy: PhysiqueOSTheme.priorityNavy
        case .amber: Color(hex: 0xC9871E)
        case .evidence:
            LinearGradient(colors: [Color(hex: 0x159F95), Color(hex: 0x153D69)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }
}
