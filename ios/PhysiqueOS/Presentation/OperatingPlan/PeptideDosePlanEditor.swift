import SwiftUI

/// The dose-plan generator's controls in plain language (design §3,
/// critique copy list): "How the dose changes", "Starting dose", "Peak
/// dose", "Change by", "Hold, then decrease", "Final dose", "Ends". Used
/// inside the simplified screen's "Advanced · dose plan" disclosure and by
/// the legacy fallback editor, so the vocabulary is fixed in one place.
///
/// `Custom` is never offered: a record that already is a manual plan shows
/// a read-only "Manual plan" row until "Start a new plan from today"
/// replaces it with a steady dose.
struct PeptideDosePlanEditor: View {
    @Binding var dosing: PeptideDosingStrategyReadModel
    /// The owner's local date. When set, a start date before it shows the
    /// history-rewrite caption (the Server refuses such a save without an
    /// explicit `rewriteHistory`).
    var today: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            OperatingPlanSection("How the dose changes") {
                if dosing.pattern == .custom {
                    CardContainer(padding: .sm) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Manual plan")
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text("This plan was written by hand and can't be edited here. Start a new plan from today to replace it.")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 8)], alignment: .leading, spacing: 8) {
                        ForEach(PeptideDosingPattern.selectable) { pattern in
                            OperatingPlanChoicePill(title: pattern.label, isSelected: dosing.pattern == pattern, minHeight: 44) {
                                dosing.pattern = pattern
                            }
                        }
                    }
                }
            }

            if dosing.pattern != .custom {
                OperatingPlanSection("Starting dose") {
                    CardContainer(padding: .sm) {
                        VStack(alignment: .leading, spacing: 10) {
                            doseStepper(label: "Starting dose", value: $dosing.startingDoseAmount, unit: dosing.startingDoseUnit)
                            TextField("Unit", text: $dosing.startingDoseUnit)
                                .textFieldStyle(.roundedBorder)
                                .textInputAutocapitalization(.never)
                                .accessibilityLabel("Dose unit")
                        }
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Starts")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                        DateField(date: Binding(
                            get: { OperatingPlanDateValues.date(from: dosing.startDate) },
                            set: { dosing.startDate = OperatingPlanDateValues.dateKey(from: $0) }
                        ), maximumDate: .distantFuture, label: "Plan start date")
                        if rewritesHistory {
                            Text("Rewrites your dose history before today")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.chartEffort)
                        }
                    }
                }
            }

            if dosing.pattern.usesTarget {
                OperatingPlanSection("Peak dose") {
                    CardContainer(padding: .sm) {
                        doseStepper(label: "Peak dose", value: $dosing.targetDoseAmount, unit: dosing.startingDoseUnit)
                    }
                }
            }

            if dosing.pattern.usesStep {
                OperatingPlanSection("Change by") {
                    CardContainer(padding: .sm) {
                        VStack(alignment: .leading, spacing: 10) {
                            Stepper(value: $dosing.stepAmount, in: 0...5, step: 0.25) {
                                Text("\(dosing.pattern == .titrateDown ? "−" : "+")\(PeptideSupportPresentation.formatDoseAmount(dosing.stepAmount)) \(dosing.startingDoseUnit) each step")
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                            .accessibilityLabel("Change by")
                            .accessibilityValue("\(PeptideSupportPresentation.formatDoseAmount(dosing.stepAmount)) \(dosing.startingDoseUnit)")
                            Stepper(value: $dosing.stepInterval, in: 1...12) {
                                Text("Every \(dosing.stepInterval) \(dosing.stepUnit.label.lowercased())")
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                            .accessibilityLabel("Step interval")
                            intervalUnitPicker(value: $dosing.stepUnit)
                        }
                    }
                }
            }

            if dosing.pattern.usesHold {
                OperatingPlanSection("Hold, then decrease") {
                    CardContainer(padding: .sm) {
                        VStack(alignment: .leading, spacing: 10) {
                            Stepper(value: $dosing.holdDuration, in: 1...52) {
                                Text("Hold for \(dosing.holdDuration) \(dosing.holdUnit.label.lowercased())")
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                            .accessibilityLabel("Hold for")
                            intervalUnitPicker(value: $dosing.holdUnit)
                            Stepper(value: $dosing.decreaseAmount, in: 0...5, step: 0.25) {
                                Text("Decrease by \(PeptideSupportPresentation.formatDoseAmount(dosing.decreaseAmount)) \(dosing.startingDoseUnit)")
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                            .accessibilityLabel("Decrease by")
                            Stepper(value: $dosing.decreaseInterval, in: 1...12) {
                                Text("Decrease every \(dosing.decreaseInterval) \(dosing.decreaseUnit.label.lowercased())")
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                            .accessibilityLabel("Decrease interval")
                            intervalUnitPicker(value: $dosing.decreaseUnit)
                            doseStepper(label: "Final dose", value: $dosing.landingDoseAmount, unit: dosing.startingDoseUnit, prefix: "Final dose ")
                        }
                    }
                }
            }

            if dosing.pattern != .custom {
                OperatingPlanSection("Ends") {
                    HStack(spacing: 8) {
                        OperatingPlanChoicePill(title: "Ongoing", isSelected: dosing.endDate == nil, minHeight: 44) { dosing.endDate = nil }
                        OperatingPlanChoicePill(title: "Choose end date", isSelected: dosing.endDate != nil, minHeight: 44) {
                            dosing.endDate = dosing.endDate ?? dosing.startDate
                        }
                    }
                    if dosing.endDate != nil {
                        DateField(date: Binding(
                            get: { OperatingPlanDateValues.date(from: dosing.endDate ?? dosing.startDate) },
                            set: { dosing.endDate = OperatingPlanDateValues.dateKey(from: $0) }
                        ), maximumDate: .distantFuture, label: "End date")
                    }
                }
            }
        }
    }

    /// True when the plan is dated before today: saving it regenerates the
    /// dated history from that start (S1 keeps nothing before it).
    var rewritesHistory: Bool {
        guard let today, dosing.pattern != .custom else { return false }
        return dosing.startDate < today
    }

    private func doseStepper(label: String, value: Binding<Double>, unit: String, prefix: String = "") -> some View {
        Stepper(value: value, in: 0...1000, step: 0.25) {
            Text("\(prefix)\(PeptideSupportPresentation.formatDoseAmount(value.wrappedValue)) \(unit)")
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .accessibilityLabel(label)
        .accessibilityValue("\(PeptideSupportPresentation.formatDoseAmount(value.wrappedValue)) \(unit)")
    }

    private func intervalUnitPicker(value: Binding<PeptideDoseStepUnit>) -> some View {
        HStack(spacing: 8) {
            ForEach(PeptideDoseStepUnit.allCases) { unit in
                OperatingPlanChoicePill(title: unit.label, isSelected: value.wrappedValue == unit, minHeight: 44) {
                    value.wrappedValue = unit
                }
            }
        }
    }
}
