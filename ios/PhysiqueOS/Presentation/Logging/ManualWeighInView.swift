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
    /// to the shared store until "Complete Morning Weigh-In" is tapped —
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
    @State private var isSubmitting = false
    /// Founder Production's own read of `morning-check-in` — `nil` under
    /// Sandbox (which reads `store` directly instead) or before the first
    /// load completes.
    @State private var productionCheckIn: MorningCheckInReadModel?
    private var store: LoggingSandboxStore { environment.loggingSandboxStore }
    private var isProduction: Bool { environment.nativeAuthority == .founderProduction }

    /// `(id, title, metadata)` is all `priorityCard` actually renders —
    /// kept authority-agnostic so Sandbox's rich `PriorityOccurrence` and
    /// Production's thinner `MorningCheckInReconciliationItem` can share
    /// one card without a shim type standing in for identity Native
    /// doesn't have (icon/color/urgency have no Production equivalent and
    /// were never used by this card's own rendering).
    private var unfinished: [(id: String, title: String, metadata: String?)] {
        if isProduction {
            return (productionCheckIn?.unfinishedPriorities ?? []).map { ($0.id, $0.title, $0.context) }
        }
        return store.previousDayUnfinishedPriorities().map { ($0.id, $0.title, $0.metadata) }
    }
    private var evidenceRecoveryItems: [MorningEvidenceRecoveryItem] { isProduction ? [] : store.evidenceRecoveryItems() }
    private var briefingReconciliation: BriefingReconciliationPresentation? { isProduction ? nil : store.briefingReconciliationPresentation() }

    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("MORNING WEIGH-IN").physiqueOSFont(PhysiqueOSTypography.screenEyebrow).foregroundStyle(PhysiqueOSTheme.accent)
                Text(complete ? "Weigh-in complete" : "Good morning").physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
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
                    ForEach(unfinished, id: \.id) { priority in priorityCard(id: priority.id, title: priority.title, metadata: priority.metadata) }
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
                PrimaryActionButton(title: isSubmitting ? "Saving…" : "Complete Morning Weigh-In") { save() }
                    .disabled(isSubmitting)
                    .accessibilityIdentifier("morningCheckIn.save")
                if !isProduction { recoveryEvidenceCard }
            }
        }.padding(16) }
        .scrollDismissesKeyboard(.interactively)
        .background(PhysiqueOSTheme.background).navigationTitle("Morning Weigh-In").navigationBarTitleDisplayMode(.inline)
        .task(id: environment.nativeAuthority) {
            guard isProduction else {
                if let entry = store.weighIn(on: Date()) { weightText = formatWeight(entry.value) }
                return
            }
            productionCheckIn = try? await environment.morningCheckInAPI.fetchMorningCheckIn()
            if let existing = productionCheckIn?.existingWeight { weightText = formatWeight(existing) }
        }
    }

    /// `EvidenceRecoveryCard` — plain navigation, no form fields; never
    /// gates "Complete Morning Weigh-In" (verified: the real button's
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
    private func priorityCard(id: String, title: String, metadata: String?) -> some View {
        let selected = choices[id]?.disposition
        return VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                Text(title).physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                if let metadata {
                    Text(metadata).physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                HStack(spacing: 6) { ForEach(PriorityDisposition.allCases) { disposition in
                    Button(disposition.label) { setDisposition(disposition, for: id) }
                        .buttonStyle(.borderedProminent)
                        .tint(selected == disposition ? dispositionColor(disposition) : PhysiqueOSTheme.surfaceElevated)
                        .foregroundStyle(selected == disposition ? Color.white : PhysiqueOSTheme.textSecondary)
                        .controlSize(.small)
                } }
                ZStack(alignment: .topLeading) {
                    if (choices[id]?.note ?? "").isEmpty {
                        Text("Add context if it will help later.").physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textMuted).padding(.horizontal, 12).padding(.vertical, 14)
                    }
                    TextEditor(text: Binding(get: { choices[id]?.note ?? "" }, set: { setNote($0, for: id) }))
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
        guard isProduction else {
            switch store.saveMorningCheckIn(weightText: weightText, dispositions: resolved) {
            case .success: message = nil; complete = true
            case .failure(let error): message = error.message
            }
            return
        }
        guard (try? NativeProductWriteGuard.authorize(.morningCheckInAndWeight, in: .founderProduction)) != nil else { return }
        guard let value = Double(weightText.trimmingCharacters(in: .whitespacesAndNewlines)), value > 0 else {
            message = "Enter a valid weight."
            return
        }
        guard let localDate = productionCheckIn?.today else {
            message = "Today's check-in context could not be loaded."
            return
        }
        var submissions: [MorningCheckInReconciliationSubmission] = []
        for occurrence in unfinished {
            guard let disposition = resolved[occurrence.id]?.disposition else { continue }
            guard let canonicalOccurrence = productionCheckIn?.reconciliationItems.first(where: { $0.id == occurrence.id }) else {
                message = "This priority's canonical occurrence could not be loaded. Refresh Morning Weigh-In before saving."
                return
            }
            submissions.append(MorningCheckInReconciliationSubmission(
                priorityId: occurrence.id,
                occurrenceDate: canonicalOccurrence.date,
                occurrenceKey: canonicalOccurrence.occurrenceKey,
                disposition: disposition.rawValue,
                note: resolved[occurrence.id]?.note
            ))
        }
        Task {
            isSubmitting = true
            defer { isSubmitting = false }
            do {
                let report = try await environment.weightEvidenceAPI.fetchWeightReport(scope: .all)
                let expectedVersion = report.revision(forDateKey: localDate).map(String.init)
                _ = try await environment.weightWriteAPI.submitMorningCheckIn(
                    localDate: localDate, value: value, expectedVersion: expectedVersion,
                    reconciliationSubmissions: submissions
                )
                productionCheckIn = try await environment.morningCheckInAPI.fetchMorningCheckIn()
                message = nil
                complete = true
            } catch {
                message = ManualWeighInView.errorMessage(for: error)
            }
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
    @State private var isSubmitting = false
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
            PrimaryActionButton(title: isSubmitting ? "Saving…" : "Save Weight") { save() }
                .disabled(isSubmitting)
                .accessibilityIdentifier("manualWeighIn.save")
            if message != nil && !isError { Button("Return to Log") { onReturnToLog(); dismiss() }.frame(maxWidth: .infinity) }
        }.padding(16) }
        .scrollDismissesKeyboard(.interactively)
        .background(PhysiqueOSTheme.background).navigationTitle("Log Weight").navigationBarTitleDisplayMode(.inline)
        .onChange(of: date) { loadExisting() }.onAppear { loadExisting() }
    }

    private func save() {
        guard environment.nativeAuthority == .founderProduction else {
            switch store.saveWeighIn(weightText: weightText, unit: unit, date: date) {
            case .success: isError = false; message = "Weight saved for \(Self.mediumDate.string(from: date))."
            case .failure(let error): isError = true; message = error.message
            }
            return
        }
        guard (try? NativeProductWriteGuard.authorize(.morningCheckInAndWeight, in: .founderProduction)) != nil else { return }
        guard let value = Double(weightText.trimmingCharacters(in: .whitespacesAndNewlines)), value > 0 else {
            isError = true; message = "Enter a valid weight."
            return
        }
        let localDate = Self.localDateKey.string(from: date)
        let valueInPounds = unit == .kg ? value * 2.20462 : value
        Task {
            isSubmitting = true
            defer { isSubmitting = false }
            do {
                // Always re-read the current revision immediately before
                // submitting a same-day correction — a cached value can go
                // stale if the web edits the same day between reads.
                let report = try await environment.weightEvidenceAPI.fetchWeightReport(scope: .all)
                let expectedVersion = report.revision(forDateKey: localDate).map(String.init)
                _ = try await environment.weightWriteAPI.submitWeight(
                    localDate: localDate, value: valueInPounds, expectedVersion: expectedVersion
                )
                let refreshed = try await environment.weightEvidenceAPI.fetchWeightReport(scope: .all)
                guard refreshed.history.contains(where: { $0.date == localDate }) || refreshed.current?.date == localDate else {
                    throw ProductionNativeError.invalidResponse
                }
                isError = false
                message = "Weight saved for \(Self.mediumDate.string(from: date))."
            } catch {
                isError = true
                message = Self.errorMessage(for: error)
            }
        }
    }

    private func loadExisting() {
        message = nil
        guard environment.nativeAuthority == .founderProduction else {
            if let entry = store.weighIn(on: date) { weightText = formatWeight(entry.value); unit = entry.unit } else { weightText = "" }
            return
        }
        let dateKey = Self.localDateKey.string(from: date)
        Task {
            do {
                let report = try await environment.weightEvidenceAPI.fetchWeightReport(scope: .all)
                let entry = report.current?.date == dateKey ? report.current : report.history.first(where: { $0.date == dateKey })
                weightText = entry.flatMap { Self.weightNumber(from: $0.value) }.map(formatWeight) ?? ""
                unit = .lb
            } catch {
                weightText = ""
                isError = true
                message = Self.errorMessage(for: error)
            }
        }
    }
    private static let mediumDate: DateFormatter = { let f = DateFormatter(); f.dateStyle = .medium; return f }()
    private static let localDateKey: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func errorMessage(for error: Error) -> String {
        if let productionError = error as? ProductionNativeError { return productionError.errorDescription ?? "This weigh-in could not be saved." }
        return "This weigh-in could not be saved."
    }

    private static func weightNumber(from value: String) -> Double? {
        Double(value.split(separator: " ").first.map(String.init) ?? value)
    }
}

private func formatWeight(_ value: Double) -> String { value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value) }
