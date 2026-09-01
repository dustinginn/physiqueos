import SwiftUI

struct MorningCheckInView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var weightText = ""
    @State private var message: String?
    @State private var complete = false
    private var store: LoggingSandboxStore { environment.loggingSandboxStore }

    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("MORNING CHECK-IN").physiqueOSFont(PhysiqueOSTypography.screenEyebrow).foregroundStyle(PhysiqueOSTheme.accent)
                Text(complete ? "Check-in complete" : "Good morning").physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
                Text(Self.fullDate.string(from: Date())).physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            if complete {
                CardContainer { Label("Priorities reconciled and weight saved", systemImage: "checkmark.circle.fill").foregroundStyle(PhysiqueOSTheme.chartSuccess) }
                PrimaryActionButton(title: "Return Home") { dismiss() }
            } else {
                Text("Yesterday’s unfinished priorities").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                ForEach(store.morningPriorities) { priority in priorityCard(priority) }
                CardContainer { VStack(alignment: .leading, spacing: 10) {
                    Text("What’s your weight today?").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    HStack { NumericEditField(text: $weightText, accessibilityLabel: "Morning weight", placeholder: "150.5").frame(height: 48); Text("lb").physiqueOSFont(PhysiqueOSTypography.cardHeading16) }
                } }
                if let message { Text(message).physiqueOSFont(PhysiqueOSTypography.calloutStrong).foregroundStyle(PhysiqueOSTheme.destructive) }
                PrimaryActionButton(title: "Complete Morning Check-In") { save() }.accessibilityIdentifier("morningCheckIn.save")
            }
        }.padding(16) }
        .scrollDismissesKeyboard(.interactively)
        .background(PhysiqueOSTheme.background).navigationTitle("Morning Check-In").navigationBarTitleDisplayMode(.inline)
        .onAppear { if let entry = store.weighIn(on: Date()) { weightText = formatWeight(entry.value) } }
    }

    private func priorityCard(_ priority: MorningPriorityItem) -> some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                Text(priority.title).physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                Text(priority.detail).physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                HStack(spacing: 6) { ForEach(MorningPriorityDisposition.allCases) { disposition in
                    Button(disposition.label) { store.updateMorningPriority(id: priority.id, disposition: disposition) }
                        .buttonStyle(.borderedProminent)
                        .tint(priority.disposition == disposition ? dispositionColor(disposition) : PhysiqueOSTheme.surfaceElevated)
                        .foregroundStyle(priority.disposition == disposition ? Color.white : PhysiqueOSTheme.textSecondary)
                        .controlSize(.small)
                } }
                if priority.disposition == .note {
                    ZStack(alignment: .topLeading) {
                        if (store.morningPriorities.first(where: { $0.id == priority.id })?.note ?? "").isEmpty {
                            Text("Add context if it will help later.").physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textMuted).padding(.horizontal, 12).padding(.vertical, 14)
                        }
                        TextEditor(text: Binding(get: { store.morningPriorities.first(where: { $0.id == priority.id })?.note ?? "" }, set: { store.updateMorningPriority(id: priority.id, disposition: .note, note: $0) }))
                            .frame(minHeight: 96).padding(6).scrollContentBackground(.hidden).background(Color.clear)
                    }
                    .background(PhysiqueOSTheme.surfaceMuted).clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }.padding(.vertical, 10)
            Divider().overlay(PhysiqueOSTheme.divider)
        }
    }

    private func dispositionColor(_ disposition: MorningPriorityDisposition) -> Color {
        switch disposition { case .completed: PhysiqueOSTheme.chartSuccess; case .skipped: .orange; case .note: PhysiqueOSTheme.accent }
    }

    private func save() {
        switch store.saveMorningCheckIn(weightText: weightText) {
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
