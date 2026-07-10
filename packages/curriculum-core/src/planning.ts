import { GRADE_BANDS } from './constants.js'
import { projectStandard } from './fieldsets.js'
import { ensureArray, normalizeStandard } from './normalize.js'
import { sortStandards } from './search.js'
import type {
    Fieldset,
    JsonObject,
    Manifest,
    ParsedPlan,
    ParsedPlanInput,
    PlanMatchingResult,
    PlanStandardMatch,
    PlanUnit,
    PlanUnitMatches,
    PlanValidationResult,
    StandardRecord,
    CoverageAnalysis,
    WeeklySchedule
} from './types.js'

const SUBJECT_ALIASES: Record<string, string[]> = {
    arts: ['艺术', '美术', '音乐', 'art', 'arts'],
    chinese: ['语文', '中文', 'chinese'],
    english: ['英语', 'english'],
    it: ['信息科技', '信息技术', '计算机', 'it'],
    labor: ['劳动', '劳动教育', 'labor'],
    math: ['数学', 'math', 'mathematics'],
    morality_law: ['道德与法治', '道法', 'morality', 'law'],
    pe: ['体育', '体育与健康', 'pe'],
    science: ['科学', 'science']
}

const STOP_WORDS = new Set([
    '学生',
    '学习',
    '课程',
    '单元',
    '活动',
    '能够',
    '通过',
    '进行',
    '了解',
    '认识',
    '理解',
    '掌握',
    '相关',
    '知识',
    '能力',
    '目标',
    '年级',
    '教学',
    '以及'
])

const TS_KEYWORDS: Record<string, string[]> = {
    TS1: ['观察', '实验', '探究', '调查', '问题', '证据'],
    TS2: ['推理', '模型', '解释', '分析', '判断', '思维'],
    TS3: ['创意', '创造', '设计', '表达', '作品'],
    TS4: ['合作', '小组', '协作', '共同', '交流'],
    TS5: ['数据', '图表', '统计', '测量', '信息'],
    TS6: ['反思', '评价', '改进', '复盘'],
    TS7: ['综合', '跨学科', '项目', '真实情境']
}

function compact(value: unknown): string {
    return String(value || '').trim()
}

function firstNumber(value: string): number | undefined {
    const match = value.match(/\d+/)
    if (match) return Number(match[0])
    const chineseDigits: Record<string, number> = {
        一: 1,
        二: 2,
        三: 3,
        四: 4,
        五: 5,
        六: 6,
        七: 7,
        八: 8,
        九: 9
    }
    for (const [digit, number] of Object.entries(chineseDigits)) {
        if (value.includes(digit)) return number
    }
    return undefined
}

export function deriveGradeBand(grade?: string | number | null): string | undefined {
    if (grade === null || grade === undefined || grade === '') return undefined
    const value = String(grade)
    const upper = value.toUpperCase()
    if (upper in GRADE_BANDS) return upper
    const gradeNumber = firstNumber(value)
    if (!gradeNumber) return undefined
    if (gradeNumber <= 2) return 'H1'
    if (gradeNumber <= 4) return 'H2'
    if (gradeNumber <= 6) return 'H3'
    if (gradeNumber === 7) return 'H4G7'
    if (gradeNumber === 8) return 'H4G8'
    if (gradeNumber === 9) return 'H4G9'
    return undefined
}

function detectSubjectSlug(text: string): string | undefined {
    const lower = text.toLowerCase()
    for (const [slug, aliases] of Object.entries(SUBJECT_ALIASES)) {
        if (aliases.some(alias => lower.includes(alias.toLowerCase()))) return slug
    }
    return undefined
}

function splitTerms(text: string): string[] {
    return text
        .split(/[\s,，.。;；:：、/|()[\]{}"'“”‘’<>《》!?！？\n\r\t-]+/u)
        .map(item => item.trim())
        .filter(item => item.length >= 2 && !STOP_WORDS.has(item))
}

export function extractPlanKeywords(text: string, limit = 80): string[] {
    const keywords = new Set<string>()
    for (const term of splitTerms(text)) {
        keywords.add(term.toLowerCase())
        const cjkOnly = term.replace(/[^\u4e00-\u9fff]/g, '')
        if (cjkOnly.length >= 4) {
            for (let i = 0; i < cjkOnly.length - 1; i += 1) {
                keywords.add(cjkOnly.slice(i, i + 2))
            }
        }
    }
    return [...keywords].filter(item => !STOP_WORDS.has(item)).slice(0, limit)
}

function normalizeUnit(raw: Partial<PlanUnit>, index: number): PlanUnit {
    const title = compact(raw.title) || `单元 ${index + 1}`
    const learningGoals = ensureArray<string>(raw.learning_goals).map(compact).filter(Boolean)
    const keywords = [
        ...ensureArray<string>(raw.keywords).map(compact),
        ...extractPlanKeywords([title, ...learningGoals].join(' '))
    ].filter(Boolean)

    return {
        ...raw,
        unit_id: compact(raw.unit_id) || `U${index + 1}`,
        title,
        learning_goals: learningGoals,
        keywords: [...new Set(keywords)]
    }
}

export function normalizeParsedPlan(raw: ParsedPlanInput): ParsedPlan {
    const title = compact(raw.title) || '未命名课程计划'
    const grade = compact(raw.grade)
    const gradeBand = compact(raw.grade_band) || deriveGradeBand(grade)
    const units = ensureArray<Partial<PlanUnit>>(raw.units).length
        ? ensureArray<Partial<PlanUnit>>(raw.units).map(normalizeUnit)
        : [normalizeUnit({
            title,
            learning_goals: extractPlanKeywords(title).slice(0, 6)
        }, 0)]

    return {
        ...raw,
        title,
        subject_slug: compact(raw.subject_slug) || undefined,
        grade: grade || undefined,
        grade_band: gradeBand,
        duration_weeks: typeof raw.duration_weeks === 'number' ? raw.duration_weeks : undefined,
        lessons_per_week: typeof raw.lessons_per_week === 'number' ? raw.lessons_per_week : undefined,
        units
    }
}

function parsePlanText(text: string): ParsedPlan {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    const title = lines.find(line => !line.includes('：') && !line.includes(':')) || lines[0] || '未命名课程计划'
    const units: Partial<PlanUnit>[] = []
    let subjectSlug = detectSubjectSlug(text)
    let grade: string | undefined
    let durationWeeks: number | undefined
    let lessonsPerWeek: number | undefined

    for (const line of lines) {
        const subjectMatch = line.match(/学科\s*[:：]\s*(.+)$/)
        if (subjectMatch) subjectSlug = detectSubjectSlug(subjectMatch[1]) || compact(subjectMatch[1])

        const gradeMatch = line.match(/年级|学段/)
        if (gradeMatch && line.includes('：')) grade = compact(line.split('：').pop())
        if (gradeMatch && line.includes(':')) grade = compact(line.split(':').pop())

        const weekMatch = line.match(/(?:周数|周期|教学周|weeks?)\s*[:：]?\s*(\d+)/i)
        if (weekMatch) durationWeeks = Number(weekMatch[1])

        const lessonsMatch = line.match(/每周\s*(\d+)\s*(?:课时|节|lessons?)/i)
        if (lessonsMatch) lessonsPerWeek = Number(lessonsMatch[1])

        const unitMatch = line.match(/^(?:单元|Unit)\s*([0-9一二三四五六七八九十]*)\s*[.、:：-]?\s*(.+)$/i)
        if (unitMatch) {
            units.push({
                unit_id: unitMatch[1] ? `U${units.length + 1}` : undefined,
                title: compact(unitMatch[2])
            })
            continue
        }

        const goalMatch = line.match(/(?:目标|学习目标)\s*[:：]\s*(.+)$/)
        if (goalMatch && units.length) {
            const latest = units[units.length - 1]
            latest.learning_goals = [
                ...ensureArray<string>(latest.learning_goals),
                ...splitTerms(goalMatch[1])
            ]
        }
    }

    return normalizeParsedPlan({
        title,
        subject_slug: subjectSlug,
        grade,
        grade_band: deriveGradeBand(grade),
        duration_weeks: durationWeeks,
        lessons_per_week: lessonsPerWeek,
        units
    })
}

export function parsePlanInput(input: { text?: string; plan?: ParsedPlanInput }): {
    plan: ParsedPlan
    source: 'structured' | 'text'
    warnings: string[]
} {
    if (input.plan) {
        return {
            plan: normalizeParsedPlan(input.plan),
            source: 'structured',
            warnings: []
        }
    }

    const text = compact(input.text)
    const plan = parsePlanText(text)
    const warnings = ['纯文本解析采用确定性保守策略；正式使用匹配结果前，请先复核结构化教学计划。']
    if (!plan.subject_slug) warnings.push('无法从文本中可靠识别学科。')
    if (!plan.grade_band) warnings.push('无法从文本中可靠识别学段。')
    return { plan, source: 'text', warnings }
}

export function validateParsedPlan(plan: ParsedPlan, manifest: Manifest): PlanValidationResult {
    const normalized = normalizeParsedPlan(plan)
    const errors: string[] = []
    const warnings: string[] = []
    const subjects = new Set(manifest.subjects.map(subject => subject.subject_slug))
    const gradeBands = new Set(Object.keys(manifest.target_policy || GRADE_BANDS))

    if (!normalized.subject_slug) warnings.push('缺少 subject_slug；标准匹配将跨全部学科搜索。')
    else if (!subjects.has(normalized.subject_slug)) errors.push(`未知的 subject_slug：${normalized.subject_slug}`)

    if (!normalized.grade_band) warnings.push('缺少 grade_band；标准匹配将不按学段筛选。')
    else if (!gradeBands.has(normalized.grade_band)) errors.push(`未知的 grade_band：${normalized.grade_band}`)

    if (!normalized.units.length) errors.push('至少需要一个教学单元。')
    for (const unit of normalized.units) {
        if (!unit.title) errors.push(`教学单元 ${unit.unit_id} 缺少 title。`)
        if (!unit.learning_goals.length && !unit.keywords.length) {
            warnings.push(`教学单元 ${unit.unit_id} 没有 learning_goals 或 keywords；匹配置信度可能较低。`)
        }
    }

    if (normalized.duration_weeks !== undefined && normalized.duration_weeks < 1) {
        errors.push('duration_weeks 必须大于 0。')
    }
    if (normalized.lessons_per_week !== undefined && normalized.lessons_per_week < 1) {
        errors.push('lessons_per_week 必须大于 0。')
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        normalized_plan: normalized
    }
}

function scoreField(field: string, value: unknown, keywords: string[], weight: number): {
    score: number
    matched?: { field: string; matched_keywords: string[]; value: unknown }
} {
    const text = compact(value).toLowerCase()
    if (!text) return { score: 0 }
    const matched = keywords.filter(keyword => keyword.length >= 2 && text.includes(keyword.toLowerCase()))
    if (!matched.length) return { score: 0 }
    const unique = [...new Set(matched)].slice(0, 8)
    return {
        score: Math.min(weight, unique.length * 0.05),
        matched: {
            field,
            matched_keywords: unique,
            value
        }
    }
}

function inferSkillsFromKeywords(keywords: string[]): string[] {
    const skills: string[] = []
    for (const [skill, terms] of Object.entries(TS_KEYWORDS)) {
        if (terms.some(term => keywords.some(keyword => keyword.includes(term) || term.includes(keyword)))) {
            skills.push(skill)
        }
    }
    return skills
}

function mainSkill(value: string): string {
    return value.split('.')[0].toUpperCase()
}

function scoreStandardForUnit(
    plan: ParsedPlan,
    unit: PlanUnit,
    record: StandardRecord,
    include?: Fieldset[],
    reviewThreshold = 0.8
): PlanStandardMatch {
    const standard = normalizeStandard(record)
    const keywords = [
        ...unit.keywords,
        ...extractPlanKeywords([unit.title, ...unit.learning_goals].join(' '))
    ].map(keyword => keyword.toLowerCase())
    const matchedFields: PlanStandardMatch['matched_fields'] = []
    let score = 0

    if (plan.subject_slug && standard.subject_slug === plan.subject_slug) score += 0.15
    if (plan.grade_band && standard.grade_band === plan.grade_band) score += 0.15

    for (const [field, weight] of [
        ['domain', 0.15],
        ['subdomain', 0.15],
        ['display_subcategory', 0.1],
        ['standard_title', 0.2],
        ['standard', 0.25],
        ['context', 0.1],
        ['practice', 0.1],
        ['teaching_tip', 0.08],
        ['assessment_evidence_type', 0.06]
    ] as const) {
        const fieldScore = scoreField(field, standard[field], keywords, weight)
        score += fieldScore.score
        if (fieldScore.matched) matchedFields.push(fieldScore.matched)
    }

    const inferredSkills = inferSkillsFromKeywords(keywords)
    const recordSkills = [
        ...ensureArray<string>(standard.ts_primary),
        ...ensureArray<string>(standard.ts_secondary)
    ].map(mainSkill)
    const skillMatches = inferredSkills.filter(skill => recordSkills.includes(skill))
    if (skillMatches.length) {
        score += Math.min(0.12, skillMatches.length * 0.06)
        matchedFields.push({
            field: 'transferable_skills',
            matched_keywords: skillMatches,
            value: recordSkills
        })
    }

    const normalizedScore = Math.min(1, Number(score.toFixed(3)))
    const topFields = matchedFields.map(field => field.field).slice(0, 4)
    const rationale = matchedFields.length
        ? `教学单元关键词与以下标准字段存在重合：${topFields.join('、')}。`
        : '该结果仅由学科和学段候选范围筛出，未发现较强的文本重合。'

    return {
        code: standard.code,
        score: normalizedScore,
        match_type: 'deterministic_field_overlap',
        matched_fields: matchedFields,
        rationale,
        requires_human_review: normalizedScore < reviewThreshold,
        standard: projectStandard(standard, include || ['public'])
    }
}

export function matchPlanToStandards(
    plan: ParsedPlan,
    standards: StandardRecord[],
    options: { top_k_per_unit?: number; min_score?: number; review_threshold?: number; include?: Fieldset[] } = {}
): PlanMatchingResult {
    const normalizedPlan = normalizeParsedPlan(plan)
    const minScore = options.min_score ?? 0.2
    const topK = Math.min(Math.max(options.top_k_per_unit || 5, 1), 20)
    const reviewThreshold = options.review_threshold ?? 0.8
    const warnings: string[] = []
    const candidateStandards = sortStandards(standards).filter(record => {
        if (normalizedPlan.subject_slug && record.subject_slug !== normalizedPlan.subject_slug) return false
        if (normalizedPlan.grade_band && record.grade_band !== normalizedPlan.grade_band) return false
        return true
    })

    if (!candidateStandards.length) {
        warnings.push('没有课程标准符合教学计划的学科和学段筛选；请放宽计划元数据，或检查 subject_slug 与 grade_band。')
    }

    const units: PlanUnitMatches[] = normalizedPlan.units.map(unit => {
        const matches = candidateStandards
            .map(record => scoreStandardForUnit(normalizedPlan, unit, record, options.include, reviewThreshold))
            .filter(match => match.score >= minScore)
            .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
            .slice(0, topK)
        const unitWarnings: string[] = []
        if (!matches.length) unitWarnings.push('没有课程标准达到该教学单元的最低确定性匹配分数。')
        if (matches.some(match => match.requires_human_review)) {
            unitWarnings.push('一条或多条匹配结果低于复核阈值，需要人工确认。')
        }
        return {
            unit_id: unit.unit_id,
            unit_title: unit.title,
            matches,
            warnings: unitWarnings
        }
    })

    return {
        plan: normalizedPlan,
        units,
        warnings
    }
}

export function analyzeCoverage(plan: ParsedPlan, matching: PlanMatchingResult): CoverageAnalysis {
    const codeCounts = new Map<string, number>()
    const standardsByDomain: Record<string, number> = {}
    const standardsBySkill: Record<string, number> = {}
    const unmatchedUnits: string[] = []

    for (const unit of matching.units) {
        if (!unit.matches.length) unmatchedUnits.push(unit.unit_id)
        for (const match of unit.matches) {
            codeCounts.set(match.code, (codeCounts.get(match.code) || 0) + 1)
            const standard = match.standard as JsonObject
            const domain = compact(standard.domain) || 'unknown'
            standardsByDomain[domain] = (standardsByDomain[domain] || 0) + 1
            for (const skill of [
                ...ensureArray<string>(standard.ts_primary),
                ...ensureArray<string>(standard.ts_secondary)
            ].map(mainSkill)) {
                standardsBySkill[skill] = (standardsBySkill[skill] || 0) + 1
            }
        }
    }

    const duplicateStandards = [...codeCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([code]) => code)

    return {
        covered_standard_codes: [...codeCounts.keys()].sort(),
        unmatched_units: unmatchedUnits,
        duplicate_standards: duplicateStandards,
        standards_by_domain: standardsByDomain,
        standards_by_skill: standardsBySkill,
        units: matching.units.map(unit => ({
            unit_id: unit.unit_id,
            unit_title: unit.unit_title,
            matched_standard_codes: unit.matches.map(match => match.code),
            low_confidence_match_count: unit.matches.filter(match => match.requires_human_review).length
        })),
        warnings: [
            ...matching.warnings,
            ...(duplicateStandards.length ? ['部分课程标准被多个教学单元重复匹配；请确认这是有意的螺旋式覆盖，还是需要去重。'] : []),
            ...(unmatchedUnits.length ? ['部分教学单元没有达到确定性匹配阈值的课程标准。'] : [])
        ]
    }
}

export function generateWeeklySchedule(
    plan: ParsedPlan,
    matching: PlanMatchingResult,
    options: {
        teaching_weeks?: number
        lessons_per_week?: number
        review_weeks?: number[]
        exam_weeks?: number[]
    } = {}
): WeeklySchedule[] {
    const normalizedPlan = normalizeParsedPlan(plan)
    const teachingWeeks = Math.max(
        1,
        options.teaching_weeks || normalizedPlan.duration_weeks || normalizedPlan.units.length || 1
    )
    const lessonsPerWeek = Math.max(1, options.lessons_per_week || normalizedPlan.lessons_per_week || 1)
    const reviewWeeks = new Set(options.review_weeks || [])
    const examWeeks = new Set(options.exam_weeks || [])
    const unitById = new Map(normalizedPlan.units.map(unit => [unit.unit_id, unit]))
    const matchesByUnit = new Map(matching.units.map(unit => [unit.unit_id, unit.matches]))
    const schedules: WeeklySchedule[] = []

    for (let week = 1; week <= teachingWeeks; week += 1) {
        if (examWeeks.has(week)) {
            schedules.push({
                week,
                type: 'exam',
                unit_id: null,
                unit_title: null,
                focus: '评价与学习证据收集',
                lesson_count: lessonsPerWeek,
                standard_codes: [],
                assessment_focus: '总结性评价',
                warnings: []
            })
            continue
        }

        if (reviewWeeks.has(week)) {
            schedules.push({
                week,
                type: 'review',
                unit_id: null,
                unit_title: null,
                focus: '复习巩固与低置信度匹配确认',
                lesson_count: lessonsPerWeek,
                standard_codes: [],
                assessment_focus: '形成性复习',
                warnings: []
            })
            continue
        }

        const unitIndex = Math.min(
            normalizedPlan.units.length - 1,
            Math.floor(((week - 1) / teachingWeeks) * normalizedPlan.units.length)
        )
        const unit = normalizedPlan.units[unitIndex]
        const unitMatches = matchesByUnit.get(unit.unit_id) || []
        const standardCodes = unitMatches.slice(0, 4).map(match => match.code)
        const firstMatch = unitMatches[0]?.standard as JsonObject | undefined
        schedules.push({
            week,
            type: 'teaching',
            unit_id: unit.unit_id,
            unit_title: unitById.get(unit.unit_id)?.title || unit.title,
            focus: unit.title,
            lesson_count: unit.lesson_count || lessonsPerWeek,
            standard_codes: standardCodes,
            assessment_focus: compact(firstMatch?.assessment_evidence_type) || null,
            warnings: unitMatches.some(match => match.requires_human_review)
                ? ['本周包含低置信度的课程标准匹配，需要人工复核。']
                : []
        })
    }

    return schedules
}
