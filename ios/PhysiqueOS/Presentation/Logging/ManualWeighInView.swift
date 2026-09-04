import SwiftUI

struct MorningCheckInView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    var onNavigate: (AppDestination) -> Void = { _ in }
    @State private var weightText = ""
    @State private var message: String?
    @State private var complete = false
    /// One disposition + note per occurrence id — mirrors the real check-in
    /// form's own per-item `${occurrenceKey}_status`/`${occurrenceKey}_note`
    /// fields, submitted together in one save (see
    /// `LoggingSandboxStore.saveMorningCheckIn`'s doc comment). Not written
    /// to the shared store until "Complete Morning Check-In" is tapped —
    /// matching the real form's single-submit behavior.
    @State private var choices: [String: (disposition: PriorityDisposition?, note: String)] = [:]
    /// Recovery Evidence (sleep/subjective recovery/soreness) — a
    /// genuinely separate, always-optional third form (verified: its own
    /// server action, its own submit button, never gates or is gated by
    /// weight/Priority reconciliation).
    @State private var sleepDurationText = ""
    @State private var subjectiveRecovery: SubjectiveRecoveryRating?
    @State private var soreness: SorenessLevel?
    @State private var recoveryMessage: String?
    @State private var briefingMessage: String?
    private var store: LoggingSandboxStore { environment.loggingSandboxStore }
    private var unfinished: [PriorityOccurrence] { store.previousDayUnfinishedPriorities() }
    private var evidenceRecoveryItems: [MorningEvidenceRecoveryItem] { store.evidenceRecoveryItems() }
    private var briefingReconciliation: BriefingReconciliationPresentation? { store.briefingReconciliationPresentation() }

    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("MORNING CHECK-IN").physiqueOSFont(PhysiqueOSTypography.screenEyebrow).foregroundStyle(PhysiqueOSTheme.accent)
                Text(complete ? "Check-in complete" : "Good morning").physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
                Text(Self.fullDate.string(from: Date())).physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            if let briefingReconciliation, briefingReconciliation.visible {
                briefingReconciliationCard(briefingReconciliation)
            }
            if complete {
                CardContainer { Label("Priorities reconciled and weight saved", systemImage: "checkmark.circle.fill").foregroundStyle(PhysiqueOSTheme.chartSuccess) }
                PrimaryActionButton(title: "Return Home") { dismiss() }
            } else {
                if !unfinished.isEmpty {
                    Text("Yesterday’s unfinished priorities").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    ForEach(unfinished) { priority in priorityCard(priority) }
                }
                if !evidenceRecoveryItems.isEmpty {
                    Text("Recover missing evidence").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    ForEach(evidenceRecoveryItems) { item in evidenceRecoveryCard(item) }
                }
                CardContainer { VStack(alignment: .leading, spacing: 10) {
                    Text("What’s your weight today?").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    HStack { NumericEditField(text: $weightText, accessibilityLabel: "Morning weight", placeholder: "150.5").frame(height: 48); Text("lb").physiqueOSFont(PhysiqueOSTypography.cardHeading16) }
                } }
                if let message { Text(message).physiqueOSFont(PhysiqueOSTypography.calloutStrong).foregroundStyle(PhysiqueOSTheme.destructive) }
                PrimaryActionButton(title: "Complete Morning Check-In") { save() }.accessibilityIdentifier("morningCheckIn.save")
                recoveryEvidenceCard
            }
        }.padding(16) }
        .scrollDismissesKeyboard(.interactively)
        .background(PhysiqueOSTheme.background).navigationTitle("Morning Check-In").navigationBarTitleDisplayMode(.inline)
        .onAppear { if let entry = store.weighIn(on: Date()) { weightText = formatWeight(entry.value) } }
    }

    /// `EvidenceRecoveryCard` — plain navigation, no form fields; never
    /// gates "Complete Morning Check-In" (verified: the real button's
    /// `required` fields are the Priority reconciliation radios only).
    private func evidenceRecoveryCard(_ item: MorningEvidenceRecoveryItem) -> some View {
        Button { onNavigate(item.destination) } label: {
            CardContainer { HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title).physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(item.actionLabel).physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.accent)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(PhysiqueOSTheme.textMuted)
            } }
        }.buttonStyle(.plain).accessibilityIdentifier("morningCheckIn.evidenceRecovery.\(item.type.rawValue)")
    }

    /// `BriefingReconciliationCard` — its own single action, independent
    /// of the weight form. `finalizeBriefingReconciliation` never
    /// fabricates a real regeneration (see `LoggingSandboxStore`'s doc
    /// comment); a `.requiresBriefingEngine` outcome surfaces as an
    /// explanatory message rather than a false success.
    private func briefingReconciliationCard(_ presentation: BriefingReconciliationPresentation) -> some View {
        CardContainer { VStack(alignment: .leading, spacing: 10) {
            Label(presentation.title, systemImage: presentation.isFailure ? "exclamationmark.triangle.fill" : "doc.text.fill")
                .physiqueOSFont(PhysiqueOSTypography.cardHeading16).foregroundStyle(presentation.isFailure ? PhysiqueOSTheme.destructive : PhysiqueOSTheme.textPrimary)
            Text(presentation.message).physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            if presentation.canFinalize {
                PrimaryActionButton(title: presentation.actionLabel) { finalizeBriefing() }
                    .accessibilityIdentifier("morningCheckIn.briefingReconciliation.finalize")
            }
            if let briefingMessage { Text(briefingMessage).physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary) }
        } }
    }

    private func finalizeBriefing() {
        switch store.finalizeBriefingReconciliation() {
        case .resolvedNoOp: briefingMessage = nil
        case .waitingOnEvidence: briefingMessage = "Confirm your pending evidence review before updating the briefing."
        case .requiresBriefingEngine: briefingMessage = "This update requires the Briefings engine, which isn't connected in this build yet."
        case .noPendingWorkItem: briefingMessage = nil
        }
    }

    /// `RecoveryCheckInIngestionService` — a second, fully independent
    /// form (own submit, own outcome message), never bundled with the
    /// weight/Priority-reconciliation submission.
    private var recoveryEvidenceCard: some View {
        CardContainer { VStack(alignment: .leading, spacing: 12) {
            Text("Recovery Evidence").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
            Text("Optional. These notes are not interpreted — they support future coaching context.")
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            HStack {
                Text("Sleep duration").physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                Spacer()
                NumericEditField(text: $sleepDurationText, accessibilityLabel: "Sleep duration hours", placeholder: "7.5").frame(width: 80, height: 40)
                Text("hrs").physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            Picker("Subjective recovery", selection: $subjectiveRecovery) {
                Text("Not entered").tag(SubjectiveRecoveryRating?.none)
                ForEach(SubjectiveRecoveryRating.allCases) { Text($0.label).tag(SubjectiveRecoveryRating?.some($0)) }
            }.pickerStyle(.menu).tint(PhysiqueOSTheme.accent)
            Picker("Soreness", selection: $soreness) {
                Text("Not entered").tag(SorenessLevel?.none)
                ForEach(SorenessLevel.allCases) { Text($0.label).tag(SorenessLevel?.some($0)) }
            }.pickerStyle(.menu).tint(PhysiqueOSTheme.accent)
            if let recoveryMessage { Text(recoveryMessage).physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary) }
            PrimaryActionButton(title: "Save Recovery Evidence") { saveRecovery() }
                .accessibilityIdentifier("morningCheckIn.recoveryEvidence.save")
        } }
    }

    private func saveRecovery() {
        let hours = sleepDurationText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : Double(sleepDurationText)
        switch store.saveRecoveryCheckIn(sleepDurationHours: hours, subjectiveRecovery: subjectiveRecovery, soreness: soreness) {
        case .success(.omitted): recoveryMessage = "No recovery evidence entered."
        case .success(.saved): recoveryMessage = "Recovery evidence saved."
        case .failure(let error): recoveryMessage = error.message
        }
    }

    /// Completed / Skipped / Add note radios, plus an **always-visible**
    /// optional note textarea — verified real web behavior for this task: a
    /// note can accompany a Completed or Skipped disposition too, it is not
    /// gated behind selecting "Add note" specifically.
    private func priorityCard(_ priority: PriorityOccurrence) -> some View {
        let selected = choices[priority.id]?.disposition
        return VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                Text(priority.title).physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                if let metadata = priority.metadata {
                    Text(metadata).physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                HStack(spacing: 6) { ForEach(PriorityDisposition.allCases) { disposition in
                    Button(disposition.label) { setDisposition(disposition, for: priority.id) }
                        .buttonStyle(.borderedProminent)
                        .tint(selected == disposition ? dispositionColor(disposition) : PhysiqueOSTheme.surfaceElevated)
                        .foregroundStyle(selected == disposition ? Color.white : PhysiqueOSTheme.textSecondary)
                        .controlSize(.small)
                } }
                ZStack(alignment: .topLeading) {
                    if (choices[priority.id]?.note ?? "").isEmpty {
                        Text("Add context if it will help later.").physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textMuted).padding(.horizontal, 12).padding(.vertical, 14)
                    }
                    TextEditor(text: Binding(get: { choices[priority.id]?.note ?? "" }, set: { setNote($0, for: priority.id) }))
                        .frame(minHeight: 72).padding(6).scrollContentBackground(.hidden).background(Color.clear)
                }
                .background(PhysiqueOSTheme.surfaceMuted).clipShape(RoundedRectangle(cornerRadius: 10))
            }.padding(.vertical, 10)
            Divider().overlay(PhysiqueOSTheme.divider)
        }
    }

    private func setDisposition(_ disposition: PriorityDisposition, for id: String) {
        choices[id] = (disposition, choices[id]?.note ?? "")
    }

    private func setNote(_ note: String, for id: String) {
        choices[id] = (choices[id]?.disposition, note)
    }

    private func dispositionColor(_ disposition: PriorityDisposition) -> Color {
        switch disposition { case .completed: PhysiqueOSTheme.chartSuccess; case .skipped: .orange; case .note: PhysiqueOSTheme.accent }
    }

    private func save() {
        var resolved: [String: (disposition: PriorityDisposition, note: String)] = [:]
        for occurrence in unfinished {
            guard let disposition = choices[occurrence.id]?.disposition else {
                message = "Choose an outcome for each unfinished priority."
                return
            }
            resolved[occurrence.id] = (disposition, choices[occurrence.id]?.note ?? "")
        }
        switch store.saveMorningCheckIn(weightText: weightText, dispositions: resolved) {
        case .success: message = nil; complete = true
        case .failure(let error): message = error.message
        }
    }
    private static let fullDate: DateFormatter = { let f = DateFormatter(); f.dateStyle = .full; return f }()
}

struct ManualWeighInView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    var onReturnToLog: () -> Void = {}
    @State private var weightText = ""
    @State private var unit: WeightUnit = .lb
    @State private var date = Date()
    @State private var message: String?
    @State private var isError = false
    private var store: LoggingSandboxStore { environment.loggingSandboxStore }

    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 16) {
            Text("LOG WEIGHT").physiqueOSFont(PhysiqueOSTypography.screenEyebrow).foregroundStyle(PhysiqueOSTheme.accent)
            Text("Record a weigh-in").physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
            CardContainer { VStack(alignment: .leading, spacing: 12) {
                DateField(date: $date, maximumDate: Date(), label: "Date measured")
                HStack { NumericEditField(text: $weightText, accessibilityLabel: "Weight").frame(height: 48); Picker("Unit", selection: $unit) { ForEach(WeightUnit.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.segmented).frame(width: 110) }
            } }
            if let message { Text(message).physiqueOSFont(PhysiqueOSTypography.calloutStrong).foregroundStyle(isError ? PhysiqueOSTheme.destructive : PhysiqueOSTheme.chartSuccess) }
            PrimaryActionButton(title: "Save Weight") { save() }.accessibilityIdentifier("manualWeighIn.save")
            if message != nil && !isError { Button("Return to Log") { onReturnToLog(); dismiss() }.frame(maxWidth: .infinity) }
        }.padding(16) }
        .scrollDismissesKeyboard(.interactively)
        .background(PhysiqueOSTheme.background).navigationTitle("Log Weight").navigationBarTitleDisplayMode(.inline)
        .onChange(of: date) { loadExisting() }.onAppear { loadExisting() }
    }

    private func save() {
        switch store.saveWeighIn(weightText: weightText, unit: unit, date: date) {
        case .success: isError = false; message = "Weight saved for \(Self.mediumDate.string(from: date))."
        case .failure(let error): isError = true; message = error.message
        }
    }
    private func loadExisting() { message = nil; if let entry = store.weighIn(on: date) { weightText = formatWeight(entry.value); unit = entry.unit } else { weightText = "" } }
    private static let mediumDate: DateFormatter = { let f = DateFormatter(); f.dateStyle = .medium; return f }()
}

private func formatWeight(_ value: Double) -> String { value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value) }
