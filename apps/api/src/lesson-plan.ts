// AI 教案 (lesson plan drafts) grounded in the 课标 要点 a teacher picked.
// Two model calls, each one request from the page: 'frame' writes 目标、重难点、学情、误解、评价 (evidence first,
// as in backward design); 'process' writes 教学过程、作业、板书 from that frame. Every objective must cite the
// picked 要点 codes; the server re-reads 要点 text from kebiao's data (never from the client), then checks the
// draft: codes, 「不包括……」 limits in the 课标, objective–activity–assessment links, vague verbs and timing.
import { runStructuredLlm, type LlmStatus, type LlmUsage, type StructuredLlmAdapter, type StructuredLlmOptions } from './llm.js'

export type PlanIndicator = { code: string, text: string, pages: number[], standard_code: string, standard_title: string, stage_label: string }
export type PlanStandard = {
    code: string
    title: string
    subject: string
    subject_slug: string
    stage_label: string
    level1: string
    level2: string
    statement: string
    statement_source: string
    indicators: Array<{ code: string, text: string, pages: number[] }>
    requirements: string[]
    guidance: string[]
    examples: string[]
}
export type PlanLesson = {
    title: string
    unit_title?: string
    textbook_title?: string
    edition_name?: string
    subject: string
    subject_slug: string
    grade: number | null
    pages?: string
}
export type SubjectNote = { organized_by: string, unit_hint: string, core_literacy: string[] }

export type Objective = { id: string, text: string, basis: string[], kind: string }
export type Assessment = { id: string, objective_ids: string[], task: string, evidence: string, criteria: string }
export type Frame = {
    title: string
    core_understanding: string
    objectives: Objective[]
    key_points: string[]
    difficult_points: string[]
    learner_analysis: string
    prior_knowledge: string[]
    misconceptions: Array<{ text: string, response: string }>
    keywords: Array<{ term: string, definition: string }>
    assessments: Assessment[]
}
export type Stage = { name: string, minutes: number, teacher: string, students: string, purpose: string, objective_ids: string[], assessment_ids: string[] }
export type Process = {
    stages: Stage[]
    homework: Array<{ level: string, task: string }>
    board: string[]
    materials: string[]
    safety: string[]
}
export type PlanCheck = { level: 'ok' | 'warn' | 'risk', kind: string, message: string, quote?: string, code?: string }
export type DraftInput = {
    lesson: PlanLesson
    standards: PlanStandard[]
    indicators: PlanIndicator[]
    subjectNote: SubjectNote | null
    periodMinutes: number
    lessonIndex: number
    lessonCount: number
    classNotes: string
    teacherNotes: string
}

const str = (value: unknown, max = 400) => String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, max)
const strList = (value: unknown, max: number, itemMax = 200) => (Array.isArray(value) ? value : []).map(item => str(item, itemMax)).filter(Boolean).slice(0, max)
const ids = (value: unknown, allowed: Set<string>) => [...new Set((Array.isArray(value) ? value : []).map(item => str(item, 24)).filter(item => allowed.has(item)))]

// ---------- 课标 limits: 「不包括……」「不要求……」 ----------
const LIMIT = /(?:不包括|不要求|不涉及|不作要求|不作为考试内容|不作考试要求)([^，。；;）)]{0,40})/gu
export function limitsOf(texts: string[]) {
    const out: Array<{ phrase: string, key: string, source: string }> = []
    for (const source of texts) {
        for (const match of source.matchAll(LIMIT)) {
            const phrase = match[0]
            const object = match[1].replace(/^[：:、\s]*(?:将|把|对|用|在)?/u, '').trim()
            // the first noun chunk is what a plan would mention: 「循环小数转化成分数」 → 「循环小数」
            const key = (object.match(/^[一-龥A-Za-z0-9]{2,}?(?=转化|化成|的|和|与|、|$)/u)?.[0] || object.slice(0, 6)).trim()
            if (key.length >= 3) out.push({ phrase, key, source })
        }
    }
    return out
}

const VAGUE = /(了解|感受|体会|培养|渗透|提升|增强|激发|感悟|领悟|熏陶)/u

export type CheckOptions = { planText?: string, assessmentsPlaced?: boolean }

export function checkPlan(frame: Frame, process: Process | null, input: Pick<DraftInput, 'indicators' | 'standards' | 'periodMinutes'>, options: CheckOptions = {}): PlanCheck[] {
    const checks: PlanCheck[] = []
    const picked = new Set(input.indicators.map(item => item.code))
    const cited = new Set(frame.objectives.flatMap(item => item.basis))
    for (const objective of frame.objectives) {
        if (!objective.basis.length) checks.push({ level: 'risk', kind: 'no_basis', message: `目标 ${objective.id} 没有对应的课标要点。`, quote: objective.text })
        const vague = objective.text.match(VAGUE)
        if (vague && !/能|会|说出|写出|解释|比较|设计|完成|运用|判断/u.test(objective.text)) {
            checks.push({ level: 'warn', kind: 'vague_verb', message: `目标 ${objective.id} 用了「${vague[1]}」这类看不见的动词，建议改成学生能做出的行为。`, quote: objective.text })
        }
        if (!frame.assessments.some(item => item.objective_ids.includes(objective.id))) {
            checks.push({ level: 'risk', kind: 'no_assessment', message: `目标 ${objective.id} 没有对应的评价任务（教—学—评不一致）。`, quote: objective.text })
        }
        if (process && !process.stages.some(stage => stage.objective_ids.includes(objective.id))) {
            checks.push({ level: 'risk', kind: 'no_activity', message: `目标 ${objective.id} 在教学过程里没有对应的环节。`, quote: objective.text })
        }
    }
    for (const code of picked) {
        if (!cited.has(code)) checks.push({ level: 'warn', kind: 'unused_indicator', message: `你选的要点 ${code} 没有落到任何目标上；如果这节课不教它，可以不选。`, code })
    }
    if (process) {
        const total = process.stages.reduce((sum, stage) => sum + (Number.isFinite(stage.minutes) ? stage.minutes : 0), 0)
        if (Math.abs(total - input.periodMinutes) > 3) checks.push({ level: 'warn', kind: 'timing', message: `各环节合计 ${total} 分钟，和一节课 ${input.periodMinutes} 分钟不一致。` })
        for (const assessment of options.assessmentsPlaced === false ? [] : frame.assessments) {
            if (!process.stages.some(stage => stage.assessment_ids.includes(assessment.id))) {
                checks.push({ level: 'warn', kind: 'assessment_unplaced', message: `评价任务 ${assessment.id} 没有安排在哪个环节完成。`, quote: assessment.task })
            }
        }
    }
    // 课标 says what is not required; flag a plan that mentions it
    const planText = options.planText ?? JSON.stringify({ frame, process })
    const sources = [
        ...input.indicators.map(item => item.text),
        ...input.standards.flatMap(item => [...item.requirements, ...item.guidance])
    ]
    const seen = new Set<string>()
    for (const limit of limitsOf(sources)) {
        if (seen.has(limit.key)) continue
        seen.add(limit.key)
        // 「（不涉及循环小数转换）」 restates the limit; only a mention without a negation just before it counts
        const positions = [...planText.matchAll(new RegExp(limit.key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'gu'))].map(match => match.index ?? 0)
        const asserted = positions.some(at => !/(不|除|未|无需|勿|免|非)[^，。；、,"]{0,6}$/u.test(planText.slice(Math.max(0, at - 8), at)))
        if (asserted) {
            checks.push({ level: 'risk', kind: 'beyond_standard', message: `教案里出现了「${limit.key}」，而课标写明${limit.phrase}，可能超标，请核对。`, quote: limit.source })
        }
    }
    if (!checks.some(item => item.level !== 'ok')) checks.push({ level: 'ok', kind: 'aligned', message: '每条目标都有课标要点依据、教学环节和评价任务，没有发现超出课标限定的内容。' })
    return checks
}

// ---------- prompts ----------
const SHARED_RULES = `规则：
1. 只能以「依据」里列出的课标要点为依据。目标的 basis 只能填这些要点编码，不得编造编码，也不得引用依据以外的课标。
2. 要点原文里写明「不包括」「不要求」「不涉及」的内容，教案里不得出现。
3. 内容要符合老师给出的教材和年级，不要超出这个年级学生的认知水平，也不要提前教后面学段的内容。要点往往覆盖整个单元，只写和本课课题直接相关的部分；属于本单元其他课时的内容不要写进本课目标。
4. 活动要在普通教室条件下可行；器材写常见的；涉及实验、工具、运动的写安全要求。
5. 用简洁的中文，面向教师；不要写空话套话（如「全面提升核心素养」）。
6. 不写任何学生的姓名或个人信息。`

const FRAME_INSTRUCTIONS = `你是经验丰富的中小学教研员，帮老师起草一节课的教学设计（前半部分）。按「逆向设计」的顺序：先定目标，再定评价证据。
${SHARED_RULES}
写法要求：
- objectives：2–4 条。每条以「学生能」开头，写清条件（在什么情境中）、行为（做什么、怎么做）和程度（做到什么程度），用看得见的动词（说出、比较、解释、设计、完成、运用、判断……），不用「了解」「感受」「培养」这类看不见的词。kind 填「知道」「理解」或「能做」。basis 填它依据的要点编码（至少 1 个）。
- core_understanding：一句话写出学完这节课学生应形成的核心理解（大概念层面的认识），不要只写知识点名称。
- key_points、difficult_points：各 1–2 条，具体到本课内容。
- learner_analysis：不超过 120 字，结合老师给的学情；没有学情就写这个年级学生的一般基础和可能的困难。
- prior_knowledge：1–4 条，学生学本课前应已掌握的知识或技能。
- misconceptions：1–3 条，学生对本课内容常见的错误理解（text）和课上的应对（response）。
- keywords：0–5 个本课关键词及适合学生的解释。
- assessments：1–4 个评价任务，每条目标至少被一个任务覆盖。task 写学生要完成的任务，evidence 写可以看到或收集到的证据，criteria 写达成标准（可分「达到」「较好」两级）。
必须只返回一个 JSON 对象：{"title":"…","core_understanding":"…","objectives":[{"id":"O1","text":"…","basis":["…"],"kind":"…"}],"key_points":["…"],"difficult_points":["…"],"learner_analysis":"…","prior_knowledge":["…"],"misconceptions":[{"text":"…","response":"…"}],"keywords":[{"term":"…","definition":"…"}],"assessments":[{"id":"A1","objective_ids":["O1"],"task":"…","evidence":"…","criteria":"…"}]}`

const PROCESS_INSTRUCTIONS = `你是经验丰富的中小学教研员。老师已经定好了这节课的目标和评价任务（见「已定的目标与评价」），请写教学过程和作业。
${SHARED_RULES}
写法要求：
- stages：3–7 个环节，按上课顺序。每个环节的 objective_ids 都要填（导入、小结等环节也填它服务的目标），不能留空。每个环节写 name（环节名）、minutes（分钟，整数）、teacher（教师活动，具体到要问的关键问题或要做的示范）、students（学生活动，具体到学生做什么、产出什么）、purpose（设计意图，一句话）、objective_ids（这个环节推进哪些目标）、assessment_ids（这个环节完成哪些评价任务，可为空）。所有环节分钟数合计必须等于一节课的时长。每条目标至少在一个环节里推进；每个评价任务都要安排在某个环节。
- 环节里要有学生自己动手、动脑完成的部分，不要整节课都是教师讲授。
- homework：1–3 条，level 填「基础」「拓展」或「实践」，与目标对应，总量适度。
- board：板书设计，3–8 行，体现本课结构。
- materials：教具、学具或材料，0–6 条。
- safety：涉及实验、工具、运动或外出时写安全提示，0–3 条；没有就返回空数组。
必须只返回一个 JSON 对象：{"stages":[{"name":"…","minutes":5,"teacher":"…","students":"…","purpose":"…","objective_ids":["O1"],"assessment_ids":[]}],"homework":[{"level":"基础","task":"…"}],"board":["…"],"materials":["…"],"safety":[]}`

function lessonBlock(input: DraftInput) {
    const { lesson } = input
    const lines = [
        `学科：${lesson.subject}${lesson.grade ? `　年级：${lesson.grade} 年级` : ''}`,
        `课题：${lesson.title}${lesson.unit_title && lesson.unit_title !== lesson.title ? `（所在单元：${lesson.unit_title}）` : ''}`,
        lesson.textbook_title ? `教材：${lesson.edition_name ? `${lesson.edition_name} ` : ''}${lesson.textbook_title}${lesson.pages ? `，${lesson.pages}` : ''}` : '',
        `课时：第 ${input.lessonIndex} 课时（共 ${input.lessonCount} 课时），每课时 ${input.periodMinutes} 分钟`
    ]
    if (input.subjectNote) {
        lines.push(`本学科课标的组织方式：${input.subjectNote.organized_by}`)
        lines.push(`本学科核心素养：${input.subjectNote.core_literacy.join('、')}`)
    }
    return lines.filter(Boolean).join('\n')
}

function basisBlock(input: DraftInput) {
    const out: string[] = ['依据（老师选定的课标要点，2022年版2025年修订）：']
    for (const standard of input.standards) {
        const picked = input.indicators.filter(item => item.standard_code === standard.code)
        if (!picked.length) continue
        out.push(`【标准 ${standard.code}】${standard.title}（${standard.stage_label}）${standard.statement ? `：${standard.statement}` : ''}`)
        for (const item of picked) out.push(`  ${item.code}：${item.text}`)
        if (standard.requirements.length) out.push(`  学业要求：${standard.requirements.join(' ').slice(0, 300)}`)
        if (standard.guidance.length) out.push(`  教学提示：${standard.guidance.join(' ').slice(0, 300)}`)
        if (standard.examples.length) out.push(`  表现示例（kebiao 整理，仅供参考）：${standard.examples.slice(0, 3).join('；').slice(0, 300)}`)
    }
    return out.join('\n')
}

function teacherBlock(input: DraftInput) {
    return [
        input.classNotes ? `老师提供的学情：${input.classNotes}` : '',
        input.teacherNotes ? `老师的想法和要求（在不违反规则的前提下照做）：${input.teacherNotes}` : ''
    ].filter(Boolean).join('\n')
}

// ---------- validation ----------
function validateFrame(value: unknown, indicatorCodes: Set<string>): Frame | null {
    if (!value || typeof value !== 'object') return null
    const raw = value as Record<string, unknown>
    const objectives: Objective[] = []
    for (const [index, item] of (Array.isArray(raw.objectives) ? raw.objectives : []).slice(0, 5).entries()) {
        const record = (item || {}) as Record<string, unknown>
        const text = str(record.text, 220)
        if (!text) continue
        objectives.push({ id: `O${index + 1}`, text, basis: ids(record.basis, indicatorCodes), kind: str(record.kind, 8) || '能做' })
    }
    if (!objectives.length) return null
    // the model numbers its own ids; map them to ours so references survive renumbering
    const idMap = new Map<string, string>()
    ;(Array.isArray(raw.objectives) ? raw.objectives : []).slice(0, 5).forEach((item, index) => idMap.set(str((item as Record<string, unknown>)?.id, 12) || `O${index + 1}`, `O${index + 1}`))
    const objectiveIds = new Set(objectives.map(item => item.id))
    const mapIds = (value: unknown) => [...new Set((Array.isArray(value) ? value : []).map(item => idMap.get(str(item, 12)) || str(item, 12)).filter(item => objectiveIds.has(item)))]
    const assessments: Assessment[] = (Array.isArray(raw.assessments) ? raw.assessments : []).slice(0, 5).map((item, index) => {
        const record = (item || {}) as Record<string, unknown>
        return { id: `A${index + 1}`, objective_ids: mapIds(record.objective_ids), task: str(record.task, 260), evidence: str(record.evidence, 200), criteria: str(record.criteria, 260) }
    }).filter(item => item.task)
    return {
        title: str(raw.title, 60),
        core_understanding: str(raw.core_understanding, 160),
        objectives,
        key_points: strList(raw.key_points, 3),
        difficult_points: strList(raw.difficult_points, 3),
        learner_analysis: str(raw.learner_analysis, 260),
        prior_knowledge: strList(raw.prior_knowledge, 5),
        misconceptions: (Array.isArray(raw.misconceptions) ? raw.misconceptions : []).slice(0, 3).map(item => ({ text: str((item as Record<string, unknown>)?.text, 160), response: str((item as Record<string, unknown>)?.response, 200) })).filter(item => item.text),
        keywords: (Array.isArray(raw.keywords) ? raw.keywords : []).slice(0, 5).map(item => ({ term: str((item as Record<string, unknown>)?.term, 20), definition: str((item as Record<string, unknown>)?.definition, 120) })).filter(item => item.term),
        assessments
    }
}

export function sanitiseFrame(value: unknown, indicatorCodes: Set<string>): Frame | null {
    return validateFrame(value, indicatorCodes)
}

function validateProcess(value: unknown, frame: Frame): Process | null {
    if (!value || typeof value !== 'object') return null
    const raw = value as Record<string, unknown>
    const objectiveIds = new Set(frame.objectives.map(item => item.id))
    const assessmentIds = new Set(frame.assessments.map(item => item.id))
    const stages: Stage[] = (Array.isArray(raw.stages) ? raw.stages : []).slice(0, 8).map(item => {
        const record = (item || {}) as Record<string, unknown>
        const minutes = Math.round(Number(record.minutes))
        return {
            name: str(record.name, 24),
            minutes: Number.isFinite(minutes) && minutes > 0 && minutes < 90 ? minutes : 0,
            teacher: str(record.teacher, 420),
            students: str(record.students, 420),
            purpose: str(record.purpose, 160),
            objective_ids: ids(record.objective_ids, objectiveIds),
            assessment_ids: ids(record.assessment_ids, assessmentIds)
        }
    }).filter(item => item.name && (item.teacher || item.students))
    if (!stages.length) return null
    // a stage that runs an assessment also works on the objectives that assessment checks
    for (const stage of stages) {
        const viaAssessment = frame.assessments.filter(item => stage.assessment_ids.includes(item.id)).flatMap(item => item.objective_ids)
        stage.objective_ids = [...new Set([...stage.objective_ids, ...viaAssessment])]
    }
    return {
        stages,
        homework: (Array.isArray(raw.homework) ? raw.homework : []).slice(0, 3).map(item => ({ level: str((item as Record<string, unknown>)?.level, 6) || '基础', task: str((item as Record<string, unknown>)?.task, 240) })).filter(item => item.task),
        board: strList(raw.board, 8, 60),
        materials: strList(raw.materials, 6, 60),
        safety: strList(raw.safety, 3, 160)
    }
}

const frameAdapter = (codes: Set<string>): StructuredLlmAdapter<Frame> => ({
    name: 'kebiao_lesson_frame',
    schema: { type: 'object' },
    instructions: FRAME_INSTRUCTIONS,
    chatInstructions: FRAME_INSTRUCTIONS,
    maxCompletionTokens: 3000,
    validate: value => validateFrame(value, codes)
})

const processAdapter = (frame: Frame): StructuredLlmAdapter<Process> => ({
    name: 'kebiao_lesson_process',
    schema: { type: 'object' },
    instructions: PROCESS_INSTRUCTIONS,
    chatInstructions: PROCESS_INSTRUCTIONS,
    maxCompletionTokens: 3500,
    validate: value => validateProcess(value, frame)
})

export type DraftResult<T> = { status: LlmStatus, output: T | null, usage: LlmUsage | null, latency_ms: number, model: string | null }

const DRAFT_TIMEOUT_MS = 45000

export async function draftFrame(input: DraftInput, options: StructuredLlmOptions = {}): Promise<DraftResult<Frame>> {
    const codes = new Set(input.indicators.map(item => item.code))
    const prompt = [lessonBlock(input), basisBlock(input), teacherBlock(input)].filter(Boolean).join('\n\n')
    const run = await runStructuredLlm(prompt, frameAdapter(codes), { ...options, timeoutMs: options.timeoutMs ?? DRAFT_TIMEOUT_MS })
    return { status: run.status, output: run.output, usage: run.usage, latency_ms: run.latency_ms, model: run.model }
}

export async function draftProcess(input: DraftInput, frame: Frame, options: StructuredLlmOptions = {}): Promise<DraftResult<Process>> {
    const framed = [
        '已定的目标与评价：',
        frame.core_understanding ? `核心理解：${frame.core_understanding}` : '',
        ...frame.objectives.map(item => `${item.id}（${item.kind}，依据 ${item.basis.join('、')}）：${item.text}`),
        `重点：${frame.key_points.join('；')}　难点：${frame.difficult_points.join('；')}`,
        ...frame.assessments.map(item => `${item.id}（评价 ${item.objective_ids.join('、')}）：${item.task}；证据：${item.evidence}`),
        frame.misconceptions.length ? `常见误解：${frame.misconceptions.map(item => item.text).join('；')}` : ''
    ].filter(Boolean).join('\n')
    const prompt = [lessonBlock(input), basisBlock(input), framed, teacherBlock(input)].filter(Boolean).join('\n\n')
    const run = await runStructuredLlm(prompt, processAdapter(frame), { ...options, timeoutMs: options.timeoutMs ?? DRAFT_TIMEOUT_MS })
    return { status: run.status, output: run.output, usage: run.usage, latency_ms: run.latency_ms, model: run.model }
}

// ---------- 核验我的教案: read a teacher's own (or another AI's) plan, then run the same checks ----------
export type ReadPlan = { frame: Frame, process: Process | null, notes: Array<{ objective_id: string, note: string }> }

const READ_INSTRUCTIONS = `你是中小学教研员。老师贴来一份教案（可能是自己写的，也可能是 AI 写的），请把它整理成结构，并对照「依据」里的课标要点。
规则：
1. 只整理教案里写了的内容，不补写、不改写；教案没写的部分返回空数组。
2. objectives：教案里的每条教学目标或学习目标，按原文抄录（可去掉编号）。basis 填它对应的要点编码，只能从「依据」里选；找不到对应的要点就留空数组。note 用一句话指出问题（如「太空泛，看不出学生要做到什么」「超出所选要点的范围」「是教师行为，不是学生的学习结果」），没有问题就留空字符串。
3. assessments：教案里的评价、检测、练习反馈等，task 抄录要点，objective_refs 填它检验的目标序号（从 1 开始）。
4. stages：教学过程的各环节，name、minutes（教案没写就填 0）、objective_refs 填这个环节推进的目标序号。
5. period_minutes：教案写明的一节课时长，没写填 0。
必须只返回一个 JSON 对象：{"title":"…","objectives":[{"text":"…","basis":["…"],"note":""}],"assessments":[{"task":"…","objective_refs":[1]}],"stages":[{"name":"…","minutes":5,"objective_refs":[1]}],"period_minutes":40}`

function validateRead(value: unknown, codes: Set<string>): ReadPlan | null {
    if (!value || typeof value !== 'object') return null
    const raw = value as Record<string, unknown>
    const objectivesRaw = (Array.isArray(raw.objectives) ? raw.objectives : []).slice(0, 8)
    const objectives: Objective[] = []
    const notes: ReadPlan['notes'] = []
    objectivesRaw.forEach((item, index) => {
        const record = (item || {}) as Record<string, unknown>
        const text = str(record.text, 260)
        if (!text) return
        const id = `O${index + 1}`
        objectives.push({ id, text, basis: ids(record.basis, codes), kind: '' })
        const note = str(record.note, 80)
        if (note) notes.push({ objective_id: id, note })
    })
    if (!objectives.length) return null
    const known = new Set(objectives.map(item => item.id))
    const refs = (value: unknown) => [...new Set((Array.isArray(value) ? value : []).map(item => `O${Number(item)}`).filter(id => known.has(id)))]
    const assessments: Assessment[] = (Array.isArray(raw.assessments) ? raw.assessments : []).slice(0, 8).map((item, index) => {
        const record = (item || {}) as Record<string, unknown>
        return { id: `A${index + 1}`, objective_ids: refs(record.objective_refs), task: str(record.task, 200), evidence: '', criteria: '' }
    }).filter(item => item.task)
    const stages: Stage[] = (Array.isArray(raw.stages) ? raw.stages : []).slice(0, 10).map(item => {
        const record = (item || {}) as Record<string, unknown>
        const minutes = Math.round(Number(record.minutes))
        return { name: str(record.name, 30), minutes: Number.isFinite(minutes) && minutes > 0 && minutes < 90 ? minutes : 0, teacher: '', students: '', purpose: '', objective_ids: refs(record.objective_refs), assessment_ids: [] }
    }).filter(item => item.name)
    const frame: Frame = { title: str(raw.title, 60), core_understanding: '', objectives, key_points: [], difficult_points: [], learner_analysis: '', prior_knowledge: [], misconceptions: [], keywords: [], assessments }
    const period = Math.round(Number(raw.period_minutes))
    return { frame, process: stages.length ? { stages, homework: [], board: [], materials: [], safety: [] } : null, notes, ...(period > 0 ? { period } : {}) } as ReadPlan
}

export async function readTeacherPlan(planText: string, input: DraftInput, options: StructuredLlmOptions = {}): Promise<DraftResult<ReadPlan>> {
    const codes = new Set(input.indicators.map(item => item.code))
    const prompt = [lessonBlock(input), basisBlock(input), `老师的教案：\n${planText}`].join('\n\n')
    const adapter: StructuredLlmAdapter<ReadPlan> = {
        name: 'kebiao_lesson_read',
        schema: { type: 'object' },
        instructions: READ_INSTRUCTIONS,
        chatInstructions: READ_INSTRUCTIONS,
        maxCompletionTokens: 3000,
        validate: value => validateRead(value, codes)
    }
    const run = await runStructuredLlm(prompt, adapter, { ...options, timeoutMs: options.timeoutMs ?? DRAFT_TIMEOUT_MS })
    return { status: run.status, output: run.output, usage: run.usage, latency_ms: run.latency_ms, model: run.model }
}

// the read plan's checks, plus the reader's notes on each objective
export function checkTeacherPlan(read: ReadPlan & { period?: number }, planText: string, input: DraftInput): PlanCheck[] {
    const checks = checkPlan(read.frame, read.process, { ...input, periodMinutes: read.period || input.periodMinutes }, { planText, assessmentsPlaced: false })
        .filter(item => !(item.kind === 'timing' && read.process?.stages.every(stage => !stage.minutes)))
    const notes = read.notes.map(item => {
        const objective = read.frame.objectives.find(entry => entry.id === item.objective_id)
        return { level: 'warn' as const, kind: 'reader_note', message: `目标 ${item.objective_id.replace('O', '')}：${item.note}`, quote: objective?.text }
    })
    const all = [...checks.filter(item => item.kind !== 'aligned'), ...notes]
    return all.length ? all.map(item => ({ ...item, message: item.message.replace(/目标 O(\d+)/gu, '目标 $1') })) : checks
}

// ---------- 单元整体设计: a textbook unit, backward-designed, laid out over the textbook's own lessons ----------
export type UnitLesson = { title: string, hours: number, focus: string, objective_ids: string[], assessment_ids: string[] }
export type UnitPlan = {
    title: string
    big_idea: string
    essential_questions: string[]
    objectives: Objective[]
    performance_task: { title: string, scenario: string, product: string, criteria: string[] } | null
    assessments: Assessment[]
    lessons: UnitLesson[]
    prior_knowledge: string[]
    connections: string
}

const UNIT_INSTRUCTIONS = `你是经验丰富的中小学教研员，帮老师做一个教材单元的单元整体教学设计。按「逆向设计」的顺序：先定单元要达成的理解和目标，再定评价证据（含一个表现性任务），最后把课时排进教材原有的课里。
${SHARED_RULES}
写法要求：
- big_idea：一句话写出单元大概念，即学完本单元学生应形成的可迁移的理解。要写成完整的判断句，不要只写话题或知识点名称（不要写「分数」，要写「分数的大小……」这样的句子）。
- essential_questions：2–3 个开放的基本问题，能引发思考、贯穿整个单元，不能用一个事实回答。
- objectives：3–5 条单元目标，每条以「学生能」开头，写清条件、行为和程度；kind 填「知道」「理解」或「能做」；basis 填依据的要点编码（至少 1 个，只能从「依据」里选）。
- performance_task：一个贯穿或收束单元的表现性任务：title（任务名），scenario（真实情境和学生的角色，一两句），product（学生交出的作品或表现），criteria（2–4 条评价标准）。
- assessments：2–5 个评价任务（含表现性任务和课时中的小评价），每条目标至少被一个任务覆盖；objective_ids 填覆盖的目标，task、evidence、criteria 同前。
- lessons：按「教材里的课」的顺序安排课时。title 必须用教材里的课名（可以把几节合成一行，用「、」连接课名）；hours 是课时数；focus 写这几节课在单元里推进什么（一句话）；objective_ids、assessment_ids 填它推进的目标和完成的评价。所有 hours 合计等于单元总课时。每条目标至少在一行里推进。
- prior_knowledge：1–4 条学生学本单元前应已具备的。
- connections：一句话说明本单元和前后学段或前后单元的联系。
必须只返回一个 JSON 对象：{"title":"…","big_idea":"…","essential_questions":["…"],"objectives":[{"id":"O1","text":"…","basis":["…"],"kind":"…"}],"performance_task":{"title":"…","scenario":"…","product":"…","criteria":["…"]},"assessments":[{"id":"A1","objective_ids":["O1"],"task":"…","evidence":"…","criteria":"…"}],"lessons":[{"title":"…","hours":2,"focus":"…","objective_ids":["O1"],"assessment_ids":[]}],"prior_knowledge":["…"],"connections":"…"}`

function validateUnit(value: unknown, codes: Set<string>, lessonTitles: string[]): UnitPlan | null {
    const frame = validateFrame(value, codes)
    if (!frame) return null
    const raw = value as Record<string, unknown>
    const objectiveIds = new Set(frame.objectives.map(item => item.id))
    const assessmentIds = new Set(frame.assessments.map(item => item.id))
    const task = (raw.performance_task || null) as Record<string, unknown> | null
    const known = (title: string) => title.split(/[、，,]/u).map(part => part.trim()).filter(Boolean).every(part => lessonTitles.some(name => name.includes(part) || part.includes(name)))
    const lessons: UnitLesson[] = (Array.isArray(raw.lessons) ? raw.lessons : []).slice(0, 24).map(item => {
        const record = (item || {}) as Record<string, unknown>
        const hours = Math.round(Number(record.hours))
        return {
            title: str(record.title, 80),
            hours: Number.isFinite(hours) && hours > 0 && hours < 20 ? hours : 1,
            focus: str(record.focus, 160),
            objective_ids: ids(record.objective_ids, objectiveIds),
            assessment_ids: ids(record.assessment_ids, assessmentIds)
        }
    }).filter(item => item.title && (!lessonTitles.length || known(item.title)))
    if (!lessons.length) return null
    for (const lesson of lessons) {
        const viaAssessment = frame.assessments.filter(item => lesson.assessment_ids.includes(item.id)).flatMap(item => item.objective_ids)
        lesson.objective_ids = [...new Set([...lesson.objective_ids, ...viaAssessment])]
    }
    return {
        title: frame.title,
        big_idea: str(raw.big_idea, 200),
        essential_questions: strList(raw.essential_questions, 3, 120),
        objectives: frame.objectives,
        performance_task: task && str(task.title, 40) ? { title: str(task.title, 40), scenario: str(task.scenario, 240), product: str(task.product, 160), criteria: strList(task.criteria, 4, 120) } : null,
        assessments: frame.assessments,
        lessons,
        prior_knowledge: strList(raw.prior_knowledge, 4),
        connections: str(raw.connections, 200)
    }
}

export async function draftUnit(input: DraftInput, lessonTitles: string[], totalHours: number, options: StructuredLlmOptions = {}): Promise<DraftResult<UnitPlan>> {
    const codes = new Set(input.indicators.map(item => item.code))
    const lessonsBlock = lessonTitles.length
        ? `教材里本单元的课（按顺序）：\n${lessonTitles.map((title, index) => `${index + 1}. ${title}`).join('\n')}`
        : '教材课目未知：请按内容自行划分课时，课名写内容主题。'
    const prompt = [
        lessonBlock(input).replace(/课时：.*\n?/u, ''),
        `单元总课时：${totalHours}`,
        basisBlock(input),
        lessonsBlock,
        teacherBlock(input)
    ].filter(Boolean).join('\n\n')
    const adapter: StructuredLlmAdapter<UnitPlan> = {
        name: 'kebiao_unit_plan',
        schema: { type: 'object' },
        instructions: UNIT_INSTRUCTIONS,
        chatInstructions: UNIT_INSTRUCTIONS,
        maxCompletionTokens: 4000,
        validate: value => validateUnit(value, codes, lessonTitles)
    }
    const run = await runStructuredLlm(prompt, adapter, { ...options, timeoutMs: options.timeoutMs ?? DRAFT_TIMEOUT_MS })
    return { status: run.status, output: run.output, usage: run.usage, latency_ms: run.latency_ms, model: run.model }
}

// the unit's checks: the lesson checks with lessons standing in for stages, plus the unit's own
export function checkUnit(unit: UnitPlan, input: DraftInput, totalHours: number): PlanCheck[] {
    const frame: Frame = { title: unit.title, core_understanding: unit.big_idea, objectives: unit.objectives, key_points: [], difficult_points: [], learner_analysis: '', prior_knowledge: unit.prior_knowledge, misconceptions: [], keywords: [], assessments: unit.assessments }
    const process: Process = { stages: unit.lessons.map(item => ({ name: item.title, minutes: 0, teacher: item.focus, students: '', purpose: '', objective_ids: item.objective_ids, assessment_ids: item.assessment_ids })), homework: [], board: [], materials: [], safety: [] }
    const checks = checkPlan(frame, process, input, { planText: JSON.stringify(unit) })
        .filter(item => item.kind !== 'timing' && item.kind !== 'aligned')
        .map(item => ({ ...item, message: item.message.replace('在教学过程里没有对应的环节', '没有排进任何课时') }))
    const hours = unit.lessons.reduce((sum, item) => sum + item.hours, 0)
    if (hours !== totalHours) checks.push({ level: 'warn', kind: 'timing', message: `课时合计 ${hours} 节，和你定的单元 ${totalHours} 课时不一致。` })
    if (!unit.big_idea) checks.push({ level: 'warn', kind: 'no_big_idea', message: '没有写出单元大概念。' })
    if (!unit.performance_task) checks.push({ level: 'warn', kind: 'no_performance_task', message: '没有表现性任务，单元评价只剩纸笔或零散提问。' })
    if (!checks.length) checks.push({ level: 'ok', kind: 'aligned', message: '每条单元目标都有课标要点依据、评价任务，并排进了具体课时；课时合计与设定一致。' })
    return checks
}
