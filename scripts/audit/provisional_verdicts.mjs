#!/usr/bin/env node
// Provisional verdict per standard from the machine flags; the manual review confirms or overrides each one.
// Usage: node scripts/audit/provisional_verdicts.mjs  →  generated/audit/verdicts_provisional.json + summary
import { readFileSync, writeFileSync } from 'node:fs'
const SLUGS = ['chinese', 'math', 'english', 'morality_law', 'science', 'it', 'pe', 'arts', 'labor']
export const VERDICTS = {
    keep: '保留', edit: '修文字', reanchor: '重新锚定', example: '移至表现示例', split: '拆分', merge: '合并', restage: '改学段', remove: '删除'
}
const out = {}
const table = []
for (const slug of SLUGS) {
    const a = JSON.parse(readFileSync(`generated/audit/${slug}.json`, 'utf8'))
    out[slug] = a.rows.map(r => {
        const f = new Set(r.flags)
        const best = Math.max(0, ...r.clause_matches.map(m => m.score))
        const v = []
        const why = []
        if (f.has('describes_course_not_outcome')) { v.push('remove'); why.push('写的是课程结构或主题清单，不是学生要做到的事') }
        if (f.has('elaborates_official_clause')) { v.push('edit'); why.push(`包含官方子句「${r.elaborates.map(e => e.text).join('」「').slice(0, 60)}」，其余是 kebiao 加的细节：标准句回到原文，细节移到表现示例`) }
        if (f.has('no_anchor')) {
            if (best >= 0.45) { v.push('reanchor'); why.push(`改写了官方条目，原文对不上（最高匹配 ${best.toFixed(2)}）`) }
            else { v.push('example'); why.push(`在课标里找不到出处（最高匹配 ${best.toFixed(2)}），像 kebiao 自拟的任务`) }
        } else if (f.has('partial_anchor')) { v.push('edit'); why.push(`只有 ${Math.round(r.coverage * 100)}% 的内容出自原文`) }
        if (f.has('anchor_not_outcome_layer') && !f.has('no_anchor')) { v.push('reanchor'); why.push('锚在了非「应能做到」层（如教学提示、总目标）') }
        if (f.has('stage_mismatch')) { v.push('restage'); why.push(`原文学段为 ${[...new Set(r.anchors.map(x => x.stage))].join('、')}`) }
        if (f.has('garbled_clause')) { v.push('edit'); why.push('拼接出的病句') }
        if (f.has('quantity_not_in_source')) { v.push('edit'); why.push(`原文没有的数量：${r.quantities.join('、')}`) }
        if (f.has('example_not_in_source')) { v.push('edit'); why.push(`原文没有的举例：${r.examples.join('、')}`) }
        if (f.has('verb_not_in_source')) { v.push('edit'); why.push(`改了原文的要求动词：${r.verb_shift.join('、')}`) }
        if (f.has('bundles_many_source_items')) { v.push('split'); why.push(`捆了 ${r.anchors.length} 段原文`) }
        if (f.has('near_duplicate')) { v.push('merge'); why.push(`与 ${(r.duplicates || []).join('、')} 几乎相同`) }
        if (!v.length) v.push('keep')
        const order = ['remove', 'example', 'reanchor', 'split', 'merge', 'restage', 'edit', 'keep']
        const primary = order.find(x => v.includes(x))
        return {
            code: r.code, primary, verdicts: [...new Set(v)], reasons: why,
            triplet_same: f.has('triplet_near_identical'),
            layer_change: f.has('anchor_layer_changes_under_method'),
            revision: r.revision, best_match: +best.toFixed(2)
        }
    })
    const c = {}
    out[slug].forEach(x => { c[x.primary] = (c[x.primary] || 0) + 1 })
    table.push({ slug, n: out[slug].length, ...Object.fromEntries(Object.keys(VERDICTS).map(k => [VERDICTS[k], c[k] || 0])), 三连无差异: out[slug].filter(x => x.triplet_same).length, 换锚点层: out[slug].filter(x => x.layer_change).length, 原文已修订: out[slug].filter(x => x.revision === 'source_reworded_in_2025' || x.revision === 'source_removed_in_2025').length })
}
writeFileSync('generated/audit/verdicts_provisional.json', JSON.stringify(out))
console.table(table)
