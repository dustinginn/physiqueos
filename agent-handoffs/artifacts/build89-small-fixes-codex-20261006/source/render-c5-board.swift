import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let artifact = root.appendingPathComponent("agent-handoffs/artifacts/build89-small-fixes-codex-20261006")
let captures = artifact.appendingPathComponent("captures")
let output = artifact.appendingPathComponent("boards/C5-logger-suggested-selection.png")

let items = [
    ("C5-logger-suggested-dark-unselected.png", "Dark · Unselected"),
    ("C5-logger-suggested-dark-selected.png", "Dark · Selected"),
    ("C5-logger-suggested-light-unselected.png", "Mineral · Unselected"),
    ("C5-logger-suggested-light-selected.png", "Mineral · Selected"),
]

func load(_ name: String) -> NSImage {
    guard let image = NSImage(contentsOf: captures.appendingPathComponent(name)) else {
        fatalError("Missing \(name)")
    }
    return image
}

let loaded = items.map { (load($0.0), $0.1) }
let width: CGFloat = 900
let margin: CGFloat = 36
let gap: CGFloat = 18
let rowGap: CGFloat = 28
let imageWidth: CGFloat = 390
let imageHeight = imageWidth * loaded[0].0.size.height / loaded[0].0.size.width
let title = "C5 · Logger Suggested Today selection"
let subtitle = "The 44 pt top-right target becomes the existing teal checkmark; the same canonical state keeps the Shoulders tile synchronized."
let titleFont = NSFont.systemFont(ofSize: 30, weight: .bold)
let subtitleFont = NSFont.systemFont(ofSize: 16, weight: .medium)
let labelFont = NSFont.systemFont(ofSize: 17, weight: .semibold)
let background = NSColor(calibratedRed: 0.025, green: 0.045, blue: 0.072, alpha: 1)
let ink = NSColor(calibratedRed: 0.94, green: 0.97, blue: 0.98, alpha: 1)
let secondary = NSColor(calibratedRed: 0.64, green: 0.72, blue: 0.76, alpha: 1)

func height(_ text: String, font: NSFont) -> CGFloat {
    ceil((text as NSString).boundingRect(
        with: NSSize(width: width - margin * 2, height: 10_000),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: [.font: font]
    ).height)
}

let titleHeight = height(title, font: titleFont)
let subtitleHeight = height(subtitle, font: subtitleFont)
let labelHeight = height(items[0].1, font: labelFont)
let canvasHeight = margin + titleHeight + 8 + subtitleHeight + 26
    + 2 * (labelHeight + 10 + imageHeight) + rowGap + margin
let canvas = NSImage(size: NSSize(width: width, height: canvasHeight))
canvas.lockFocus()
background.setFill()
NSBezierPath(rect: NSRect(origin: .zero, size: canvas.size)).fill()

var top = canvasHeight - margin
(title as NSString).draw(
    with: NSRect(x: margin, y: top - titleHeight, width: width - margin * 2, height: titleHeight),
    options: [.usesLineFragmentOrigin, .usesFontLeading],
    attributes: [.font: titleFont, .foregroundColor: ink]
)
top -= titleHeight + 8
(subtitle as NSString).draw(
    with: NSRect(x: margin, y: top - subtitleHeight, width: width - margin * 2, height: subtitleHeight),
    options: [.usesLineFragmentOrigin, .usesFontLeading],
    attributes: [.font: subtitleFont, .foregroundColor: secondary]
)
top -= subtitleHeight + 26

for row in 0..<2 {
    var x = (width - (2 * imageWidth + gap)) / 2
    for column in 0..<2 {
        let item = loaded[row * 2 + column]
        (item.1 as NSString).draw(
            with: NSRect(x: x, y: top - labelHeight, width: imageWidth, height: labelHeight),
            options: [.usesLineFragmentOrigin],
            attributes: [.font: labelFont, .foregroundColor: ink]
        )
        item.0.draw(in: NSRect(x: x, y: top - labelHeight - 10 - imageHeight, width: imageWidth, height: imageHeight))
        x += imageWidth + gap
    }
    top -= labelHeight + 10 + imageHeight + (row == 0 ? rowGap : 0)
}

canvas.unlockFocus()
guard let tiff = canvas.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:])
else { fatalError("Unable to encode C5 board") }
try png.write(to: output)
