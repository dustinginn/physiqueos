import SwiftUI
import WidgetKit

struct HomeLoggedTodayWidgetView: View {
    let snapshot: HomeWidgetSnapshot?
    let date: Date
    let privacyRedactedForPreview: Bool
    let familyOverrideForPreview: WidgetFamily?
    @Environment(\.widgetFamily) private var family

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

    private let accent = Color(red: 0.55, green: 0.55, blue: 1.0)
    private let background = Color(red: 0.035, green: 0.055, blue: 0.095)
    private let secondary = Color.white.opacity(0.62)

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
            Divider().overlay(Color.white.opacity(0.10)).padding(.vertical, 7)
            content
                .redacted(reason: privacyRedactedForPreview ? .privacy : [])
            Spacer(minLength: 6)
            workoutAction
        }
        .containerBackground(background, for: .widget)
        .widgetAccentable()
    }

    private var smallBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                Text("Today")
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                Spacer(minLength: 2)
                Text(compactFreshnessText)
                    .font(.system(size: 8, weight: .bold, design: .rounded))
                    .foregroundStyle(freshnessIsWarning ? Color.orange : secondary)
                    .lineLimit(1)
                Button(intent: RefreshHomeWidgetTotalsIntent(
                    authority: snapshot?.authority ?? "founderProduction"
                )) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(accent)
                        .frame(width: 24, height: 24)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Refresh totals in PhysiqueOS")
            }

            if rendersToday, let snapshot {
                VStack(alignment: .leading, spacing: 5) {
                    smallNutrition(snapshot.nutrition)
                    Divider().overlay(Color.white.opacity(0.10))
                    smallActivityAndWeight(activity: snapshot.activity, weight: snapshot.weight)
                }
                .privacySensitive()
                .redacted(reason: privacyRedactedForPreview ? .privacy : [])
            } else {
                VStack(alignment: .leading, spacing: 3) {
                    Text(presentationState == .waitingForToday ? "Waiting for today" : "Open app to refresh")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                    Text("Prior-day totals stay hidden.")
                        .font(.system(size: 8, weight: .semibold, design: .rounded))
                        .foregroundStyle(secondary)
                        .lineLimit(2)
                }
                .padding(.top, 8)
            }

            Spacer(minLength: 3)
            smallWorkoutAction
        }
        .containerBackground(background, for: .widget)
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
                .foregroundStyle(.white)
            Spacer(minLength: 8)
            Text(freshnessText)
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .foregroundStyle(freshnessIsWarning ? Color.orange : secondary)
                .lineLimit(1)
            Link(destination: HomeWidgetDeepLink.refresh(
                authority: snapshot?.authority ?? "founderProduction"
            ).url) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(accent)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Refresh totals in PhysiqueOS")
        }
    }

    private func smallNutrition(_ nutrition: HomeWidgetNutritionSummary?) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("NUTRITION")
                .font(.system(size: 7, weight: .bold, design: .rounded))
                .tracking(0.5)
                .foregroundStyle(secondary)
            if let nutrition {
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(number(nutrition.calories))
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                    Text("cal")
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .foregroundStyle(secondary)
                }
                .foregroundStyle(.white)
                Text("P \(number(nutrition.proteinG))  C \(number(nutrition.carbsG))  F \(number(nutrition.fatG))")
                    .font(.system(size: 8, weight: .semibold, design: .rounded))
                    .foregroundStyle(secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            } else {
                Text("—  Not logged")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundStyle(secondary)
            }
        }
    }

    private func smallActivityAndWeight(
        activity: HomeWidgetActivitySummary?,
        weight: HomeWidgetWeightSummary?
    ) -> some View {
        HStack(alignment: .top, spacing: 7) {
            smallMetric(
                label: "ACTIVE",
                value: activity?.activeCalories.map { "\(number($0)) cal" } ?? "—"
            )
            if let weight {
                Divider().overlay(Color.white.opacity(0.10)).frame(height: 25)
                smallMetric(label: "WEIGHT", value: weight.displayValue)
            }
        }
    }

    private func smallMetric(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.system(size: 7, weight: .bold, design: .rounded))
                .tracking(0.4)
                .foregroundStyle(secondary)
            Text(value)
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var content: some View {
        if rendersToday, let snapshot {
            VStack(spacing: 0) {
                row(icon: "figure.strengthtraining.traditional", label: "Training", destination: .training(localDate: snapshot.localDate)) {
                    trainingValue(snapshot.training)
                }
                row(icon: "fork.knife", label: "Nutrition", destination: .nutrition(localDate: snapshot.localDate)) {
                    nutritionValue(snapshot.nutrition)
                }
                row(icon: "waveform.path.ecg", label: "Activity", destination: .activity(localDate: snapshot.localDate)) {
                    activityValue(snapshot.activity)
                }
                row(icon: "scalemass", label: "Weight", destination: .weight(localDate: snapshot.localDate)) {
                    Text(snapshot.weight?.displayValue ?? "—  Not logged today")
                        .valueStyle(present: snapshot.weight != nil)
                }
            }
            .privacySensitive()
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Label(waitingTitle, systemImage: "clock.arrow.circlepath")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
                Text(waitingDetail)
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundStyle(secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 18)
        }
    }

    private func row<Content: View>(
        icon: String,
        label: String,
        destination: HomeWidgetDeepLink,
        @ViewBuilder value: () -> Content
    ) -> some View {
        Link(destination: destination.url) {
            HStack(spacing: 11) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(accent)
                    .frame(width: 21)
                VStack(alignment: .leading, spacing: 2) {
                    Text(label.uppercased())
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .tracking(0.7)
                        .foregroundStyle(secondary)
                    value()
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Color.white.opacity(0.30))
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
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)
                }
            }
        } else {
            Text("—  Nothing logged yet").valueStyle(present: false)
        }
    }

    @ViewBuilder
    private func nutritionValue(_ nutrition: HomeWidgetNutritionSummary?) -> some View {
        if let nutrition {
            HStack(spacing: 9) {
                metric(number(nutrition.calories), unit: "cal")
                metric(number(nutrition.proteinG), unit: "P")
                metric(number(nutrition.carbsG), unit: "C")
                metric(number(nutrition.fatG), unit: "F")
            }
        } else {
            Text("—  Nothing logged yet").valueStyle(present: false)
        }
    }

    @ViewBuilder
    private func activityValue(_ activity: HomeWidgetActivitySummary?) -> some View {
        if let activity, let calories = activity.activeCalories {
            Text("\(number(calories)) active cal\(activity.isPartialDay ? " so far" : "")")
                .valueStyle(present: true)
        } else {
            Text("—  Nothing logged yet").valueStyle(present: false)
        }
    }

    private func metric(_ value: String, unit: String) -> some View {
        HStack(spacing: 2) {
            Text(value).fontWeight(.bold)
            Text(unit).foregroundStyle(secondary)
        }
        .font(.system(size: 12, weight: .semibold, design: .rounded))
        .foregroundStyle(.white)
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
            .foregroundStyle(.white)
            .padding(.horizontal, 13)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(accent.opacity(0.88), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .accessibilityLabel(active ? "Resume Workout" : "Start Workout Logger")
    }

    private var smallWorkoutAction: some View {
        let active = snapshot?.workout.state == .active
        return HStack(spacing: 5) {
            Image(systemName: active ? "arrow.clockwise.circle.fill" : "plus.circle.fill")
                .font(.system(size: 11, weight: .semibold))
            Text(active ? "Resume Workout" : "Start Logger")
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.82)
            Spacer(minLength: 0)
            Image(systemName: "arrow.up.right")
                .font(.system(size: 8, weight: .bold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, minHeight: 30)
        .background(accent.opacity(0.88), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
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

    private func number(_ value: Double?) -> String {
        guard let value else { return "—" }
        return value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }
}

private extension View {
    func valueStyle(present: Bool) -> some View {
        font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundStyle(present ? Color.white : Color.white.opacity(0.48))
            .lineLimit(1)
            .minimumScaleFactor(0.82)
    }
}
