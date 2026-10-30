// Per-subject rules for the shared builder in build_units.mjs (docs/STANDARDS_METHOD_V2.md §2).
const last = e => (e.topic || [])[e.topic.length - 1]

const IT_AREAS = {
    信息交流与分享: 'IS', 信息隐私与安全: 'PS', 在线学习与生活: 'OL', 数据与编码: 'DC', 身边的算法: 'AL', 过程与控制: 'PC',
    互联网应用与创新: 'IN', 物联网实践与探索: 'IO', 人工智能与智慧社会: 'AI', 跨学科主题: 'XT'
}

export const RULES = {
    // 信息科技：学段 × 内容模块。标准句取模块说明里「通过本模块的学习，学生能……」；要点是内容要求的编号条目；
    // 学业要求原文附在标准下。跨学科主题每学段一条标准，每个主题一条要点。
    it: {
        areas: IT_AREAS,
        split: 'items',
        statement: { from: 'intro', start: /^通过本模块的学习/u, section: '模块说明' },
        activityNote: /^本主题综合运用/u,
        unitOf: e => {
            if (e.part !== '课程内容') return null
            const t = e.topic || []
            if (t[0] === '跨学科主题') return t[1] ? { area: '跨学科主题', unit: '跨学科主题', role: 'activity', group: t[1] } : null
            if (!IT_AREAS[t[0]]) return null
            const role = { 内容要求: 'item', 学业要求: 'req' }[e.section] || (!e.section ? 'intro' : null)
            return role ? { area: t[0], unit: t[0], role } : null
        }
    }
}

const ML_AREAS = { 入学教育: 'EN', 道德教育: 'MO', 生命安全与健康教育: 'LH', 法治教育: 'LA', 中华优秀传统文化与革命传统教育: 'CR', 中华优秀传统文化教育: 'CT', 革命传统教育: 'RT', 国情教育: 'NC' }
// 道德与法治：学段 × 学习主题。要点是内容要求表里的「•」条目。学业要求是整个学段的，不分主题，放进学段概览；
// 标准句由 kebiao 概括（docs/data/v2/summaries/morality_law.tsv）。
RULES.morality_law = {
    areas: ML_AREAS,
    split: 'items',
    stageRequirement: e => e.part === '课程内容' && e.section === '学业要求' && !(e.topic || []).length,
    dropStageRequirement: /^根据“五四”学制/u,
    unitOf: e => {
        if (e.part !== '课程内容' || e.section !== '内容要求') return null
        const t = last(e)
        return ML_AREAS[t] ? { area: t, unit: t, role: 'item' } : null
    }
}

const AR_AREAS = { 音乐: 'MU', 美术: 'VA', 舞蹈: 'DA', '戏剧（含戏曲）': 'DR', '影视（含数字媒体艺术）': 'FM' }
// 8–9 年级选项学科在 7 年级开设的学习任务（catalogue 把它们记在 8–9 学段、没有任务名）。
const AR_GRADE7 = { 舞蹈: '多舞种体验与舞段编创', '戏剧（含戏曲）': '戏剧游戏', '影视（含数字媒体艺术）': '初试影视技术' }
// 艺术：学段（1–2、3–5、6–7、8–9）× 艺术学科 × 学习任务。要点是学业要求的「•」条目，6–7 学段按原文的「6年级」「7年级」
// 标年级；内容要求原文附在标准下；标准句由 kebiao 概括。
RULES.arts = {
    areas: AR_AREAS,
    split: 'items',
    itemSection: '学业要求',
    stopAt: /^教学提示|教学策略建议/u,
    gradeMarker: /^([6-9])\s*年级$/u,
    topicIntro: true,
    // 美术、舞蹈、戏剧、影视的学习任务说明（「本学习任务主要引导学生……」）是官方的概括句；音乐的说明讲任务是什么，
    // 7 年级任务的说明讲开设目的，这两类由 kebiao 概括。
    statement: u => (u.area === '音乐' || u.grades ? null : { from: 'topicIntro', section: '学习任务说明', pick: /学生|通过|引导/u }),
    title: u => `${u.area} · ${u.unit}（${u.stage.replace('-', '–')} 年级）`,
    unitOf: e => {
        if (e.part !== '课程内容') return null
        const t = e.topic || []
        if (!AR_AREAS[t[0]]) return null
        const role = { 学业要求: 'item', 内容要求: 'req' }[e.section] || 'other'
        if (!t[1]) return AR_GRADE7[t[0]] && e.stage === '8-9' ? { area: t[0], unit: AR_GRADE7[t[0]], role, stage: '6-7', grades: [7] } : null
        return { area: t[0], unit: t[1].replace(/^学习任务\s*\d+\s*[：:]/u, '').trim(), role }
    }
}

const e0text = (e, lines) => (lines.find(x => x.id === e.id) || e).text

// Walk a subject's 课程内容 in source order and file each line by the outline numbering instead of the catalogue's
// section labels (the scan carries one section's label onto the next heading):
//   unitRe  (e.g. 1.2)   opens a unit; its name is the heading line, or from docs/data/v2/units/<slug>-names.tsv
//                        (theme \t marker \t name) when the name is glued to the first sentence
//   itemRe  (e.g. 1.2.3) opens a 要点; unmarked lines continue it; exampleRe lines ("例1 ……") are official examples
//   otherRe (e.g. （1）)  opens text that is not a 要点 (活动建议); unmarked lines continue it
//   reqSection lines are the theme's 学业要求 (shown in the stage overview)
function outline(lines, { readTsv, strip }, { slug, sections, themeOf = e => (e.topic || [])[0], unitRe, itemRe, otherRe, otherText, exampleRe = /^例\s*\d+|^例(?!如)/u, itemPerMarker = true, gluedAs = 'item', headingName = 'short' }) {
    const names = new Map(readTsv(`docs/data/v2/units/${slug}-names.tsv`).map(([theme, marker, name]) => [`${theme}|${marker}`, name]))
    const out = new Map()
    let unit = null, mode = 'item', item = null, itemPara = null
    for (let e of lines) {
        if (e.part !== '课程内容' || !sections.includes(e.section)) continue
        const area = themeOf(e)
        if (!area) continue
        if (unit && unit.area !== area) { unit = null; item = null }
        let marker = e.marker || ''
        // OCR split "6.1.2" into marker "6." and text "1.2 ……".
        if (/^\d\.$/u.test(marker) && /^\d\.\d\s/u.test(e.text)) { marker = marker + e.text.match(/^\d\.\d/u)[0]; e = { ...e, text: e.text.replace(/^\d\.\d\s*/u, '') }; out.set(e.id, null) }
        if (otherText && otherText.test(e.text)) { if (unit) out.set(e.id, { ...unit, role: 'other' }); continue }
        if (unitRe.test(marker)) {
            const name = names.get(`${area}|${marker}`) || (headingName === 'line' || !/[。；，]/u.test(e.text) ? e.text.trim() : null)
            if (!name) { unit = null; continue }
            unit = { area, unit: name }
            mode = 'item'; item = null
            const rest = e.text.startsWith(name) ? e.text.slice(name.length).replace(/^[：:]/u, '').trim() : (strip(e.text) === strip(name) ? '' : e.text)
            // A heading that runs onto the next line ("……是每个人" + "应有的责任") continues until the first numbered item.
            if (!rest) { out.set(e.id, { ...unit, role: 'heading' }); if (itemRe) mode = 'heading' }
            else if (gluedAs === 'heading') { out.set(e.id, { ...unit, role: 'heading', text: rest }); mode = 'heading' }
            else { out.set(e.id, { ...unit, role: 'item', text: rest }); item = e.id }
            continue
        }
        if (!unit) continue
        if (itemRe && itemRe.test(marker)) { mode = 'item'; item = e.id; itemPara = e.para; const name = names.get(`${area}|${marker}`); out.set(e.id, { ...unit, role: 'item', ...(itemPerMarker ? { para: itemPara } : {}), ...(name && e.text.startsWith(name) ? { text: e.text.slice(name.length).trim() } : e.text !== e0text(e, lines) ? { text: e.text } : {}) }); continue }
        if (mode === 'heading') { out.set(e.id, { ...unit, role: 'heading' }); continue }
        if (otherRe && otherRe.test(marker)) { mode = 'other'; out.set(e.id, { ...unit, role: 'other' }); continue }
        if (mode === 'other') { out.set(e.id, { ...unit, role: 'other' }); continue }
        // An example runs until the next marker.
        if (exampleRe && exampleRe.test(e.text) && item) { mode = 'example'; out.set(e.id, { ...unit, role: 'example', attachTo: item, text: e.text.replace(exampleRe, '').trim() }); continue }
        if (mode === 'example') { out.set(e.id, { ...unit, role: 'example', attachTo: item }); continue }
        if (!item) { item = e.id; itemPara = e.para }
        out.set(e.id, { ...unit, role: 'item', ...(itemPerMarker && itemRe ? { para: itemPara } : {}) })
    }
    return out
}

const PH_AREAS = { 物质: 'MA', 运动和相互作用: 'MI', 能量: 'EN', 实验探究: 'EX', 跨学科实践: 'XP' }
// 物理：二级主题（1.1 物质的形态和变化……）。要点是内容要求的编号条目（1.1.1……），「例1」是课标示例；活动建议（（1）（2））
// 不作要点；学业要求按一级主题写，放学段概览；标准句由 kebiao 概括。
RULES.physics = {
    areas: PH_AREAS,
    split: 'items',
    stageRequirement: e => e.part === '课程内容' && e.section === '学业要求',
    prepare: (lines, h) => outline(lines, h, { slug: 'physics', sections: ['内容要求', '活动建议'], unitRe: /^\d\.\d$/u, itemRe: /^\d\.\d\.\d$/u, otherRe: /^（\d+）$/u })
}

const CH_AREAS = { 科学探究与化学实验: 'SI', 物质的性质与应用: 'PR', 物质的组成与结构: 'CO', 物质的化学变化: 'RE', '化学与社会•跨学科实践': 'SO' }
// 化学：单元取最深一级编号主题（2.2.1 空气、氧气、二氧化碳……；没有三级的取二级）。要点是内容要求的分句和
// （1）（2）条目；学业要求按一级主题写，放学段概览；标准句由 kebiao 概括；年级都是九年级。
RULES.chemistry = {
    areas: CH_AREAS,
    split: 'clauses',
    stageRequirement: e => e.part === '课程内容' && e.section === '学业要求',
    title: u => (u.unit === '学生必做实验及实践活动' ? `${u.unit}（${u.area}）` : `${u.unit}（${u.stage.replace('-', '–')} 年级）`),
    dropIndicator: /^注：|应达到如下基本要求。$/u,
    prepare: (lines, h) => outline(lines, h, { slug: 'chemistry', sections: ['内容要求'], unitRe: /^\d\.\d(\.\d)?$/u })
}

const BI_AREAS = { 生物体的结构层次: 'ST', 生物的多样性: 'DI', 生物与环境: 'EN', 植物的生活: 'PL', 人体生理与健康: 'HU', 遗传与进化: 'GE', '生物学与社会•跨学科实践': 'XP' }
// 生物学：单元是重要概念（1.1 细胞是生物体结构和功能的基本单位……），标准句就是这句概念原文；要点是次位概念
// （1.1.1……）；跨学科实践（9.1……）的要点是（1）（2）活动。大概念（「概念1 ……」）和学业要求放学段概览。
RULES.biology = {
    areas: BI_AREAS,
    split: 'items',
    statement: { from: 'heading', section: '内容要求（重要概念）', cut: /在这类跨学科实践活动中.*$/u },
    stageRequirement: e => e.part === '课程内容' && e.section === '学业要求',
    title: u => `${u.unit}（${u.stage.replace('-', '–')} 年级）`,
    prepare: (lines, h) => outline(lines, h, { slug: 'biology', sections: ['内容要求'], unitRe: /^\d\.\d$/u, itemRe: /^\d\.\d\.\d$|^（\d+）$/u, otherText: /^概念\s*\d/u, gluedAs: 'heading', headingName: 'line', exampleRe: null })
}

const HI_AREAS = { 中国古代史: 'AC', 中国近代史: 'MC', 中国现代史: 'CC', 世界古代史: 'AW', 世界近代史: 'MW', 世界现代史: 'CW' }
// 历史：单元是时期（1.3 秦汉时期……）；要点是每个「通过了解……知道……」分句；学业要求按板块写，放学段概览；
// 标准句由 kebiao 概括；年级按统编教材的板块。跨学科主题学习是教师用的活动设计示例，放学段概览，不作标准。
RULES.history = {
    areas: HI_AREAS,
    split: 'clauses',
    stageRequirement: e => e.part === '课程内容' && e.section === '学业要求' && Boolean(HI_AREAS[(e.topic || [])[0]]),
    prepare: (lines, h) => outline(lines, h, { slug: 'history', sections: ['内容要求'], themeOf: e => (HI_AREAS[(e.topic || [])[0]] ? e.topic[0] : null), unitRe: /^\d\.\d$/u })
}

const GE_AREAS = { 认识全球: 'GL', 认识区域: 'RE', 地理工具与地理实践: 'TP' }
// 地理：单元是二级主题（地球在宇宙中、认识国家……）；有「（1）陆地和海洋」这类小标题的，按小标题再分。要点是「•」条目；
// 「说明：」之后是选学说明，不作要点；学业要求放学段概览；标准句由 kebiao 概括。跨学科主题学习是原则和案例，放学段概览。
RULES.geography = {
    areas: GE_AREAS,
    split: 'items',
    stageRequirement: e => e.part === '课程内容' && e.section === '学业要求' && Boolean(GE_AREAS[(e.topic || [])[0]]),
    prepare: lines => {
        const out = new Map()
        let key = null, sub = null, mode = 'item'
        for (const e of lines) {
            const t = e.topic || []
            if (e.part !== '课程内容' || e.section !== '内容要求' || !GE_AREAS[t[0]] || !t[1]) continue
            const k = t.join('>')
            if (k !== key) { key = k; sub = null; mode = 'item' }
            const unit = { area: t[0], theme: t[1] }
            if (/^（\d+）$/u.test(e.marker || '') && !/[。；，]/u.test(e.text) && e.text.length <= 12 && mode === 'item') { sub = e.text.trim(); out.set(e.id, { ...unit, unit: sub, role: 'heading' }); continue }
            if (/^说明[：:]?$/u.test(e.text.trim())) mode = 'other'
            // Circled numbers mark page notes ("① 青藏高原被称为“第三极”。").
            out.set(e.id, { ...unit, unit: sub || t[1], role: /^[①-⑳]$/u.test(e.marker || '') ? 'other' : mode })
        }
        return out
    }
}
