#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
  alignContentNodes,
  buildContentGraph,
  classifyStructuralHeading,
  groupPdfTextItems,
  lexicalComponentScore,
  normalizeTocEntries,
  normalizeText,
  parsePngDimensions,
  parseTesseractTsv,
  recoverBodyInferredUnits,
  stableId
} from './build_textbook_content_alignments.js'

assert.equal(normalizeText('  习\u3000作\n'), '习 作')
assert.equal(stableId('tcn', 'edition', 'page', 6), stableId('tcn', 'edition', 'page', 6))
assert.notEqual(stableId('tcn', 'edition', 'page', 6), stableId('tcn', 'edition', 'page', 7))

assert.deepEqual(classifyStructuralHeading('1 白 鹭', 'chinese'), { kind: 'lesson', title: '1白鹭' })
assert.deepEqual(classifyStructuralHeading('习 作', 'chinese'), { kind: 'activity', title: '习作' })
assert.deepEqual(classifyStructuralHeading('Section A', 'english'), { kind: 'section', title: 'Section A' })
assert.deepEqual(classifyStructuralHeading('第一单元', 'chinese'), { kind: 'unit', title: '第一单元' })
assert.deepEqual(classifyStructuralHeading('第2章分数', 'math'), { kind: 'chapter', title: '第2章分数' })
assert.equal(classifyStructuralHeading('白鹭是一首精巧的诗。', 'chinese'), null)

const grouped = groupPdfTextItems([
  { str: '获取', transform: [12, 0, 0, 12, 10, 100], width: 24 },
  { str: '主要内容', transform: [12, 0, 0, 12, 35, 100], width: 48 },
  { str: '第二行', transform: [12, 0, 0, 12, 10, 80], width: 36 }
], 600, 800)
assert.equal(grouped.length, 2)
assert.equal(grouped[0].text, '获取主要内容')
assert.equal(grouped[0].bbox.unit, 'pdf_point')

const tsv = [
  'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
  '5\t1\t1\t1\t1\t1\t10\t20\t20\t10\t95\t获取',
  '5\t1\t1\t1\t1\t2\t35\t20\t40\t10\t94\t主要内容'
].join('\n')
const ocrLines = parseTesseractTsv(tsv, 100, 200)
assert.equal(ocrLines[0].text, '获取 主要内容')
assert.equal(ocrLines[0].bbox.unit, 'pixel')
assert.deepEqual(parsePngDimensions(Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x05, 0x38, 0x00, 0x00, 0x07, 0x48
])), { width: 1336, height: 1864 })
assert.throws(() => parsePngDimensions(Buffer.from('not a png')), /valid PNG/u)

assert.ok(lexicalComponentScore('获取文章的主要内容', '获取主要内容').score >= 0.75)
assert.ok(lexicalComponentScore('计算下面各题', '有感情地朗读课文').score < 0.52)

const asset = {
  edition_id: 'ed_fixture',
  evidence_id: 'ctb_fixture',
  sha256: 'a'.repeat(64),
  subject_slug: 'chinese',
  grade: 5
}
const structure = {
  toc: [{
    entry_id: 'tcu_fixture',
    parent_id: null,
    level: 1,
    kind: 'unit',
    title: '第一单元',
    pdf_page: 6,
    end_pdf_page: 20,
    printed_page: '1',
    confidence: 0.99,
    review_status: 'approved'
  }],
  page_map: [
    { pdf_page: 6, printed_page: '1' },
    { pdf_page: 10, printed_page: '5' }
  ]
}
const bbox = { x: 10, y: 20, width: 200, height: 14, unit: 'pdf_point', page_width: 600, page_height: 800 }
const pages = [
  {
    pdf_page: 6,
    printed_page: '1',
    extraction_method: 'pdfjs_text_layer',
    text: '第一单元\n◎ 初步了解课文借助具体事物抒发感情的方法。',
    lines: [
      { text: '第一单元', bbox },
      { text: '◎ 初步了解课文借助具体事物抒发感情的方法。', bbox }
    ]
  },
  {
    pdf_page: 10,
    printed_page: '5',
    extraction_method: 'pdfjs_text_layer',
    text: '分角色朗读课文。说说课文围绕“落花生”写了哪些内容。',
    lines: [{ text: '分角色朗读课文。说说课文围绕“落花生”写了哪些内容。', bbox }]
  }
]
const graph = buildContentGraph(asset, structure, pages)
assert.ok(graph.contentNodes.some(node => node.kind === 'objective'))
assert.ok(graph.contentNodes.some(node => node.kind === 'exercise'))
assert.ok(graph.contentNodes.every(node => 'pdf_page_start' in node && 'pdf_page_end' in node))
assert.ok(graph.evidenceSpans.every(span => span.excerpt && span.excerpt_hash && span.evidence_role))
assert.ok(graph.evidenceSpans.every(span => span.excerpt.length <= 320))

const components = [
  {
    standard_code: 'CN-D3-RE-001',
    standard_text: '独立阅读文学作品，获取主要内容。',
    subject_slug: 'chinese',
    grade_band: 'H3',
    component_id: 'lc_main_content',
    label: '获取主要内容',
    component_text: '获取主要内容；获取主要内容'
  },
  {
    standard_code: 'CN-D3-RE-002',
    standard_text: '通过朗读或复述呈现理解。',
    subject_slug: 'chinese',
    grade_band: 'H3',
    component_id: 'lc_read_aloud',
    label: '通过朗读呈现理解',
    component_text: '通过朗读呈现理解；朗读或复述'
  }
]
const alignments = alignContentNodes(asset, structure, graph.contentNodes, graph.evidenceSpans, components, {
  minScore: 0.52,
  maxStandardsPerNode: 3
})
const mainContent = alignments.find(row => row.standard_code === 'CN-D3-RE-001')
assert.ok(mainContent)
assert.equal(mainContent.review_status, 'machine_checked')
assert.equal(mainContent.publication_status, 'published')
assert.equal(mainContent.provenance, 'machine_generated')
assert.equal(mainContent.evidence_level, 'L3')
assert.equal(mainContent.evidence_level_detail, 'L3_page_evidence')
assert.equal(mainContent.relation_type, 'practices')
assert.equal(mainContent.learning_components[0].label, '获取主要内容')
assert.ok(mainContent.node_id.startsWith('tcn_'))
assert.ok(mainContent.evidence_excerpt_hash)

const rerun = alignContentNodes(asset, structure, graph.contentNodes, graph.evidenceSpans, components, {
  minScore: 0.52,
  maxStandardsPerNode: 3
})
assert.deepEqual(rerun.map(row => row.alignment_id), alignments.map(row => row.alignment_id))

const longBody = '这是教材正文内容，用于确认页面具有稳定的原生文字层。'.repeat(6)
const recoveryPages = [
  {
    pdf_page: 1,
    printed_page: null,
    extraction_method: 'pdfjs_text_layer',
    text: `版权所有 出版发行 责任编辑 印刷厂 ${longBody}`,
    lines: [{ text: '版权所有 出版发行' }, { text: '责任编辑 印刷厂' }, { text: longBody }]
  },
  {
    pdf_page: 2,
    printed_page: null,
    extraction_method: 'pdfjs_text_layer',
    text: `目录\n第一单元……3\n第二单元……6\n${longBody}`,
    lines: [{ text: '目录' }, { text: '第一单元……3' }, { text: '第二单元……6' }, { text: longBody }]
  },
  {
    pdf_page: 3,
    printed_page: '1',
    extraction_method: 'pdfjs_text_layer',
    text: `第一单元\n${longBody}`,
    lines: [{ text: '第一单元', bbox }, { text: longBody, bbox }]
  },
  {
    pdf_page: 4,
    printed_page: '2',
    extraction_method: 'pdfjs_text_layer',
    text: `阅读课文，说说文章的主要内容。${longBody}`,
    lines: [{ text: '阅读课文，说说文章的主要内容。', bbox }, { text: longBody, bbox }]
  },
  {
    pdf_page: 5,
    printed_page: '3',
    extraction_method: 'pdfjs_text_layer',
    text: longBody,
    lines: [{ text: longBody, bbox }]
  },
  {
    pdf_page: 6,
    printed_page: '4',
    extraction_method: 'pdfjs_text_layer',
    text: `第二单元\n${longBody}`,
    lines: [{ text: '第二单元', bbox }, { text: longBody, bbox }]
  },
  {
    pdf_page: 7,
    printed_page: '5',
    extraction_method: 'pdfjs_text_layer',
    text: `朗读课文，概括主要内容。${longBody}`,
    lines: [{ text: '朗读课文，概括主要内容。', bbox }, { text: longBody, bbox }]
  },
  {
    pdf_page: 8,
    printed_page: null,
    extraction_method: 'pdfjs_text_layer',
    text: `图书在版编目 定价 联系调换 ${longBody}`,
    lines: [{ text: '图书在版编目 定价' }, { text: '质量问题 联系调换' }, { text: longBody }]
  }
]
const recoveryStructure = {
  toc: [],
  page_map: recoveryPages.map(page => ({ pdf_page: page.pdf_page, printed_page: page.printed_page }))
}
const recovered = recoverBodyInferredUnits(asset, recoveryStructure, recoveryPages)
assert.equal(recovered.status, 'recovered')
assert.equal(recovered.entries.length, 2)
assert.deepEqual(recovered.entries.map(entry => [entry.title, entry.pdf_page, entry.end_pdf_page]), [
  ['第一单元', 3, 5],
  ['第二单元', 6, 7]
])
assert.ok(recovered.entries.every(entry => entry.source === 'body_inferred_unit'))
assert.ok(recovered.entries.every(entry => entry.review_status === 'machine_checked' && entry.publication_status === 'published'))
assert.ok(recovered.entries.every(entry => entry.confidence >= 0.9 && entry.evidence_excerpt_hash))
assert.deepEqual(
  recoverBodyInferredUnits(asset, recoveryStructure, recoveryPages).entries.map(entry => entry.entry_id),
  recovered.entries.map(entry => entry.entry_id)
)

const recoveredGraph = buildContentGraph(asset, { ...recoveryStructure, toc: recovered.entries }, recoveryPages)
const inferredUnitIds = new Set(recovered.entries.map(entry => entry.entry_id))
const instructionalNodes = recoveredGraph.contentNodes.filter(node => ['objective', 'exercise', 'lesson', 'section'].includes(node.kind))
assert.ok(instructionalNodes.length >= 2)
assert.ok(instructionalNodes.every(node => inferredUnitIds.has(node.unit_id)))
assert.ok(recoveredGraph.evidenceSpans.some(span => span.role === 'heading' && span.pdf_page === 3))
assert.ok(recoveredGraph.evidenceSpans.every(span => !/(?:版权所有|出版发行|联系调换|……)/u.test(span.text)))

const recoveredAlignments = alignContentNodes(asset, { ...recoveryStructure, toc: recovered.entries }, recoveredGraph.contentNodes, recoveredGraph.evidenceSpans, components, {
  minScore: 0.52,
  maxStandardsPerNode: 2
})
assert.ok(recoveredAlignments.length >= 1)
assert.ok(recoveredAlignments.every(row => inferredUnitIds.has(row.unit_id)))
assert.ok(recoveredAlignments.every(row => row.evidence_span_ids.length > 0 && Number.isInteger(row.pdf_page)))

const scanOnly = recoverBodyInferredUnits(asset, recoveryStructure, recoveryPages.map(page => ({
  ...page,
  extraction_method: 'pdftoppm_tesseract_chi_sim_eng'
})))
assert.equal(scanOnly.status, 'scope_only')
assert.equal(scanOnly.reason, 'insufficient_native_body_text')
assert.equal(scanOnly.entries.length, 0)

const mathAsset = { ...asset, edition_id: 'ed_math_fixture', subject_slug: 'math', grade: 4 }
const mathUnitPages = Array.from({ length: 9 }, (_, index) => {
  const ordinal = index + 1
  const page = 7 + index * 10
  const title = `${ordinal} ${['大数的认识', '公顷和平方千米', '角的度量', '三位数乘两位数', '平行四边形和梯形', '除数是两位数的除法', '条形统计图', '数学广角—优化', '总复习'][index]}`
  const exerciseLines = [1, 2, 3].map(number => ({ text: `${number} 计算下面各题`, bbox }))
  return {
    pdf_page: page,
    printed_page: String(page - 5),
    extraction_method: 'pdfjs_text_layer',
    text: `${title}\n${exerciseLines.map(line => line.text).join('\n')}\n${longBody}`,
    lines: [{ text: title, bbox }, ...exerciseLines, { text: longBody, bbox }]
  }
})
const mathPages = [
  ...mathUnitPages,
  {
    pdf_page: 12,
    printed_page: '7',
    extraction_method: 'pdfjs_text_layer',
    text: `1亿有多大\n${longBody}`,
    lines: [{ text: '1亿有多大', bbox }, { text: longBody, bbox }]
  },
  {
    pdf_page: 22,
    printed_page: '17',
    extraction_method: 'pdfjs_text_layer',
    text: `1平方千米\n${longBody}`,
    lines: [{ text: '1平方千米', bbox }, { text: longBody, bbox }]
  }
]
const recoveredMath = recoverBodyInferredUnits(
  mathAsset,
  { toc: [], page_map: mathPages.map(page => ({ pdf_page: page.pdf_page, printed_page: page.printed_page })) },
  mathPages
)
assert.equal(recoveredMath.status, 'recovered')
assert.equal(recoveredMath.family, 'numbered_lesson')
assert.deepEqual(recoveredMath.entries.map(entry => [entry.title, entry.pdf_page]), [
  ['1大数的认识', 7],
  ['2公顷和平方千米', 17],
  ['3角的度量', 27],
  ['4三位数乘两位数', 37],
  ['5平行四边形和梯形', 47],
  ['6除数是两位数的除法', 57],
  ['7条形统计图', 67],
  ['8数学广角—优化', 77],
  ['9总复习', 87]
])

const invalidTocStructure = {
  toc: [
    { entry_id: 'tcu_null', level: 1, kind: 'unit', title: '无页目录', pdf_page: null, end_pdf_page: null, review_status: 'approved' },
    { entry_id: 'tcu_zero', level: 1, kind: 'unit', title: '零页目录', pdf_page: 0, end_pdf_page: 4, review_status: 'approved' },
    { entry_id: 'tcu_reversed', level: 1, kind: 'unit', title: '第一单元', pdf_page: 6, end_pdf_page: 5, review_status: 'approved' }
  ],
  page_map: [{ pdf_page: 6, printed_page: '1' }]
}
const invalidTocGraph = buildContentGraph(asset, invalidTocStructure, [pages[0]])
const locatableTocNodes = invalidTocGraph.contentNodes.filter(node => node.toc_entry_id)
assert.deepEqual(locatableTocNodes.map(node => node.toc_entry_id), ['tcu_reversed'])
assert.equal(locatableTocNodes[0].pdf_page, 6)
assert.equal(locatableTocNodes[0].end_pdf_page, 6)
assert.ok(invalidTocGraph.contentNodes.every(node => Number.isInteger(node.pdf_page) && node.pdf_page > 0))

const declarativeGraph = buildContentGraph(asset, structure, [{
  pdf_page: 11,
  printed_page: '6',
  extraction_method: 'pdfjs_text_layer',
  text: '实验表明，水会蒸发。\n计算机可以高速处理信息。\n◎ ......',
  lines: [
    { text: '实验表明，水会蒸发。', bbox },
    { text: '计算机可以高速处理信息。', bbox },
    { text: '◎ ......', bbox }
  ]
}])
assert.equal(declarativeGraph.contentNodes.filter(node => node.kind === 'exercise').length, 0)
assert.equal(declarativeGraph.contentNodes.filter(node => node.kind === 'objective').length, 0)

const extendedDeclarativeGraph = buildContentGraph(asset, structure, [{
  pdf_page: 11,
  printed_page: '6',
  extraction_method: 'pdfjs_text_layer',
  text: '实验发现，电荷间有相互作用。\n探究的重要场所，有很多仪器和药品。',
  lines: [
    { text: '实验发现，电荷间有相互作用。', bbox },
    { text: '探究的重要场所，有很多仪器和药品。', bbox }
  ]
}])
assert.equal(extendedDeclarativeGraph.contentNodes.filter(node => node.kind === 'exercise').length, 0)

function fixtureSpan(spanId, page, text) {
  return {
    span_id: spanId,
    node_id: `node_${spanId}`,
    pdf_page: page,
    text,
    excerpt: text,
    excerpt_hash: stableId('hash', text),
    evidence_role: 'exercise'
  }
}

function fixtureNode(nodeId, page, text, kind = 'exercise', unitId = 'unit_fixture') {
  return {
    node_id: nodeId,
    unit_id: unitId,
    kind,
    title: text,
    text_excerpt: text,
    pdf_page: page,
    end_pdf_page: page,
    printed_page: String(page),
    evidence_span_ids: [`span_${nodeId}`],
    source: kind === 'lesson' || kind === 'section' ? 'body_heading' : 'task_verb_pattern'
  }
}

function fixtureComponent(code, label, context = {}) {
  return {
    standard_code: code,
    standard_text: context.standard_text || label,
    standard_title: context.standard_title || label,
    subdomain: context.subdomain || context.standard_title || label,
    display_subcategory: context.display_subcategory || context.subdomain || context.standard_title || label,
    official_text: context.official_text || '',
    subject_slug: context.subject_slug || 'chinese',
    grade_band: context.grade_band || 'H3',
    component_id: `lc_${code}`,
    label,
    component_text: label
  }
}

const fixtureStructure = {
  toc: [{
    entry_id: 'unit_fixture', level: 1, kind: 'unit', title: '第一单元',
    pdf_page: 1, end_pdf_page: 12, review_status: 'approved'
  }]
}

const cueNodes = [
  fixtureNode('read', 1, '朗读课文。'),
  fixtureNode('computer', 2, '计算机的使用时间达到规定的检修时间。'),
  fixtureNode('observe', 3, '观察下面的图片。'),
  fixtureNode('generic_writing', 4, '完成本次习作并交流。'),
  fixtureNode('generic_discussion', 5, '小组讨论这个问题。'),
  fixtureNode('listener_feedback', 6, '尊重别人的观点，对别人的发言给予回应。')
]
const cueSpans = cueNodes.map(node => fixtureSpan(node.evidence_span_ids[0], node.pdf_page, node.title))
const cueComponents = [
  fixtureComponent('CN-D3-RE-010', '用普通话正确、流利、有感情地朗读'),
  fixtureComponent('CN-D3-RE-011', '复述读过的故事，条理完整'),
  fixtureComponent('MA-D3-ST-099', '计算四分位数', { subject_slug: 'math' }),
  fixtureComponent('SC-D3-PR-099', '设计控制变量实验', { subject_slug: 'science' }),
  fixtureComponent('CN-D3-CM-099', '进行写作'),
  fixtureComponent('CN-D3-CM-098', '发表意见并倾听他人')
]
const cueAlignments = alignContentNodes(asset, fixtureStructure, cueNodes, cueSpans, cueComponents, { maxStandardsPerNode: 3 })
assert.ok(cueAlignments.some(row => row.node_id === 'read' && row.standard_code === 'CN-D3-RE-010'))
assert.ok(!cueAlignments.some(row => row.node_id === 'read' && row.standard_code === 'CN-D3-RE-011'))
assert.ok(!cueAlignments.some(row => ['computer', 'observe', 'generic_writing', 'generic_discussion', 'listener_feedback'].includes(row.node_id)))

const chemistryAsset = { ...asset, edition_id: 'ed_chemistry_fixture', subject_slug: 'chemistry', grade: 9 }
const chemistryStructure = {
  toc: [{
    entry_id: 'unit_fixture', level: 1, kind: 'unit', title: '物质变化与化学反应',
    pdf_page: 1, end_pdf_page: 12, review_status: 'approved'
  }]
}
const chemistryNodes = [
  fixtureNode('chemical', 1, '根据化学方程式计算反应物的质量。'),
  fixtureNode('biology', 2, '观察植物向光性并记录结果。'),
  fixtureNode('generic_experiment', 3, '完成实验并写出探究报告。'),
  fixtureNode('engineering', 4, '形成设计方案，制作装置模型并测试改进。'),
  fixtureNode('unrelated_calculation', 5, '计算三项用水量占总用水量的百分比。'),
  fixtureNode('formula_calculation', 6, '根据化学式可以进行以下各种计算。'),
  fixtureNode('molecular_mass', 7, '计算出硝酸铵的相对分子质量。'),
  fixtureNode('reaction_mass', 8, '根据实际参加反应的一种反应物的质量，计算生成物的质量。'),
  fixtureNode('empty_template', 9, '现象 分析'),
  fixtureNode('co2_impact', 10, '二氧化碳对生活和环境的影响。')
]
const chemistrySpans = chemistryNodes.map(node => fixtureSpan(node.evidence_span_ids[0], node.pdf_page, node.title))
const chemistryComponents = [
  fixtureComponent('SC-H4G9-SC-012', '根据化学方程式进行简单计算', {
    subject_slug: 'science', grade_band: 'H4G9', standard_title: '2.4 化学反应遵守质量守恒定律', display_subcategory: '2.4 化学反应遵守质量守恒定律'
  }),
  fixtureComponent('SC-H4G9-SC-006', '进行简单计算并配制一定溶质质量分数的溶液', {
    subject_slug: 'science', grade_band: 'H4G9', standard_title: '2.2 物质的溶解和溶液', display_subcategory: '2.2 物质的溶解和溶液'
  }),
  fixtureComponent('SC-H4G9-SC-009', '分析化学变化中的现象并判断是否有新物质生成', {
    subject_slug: 'science', grade_band: 'H4G9', standard_title: '2.3 物质的化学变化', display_subcategory: '2.3 物质的化学变化'
  }),
  fixtureComponent('SC-H4G9-SC-033', '分析酸、碱、盐和有机物对生活与环境的影响', {
    subject_slug: 'science', grade_band: 'H4G9', standard_title: '2.6 酸碱盐与有机物', display_subcategory: '2.6 酸碱盐与有机物'
  }),
  fixtureComponent('SC-H4G9-SC-002', '观察植物向光性并记录结果', {
    subject_slug: 'science', grade_band: 'H4G9', standard_title: '7.1 生物能适应其生存环境', display_subcategory: '7.1 生物能适应其生存环境'
  }),
  fixtureComponent('SC-H4G9-PR-003', '完成探究报告', {
    subject_slug: 'science', grade_band: 'H4G9', standard_title: '13.2 工程的关键是设计', display_subcategory: '13.2 工程的关键是设计'
  }),
  fixtureComponent('SC-H4G9-PR-009', '形成设计方案，制作装置模型并测试改进', {
    subject_slug: 'science', grade_band: 'H4G9', standard_title: '13.3 工程是设计方案物化的结果', display_subcategory: '13.3 工程是设计方案物化的结果'
  })
]
const chemistryAlignments = alignContentNodes(chemistryAsset, chemistryStructure, chemistryNodes, chemistrySpans, chemistryComponents, { maxStandardsPerNode: 3 })
assert.ok(chemistryAlignments.some(row => row.node_id === 'chemical' && row.standard_code === 'SC-H4G9-SC-012'))
assert.ok(!chemistryAlignments.some(row => row.node_id === 'biology'))
assert.ok(!chemistryAlignments.some(row => row.node_id === 'generic_experiment'))
assert.ok(chemistryAlignments.some(row => row.node_id === 'engineering' && row.standard_code === 'SC-H4G9-PR-009'))
assert.ok(!chemistryAlignments.some(row => row.node_id === 'unrelated_calculation'))
assert.ok(!chemistryAlignments.some(row => ['formula_calculation', 'molecular_mass'].includes(row.node_id)))
assert.ok(!chemistryAlignments.some(row => row.node_id === 'reaction_mass' && row.standard_code === 'SC-H4G9-SC-006'))
assert.ok(!chemistryAlignments.some(row => row.node_id === 'empty_template' && row.standard_code === 'SC-H4G9-SC-009'))
assert.ok(!chemistryAlignments.some(row => row.node_id === 'co2_impact' && row.standard_code === 'SC-H4G9-SC-033'))

assert.deepEqual(normalizeTocEntries([
  { entry_id: 'unit_5', level: 1, kind: 'unit', title: '第五单元', pdf_page: 96, end_pdf_page: 96, printed_page: '91', review_status: 'approved', source: 'heading_match' },
  { entry_id: 'unit_5_title', level: 1, kind: 'unit', title: '化学方程式92', pdf_page: 97, end_pdf_page: 109, printed_page: '92', review_status: 'approved', source: 'heading_match' }
]).map(entry => [entry.entry_id, entry.title, entry.pdf_page, entry.end_pdf_page]), [
  ['unit_5', '第五单元 化学方程式', 96, 109]
])
assert.equal(normalizeTocEntries([
  { entry_id: 'unit_5', parent_id: null, level: 1, kind: 'unit', title: '第五单元 化学方程式', pdf_page: 96, end_pdf_page: 109, review_status: 'approved', source: 'heading_match+split_heading_merge' },
  { entry_id: 'section_1', parent_id: 'unit_5_title', level: 2, kind: 'section', title: '课题1', pdf_page: 98, end_pdf_page: 102, review_status: 'approved' }
])[1].parent_id, 'unit_5')

const duplicateHeadingNodes = [
  fixtureNode('heading_first', 1, '38 第二单元 生物体的结构层次', 'lesson'),
  fixtureNode('heading_repeat', 3, '40 第二单元 生物体的结构层次', 'lesson')
]
const duplicateHeadingSpans = duplicateHeadingNodes.map(node => fixtureSpan(node.evidence_span_ids[0], node.pdf_page, node.title))
const duplicateHeadingAlignments = alignContentNodes(asset, fixtureStructure, duplicateHeadingNodes, duplicateHeadingSpans, [
  fixtureComponent('CN-D3-RE-090', '理解生物体的结构层次')
], { maxStandardsPerNode: 2 })
assert.equal(duplicateHeadingAlignments.length, 1)
assert.equal(duplicateHeadingAlignments[0].node_id, 'heading_first')

const ambiguousNode = fixtureNode('ambiguous', 6, '解一元一次方程。')
const ambiguousSpan = fixtureSpan(ambiguousNode.evidence_span_ids[0], 6, ambiguousNode.title)
const ambiguousAsset = { ...asset, edition_id: 'ed_math_fixture', subject_slug: 'math', grade: 7 }
const ambiguousComponents = [
  fixtureComponent('MA-H4G7-AL-001', '解一元一次方程', { subject_slug: 'math', grade_band: 'H4G7' }),
  fixtureComponent('MA-H4G7-AL-002', '解一元一次方程', { subject_slug: 'math', grade_band: 'H4G7' })
]
const ambiguousAlignments = alignContentNodes(ambiguousAsset, fixtureStructure, [ambiguousNode], [ambiguousSpan], ambiguousComponents, { maxStandardsPerNode: 2 })
assert.equal(ambiguousAlignments.length, 1)

const historyAsset = { ...asset, edition_id: 'ed_history_fixture', subject_slug: 'history', grade: 8 }
const historyNode = fixtureNode('history', 7, '中国共产党诞生。')
const historyAlignment = alignContentNodes(historyAsset, fixtureStructure, [historyNode], [fixtureSpan(historyNode.evidence_span_ids[0], 7, historyNode.title)], [
  fixtureComponent('ML-H4G8-LAW-020', '中国共产党诞生', { subject_slug: 'morality_law', grade_band: 'H4G8' })
], { maxStandardsPerNode: 1 })[0]
assert.equal(historyAlignment.relation_type, 'contextualizes')
assert.equal(historyAlignment.evidence_role, 'contextual_textbook')

const informationalNodes = [
  fixtureNode('read_explanation', 8, '阅读说明性文章，了解说明方法。', 'objective'),
  fixtureNode('write_explanation', 9, '用恰当的说明方法，把事物介绍清楚。', 'objective'),
  { ...fixtureNode('no_span', 10, '概括说明性文章的主要内容。', 'objective'), evidence_span_ids: [] },
  fixtureNode('outside_unit', 13, '概括说明性文章的主要内容。', 'objective')
]
const informationalSpans = informationalNodes.filter(node => node.evidence_span_ids.length).map(node => fixtureSpan(node.evidence_span_ids[0], node.pdf_page, node.title))
const informationalComponents = [
  fixtureComponent('CN-D3-CM-003', '概括说明性文字的主要内容或非连续性文本的关键信息，初步判断其合理性'),
  fixtureComponent('CN-D3-RE-007', '发现不同类型文本的结构方式和语言特点，感受内容与形式差异'),
  fixtureComponent('CN-D3-CM-004', '用准确语言清楚介绍、说明事物或程序'),
  fixtureComponent('CN-D3-CM-005', '留心观察周围事物并表达独特感受')
]
const informationalAlignments = alignContentNodes(asset, fixtureStructure, informationalNodes, informationalSpans, informationalComponents, { maxStandardsPerNode: 3 })
assert.ok(!informationalAlignments.some(row => row.node_id === 'read_explanation' && row.standard_code === 'CN-D3-CM-003'))
assert.ok(informationalAlignments.some(row => row.node_id === 'read_explanation' && row.standard_code === 'CN-D3-RE-007'))
assert.ok(informationalAlignments.some(row => row.node_id === 'write_explanation' && row.standard_code === 'CN-D3-CM-004'))
assert.ok(!informationalAlignments.some(row => row.node_id === 'write_explanation' && row.standard_code === 'CN-D3-CM-005'))
assert.ok(!informationalAlignments.some(row => ['no_span', 'outside_unit'].includes(row.node_id)))

console.log(`textbook content alignment tests passed (${graph.contentNodes.length} nodes, ${alignments.length} alignments; ${recovered.entries.length} inferred units)`)
