// Share-card images for kebiao pages, drawn with satori and rendered to PNG with resvg.
//   og:     1200×630, used as og:image by QQ, DingTalk, Feishu, X, Telegram, iMessage
//   poster: 1080×1440 with a QR code, for saving and posting in WeChat
/// <reference path="./qrcode.d.ts" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import QRCode from 'qrcode'
import { SITE_URL, clip, getDisplayTitle, gradeLabel, v2StageLabel } from '../../../src/seo/pageMeta.js'
import { LOGO_VIEWBOX, logoSvg } from '../../../src/brand/logo.js'

const ROOT = process.cwd()
const DATA = join(ROOT, 'public/data')
const SERIF_DIR = join(ROOT, 'node_modules/@fontsource/noto-serif-sc')
const MONO_FILE = join(ROOT, 'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff')

const C = { night: '#07080c', ink: '#eceff4', mist: '#aab2bf', dim: '#858e9c', gold: '#e9c887', line: 'rgba(222,228,238,0.14)' }

type Style = Record<string, string | number>
type Node = { type: string, props: Record<string, unknown> }
const el = (type: string, style: Style, ...children: Array<Node | string>): Node => ({
    type,
    props: { style: { display: 'flex', ...style }, children: children.length === 1 ? children[0] : children }
})
const text = (style: Style, value: string) => el('div', style, value)
const image = (src: string, size: number, style: Style = {}): Node => ({ type: 'img', props: { src, width: size, height: size, style } })

// ---------- data ----------
const readJson = (path: string) => JSON.parse(readFileSync(join(DATA, path), 'utf8'))
type V1Standard = { code: string, subject: string, subject_slug: string, domain: string, grade_band: string, standard: string, standard_title?: string, official_text?: string, teaching_tip?: string, context?: string }
type V2Item = { text: string }
type V2Standard = { code: string, stage: string, stage_code: string, level1: string, level2: string, statement: string, statement_source: string, indicators: V2Item[] }
type V2Subject = { subject_slug: string, subject: string, stages: Array<{ stage_code: string, label: string }>, standards: V2Standard[] }
type V2ManifestSubject = { subject_slug: string, subject: string, prefix: string, file: string, standard_count: number, indicator_count: number }
// What a card shows, whichever edition the code comes from.
export type CardStandard = { code: string, subject_slug: string, title: string, kicker: string, body: string, bodyNote: string, doc: string, tip: { label: string, value: string } | null }

let codeIndex: Record<string, string> | null = null
const subjectFiles = new Map<string, V1Standard[]>()
const v2Files = new Map<string, V2Subject>()
let subjectColors: Map<string, string> | null = null
const v2Manifest = () => readJson('v2/manifest.json').subjects as V2ManifestSubject[]
// The card fonts have no emoji, which would render as empty boxes.
const plain = (value = '') => value.replace(/\p{Extended_Pictographic}\uFE0F?/gu, '')

function v2Card(code: string): CardStandard | null {
    const entry = v2Manifest().find(item => item.prefix === code.slice(0, 2))
    if (!entry) return null
    if (!v2Files.has(entry.subject_slug)) v2Files.set(entry.subject_slug, readJson(entry.file) as V2Subject)
    const subject = v2Files.get(entry.subject_slug)!
    const standard = subject.standards.find(item => item.code === code)
    if (!standard) return null
    const official = standard.statement_source === 'official'
    return {
        code,
        subject_slug: subject.subject_slug,
        title: plain(standard.level2),
        kicker: [subject.subject, v2StageLabel(standard, subject), standard.level1].join(' · '),
        body: plain(standard.statement),
        bodyNote: official ? '课标原文' : 'kebiao 用课标原词概括',
        doc: `义务教育${subject.subject}课程标准（2022年版2025年修订）`,
        tip: standard.indicators[0] ? { label: `要点 · ${standard.indicators.length} 条（课标原文）`, value: clip(plain(standard.indicators[0].text), 92) } : null
    }
}

// A takeaway for an old record's poster: the teaching tip, or else the "学习意义" note.
function takeaway(standard: V1Standard) {
    if (standard.teaching_tip) return { label: '教学提示', value: clip(plain(standard.teaching_tip), 92) }
    const meaning = String(standard.context || '').match(/【学习意义】([^\n]+)/u)?.[1]
    return meaning ? { label: '学习意义', value: clip(plain(meaning), 92) } : null
}

function v1Card(code: string): CardStandard | null {
    codeIndex ??= readJson('indexes/code_to_subject.json') as Record<string, string>
    const slug = codeIndex[code]
    if (!slug) return null
    if (!subjectFiles.has(slug)) subjectFiles.set(slug, readJson(`by_subject/${slug}.json`).standards)
    const standard = subjectFiles.get(slug)!.find(item => item.code === code)
    if (!standard) return null
    return {
        code,
        subject_slug: standard.subject_slug,
        title: plain(getDisplayTitle(standard.standard, standard.standard_title)),
        kicker: [standard.subject, gradeLabel(standard), standard.domain].filter(Boolean).join(' · '),
        body: plain(standard.official_text || standard.standard),
        bodyNote: '课标原文',
        doc: `义务教育${standard.subject}课程标准（2022年版）`,
        tip: takeaway(standard)
    }
}

// v2 standards (MA-S1-NA-01) first; old codes still render for links shared before the move.
export function findStandard(code: string): CardStandard | null {
    return /^[A-Z]{2}-S\d-/u.test(code) ? v2Card(code) : v1Card(code)
}

function subjectColor(slug: string) {
    subjectColors ??= new Map((readJson('starmap.json').subjects as Array<{ slug: string, color: string }>).map(item => [item.slug, item.color]))
    return subjectColors.get(slug) || C.gold
}

// ---------- fonts: load only the unicode-range slices the card's text needs ----------
type Slice = { id: string, ranges: Array<[number, number]> }
let slices: Slice[] | null = null
const fontFiles = new Map<string, Buffer>()

function loadSlices(): Slice[] {
    const css = readFileSync(join(SERIF_DIR, '400.css'), 'utf8')
    return [...css.matchAll(/noto-serif-sc-([a-z0-9-]+)-400-normal\.woff\) format\('woff'\);\s*unicode-range:\s*([^;]+);/gu)].map(([, id, ranges]) => ({
        id,
        ranges: ranges.split(',').map(range => {
            const [from, to] = range.trim().replace(/^U\+/iu, '').split('-')
            return [parseInt(from, 16), parseInt(to || from, 16)] as [number, number]
        })
    }))
}

function readFont(path: string) {
    if (!fontFiles.has(path)) fontFiles.set(path, readFileSync(path))
    return fontFiles.get(path)!
}

function fontsFor(content: string) {
    slices ??= loadSlices()
    const needed = new Set<string>()
    for (const char of new Set(content)) {
        const point = char.codePointAt(0)!
        const slice = slices.find(item => item.ranges.some(([from, to]) => point >= from && point <= to))
        if (slice) needed.add(slice.id)
    }
    // satori falls back across font families but not across fonts sharing one name,
    // so each slice gets its own family and the card lists them all.
    const fonts: Array<{ name: string, data: Buffer, weight: 400 | 500 | 900, style: 'normal' }> = [{ name: 'Mono', data: readFont(MONO_FILE), weight: 500, style: 'normal' }]
    for (const id of needed) {
        for (const weight of [400, 900] as const) {
            fonts.push({ name: `Serif-${id}`, data: readFont(join(SERIF_DIR, 'files', `noto-serif-sc-${id}-${weight}-normal.woff`)), weight, style: 'normal' })
        }
    }
    return { fonts, family: [...needed].map(id => `Serif-${id}`).join(', ') || 'Mono' }
}

// ---------- shared pieces ----------
function hash(value: string) {
    let h = 2166136261
    for (const char of value) h = Math.imul(h ^ char.charCodeAt(0), 16777619)
    return h >>> 0
}

// A still field of stars, seeded by the code so each card is stable.
function starField(seed: string, width: number, height: number, accent: string): Node[] {
    let state = hash(seed) || 1
    const random = () => {
        state = Math.imul(state ^ (state >>> 15), 2246822507) ^ Math.imul(state ^ (state >>> 13), 3266489909)
        return ((state ^= state >>> 16) >>> 0) / 4294967296
    }
    return Array.from({ length: 70 }, (_, index) => {
        const size = random() < 0.12 ? 3 : random() < 0.5 ? 2 : 1
        return el('div', {
            position: 'absolute',
            left: Math.round(random() * width),
            top: Math.round(random() * height),
            width: size,
            height: size,
            borderRadius: size,
            background: index % 9 === 0 ? accent : C.ink,
            opacity: 0.15 + random() * 0.55
        })
    })
}

// The 合文 logo with the kebiao wordmark, `height` pixels tall.
const LOGO_URI = `data:image/svg+xml;base64,${Buffer.from(logoSvg({ ink: C.ink })).toString('base64')}`
const [, , logoWidth, logoHeight] = LOGO_VIEWBOX.split(' ').map(Number)
function brand(height: number): Node {
    return { type: 'img', props: { src: LOGO_URI, width: Math.round((height * logoWidth) / logoHeight), height, style: {} } }
}

function backdrop(width: number, height: number, accent: string, seed: string, children: Node[]): Node {
    return el('div', {
        width, height, position: 'relative', flexDirection: 'column', overflow: 'hidden',
        backgroundColor: C.night,
        backgroundImage: `radial-gradient(circle at 88% 8%, ${accent}38 0%, ${accent}10 32%, transparent 62%)`,
        color: C.ink
    }, ...starField(seed, width, height, accent), ...children)
}

function titleSize(title: string, sizes: [number, number, number]) {
    const length = [...title].length
    return length <= 14 ? sizes[0] : length <= 26 ? sizes[1] : sizes[2]
}

// `content` is all the text on the card, so the right font slices get loaded.
async function toPng(node: Node, width: number, height: number, content: string) {
    const { fonts, family } = fontsFor(content)
    ;(node.props.style as Style).fontFamily = family
    const svg = await satori(node as never, { width, height, fonts })
    return new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng()
}

function qrDataUri(url: string, pixels: number) {
    const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' })
    const size = modules.size
    let path = ''
    for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) if (modules.get(row, col)) path += `M${col} ${row}h1v1h-1z`
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="-2 -2 ${size + 4} ${size + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${size + 4}" height="${size + 4}" fill="#f2ede1"/><path d="${path}" fill="#07080c"/></svg>`
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

// ---------- cards ----------
function standardParts(standard: CardStandard) {
    return { title: standard.title, kicker: standard.kicker, body: standard.body, accent: subjectColor(standard.subject_slug), doc: standard.doc }
}

// The part of the standard after its short title, so the card does not repeat itself.
function remainder(body: string, title: string) {
    return body.startsWith(title) ? body.slice(title.length).replace(/^[，；。、,\s]+/u, '') : body
}

export async function standardOgCard(standard: CardStandard) {
    const { title, kicker, body, accent, doc } = standardParts(standard)
    const bodyText = clip(remainder(body, title), 64)
    const W = 1200
    const H = 630
    const node = backdrop(W, H, accent, standard.code, [
        el('div', { position: 'absolute', left: 0, top: 0, width: W, height: H, padding: '56px 72px', flexDirection: 'column', justifyContent: 'space-between' },
            el('div', { justifyContent: 'space-between', alignItems: 'center' },
                brand(52),
                text({ fontSize: 24, color: C.mist }, kicker)),
            el('div', { flexDirection: 'column', gap: 22 },
                text({ fontSize: titleSize(title, [76, 62, 52]), fontWeight: 900, lineHeight: 1.25, color: C.ink }, title),
                ...(bodyText ? [text({ fontSize: 28, lineHeight: 1.6, color: C.mist }, bodyText)] : [])),
            el('div', { justifyContent: 'space-between', alignItems: 'flex-end', borderTop: `1px solid ${C.line}`, paddingTop: 22 },
                el('div', { alignItems: 'center', gap: 16 },
                    el('div', { width: 12, height: 12, borderRadius: 12, background: accent }),
                    text({ fontFamily: 'Mono', fontSize: 26, color: C.gold, letterSpacing: 1 }, standard.code)),
                text({ fontSize: 22, color: C.dim }, doc)))
    ])
    return toPng(node, W, H, `${title}${kicker}${bodyText}${doc}`)
}

export async function standardPoster(standard: CardStandard) {
    const { title, kicker, body, accent, doc } = standardParts(standard)
    const bodyText = clip(body, 120)
    const tip = standard.tip
    const url = `${SITE_URL}/standards/${standard.code}`
    const W = 1080
    const H = 1440
    const hint = '长按识别二维码'
    const hint2 = '查看全部要点、课标页码与对应教材'
    const node = backdrop(W, H, accent, `${standard.code}-poster`, [
        el('div', { position: 'absolute', left: 0, top: 0, width: W, height: H, padding: '88px 88px 80px', flexDirection: 'column', justifyContent: 'space-between' },
            el('div', { flexDirection: 'column', gap: 64 },
                brand(64),
                el('div', { flexDirection: 'column', gap: 28 },
                    text({ fontSize: 30, color: accent }, kicker),
                    text({ fontSize: titleSize(title, [96, 80, 68]), fontWeight: 900, lineHeight: 1.22, color: C.ink }, title),
                    el('div', { flexDirection: 'column', gap: 14, borderLeft: `3px solid ${C.gold}`, paddingLeft: 28, marginTop: 12 },
                        text({ fontSize: 34, lineHeight: 1.65, color: C.ink }, bodyText),
                        text({ fontSize: 24, color: C.dim }, `${standard.bodyNote} · ${doc}`)),
                    ...(tip ? [el('div', { flexDirection: 'column', gap: 12, marginTop: 20 },
                        text({ fontFamily: 'Mono', fontSize: 22, color: C.gold, letterSpacing: 2 }, tip.label),
                        text({ fontSize: 30, lineHeight: 1.65, color: C.mist }, tip.value))] : []))),
            el('div', { justifyContent: 'space-between', alignItems: 'flex-end', borderTop: `1px solid ${C.line}`, paddingTop: 40 },
                el('div', { flexDirection: 'column', gap: 14 },
                    text({ fontFamily: 'Mono', fontSize: 34, color: C.gold, letterSpacing: 1 }, standard.code),
                    text({ fontSize: 30, color: C.ink }, hint),
                    text({ fontSize: 26, color: C.mist }, hint2)),
                image(qrDataUri(url, 232), 232, { borderRadius: 14 })))
    ])
    return toPng(node, W, H, `${title}${kicker}${bodyText}${doc}${standard.bodyNote}${hint}${hint2}${tip ? tip.label + tip.value : ''}`)
}

export async function siteCard(heading: string, sub: string, seed = 'site', accent = C.gold) {
    const W = 1200
    const H = 630
    const node = backdrop(W, H, accent, seed, [
        el('div', { position: 'absolute', left: 0, top: 0, width: W, height: H, padding: '64px 72px', flexDirection: 'column', justifyContent: 'space-between' },
            brand(60),
            el('div', { flexDirection: 'column', gap: 24 },
                text({ fontSize: titleSize(heading, [80, 64, 54]), fontWeight: 900, lineHeight: 1.25 }, heading),
                text({ fontSize: 30, lineHeight: 1.6, color: C.mist }, sub)),
            text({ fontFamily: 'Mono', fontSize: 24, color: C.gold }, 'www.kebiao.org'))
    ])
    return toPng(node, W, H, `${heading}${sub}`)
}

export function subjectInfo(slug: string) {
    const subject = v2Manifest().find(item => item.subject_slug === slug)
    return subject ? { ...subject, color: subjectColor(slug) } : null
}

export function siteStats() {
    const subjects = v2Manifest()
    return { subjects: subjects.length, standards: subjects.reduce((sum, item) => sum + item.standard_count, 0), indicators: subjects.reduce((sum, item) => sum + item.indicator_count, 0) }
}
