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
