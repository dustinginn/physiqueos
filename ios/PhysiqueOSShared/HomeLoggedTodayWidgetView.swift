import SwiftUI
import WidgetKit

/// The single display formatter for every Home Screen widget family and
/// state. Display only: snapshot, Server and HealthKit values keep their
/// canonical precision; only the rendered text is rounded.
enum HomeWidgetValueFormatter {
    static let missing = "—"

    /// Calories eaten: nearest whole number, locale grouping (2463.3 → "2,463").
    static func calories(_ value: Double?, locale: Locale = .autoupdatingCurrent) -> String {
        wholeNumber(value, locale: locale)
    }

    /// Protein / carbs / fat: nearest whole gram (166.7 → "167").
    static func grams(_ value: Double?, locale: Locale = .autoupdatingCurrent) -> String {
        wholeNumber(value, locale: locale)
    }

    /// Active calories: nearest whole number, locale grouping (890.1 → "890").
    static func activeCalories(_ value: Double?, locale: Locale = .autoupdatingCurrent) -> String {
        wholeNumber(value, locale: locale)
    }

    /// Weight keeps the canonical display string exactly as the app's Log
    /// presents it (one decimal, e.g. "176.1 lb"); it is never re-rounded.
    static func weight(_ weight: HomeWidgetWeightSummary?) -> String? {
        weight?.displayValue
    }

    /// Nearest whole (half away from zero), never truncation. Missing or
    /// non-finite stays missing, never "0"; a value that rounds to zero
    /// shows "0" without a sign.
    static func wholeNumber(_ value: Double?, locale: Locale) -> String {
        guard let value, value.isFinite else { return missing }
        let rounded = value.rounded(.toNearestOrAwayFromZero)
        return (rounded == 0 ? 0 : rounded).formatted(
            .number
                .precision(.fractionLength(0))
                .grouping(.automatic)
                .locale(locale)
        )
    }
}

enum HomeWidgetInteractionMetrics {
    static let refreshHitTarget: CGFloat = 44
    static let smallRefreshGlyphFrame: CGFloat = 24
    static let largeRefreshGlyphFrame: CGFloat = 28
    /// Negative inset that keeps the 44 pt square refresh target from
    /// consuming header height ((44 − 24) / 2).
    static let smallRefreshInset: CGFloat = 10
}

struct HomeLoggedTodayWidgetView: View {
    let snapshot: HomeWidgetSnapshot?
    let date: Date
    let privacyRedactedForPreview: Bool
    let familyOverrideForPreview: WidgetFamily?
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var colorScheme

    init(
        snapshot: HomeWidgetSnapshot?,
        date: Date,
        privacyRedactedForPreview: Bool = false,
        familyOverrideForPreview: WidgetFamily? = nil
    ) {
        self.snapshot = snapshot
        self.date = date
        self.privacyRedactedForPreview = privacyRedactedForPreview
        self.familyOverrideForPreview = familyOverrideForPreview
    }

    private var palette: HomeWidgetPalette { HomeWidgetPalette(colorScheme: colorScheme) }

    @ViewBuilder
    var body: some View {
        if (familyOverrideForPreview ?? family) == .systemSmall {
            smallBody
                .widgetURL(workoutDestination.url)
        } else {
            largeBody
        }
    }

    private var largeBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            largeHeader
            Divider().overlay(palette.divider).padding(.vertical, 7)
            content
                .redacted(reason: privacyRedactedForPreview ? .privacy : [])
            Spacer(minLength: 6)
            workoutAction
        }
        .containerBackground(palette.background, for: .widget)
        .widgetAccentable()
    }

    /// Founder-approved Option B (2026-10-08): Nutrition and Active side by
    /// side at equal prominence, legible P/C/F gram chips, and the iPhone
    /// Finish Workout amber Start Logger.
    private var smallBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                Text("Today")
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(palette.text)
                Spacer(minLength: 2)
                Text(compactFreshnessText)
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .foregroundStyle(freshnessIsWarning ? palette.warning : palette.secondary)
                    .lineLimit(1)
                Button(intent: RefreshHomeWidgetTotalsIntent(
                    authority: snapshot?.authority ?? "founderProduction"
                )) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(palette.refreshAccent)
                        .frame(
                            width: HomeWidgetInteractionMetrics.smallRefreshGlyphFrame,
                            height: HomeWidgetInteractionMetrics.smallRefreshGlyphFrame
                        )
                        .frame(
                            minWidth: HomeWidgetInteractionMetrics.refreshHitTarget,
                            minHeight: HomeWidgetInteractionMetrics.refreshHitTarget
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Refresh totals in PhysiqueOS")
                // The 44 pt target stays; it no longer sets the header height.
                .padding(.vertical, -HomeWidgetInteractionMetrics.smallRefreshInset)
                .padding(.trailing, -HomeWidgetInteractionMetrics.smallRefreshInset)
            }
            .frame(height: HomeWidgetInteractionMetrics.smallRefreshGlyphFrame)

            if rendersToday, let snapshot {
                VStack(alignment: .leading, spacing: 0) {
                    smallMetricColumns(nutrition: snapshot.nutrition, activity: snapshot.activity)
                        .padding(.top, 8)
                    // With today's weight the rhythm tightens by 3 pt so the
                    // square still fits its 138 pt content area.
                    smallMacroChips(snapshot.nutrition)
                        .padding(.top, snapshot.weight == nil ? 8 : 7)
                    if let weight = HomeWidgetValueFormatter.weight(snapshot.weight) {
                        smallLabel("WEIGHT  \(weight)")
                            .padding(.top, 3)
                            .accessibilityLabel("Weight \(weight)")
                    }
                }
                .privacySensitive()
                .redacted(reason: privacyRedactedForPreview ? .privacy : [])
            } else {
                VStack(alignment: .leading, spacing: 3) {
                    Text(presentationState == .waitingForToday ? "Waiting for today" : "Open app to refresh")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundStyle(palette.text)
                    Text("Prior-day totals stay hidden.")
                        .font(.system(size: 8, weight: .semibold, design: .rounded))
                        .foregroundStyle(palette.secondary)
                        .lineLimit(2)
                }
                .padding(.top, 8)
            }

            Spacer(minLength: 3)
            smallWorkoutAction
        }
        .containerBackground(palette.background, for: .widget)
        .widgetAccentable()
    }

    private var presentationState: HomeWidgetPresentationState {
        snapshot?.presentationState(at: date) ?? .unavailable
    }

    private var rendersToday: Bool {
        switch presentationState {
        case .waitingForToday, .unavailable: false
        case .fresh, .aging, .stale: true
        }
    }

    private var largeHeader: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Logged Today")
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .foregroundStyle(palette.text)
            Spacer(minLength: 8)
            Text(freshnessText)
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .foregroundStyle(freshnessIsWarning ? palette.warning : palette.secondary)
                .lineLimit(1)
            Link(destination: HomeWidgetDeepLink.refresh(
                authority: snapshot?.authority ?? "founderProduction"
            ).url) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(palette.refreshAccent)
                    .frame(
                        width: HomeWidgetInteractionMetrics.largeRefreshGlyphFrame,
                        height: HomeWidgetInteractionMetrics.largeRefreshGlyphFrame
                    )
                    .frame(
                        minWidth: HomeWidgetInteractionMetrics.refreshHitTarget,
                        minHeight: HomeWidgetInteractionMetrics.refreshHitTarget
                    )
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Refresh totals in PhysiqueOS")
        }
    }

    private func smallLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 8, weight: .bold, design: .rounded))
            .tracking(0.6)
            .foregroundStyle(palette.secondary)
            .lineLimit(1)
    }

    /// Equal 17 pt figures for calories eaten and active calories.
    private func smallMetricColumns(
        nutrition: HomeWidgetNutritionSummary?,
        activity: HomeWidgetActivitySummary?
    ) -> some View {
        HStack(alignment: .top, spacing: 0) {
            smallFigureColumn(
                label: "NUTRITION",
                value: nutrition.map { HomeWidgetValueFormatter.calories($0.calories) },
                spoken: "Nutrition"
            )
            Rectangle()
                .fill(palette.divider)
                .frame(width: 1, height: 32)
                .padding(.horizontal, 6)
                .accessibilityHidden(true)
            smallFigureColumn(
                label: "ACTIVE",
                value: activity?.activeCalories.map { HomeWidgetValueFormatter.activeCalories($0) },
                spoken: "Active"
            )
        }
    }

    private func smallFigureColumn(label: String, value: String?, spoken: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            smallLabel(label)
            if let value {
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(value)
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(palette.text)
                    Text("cal")
                        .font(.system(size: 8, weight: .bold, design: .rounded))
                        .foregroundStyle(palette.secondary)
                }
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            } else {
                Text(HomeWidgetValueFormatter.missing)
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundStyle(palette.tertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(value.map { "\(spoken) \($0) calories" } ?? "\(spoken) not logged")
    }

    @ViewBuilder
    private func smallMacroChips(_ nutrition: HomeWidgetNutritionSummary?) -> some View {
        if let nutrition {
            HStack(spacing: 4) {
                macroChip("P", nutrition.proteinG, spoken: "Protein")
                macroChip("C", nutrition.carbsG, spoken: "Carbs")
                macroChip("F", nutrition.fatG, spoken: "Fat")
            }
        } else {
            smallLabel("NOT LOGGED YET")
        }
    }

    private func macroChip(_ letter: String, _ grams: Double?, spoken: String) -> some View {
        let value = HomeWidgetValueFormatter.grams(grams)
        return HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(letter)
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundStyle(palette.secondary)
            Text(value)
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(palette.text)
            if grams != nil {
                Text("g")
                    .font(.system(size: 8, weight: .semibold, design: .rounded))
                    .foregroundStyle(palette.secondary)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .frame(maxWidth: .infinity, minHeight: 20)
        .background(palette.chip, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(grams == nil ? "\(spoken) not logged" : "\(spoken) \(value) grams")
    }

    @ViewBuilder
    private var content: some View {
        if rendersToday, let snapshot {
            VStack(spacing: 0) {
                row(icon: "figure.strengthtraining.traditional", color: palette.training, label: "Training", destination: .training(localDate: snapshot.localDate)) {
                    trainingValue(snapshot.training)
                }
                row(icon: "fork.knife", color: palette.nutrition, label: "Nutrition", destination: .nutrition(localDate: snapshot.localDate)) {
                    nutritionValue(snapshot.nutrition)
                }
                row(icon: "waveform.path.ecg", color: palette.activity, label: "Activity", destination: .activity(localDate: snapshot.localDate)) {
                    activityValue(snapshot.activity)
                }
                row(icon: "scalemass", color: palette.weight, label: "Weight", destination: .weight(localDate: snapshot.localDate)) {
                    Text(HomeWidgetValueFormatter.weight(snapshot.weight) ?? "—  Not logged today")
                        .valueStyle(present: snapshot.weight != nil, palette: palette)
                }
            }
            .privacySensitive()
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Label(waitingTitle, systemImage: "clock.arrow.circlepath")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(palette.text)
                Text(waitingDetail)
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundStyle(palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 18)
        }
    }

    private func row<Content: View>(
        icon: String,
        color: Color,
        label: String,
        destination: HomeWidgetDeepLink,
        @ViewBuilder value: () -> Content
    ) -> some View {
        Link(destination: destination.url) {
            HStack(spacing: 11) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(color)
                    .frame(width: 21)
                VStack(alignment: .leading, spacing: 2) {
                    Text(label.uppercased())
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .tracking(0.7)
                        .foregroundStyle(palette.secondary)
                    value()
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(palette.tertiary)
            }
            .contentShape(Rectangle())
            .frame(minHeight: 47)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func trainingValue(_ training: HomeWidgetTrainingSummary?) -> some View {
        if let training, training.isPresent {
            let lines = training.lines.isEmpty ? [training.summary] : Array(training.lines.prefix(2))
            VStack(alignment: .leading, spacing: 1) {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    Text(line)
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundStyle(palette.text)
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)
                }
            }
        } else {
            Text("—  Nothing logged yet").valueStyle(present: false, palette: palette)
        }
    }

    @ViewBuilder
    private func nutritionValue(_ nutrition: HomeWidgetNutritionSummary?) -> some View {
        if let nutrition {
            HStack(spacing: 9) {
                metric(HomeWidgetValueFormatter.calories(nutrition.calories), unit: "cal")
                metric(HomeWidgetValueFormatter.grams(nutrition.proteinG), unit: "P")
                metric(HomeWidgetValueFormatter.grams(nutrition.carbsG), unit: "C")
                metric(HomeWidgetValueFormatter.grams(nutrition.fatG), unit: "F")
            }
        } else {
            Text("—  Nothing logged yet").valueStyle(present: false, palette: palette)
        }
    }

    @ViewBuilder
    private func activityValue(_ activity: HomeWidgetActivitySummary?) -> some View {
        if let activity, let calories = activity.activeCalories {
            Text("\(HomeWidgetValueFormatter.activeCalories(calories)) active cal\(activity.isPartialDay ? " so far" : "")")
                .valueStyle(present: true, palette: palette)
        } else {
            Text("—  Nothing logged yet").valueStyle(present: false, palette: palette)
        }
    }

    private func metric(_ value: String, unit: String) -> some View {
        HStack(spacing: 2) {
            Text(value).fontWeight(.bold)
            Text(unit).foregroundStyle(palette.secondary)
        }
        .font(.system(size: 12, weight: .semibold, design: .rounded))
        .foregroundStyle(palette.text)
        .lineLimit(1)
    }

    private var workoutAction: some View {
        let active = snapshot?.workout.state == .active
        return Link(destination: workoutDestination.url) {
            HStack(spacing: 9) {
                Image(systemName: active ? "arrow.clockwise.circle.fill" : "plus.circle.fill")
                    .font(.system(size: 17, weight: .semibold))
                VStack(alignment: .leading, spacing: 1) {
                    Text(active ? "Resume Workout" : "Start Workout Logger")
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                    if active, let workout = snapshot?.workout {
                        Text(workoutProgress(workout))
                            .font(.system(size: 10, weight: .semibold, design: .rounded))
                            .lineLimit(1)
                            .privacySensitive()
                    }
                }
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 11, weight: .bold))
            }
            .foregroundStyle(palette.onWorkoutAction)
            .padding(.horizontal, 13)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(palette.workoutAction, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .accessibilityLabel(active ? "Resume Workout" : "Start Workout Logger")
    }

    private var smallWorkoutAction: some View {
        let active = snapshot?.workout.state == .active
        return HStack(spacing: 5) {
            Image(systemName: active ? "arrow.clockwise.circle.fill" : "plus.circle.fill")
                .font(.system(size: 11, weight: .semibold))
            Text(active ? "Resume Workout" : "Start Logger")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.82)
            Spacer(minLength: 0)
            Image(systemName: "arrow.up.right")
                .font(.system(size: 8, weight: .bold))
        }
        .foregroundStyle(palette.onWorkoutAction)
        .padding(.horizontal, 9)
        .frame(maxWidth: .infinity, minHeight: 30)
        .background(palette.workoutAction, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(active ? "Resume Workout" : "Start Workout Logger")
    }

    private var workoutDestination: HomeWidgetDeepLink {
        if snapshot?.workout.state == .active,
           let session = snapshot?.workout.sessionId,
           let authority = snapshot?.authority {
            return .resumeWorkout(sessionId: session, authority: authority)
        }
        return .startWorkout(authority: snapshot?.authority ?? "founderProduction")
    }

    private var freshnessText: String {
        switch presentationState {
        case .unavailable: return "Open PhysiqueOS to refresh"
        case .waitingForToday: return "Waiting for today"
        case .fresh(let age): return age < 2 ? "Updated now" : "Updated \(age)m ago"
        case .aging(let age): return "Updated \(age)m ago"
        case .stale(let age, let offline):
            if offline { return age.map { "Offline · \($0 / 60)h ago" } ?? "Offline" }
            return age.map { "May be outdated · \($0 / 60)h" } ?? "May be outdated"
        }
    }

    private var freshnessIsWarning: Bool {
        if case .stale = presentationState { return true }
        return false
    }

    private var compactFreshnessText: String {
        switch presentationState {
        case .unavailable: return "Refresh"
        case .waitingForToday: return "Waiting"
        case .fresh(let age), .aging(let age): return age < 2 ? "Now" : age < 60 ? "\(age)m" : "\(age / 60)h"
        case .stale(let age, let offline):
            if offline { return age.map { "Offline \($0 / 60)h" } ?? "Offline" }
            return age.map { "Stale \($0 / 60)h" } ?? "Stale"
        }
    }

    private var waitingTitle: String {
        presentationState == .waitingForToday ? "Waiting for today’s totals" : "Open PhysiqueOS to refresh"
    }

    private var waitingDetail: String {
        presentationState == .waitingForToday
            ? "Yesterday’s Nutrition, Activity, and Weight are intentionally hidden."
            : "Today’s canonical Logged Today summary is not available yet."
    }

    private func workoutProgress(_ workout: HomeWidgetWorkoutSummary) -> String {
        let label = workout.label ?? "Workout in progress"
        guard let completed = workout.completedSets, let total = workout.totalSets, total > 0 else { return label }
        return "\(label) · \(completed)/\(total) sets"
    }
}

private extension View {
    func valueStyle(present: Bool, palette: HomeWidgetPalette) -> some View {
        font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundStyle(present ? palette.text : palette.tertiary)
            .lineLimit(1)
            .minimumScaleFactor(0.82)
    }
}

/// Widget-owned paired tokens. WidgetKit supplies its own environment and
/// does not inherit the iPhone app's device-local preference.
struct HomeWidgetPalette {
    let background: Color
    let text: Color
    let secondary: Color
    let tertiary: Color
    let divider: Color
    let actionAccent: Color
    let warning: Color
    let training: Color
    let nutrition: Color
    let activity: Color
    let weight: Color
    let chip: Color
    /// Start Logger / Resume Workout: the iPhone Finish Workout amber
    /// (`WorkoutActivityPrimaryAction`, the same token the Watch and Live
    /// Activity use) with the iPhone execution ink.
    let workoutAction: Color
    let onWorkoutAction: Color

    /// Refresh keeps the widget's teal action accent (Founder: no recolor of
    /// refresh/status yet); only the workout CTA moved to amber.
    var refreshAccent: Color { actionAccent }

    init(colorScheme: ColorScheme) {
        if colorScheme == .dark {
            background = Color(hex: 0x06131E)
            text = Color(hex: 0xF5F8F7)
            secondary = Color(hex: 0x91A6AE)
            tertiary = Color(hex: 0x647A84)
            divider = Color(hex: 0x203441)
            actionAccent = Color(hex: 0x20BDB2)
            warning = Color(hex: 0xF3BA49)
            training = Color(hex: 0x9F7CFF)
            nutrition = Color(hex: 0x4EE09A)
            activity = Color(hex: 0xF3BA49)
            weight = Color(hex: 0x40C7D7)
            chip = Color(hex: 0x203441, alpha: 0.55)
            workoutAction = Color(hex: WorkoutActivityPrimaryAction.darkHex)
        } else {
            background = Color(hex: 0xEEF1EB)
            text = Color(hex: 0x0A1C29)
            secondary = Color(hex: 0x60737C)
            tertiary = Color(hex: 0x7A8B91)
            divider = Color(hex: 0xCAD4CF)
            actionAccent = Color(hex: 0x0B817F)
            warning = Color(hex: 0xB47510)
            training = Color(hex: 0x7255DC)
            nutrition = Color(hex: 0x0C9363)
            activity = Color(hex: 0xB47510)
            weight = Color(hex: 0x0E8CA7)
            chip = Color(hex: 0xCAD4CF, alpha: 0.55)
            workoutAction = Color(hex: WorkoutActivityPrimaryAction.mineralLightHex)
        }
        onWorkoutAction = Color(hex: WorkoutActivityPrimaryAction.foregroundHex)
    }
}

private extension Color {
    init(hex: UInt32) {
        self.init(hex: hex, alpha: 1)
    }

    init(hex: UInt32, alpha: Double) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}
