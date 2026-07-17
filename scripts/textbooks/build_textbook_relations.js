import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { readJson, readJsonLines, sha256Text, writeJson } from './library_common.js'

const ROOT = resolve(import.meta.dirname, '../..')
const CURRENT = readJson(join(ROOT, 'data/textbooks/library-state/CURRENT.json'))
const REGISTRY = readJsonLines(join(ROOT, `data/textbooks/library-state/generations/${CURRENT.generation_id}/asset_registry.lock.jsonl`))
const STRUCTURE_ROOT = join(ROOT, 'data/textbooks/derived/by-edition')
const STANDARD_ROOT = join(ROOT, 'data/internal/by_subject')

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s/／_|·•—–,，。:：()（）]+/g, '')
}

function printedNumber(value) {
  const match = String(value || '').match(/^\d+$/)
  return match ? Number(match[0]) : null
}

function matchTocEntry(evidence, toc) {
  const target = normalizeTitle(evidence.unit_title)
  const targetPrinted = printedNumber(evidence.page_start)
  const candidates = toc
    .filter(entry => entry.review_status === 'approved' && entry.pdf_page)
    .map(entry => {
      const candidate = normalizeTitle(entry.title)
      const exact = candidate === target
      const containment = Math.min(candidate.length, target.length) >= 4 && (candidate.includes(target) || target.includes(candidate))
      const pageEqual = targetPrinted !== null && printedNumber(entry.printed_page) === targetPrinted
      const prefixA = candidate.match(/^(?:第[\u4e00-\u9fff\d]+[章节课单元]|\d+(?:\.\d+){1,2})/)?.[0]
      const prefixB = target.match(/^(?:第[\u4e00-\u9fff\d]+[章节课单元]|\d+(?:\.\d+){1,2})/)?.[0]
      const samePrefix = prefixA && prefixB && prefixA === prefixB
      const score = (exact ? 100 : containment && samePrefix ? 70 : containment ? 45 : 0) + (pageEqual ? 20 : 0)
      return { entry, score, exact, pageEqual }
    })
    .filter(item => item.score >= 70)
    .sort((a, b) => b.score - a.score || a.entry.pdf_page - b.entry.pdf_page)
  if (!candidates.length) return null
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) return null
  return candidates[0]
}

function approvedEvidence(record, evidence) {
  return record.h4g_unit_candidate_requires_manual_review === false
    && String(record.progression_review_note || record.grade_assignment_rationale || '').includes('已获人工复核批准')
    && ['high', 'medium'].includes(evidence.confidence_band)
}

function main() {
  const assetByEvidence = new Map(REGISTRY.map(asset => [asset.evidence_id, asset]))
  const structures = new Map()
  for (const asset of REGISTRY) {
    const path = join(STRUCTURE_ROOT, `${asset.edition_id}.json`)
    if (existsSync(path)) structures.set(asset.edition_id, readJson(path))
  }

  const candidates = []
  for (const file of readdirSync(STANDARD_ROOT).filter(name => name.endsWith('.json'))) {
    const payload = readJson(join(STANDARD_ROOT, file))
    for (const record of payload.standards || []) {
      for (const evidence of record.textbook_unit_evidence || []) {
        const asset = assetByEvidence.get(evidence.textbook_evidence_id)
        if (!asset) continue
        candidates.push({ record, evidence, asset })
      }
    }
  }

  const matched = []
  const unmatched = []
  for (const item of candidates) {
    const structure = structures.get(item.asset.edition_id)
    if (!structure) {
      unmatched.push({ evidence_id: item.evidence.unit_evidence_id, reason: 'structure_missing' })
      continue
    }
    const match = matchTocEntry(item.evidence, structure.toc || [])
    if (!match) {
      unmatched.push({
        evidence_id: item.evidence.unit_evidence_id,
        textbook_evidence_id: item.evidence.textbook_evidence_id,
        edition_id: item.asset.edition_id,
        standard_code: item.record.code,
        unit_title: item.evidence.unit_title,
        page_start: item.evidence.page_start,
        reason: 'approved_toc_entry_not_uniquely_matched'
      })
      continue
    }
    const isApproved = approvedEvidence(item.record, item.evidence)
    const alignment = {
      alignment_id: `tca_${sha256Text(`${item.asset.edition_id}:${match.entry.entry_id}:${item.record.code}:${item.evidence.unit_evidence_id}`).slice(0, 16)}`,
      unit_id: match.entry.entry_id,
      standard_code: item.record.code,
      standard_text: item.record.standard || '',
      subject_slug: item.record.subject_slug,
      grade_band: item.record.grade_band || '',
      relation_type: item.evidence.eligible_alignment === 'subdomain_anchor' ? 'supports' : 'mentions',
      confidence: Math.max(0, Math.min(1, Number(item.evidence.score || 0.7))),
      rationale: `已核对教材单元「${item.evidence.unit_title}」与课标「${item.record.code}」的 ${item.evidence.eligible_alignment || 'unit'} 关联。`,
      review_status: isApproved ? 'approved' : 'candidate',
      evidence_id: item.evidence.unit_evidence_id
    }
    structure.alignments ||= []
    structure.alignments = structure.alignments.filter(existing => existing.alignment_id !== alignment.alignment_id)
    structure.alignments.push(alignment)
    matched.push({
      edition_id: item.asset.edition_id,
      unit_id: match.entry.entry_id,
      unit_title: match.entry.title,
      standard_code: item.record.code,
      review_status: alignment.review_status,
      title_match_exact: match.exact,
      printed_page_match: match.pageEqual,
      evidence_id: item.evidence.unit_evidence_id
    })
  }

  for (const [editionId, structure] of structures) {
    const deduped = new Map((structure.alignments || []).map(item => [item.alignment_id, item]))
    structure.alignments = [...deduped.values()].sort((a, b) => a.unit_id.localeCompare(b.unit_id) || a.standard_code.localeCompare(b.standard_code))
    writeJson(join(STRUCTURE_ROOT, `${editionId}.json`), structure)
  }

  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_generation_id: CURRENT.generation_id,
    candidate_count: candidates.length,
    matched_count: matched.length,
    approved_count: matched.filter(item => item.review_status === 'approved').length,
    candidate_relation_count: matched.filter(item => item.review_status === 'candidate').length,
    unmatched_count: unmatched.length,
    matched,
    unmatched
  }
  writeJson(join(ROOT, 'data/textbooks/derived/textbook_relation_report.json'), report)
  console.log(JSON.stringify({ ...report, matched: `${matched.length} rows omitted`, unmatched: `${unmatched.length} rows omitted` }, null, 2))
}

main()
