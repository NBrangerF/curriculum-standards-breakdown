// Page text for a curriculum-standard PDF, using only macOS frameworks:
// PDFKit renders each page and Apple Vision reads it (the PDFs are mostly scans).
// Usage: pdf_ocr <file.pdf> [--from N] [--to N] [--scale 2.5] [--probe]
//   --probe  only report how many characters each page's embedded text layer has.
// Output: one JSON object per page on stdout:
//   {"page": n, "text": "...", "layer_chars": n, "lines": [{"t": "...", "x": .., "y": .., "w": .., "h": ..}]}
//   Line boxes are fractions of the page, origin top-left, so table columns can be told apart.
import Foundation
import PDFKit
import Vision

struct Line: Codable {
    let t: String
    let x: Double
    let y: Double
    let w: Double
    let h: Double
}

struct PageRow: Codable {
    let page: Int
    let text: String
    let layer_chars: Int
    let lines: [Line]
}

var args = Array(CommandLine.arguments.dropFirst())
guard let path = args.first else {
    fputs("usage: pdf_ocr <file.pdf> [--from N] [--to N] [--scale S] [--probe]\n", stderr)
    exit(2)
}
args.removeFirst()
var from = 1, to = Int.max, scale: CGFloat = 2.5, probe = false
var i = 0
while i < args.count {
    switch args[i] {
    case "--from": from = Int(args[i + 1]) ?? 1; i += 2
    case "--to": to = Int(args[i + 1]) ?? Int.max; i += 2
    case "--scale": scale = CGFloat(Double(args[i + 1]) ?? 2.5); i += 2
    case "--probe": probe = true; i += 1
    default: i += 1
    }
}

guard let doc = PDFDocument(url: URL(fileURLWithPath: path)) else {
    fputs("cannot open \(path)\n", stderr)
    exit(1)
}

func render(_ page: PDFPage) -> CGImage? {
    let box = page.bounds(for: .mediaBox)
    let width = Int(box.width * scale), height = Int(box.height * scale)
    guard let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    ctx.scaleBy(x: scale, y: scale)
    ctx.translateBy(x: -box.minX, y: -box.minY)
    page.draw(with: .mediaBox, to: ctx)
    return ctx.makeImage()
}

// Lines top to bottom, left to right, each with its box.
func recognize(_ image: CGImage) -> [Line] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = true
    try? VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    let observations = request.results ?? []
    let round3 = { (v: CGFloat) in (Double(v) * 1000).rounded() / 1000 }
    return observations
        .sorted {
            if abs($0.boundingBox.maxY - $1.boundingBox.maxY) > 0.01 { return $0.boundingBox.maxY > $1.boundingBox.maxY }
            return $0.boundingBox.minX < $1.boundingBox.minX
        }
        .compactMap { obs -> Line? in
            guard let text = obs.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
            let b = obs.boundingBox
            return Line(t: text, x: round3(b.minX), y: round3(1 - b.maxY), w: round3(b.width), h: round3(b.height))
        }
}

let encoder = JSONEncoder()
let last = min(to, doc.pageCount)
if from <= last {
    for n in from...last {
        guard let page = doc.page(at: n - 1) else { continue }
        let layer = (page.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        var lines: [Line] = []
        if !probe { autoreleasepool { if let image = render(page) { lines = recognize(image) } } }
        let row = PageRow(page: n, text: lines.map { $0.t }.joined(separator: "\n"), layer_chars: layer.count, lines: lines)
        if let data = try? encoder.encode(row), let line = String(data: data, encoding: .utf8) { print(line) }
        fflush(stdout)
    }
}
