import SwiftUI

/// Native composition of the web `SupportScheduleEditor`: frequency,
/// weekdays/interval, timing, start/end dates, and a compact preview.
struct OperatingPlanSupportScheduleEditor: View {
    @Binding var schedule: OperatingPlanSupportScheduleReadModel
    var sectionNumber: String = "1"

    var body: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 10) {
                    Text(sectionNumber)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(.white)
                        .frame(width: 28, height: 28)
                        .background(PhysiqueOSTheme.accent, in: Circle())
                    Text("Schedule")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                }

                labeled("How often?") {
                    Picker("How often?", selection: $schedule.frequency) {
                        ForEach(SupportScheduleFrequency.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.menu)
                    .tint(PhysiqueOSTheme.accent)
                }

                if schedule.frequency == .weekly {
                    labeled("Which day?") {
                        Picker("Which day?", selection: weeklyDay) {
                            ForEach(OperatingPlanWeekday.allCases) { Text($0.label).tag($0) }
                        }
                        .pickerStyle(.menu)
                        .tint(PhysiqueOSTheme.accent)
                    }
                } else if schedule.frequency == .specificDays {
                    labeled("Which days?") {
                        FlowPills(
                            items: OperatingPlanWeekday.allCases,
                            isSelected: { schedule.daysOfWeek.contains($0) },
                            label: \.shortLabel
                        ) { day in
                            if let index = schedule.daysOfWeek.firstIndex(of: day) {
                                schedule.daysOfWeek.remove(at: index)
                            } else {
                                schedule.daysOfWeek.append(day)
                            }
                        }
                    }
                } else if schedule.frequency == .everyXDays {
                    labeled("Repeat interval") {
                        Stepper("Every \(schedule.intervalDays) days", value: $schedule.intervalDays, in: 1...365)
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    }
                }

                labeled("When?") {
                    Picker("When?", selection: $schedule.timing) {
                        ForEach(SupportScheduleTiming.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.menu)
                    .tint(PhysiqueOSTheme.accent)
                }

                if schedule.timing == .specific {
                    labeled("Local time") {
                        DatePicker("Local time", selection: specificTime, displayedComponents: .hourAndMinute)
                            .labelsHidden()
                            .tint(PhysiqueOSTheme.accent)
                    }
                }

                labeled("Starts") {
                    DateField(date: startDate, label: "Start date")
                }

                labeled("Ends") {
                    HStack(spacing: 8) {
                        OperatingPlanChoicePill(title: "Until changed", isSelected: schedule.endDate == nil) {
                            schedule.endDate = nil
                        }
                        OperatingPlanChoicePill(title: "Choose date", isSelected: schedule.endDate != nil) {
                            schedule.endDate = schedule.endDate ?? schedule.startDate
                        }
                    }
                    if schedule.endDate != nil {
                        DateField(date: endDate, label: "End date")
                    }
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("SCHEDULE PREVIEW")
                        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                    Text(OperatingPlanSandboxStore.formatSupportSchedule(schedule))
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(dateWindow)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(PhysiqueOSTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: 14))
            }
        }
    }

    private func labeled<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            content()
        }
    }

    private var weeklyDay: Binding<OperatingPlanWeekday> {
        Binding(
            get: { schedule.daysOfWeek.first ?? .monday },
            set: { schedule.daysOfWeek = [$0] }
        )
    }

    private var specificTime: Binding<Date> {
        Binding(
            get: { OperatingPlanDateValues.time(from: schedule.specificTime) },
            set: { schedule.specificTime = OperatingPlanDateValues.timeKey(from: $0) }
        )
    }

    private var startDate: Binding<Date> {
        Binding(
            get: { OperatingPlanDateValues.date(from: schedule.startDate) },
            set: { schedule.startDate = OperatingPlanDateValues.dateKey(from: $0) }
        )
    }

    private var endDate: Binding<Date> {
        Binding(
            get: { OperatingPlanDateValues.date(from: schedule.endDate ?? schedule.startDate) },
            set: { schedule.endDate = OperatingPlanDateValues.dateKey(from: $0) }
        )
    }

    private var dateWindow: String {
        let start = OperatingPlanDateValues.readableDate(schedule.startDate)
        let end = schedule.endDate.map(OperatingPlanDateValues.readableDate) ?? "Until changed"
        return "Starts \(start) · \(end)"
    }
}

enum OperatingPlanDateValues {
    static func date(from value: String) -> Date {
        dateFormatter.date(from: value) ?? Date()
    }

    static func dateKey(from value: Date) -> String { dateFormatter.string(from: value) }

    static func time(from value: String) -> Date {
        timeFormatter.date(from: value) ?? timeFormatter.date(from: "09:00") ?? Date()
    }

    static func timeKey(from value: Date) -> String { timeFormatter.string(from: value) }

    static func readableDate(_ value: String) -> String {
        guard let date = dateFormatter.date(from: value) else { return value }
        return readableDateFormatter.string(from: date)
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        // These values are local calendar dates, not UTC instants. Using
        // GMT here shifted date-only controls to the previous day in
        // western time zones (and shifted exact HH:mm controls by the UTC
        // offset) when SwiftUI rendered the DatePicker.
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "HH:mm"
        return formatter
    }()

    private static let readableDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "MMM d, yyyy"
        return formatter
    }()
}
