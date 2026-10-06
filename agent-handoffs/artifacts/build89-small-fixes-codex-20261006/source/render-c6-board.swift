import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let artifact = root.appendingPathComponent("agent-handoffs/artifacts/build89-small-fixes-codex-20261006")
let captures = artifact.appendingPathComponent("captures")
let output = artifact.appendingPathComponent("boards/C6-logger-set-typography-options.png")

struct Option {
    let id: String
    let title: String
    let detail: String
}

let options = [
    Option(id: "current", title: "Current", detail: "12 pt · Regular"),
    Option(id: "a", title: "A", detail: "14 pt · Regular"),
    Option(id: "b", title: "B", detail: "16 pt · Semibold"),
    Option(id: "c", title: "C", detail: "15 pt · Medium · SET 13 pt"),
]

func load(_ appearance: String, _ id: String) -> NSImage {
    let url = captures.appendingPathComponent("C6-logger-type-\(appearance)-\(id).png")
    guard let image = NSImage(contentsOf: url) else { fatalError("Missing \(url.path)") }
    return image
}

let mineral = options.map { load("mineral", $0.id) }
let dark = options.map { load("dark", $0.id) }

let width: CGFloat = 900
let margin: CGFloat = 36
let gap: CGFloat = 18
let imageWidth: CGFloat = 390
let imageHeight: CGFloat = 430
let titleFont = NSFont.systemFont(ofSize: 30, weight: .bold)
let subtitleFont = NSFont.systemFont(ofSize: 16, weight: .medium)
let optionFont = NSFont.systemFont(ofSize: 18, weight: .bold)
let detailFont = NSFont.systemFont(ofSize: 14, weight: .medium)
let sectionFont = NSFont.systemFont(ofSize: 18, weight: .bold)
let background = NSColor(calibratedRed: 0.025, green: 0.045, blue: 0.072, alpha: 1)
let ink = NSColor(calibratedRed: 0.94, green: 0.97, blue: 0.98, alpha: 1)
let secondary = NSColor(calibratedRed: 0.64, green: 0.72, blue: 0.76, alpha: 1)
let accent = NSColor(calibratedRed: 0.49, green: 0.88, blue: 0.66, alpha: 1)

func measuredHeight(_ text: String, font: NSFont, availableWidth: CGFloat = width - margin * 2) -> CGFloat {
    ceil((text as NSString).boundingRect(
        with: NSSize(width: availableWidth, height: 10_000),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: [.font: font]
    ).height)
}

let title = "C6 · Logger set-value typography"
let subtitle = "Founder selection checkpoint · Same real SwiftUI rows, state, device width, geometry, and behavior. Only numeric size/weight changes."
let titleHeight = measuredHeight(title, font: titleFont)
let subtitleHeight = measuredHeight(subtitle, font: subtitleFont)
let labelHeight: CGFloat = 42
let darkSectionHeight: CGFloat = 22
let darkStripWidth: CGFloat = 193.5
let darkStripHeight: CGFloat = 127
let canvasHeight = margin + titleHeight + 8 + subtitleHeight + 24
    + 2 * (labelHeight + 8 + imageHeight) + 24
    + darkSectionHeight + 10 + darkStripHeight + margin

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
top -= subtitleHeight + 24

for row in 0..<2 {
    var x = (width - (2 * imageWidth + gap)) / 2
    for column in 0..<2 {
        let index = row * 2 + column
        let option = options[index]
        (option.title as NSString).draw(
            at: NSPoint(x: x, y: top - 21),
            withAttributes: [.font: optionFont, .foregroundColor: accent]
        )
        (option.detail as NSString).draw(
            at: NSPoint(x: x, y: top - 40),
            withAttributes: [.font: detailFont, .foregroundColor: secondary]
        )
        mineral[index].draw(in: NSRect(x: x, y: top - labelHeight - 8 - imageHeight, width: imageWidth, height: imageHeight))
        x += imageWidth + gap
    }
    top -= labelHeight + 8 + imageHeight + (row == 0 ? 24 : 0)
}

top -= 24
("Dark appearance verification" as NSString).draw(
    with: NSRect(x: margin, y: top - darkSectionHeight, width: width - margin * 2, height: darkSectionHeight),
    options: [.usesLineFragmentOrigin],
    attributes: [.font: sectionFont, .foregroundColor: ink]
)
top -= darkSectionHeight + 10

let sourceCrop = NSRect(x: 48, y: 295, width: 1074, height: 705)
for index in options.indices {
    let x = margin + CGFloat(index) * (darkStripWidth + gap)
    dark[index].draw(
        in: NSRect(x: x, y: top - darkStripHeight, width: darkStripWidth, height: darkStripHeight),
        from: sourceCrop,
        operation: .sourceOver,
        fraction: 1,
        respectFlipped: true,
        hints: [.interpolation: NSImageInterpolation.high]
    )
    let badge = options[index].title
    (badge as NSString).draw(
        at: NSPoint(x: x + 8, y: top - 24),
        withAttributes: [.font: optionFont, .foregroundColor: accent]
    )
}

canvas.unlockFocus()
guard let tiff = canvas.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:])
else { fatalError("Unable to encode C6 board") }
try png.write(to: output)
