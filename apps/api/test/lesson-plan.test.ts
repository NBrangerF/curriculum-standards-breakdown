import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { FileCurriculumRepository } from '@curriculum/core'
import { createApp } from '../src/app.js'
import { checkPlan, checkTest, fitHours, fitMinutes, limitsOf, splitTest, type DraftInput, type Frame, type Process } from '../src/lesson-plan.js'

const publicDataRoot = resolve(process.cwd(), '../../public/data')
const app = createApp(new FileCurriculumRepository(publicDataRoot))
const json = async (response: Response) => JSON.parse(await response.text())

// 人教版数学五年级下册 and its 国家平台 lesson 「分数的基本性质」
const books = JSON.parse(await readFile(resolve(publicDataRoot, 'textbooks/index.json'), 'utf8')).items
const math5b = books.find((book: any) => book.title === '数学5年级下册' && book.edition_name === '人教版').edition_id
const national = JSON.parse(await readFile(resolve(publicDataRoot, `textbooks/national-lessons/${math5b}.json`), 'utf8'))
const fractionLesson = national.lessons.find((lesson: any) => lesson.title === '分数的基本性质')

const LIMITED = 'MA-S3-NA-01.3'

const frame = (overrides: Partial<Frame> = {}): Frame => ({
    title: '分数的基本性质',
    core_understanding: '分数的大小不变，分子分母可以同时变化',
    objectives: [
        { id: 'O1', text: '学生能借助折纸和画图，说出分数的分子和分母同时乘或除以相同的数（0 除外），分数大小不变', basis: [LIMITED], kind: '理解' },
        { id: 'O2', text: '学生能运用分数的基本性质，把分数化成指定分母的分数并比较大小', basis: [LIMITED], kind: '能做' }
    ],
    key_points: ['理解分数的基本性质'],
    difficult_points: ['说清为什么 0 除外'],
    learner_analysis: '学生已经学过分数的意义和分数与除法的关系。',
    prior_knowledge: ['分数的意义'],
    misconceptions: [{ text: '分子分母同时加上相同的数，分数大小不变', response: '用画图反例说明' }],
    keywords: [{ term: '分数的基本性质', definition: '分子分母同乘或同除以相同的数（0 除外），大小不变' }],
    assessments: [{ id: 'A1', objective_ids: ['O1', 'O2'], task: '完成三道化分母的题并说理由', evidence: '学习单', criteria: '三题全对且能说理' }],
    ...overrides
})

const planProcess: Process = {
    stages: [
        { name: '导入', minutes: 5, teacher: '出示三个相等的分数', students: '观察并猜想', purpose: '引出问题', objective_ids: ['O1'], assessment_ids: [] },
        { name: '探究', minutes: 20, teacher: '组织折纸', students: '折纸、画图、记录', purpose: '建立性质', objective_ids: ['O1'], assessment_ids: [] },
        { name: '练习', minutes: 15, teacher: '巡视', students: '完成学习单', purpose: '运用', objective_ids: ['O2'], assessment_ids: ['A1'] }
    ],
    homework: [{ level: '基础', task: '课本练习' }],
    board: ['分数的基本性质'],
    materials: ['正方形纸'],
    safety: []
}

test('the 课标 limits become checks: 「不包括将循环小数转化成分数」 guards 循环小数', () => {
    const limits = limitsOf(['会进行小数和分数的转化（不包括将循环小数转化成分数）'])
    assert.equal(limits.length, 1)
    assert.equal(limits[0].key, '循环小数')
})

test('checkPlan finds a plan that goes beyond the 课标, vague objectives and missing evidence', () => {
    const indicators = [{ code: LIMITED, text: '能用直观的方式表示分数和小数，能比较两个分数的大小和两个小数的大小；会进行小数和分数的转化（不包括将循环小数转化成分数）', pages: [31], standard_code: 'MA-S3-NA-01', standard_title: '数与运算', stage_label: '5–6 年级' }]
    const ok = checkPlan(frame(), planProcess, { indicators, standards: [], periodMinutes: 40 })
    assert.deepEqual(ok.map(item => item.kind), ['aligned'])

    const beyond = checkPlan(frame(), { ...planProcess, homework: [{ level: '拓展', task: '把 0.3 循环小数化成分数' }] }, { indicators, standards: [], periodMinutes: 40 })
    assert.ok(beyond.some(item => item.kind === 'beyond_standard' && item.level === 'risk'))

    const vague = frame({ objectives: [{ id: 'O1', text: '培养学生的数学核心素养', basis: [LIMITED], kind: '理解' }], assessments: [] })
    const kinds = checkPlan(vague, null, { indicators, standards: [], periodMinutes: 40 }).map(item => item.kind)
    assert.ok(kinds.includes('vague_verb'))
    assert.ok(kinds.includes('no_assessment'))

    const timing = checkPlan(frame(), { ...planProcess, stages: planProcess.stages.slice(0, 2) }, { indicators, standards: [], periodMinutes: 40 }).map(item => item.kind)
    assert.ok(timing.includes('timing'))
    assert.ok(timing.includes('no_activity'))
})

test('lesson-plan context starts from a 国家平台 lesson and leaves the 要点 for the teacher to tick', async () => {
    assert.ok(fractionLesson, 'the national lesson list has 分数的基本性质')
    const response = await app.request(`/api/v1/lesson-plans/context?edition_id=${math5b}&lesson_id=${fractionLesson.id}`)
    assert.equal(response.status, 200)
    const { data } = await json(response)
    assert.equal(data.lesson.title, '分数的基本性质')
    assert.equal(data.lesson.subject_slug, 'math')
    assert.equal(data.lesson.grade, 5)
    assert.ok(data.standards.length >= 1)
    assert.ok(data.standards.every((item: any) => item.suggested.length === 0))
    assert.ok(data.standards.some((item: any) => item.code === 'MA-S3-NA-01'))
    assert.ok(data.national_lessons.some((item: any) => item.id === fractionLesson.id && item.url.startsWith('https://basic.smartedu.cn/')))
    assert.match(data.subject_note.organized_by, /四个学习领域/)
})

test('lesson-plan context finds standards by title when a free topic is given', async () => {
    const response = await app.request(`/api/v1/lesson-plans/context?subject=physics&grade=8&topic=${encodeURIComponent('浮力')}`)
    assert.equal(response.status, 200)
    const { data } = await json(response)
    assert.ok(data.standards.length >= 1)
    assert.ok(data.standards.every((item: any) => item.via === 'search' && item.subject_slug === 'physics'))
})

// A stand-in model: writes the frame or the process, with one invented code it must not get away with.
function fakeModel(calls: string[]): typeof fetch {
    return async (_input, init) => {
        const body = JSON.parse(String(init?.body))
        const system = String(body.messages[0].content)
        const user = String(body.messages[1].content)
        calls.push(user)
        const content = system.includes('写教学过程')
            ? { ...planProcess, stages: planProcess.stages.map(stage => ({ ...stage, objective_ids: [...stage.objective_ids, 'O9'] })) }
            : { ...frame(), objectives: frame().objectives.map(item => ({ ...item, basis: [...item.basis, 'MA-S1-ZZ-99.1'] })) }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 900, completion_tokens: 600, total_tokens: 1500 } }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
}

test('lesson-plan draft: frame then process, codes kept to the picked 要点 and 要点 text read from kebiao data', async t => {
    const saved = process.env.KEBIAO_LLM_API_KEY
    process.env.KEBIAO_LLM_API_KEY = 'test-secret'
    t.after(() => { if (saved === undefined) delete process.env.KEBIAO_LLM_API_KEY; else process.env.KEBIAO_LLM_API_KEY = saved })
    const calls: string[] = []
    t.mock.method(globalThis, 'fetch', fakeModel(calls))
    const request = {
        lesson: { title: '分数的基本性质', unit_title: '4 分数的意义和性质', textbook_title: '数学5年级下册', edition_name: '人教版', subject_slug: 'math', grade: 5 },
        indicator_codes: [LIMITED],
        period_minutes: 40,
        class_notes: '班上张三同学的电话是 13812345678，基础较弱',
        teacher_notes: '想用折纸'
    }
    const first = await app.request('/api/v1/lesson-plans/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...request, step: 'frame' }) })
    assert.equal(first.status, 200)
    assert.equal(first.headers.get('x-ratelimit-policy'), 'ai-per-minute')
    const one = (await json(first)).data
    assert.deepEqual(one.frame.objectives[0].basis, [LIMITED])
    assert.match(one.evidence[0].text, /不包括将循环小数转化成分数/)
    assert.equal(one.privacy.redacted, true)
    assert.ok(!calls[0].includes('13812345678'))
    assert.match(calls[0], /MA-S3-NA-01\.3：/)

    const second = await app.request('/api/v1/lesson-plans/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...request, step: 'process', frame: one.frame }) })
    assert.equal(second.status, 200)
    const two = (await json(second)).data
    assert.equal(two.process.stages.length, 3)
    assert.ok(two.process.stages.every((stage: any) => !stage.objective_ids.includes('O9')))
    assert.ok(two.checks.some((item: any) => item.kind === 'aligned'))
    assert.match(calls[1], /已定的目标与评价/)
})

test('lesson-plan draft refuses 要点 codes that do not exist', async () => {
    const response = await app.request('/api/v1/lesson-plans/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ step: 'frame', lesson: { title: '测试', subject_slug: 'math', grade: 5 }, indicator_codes: ['MA-S3-NA-01.99'] }) })
    assert.equal(response.status, 422)
})

test('核验我的教案: a pasted plan is read into objectives and checked against the 课标 limits', async t => {
    const saved = process.env.KEBIAO_LLM_API_KEY
    process.env.KEBIAO_LLM_API_KEY = 'test-secret'
    t.after(() => { if (saved === undefined) delete process.env.KEBIAO_LLM_API_KEY; else process.env.KEBIAO_LLM_API_KEY = saved })
    const prompts: string[] = []
    t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body))
        assert.match(String(body.messages[0].content), /老师贴来一份教案/)
        prompts.push(String(body.messages[1].content))
        const content = {
            title: '分数的基本性质',
            objectives: [
                { text: '理解分数的基本性质', basis: [LIMITED, 'MA-S1-ZZ-99.1'], note: '' },
                { text: '培养学生的数学核心素养', basis: [], note: '太空泛，看不出学生要做到什么' }
            ],
            assessments: [{ task: '课堂提问', objective_refs: [1] }],
            stages: [{ name: '新授', minutes: 25, objective_refs: [1] }, { name: '拓展', minutes: 15, objective_refs: [1] }],
            period_minutes: 40,
            beyond: [
                { quote: '把 0.3 循环小数化成分数', limit: '不包括将循环小数转化成分数' },
                { quote: '这句教案里没有', limit: '不包括将循环小数转化成分数' },
                { quote: '新授 25 分钟', limit: '这句要点里没有' }
            ]
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 900, completion_tokens: 300, total_tokens: 1200 } }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const plan = '教学目标：1. 理解分数的基本性质；2. 培养学生的数学核心素养。\n教学过程：新授 25 分钟；拓展：把 0.3 循环小数化成分数，15 分钟。\n评价：课堂提问。'
    const response = await app.request('/api/v1/lesson-plans/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lesson: { title: '分数的基本性质', subject_slug: 'math', grade: 5 }, indicator_codes: [LIMITED], plan_text: plan }) })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-ratelimit-policy'), 'ai-per-minute')
    const { data } = await json(response)
    assert.deepEqual(data.read.frame.objectives[0].basis, [LIMITED])
    const kinds = data.checks.map((item: any) => item.kind)
    assert.ok(kinds.includes('beyond_standard'))
    assert.ok(kinds.includes('no_basis'))
    assert.ok(kinds.includes('reader_note'))
    assert.ok(data.checks.every((item: any) => !/目标 O\d/.test(item.message)))
    // invented quotes from the reader are dropped: only one 超标 finding survives (the program's own or the reader's)
    assert.equal(data.checks.filter((item: any) => item.kind === 'beyond_standard').length, 1)
    assert.ok(data.checks.every((item: any) => !String(item.message).includes('这句教案里没有') && !String(item.message).includes('这句要点里没有')))
    assert.match(prompts[0], /老师的教案：/)
})

test('a plan that restates the limit (「不涉及循环小数」) is not flagged; stages inherit objectives from their assessments', () => {
    const indicators = [{ code: LIMITED, text: '会进行小数和分数的转化（不包括将循环小数转化成分数）', pages: [31], standard_code: 'MA-S3-NA-01', standard_title: '数与运算', stage_label: '5–6 年级' }]
    const restated = frame({ objectives: [{ id: 'O1', text: '学生能把 0.5 写成分数（不涉及循环小数转换）', basis: [LIMITED], kind: '能做' }, ...frame().objectives.slice(1)] })
    assert.ok(!checkPlan(restated, planProcess, { indicators, standards: [], periodMinutes: 40 }).some(item => item.kind === 'beyond_standard'))
    const mentioned = frame({ objectives: [{ id: 'O1', text: '学生能把循环小数化成分数', basis: [LIMITED], kind: '能做' }, ...frame().objectives.slice(1)] })
    assert.ok(checkPlan(mentioned, planProcess, { indicators, standards: [], periodMinutes: 40 }).some(item => item.kind === 'beyond_standard'))
})

test('单元整体设计: a textbook unit is planned over its own lessons and checked', async t => {
    const saved = process.env.KEBIAO_LLM_API_KEY
    process.env.KEBIAO_LLM_API_KEY = 'test-secret'
    t.after(() => { if (saved === undefined) delete process.env.KEBIAO_LLM_API_KEY; else process.env.KEBIAO_LLM_API_KEY = saved })
    const prompts: string[] = []
    t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body))
        assert.match(String(body.messages[0].content), /单元整体教学设计/)
        prompts.push(String(body.messages[1].content))
        const content = {
            title: '分数的意义和性质',
            big_idea: '分数表示整体与部分的关系，同一个数可以有多种等值的分数表示',
            essential_questions: ['什么时候两个分数一样大？'],
            objectives: [{ id: 'O1', text: '学生能用图和语言说明分数的意义', basis: [LIMITED], kind: '理解' }, { id: 'O2', text: '学生能运用分数的基本性质约分和通分', basis: [LIMITED], kind: '能做' }],
            performance_task: { title: '班级分饼会', scenario: '为班级聚会设计公平分配方案', product: '分配方案和说明', criteria: ['用分数表示每人所得'] },
            assessments: [{ id: 'A1', objective_ids: ['O1', 'O2'], task: '分配方案', evidence: '方案', criteria: '正确' }],
            lessons: [
                { title: '分数的意义', hours: 2, focus: '理解单位1', objective_ids: ['O1'], assessment_ids: [] },
                { title: '分数的基本性质、约分', hours: 3, focus: '等值分数', objective_ids: ['O2'], assessment_ids: ['A1'] },
                { title: '循环小数探秘', hours: 1, focus: '编出来的课', objective_ids: [], assessment_ids: [] }
            ],
            prior_knowledge: ['分数的初步认识'],
            connections: '承接三年级分数的初步认识'
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 900, completion_tokens: 600, total_tokens: 1500 } }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const response = await app.request('/api/v1/lesson-plans/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ step: 'unit', lesson: { title: '分数的意义和性质', subject_slug: 'math', grade: 5 }, indicator_codes: [LIMITED], unit_lessons: ['分数的意义', '分数的基本性质', '约分', '通分'], unit_hours: 5 }) })
    assert.equal(response.status, 200)
    const { data } = await json(response)
    // a lesson that is not in the textbook list is dropped
    assert.deepEqual(data.unit.lessons.map((item: any) => item.title), ['分数的意义', '分数的基本性质、约分'])
    assert.equal(data.unit.performance_task.title, '班级分饼会')
    assert.ok(data.checks.some((item: any) => item.kind === 'aligned'))
    assert.match(prompts[0], /1\. 分数的意义\n2\. 分数的基本性质/)
    assert.match(prompts[0], /单元总课时：5/)
})

test('说课稿: a drafted plan is retold in the six 说课 parts, citing only its own 要点', async t => {
    const saved = process.env.KEBIAO_LLM_API_KEY
    process.env.KEBIAO_LLM_API_KEY = 'test-secret'
    t.after(() => { if (saved === undefined) delete process.env.KEBIAO_LLM_API_KEY; else process.env.KEBIAO_LLM_API_KEY = saved })
    t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body))
        assert.match(String(body.messages[0].content), /说课稿/)
        assert.match(String(body.messages[1].content), /环节「探究」/)
        const content = { sections: [
            { heading: '说教材', text: `本课依据 ${LIMITED} 和 MA-S1-ZZ-99.1。` },
            { heading: '说学情', text: '学生已学过分数的意义。' },
            { heading: '说教学目标与重难点', text: '目标一……' },
            { heading: '说教法与学法', text: '折纸操作。' },
            { heading: '说教学过程', text: '导入、探究、练习。' },
            { heading: '说板书设计', text: '分数的基本性质' },
            { heading: '说别的', text: '不该出现' }
        ], minutes: 6 }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 900, completion_tokens: 600, total_tokens: 1500 } }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const response = await app.request('/api/v1/lesson-plans/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ step: 'talk', lesson: { title: '分数的基本性质', subject_slug: 'math', grade: 5 }, indicator_codes: [LIMITED], frame: frame(), process: planProcess }) })
    assert.equal(response.status, 200)
    const { data } = await json(response)
    assert.deepEqual(data.talk.sections.map((item: any) => item.heading), ['说教材', '说学情', '说教学目标与重难点', '说教法与学法', '说教学过程', '说板书设计'])
    assert.ok(data.talk.sections[0].text.includes(LIMITED))
    assert.ok(!data.talk.sections[0].text.includes('MA-S1-ZZ-99'))
})

test('pick: the AI reads every standard of the subject at the lesson grade, and only those', async t => {
    const saved = process.env.KEBIAO_LLM_API_KEY
    process.env.KEBIAO_LLM_API_KEY = 'test-secret'
    t.after(() => { if (saved === undefined) delete process.env.KEBIAO_LLM_API_KEY; else process.env.KEBIAO_LLM_API_KEY = saved })
    const seen: string[] = []
    t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body))
        const user = String(body.messages[1].content)
        const codes = [...user.matchAll(/【([A-Z]{2}-S\d-[A-Z]{2,3}-\d{2})】/gu)].map(match => match[1])
        seen.push(...codes)
        const content = { judgements: codes.map(code => ({ code, grade: code === 'MA-S3-NA-01' ? 2 : 0, reason: code === 'MA-S3-NA-01' ? '分数' : '不相关', point: code === 'MA-S3-NA-01' ? `${code}.3` : '' })) }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const response = await app.request('/api/v1/lesson-plans/pick', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lesson: { title: '分数的基本性质（测试）', subject_slug: 'math', grade: 5 } }) })
    assert.equal(response.status, 200)
    const { data } = await json(response)
    const math = JSON.parse(await readFile(resolve(publicDataRoot, 'v2/by_subject/math.json'), 'utf8'))
    const atGrade5 = math.standards.filter((item: any) => item.grades.includes(5)).map((item: any) => item.code).sort()
    assert.deepEqual([...new Set(seen)].sort(), atGrade5)
    assert.equal(data.read, atGrade5.length)
    assert.equal(data.picks[0].code, 'MA-S3-NA-01')
    assert.equal(data.picks[0].point, 'MA-S3-NA-01.3')
})

test('pick: a 要点 past the eighth reaches the AI, two codes in one field keep the first, and extra 直接对应 are ranked', async t => {
    const saved = process.env.KEBIAO_LLM_API_KEY
    process.env.KEBIAO_LLM_API_KEY = 'test-secret'
    t.after(() => { if (saved === undefined) delete process.env.KEBIAO_LLM_API_KEY; else process.env.KEBIAO_LLM_API_KEY = saved })
    const direct: Record<string, string> = { 'MA-S4-GG-01': 'MA-S4-GG-01.2', 'MA-S4-GG-02': 'MA-S4-GG-02.3', 'MA-S4-GG-03': 'MA-S4-GG-03.10, MA-S4-GG-03.11', 'MA-S4-GG-07': 'MA-S4-GG-07.1' }
    const prompts: string[] = []
    let rankPrompt = ''
    t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body))
        const system = String(body.messages[0].content)
        const user = String(body.messages[1].content)
        let content: unknown
        if (system.includes('核对员')) {
            prompts.push(user)
            const codes = [...user.matchAll(/【([A-Z]{2}-S\d-[A-Z]{2,3}-\d{2})】/gu)].map(match => match[1])
            content = { judgements: codes.map(code => ({ code, grade: direct[code] ? 2 : 0, reason: direct[code] ? '垂直平分线' : '不相关', point: direct[code] || '' })) }
        } else {
            rankPrompt = user
            content = { order: ['MA-S4-GG-03.10', 'MA-S4-GG-07.1', 'MA-S4-GG-99.1', 'MA-S4-GG-02.3'] }
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const response = await app.request('/api/v1/lesson-plans/pick', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lesson: { title: '线段的垂直平分线的性质（测试）', unit_title: '轴对称', subject_slug: 'math', grade: 8 } }) })
    assert.equal(response.status, 200)
    const { data } = await json(response)
    // GG-03 has 16 要点; the one about the 性质定理 is the tenth
    assert.ok(prompts.some(text => text.includes('MA-S4-GG-03.10：')))
    assert.ok(rankPrompt.includes('MA-S4-GG-01.2：'))
    assert.equal(data.ranked, true)
    assert.deepEqual(data.picks.slice(0, 4).map((item: any) => item.point), ['MA-S4-GG-03.10', 'MA-S4-GG-07.1', 'MA-S4-GG-02.3', 'MA-S4-GG-01.2'])
})

test('核验我的试卷: questions become a 多维细目表; 超标, made-up and unmatched questions are reported', async t => {
    const saved = process.env.KEBIAO_LLM_API_KEY
    process.env.KEBIAO_LLM_API_KEY = 'test-secret'
    t.after(() => { if (saved === undefined) delete process.env.KEBIAO_LLM_API_KEY; else process.env.KEBIAO_LLM_API_KEY = saved })
    const prompts: string[] = []
    t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body))
        assert.match(String(body.messages[0].content), /多维细目表/)
        assert.match(String(body.messages[0].content), /了解：从具体实例中知道/)
        prompts.push(String(body.messages[1].content))
        const content = {
            questions: [
                { no: '1', quote: '把下面的分数化成最简分数', score: 20, type: '计算题', points: [LIMITED], literacy: ['运算能力', '会用数学的眼光观察现实世界'], level: '掌握', difficulty: '易' },
                { no: '2', quote: '把循环小数 0.333… 化成分数', score: 10, type: '填空题', points: [LIMITED], literacy: ['数感'], level: '运用', difficulty: '难' },
                { no: '3', quote: '这道题试卷里没有', score: 10, type: '选择题', points: [LIMITED], literacy: [], level: '了解', difficulty: '中' },
                { no: '4', quote: '小明有 3 个苹果', score: 10, type: '解答题', points: ['MA-S9-ZZ-01.1'], literacy: ['应用意识'], level: '运用', difficulty: '中' }
            ],
            beyond: [{ no: '2', quote: '把循环小数 0.333… 化成分数', limit: '不包括将循环小数转化成分数' }],
            total: 100
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 900, completion_tokens: 300, total_tokens: 1200 } }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const test_text = '五年级数学单元测试（满分 100 分）\n1. 把下面的分数化成最简分数。（20 分）\n2. 把循环小数 0.333… 化成分数。（10 分）\n4. 小明有 3 个苹果，吃了一半，还剩几个？（10 分）'
    const response = await app.request('/api/v1/lesson-plans/check-test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lesson: { title: '分数的意义和性质', subject_slug: 'math', grade: 5 }, indicator_codes: [LIMITED], test_text }) })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-ratelimit-policy'), 'ai-per-minute')
    const { data } = await json(response)
    assert.match(prompts[0], /素养维度：数感、量感/)
    // the made-up question is dropped, the one on no picked 要点 is its own row
    assert.equal(data.read.dropped, 1)
    assert.deepEqual(data.read.questions.map((item: any) => item.no), ['1', '2', '4'])
    assert.deepEqual(data.read.questions[0].literacy, ['运算能力'])
    assert.deepEqual(data.table.levels, ['了解', '理解', '掌握', '运用'])
    assert.deepEqual(data.table.rows.map((row: any) => [row.code, row.questions]), [[LIMITED, ['1', '2']], [null, ['4']]])
    assert.equal(data.table.score, 40)
    assert.deepEqual(data.table.rows[0].by_level['运用'], ['2'])
    const kinds = data.checks.map((item: any) => item.kind)
    // the program finds 循环小数 in question 2; the reader's finding of the same thing is not added twice
    const beyond = data.checks.filter((item: any) => item.kind === 'beyond_standard')
    assert.equal(beyond.length, 1)
    assert.match(beyond[0].message, /第 2 题/)
    assert.ok(kinds.includes('no_point'))
    assert.ok(kinds.includes('score_total'))
    assert.ok(kinds.includes('reader_dropped'))
})

test('细目表 without 分值 counts questions; a question on two 素养 counts half on each', () => {
    const input: DraftInput = {
        lesson: { title: '中华民国的创建', subject: '历史', subject_slug: 'history', grade: 8 },
        standards: [],
        indicators: [{ code: 'HI-S4-MC-02.1', text: '了解武昌起义及中华民国成立的史事', pages: [27], standard_code: 'HI-S4-MC-02', standard_title: '', stage_label: '' }],
        subjectNote: { organized_by: '', unit_hint: '', core_literacy: ['时空观念', '史料实证'] },
        periodMinutes: 40, lessonIndex: 1, lessonCount: 1, classNotes: '', teacherNotes: ''
    }
    const read = {
        questions: [
            { no: '1', quote: '武昌起义爆发于哪一年', score: 0, type: '填空题', points: ['HI-S4-MC-02.1'], literacy: ['时空观念'], level: '', difficulty: '易' },
            { no: '2', quote: '列举新文化运动的代表人物', score: 0, type: '简答题', points: [], literacy: ['史料实证', '时空观念'], level: '', difficulty: '中' }
        ],
        beyond: [], total: 0, dropped: 0
    }
    const { table, checks } = checkTest(read, '1. 武昌起义爆发于哪一年？\n2. 列举新文化运动的代表人物。', input)
    assert.equal(table.unit, 'count')
    assert.equal(table.weight_total, 2)
    assert.deepEqual(table.by_difficulty, { 易: 1, 中: 1 })
    assert.deepEqual(table.by_literacy, { 时空观念: 1.5, 史料实证: 0.5 })
    assert.deepEqual(table.levels, [])
    assert.ok(checks.some(item => item.kind === 'no_point' && item.message.includes('第 2 题')))
})

test('试讲稿: a drafted plan becomes a spoken 10-minute 试讲 with 答辩, citing only its own 要点', async t => {
    const saved = process.env.KEBIAO_LLM_API_KEY
    process.env.KEBIAO_LLM_API_KEY = 'test-secret'
    t.after(() => { if (saved === undefined) delete process.env.KEBIAO_LLM_API_KEY; else process.env.KEBIAO_LLM_API_KEY = saved })
    t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body))
        assert.match(String(body.messages[0].content), /试讲稿/)
        assert.match(String(body.messages[0].content), /模拟学生回答/)
        assert.match(String(body.messages[1].content), /环节「探究」/)
        const content = {
            stages: [
                { name: '导入', minutes: 1, text: '同学们，看这三张纸……（问题：一样大吗？）（模拟 student：涂色部分一样大。）' },
                { name: '探究', minutes: 6, text: '（板书：分数的基本性质）请大家折一折。' },
                { name: '小结', minutes: 2, text: '今天我们学了……' },
                { name: '', minutes: 1, text: '没有名字的环节不要' }
            ],
            board: ['分数的基本性质', '分子分母同乘或同除以相同的数（0 除外）'],
            defense: [
                { question: '本课的教学目标依据是什么？', answer: `依据 ${LIMITED}，并参考 MA-S1-ZZ-99.1。` },
                { question: '难点怎么突破？', answer: '用折纸让学生看到涂色部分大小不变。' }
            ]
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 900, completion_tokens: 900, total_tokens: 1800 } }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const response = await app.request('/api/v1/lesson-plans/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ step: 'trial', lesson: { title: '分数的基本性质', subject_slug: 'math', grade: 5 }, indicator_codes: [LIMITED], frame: frame(), process: planProcess }) })
    assert.equal(response.status, 200)
    const { data } = await json(response)
    assert.deepEqual(data.trial.stages.map((item: any) => item.name), ['导入', '探究', '小结'])
    assert.equal(data.trial.stages[0].text, '同学们，看这三张纸……（模拟学生回答：涂色部分一样大。）')
    assert.equal(data.trial.minutes, 9)
    assert.equal(data.trial.board.length, 2)
    assert.ok(data.trial.defense[0].answer.includes(LIMITED))
    assert.ok(!data.trial.defense[0].answer.includes('MA-S1-ZZ-99'))
})

test('lesson-plan context puts the AI 按单元判断 要点 of the lesson\'s unit first', async () => {
    const { readdir } = await import('node:fs/promises')
    const dir = resolve(publicDataRoot, 'textbooks/national-lessons')
    let found: { edition: string, lesson: any } | null = null
    for (const file of (await readdir(dir)).filter(name => name.startsWith('ed_')).sort()) {
        const record = JSON.parse(await readFile(resolve(dir, file), 'utf8'))
        const lesson = record.lessons.find((item: any) => item.ai_points?.length)
        if (lesson) { found = { edition: record.edition_id, lesson }; break }
    }
    assert.ok(found, 'some lesson carries AI unit picks')
    const response = await app.request(`/api/v1/lesson-plans/context?edition_id=${found.edition}&lesson_id=${found.lesson.id}`)
    assert.equal(response.status, 200)
    const { data } = await json(response)
    assert.equal(data.standards[0].via, 'ai_unit')
    assert.equal(data.standards[0].code, found.lesson.ai_points[0].replace(/\.\d+$/u, ''))
    assert.ok(data.standards.every((item: any) => item.suggested.length === 0))
    // the 要点 come along, for the page to tick when the live pick fails
    assert.equal(data.ai_points[0], found.lesson.ai_points[0])
    assert.ok(data.ai_points.every((point: string) => data.standards.some((item: any) => item.via === 'ai_unit' && item.indicators.some((indicator: any) => indicator.code === point))))
})

test('pick: a 历史 lesson is judged only against its volume\'s period', async t => {
    const saved = process.env.KEBIAO_LLM_API_KEY
    process.env.KEBIAO_LLM_API_KEY = 'test-secret'
    t.after(() => { if (saved === undefined) delete process.env.KEBIAO_LLM_API_KEY; else process.env.KEBIAO_LLM_API_KEY = saved })
    const seen: string[] = []
    t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body))
        const codes = [...String(body.messages[1].content).matchAll(/【([A-Z]{2}-S\d-[A-Z]{2,3}-\d{2})】/gu)].map(match => match[1])
        seen.push(...codes)
        const content = { judgements: codes.map(code => ({ code, grade: 0, reason: '不相关', point: '' })) }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    // its own client address: this file's AI calls use up one address's per-minute budget
    const response = await app.request('/api/v1/lesson-plans/pick', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.81' }, body: JSON.stringify({ lesson: { title: '近代经济、社会生活与教育文化事业的发展（测试）', textbook_title: '历史8年级上册', subject_slug: 'history', grade: 8 } }) })
    assert.equal(response.status, 200)
    const history = JSON.parse(await readFile(resolve(publicDataRoot, 'v2/by_subject/history.json'), 'utf8'))
    const modern = history.standards.filter((item: any) => item.level1 === '中国近代史').map((item: any) => item.code).sort()
    assert.deepEqual([...new Set(seen)].sort(), modern)
})

test('stages that miss the period by up to ten minutes are fitted on the longest stage', () => {
    const stage = (name: string, minutes: number) => ({ name, minutes, teacher: '', students: '', purpose: '', objective_ids: [], assessment_ids: [] })
    const over = [stage('导入', 5), stage('新授', 20), stage('练习', 15), stage('小结', 5)]
    assert.deepEqual(fitMinutes(over, 40).map(item => item.minutes), [5, 15, 15, 5])
    const under = [stage('导入', 5), stage('新授', 20), stage('小结', 5)]
    assert.deepEqual(fitMinutes(under, 40).map(item => item.minutes), [5, 30, 5])
    // too far off, or a stage with no time: left for the timing check
    assert.deepEqual(fitMinutes([stage('导入', 5), stage('新授', 50)], 40).map(item => item.minutes), [5, 50])
    assert.deepEqual(fitMinutes([stage('导入', 0), stage('新授', 30)], 40).map(item => item.minutes), [0, 30])
})

test('unit lessons that miss the unit hours by up to four are fitted on the lesson with the most hours', () => {
    const lesson = (title: string, hours: number) => ({ title, hours, focus: '', objective_ids: [], assessment_ids: [] })
    assert.deepEqual(fitHours([lesson('分数的意义', 2), lesson('约分', 3), lesson('整理和复习', 1)], 7).map(item => item.hours), [2, 4, 1])
    assert.deepEqual(fitHours([lesson('分数的意义', 2), lesson('约分', 3)], 3).map(item => item.hours), [2, 1])
    assert.deepEqual(fitHours([lesson('分数的意义', 2), lesson('约分', 3)], 12).map(item => item.hours), [2, 3])
})

test('a long paper is cut at question boundaries; a short one stays whole', () => {
    const short = '1. 第一题。\n2. 第二题。'
    assert.deepEqual(splitTest(short), [short])
    const lines = Array.from({ length: 60 }, (_, k) => `${k + 1}. ${'这是一道比较长的题目，'.repeat(6)}（2 分）`)
    const parts = splitTest(lines.join('\n'))
    assert.ok(parts.length >= 2 && parts.length <= 4)
    // every part starts at a question, and nothing is lost
    assert.ok(parts.slice(1).every(part => /^\d+\./u.test(part)))
    assert.equal(parts.join('\n'), lines.join('\n'))
    // a short paper with many questions is split too, and a part inside a section repeats its heading
    const many = ['一、填空（每空 1 分）', ...Array.from({ length: 20 }, (_, k) => `${k + 1}. 第 ${k + 1} 空（ ）。`), '二、计算（每题 4 分）', ...Array.from({ length: 14 }, (_, k) => `${k + 21}. 计算第 ${k + 21} 题。`)]
    const pieces = splitTest(many.join('\n'))
    assert.equal(pieces.length, 3)
    assert.ok(pieces[1].startsWith('一、填空（每空 1 分）\n13.'))
    assert.ok(pieces[2].startsWith('二、计算（每题 4 分）') || pieces[2].includes('二、计算（每题 4 分）\n25.'))
    assert.equal(pieces.join('\n').split('\n').filter(line => /^\d+\./u.test(line)).length, 34)
})

test('核验我的试卷: a long paper is read in parts and the questions are merged', async t => {
    const saved = process.env.KEBIAO_LLM_API_KEY
    process.env.KEBIAO_LLM_API_KEY = 'test-secret'
    t.after(() => { if (saved === undefined) delete process.env.KEBIAO_LLM_API_KEY; else process.env.KEBIAO_LLM_API_KEY = saved })
    let calls = 0
    t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
        calls += 1
        const user = String(JSON.parse(String(init?.body)).messages[1].content)
        const paper = user.slice(user.indexOf('老师的试卷：'))
        const numbers = [...paper.matchAll(/\n(\d+)\. (这是第 \d+ 题)/gu)]
        const content = { questions: numbers.map(([, no, quote]) => ({ no, quote, score: 2, type: '选择题', points: [LIMITED], literacy: [], level: '理解', difficulty: '中' })), beyond: [], total: 100 }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const test_text = Array.from({ length: 50 }, (_, k) => `${k + 1}. 这是第 ${k + 1} 题，${'题干内容比较长，'.repeat(5)}（2 分）`).join('\n')
    const response = await app.request('/api/v1/lesson-plans/check-test', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.82' }, body: JSON.stringify({ lesson: { title: '分数的意义和性质', subject_slug: 'math', grade: 5 }, indicator_codes: [LIMITED], test_text }) })
    assert.equal(response.status, 200)
    const { data } = await json(response)
    assert.ok(data.parts >= 2)
    assert.equal(calls, data.parts)
    // the first question of each part is preceded by a newline only in the full paper, so parts after the first find all theirs
    assert.ok(data.read.questions.length >= 45)
    assert.equal(data.table.score, data.read.questions.length * 2)
})
