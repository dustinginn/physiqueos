import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let artifact = root.appendingPathComponent("agent-handoffs/artifacts/build87-home-physical-parity-corrections-20261005")
let frozen = root.appendingPathComponent("agent-handoffs/artifacts/redesign-implementation-batch1-20261005/screens")
let corrected = artifact.appendingPathComponent("screens")

let frozenDark = frozen.appendingPathComponent("home-dark.png")
let frozenLight = frozen.appendingPathComponent("home-light.png")
let correctedDark = corrected.appendingPathComponent("home-dark.png")
let correctedLight = corrected.appendingPathComponent("home-light.png")

func load(_ url: URL) -> NSImage {
    guard let image = NSImage(contentsOf: url) else { fatalError("Missing \(url.path)") }
    return image
}

func crop(_ url: URL, top: Int, height: Int) -> NSImage {
    guard let data = try? Data(contentsOf: url),
          let bitmap = NSBitmapImageRep(data: data),
          let source = bitmap.cgImage,
          let result = source.cropping(to: CGRect(x: 0, y: top, width: source.width, height: height))
    else { fatalError("Unable to crop \(url.path)") }
    return NSImage(cgImage: result, size: NSSize(width: result.width, height: result.height))
}

struct Panel {
    let title: String
    let subtitle: String
    let images: [NSImage]
    let imageWidth: CGFloat
}

let boardWidth: CGFloat = 900
let margin: CGFloat = 36
let gap: CGFloat = 18
let contentWidth = boardWidth - margin * 2
let background = NSColor(calibratedRed: 0.025, green: 0.045, blue: 0.072, alpha: 1)
let ink = NSColor(calibratedRed: 0.94, green: 0.97, blue: 0.98, alpha: 1)
let secondary = NSColor(calibratedRed: 0.64, green: 0.72, blue: 0.76, alpha: 1)
let rule = NSColor(calibratedRed: 0.20, green: 0.36, blue: 0.41, alpha: 1)

let heading = "Build 87 Home · physical-parity correction"
let deck = "Frozen reference compared with real iPhone 17 Pro simulator output. In each focused pair: frozen reference is left; corrected candidate is right."
let panels = [
    Panel(
        title: "Full-page pair",
        subtitle: "Corrected Dark and Mineral Light · 1206 × 2622 simulator pixels",
        images: [load(correctedDark), load(correctedLight)],
        imageWidth: 390
    ),
    Panel(
        title: "Dark · metrics, phase timeline, guardrail",
        subtitle: "Frozen reference → corrected candidate",
        images: [crop(frozenDark, top: 760, height: 1140), crop(correctedDark, top: 760, height: 1140)],
        imageWidth: 390
    ),
    Panel(
        title: "Mineral Light · metrics, phase timeline, guardrail",
        subtitle: "Frozen reference → corrected candidate",
        images: [crop(frozenLight, top: 760, height: 1140), crop(correctedLight, top: 760, height: 1140)],
        imageWidth: 390
    ),
    Panel(
        title: "Dark · action and briefing tile",
        subtitle: "Frozen short fixture → corrected realistic Weekly title; geometry remains locked",
        images: [crop(frozenDark, top: 1830, height: 560), crop(correctedDark, top: 1830, height: 560)],
        imageWidth: 390
    ),
    Panel(
        title: "Mineral Light · action and briefing tile",
        subtitle: "Frozen short fixture → corrected realistic Weekly title; no eyebrow and no truncation",
        images: [crop(frozenLight, top: 1830, height: 560), crop(correctedLight, top: 1830, height: 560)],
        imageWidth: 390
    ),
]

func textHeight(_ text: String, font: NSFont) -> CGFloat {
    ceil((text as NSString).boundingRect(
        with: NSSize(width: contentWidth, height: 10_000),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: [.font: font]
    ).height)
}

let headingFont = NSFont.systemFont(ofSize: 30, weight: .bold)
let deckFont = NSFont.systemFont(ofSize: 16, weight: .medium)
let panelFont = NSFont.systemFont(ofSize: 21, weight: .bold)
let subtitleFont = NSFont.systemFont(ofSize: 14, weight: .medium)
var total = margin + textHeight(heading, font: headingFont) + 8 + textHeight(deck, font: deckFont) + 28
for panel in panels {
    total += textHeight(panel.title, font: panelFont) + 5 + textHeight(panel.subtitle, font: subtitleFont) + 14
    total += panel.images.map { panel.imageWidth * $0.size.height / $0.size.width }.max()! + 34
}
total += margin

let canvas = NSImage(size: NSSize(width: boardWidth, height: total))
canvas.lockFocus()
background.setFill()
NSBezierPath(rect: NSRect(origin: .zero, size: canvas.size)).fill()

var top = total - margin
func draw(_ text: String, font: NSFont, color: NSColor) {
    let height = textHeight(text, font: font)
    (text as NSString).draw(
        with: NSRect(x: margin, y: top - height, width: contentWidth, height: height),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: [.font: font, .foregroundColor: color]
    )
    top -= height
}

draw(heading, font: headingFont, color: ink)
top -= 8
draw(deck, font: deckFont, color: secondary)
top -= 28

for panel in panels {
    rule.setFill()
    NSBezierPath(rect: NSRect(x: margin, y: top - 1, width: contentWidth, height: 1)).fill()
    top -= 18
    draw(panel.title, font: panelFont, color: ink)
    top -= 5
    draw(panel.subtitle, font: subtitleFont, color: secondary)
    top -= 14

    let heights = panel.images.map { panel.imageWidth * $0.size.height / $0.size.width }
    let rowHeight = heights.max()!
    let rowWidth = CGFloat(panel.images.count) * panel.imageWidth + CGFloat(panel.images.count - 1) * gap
    var x = (boardWidth - rowWidth) / 2
    for (index, image) in panel.images.enumerated() {
        let height = heights[index]
        image.draw(in: NSRect(x: x, y: top - height, width: panel.imageWidth, height: height))
        x += panel.imageWidth + gap
    }
    top -= rowHeight + 34
}

canvas.unlockFocus()
guard let tiff = canvas.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:])
else { fatalError("Unable to encode comparison board") }
try png.write(to: artifact.appendingPathComponent("home-physical-parity-comparison.png"))
