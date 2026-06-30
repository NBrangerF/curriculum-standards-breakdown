#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { VALID_TS } from './config.js'

const RULES = [
  { ts: 'TS6', label: '数字素养与数据驱动', keywords: ['数据', '编码', '算法', '程序', '信息', '数字', '网络', '人工智能', '模型'] },
  { ts: 'TS1', label: '批判性思维', keywords: ['分析', '比较', '解释', '推理', '证据', '判断', '论证', '探究', '归纳'] },
  { ts: 'TS2', label: '创新实践', keywords: ['设计', '创作', '方案', '改进', '制作', '项目', '实践', '解决问题'] },
  { ts: 'TS3', label: '自主学习', keywords: ['计划', '反思', '自评', '管理', '策略', '习惯', '自主', '持续'] },
  { ts: 'TS4', label: '协作', keywords: ['合作', '协作', '小组', '共同', '分工', '团队', '公共参与'] },
  { ts: 'TS5', label: '表达沟通', keywords: ['表达', '交流', '展示', '汇报', '讲述', '写作', '阅读', '倾听', '沟通'] },
  { ts: 'TS7', label: '责任与伦理', keywords: ['责任', '伦理', '法治', '规则', '安全', '健康', '可持续', '国家', '社会', '环境'] }
]

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) args[key] = true
    else {
      args[key] = value
      i += 1
    }
  }
  return args
}

function score(record, rule) {
  const haystack = [
    record.standard,
    record.context,
    record.practice,
    record.teaching_tip,
    record.assessment_evidence_type,
    record.domain,
    record.subdomain
  ].join(' ')
  return rule.keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 1 : 0), 0)
}

function mapRecord(record) {
  const ranked = RULES
    .map(rule => ({ ...rule, score: score(record, rule) }))
    .filter(rule => rule.score > 0)
    .sort((a, b) => b.score - a.score)
  const primary = ranked[0]?.ts || 'TS1'
  const secondary = ranked
    .slice(1)
    .map(rule => rule.ts)
    .filter(ts => ts !== primary)
    .slice(0, 2)
  record.ts_primary = [primary]
  record.ts_secondary = secondary
  record.ts_rationale = ranked[0]
    ? `关键词规则匹配到“${ranked[0].label}”：${ranked[0].keywords.filter(keyword => [
      record.standard,
      record.context,
      record.practice,
      record.teaching_tip,
      record.assessment_evidence_type,
      record.domain,
      record.subdomain
    ].join(' ').includes(keyword)).join('、') || '综合语义'}。`
    : '未命中明确关键词，按默认规则标注 TS1；需人工复核。'
  return record
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.input || !args.out) {
    console.log('Usage: node scripts/grade7_9/map_ts.js --input normalized.json --out mapped.json')
    process.exit(1)
  }
  const payload = JSON.parse(readFileSync(args.input, 'utf8'))
  payload.standards = (payload.standards || []).map(mapRecord)
  for (const record of payload.standards) {
    for (const ts of [...record.ts_primary, ...record.ts_secondary]) {
      if (!VALID_TS.has(ts)) throw new Error(`Invalid TS code ${ts} in ${record.code}`)
    }
  }
  writeFileSync(args.out, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(`Wrote ${args.out} (${payload.standards.length} standards)`)
}

main()
