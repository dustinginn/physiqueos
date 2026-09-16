import SwiftUI

/// A PhysiqueOS-styled date control: the dark, card-integrated resting
/// presentation the Founder asked for, in place of the stock floating gray
/// `DatePicker(.compact)` capsule. The actual date *selection* remains a
/// genuine native `DatePicker` (`.graphical`, presented in a sheet) — this
/// is a styled trigger for it, not a replacement date-entry system, so
/// Dynamic Type, VoiceOver, and standard calendar interaction are all
/// unchanged from what a native date picker already provides.
///
/// Reusable wherever a screen needs "the date this evidence happened"
/// (weigh-in, workout, meal, scan, activity) — not one-off to Log's Upload
/// card.
struct DateField: View {
    @Binding var date: Date
    /// The latest selectable date (evidence cannot be logged for the
    /// future) — semantics unchanged from the prior inline `DatePicker`.
    var maximumDate: Date = Date()
    /// The earliest selectable date. `nil` (the default, used by every
    /// evidence-logging call site) leaves the range open on the low end;
    /// a future-only picker (e.g. scheduling a DEXA appointment) passes
    /// both bounds explicitly instead.
    var minimumDate: Date? = nil
    var label: String = "Date"

    @State private var isPresented = false

    var body: some View {
        Button {
            isPresented = true
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "calendar")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(Self.formatter.string(from: date))
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Image(systemName: "chevron.down")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 48)
            .frame(maxWidth: .infinity)
            .background(PhysiqueOSTheme.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(PhysiqueOSTheme.divider, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityValue(Self.formatter.string(from: date))
        .accessibilityHint("Opens a date picker")
        .accessibilityAddTraits(.isButton)
        .sheet(isPresented: $isPresented) {
            NavigationStack {
                DatePicker(label, selection: $date, in: (minimumDate ?? .distantPast)...maximumDate, displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .tint(PhysiqueOSTheme.accent)
                    .padding()
                    .background(PhysiqueOSTheme.background)
                    .navigationTitle(label)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Today") {
                                if let today = Self.selectableToday(minimumDate: minimumDate, maximumDate: maximumDate) {
                                    date = today
                                }
                            }
                            .disabled(Self.selectableToday(minimumDate: minimumDate, maximumDate: maximumDate) == nil)
                            .accessibilityIdentifier("datePicker.today")
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { isPresented = false }
                        }
                    }
            }
            .presentationDetents([.medium])
        }
    }

    /// Date-only affordance; never clamp Today to a future appointment or
    /// change the stored selection just because the picker was opened.
    static func selectableToday(
        now: Date = Date(), minimumDate: Date?, maximumDate: Date,
        calendar: Calendar = .current
    ) -> Date? {
        let today = calendar.startOfDay(for: now)
        if let minimumDate, today < calendar.startOfDay(for: minimumDate) { return nil }
        guard today <= calendar.startOfDay(for: maximumDate) else { return nil }
        return today
    }

    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .full
        return formatter
    }()
}
