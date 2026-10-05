import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("agent-handoffs/artifacts/redesign-batch3-checkpoint-d-20261005")
let pairs: [(String, String, String, String, String)] = [
    ("Progress Photos", "references/photos-dark.png", "screens/batch3-cpD-evidence-photos-dark.png", "references/photos-light.png", "screens/batch3-cpD-evidence-photos-light.png"),
    ("Photo set detail", "references/photo-detail-dark.png", "screens/batch3-cpD-evidence-photo-detail-dark.png", "references/photo-detail-light.png", "screens/batch3-cpD-evidence-photo-detail-light.png"),
    ("DEXA", "references/dexa-dark.png", "screens/batch3-cpD-evidence-dexa-dark.png", "references/dexa-light.png", "screens/batch3-cpD-evidence-dexa-light.png"),
]
func image(_ path: String) -> NSImage { NSImage(contentsOf: root.appendingPathComponent(path))! }
let width: CGFloat = 1080, margin: CGFloat = 34, gap: CGFloat = 16, cell: CGFloat = 237
let rowFont = NSFont.systemFont(ofSize: 18, weight: .bold), titleFont = NSFont.systemFont(ofSize: 30, weight: .bold), bodyFont = NSFont.systemFont(ofSize: 15, weight: .medium)
let bg = NSColor(calibratedRed: 0.025, green: 0.045, blue: 0.072, alpha: 1), ink = NSColor(calibratedRed: 0.94, green: 0.97, blue: 0.98, alpha: 1), sub = NSColor(calibratedRed: 0.64, green: 0.72, blue: 0.76, alpha: 1)
func scaled(_ item: NSImage) -> CGFloat { cell * item.size.height / item.size.width }
let heights = pairs.map { [$0.1, $0.2, $0.3, $0.4].map { scaled(image($0)) }.max()! }
let total = margin + 96 + zip(pairs, heights).reduce(0) { $0 + $1.1 + 58 } + margin
let canvas = NSImage(size: NSSize(width: width, height: total)); canvas.lockFocus(); bg.setFill(); NSBezierPath(rect: NSRect(origin: .zero, size: canvas.size)).fill()
var top = total - margin
("Batch 3 · Checkpoint D" as NSString).draw(at: NSPoint(x: margin, y: top - 36), withAttributes: [.font: titleFont, .foregroundColor: ink]); top -= 48
("Reference → simulator · Dark | Reference → simulator · Mineral Light" as NSString).draw(at: NSPoint(x: margin, y: top - 19), withAttributes: [.font: bodyFont, .foregroundColor: sub]); top -= 40
for (index, pair) in pairs.enumerated() {
    (pair.0 as NSString).draw(at: NSPoint(x: margin, y: top - 22), withAttributes: [.font: rowFont, .foregroundColor: ink]); top -= 31
    var x = margin
    for path in [pair.1, pair.2, pair.3, pair.4] { let item = image(path); let h = scaled(item); item.draw(in: NSRect(x: x, y: top - h, width: cell, height: h), from: .zero, operation: .copy, fraction: 1); x += cell + gap }
    top -= heights[index] + 27
}
canvas.unlockFocus(); let rep = NSBitmapImageRep(data: canvas.tiffRepresentation!)!; try! rep.representation(using: .png, properties: [:])!.write(to: root.appendingPathComponent("checkpoint-d-mobile-review-board.png"))
