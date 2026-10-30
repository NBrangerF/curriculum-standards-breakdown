#!/usr/bin/env node
// Merge machine audit + manual review into the published audit data (docs/data/audit-2026-11/).
// Usage: node scripts/audit/compile_audit.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
const SUBJECTS = { chinese: '语文', math: '数学', english: '英语', morality_law: '道德与法治', science: '科学', it: '信息科技', pe: '体育与健康', arts: '艺术', labor: '劳动' }
export const VERDICT = { keep: '保留', trim: '回到原文（细节移到表现示例）', edit: '修文字', reanchor: '重新锚定', example: '移至表现示例', restage: '改学段', split: '拆分', merge: '合并', goal: '改作学段目标或学业质量展示', remove: '删除', add: '补充' }
const DIR = 'docs/data/audit-2026-11'
const summary = { generated_at: new Date().toISOString().slice(0, 10), source: '义务教育课程标准 2022年版 与 日常修订版（2022年版2025年修订）', subjects: [] }
for (const [slug, name] of Object.entries(SUBJECTS)) {
    const audit = JSON.parse(readFileSync(`generated/audit/${slug}.json`, 'utf8'))
    const review = new Map()
    const adds = []
    const notes = []
    for (const line of readFileSync(`${DIR}/review/${slug}.tsv`, 'utf8').split('\n')) {
        if (!line.trim()) continue
        if (line.startsWith('#')) { notes.push(line.replace(/^#\s*/u, '')); continue }
        const [code, verdict, reason] = line.split('\t')
        if (verdict === 'add') adds.push({ id: code, reason }); else review.set(code, { verdict, reason })
    }
    const rows = audit.rows.map(r => {
        const v = review.get(r.code)
        if (!v) throw new Error(`${slug}: ${r.code} has no manual verdict`)
        const a = r.anchors[0]
        return {
            code: r.code, grade: r.grade_range, band: r.grade_band, domain: r.domain, subdomain: r.subdomain, standard: r.standard,
            verdict: v.verdict, reason: v.reason,
            coverage: r.coverage, flags: r.flags,
            anchor: a ? { page: a.page, stage: a.stage, section: a.section, topic: a.topic, text: a.text.slice(0, 300) } : null,
            revision: r.revision, revision_changes: r.revision_changes
        }
    })
    const count = {}
    rows.forEach(r => { count[r.verdict] = (count[r.verdict] || 0) + 1 })
    const diff = existsSync(`generated/revision_diff/${slug}.json`) ? JSON.parse(readFileSync(`generated/revision_diff/${slug}.json`, 'utf8')) : null
    writeFileSync(`${DIR}/${slug}.json`, JSON.stringify({ subject_slug: slug, subject: name, notes, verdict_counts: count, additions: adds, uncovered_official_sentences: audit.gaps.slice(0, 400), rows }, null, 1))
    summary.subjects.push({
        slug, subject: name, standards: rows.length, verdicts: count, additions: adds.length,
        anchored: rows.filter(r => r.coverage >= 0.8).length,
        triplet_identical: rows.filter(r => r.flags.includes('triplet_near_identical')).length,
        source_revised: rows.filter(r => r.revision === 'source_reworded_in_2025' || r.revision === 'source_removed_in_2025').length,
        revision_hunks_real: diff?.hunks_real ?? null
    })
}
writeFileSync(`${DIR}/summary.json`, JSON.stringify(summary, null, 1))
console.table(summary.subjects.map(s => ({ subject: s.subject, n: s.standards, ...Object.fromEntries(Object.keys(VERDICT).filter(k => k !== 'add').map(k => [VERDICT[k].slice(0, 4), s.verdicts[k] || 0])), 补充: s.additions })))
