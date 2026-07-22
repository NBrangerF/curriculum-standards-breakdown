const REQUIRED_BBOX_NUMBERS = ['x', 'y', 'width', 'height', 'page_width', 'page_height']
const BOUNDS_EPSILON = 1e-6

function normalizedLineEntries(lines) {
  if (!Array.isArray(lines) || !lines.length) return []

  return lines
    .map(line => ({
      text: String(line?.text ?? '').trim(),
      bbox: line?.bbox ?? null
    }))
    .filter(line => line.text)
}

function lineCharacterRanges(lines) {
  let offset = 0
  return lines.map((line, index) => {
    const start = offset
    const end = start + line.text.length
    offset = end + (index < lines.length - 1 ? 1 : 0)
    return { ...line, start, end }
  })
}

function validBbox(bbox) {
  if (!bbox || typeof bbox !== 'object') return false
  if (!REQUIRED_BBOX_NUMBERS.every(key => Number.isFinite(Number(bbox[key])))) return false

  const x = Number(bbox.x)
  const y = Number(bbox.y)
  const width = Number(bbox.width)
  const height = Number(bbox.height)
  const pageWidth = Number(bbox.page_width)
  const pageHeight = Number(bbox.page_height)

  if (!String(bbox.unit ?? '').trim()) return false
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || pageWidth <= 0 || pageHeight <= 0) return false
  if (x + width > pageWidth + BOUNDS_EPSILON) return false
  if (y + height > pageHeight + BOUNDS_EPSILON) return false
  return true
}

function unionCompatibleBboxes(boxes) {
  if (!boxes.length || boxes.some(bbox => !validBbox(bbox))) return null

  const first = boxes[0]
  const unit = String(first.unit).trim()
  const pageWidth = Number(first.page_width)
  const pageHeight = Number(first.page_height)
  if (boxes.some(bbox => String(bbox.unit).trim() !== unit
    || Number(bbox.page_width) !== pageWidth
    || Number(bbox.page_height) !== pageHeight)) return null

  const x = Math.min(...boxes.map(bbox => Number(bbox.x)))
  const y = Math.min(...boxes.map(bbox => Number(bbox.y)))
  const right = Math.max(...boxes.map(bbox => Number(bbox.x) + Number(bbox.width)))
  const bottom = Math.max(...boxes.map(bbox => Number(bbox.y) + Number(bbox.height)))

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
    unit,
    page_width: pageWidth,
    page_height: pageHeight
  }
}

/**
 * Resolve a verbatim evidence quote to the sidecar line boxes that contain its
 * only exact occurrence. The caller must supply the same lines used to build
 * the evidence excerpt (or a containing sequence of sidecar lines).
 *
 * This function deliberately returns null when exact character mapping or box
 * compatibility cannot be proven. It never performs fuzzy text matching.
 */
export function locateEvidenceQuoteBbox({ evidenceExcerpt, evidenceQuote, lines } = {}) {
  const excerpt = String(evidenceExcerpt ?? '')
  const quote = String(evidenceQuote ?? '')
  if (!excerpt || !quote || !quote.trim()) return null

  const quoteOffsetInExcerpt = excerpt.indexOf(quote)
  if (quoteOffsetInExcerpt < 0) return null
  // Advance by one character so overlapping repeats (for example “aaa” / “aa”)
  // are also treated as ambiguous.
  if (excerpt.indexOf(quote, quoteOffsetInExcerpt + 1) >= 0) return null

  const usableLines = normalizedLineEntries(lines)
  if (!usableLines.length) return null

  const reconstructed = usableLines.map(line => line.text).join('\n')
  const excerptOffsetInLines = reconstructed.indexOf(excerpt)
  if (excerptOffsetInLines < 0) return null

  const quoteStart = excerptOffsetInLines + quoteOffsetInExcerpt
  const quoteEnd = quoteStart + quote.length
  const matchedLines = lineCharacterRanges(usableLines)
    .filter(line => line.start < quoteEnd && line.end > quoteStart)

  if (!matchedLines.length) return null
  return unionCompatibleBboxes(matchedLines.map(line => line.bbox))
}
