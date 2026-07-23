export const SOURCE_LABELS = {
    oak: 'Oak 国家课程资源',
    bookdash: 'Book Dash 儿童读物',
    'african-storybook': '非洲故事书',
    siyavula: 'Siyavula 开放教材',
    'cs-unplugged': '不插电计算机科学',
    'mdn-zh-cn': 'MDN 中文技术文档',
    'raspberry-pi-learning': '树莓派学习资源'
}

export const ROLE_LABELS = {
    explain: '概念讲解',
    model: '示范案例',
    explore: '探究活动',
    practice: '练习活动',
    assess: '学习评价',
    assessment: '学习评价',
    remediate: '补救学习',
    extend: '拓展学习',
    teacher_support: '教师支持',
    read_aloud: '朗读材料',
    reference: '参考资料',
    project: '项目学习',
    contextualize: '情境材料'
}

export const TYPE_LABELS = {
    article: '文章',
    activity: '学习活动',
    book: '读物',
    assessment: '评价任务',
    dataset: '数据材料',
    explanation: '概念讲解',
    glossary_entry: '术语条目',
    lesson: '课时资源',
    lesson_plan: '教学方案',
    practice_set: '练习集',
    primary_source: '一手材料',
    reference: '参考资料',
    story: '故事',
    teacher_guide: '教师用书',
    tutorial: '教程',
    worked_example: '例题解析',
    worksheet: '学习单'
}

export function sourceLabel(value) {
    return SOURCE_LABELS[value] || '开放学习资源'
}

export function roleLabel(value) {
    return ROLE_LABELS[value] || '学习支持'
}

export function typeLabel(value) {
    return TYPE_LABELS[value] || '学习资源'
}
