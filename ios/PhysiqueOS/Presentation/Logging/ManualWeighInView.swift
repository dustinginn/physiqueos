import SwiftUI

struct ManualWeighInView: View {
    @Environment(AppEnvironment.self) private var environment
    var onReturnToLog: () -> Void = {}
    @State private var selectedDate = Date()
    @State private var weightText = ""
    @State private var unit: WeightUnit = .lb
    @State private var message: String?
    @State private var isError = false
    @State private var completedEntry: LocalWeightEntry?

    private var store: LoggingSandboxStore { environment.loggingSandboxStore }
    private var existing: LocalWeightEntry? { store.weighIn(on: selectedDate) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if let completedEntry { completion(entry: completedEntry) } else { form }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(PhysiqueOSTheme.background)
        .navigationTitle("Morning Weigh-In")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { loadExisting() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("MANUAL LOG")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text("Record a weigh-in")
                .physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text("Use the measurement date. Historical entries stay historical; the time added is tracked separately.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 14) {
            CardContainer {
                VStack(alignment: .leading, spacing: 12) {
                    Text("When was this measured?")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    DateField(date: $selectedDate, maximumDate: Date(), label: "Weigh-in date")
                        .onChange(of: selectedDate) { loadExisting() }
                    Text(isToday ? "Today’s morning weight" : "Historical weigh-in · occurrence date preserved")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }

            if let existing {
                CardContainer(background: PhysiqueOSTheme.surfaceAccent) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Existing entry")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        Text("\(formatted(existing.value)) \(existing.unit.rawValue) is already staged locally for this date. Saving replaces the local value and records a correction.")
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
            }

            CardContainer {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Weight")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    HStack(spacing: 10) {
                        NumericEditField(text: $weightText, accessibilityLabel: "Weight")
                            .frame(height: 48)
                        Picker("Unit", selection: $unit) {
                            ForEach(WeightUnit.allCases) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 112)
                    }
                    Text("The value is device-only in this sandbox. No production WeightEntry or history record is created.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }

            if let message {
                Text(message)
                    .physiqueOSFont(PhysiqueOSTypography.calloutStrong)
                    .foregroundStyle(isError ? PhysiqueOSTheme.destructive : PhysiqueOSTheme.textSecondary)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(isError ? PhysiqueOSTheme.destructive.opacity(0.08) : PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            PrimaryActionButton(title: existing == nil ? "Review and stage weigh-in" : "Replace local weigh-in") {
                switch store.saveWeighIn(weightText: weightText, unit: unit, date: selectedDate) {
                case .success(let entry):
                    completedEntry = entry
                    message = nil
                case .failure(let error):
                    isError = true
                    message = error.message
                }
            }
            .accessibilityIdentifier("manualWeighIn.save")
        }
    }

    private func completion(entry: LocalWeightEntry) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            CardContainer(background: PhysiqueOSTheme.surfaceAccent) {
                VStack(alignment: .leading, spacing: 10) {
                    Label(entry.correctionCount > 0 ? "Local correction staged" : "Local weigh-in staged", systemImage: "checkmark.circle.fill")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                    Text("\(formatted(entry.value)) \(entry.unit.rawValue) · \(entry.dateKey)")
                        .physiqueOSFont(PhysiqueOSTypography.metricValue)
                    Text("This confirms only local synthetic state. It was not saved to canonical history, synced, or sent to production.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
            PrimaryActionButton(title: "Return to Log", action: onReturnToLog)
            Button("Correct this entry") {
                completedEntry = nil
                loadExisting()
            }
            .frame(maxWidth: .infinity)
            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            .foregroundStyle(PhysiqueOSTheme.accent)
        }
    }

    private var isToday: Bool {
        Calendar.current.isDate(selectedDate, inSameDayAs: Date())
    }

    private func loadExisting() {
        message = nil
        isError = false
        if let entry = store.weighIn(on: selectedDate) {
            weightText = formatted(entry.value)
            unit = entry.unit
        } else {
            weightText = ""
        }
    }

    private func formatted(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }
}
