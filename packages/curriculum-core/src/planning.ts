import { GRADE_BANDS } from './constants.js'
import { ensureArray } from './normalize.js'
import { sortStandards } from './search.js'
import { smartSearchStandards } from './smart-search.js'
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
    CoverageReviewDecision,
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

function mainSkill(value: string): string {
    return value.split('.')[0].toUpperCase()
}

export function matchPlanToStandards(
    plan: ParsedPlan,
    standards: StandardRecord[],
    options: { top_k_per_unit?: number; min_score?: number; include?: Fieldset[] } = {}
): PlanMatchingResult {
    const normalizedPlan = normalizeParsedPlan(plan)
    const minScore = options.min_score ?? 0.08
    const topK = Math.min(Math.max(options.top_k_per_unit || 5, 1), 20)
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
        const retrieval = smartSearchStandards(candidateStandards, {
            query: [unit.title, ...unit.learning_goals, ...unit.keywords].join(' '),
            subjects: normalizedPlan.subject_slug ? [normalizedPlan.subject_slug] : undefined,
            grade_bands: normalizedPlan.grade_band ? [normalizedPlan.grade_band] : undefined,
            limit: topK,
            min_score: minScore,
            include: options.include
        })
        const matches: PlanStandardMatch[] = retrieval.results.map(result => ({
            code: result.code,
            score: result.score,
            match_type: result.match_type,
            matched_fields: result.matched_fields.map(field => ({
                field: field.field,
                matched_keywords: field.matched_terms,
                value: field.excerpt,
                provenance: field.provenance,
                review_status: field.review_status,
                confidence: field.confidence,
                quality_flags: field.quality_flags
            })),
            rationale: result.rationale,
            requires_human_review: true,
            standard: result.standard,
            score_breakdown: result.score_breakdown
        }))
        const unitWarnings: string[] = []
        if (!matches.length) unitWarnings.push('没有课程标准达到该教学单元的最低确定性匹配分数。')
        if (matches.length) unitWarnings.push('所有机器匹配均为候选，必须由教师接受或拒绝后才能计入覆盖分析。')
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

export function analyzeCoverage(
    plan: ParsedPlan,
    matching: PlanMatchingResult,
    reviewDecisions: CoverageReviewDecision[] = [],
    referenceScopeCodes: string[] = []
): CoverageAnalysis {
    const codeCounts = new Map<string, number>()
    const standardsByDomain: Record<string, number> = {}
    const standardsBySkill: Record<string, number> = {}
    const unmatchedUnits: string[] = []
    const decisionByUnitAndCode = new Map(reviewDecisions.map(item => [`${item.unit_id}:${item.code}`, item.decision]))
    const candidateCodes = new Set<string>()
    const acceptedCodes = new Set<string>()
    const rejectedCodes = new Set<string>()
    const unreviewedCodes = new Set<string>()

    for (const unit of matching.units) {
        if (!unit.matches.length) unmatchedUnits.push(unit.unit_id)
        for (const match of unit.matches) {
            candidateCodes.add(match.code)
            const decision = decisionByUnitAndCode.get(`${unit.unit_id}:${match.code}`)
            if (decision === 'accepted') acceptedCodes.add(match.code)
            else if (decision === 'rejected') rejectedCodes.add(match.code)
            else unreviewedCodes.add(match.code)
            if (decision !== 'accepted') continue
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
        candidate_standard_codes: [...candidateCodes].sort(),
        rejected_standard_codes: [...rejectedCodes].sort(),
        unreviewed_standard_codes: [...unreviewedCodes].sort(),
        reference_scope_codes: uniqueStrings(referenceScopeCodes),
        gap_standard_codes: referenceScopeCodes.length
            ? uniqueStrings(referenceScopeCodes).filter(code => !acceptedCodes.has(code))
            : [],
        unmatched_units: unmatchedUnits,
        duplicate_standards: duplicateStandards,
        standards_by_domain: standardsByDomain,
        standards_by_skill: standardsBySkill,
        units: matching.units.map(unit => ({
            unit_id: unit.unit_id,
            unit_title: unit.unit_title,
            candidate_standard_codes: unit.matches.map(match => match.code),
            matched_standard_codes: unit.matches
                .filter(match => decisionByUnitAndCode.get(`${unit.unit_id}:${match.code}`) === 'accepted')
                .map(match => match.code),
            unreviewed_match_count: unit.matches.filter(match => !decisionByUnitAndCode.has(`${unit.unit_id}:${match.code}`)).length
        })),
        warnings: [
            ...matching.warnings,
            ...(!reviewDecisions.length ? ['尚未提供教师复核决定；机器候选不会计入已覆盖标准。'] : []),
            ...(!referenceScopeCodes.length ? ['未提供参考标准范围，因此不生成“缺口”结论。'] : []),
            ...(duplicateStandards.length ? ['部分课程标准被多个教学单元重复匹配；请确认这是有意的螺旋式覆盖，还是需要去重。'] : []),
            ...(unmatchedUnits.length ? ['部分教学单元没有达到确定性匹配阈值的课程标准。'] : [])
        ]
    }
}

function uniqueStrings(values: string[]): string[] {
    return [...new Set(values.map(String).filter(Boolean))].sort()
}

export function generateWeeklySchedule(
    plan: ParsedPlan,
    matching: PlanMatchingResult,
    options: {
        teaching_weeks?: number
        lessons_per_week?: number
        review_weeks?: number[]
        exam_weeks?: number[]
        review_confirmed?: boolean
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
            warnings: !standardCodes.length
                ? ['本周尚无教师确认的课程标准，请补充确认或手动调整。']
                : !options.review_confirmed && unitMatches.some(match => match.requires_human_review)
                    ? ['本周包含尚未确认的课程标准匹配，需要人工复核。']
                    : []
        })
    }

    return schedules
}
