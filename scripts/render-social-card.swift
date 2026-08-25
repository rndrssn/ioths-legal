import AppKit
import Foundation

guard CommandLine.arguments.count == 3 else {
    fatalError("Usage: render-social-card.swift input.svg output.png")
}

let sourceURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])

guard let sourceImage = NSImage(contentsOf: sourceURL) else {
    fatalError("Could not load \(sourceURL.path)")
}

guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: 1200,
    pixelsHigh: 630,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else {
    fatalError("Could not allocate social card bitmap")
}

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
sourceImage.draw(
    in: NSRect(x: 0, y: 0, width: 1200, height: 630),
    from: .zero,
    operation: .copy,
    fraction: 1
)
NSGraphicsContext.current?.flushGraphics()
NSGraphicsContext.restoreGraphicsState()

guard let pngData = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Could not encode social card PNG")
}

try pngData.write(to: outputURL, options: .atomic)
