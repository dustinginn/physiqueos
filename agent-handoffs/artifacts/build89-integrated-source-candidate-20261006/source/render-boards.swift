import AppKit

// Usage: swift render-boards.swift <package-dir>
// Composes the Build 89 integration proof boards from <package-dir>/captures
// into <package-dir>/boards. Deterministic; no app code or runtime involved.
let package = URL(fileURLWithPath: CommandLine.arguments[1])
let captures = package.appendingPathComponent("captures")
let boards = package.appendingPathComponent("boards")
try FileManager.default.createDirectory(at: boards, withIntermediateDirectories: true)

struct Shot { let file: String; let label: String; var crop: CGRect? = nil }   // crop: normalized, origin top-left
struct Board { let file: String; let title: String; let subtitle: String; let shots: [Shot] }

let laCard = CGRect(x: 0, y: 0, width: 1, height: 1)   // captures are pre-cropped to the card
let definitions = [
    Board(file: "I1-live-activity-stopwatch.png",
          title: "I1 · Live Activity clock: no-rest WORKOUT stopwatch + unchanged REST · STOPWATCH",
          subtitle: "Shipping WorkoutLockScreenView renders (WorkoutLiveActivityViewTests). Pre-first-set WORKOUT now uses the green stopwatch; active rest keeps the green stopwatch, REST · STOPWATCH and rest clock.",
          shots: [Shot(file: "I1-pre-first-set-workout-dark.png", label: "Pre-first-set · Dark", crop: laCard),
                  Shot(file: "I1-active-rest-stopwatch-dark.png", label: "Active rest · Dark", crop: laCard),
                  Shot(file: "I1-pre-first-set-workout-mineral.png", label: "Pre-first-set · Mineral", crop: laCard),
                  Shot(file: "I1-active-rest-stopwatch-mineral.png", label: "Active rest · Mineral", crop: laCard)]),
    Board(file: "I2-root-routing.png",
          title: "I2 · Combined RootTabView routes (Claude A + Claude B)",
          subtitle: "Real sandbox app via the DEBUG review table: A's Morning Check-In, B's Briefing History and direct briefing:<artifactId>, and the existing Evidence path. Absent from Release.",
          shots: [Shot(file: "I2-morning-check-in-dark.png", label: "morning-check-in"),
                  Shot(file: "I2-briefing-history-dark.png", label: "briefing-history"),
                  Shot(file: "I2-briefing-direct-dexa-dark.png", label: "briefing:dexa_event_…005"),
                  Shot(file: "I2-evidence-training-day-dark.png", label: "evidence:…trainingDay")]),
    Board(file: "I3-logger.png",
          title: "I3 · Logger: Suggested Today selection control + Option B set values",
          subtitle: "Suggested Today: shipping card + Training Area tile renders (Production-payload-only, so not offered in Sandbox). Set rows: real sandbox Logger, REPS/LOAD 16 pt Semibold, SET 12 pt Bold, 36 pt fields.",
          shots: [Shot(file: "I3-suggested-unselected-dark.png", label: "Suggested · unselected"),
                  Shot(file: "I3-suggested-selected-dark.png", label: "Suggested · selected"),
                  Shot(file: "I3-option-b-set-values-dark.png", label: "Option B · Dark", crop: CGRect(x: 0, y: 0.48, width: 1, height: 0.34)),
                  Shot(file: "I3-option-b-set-values-light.png", label: "Option B · Mineral", crop: CGRect(x: 0, y: 0.48, width: 1, height: 0.34))]),
    Board(file: "I4-training-detail-pr-card.png",
          title: "I4 · Training Detail performance records card",
          subtitle: "Real sandbox Training Detail: canonical Server-owned performanceRecords below Workout Summary.",
          shots: [Shot(file: "I4-training-detail-prs-dark.png", label: "Dark"),
                  Shot(file: "I4-training-detail-prs-light.png", label: "Mineral")]),
    Board(file: "I5-dexa-briefing.png",
          title: "I5 · DEXA Briefing: change rails + WHAT THIS SCAN MEANS lead",
          subtitle: "Real sandbox DEXA event briefing (direct artifact route): data-derived rails with goal-aware delta colors; the canonical interpretation.opening promoted as the lead.",
          shots: [Shot(file: "I5-dexa-rails-dark.png", label: "Rails · Dark"),
                  Shot(file: "I5-dexa-what-this-scan-means-dark.png", label: "Scan means · Dark"),
                  Shot(file: "I5-dexa-rails-light.png", label: "Rails · Mineral"),
                  Shot(file: "I5-dexa-what-this-scan-means-light.png", label: "Scan means · Mineral")]),
]

let margin: CGFloat = 36, gap: CGFloat = 18, column: CGFloat = 360
let background = NSColor(calibratedRed: 0.025, green: 0.045, blue: 0.072, alpha: 1)
let ink = NSColor(calibratedRed: 0.94, green: 0.97, blue: 0.98, alpha: 1)
let secondary = NSColor(calibratedRed: 0.64, green: 0.72, blue: 0.76, alpha: 1)
let titleFont = NSFont.systemFont(ofSize: 26, weight: .bold)
let subtitleFont = NSFont.systemFont(ofSize: 15, weight: .medium)
let labelFont = NSFont.systemFont(ofSize: 15, weight: .semibold)

func height(_ text: String, _ font: NSFont, _ width: CGFloat) -> CGFloat {
    ceil((text as NSString).boundingRect(with: NSSize(width: width, height: 10_000),
        options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: font]).height)
}

for board in definitions {
    let loaded: [(NSBitmapImageRep, Shot)] = board.shots.map { shot in
        guard let rep = NSBitmapImageRep(data: try! Data(contentsOf: captures.appendingPathComponent(shot.file))) else { fatalError(shot.file) }
        return (rep, shot)
    }
    let width = margin * 2 + CGFloat(loaded.count) * column + CGFloat(loaded.count - 1) * gap
    let sources: [CGRect] = loaded.map { rep, shot in
        let w = CGFloat(rep.pixelsWide), h = CGFloat(rep.pixelsHigh)
        let c = shot.crop ?? CGRect(x: 0, y: 0, width: 1, height: 1)
        return CGRect(x: c.minX * w, y: (1 - c.maxY) * h, width: c.width * w, height: c.height * h)
    }
    let shown = sources.map { column * $0.height / $0.width }
    let titleH = height(board.title, titleFont, width - margin * 2)
    let subH = height(board.subtitle, subtitleFont, width - margin * 2)
    let labelH = height("X", labelFont, column)
    let total = margin + titleH + 8 + subH + 24 + labelH + 8 + (shown.max() ?? 0) + margin
    let canvas = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(width * 2), pixelsHigh: Int(total * 2),
                                  bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                  colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    canvas.size = NSSize(width: width, height: total)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: canvas)
    background.setFill(); NSRect(x: 0, y: 0, width: width, height: total).fill()
    var y = total - margin - titleH
    (board.title as NSString).draw(with: NSRect(x: margin, y: y, width: width - margin * 2, height: titleH),
        options: [.usesLineFragmentOrigin], attributes: [.font: titleFont, .foregroundColor: ink])
    y -= 8 + subH
    (board.subtitle as NSString).draw(with: NSRect(x: margin, y: y, width: width - margin * 2, height: subH),
        options: [.usesLineFragmentOrigin], attributes: [.font: subtitleFont, .foregroundColor: secondary])
    y -= 24 + labelH
    for (index, (rep, shot)) in loaded.enumerated() {
        let x = margin + CGFloat(index) * (column + gap)
        (shot.label as NSString).draw(at: NSPoint(x: x, y: y), withAttributes: [.font: labelFont, .foregroundColor: ink])
        let image = NSImage(size: NSSize(width: rep.pixelsWide, height: rep.pixelsHigh)); image.addRepresentation(rep)
        let dest = NSRect(x: x, y: y - 8 - shown[index], width: column, height: shown[index])
        image.draw(in: dest, from: sources[index], operation: .sourceOver, fraction: 1)
        NSColor(white: 1, alpha: 0.14).setStroke(); NSBezierPath(rect: dest).stroke()
    }
    NSGraphicsContext.restoreGraphicsState()
    try canvas.representation(using: .png, properties: [:])!.write(to: boards.appendingPathComponent(board.file))
    print("wrote \(board.file)")
}
