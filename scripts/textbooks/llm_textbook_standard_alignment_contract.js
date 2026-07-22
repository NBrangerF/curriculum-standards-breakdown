import { createHash } from 'node:crypto'
import Ajv from 'ajv'

export const LLM_ALIGNMENT_SCHEMA_VERSION = '1.0.0'
export const LLM_ALIGNMENT_PROMPT_VERSION = 'textbook-standard-semantic-adjudicator-v1.3.0'
export const LLM_ALIGNMENT_PROVIDER = 'openai_responses'
export const LLM_ALIGNMENT_PROVIDERS = ['openai_responses', 'codex_cli']

export const ALIGNMENT_RELATION_TYPES = [
  'supports',
  'practices',
  'assesses',
  'mentions',
  'contextualizes'
]

const NULLABLE_RELATION_TYPE = {
  anyOf: [
    { type: 'string', enum: ALIGNMENT_RELATION_TYPES },
    { type: 'null' }
  ]
}

const NULLABLE_EVIDENCE_LEVEL = {
  anyOf: [
    { type: 'string', enum: ['L2', 'L3'] },
    { type: 'null' }
  ]
}

const NULLABLE_STRING = {
  anyOf: [
    { type: 'string' },
    { type: 'null' }
  ]
}

/**
 * Strict Structured Outputs schema sent to the Responses API.
 *
 * Every candidate must receive an explicit model decision. The orchestrator
 * never fills in accept/reject/relation_type/rationale using local rules.
 */
export const LLM_ALIGNMENT_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schema_version: { type: 'string', const: LLM_ALIGNMENT_SCHEMA_VERSION },
    items: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          item_id: { type: 'string', minLength: 1, maxLength: 180 },
          overall_decision: { type: 'string', enum: ['evaluated', 'abstain'] },
          overall_rationale: { type: 'string', minLength: 4, maxLength: 500 },
          decisions: {
            type: 'array',
            maxItems: 80,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                candidate_id: { type: 'string', minLength: 1, maxLength: 180 },
                standard_code: { type: 'string', minLength: 1, maxLength: 80 },
                decision: { type: 'string', enum: ['accept', 'reject', 'abstain'] },
                relation_type: NULLABLE_RELATION_TYPE,
                evidence_level: NULLABLE_EVIDENCE_LEVEL,
                evidence_span_id: NULLABLE_STRING,
                evidence_quote: { type: 'string', maxLength: 320 },
                learning_component_ids: {
                  type: 'array',
                  maxItems: 12,
                  items: { type: 'string', minLength: 1, maxLength: 120 }
                },
                rationale: { type: 'string', minLength: 8, maxLength: 600 }
              },
              required: [
                'candidate_id',
                'standard_code',
                'decision',
                'relation_type',
                'evidence_level',
                'evidence_span_id',
                'evidence_quote',
                'learning_component_ids',
                'rationale'
              ]
            }
          }
        },
        required: ['item_id', 'overall_decision', 'overall_rationale', 'decisions']
      }
    }
  },
  required: ['schema_version', 'items']
}

export const LLM_ALIGNMENT_INSTRUCTIONS = `你是 kebiao 的“教材内容—课程标准”语义裁决器。你只能依据输入中的教材逐字证据与候选课标裁决，不得补写教材事实、课标内容或页码。

任务边界：
1. 本地系统只负责同学科/同学段候选召回；候选出现不代表语义相关。你必须独立输出每个候选的 accept、reject 或 abstain。
2. accept 只在教材证据直接、具体地覆盖课标的学习对象与动作要求，并且知识结构和适用情境相容时使用。每个 discovery item 包含该 logical evidence 的完整候选 scope；你必须在这整个候选集合上采用“最小充分且非冗余”原则，只接受能够由证据分别证明的最具体、最少集合。若上位课标、近义课标或重复课标没有独立要求被同一证据直接落实，必须 reject，不得为了覆盖率一并接受。即使较宽候选在抽象层面能够概括同一证据，只要同一 item 已有更具体候选完整覆盖教材正在执行的动作，而较宽候选没有新增、可单独指出的教材动作，就必须 reject 较宽候选。
3. 对 accept 的 learning_component_ids 也必须逐项执行同一原则。每个被选组件都要由所引逐字证据单独证明，不得因为它与已证明组件同属一条课标而一并选择。learning_component 是不可拆的最小发布单位：用“和、及、并”、顿号或多个谓词构成的合取要求必须全部有证据；明确以“或”给出可替代路径的析取要求，至少完整落实其中一个分支。不得把合取自行改写成析取，也不得把一个组件切成输入中不存在的更小组件。只落实合取要求的一部分时必须排除整个组件，不能在 rationale 中自行缩窄或改写组件含义。一个 accept 只能选择一个 evidence span 和其中的连续逐字 quote；这个单一证据必须足以证明该 accept 选择的全部组件，不得暗用未引用 span 拼接证明。例如，只展示或书写数不能证明包含“认、读、写”的组合组件，只要求记笔记不能证明写出描述性语篇。
4. 必须区分同名词在不同机制中的含义，例如代数对象与几何对象、细胞代谢与生态系统能量流动、一般农业科技与航天技术、化学方程式计量与相对分子质量计算。数量级、运算对象和动作也必须逐项相符：教材中的两位数乘两位数不能证明两位数乘除三位数；大数意义、数位顺序或书写不能自动证明认读写的全部动作；认读大数不能自动证明以“万、亿”为单位改写。这里只说明判别维度，不预先指定任何输入的答案。
5. 共享“性质、能量、计算、技术、活动、完成任务”等泛词、学科或单元背景、宽泛主题、情境装饰、相邻知识、仅有答案或解析结果，都不能单独构成 accept。词义、短语或习语释义及其局部用法不能自动证明学习者能够分析、概括或迁移“语法形式—意义—使用关系”；除非证据明确把任务组织为语法分析、比较、归纳或迁移。文化人物或作品事实不能自动证明文化认同、文化自信或跨文化评价；模拟某种演奏不能自动证明制作或使用自制乐器；人声“伴唱”不能自动证明器乐“伴奏”或“配乐”。答案页只有在同一 evidence span 同时保留了可识别的原题/任务、学习对象和目标动作时才可作为证据；否则 reject，若 OCR 或上下文残缺到无法判断则 abstain。
6. 证据不足、OCR 残缺、候选标准过宽、只能猜测具体教学意图时必须 abstain，不要为了覆盖率接受。若证据足以表明只是背景、泛化或不相关内容，则 reject，而不是 abstain。
   候选的 context、grade、grade_level、grade_range、grade_specific_focus、art_discipline_tag、discipline、display_subcategory 和 subdomain 是适用性约束，不是装饰信息。若教材年级或门类与这些显式约束冲突，必须 reject；不得只因 grade_band 编码相同而忽略冲突。
7. reject 表示现有证据足以判断“不对应”；abstain 表示证据不足以可靠判断。overall_decision=abstain 时，该 item 的所有候选也必须 abstain。
8. accept 时 relation_type、evidence_level、evidence_span_id、evidence_quote 和 learning_component_ids 均由你选择。evidence_quote 必须逐字复制自所选 evidence span，learning_component_ids 必须来自该候选。L2 只表示目录/标题直接点明相同学习对象；L3 表示正文目标、讲解、活动、练习或评价任务的页内证据。teaches 不可用，因为本批次没有教师用书或官方 crosswalk 证据。
   当 unit.assignment_status=unassigned_page_only 时，该 ID 只是页窗口容器，不是正式教材单元；若 accept，必须选择 L3，不得声称已定位正式单元。
9. 必须按以下顺序裁决，不得先选择宽泛课标再用 rationale 合理化：先检查每个 learning_component 是否被逐字证据完整蕴含；再在同一 item 的候选之间执行具体候选优先和 dominance 去冗余；最后才判断 relation_type。
10. relation_type 必须严格按教材证据正在做的主要教学功能选择，不能按课标措辞猜测：
   - supports：正文直接定义、解释、示范或组织理解该学习对象/要求；
   - practices：学生被要求练习或实施该目标动作，且不是以检验、评分、选择优劣或评价达成为主要目的；
   - assesses：以检测、评分、教师/同伴评选或达成判断为主要目的的任务要求学生展示该目标能力；普通无评分练习题仍是 practices，答案/解析页本身不算 assesses；
   - mentions：完整、明确地出现相同学习对象，但没有讲解、练习或评价；仅共享泛词或背景主题必须 reject；
   - contextualizes：该精确学习对象被置于有实质作用的应用情境中，但不是本页主要教学目标；仅有故事、插图、学科背景或相邻主题必须 reject。
   每个 accept 只选一个最贴近当前证据主要功能的 relation_type；不得用 mentions/contextualizes 为本应 reject 的弱关联兜底。
11. reject/abstain 时 relation_type、evidence_level、evidence_span_id 必须为 null，evidence_quote 必须为空字符串，learning_component_ids 必须为空数组。
12. rationale 必须说明教材证据与课标对象/动作/机制为什么相容、不相容或为何不足；accept 还必须说明为何所选 relation_type 是该证据的主要教学功能，以及为何不是更宽泛或重复候选。不得使用“相似度高”“系统判定”等空泛表述，不得生成数值分数或 confidence。
13. 每个输入 candidate 必须恰好返回一次，candidate_id、standard_code、item_id 必须原样返回。只返回符合 JSON Schema 的对象。`

const ajv = new Ajv({ allErrors: true, strict: true })
const validateSchema = ajv.compile(LLM_ALIGNMENT_OUTPUT_SCHEMA)

export function normalizeAlignmentText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u2000-\u200f\u2028-\u202f\u2060\ufeff]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
}

export function stableCanonicalJson(value) {
  return JSON.stringify(canonicalize(value))
}

export function alignmentInputHash({ provider = LLM_ALIGNMENT_PROVIDER, model, items }) {
  return createHash('sha256').update(stableCanonicalJson({
    provider,
    prompt_version: LLM_ALIGNMENT_PROMPT_VERSION,
    schema_version: LLM_ALIGNMENT_SCHEMA_VERSION,
    instructions: LLM_ALIGNMENT_INSTRUCTIONS,
    output_schema: LLM_ALIGNMENT_OUTPUT_SCHEMA,
    model,
    items
  })).digest('hex')
}

export function stableAlignmentId(...parts) {
  return `tca_llm_${createHash('sha256').update(parts.map(value => String(value ?? '')).join('\u001f')).digest('hex').slice(0, 20)}`
}

export function stableDecisionId(inputHash, itemId, candidateId) {
  return `llmd_${createHash('sha256').update([inputHash, itemId, candidateId].map(value => String(value ?? '')).join('\u001f')).digest('hex').slice(0, 20)}`
}

function describeAjvErrors(errors = []) {
  return errors.slice(0, 12).map(error => `${error.instancePath || '/'} ${error.message || 'is invalid'}`)
}

/**
 * Validate both the JSON Schema and the request-dependent invariants which a
 * static schema cannot express (candidate coverage, exact quotes, ID subsets).
 */
export function validateAlignmentModelOutput(value, requestItems) {
  const errors = []
  if (!validateSchema(value)) errors.push(...describeAjvErrors(validateSchema.errors))
  if (errors.length) return { ok: false, errors, value: null }

  const expectedItems = new Map(requestItems.map(item => [item.item_id, item]))
  const actualItems = new Map()
  for (const item of value.items) {
    if (actualItems.has(item.item_id)) errors.push(`duplicate item_id: ${item.item_id}`)
    actualItems.set(item.item_id, item)
  }
  for (const itemId of expectedItems.keys()) {
    if (!actualItems.has(itemId)) errors.push(`missing item_id: ${itemId}`)
  }
  for (const itemId of actualItems.keys()) {
    if (!expectedItems.has(itemId)) errors.push(`unexpected item_id: ${itemId}`)
  }

  for (const [itemId, expected] of expectedItems) {
    const actual = actualItems.get(itemId)
    if (!actual) continue
    const candidates = new Map(expected.candidates.map(candidate => [candidate.candidate_id, candidate]))
    const evidence = new Map(expected.evidence.map(span => [span.evidence_span_id, span]))
    const decisions = new Map()
    for (const decision of actual.decisions) {
      if (decisions.has(decision.candidate_id)) errors.push(`duplicate candidate_id in ${itemId}: ${decision.candidate_id}`)
      decisions.set(decision.candidate_id, decision)
      const candidate = candidates.get(decision.candidate_id)
      if (!candidate) {
        errors.push(`unexpected candidate_id in ${itemId}: ${decision.candidate_id}`)
        continue
      }
      if (candidate.standard_code !== decision.standard_code) {
        errors.push(`standard_code mismatch for ${decision.candidate_id}`)
      }
      const allowedComponents = new Set(candidate.learning_components.map(component => component.component_id))
      if (decision.learning_component_ids.some(id => !allowedComponents.has(id))) {
        errors.push(`unknown learning_component_id for ${decision.candidate_id}`)
      }

      if (decision.decision === 'accept') {
        if (!decision.relation_type) errors.push(`accept requires relation_type for ${decision.candidate_id}`)
        if (!decision.evidence_level) errors.push(`accept requires evidence_level for ${decision.candidate_id}`)
        if (!decision.evidence_span_id || !evidence.has(decision.evidence_span_id)) {
          errors.push(`accept requires a request evidence_span_id for ${decision.candidate_id}`)
        } else {
          const source = String(evidence.get(decision.evidence_span_id).excerpt)
          const quote = String(decision.evidence_quote)
          if (!quote || !source.includes(quote)) errors.push(`evidence_quote is not verbatim for ${decision.candidate_id}`)
        }
        if (!decision.learning_component_ids.length) {
          errors.push(`accept requires at least one learning_component_id for ${decision.candidate_id}`)
        }
        if (expected.unit?.assignment_status === 'unassigned_page_only' && decision.evidence_level !== 'L3') {
          errors.push(`page-only discovery accept requires L3 evidence for ${decision.candidate_id}`)
        }
      } else if (
        decision.relation_type !== null
        || decision.evidence_level !== null
        || decision.evidence_span_id !== null
        || decision.evidence_quote !== ''
        || decision.learning_component_ids.length !== 0
      ) {
        errors.push(`${decision.decision} must not carry semantic alignment fields for ${decision.candidate_id}`)
      }
    }
    for (const candidateId of candidates.keys()) {
      if (!decisions.has(candidateId)) errors.push(`missing candidate decision in ${itemId}: ${candidateId}`)
    }
    if (actual.overall_decision === 'abstain' && actual.decisions.some(decision => decision.decision !== 'abstain')) {
      errors.push(`overall abstain requires all candidate decisions to abstain in ${itemId}`)
    }
  }

  return errors.length
    ? { ok: false, errors, value: null }
    : { ok: true, errors: [], value }
}

export function makeAlignmentResponseInput(items) {
  return JSON.stringify({
    task: 'adjudicate_textbook_standard_candidates',
    prompt_version: LLM_ALIGNMENT_PROMPT_VERSION,
    schema_version: LLM_ALIGNMENT_SCHEMA_VERSION,
    items
  })
}
