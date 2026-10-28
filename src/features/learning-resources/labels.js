export const SUBJECT_LABELS = {
    morality_law: '道德与法治',
    chinese: '语文',
    math: '数学',
    english: '英语',
    science: '科学',
    it: '信息科技',
    pe: '体育与健康',
    arts: '艺术',
    labor: '劳动'
}

export const STAGE_LABELS = {
    'G1-2': '1–2 年级',
    'G3-4': '3–4 年级',
    'G5-6': '5–6 年级',
    'G7-9': '7–9 年级'
}

export const FORMAT_LABELS = {
    interactive: '互动仿真',
    video: '视频',
    lesson: '课程与活动',
    book: '读物',
    tool: '工具',
    dataset: '素材与数据',
    text: '文本'
}

export const ACCESS_LABELS = {
    direct: '国内可直接访问',
    unstable: '国内访问不稳定',
    blocked: '国内无法直接访问'
}

export const LICENSE_LABELS = {
    'CC0-1.0': 'CC0',
    PD: '公有领域',
    'CC-BY-4.0': 'CC BY 4.0',
    'CC-BY-3.0': 'CC BY 3.0',
    'CC-BY-2.0-FR': 'CC BY 2.0',
    'CC-BY-SA-4.0': 'CC BY-SA 4.0',
    'CC-BY-SA-2.5': 'CC BY-SA 2.5',
    MIT: 'MIT',
    'Apache-2.0': 'Apache 2.0',
    'MIXED-OPEN': '逐项开放许可',
    'CC-BY-NC-4.0': 'CC BY-NC 4.0',
    'CC-BY-NC-SA-4.0': 'CC BY-NC-SA 4.0'
}

export const OPEN_LEVEL_LABELS = {
    open: '开放许可，可改编、可商用',
    noncommercial: '仅限非商业使用'
}

export const LANGUAGE_LABELS = {
    zh: '中文',
    en: '英文'
}

const pick = (labels, value, fallback) => labels[value] || fallback || value

export const subjectLabel = value => pick(SUBJECT_LABELS, value)
export const stageLabel = value => pick(STAGE_LABELS, value)
export const formatLabel = value => pick(FORMAT_LABELS, value, '资源')
export const accessLabel = value => pick(ACCESS_LABELS, value, '未检测')
export const licenseLabel = value => pick(LICENSE_LABELS, value)
export const languageLabel = value => pick(LANGUAGE_LABELS, value)

/** True when the original title says more than the Chinese one, ignoring book-title marks. */
export const hasDistinctOriginal = resource => resource.title_original.replace(/[《》]/gu, '') !== resource.title_zh.replace(/[《》]/gu, '')
