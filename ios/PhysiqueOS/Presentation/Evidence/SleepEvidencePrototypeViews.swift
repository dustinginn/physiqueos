import SwiftUI

// NON-SHIPPING Sleep Evidence prototype screens. Reachable only through
// `SleepEvidencePrototype.isActive` (DEBUG + launch argument + Sandbox).

private extension View {
    func sleepPrototypeChrome(backLabel: String) -> some View {
        modifier(SleepPrototypeChrome(backLabel: backLabel))
    }
}

private struct SleepPrototypeChrome: ViewModifier {
    let backLabel: String
    @Environment(\.dismiss) private var dismiss

    func body(content: Content) -> some View {
        content
            .physiqueOSScrollBottomClearance()
            .background(PhysiqueOSTheme.background)
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .restoresInteractivePopGesture()
            .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { dismiss() } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "arrow.left").font(.system(size: 13, weight: .semibold))
                            Text(backLabel).physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        }
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
            }
    }
}

private struct SleepScreenHeader: View {
    let eyebrow: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "bed.double.fill")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.sleepTotal)
                .frame(width: 48, height: 48)
                .background(PhysiqueOSTheme.sleepTotal.opacity(0.16))
                .clipShape(Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(eyebrow)
                    .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(title)
                    .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(subtitle)
                    .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct SleepStatTile: View {
    let label: String
    let value: String
    var detail: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .lineLimit(1)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            if let detail {
                Text(detail)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                    .lineLimit(1)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }
}

private struct SleepStatusTag: View {
    let text: String
    let systemImage: String

    var body: some View {
        Label(text, systemImage: systemImage)
            .labelStyle(.titleAndIcon)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(PhysiqueOSTheme.textSecondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(PhysiqueOSTheme.surfaceMuted)
            .clipShape(Capsule())
    }
}

private func nightDestination(_ night: SleepPrototypeNight) -> AppDestination {
    .progressStream(streamId: SleepEvidencePrototype.nightStreamPrefix + night.sleepDay)
}

private func windowText(_ night: SleepPrototypeNight) -> String {
    "\(SleepFormat.clock(night.start, in: night.timeZone)) – \(SleepFormat.clock(night.end, in: night.timeZone))"
}

private let prototypeFootnote = "Prototype preview · synthetic data"

// MARK: - Night row

struct SleepNightRow: View {
    let night: SleepPrototypeNight

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(SleepFormat.wakeDate(night.sleepDay))
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    if night.windowOpen {
                        Text("Updating")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(PhysiqueOSTheme.sleepTotal)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(PhysiqueOSTheme.sleepTotal.opacity(0.14))
                            .clipShape(Capsule())
                    }
                }
                HStack(spacing: 4) {
                    Text(windowText(night))
                    if night.timeZoneInferred {
                        Image(systemName: "circle.dashed").font(.system(size: 9, weight: .bold))
                        Text(SleepFormat.zoneAbbreviation(night.timeZone, at: night.end))
                    }
                }
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if !night.additionalSleep.isEmpty {
                    Text("+ \(SleepFormat.duration(night.additionalSleep.reduce(0) { $0 + $1.asleepSeconds })) additional sleep")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
            Spacer(minLength: 8)
            Text(SleepFormat.duration(night.asleepSeconds))
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textMuted)
        }
        .padding(12)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(SleepFormat.wakeDate(night.sleepDay, style: "EEEE, MMMM d")). \(SleepFormat.spokenDuration(night.asleepSeconds)) asleep, \(windowText(night))\(night.timeZoneInferred ? ". Time zone inferred" : "")\(night.windowOpen ? ". Still updating" : "")")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("sleep.night.\(night.sleepDay)")
    }
}

private struct SleepNightListSheet: View {
    let title: String
    let nights: [SleepPrototypeNight]
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(nights) { night in
                        NavigationLink(value: nightDestination(night)) { SleepNightRow(night: night) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
            .background(PhysiqueOSTheme.background)
            .navigationDestination(for: AppDestination.self) { destination in
                if case .progressStream(let streamId) = destination, streamId.hasPrefix(SleepEvidencePrototype.nightStreamPrefix) {
                    SleepNightPrototypeView(sleepDay: String(streamId.dropFirst(SleepEvidencePrototype.nightStreamPrefix.count)))
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .preferredColorScheme(.dark)
    }
}

// MARK: - Recovery landing

struct RecoverySleepPrototypeView: View {
    private let fixture = SleepPrototypeFixture.shared
    @State private var selectedDay: String?
    @State private var showsAllNights = false

    private var recent14: [SleepPrototypeNight] { Array(fixture.nights.prefix(14)) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SleepScreenHeader(eyebrow: "Evidence Report", title: "Recovery", subtitle: "Sleep from Apple Health")
                lastNightCard
                sleepChartCard
                sleepWindowCard
                recentNightsCard
                dataSourcesCard
                Text(prototypeFootnote)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
        }
        .sleepPrototypeChrome(backLabel: "Evidence Hub")
        .sheet(isPresented: $showsAllNights) { SleepNightListSheet(title: "All Nights", nights: fixture.nights) }
        .accessibilityIdentifier("sleep.recovery.landing")
    }

    private var lastNightCard: some View {
        let night = fixture.lastNight
        let average = fixture.trailingAverageSeconds(endingAt: 0)
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Last Night") {
                    Text(SleepFormat.wakeDate(night.sleepDay))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                NavigationLink(value: nightDestination(night)) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(SleepFormat.duration(night.asleepSeconds))
                                .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text("asleep")
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(PhysiqueOSTheme.accent)
                        }
                        Text(windowText(night))
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        Divider().overlay(PhysiqueOSTheme.divider)
                        HStack {
                            Text("7-night average")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            Text(average.map(SleepFormat.duration) ?? "After 3 nights")
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Spacer()
                            Text("7 of 7 nights")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                        }
                        if night.windowOpen {
                            SleepStatusTag(text: "Still updating from Apple Health", systemImage: "clock.arrow.circlepath")
                        }
                    }
                    .padding(12)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("sleep.lastNight")
            }
        }
    }

    private var sleepChartCard: some View {
        let last7 = fixture.trailingAverageSeconds(endingAt: 0)
        let prior7 = fixture.trailingAverageSeconds(endingAt: 7)
        let selected = selectedDay.flatMap(fixture.night)
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Sleep") {
                    NavigationLink(value: AppDestination.progressStream(streamId: SleepEvidencePrototype.trendsStreamId)) {
                        TrainingCompactActionLabel(label: "See trends")
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("sleep.trends")
                }
                HStack(spacing: 10) {
                    legendSwatch(PhysiqueOSTheme.sleepTotal, "Nightly total")
                    legendDash("7-night average")
                    Spacer()
                    Text("14 nights")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                SleepTotalChart(nights: recent14, fixture: fixture, selectedDay: $selectedDay)
                if let selected {
                    NavigationLink(value: nightDestination(selected)) {
                        HStack {
                            Text("\(SleepFormat.wakeDate(selected.sleepDay)) · \(SleepFormat.duration(selected.asleepSeconds)) asleep")
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Spacer()
                            TrainingCompactActionLabel(label: "Open night")
                        }
                        .padding(10)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                } else {
                    HStack(spacing: 8) {
                        SleepStatTile(label: "Last 7 nights", value: last7.map(SleepFormat.duration) ?? "–", detail: "average")
                        SleepStatTile(label: "Prior 7 nights", value: prior7.map(SleepFormat.duration) ?? "–", detail: "average")
                    }
                }
            }
        }
    }

    private var sleepWindowCard: some View {
        let stats = SleepWindowStats(nights: recent14)
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Sleep Window") {
                    Text("14 nights")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                SleepWindowChart(nights: recent14)
                HStack(spacing: 8) {
                    SleepStatTile(label: "Typical window", value: "\(SleepFormat.clockFromAxis(stats.medianStart)) – \(SleepFormat.clockFromAxis(stats.medianEnd))")
                }
                HStack(spacing: 8) {
                    SleepStatTile(label: "Fell asleep", value: "within ±\(stats.startSpreadMinutes)m")
                    SleepStatTile(label: "Woke up", value: "within ±\(stats.endSpreadMinutes)m")
                }
                HStack(spacing: 6) {
                    Image(systemName: "circle.dashed").font(.system(size: 10, weight: .bold))
                    Text("Faded nights use a time zone inferred at sync.")
                }
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
    }

    private var recentNightsCard: some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Recent Nights") {
                    Button { showsAllNights = true } label: { TrainingCompactActionLabel(label: "Show All") }
                        .buttonStyle(.plain)
                }
                VStack(spacing: 8) {
                    ForEach(fixture.nights.prefix(3)) { night in
                        NavigationLink(value: nightDestination(night)) { SleepNightRow(night: night) }
                            .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var dataSourcesCard: some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Data Sources")
                VStack(spacing: 8) {
                    sourceRow("Oura", detail: "via Apple Health", status: "Preferred", emphasized: true)
                    sourceRow("Apple Watch", detail: "last 30 nights", status: "Not recorded", emphasized: false)
                    sourceRow("Entered in Health", detail: "last 30 nights", status: "None", emphasized: false)
                }
                Text("One source is counted per night, so nothing is double counted.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
    }

    private func sourceRow(_ name: String, detail: String, status: String, emphasized: Bool) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(detail)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            Spacer()
            Text(status)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(emphasized ? PhysiqueOSTheme.sleepTotal : PhysiqueOSTheme.textMuted)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(emphasized ? PhysiqueOSTheme.sleepTotal.opacity(0.14) : PhysiqueOSTheme.surfaceElevated)
                .clipShape(Capsule())
        }
        .padding(10)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

private func legendSwatch(_ color: Color, _ label: String) -> some View {
    HStack(spacing: 4) {
        RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 8)
        Text(label)
    }
    .font(.system(size: 10, weight: .semibold))
    .foregroundStyle(PhysiqueOSTheme.textMuted)
}

private func legendDash(_ label: String) -> some View {
    HStack(spacing: 4) {
        Path { path in path.move(to: .init(x: 0, y: 4)); path.addLine(to: .init(x: 14, y: 4)) }
            .stroke(PhysiqueOSTheme.textPrimary.opacity(0.72), style: StrokeStyle(lineWidth: 1.6, dash: [4, 3]))
            .frame(width: 14, height: 8)
        Text(label)
    }
    .font(.system(size: 10, weight: .semibold))
    .foregroundStyle(PhysiqueOSTheme.textMuted)
}

// MARK: - Sleep Trends

struct SleepTrendsPrototypeView: View {
    enum Range: String, CaseIterable, Identifiable {
        case twoWeeks = "2W", oneMonth = "1M", threeMonths = "3M", all = "All"
        var id: String { rawValue }
        var nightLimit: Int { self == .twoWeeks ? 14 : 30 }
    }

    private let fixture = SleepPrototypeFixture.shared
    @State private var range: Range = .oneMonth
    @State private var selectedDay: String? = SleepPrototypeFixture.shared.lastNight.sleepDay
    @State private var showsStageMix = false
    @State private var showsAllNights = false

    private var nights: [SleepPrototypeNight] { Array(fixture.nights.prefix(range.nightLimit)) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SleepScreenHeader(eyebrow: "Recovery", title: "Sleep Trends", subtitle: "Inspect nights over time")
                rangeSelector
                totalCard
                windowCard
                continuityCard
                stageMixCard
                allNightsCard
                Text(prototypeFootnote)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
        }
        .sleepPrototypeChrome(backLabel: "Recovery")
        .sheet(isPresented: $showsAllNights) { SleepNightListSheet(title: "All Nights", nights: fixture.nights) }
        .accessibilityIdentifier("sleep.trends.screen")
    }

    private var rangeSelector: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                ForEach(Range.allCases) { option in
                    Button { range = option } label: {
                        Text(option.rawValue)
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(range == option ? PhysiqueOSTheme.accent : PhysiqueOSTheme.textMuted)
                            .frame(maxWidth: .infinity, minHeight: 34)
                            .background(range == option ? PhysiqueOSTheme.surfaceElevated : Color.clear)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(4)
            .background(PhysiqueOSTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .accessibilityLabel("Sleep trends date range")
            if range == .threeMonths || range == .all {
                Text("\(fixture.nights.count) nights available")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
    }

    private var totalCard: some View {
        let average = nights.reduce(0) { $0 + $1.asleepSeconds } / max(1, nights.count)
        let selected = selectedDay.flatMap(fixture.night)
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Total Sleep") {
                    Text("avg \(SleepFormat.duration(average))")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                HStack(spacing: 10) {
                    legendSwatch(PhysiqueOSTheme.sleepTotal, "Nightly total")
                    legendDash("7-night average")
                }
                SleepTotalChart(nights: nights, fixture: fixture, selectedDay: $selectedDay, height: 190)
                if let selected, let index = fixture.nights.firstIndex(of: selected) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Selected Night")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        HStack(spacing: 8) {
                            SleepStatTile(label: SleepFormat.wakeDate(selected.sleepDay), value: SleepFormat.duration(selected.asleepSeconds), detail: "asleep")
                            SleepStatTile(label: "7-night average", value: fixture.trailingAverageSeconds(endingAt: index).map(SleepFormat.duration) ?? "–", detail: "through this night")
                        }
                    }
                }
            }
        }
    }

    private var windowCard: some View {
        let stats = SleepWindowStats(nights: nights)
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Sleep Window") {
                    Text("\(SleepFormat.clockFromAxis(stats.medianStart)) – \(SleepFormat.clockFromAxis(stats.medianEnd))")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                SleepWindowChart(nights: nights, rowHeight: nights.count > 14 ? 11 : 13)
                Text("Fell asleep within ±\(stats.startSpreadMinutes)m · woke within ±\(stats.endSpreadMinutes)m of the typical window.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
    }

    private var continuityCard: some View {
        let pending = nights.filter { $0.stageStatus == .pendingCorrection }.count
        return CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Continuity")
                SleepContinuityChart(nights: nights)
                if pending > 0 {
                    Text("\(pending) night\(pending == 1 ? " is" : "s are") being recalculated and shown as a gap.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
        }
    }

    private var stageMixCard: some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                Button { withAnimation(.easeInOut(duration: 0.2)) { showsStageMix.toggle() } } label: {
                    HStack {
                        Text("Stage Mix")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Spacer()
                        Text(showsStageMix ? "Hide" : "Show stage mix")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.accent)
                        Image(systemName: showsStageMix ? "chevron.up" : "chevron.down")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(PhysiqueOSTheme.accent)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("sleep.stageMix.toggle")
                if showsStageMix {
                    SleepStageMixChart(nights: nights)
                }
                Text("Stage estimates come from your sleep source and vary between devices.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
    }

    private var allNightsCard: some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "All Nights") {
                    Button { showsAllNights = true } label: { TrainingCompactActionLabel(label: "Show All") }
                        .buttonStyle(.plain)
                }
                VStack(spacing: 8) {
                    ForEach(nights.prefix(3)) { night in
                        NavigationLink(value: nightDestination(night)) { SleepNightRow(night: night) }
                            .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

// MARK: - Night detail

struct SleepNightPrototypeView: View {
    let sleepDay: String
    private let fixture = SleepPrototypeFixture.shared
    @State private var showsSourceDetails = false

    var body: some View {
        ScrollView {
            if let night = fixture.night(sleepDay) {
                VStack(alignment: .leading, spacing: 24) {
                    header(night)
                    timelineCard(night)
                    stagesCard(night)
                    continuityCard(night)
                    timeInBedCard(night)
                    if !night.additionalSleep.isEmpty { additionalSleepCard(night) }
                    sourceCard(night)
                    Text(prototypeFootnote)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                        .frame(maxWidth: .infinity)
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
            } else {
                Text("No sleep was recorded for this night.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 300)
            }
        }
        .sleepPrototypeChrome(backLabel: "Recovery")
        .accessibilityIdentifier("sleep.night.screen")
    }

    private func header(_ night: SleepPrototypeNight) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Night of \(SleepFormat.wakeDate(night.sleepDay, style: "EEE, MMM d"))")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(SleepFormat.duration(night.asleepSeconds))
                    .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("asleep")
                    .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            Text("\(windowText(night)) · \(SleepFormat.zoneAbbreviation(night.timeZone, at: night.end))")
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            HStack(spacing: 6) {
                if night.windowOpen {
                    SleepStatusTag(text: "Still updating until \(SleepFormat.clock(windowCloses(night), in: night.timeZone))", systemImage: "clock.arrow.circlepath")
                }
                if night.timeZoneInferred {
                    SleepStatusTag(text: "Time zone inferred", systemImage: "circle.dashed")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func windowCloses(_ night: SleepPrototypeNight) -> Date {
        night.calendar.date(from: SleepFormat.components(of: night.sleepDay))!.addingTimeInterval(18 * 3600)
    }

    private func timelineCard(_ night: SleepPrototypeNight) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Timeline")
                if night.stageStatus == .available {
                    SleepHypnogramView(night: night)
                } else {
                    SleepTimelinePendingView(night: night)
                }
            }
        }
    }

    private func stagesCard(_ night: SleepPrototypeNight) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Stages")
                switch night.stageStatus {
                case .available:
                    SleepStageBar(night: night)
                    VStack(spacing: 8) {
                        ForEach([SleepStage.deep, .core, .rem]) { stage in
                            HStack {
                                RoundedRectangle(cornerRadius: 2).fill(PhysiqueOSTheme.sleepColor(stage)).frame(width: 10, height: 10)
                                Text(stage.label)
                                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                Spacer()
                                Text(SleepFormat.duration(night.seconds(stage)))
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                        }
                        Divider().overlay(PhysiqueOSTheme.divider)
                        HStack {
                            RoundedRectangle(cornerRadius: 2).fill(PhysiqueOSTheme.sleepAwake).frame(width: 10, height: 10)
                            Text("Awake in sleep window")
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            Spacer()
                            Text(SleepFormat.duration(night.awakeSeconds))
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        }
                    }
                    Text("Stage estimates come from your sleep source and vary between devices. Core is shown as Light in some apps.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                case .pendingCorrection:
                    SleepRecalculatingNote(text: "Total sleep and timing are final. Stage and awake minutes will appear once this night is recalculated.")
                case .absent:
                    Text("Stage detail is not available from this source for this night.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    private func continuityCard(_ night: SleepPrototypeNight) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Continuity")
                if night.stageStatus == .available {
                    HStack(spacing: 8) {
                        SleepStatTile(label: "Longest continuous", value: SleepFormat.duration(night.longestAsleepStretchSeconds), detail: "asleep")
                        SleepStatTile(label: "Awake in window", value: SleepFormat.duration(night.awakeSeconds), detail: "between sleep")
                    }
                } else {
                    SleepRecalculatingNote(text: "Continuity uses awake time, which is recalculated with stages.")
                }
            }
        }
    }

    private func timeInBedCard(_ night: SleepPrototypeNight) -> some View {
        CardContainer {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Time in Bed")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text("In bed \(SleepFormat.clock(night.inBedStart, in: night.timeZone)) – \(SleepFormat.clock(night.inBedEnd, in: night.timeZone))")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                Spacer()
                Text(SleepFormat.duration(night.inBedSeconds))
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
            }
        }
    }

    private func additionalSleepCard(_ night: SleepPrototypeNight) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                TrainingSectionHeaderView(title: "Additional Sleep")
                ForEach(night.additionalSleep) { episode in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(SleepFormat.clock(episode.start, in: night.timeZone)) – \(SleepFormat.clock(episode.end, in: night.timeZone))")
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text(episode.sourceLabel)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                        }
                        Spacer()
                        Text(SleepFormat.duration(episode.asleepSeconds))
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    }
                    .padding(10)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                Text("Total including additional sleep \(SleepFormat.duration(night.totalIncludingAdditionalSeconds))")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private func sourceCard(_ night: SleepPrototypeNight) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                Button { withAnimation(.easeInOut(duration: 0.2)) { showsSourceDetails.toggle() } } label: {
                    HStack {
                        Text("Source & Data")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Spacer()
                        Image(systemName: showsSourceDetails ? "chevron.up" : "chevron.down")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(PhysiqueOSTheme.accent)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("sleep.sourceData.toggle")
                Text("Counted from \(fixture.primarySourceLabel) (via Apple Health)")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if showsSourceDetails {
                    VStack(spacing: 0) {
                        detailRow("Source preference", "Preferred source applied")
                        detailRow("Also recorded", "No other source this night")
                        detailRow("Time zone", "\(SleepFormat.zoneAbbreviation(night.timeZone, at: night.end))\(night.timeZoneInferred ? " · inferred at sync" : " · from sample")")
                        detailRow("Stage detail", night.stageStatus == .available ? "Available" : "Being recalculated")
                        detailRow("Last updated", lastUpdatedText(night))
                        detailRow("Calculation", night.algorithmVersion, last: true)
                    }
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    if night.timeZoneInferred {
                        Text("This night's time zone was inferred from the phone when it synced. Clock times could be shifted if you travelled.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                }
            }
        }
    }

    private func lastUpdatedText(_ night: SleepPrototypeNight) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = night.timeZone
        formatter.dateFormat = "MMM d, h:mm a"
        return formatter.string(from: night.lastUpdated)
    }

    private func detailRow(_ label: String, _ value: String, last: Bool = false) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                Text(label)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                Spacer(minLength: 12)
                Text(value)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    .multilineTextAlignment(.trailing)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            if !last { Divider().overlay(PhysiqueOSTheme.divider) }
        }
    }
}
