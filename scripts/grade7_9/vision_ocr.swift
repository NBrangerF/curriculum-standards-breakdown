import Foundation
import Vision

struct OCRRow: Codable {
    let file: String
    let text: String
    let error: String?
}

func parseArgs(_ args: [String]) -> (languages: [String], files: [String]) {
    var languages = ["zh-Hans", "en-US"]
    var files: [String] = []
    var i = 0
    while i < args.count {
        let arg = args[i]
        if arg == "--languages", i + 1 < args.count {
            languages = args[i + 1]
                .split(separator: ",")
                .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            i += 2
        } else {
            files.append(arg)
            i += 1
        }
    }
    return (languages, files)
}

func recognizedText(from imagePath: String, languages: [String]) -> OCRRow {
    let imageURL = URL(fileURLWithPath: imagePath)
    var observations: [VNRecognizedTextObservation] = []
    let request = VNRecognizeTextRequest { request, error in
        if let error = error {
            observations = []
            fputs("OCR error for \(imagePath): \(error)\n", stderr)
            return
        }
        observations = request.results as? [VNRecognizedTextObservation] ?? []
    }
    request.recognitionLevel = .accurate
    request.recognitionLanguages = languages
    request.usesLanguageCorrection = true

    do {
        let handler = VNImageRequestHandler(url: imageURL, options: [:])
        try handler.perform([request])
        let lines = observations
            .sorted {
                if abs($0.boundingBox.maxY - $1.boundingBox.maxY) > 0.01 {
                    return $0.boundingBox.maxY > $1.boundingBox.maxY
                }
                return $0.boundingBox.minX < $1.boundingBox.minX
            }
            .compactMap { $0.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return OCRRow(file: imagePath, text: lines.joined(separator: "\n"), error: nil)
    } catch {
        return OCRRow(file: imagePath, text: "", error: "\(error)")
    }
}

let parsed = parseArgs(Array(CommandLine.arguments.dropFirst()))
let encoder = JSONEncoder()
encoder.outputFormatting = [.withoutEscapingSlashes]

for file in parsed.files {
    let row = recognizedText(from: file, languages: parsed.languages)
    if let data = try? encoder.encode(row), let json = String(data: data, encoding: .utf8) {
        print(json)
    }
}
