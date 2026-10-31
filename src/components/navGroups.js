// The site's four groups. Teachers start from 教材 and 备课, 师范生 from 教资; 课标 sits beside both.
// A group owns the routes listed in `owns` (prefixes); its pages show the group's items as a second row.
export const NAV_GROUPS = [
    {
        key: 'textbooks',
        label: '教材',
        to: '/textbooks',
        owns: ['/textbooks', '/textbook-alignment', '/textbook-units', '/textbook-resources', '/learning-resources'],
        items: [
            { to: '/textbooks', label: '选教材', exact: true },
            { to: '/textbook-alignment', label: '教材与课标对应' },
            { to: '/learning-resources', label: '学习资源' }
        ]
    },
    {
        key: 'prep',
        label: '备课',
        to: '/lesson-plan',
        owns: ['/lesson-plan', '/schedule', '/review', '/experiments', '/interdisciplinary', '/guide', '/alignment-workbench'],
        items: [
            { to: '/lesson-plan', label: 'AI 备课' },
            { to: '/schedule', label: '学期进度表' },
            { to: '/review', label: '中考复习地图' },
            { to: '/experiments', label: '必做实验' },
            { to: '/interdisciplinary', label: '跨学科主题' },
            { to: '/guide', label: '上手指南' }
        ]
    },
    {
        key: 'standards',
        label: '课标',
        to: '/standards',
        owns: ['/standards', '/subjects', '/smart-search', '/search', '/concepts', '/skills', '/glossary'],
        items: [
            { to: '/standards', label: '学科总览', exact: true },
            { to: '/smart-search', label: 'AI 检索' },
            { to: '/concepts', label: '概念词典' },
            { to: '/skills', label: '可迁移技能' }
        ]
    },
    {
        key: 'exam',
        label: '教资',
        to: '/teacher-exam',
        owns: ['/teacher-exam'],
        items: [
            { to: '/teacher-exam', label: '课标速记' },
            { to: '/concepts#concept-path', label: '先读这六页' },
            { to: '/lesson-plan?for=trial', label: '试讲稿' },
            { to: '/concepts', label: '概念词典' }
        ]
    }
]

/** Links that serve neither persona first; they live in the footer and at the foot of the mobile menu. */
export const MINOR_LINKS = [
    { to: '/collections', label: '我的清单' },
    { to: '/api', label: 'API' },
    { to: '/feedback', label: '反馈' }
]

const owns = (prefix, pathname) => pathname === prefix || pathname.startsWith(`${prefix}/`)

export function groupOf(pathname) {
    return NAV_GROUPS.find(group => group.owns.some(prefix => owns(prefix, pathname))) || null
}

/** Whether a group item is the page being shown (items with a hash or query only mark their own path when exact). */
export function isItemActive(item, pathname) {
    const path = item.to.split(/[?#]/u)[0]
    if (item.to.includes('#') || item.to.includes('?')) return false
    return item.exact ? pathname === path : owns(path, pathname)
}
