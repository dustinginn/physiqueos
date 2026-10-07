import SwiftUI

/// `/profile/operating-plan/execution/dexa` — "Next DEXA Scan", reached from
/// Priority Detail's "View DEXA Appointment" and from Coaching Updates'
/// Scheduled Evidence card.
///
/// Build 91 (Founder D2) replaces the Founder Production dead end. The DEXA
/// schedule is owned by the Coaching Updates strategy
/// (`CoachingUpdatesEditorReadModel.dexa`), and the Server already names
/// that strategy on the Operating Plan landing (the Coaching Updates item's
/// `operatingPlanStrategy("briefings", id)` destination). This page reads
/// the landing, resolves that one id, reads the Coaching Updates detail and
/// shows the appointment read-only. Editing opens the existing atomic
/// Coaching Updates editor at its DEXA section: the same Save, the same
/// `expectedCurrentVersionId`, stale saves still fail closed. No Server
/// command, no second write boundary, no Server change. Sandbox resolves
/// the same way from its own store.
struct OperatingPlanDexaAppointmentView: View {
    @Environment(AppEnvironment.self) private var environment
    var onNavigate: (AppDestination) -> Void = { _ in }
    var backTitle: String = "Back"

    @State private var state: LoadState = .loading
    @State private var lastScanDate: String?

    enum LoadState: Equatable {
        case loading
        case loaded(strategyId: String, presentation: NextDexaScanPresentation)
        case noCoaching
        case failed
    }

    static let pageTitle = "Next DEXA Scan"

    var body: some View {
        OperatingPlanScrollPage {
            switch state {
            case .loading:
                header(status: nil)
                OperatingPlanLoadingView()
            case .loaded(let strategyId, let presentation):
                header(status: presentation.isScheduled ? "Scheduled" : "Not scheduled")
                if presentation.isScheduled {
                    scheduled(presentation, strategyId: strategyId)
                } else {
                    notScheduled(strategyId: strategyId)
                }
            case .noCoaching:
                OperatingPlanHeader(eyebrow: "DEXA", title: Self.pageTitle, subtitle: "DEXA scheduling belongs to Coaching Updates.")
                OperatingPlanNote(
                    icon: "exclamationmark.circle", tint: OperatingPlanColor.amber,
                    title: "Coaching Updates isn't active",
                    message: "Your Operating Plan has no active Coaching Updates strategy, so there is no DEXA schedule to show or edit."
                )
                .accessibilityIdentifier("operatingPlan.dexa.noCoaching")
                OperatingPlanButton(title: "Open Operating Plan", style: .quiet) {
                    navigate(.operatingPlan)
                }
                .padding(.top, 22)
                .accessibilityIdentifier("operatingPlan.dexa.openOperatingPlan")
            case .failed:
                OperatingPlanHeader(eyebrow: "DEXA · Coaching Updates", title: Self.pageTitle)
                OperatingPlanFailureView(
                    title: "Couldn't load your DEXA schedule",
                    message: "Nothing was changed. Check your connection and try again.",
                    retry: { Task { await load() } }
                )
            }
        }
        .operatingPlanChrome(back: backTitle)
        .accessibilityIdentifier("operatingPlan.dexa")
        .task(id: environment.nativeAuthority) { await load() }
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(["operating-plan", "operating-plan-coaching-updates"])
            }
            await load()
        }
        .refreshesOnForegroundWhenVisible { await load() }
    }

    private func header(status: String?) -> some View {
        OperatingPlanHeader(
            eyebrow: "DEXA · Coaching Updates",
            title: Self.pageTitle,
            subtitle: "Your appointment and reminders. Completed scans live in Evidence.",
            status: status
        )
    }

    // MARK: States

    private func scheduled(_ presentation: NextDexaScanPresentation, strategyId: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Appointment")
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanEyebrow)
                    .foregroundStyle(OperatingPlanColor.fieldInk.opacity(0.8))
                Text(presentation.dateText)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanTitle)
                    .foregroundStyle(OperatingPlanColor.fieldInk)
                if let timing = presentation.timingText {
                    Text(timing)
                        .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                        .foregroundStyle(OperatingPlanColor.fieldInk.opacity(0.85))
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(OperatingPlanColor.field, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("operatingPlan.dexa.appointment")

            OperatingPlanGroupTitle("Reminders", icon: "bell.fill")
            ForEach(presentation.reminders, id: \.label) { reminder in
                OperatingPlanLine(reminder.label, reminder.isOn ? "On" : "Off",
                                  valueColor: reminder.isOn ? OperatingPlanColor.green : OperatingPlanColor.muted)
            }
            OperatingPlanLine("Upload results", presentation.uploadReminder ? "Remind me after the appointment" : "Off",
                              valueColor: presentation.uploadReminder ? OperatingPlanColor.ink : OperatingPlanColor.muted)

            if let note = presentation.preparationNote {
                OperatingPlanGroupTitle("Preparation", icon: "sparkles")
                Text(note)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                    .foregroundStyle(OperatingPlanColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("operatingPlan.dexa.preparation")
            }

            OperatingPlanGroupTitle("After the scan", icon: "doc.text.magnifyingglass")
            OperatingPlanLine(
                "DEXA Event briefing", presentation.eventBriefingEnabled ? "On" : "Off",
                detail: presentation.eventBriefingEnabled ? "Generated when the scan is confirmed in Evidence" : nil,
                valueColor: presentation.eventBriefingEnabled ? OperatingPlanColor.green : OperatingPlanColor.muted
            )

            actions(strategyId: strategyId, primaryTitle: "Edit DEXA Schedule", primaryIcon: "calendar.badge.clock")
        }
    }

    private func notScheduled(strategyId: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            OperatingPlanNote(
                icon: "calendar.badge.plus", tint: OperatingPlanColor.cyan,
                title: "No DEXA scan scheduled",
                message: "Add the date and time to get reminders and a DEXA Event briefing after the scan."
            )
            .accessibilityIdentifier("operatingPlan.dexa.notScheduled")
            if let lastScanDate {
                OperatingPlanGroupTitle("Last scan", icon: "chart.bar.doc.horizontal")
                Button { navigate(.progressStream(streamId: "dexa")) } label: {
                    OperatingPlanLine("Most recent", lastScanDate, detail: "View in Evidence · DEXA") { OperatingPlanChevron() }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("operatingPlan.dexa.lastScan")
            }
            actions(strategyId: strategyId, primaryTitle: "Schedule DEXA Scan", primaryIcon: "calendar.badge.plus")
        }
    }

    private func actions(strategyId: String, primaryTitle: String, primaryIcon: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            OperatingPlanButton(title: primaryTitle, systemImage: primaryIcon, style: .primary) {
                OperatingPlanNavigationContext.navigate(
                    .operatingPlanStrategyEdit(strategyType: "briefings", strategyId: strategyId),
                    from: Self.pageTitle, anchor: .dexa, using: onNavigate
                )
            }
            .accessibilityIdentifier("operatingPlan.dexa.edit")
            OperatingPlanButton(title: "Open Coaching Updates", style: .quiet) {
                navigate(.operatingPlanStrategy(strategyType: "briefings", strategyId: strategyId))
            }
            .accessibilityIdentifier("operatingPlan.dexa.openCoaching")
            Text("Saved together with Progress Photos in Coaching Updates — one record, one Save.")
                .physiqueOSFont(PhysiqueOSTypography.operatingPlanCaption)
                .foregroundStyle(OperatingPlanColor.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 22)
    }

    private func navigate(_ destination: AppDestination) {
        OperatingPlanNavigationContext.navigate(destination, from: Self.pageTitle, using: onNavigate)
    }

    // MARK: Load

    @MainActor
    private func load() async {
        if case .loaded = state {} else { state = .loading }
        do {
            let landing: OperatingPlanReadModel
            switch environment.nativeAuthority {
            case .sandbox:
                landing = environment.operatingPlanStore.landing
            case .founderProduction:
                guard let api = environment.operatingPlanAPI else { state = .failed; return }
                landing = try await api.fetchOperatingPlan()
            }
            guard case .found(let strategyId) = NextDexaScanResolver.coachingStrategy(in: landing) else {
                state = .noCoaching
                return
            }
            let editor: CoachingUpdatesEditorReadModel?
            switch environment.nativeAuthority {
            case .sandbox:
                editor = environment.operatingPlanStore.coachingEditor(strategyId: strategyId)
            case .founderProduction:
                editor = try await environment.coachingUpdatesAPI.fetchDetail(strategyId: strategyId)?.editor
            }
            guard let editor else { state = .noCoaching; return }
            let presentation = NextDexaScanPresentation(
                dexa: editor.dexa,
                eventBriefingEnabled: editor.dexaEventBriefingEnabled,
                today: OperatingPlanDateValues.dateKey(from: Date())
            )
            state = .loaded(strategyId: strategyId, presentation: presentation)
            if !presentation.isScheduled { await loadLastScan() }
        } catch {
            state = .failed
        }
    }

    /// Best effort: the most recent scan for the not-scheduled state. A
    /// failure only hides the row.
    @MainActor
    private func loadLastScan() async {
        guard let report = try? await environment.dexaAPI.fetchDEXAReport() else { return }
        lastScanDate = report.latestScan.map { OperatingPlanDateValues.readableDate($0.date) }
    }
}

/// Finds the one Coaching Updates strategy the Server names on the
/// Operating Plan landing. More than one distinct id is refused rather
/// than guessed.
enum NextDexaScanResolver {
    enum Resolution: Equatable { case found(String), none, ambiguous }

    static func coachingStrategy(in landing: OperatingPlanReadModel) -> Resolution {
        let ids = landing.sections.flatMap(\.items).compactMap { item -> String? in
            if case .operatingPlanStrategy(let type, let id)? = item.destination, type == "briefings" { return id }
            return nil
        }
        let distinct = Array(Set(ids))
        switch distinct.count {
        case 0: return .none
        case 1: return .found(distinct[0])
        default: return .ambiguous
        }
    }
}

/// Read-only presentation of the Coaching Updates DEXA schedule.
struct NextDexaScanPresentation: Equatable {
    struct Reminder: Equatable {
        var label: String
        var isOn: Bool
    }

    var isScheduled: Bool
    var dateText: String
    var timingText: String?
    var reminders: [Reminder]
    var uploadReminder: Bool
    var preparationNote: String?
    var eventBriefingEnabled: Bool
    /// "Fri, Oct 9 · 7:30 AM" for the Scheduled Evidence row.
    var summaryText: String
    /// "3 reminders · Upload reminder on".
    var remindersSummary: String

    init(dexa: CoachingDexaReadModel, eventBriefingEnabled: Bool, today: String) {
        let date = Self.calendarDate(dexa.plannedDate)
        isScheduled = date != nil
        self.eventBriefingEnabled = eventBriefingEnabled
        uploadReminder = dexa.uploadReminder
        let note = dexa.preparationNote.trimmingCharacters(in: .whitespacesAndNewlines)
        preparationNote = note.isEmpty ? nil : note
        reminders = [
            Reminder(label: "1 week before", isOn: dexa.reminderPreferences.contains(.weekBefore)),
            Reminder(label: "1 day before", isOn: dexa.reminderPreferences.contains(.dayBefore)),
            Reminder(label: "Morning of", isOn: dexa.reminderPreferences.contains(.morningOf)),
        ]
        let time = dexa.localTime.isEmpty ? nil : OperatingPlanSchedulePresentation.formattedLocalTime(dexa.localTime)
        if let date {
            dateText = Self.dayFormatter.string(from: date)
            let relative = Self.relativeDay(from: Self.calendarDate(today), to: date)
            timingText = [time, "Pacific Time", relative].compactMap { $0 }.joined(separator: " · ")
            summaryText = [dateText, time].compactMap { $0 }.joined(separator: " · ")
        } else {
            dateText = "Not scheduled"
            timingText = nil
            summaryText = "Not scheduled"
        }
        let count = reminders.filter(\.isOn).count
        var parts = [count == 0 ? "No reminders" : "\(count) reminder\(count == 1 ? "" : "s")"]
        if dexa.uploadReminder { parts.append("Upload reminder on") }
        remindersSummary = parts.joined(separator: " · ")
    }

    /// Date-only keys are calendar dates: parse and display in one fixed
    /// zone so the day never shifts.
    private static func calendarDate(_ key: String) -> Date? {
        guard !key.isEmpty else { return nil }
        return keyFormatter.date(from: key)
    }

    private static func relativeDay(from today: Date?, to date: Date) -> String? {
        guard let today else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let days = calendar.dateComponents([.day], from: today, to: date).day ?? 0
        switch days {
        case 0: return "Today"
        case 1: return "Tomorrow"
        case 2...: return "in \(days) days"
        default: return nil
        }
    }

    private static let keyFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "EEE, MMM d"
        return formatter
    }()
}
