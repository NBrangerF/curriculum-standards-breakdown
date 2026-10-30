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
        for (const stage of process.stages) {
            if (!stage.minutes && options.assessmentsPlaced !== false) checks.push({ level: 'warn', kind: 'timing', message: `环节「${stage.name}」没有安排时间。` })
        }
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
- stages：3–7 个环节，按上课顺序，每个环节至少 2 分钟。每个环节的 objective_ids 都要填（导入、小结等环节也填它服务的目标），不能留空。每个环节写 name（环节名）、minutes（分钟，整数）、teacher（教师活动，具体到要问的关键问题或要做的示范）、students（学生活动，具体到学生做什么、产出什么）、purpose（设计意图，一句话）、objective_ids（这个环节推进哪些目标）、assessment_ids（这个环节完成哪些评价任务，可为空）。所有环节分钟数合计必须等于一节课的时长。每条目标至少在一个环节里推进；每个评价任务都要安排在某个环节。
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

export function sanitiseProcess(value: unknown, frame: Frame): Process | null {
    return validateProcess(value, frame)
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
export type ReadPlan = { frame: Frame, process: Process | null, notes: Array<{ objective_id: string, note: string }>, beyond: Array<{ quote: string, limit: string }> }

const READ_INSTRUCTIONS = `你是中小学教研员。老师贴来一份教案（可能是自己写的，也可能是 AI 写的），请把它整理成结构，并对照「依据」里的课标要点。
规则：
1. 只整理教案里写了的内容，不补写、不改写；教案没写的部分返回空数组。
2. objectives：教案里的每条教学目标或学习目标，按原文抄录（可去掉编号）。basis 填它对应的要点编码，只能从「依据」里选；找不到对应的要点就留空数组。note 用一句话指出问题（如「太空泛，看不出学生要做到什么」「超出所选要点的范围」「是教师行为，不是学生的学习结果」），没有问题就留空字符串。
3. assessments：教案里的评价、检测、练习反馈等，task 抄录要点，objective_refs 填它检验的目标序号（从 1 开始）。
4. stages：教学过程的各环节，name、minutes（教案没写就填 0）、objective_refs 填这个环节推进的目标序号。
5. period_minutes：教案写明的一节课时长，没写填 0。
6. beyond：教案里超出依据要点写明的限定（「不包括……」「不要求……」等）的内容。quote 逐字抄录教案原文片段，limit 逐字抄录要点里的限定原文；没有就返回空数组。注意换了说法的情况，比如「0.3（3 循环）化成分数」就是循环小数化成分数。
必须只返回一个 JSON 对象：{"title":"…","objectives":[{"text":"…","basis":["…"],"note":""}],"assessments":[{"task":"…","objective_refs":[1]}],"stages":[{"name":"…","minutes":5,"objective_refs":[1]}],"period_minutes":40,"beyond":[{"quote":"…","limit":"…"}]}`

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
    const beyond = (Array.isArray(raw.beyond) ? raw.beyond : []).slice(0, 5).map(item => ({ quote: str((item as Record<string, unknown>)?.quote, 120), limit: str((item as Record<string, unknown>)?.limit, 120) })).filter(item => item.quote && item.limit)
    return { frame, process: stages.length ? { stages, homework: [], board: [], materials: [], safety: [] } : null, notes, beyond, ...(period > 0 ? { period } : {}) } as ReadPlan
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
    // the reader's 超标 findings count only when both quotes are real: the plan's words and the 要点's limit
    const squash = (text: string) => text.replace(/[\s（）()“”"'、，,。；;：:]/gu, '')
    const plan = squash(planText)
    const limits = input.indicators.map(item => squash(item.text))
    const flagged = checks.filter(item => item.kind === 'beyond_standard').map(item => squash(item.quote || ''))
    const beyond = read.beyond
        .filter(item => plan.includes(squash(item.quote)) && limits.some(text => text.includes(squash(item.limit))))
        .map(item => ({ level: 'risk' as const, kind: 'beyond_standard', message: `「${item.quote}」超出了课标的限定：${item.limit}。`, quote: item.limit }))
        // the program already flagged this limit by its words
        .filter(item => !flagged.some(source => source.includes(squash(item.quote || ''))))
    const all = [...checks.filter(item => item.kind !== 'aligned'), ...beyond, ...notes]
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
- big_idea：一句话写出单元大概念，即学完本单元学生应形成的、关于学科内容本身的可迁移的理解。写成陈述学科道理的判断句，不能以「学生能」开头，也不能只写话题。反例：「分数」「学生能理解分数并进行比较」。正例：「同一个数量可以用许多个相等的分数表示，分数的基本性质是约分、通分和比较大小的依据」。
- essential_questions：2–3 个开放的基本问题，能引发思考、贯穿整个单元，不能用一个事实回答。
- objectives：3–5 条单元目标，每条以「学生能」开头，写清条件、行为和程度；kind 填「知道」「理解」或「能做」；basis 填依据的要点编码（至少 1 个，只能从「依据」里选）。
- performance_task：一个贯穿或收束单元的表现性任务：title（任务名），scenario（真实情境和学生的角色，一两句），product（学生交出的作品或表现），criteria（2–4 条评价标准）。
- assessments：2–5 个评价任务（含表现性任务和课时中的小评价），每条目标至少被一个任务覆盖；objective_ids 填覆盖的目标，task、evidence、criteria 同前。表现性任务在这里写成「表现性任务：任务名」，不要写字段名。
- title：单元名称，不要加「单元整体教学设计」之类的后缀。
- lessons：按「教材里的课」的顺序安排课时。title 必须用教材里的课名（可以把几节合成一行，用「、」连接课名）；hours 是课时数；focus 写这几节课在单元里推进什么（一句话）；objective_ids、assessment_ids 填它推进的目标和完成的评价。所有 hours 合计必须正好等于「单元总课时」，写完请自己加一遍核对。每条目标至少在一行里推进。
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
    // the model sometimes leaks a field name or appends the document type to the title
    for (const assessment of frame.assessments) assessment.task = assessment.task.replace(/性能性任务/gu, '表现性任务').replace(/[（(]?同\s*performance_task[）)]?/giu, '').replace(/performance_task/giu, '表现性任务')
    return {
        title: frame.title.replace(/[（(][^（）()]*设计[）)]\s*$/u, '').trim(),
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
    else if (/^学生(能|会|可以)/u.test(unit.big_idea)) checks.push({ level: 'warn', kind: 'big_idea_objective', message: '单元大概念写成了目标（以「学生能」开头），建议改成一句关于学科内容本身的判断。', quote: unit.big_idea })
    if (!unit.performance_task) checks.push({ level: 'warn', kind: 'no_performance_task', message: '没有表现性任务，单元评价只剩纸笔或零散提问。' })
    if (!checks.length) checks.push({ level: 'ok', kind: 'aligned', message: '每条单元目标都有课标要点依据、评价任务，并排进了具体课时；课时合计与设定一致。' })
    return checks
}

// ---------- 说课稿: a drafted plan retold for 说课 / 教资面试, nothing added ----------
export type TalkScript = { sections: Array<{ heading: string, text: string }>, minutes: number }
const TALK_HEADINGS = ['说教材', '说学情', '说教学目标与重难点', '说教法与学法', '说教学过程', '说板书设计']

const TALK_INSTRUCTIONS = `你是中小学教研员，帮老师把一份已经写好的教案改写成说课稿，用于说课比赛或教师资格面试。
规则：
1. 只用教案和「依据」里已有的内容，不新增教案里没有的活动、材料或结论，不编造教材内容。
2. 用第一人称「我」，面向评委，口语化但规范，5–8 分钟能说完（约 1200–1800 字）。
3. 按顺序写六个部分：说教材、说学情、说教学目标与重难点、说教法与学法、说教学过程、说板书设计。
4. 说教材：说明本课在教材和单元中的位置，并引用课标依据（写出要点编码和原文中的关键语句）。说教学目标时说明每条目标依据哪条要点。说教法与学法要和教学过程里的活动一致。说教学过程按环节说，每个环节说清做什么、为什么这样设计。
必须只返回一个 JSON 对象：{"sections":[{"heading":"说教材","text":"…"}],"minutes":6}`

function planSummary(frame: Frame, process: Process) {
    return [
        `教案：${frame.title}`,
        frame.core_understanding ? `核心理解：${frame.core_understanding}` : '',
        ...frame.objectives.map(item => `目标 ${item.id.replace('O', '')}（依据 ${item.basis.join('、')}）：${item.text}`),
        `重点：${frame.key_points.join('；')}　难点：${frame.difficult_points.join('；')}`,
        `学情：${frame.learner_analysis}`,
        ...frame.assessments.map(item => `评价：${item.task}（证据：${item.evidence}）`),
        ...process.stages.map(stage => `环节「${stage.name}」${stage.minutes} 分钟。教师：${stage.teacher} 学生：${stage.students} 意图：${stage.purpose}`),
        process.board.length ? `板书：${process.board.join(' / ')}` : ''
    ].filter(Boolean).join('\n')
}

// a 要点 code the plan does not cite is dropped from generated text
const keepCodes = (text: string, codes: Set<string>) => text.replace(/[A-Z]{2}-S\d-[A-Z]{2,3}-\d{2}(?:\.\d+)?/gu, code => (codes.has(code) || [...codes].some(item => item.startsWith(`${code}.`)) ? code : ''))

export async function draftTalk(input: DraftInput, frame: Frame, process: Process, options: StructuredLlmOptions = {}): Promise<DraftResult<TalkScript>> {
    const codes = new Set(input.indicators.map(item => item.code))
    const prompt = [lessonBlock(input), basisBlock(input), planSummary(frame, process)].join('\n\n')
    const adapter: StructuredLlmAdapter<TalkScript> = {
        name: 'kebiao_talk_script',
        schema: { type: 'object' },
        instructions: TALK_INSTRUCTIONS,
        chatInstructions: TALK_INSTRUCTIONS,
        maxCompletionTokens: 4000,
        validate(value) {
            const raw = (value || {}) as Record<string, unknown>
            const sections = (Array.isArray(raw.sections) ? raw.sections : []).map(item => {
                const record = (item || {}) as Record<string, unknown>
                const text = keepCodes(String(record.text || ''), codes).trim().slice(0, 1600)
                return { heading: str(record.heading, 12), text }
            }).filter(item => TALK_HEADINGS.includes(item.heading) && item.text)
            if (sections.length < 4) return null
            const minutes = Math.round(Number(raw.minutes))
            return { sections, minutes: Number.isFinite(minutes) && minutes > 0 && minutes < 20 ? minutes : 6 }
        }
    }
    const run = await runStructuredLlm(prompt, adapter, { ...options, timeoutMs: options.timeoutMs ?? DRAFT_TIMEOUT_MS })
    return { status: run.status, output: run.output, usage: run.usage, latency_ms: run.latency_ms, model: run.model }
}

// ---------- 试讲稿 + 答辩 (教师资格面试) ----------
export type TrialScript = { stages: Array<{ name: string, minutes: number, text: string }>, board: string[], defense: Array<{ question: string, answer: string }>, minutes: number }

const TRIAL_INSTRUCTIONS = `你是指导师范生备考教师资格证面试的教研员。把一份写好的教案改写成 10 分钟的试讲稿，并准备答辩。试讲是在没有学生的考场里对评委模拟上课。
规则：
1. 只用教案和「依据」里已有的内容和活动，不新增教案里没有的活动、材料或结论，不编造教材内容。时间不够时压缩各环节，但保留评价和小结。
2. stages：按教案的环节顺序写，每个环节写 name、minutes（各环节合计 8–10 分钟）和 text。text 是教师在课堂上说的原话：第一人称，口语化，面向「同学们」。需要学生回答的地方，先写出问题，再用「（模拟学生回答：……）」写一句典型的学生回答，接着写教师的反馈；需要写板书的地方用「（板书：……）」标出。不要写「教师活动」「设计意图」之类的说明。
3. board：试讲结束时黑板上的完整板书，3–8 行，和 text 里写的板书一致。
4. defense：3 个评委可能追问的答辩题和参考回答。问题围绕本课的教学目标、重难点怎么突破、环节为什么这样设计、对应的课标要求；每个回答 80–150 字，引用课标时写出要点编码，只能用「依据」里的编码。
必须只返回一个 JSON 对象：{"stages":[{"name":"导入","minutes":1,"text":"…"}],"board":["…"],"defense":[{"question":"…","answer":"…"}]}`

export async function draftTrial(input: DraftInput, frame: Frame, process: Process, options: StructuredLlmOptions = {}): Promise<DraftResult<TrialScript>> {
    const codes = new Set(input.indicators.map(item => item.code))
    const prompt = [lessonBlock(input), basisBlock(input), planSummary(frame, process)].join('\n\n')
    const adapter: StructuredLlmAdapter<TrialScript> = {
        name: 'kebiao_trial_script',
        schema: { type: 'object' },
        instructions: TRIAL_INSTRUCTIONS,
        chatInstructions: TRIAL_INSTRUCTIONS,
        maxCompletionTokens: 5000,
        validate(value) {
            const raw = (value || {}) as Record<string, unknown>
            const stages = (Array.isArray(raw.stages) ? raw.stages : []).slice(0, 8).map(item => {
                const record = (item || {}) as Record<string, unknown>
                const minutes = Math.round(Number(record.minutes))
                return { name: str(record.name, 20), minutes: Number.isFinite(minutes) && minutes > 0 && minutes <= 10 ? minutes : 1, text: keepCodes(String(record.text || ''), codes).trim().slice(0, 1500) }
            }).filter(item => item.name && item.text)
            const defense = (Array.isArray(raw.defense) ? raw.defense : []).slice(0, 4).map(item => {
                const record = (item || {}) as Record<string, unknown>
                return { question: str(record.question, 80), answer: keepCodes(String(record.answer || ''), codes).replace(/\s+/gu, ' ').trim().slice(0, 400) }
            }).filter(item => item.question && item.answer)
            if (stages.length < 3 || defense.length < 2) return null
            return { stages, board: strList(raw.board, 8, 60), defense, minutes: stages.reduce((sum, item) => sum + item.minutes, 0) }
        }
    }
    const run = await runStructuredLlm(prompt, adapter, { ...options, timeoutMs: options.timeoutMs ?? DRAFT_TIMEOUT_MS })
    return { status: run.status, output: run.output, usage: run.usage, latency_ms: run.latency_ms, model: run.model }
}

// ---------- 要点排序 ----------
// The search judge grades each standard on its own, in batches, so four or five can all come back 「直接对应」 with no order
// between them. When there are more than the page ticks, one short call reads just those 要点 side by side and orders them.
const RANK_INSTRUCTIONS = `你是中小学教研员。下面是一节课（或一个单元）和若干条都与它直接对应的课标要点原文，每条附有初步判断的理由。
先用几个字写出这节课是什么（kind，如「一首古诗」「一篇说明文」「一种计算方法」「一个实验」「一首民歌」），再按这节课最核心、最需要落实的程度从高到低排序（order），最多保留指定的条数。
优先选内容上专门针对这类课的要点（如古诗对应「诵读诗文」，实验对应「实验探究」）；对很多课都适用的通用要求排在后面。只用给出的编码，不得编造。
必须只返回一个 JSON 对象：{"kind":"…","order":["编码",…]}`

export async function rankPoints(request: string, points: Array<{ code: string, text: string, reason?: string }>, keep: number, options: StructuredLlmOptions = {}): Promise<DraftResult<string[]>> {
    const codes = new Set(points.map(item => item.code))
    const prompt = [`本课：${request}`, `最多保留 ${keep} 条。`, '要点：', ...points.map(item => `${item.code}：${item.text}${item.reason ? `（初判：${item.reason}）` : ''}`)].join('\n')
    const adapter: StructuredLlmAdapter<string[]> = {
        name: 'kebiao_rank_points',
        schema: { type: 'object' },
        instructions: RANK_INSTRUCTIONS,
        chatInstructions: RANK_INSTRUCTIONS,
        maxCompletionTokens: 600,
        validate(value) {
            const raw = (value || {}) as Record<string, unknown>
            const order = [...new Set((Array.isArray(raw.order) ? raw.order : []).map(item => String(item).trim()).filter(item => codes.has(item)))].slice(0, keep)
            return order.length ? order : null
        }
    }
    const run = await runStructuredLlm(prompt, adapter, { ...options, timeoutMs: options.timeoutMs ?? 15000 })
    return { status: run.status, output: run.output, usage: run.usage, latency_ms: run.latency_ms, model: run.model }
}

// ---------- 核验我的试卷: a 多维细目表 and 超标 checks for a pasted test or homework ----------
// 物理 p51, 化学 p52, 生物学 p46 and 历史 p66 ask for a 多维细目表 (内容、核心素养、题型、分值、难度). Only 数学 (附录 2)
// and 科学 (附录 2) define levels for 结果目标, so only those two get a 层次 column.
export const TEST_LEVELS: Record<string, { levels: string[], source: string, defs: string }> = {
    math: {
        levels: ['了解', '理解', '掌握', '运用'],
        source: '数学课标附录 2「有关行为动词的分类」（修订版第 185 页）',
        defs: '了解：从具体实例中知道或举例说明对象的有关特征；根据对象的特征，从具体情境中辨认或举例说明对象。理解：描述对象的由来、内涵和特征，阐述此对象与相关对象之间的区别和联系。掌握：多角度理解和表征数学对象的本质，把对象用于新的情境。运用：基于数学对象和对象之间的关系，选择或创造适当的方法解决问题。'
    },
    science: {
        levels: ['一级水平', '二级水平', '三级水平'],
        source: '科学课标附录 2「课程内容中使用的行为动词」（修订版第 144 页）',
        defs: '认知性目标动词。一级水平：知道、举例说出、说出、描述、识别、列举、了解。二级水平：比较、举例说明、说明、概述、解释、认识、理解。三级水平：区别、辨析、判断、分析、阐明、分类、应用、预测、评价。'
    }
}
const DIFFICULTY = ['易', '中', '难']
// 数学 core literacy is 「三会」; a test is analysed by its 主要表现 (修订版第 10 页), which differ for 小学 and 初中
const MATH_PRIMARY = ['数感', '量感', '符号意识', '运算能力', '几何直观', '空间观念', '推理意识', '数据意识', '模型意识', '应用意识', '创新意识']
const MATH_JUNIOR = ['抽象能力', '运算能力', '几何直观', '空间观念', '推理能力', '数据观念', '模型观念', '应用意识', '创新意识']
export function testLiteracy(input: Pick<DraftInput, 'lesson' | 'subjectNote'>) {
    if (input.lesson.subject_slug === 'math') return (input.lesson.grade || 0) >= 7 ? MATH_JUNIOR : MATH_PRIMARY
    return input.subjectNote?.core_literacy || []
}

export type TestQuestion = { no: string, quote: string, score: number, type: string, points: string[], literacy: string[], level: string, difficulty: string }
export type ReadTest = { questions: TestQuestion[], beyond: Array<{ no: string, quote: string, limit: string }>, total: number, dropped: number }
export type TestRow = { code: string | null, text: string, questions: string[], score: number, by_level: Record<string, string[]> }
export type TestTable = {
    // shares are of 分值, or of 题数 when the paper gives no scores
    unit: 'score' | 'count'
    weight_total: number
    literacy: string[]
    levels: string[]
    level_source: string | null
    rows: TestRow[]
    score: number
    by_level: Record<string, number>
    by_difficulty: Record<string, number>
    by_type: Record<string, number>
    by_literacy: Record<string, number>
}

const testInstructions = (levels: (typeof TEST_LEVELS)[string] | undefined) => `你是中小学教研员，帮老师分析一份试卷或一份作业，编多维细目表，并对照「依据」里的课标要点。
规则：
1. 按试卷原有的题号逐题整理；大题下有小题的按小题整理，题号写成「3(1)」。最多 40 题。只整理试卷里有的题，不补题、不改题。
2. quote：逐字抄录这道题题干开头的 8–30 个字，一个字也不改。
3. score：这道题的分值，试卷没写就填 0。type：题型（选择题、填空题、判断题、计算题、解答题、作图题、实验题、材料题、阅读题、写作、口语等）。
4. points：这道题考查的要点编码，只能从「依据」里选，最多 2 个。要点原文必须写到了这道题考的知识或技能本身；只是都属于「解决问题」「运用知识」这类通用能力不算对上（比如求长方体体积的题，不能对到「运用分数解决问题」）。对不上任何要点就留空数组，不要硬凑。
5. literacy：这道题主要考查的素养，只能从「素养维度」里选 1–2 个。
${levels ? `6. level：按下面的层次定义判断这道题要求学生达到的层次，只能填 ${levels.levels.map(item => `「${item}」`).join('')} 之一。${levels.defs}` : '6. level：填空字符串。'}
7. difficulty：按这个年级学生的一般水平估计，填「易」「中」「难」。
8. beyond：试题里超出依据要点写明的限定（「不包括……」「不要求……」等）的内容。no 填题号，quote 逐字抄录试题原文片段，limit 逐字抄录要点里的限定原文；没有就返回空数组。注意换了说法的情况，比如「0.3（3 循环）化成分数」就是循环小数化成分数。
9. total：试卷写明的总分，没写填 0。
必须只返回一个 JSON 对象：{"questions":[{"no":"1","quote":"…","score":2,"type":"选择题","points":["…"],"literacy":["…"],"level":"…","difficulty":"易"}],"beyond":[{"no":"5","quote":"…","limit":"…"}],"total":100}`

const squash = (text: string) => text.replace(/[\s（）()“”"'‘’、，,。；;：:．.！!？?—\-_［］[\]【】]/gu, '')

function validateTest(value: unknown, testText: string, codes: Set<string>, literacy: string[], levels: string[]): ReadTest | null {
    if (!value || typeof value !== 'object') return null
    const raw = value as Record<string, unknown>
    const text = squash(testText)
    let dropped = 0
    const questions: TestQuestion[] = []
    for (const item of (Array.isArray(raw.questions) ? raw.questions : []).slice(0, 40)) {
        const record = (item || {}) as Record<string, unknown>
        const quote = str(record.quote, 60)
        // a question the reader made up, or rewrote, is not in the teacher's text
        if (squash(quote).length < 4 || !text.includes(squash(quote))) { dropped += 1; continue }
        const score = Number(record.score)
        questions.push({
            no: str(record.no, 12) || String(questions.length + 1),
            quote,
            score: Number.isFinite(score) && score > 0 && score <= 100 ? Math.round(score * 2) / 2 : 0,
            type: str(record.type, 10),
            points: ids(record.points, codes).slice(0, 2),
            literacy: [...new Set(strList(record.literacy, 3, 12).filter(item => literacy.includes(item)))].slice(0, 2),
            level: levels.includes(str(record.level, 8)) ? str(record.level, 8) : '',
            difficulty: DIFFICULTY.includes(str(record.difficulty, 2)) ? str(record.difficulty, 2) : ''
        })
    }
    if (!questions.length) return null
    const beyond = (Array.isArray(raw.beyond) ? raw.beyond : []).slice(0, 8).map(item => {
        const record = (item || {}) as Record<string, unknown>
        return { no: str(record.no, 12), quote: str(record.quote, 120), limit: str(record.limit, 120) }
    }).filter(item => item.quote && item.limit)
    const total = Number(raw.total)
    return { questions, beyond, total: Number.isFinite(total) && total > 0 && total <= 300 ? Math.round(total) : 0, dropped }
}

export async function readTest(testText: string, input: DraftInput, options: StructuredLlmOptions = {}): Promise<DraftResult<ReadTest>> {
    const codes = new Set(input.indicators.map(item => item.code))
    const literacy = testLiteracy(input)
    const levels = TEST_LEVELS[input.lesson.subject_slug]
    const prompt = [lessonBlock(input), basisBlock(input), `素养维度：${literacy.join('、')}`, `老师的试卷：\n${testText}`].join('\n\n')
    const instructions = testInstructions(levels)
    const adapter: StructuredLlmAdapter<ReadTest> = {
        name: 'kebiao_test_read',
        schema: { type: 'object' },
        instructions,
        chatInstructions: instructions,
        maxCompletionTokens: 5000,
        validate: value => validateTest(value, testText, codes, literacy, levels?.levels || [])
    }
    const run = await runStructuredLlm(prompt, adapter, { ...options, timeoutMs: options.timeoutMs ?? DRAFT_TIMEOUT_MS })
    return { status: run.status, output: run.output, usage: run.usage, latency_ms: run.latency_ms, model: run.model }
}

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)
const listNos = (nos: string[]) => (nos.length > 6 ? `${nos.slice(0, 6).join('、')} 等 ${nos.length} 题` : nos.join('、'))

export function checkTest(read: ReadTest, testText: string, input: DraftInput): { table: TestTable, checks: PlanCheck[] } {
    const levelInfo = TEST_LEVELS[input.lesson.subject_slug]
    const levels = levelInfo?.levels || []
    const scored = read.questions.some(item => item.score > 0)
    const weight = (question: TestQuestion) => (scored ? question.score : 1)
    const tally = (pick: (question: TestQuestion) => string[]) => {
        const out: Record<string, number> = {}
        for (const question of read.questions) {
            const keys = pick(question)
            // a question on two 素养 counts half on each
            for (const key of keys) out[key] = (out[key] || 0) + weight(question) / keys.length
        }
        return out
    }
    const rowFor = (code: string | null, text: string, questions: TestQuestion[]): TestRow => ({
        code,
        text,
        questions: questions.map(item => item.no),
        // a question on two 要点 counts half its score on each
        score: questions.reduce((sum, item) => sum + weight(item) / Math.max(1, item.points.length), 0),
        by_level: Object.fromEntries(levels.map(level => [level, questions.filter(item => item.level === level).map(item => item.no)]))
    })
    const rows = input.indicators.map(item => rowFor(item.code, item.text, read.questions.filter(question => question.points.includes(item.code))))
    const unmatched = read.questions.filter(question => !question.points.length)
    if (unmatched.length) rows.push(rowFor(null, '没有对上所选要点', unmatched))
    const score = read.questions.reduce((sum, item) => sum + item.score, 0)
    const weightTotal = read.questions.reduce((sum, item) => sum + weight(item), 0)
    const table: TestTable = {
        unit: scored ? 'score' : 'count',
        weight_total: weightTotal,
        literacy: testLiteracy(input),
        levels,
        level_source: levelInfo?.source || null,
        rows,
        score,
        by_level: tally(question => (question.level ? [question.level] : [])),
        by_difficulty: tally(question => (question.difficulty ? [question.difficulty] : [])),
        by_type: tally(question => (question.type ? [question.type] : [])),
        by_literacy: tally(question => question.literacy)
    }

    const checks: PlanCheck[] = []
    // which question a position in the pasted text belongs to: the last question that starts before it
    const plain = testText
    const starts = read.questions.map(question => ({ no: question.no, at: plain.indexOf(question.quote) })).filter(item => item.at >= 0).sort((a, b) => a.at - b.at)
    const questionAt = (at: number) => [...starts].reverse().find(item => item.at <= at)?.no
    const seen = new Set<string>()
    const found: Array<{ source: string, nos: string[] }> = []
    const sources = [...input.indicators.map(item => item.text), ...input.standards.flatMap(item => [...item.requirements, ...item.guidance])]
    for (const limit of limitsOf(sources)) {
        if (seen.has(limit.key)) continue
        seen.add(limit.key)
        const hits = [...plain.matchAll(new RegExp(limit.key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'gu'))].map(match => match.index ?? 0)
            .filter(at => !/(不|除|未|无需|勿|免|非)[^，。；、,"]{0,6}$/u.test(plain.slice(Math.max(0, at - 8), at)))
        if (hits.length) {
            const nos = [...new Set(hits.map(questionAt).filter(Boolean))] as string[]
            found.push({ source: squash(limit.source), nos })
            checks.push({ level: 'risk', kind: 'beyond_standard', message: `${nos.length ? `第 ${listNos(nos)} 题` : '试卷里'}出现了「${limit.key}」，而课标写明${limit.phrase}，可能超标，请核对。`, quote: limit.source })
        }
    }
    const text = squash(testText)
    const limits = input.indicators.map(item => squash(item.text))
    for (const item of read.beyond) {
        if (!text.includes(squash(item.quote)) || !limits.some(source => source.includes(squash(item.limit)))) continue
        // the program already flagged this limit in this question by its words
        if (found.some(entry => entry.source.includes(squash(item.limit)) && (!item.no || entry.nos.includes(item.no)))) continue
        checks.push({ level: 'risk', kind: 'beyond_standard', message: `${item.no ? `第 ${item.no} 题` : '试卷里'}「${item.quote}」超出了课标的限定：${item.limit}。`, quote: item.limit })
    }
    if (unmatched.length) checks.push({ level: 'warn', kind: 'no_point', message: `第 ${listNos(unmatched.map(item => item.no))} 题没有对上所选要点：可能考的是本单元以外的内容，也可能超出了所选要点，请核对；如果是漏选了要点，回到第 2 步补勾。` })
    const untested = rows.filter(row => row.code && !row.questions.length)
    for (const row of untested) checks.push({ level: 'warn', kind: 'untested_point', message: `要点 ${row.code} 没有题目考到。`, code: row.code || undefined, quote: row.text })
    if (read.total && score && Math.abs(read.total - score) > 0.5) checks.push({ level: 'warn', kind: 'score_total', message: `各题分值合计 ${score} 分，和试卷写的总分 ${read.total} 分不一致（可能有题没标分值，或没读到）。` })
    if (!score) checks.push({ level: 'warn', kind: 'score_total', message: '试卷没有标分值，细目表按题数统计。' })
    const weigh = (part: Record<string, number>, key: string) => percent(part[key] || 0, weightTotal)
    if (levels.length && weigh(table.by_level, levels[0]) > 60) checks.push({ level: 'warn', kind: 'level_low', message: `「${levels[0]}」层次的题占 ${weigh(table.by_level, levels[0])}%，${levels.slice(-2).join('、')}层次的题偏少。` })
    for (const key of DIFFICULTY) {
        if (weigh(table.by_difficulty, key) > 80) checks.push({ level: 'warn', kind: 'difficulty', message: `「${key}」题占 ${weigh(table.by_difficulty, key)}%，难度结构偏单一（物理课标：容易题、中档题、难题的比例设置合理）。` })
    }
    if (read.dropped) checks.push({ level: 'warn', kind: 'reader_dropped', message: `有 ${read.dropped} 道题 AI 抄录的题干和原文对不上，没有计入细目表。` })
    if (!checks.length) checks.push({ level: 'ok', kind: 'aligned', message: '每道题都对上了所选要点，每条要点都有题目考到，没有发现超出课标限定的内容。' })
    return { table, checks }
}
