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
    // how the 难点 are broken down in class (突破难点的办法)
    strategies?: string[]
    learner_analysis: string
    prior_knowledge: string[]
    misconceptions: Array<{ text: string, response: string }>
    keywords: Array<{ term: string, definition: string }>
    assessments: Assessment[]
}
// a key question with the answers the teacher expects (typical wrong ones too) and the follow-up
export type KeyQuestion = { q: string, expect: string, follow: string }
export type Stage = {
    name: string
    minutes: number
    // 组织形式: 全班 / 同桌 / 四人小组 / 独立, or 「独立→同桌」 for one after the other
    org?: string
    teacher: string
    students: string
    questions?: KeyQuestion[]
    // how the teacher sees the whole class's thinking within a minute (手势表决、同桌互查、巡视抽看…)
    check?: string
    // what the slower and the faster students get
    support?: string
    purpose: string
    objective_ids: string[]
    assessment_ids: string[]
}
export type Process = {
    stages: Stage[]
    homework: Array<{ level: string, task: string, minutes?: number }>
    board: string[]
    materials: string[]
    safety: string[]
}
// 当堂练习与检测: items a teacher can project or print, each with its answer and the 要点 it practises
export type PracticeItem = { kind: '练习' | '检测', level: string, question: string, answer: string, code: string, objective_id: string }
export type Practice = { items: PracticeItem[] }
// 课标解读: the 要点 read for the teacher, so the lesson teaches the 课标 with the textbook rather than the textbook alone
export type PointReading = { code: string, plain: string, verbs: Array<{ word: string, meaning: string }>, this_lesson: string, textbook: string, avoid: string }
export type Reading = { points: PointReading[], position: string, literacy: Array<{ name: string, look_for: string }> }
// what comes before and after a 要点 (kebiao 知识图谱) and where this book teaches it (教材与课标对应)
export type PointLink = { code: string, text: string, grade: string, reason: string }
export type PointLinks = { code: string, before: PointLink[], after: PointLink[], in_book: Array<{ unit: string, lesson: string, page: number | null, current?: boolean }>, books: number }
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
    // the class as it is: about 45 students in rows unless the teacher says otherwise
    classSize?: number
    // 新授课 / 复习课 / 练习课 / 实验课 / 讲评课; '' lets the model judge from the lesson
    lessonType?: string
    links?: PointLinks[]
    // this lesson's own words from the textbook (教材与课标对应 quotes), for 课标解读 and the plan
    lessonQuotes?: string[]
    // the unit's lessons in textbook order, this one marked: what the later lessons teach stays out of this one
    unitLessons?: Array<{ title: string, current?: boolean }>
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

// a big class in practice: how long students think and do themselves, how often they go into groups, whether the
// teacher sees the whole class, and homework within 「双减」
export function classroomChecks(process: Process, periodMinutes: number, grade: number | null | undefined): PlanCheck[] {
    const checks: PlanCheck[] = []
    const withOrg = process.stages.filter(stage => stage.org)
    if (withOrg.length >= Math.ceil(process.stages.length / 2)) {
        const active = process.stages.filter(stage => /独立|同桌|四人小组/u.test(stage.org || '')).reduce((sum, stage) => sum + stage.minutes, 0)
        if (periodMinutes && active / periodMinutes < 0.3) checks.push({ level: 'warn', kind: 'student_time', message: `学生独立思考、同桌交流和练习的时间约 ${active} 分钟，不到一节课的三成；可以在讲解前加一次「先试」，或把一段讲解换成练习和反馈。` })
        const groups = process.stages.filter(stage => /四人小组/u.test(stage.org || ''))
        if (groups.length > 2) checks.push({ level: 'warn', kind: 'group_work', message: `一节课安排了 ${groups.length} 次小组活动，四十多人的班组织起来很费时间，建议保留最关键的一两次，其余改为同桌交流。` })
        const long = groups.find(stage => stage.minutes > 8)
        if (long) checks.push({ level: 'warn', kind: 'group_work', message: `「${long.name}」的小组活动有 ${long.minutes} 分钟；大班的小组活动超过 8 分钟容易散，建议分成两步、中间收一次。` })
        const unseen = process.stages.filter(stage => /独立|同桌|四人小组/u.test(stage.org || '') && !stage.check).map(stage => stage.name)
        if (unseen.length) checks.push({ level: 'warn', kind: 'class_check', message: `「${unseen.join('」「')}」让学生自己做，但没写老师怎样看到全班的情况（手势表决、同桌互查、巡视抽看……）。` })
    }
    // 「双减」 limits written homework: oral and hands-on work, and the optional 提高 items, are not counted
    const written = process.homework.filter(item => item.level !== '实践' && /写|做|完成|练习|抄|算|填/u.test(item.task) && !/口头|说给|读给|讲给|听/u.test(item.task))
    const minutes = written.filter(item => !/提高|选做|拓展|挑战/u.test(item.level)).reduce((sum, item) => sum + (item.minutes || 0), 0)
    if (grade && grade <= 2 && written.length) checks.push({ level: 'warn', kind: 'homework_load', message: '按「双减」要求，一、二年级不布置家庭书面作业；可以改成口头、阅读或实践类作业。', quote: written[0].task })
    else if (grade && grade <= 6 && minutes > 20) checks.push({ level: 'warn', kind: 'homework_load', message: `必做的书面作业预计 ${minutes} 分钟；小学三至六年级每天书面作业合计不超过 60 分钟，一科一般控制在 15 分钟左右。` })
    else if (grade && grade >= 7 && minutes > 30) checks.push({ level: 'warn', kind: 'homework_load', message: `必做的书面作业预计 ${minutes} 分钟；初中每天书面作业合计不超过 90 分钟，一科一般控制在 20–25 分钟。` })
    return checks
}

// 当堂练习: every 要点 the objectives use has an item, and the last items check whether the objectives were reached
export function checkPractice(practice: Practice, frame: Frame): PlanCheck[] {
    const checks: PlanCheck[] = []
    const cited = [...new Set(frame.objectives.flatMap(item => item.basis))]
    const practised = new Set(practice.items.map(item => item.code).filter(Boolean))
    const missing = cited.filter(code => !practised.has(code))
    if (missing.length) checks.push({ level: 'warn', kind: 'practice_gap', message: `要点 ${missing.join('、')} 没有对应的练习或检测题，课上看不到学生是否学会。` })
    if (!practice.items.some(item => item.kind === '检测')) checks.push({ level: 'warn', kind: 'practice_gap', message: '没有当堂检测题；建议留 3–5 分钟做两三道检测题，判断目标是否达成。' })
    return checks
}

// the unit's lessons after this one whose titles are specific enough to spot in an objective (「通分」, not 「练习」)
function laterLessons(unitLessons: DraftInput['unitLessons']) {
    const list = unitLessons || []
    const at = list.findIndex(item => item.current)
    if (at < 0) return []
    return list.slice(at + 1).map(item => item.title).filter(title => title.length >= 2 && title.length <= 8 && !list[at].title.includes(title) && !/…|整理|复习|练习|园地|口语交际|习作|Unit|Section/u.test(title))
}

export function checkPlan(frame: Frame, process: Process | null, input: Pick<DraftInput, 'indicators' | 'standards' | 'periodMinutes' | 'unitLessons'> & { lesson?: Pick<PlanLesson, 'grade'> }, options: CheckOptions = {}): PlanCheck[] {
    const checks: PlanCheck[] = []
    const picked = new Set(input.indicators.map(item => item.code))
    const cited = new Set(frame.objectives.flatMap(item => item.basis))
    const later = laterLessons(input.unitLessons)
    for (const objective of frame.objectives) {
        if (!objective.basis.length) checks.push({ level: 'risk', kind: 'no_basis', message: `目标 ${objective.id} 没有对应的课标要点。`, quote: objective.text })
        const ahead = later.find(title => objective.text.includes(title))
        if (ahead) checks.push({ level: 'warn', kind: 'later_lesson', message: `目标 ${objective.id} 写到了「${ahead}」，本单元后面有「${ahead}」一课专门教它；本课可以只做铺垫，或把这条目标留到那一课。`, quote: objective.text })
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
        checks.push(...classroomChecks(process, input.periodMinutes, input.lesson?.grade))
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
    // classroom advice (time, groups, homework, a later lesson's content) does not undo the alignment verdict
    if (!checks.some(item => item.level !== 'ok' && !CLASSROOM_KINDS.has(item.kind))) checks.push({ level: 'ok', kind: 'aligned', message: '每条目标都有课标要点依据、教学环节和评价任务，没有发现超出课标限定的内容。' })
    return checks
}
const CLASSROOM_KINDS = new Set(['student_time', 'group_work', 'class_check', 'homework_load', 'practice_gap', 'later_lesson'])

// ---------- prompts ----------
const SHARED_RULES = `规则：
1. 只能以「依据」里列出的课标要点为依据。目标的 basis 只能填这些要点编码，不得编造编码，也不得引用依据以外的课标。
2. 要点原文里写明「不包括」「不要求」「不涉及」的内容，教案里不得出现。
3. 内容要符合老师给出的教材和年级，不要超出这个年级学生的认知水平，也不要提前教后面学段的内容。要点往往覆盖整个单元，只写和本课课题直接相关的部分；本单元其他课要教的内容（见「本单元的课」）不写进本课的目标、环节和练习，后面的课最多一句铺垫。
4. 活动要在普通教室条件下可行；器材写常见的；涉及实验、工具、运动的写安全要求。
5. 用简洁的中文，面向教师；不要写空话套话（如「全面提升核心素养」）。
6. 不写任何学生的姓名或个人信息。`

const FRAME_INSTRUCTIONS = `你是经验丰富的中小学教研员，帮老师起草一节课的教学设计（前半部分）。按「逆向设计」的顺序：先定目标，再定评价证据。按「课堂实际」设计，给常规大班用，不要理想化。
${SHARED_RULES}
写法要求：
- title：课题名称，可加「（第 1 课时）」，不要写「教学设计」等字样。
- objectives：2–4 条。每条以「学生能」开头、不超过 70 字，写清条件（在什么情境中）、行为（做什么、怎么做）和程度（做到什么程度），用看得见的动词（说出、比较、解释、设计、完成、运用、判断……），不用「了解」「感受」「培养」这类看不见的词。程度要和要点里的行为词相当（要点写「理解」就不要只写「说出」）。kind 填「知道」「理解」或「能做」。basis 填它依据的要点编码（至少 1 个）。
- core_understanding：一句话写出学完这节课学生应形成的核心理解（大概念层面的认识），不要只写知识点名称。
- key_points、difficult_points：各 1–2 条，具体到本课内容。
- strategies：1–2 条，突破难点的具体办法（用什么例子、什么活动、什么对比）。
- learner_analysis：不超过 150 字，按大班实际写：多数学生的起点（参考「前后联系」里先学的要点）、容易卡在哪里、学得快和学得慢的学生各需要什么；结合老师给的学情。
- prior_knowledge：1–4 条，学生学本课前应已掌握的知识或技能。
- misconceptions：1–3 条，学生对本课内容常见的错误理解（text）和课上的应对（response）。
- keywords：0–5 个本课关键词及适合学生的解释。
- assessments：1–4 个评价任务，每条目标至少被一个任务覆盖，45 人左右的班能在课上完成和收集（如当堂检测、同桌互查、作品展示、口头说理抽查）。task 写学生要完成的任务，evidence 写可以看到或收集到的证据，criteria 写达成标准（可分「达到」「较好」两级）。
必须只返回一个 JSON 对象：{"title":"…","core_understanding":"…","objectives":[{"id":"O1","text":"…","basis":["…"],"kind":"…"}],"key_points":["…"],"difficult_points":["…"],"strategies":["…"],"learner_analysis":"…","prior_knowledge":["…"],"misconceptions":[{"text":"…","response":"…"}],"keywords":[{"term":"…","definition":"…"}],"assessments":[{"id":"A1","objective_ids":["O1"],"task":"…","evidence":"…","criteria":"…"}]}`

const PROCESS_INSTRUCTIONS = `你是经验丰富的中小学教研员。老师已经定好了这节课的目标和评价任务（见「已定的目标与评价」），请写教学过程和作业。按「课堂实际」设计，给常规大班用，不要理想化。
${SHARED_RULES}
写法要求：
- stages：4–7 个环节，按上课顺序，每个环节至少 2 分钟，所有环节分钟数合计必须等于一节课的时长。常见顺序（按课型和学科调整）：回顾检测（用前置知识出 2–3 个小问题）→ 情境与问题 → 先试（独立想、同桌说）→ 讲解与示范（从学生的想法讲起，配例题、范例或示范）→ 练习与反馈（从基础到变式）→ 当堂检测 → 小结。
- 每个环节写：name（环节名）；minutes（分钟，整数）；org（组织形式：全班、同桌、四人小组、独立，先后两种写成「独立→同桌」）；teacher（教师活动：具体到讲什么、示范什么、出示什么，不超过 150 字）；students（学生活动：做什么、产出什么，不超过 100 字）；questions（0–2 个关键问题：q 问题，expect 预设的学生回答（含典型错误），follow 追问或点拨）；check（老师怎样在 1 分钟内看到全班学会没有：手势或卡片表决、同桌互查、巡视抽看、随机点名、板演等；纯讲授的环节留空）；support（照顾差异：给学得慢、学得快的学生的安排；没有就留空）；purpose（设计意图，一句话）；objective_ids（推进哪些目标，不能留空）；assessment_ids（完成哪些评价任务，可为空）。
- 每条目标至少在一个环节里推进；每个评价任务都要安排在某个环节。
- 学生独立思考、同桌交流、练习、检测的环节合计约占一节课时间的 40%；小组活动最多 2 次，每次不超过 6 分钟；有小组活动的环节（如「独立→四人小组」）整个环节不超过 8 分钟。
- homework：1–3 条，level 填「基础」（必做）、「提高」（选做）或「实践」，minutes 写预计用时（分钟）。符合「双减」：一、二年级不布置书面作业（可布置口头、实践类）；必做的书面作业，三至六年级本学科一般不超过 15 分钟，初中一般不超过 25 分钟；不布置机械重复的作业。
- board：板书设计，3–8 行，体现本课结构（知识框架、关键结论、例题要点）。
- materials：教具、学具或材料，0–6 条，写普通学校有的。
- safety：涉及实验、工具、运动或外出时写安全提示，0–3 条；没有就返回空数组。
必须只返回一个 JSON 对象：{"stages":[{"name":"…","minutes":5,"org":"全班","teacher":"…","students":"…","questions":[{"q":"…","expect":"…","follow":"…"}],"check":"…","support":"…","purpose":"…","objective_ids":["O1"],"assessment_ids":[]}],"homework":[{"level":"基础","task":"…","minutes":10}],"board":["…"],"materials":["…"],"safety":[]}`

const PRACTICE_INSTRUCTIONS = `你是经验丰富的中小学教研员。老师已经定好了这节课的目标和评价任务（见「已定的目标与评价」），请写课上用的练习题和当堂检测题，老师可以直接投影或印发。
${SHARED_RULES}
写法要求：
- items：4–7 道，按课上使用的顺序。kind 填「练习」或「检测」；最后 2–3 道是「检测」，3–5 分钟能做完，用来判断目标有没有达成。
- level 填「基础」「变式」或「提高」：练习从基础到变式（换情境、换数据、换问法，抓住不变的本质），至少 1 道「提高」给学得快的学生。
- question：题目本身，完整、可以直接用；选择题写出选项，需要图的用文字说清图。体育、艺术、实验等以技能为主的课，写成课上的练习任务和检测办法（看什么、怎样算达到）。
- 题目是学生在座位上独立完成的纸笔题或口答题，不写成小组活动；涉及实验的题只用教材里的、结论确定的实验。
- answer：参考答案；开放题写评分要点。答案必须正确，计算要算对。
- code：这道题练的要点编码，只能填「依据」里的编码；objective_id：对应的目标编号（O1、O2……）。
- 题目贴合本课教材内容（可参考「本课教材原话」）和学生年级，不出超出课标的题。
必须只返回一个 JSON 对象：{"items":[{"kind":"练习","level":"基础","question":"…","answer":"…","code":"…","objective_id":"O1"}]}`

const READING_INSTRUCTIONS = `你是熟悉课程标准的中小学教研员。帮老师读懂这节课依据的课标要点：让老师用教材去教课标要求的东西，而不是只把教材内容讲一遍。「依据」里有要点原文、所在标准、学业要求和教学提示；「前后联系」是学生之前学过的、后面会用到的要点；「本单元的课」「教材里在哪教」和「本课教材原话」来自教材。
规则：
1. 只解读「依据」里列出的要点，不编造课标内容；引用课标时照抄原文。
2. 具体到本课，面向老师，用朴素的话；不写空话套话（如「全面提升核心素养」）。
3. 不写任何学生的姓名或个人信息。
写法要求：
- points：「依据」里的每条要点一项，按依据的顺序。
  - code：要点编码。
  - plain：用老师听得懂的话说清这条要点要学生最终做到什么（不超过 60 字）。
  - verbs：1–3 个从要点原文里摘出的关键行为词（word 必须是原文里出现的词，2–6 个字，如「理解」「探索」「运用」「说明」），meaning 写它在这里要求做到什么程度、怎样算做到（不超过 40 字）。
  - this_lesson：本课承担这条要点的哪一部分、做到什么程度，哪些留给本单元后面的课或后面的学段（参考「本单元的课」，不超过 80 字）。
  - textbook：用教材教：本课教材的例子、活动、习题怎样为这条要点服务；哪些可以换成学生熟悉的情境，哪些需要补充（不超过 100 字）。
  - avoid：只按教材讲容易出的偏差：漏掉的（比如只练算法不讲道理、只记结论不经历过程）或超出的（课标「不包括」的、后面学段才要求的）（不超过 80 字）。
- position：这节课在单元和学段里的位置：前面学过什么，这节课为后面哪些内容打基础（不超过 100 字，参考「前后联系」）。
- literacy：1–3 项，name 只能从「素养名称」里选，look_for 写这节课上看得见的学生表现（不超过 50 字）。
必须只返回一个 JSON 对象：{"points":[{"code":"…","plain":"…","verbs":[{"word":"…","meaning":"…"}],"this_lesson":"…","textbook":"…","avoid":"…"}],"position":"…","literacy":[{"name":"…","look_for":"…"}]}`

// the 素养 a 课标解读 may name: 数学 by its 主要表现 at the grade (运算能力、推理意识…), other subjects by their 核心素养
const literacyNames = (input: Pick<DraftInput, 'lesson' | 'subjectNote'>) => [...new Set([...testLiteracy(input), ...(input.subjectNote?.core_literacy || [])])]

// ---------- the class as it is ----------
// A class of about 45 in rows, one teacher, a fixed period and a syllabus to keep up with. The plan stays explicit
// teaching at heart and leans a little towards construction: students try and talk before the teacher explains,
// practise after, and the teacher checks the whole class rather than the raised hands.
export const DEFAULT_CLASS_SIZE = 45
export const LESSON_TYPES = ['新授课', '复习课', '练习课', '实验课', '讲评课'] as const

const SUBJECT_MOVES: Record<string, string> = {
    math: '数学：先让学生尝试再讲例题；练习按「基础—变式—提高」，抓住变化中不变的本质；重视说理和书写规范。',
    chinese: '语文：以读为本，读—思—议—写结合；问题和任务从文本里来，少串讲，多让学生朗读、批注、表达；落实学习任务群的要求。',
    english: '英语：在情境中呈现语言，示范后同桌操练，再在小任务里运用；每节课学生都要有听说读写的输出。',
    science: '科学：先预测、再观察（演示或分组实验）、再解释，讲证据和推理；器材不够时用演示实验加学生记录；写清安全要求。',
    physics: '物理：从现象和实验出发，先预测再观察再解释，讲证据和推理；器材不够时用演示实验加学生记录；写清安全要求。',
    chemistry: '化学：从现象和实验出发，先预测再观察再解释，写规范的化学用语；器材不够时用演示实验加学生记录；写清安全要求。',
    biology: '生物学：从观察和实验出发，讲证据和推理，联系生活和健康；器材不够时用演示、图片、视频加学生记录；写清安全要求。',
    morality_law: '道德与法治：用真实的生活情境和材料提出问题链，让学生依据材料表达观点、辨析对错，落到行为上；不要只讲道理。',
    history: '历史：用史料和时间轴，引导学生依据史料说明和解释；问题链从史实到原因、影响；注意时空定位。',
    geography: '地理：以读图为抓手，从图上获取信息再推理；联系区域实例和生活；问题链从「在哪里」到「为什么」。',
    pe: '体育与健康：按准备部分—基本部分—结束部分；写清练习密度、运动负荷、队形和器材分配，四十多人一块场地要分组轮换；写清安全要求。',
    arts: '艺术：欣赏—示范—实践—展评；教师示范要具体到步骤；作品展评用同桌或小组互评加教师点评。',
    labor: '劳动：任务驱动，教师分步示范，学生跟做再独立完成；写清工具使用和安全要求。',
    it: '信息科技：任务驱动，教师分步演示，学生跟做再独立完成；考虑一人一机或两人一机，写清操作要求。'
}

export const v2SubjectSlug = (slug: string) => (['art', 'music'].includes(slug) ? 'arts' : slug)

function classroomBlock(input: DraftInput) {
    const size = input.classSize || DEFAULT_CLASS_SIZE
    const lines = [
        '课堂实际（照这个设计，不要理想化）：',
        `- 常规大班：约 ${size} 名学生，按排就座，一位老师，每课时 ${input.periodMinutes} 分钟，要完成教材进度。普通教室有投影，实验器材和分组材料有限。`,
        '- 范式：以教师讲解和示范为主线，往建构的方向偏一点——讲之前先让学生想一想、试一试（独立 1–3 分钟，再同桌交流），老师巡视收集典型想法，讲解从学生的想法讲起；讲之后有练习和反馈。',
        '- 大班做得到的合作：同桌交流（1–3 分钟）；前后桌四人小组（3–6 分钟，写清分工和要交的成果），一节课最多 2 次。不设计搬桌椅、长时间小组探究、每组轮流上台汇报的环节。',
        '- 小步讲解：每讲一步就用一个问题或一道小题检查；新内容先给示例（例题、范文、示范动作），再让学生做变式。',
        '- 看见全班：让学生思考或练习的地方，写清老师怎样在 1 分钟内看到全班的情况，不要只靠举手。',
        '- 照顾差异：给学得慢的学生支架（提示、半成品、例题对照），给学得快的学生挑战题。'
    ]
    const moves = SUBJECT_MOVES[v2SubjectSlug(input.lesson.subject_slug)]
    if (moves) lines.push(`- ${moves}`)
    if (input.lessonType) lines.push(`- 课型：${input.lessonType}。`)
    return lines.join('\n')
}

function linksBlock(input: DraftInput) {
    const out: string[] = []
    for (const link of input.links || []) {
        const before = link.before.map(item => `${item.code}（${item.grade}）${item.text.slice(0, 40)}${item.reason ? `——${item.reason}` : ''}`)
        const after = link.after.map(item => `${item.code}（${item.grade}）${item.text.slice(0, 40)}${item.reason ? `——${item.reason}` : ''}`)
        if (before.length || after.length) out.push(`${link.code}　先学：${before.join('；') || '（无）'}　后学：${after.join('；') || '（无）'}`)
    }
    return out.length ? ['前后联系（kebiao 知识图谱：先学 = 学这条要点前要会的，后学 = 后面会用到它的）：', ...out].join('\n') : ''
}

function bookBlock(input: DraftInput) {
    const out: string[] = []
    for (const link of input.links || []) {
        if (link.in_book.length) out.push(`${link.code}：${link.in_book.map(item => `${item.unit ? `${item.unit} · ` : ''}${item.lesson}${item.current ? '（本课）' : ''}${item.page ? `（PDF 第 ${item.page} 页）` : ''}`).join('；')}`)
    }
    const lines = out.length ? ['教材里在哪教（本册里教这些要点的课）：', ...out] : []
    if (input.lessonQuotes?.length) lines.push(`本课教材原话：${input.lessonQuotes.map(quote => `「${quote}」`).join(' ')}`)
    return lines.join('\n')
}

function lessonBlock(input: DraftInput) {
    const { lesson } = input
    const lines = [
        `学科：${lesson.subject}${lesson.grade ? `　年级：${lesson.grade} 年级` : ''}`,
        `课题：${lesson.title}${lesson.unit_title && lesson.unit_title !== lesson.title ? `（所在单元：${lesson.unit_title}）` : ''}`,
        input.unitLessons?.length ? `本单元的课（教材顺序）：${input.unitLessons.map(item => (item.current ? `「${item.title}」（本课）` : item.title)).join(' → ')}` : '',
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
// 组织形式 as the model writes it (「个人→两人」, 「小组合作」) in the four forms a class of 45 uses
const ORG_FORMS: Array<[RegExp, string]> = [[/全班|集体|师生/u, '全班'], [/同桌|两人|二人|结对/u, '同桌'], [/小组|四人|前后桌/u, '四人小组'], [/独立|个人|自主|单独/u, '独立']]
export function orgOf(value: unknown) {
    const forms: string[] = []
    for (const part of String(value ?? '').split(/→|->|—>|、|，|,|\/|＋|\+|然后|再/u)) {
        const form = ORG_FORMS.find(([pattern]) => pattern.test(part))?.[1]
        if (form && forms.at(-1) !== form) forms.push(form)
    }
    return forms.slice(0, 3).join('→')
}

function validateReading(value: unknown, input: Pick<DraftInput, 'indicators' | 'subjectNote' | 'lesson'>): Reading | null {
    if (!value || typeof value !== 'object') return null
    const raw = value as Record<string, unknown>
    const textOf = new Map(input.indicators.map(item => [item.code, item.text]))
    const points: PointReading[] = []
    for (const item of (Array.isArray(raw.points) ? raw.points : []).slice(0, 12)) {
        const record = (item || {}) as Record<string, unknown>
        const code = str(record.code, 24)
        const text = textOf.get(code)
        if (!text || points.some(point => point.code === code)) continue
        // a key verb must be the 要点's own word, not one the model brought, and a word rather than half a clause
        const verbs = (Array.isArray(record.verbs) ? record.verbs : []).slice(0, 3).map(entry => ({ word: str((entry as Record<string, unknown>)?.word, 40), meaning: str((entry as Record<string, unknown>)?.meaning, 100) })).filter(entry => entry.word && entry.word.length <= 8 && entry.meaning && text.includes(entry.word))
        const point = { code, plain: str(record.plain, 140), verbs, this_lesson: str(record.this_lesson, 180), textbook: str(record.textbook, 220), avoid: str(record.avoid, 180) }
        if (point.plain || point.this_lesson || point.textbook) points.push(point)
    }
    if (!points.length) return null
    const allowed = new Set(literacyNames(input))
    const literacy = (Array.isArray(raw.literacy) ? raw.literacy : []).slice(0, 3).map(entry => ({ name: str((entry as Record<string, unknown>)?.name, 20), look_for: str((entry as Record<string, unknown>)?.look_for, 120) })).filter(entry => entry.name && entry.look_for && (!allowed.size || allowed.has(entry.name)))
    return { points, position: str(raw.position, 220), literacy }
}

function validatePractice(value: unknown, frame: Frame, codes: Set<string>): Practice | null {
    if (!value || typeof value !== 'object') return null
    const raw = value as Record<string, unknown>
    const objectiveIds = new Set(frame.objectives.map(item => item.id))
    const items: PracticeItem[] = (Array.isArray(raw.items) ? raw.items : []).slice(0, 8).map(item => {
        const record = (item || {}) as Record<string, unknown>
        const objective = str(record.objective_id, 8)
        return {
            kind: (str(record.kind, 4) === '检测' ? '检测' : '练习') as PracticeItem['kind'],
            level: ['基础', '变式', '提高'].find(level => str(record.level, 6).includes(level)) || '基础',
            question: str(record.question, 500),
            answer: str(record.answer, 400),
            code: codes.has(str(record.code, 24)) ? str(record.code, 24) : '',
            objective_id: objectiveIds.has(objective) ? objective : ''
        }
    }).filter(item => item.question && item.answer)
    return items.length ? { items } : null
}

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
        // the heading of the 教案 and its file name: 「《观潮》第一课时教学设计（前半部分）」 → 「《观潮》第一课时」
        title: str(raw.title, 80).replace(/[（(]前半部分[）)]|教学设计/gu, '').trim().slice(0, 60),
        core_understanding: str(raw.core_understanding, 160),
        objectives,
        key_points: strList(raw.key_points, 3),
        difficult_points: strList(raw.difficult_points, 3),
        strategies: strList(raw.strategies, 3, 200),
        learner_analysis: str(raw.learner_analysis, 300),
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
        const questions = (Array.isArray(record.questions) ? record.questions : []).slice(0, 3).map(entry => {
            const question = (entry || {}) as Record<string, unknown>
            return { q: str(question.q, 160), expect: str(question.expect, 200), follow: str(question.follow, 160) }
        }).filter(entry => entry.q)
        return {
            name: str(record.name, 24),
            minutes: Number.isFinite(minutes) && minutes > 0 && minutes < 90 ? minutes : 0,
            org: orgOf(record.org),
            teacher: str(record.teacher, 420),
            students: str(record.students, 420),
            questions,
            check: str(record.check, 160),
            support: str(record.support, 200),
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
        homework: (Array.isArray(raw.homework) ? raw.homework : []).slice(0, 3).map(item => {
            const record = (item || {}) as Record<string, unknown>
            const minutes = Math.round(Number(record.minutes))
            return { level: str(record.level, 6) || '基础', task: str(record.task, 240), ...(Number.isFinite(minutes) && minutes > 0 && minutes <= 120 ? { minutes } : {}) }
        }).filter(item => item.task),
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
    maxCompletionTokens: 3500,
    validate: value => validateFrame(value, codes)
})

const processAdapter = (frame: Frame): StructuredLlmAdapter<Process> => ({
    name: 'kebiao_lesson_process',
    schema: { type: 'object' },
    instructions: PROCESS_INSTRUCTIONS,
    chatInstructions: PROCESS_INSTRUCTIONS,
    // stages now carry key questions, the whole-class check and support: room enough that the JSON is never cut off
    maxCompletionTokens: 6000,
    validate: value => validateProcess(value, frame)
})

const readingAdapter = (input: DraftInput): StructuredLlmAdapter<Reading> => ({
    name: 'kebiao_lesson_reading',
    schema: { type: 'object' },
    instructions: READING_INSTRUCTIONS,
    chatInstructions: READING_INSTRUCTIONS,
    maxCompletionTokens: 3500,
    validate: value => validateReading(value, input)
})

const practiceAdapter = (frame: Frame, codes: Set<string>): StructuredLlmAdapter<Practice> => ({
    name: 'kebiao_lesson_practice',
    schema: { type: 'object' },
    instructions: PRACTICE_INSTRUCTIONS,
    chatInstructions: PRACTICE_INSTRUCTIONS,
    maxCompletionTokens: 3500,
    validate: value => validatePractice(value, frame, codes)
})

export type DraftResult<T> = { status: LlmStatus, output: T | null, usage: LlmUsage | null, latency_ms: number, model: string | null }

const DRAFT_TIMEOUT_MS = 45000

export async function draftFrame(input: DraftInput, options: StructuredLlmOptions = {}): Promise<DraftResult<Frame>> {
    const codes = new Set(input.indicators.map(item => item.code))
    const prompt = [lessonBlock(input), basisBlock(input), linksBlock(input), classroomBlock(input), teacherBlock(input)].filter(Boolean).join('\n\n')
    const run = await runStructuredLlm(prompt, frameAdapter(codes), { ...options, timeoutMs: options.timeoutMs ?? DRAFT_TIMEOUT_MS })
    return { status: run.status, output: run.output, usage: run.usage, latency_ms: run.latency_ms, model: run.model }
}

function frameBlock(frame: Frame) {
    return [
        '已定的目标与评价：',
        frame.core_understanding ? `核心理解：${frame.core_understanding}` : '',
        ...frame.objectives.map(item => `${item.id}（${item.kind}，依据 ${item.basis.join('、')}）：${item.text}`),
        `重点：${frame.key_points.join('；')}　难点：${frame.difficult_points.join('；')}`,
        frame.strategies?.length ? `突破难点：${frame.strategies.join('；')}` : '',
        ...frame.assessments.map(item => `${item.id}（评价 ${item.objective_ids.join('、')}）：${item.task}；证据：${item.evidence}`),
        frame.misconceptions.length ? `常见误解：${frame.misconceptions.map(item => item.text).join('；')}` : ''
    ].filter(Boolean).join('\n')
}

export async function draftProcess(input: DraftInput, frame: Frame, options: StructuredLlmOptions = {}): Promise<DraftResult<Process>> {
    const prompt = [lessonBlock(input), basisBlock(input), frameBlock(frame), classroomBlock(input), bookBlock(input), teacherBlock(input)].filter(Boolean).join('\n\n')
    const run = await runStructuredLlm(prompt, processAdapter(frame), { ...options, timeoutMs: options.timeoutMs ?? DRAFT_TIMEOUT_MS })
    if (run.output) fitMinutes(run.output.stages, input.periodMinutes)
    return { status: run.status, output: run.output, usage: run.usage, latency_ms: run.latency_ms, model: run.model }
}

// 课标解读, asked at the same time as the frame: it needs only the 要点, their links and the textbook
export async function draftReading(input: DraftInput, options: StructuredLlmOptions = {}): Promise<DraftResult<Reading>> {
    const names = literacyNames(input)
    const prompt = [lessonBlock(input), basisBlock(input), linksBlock(input), bookBlock(input), names.length ? `素养名称：${names.join('、')}` : '', teacherBlock(input)].filter(Boolean).join('\n\n')
    const run = await runStructuredLlm(prompt, readingAdapter(input), { ...options, timeoutMs: options.timeoutMs ?? DRAFT_TIMEOUT_MS })
    return { status: run.status, output: run.output, usage: run.usage, latency_ms: run.latency_ms, model: run.model }
}

// 当堂练习与检测, asked at the same time as the process: it needs the objectives
export async function draftPractice(input: DraftInput, frame: Frame, options: StructuredLlmOptions = {}): Promise<DraftResult<Practice>> {
    const codes = new Set(input.indicators.map(item => item.code))
    const prompt = [lessonBlock(input), basisBlock(input), frameBlock(frame), bookBlock(input), teacherBlock(input)].filter(Boolean).join('\n\n')
    const run = await runStructuredLlm(prompt, practiceAdapter(frame, codes), { ...options, timeoutMs: options.timeoutMs ?? DRAFT_TIMEOUT_MS })
    return { status: run.status, output: run.output, usage: run.usage, latency_ms: run.latency_ms, model: run.model }
}

// The model's stages sometimes add up to 45 of 40 minutes. A gap of up to ten minutes is taken from (or given to) the
// longest stage, keeping every stage at two minutes or more; a larger gap is left for the timing check to report.
export function fitMinutes(stages: Stage[], period: number) {
    const total = stages.reduce((sum, stage) => sum + stage.minutes, 0)
    const gap = period - total
    if (!gap || Math.abs(gap) > 10 || stages.some(stage => !stage.minutes)) return stages
    const longest = stages.reduce((best, stage) => (stage.minutes > best.minutes ? stage : best), stages[0])
    if (longest.minutes + gap >= 2) longest.minutes += gap
    return stages
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
    if (run.output) fitHours(run.output.lessons, totalHours)
    return { status: run.status, output: run.output, usage: run.usage, latency_ms: run.latency_ms, model: run.model }
}

// 21 of 22 hours (分数的意义和性质, live): a gap of up to four is taken from, or given to, the lesson with the most hours,
// keeping every lesson at one hour or more; a larger gap is left for the hours check to report.
export function fitHours(lessons: UnitLesson[], total: number) {
    const sum = lessons.reduce((acc, item) => acc + item.hours, 0)
    const gap = total - sum
    if (!lessons.length || !gap || Math.abs(gap) > 4) return lessons
    const longest = lessons.reduce((best, item) => (item.hours > best.hours ? item : best), lessons[0])
    if (longest.hours + gap >= 1) longest.hours += gap
    return lessons
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
2. stages：按教案的环节顺序写，每个环节写 name、minutes（各环节合计 8–10 分钟）和 text。text 是教师在课堂上说的原话：第一人称，口语化，面向「同学们」。需要学生回答的地方，先写出问题，再用「（模拟学生回答：……）」写一句典型的学生回答，接着写教师的反馈；需要写板书的地方用「（板书：……）」标出。不要另加「（问题：……）」，也不要写「教师活动」「设计意图」之类的说明。
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
                // 「（模拟 student：…）」 leaked once; 「（问题：…）」 repeats the question just asked
                const text = keepCodes(String(record.text || ''), codes).replace(/（模拟\s*student\s*[：:]/giu, '（模拟学生回答：').replace(/（问题[：:][^）]*）/gu, '').trim().slice(0, 1500)
                return { name: str(record.name, 20), minutes: Number.isFinite(minutes) && minutes > 0 && minutes <= 10 ? minutes : 1, text }
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

// A whole paper (期末卷, 30–45 items) is more than one call writes in time: the time goes on the answer, about
// one line per question, so a live 34-question paper of only 1,700 characters timed out. Papers are cut at
// question starts into parts of at most 12 questions (or about 1,800 characters), read side by side, then
// merged. A part that starts inside a section repeats that section's heading, which carries the 分值.
const SECTION_START = /^\s*[一二三四五六七八九十]+\s*[、.．]/u
const QUESTION_START = /^\s*\d+\s*[.．、]/u
export function splitTest(text: string, partQuestions = 12, partChars = 1800, maxParts = 4): string[] {
    const lines = text.split('\n')
    const questionCount = lines.filter(line => QUESTION_START.test(line)).length
    if (questionCount <= partQuestions * 1.25 && text.length <= partChars * 1.3) return [text]
    const parts: string[] = []
    let current: string[] = []
    let size = 0
    let questions = 0
    let section = ''
    for (const line of lines) {
        const starts = SECTION_START.test(line) || QUESTION_START.test(line)
        if (starts && (questions >= partQuestions || size >= partChars) && parts.length < maxParts - 1) {
            parts.push(current.join('\n'))
            current = section && !SECTION_START.test(line) ? [section] : []
            size = 0
            questions = 0
        }
        if (SECTION_START.test(line)) section = line.trim()
        if (QUESTION_START.test(line)) questions += 1
        current.push(line)
        size += line.length + 1
    }
    if (current.length) parts.push(current.join('\n'))
    return parts.filter(part => part.trim())
}

export function mergeReads(reads: ReadTest[]): ReadTest {
    const seen = new Set<string>()
    const questions = reads.flatMap(read => read.questions).filter(item => {
        const key = `${item.no}|${item.quote}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
    return {
        questions,
        beyond: reads.flatMap(read => read.beyond),
        total: Math.max(0, ...reads.map(read => read.total)),
        dropped: reads.reduce((sum, read) => sum + read.dropped, 0)
    }
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
