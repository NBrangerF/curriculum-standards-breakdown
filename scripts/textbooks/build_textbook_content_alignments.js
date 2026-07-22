#!/usr/bin/env node

/**
 * Build page-backed textbook content nodes and automatic curriculum alignments.
 *
 * The complete PDF text/layout sidecar is written to the external textbook
 * library. Only compact nodes, evidence excerpts and alignment edges are
 * written to the repository's derived edition records.
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const CURRENT_PATH = join(ROOT, 'data/textbooks/library-state/CURRENT.json')
const STRUCTURE_ROOT = join(ROOT, 'data/textbooks/derived/by-edition')
const ALIGNMENT_INDEX_PATH = join(ROOT, 'data/textbooks/derived/textbook_standard_alignment_index.json')
const CAPABILITY_ROOT = join(ROOT, 'public/data/capability_graph/by_code')
const STANDARD_ROOT = join(ROOT, 'public/data/by_subject')
const DEFAULT_LIBRARY_ROOT = process.env.TEXTBOOK_LIBRARY_ROOT || '/Volumes/X9 Pro/kebiao-library'
const PILOT_EDITION = 'ed_9d4028e2ab482520d0aa'
const SCHEMA_VERSION = 2
const PARSER_VERSION = 'textbook-content-pdfjs-v3'
const ALIGNER_VERSION = 'component-evidence-hybrid-v3'
const SIDECAR_VERSION = 'textbook-content-v2'
const MAX_EVIDENCE_TEXT = 320
const BODY_INFERRED_UNIT_SOURCE = 'body_inferred_unit'

const NON_INSTRUCTIONAL_PAGE_PATTERN = /(?:\bISBN\b|\bCIP\b|版权所有|出版发行|责任编辑|责任校对|封面设计|版式设计|印刷(?:厂|时间)?|定价|邮政编码|邮编|联系电话|质量问题|联系调换|著作权|图书在版编目|未经许可|不得翻印)/iu
const DECLARATIVE_EXPERIMENT_PATTERN = /^(?:实验(?:结果)?(?:表明|发现)|研究(?:结果)?(?:表明|发现)|事实表明|科学家.{0,18}(?:发现|研究)|由此可知|观察可知|实验是|实验很快|实验观察的内容|实验室(?:里|中)|探究(?:的|是|作为).{0,20}(?:场所|过程|活动))/u
const ENGINEERING_ANCHOR_PATTERNS = [
  /(?:工程|技术设计|工程任务|工程问题)/u,
  /(?:设计方案|原型|装置设计|产品设计|系统设计)/u,
  /(?:模型制作|制作.{0,12}(?:模型|装置|产品)|建造)/u,
  /(?:材料选择|测试.{0,8}(?:改进|迭代)|迭代改进)/u
]

const SCIENCE_CORE_WHITELIST = {
  chemistry: new Set([1, 2]),
  physics: new Set([3, 4]),
  biology: new Set([5, 6, 7, 8]),
  geography: new Set([9, 10, 11])
}

const SUBJECT_MAPPINGS = {
  chinese: 'chinese',
  math: 'math',
  english: 'english',
  pe: 'pe',
  morality_law: 'morality_law',
  science: 'science',
  physics: 'science',
  chemistry: 'science',
  biology: 'science',
  geography: 'science',
  history: 'morality_law',
  art: 'arts',
  music: 'arts',
  arts: 'arts',
  labor: 'labor',
  information_technology: 'information_technology'
}

const ACTIVITY_HEADINGS = new Map([
  ['口语交际', 'activity'], ['习作', 'activity'], ['写作', 'activity'],
  ['语文园地', 'activity'], ['综合性学习', 'activity'], ['快乐读书吧', 'activity'],
  ['交流平台', 'activity'], ['词句段运用', 'activity'], ['日积月累', 'activity'],
  ['阅读链接', 'activity'], ['小练笔', 'exercise'], ['练习', 'exercise'],
  ['复习', 'activity'], ['实验', 'activity'], ['探究', 'activity'],
  ['project', 'activity'], ['grammarfocus', 'activity'], ['sectiona', 'section'],
  ['sectionb', 'section'], ['selfcheck', 'exercise'], ['review', 'activity']
])

const TASK_VERB_PATTERN = /(?:朗读|默读|阅读|背诵|复述|说说|想想|想一想|找出|画出|写一写|写出|写下|小练笔|练一练|完成|讨论|交流|比较|计算|解答|证明|观察|实验|探究|调查|制作|设计|抄写|体会|概括|回答|选择|填空|判断|表决|汇报)/iu
const TASK_START_PATTERN = /^(?:(?:有感情地|正确、流利地|分角色|用较快的速度|快速)?(?:朗读|默读|阅读|背诵|复述)|读(?:课文|下面|一读|读)|说说|想想|想一想|先想想|找出|画出|写一写|写出|写下|小练笔|练一练|完成|讨论|交流|计算|解答|证明|实验|探究|调查|制作|设计|抄写|回答|选择|填空|判断|根据|联系|结合|借助|对照|围绕|从课文|课文中|你读|提出自己|带着问题|下面(?:每|这些|各|两)|比较(?:每|下面|两组|这些|它们|与)|观察(?:下面|图|实验)|用(?:自己的话|较快|一句话|具体|恰当|下面|所给|列式|简洁)|把.{0,24}(?:写|填|画|完成))/iu

const CUE_RULES = [
  { id: 'main_content', source: /(?:围绕.{0,16}写了哪些内容|主要内容|概括.{0,10}内容|提取.{0,8}(?:信息|要点))/u, target: /(?:获取|概括|提取).{0,12}(?:主要内容|主要信息|关键信息|要点)|主要内容/u, score: 0.9, allowCueOnly: true, preferredCode: /-RE-/u },
  { id: 'read_aloud', source: /(?:有感情地|分角色)?朗读|背诵|复述/u, target: /朗读|背诵|复述|语气|重音|节奏/u, score: 0.84, allowCueOnly: true },
  { id: 'emotion', source: /(?:体会|表达|蕴含|感受|喜爱|抒发).{0,12}(?:感情|情感|感受|情意)|感情的方法/u, target: /感情|情感|感受|审美|表达独特感受/u, score: 0.86 },
  { id: 'meaning', source: /(?:句子|词语|这句话).{0,14}(?:含义|意思)|理解.{0,8}(?:词句|句子)/u, target: /(?:理解|体会).{0,10}(?:词句|句子|含义|意思)|语境/u, score: 0.85 },
  { id: 'evidence', source: /(?:联系|结合|根据).{0,16}(?:课文|材料|具体事例|文本)|找出.{0,10}(?:语句|依据)/u, target: /文本.{0,8}(?:依据|证据)|结合.{0,10}(?:材料|具体事例)|有理有据/u, score: 0.8 },
  { id: 'writing', source: /(?:习作|写一种|写一篇|写一段|用文字|小练笔|写出自己的)/u, target: /(?:习作|写作|书面表达|用文字.{0,30}表达|写.{0,8}(?:事物|文章|人物|感受|经历|想象))/u, score: 0.84, allowCueOnly: true, preferredCode: /-CM-005$/u },
  { id: 'oral_discussion', source: /(?:口语交际|倾听|讨论|表决|发表意见)/u, target: /(?:口语|倾听|讨论|交流|表达观点|沟通|发表意见)/u, score: 0.84, allowCueOnly: true, preferredCode: /-CM-001$/u },
  { id: 'oral_speaking', source: /(?:发言|汇报|讲述)/u, target: /(?:发言|讲述|语言得体)/u, score: 0.84, allowCueOnly: true, preferredCode: /-CM-002$/u },
  { id: 'compare', source: /(?:比较|相同|不同|异同|对比)/u, target: /(?:比较|相同|不同|异同|对比)/u, score: 0.82 },
  { id: 'explain', source: /(?:说明|解释|为什么|道理|原因)/u, target: /(?:说明|解释|推理|道理|原因)/u, score: 0.78 },
  { id: 'calculate', source: /(?:计算(?!机)|列式|解答|估算)/u, target: /(?:计算|运算|列式|估算|解答)/u, score: 0.86, allowCueOnly: true },
  { id: 'experiment', source: /(?:实验|观察|探究|记录|猜想|验证)/u, target: /(?:实验|观察|探究|记录|猜想|验证)/u, score: 0.85 },
  { id: 'english_interaction', source: /(?:listen|speak|talk|conversation|role.?play|discuss)/iu, target: /(?:listen|speak|talk|conversation|interaction|communicat)/iu, score: 0.83, allowCueOnly: true },
  { id: 'english_reading', source: /(?:read|reading|main idea|information)/iu, target: /(?:read|reading|main idea|information)/iu, score: 0.81, allowCueOnly: true },
  { id: 'english_writing', source: /(?:write|writing|paragraph|email|letter)/iu, target: /(?:write|writing|paragraph|email|letter)/iu, score: 0.83, allowCueOnly: true }
]

const STOP_GRAMS = new Set([
  '学生', '能够', '学习', '课程', '教材', '内容', '活动', '进行', '通过',
  '基本', '初步', '相关', '要求', '可以', '课文', '单元', '年级', '本的',
  '自己的', '出自己的', '提出自己', '提出自己的', '表达自己的', '中有',
  'the', 'and', 'with', 'from', 'that', 'this'
])

const GENERIC_TOPIC_ANCHORS = new Set([
  '分析', '观察', '说明', '描述', '解释', '应用', '运用', '利用', '认识',
  '了解', '知道', '发现', '探究', '实验', '实验结果', '结果', '记录',
  '交流', '讨论', '问题', '实际问题', '生活', '生产生活', '计算', '运算',
  '意义', '活动', '进一步', '根据问题', '一次', '图象', '表示', '关系',
  '方法', '内容', '过程', '形成', '变化', '特点', '作用', '影响', '重要',
  '发展', '设计', '规律', '资料', '数据', '模型', '评价', '结论',
  '学会使用', '说出我国', '的重要性', '科学技术', '经济发展', '生活中的',
  '自然环境', '公共场所', '表现形式', '主要内容', '朗读', '背诵', '复述',
  '写作', '习作', '口语', '倾听', '发言', '讲述', '测量', '定律', '主要', '不一'
])

const GENERIC_TOPIC_PATTERN = /^(?:能|会|可|初步|基本|进一步|学生)*(?:分析|观察|说明|描述|解释|应用|运用|利用|认识|了解|知道|发现|探究|实验|记录|交流|讨论|计算|测量|设计|评价|比较|问题|内容|过程|方法|结果|意义|作用|影响|特点|规律|定律|资料|数据|模型|生活|发展|主要)+(?:的|地|中|与|和|及|并|等)*$/u

export function stableHash(value, length = 16) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, length)
}

export function stableId(prefix, ...parts) {
  return `${prefix}_${stableHash(parts.map(part => String(part ?? '')).join('\u001f'))}`
}

function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')) }
function readJsonLines(path) { return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse) }
function writeJson(path, value) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`) }
function round(value, digits = 3) { return Number(Number(value || 0).toFixed(digits)) }

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\u0000/g, '')
    .replace(/[\u2000-\u200f\u2028-\u202f\u2060\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactText(value) {
  return normalizeText(value)
    .toLocaleLowerCase('zh-CN')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')
}

function compactHeading(value) {
  return normalizeText(value).replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, '').replace(/\s+/g, '')
}

function excerpt(value) {
  const normalized = normalizeText(value)
  return normalized.length <= MAX_EVIDENCE_TEXT ? normalized : `${normalized.slice(0, MAX_EVIDENCE_TEXT - 1)}…`
}

function gradeBand(grade) {
  if (grade <= 2) return 'H1'
  if (grade <= 4) return 'H2'
  if (grade <= 6) return 'H3'
  return `H4G${grade}`
}

function parseArgs(argv) {
  const args = {
    editionIds: [],
    all: false,
    libraryRoot: DEFAULT_LIBRARY_ROOT,
    structureRoot: STRUCTURE_ROOT,
    alignmentIndex: ALIGNMENT_INDEX_PATH,
    ocr: 'auto',
    ocrPageLimit: 0,
    ocrDpi: 160,
    minScore: 0.52,
    maxStandardsPerNode: 2,
    sidecarOnly: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--edition' || value === '--edition-id') args.editionIds.push(argv[++index])
    else if (value === '--all') args.all = true
    else if (value === '--library-root') args.libraryRoot = resolve(argv[++index])
    else if (value === '--structure-root') args.structureRoot = resolve(argv[++index])
    else if (value === '--alignment-index') args.alignmentIndex = resolve(argv[++index])
    else if (value === '--ocr') args.ocr = argv[++index]
    else if (value === '--ocr-page-limit') args.ocrPageLimit = Number(argv[++index])
    else if (value === '--ocr-dpi') args.ocrDpi = Number(argv[++index])
    else if (value === '--min-score') args.minScore = Number(argv[++index])
    else if (value === '--max-standards-per-node') args.maxStandardsPerNode = Number(argv[++index])
    else if (value === '--sidecar-only') args.sidecarOnly = true
    else if (value === '--help' || value === '-h') args.help = true
    else throw new Error(`Unknown argument: ${value}`)
  }
  if (!['auto', 'off', 'all'].includes(args.ocr)) throw new Error('--ocr must be auto, off, or all')
  if (args.all && args.editionIds.length) throw new Error('--all and --edition are mutually exclusive')
  return args
}

function usage() {
  return `Usage:
  node scripts/textbooks/build_textbook_content_alignments.js --edition ${PILOT_EDITION}
  node scripts/textbooks/build_textbook_content_alignments.js --all

Options:
  --library-root PATH             External kebiao library root
  --ocr auto|off|all              OCR missing pages, disable OCR, or OCR every page
  --ocr-page-limit NUMBER         Per-edition OCR safety limit; 0 means unlimited
  --min-score NUMBER              Minimum semantic match score (default 0.52)
  --max-standards-per-node NUMBER Maximum standard edges per content node (default 2)
  --sidecar-only                  Extract X9 page sidecar without changing repo data`
}

function registryAssets() {
  const current = readJson(CURRENT_PATH)
  const registryPath = join(ROOT, `data/textbooks/library-state/generations/${current.generation_id}/asset_registry.lock.jsonl`)
  return {
    current,
    assets: readJsonLines(registryPath).filter(asset => asset.resource_type === 'student_textbook')
  }
}

function safeAssetPath(libraryRoot, objectPath) {
  const root = resolve(libraryRoot)
  const path = resolve(root, objectPath)
  const rel = relative(root, path)
  if (rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith('/') || !existsSync(path)) {
    throw new Error(`Missing or unsafe textbook object path: ${objectPath}`)
  }
  return path
}

function printedPageMap(structure) {
  return new Map((structure.page_map || []).map(row => [Number(row.pdf_page), row.printed_page ?? null]))
}

function unionBbox(items, pageWidth, pageHeight, unit = 'pdf_point') {
  if (!items.length) return null
  const left = Math.min(...items.map(item => item.x))
  const topOrBottom = Math.min(...items.map(item => item.y))
  const right = Math.max(...items.map(item => item.x + item.width))
  const far = Math.max(...items.map(item => item.y + item.height))
  return {
    x: round(left),
    y: round(topOrBottom),
    width: round(Math.max(0, right - left)),
    height: round(Math.max(0, far - topOrBottom)),
    unit,
    page_width: round(pageWidth),
    page_height: round(pageHeight)
  }
}

export function groupPdfTextItems(items, pageWidth, pageHeight) {
  const normalized = items
    .filter(item => 'str' in item && normalizeText(item.str))
    .map(item => {
      const fontHeight = Math.abs(item.transform?.[3] || item.height || 0)
      const baseline = Number(item.transform?.[5] || 0)
      return {
        text: normalizeText(item.str),
        x: Number(item.transform?.[4] || 0),
        y: Math.max(0, baseline - fontHeight),
        baseline,
        width: Number(item.width || 0),
        height: Math.max(1, fontHeight)
      }
    })
    .sort((a, b) => b.baseline - a.baseline || a.x - b.x)

  const rows = []
  for (const item of normalized) {
    const tolerance = Math.max(2.5, Math.min(8, item.height * 0.34))
    let row = rows.find(candidate => Math.abs(candidate.baseline - item.baseline) <= tolerance)
    if (!row) {
      row = { baseline: item.baseline, items: [] }
      rows.push(row)
    }
    row.items.push(item)
  }
  return rows
    .sort((a, b) => b.baseline - a.baseline)
    .map(row => {
      const sorted = row.items.sort((a, b) => a.x - b.x)
      const parts = []
      let previous = null
      for (const item of sorted) {
        const gap = previous ? item.x - (previous.x + previous.width) : 0
        if (previous && gap > Math.max(1.8, item.height * 0.18)) parts.push(' ')
        parts.push(item.text)
        previous = item
      }
      return {
        text: normalizeText(parts.join('')),
        bbox: unionBbox(sorted, pageWidth, pageHeight)
      }
    })
    .filter(row => row.text)
}

function commandPath(name, fallbacks = []) {
  for (const candidate of [name, ...fallbacks]) {
    try {
      return execFileSync('/usr/bin/env', ['bash', '-lc', `command -v ${candidate}`], { encoding: 'utf8' }).trim()
    } catch {}
    if (candidate.startsWith('/') && existsSync(candidate)) return candidate
  }
  return null
}

export function parseTesseractTsv(tsv, imageWidth = 0, imageHeight = 0) {
  const rows = new Map()
  const lines = String(tsv).split(/\r?\n/)
  const header = lines.shift()?.split('\t') || []
  const columns = new Map(header.map((name, index) => [name, index]))
  for (const line of lines) {
    const values = line.split('\t')
    const text = normalizeText(values[columns.get('text')])
    if (!text || Number(values[columns.get('conf')]) < 0) continue
    const key = ['block_num', 'par_num', 'line_num'].map(name => values[columns.get(name)]).join(':')
    if (!rows.has(key)) rows.set(key, [])
    rows.get(key).push({
      text,
      x: Number(values[columns.get('left')] || 0),
      y: Number(values[columns.get('top')] || 0),
      width: Number(values[columns.get('width')] || 0),
      height: Number(values[columns.get('height')] || 0)
    })
  }
  return [...rows.values()].map(items => ({
    text: normalizeText(items.sort((a, b) => a.x - b.x).map(item => item.text).join(' ')),
    bbox: unionBbox(items, imageWidth, imageHeight, 'pixel')
  })).filter(row => row.text)
}

function ocrPage(pdfPath, pageNumber, workRoot, dpi) {
  const pdftoppm = commandPath('pdftoppm', [
    '/Users/shawn.fsc/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm'
  ])
  const tesseract = commandPath('tesseract', ['/usr/local/bin/tesseract'])
  if (!pdftoppm || !tesseract) return { status: 'ocr_tools_unavailable', lines: [], text: '' }
  mkdirSync(workRoot, { recursive: true })
  const temp = mkdtempSync(join(workRoot, 'content-ocr-'))
  try {
    const prefix = join(temp, `page-${pageNumber}`)
    execFileSync(pdftoppm, ['-f', String(pageNumber), '-l', String(pageNumber), '-singlefile', '-r', String(dpi), '-png', pdfPath, prefix], { stdio: 'pipe', maxBuffer: 32 * 1024 * 1024 })
    const image = `${prefix}.png`
    const tsv = execFileSync(tesseract, [image, 'stdout', '-l', 'chi_sim+eng', '--psm', '6', 'tsv'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    const lines = parseTesseractTsv(tsv)
    return { status: lines.length ? 'ocr_extracted' : 'ocr_empty', lines, text: lines.map(row => row.text).join('\n') }
  } catch (error) {
    return { status: `ocr_failed:${normalizeText(error.message).slice(0, 120)}`, lines: [], text: '' }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

async function extractNativePages(pdfPath) {
  const document = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(pdfPath)),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0
  }).promise
  const pages = []
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false })
      const lines = groupPdfTextItems(content.items, viewport.width, viewport.height)
      pages.push({
        pdf_page: pageNumber,
        page_width: round(viewport.width),
        page_height: round(viewport.height),
        extraction_method: 'pdfjs_text_layer',
        extraction_status: lines.length ? 'native_text' : 'native_text_empty',
        text: lines.map(row => row.text).join('\n'),
        lines
      })
      page.cleanup()
    }
  } finally {
    await document.destroy()
  }
  return pages
}

function reusableOcrPages(args, asset) {
  const path = join(args.libraryRoot, 'derived', SIDECAR_VERSION, asset.sha256, 'pages.jsonl')
  if (!existsSync(path)) return new Map()
  try {
    return new Map(readJsonLines(path)
      .filter(page => (
        page.asset_sha256 === asset.sha256
        && page.edition_id === asset.edition_id
        && Number.isInteger(Number(page.pdf_page))
        && String(page.extraction_method || '').includes('tesseract')
        && Array.isArray(page.lines)
        && page.lines.length > 0
      ))
      .map(page => [Number(page.pdf_page), page]))
  } catch {
    return new Map()
  }
}

async function extractPages(asset, structure, pdfPath, args) {
  const pages = await extractNativePages(pdfPath)
  const nativeUsable = pages.filter(page => compactText(page.text).length >= 20).length
  const nativeRatio = nativeUsable / Math.max(1, pages.length)
  const shouldFillMissing = args.ocr === 'all' || (args.ocr === 'auto' && nativeRatio < 0.72)
  const reusable = reusableOcrPages(args, asset)
  let ocrCount = 0
  let ocrReused = 0
  let ocrSkipped = 0
  const workRoot = join(args.libraryRoot, 'staging/tmp')
  const tocStarts = new Set((structure.toc || []).map(row => Number(row.pdf_page)).filter(Number.isFinite))
  if (shouldFillMissing) {
    for (const page of pages) {
      const cached = reusable.get(page.pdf_page)
      const shouldReuse = cached && (args.ocr === 'all' || compactText(page.text).length < 20)
      if (!shouldReuse) continue
      page.lines = cached.lines
      page.text = cached.text
      page.extraction_method = cached.extraction_method
      page.extraction_status = `${cached.extraction_status || 'ocr_extracted'}:reused`
      ocrCount += 1
      ocrReused += 1
    }
  }
  const ocrCandidates = pages
    .filter(page => (
      !String(page.extraction_method || '').includes('tesseract')
      && (args.ocr === 'all' || (shouldFillMissing && compactText(page.text).length < 20))
    ))
    .sort((a, b) => Number(tocStarts.has(b.pdf_page)) - Number(tocStarts.has(a.pdf_page)) || a.pdf_page - b.pdf_page)
  for (const page of ocrCandidates) {
    if (args.ocrPageLimit > 0 && ocrCount >= args.ocrPageLimit) {
      page.extraction_status = `${page.extraction_status}:ocr_limit_skipped`
      ocrSkipped += 1
      continue
    }
    const result = ocrPage(pdfPath, page.pdf_page, workRoot, args.ocrDpi)
    ocrCount += 1
    if (result.lines.length) {
      page.lines = result.lines
      page.text = result.text
      page.extraction_method = 'pdftoppm_tesseract_chi_sim_eng'
      page.extraction_status = result.status
    } else page.extraction_status = `${page.extraction_status}:${result.status}`
  }
  const printed = printedPageMap(structure)
  for (const page of pages) page.printed_page = printed.get(page.pdf_page) ?? null
  return { pages, nativeRatio: round(nativeRatio, 4), ocrCount, ocrReused, ocrSkipped }
}

function tocKind(kind) {
  return ['part', 'unit', 'chapter', 'lesson', 'section', 'appendix'].includes(kind) ? kind : 'section'
}

export function classifyStructuralHeading(text, subjectSlug = '') {
  const display = normalizeText(text)
  const compact = compactHeading(display)
  if (!compact || compact.length > 70) return null
  const activityKind = ACTIVITY_HEADINGS.get(compact.toLocaleLowerCase('zh-CN'))
  if (activityKind) return { kind: activityKind, title: /[A-Za-z]/.test(display) ? display : compact }
  if (/^第[一二三四五六七八九十百\d]+单元[\p{Letter}\p{Number}《》·：:—-]{0,34}$/u.test(compact)) return { kind: 'unit', title: compact }
  if (/^第[一二三四五六七八九十百\d]+章[\p{Letter}\p{Number}《》·：:—-]{0,34}$/u.test(compact)) return { kind: 'chapter', title: compact }
  if (/^第[一二三四五六七八九十百\d]+节[\p{Letter}\p{Number}《》·：:—-]{0,34}$/u.test(compact)) return { kind: 'section', title: compact }
  if (/^(?:第[一二三四五六七八九十百\d]+课)[\p{Letter}\p{Number}《》·：:—-]{0,34}$/u.test(compact)) return { kind: 'lesson', title: compact }
  const numberedChinese = display.match(/^\*?\s*(\d{1,2})\s*[.、]?\s*(.+)$/u)
  if (numberedChinese) {
    const parts = display.replace(/^\*?\s*\d{1,2}\s*[.、]?\s*/u, '').split(/\s+/).filter(Boolean)
    const title = compactHeading(numberedChinese[2])
    const hanCount = (title.match(/\p{Script=Han}/gu) || []).length
    const cleanTitle = /^[\p{Script=Han}·《》“”‘’（）()—-]{2,22}$/u.test(title)
    const looksLikeVocabulary = parts.length > 3 || /^(?:注释|生字|词语|写字表|识字表)$/u.test(title)
    if (cleanTitle && hanCount >= 2 && hanCount <= 14 && !looksLikeVocabulary && !TASK_VERB_PATTERN.test(title)) {
      return { kind: 'lesson', title: `${numberedChinese[1]}${title}` }
    }
  }
  if (/^(?:lesson|unit|module)\s*[a-z]?\d+[\p{Letter}\p{Number}\s:：—-]{0,42}$/iu.test(display)) return { kind: /lesson/i.test(display) ? 'lesson' : 'unit', title: display }
  if (/^\d+(?:\.\d+){1,2}\s*[\p{Letter}\p{Number}\p{Script=Han}].{1,42}$/u.test(display)) return { kind: 'section', title: display }
  if (subjectSlug === 'english' && /^(?:section\s*[a-z]|grammar\s*focus|project|reading|writing)$/iu.test(display)) return { kind: 'section', title: display }
  return null
}

function objectiveText(text) {
  const normalized = normalizeText(text)
  if (/^[◎●○•]\s*/u.test(normalized)) {
    const objective = normalized.replace(/^[◎●○•]\s*/u, '')
    return compactText(objective).length >= 4 ? objective : null
  }
  if (/^(?:学习目标|单元目标|本单元学习|本课目标)[:：]?/u.test(normalized)) return compactText(normalized).length >= 4 ? normalized : null
  return null
}

function isExerciseText(text) {
  const normalized = normalizeText(text).replace(/^[◇◆◎●○•*]\s*/u, '')
  if (DECLARATIVE_EXPERIMENT_PATTERN.test(normalized)) return false
  if (/^计算机/u.test(normalized)) return false
  return normalized.length >= 7 && normalized.length <= 360 && TASK_VERB_PATTERN.test(normalized) && TASK_START_PATTERN.test(normalized)
}

function isTocLikePage(page) {
  const lines = page.lines.map(line => normalizeText(line.text)).filter(Boolean)
  const head = compactText(lines.slice(0, 12).join(' '))
  if (head.includes('目录')) return true
  const leaderLines = lines.filter(line => /(?:\.{4,}|…{2,}|·{4,})\s*[A-Z]?[0-9]{1,3}\s*$/iu.test(line)).length
  const numberedRows = lines.filter(line => /(?:第[一二三四五六七八九十百\d]+[章节课单元]|(?:starter\s+)?unit\s+\d+|\d+(?:\.\d+)+).{0,60}\s+[A-Z]?[0-9]{1,3}\s*$/iu.test(line)).length
  const indexRows = lines.filter(line => /^\s*\d{1,2}\s+[\p{Script=Han}A-Za-z][^。！？?!]{1,80}$/u.test(line)).length
  return leaderLines >= 2 || numberedRows >= 5 || indexRows >= 5
}

function isNonInstructionalPage(page) {
  const lines = (page.lines || []).map(line => normalizeText(line.text)).filter(Boolean)
  if (!lines.length) return true
  const matches = lines.filter(line => NON_INSTRUCTIONAL_PAGE_PATTERN.test(line)).length
  return matches >= 2 || (matches >= 1 && compactText(lines.join(' ')).length < 260)
}

function isPublishedTocEntry(entry) {
  return entry.review_status === 'approved'
    || (entry.source === BODY_INFERRED_UNIT_SOURCE
      && entry.review_status === 'machine_checked'
      && entry.publication_status === 'published')
}

function positivePdfPage(value) {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : null
}

function locatableTocRange(entry, openEnded = false) {
  if (!isPublishedTocEntry(entry)) return null
  const start = positivePdfPage(entry.pdf_page)
  if (!start) return null
  const rawEnd = positivePdfPage(entry.end_pdf_page)
  return {
    start,
    end: rawEnd ? Math.max(start, rawEnd) : (openEnded ? Number.MAX_SAFE_INTEGER : start)
  }
}

function isLocatablePublishedTocEntry(entry) {
  return Boolean(locatableTocRange(entry))
}

export function normalizeTocEntries(entries) {
  const normalized = []
  const mergedIds = new Map()
  for (let index = 0; index < entries.length; index += 1) {
    const current = entries[index]
    const next = entries[index + 1]
    const splitUnitHeading = next
      && current.kind === 'unit'
      && next.kind === 'unit'
      && current.level === next.level
      && (current.parent_id ?? null) === (next.parent_id ?? null)
      && /^第[一二三四五六七八九十百\d]+单元$/u.test(normalizeText(current.title))
      && !/^第[一二三四五六七八九十百\d]+单元/u.test(normalizeText(next.title))
      && positivePdfPage(next.pdf_page) === positivePdfPage(current.pdf_page) + 1
    if (!splitUnitHeading) {
      normalized.push(current)
      continue
    }
    const printedSuffix = String(next.printed_page || '')
    const continuation = normalizeText(next.title).replace(new RegExp(`${printedSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'u'), '').trim()
    if (!continuation) {
      normalized.push(current)
      continue
    }
    normalized.push({
      ...current,
      title: `${normalizeText(current.title)} ${continuation}`,
      end_pdf_page: Math.max(positivePdfPage(current.pdf_page), positivePdfPage(next.end_pdf_page) || positivePdfPage(next.pdf_page)),
      confidence: Math.min(Number(current.confidence || 1), Number(next.confidence || 1)),
      source: `${current.source || 'toc'}+split_heading_merge`
    })
    mergedIds.set(next.entry_id, current.entry_id)
    index += 1
  }
  const entryIds = new Set(normalized.map(entry => entry.entry_id))
  return normalized.map((entry, index) => {
    let parentId = mergedIds.get(entry.parent_id) || entry.parent_id
    if (parentId && !entryIds.has(parentId)) {
      const nearestParent = [...normalized.slice(0, index)].reverse().find(candidate => Number(candidate.level) < Number(entry.level))
      parentId = nearestParent?.entry_id || null
    }
    return { ...entry, parent_id: parentId }
  })
}

function chineseOrdinal(value) {
  if (/^\d+$/u.test(value)) return Number(value)
  const digits = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  if (value === '十') return 10
  if (value.includes('十')) {
    const [tens, ones] = value.split('十')
    return (tens ? digits[tens] || 0 : 1) * 10 + (ones ? digits[ones] || 0 : 0)
  }
  return digits[value] || null
}

function inferredHeadingAnchor(text, subjectSlug) {
  const display = normalizeText(text)
  const compact = compactHeading(display)
  let match = compact.match(/^第([一二三四五六七八九十百\d]+)(单元|章|课|节)/u)
  if (match) {
    const kinds = { 单元: 'unit', 章: 'chapter', 课: 'lesson', 节: 'section' }
    return {
      family: `explicit_${kinds[match[2]]}`,
      kind: kinds[match[2]],
      ordinal: chineseOrdinal(match[1]),
      title: compact,
      confidence: ['unit', 'chapter'].includes(kinds[match[2]]) ? 0.95 : 0.92
    }
  }
  match = display.match(/^(?:starter\s+)?(unit|module|lesson)\s*([a-z]?\d+)/iu)
  if (match) {
    const kind = /lesson/iu.test(match[1]) ? 'lesson' : 'unit'
    const ordinal = Number(match[2].match(/\d+/u)?.[0])
    return { family: `explicit_${kind}`, kind, ordinal, title: display, confidence: 0.94 }
  }
  const heading = classifyStructuralHeading(display, subjectSlug)
  if (!heading || !['lesson', 'section'].includes(heading.kind)) return null
  match = compact.match(/^(\d{1,2})(?!\.)/u)
  if (match && heading.kind === 'lesson') {
    return { family: 'numbered_lesson', kind: 'lesson', ordinal: Number(match[1]), title: heading.title, confidence: 0.86 }
  }
  match = display.match(/^(\d+(?:\.\d+){1,2})\s*/u)
  if (match) {
    const parts = match[1].split('.').map(Number)
    return { family: `decimal_section_${parts.length}`, kind: 'section', ordinal: parts.reduce((sum, value) => sum * 100 + value, 0), title: heading.title, confidence: 0.84 }
  }
  return null
}

function longestConsecutiveAnchorSequence(anchors) {
  const candidates = [...new Map(anchors
    .sort((a, b) => a.pdf_page - b.pdf_page || a.ordinal - b.ordinal)
    .map(anchor => [`${anchor.pdf_page}:${anchor.ordinal}`, anchor])).values()]
  const states = []
  for (let index = 0; index < candidates.length; index += 1) {
    const anchor = candidates[index]
    let bestPrevious = -1
    for (let previous = 0; previous < index; previous += 1) {
      const candidate = candidates[previous]
      if (candidate.pdf_page >= anchor.pdf_page || candidate.ordinal + 1 !== anchor.ordinal) continue
      if (bestPrevious < 0 || states[previous].length > states[bestPrevious].length) bestPrevious = previous
    }
    states.push({
      length: bestPrevious < 0 ? 1 : states[bestPrevious].length + 1,
      previous: bestPrevious
    })
  }
  let end = -1
  for (let index = 0; index < states.length; index += 1) {
    if (end < 0 || states[index].length > states[end].length) end = index
  }
  const sequence = []
  while (end >= 0) {
    sequence.push(candidates[end])
    end = states[end].previous
  }
  return sequence.reverse()
}

function coherentAnchorSequence(anchors, family = '') {
  const unique = [...new Map(anchors
    .sort((a, b) => a.pdf_page - b.pdf_page || a.ordinal - b.ordinal)
    .map(anchor => [`${anchor.pdf_page}:${anchor.ordinal}`, anchor])).values()]
  const byPage = [...new Map(unique.map(anchor => [anchor.pdf_page, anchor])).values()]
  if (byPage.length < 2) return []
  // Numbered mathematics units often coexist with numbered examples and
  // exercises, so prefer the strongest page-ordered 1,2,3... spine even when
  // the surrounding noise happens to look mostly increasing.
  if (family === 'numbered_lesson') {
    const consecutive = longestConsecutiveAnchorSequence(anchors)
    // The fallback exists specifically for noisy books where local exercise
    // counters broke the ordinary coherence ratio. Requiring a long spine
    // avoids promoting a short 1-2-3 exercise sequence to top-level units.
    if (consecutive.length >= 6 && consecutive[0].ordinal === 1) return consecutive
  }
  let increasing = 0
  for (let index = 1; index < byPage.length; index += 1) {
    if (byPage[index].ordinal > byPage[index - 1].ordinal) increasing += 1
  }
  if (increasing / (byPage.length - 1) >= 0.8) return byPage
  return []
}

/**
 * Conservatively recover locatable units from a native PDF text layer when no
 * published TOC exists. OCR-only books intentionally remain scope-only: a few
 * OCR pages are not enough evidence to synthesize a whole-book hierarchy.
 */
export function recoverBodyInferredUnits(asset, structure, pages) {
  if ((structure.toc || []).some(isPublishedTocEntry)) {
    return { status: 'not_needed', reason: 'published_toc_available', entries: [], native_text_ratio: 1 }
  }

  const nativePages = pages.filter(page =>
    page.extraction_method === 'pdfjs_text_layer'
    && compactText(page.text).length >= 80
  )
  const nativeTextRatio = round(nativePages.length / Math.max(1, pages.length), 4)
  if (nativePages.length < 5 || nativeTextRatio < 0.35) {
    return {
      status: 'scope_only',
      reason: 'insufficient_native_body_text',
      entries: [],
      native_text_ratio: nativeTextRatio
    }
  }

  const anchorsByFamily = new Map()
  for (const page of nativePages) {
    if (isTocLikePage(page) || isNonInstructionalPage(page)) continue
    // Structural unit/chapter headings are page-level anchors and normally
    // occur in the page header. Looking through the full page lets numbered
    // exercises masquerade as peer lessons; a page with several exercises was
    // then discarded wholesale, including its valid first-line heading.
    const pageAnchors = (page.lines || []).slice(0, 6)
      .map(line => ({ ...inferredHeadingAnchor(line.text, asset.subject_slug), line }))
      .filter(anchor => anchor.family && Number.isFinite(anchor.ordinal))
    // A page listing several structural titles is almost certainly a contents
    // or index page even when it has no dotted leaders.
    if (pageAnchors.length > 2) continue
    for (const anchor of pageAnchors) {
      if (!anchorsByFamily.has(anchor.family)) anchorsByFamily.set(anchor.family, [])
      anchorsByFamily.get(anchor.family).push({
        ...anchor,
        pdf_page: page.pdf_page,
        printed_page: page.printed_page ?? null,
        extraction_method: page.extraction_method
      })
    }
  }

  const priorities = ['explicit_unit', 'explicit_chapter', 'explicit_lesson', 'numbered_lesson', 'decimal_section_2', 'decimal_section_3']
  let selected = []
  let selectedFamily = null
  for (const family of priorities) {
    const coherent = coherentAnchorSequence(anchorsByFamily.get(family) || [], family)
    const minimum = ['numbered_lesson', 'decimal_section_2', 'decimal_section_3'].includes(family) ? 3 : 2
    if (coherent.length >= minimum) {
      selected = coherent
      selectedFamily = family
      break
    }
  }
  if (!selected.length) {
    return {
      status: 'scope_only',
      reason: 'no_coherent_native_heading_sequence',
      entries: [],
      native_text_ratio: nativeTextRatio
    }
  }

  const instructionalPages = nativePages.filter(page => !isTocLikePage(page) && !isNonInstructionalPage(page))
  const lastInstructionalPage = Math.max(...instructionalPages.map(page => page.pdf_page), selected.at(-1).pdf_page)
  const printed = printedPageMap(structure)
  const entries = selected.map((anchor, index) => {
    const next = selected[index + 1]
    const endPdfPage = next ? next.pdf_page - 1 : lastInstructionalPage
    const evidenceText = excerpt(anchor.line.text)
    return {
      entry_id: stableId('tcu', asset.edition_id, BODY_INFERRED_UNIT_SOURCE, anchor.kind, anchor.pdf_page, anchor.title),
      parent_id: null,
      level: 1,
      kind: anchor.kind,
      title: anchor.title,
      printed_page: anchor.printed_page,
      end_printed_page: printed.get(endPdfPage) ?? null,
      pdf_page: anchor.pdf_page,
      end_pdf_page: endPdfPage,
      confidence: round(anchor.confidence * (0.9 + Math.min(0.1, nativeTextRatio / 10)), 3),
      source: BODY_INFERRED_UNIT_SOURCE,
      review_status: 'machine_checked',
      publication_status: 'published',
      inference_family: selectedFamily,
      evidence_text: evidenceText,
      evidence_excerpt_hash: createHash('sha256').update(evidenceText).digest('hex'),
      evidence_bbox: anchor.line.bbox || undefined,
      evidence_source: anchor.extraction_method
    }
  })
  return {
    status: 'recovered',
    reason: 'coherent_native_heading_sequence',
    family: selectedFamily,
    entries,
    native_text_ratio: nativeTextRatio
  }
}

function expandedTaskText(lines, index) {
  let value = lines[index].text
  for (let offset = 1; offset <= 2 && value.length < MAX_EVIDENCE_TEXT; offset += 1) {
    if (/[。！？?!；;]$/u.test(value)) break
    const next = lines[index + offset]?.text
    if (!next || classifyStructuralHeading(next) || objectiveText(next)) break
    value = `${value}${next}`
  }
  return excerpt(value)
}

function activeTocEntry(toc, pageNumber) {
  const page = positivePdfPage(pageNumber)
  if (!page) return null
  const entries = toc
    .filter(row => {
      const range = locatableTocRange(row, true)
      return range && range.start <= page && range.end >= page
    })
    .sort((a, b) => Number(b.level || 0) - Number(a.level || 0) || positivePdfPage(b.pdf_page) - positivePdfPage(a.pdf_page))
  return entries[0] || null
}

function topTocUnit(toc, pageNumber) {
  const page = positivePdfPage(pageNumber)
  if (!page) return null
  const entries = toc
    .filter(row => {
      const range = locatableTocRange(row, true)
      return range && range.start <= page && range.end >= page
    })
    .sort((a, b) => Number(a.level || 0) - Number(b.level || 0) || positivePdfPage(b.pdf_page) - positivePdfPage(a.pdf_page))
  return entries[0] || null
}

function evidenceSpan({ asset, nodeId, page, role, text, bbox, source }) {
  const value = excerpt(text)
  const textHash = createHash('sha256').update(value).digest('hex')
  return {
    span_id: stableId('tes', asset.edition_id, page.pdf_page, role, value),
    node_id: nodeId,
    edition_id: asset.edition_id,
    asset_sha256: asset.sha256,
    pdf_page: page.pdf_page,
    printed_page: page.printed_page ?? null,
    role,
    evidence_role: role,
    text: value,
    excerpt: value,
    text_hash: textHash,
    excerpt_hash: textHash,
    bbox: bbox || undefined,
    source,
    parser_version: PARSER_VERSION
  }
}

export function buildContentGraph(asset, structure, pages) {
  const toc = (structure.toc || []).filter(isLocatablePublishedTocEntry)
  const firstContentPage = Math.min(...toc.map(row => positivePdfPage(row.pdf_page)), Number.MAX_SAFE_INTEGER)
  const spans = []
  const nodes = []
  const nodeByToc = new Map()
  for (const entry of toc.sort((a, b) => Number(a.pdf_page || 0) - Number(b.pdf_page || 0) || a.entry_id.localeCompare(b.entry_id))) {
    const range = locatableTocRange(entry)
    const nodeId = stableId('tcn', asset.edition_id, 'toc', entry.entry_id)
    const parentId = entry.parent_id ? nodeByToc.get(entry.parent_id) || null : null
    const inferredSpan = entry.source === BODY_INFERRED_UNIT_SOURCE && entry.evidence_text
      ? evidenceSpan({
          asset,
          nodeId,
          page: {
            pdf_page: entry.pdf_page,
            printed_page: entry.printed_page ?? null,
            extraction_method: entry.evidence_source || 'pdfjs_text_layer'
          },
          role: 'heading',
          text: entry.evidence_text,
          bbox: entry.evidence_bbox,
          source: entry.evidence_source || 'pdfjs_text_layer'
        })
      : null
    const node = {
      node_id: nodeId,
      parent_id: parentId,
      unit_id: entry.entry_id,
      toc_entry_id: entry.entry_id,
      kind: tocKind(entry.kind),
      title: entry.title,
      pdf_page: range.start,
      end_pdf_page: range.end,
      printed_page: entry.printed_page ?? null,
      end_printed_page: entry.end_printed_page ?? null,
      text_excerpt: entry.title,
      evidence_span_ids: inferredSpan ? [inferredSpan.span_id] : [],
      source: entry.source === BODY_INFERRED_UNIT_SOURCE ? BODY_INFERRED_UNIT_SOURCE : 'verified_toc',
      confidence: entry.confidence ?? 0.9,
      review_status: entry.review_status === 'approved' ? 'approved' : 'machine_checked',
      publication_status: entry.publication_status
    }
    nodes.push(node)
    if (inferredSpan) spans.push(inferredSpan)
    nodeByToc.set(entry.entry_id, nodeId)
  }

  let lastContext = { unitId: null, nodeId: null, page: 0 }
  const contextualNodes = []
  for (const page of pages) {
    const tocEntry = activeTocEntry(toc, page.pdf_page)
    const unitEntry = topTocUnit(toc, page.pdf_page)
    const unitId = unitEntry?.entry_id || tocEntry?.entry_id || null
    const tocNodeId = tocEntry ? nodeByToc.get(tocEntry.entry_id) : null
    if (lastContext.unitId !== unitId) lastContext = { unitId, nodeId: tocNodeId, page: page.pdf_page }
    if (!lastContext.nodeId) lastContext.nodeId = tocNodeId

    const semanticPage = page.pdf_page >= firstContentPage && Boolean(unitId) && !isTocLikePage(page)
    if (!semanticPage) continue

    for (let lineIndex = 0; lineIndex < page.lines.length; lineIndex += 1) {
      const line = page.lines[lineIndex]
      const normalized = normalizeText(line.text)
      if (!normalized) continue
      const heading = classifyStructuralHeading(normalized, asset.subject_slug)
      const duplicatesToc = heading && toc.some(entry => compactHeading(entry.title) === compactHeading(heading.title) && Number(entry.pdf_page) === page.pdf_page)
      if (heading && !duplicatesToc) {
        const nodeId = stableId('tcn', asset.edition_id, heading.kind, page.pdf_page, heading.title)
        const span = evidenceSpan({ asset, nodeId, page, role: 'heading', text: normalized, bbox: line.bbox, source: page.extraction_method })
        const node = {
          node_id: nodeId,
          parent_id: tocNodeId,
          unit_id: unitId,
          kind: heading.kind,
          title: heading.title,
          pdf_page: page.pdf_page,
          end_pdf_page: page.pdf_page,
          printed_page: page.printed_page ?? null,
          end_printed_page: page.printed_page ?? null,
          text_excerpt: span.text,
          evidence_span_ids: [span.span_id],
          source: 'body_heading',
          confidence: 0.9,
          review_status: 'machine_checked'
        }
        nodes.push(node)
        contextualNodes.push(node)
        spans.push(span)
        lastContext = { unitId, nodeId, page: page.pdf_page }
        continue
      }

      const objective = objectiveText(normalized)
      if (objective) {
        const nodeId = stableId('tcn', asset.edition_id, 'objective', page.pdf_page, objective)
        const span = evidenceSpan({ asset, nodeId, page, role: 'objective', text: objective, bbox: line.bbox, source: page.extraction_method })
        nodes.push({
          node_id: nodeId,
          parent_id: lastContext.nodeId || tocNodeId,
          unit_id: unitId,
          kind: 'objective',
          title: objective,
          pdf_page: page.pdf_page,
          end_pdf_page: page.pdf_page,
          printed_page: page.printed_page ?? null,
          end_printed_page: page.printed_page ?? null,
          text_excerpt: span.text,
          evidence_span_ids: [span.span_id],
          source: 'body_objective_marker',
          confidence: 0.96,
          review_status: 'machine_checked'
        })
        spans.push(span)
        continue
      }

      if (isExerciseText(normalized)) {
        const taskText = expandedTaskText(page.lines, lineIndex)
        const nodeId = stableId('tcn', asset.edition_id, 'exercise', page.pdf_page, taskText)
        if (nodes.some(node => node.node_id === nodeId)) continue
        const span = evidenceSpan({ asset, nodeId, page, role: 'exercise', text: taskText, bbox: line.bbox, source: page.extraction_method })
        nodes.push({
          node_id: nodeId,
          parent_id: lastContext.nodeId || tocNodeId,
          unit_id: unitId,
          kind: 'exercise',
          title: excerpt(taskText),
          pdf_page: page.pdf_page,
          end_pdf_page: page.pdf_page,
          printed_page: page.printed_page ?? null,
          end_printed_page: page.printed_page ?? null,
          text_excerpt: span.text,
          evidence_span_ids: [span.span_id],
          source: 'task_verb_pattern',
          confidence: 0.86,
          review_status: 'machine_checked'
        })
        spans.push(span)
      }
    }
  }

  contextualNodes.sort((a, b) => a.unit_id?.localeCompare(b.unit_id || '') || a.pdf_page - b.pdf_page || a.node_id.localeCompare(b.node_id))
  for (let index = 0; index < contextualNodes.length; index += 1) {
    const node = contextualNodes[index]
    const next = contextualNodes.slice(index + 1).find(candidate => candidate.unit_id === node.unit_id)
    const unit = toc.find(entry => entry.entry_id === node.unit_id)
    const unitEnd = locatableTocRange(unit || {})?.end || node.pdf_page
    node.end_pdf_page = next ? Math.max(node.pdf_page, next.pdf_page - 1) : Math.max(node.pdf_page, unitEnd)
  }

  const pageNodes = pages.filter(page => normalizeText(page.text)).map(page => {
    const tocEntry = activeTocEntry(toc, page.pdf_page)
    const unitEntry = topTocUnit(toc, page.pdf_page)
    return {
      node_id: stableId('tcn', asset.edition_id, 'page', page.pdf_page),
      parent_id: tocEntry ? nodeByToc.get(tocEntry.entry_id) || null : null,
      unit_id: unitEntry?.entry_id || tocEntry?.entry_id || null,
      kind: 'page',
      title: `PDF 第 ${page.pdf_page} 页`,
      pdf_page: page.pdf_page,
      end_pdf_page: page.pdf_page,
      printed_page: page.printed_page ?? null,
      end_printed_page: page.printed_page ?? null,
      evidence_span_ids: [],
      source: page.extraction_method,
      confidence: page.extraction_method === 'pdfjs_text_layer' ? 0.98 : 0.8,
      review_status: 'machine_checked'
    }
  })

  const uniqueNodes = [...new Map([...nodes, ...pageNodes].map(node => [node.node_id, node])).values()]
  const uniqueSpans = [...new Map(spans.map(span => [span.span_id, span])).values()]
  const withCanonicalPages = uniqueNodes.map(node => ({
    ...node,
    pdf_page_start: node.pdf_page ?? null,
    pdf_page_end: node.end_pdf_page ?? node.pdf_page ?? null
  }))
  return {
    contentNodes: withCanonicalPages.sort((a, b) => Number(a.pdf_page || 0) - Number(b.pdf_page || 0) || a.kind.localeCompare(b.kind) || a.node_id.localeCompare(b.node_id)),
    evidenceSpans: uniqueSpans.sort((a, b) => a.pdf_page - b.pdf_page || a.span_id.localeCompare(b.span_id))
  }
}

function grams(value, min = 2, max = 5) {
  const compact = compactText(value)
  const result = new Set()
  const latinWords = normalizeText(value).toLocaleLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []
  for (const word of latinWords) if (!STOP_GRAMS.has(word)) result.add(word)
  for (let size = min; size <= Math.min(max, compact.length); size += 1) {
    for (let index = 0; index <= compact.length - size; index += 1) {
      const gram = compact.slice(index, index + size)
      if (!STOP_GRAMS.has(gram) && !/^\d+$/.test(gram)) result.add(gram)
    }
  }
  return result
}

export function lexicalComponentScore(sourceText, componentText) {
  const source = compactText(sourceText)
  const target = compactText(componentText).replace(/^学生能够/u, '')
  if (!source || !target) return { score: 0, keywords: [] }
  if (target.length >= 4 && source.includes(target)) return { score: 0.98, keywords: [target] }
  if (source.length >= 6 && target.includes(source)) return { score: 0.9, keywords: [source] }
  const sourceGrams = grams(sourceText)
  const targetGrams = grams(componentText)
  const common = [...targetGrams].filter(token => sourceGrams.has(token))
  if (!common.length) return { score: 0, keywords: [] }
  const weight = token => Math.max(1, token.length - 1) ** 1.6
  const commonWeight = common.reduce((sum, token) => sum + weight(token), 0)
  const targetWeight = [...targetGrams].reduce((sum, token) => sum + weight(token), 0)
  const sourceWeight = [...sourceGrams].reduce((sum, token) => sum + weight(token), 0)
  const coverage = commonWeight / Math.max(1, targetWeight)
  const precision = commonWeight / Math.max(1, sourceWeight)
  const longest = Math.max(...common.map(token => token.length))
  const boost = longest >= 5 ? 0.22 : longest >= 4 ? 0.15 : longest >= 3 ? 0.08 : 0
  const phraseFloor = longest >= 5 ? 0.88 : longest >= 4 ? 0.76 : 0
  return {
    score: Math.max(phraseFloor, Math.min(0.96, coverage * 0.65 + Math.min(1, precision * 3) * 0.13 + boost)),
    keywords: common.sort((a, b) => b.length - a.length || a.localeCompare(b)).filter((token, index, all) => !all.slice(0, index).some(parent => parent.includes(token))).slice(0, 8)
  }
}

function cueScore(sourceText, componentText, standardCode = '') {
  let best = { score: 0, cue: null, allowCueOnly: false }
  for (const rule of CUE_RULES) {
    if (!rule.source.test(sourceText) || !rule.target.test(componentText)) continue
    const preferredBoost = rule.preferredCode?.test(standardCode) ? 0.035 : 0
    const lengthBoost = Math.min(0.045, 0.45 / Math.max(1, compactText(componentText).length))
    const score = Math.min(0.98, rule.score + preferredBoost + lengthBoost)
    if (score > best.score) best = { score, cue: rule.id, allowCueOnly: Boolean(rule.allowCueOnly) }
  }
  return best
}

function loadStandardScopes() {
  const map = new Map()
  for (const file of readdirSync(STANDARD_ROOT).filter(name => name.endsWith('.json')).sort()) {
    const subjectSlug = basename(file, '.json')
    const payload = readJson(join(STANDARD_ROOT, file))
    for (const standard of payload.standards || []) map.set(standard.code, { ...standard, subject_slug: standard.subject_slug || subjectSlug })
  }
  return map
}

function loadCapabilityComponents(asset, standardsByCode) {
  const mappedSubject = SUBJECT_MAPPINGS[asset.subject_slug] || asset.subject_slug
  const band = gradeBand(Number(asset.grade))
  const results = []
  for (const [code, standard] of standardsByCode) {
    if (standard.subject_slug !== mappedSubject || standard.grade_band !== band) continue
    const path = join(CAPABILITY_ROOT, `${code}.json`)
    if (!existsSync(path)) continue
    const graph = readJson(path)
    for (const component of graph.learning_components || []) {
      results.push({
        standard_code: code,
        standard_text: standard.standard || '',
        standard_title: standard.standard_title || '',
        subdomain: standard.subdomain || standard.display_subcategory || '',
        display_subcategory: standard.display_subcategory || standard.subdomain || '',
        official_text: standard.official_text || '',
        subject_slug: mappedSubject,
        grade_band: band,
        component_id: component.component_id,
        label: component.label || component.source_statement || component.description,
        component_text: [component.label, component.source_statement].filter(Boolean).join('；')
      })
    }
  }
  return results.sort((a, b) => a.standard_code.localeCompare(b.standard_code) || a.component_id.localeCompare(b.component_id))
}

function standardCoreNumber(component) {
  const value = normalizeText(component.display_subcategory || component.subdomain || component.standard_title)
  const match = value.match(/^(\d{1,2})(?:\.|\s)/u)
  return match ? Number(match[1]) : null
}

function scienceDisciplineAllowed(asset, component, sourceText) {
  const allowed = SCIENCE_CORE_WHITELIST[asset.subject_slug]
  if (!allowed) return true
  const core = standardCoreNumber(component)
  if (core === 12 || core === 13) {
    return ENGINEERING_ANCHOR_PATTERNS.filter(pattern => pattern.test(sourceText)).length >= 2
  }
  return Number.isInteger(core) && allowed.has(core)
}

function sharedPredicate(sourceText, targetText, pairs) {
  return pairs.some(([source, target = source]) => source.test(sourceText) && target.test(targetText))
}

function narrowCuePredicateCompatible(cueId, sourceText, targetText) {
  if (!cueId) return false
  if (cueId === 'main_content') {
    return /(?:主要内容|概括.{0,10}内容|提取.{0,8}(?:信息|要点)|围绕.{0,16}写了哪些内容)/u.test(sourceText)
      && /(?:主要内容|主要信息|关键信息|要点|概括|提取)/u.test(targetText)
  }
  if (cueId === 'read_aloud') {
    return sharedPredicate(sourceText, targetText, [
      [/朗读/u], [/背诵/u], [/复述/u]
    ])
  }
  if (cueId === 'writing') {
    return sharedPredicate(sourceText, targetText, [
      [/(?:感受|感想|读后感|情感)/u, /(?:感受|感想|情感)/u],
      [/(?:介绍|说明方法|说明事物|写清楚)/u, /(?:介绍|说明方法|说明事物|清楚说明)/u],
      [/(?:人物|一件事|经历)/u, /(?:人物|事情|经历|叙事)/u],
      [/(?:想象|故事)/u, /(?:想象|故事)/u],
      [/(?:观点|理由|议论)/u, /(?:观点|理由|议论)/u]
    ])
  }
  if (cueId === 'oral_discussion') {
    const sourceHasOpinion = /(?:发表意见|表达观点|说出看法|交流想法)/u.test(sourceText)
    const sourceHasListening = /(?:倾听|认真听|听取|边听边)/u.test(sourceText)
    const targetHasOpinion = /(?:发表意见|表达观点|说出看法|交流想法)/u.test(targetText)
    const targetHasListening = /(?:倾听|认真听|听取)/u.test(targetText)
    return sourceHasOpinion && sourceHasListening && targetHasOpinion && targetHasListening
  }
  if (cueId === 'oral_speaking') {
    if (/(?:别人|他人|同学).{0,8}(?:发言|汇报|讲述)/u.test(sourceText)) return false
    return sharedPredicate(sourceText, targetText, [
      [/发言/u], [/汇报/u], [/讲述/u]
    ])
  }
  if (cueId === 'calculate') {
    if (/计算机/u.test(sourceText)) return false
    const sharesAction = sharedPredicate(sourceText, targetText, [
      [/计算(?!机)/u], [/列式/u], [/解答/u], [/估算/u]
    ])
    if (!sharesAction) return false
    const subtypePattern = /(?:化学方程式|百分比|百分数|比例|比值|方程|函数|分数|小数|整数|速度|路程|时间|质量|密度|体积|面积|周长|角度|概率|平均数|电流|电压|电阻|电功率|功率|热值|热量|温度|压强|浮力|机械效率)/gu
    const sourceSubtypes = new Set(sourceText.match(subtypePattern) || [])
    const targetSubtypes = new Set(targetText.match(subtypePattern) || [])
    return sourceSubtypes.size > 0 && [...sourceSubtypes].some(value => targetSubtypes.has(value))
  }
  return false
}

function isMeaningfulTopicAnchor(keyword) {
  const compact = compactText(keyword)
  if (compact.length < 2 || GENERIC_TOPIC_ANCHORS.has(compact)) return false
  if (GENERIC_TOPIC_PATTERN.test(compact)) return false
  if (/^(?:主要内容|实验结果|实际问题|科学问题|解决问题|生产生活|自然环境|经济发展|科学技术|生活中的|的重要性|说出我国|学会使用|表现形式)$/u.test(compact)) return false
  return true
}

function topicAnchorScore(sourceText, unitTitle, component) {
  const sourceContext = [unitTitle, sourceText].filter(Boolean).join('；')
  const standardContext = [
    component.standard_title,
    component.subdomain,
    component.display_subcategory,
    component.official_text,
    component.standard_text
  ].filter(Boolean).join('；')
  const lexical = lexicalComponentScore(sourceContext, standardContext)
  const keywords = lexical.keywords.filter(isMeaningfulTopicAnchor)
  const compactUnit = compactText(unitTitle)
  return {
    score: keywords.length ? lexical.score : 0,
    keywords,
    unitAnchored: keywords.some(keyword => compactUnit.includes(compactText(keyword)))
  }
}

function normalizedRepeatedHeading(node) {
  return compactHeading(node.title)
    .replace(/^\d{1,3}(?=第)/u, '')
    .replace(/\d{1,3}$/u, '')
}

function independentStandardCandidate(primary, candidate) {
  const primaryCues = new Set(primary.matches.map(match => match.cueId).filter(Boolean))
  const candidateCues = new Set(candidate.matches.map(match => match.cueId).filter(Boolean))
  if (primaryCues.size && candidateCues.size && [...candidateCues].every(cue => !primaryCues.has(cue))) return true
  const keywordSet = ranked => new Set(ranked.matches
    .flatMap(match => [...match.lexicalKeywords, ...match.topicKeywords])
    .filter(isMeaningfulTopicAnchor)
    .map(compactText))
  const primaryKeywords = keywordSet(primary)
  const candidateKeywords = keywordSet(candidate)
  if (!primaryKeywords.size || !candidateKeywords.size) return false
  return [...candidateKeywords].every(keyword => !primaryKeywords.has(keyword))
}

function chineseStandardContextAllowed(component, sourceText) {
  if (component.standard_code === 'CN-D3-CM-003') {
    return /(?:概括|提取).{0,12}(?:说明性|非连续性|主要内容|关键信息)|判断.{0,12}合理/u.test(sourceText)
  }
  if (component.standard_code === 'CN-D3-RE-007') {
    return /(?:阅读|了解|发现|辨析|体会|感受).{0,20}(?:说明方法|结构方式|文本结构|语言特点|内容与形式|表达方法)|(?:说明方法|结构方式|文本结构|语言特点|内容与形式|表达方法).{0,20}(?:阅读|了解|发现|辨析|体会|感受)/u.test(sourceText)
  }
  if (component.standard_code === 'CN-D3-CM-004') {
    return /(?:用|运用|选择).{0,16}(?:说明方法|准确语言)|(?:把|将).{0,16}(?:介绍|说明).{0,8}(?:清楚|明白)|(?:介绍|说明)(?:事物|程序)/u.test(sourceText)
  }
  if (component.standard_code === 'CN-D3-CM-005') {
    return /(?:表达|写出|记录).{0,12}(?:独特感受|感受|感想|情感)|(?:读后感|观察所得)/u.test(sourceText)
  }
  return true
}

function standardPredicateCompatible(component, sourceText) {
  if (component.standard_code === 'CN-D3-CM-003') {
    return /(?:概括|提取).{0,12}(?:说明性|非连续性|主要内容|关键信息)|判断.{0,12}合理/u.test(sourceText)
  }
  if (component.standard_code === 'CN-D3-RE-007') {
    return /(?:阅读|了解|发现|辨析|体会|感受).{0,20}(?:说明方法|结构方式|文本结构|语言特点|内容与形式|表达方法)|(?:说明方法|结构方式|文本结构|语言特点|内容与形式|表达方法).{0,20}(?:阅读|了解|发现|辨析|体会|感受)/u.test(sourceText)
      && /(?:结构方式|文本结构|语言特点|内容与形式|表达方法|不同类型文本)/u.test([
        component.component_text,
        component.standard_text,
        component.standard_title,
        component.subdomain
      ].filter(Boolean).join('；'))
  }
  if (component.standard_code === 'CN-D3-CM-004') {
    return /(?:用|运用|选择).{0,16}(?:说明方法|准确语言)|(?:把|将).{0,16}(?:介绍|说明).{0,8}(?:清楚|明白)|(?:介绍|说明)(?:事物|程序)/u.test(sourceText)
      && /(?:介绍|说明)(?:事物|程序)|(?:清楚|准确).{0,8}(?:介绍|说明)/u.test([
        component.component_text,
        component.standard_text,
        component.standard_title,
        component.subdomain
      ].filter(Boolean).join('；'))
  }
  return false
}

const SCIENCE_STANDARD_OBJECT_ANCHORS = new Map([
  ['SC-H4G9-SC-006', /(?:溶液|溶质|溶剂|质量分数|浓度|配制|饱和|不饱和|悬浊液|乳浊液|溶解)/u],
  ['SC-H4G9-SC-009', /(?:化学变化|物理变化|新物质|物质生成|燃烧|沉淀|发光|吸热|放热|变色|气体生成|原子重组)/u],
  ['SC-H4G9-SC-012', /(?:化学方程式|化合反应|分解反应|置换反应|复分解反应)/u],
  ['SC-H4G9-SC-033', /(?:酸|碱|盐|有机物|pH|指示剂|石蕊|酚酞|中和)/iu]
])

function requiredObjectCompatible(asset, component, sourceText, unitTitle = '') {
  if (asset.subject_slug !== 'chemistry') return true
  const sourceContext = `${unitTitle} ${sourceText}`
  const requiredObject = SCIENCE_STANDARD_OBJECT_ANCHORS.get(component.standard_code)
  if (requiredObject && !requiredObject.test(sourceContext)) return false
  const target = [component.component_text, component.standard_text, component.standard_title, component.subdomain]
    .filter(Boolean)
    .join('；')
  if (/(?:溶液|溶质质量分数)/u.test(target) && /(?:计算|配制)/u.test(target)) {
    if (!/(?:溶液|溶质|溶剂|质量分数|浓度|配制|饱和|不饱和|溶解)/u.test(sourceContext)) return false
  }
  if (/化学方程式/u.test(target)) {
    if (!/(?:化学方程式|化合反应|分解反应|置换反应|复分解反应)/u.test(sourceContext)) return false
  }
  return true
}

function relationForNode(node, asset) {
  if (asset.subject_slug === 'history') return 'contextualizes'
  if (node.kind === 'exercise') return /(?:评价|检测|测试|考试|测一测|自我评价)/u.test(node.text_excerpt || node.title) ? 'assesses' : 'practices'
  if (node.kind === 'activity') return 'practices'
  return 'supports'
}

function evidenceLevelForNode(node) {
  return ['objective', 'exercise', 'activity'].includes(node.kind) ? 'L3' : 'L2'
}

export function alignContentNodes(asset, structure, contentNodes, evidenceSpans, components, options = {}) {
  const minScore = options.minScore ?? 0.52
  const maxStandardsPerNode = options.maxStandardsPerNode ?? 3
  const spansById = new Map(evidenceSpans.map(span => [span.span_id, span]))
  const tocById = new Map((structure.toc || []).map(row => [row.entry_id, row]))
  const seenHeadings = new Set()
  const results = []
  for (const node of contentNodes) {
    if (!['lesson', 'section', 'objective', 'activity', 'exercise'].includes(node.kind)) continue
    if (!node.unit_id || !positivePdfPage(node.pdf_page)) continue
    if (!node.evidence_span_ids?.length) continue
    const unit = tocById.get(node.unit_id)
    const unitRange = locatableTocRange(unit || {})
    if (!unitRange || node.pdf_page < unitRange.start || node.pdf_page > unitRange.end) continue
    if (['lesson', 'section'].includes(node.kind)) {
      const headingKey = `${node.unit_id}\u001f${node.kind}\u001f${normalizedRepeatedHeading(node)}`
      if (seenHeadings.has(headingKey)) continue
      seenHeadings.add(headingKey)
    }
    const evidence = node.evidence_span_ids.map(id => spansById.get(id)).filter(Boolean)
    if (!evidence.length) continue
    const sourceText = [...new Set([node.title, ...evidence.map(span => span.text)].map(normalizeText).filter(Boolean))].join(' ')
    if (node.kind === 'exercise' && (DECLARATIVE_EXPERIMENT_PATTERN.test(sourceText) || /^计算机/u.test(sourceText))) continue
    if (NON_INSTRUCTIONAL_PAGE_PATTERN.test(sourceText)) continue
    if (node.source === 'body_heading' && ['activity', 'exercise'].includes(node.kind) && compactText(sourceText).length < 8) continue
    if (compactText(sourceText).length < 4) continue
    const scored = []
    for (const component of components) {
      const informationalText = /(?:说明性|说明文|非连续性|图表|统计图|信息材料)/u.test(sourceText)
      if (component.standard_code === 'CN-D3-CM-003' && !informationalText) continue
      if (component.standard_code === 'CN-D3-RE-001' && informationalText) continue
      if (!chineseStandardContextAllowed(component, sourceText)) continue
      if (!scienceDisciplineAllowed(asset, component, `${unit?.title || ''} ${sourceText}`)) continue
      if (!requiredObjectCompatible(asset, component, sourceText, unit?.title || '')) continue
      const lexical = lexicalComponentScore(sourceText, component.component_text)
      const cue = cueScore(sourceText, component.component_text, component.standard_code)
      const topic = topicAnchorScore(sourceText, unit?.title || '', component)
      const cuePredicateCompatible = narrowCuePredicateCompatible(cue.cue, sourceText, component.component_text)
      const standardPredicate = standardPredicateCompatible(component, sourceText)
      const predicateCompatible = cuePredicateCompatible || standardPredicate
      const cueOnly = cue.score > 0 && lexical.score < 0.18
      if (cueOnly && ((!cue.allowCueOnly || !cuePredicateCompatible) && !standardPredicate)) continue
      if (!topic.keywords.length && !predicateCompatible) continue
      const anchoredLexical = topic.score ? lexical.score * 0.72 + topic.score * 0.28 : 0
      const cuePredicateScore = cuePredicateCompatible && cue.score
        ? cue.score * 0.82 + lexical.score * 0.18
        : 0
      const standardPredicateScore = standardPredicate
        ? 0.82 + Math.min(0.1, lexical.score * 0.1)
        : 0
      const predicateScore = Math.max(cuePredicateScore, standardPredicateScore)
      const score = Math.min(0.98, Math.max(anchoredLexical, predicateScore))
      if (score < minScore) continue
      scored.push({
        ...component,
        score,
        cueOnly,
        cueId: cue.cue,
        lexicalScore: lexical.score,
        lexicalKeywords: lexical.keywords,
        topicAnchorScore: topic.score,
        topicKeywords: topic.keywords,
        unitAnchored: topic.unitAnchored,
        predicateCompatible,
        standardPredicate,
        keywords: [...new Set([...lexical.keywords, ...topic.keywords, ...(cue.cue ? [`cue:${cue.cue}`] : [])])]
      })
    }
    const bestCueOnly = new Map()
    for (const match of scored.filter(match => match.cueOnly && match.cueId).sort((a, b) => b.score - a.score || a.standard_code.localeCompare(b.standard_code))) {
      if (!bestCueOnly.has(match.cueId)) bestCueOnly.set(match.cueId, match)
    }
    const filteredScored = scored.filter(match => !match.cueOnly || bestCueOnly.get(match.cueId) === match)
    const grouped = new Map()
    for (const match of filteredScored.sort((a, b) => b.score - a.score || a.standard_code.localeCompare(b.standard_code) || a.component_id.localeCompare(b.component_id))) {
      if (!grouped.has(match.standard_code)) grouped.set(match.standard_code, [])
      if (grouped.get(match.standard_code).length < 3) grouped.get(match.standard_code).push(match)
    }
    const allRankedStandards = [...grouped.entries()]
      .map(([standardCode, matches]) => ({ standardCode, matches, score: matches[0].score }))
      .sort((a, b) => b.score - a.score || a.standardCode.localeCompare(b.standardCode))
    const rankedStandards = []
    for (const candidate of allRankedStandards) {
      if (!rankedStandards.length || rankedStandards.every(primary => independentStandardCandidate(primary, candidate))) {
        rankedStandards.push(candidate)
      }
      if (rankedStandards.length >= maxStandardsPerNode) break
    }
    for (const ranked of rankedStandards) {
      const best = ranked.matches[0]
      const confidence = round(Math.min(0.99, 0.48 + ranked.score * 0.5), 4)
      const componentRows = ranked.matches.map(match => ({ component_id: match.component_id, label: match.label }))
      const level = evidenceLevelForNode(node)
      const contextual = asset.subject_slug === 'history'
      const matchedFields = ['learning_components']
      if (ranked.matches.some(match => match.topicKeywords.length)) matchedFields.push('standard_context')
      if (ranked.matches.some(match => match.unitAnchored)) matchedFields.push('textbook_unit')
      if (ranked.matches.some(match => match.standardPredicate)) matchedFields.push('standard_predicate')
      results.push({
        alignment_id: stableId('tca', asset.edition_id, node.node_id, ranked.standardCode, ALIGNER_VERSION),
        edition_id: asset.edition_id,
        unit_id: node.unit_id,
        unit_title: unit?.title || '',
        node_id: node.node_id,
        content_node_kind: node.kind,
        content_node_title: node.title,
        standard_code: ranked.standardCode,
        standard_text: best.standard_text,
        standard_title: best.standard_title,
        standard_subdomain: best.subdomain,
        subject_slug: best.subject_slug,
        grade_band: best.grade_band,
        learning_component_ids: componentRows.map(row => row.component_id),
        learning_components: componentRows,
        relation_type: relationForNode(node, asset),
        evidence_role: contextual ? 'contextual_textbook' : 'direct_textbook',
        evidence_span_ids: node.evidence_span_ids,
        evidence_level: level,
        evidence_level_detail: level === 'L3' ? 'L3_page_evidence' : 'L2_topic',
        evidence_granularity: level === 'L3' ? 'textbook_body' : 'topic_heading',
        evidence_excerpt: evidence[0]?.text || node.text_excerpt || node.title,
        evidence_excerpt_hash: evidence[0]?.excerpt_hash || createHash('sha256').update(node.text_excerpt || node.title).digest('hex'),
        confidence,
        score: round(ranked.score, 4),
        matched_keywords: [...new Set(ranked.matches.flatMap(match => match.keywords))].slice(0, 12),
        matched_fields: matchedFields,
        topic_anchor_keywords: [...new Set(ranked.matches.flatMap(match => match.topicKeywords))].slice(0, 8),
        topic_anchor_score: round(Math.max(...ranked.matches.map(match => match.topicAnchorScore)), 4),
        modifier_conflicts: [],
        longest_match_length: Math.max(0, ...ranked.matches.flatMap(match => match.keywords.filter(keyword => !keyword.startsWith('cue:')).map(keyword => keyword.length))),
        alignment_method: 'component_evidence_hybrid',
        algorithm_version: ALIGNER_VERSION,
        provenance: 'machine_generated',
        rationale: contextual
          ? `教材${node.kind}“${excerpt(node.title)}”为课标 ${ranked.standardCode} 的可教学小能力“${componentRows.map(row => row.label).join('、')}”提供学科情境关联。`
          : `教材${node.kind}“${excerpt(node.title)}”与课标 ${ranked.standardCode} 的可教学小能力“${componentRows.map(row => row.label).join('、')}”形成页内证据匹配。`,
        review_status: 'machine_checked',
        publication_status: 'published',
        evidence_id: asset.evidence_id,
        asset_sha256: asset.sha256,
        pdf_page: node.pdf_page ?? null,
        end_pdf_page: node.end_pdf_page ?? node.pdf_page ?? null,
        printed_page: node.printed_page ?? null
      })
    }
  }
  return results.sort((a, b) => (a.unit_id || '').localeCompare(b.unit_id || '') || a.pdf_page - b.pdf_page || a.node_id.localeCompare(b.node_id) || a.standard_code.localeCompare(b.standard_code))
}

function sidecarPaths(args, asset) {
  const directory = join(args.libraryRoot, 'derived', SIDECAR_VERSION, asset.sha256)
  return {
    directory,
    pages: join(directory, 'pages.jsonl'),
    manifest: join(directory, 'manifest.json')
  }
}

function writeSidecar(args, asset, extraction) {
  const paths = sidecarPaths(args, asset)
  mkdirSync(paths.directory, { recursive: true })
  const temporary = `${paths.pages}.tmp-${process.pid}`
  const rows = extraction.pages.map(page => JSON.stringify({
    schema_version: SCHEMA_VERSION,
    edition_id: asset.edition_id,
    asset_sha256: asset.sha256,
    pdf_page: page.pdf_page,
    printed_page: page.printed_page,
    page_width: page.page_width,
    page_height: page.page_height,
    extraction_method: page.extraction_method,
    extraction_status: page.extraction_status,
    text: page.text,
    lines: page.lines
  }))
  writeFileSync(temporary, `${rows.join('\n')}\n`)
  renameSync(temporary, paths.pages)
  writeJson(paths.manifest, {
    schema_version: SCHEMA_VERSION,
    parser_version: PARSER_VERSION,
    edition_id: asset.edition_id,
    asset_sha256: asset.sha256,
    page_count: extraction.pages.length,
    native_text_ratio: extraction.nativeRatio,
    ocr_page_count: extraction.ocrCount,
    ocr_reused_count: extraction.ocrReused,
    ocr_skipped_count: extraction.ocrSkipped,
    pages_path: 'pages.jsonl'
  })
  return relative(args.libraryRoot, paths.pages)
}

function recomputeIndex(index, selectedAssets, generatedByEdition, structuresByEdition) {
  const selectedIds = new Set(selectedAssets.map(asset => asset.edition_id))
  const generatedMatches = [...generatedByEdition.values()].flat()
  const matches = [
    ...(index.matches || []).filter(match => !selectedIds.has(match.edition_id)),
    ...generatedMatches
  ].sort((a, b) => a.edition_id.localeCompare(b.edition_id) || (a.unit_id || '').localeCompare(b.unit_id || '') || Number(a.pdf_page || 0) - Number(b.pdf_page || 0) || a.alignment_id.localeCompare(b.alignment_id))

  const unitDispositions = (index.unit_dispositions || []).filter(row => !selectedIds.has(row.edition_id))
  const textbookDispositions = (index.textbook_dispositions || []).filter(row => !selectedIds.has(row.edition_id))
  for (const asset of selectedAssets) {
    const structure = structuresByEdition.get(asset.edition_id)
    if (!structure) continue
    const editionMatches = generatedByEdition.get(asset.edition_id) || []
    const toc = (structure.toc || []).filter(isPublishedTocEntry)
    const automaticUnits = toc.filter(row => row.source === BODY_INFERRED_UNIT_SOURCE)
    for (const unit of toc) {
      const unitMatches = editionMatches.filter(match => match.unit_id === unit.entry_id)
      unitDispositions.push({
        edition_id: asset.edition_id,
        unit_id: unit.entry_id,
        unit_title: unit.title,
        standard_subject_slug: SUBJECT_MAPPINGS[asset.subject_slug] || asset.subject_slug,
        grade_band: gradeBand(Number(asset.grade)),
        status: unitMatches.length ? 'aligned' : 'no_reliable_match',
        match_count: unitMatches.length,
        published_match_count: unitMatches.length,
        source: unit.source,
        confidence: unit.confidence,
        review_status: unit.review_status,
        publication_status: unit.publication_status
      })
    }
    const previous = (index.textbook_dispositions || []).find(row => row.edition_id === asset.edition_id)
    textbookDispositions.push({
      ...(previous || {}),
      edition_id: asset.edition_id,
      evidence_id: asset.evidence_id,
      subject_slug: asset.subject_slug,
      grade: asset.grade,
      grade_band: gradeBand(Number(asset.grade)),
      toc_unit_count: toc.length,
      processed_unit_scope_count: toc.length,
      automatic_content_unit_count: automaticUnits.length,
      published_specific_match_count: editionMatches.length,
      candidate_specific_match_count: 0,
      scope_standard_count: (index.scope_relations || []).filter(row => row.edition_id === asset.edition_id).length,
      status: editionMatches.length
        ? 'unit_aligned'
        : automaticUnits.length
          ? 'scope_aligned_content_units_no_match'
          : toc.length
            ? 'scope_aligned_unit_review_needed'
            : 'scope_only_no_toc'
    })
  }

  const scopeByStandard = new Map()
  for (const scope of index.scope_relations || []) scopeByStandard.set(scope.standard_code, (scopeByStandard.get(scope.standard_code) || 0) + 1)
  const matchesByStandard = new Map()
  for (const match of matches.filter(row => row.publication_status === 'published')) matchesByStandard.set(match.standard_code, (matchesByStandard.get(match.standard_code) || 0) + 1)
  const standardDispositions = (index.standard_dispositions || []).map(row => {
    const specific = matchesByStandard.get(row.standard_code) || 0
    const scope = scopeByStandard.get(row.standard_code) || 0
    return {
      ...row,
      status: specific ? 'unit_aligned' : scope ? 'scope_aligned_no_unit_evidence' : 'gap_no_textbook_scope',
      gap_reason: specific || scope ? null : row.gap_reason,
      specific_match_count: specific,
      textbook_scope_count: scope
    }
  })

  const sortedUnits = unitDispositions.sort((a, b) => a.edition_id.localeCompare(b.edition_id) || a.unit_id.localeCompare(b.unit_id))
  const sortedTextbooks = textbookDispositions.sort((a, b) => a.edition_id.localeCompare(b.edition_id))
  const countBy = (rows, field) => rows.reduce((result, row) => ({ ...result, [row[field]]: (result[row[field]] || 0) + 1 }), {})
  const pipelineVersions = [...new Set([
    ...(Array.isArray(index.pipeline_versions) ? index.pipeline_versions : []),
    ...String(index.algorithm_version || '').split('+'),
    ALIGNER_VERSION
  ].filter(Boolean))]
  return {
    ...index,
    schema_version: Math.max(Number(index.schema_version || 1), 2),
    generated_at: new Date().toISOString(),
    algorithm_version: ALIGNER_VERSION,
    pipeline_versions: pipelineVersions,
    policy: {
      ...(index.policy || {}),
      content_alignment_is_automatic: true,
      content_alignment_target: 'learning_components',
      content_alignment_min_score: null,
      review_policy: 'automatic_no_human_gate',
      publication_gate: false,
      scope_relations_are_not_unit_evidence: true
    },
    textbook_dispositions: sortedTextbooks,
    unit_dispositions: sortedUnits,
    standard_dispositions: standardDispositions,
    matches,
    summary: {
      textbooks: sortedTextbooks.length,
      textbooks_by_status: countBy(sortedTextbooks, 'status'),
      toc_units: sortedUnits.length,
      units_by_status: countBy(sortedUnits, 'status'),
      standards: standardDispositions.length,
      standards_by_status: countBy(standardDispositions, 'status'),
      specific_matches: matches.length,
      published_specific_matches: matches.filter(row => row.publication_status === 'published').length,
      approved_matches: matches.filter(row => row.review_status === 'approved').length,
      machine_checked_matches: matches.filter(row => row.review_status === 'machine_checked').length,
      candidate_matches: matches.filter(row => row.publication_status !== 'published').length,
      scope_relations: (index.scope_relations || []).length,
      legacy_approved_relations: (index.legacy_approved_alignment_ids || []).length
    }
  }
}

async function buildEdition(asset, args, standardsByCode) {
  const structurePath = join(args.structureRoot, `${asset.edition_id}.json`)
  if (!existsSync(structurePath)) throw new Error(`Missing structure record: ${structurePath}`)
  const structure = readJson(structurePath)
  const pdfPath = safeAssetPath(args.libraryRoot, asset.object_path)
  const extraction = await extractPages(asset, structure, pdfPath, args)
  const sidecarPath = writeSidecar(args, asset, extraction)
  if (args.sidecarOnly) return { structure, alignments: [], summary: { sidecarPath, pageCount: extraction.pages.length } }
  const baseStructure = {
    ...structure,
    toc: normalizeTocEntries((structure.toc || [])
      .filter(entry => entry.source !== BODY_INFERRED_UNIT_SOURCE)
      .map(entry => {
        const startPage = Number(entry.pdf_page)
        const endPage = Number(entry.end_pdf_page)
        if (!Number.isInteger(startPage) || startPage < 1 || !Number.isInteger(endPage) || endPage >= startPage) return entry
        return { ...entry, end_pdf_page: startPage }
      }))
  }
  const unitRecovery = recoverBodyInferredUnits(asset, baseStructure, extraction.pages)
  const workingStructure = unitRecovery.entries.length
    ? { ...baseStructure, toc: [...baseStructure.toc, ...unitRecovery.entries] }
    : baseStructure
  const { contentNodes, evidenceSpans } = buildContentGraph(asset, workingStructure, extraction.pages)
  const components = loadCapabilityComponents(asset, standardsByCode)
  const generatedAlignments = alignContentNodes(asset, workingStructure, contentNodes, evidenceSpans, components, args)
  const legacyApproved = (structure.alignments || []).filter(alignment => alignment.review_status === 'approved')
  const alignments = [...new Map([...legacyApproved, ...generatedAlignments].map(alignment => [alignment.alignment_id, alignment])).values()]
    .sort((a, b) => (a.unit_id || '').localeCompare(b.unit_id || '') || Number(a.pdf_page || 0) - Number(b.pdf_page || 0) || a.alignment_id.localeCompare(b.alignment_id))
  const enhanced = {
    ...workingStructure,
    schema_version: Math.max(Number(structure.schema_version || 1), 2),
    content_nodes: contentNodes,
    evidence_spans: evidenceSpans,
    alignments,
    content_alignment: {
      schema_version: SCHEMA_VERSION,
      parser_version: PARSER_VERSION,
      algorithm_version: ALIGNER_VERSION,
      provenance: 'machine_generated',
      review_policy: 'automatic_no_human_gate',
      source_asset_sha256: asset.sha256,
      sidecar_path: sidecarPath,
      native_text_ratio: extraction.nativeRatio,
      ocr_page_count: extraction.ocrCount,
      ocr_reused_count: extraction.ocrReused,
      ocr_skipped_count: extraction.ocrSkipped,
      unit_recovery_status: unitRecovery.status,
      unit_recovery_reason: unitRecovery.reason,
      automatic_content_unit_count: unitRecovery.entries.length,
      unit_recovery_native_text_ratio: unitRecovery.native_text_ratio,
      content_node_count: contentNodes.length,
      evidence_span_count: evidenceSpans.length,
      alignment_count: alignments.length,
      generated_alignment_count: generatedAlignments.length,
      preserved_approved_alignment_count: legacyApproved.length
    }
  }
  writeJson(structurePath, enhanced)
  return {
    structure: enhanced,
    alignments,
    summary: {
      edition_id: asset.edition_id,
      pages: extraction.pages.length,
      native_text_ratio: extraction.nativeRatio,
      ocr_pages: extraction.ocrCount,
      ocr_reused_pages: extraction.ocrReused,
      unit_recovery_status: unitRecovery.status,
      unit_recovery_reason: unitRecovery.reason,
      automatic_content_units: unitRecovery.entries.length,
      content_nodes: contentNodes.length,
      evidence_spans: evidenceSpans.length,
      alignments: alignments.length,
      generated_alignments: generatedAlignments.length,
      preserved_approved_alignments: legacyApproved.length,
      sidecar_path: sidecarPath
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) { console.log(usage()); return }
  const { current, assets } = registryAssets()
  const selectedIds = new Set(args.editionIds.length ? args.editionIds : args.all ? assets.map(asset => asset.edition_id) : [PILOT_EDITION])
  const selected = assets.filter(asset => selectedIds.has(asset.edition_id)).sort((a, b) => a.edition_id.localeCompare(b.edition_id))
  const missing = [...selectedIds].filter(id => !selected.some(asset => asset.edition_id === id))
  if (missing.length) throw new Error(`Edition(s) missing from current asset registry: ${missing.join(', ')}`)
  const standardsByCode = loadStandardScopes()
  const generatedByEdition = new Map()
  const structuresByEdition = new Map()
  const summaries = []
  const failures = []
  for (let index = 0; index < selected.length; index += 1) {
    const asset = selected[index]
    try {
      const result = await buildEdition(asset, args, standardsByCode)
      generatedByEdition.set(asset.edition_id, result.alignments)
      structuresByEdition.set(asset.edition_id, result.structure)
      summaries.push(result.summary)
      console.log(`[${index + 1}/${selected.length}] ${asset.edition_id}: nodes=${result.summary.content_nodes ?? 'sidecar-only'}, alignments=${result.summary.alignments ?? 'sidecar-only'}`)
    } catch (error) {
      failures.push({ edition_id: asset.edition_id, error: error.message })
      console.error(`[${index + 1}/${selected.length}] FAILED ${asset.edition_id}: ${error.message}`)
    }
  }
  if (!args.sidecarOnly && generatedByEdition.size) {
    if (!existsSync(args.alignmentIndex)) throw new Error(`Missing canonical alignment index: ${args.alignmentIndex}`)
    const index = recomputeIndex(readJson(args.alignmentIndex), selected.filter(asset => generatedByEdition.has(asset.edition_id)), generatedByEdition, structuresByEdition)
    index.policy.content_alignment_min_score = args.minScore
    writeJson(args.alignmentIndex, index)
  }
  const report = {
    schema_version: SCHEMA_VERSION,
    source_generation_id: current.generation_id,
    parser_version: PARSER_VERSION,
    algorithm_version: ALIGNER_VERSION,
    selected_count: selected.length,
    completed_count: summaries.length,
    failure_count: failures.length,
    items: summaries,
    failures
  }
  writeJson(join(ROOT, 'data/textbooks/derived/content_alignment_report.json'), report)
  console.log(JSON.stringify(report, null, 2))
  if (failures.length) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(error.stack || error.message)
    process.exitCode = 1
  })
}
