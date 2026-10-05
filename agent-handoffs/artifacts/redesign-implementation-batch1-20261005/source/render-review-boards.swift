import AppKit

private let repo = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
private let artifact = repo.appendingPathComponent("agent-handoffs/artifacts/redesign-implementation-batch1-20261005")
private let screens = artifact.appendingPathComponent("screens")
private let references = URL(fileURLWithPath: "/tmp/physiqueos-batch1-references")

private let boardWidth: CGFloat = 900
private let margin: CGFloat = 36
private let gap: CGFloat = 18
private let titleColor = NSColor(calibratedRed: 0.94, green: 0.97, blue: 0.98, alpha: 1)
private let secondaryColor = NSColor(calibratedRed: 0.64, green: 0.72, blue: 0.76, alpha: 1)
private let backgroundColor = NSColor(calibratedRed: 0.025, green: 0.045, blue: 0.072, alpha: 1)
private let ruleColor = NSColor(calibratedRed: 0.20, green: 0.36, blue: 0.41, alpha: 1)

private struct Panel {
    let title: String
    let subtitle: String
    let images: [URL]
    let imageWidth: CGFloat
}

private func image(_ url: URL) -> NSImage {
    guard let value = NSImage(contentsOf: url) else {
        fatalError("Missing image: \(url.path)")
    }
    return value
}

private func scaledHeight(_ source: NSImage, width: CGFloat) -> CGFloat {
    width * source.size.height / source.size.width
}

private func textHeight(_ text: String, font: NSFont, width: CGFloat) -> CGFloat {
    let attributes: [NSAttributedString.Key: Any] = [.font: font]
    return ceil((text as NSString).boundingRect(
        with: NSSize(width: width, height: 10_000),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: attributes
    ).height)
}

private func render(name: String, heading: String, deck: String, panels: [Panel]) {
    let contentWidth = boardWidth - margin * 2
    let headingFont = NSFont.systemFont(ofSize: 30, weight: .bold)
    let deckFont = NSFont.systemFont(ofSize: 16, weight: .medium)
    let panelFont = NSFont.systemFont(ofSize: 21, weight: .bold)
    let subtitleFont = NSFont.systemFont(ofSize: 14, weight: .medium)

    var totalHeight = margin
    totalHeight += textHeight(heading, font: headingFont, width: contentWidth) + 8
    totalHeight += textHeight(deck, font: deckFont, width: contentWidth) + 28
    for panel in panels {
        totalHeight += textHeight(panel.title, font: panelFont, width: contentWidth) + 5
        totalHeight += textHeight(panel.subtitle, font: subtitleFont, width: contentWidth) + 14
        let heights = panel.images.map { scaledHeight(image($0), width: panel.imageWidth) }
        totalHeight += (heights.max() ?? 0) + 34
    }
    totalHeight += margin

    let canvas = NSImage(size: NSSize(width: boardWidth, height: totalHeight))
    canvas.lockFocus()
    backgroundColor.setFill()
    NSBezierPath(rect: NSRect(origin: .zero, size: canvas.size)).fill()

    var top = totalHeight - margin
    func drawText(_ text: String, font: NSFont, color: NSColor, y: CGFloat) -> CGFloat {
        let height = textHeight(text, font: font, width: contentWidth)
        let rect = NSRect(x: margin, y: y - height, width: contentWidth, height: height)
        (text as NSString).draw(
            with: rect,
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: [.font: font, .foregroundColor: color]
        )
        return height
    }

    top -= drawText(heading, font: headingFont, color: titleColor, y: top) + 8
    top -= drawText(deck, font: deckFont, color: secondaryColor, y: top) + 28

    for panel in panels {
        ruleColor.setFill()
        NSBezierPath(rect: NSRect(x: margin, y: top - 1, width: contentWidth, height: 1)).fill()
        top -= 18
        top -= drawText(panel.title, font: panelFont, color: titleColor, y: top) + 5
        top -= drawText(panel.subtitle, font: subtitleFont, color: secondaryColor, y: top) + 14

        let resolved = panel.images.map { (image($0), $0) }
        let heights = resolved.map { scaledHeight($0.0, width: panel.imageWidth) }
        let rowHeight = heights.max() ?? 0
        let rowWidth = CGFloat(resolved.count) * panel.imageWidth + CGFloat(max(0, resolved.count - 1)) * gap
        var x = (boardWidth - rowWidth) / 2
        for (index, item) in resolved.enumerated() {
            let height = heights[index]
            let rect = NSRect(x: x, y: top - height, width: panel.imageWidth, height: height)
            item.0.draw(in: rect, from: .zero, operation: .copy, fraction: 1)
            x += panel.imageWidth + gap
        }
        top -= rowHeight + 34
    }

    canvas.unlockFocus()
    guard let tiff = canvas.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:]) else {
        fatalError("Unable to encode \(name)")
    }
    try! png.write(to: artifact.appendingPathComponent(name))
}

let actualPairWidth: CGFloat = 390
let compactPairWidth: CGFloat = 198

render(
    name: "primary-mobile-review-board.png",
    heading: "PhysiqueOS · Redesign implementation Batch 1",
    deck: "Real iPhone simulator captures · Dark and Mineral Light · Home, Goals, and You / Settings",
    panels: [
        Panel(title: "Home", subtitle: "Final corrected implementation pair", images: [screens.appendingPathComponent("home-dark.png"), screens.appendingPathComponent("home-light.png")], imageWidth: actualPairWidth),
        Panel(title: "Goals", subtitle: "Goals root implementation pair", images: [screens.appendingPathComponent("goals-dark.png"), screens.appendingPathComponent("goals-light.png")], imageWidth: actualPairWidth),
        Panel(title: "You", subtitle: "You root implementation pair", images: [screens.appendingPathComponent("you-dark.png"), screens.appendingPathComponent("you-light.png")], imageWidth: actualPairWidth)
    ]
)

render(
    name: "home-parity-board.png",
    heading: "Home · locked reference and implementation",
    deck: "Reference first; final real-simulator Dark and Mineral Light pair second. Progress track removed; phase timeline, guardrail, supporting arcs, metric rules, and typography corrected.",
    panels: [
        Panel(title: "Founder-locked reference", subtitle: "Selected Home · corrected and frozen", images: [references.appendingPathComponent("home.png")], imageWidth: 820),
        Panel(title: "Batch 1 implementation", subtitle: "iPhone 17 Pro simulator · production contract fixture", images: [screens.appendingPathComponent("home-dark.png"), screens.appendingPathComponent("home-light.png")], imageWidth: actualPairWidth)
    ]
)

render(
    name: "goals-parity-board.png",
    heading: "Goals · locked references and implementation",
    deck: "Root, active Goal, completed Goal, and phase states in both appearances.",
    panels: [
        Panel(title: "Locked Goals root", subtitle: "Design reference", images: [references.appendingPathComponent("goals-root.png")], imageWidth: 720),
        Panel(title: "Implemented Goals root", subtitle: "Real simulator", images: [screens.appendingPathComponent("goals-dark.png"), screens.appendingPathComponent("goals-light.png")], imageWidth: actualPairWidth),
        Panel(title: "Active Goal", subtitle: "Dark and Mineral Light implementation", images: [screens.appendingPathComponent("goal-active-dark.png"), screens.appendingPathComponent("goal-active-light.png")], imageWidth: actualPairWidth),
        Panel(title: "Completed Goal", subtitle: "Dark and Mineral Light implementation", images: [screens.appendingPathComponent("goal-completed-dark.png"), screens.appendingPathComponent("goal-completed-light.png")], imageWidth: actualPairWidth),
        Panel(title: "Phase states", subtitle: "Completed and active phase details", images: [screens.appendingPathComponent("goal-phase-completed-dark.png"), screens.appendingPathComponent("goal-phase-active-dark.png"), screens.appendingPathComponent("goal-phase-completed-light.png"), screens.appendingPathComponent("goal-phase-active-light.png")], imageWidth: 190)
    ]
)

render(
    name: "you-settings-parity-board.png",
    heading: "You / Settings · locked references and implementation",
    deck: "Only contract-ready routes are interactive. Profile, Data Sources, and Sign Out remain intentionally deferred.",
    panels: [
        Panel(title: "You · locked reference", subtitle: "Dark and Mineral Light", images: [references.appendingPathComponent("y1-dark.png"), references.appendingPathComponent("y1-light.png")], imageWidth: compactPairWidth),
        Panel(title: "You · implementation", subtitle: "Real simulator", images: [screens.appendingPathComponent("you-dark.png"), screens.appendingPathComponent("you-light.png")], imageWidth: compactPairWidth),
        Panel(title: "Settings · locked reference", subtitle: "Dark and Mineral Light", images: [references.appendingPathComponent("s1-dark.png"), references.appendingPathComponent("s1-light.png")], imageWidth: compactPairWidth),
        Panel(title: "Settings · implementation", subtitle: "Real simulator", images: [screens.appendingPathComponent("settings-dark.png"), screens.appendingPathComponent("settings-light.png")], imageWidth: compactPairWidth),
        Panel(title: "Appearance · locked reference", subtitle: "System / Dark / Light", images: [references.appendingPathComponent("a1-dark.png"), references.appendingPathComponent("a1-light.png")], imageWidth: compactPairWidth),
        Panel(title: "Appearance · implementation", subtitle: "Real simulator", images: [screens.appendingPathComponent("appearance-dark.png"), screens.appendingPathComponent("appearance-light.png")], imageWidth: compactPairWidth)
    ]
)
