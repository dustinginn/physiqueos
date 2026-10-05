import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    .appendingPathComponent("agent-handoffs/artifacts/redesign-batch3-checkpoint-a-20261005")
let output = root.appendingPathComponent("checkpoint-a-mobile-review-board.png")
let dark = NSColor(calibratedRed: 0.025, green: 0.045, blue: 0.072, alpha: 1)
let ink = NSColor(calibratedRed: 0.94, green: 0.97, blue: 0.98, alpha: 1)
let sub = NSColor(calibratedRed: 0.64, green: 0.72, blue: 0.76, alpha: 1)
let width: CGFloat = 1080
let margin: CGFloat = 40
let imageWidth: CGFloat = 235
let gap: CGFloat = 18

struct Row { let title: String; let paths: [String] }
let rows = [
    Row(title: "Evidence Hub · reference then real simulator · Dark / Mineral Light", paths: ["references/evidence-hub-dark.png", "screens/evidence-hub-dark.png", "references/evidence-hub-light.png", "screens/evidence-hub-light.png"]),
    Row(title: "Timeline · reference then real simulator · Dark / Mineral Light", paths: ["references/timeline-dark.png", "screens/timeline-dark.png", "references/timeline-light.png", "screens/timeline-light.png"]),
]

func load(_ path: String) -> NSImage { NSImage(contentsOf: root.appendingPathComponent(path))! }
func height(_ image: NSImage) -> CGFloat { imageWidth * image.size.height / image.size.width }
let titleFont = NSFont.systemFont(ofSize: 30, weight: .bold)
let bodyFont = NSFont.systemFont(ofSize: 16, weight: .medium)
let rowFont = NSFont.systemFont(ofSize: 18, weight: .bold)
let rowHeights = rows.map { $0.paths.map { height(load($0)) }.max()! }
let totalHeight = margin + 44 + 28 + 36 + zip(rows, rowHeights).reduce(0) { $0 + $1.1 + 62 } + margin
let canvas = NSImage(size: NSSize(width: width, height: totalHeight))
canvas.lockFocus()
dark.setFill(); NSBezierPath(rect: NSRect(origin: .zero, size: canvas.size)).fill()
var top = totalHeight - margin
("Batch 3 · Checkpoint A" as NSString).draw(at: NSPoint(x: margin, y: top - 36), withAttributes: [.font: titleFont, .foregroundColor: ink]); top -= 48
("Exact locked references beside real iPhone 17 Pro simulator captures" as NSString).draw(at: NSPoint(x: margin, y: top - 20), withAttributes: [.font: bodyFont, .foregroundColor: sub]); top -= 42
for (index, row) in rows.enumerated() {
    (row.title as NSString).draw(at: NSPoint(x: margin, y: top - 23), withAttributes: [.font: rowFont, .foregroundColor: ink]); top -= 34
    var x = margin
    for path in row.paths {
        let image = load(path); let h = height(image)
        image.draw(in: NSRect(x: x, y: top - h, width: imageWidth, height: h), from: .zero, operation: .copy, fraction: 1)
        x += imageWidth + gap
    }
    top -= rowHeights[index] + 28
}
canvas.unlockFocus()
let rep = NSBitmapImageRep(data: canvas.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: output)
