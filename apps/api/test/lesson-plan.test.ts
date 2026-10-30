import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { FileCurriculumRepository } from '@curriculum/core'
import { createApp } from '../src/app.js'
import { checkPlan, limitsOf, type Frame, type Process } from '../src/lesson-plan.js'

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
            period_minutes: 40
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
    assert.match(prompts[0], /老师的教案：/)
})

test('a plan that restates the limit (「不涉及循环小数」) is not flagged; stages inherit objectives from their assessments', () => {
    const indicators = [{ code: LIMITED, text: '会进行小数和分数的转化（不包括将循环小数转化成分数）', pages: [31], standard_code: 'MA-S3-NA-01', standard_title: '数与运算', stage_label: '5–6 年级' }]
    const restated = frame({ objectives: [{ id: 'O1', text: '学生能把 0.5 写成分数（不涉及循环小数转换）', basis: [LIMITED], kind: '能做' }, ...frame().objectives.slice(1)] })
    assert.ok(!checkPlan(restated, planProcess, { indicators, standards: [], periodMinutes: 40 }).some(item => item.kind === 'beyond_standard'))
    const mentioned = frame({ objectives: [{ id: 'O1', text: '学生能把循环小数化成分数', basis: [LIMITED], kind: '能做' }, ...frame().objectives.slice(1)] })
    assert.ok(checkPlan(mentioned, planProcess, { indicators, standards: [], periodMinutes: 40 }).some(item => item.kind === 'beyond_standard'))
})
