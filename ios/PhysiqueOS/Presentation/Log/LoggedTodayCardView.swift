import SwiftUI

/// Locked Logged Today: a 2×2 status grid (Training, Nutrition, Activity,
/// Weight) under a "Logged Today" heading and the Server's local date. Each
/// tile is tappable only when its row has a destination; an empty domain keeps
/// its tile with the canonical "Nothing logged yet". At accessibility text
/// sizes the grid linearizes to one column.
struct LoggedTodayCardView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let rows: [LoggedTodayRow]
    var localDate: String
    var typedProvenance: Bool
    var onTap: (AppDestination) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                Text("Logged Today")
                    .logText(LogType.sectionTitle)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 8)
                Text(localDate)
                    .logText(LogType.date)
                    .foregroundStyle(PhysiqueOSTheme.redesignMuted)
            }
            grid
                .padding(.top, 8)
        }
        .padding(.bottom, 2)
    }

    @ViewBuilder
    private var grid: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(spacing: 7) {
                ForEach(rows) { tile($0) }
            }
        } else {
            Grid(horizontalSpacing: 7, verticalSpacing: 7) {
                ForEach(Array(stride(from: 0, to: rows.count, by: 2)), id: \.self) { index in
                    GridRow {
                        tile(rows[index])
                        if index + 1 < rows.count {
                            tile(rows[index + 1])
                        } else {
                            Color.clear.gridCellUnsizedAxes([.horizontal, .vertical])
                        }
                    }
                }
            }
        }
    }

    private func tile(_ row: LoggedTodayRow) -> some View {
        LoggedTodayTileView(row: row, typedProvenance: typedProvenance, onTap: onTap)
    }
}

private struct LoggedTodayTileView: View {
    let row: LoggedTodayRow
    var typedProvenance: Bool
    var onTap: (AppDestination) -> Void

    private var tone: Color {
        switch row.kind {
        case .training: PhysiqueOSTheme.redesignTeal
        case .nutrition: PhysiqueOSTheme.redesignGreen
        case .activity: PhysiqueOSTheme.redesignAmberInk
        case .weight: PhysiqueOSTheme.redesignCyanInk
        }
    }

    /// Training and Nutrition carry two lines in the locked grid, so their
    /// row is taller; the shorter row pair still matches heights per row.
    private var minimumHeight: CGFloat {
        switch row.kind {
        case .training, .nutrition: 104
        case .activity, .weight: 74
        }
    }

    var body: some View {
        let content = VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Text(row.kind.label)
                    .logText(LogType.rowLabel)
                    .foregroundStyle(tone)
                if row.processing == true {
                    ProgressView()
                        .controlSize(.mini)
                        .tint(tone)
                        .accessibilityLabel("Processing")
                }
            }
            VStack(alignment: .leading, spacing: 0) {
                if row.displayLines.isEmpty {
                    Text(row.summary)
                } else {
                    ForEach(row.displayLines) { line in
                        Text(line.summary)
                    }
                }
            }
            .logText(LogType.tileSummary)
            .foregroundStyle(PhysiqueOSTheme.redesignInk)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 5)
            if let context = row.displayContext(typedProvenance: typedProvenance) {
                Text(context)
                    .logText(LogType.tileContext)
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 5)
            }
        }
        // The 2 pt semantic rule is part of the tile box, above the 9 pt padding.
        .padding(.top, 2)
        .padding(9)
        .frame(maxWidth: .infinity, minHeight: minimumHeight, maxHeight: .infinity, alignment: .topLeading)
        .background(LoggedTodayTileBackground(tone: tone))
        .contentShape(Rectangle())

        Group {
            if let destination = row.destination {
                Button { onTap(destination) } label: { content }.buttonStyle(.plain)
            } else {
                content
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(row.destination != nil ? .isButton : [])
        .accessibilityIdentifier("log.today.\(row.kind.rawValue)")
    }
}

/// The locked tile: a 2 pt semantic rule on top, a 7% semantic tint of the
/// paper surface, square top corners and 11 pt bottom corners.
private struct LoggedTodayTileBackground: View {
    let tone: Color

    var body: some View {
        let shape = UnevenRoundedRectangle(bottomLeadingRadius: 11, bottomTrailingRadius: 11, style: .continuous)
        ZStack(alignment: .top) {
            shape.fill(PhysiqueOSTheme.redesignPaper)
            shape.fill(tone.opacity(0.07))
            Rectangle().fill(tone).frame(height: 2)
        }
    }
}

/// The locked bottom Sources disclosure: one 44 pt row collapsed by default,
/// expanding in place to each source and exactly what it supplied today.
/// Built only from typed provenance (`LogReadModel.sources`).
struct LogSourcesDisclosureView: View {
    static let scrollAnchor = "log.sources"
    let entries: [LoggedTodaySourceEntry]
    @Binding var isExpanded: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle()
                .fill(PhysiqueOSTheme.redesignHairline)
                .frame(height: 1)
            Button {
                withAnimation(.easeInOut(duration: 0.15)) { isExpanded.toggle() }
            } label: {
                HStack(spacing: 7) {
                    Image(systemName: "point.3.filled.connected.trianglepath.dotted")
                        .font(.system(size: 8, weight: .bold))
                        .frame(width: 15)
                        .accessibilityHidden(true)
                    Text("Sources")
                        .logText(LogType.sourcesTitle)
                    Spacer(minLength: 8)
                    Text("\(entries.count) source\(entries.count == 1 ? "" : "s")")
                        .logText(LogType.sourcesCount)
                        .foregroundStyle(PhysiqueOSTheme.redesignMuted)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 8, weight: .bold))
                        .frame(width: 8)
                        .rotationEffect(.degrees(isExpanded ? 180 : 0))
                        .accessibilityHidden(true)
                }
                .foregroundStyle(PhysiqueOSTheme.redesignCyanInk)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Sources, \(entries.count) source\(entries.count == 1 ? "" : "s")")
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")
            .accessibilityHint(isExpanded ? "Hides where today's entries came from" : "Shows where today's entries came from")
            .accessibilityIdentifier("log.sources")

            if isExpanded {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                        VStack(spacing: 0) {
                            if index > 0 {
                                Rectangle()
                                    .fill(PhysiqueOSTheme.redesignHairline)
                                    .frame(height: 1)
                                    .padding(.top, 5)
                            }
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(entry.source)
                                    .logText(LogType.sourceLabel)
                                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                                    .frame(width: 112, alignment: .leading)
                                Text(entry.scope.joined(separator: " · "))
                                    .logText(LogType.sourceScope)
                                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(.top, 8)
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
                .padding(.horizontal, 11)
                .padding(.bottom, 10)
                // The 1 pt border is part of the box (CSS border-box).
                .padding(1)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(PhysiqueOSTheme.redesignPaper)
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(PhysiqueOSTheme.redesignCyanInk.opacity(0.07)))
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(PhysiqueOSTheme.redesignCyanInk.opacity(0.26), lineWidth: 1))
                )
                .accessibilityElement(children: .contain)
            }
        }
        .id(Self.scrollAnchor)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Evidence sources")
    }
}
