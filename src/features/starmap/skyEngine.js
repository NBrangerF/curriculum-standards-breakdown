// One night sky behind every page. Pages claim a view ("home", "subject"); everything else gets a still,
// dim sky. Switching views blends each star from where it was to its new place, so a subject's stars fly
// out of the home glyph into the subject chart.
import { F, C, SUBJECT_SHORT, SKILL_SHORT, BAND_LABEL } from './starmapData.js'

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const UI_SELECTOR = 'a, button, input, select, textarea, label, li, header, [data-solid], [role="dialog"], [role="menu"]'
const PLACEHOLDER_COLORS = ['#EC6FA0', '#F2603A', '#3FA2E0', '#7D8AF8', '#45C46F', '#4FD1C5', '#F4B32F', '#C08CF0', '#B6C94A']
const DMAX = 0.55
const CHART_E = [0.17, 0.35, 0.53, 0.71, 1]

function hexA(hex, a) {
    const v = parseInt(hex.slice(1), 16)
    return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`
}

function sprite(color) {
    const c = document.createElement('canvas')
    const n = 64
    c.width = c.height = n
    const g = c.getContext('2d')
    const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.1, hexA(color, 1))
    gr.addColorStop(0.3, hexA(color, 0.32))
    gr.addColorStop(1, hexA(color, 0))
    g.fillStyle = gr
    g.fillRect(0, 0, n, n)
    return c
}

export function createSkyEngine(canvas, tipEl) {
    const ctx = canvas.getContext('2d')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let K = null
    let S = []
    let N = 0
    let W = 0, H = 0, DPR = 1, mobile = false
    let seed = 20221
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647

    // per-star state; sized once the data arrives (a placeholder sky is drawn until then)
    let RA, RB, RC, RD, COL, fin, alphaOf, P, BS, BA, CS, CA, HID, FROM, FS, FA, DLY, HL
    let T = {}
    let F1, F2, skillFaint, gal, galDepth, subjRank, PT, PR, BUL, HD
    let SPR = PLACEHOLDER_COLORS.map(sprite)
    let BY_SUBJ = [], BY_TS = [], SUBJ_LINKS = [], POOL = []
    const LBL = { oneSubj: [], oneBand: [], skills: [] }

    function allocate(n) {
        N = n
        RA = new Float32Array(N); RB = new Float32Array(N); RC = new Float32Array(N); RD = new Float32Array(N)
        for (let i = 0; i < N; i++) { RA[i] = rnd(); RB[i] = rnd(); RC[i] = rnd(); RD[i] = rnd() }
        fin = new Float32Array(N * 2); alphaOf = new Float32Array(N)
        P = new Float32Array(N * 2); BS = new Float32Array(N); BA = new Float32Array(N)
        CS = new Float32Array(N); CA = new Float32Array(N); HID = new Uint8Array(N); HL = new Uint8Array(N)
        FROM = new Float32Array(N * 2); FS = new Float32Array(N); FA = new Float32Array(N); DLY = new Float32Array(N)
        T = { glyph: new Float32Array(N * 2), oneSubj: new Float32Array(N * 2), oneBand: new Float32Array(N * 2), skills: new Float32Array(N * 2), sky: new Float32Array(N * 2) }
        F1 = new Uint8Array(N); F2 = new Uint8Array(N); skillFaint = new Uint8Array(N)
        gal = new Float32Array(N * 2); galDepth = new Float32Array(N); subjRank = new Float32Array(N)
        PT = new Float32Array(N); PR = new Float32Array(N); BUL = new Int32Array(N).fill(-1); HD = new Float32Array(N)
    }
    allocate(700)
    COL = new Uint8Array(N); for (let i = 0; i < N; i++) COL[i] = Math.floor(RA[i] * 9) % 9

    /* ---------- state ---------- */
    let view = 'ambient'
    let wanted = 'ambient'
    let home = null
    let subj = null
    let vt = 1, vStart = 0, vDur = 1
    let running = false, raf = 0, last = performance.now(), time = 0
    let hlOn = false, hlAmt = 0
    let mx = -1e4, my = -1e4, overUI = true, touch = false, hovered = -1
    let ringX = -100, ringY = -100, ringR = 16, ringA = 0, ptrOn = false
    let glyphReady = false, introStart = 0, phaseS = 0
    let tipFor = -1
    let nowIdx = -1, nowAt = 0, nowSubj = 2, nowHeld = false
    const chart = { s: -1, cx: 0, cy: 0, cy0: 0, R: 100, rot: 0, p: 0, sect: [], links: [], hoverSect: -1, hlSect: -1, hlRing: -1 }
    let OFF = new Float32Array(0), hoSet = -1, lastHS = -1, sectHL = null, restHL = null, railHL = null, palHL = null
    let chainFor = -2, chainEdges = []
    const capState = []

    /* ---------- layouts: home ---------- */
    const FOCUS_SUBJ = 2, FOCUS_BAND = 1
    const region = () => (mobile ? { x: W * 0.05, y: H * 0.09, w: W * 0.9, h: H * 0.44 } : { x: W * 0.4, y: H * 0.13, w: W * 0.56, h: H * 0.74 })
    // Home's 课标 glyph: right of the 540px copy column on desktop (HomePage .heroCopy), a band under the header on phones
    const glyphRegion = () => {
        if (mobile) return { x: W * 0.06, y: 70, w: W * 0.88, h: Math.min(H * 0.2, 170) }
        const x = Math.max(W * 0.47, (W - 1240) / 2 + 56 + 540 + 24)
        return { x, y: H * 0.2, w: W * 0.96 - x, h: H * 0.64 }
    }

    function computeSky() { for (let i = 0; i < N; i++) { T.sky[i * 2] = RA[i] * W; T.sky[i * 2 + 1] = RB[i] * H } }

    function computeGlyph() {
        const g = glyphRegion()
        const gw = Math.max(80, Math.round(g.w)), gh = Math.max(60, Math.round(g.h))
        const off = document.createElement('canvas'); off.width = gw; off.height = gh
        const c = off.getContext('2d', { willReadFrequently: true })
        const fs = Math.min(gh * 0.95, gw / 2.06)
        c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'
        c.font = `900 ${fs}px "Noto Serif SC Variable", "Noto Serif SC", "Songti SC", "STSong", serif`
        c.fillText('课标', gw / 2, gh / 2 + fs * 0.03)
        const d = c.getImageData(0, 0, gw, gh).data
        let filled = 0
        for (let k = 3; k < d.length; k += 4) if (d[k] > 128) filled++
        const step = Math.max(1, Math.floor(Math.sqrt(filled / (N * 1.4))))
        const pts = []
        for (let y = 0; y < gh; y += step) for (let x = 0; x < gw; x += step) if (d[(y * gw + x) * 4 + 3] > 128) pts.push(x, y)
        const m = pts.length / 2
        if (!m) return
        const order = Array.from({ length: m }, (_, k) => k)
        for (let k = m - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [order[k], order[j]] = [order[j], order[k]] }
        const chosen = []
        for (let i = 0; i < N; i++) { const k = order[i % m]; chosen.push([pts[k * 2] + (i >= m ? (rnd() - 0.5) * step : 0), pts[k * 2 + 1] + (i >= m ? (rnd() - 0.5) * step : 0)]) }
        chosen.sort((a, b) => a[0] + a[1] * 0.35 - (b[0] + b[1] * 0.35))
        for (let i = 0; i < N; i++) { T.glyph[i * 2] = g.x + chosen[i][0]; T.glyph[i * 2 + 1] = g.y + chosen[i][1] }
    }

    function computeOneSubj() {
        const r = region(), counts = new Array(4).fill(0)
        for (const i of BY_SUBJ[FOCUS_SUBJ]) counts[S[i][F.BAND]]++
        // the 7–9 column holds the most 要点, so it gets more columns of stars
        const ks = counts.map(c => Math.max(mobile ? 3 : 5, Math.ceil(Math.sqrt(c * (mobile ? 0.5 : 0.8)))))
        const rows = Math.max(...counts.map((c, b) => Math.ceil(c / ks[b])), 1)
        const gap = mobile ? 2.2 : 3.2
        const cols = ks.reduce((x, y) => x + y, 0) + gap * 3
        const sp = Math.min(r.w / cols, (r.h * 0.58) / rows, mobile ? 16 : 28)
        let x0 = r.x + (r.w - cols * sp) / 2
        const starts = [], centers = []
        for (let b = 0; b < 4; b++) { starts.push(x0); centers.push(x0 + ((ks[b] - 1) * sp) / 2); x0 += (ks[b] + gap) * sp }
        const bottom = r.y + r.h * 0.8
        const seen = new Array(4).fill(0)
        for (let i = 0; i < N; i++) {
            if (S[i][F.SUBJ] !== FOCUS_SUBJ) { T.oneSubj[i * 2] = T.sky[i * 2]; T.oneSubj[i * 2 + 1] = T.sky[i * 2 + 1]; F1[i] = 0; continue }
            const b = S[i][F.BAND], k = ks[b], j = seen[b]++
            F1[i] = 1
            T.oneSubj[i * 2] = starts[b] + (j % k) * sp
            T.oneSubj[i * 2 + 1] = bottom - Math.floor(j / k) * sp
        }
        LBL.oneSubj = BAND_LABEL.map((text, b) => ({ x: centers[b], y: bottom + 38, text }))
    }

    function computeOneBand() {
        const r = region(), k = mobile ? 2 : 3
        const counts = new Array(K.subjects.length).fill(0)
        for (let i = 0; i < N; i++) if (S[i][F.BAND] === FOCUS_BAND) counts[S[i][F.SUBJ]]++
        const shown = counts.map((c, s) => (c ? s : -1)).filter(s => s >= 0), colOf = s => shown.indexOf(s)
        const maxRows = Math.ceil(Math.max(...counts) / k)
        const colW = r.w / Math.max(1, shown.length)
        const sp = Math.min((colW * 0.72) / k, (r.h * 0.62) / Math.max(maxRows, 1), mobile ? 14 : 24)
        const bottom = r.y + r.h * 0.82
        const seen = new Array(K.subjects.length).fill(0)
        for (let i = 0; i < N; i++) {
            if (S[i][F.BAND] !== FOCUS_BAND) { T.oneBand[i * 2] = T.sky[i * 2]; T.oneBand[i * 2 + 1] = T.sky[i * 2 + 1]; F2[i] = 0; continue }
            const s = S[i][F.SUBJ], j = seen[s]++, cx = r.x + colW * (colOf(s) + 0.5)
            F2[i] = 1
            T.oneBand[i * 2] = cx + ((j % k) - (k - 1) / 2) * sp
            T.oneBand[i * 2 + 1] = bottom - Math.floor(j / k) * sp
        }
        LBL.oneBand = shown.map(si => ({ x: r.x + colW * (colOf(si) + 0.5), y: bottom + 26, text: mobile || shown.length > 9 ? SUBJECT_SHORT[si] : K.subjects[si].name, top: bottom - Math.ceil(counts[si] / k) * sp - 16, num: String(counts[si]), color: K.subjects[si].color }))
    }

    function computeSkills() {
        const r = region(), cx = r.x + r.w / 2, cy = r.y + r.h * 0.48
        const ring = Math.min(r.w * 0.36, r.h * 0.42), ry = mobile ? 0.9 : 0.86
        const big = Math.max(...BY_TS.map(g => g.length)), c = (ring * 0.3) / Math.sqrt(big)
        skillFaint.fill(1)
        LBL.skills = []
        BY_TS.forEach((g, k) => {
            const a = -Math.PI / 2 + (k * Math.PI * 2) / 7, gx = cx + Math.cos(a) * ring, gy = cy + Math.sin(a) * ring * ry
            const rr = Math.sqrt(g.length) * c
            g.forEach((i, j) => { const d = rr * Math.sqrt((j + 0.5) / g.length), t = j * 2.39996; T.skills[i * 2] = gx + Math.cos(t) * d; T.skills[i * 2 + 1] = gy + Math.sin(t) * d; skillFaint[i] = 0 })
            LBL.skills.push({ x: gx, y: gy + rr + 18, text: mobile ? SKILL_SHORT[k] : K.skills[k][1], num: String(g.length) })
        })
        for (let i = 0; i < N; i++) if (skillFaint[i]) { const a = RA[i] * Math.PI * 2, d = ring * (1.55 + (RB[i] - 0.5) * 0.18); T.skills[i * 2] = cx + Math.cos(a) * d; T.skills[i * 2 + 1] = cy + Math.sin(a) * d * 0.62 }
    }

    function computeGalaxy() {
        const r = region(), cx = r.x + r.w / 2, cy = r.y + r.h / 2
        const R = Math.min(r.w / 2, r.h) * 0.94, spin = reduce ? 0 : time * 0.035
        for (let i = 0; i < N; i++) {
            const s = S[i][F.SUBJ], t = subjRank[i]
            const rad = 0.08 + 0.92 * Math.pow(t, 0.8) + (RB[i] - 0.5) * 0.07
            const a = (s * Math.PI * 2) / K.subjects.length + t * 2.7 + (RA[i] - 0.5) * 0.42 + spin * (1.3 - rad * 0.6)
            gal[i * 2] = cx + Math.cos(a) * rad * R
            gal[i * 2 + 1] = cy + Math.sin(a) * rad * R * 0.5 + (RC[i] - 0.5) * 0.08 * R
            galDepth[i] = Math.sin(a)
        }
    }

    /* ---------- layouts: subject chart (sectors = 领域, rings = 学段, a standard's 要点 linked as a constellation) ---------- */
    function computePlan(s) {
        const E = CHART_E, list = BY_SUBJ[s], D = K.subjects[s].domains.length
        const spN = (W < 900 ? 9 : 11.5) / chart.R
        const cells = Array.from({ length: D }, () => [[], [], [], []])
        for (const i of list) cells[S[i][F.DOMAIN]][S[i][F.BAND]].push(i)
        const mid = b => (E[b] + E[b + 1]) / 2
        const maxRows = b => Math.max(1, Math.floor((E[b + 1] - E[b]) / spN))
        const need = cells.map(c => Math.max(...c.map((x, b) => (x.length * spN) / mid(b) / maxRows(b))))
        const seam = 0.34, gap = 0.045, avail = Math.PI * 2 - seam - gap * D
        const tot = need.reduce((x, y) => x + y, 0) || 1
        let spans = need.map(x => Math.max(avail * 0.06, (avail * x) / tot))
        const fit = avail / spans.reduce((x, y) => x + y, 0)
        spans = spans.map(x => x * fit)
        let a = -Math.PI / 2 + seam / 2 + gap / 2
        chart.sect = []
        const theta = new Map()
        for (let d = 0; d < D; d++) {
            const a0 = a, a1 = a + spans[d]
            a = a1 + gap
            chart.sect.push({ a0, a1, name: K.subjects[s].domains[d], count: list.filter(i => S[i][F.DOMAIN] === d).length })
            const pad = Math.min(0.02, (a1 - a0) * 0.08), inner = a1 - a0 - 2 * pad
            for (let b = 0; b < 4; b++) {
                const raw = cells[d][b], n = raw.length
                if (!n) continue
                // order each ring by where its predecessors sit so progression links run outward
                const items = raw.map((i, k) => { const ps = S[i][F.PREV].filter(j => theta.has(j)); const def = a0 + pad + ((k + 0.5) / n) * inner; return [i, ps.length ? ps.reduce((t, j) => t + theta.get(j), 0) / ps.length : def] }).sort((x, y) => x[1] - y[1]).map(x => x[0])
                const rows = clamp(Math.ceil((n * spN) / (inner * mid(b))), 1, maxRows(b)), cols = Math.ceil(n / rows)
                const rw = (E[b + 1] - E[b]) / rows, cw = inner / cols
                items.forEach((i, j) => {
                    const c = Math.floor(j / rows), r = j % rows
                    const th = a0 + pad + (c + 0.5) * cw + (RA[i] - 0.5) * cw * 0.3
                    const rr = E[b] + (r + 0.5 + (c % 2 && rows > 1 ? 0.22 : 0) + (RB[i] - 0.5) * 0.25) * rw
                    PT[i] = th
                    PR[i] = clamp(rr, E[b] + rw * 0.2, E[b + 1] - rw * 0.2)
                    theta.set(i, th)
                })
            }
        }
        chart.links = []
        for (const i of list) for (const j of S[i][F.NEXT]) if (S[j][F.SUBJ] === s) chart.links.push(i, j)
        chainFor = -2
    }

    function layoutSubject() {
        if (!subj || !K) return
        chart.s = subj.subject
        if (W < 900) {
            const R = Math.min(W * 0.4, H * 0.21)
            chart.R = R; chart.cx = W / 2; chart.cy0 = 64 + 34 + R
            subj.heroEl?.style.setProperty('--s-top', `${Math.round(chart.cy0 + R + 48)}px`)
        } else {
            const right = subj.copyEl ? subj.copyEl.getBoundingClientRect().right : W * 0.4
            chart.R = clamp(Math.min(H * 0.36, (W - right) / 2 - 64), 120, 380)
            chart.cx = (right + W) / 2 + 6
            chart.cy0 = H * 0.53
        }
        chart.cy = chart.cy0
        computePlan(subj.subject)
    }

    function measureTable() {
        if (!subj || !K || view !== 'subject') return
        const table = subj.tableEl
        if (!table) { OFF = new Float32Array(0); return }
        const gr = table.getBoundingClientRect(), slots = [], slotOf = new Map()
        table.querySelectorAll('[data-star]').forEach(el => {
            const dot = el.querySelector('[data-dot]') || el
            const r = dot.getBoundingClientRect()
            slotOf.set(Number(el.dataset.star), slots.length / 2)
            slots.push(r.left + r.width / 2 - gr.left, r.top + r.height / 2 - gr.top)
        })
        OFF = Float32Array.from(slots)
        const span = Math.max(1, Math.min(gr.height, H * 1.6))
        BUL.fill(-1)
        for (const i of BY_SUBJ[subj.subject]) {
            let k = slotOf.get(i)
            // the table lists standards: every 要点 of a constellation flies to its standard's row
            if (k == null) k = slotOf.get(K.cons[S[i][F.CON]]?.[C.FIRST])
            if (k != null) { BUL[i] = k; HD[i] = clamp(OFF[k * 2 + 1] / span, 0, 1) * 0.35 }
        }
    }

    /* ---------- resize ---------- */
    function layout() {
        DPR = Math.min(window.devicePixelRatio || 1, 2)
        W = window.innerWidth; H = window.innerHeight; mobile = W < 760
        canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR)
        computeSky()
        if (K) {
            computeOneSubj(); computeOneBand(); computeSkills()
            if (glyphReady) computeGlyph()
            if (view === 'subject') { layoutSubject(); measureTable() }
        }
        kick()
    }

    /* ---------- data ---------- */
    function setData(data) {
        if (K) return
        K = data; S = K.S
        const old = N
        allocate(K.N)
        SPR = K.subjects.map(s => sprite(s.color))
        BY_SUBJ = K.bySubject; BY_TS = K.bySkill
        COL = new Uint8Array(N)
        const seen = new Array(K.subjects.length).fill(0)
        for (let i = 0; i < N; i++) { const s = S[i][F.SUBJ]; COL[i] = s; subjRank[i] = seen[s]++ / K.subjects[s].count }
        SUBJ_LINKS = []
        for (const i of BY_SUBJ[FOCUS_SUBJ]) for (const j of S[i][F.NEXT]) if (S[j][F.SUBJ] === FOCUS_SUBJ) SUBJ_LINKS.push(i, j)
        const BAD_TITLE = /^(能)?(在|根据|结合|通过|熟悉|围绕|按照|针对|基于|面对|对于|借助)|(中|下|时|后|上|里|需要|过程中|情境)$/
        POOL = K.subjects.map(() => [])
        for (let i = 0; i < N; i++) { const t = S[i][F.TITLE]; if (t.length >= 7 && t.length <= 20 && !BAD_TITLE.test(t) && !/[A-Za-z]{3}/.test(t)) POOL[S[i][F.SUBJ]].push(i) }
        nowIdx = K.codeIndex.get('MA-S2-NA-01.2') ?? 0
        layout()
        // start from the still sky so the first claimed view can fly in from it
        fin.set(T.sky)
        for (let i = 0; i < N; i++) { CS[i] = 0.9; CA[i] = 0.14 }
        if (wanted !== 'ambient') applyView(wanted)
        const fontReady = document.fonts?.load ? Promise.race([document.fonts.load('900 120px "Noto Serif SC Variable"', '课标'), new Promise(r => setTimeout(r, 2500))]) : Promise.resolve()
        fontReady.catch(() => {}).then(() => { computeGlyph(); glyphReady = true; introStart = performance.now(); kick() })
    }

    /* ---------- views ---------- */
    function beginTransition(sec) {
        FROM.set(fin); FS.set(CS); FA.set(CA)
        vStart = performance.now(); vDur = sec * 1000; vt = reduce ? 1 : 0
    }

    function applyView(next) {
        wanted = next
        if (!K && next !== 'ambient') return
        beginTransition(next === 'subject' ? 2.1 : next === 'home' ? 1.4 : 1.1)
        view = next
        hovered = -1; tipHide(); chart.hoverSect = -1; lastHS = -1; sectHL = null; hoSet = -1
        if (next === 'subject') {
            layoutSubject()
            for (let i = 0; i < N; i++) DLY[i] = S[i][F.SUBJ] === subj.subject ? clamp((PT[i] + Math.PI / 2) / (Math.PI * 2), 0, 1) * DMAX : RD[i] * 0.3
            OFF = new Float32Array(0)
            requestAnimationFrame(measureTable)
        } else {
            for (let i = 0; i < N; i++) DLY[i] = RD[i] * 0.35
        }
        if (next !== 'subject') chart.hlSect = chart.hlRing = -1
        setCursor(false)
        kick()
    }

    function setHome(cfg) { home = cfg; applyView('home') }
    function setSubject(cfg) {
        const same = wanted === 'subject' && view === 'subject' && subj && subj.subject === cfg.subject
        subj = cfg
        if (same) { layoutSubject(); measureTable(); return }
        applyView('subject')
    }
    function release(name) {
        if (wanted !== name) return
        if (name === 'home') home = null
        if (name === 'subject') subj = null
        restHL = null; railHL = null; sectHL = null
        applyHL()
        applyView('ambient')
    }

    function setHighlight(list) {
        if (!HL) return
        HL.fill(0)
        hlOn = !!list
        if (list) for (const i of list) if (i < N) HL[i] = 1
        kick()
    }
    // priority: the search palette, then a hovered rail or row, then a hovered chart sector, then the page's resting set
    function applyHL() { setHighlight(palHL || railHL || sectHL || restHL) }
    function setRestHighlight(list) { restHL = list; applyHL() }
    function setPaletteHighlight(list) { palHL = list; applyHL() }
    function setChartHighlight({ sect = -1, ring = -1, list = null } = {}) {
        chart.hlSect = sect; chart.hlRing = ring
        railHL = list
        applyHL()
    }

    /* ---------- pointer ---------- */
    function onMove(e) {
        touch = e.pointerType === 'touch'
        mx = e.clientX; my = e.clientY
        overUI = !!e.target.closest?.(UI_SELECTOR)
        if (view !== 'ambient') kick()
    }
    function onLeave() { mx = my = -1e4 }
    function nearest(x, y, radius) {
        let best = -1, bd = radius * radius
        for (let i = 0; i < N; i++) {
            if (alphaOf[i] < 0.3) continue
            const dx = fin[i * 2] - x, dy = fin[i * 2 + 1] - y, d = dx * dx + dy * dy
            if (d < bd) { bd = d; best = i }
        }
        return best
    }
    function onClick(e) {
        if (!K || view === 'ambient' || e.target.closest?.(UI_SELECTOR)) return
        const i = hovered >= 0 && !touch ? hovered : nearest(e.clientX, e.clientY, 34)
        const cfg = view === 'home' ? home : subj
        if (i >= 0) { cfg?.onStarClick?.(i, fin[i * 2], fin[i * 2 + 1]); return }
        if (view === 'subject') { const d = sectorAt(e.clientX, e.clientY, true); if (d >= 0) subj?.onSector?.(d) }
    }
    function setCursor(on) { if (on !== ptrOn) { ptrOn = on; document.documentElement.style.cursor = on ? 'pointer' : '' } }

    function sectorAt(x, y, ignoreUI) {
        if (view !== 'subject' || chart.p > 0.3 || vt < 0.8 || (!ignoreUI && overUI)) return -1
        const dx = x - chart.cx, dy = y - chart.cy, rr = Math.hypot(dx, dy) / chart.R
        if (rr < CHART_E[0] || rr > 1.18) return -1
        let a = Math.atan2(dy, dx) - chart.rot
        while (a < -Math.PI / 2) a += Math.PI * 2
        while (a >= Math.PI * 1.5) a -= Math.PI * 2
        return chart.sect.findIndex(sc => a >= sc.a0 - 0.03 && a <= sc.a1 + 0.03)
    }

    /* ---------- tooltip ---------- */
    function tipHide() { if (tipEl && !tipEl.hidden) { tipEl.hidden = true; tipFor = -1 } }
    function showTip(i, x, y) {
        if (!tipEl) return
        const s = S[i]
        if (tipFor !== i) {
            tipFor = i
            tipEl.style.setProperty('--c', K.subjects[s[F.SUBJ]].color)
            tipEl.textContent = ''
            const head = document.createElement('div')
            head.dataset.part = 'meta'
            const stage = K.subjects[s[F.SUBJ]].stages?.find(st => st.band === s[F.BAND])
            head.append(document.createElement('i'), `${s[F.CODE]} · ${stage?.range || BAND_LABEL[s[F.BAND]]}`)
            const body = document.createElement('div')
            body.textContent = `${K.cons[s[F.CON]]?.[C.NAME] || ''}｜${s[F.TITLE]}`
            tipEl.append(head, body)
        }
        tipEl.hidden = false
        const r = tipEl.getBoundingClientRect()
        let left = x + 18, top = y + 18
        if (left + r.width > W - 12) left = x - r.width - 18
        if (top + r.height > H - 12) top = y - r.height - 18
        tipEl.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    }

    /* ---------- home: scroll phase, captions, hero star ---------- */
    function phaseNow() {
        const st = home?.storyEl
        if (!st) return 0
        const r = st.getBoundingClientRect()
        const storyTop = r.top + window.scrollY, storyLen = Math.max(1, st.offsetHeight - H)
        const y = window.scrollY
        if (y < storyTop) { setCaps(-1); return clamp(y / Math.max(1, storyTop), 0, 1) }
        const u = clamp((y - storyTop) / storyLen, 0, 1), s = u * 5, i = Math.min(4, Math.floor(s)), f = s - i
        setCaps(s)
        return Math.min(5, 1 + i + smooth(0.55, 0.95, f))
    }
    function setCaps(s) {
        const caps = home?.capEls || []
        caps.forEach((c, k) => {
            if (!c) return
            let v = s < 0 ? 0 : smooth(k - 0.12, k + 0.3, s) * (k === caps.length - 1 ? 1 : 1 - smooth(k + 0.7, k + 0.92, s))
            v = Math.round(v * 100) / 100
            if (v === capState[k]) return
            capState[k] = v
            c.style.opacity = Math.min(1, v * 3)
            c.style.visibility = v === 0 ? 'hidden' : 'visible'
            c.style.setProperty('--p', reduce ? 1 : v)
            c.style.transform = mobile ? `translateY(${(1 - v) * 16}px)` : `translateY(-50%) translateX(${(1 - v) * -16}px)`
        })
    }
    function setNow(i) {
        if (i === nowIdx) return
        nowIdx = i; nowAt = performance.now()
        home?.onNow?.(i)
    }
    function nextNow() {
        for (let k = 0; k < K.subjects.length; k++) {
            nowSubj = (nowSubj + 1) % K.subjects.length
            const p = POOL[nowSubj]
            if (p.length) { setNow(p[Math.floor(Math.random() * p.length)]); return }
        }
    }
    function drawLeader(vis, now) {
        if (vis <= 0.01 || nowIdx < 0 || !home?.nowCodeEl || !home?.nowDotEl) return
        const sx = fin[nowIdx * 2], sy = fin[nowIdx * 2 + 1]
        const cr = home.nowCodeEl.getBoundingClientRect(), dr = home.nowDotEl.getBoundingClientRect()
        let p0, p1
        if (sx > cr.right + 60) { p0 = [cr.right + 14, cr.top + cr.height / 2]; p1 = [sx - 44, p0[1]] }
        else { p0 = [Math.max(4, dr.left - 10), dr.top + dr.height / 2]; p1 = [p0[0], sy + (sy < p0[1] ? 44 : -44)] }
        const p2 = [sx, sy]
        const e = reduce ? 1 : ease(clamp((now - nowAt) / 800, 0, 1))
        const l1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), L = (l1 + l2) * e
        ctx.strokeStyle = `rgba(233,200,135,${0.7 * vis})`; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1])
        if (L <= l1) { const k = L / Math.max(l1, 1); ctx.lineTo(p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k) }
        else { ctx.lineTo(p1[0], p1[1]); const k = (L - l1) / Math.max(l2, 1); ctx.lineTo(p1[0] + (p2[0] - p1[0]) * k, p1[1] + (p2[1] - p1[1]) * k) }
        ctx.stroke()
        ctx.beginPath(); ctx.arc(p0[0], p0[1], 2, 0, Math.PI * 2); ctx.fillStyle = `rgba(233,200,135,${0.85 * vis})`; ctx.fill()
        if (e > 0.98) { ctx.beginPath(); ctx.arc(sx, sy, 11 + Math.sin(now / 320) * 1.6, 0, Math.PI * 2); ctx.stroke() }
    }

    /* ---------- per-view targets ---------- */
    function twinkle(i) { return reduce ? 0.9 : 0.62 + 0.38 * Math.sin(time * (0.5 + RA[i] * 1.6) + RD[i] * 6.28) }

    function homeTargets(a, u, w, intro) {
        const src = f => (f === 1 ? gal : f === 2 ? T.oneSubj : f === 3 ? T.oneBand : f === 4 ? T.skills : T.sky)
        for (let i = 0; i < N; i++) {
            let ax, ay
            if (a === 0) { const lt = ease(clamp((intro - RD[i] * 0.45) / 0.55, 0, 1)); ax = T.sky[i * 2] + (T.glyph[i * 2] - T.sky[i * 2]) * lt; ay = T.sky[i * 2 + 1] + (T.glyph[i * 2 + 1] - T.sky[i * 2 + 1]) * lt }
            else { const sa = src(a); ax = sa[i * 2]; ay = sa[i * 2 + 1] }
            if (u > 0) {
                const sb = src(a + 1)
                let bx = sb[i * 2], by = sb[i * 2 + 1]
                if (a + 1 === 5 && !reduce) { bx += Math.sin(time * 0.07 + RD[i] * 6.28) * 10; by += Math.cos(time * 0.05 + RC[i] * 6.28) * 8 }
                const lt = reduce ? u : ease(clamp((u - RC[i] * 0.3) / 0.7, 0, 1))
                const dx = bx - ax, dy = by - ay
                let x = ax + dx * lt, yy = ay + dy * lt
                if (!reduce) { const sw = Math.sin(Math.PI * lt) * 0.16 * (RA[i] > 0.5 ? 1 : -1); x += -dy * sw; yy += dx * sw }
                P[i * 2] = x; P[i * 2 + 1] = yy
            } else {
                if (a === 5 && !reduce) { ax += Math.sin(time * 0.07 + RD[i] * 6.28) * 10; ay += Math.cos(time * 0.05 + RC[i] * 6.28) * 8 }
                P[i * 2] = ax; P[i * 2 + 1] = ay
            }
            let size = 1.05 + RB[i] * 1.25 + (S[i][F.OFFICIAL] ? 0.75 : 0)
            let al = twinkle(i)
            if (w[0] > 0) al *= 0.35 + 0.65 * intro
            if (w[1] > 0) size *= 1 + w[1] * (0.2 * galDepth[i] - 0.05)
            if (w[2] > 0) { if (F1[i]) size *= 1 + w[2] * (mobile ? 0.5 : 1.1); else { al *= 1 - w[2] * 0.82; size *= 1 - w[2] * 0.3 } }
            if (w[3] > 0) { if (F2[i]) size *= 1 + w[3] * (mobile ? 0.35 : 0.7); else { al *= 1 - w[3] * 0.82; size *= 1 - w[3] * 0.3 } }
            if (w[4] > 0 && skillFaint[i]) al *= 1 - w[4] * 0.65
            if (w[5] > 0) { size *= 1 - w[5] * 0.3; al *= 1 - w[5] * 0.45 }
            BS[i] = size; BA[i] = al; HID[i] = 0
        }
    }

    function backgroundStar(i, still) {
        let x = T.sky[i * 2], y = T.sky[i * 2 + 1]
        if (!reduce && !still) { x += Math.sin(time * 0.07 + RD[i] * 6.28) * 10; y += Math.cos(time * 0.05 + RC[i] * 6.28) * 8 }
        P[i * 2] = x; P[i * 2 + 1] = y
        BS[i] = 0.8 + RB[i] * 0.8
        BA[i] = (still ? 0.11 + 0.08 * RC[i] : 0.16 * twinkle(i))
        HID[i] = 0
    }

    function subjTargets() {
        const g = chart, s = subj.subject
        g.cy = g.cy0 - Math.min(window.scrollY, H * 1.2) * (W < 900 ? 0.5 : 0.7)
        g.rot = reduce ? 0 : -0.5 * (1 - ease(clamp(vt / 0.9, 0, 1)))
        let p = 0, gx = 0, gy = 0
        if (OFF.length && subj.tableEl) { const r = subj.tableEl.getBoundingClientRect(); gx = r.left; gy = r.top; p = clamp((H * 0.92 - r.top) / (H * 0.62), 0, 1) }
        g.p = p
        const ho = Math.round(smooth(0.88, 1, p) * 100) / 100
        if (ho !== hoSet && subj.tableEl) { hoSet = ho; subj.tableEl.style.setProperty('--ho', ho) }
        for (let i = 0; i < N; i++) {
            if (S[i][F.SUBJ] !== s) { backgroundStar(i, false); continue }
            HID[i] = 0
            const th = PT[i] + g.rot, rr = PR[i] * g.R
            let x = g.cx + Math.cos(th) * rr, y = g.cy + Math.sin(th) * rr
            let size = 0.95 + RB[i] * 0.75 + (S[i][F.OFFICIAL] ? 0.5 : 0), al = twinkle(i)
            if (p > 0) {
                // hand-off: each star leaves the chart and lands on its own row in the table
                const k = BUL[i], e = ease(clamp((p - HD[i]) / 0.65, 0, 1))
                if (k >= 0) { x += (gx + OFF[k * 2] - x) * e; y += (gy + OFF[k * 2 + 1] - y) * e; size += ((mobile ? 2.6 : 2.2) - size) * e; al += (1 - al) * e; if (p >= 1) HID[i] = 1 }
                else al *= 1 - e
            }
            P[i * 2] = x; P[i * 2 + 1] = y; BS[i] = size; BA[i] = al
        }
    }

    /* ---------- subject chart drawing ---------- */
    const chartFade = ov => ov * (1 - smooth(0, 0.5, chart.p))
    const chartSweep = () => Math.PI * 2 * (vt >= 1 || reduce ? 1 : ease(clamp(vt / 0.8, 0, 1)))
    function polarLink(i, j) {
        const cx = chart.cx, cy = chart.cy, x1 = fin[i * 2] - cx, y1 = fin[i * 2 + 1] - cy, x2 = fin[j * 2] - cx, y2 = fin[j * 2 + 1] - cy
        const r1 = Math.hypot(x1, y1), r2 = Math.hypot(x2, y2), a1 = Math.atan2(y1, x1)
        let da = Math.atan2(y2, x2) - a1
        while (da > Math.PI) da -= Math.PI * 2
        while (da < -Math.PI) da += Math.PI * 2
        const n = Math.max(2, Math.ceil(Math.abs(da) * 10))
        ctx.moveTo(cx + x1, cy + y1)
        for (let k = 1; k <= n; k++) { const t = k / n, a = a1 + da * t, r = r1 + (r2 - r1) * t; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) }
    }
    function chartChain(i) {
        if (chainFor === i) return chainEdges
        chainFor = i; chainEdges = []
        const walk = key => { const q = [i], seen = new Set([i]); while (q.length) { const x = q.shift(); for (const y of S[x][key]) { if (seen.has(y) || S[y][F.SUBJ] !== chart.s) continue; seen.add(y); chainEdges.push(x, y); q.push(y) } } }
        walk(F.PREV); walk(F.NEXT)
        return chainEdges
    }
    function drawChart(ov) {
        const g = chart, E = CHART_E, R = g.R, cx = g.cx, cy = g.cy
        const fade = chartFade(ov)
        if (fade < 0.01) return
        const sweep = chartSweep(), A0 = -Math.PI / 2 + g.rot, col = K.subjects[g.s].color
        ctx.lineWidth = 1
        const hs = g.hoverSect >= 0 ? g.hoverSect : g.hlSect
        if (hs >= 0 && g.sect[hs]) { const sc = g.sect[hs]; ctx.beginPath(); ctx.arc(cx, cy, R * 1.03, sc.a0 + g.rot, sc.a1 + g.rot); ctx.arc(cx, cy, R * E[0], sc.a1 + g.rot, sc.a0 + g.rot, true); ctx.closePath(); ctx.fillStyle = hexA(col, 0.09 * fade); ctx.fill() }
        if (g.hlRing >= 0) { const b = g.hlRing; ctx.beginPath(); ctx.arc(cx, cy, R * E[b + 1], 0, Math.PI * 2); ctx.arc(cx, cy, R * E[b], Math.PI * 2, 0, true); ctx.fillStyle = hexA(col, 0.08 * fade); ctx.fill() }
        for (let b = 0; b <= 4; b++) {
            ctx.strokeStyle = `rgba(222,228,238,${(b === 4 ? 0.24 : 0.12) * fade})`
            ctx.beginPath(); ctx.arc(cx, cy, R * E[b], A0, A0 + sweep); ctx.stroke()
        }
        ctx.strokeStyle = `rgba(222,228,238,${0.3 * fade})`
        ctx.beginPath()
        for (let k = 0; k < 180; k++) {
            const t = (k / 180) * Math.PI * 2
            if (t > sweep) break
            const a = A0 + t, l = k % 15 === 0 ? 9 : k % 5 === 0 ? 5 : 2.5, c = Math.cos(a), sn = Math.sin(a)
            ctx.moveTo(cx + c * (R + 5), cy + sn * (R + 5)); ctx.lineTo(cx + c * (R + 5 + l), cy + sn * (R + 5 + l))
        }
        ctx.stroke()
        ctx.strokeStyle = `rgba(222,228,238,${0.1 * fade})`
        ctx.beginPath()
        const bounds = g.sect.map(sc => sc.a0 - 0.0225)
        if (g.sect.length) bounds.push(g.sect[g.sect.length - 1].a1 + 0.0225)
        for (const a of bounds) { if (a + Math.PI / 2 > sweep) continue; const c = Math.cos(a + g.rot), sn = Math.sin(a + g.rot); ctx.moveTo(cx + c * R * E[0], cy + sn * R * E[0]); ctx.lineTo(cx + c * R, cy + sn * R) }
        ctx.stroke()
        const la = fade * smooth(0.55, 1, vt) * (1 - smooth(0, 0.25, g.p))
        if (la > 0.01) {
            ctx.strokeStyle = `rgba(233,200,135,${0.22 * la})`
            ctx.beginPath()
            for (let k = 0; k < g.links.length; k += 2) polarLink(g.links[k], g.links[k + 1])
            ctx.stroke()
            if (hovered >= 0 && S[hovered][F.SUBJ] === g.s) {
                const ch = chartChain(hovered)
                if (ch.length) { ctx.strokeStyle = `rgba(233,200,135,${0.95 * la})`; ctx.lineWidth = 1.5; ctx.beginPath(); for (let k = 0; k < ch.length; k += 2) polarLink(ch[k], ch[k + 1]); ctx.stroke(); ctx.lineWidth = 1 }
            }
        }
        const cr = R * E[0] * 0.62
        ctx.strokeStyle = `rgba(233,200,135,${0.5 * fade})`; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.stroke()
        ctx.fillStyle = `rgba(233,200,135,${0.92 * fade})`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.font = `900 ${Math.round(cr * 0.66)}px "Noto Serif SC Variable", "Songti SC", serif`
        ctx.fillText(SUBJECT_SHORT[g.s], cx, cy + 1)
    }
    // Domain names run around the rim with upright glyphs, reading left-to-right or top-to-bottom on every side.
    function arcText(name, count, mid, r, px, color, numColor) {
        const toks = [...name].map(t => ({ t }))
        toks.push({ t: ' ', sp: true }, { t: String(count), num: true })
        const fN = `600 ${px}px "PingFang SC", "Microsoft YaHei", sans-serif`, fD = `italic ${Math.round(px * 1.45)}px "Instrument Serif", Georgia, serif`
        ctx.font = fD
        for (const o of toks) o.w = o.num ? ctx.measureText(o.t).width + 2 : o.sp ? px * 0.4 : px * 1.12
        const total = toks.reduce((x, o) => x + o.w, 0) / r, tx = -Math.sin(mid), ty = Math.cos(mid)
        const ccw = !(Math.abs(tx) >= Math.abs(ty) ? tx > 0 : ty > 0)
        let acc = 0
        for (const o of toks) {
            const c = (acc + o.w / 2) / r
            acc += o.w
            if (o.sp) continue
            const a = ccw ? mid + total / 2 - c : mid - total / 2 + c
            ctx.font = o.num ? fD : fN; ctx.fillStyle = o.num ? numColor : color
            ctx.fillText(o.t, chart.cx + Math.cos(a) * r, chart.cy + Math.sin(a) * r)
        }
    }
    function drawChartLabels(ov) {
        const g = chart, E = CHART_E, R = g.R, fade = chartFade(ov)
        if (fade < 0.01) return
        const sweep = chartSweep(), A0 = -Math.PI / 2 + g.rot, col = K.subjects[g.s].color
        const small = W < 900, px = small ? 10.5 : 13, rr = R + (small ? 22 : 30)
        const hs = g.hoverSect >= 0 ? g.hoverSect : g.hlSect
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        g.sect.forEach((sc, d) => {
            const m = (sc.a0 + sc.a1) / 2
            if (m + Math.PI / 2 > sweep) return
            ctx.globalAlpha = fade * (hs < 0 || hs === d ? 1 : 0.4)
            arcText(sc.name, sc.count, m + g.rot, rr, px, hs === d ? col : '#ECEFF4', col)
        })
        ctx.globalAlpha = fade
        const ca = Math.cos(A0), sa = Math.sin(A0)
        ctx.font = `500 ${small ? 9 : 10.5}px "IBM Plex Mono", monospace`; ctx.fillStyle = '#858E9C'
        // each ring is one of the subject's own stages (艺术 3–5, 6–7, 8–9; 英语 from 3–4)
        for (const st of K.subjects[g.s].stages || []) { const b = st.band, r = (R * (E[b] + E[b + 1])) / 2; ctx.fillText(st.range.replace(' 年级', ''), g.cx + ca * r, g.cy + sa * r) }
        ctx.globalAlpha = 1
    }

    function drawHomeLabels(w, ov) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        if (w[2] > 0.02) {
            ctx.globalAlpha = w[2] * ov
            for (const l of LBL.oneSubj) { ctx.font = l.small ? `500 ${mobile ? 10 : 12}px "PingFang SC", sans-serif` : `500 ${mobile ? 11 : 13.5}px "PingFang SC", sans-serif`; ctx.fillStyle = l.small ? '#858E9C' : '#ECEFF4'; ctx.fillText(l.text, l.x, l.y) }
        }
        if (w[3] > 0.02) {
            ctx.globalAlpha = w[3] * ov
            for (const l of LBL.oneBand) {
                ctx.font = `500 ${mobile ? 11 : 13.5}px "PingFang SC", sans-serif`; ctx.fillStyle = '#ECEFF4'; ctx.fillText(l.text, l.x, l.y)
                ctx.font = `italic ${mobile ? 15 : 22}px "Instrument Serif", Georgia, serif`; ctx.fillStyle = l.color; ctx.fillText(l.num, l.x, l.top)
            }
        }
        if (w[4] > 0.02) {
            ctx.globalAlpha = w[4] * ov
            for (const l of LBL.skills) {
                ctx.font = `500 ${mobile ? 11 : 13}px "PingFang SC", sans-serif`; ctx.fillStyle = '#ECEFF4'; ctx.fillText(l.text, l.x, l.y)
                ctx.font = `italic ${mobile ? 13 : 17}px "Instrument Serif", Georgia, serif`; ctx.fillStyle = '#E9C887'; ctx.fillText(l.num, l.x, l.y + (mobile ? 14 : 18))
            }
        }
        ctx.globalAlpha = 1
    }

    /* ---------- frame ---------- */
    function kick() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame) } }

    function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000)
        last = now; time += dt
        if (vt < 1) vt = reduce ? 1 : clamp((now - vStart) / vDur, 0, 1)
        hlAmt += ((hlOn ? 1 : 0) - hlAmt) * (reduce ? 1 : 1 - Math.exp(-dt * 9))
        const isHome = view === 'home' && K && home
        const isSubj = view === 'subject' && K && subj
        const w = [0, 0, 0, 0, 0, 0]
        let heroVis = 0
        if (isHome) {
            const phase = phaseNow()
            phaseS += (phase - phaseS) * (reduce ? 1 : 1 - Math.exp(-dt * 5))
            if (Math.abs(phase - phaseS) < 0.0005) phaseS = phase
            const intro = !glyphReady ? 0 : reduce ? 1 : clamp((now - introStart) / 2000, 0, 1)
            const a = Math.min(4, Math.floor(phaseS)), u = phaseS - a
            if (a === 1 || (a === 0 && u > 0)) computeGalaxy()
            w[a] = 1 - u; w[a + 1] += u
            heroVis = glyphReady ? clamp(1 - phaseS / 0.3, 0, 1) * clamp((intro - 0.8) / 0.2, 0, 1) : 0
            homeTargets(a, u, w, intro)
        } else if (isSubj) subjTargets()
        else for (let i = 0; i < N; i++) backgroundStar(i, true)

        if (vt >= 1) { fin.set(P); CS.set(BS); CA.set(BA) }
        else {
            const span = 1 - DMAX
            for (let i = 0; i < N; i++) {
                const e = ease(clamp((vt - DLY[i]) / span, 0, 1))
                const fx = FROM[i * 2], fy = FROM[i * 2 + 1], dx = P[i * 2] - fx, dy = P[i * 2 + 1] - fy
                let x = fx + dx * e, y = fy + dy * e
                if (!reduce) { const sw = Math.sin(Math.PI * e) * 0.18 * (RA[i] > 0.5 ? 1 : -1); x += -dy * sw; y += dx * sw }
                fin[i * 2] = x; fin[i * 2 + 1] = y
                CS[i] = FS[i] + (BS[i] - FS[i]) * e; CA[i] = FA[i] + (BA[i] - FA[i]) * e
            }
        }
        const ov = vt >= 1 ? 1 : ease(clamp((vt - 0.15) / 0.85, 0, 1))

        ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
        ctx.clearRect(0, 0, W, H)
        if (isHome && w[2] > 0.01) {
            ctx.lineWidth = 1; ctx.strokeStyle = `rgba(233,200,135,${0.5 * w[2] * ov})`; ctx.beginPath()
            for (let k = 0; k < SUBJ_LINKS.length; k += 2) {
                const i = SUBJ_LINKS[k], j = SUBJ_LINKS[k + 1], x1 = fin[i * 2], y1 = fin[i * 2 + 1], x2 = fin[j * 2], y2 = fin[j * 2 + 1]
                ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, Math.min(y1, y2) - Math.abs(x2 - x1) * 0.32, x2, y2)
            }
            ctx.stroke()
        }
        if (isSubj) drawChart(ov)

        const lens = (isHome || isSubj) && !overUI && !touch && mx > -1e3
        const LR = mobile ? 70 : 120
        ctx.globalCompositeOperation = 'lighter'
        for (let i = 0; i < N; i++) {
            let size = CS[i], al = CA[i]
            if (hlAmt > 0.001) { if (HL[i]) { size *= 1 + hlAmt * 1.1; al += (1 - al) * hlAmt } else al *= 1 - hlAmt * 0.88 }
            if (isHome && i === nowIdx && heroVis > 0) { size *= 1 + 1.4 * heroVis; al += (1 - al) * heroVis }
            if (HID[i]) al = 0
            alphaOf[i] = al
            if (al < 0.004) continue
            if (lens) { const dx = fin[i * 2] - mx, dy = fin[i * 2 + 1] - my, d2 = dx * dx + dy * dy; if (d2 < LR * LR) { const k = 1 - Math.sqrt(d2) / LR; size *= 1 + 1.5 * k * k; al += (1 - al) * k * 0.6 } }
            if (i === hovered) { size *= 1.8; al = 1 }
            const d = size * (mobile ? 5.6 : 9)
            ctx.globalAlpha = clamp(mobile ? al * 0.78 : al, 0, 1)
            ctx.drawImage(SPR[COL[i]], fin[i * 2] - d / 2, fin[i * 2 + 1] - d / 2, d, d)
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
        if (isHome) { drawHomeLabels(w, ov); drawLeader(heroVis * ov, now) }
        if (isSubj) drawChartLabels(ov)

        hovered = lens ? nearest(mx, my, mobile ? 28 : 26) : -1
        if (isHome && heroVis > 0.5) {
            if (hovered >= 0) { if (hovered !== nowIdx) setNow(hovered); nowHeld = true }
            else { if (nowHeld) { nowHeld = false; nowAt = now } if (!reduce && now - nowAt > 4800) nextNow() }
        }
        if (isSubj) {
            const hs = lens && hovered < 0 ? sectorAt(mx, my, false) : -1
            chart.hoverSect = hs
            if (hs !== lastHS) { lastHS = hs; sectHL = hs >= 0 ? BY_SUBJ[chart.s].filter(i => S[i][F.DOMAIN] === hs) : null; applyHL() }
        }
        const tx = hovered >= 0 ? fin[hovered * 2] : mx, ty = hovered >= 0 ? fin[hovered * 2 + 1] : my
        const k = reduce ? 1 : 1 - Math.exp(-dt * 18)
        if (ringA < 0.01) { ringX = tx; ringY = ty }
        ringX += (tx - ringX) * k; ringY += (ty - ringY) * k
        ringR += ((hovered >= 0 ? 11 : 20) - ringR) * k
        ringA += ((lens ? (hovered >= 0 ? 0.95 : 0.28) : 0) - ringA) * k
        if (ringA > 0.01) { ctx.strokeStyle = `rgba(233,200,135,${ringA})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(ringX, ringY, ringR, 0, Math.PI * 2); ctx.stroke() }
        if (hovered >= 0 && !(isHome && heroVis > 0.5)) showTip(hovered, fin[hovered * 2], fin[hovered * 2 + 1])
        else tipHide()
        setCursor(hovered >= 0 || (isSubj && chart.hoverSect >= 0))

        // a still sky needs no animation once the blend has finished
        const hlSettled = hlOn ? hlAmt > 0.999 : hlAmt < 0.001
        if (!isHome && !isSubj && vt >= 1 && hlSettled && ringA < 0.01) { running = false; return }
        raf = requestAnimationFrame(frame)
    }

    /* ---------- lifecycle ---------- */
    let rt = 0
    const onResize = () => { clearTimeout(rt); rt = setTimeout(layout, 120) }
    const onScroll = () => { if (view !== 'ambient') kick() }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    window.addEventListener('click', onClick)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, { passive: true })
    layout()
    for (let i = 0; i < N; i++) { fin[i * 2] = T.sky[i * 2]; fin[i * 2 + 1] = T.sky[i * 2 + 1] }

    return {
        setData,
        setHome,
        setSubject,
        release,
        setHighlight,
        setRestHighlight,
        setPaletteHighlight,
        setChartHighlight,
        measureTable,
        relayoutSubject: () => { if (view === 'subject') { layoutSubject(); measureTable() } },
        starPoint: i => (fin && i >= 0 && i < N ? [fin[i * 2], fin[i * 2 + 1]] : null),
        nowIndex: () => nowIdx,
        get view() { return view },
        destroy() {
            cancelAnimationFrame(raf); running = false
            window.removeEventListener('pointermove', onMove)
            document.removeEventListener('pointerleave', onLeave)
            window.removeEventListener('click', onClick)
            window.removeEventListener('resize', onResize)
            window.removeEventListener('scroll', onScroll)
            document.documentElement.style.cursor = ''
        }
    }
}
