export const GRADE_BAND_CODES = ['H1', 'H2', 'H3', 'H4G7', 'H4G8', 'H4G9'] as const
export const SKILL_CODES = ['TS1', 'TS2', 'TS3', 'TS4', 'TS5', 'TS6', 'TS7'] as const

export const SUBJECT_TAXONOMY = {
    arts: {
        code: 'AR',
        domains: { '审美感知': 'AA', '艺术表现': 'AE', '创意实践': 'CP', '文化理解': 'CU' }
    },
    chinese: {
        code: 'CN',
        domains: { '识字与写字': 'LI', '阅读与鉴赏': 'READ', '表达与交流': 'COMM', '梳理与探究': 'INQ' }
    },
    english: {
        code: 'EN',
        domains: { '语言能力': 'LANG', '文化意识': 'CUL', '思维品质': 'THINK', '学习能力': 'LEARN' }
    },
    it: {
        code: 'IT',
        domains: { '信息意识': 'IC', '信息社会责任': 'SR', '数字化学习与创新': 'DL', '计算思维': 'CS' }
    },
    labor: {
        code: 'LA',
        domains: { '日常生活劳动': 'DL', '生产劳动': 'PL', '服务性劳动': 'SL', '公益劳动与志愿服务': 'VL' }
    },
    math: {
        code: 'MA',
        domains: { '数与代数': 'ALG', '图形与几何': 'GEO', '统计与概率': 'STA', '综合与实践': 'PRJ' }
    },
    morality_law: {
        code: 'ML',
        domains: {
            '道德教育': 'MOR',
            '法治教育': 'LAW',
            '国情教育': 'NAT',
            '生命安全与健康教育': 'SAFE',
            '中华优秀传统文化与革命传统教育': 'CUL',
            '入学教育': 'ENR'
        }
    },
    pe: {
        code: 'PE',
        domains: { '运动技能': 'SK', '健康教育': 'HE', '体育品德': 'MO', '体能': 'FIT' }
    },
    science: {
        code: 'SC',
        domains: { '科学观念': 'SC', '科学思维': 'TH', '探究实践': 'PR', '态度责任': 'AR' }
    }
} as const

export type SubjectSlug = keyof typeof SUBJECT_TAXONOMY

export function isKnownSubjectSlug(value: string): value is SubjectSlug {
    return value in SUBJECT_TAXONOMY
}

export function isKnownGradeBand(value: string): boolean {
    return (GRADE_BAND_CODES as readonly string[]).includes(value)
}

export function isKnownSkillCode(value: string): boolean {
    return (SKILL_CODES as readonly string[]).includes(value.split('.')[0].toUpperCase())
}

export function hasKnownDomain(subjectSlug: string, domain: string): boolean {
    if (!isKnownSubjectSlug(subjectSlug)) return false
    return domain in SUBJECT_TAXONOMY[subjectSlug].domains
}

export function isKnownDomain(domain: string, subjectSlugs: string[] = Object.keys(SUBJECT_TAXONOMY)): boolean {
    return subjectSlugs.some(subjectSlug => hasKnownDomain(subjectSlug, domain))
}

export const CANONICAL_CODE_DESCRIPTION = '{SUBJECT}-{GRADE_BAND}-{PUBLIC_DOMAIN}[{-SUBTYPE}]-{SEQ}'
