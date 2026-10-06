import SwiftUI

// MARK: - Locked daily capture primitives
//
// Final Design Batch 2 (Founder-accepted 2026-10-04): Morning Check-In and
// manual/backdated Weight share one capture grammar — a crumb row, hero,
// bordered form surfaces, 52 pt fields and actions, and left-ruled
// messages. SF Pro, as locked; sizes scale with Dynamic Type.

enum CaptureType {
    struct Style {
        let size: CGFloat
        let weight: Font.Weight
        var tracking: CGFloat = 0
        var uppercase = false
    }

    static let eyebrow = Style(size: 12, weight: .heavy, tracking: 0.12, uppercase: true)
    static let title = Style(size: 31, weight: .heavy, tracking: -0.035)
    static let panelTitle = Style(size: 20, weight: .bold, tracking: -0.02)
    static let rowTitle = Style(size: 15, weight: .heavy)
    static let lede = Style(size: 15, weight: .regular)
    static let date = Style(size: 13, weight: .semibold)
    static let sectionTitle = Style(size: 14, weight: .heavy)
    static let hint = Style(size: 12, weight: .bold)
    static let fieldLabel = Style(size: 12, weight: .heavy)
    static let field = Style(size: 17, weight: .bold)
    static let largeField = Style(size: 34, weight: .bold, tracking: -0.03)
    static let unit = Style(size: 16, weight: .regular)
    static let note = Style(size: 13, weight: .semibold)
    static let meta = Style(size: 12, weight: .semibold)
    static let choice = Style(size: 12, weight: .bold)
    static let action = Style(size: 15, weight: .heavy)
    static let message = Style(size: 13, weight: .semibold)
    static let back = Style(size: 14, weight: .bold)
}

private struct CaptureFontModifier: ViewModifier {
    @ScaledMetric private var size: CGFloat
    let style: CaptureType.Style

    init(_ style: CaptureType.Style) {
        self.style = style
        _size = ScaledMetric(wrappedValue: style.size)
    }

    func body(content: Content) -> some View {
        content
            .font(.system(size: size, weight: style.weight))
            .tracking(size * style.tracking)
            .textCase(style.uppercase ? .uppercase : nil)
    }
}

extension View {
    func captureFont(_ style: CaptureType.Style) -> some View { modifier(CaptureFontModifier(style)) }

    /// The bordered, softly shadowed form surface (18 pt radius, 15 pt inset).
    func captureSurface(padding: CGFloat = 15) -> some View {
        self
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PhysiqueOSTheme.captureSurface)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(PhysiqueOSTheme.captureRule))
            .shadow(color: PhysiqueOSTheme.captureShadow, radius: 12, y: 8)
    }

    /// A 52 pt input well (13 pt radius, ruled border).
    func captureInputWell(minHeight: CGFloat = 52) -> some View {
        self
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, minHeight: minHeight, alignment: .leading)
            .background(PhysiqueOSTheme.captureInput)
            .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).strokeBorder(PhysiqueOSTheme.captureRule))
    }
}

/// The 52 pt crumb row that replaces the navigation bar ("‹ Home", "‹ Log").
struct CaptureCrumb: View {
    let title: String
    let action: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: action) {
                    HStack(spacing: 7) {
                        Image(systemName: "chevron.left").font(.system(size: 15, weight: .semibold))
                        Text(title).captureFont(CaptureType.back)
                    }
                    .foregroundStyle(PhysiqueOSTheme.captureSecondary)
                    .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back to \(title)")
                Spacer()
            }
            .frame(height: 52)
            .padding(.horizontal, 18)
            Rectangle().fill(PhysiqueOSTheme.captureRule).frame(height: 1).accessibilityHidden(true)
        }
    }
}

struct CaptureHero: View {
    let eyebrow: String
    let title: String
    var date: String? = nil
    var lede: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(eyebrow).captureFont(CaptureType.eyebrow).foregroundStyle(PhysiqueOSTheme.capturePurple)
            Text(title)
                .captureFont(CaptureType.title)
                .foregroundStyle(PhysiqueOSTheme.captureInk)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 2)
            if let date {
                Text(date).captureFont(CaptureType.date).foregroundStyle(PhysiqueOSTheme.captureSecondary).padding(.top, 7)
            }
            if let lede {
                Text(lede)
                    .captureFont(CaptureType.lede)
                    .foregroundStyle(PhysiqueOSTheme.captureSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
            }
        }
        .padding(.top, 4)
        .padding(.bottom, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

struct CaptureSectionTitle: View {
    let title: String
    var hint: String? = nil

    var body: some View {
        HStack(alignment: .lastTextBaseline) {
            Text(title).captureFont(CaptureType.sectionTitle).foregroundStyle(PhysiqueOSTheme.captureInk)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            if let hint { Text(hint).captureFont(CaptureType.hint).foregroundStyle(PhysiqueOSTheme.captureMuted) }
        }
        .padding(.top, 22)
        .padding(.bottom, 10)
    }
}

struct CapturePrimaryButton: View {
    let title: String
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .captureFont(CaptureType.action)
                .foregroundStyle(PhysiqueOSTheme.captureOnPrimary)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(
                    LinearGradient(colors: [PhysiqueOSTheme.capturePrimaryStart, PhysiqueOSTheme.capturePrimaryEnd],
                                   startPoint: .leading, endPoint: .trailing)
                )
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.62)
        .padding(.top, 14)
    }
}

struct CaptureSecondaryButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .captureFont(CaptureType.action)
                .foregroundStyle(PhysiqueOSTheme.captureInk)
                .frame(maxWidth: .infinity, minHeight: 52)
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(PhysiqueOSTheme.captureRule))
                .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .padding(.top, 14)
    }
}

/// A left-ruled status message: error (red), success (green), processing
/// (amber, safe-to-leave reconciling copy) or neutral (teal).
struct CaptureMessage: View {
    enum Tone { case neutral, error, success, processing }

    let text: String
    let tone: Tone

    var body: some View {
        Text(text)
            .captureFont(CaptureType.message)
            .foregroundStyle(foreground)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.vertical, 12)
            .padding(.horizontal, 13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PhysiqueOSTheme.captureSurfaceTint)
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: 0,
                                              bottomTrailingRadius: 13, topTrailingRadius: 13, style: .continuous))
            .overlay(alignment: .leading) { Rectangle().fill(rule).frame(width: 3) }
            .padding(.top, 12)
            .accessibilityElement(children: .combine)
    }

    private var rule: Color {
        switch tone {
        case .neutral: PhysiqueOSTheme.captureTeal
        case .error: PhysiqueOSTheme.captureRed
        case .success: PhysiqueOSTheme.captureGreen
        case .processing: PhysiqueOSTheme.captureAmber
        }
    }

    private var foreground: Color {
        switch tone {
        case .error: PhysiqueOSTheme.captureRed
        case .success: PhysiqueOSTheme.captureInk
        case .neutral, .processing: PhysiqueOSTheme.captureSecondary
        }
    }
}

// MARK: - Morning Check-In

struct MorningCheckInView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    var onNavigate: (AppDestination) -> Void = { _ in }
    @State private var weightText = ""
    @State private var message: String?
    @State private var messageIsError = false
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
#if DEBUG
    /// Review captures only: a source-shaped Production presentation.
    @State private var review = DailyCaptureReviewFixture.morning
#endif
    private var store: LoggingSandboxStore { environment.loggingSandboxStore }
    private var isProduction: Bool { environment.nativeAuthority == .founderProduction }

    /// Founder Production suppresses the Sandbox-only recovery/briefing
    /// cards (the locked capture design preserves that boundary).
    private var showsSandboxCards: Bool {
#if DEBUG
        if review != nil { return false }
#endif
        return !isProduction
    }

    /// `(id, title, metadata)` is all a reconciliation row actually renders —
    /// kept authority-agnostic so Sandbox's rich `PriorityOccurrence` and
    /// Production's thinner `MorningCheckInReconciliationItem` share one row.
    private var unfinished: [(id: String, title: String, metadata: String?)] {
#if DEBUG
        if let review { return review.unfinished }
#endif
        if isProduction {
            return (productionCheckIn?.unfinishedPriorities ?? []).map { ($0.id, $0.title, $0.context) }
        }
        return store.previousDayUnfinishedPriorities().map { ($0.id, $0.title, $0.metadata) }
    }
    private var evidenceRecoveryItems: [MorningEvidenceRecoveryItem] { showsSandboxCards ? store.evidenceRecoveryItems() : [] }
    private var briefingReconciliation: BriefingReconciliationPresentation? { showsSandboxCards ? store.briefingReconciliationPresentation() : nil }

    var body: some View {
        VStack(spacing: 0) {
            CaptureCrumb(title: "Home") { dismiss() }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    CaptureHero(
                        eyebrow: "Morning Weigh-In",
                        title: complete ? "Weigh-in complete" : "Good morning",
                        date: Self.fullDate.string(from: Date())
                    )
                    if let briefingReconciliation, briefingReconciliation.visible {
                        briefingReconciliationCard(briefingReconciliation)
                    }
                    if complete {
                        completePanel
                        CapturePrimaryButton(title: "Return Home") { dismiss() }
                            .accessibilityIdentifier("morningCheckIn.returnHome")
                    } else {
                        if !unfinished.isEmpty {
                            CaptureSectionTitle(title: "Yesterday’s unfinished priorities", hint: "Choose one each")
                            VStack(alignment: .leading, spacing: 0) {
                                ForEach(Array(unfinished.enumerated()), id: \.element.id) { index, priority in
                                    reconciliationRow(id: priority.id, title: priority.title, metadata: priority.metadata, isFirst: index == 0)
                                }
                            }
                            .captureSurface(padding: 15)
                        }
                        if !evidenceRecoveryItems.isEmpty {
                            CaptureSectionTitle(title: "Recover missing evidence")
                            VStack(spacing: 8) { ForEach(evidenceRecoveryItems) { item in evidenceRecoveryCard(item) } }
                        }
                        CaptureSectionTitle(title: "What’s your weight today?")
                        weightField.captureSurface(padding: 15)
                        if let message {
                            CaptureMessage(text: message, tone: messageTone(message))
                                .accessibilityIdentifier("morningCheckIn.message")
                        }
                        CapturePrimaryButton(title: isSubmitting ? "Saving…" : "Complete Morning Weigh-In", enabled: !isSubmitting) { save() }
                            .accessibilityIdentifier("morningCheckIn.save")
                        if showsSandboxCards { recoveryEvidenceCard }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(PhysiqueOSTheme.captureCanvas)
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .task(id: environment.nativeAuthority) {
#if DEBUG
            if let review {
                weightText = review.weight
                message = review.message
                messageIsError = review.messageIsError
                isSubmitting = review.isSubmitting
                complete = review.complete
                for (id, disposition) in review.dispositions { choices[id] = (disposition, "") }
                return
            }
#endif
            guard isProduction else {
                if let entry = store.weighIn(on: Date()) { weightText = formatWeight(entry.value) }
                return
            }
            productionCheckIn = try? await environment.morningCheckInAPI.fetchMorningCheckIn()
            if let existing = productionCheckIn?.existingWeight { weightText = formatWeight(existing) }
        }
    }

    private func messageTone(_ text: String) -> CaptureMessage.Tone {
        if messageIsError { return .error }
        return text.contains("still reconciling") ? .processing : .neutral
    }

    /// Today's weight in pounds: the locked 74 pt field.
    private var weightField: some View {
        HStack(spacing: 8) {
            NumericEditField(
                text: $weightText,
                accessibilityLabel: "Morning weight",
                placeholder: "150.5",
                fieldBackground: .clear,
                font: UIFont.systemFont(ofSize: UIFontMetrics(forTextStyle: .largeTitle).scaledValue(for: 34), weight: .bold),
                textColor: PhysiqueOSTheme.captureInk,
                placeholderColor: PhysiqueOSTheme.captureMuted,
                textAlignment: .left
            )
            .frame(minHeight: 72)
            Text("lb").captureFont(CaptureType.unit).foregroundStyle(PhysiqueOSTheme.captureSecondary)
        }
        .captureInputWell(minHeight: 74)
        .accessibilityIdentifier("morningCheckIn.weight")
    }

    private var completePanel: some View {
        VStack(spacing: 0) {
            Image(systemName: "checkmark")
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(PhysiqueOSTheme.captureGreen)
                .frame(width: 54, height: 54)
                .background(Circle().fill(PhysiqueOSTheme.captureGreen.opacity(0.17)))
                .accessibilityHidden(true)
            Text("Priorities reconciled and weight saved")
                .captureFont(CaptureType.panelTitle)
                .foregroundStyle(PhysiqueOSTheme.captureInk)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 14)
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(PhysiqueOSTheme.captureSurface)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(PhysiqueOSTheme.captureRule))
        .padding(.top, 26)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("morningCheckIn.complete")
    }

    /// Completed / Skipped / Add note (one required per occurrence) plus an
    /// **always-available** optional note — a note can accompany a Completed
    /// or Skipped disposition too; it is not gated behind "Add note".
    private func reconciliationRow(id: String, title: String, metadata: String?, isFirst: Bool) -> some View {
        let selected = choices[id]?.disposition
        return VStack(alignment: .leading, spacing: 0) {
            if !isFirst { Rectangle().fill(PhysiqueOSTheme.captureRule).frame(height: 1).padding(.bottom, 15) }
            Text(title).captureFont(CaptureType.rowTitle).foregroundStyle(PhysiqueOSTheme.captureInk)
            if let metadata {
                Text(metadata).captureFont(CaptureType.meta).foregroundStyle(PhysiqueOSTheme.captureMuted).padding(.top, 4)
            }
            HStack(spacing: 7) {
                ForEach(PriorityDisposition.allCases) { disposition in
                    let isSelected = selected == disposition
                    Button { setDisposition(disposition, for: id) } label: {
                        Text(disposition.label)
                            .captureFont(CaptureType.choice)
                            .foregroundStyle(isSelected ? PhysiqueOSTheme.captureInk : PhysiqueOSTheme.captureSecondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(isSelected ? PhysiqueOSTheme.captureTeal.opacity(0.17) : PhysiqueOSTheme.captureInput)
                            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous)
                                .strokeBorder(isSelected ? PhysiqueOSTheme.captureTeal : PhysiqueOSTheme.captureRule))
                            .contentShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(title): \(disposition.label)")
                    .accessibilityAddTraits(isSelected ? .isSelected : [])
                    .accessibilityIdentifier("morningCheckIn.\(id).\(disposition.rawValue)")
                }
            }
            .padding(.top, 12)
            noteField(for: id)
                .padding(.top, 7)
        }
        .padding(.bottom, 15)
        .padding(.top, isFirst ? 0 : 0)
    }

    private func noteField(for id: String) -> some View {
        ZStack(alignment: .topLeading) {
            if (choices[id]?.note ?? "").isEmpty {
                Text("Add context if it will help later.")
                    .captureFont(CaptureType.note)
                    .foregroundStyle(PhysiqueOSTheme.captureMuted)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .accessibilityHidden(true)
            }
            TextEditor(text: Binding(get: { choices[id]?.note ?? "" }, set: { setNote($0, for: id) }))
                .captureFont(CaptureType.note)
                .foregroundStyle(PhysiqueOSTheme.captureInk)
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .frame(minHeight: 68)
                .accessibilityLabel("Optional note")
        }
        .background(PhysiqueOSTheme.captureInput)
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).strokeBorder(PhysiqueOSTheme.captureRule))
    }

    /// `EvidenceRecoveryCard` (Sandbox) — plain navigation, no form fields;
    /// never gates "Complete Morning Weigh-In".
    private func evidenceRecoveryCard(_ item: MorningEvidenceRecoveryItem) -> some View {
        Button { onNavigate(item.destination) } label: {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title).captureFont(CaptureType.rowTitle).foregroundStyle(PhysiqueOSTheme.captureInk)
                    Text(item.actionLabel).captureFont(CaptureType.meta).foregroundStyle(PhysiqueOSTheme.captureTeal)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(PhysiqueOSTheme.captureMuted)
            }
            .captureSurface(padding: 15)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("morningCheckIn.evidenceRecovery.\(item.type.rawValue)")
    }

    /// `BriefingReconciliationCard` (Sandbox) — its own single action,
    /// independent of the weight form. `finalizeBriefingReconciliation` never
    /// fabricates a real regeneration.
    private func briefingReconciliationCard(_ presentation: BriefingReconciliationPresentation) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(presentation.title, systemImage: presentation.isFailure ? "exclamationmark.triangle.fill" : "doc.text.fill")
                .captureFont(CaptureType.rowTitle)
                .foregroundStyle(presentation.isFailure ? PhysiqueOSTheme.captureRed : PhysiqueOSTheme.captureInk)
            Text(presentation.message).captureFont(CaptureType.note).foregroundStyle(PhysiqueOSTheme.captureSecondary)
            if presentation.canFinalize {
                CapturePrimaryButton(title: presentation.actionLabel) { finalizeBriefing() }
                    .accessibilityIdentifier("morningCheckIn.briefingReconciliation.finalize")
            }
            if let briefingMessage { Text(briefingMessage).captureFont(CaptureType.meta).foregroundStyle(PhysiqueOSTheme.captureSecondary) }
        }
        .captureSurface()
        .padding(.bottom, 4)
    }

    private func finalizeBriefing() {
        switch store.finalizeBriefingReconciliation() {
        case .resolvedNoOp: briefingMessage = nil
        case .waitingOnEvidence: briefingMessage = "Confirm your pending evidence review before updating the briefing."
        case .requiresBriefingEngine: briefingMessage = "This update requires the Briefings engine, which isn't connected in this build yet."
        case .noPendingWorkItem: briefingMessage = nil
        }
    }

    /// `RecoveryCheckInIngestionService` (Sandbox) — a second, fully
    /// independent form (own submit, own outcome message).
    private var recoveryEvidenceCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recovery Evidence").captureFont(CaptureType.rowTitle).foregroundStyle(PhysiqueOSTheme.captureInk)
            Text("Optional. These notes are not interpreted — they support future coaching context.")
                .captureFont(CaptureType.meta).foregroundStyle(PhysiqueOSTheme.captureSecondary)
            HStack {
                Text("Sleep duration").captureFont(CaptureType.note).foregroundStyle(PhysiqueOSTheme.captureInk)
                Spacer()
                NumericEditField(text: $sleepDurationText, accessibilityLabel: "Sleep duration hours", placeholder: "7.5").frame(width: 80, height: 40)
                Text("hrs").captureFont(CaptureType.note).foregroundStyle(PhysiqueOSTheme.captureSecondary)
            }
            Picker("Subjective recovery", selection: $subjectiveRecovery) {
                Text("Not entered").tag(SubjectiveRecoveryRating?.none)
                ForEach(SubjectiveRecoveryRating.allCases) { Text($0.label).tag(SubjectiveRecoveryRating?.some($0)) }
            }.pickerStyle(.menu).tint(PhysiqueOSTheme.captureTeal)
            Picker("Soreness", selection: $soreness) {
                Text("Not entered").tag(SorenessLevel?.none)
                ForEach(SorenessLevel.allCases) { Text($0.label).tag(SorenessLevel?.some($0)) }
            }.pickerStyle(.menu).tint(PhysiqueOSTheme.captureTeal)
            if let recoveryMessage { Text(recoveryMessage).captureFont(CaptureType.meta).foregroundStyle(PhysiqueOSTheme.captureSecondary) }
            CapturePrimaryButton(title: "Save Recovery Evidence") { saveRecovery() }
                .accessibilityIdentifier("morningCheckIn.recoveryEvidence.save")
        }
        .captureSurface()
        .padding(.top, 22)
    }

    private func saveRecovery() {
        let hours = sleepDurationText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : Double(sleepDurationText)
        switch store.saveRecoveryCheckIn(sleepDurationHours: hours, subjectiveRecovery: subjectiveRecovery, soreness: soreness) {
        case .success(.omitted): recoveryMessage = "No recovery evidence entered."
        case .success(.saved): recoveryMessage = "Recovery evidence saved."
        case .failure(let error): recoveryMessage = error.message
        }
    }

    private func setDisposition(_ disposition: PriorityDisposition, for id: String) {
        choices[id] = (disposition, choices[id]?.note ?? "")
    }

    private func setNote(_ note: String, for id: String) {
        choices[id] = (choices[id]?.disposition, note)
    }

    private func save() {
#if DEBUG
        guard review == nil else { return }
#endif
        var resolved: [String: (disposition: PriorityDisposition, note: String)] = [:]
        for occurrence in unfinished {
            guard let disposition = choices[occurrence.id]?.disposition else {
                messageIsError = true
                message = "Choose an outcome for each unfinished priority."
                return
            }
            resolved[occurrence.id] = (disposition, choices[occurrence.id]?.note ?? "")
        }
        guard isProduction else {
            switch store.saveMorningCheckIn(weightText: weightText, dispositions: resolved) {
            case .success: messageIsError = false; message = nil; complete = true
            case .failure(let error): messageIsError = true; message = error.message
            }
            return
        }
        guard (try? NativeProductWriteGuard.authorize(.morningCheckInAndWeight, in: .founderProduction)) != nil else { return }
        guard let value = Double(weightText.trimmingCharacters(in: .whitespacesAndNewlines)), value > 0 else {
            messageIsError = true
            message = "Enter a valid weight."
            return
        }
        guard let localDate = productionCheckIn?.today else {
            messageIsError = true
            message = "Today's check-in context could not be loaded."
            return
        }
        var submissions: [MorningCheckInReconciliationSubmission] = []
        for occurrence in unfinished {
            guard let disposition = resolved[occurrence.id]?.disposition else { continue }
            guard let canonicalOccurrence = productionCheckIn?.reconciliationItems.first(where: { $0.id == occurrence.id }) else {
                messageIsError = true
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
                let lifecycle = MorningCheckInSubmissionLifecycle(
                    invalidateWeightRead: {
                        await environment.productionNativeAPI.invalidateReadResources(["weight", "morning-check-in", "home"])
                    },
                    fetchWeightReport: {
                        try await environment.weightEvidenceAPI.fetchWeightReport(scope: .all)
                    },
                    submitCheckIn: { expectedVersion in
                        try await environment.weightWriteAPI.submitMorningCheckIn(
                            localDate: localDate, value: value, expectedVersion: expectedVersion,
                            reconciliationSubmissions: submissions
                        )
                    }
                )
                let resolution = try await lifecycle.submit(localDate: localDate)
                if resolution == .saved {
                    productionCheckIn = try? await environment.morningCheckInAPI.fetchMorningCheckIn()
                    // The save is durable; the widget refresh must not hold
                    // the confirmation behind its own Server reads.
                    let relay = environment.homeWidgetRefreshRelay
                    Task { await relay.request() }
                    messageIsError = false
                    message = nil
                    complete = true
                } else {
                    messageIsError = false
                    message = "Morning Check-In was accepted and is still reconciling. It is safe to leave this screen or retry the same submission."
                }
            } catch {
                messageIsError = true
                message = ManualWeighInView.errorMessage(for: error)
            }
        }
    }
    private static let fullDate: DateFormatter = { let f = DateFormatter(); f.dateStyle = .full; return f }()
}

// MARK: - Manual / backdated Weight

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
    /// Saved (durable) vs accepted-and-reconciling: only a durable save
    /// reveals Return to Log.
    @State private var isReconciling = false
#if DEBUG
    @State private var review = DailyCaptureReviewFixture.weight
#endif
    private var store: LoggingSandboxStore { environment.loggingSandboxStore }

    var body: some View {
        VStack(spacing: 0) {
            CaptureCrumb(title: "Log") { dismiss() }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    CaptureHero(
                        eyebrow: "Log Weight",
                        title: "Record a weigh-in",
                        lede: "Add or correct a measured weight for a specific date."
                    )
                    VStack(alignment: .leading, spacing: 0) {
                        fieldLabel("Date measured")
                        dateField
                        HStack(alignment: .top, spacing: 10) {
                            VStack(alignment: .leading, spacing: 0) {
                                fieldLabel("Weight").padding(.top, 13)
                                NumericEditField(
                                    text: $weightText,
                                    accessibilityLabel: "Weight",
                                    placeholder: "150.5",
                                    fieldBackground: .clear,
                                    font: UIFont.systemFont(ofSize: UIFontMetrics(forTextStyle: .body).scaledValue(for: 17), weight: .semibold),
                                    textColor: PhysiqueOSTheme.captureInk,
                                    placeholderColor: PhysiqueOSTheme.captureMuted,
                                    textAlignment: .left
                                )
                                .frame(minHeight: 50)
                                .captureInputWell()
                                .accessibilityIdentifier("manualWeighIn.weight")
                            }
                            VStack(alignment: .leading, spacing: 0) {
                                fieldLabel("Unit").padding(.top, 13)
                                unitMenu
                            }
                            .frame(width: 104)
                        }
                    }
                    .captureSurface()

                    if let message {
                        CaptureMessage(text: message, tone: isError ? .error : (isReconciling ? .processing : .success))
                            .accessibilityIdentifier("manualWeighIn.message")
                    }
                    CapturePrimaryButton(title: isSubmitting ? "Saving…" : "Save Weight", enabled: !isSubmitting) { save() }
                        .accessibilityIdentifier("manualWeighIn.save")
                    if message != nil && !isError && !isReconciling {
                        CaptureSecondaryButton(title: "Return to Log") { onReturnToLog(); dismiss() }
                            .accessibilityIdentifier("manualWeighIn.returnToLog")
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(PhysiqueOSTheme.captureCanvas)
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .onChange(of: date) { loadExisting() }
        .onAppear {
#if DEBUG
            if let review {
                date = review.date
                weightText = review.weight
                message = review.message
                isError = review.isError
                isReconciling = review.isReconciling
                isSubmitting = review.isSubmitting
                return
            }
#endif
            loadExisting()
        }
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text).captureFont(CaptureType.fieldLabel).foregroundStyle(PhysiqueOSTheme.captureSecondary).padding(.bottom, 7)
    }

    /// The date well shows the measured date; the system compact picker
    /// (capped at today) sits over it as the real control.
    private var dateField: some View {
        HStack {
            Text(Self.mediumDate.string(from: date)).captureFont(CaptureType.field).foregroundStyle(PhysiqueOSTheme.captureInk)
            Spacer()
            Image(systemName: "calendar").foregroundStyle(PhysiqueOSTheme.captureSecondary)
        }
        .captureInputWell()
        .overlay {
            DatePicker("Date measured", selection: $date, in: ...Date(), displayedComponents: .date)
                .labelsHidden()
                .datePickerStyle(.compact)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
                .blendMode(.destinationOver)
                .opacity(0.02)
                .accessibilityLabel("Date measured")
        }
        .accessibilityIdentifier("manualWeighIn.date")
    }

    private var unitMenu: some View {
        Menu {
            Picker("Unit", selection: $unit) {
                ForEach(WeightUnit.allCases) { Text($0.rawValue).tag($0) }
            }
        } label: {
            HStack {
                Text(unit.rawValue).captureFont(CaptureType.field).foregroundStyle(PhysiqueOSTheme.captureInk)
                Spacer()
                Image(systemName: "chevron.down").font(.system(size: 13, weight: .semibold)).foregroundStyle(PhysiqueOSTheme.captureSecondary)
            }
            .captureInputWell()
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Unit, \(unit.rawValue)")
        .accessibilityIdentifier("manualWeighIn.unit")
    }

    private func save() {
#if DEBUG
        guard review == nil else { return }
#endif
        guard environment.nativeAuthority == .founderProduction else {
            switch store.saveWeighIn(weightText: weightText, unit: unit, date: date) {
            case .success: isError = false; isReconciling = false; message = "Weight saved for \(Self.mediumDate.string(from: date))."
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
                let lifecycle = WeightSubmissionLifecycle(
                    invalidateWeightRead: {
                        await environment.productionNativeAPI.invalidateReadResources(["weight"])
                    },
                    fetchWeightReport: {
                        try await environment.weightEvidenceAPI.fetchWeightReport(scope: .all)
                    },
                    submitWeight: { localDate, value, expectedVersion in
                        try await environment.weightWriteAPI.submitWeight(
                            localDate: localDate, value: value, expectedVersion: expectedVersion
                        )
                    }
                )
                let resolution = try await lifecycle.submit(localDate: localDate, value: valueInPounds)
                let relay = environment.homeWidgetRefreshRelay
                Task { await relay.request() }
                isError = false
                isReconciling = resolution != .saved
                message = resolution == .saved
                    ? "Weight saved for \(Self.mediumDate.string(from: date))."
                    : "Weight accepted and still reconciling. It is safe to leave this screen or retry the same value."
            } catch {
                isError = true
                message = Self.errorMessage(for: error)
            }
        }
    }

    private func loadExisting() {
#if DEBUG
        guard review == nil else { return }
#endif
        message = nil
        isReconciling = false
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
    static let mediumDate: DateFormatter = { let f = DateFormatter(); f.dateStyle = .medium; return f }()
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

#if DEBUG
/// Review captures of every locked daily-capture state with the board's
/// exact copy (`-physiqueos.capture-review <state>`). DEBUG only; the
/// seam never submits (save is a no-op while a fixture is active).
enum DailyCaptureReviewFixture {
    struct Morning {
        var unfinished: [(id: String, title: String, metadata: String?)] = []
        var dispositions: [String: PriorityDisposition] = [:]
        var weight = ""
        var message: String?
        var messageIsError = false
        var isSubmitting = false
        var complete = false
    }

    struct Weight {
        var date: Date
        var weight: String
        var message: String?
        var isError = false
        var isReconciling = false
        var isSubmitting = false
    }

    static var state: String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-physiqueos.capture-review"), arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }

    static var morning: Morning? {
        guard let state, state.hasPrefix("morning-") else { return nil }
        var fixture = Morning()
        switch state {
        case "morning-reconcile":
            fixture.unfinished = [("tesamorelin", "Tesamorelin", "Yesterday · 10:29 PM · 0.5 mg"),
                                  ("foam", "Foam Rolling", "Yesterday · 7:15 PM")]
            fixture.dispositions = ["tesamorelin": .completed, "foam": .skipped]
        case "morning-existing": fixture.weight = "172.9"
        case "morning-validation": fixture.message = "Enter a valid weight."; fixture.messageIsError = true
        case "morning-saving": fixture.weight = "172.9"; fixture.isSubmitting = true
        case "morning-processing":
            fixture.weight = "172.9"
            fixture.message = "Morning Check-In was accepted and is still reconciling. It is safe to leave this screen or retry the same submission."
        case "morning-complete": fixture.complete = true
        default: break // morning-empty
        }
        return fixture
    }

    static var weight: Weight? {
        guard let state, state.hasPrefix("weight-") else { return nil }
        let sep10 = DateComponents(calendar: .current, year: 2026, month: 9, day: 10).date ?? Date()
        let sep24 = DateComponents(calendar: .current, year: 2026, month: 9, day: 24).date ?? Date()
        switch state {
        case "weight-correction": return .init(date: sep10, weight: "172.9")
        case "weight-validation": return .init(date: sep10, weight: "1200", message: "Weight must be between 50 and 1,000 lb.", isError: true)
        case "weight-saving": return .init(date: sep10, weight: "172.9", isSubmitting: true)
        case "weight-processing":
            return .init(date: sep10, weight: "172.9",
                         message: "Weight accepted and still reconciling. It is safe to leave this screen or retry the same value.",
                         isReconciling: true)
        case "weight-success": return .init(date: sep10, weight: "172.9", message: "Weight saved for Sep 10, 2026.")
        case "weight-failed": return .init(date: sep10, weight: "", message: "This weigh-in could not be saved.", isError: true)
        default: return .init(date: sep24, weight: "") // weight-new
        }
    }
}
#endif
