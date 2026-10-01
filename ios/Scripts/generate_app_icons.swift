#!/usr/bin/env swift

import CoreGraphics
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

private struct IconOutput {
    let filename: String
    let pixels: Int
}

private let outputs: [IconOutput] = [
    .init(filename: "AppIcon-20x20@2x.png", pixels: 40),
    .init(filename: "AppIcon-20x20@3x.png", pixels: 60),
    .init(filename: "AppIcon-29x29@2x.png", pixels: 58),
    .init(filename: "AppIcon-29x29@3x.png", pixels: 87),
    .init(filename: "AppIcon-40x40@2x.png", pixels: 80),
    .init(filename: "AppIcon-40x40@3x.png", pixels: 120),
    .init(filename: "AppIcon-60x60@2x.png", pixels: 120),
    .init(filename: "AppIcon-60x60@3x.png", pixels: 180),
    .init(filename: "AppIcon-20x20@1x-ipad.png", pixels: 20),
    .init(filename: "AppIcon-20x20@2x-ipad.png", pixels: 40),
    .init(filename: "AppIcon-29x29@1x-ipad.png", pixels: 29),
    .init(filename: "AppIcon-29x29@2x-ipad.png", pixels: 58),
    .init(filename: "AppIcon-40x40@1x-ipad.png", pixels: 40),
    .init(filename: "AppIcon-40x40@2x-ipad.png", pixels: 80),
    .init(filename: "AppIcon-76x76@1x-ipad.png", pixels: 76),
    .init(filename: "AppIcon-76x76@2x-ipad.png", pixels: 152),
    .init(filename: "AppIcon-83.5x83.5@2x-ipad.png", pixels: 167),
    .init(filename: "AppIcon-1024x1024@1x.png", pixels: 1024),
]

private let scriptURL = URL(fileURLWithPath: #filePath)
private let outputDirectory = scriptURL
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .appendingPathComponent("PhysiqueOS/Resources/Assets.xcassets/AppIcon.appiconset")

private func makeIcon(pixels: Int) throws -> Data {
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(
        data: nil,
        width: pixels,
        height: pixels,
        bitsPerComponent: 8,
        bytesPerRow: pixels * 4,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    ) else {
        throw NSError(domain: "PhysiqueOSIconGenerator", code: 1)
    }

    let canvas = CGRect(x: 0, y: 0, width: pixels, height: pixels)
    context.setFillColor(CGColor(red: 0.025, green: 0.043, blue: 0.082, alpha: 1))
    context.fill(canvas)

    let inset = CGFloat(pixels) * 0.105
    let badge = canvas.insetBy(dx: inset, dy: inset)
    let badgePath = CGPath(
        roundedRect: badge,
        cornerWidth: CGFloat(pixels) * 0.19,
        cornerHeight: CGFloat(pixels) * 0.19,
        transform: nil
    )
    context.addPath(badgePath)
    context.setFillColor(CGColor(red: 0.090, green: 0.122, blue: 0.208, alpha: 1))
    context.fillPath()

    context.addPath(badgePath)
    context.setLineWidth(max(1, CGFloat(pixels) * 0.018))
    context.setStrokeColor(CGColor(red: 0.310, green: 0.300, blue: 0.610, alpha: 1))
    context.strokePath()

    let font = CTFontCreateWithName(
        "HelveticaNeue-Bold" as CFString,
        CGFloat(pixels) * 0.37,
        nil
    )
    let attributes: [CFString: Any] = [
        kCTFontAttributeName: font,
        kCTForegroundColorAttributeName: CGColor(red: 0.565, green: 0.545, blue: 1, alpha: 1),
        kCTKernAttributeName: -CGFloat(pixels) * 0.018,
    ]
    let attributedText = CFAttributedStringCreate(
        nil,
        "PO" as CFString,
        attributes as CFDictionary
    )
    let line = CTLineCreateWithAttributedString(attributedText!)
    let bounds = CTLineGetBoundsWithOptions(line, [.useGlyphPathBounds])
    context.textPosition = CGPoint(
        x: (CGFloat(pixels) - bounds.width) / 2 - bounds.minX,
        y: (CGFloat(pixels) - bounds.height) / 2 - bounds.minY + CGFloat(pixels) * 0.012
    )
    CTLineDraw(line, context)

    guard let image = context.makeImage() else {
        throw NSError(domain: "PhysiqueOSIconGenerator", code: 2)
    }
    let data = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(
        data,
        UTType.png.identifier as CFString,
        1,
        nil
    ) else {
        throw NSError(domain: "PhysiqueOSIconGenerator", code: 3)
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else {
        throw NSError(domain: "PhysiqueOSIconGenerator", code: 4)
    }
    return data as Data
}

for output in outputs {
    let data = try makeIcon(pixels: output.pixels)
    try data.write(to: outputDirectory.appendingPathComponent(output.filename), options: .atomic)
    print("\(output.filename): \(output.pixels)x\(output.pixels)")
}
