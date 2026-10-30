// Stack slices of PDF pages into one PNG, each under a short label, for checking many OCR spots at once.
// Usage: render_sheet <out.png> < jobs.tsv   (one job per line: pdf \t page \t top \t bottom \t label; top/bottom are 0–1 from the top)
import Foundation
import PDFKit
import ImageIO
import CoreText
import UniformTypeIdentifiers

let scale: CGFloat = 1.7
let labelH: CGFloat = 26
guard CommandLine.arguments.count >= 2 else { fputs("usage: render_sheet <out.png> < jobs.tsv\n", stderr); exit(2) }
var crops: [(CGImage, String)] = []
var docs: [String: PDFDocument] = [:]
while let line = readLine() {
    let f = line.components(separatedBy: "\t")
    guard f.count >= 5, let n = Int(f[1]), let top = Double(f[2]), let bottom = Double(f[3]) else { continue }
    if docs[f[0]] == nil { docs[f[0]] = PDFDocument(url: URL(fileURLWithPath: f[0])) }
    guard let doc = docs[f[0]], let page = doc.page(at: n - 1) else { continue }
    let box = page.bounds(for: .mediaBox)
    let w = Int(box.width * scale), fullH = box.height * scale
    let y0 = fullH * CGFloat(max(0, top)), y1 = fullH * CGFloat(min(1, bottom))
    let h = max(1, Int(y1 - y0))
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { continue }
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    ctx.translateBy(x: 0, y: -(fullH - y1)); ctx.scaleBy(x: scale, y: scale); ctx.translateBy(x: -box.minX, y: -box.minY)
    page.draw(with: .mediaBox, to: ctx)
    if let img = ctx.makeImage() { crops.append((img, f[4])) }
}
guard !crops.isEmpty else { fputs("no crops\n", stderr); exit(1) }
let W = crops.map { $0.0.width }.max()!
let H = crops.reduce(0) { $0 + $1.0.height + Int(labelH) + 6 }
guard let out = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { exit(1) }
out.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); out.fill(CGRect(x: 0, y: 0, width: W, height: H))
var y = CGFloat(H)
let font = CTFontCreateWithName("PingFangSC-Semibold" as CFString, 15, nil)
for (img, label) in crops {
    y -= labelH
    out.setFillColor(CGColor(red: 0.93, green: 0.88, blue: 0.78, alpha: 1)); out.fill(CGRect(x: 0, y: y, width: CGFloat(W), height: labelH))
    let attr = NSAttributedString(string: label, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font, NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(red: 0.3, green: 0.2, blue: 0.05, alpha: 1)])
    out.textPosition = CGPoint(x: 8, y: y + 7); CTLineDraw(CTLineCreateWithAttributedString(attr), out)
    y -= CGFloat(img.height)
    out.draw(img, in: CGRect(x: 0, y: y, width: CGFloat(img.width), height: CGFloat(img.height)))
    y -= 6
}
guard let final = out.makeImage(), let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[1]) as CFURL, UTType.png.identifier as CFString, 1, nil) else { exit(1) }
CGImageDestinationAddImage(dest, final, nil); CGImageDestinationFinalize(dest)
