import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

export const CAPABILITY_GRAPH_SCHEMA_VERSION = '1.0.0'
export const GENERATION_METHOD = 'deterministic-teachable-capability-graph-v4'

const CORE_FINGERPRINT_FIELDS = [
    'code', 'subject_slug', 'domain', 'subdomain', 'grade_band', 'grade_level', 'standard', 'context',
    'practice', 'teaching_tip', 'assessment_evidence_type', 'previous_code', 'next_code',
    'progression_group_id', 'progression_bridge_candidates'
]

const COMPONENT_VERBS = [
    '描述', '说出', '写出', '写作', '表达', '交流', '阅读', '朗读', '识别', '辨认', '观察', '比较',
    '区分', '判断', '分析', '解释', '说明', '阐释', '论证', '推理', '概括', '归纳', '总结', '理解',
    '认识', '了解', '掌握', '运用', '应用', '解决', '计算', '测量', '操作', '制作', '设计', '创作',
    '探究', '调查', '实验', '建模', '评价', '反思', '选择', '制定', '完成', '参与', '表现', '形成',
    '发展', '体验', '感知', '遵守', '维护', '使用', '利用', '提出', '发现', '记录', '展示',
    '聆听', '听赏', '听辨', '辨别', '分类', '列举', '举例', '读懂', '识读', '提取', '获取', '梳理',
    '整合', '搜索', '查找', '收集', '搜集', '整理', '撰写', '仿写', '改写', '修改', '改进', '调整',
    '策划', '组织', '规划', '编创', '演唱', '演奏', '表演', '模仿', '绘制', '呈现', '构建', '构思',
    '建立', '实施', '开展', '承担', '合作', '倾听', '欣赏', '评析', '质疑', '验证', '检查', '识字',
    '书写', '练习', '锻炼', '保护', '保持', '控制', '应对', '拒绝', '尊重', '关注', '领悟', '复述', '思考'
]

const BARE_SHARED_OBJECT_PATTERN = /^(?:(?:初步|独立|主动|积极|定期|准确|正确|尝试|共同|继续|熟练|基本|逐步))?(?:理解|掌握|认识|了解|知道|体会|感知|体验|形成|发展|读懂|列举|发现|识别|编创|判断|分析|搜索|运用|使用|选择|评价|说明|解释|描述|观察|比较|区分|提出|记录|展示|反思|设计|制作|完成|参与|归纳|概括)$/u

const HARDEST_CASE_RULES = [
    {
        id: 'evidence_argument',
        pattern: /依据|理由|证据|论证|解释|说明(?!书|文|性)|阐释|推理/u,
        title: '用证据或依据完成解释',
        demand_dimension: 'argument_evidence',
        why_hard: '学生不仅要给出结论，还要选择与结论相关的证据，并把证据与结论连接起来。',
        diagnostic_focus: '检查学生是否同时给出结论、相关证据以及二者之间的解释。'
    },
    {
        id: 'transfer_context',
        pattern: /真实|实际|生活|情境|陌生|迁移|综合|开放/u,
        title: '在真实或变化情境中迁移',
        demand_dimension: 'transfer',
        why_hard: '情境改变后，学生需要先识别问题结构，再选择合适的知识或方法，不能只照搬示例。',
        diagnostic_focus: '更换表面情境，检查学生能否识别不变结构并解释方法选择。'
    },
    {
        id: 'multi_step',
        pattern: /多步|步骤|顺序|先.*(?:再|然后)|连续|综合运用|完整流程|全过程/u,
        title: '保持多步骤或完整结构',
        demand_dimension: 'multi_step',
        why_hard: '学生需要保持步骤之间的依赖关系；任一步遗漏、颠倒或缺少检查都会破坏完整表现。',
        diagnostic_focus: '观察关键步骤是否齐全、顺序是否合理，以及学生能否回查结果。'
    },
    {
        id: 'compare_distinguish',
        pattern: /比较|区分|辨析|异同|分类|判断/u,
        title: '按一致维度比较或辨析',
        demand_dimension: 'comparison',
        why_hard: '学生容易分别描述对象，却没有使用同一维度建立可检验的比较。',
        diagnostic_focus: '要求学生明确比较维度，并为每个判断指出对应特征。'
    },
    {
        id: 'representation',
        pattern: /图表|图象|图像|模型|符号|表示|表征|转换|示意图|地图/u,
        title: '在多种表征之间转换',
        demand_dimension: 'representation',
        why_hard: '学生需要理解不同表征表达的是同一关系，而不是机械模仿某一种形式。',
        diagnostic_focus: '改变表征形式，检查学生能否保持关键信息并解释对应关系。'
    },
    {
        id: 'creation_constraints',
        pattern: /设计|创作|方案|改进|优化|制作/u,
        title: '在约束下设计、创作或改进',
        demand_dimension: 'creation_constraints',
        why_hard: '开放任务要求学生同时处理目标、材料、步骤与评价标准，并根据反馈修订。',
        diagnostic_focus: '检查成品之外的选择依据、修订过程和对约束的回应。'
    },
    {
        id: 'independent_precision',
        pattern: /独立|自主|准确|规范|熟练|正确|安全/u,
        title: '独立且规范地完成表现',
        demand_dimension: 'independence_precision',
        why_hard: '有提示时会做不等于能够独立、稳定并符合规范地完成。',
        diagnostic_focus: '逐步撤去提示，在同构新任务中检查准确性、规范性与稳定性。'
    },
    {
        id: 'multiple_conditions',
        pattern: /同时|分别|至少|不超过|不同|多种|多个|各种|既.*又/u,
        title: '同时满足多个条件或范围限定',
        demand_dimension: 'multiple_conditions',
        why_hard: '学生可能完成主要动作，却漏掉数量、范围、对象或质量限定。',
        diagnostic_focus: '把标准中的限定语列成核对项，逐项检查是否都有可观察证据。'
    },
    {
        id: 'quality_criteria',
        pattern: /恰当|合理|清楚|清晰|连贯|稳定|得体|有效|灵活|协调|一致|完整/u,
        title: '达到标准中的质量准则',
        demand_dimension: 'quality_criteria',
        why_hard: '完成动作并不等于达到质量要求；学生需要同时监控清晰度、连贯性、稳定性或适切性等成功准则。',
        diagnostic_focus: '把质量限定转为可观察的成功准则，用一个达标样例和一个近似未达标样例校准判断。'
    },
    {
        id: 'quantitative_threshold',
        pattern: /不少于|不低于|至少|不超过|每学年|每周|每分钟|\d+\s*[—–~-]\s*\d+\s*(?:字|词|首|件|分钟|次|个)|\d+(?:字|词|首|件|分钟|次|个)(?:以上|左右)?/u,
        title: '满足数量、时长或频率阈值',
        demand_dimension: 'quantitative_threshold',
        why_hard: '学生可能展示了目标行为，却没有达到标准明确规定的数量、时长、频率或范围。',
        diagnostic_focus: '保留数量、时长或频率记录，对照标准阈值判断是否真正达成，而不是只判断“做过”。'
    }
]

const DIFFICULTY_RULES = [
    {
        category: 'argument_evidence',
        pattern: /依据|理由|证据|论证|解释|说明(?!书|文|性)|阐释|推理/u,
        manifestation: '只给结论或复述材料，没有提供相关证据，或没有说明证据为何支持结论。',
        likely_cause: '把“知道答案”当成“完成解释”，尚未形成结论—证据—推理的结构。',
        teacher_action: '展示一个“有结论无证据”和一个“证据能支持结论”的对比例，要求学生标注三部分后再独立作答。'
    },
    {
        category: 'comparison',
        pattern: /比较|区分|辨析|异同|分类|判断/u,
        manifestation: '能分别描述对象，但比较维度前后不一致，或只说“不同”而不能指出差异依据。',
        likely_cause: '没有把比较转化为“同一维度下逐项对照”的操作步骤。',
        teacher_action: '先共同确定一个比较维度，用表格完成一轮对照，再让学生选择新维度独立比较并说明依据。'
    },
    {
        category: 'multi_step_procedure',
        pattern: /多步|步骤|顺序|先.*(?:再|然后)|连续|完整流程|全过程/u,
        manifestation: '遗漏关键步骤、顺序颠倒，或得到结果后不检查，导致任务不能完整完成。',
        likely_cause: '只记住局部动作，没有理解步骤之间的依赖关系和每一步的目的。',
        teacher_action: '让学生给混排步骤排序并解释理由，再用“做一步—说明目的—检查结果”的口述协议完成同构任务。'
    },
    {
        category: 'transfer',
        pattern: /真实|实际|生活|情境|陌生|迁移|应用|运用|解决/u,
        manifestation: '在熟悉例题中会做，更换材料、数字或情境后不能识别应使用的方法。',
        likely_cause: '记住了示例表面特征，没有提取决定方法选择的关键结构。',
        teacher_action: '并列一个同结构异情境正例和一个表面相似但结构不同的反例，让学生先说选择依据再操作。'
    },
    {
        category: 'representation',
        pattern: /图表|图象|图像|模型|符号|表示|表征|转换|示意图|地图/u,
        manifestation: '能照着画或填一种表征，但不能解释图、符号、语言或实物之间的对应关系。',
        likely_cause: '把表征当作固定格式记忆，没有理解每个元素所代表的量、关系或特征。',
        teacher_action: '要求学生在两种表征之间逐项连线并口头解释，再提供一处错误表征让其定位和修正。'
    },
    {
        category: 'creation_design',
        pattern: /设计|创作|方案|改进|优化|制作/u,
        manifestation: '能产出作品或方案，但选择随意，不能说明如何满足任务约束，也缺少根据反馈修订的证据。',
        likely_cause: '把开放任务理解为“做出一个结果”，没有把标准转化为设计准则和检查点。',
        teacher_action: '共同把要求改写成三至五项成功准则；先据准则评价样例，再要求学生记录一次有依据的修改。'
    },
    {
        category: 'language_expression',
        pattern: /描述|说出|表达|交流|阅读|朗读|写|概括|复述/u,
        manifestation: '表达包含零散信息，却遗漏关键要点、顺序或对象之间的关系。',
        likely_cause: '注意力停留在局部内容，尚未形成面向听者或读者组织信息的结构。',
        teacher_action: '用“对象—关键特征—顺序或关系”的简短框架比较完整与不完整样例，再撤去框架复测。'
    },
    {
        category: 'concept_discrimination',
        pattern: /认识|理解|识别|辨认|观察|发现|概念|特征/u,
        manifestation: '能复述术语或指出熟悉例子，但遇到近似反例时按表面特征作出错误判断。',
        likely_cause: '概念边界不清，只记住典型正例，没有检验必要特征。',
        teacher_action: '同时提供正例、近似反例和边界例，要求学生指出决定判断的特征并修正规则。'
    }
]

export function sha256(value) {
    return createHash('sha256').update(String(value)).digest('hex')
}

export function stable(value) {
    if (Array.isArray(value)) return value.map(stable)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
}

function compact(value) {
    return String(value || '').replace(/\s+/gu, ' ').trim()
}

function excerpt(value, max = 180) {
    const text = compact(value)
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

function id(prefix, ...parts) {
    return `${prefix}_${sha256(parts.join('\u241f')).slice(0, 16)}`
}

function splitReferences(value) {
    return String(value || '').split(/[\n|]+/u).map(item => item.trim()).filter(Boolean)
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function literalSourceExcerpt(sourceValue, proposedValue, max = 600) {
    const rawSource = String(sourceValue || '')
    const proposed = String(proposedValue || '').trim()
    if (proposed && rawSource.includes(proposed)) return proposed.slice(0, max)

    const normalizedProposal = compact(proposed)
    if (normalizedProposal) {
        const whitespaceFlexiblePattern = normalizedProposal
            .split(' ')
            .map(escapeRegExp)
            .join('\\s+')
        const match = rawSource.match(new RegExp(whitespaceFlexiblePattern, 'u'))
        if (match?.[0]) return match[0].slice(0, max)
    }

    // A broad field-level quote is less specific, but it is still literal and
    // can be independently checked against the untouched source field.
    return rawSource.trim().slice(0, max)
}

function sourceRef(record, field, value = record[field]) {
    const text = literalSourceExcerpt(record[field], value)
    return {
        ref_id: `standard:${record.code}:${field}`,
        source_type: 'curriculum_standard_field',
        field,
        excerpt: text,
        excerpt_hash: sha256(text)
    }
}

function cleanComponentLabel(value) {
    let text = compact(value).replace(/[，,；;。\s]+$/u, '')
    for (let pass = 0; pass < 3; pass += 1) {
        text = text
            .replace(/^[，,；;。\s]+/u, '')
            .replace(/^学生(?:能够|能|会)\s*/u, '')
            .replace(/^(?:能够|能|可以|会|尝试)\s*/u, '')
            .replace(/^(?:并且|并|且|同时|以及|还要)\s*/u, '')
    }
    return text.trim()
}

function borrowSharedObject(nextLabel) {
    const verbs = [...COMPONENT_VERBS].sort((left, right) => right.length - left.length)
    let value = compact(nextLabel).replace(/^(?:初步|独立|主动|积极|定期|准确|正确|尝试|共同|继续|熟练|基本|逐步|较好地)\s*/u, '')
    for (const verb of verbs) {
        if (value.startsWith(verb)) {
            value = value.slice(verb.length)
            break
        }
    }
    return value
        .split(/[，,；;]/u)[0]
        .replace(/(?:进行|用于|以便|从而).+$/u, '')
        .trim()
}

function startsWithAction(value) {
    const text = cleanComponentLabel(value).replace(/^(?:初步|独立|主动|积极|认真|定期|准确|正确|共同|继续|熟练|基本|逐步|较好地)\s*/u, '')
    return COMPONENT_VERBS.some(verb => text.startsWith(verb))
}

function isStandaloneAnnotation(value) {
    const text = compact(value)
    return /^[（(].*[）)]$/u.test(text)
}

function isMethodConditionFragment(value) {
    const text = compact(value)
    return /^(?:围绕|根据|通过|借助|结合|面对|基于|按照|依照)/u.test(text)
        && !COMPONENT_VERBS.some(verb => text.includes(verb))
}

function componentClauses(standardText) {
    let text = compact(standardText)
    const colon = text.match(/^([^：:]{2,18})[：:]\s*(.+)$/u)
    if (colon && COMPONENT_VERBS.some(verb => colon[2].includes(verb))) text = colon[2]

    const verbAlternation = COMPONENT_VERBS.join('|')
    const parts = []
    for (const sentence of text.split(/[；;。\n]+/u).map(item => item.trim()).filter(item => item && !isStandaloneAnnotation(item))) {
        const rawParts = sentence.split(new RegExp(`(?:，(?=(?:并|且|同时|还要)?(?:能|能够|可以|会|尝试|${verbAlternation}))|(?:并且|并|且|以及)(?=(?:能|能够|可以|会|尝试)?(?:${verbAlternation})))`, 'u'))
        let pendingCondition = ''
        for (const rawPart of rawParts) {
            if (/^(?:能够|能|可以|会|尝试)\s*以及/u.test(compact(rawPart))) continue
            let part = cleanComponentLabel(rawPart)
            const leadingCondition = part.match(/^((?:在|通过|借助|结合|面对).{1,80}(?:过程中|基础上|时|中|下|内))[，,]?(.+)$/u)
            if (leadingCondition && startsWithAction(leadingCondition[2])) {
                pendingCondition = leadingCondition[1]
                part = cleanComponentLabel(leadingCondition[2])
            }
            const conditionOnly = /(?:时|中|下|内|过程中|基础上)$/u.test(part) && !startsWithAction(part)
            if (conditionOnly || isMethodConditionFragment(part)) {
                pendingCondition = part
                continue
            }
            if (/^(?:以及|并且|并|且|还要|的|间内)/u.test(part) || isStandaloneAnnotation(part)) continue
            if (part.length >= 2) parts.push({ label: part, condition: pendingCondition, source_clause: compact(`${pendingCondition ? `${pendingCondition}，` : ''}${part}`) })
        }
    }

    const deduped = []
    for (const part of parts) {
        if (!deduped.some(existing => existing.label === part.label && existing.condition === part.condition)) {
            deduped.push(part)
        }
    }
    const resolvedFromNext = deduped.map((part, index, rows) => {
        if (!BARE_SHARED_OBJECT_PATTERN.test(part.label) || !rows[index + 1]) return part
        const sharedObject = borrowSharedObject(rows[index + 1].label)
        if (sharedObject.length < 2) return part
        return {
            ...part,
            label: `${part.label}${sharedObject}`,
            source_clause: compact(`${part.condition ? `${part.condition}，` : ''}${part.label}并${rows[index + 1].label}`)
        }
    })
    const resolved = resolvedFromNext.map((part, index, rows) => {
        if (!BARE_SHARED_OBJECT_PATTERN.test(part.label)) return part
        for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
            const sharedObject = borrowSharedObject(rows[cursor].label)
            if (sharedObject.length < 3 || BARE_SHARED_OBJECT_PATTERN.test(sharedObject)) continue
            return {
                ...part,
                label: `${part.label}${sharedObject}`,
                source_clause: compact(text)
            }
        }
        return part
    })
    return resolved.length ? resolved : [{ label: cleanComponentLabel(text), condition: '', source_clause: cleanComponentLabel(text) }]
}

function componentType(text) {
    if (/反思|评价|监控|策略|调整|规划/u.test(text)) return 'metacognitive'
    if (/责任|态度|意识|习惯|品德|尊重|合作|参与|价值/u.test(text)) return 'disposition'
    if (/图表|图象|图像|模型|符号|表示|表征|转换|示意图|地图/u.test(text)) return 'representational'
    if (/表达|交流|阅读|朗读|写|说|描述|语言|词|句|文本|概括|复述/u.test(text)) return 'language'
    if (/计算|运算|操作|步骤|制作|实验|测量|使用|绘制|完成|练习|解决/u.test(text)) return 'procedural'
    return 'conceptual'
}

function studentAction(label) {
    return /^(?:能|能够|会|可以|尝试)/u.test(label) ? `学生${label}` : `学生能够${label}`
}

function contextualStudentAction(label, condition) {
    const action = /^(?:能|能够|会|可以|尝试)/u.test(label) ? label : `能够${label}`
    if (!condition) return `学生${action}`
    return `学生${condition}，${action}`
}

function observableLabel(sourceLabel) {
    const modifierMatch = sourceLabel.match(/^(初步|进一步|逐步|熟练|正确)(.+)$/u)
    const modifier = modifierMatch?.[1] || ''
    const actionLabel = modifierMatch?.[2] || sourceLabel
    const rules = [
        [/^理解(.+)$/u, '用自己的话解释$1'],
        [/^掌握(.+)$/u, '正确运用$1完成任务'],
        [/^(?:认识|了解)(.+)$/u, '识别并说出$1的关键特征'],
        [/^知道(.+)$/u, '准确说出$1'],
        [/^体会(.+)$/u, '用具体事例说明$1'],
        [/^感知(.+)$/u, '识别并描述$1'],
        [/^体验(.+)$/u, '参与相关活动并描述$1'],
        [/^形成(.+)$/u, '在任务中表现出$1并说明选择理由'],
        [/^发展(.+)$/u, '在任务中运用$1并根据反馈调整'],
        [/^热爱(.+)$/u, '主动参与与$1相关的活动并用具体事例说明其价值'],
        [/^(?:具有|具备)(.+)$/u, '在任务中表现出$1并说明行动选择'],
        [/^养成(.+)$/u, '在连续任务中稳定表现出$1'],
        [/^领悟(.+)$/u, '用具体事例解释$1'],
        [/^(?:树立|增强)(.+)$/u, '在判断与行动中表现出$1并说明理由'],
        [/^关注(.+)$/u, '持续收集并说明$1的关键信息']
    ]
    for (const [pattern, replacement] of rules) {
        if (!pattern.test(actionLabel)) continue
        const transformed = actionLabel.replace(pattern, replacement)
        if (modifier === '正确') return /^(?:正确|准确)/u.test(transformed) ? transformed : `准确${transformed}`
        if (modifier === '熟练') return `熟练${transformed.replace(/^(?:正确|准确)/u, '')}`
        return `${modifier}${transformed}`
    }
    return sourceLabel
}

function compactLongComponentScope(sourceLabel, condition) {
    if ([...sourceLabel].length <= 70) return { label: sourceLabel, condition }
    const scopedRules = [
        {
            pattern: /^了解(.+)$/u,
            label: '识别并说明所列文化内容的关键特征',
            condition: match => `在${match[1]}范围内`
        },
        {
            pattern: /^接触和理解(.+)等语篇类型$/u,
            label: '区分并说明所列语篇类型的基本特征',
            condition: match => `接触${match[1]}等语篇类型时`
        },
        {
            pattern: /^围绕(.+)等主题开展学习$/u,
            label: '围绕所列主题完成语言学习任务',
            condition: match => `在${match[1]}等主题范围内`
        },
        {
            pattern: /^围绕(.+)等主题开展理解与表达$/u,
            label: '围绕所列主题完成理解与表达任务',
            condition: match => `在${match[1]}等主题范围内`
        },
        {
            pattern: /^分析(.+)$/u,
            label: '分析并比较所列文化内容',
            condition: match => `在${match[1]}范围内`
        },
        {
            pattern: /^探索并证明(.+)$/u,
            label: '探索并证明所列几何性质与定理',
            condition: match => `在${match[1]}范围内`
        },
        {
            pattern: /^用自己的话解释(.+)$/u,
            label: '用自己的话解释所列科学概念与规律',
            condition: match => `在${match[1]}范围内`
        },
        {
            pattern: /^((?:围绕|在).+?过程)，综合运用(.+)知识解决问题$/u,
            label: '综合运用所列知识解决真实或跨学科问题',
            condition: match => `${match[1]}；使用${match[2]}等知识时`
        }
    ]
    for (const rule of scopedRules) {
        const match = sourceLabel.match(rule.pattern)
        if (!match) continue
        const scope = rule.condition(match)
        return { label: rule.label, condition: [condition, scope].filter(Boolean).join('；') }
    }
    return { label: sourceLabel, condition }
}

function firstEvidence(record) {
    const values = String(record.assessment_evidence_type || '')
        .split(/[；;\n]+/u)
        .map(item => item
            .replace(/^(?:优先采集\s*[：:]?\s*)?/u, '')
            .replace(/^(?:表现性任务|作品|观察记录|评价证据|证据类型|证据)\s*[：:]?\s*/u, '')
            .replace(/^\++/u, '')
            .replace(/\s*\+\s*/gu, '、')
            .replace(/[。；;]+$/u, '')
            .trim())
        .filter(Boolean)
    return values[0] || '独立完成与该小能力同构的任务，并留下可回查的口头、书面、作品或操作证据'
}

function buildLearningComponents(record) {
    return componentClauses(record.standard).map((clause, index) => {
        const { label: sourceLabel, condition, source_clause: sourceClause } = clause
        const scoped = compactLongComponentScope(sourceLabel, condition)
        const label = observableLabel(scoped.label)
        const action = contextualStudentAction(label, scoped.condition)
        const diagnosticTail = /说明|解释|阐释|论证|理由|依据/u.test(label)
            ? '，并保留可回查的口头、书面或操作过程证据。'
            : '，并说明关键步骤、特征或依据。'
        return {
            component_id: id('lc', record.code, index + 1, sourceLabel),
            label,
            source_statement: sourceLabel,
            condition: scoped.condition,
            description: action,
            component_type: componentType(label),
            observable_evidence: `${action}；优先采集：${excerpt(firstEvidence(record), 120)}。`,
            diagnostic_prompt: `请设计一个不提供完整范例${scoped.condition ? `且符合“${scoped.condition}”` : ''}的诊断任务，要求学生${label}${diagnosticTail}`,
            source_refs: [sourceRef(record, 'standard', sourceClause)],
            method: 'deterministic_clause_decomposition_v2',
            provenance: 'rule_generated',
            confidence: 0.72,
            review_status: 'machine_checked',
            publication_status: 'candidate'
        }
    })
}

function matchedTerms(text, pattern) {
    const terms = []
    const candidates = ['真实', '实际', '生活', '情境', '陌生', '迁移', '综合', '开放', '依据', '理由', '证据',
        '论证', '解释', '说明', '阐释', '推理', '多步', '步骤', '顺序', '过程', '连续', '完整', '比较', '区分',
        '辨析', '异同', '分类', '判断', '图表', '图象', '图像', '模型', '符号', '表示', '表征', '转换', '设计',
        '创作', '方案', '作品', '改进', '优化', '制作', '独立', '自主', '准确', '规范', '熟练', '正确', '安全',
        '同时', '分别', '至少', '不超过', '不少于', '不低于', '每学年', '每周', '每分钟', '不同', '多种',
        '多个', '各种', '恰当', '合理', '清楚', '清晰', '连贯', '稳定', '得体', '有效', '灵活', '协调', '一致', '完整']
    for (const term of candidates) if (text.includes(term) && pattern.test(term)) terms.push(term)
    for (const term of text.match(/\d+\s*[—–~-]\s*\d+\s*(?:字|词|首|件|分钟|次|个)|\d+(?:字|词|首|件|分钟|次|个)(?:以上|左右)?/gu) || []) {
        if (pattern.test(term) && !terms.includes(term)) terms.push(term)
    }
    return terms
}

function buildHardestCases(record, components) {
    const text = compact(record.standard)
    const matches = HARDEST_CASE_RULES.filter(rule => rule.pattern.test(text))
    const rules = matches.length ? matches : [{
        id: components.length > 1 ? 'combined_performance' : 'independent_core_performance',
        title: components.length > 1 ? '整合多个小能力完成完整表现' : '独立完成核心表现',
        demand_dimension: components.length > 1 ? 'integration' : 'independent_performance',
        why_hard: components.length > 1
            ? '标准包含多个可观察动作；学生可能只完成其中一部分，尚未形成完整表现。'
            : '学生在提示下复述或模仿，并不等于能够在新任务中独立、稳定地完成核心表现。',
        diagnostic_focus: components.length > 1
            ? '逐项检查每个小能力，并确认学生能够在同一任务中把它们连贯整合。'
            : '撤去示范与提示，在同构新任务中检查表现是否稳定。',
        pattern: /$^/u
    }]

    return rules.map((rule, index) => {
        const related = components.filter(component => rule.pattern.test(component.label))
        const componentIds = (related.length ? related : components.slice(0, Math.min(3, components.length))).map(item => item.component_id)
        const coveredModifiers = matchedTerms(text, rule.pattern)
        const structure = coveredModifiers.length
            ? `${rule.title}（${coveredModifiers.join('、')}）`
            : components.slice(0, 3).map(item => item.label).join('；')
        return {
            case_id: id('hc', record.code, rule.id, index + 1),
            title: rule.title,
            component_ids: componentIds,
            structure,
            demand_dimension: rule.demand_dimension,
            covered_modifiers: coveredModifiers,
            why_hard: rule.why_hard,
            diagnostic_focus: rule.diagnostic_focus,
            required_student_evidence: components
                .filter(item => componentIds.includes(item.component_id))
                .map(item => item.observable_evidence),
            example_task_stub: `设计一个不提供完整范例的任务，要求学生${components.find(item => componentIds.includes(item.component_id))?.label || cleanComponentLabel(text)}。`,
            source_refs: [sourceRef(record, 'standard')],
            method: 'structural_demand_rules_v2',
            provenance: 'rule_generated',
            confidence: matches.length ? 0.7 : 0.58,
            review_status: 'machine_checked',
            publication_status: 'candidate'
        }
    })
}

function firstTeachingMove(record) {
    const value = String(record.teaching_tip || '')
        .replace(/^教学建议\s*[：:]?\s*/u, '')
        .split(/[；;\n]+/u)
        .map(item => item.trim())
        .find(Boolean)
    return value ? excerpt(value, 110) : ''
}

function buildDifficulties(record, components, hardestCases) {
    // Difficulty categories must be anchored in the official standard clause. The
    // teaching-support `context` field may add examples or implementation advice,
    // but it must not silently introduce a new student difficulty category.
    const text = compact(record.standard)
    const matched = DIFFICULTY_RULES.filter(rule => rule.pattern.test(text))
    const rules = matched.length ? matched : [{
        category: 'performance_stability',
        pattern: /$^/u,
        manifestation: `在提示下能复述要求，但在独立任务中不能稳定完成“${components[0]?.label || cleanComponentLabel(record.standard)}”。`,
        likely_cause: '把听懂或模仿当作掌握，尚未形成可独立调用的判断步骤或表现结构。',
        teacher_action: '先用一个正例和一个近似反例明确成功标准，再逐步撤去提示，并用同构新任务复测。'
    }]
    const teachingMove = firstTeachingMove(record)

    return rules.map((rule, index) => {
        const related = components.filter(component => rule.pattern.test(component.label))
        const componentIds = (related.length ? related : [components[Math.min(index, components.length - 1)]]).filter(Boolean).map(item => item.component_id)
        const targetLabel = components.find(item => componentIds.includes(item.component_id))?.label || components[0]?.label || cleanComponentLabel(record.standard)
        const teacherAction = teachingMove
            ? `围绕“${targetLabel}”，${rule.teacher_action} 可结合本条教学建议：“${teachingMove}”。随后撤去支架，用同构任务复测。`
            : `围绕“${targetLabel}”，${rule.teacher_action} 随后撤去支架，用同构任务复测。`
        return {
            difficulty_id: id('cd', record.code, rule.category, index + 1),
            component_ids: componentIds,
            hardest_case_ids: hardestCases.filter(item => item.component_ids.some(componentId => componentIds.includes(componentId))).map(item => item.case_id),
            category: rule.category,
            manifestation: matched.length ? `在要求学生“${targetLabel}”时，${rule.manifestation}` : rule.manifestation,
            likely_cause: matched.length ? `${rule.likely_cause} 需要结合学生在“${targetLabel}”中的实际过程进一步核验。` : rule.likely_cause,
            teacher_action: teacherAction,
            diagnostic_probe: `给出一个需要学生${targetLabel}的新任务，记录学生从判断到完成的过程，而不只看最终答案。`,
            success_signal: `学生能在撤去提示后${targetLabel}，并说明关键步骤、特征或依据。`,
            source_refs: [sourceRef(record, 'standard'), ...(record.teaching_tip ? [sourceRef(record, 'teaching_tip')] : [])],
            evidence_status: 'rule_inferred_not_frequency_validated',
            frequency_claim: 'not_available',
            method: 'difficulty_pattern_rules_v2',
            provenance: 'rule_generated',
            confidence: matched.length ? 0.66 : 0.54,
            review_status: 'machine_checked',
            publication_status: 'candidate'
        }
    })
}

function loadTextbookDetails(root) {
    const byEdition = new Map()
    const detailRoot = join(root, 'public/data/textbooks/by-edition')
    if (!existsSync(detailRoot)) return byEdition
    for (const file of readdirSync(detailRoot).filter(name => name.endsWith('.json')).sort()) {
        const detail = JSON.parse(readFileSync(join(detailRoot, file), 'utf8'))
        byEdition.set(detail.edition_id || basename(file, '.json'), detail)
    }
    return byEdition
}

function buildCurriculumAlignmentIndexes(root, alignmentPayload) {
    const details = loadTextbookDetails(root)
    const scopesByStandard = new Map()
    const publishedByStandard = new Map()
    const candidatesByStandard = new Map()
    const dispositionByStandard = new Map((alignmentPayload.standard_dispositions || []).map(item => [item.standard_code, item]))

    for (const scope of alignmentPayload.scope_relations || []) {
        const rows = scopesByStandard.get(scope.standard_code) || []
        rows.push(scope)
        scopesByStandard.set(scope.standard_code, rows)
    }
    for (const match of alignmentPayload.matches || []) {
        const target = match.publication_status === 'published' ? publishedByStandard : candidatesByStandard
        const rows = target.get(match.standard_code) || []
        rows.push(match)
        target.set(match.standard_code, rows)
    }
    return { details, scopesByStandard, publishedByStandard, candidatesByStandard, dispositionByStandard }
}

function curriculumAlignments(record, indexes) {
    const published = indexes.publishedByStandard.get(record.code) || []
    const scopes = indexes.scopesByStandard.get(record.code) || []
    const unitRows = published.map(match => {
        const detail = indexes.details.get(match.edition_id) || {}
        const hasPageLocator = Number.isInteger(match.pdf_page)
        return {
            alignment_id: match.alignment_id,
            level: hasPageLocator ? 'unit' : 'unit_topic_candidate',
            relation_type: match.relation_type || 'supports',
            alignment_type: 'supports',
            coverage: 'partial',
            evidence_level: 'L2_topic',
            evidence_basis: match.alignment_method === 'legacy_human_review' ? 'reviewed_toc_title' : 'toc_title',
            edition_id: match.edition_id,
            textbook_title: detail.title || '',
            textbook_subject: detail.subject || '',
            textbook_grade: detail.grade ?? null,
            textbook_volume: detail.volume || '',
            resource_type: detail.resource_type || 'student_textbook',
            revision_status: detail.revision_status || 'revision_unknown',
            unit_id: match.unit_id || null,
            unit_title: match.unit_title || '',
            pdf_page: match.pdf_page ?? null,
            printed_page: match.printed_page === null || match.printed_page === undefined ? null : String(match.printed_page),
            evidence_role: match.evidence_role,
            evidence_refs: [match.evidence_id, `textbook-unit:${match.unit_id}`].filter(Boolean),
            confidence: match.confidence,
            rationale: match.rationale,
            evidence_gap: '当前证据来自目录标题与课标概念匹配，尚未保存教材正文或练习摘录；因此只能声明主题支持，不能声明完整教授。',
            method: match.alignment_method,
            algorithm_version: match.algorithm_version,
            review_status: hasPageLocator ? match.review_status : 'candidate',
            publication_status: hasPageLocator ? match.publication_status : 'review_queue'
        }
    })
    const scopeRows = scopes.map(scope => {
        const detail = indexes.details.get(scope.edition_id) || {}
        return {
            alignment_id: id('ca', scope.scope_id, record.code),
            scope_id: scope.scope_id,
            level: 'scope',
            relation_type: 'curriculum_scope',
            alignment_type: 'references',
            coverage: 'scope_only',
            evidence_level: 'L1_scope',
            evidence_basis: 'subject_grade_scope',
            edition_id: scope.edition_id,
            textbook_title: detail.title || '',
            textbook_subject: detail.subject || '',
            textbook_grade: detail.grade ?? null,
            textbook_volume: detail.volume || '',
            resource_type: detail.resource_type || 'student_textbook',
            revision_status: detail.revision_status || 'revision_unknown',
            unit_id: null,
            unit_title: '',
            pdf_page: null,
            printed_page: null,
            evidence_role: scope.evidence_role,
            evidence_refs: [detail.evidence_id].filter(Boolean),
            confidence: null,
            rationale: '教材与课标处于同学科、同学段的适用范围；此关系不证明某一单元直接教授该条标准。',
            method: 'subject_grade_scope_mapping',
            algorithm_version: scope.algorithm_version,
            review_status: scope.review_status,
            publication_status: 'published_scope'
        }
    })
    return [...unitRows, ...scopeRows].sort((left, right) => {
        const rank = { unit: 0, unit_topic_candidate: 1, scope: 2 }
        const level = (rank[left.level] ?? 9) - (rank[right.level] ?? 9)
        return level || left.edition_id.localeCompare(right.edition_id) || String(left.unit_id || '').localeCompare(String(right.unit_id || ''))
    })
}

function alignmentSummary(record, indexes) {
    const disposition = indexes.dispositionByStandard.get(record.code) || {}
    const published = indexes.publishedByStandard.get(record.code) || []
    const candidates = indexes.candidatesByStandard.get(record.code) || []
    const scopes = indexes.scopesByStandard.get(record.code) || []
    const locatable = published.filter(item => Number.isInteger(item.pdf_page))
    const unlocatable = published.filter(item => !Number.isInteger(item.pdf_page))
    return {
        disposition: locatable.length
            ? 'unit_aligned'
            : unlocatable.length
              ? 'unit_topic_needs_page_evidence'
              : disposition.status || (scopes.length ? 'scope_aligned_no_unit_evidence' : 'gap_no_textbook_scope'),
        highest_evidence_level: locatable.length ? 'L2_topic' : scopes.length ? 'L1_scope' : 'L0_gap',
        specific_count: locatable.length,
        unit_topic_candidate_count: unlocatable.length,
        candidate_count: candidates.length + unlocatable.length,
        scope_count: scopes.length,
        gap_reason: disposition.gap_reason || (!scopes.length ? '当前教材库没有与该学科、学段匹配的教材范围；不补造关系。' : null),
        evidence_note: locatable.length
            ? '已有公开单元主题关系；仍需教材正文、练习或教师用书的页内证据，才能提升到可教学落实。'
            : unlocatable.length
              ? '已有目录主题候选，但缺少可靠 PDF 页定位，已降级进入补证队列。'
            : scopes.length
              ? '已关联适用教材范围，但尚无可靠单元级页内证据。'
              : '当前教材库无适用范围，保留明确缺口。'
    }
}

function loadApprovedPrerequisites(root) {
    const kgRoot = join(root, 'public/data/knowledge_graph')
    const nodesById = new Map()
    const approvedByTargetCode = new Map()
    if (!existsSync(kgRoot)) return approvedByTargetCode

    const nodeRoot = join(kgRoot, 'nodes_by_subject')
    if (existsSync(nodeRoot)) {
        for (const file of readdirSync(nodeRoot).filter(name => name.endsWith('.json')).sort()) {
            const payload = JSON.parse(readFileSync(join(nodeRoot, file), 'utf8'))
            for (const node of payload.knowledgePoints || []) nodesById.set(node.id, node)
        }
    }
    const edgeRoot = join(kgRoot, 'prerequisite_edges_by_subject')
    if (!existsSync(edgeRoot)) return approvedByTargetCode
    for (const file of readdirSync(edgeRoot).filter(name => name.endsWith('.json')).sort()) {
        const payload = JSON.parse(readFileSync(join(edgeRoot, file), 'utf8'))
        for (const edge of payload.prerequisites || []) {
            if (edge.reviewStatus !== 'approved' || !(edge.evidenceRefs || []).length) continue
            const source = nodesById.get(edge.source)
            const target = nodesById.get(edge.target)
            const sourceCode = source?.standardCodes?.[0]
            const targetCode = target?.standardCodes?.[0]
            if (!sourceCode || !targetCode) continue
            const rows = approvedByTargetCode.get(targetCode) || []
            rows.push({ edge, sourceCode, targetCode, source, target })
            approvedByTargetCode.set(targetCode, rows)
        }
    }
    return approvedByTargetCode
}

function buildRecordIndexes(records) {
    const byCode = new Map(records.map(record => [record.code, record]))
    const aliases = new Map()
    for (const record of records) {
        for (const alias of [record.id, record.legacy_code, ...(Array.isArray(record.legacy_codes) ? record.legacy_codes : [])]) {
            if (alias && !aliases.has(String(alias))) aliases.set(String(alias), record.code)
        }
    }
    function resolveCode(value) {
        return byCode.has(value) ? value : aliases.get(value) || null
    }
    return { byCode, resolveCode }
}

function labelFor(record) {
    return excerpt(record?.standard || record?.standard_title || record?.code || '', 72)
}

function verifiedPrerequisites(record, approvedByTargetCode, recordIndexes) {
    return (approvedByTargetCode.get(record.code) || []).map(item => ({
        edge_id: item.edge.id,
        source_code: item.sourceCode,
        target_code: item.targetCode,
        source_label: labelFor(recordIndexes.byCode.get(item.sourceCode)),
        target_label: labelFor(record),
        necessity: item.edge.necessity,
        rationale: item.edge.rationale,
        evidence_refs: item.edge.evidenceRefs,
        confidence: item.edge.confidence,
        method: item.edge.method || 'expert_review',
        provenance: item.edge.provenance || 'editorial',
        review_status: 'approved',
        publication_status: 'published'
    }))
}

function prerequisiteCandidates(record, recordIndexes) {
    const rows = []
    for (const raw of splitReferences(record.previous_code)) {
        const sourceCode = recordIndexes.resolveCode(raw)
        if (!sourceCode) continue
        rows.push({
            edge_id: id('pc', sourceCode, record.code, 'sequence'),
            source_code: sourceCode,
            target_code: record.code,
            source_label: labelFor(recordIndexes.byCode.get(sourceCode)),
            target_label: labelFor(record),
            necessity: 'undetermined',
            failure_if_missing: '尚未由专家核验；不能据此声称缺少该条目会阻断当前学习。',
            rationale: '来自现有课程标准前后条目字段，只表示课程顺序候选，不等同于已验证的认知前提。',
            evidence_refs: [`standard:${record.code}:previous_code`],
            relation_type: 'curriculum_sequence_candidate',
            method: 'source_navigation_field',
            provenance: 'extracted',
            confidence: 'medium',
            review_status: 'candidate',
            publication_status: 'review_queue'
        })
    }
    for (const bridge of Array.isArray(record.progression_bridge_candidates) ? record.progression_bridge_candidates : []) {
        const sourceCode = recordIndexes.resolveCode(bridge.h3_code)
        if (!sourceCode) continue
        rows.push({
            edge_id: id('pc', sourceCode, record.code, 'grade_bridge'),
            source_code: sourceCode,
            target_code: record.code,
            source_label: labelFor(recordIndexes.byCode.get(sourceCode)),
            target_label: labelFor(record),
            necessity: 'undetermined',
            failure_if_missing: '这是跨学段进阶候选，尚未核验为必要前提。',
            rationale: bridge.rationale || '基于同学科、同领域的跨学段进阶相似度产生，需专家核验。',
            evidence_refs: [`standard:${record.code}:progression_bridge_candidates`],
            relation_type: 'grade_band_bridge_candidate',
            method: bridge.method || 'progression_bridge_candidate',
            provenance: 'rule_generated',
            confidence: bridge.confidence || 'low',
            confidence_score: bridge.score ?? null,
            review_status: 'candidate',
            publication_status: 'review_queue'
        })
    }
    return [...new Map(rows.map(item => [item.edge_id, item])).values()].sort((left, right) => left.source_code.localeCompare(right.source_code))
}

function prerequisiteReviewCoverage(verified, candidates) {
    return {
        status: 'not_measured',
        reviewed_candidate_count: null,
        total_candidate_count: candidates.length,
        verified_edge_count: verified.length,
        explicit_no_prerequisite_decision: false,
        note: '当前没有逐标准、逐候选的专家审核覆盖台账；不能根据已批准边数量推断审核是否完成。'
    }
}

function buildBridgeForwardIndex(records, recordIndexes) {
    const bySource = new Map()
    for (const target of records) {
        for (const bridge of Array.isArray(target.progression_bridge_candidates) ? target.progression_bridge_candidates : []) {
            const sourceCode = recordIndexes.resolveCode(bridge.h3_code)
            if (!sourceCode) continue
            const rows = bySource.get(sourceCode) || []
            rows.push({ target, bridge })
            bySource.set(sourceCode, rows)
        }
    }
    return bySource
}

function forwardConnections(record, recordIndexes, bridgeForwardIndex) {
    const rows = []
    for (const raw of splitReferences(record.next_code)) {
        const targetCode = recordIndexes.resolveCode(raw)
        if (!targetCode) continue
        const target = recordIndexes.byCode.get(targetCode)
        rows.push({
            connection_id: id('fc', record.code, targetCode, 'sequence'),
            source_code: record.code,
            target_code: targetCode,
            target_label: labelFor(target),
            relation_type: 'curriculum_sequence_candidate',
            expected_grade_distance: target?.grade_level && record.grade_level ? target.grade_level - record.grade_level : null,
            rationale: '来自课程标准前后条目字段，表示典型课程顺序方向；不自动构成硬前置关系。',
            evidence_refs: [`standard:${record.code}:next_code`],
            method: 'source_navigation_field',
            provenance: 'extracted',
            confidence: 'medium',
            review_status: 'machine_checked',
            publication_status: 'candidate'
        })
    }
    for (const { target, bridge } of bridgeForwardIndex.get(record.code) || []) {
        rows.push({
            connection_id: id('fc', record.code, target.code, 'grade_bridge'),
            source_code: record.code,
            target_code: target.code,
            target_label: labelFor(target),
            relation_type: 'grade_band_bridge_candidate',
            expected_grade_distance: null,
            rationale: bridge.rationale || '基于同学科、同领域的跨学段进阶相似度产生，需专家核验。',
            evidence_refs: [`standard:${target.code}:progression_bridge_candidates`],
            method: bridge.method || 'progression_bridge_candidate',
            provenance: 'rule_generated',
            confidence: bridge.confidence || 'low',
            confidence_score: bridge.score ?? null,
            review_status: 'machine_checked',
            publication_status: 'candidate'
        })
    }
    return [...new Map(rows.map(item => [item.connection_id, item])).values()].sort((left, right) => left.target_code.localeCompare(right.target_code))
}

export function loadCanonicalStandards(rootInput) {
    const root = resolve(rootInput)
    const bySubjectRoot = join(root, 'data/internal/by_subject')
    const sources = new Map()
    for (const file of readdirSync(bySubjectRoot).filter(name => name.endsWith('.json')).sort()) {
        sources.set(file, JSON.parse(readFileSync(join(bySubjectRoot, file), 'utf8')))
    }
    const records = [...sources.values()].flatMap(payload => payload.standards || []).sort((left, right) => left.code.localeCompare(right.code))
    return { root, bySubjectRoot, sources, records }
}

export function buildCapabilityGraph(rootInput) {
    const canonical = loadCanonicalStandards(rootInput)
    const alignmentPath = join(canonical.root, 'data/textbooks/derived/textbook_standard_alignment_index.json')
    if (!existsSync(alignmentPath)) throw new Error(`缺少教材课标关联索引：${alignmentPath}`)
    const alignmentRaw = readFileSync(alignmentPath, 'utf8')
    const alignmentPayload = JSON.parse(alignmentRaw)
    const alignmentIndexes = buildCurriculumAlignmentIndexes(canonical.root, alignmentPayload)
    const approvedPrerequisites = loadApprovedPrerequisites(canonical.root)
    const recordIndexes = buildRecordIndexes(canonical.records)
    const bridgeForwardIndex = buildBridgeForwardIndex(canonical.records, recordIndexes)
    const graphByCode = new Map()

    for (const record of canonical.records) {
        const learningComponents = buildLearningComponents(record)
        const hardestCases = buildHardestCases(record, learningComponents)
        const verified = verifiedPrerequisites(record, approvedPrerequisites, recordIndexes)
        const candidates = prerequisiteCandidates(record, recordIndexes)
        graphByCode.set(record.code, {
            capability_graph_schema_version: CAPABILITY_GRAPH_SCHEMA_VERSION,
            capability_graph_method: GENERATION_METHOD,
            source_standard_hash: sha256(compact(record.standard)),
            learning_components: learningComponents,
            verified_prerequisites: verified,
            prerequisite_candidates: candidates,
            prerequisite_review_coverage: prerequisiteReviewCoverage(verified, candidates),
            hardest_cases: hardestCases,
            common_difficulties: buildDifficulties(record, learningComponents, hardestCases),
            curriculum_alignments: curriculumAlignments(record, alignmentIndexes),
            curriculum_alignment_summary: alignmentSummary(record, alignmentIndexes),
            forward_connections: forwardConnections(record, recordIndexes, bridgeForwardIndex)
        })
    }

    const coreFingerprintPayload = canonical.records.map(record => Object.fromEntries(CORE_FINGERPRINT_FIELDS.map(field => [field, record[field] ?? null])))
    const sourceFingerprint = sha256(JSON.stringify(stable(coreFingerprintPayload)))
    // The upstream alignment builder refreshes generated_at on every run. It is
    // not evidence and must not make an otherwise identical capability graph
    // appear to be a new semantic build.
    const { generated_at: _alignmentGeneratedAt, ...alignmentFingerprintPayload } = alignmentPayload
    const alignmentFingerprint = sha256(JSON.stringify(stable(alignmentFingerprintPayload)))
    const subjectCounts = {}
    const totals = {
        standards: canonical.records.length,
        learning_components: 0,
        verified_prerequisites: 0,
        prerequisite_candidates: 0,
        hardest_cases: 0,
        common_difficulties: 0,
        unit_alignments: 0,
        unit_topic_candidates: 0,
        scope_alignments: 0,
        alignment_gaps: 0,
        forward_connections: 0
    }
    for (const record of canonical.records) {
        const graph = graphByCode.get(record.code)
        const subject = subjectCounts[record.subject_slug] ||= { standards: 0, learning_components: 0, unit_alignments: 0, scope_alignments: 0, gaps: 0 }
        subject.standards += 1
        subject.learning_components += graph.learning_components.length
        subject.unit_alignments += graph.curriculum_alignments.filter(item => item.level === 'unit').length
        subject.unit_topic_candidates = (subject.unit_topic_candidates || 0) + graph.curriculum_alignments.filter(item => item.level === 'unit_topic_candidate').length
        subject.scope_alignments += graph.curriculum_alignments.filter(item => item.level === 'scope').length
        subject.gaps += graph.curriculum_alignment_summary.disposition === 'gap_no_textbook_scope' ? 1 : 0
        totals.learning_components += graph.learning_components.length
        totals.verified_prerequisites += graph.verified_prerequisites.length
        totals.prerequisite_candidates += graph.prerequisite_candidates.length
        totals.hardest_cases += graph.hardest_cases.length
        totals.common_difficulties += graph.common_difficulties.length
        totals.unit_alignments += graph.curriculum_alignments.filter(item => item.level === 'unit').length
        totals.unit_topic_candidates += graph.curriculum_alignments.filter(item => item.level === 'unit_topic_candidate').length
        totals.scope_alignments += graph.curriculum_alignments.filter(item => item.level === 'scope').length
        totals.alignment_gaps += graph.curriculum_alignment_summary.disposition === 'gap_no_textbook_scope' ? 1 : 0
        totals.forward_connections += graph.forward_connections.length
    }

    const manifest = {
        schema_version: CAPABILITY_GRAPH_SCHEMA_VERSION,
        generation_method: GENERATION_METHOD,
        source_fingerprint: sourceFingerprint,
        alignment_fingerprint: alignmentFingerprint,
        build_id: `capability-graph-${sha256(GENERATION_METHOD).slice(0, 8)}-${sourceFingerprint.slice(0, 10)}-${alignmentFingerprint.slice(0, 10)}`,
        official_standard_text_policy: 'preserved_unchanged',
        prerequisite_policy: 'verified_prerequisites_accept_only_approved_evidence_backed_edges',
        alignment_policy: {
            L0_gap: '当前教材库无同学科同学段范围；明确记录缺口。',
            L1_scope: '同学科同学段适用范围，不构成具体单元证据。',
            L2_topic: '目录标题或人工主题关联，可声明主题支持，不声明完整教授。',
            L3_page_evidence: '保留给正文、练习、摘录哈希和页码齐全的机器核验关系。',
            L4_teacher_guide: '保留给教师用书与教材正文交叉印证并经人工审核的关系。',
            L5_official_crosswalk: '保留给出版方或官方明示的课标映射。'
        },
        design_references: [
            'https://www.anthropic.com/news/claude-for-teachers',
            'https://github.com/anthropics/k12-teacher-skills',
            'https://github.com/learning-commons-org/knowledge-graph',
            'https://github.com/oaknational/oak-ai-lesson-assistant',
            'https://www.1edtech.org/standards/case/about',
            'https://github.com/opensalt/opensalt',
            'https://github.com/haolpku/K12-Dataset'
        ],
        totals,
        subjects: subjectCounts
    }
    const reviewQueue = {
        schema_version: CAPABILITY_GRAPH_SCHEMA_VERSION,
        build_id: manifest.build_id,
        policy: 'A candidate can move into verified_prerequisites only after evidence review and expert approval. Sequence alone is insufficient.',
        required_confirmations: [
            'source_and_target_are_correctly_identified',
            'missing_source_capability_causes_an_observable_failure_on_target',
            'necessity_is_hard_soft_or_recommended',
            'evidence_refs_are_directly_reviewable',
            'edge_does_not_create_a_cycle'
        ],
        candidates: canonical.records.flatMap(record => graphByCode.get(record.code).prerequisite_candidates.map(candidate => ({
            ...candidate,
            review_decision: null,
            reviewer: null,
            reviewed_at: null
        })))
    }

    return { ...canonical, graphByCode, manifest, reviewQueue, alignmentPayload }
}
