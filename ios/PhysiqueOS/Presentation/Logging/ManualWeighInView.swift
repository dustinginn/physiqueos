import SwiftUI

struct ManualWeighInView: View {
    @Environment(AppEnvironment.self) private var environment
    var onReturnToLog: () -> Void = {}
    @State private var weightText = ""
    @State private var message: String?
    @State private var isError = false

    private var store: LoggingSandboxStore { environment.loggingSandboxStore }
    private var existing: LocalWeightEntry? { store.weighIn(on: Date()) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                form
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
            Text("MORNING CHECK-IN")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text("What’s your weight today?")
                .physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(Self.dateFormatter.string(from: Date()))
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let existing {
                Text("A \(formatted(existing.value)) lb weight already exists for today. Saving a different value will correct today’s entry; saving the same value will make no change.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.chartEffort)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(PhysiqueOSTheme.chartEffort.opacity(0.10))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            CardContainer {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Weight")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    HStack(spacing: 10) {
                        NumericEditField(text: $weightText, accessibilityLabel: "Morning weight")
                            .frame(height: 48)
                        Text("lb")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
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

            PrimaryActionButton(title: "Save Weight") {
                switch store.saveWeighIn(weightText: weightText, unit: .lb, date: Date()) {
                case .success:
                    isError = false
                    message = "Weight saved."
                case .failure(let error):
                    isError = true
                    message = error.message
                }
            }
            .accessibilityIdentifier("manualWeighIn.save")
        }
    }

    private func loadExisting() {
        message = nil
        isError = false
        if let entry = store.weighIn(on: Date()) {
            weightText = formatted(entry.value)
        } else {
            weightText = ""
        }
    }

    private func formatted(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .full
        return formatter
    }()
}
