import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let artifact = root.appendingPathComponent("agent-handoffs/artifacts/build89-small-fixes-codex-20261006")
let captures = artifact.appendingPathComponent("captures")
let boards = artifact.appendingPathComponent("boards")
try FileManager.default.createDirectory(at: boards, withIntermediateDirectories: true)

struct Board {
    let filename: String
    let title: String
    let subtitle: String
    let captures: [(String, String)]
}

let definitions = [
    Board(
        filename: "C1-training-detail-pr-card.png",
        title: "C1 · Training Detail performance records",
        subtitle: "Canonical exact-session records appear directly below Workout Summary.",
        captures: [("C1-training-detail-prs-dark.png", "Dark"), ("C1-training-detail-prs-light.png", "Mineral")]
    ),
    Board(
        filename: "C2-nutrition-calories-green.png",
        title: "C2 · Nutrition Calories semantic green",
        subtitle: "Calories use the approved green while protein, carbohydrates, and fat retain their semantic colors.",
        captures: [("C2-nutrition-calories-dark.png", "Dark"), ("C2-nutrition-calories-light.png", "Mineral")]
    ),
    Board(
        filename: "C3-home-timeline-copy.png",
        title: "C3 · Home timeline copy corrections",
        subtitle: "Headline and compact Remaining read exactly “4 weeks to goal target” and “4 weeks”; phase detail remains unchanged.",
        captures: [("C3-home-timeline-dark.png", "Dark"), ("C3-home-timeline-light.png", "Mineral")]
    ),
    Board(
        filename: "C4-widget-refresh-accent.png",
        title: "C4 · Widget refresh accent",
        subtitle: "Refresh now uses the same Start Logger teal/cyan action authority.",
        captures: [("C4-widget-refresh-dark.png", "Widget")]
    ),
]

let width: CGFloat = 900
let margin: CGFloat = 36
let gap: CGFloat = 18
let imageWidth: CGFloat = 390
let background = NSColor(calibratedRed: 0.025, green: 0.045, blue: 0.072, alpha: 1)
let ink = NSColor(calibratedRed: 0.94, green: 0.97, blue: 0.98, alpha: 1)
let secondary = NSColor(calibratedRed: 0.64, green: 0.72, blue: 0.76, alpha: 1)
let titleFont = NSFont.systemFont(ofSize: 30, weight: .bold)
let subtitleFont = NSFont.systemFont(ofSize: 16, weight: .medium)
let labelFont = NSFont.systemFont(ofSize: 17, weight: .semibold)

func textHeight(_ text: String, font: NSFont) -> CGFloat {
    ceil((text as NSString).boundingRect(
        with: NSSize(width: width - margin * 2, height: 10_000),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: [.font: font]
    ).height)
}

func image(named name: String) -> NSImage {
    guard let result = NSImage(contentsOf: captures.appendingPathComponent(name)) else {
        fatalError("Missing capture: \(name)")
    }
    return result
}

for board in definitions {
    let loaded = board.captures.map { (image(named: $0.0), $0.1) }
    let displayedWidth = loaded.count == 1 ? 512 : imageWidth
    let displayedHeights = loaded.map { displayedWidth * $0.0.size.height / $0.0.size.width }
    let titleHeight = textHeight(board.title, font: titleFont)
    let subtitleHeight = textHeight(board.subtitle, font: subtitleFont)
    let labelHeight = textHeight("Dark", font: labelFont)
    let height = margin + titleHeight + 8 + subtitleHeight + 26 + labelHeight + 10 + (displayedHeights.max() ?? 0) + margin

    let canvas = NSImage(size: NSSize(width: width, height: height))
    canvas.lockFocus()
    background.setFill()
    NSBezierPath(rect: NSRect(origin: .zero, size: canvas.size)).fill()

    var top = height - margin
    (board.title as NSString).draw(
        with: NSRect(x: margin, y: top - titleHeight, width: width - margin * 2, height: titleHeight),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: [.font: titleFont, .foregroundColor: ink]
    )
    top -= titleHeight + 8
    (board.subtitle as NSString).draw(
        with: NSRect(x: margin, y: top - subtitleHeight, width: width - margin * 2, height: subtitleHeight),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: [.font: subtitleFont, .foregroundColor: secondary]
    )
    top -= subtitleHeight + 26

    let rowWidth = CGFloat(loaded.count) * displayedWidth + CGFloat(max(0, loaded.count - 1)) * gap
    var x = (width - rowWidth) / 2
    for (index, item) in loaded.enumerated() {
        (item.1 as NSString).draw(
            with: NSRect(x: x, y: top - labelHeight, width: displayedWidth, height: labelHeight),
            options: [.usesLineFragmentOrigin],
            attributes: [.font: labelFont, .foregroundColor: ink]
        )
        item.0.draw(in: NSRect(x: x, y: top - labelHeight - 10 - displayedHeights[index], width: displayedWidth, height: displayedHeights[index]))
        x += displayedWidth + gap
    }

    canvas.unlockFocus()
    guard let tiff = canvas.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:])
    else { fatalError("Unable to encode \(board.filename)") }
    try png.write(to: boards.appendingPathComponent(board.filename))
}
