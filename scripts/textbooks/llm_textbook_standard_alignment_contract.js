import { createHash } from 'node:crypto'
import Ajv from 'ajv'

export const LLM_ALIGNMENT_SCHEMA_VERSION = '1.0.0'
export const LLM_ALIGNMENT_PROMPT_VERSION = 'textbook-standard-semantic-adjudicator-v1.0.0'
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
            maxItems: 40,
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
2. accept 只在教材证据与课标的学习对象、动作要求、知识结构和适用情境都相容时使用。共享“性质、能量、计算、技术、活动、完成任务”等泛词不能构成 accept。
3. 必须区分同名词在不同机制中的含义，例如代数对象与几何对象、细胞代谢与生态系统能量流动、一般农业科技与航天技术、化学方程式计量与相对分子质量计算。这里只说明判别维度，不预先指定任何输入的答案。
4. 证据不足、OCR 残缺、候选标准过宽、只能猜测具体教学意图时必须 abstain，不要为了覆盖率接受。
5. reject 表示现有证据足以判断“不对应”；abstain 表示证据不足以可靠判断。overall_decision=abstain 时，该 item 的所有候选也必须 abstain。
6. accept 时 relation_type、evidence_level、evidence_span_id、evidence_quote 和 learning_component_ids 均由你选择。evidence_quote 必须逐字复制自所选 evidence span，learning_component_ids 必须来自该候选。L2 只表示目录/标题主题支持；L3 表示正文目标、活动、练习或评价任务的页内证据。teaches 不可用，因为本批次没有教师用书或官方 crosswalk 证据。
   当 unit.assignment_status=unassigned_page_only 时，该 ID 只是页窗口容器，不是正式教材单元；若 accept，必须选择 L3，不得声称已定位正式单元。
7. reject/abstain 时 relation_type、evidence_level、evidence_span_id 必须为 null，evidence_quote 必须为空字符串，learning_component_ids 必须为空数组。
8. rationale 必须说明教材证据与课标对象/动作/机制为什么相容、不相容或为何不足；不得使用“相似度高”“系统判定”等空泛表述，不得生成数值分数或 confidence。
9. 每个输入 candidate 必须恰好返回一次，candidate_id、standard_code、item_id 必须原样返回。只返回符合 JSON Schema 的对象。`

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
