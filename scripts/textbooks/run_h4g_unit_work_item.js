#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_unit_evidence_worklist.json'
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT_BASE = 'generated/textbook_evidence/h4g_runs'
const DEFAULT_MAX_PAGES = 18
const DEFAULT_MATERIALIZE_TIMEOUT_MS = 1000
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 180000
const DEFAULT_DOWNLOAD_RETRIES = 2

function parseArgs(argv) {
  const args = {
    worklist: DEFAULT_WORKLIST,
    workItem: '',
    subject: '',
    edition: '',
    dataRoot: DEFAULT_DATA_ROOT,
    outDir: '',
    maxPages: DEFAULT_MAX_PAGES,
    materializeTimeoutMs: DEFAULT_MATERIALIZE_TIMEOUT_MS,
    downloadTimeoutMs: DEFAULT_DOWNLOAD_TIMEOUT_MS,
    downloadRetries: DEFAULT_DOWNLOAD_RETRIES,
    ocrFallback: true,
    applyCandidate: true,
    publicationGate: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--work-item') args.workItem = argv[++i]
    else if (item === '--subject') args.subject = argv[++i]
    else if (item === '--edition') args.edition = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out-dir') args.outDir = argv[++i]
    else if (item === '--max-pages') args.maxPages = Number(argv[++i]) || args.maxPages
    else if (item === '--materialize-timeout-ms') args.materializeTimeoutMs = Number(argv[++i]) || args.materializeTimeoutMs
    else if (item === '--download-timeout-ms') args.downloadTimeoutMs = Number(argv[++i]) || args.downloadTimeoutMs
    else if (item === '--download-retries') args.downloadRetries = Number(argv[++i]) || args.downloadRetries
    else if (item === '--no-ocr-fallback') args.ocrFallback = false
    else if (item === '--no-apply-candidate') args.applyCandidate = false
    else if (item === '--publication-gate') args.publicationGate = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/run_h4g_unit_work_item.js \\
  --work-item h4g_unit_work_math_6aec3166

Runs one H4G unit-evidence worklist item end-to-end:
unit materialization, unit audit, standard matching, candidate build, candidate
audit, consistency audit, and optional generated data-root application.

This script never writes to public/data. Candidate application writes only to
the generated out-dir data_candidate root unless --no-apply-candidate is used.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function safeSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96) || 'work_item'
}

function findWorkItem(worklist, args) {
  const items = worklist.recommended_work_items || []
  if (args.workItem) {
    return items.find(item => item.work_item_id === args.workItem)
  }
  if (args.subject && args.edition) {
    return items.find(item => item.subject === args.subject && item.edition === args.edition)
  }
  if (args.subject) return items.find(item => item.subject === args.subject)
  return null
}

function commandText(script, args) {
  return ['node', script, ...args.map(arg => String(arg))].join(' ')
}

function runStep(name, script, args, summary) {
  const startedAt = Date.now()
  const command = commandText(script, args)
  console.error(`[h4g-work-item] ${name}`)
  const result = spawnSync(process.execPath, [script, ...args.map(arg => String(arg))], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64
  })
  const step = {
    name,
    command,
    status: result.status,
    signal: result.signal || '',
    duration_ms: Date.now() - startedAt,
    ok: result.status === 0
  }
  if (result.error) step.error = result.error.message
  if (!step.ok && result.stderr?.trim()) step.stderr_excerpt = result.stderr.trim().slice(-4000)
  if (!step.ok && result.stdout?.trim()) step.stdout_excerpt = result.stdout.trim().slice(-4000)
  summary.steps.push(step)
  if (result.status !== 0 || result.error) {
    throw new Error(`${name} failed with status ${result.status ?? 'error'}${result.error ? `: ${result.error.message}` : ''}`)
  }
  return result.stdout
}

function maybeReadJson(path) {
  return existsSync(path) ? readJson(path) : null
}

function compactConsistencySummary(summary) {
  if (!summary) return null
  const {
    candidate_details: _candidateDetails,
    progression_groups: _progressionGroups,
    ...rest
  } = summary
  return rest
}

function addPublicationGateArgs(args, publicationGate) {
  if (!publicationGate) return args
  return [
    ...args,
    '--fail-on-nonmonotonic-pages',
    '--min-editions-per-standard',
    '2',
    '--min-editions-per-progression-group',
    '2',
    '--require-complete-progression-groups'
  ]
}

function summarizeRun(summary, paths) {
  const unitAudit = maybeReadJson(paths.unitAudit)
  const matchAudit = maybeReadJson(paths.matchAudit)
  const candidateAudit = maybeReadJson(paths.candidateAudit)
  const consistencyAudit = maybeReadJson(paths.consistencyAudit)
  const applySummary = maybeReadJson(paths.applySummary)
  const indexValidation = maybeReadJson(paths.indexValidation)
  const distinctivenessAudit = maybeReadJson(paths.distinctivenessAudit)
  const gradeBandPolicy = maybeReadJson(paths.gradeBandPolicy)

  summary.metrics = {
    unit_index: unitAudit?.summary || null,
    matches: matchAudit?.summary || null,
    candidates: candidateAudit?.summary || null,
    consistency: consistencyAudit ? {
      publication_readiness: consistencyAudit.publication_readiness || null,
      summary: compactConsistencySummary(consistencyAudit.summary)
    } : null,
    apply: applySummary?.totals || null,
    candidate_data_root_validation: indexValidation || null,
    distinctiveness: distinctivenessAudit?.totals || null,
    grade_band_policy: gradeBandPolicy?.public_data?.totals || gradeBandPolicy?.summary || gradeBandPolicy?.totals || null
  }
  summary.valid = summary.steps.every(step => step.ok) &&
    (!unitAudit || unitAudit.valid !== false) &&
    (!matchAudit || matchAudit.valid !== false) &&
    (!candidateAudit || candidateAudit.valid !== false) &&
    (!consistencyAudit || consistencyAudit.valid !== false) &&
    (!applySummary || applySummary.valid !== false) &&
    (!indexValidation || indexValidation.valid !== false) &&
    (!distinctivenessAudit || distinctivenessAudit.valid !== false) &&
    (!gradeBandPolicy || gradeBandPolicy.valid !== false)
  return summary
}

function markdownSummary(summary) {
  const unit = summary.metrics?.unit_index || {}
  const matches = summary.metrics?.matches || {}
  const candidates = summary.metrics?.candidates || {}
  const consistency = summary.metrics?.consistency?.summary || {}
  const readiness = summary.metrics?.consistency?.publication_readiness || {}
  const apply = summary.metrics?.apply || {}
  const distinctiveness = summary.metrics?.distinctiveness || {}

  return `# H4G Unit Evidence Work Item Run

Generated: ${summary.generated_at}

## Work Item

| Field | Value |
| --- | --- |
| work item | ${summary.work_item.work_item_id} |
| subject | ${summary.work_item.subject_label || summary.work_item.subject} |
| edition | ${summary.work_item.edition} |
| evidence files | ${summary.work_item.evidence_ids.length} |
| out dir | ${summary.paths.out_dir} |

## Gate Summary

| Gate | Result |
| --- | --- |
| valid | ${summary.valid ? 'true' : 'false'} |
| real unit candidates | ${unit.real_unit_or_chapter_candidates ?? 'n/a'} |
| volume seeds | ${unit.volume_seed_candidates ?? 'n/a'} |
| matches | ${matches.matches ?? 'n/a'} |
| eligible matches | ${matches.eligible_matches ?? 'n/a'} |
| candidates | ${candidates.candidates ?? 'n/a'} |
| unit evidence objects | ${candidates.unit_evidence_objects ?? 'n/a'} |
| single-edition standards | ${consistency.single_edition_standards ?? 'n/a'} |
| multi-edition standards | ${consistency.multi_edition_standards ?? 'n/a'} |
| nonmonotonic page records | ${consistency.nonmonotonic_page_records ?? 'n/a'} |
| applied records | ${apply.applied_records ?? 'n/a'} |
| candidate data unit-level records | ${distinctiveness.unit_level_evidence_records ?? 'n/a'} |

## Publication Readiness

| Check | Value |
| --- | --- |
| has candidate evidence | ${readiness.has_candidate_evidence ?? 'n/a'} |
| page start gate ready | ${readiness.page_start_gate_ready ?? 'n/a'} |
| page range gate ready | ${readiness.page_range_gate_ready ?? 'n/a'} |
| cross-version consistency proven | ${readiness.cross_version_consistency_proven ?? 'n/a'} |
| complete progression groups | ${readiness.complete_progression_groups ?? 'n/a'} |

## Steps

${summary.steps.map(step => `- ${step.ok ? 'PASS' : 'FAIL'} ${step.name} (${step.duration_ms}ms)`).join('\n')}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  if (!existsSync(args.worklist)) errors.push(`Missing worklist: ${args.worklist}`)
  if (!args.workItem && !args.subject) errors.push('Use --work-item, or --subject with optional --edition.')
  if (errors.length) {
    console.log(JSON.stringify({ valid: false, errors }, null, 2))
    process.exit(1)
  }

  const worklist = readJson(args.worklist)
  const workItem = findWorkItem(worklist, args)
  if (!workItem) {
    console.log(JSON.stringify({ valid: false, errors: ['No matching work item found.'] }, null, 2))
    process.exit(1)
  }
  if (!Array.isArray(workItem.evidence_ids) || !workItem.evidence_ids.length) {
    console.log(JSON.stringify({ valid: false, errors: [`${workItem.work_item_id} has no evidence_ids.`] }, null, 2))
    process.exit(1)
  }

  const outDir = resolve(args.outDir || join(DEFAULT_OUT_BASE, safeSegment(workItem.work_item_id)))
  const debugTextDir = join(outDir, 'debug_text')
  const paths = {
    out_dir: outDir,
    unitIndex: join(outDir, 'textbook_unit_index.json'),
    unitSummary: join(outDir, 'textbook_unit_index_summary.md'),
    unitAudit: join(outDir, 'textbook_unit_index_audit.json'),
    matches: join(outDir, 'textbook_unit_standard_matches.json'),
    matchesSummary: join(outDir, 'textbook_unit_standard_matches_summary.md'),
    matchAudit: join(outDir, 'textbook_unit_standard_matches_audit.json'),
    candidate: join(outDir, 'h4g_unit_evidence_candidate.json'),
    candidateSummary: join(outDir, 'h4g_unit_evidence_candidate_summary.md'),
    candidateAudit: join(outDir, 'h4g_unit_evidence_candidate_audit.json'),
    consistencyAudit: join(outDir, 'h4g_unit_evidence_consistency.json'),
    dataCandidateRoot: join(outDir, 'data_candidate'),
    applySummary: join(outDir, 'data_candidate', 'h4g_unit_evidence_apply_summary.json'),
    indexValidation: join(outDir, 'data_candidate_index_validation.json'),
    distinctivenessAudit: join(outDir, 'grade7_9_distinctiveness_audit.json'),
    gradeBandPolicy: join(outDir, 'grade7_9_grade_band_policy.json'),
    runSummary: join(outDir, 'run_summary.json'),
    runSummaryMd: join(outDir, 'run_summary.md')
  }
  mkdirSync(outDir, { recursive: true })

  const summary = {
    valid: false,
    generated_at: new Date().toISOString(),
    worklist: args.worklist,
    work_item: {
      work_item_id: workItem.work_item_id,
      subject: workItem.subject,
      subject_label: workItem.subject_label,
      edition: workItem.edition,
      coverage_role: workItem.coverage_role,
      evidence_ids: workItem.evidence_ids
    },
    options: {
      data_root: args.dataRoot,
      max_pages: args.maxPages,
      materialize_timeout_ms: args.materializeTimeoutMs,
      download_timeout_ms: args.downloadTimeoutMs,
      download_retries: args.downloadRetries,
      ocr_fallback: args.ocrFallback,
      apply_candidate: args.applyCandidate,
      publication_gate: args.publicationGate
    },
    paths,
    steps: [],
    errors: []
  }

  try {
    const unitArgs = [
      '--evidence-ids',
      workItem.evidence_ids.join(','),
      '--materialize',
      '--max-pages',
      args.maxPages,
      '--materialize-timeout-ms',
      args.materializeTimeoutMs,
      '--download-timeout-ms',
      args.downloadTimeoutMs,
      '--download-retries',
      args.downloadRetries,
      '--debug-text-dir',
      debugTextDir,
      '--out',
      paths.unitIndex,
      '--summary-out',
      paths.unitSummary
    ]
    if (args.ocrFallback) unitArgs.push('--ocr-fallback')

    runStep('materialize_units', 'scripts/textbooks/build_textbook_unit_index.js', unitArgs, summary)
    runStep('audit_units', 'scripts/textbooks/audit_textbook_unit_index.js', [
      '--unit-index',
      paths.unitIndex,
      '--out',
      paths.unitAudit,
      '--strict',
      '--require-real-units'
    ], summary)
    runStep('match_units', 'scripts/textbooks/match_standards_to_textbook_units.js', [
      '--subjects',
      workItem.subject,
      '--unit-index',
      paths.unitIndex,
      '--out',
      paths.matches,
      '--summary-out',
      paths.matchesSummary
    ], summary)
    runStep('audit_matches', 'scripts/textbooks/audit_textbook_standard_matches.js', [
      '--matches',
      paths.matches,
      '--unit-index',
      paths.unitIndex,
      '--out',
      paths.matchAudit,
      '--strict',
      '--require-matches',
      '--require-eligible'
    ], summary)
    runStep('build_candidates', 'scripts/textbooks/build_h4g_unit_evidence_candidate.js', [
      '--matches',
      paths.matches,
      '--out',
      paths.candidate,
      '--summary-out',
      paths.candidateSummary,
      '--strict',
      '--require-candidates'
    ], summary)
    runStep('audit_candidates', 'scripts/textbooks/audit_h4g_unit_evidence_candidate.js', [
      '--candidate',
      paths.candidate,
      '--out',
      paths.candidateAudit,
      '--strict',
      '--require-candidates',
      '--require-page-start'
    ], summary)
    runStep('audit_consistency', 'scripts/textbooks/audit_h4g_unit_evidence_consistency.js', addPublicationGateArgs([
      '--candidate',
      paths.candidate,
      '--out',
      paths.consistencyAudit,
      '--strict',
      '--require-candidates',
      '--require-page-start'
    ], args.publicationGate), summary)

    if (args.applyCandidate) {
      runStep('apply_candidate_to_generated_root', 'scripts/textbooks/apply_h4g_unit_evidence_candidate.js', [
        '--candidate',
        paths.candidate,
        '--source-data-root',
        args.dataRoot,
        '--out-data-root',
        paths.dataCandidateRoot,
        '--strict'
      ], summary)
      runStep('build_candidate_indexes', 'scripts/build-indexes.js', [
        '--data-root',
        paths.dataCandidateRoot
      ], summary)
      const validation = runStep('validate_candidate_indexes', 'scripts/validate-data-indexes.js', [
        '--data-root',
        paths.dataCandidateRoot
      ], summary)
      if (validation.trim().startsWith('{')) writeJson(paths.indexValidation, JSON.parse(validation))
      runStep('audit_candidate_distinctiveness', 'scripts/grade7_9/audit_h4g_distinctiveness.js', [
        '--data-root',
        paths.dataCandidateRoot,
        '--out',
        paths.distinctivenessAudit,
        '--strict'
      ], summary)
      runStep('audit_candidate_grade_band_policy', 'scripts/grade7_9/audit_grade_band_policy.js', [
        '--public-data-root',
        paths.dataCandidateRoot,
        '--out',
        paths.gradeBandPolicy,
        '--data-only',
        '--strict'
      ], summary)
    }
  } catch (error) {
    summary.errors.push(error.message)
  }

  summarizeRun(summary, paths)
  writeJson(paths.runSummary, summary)
  writeText(paths.runSummaryMd, markdownSummary(summary))
  console.log(JSON.stringify(stable(summary), null, 2))
  if (!summary.valid) process.exit(1)
}

main()
