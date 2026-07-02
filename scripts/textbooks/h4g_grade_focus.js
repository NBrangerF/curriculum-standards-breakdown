const H4G_GRADE_LABELS = {
  H4G7: '七年级',
  H4G8: '八年级',
  H4G9: '九年级'
}

const GENERIC_KEYWORDS = new Set([
  '了解',
  '知道',
  '理解',
  '认识',
  '掌握',
  '应用',
  '运用',
  '观察',
  '实验',
  '探究',
  '活动',
  '问题',
  '方法',
  '概念',
  '规律',
  '模型',
  '学生',
  '学习',
  '科学',
  '数学'
])

const LEADING_ACTION_WORD_PATTERN = /^(了解|知道|理解|认识|掌握|应用|运用|观察|实验|探究|根据)/
const FRAGMENT_PREFIX_PATTERN = /^据[\u4e00-\u9fff]{1,4}$/

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2')
    .replace(/\s*\/\s*$/g, '')
    .trim()
}

function cleanTopic(value) {
  return cleanText(value)
    .replace(/^[（(]?\d+([.．、-]\d+)?[）)]?\s*/g, '')
    .replace(/^第[一二三四五六七八九十]+节\s*/g, '')
    .replace(/^第\d+节\s*/g, '')
    .trim()
}

function cleanKeyword(value) {
  return cleanTopic(value)
    .replace(LEADING_ACTION_WORD_PATTERN, '')
    .replace(/^识(?=[\u4e00-\u9fff])/g, '')
    .replace(/^的+/g, '')
    .trim()
}

function gradeLabel(record = {}) {
  return cleanText(record.grade) || H4G_GRADE_LABELS[record.grade_band] || cleanText(record.grade_band) || '本年级'
}

function shortEdition(value) {
  return cleanText(value).replace(/-.*$/g, '')
}

function unique(values) {
  const seen = new Set()
  const out = []
  for (const value of values || []) {
    const text = cleanText(value)
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out
}

function unitTitle(unit) {
  return cleanText(unit?.unit_title || unit?.chapter_title || unit?.section_title || '')
}

function unitLabel(unit) {
  const title = unitTitle(unit)
  if (!title) return ''
  const edition = shortEdition(unit?.edition)
  return edition ? `${edition}《${title}》` : `《${title}》`
}

function collectKeywords(units) {
  const values = []
  for (const unit of units || []) {
    values.push(...(unit.matched_keywords || []))
    values.push(...(unit.alias_alignment?.matched_terms || []))
    values.push(...(unit.field_alignment?.matched_keywords || []))
    for (const field of unit.matched_fields || []) values.push(field.keyword)
  }
  const cleaned = unique(values)
    .map(cleanKeyword)
    .filter(value => value.length >= 2)
    .filter(value => !GENERIC_KEYWORDS.has(value))
    .filter(value => !FRAGMENT_PREFIX_PATTERN.test(value))
    .filter(value => !/^\d+(\.\d+)*$/.test(value))

  const ranked = cleaned
    .map((value, index) => ({ value, index }))
    .sort((a, b) => {
      const length = b.value.length - a.value.length
      if (length !== 0) return length
      return a.index - b.index
    })

  const selected = []
  for (const item of ranked) {
    if (selected.some(value => value.includes(item.value))) continue
    if (selected.some(value => hasLargeOverlap(value, item.value))) continue
    selected.push(item.value)
    if (selected.length >= 5) break
  }
  return selected
}

function hasLargeOverlap(left, right) {
  const shorter = left.length <= right.length ? left : right
  const longer = left.length > right.length ? left : right
  if (shorter.length < 4) return false
  const minOverlap = Math.max(3, Math.ceil(shorter.length * 0.75))
  for (let length = shorter.length; length >= minOverlap; length -= 1) {
    for (let start = 0; start + length <= shorter.length; start += 1) {
      if (longer.includes(shorter.slice(start, start + length))) return true
    }
  }
  return false
}

function editionSummary(units) {
  return unique((units || []).map(unit => unit.edition))
}

function distinctUnitLabels(units, limit = 4) {
  const seenTitles = new Set()
  const labels = []
  for (const unit of units || []) {
    const title = unitTitle(unit)
    if (!title || seenTitles.has(title)) continue
    seenTitles.add(title)
    labels.push(unitLabel(unit))
    if (labels.length >= limit) break
  }
  return labels
}

export function buildH4GGradeFocus(record, units, options = {}) {
  const unitRows = Array.isArray(units) ? units : []
  const labels = distinctUnitLabels(unitRows)
  if (!labels.length) return cleanText(record?.grade_specific_focus)

  const approved = options.approved === true
  const topic = cleanTopic(record?.subdomain || record?.domain || record?.standard)
  const editions = editionSummary(unitRows)
  const keywords = collectKeywords(unitRows)
  const labelText = labels.join('、')
  const editionText = editions.length >= 2
    ? `${editions.length}个教材版本`
    : editions.length === 1 ? `${shortEdition(editions[0])}教材` : '同年级教材'
  const conceptText = keywords.length
    ? `，重点关注${keywords.map(keyword => `“${keyword}”`).join('、')}等概念、方法或现象`
    : ''
  const topicText = topic ? `围绕“${topic}”` : '围绕该课标要求'
  const prefix = approved ? '' : '候选：'

  return `${prefix}${gradeLabel(record)}学习重点：${topicText}，同年级${editionText}证据集中在${labelText}等单元${conceptText}。课标原文保持不变。`
}
