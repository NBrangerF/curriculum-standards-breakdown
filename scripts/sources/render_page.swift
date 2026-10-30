// Render one PDF page (or a vertical slice of it) to PNG, for checking OCR against the scan by eye.
// Usage: render_page <file.pdf> <page> <out.png> [--top 0.0] [--bottom 1.0] [--scale 2]
import Foundation
import PDFKit
import ImageIO
import UniformTypeIdentifiers

let a = CommandLine.arguments
guard a.count >= 4, let doc = PDFDocument(url: URL(fileURLWithPath: a[1])), let n = Int(a[2]), let page = doc.page(at: n - 1) else {
    fputs("usage: render_page <file.pdf> <page> <out.png> [--top f] [--bottom f] [--scale s]\n", stderr); exit(2)
}
var top: CGFloat = 0, bottom: CGFloat = 1, scale: CGFloat = 2
var i = 4
while i + 1 < a.count {
    if a[i] == "--top" { top = CGFloat(Double(a[i + 1]) ?? 0) }
    if a[i] == "--bottom" { bottom = CGFloat(Double(a[i + 1]) ?? 1) }
    if a[i] == "--scale" { scale = CGFloat(Double(a[i + 1]) ?? 2) }
    i += 2
}
let box = page.bounds(for: .mediaBox)
let w = Int(box.width * scale), fullH = box.height * scale
let y0 = Int(fullH * top), y1 = Int(fullH * bottom)
let h = max(1, y1 - y0)
guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { exit(1) }
ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
// PDF space is bottom-up: shift so the requested slice (measured from the top) lands in the bitmap.
ctx.translateBy(x: 0, y: -(fullH - CGFloat(y1)))
ctx.scaleBy(x: scale, y: scale)
ctx.translateBy(x: -box.minX, y: -box.minY)
page.draw(with: .mediaBox, to: ctx)
guard let img = ctx.makeImage(), let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[3]) as CFURL, UTType.png.identifier as CFString, 1, nil) else { exit(1) }
CGImageDestinationAddImage(dest, img, nil)
CGImageDestinationFinalize(dest)
