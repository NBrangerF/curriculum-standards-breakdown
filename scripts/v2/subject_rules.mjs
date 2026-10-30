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
