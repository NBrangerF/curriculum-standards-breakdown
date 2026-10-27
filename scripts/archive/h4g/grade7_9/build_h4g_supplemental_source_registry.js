#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_OUT = 'generated/h4g_supplemental_sources/source_registry.json'
const DEFAULT_AUTHORITY_OUT = 'generated/h4g_supplemental_sources/source_authority_map.json'
const DEFAULT_SUBJECT_INDEX_OUT = 'generated/h4g_supplemental_sources/source_index_by_subject.json'
const DEFAULT_SUMMARY_OUT = 'generated/h4g_supplemental_sources/source_registry.md'
const DEFAULT_AUDIT_OUT = 'generated/h4g_supplemental_sources/source_registry_audit.json'
const DEFAULT_FREEZE_OUT = 'generated/h4g_supplemental_sources/source_registry.freeze.json'

const SUBJECTS = {
  arts: '艺术',
  chinese: '语文',
  english: '英语',
  it: '信息科技',
  labor: '劳动',
  math: '数学',
  morality_law: '道德与法治',
  pe: '体育',
  science: '科学'
}
const ALL_SUBJECTS = Object.keys(SUBJECTS)
const TIER_ORDER = ['P0', 'P1', 'P2', 'P3']
const REQUIRED_SOURCE_FIELDS = [
  'source_id',
  'title',
  'source_type',
  'source_tier',
  'authority_level',
  'authority_score',
  'subject_coverage',
  'allowed_use',
  'disallowed_use',
  'license_status',
  'url'
]

const COMMON_DISALLOWED_USE = [
  'direct_grade_assignment',
  'public_standard_text_rewrite',
  'single_source_progression_inference',
  'copyrighted_long_text_storage'
]

function parseArgs(argv) {
  const args = {
    auditOut: DEFAULT_AUDIT_OUT,
    authorityOut: DEFAULT_AUTHORITY_OUT,
    freeze: false,
    freezeOut: DEFAULT_FREEZE_OUT,
    out: DEFAULT_OUT,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    subjectIndexOut: DEFAULT_SUBJECT_INDEX_OUT,
    timeoutMs: 12000,
    validateUrls: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--audit-out') args.auditOut = argv[++i]
    else if (item === '--authority-out') args.authorityOut = argv[++i]
    else if (item === '--freeze') args.freeze = true
    else if (item === '--freeze-out') args.freezeOut = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subject-index-out') args.subjectIndexOut = argv[++i]
    else if (item === '--timeout-ms') args.timeoutMs = Number(argv[++i]) || args.timeoutMs
    else if (item === '--validate-urls') args.validateUrls = true
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/build_h4g_supplemental_source_registry.js \\
  --validate-urls --strict

Builds the Gate 0 H4G supplemental source registry. This script only registers
and classifies sources. It does not extract evidence, infer grades, build a
skill graph, write public/data, or change official standard text.`)
}

function moePdf(fileName) {
  return `https://www.moe.gov.cn/srcsite/A26/s8001/202204/${fileName}`
}

function source(input) {
  const id = input.source_id
  return {
    ...input,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    evidence_extraction_allowed_in_gate0: false,
    freeze_status: 'unfrozen',
    registry_status: 'candidate',
    source_hash: hashText([
      id,
      input.url,
      input.source_type,
      input.subject_coverage.join('|'),
      input.allowed_use.join('|')
    ].join('\n')),
    writes_public_data: false
  }
}

function sources() {
  return [
    source({
      source_id: 'moe-2022-curriculum-standards-notice',
      title: '教育部：义务教育课程方案和课程标准（2022年版）通知',
      source_type: 'national_curriculum_standards_notice',
      source_tier: 'P0',
      authority_level: 'national_ministry',
      authority_score: 0.99,
      authority_body: '中华人民共和国教育部',
      subject_coverage: ALL_SUBJECTS,
      grade_signal: 'H4G7-H4G9_shared',
      grade_band_signal: 'H4G7-H4G9',
      url: 'https://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html',
      published_at: '2022-04-20',
      allowed_use: ['legal_basis', 'standards_source_index', 'academic_quality_signal', 'evaluation_guidance_signal'],
      disallowed_use: [...COMMON_DISALLOWED_USE, 'exam_scope_override'],
      license_status: 'link_and_metadata_only',
      access_type: 'public_web',
      notes: 'Gate 0 registry anchor for official 2022 compulsory education curriculum standards.'
    }),
    source({
      source_id: 'moe-2022-curriculum-plan-pdf',
      title: '义务教育课程方案（2022年版）',
      source_type: 'national_curriculum_plan_pdf',
      source_tier: 'P0',
      authority_level: 'national_ministry',
      authority_score: 0.99,
      authority_body: '中华人民共和国教育部',
      subject_coverage: ALL_SUBJECTS,
      grade_signal: 'H4G7-H4G9_shared',
      grade_band_signal: 'H4G7-H4G9',
      url: moePdf('W020220420582343217634.pdf'),
      published_at: '2022-04-20',
      allowed_use: ['legal_basis', 'curriculum_structure', 'class_hour_structure', 'subject_coverage_anchor'],
      disallowed_use: COMMON_DISALLOWED_USE,
      license_status: 'link_and_metadata_only',
      access_type: 'public_pdf',
      notes: 'Official course plan. Use for curriculum structure, not grade inference.'
    }),
    standardPdf('morality_law', 'moe-2022-morality-law-standard-pdf', '义务教育道德与法治课程标准（2022年版）', 'W020220420582343475848.pdf'),
    standardPdf('chinese', 'moe-2022-chinese-standard-pdf', '义务教育语文课程标准（2022年版）', 'W020220420582344386456.pdf'),
    standardPdf('math', 'moe-2022-math-standard-pdf', '义务教育数学课程标准（2022年版）', 'W020220510531636118932.pdf'),
    standardPdf('english', 'moe-2022-english-standard-pdf', '义务教育英语课程标准（2022年版）', 'W020220420582349487953.pdf'),
    standardPdf('science', 'moe-2022-science-standard-pdf', '义务教育科学课程标准（2022年版）', 'W020220420582355009892.pdf'),
    standardPdf('it', 'moe-2022-it-standard-pdf', '义务教育信息科技课程标准（2022年版）', 'W020220420582361024968.pdf'),
    standardPdf('pe', 'moe-2022-pe-standard-pdf', '义务教育体育与健康课程标准（2022年版）', 'W020220420582362336303.pdf'),
    standardPdf('arts', 'moe-2022-arts-standard-pdf', '义务教育艺术课程标准（2022年版）', 'W020220420582364678888.pdf'),
    standardPdf('labor', 'moe-2022-labor-standard-pdf', '义务教育劳动课程标准（2022年版）', 'W020220420582367012450.pdf'),
    source({
      source_id: 'moe-2019-junior-academic-proficiency-exam-policy',
      title: '教育部关于加强初中学业水平考试命题工作的意见',
      source_type: 'national_exam_policy',
      source_tier: 'P0',
      authority_level: 'national_ministry',
      authority_score: 0.98,
      authority_body: '中华人民共和国教育部',
      subject_coverage: ALL_SUBJECTS,
      grade_signal: 'G9_cap',
      grade_band_signal: 'H4G7-H4G9',
      url: 'https://www.moe.gov.cn/srcsite/A06/s3321/201911/t20191128_409951.html',
      published_at: '2019-11-28',
      allowed_use: ['exam_policy_boundary', 'assessment_design_principle', 'g9_assessment_cap'],
      disallowed_use: [...COMMON_DISALLOWED_USE, 'local_exam_scope_as_truth_source'],
      license_status: 'link_and_metadata_only',
      access_type: 'public_web',
      notes: 'Policy source for canceling separate exam syllabi and requiring curriculum-standard-aligned exams.'
    }),
    source({
      source_id: 'moe-2022-middle-school-exam-proposition-notice',
      title: '教育部办公厅关于做好2022年中考命题工作的通知',
      source_type: 'national_exam_policy',
      source_tier: 'P0',
      authority_level: 'national_ministry',
      authority_score: 0.98,
      authority_body: '中华人民共和国教育部',
      subject_coverage: ALL_SUBJECTS,
      grade_signal: 'G9_cap',
      grade_band_signal: 'H4G7-H4G9',
      url: 'https://www.moe.gov.cn/srcsite/A06/s3321/202204/t20220406_614237.html',
      published_at: '2022-04-06',
      allowed_use: ['exam_policy_boundary', 'assessment_design_principle', 'g9_assessment_cap'],
      disallowed_use: [...COMMON_DISALLOWED_USE, 'local_exam_scope_as_truth_source'],
      license_status: 'link_and_metadata_only',
      access_type: 'public_web',
      notes: 'Policy source that reinforces curriculum-standard-aligned exam proposition boundaries.'
    }),
    source({
      source_id: 'zhejiang-2025-junior-exam-thinking',
      title: '浙江省2025年初中学业水平考试命题思路',
      source_type: 'provincial_exam_thinking',
      source_tier: 'P1',
      authority_level: 'provincial_exam_authority',
      authority_score: 0.88,
      authority_body: '浙江省教育考试院',
      subject_coverage: ['chinese', 'math', 'english', 'science', 'morality_law'],
      grade_signal: 'G9_cap',
      grade_band_signal: 'H4G7-H4G9',
      url: 'https://www.zjzs.net/art/2025/6/23/art_31_11386.html',
      published_at: '2025-06-23',
      allowed_use: ['assessment_task_complexity', 'g9_assessment_cap', 'exam_proposition_signal'],
      disallowed_use: [...COMMON_DISALLOWED_USE, 'g7_direct_assignment', 'g8_direct_assignment'],
      license_status: 'link_and_metadata_only',
      access_type: 'public_web',
      notes: 'Use only as a G9 cap and task-complexity source after Gate 0.'
    }),
    source({
      source_id: 'zhejiang-2025-junior-exam-review',
      title: '浙江省2025年初中学业水平考试试题评析',
      source_type: 'provincial_exam_review',
      source_tier: 'P1',
      authority_level: 'provincial_exam_authority',
      authority_score: 0.88,
      authority_body: '浙江省教育考试院',
      subject_coverage: ['chinese', 'math', 'english', 'science', 'morality_law'],
      grade_signal: 'G9_cap',
      grade_band_signal: 'H4G7-H4G9',
      url: 'https://www.zjzs.net/art/2025/6/23/art_31_11385.html',
      published_at: '2025-06-23',
      allowed_use: ['assessment_task_complexity', 'g9_assessment_cap', 'rubric_signal'],
      disallowed_use: [...COMMON_DISALLOWED_USE, 'g7_direct_assignment', 'g8_direct_assignment'],
      license_status: 'link_and_metadata_only',
      access_type: 'public_web',
      notes: 'Use as assessment-analysis metadata; do not store long copied exam text.'
    }),
    source({
      source_id: 'zhejiang-2024-junior-exam-thinking',
      title: '浙江省2024年中考命题思路',
      source_type: 'provincial_exam_thinking',
      source_tier: 'P1',
      authority_level: 'provincial_exam_authority',
      authority_score: 0.86,
      authority_body: '浙江省教育考试院',
      subject_coverage: ['chinese', 'math', 'english', 'science', 'morality_law'],
      grade_signal: 'G9_cap',
      grade_band_signal: 'H4G7-H4G9',
      url: 'https://www.zjzs.net/art/2024/6/24/art_155_9739.html',
      published_at: '2024-06-24',
      allowed_use: ['assessment_task_complexity', 'cross_year_stability_check', 'g9_assessment_cap'],
      disallowed_use: [...COMMON_DISALLOWED_USE, 'g7_direct_assignment', 'g8_direct_assignment'],
      license_status: 'link_and_metadata_only',
      access_type: 'public_web',
      notes: 'Use to check stability against 2025 exam signals.'
    }),
    source({
      source_id: 'zhejiang-junior-exam-unified-proposition-notice-pdf',
      title: '浙江省初中学业水平考试全省统一命题通知',
      source_type: 'provincial_exam_policy_pdf',
      source_tier: 'P1',
      authority_level: 'provincial_education_authority',
      authority_score: 0.84,
      authority_body: '浙江省教育厅',
      subject_coverage: ['chinese', 'math', 'english', 'science', 'morality_law', 'pe'],
      grade_signal: 'G9_cap',
      grade_band_signal: 'H4G7-H4G9',
      url: 'https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web3114/site/attach/0/924fe84581ff48a6bba132fac066ea0d.pdf',
      published_at: null,
      allowed_use: ['exam_policy_boundary', 'exam_subject_coverage', 'assessment_channel_signal'],
      disallowed_use: COMMON_DISALLOWED_USE,
      license_status: 'link_and_metadata_only',
      access_type: 'public_pdf',
      notes: 'Use for exam subject/channel boundaries only.'
    }),
    source({
      source_id: 'beijing-exam-authority-middle-school-admission-channel',
      title: '北京教育考试院中考中招频道',
      source_type: 'municipal_exam_channel',
      source_tier: 'P1',
      authority_level: 'municipal_exam_authority',
      authority_score: 0.82,
      authority_body: '北京教育考试院',
      subject_coverage: ['chinese', 'math', 'english', 'morality_law', 'pe', 'science'],
      grade_signal: 'G9_cap',
      grade_band_signal: 'H4G7-H4G9',
      url: 'https://www.bjeea.cn/html/zkzz/',
      published_at: null,
      allowed_use: ['assessment_channel_signal', 'exam_implementation_signal', 'speaking_listening_exam_signal'],
      disallowed_use: COMMON_DISALLOWED_USE,
      license_status: 'link_and_metadata_only',
      access_type: 'public_web',
      notes: 'Registry channel source; downstream Gate 1 must register individual documents before extraction.'
    }),
    source({
      source_id: 'shanghai-2025-high-school-admission-implementation-rules',
      title: '上海市2025年高中阶段学校考试招生实施细则',
      source_type: 'municipal_admission_policy',
      source_tier: 'P1',
      authority_level: 'municipal_education_authority',
      authority_score: 0.82,
      authority_body: '上海市教育委员会',
      subject_coverage: ['chinese', 'math', 'english', 'morality_law', 'pe', 'science'],
      grade_signal: 'G9_cap',
      grade_band_signal: 'H4G7-H4G9',
      url: 'https://edu.sh.gov.cn/mbjy_xwzx/20250314/8562a13f31484d7688d71974ebbd23b8.html',
      published_at: '2025-03-14',
      allowed_use: ['exam_implementation_signal', 'assessment_channel_signal', 'experiment_operation_signal'],
      disallowed_use: COMMON_DISALLOWED_USE,
      license_status: 'link_and_metadata_only',
      access_type: 'public_web',
      notes: 'Use for exam form and assessment channel metadata, not direct grade assignment.'
    }),
    source({
      source_id: 'moe-2021-compulsory-education-quality-monitoring-plan',
      title: '国家义务教育质量监测方案（2021年修订版）',
      source_type: 'national_quality_monitoring_policy',
      source_tier: 'P1',
      authority_level: 'national_ministry',
      authority_score: 0.93,
      authority_body: '中华人民共和国教育部',
      subject_coverage: ALL_SUBJECTS,
      grade_signal: 'G8_anchor',
      grade_band_signal: 'H4G7-H4G9',
      url: 'https://www.moe.gov.cn/srcsite/A11/moe_1789/202109/t20210926_567095.html',
      published_at: '2021-09-26',
      allowed_use: ['g8_benchmark', 'quality_monitoring_framework', 'non_exam_subject_benchmark'],
      disallowed_use: [...COMMON_DISALLOWED_USE, 'g9_exam_cap'],
      license_status: 'link_and_metadata_only',
      access_type: 'public_web',
      notes: 'Important G8 anchor source. It does not assign individual standards to grades.'
    }),
    source({
      source_id: 'moe-compulsory-education-quality-monitoring-report-pdf',
      title: '中国义务教育质量监测报告',
      source_type: 'national_quality_monitoring_report',
      source_tier: 'P1',
      authority_level: 'national_ministry',
      authority_score: 0.91,
      authority_body: '中华人民共和国教育部',
      subject_coverage: ['chinese', 'math', 'science', 'pe', 'arts', 'labor'],
      grade_signal: 'G8_anchor',
      grade_band_signal: 'H4G7-H4G9',
      url: 'https://www.moe.gov.cn/jyb_xwfb/moe_1946/fj_2018/201807/P020180724685827455405.pdf',
      published_at: '2018-07-24',
      allowed_use: ['g8_benchmark', 'quality_monitoring_performance_level', 'non_exam_subject_benchmark'],
      disallowed_use: COMMON_DISALLOWED_USE,
      license_status: 'link_and_metadata_only',
      access_type: 'public_pdf',
      notes: 'Use for monitored performance dimensions and broad G8 anchor signals.'
    }),
    source({
      source_id: 'beijing-2024-national-curriculum-textbook-catalog-pdf',
      title: '2024义务教育国家课程教学用书目录',
      source_type: 'textbook_catalog_pdf',
      source_tier: 'P2',
      authority_level: 'municipal_education_authority',
      authority_score: 0.76,
      authority_body: '北京市教育委员会',
      subject_coverage: ALL_SUBJECTS,
      grade_signal: 'H4G7-H4G9_shared',
      grade_band_signal: 'H4G7-H4G9',
      url: 'https://jw.beijing.gov.cn/xxgk/2024zcwj/2024qtwj/202408/W020240905543232813376.pdf',
      published_at: '2024-09-05',
      allowed_use: ['textbook_resource_registry', 'textbook_edition_update_signal', 'digital_resource_signal'],
      disallowed_use: COMMON_DISALLOWED_USE,
      license_status: 'link_and_metadata_only',
      access_type: 'public_pdf',
      notes: 'Use for textbook/resource registry only; not task extraction in Gate 0.'
    }),
    source({
      source_id: 'national-smart-education-platform',
      title: '国家中小学智慧教育平台',
      source_type: 'official_textbook_platform',
      source_tier: 'P2',
      authority_level: 'national_official_platform',
      authority_score: 0.80,
      authority_body: '国家智慧教育公共服务平台',
      subject_coverage: ALL_SUBJECTS,
      grade_signal: 'H4G7-H4G9_shared',
      grade_band_signal: 'H4G7-H4G9',
      url: 'https://www.zxx.edu.cn/',
      published_at: null,
      allowed_use: ['textbook_resource_registry', 'digital_resource_signal', 'teaching_implementation_signal'],
      disallowed_use: [...COMMON_DISALLOWED_USE, 'unversioned_content_as_final_evidence'],
      license_status: 'link_and_metadata_only',
      access_type: 'public_web',
      notes: 'Use as registry entry for official digital resources; individual resources need later source entries.'
    }),
    source({
      source_id: 'oecd-pisa-2022-assessment-framework-pdf',
      title: 'PISA 2022 Assessment and Analytical Framework',
      source_type: 'international_assessment_framework',
      source_tier: 'P3',
      authority_level: 'international_organization',
      authority_score: 0.68,
      authority_body: 'OECD',
      subject_coverage: ['chinese', 'math', 'science'],
      grade_signal: 'framework_only',
      grade_band_signal: 'not_china_grade_specific',
      url: 'https://www.oecd.org/content/dam/oecd/en/publications/reports/2023/08/pisa-2022-assessment-and-analytical-framework_a124aec8/dfe0bf9c-en.pdf',
      published_at: '2023-08-31',
      allowed_use: ['task_complexity_normalization', 'international_framework_reference'],
      disallowed_use: [...COMMON_DISALLOWED_USE, 'china_curriculum_truth_source'],
      license_status: 'link_and_metadata_only',
      access_type: 'public_pdf',
      notes: 'Framework-only source. It normalizes task difficulty but cannot justify China grade assignment.'
    }),
    source({
      source_id: 'webb-dok-primer',
      title: 'Webb DOK Primer',
      source_type: 'cognitive_demand_framework',
      source_tier: 'P3',
      authority_level: 'professional_framework',
      authority_score: 0.62,
      authority_body: 'WebbAlign',
      subject_coverage: ALL_SUBJECTS,
      grade_signal: 'framework_only',
      grade_band_signal: 'not_china_grade_specific',
      url: 'https://www.webbalign.org/dok-primer',
      published_at: null,
      allowed_use: ['cognitive_demand_normalization', 'task_complexity_normalization'],
      disallowed_use: [...COMMON_DISALLOWED_USE, 'china_curriculum_truth_source'],
      license_status: 'link_and_metadata_only',
      access_type: 'public_web',
      notes: 'Framework-only source for coding cognitive demand after evidence extraction.'
    })
  ]
}

function standardPdf(subjectSlug, sourceId, title, fileName) {
  return source({
    source_id: sourceId,
    title,
    source_type: 'national_curriculum_standard_pdf',
    source_tier: 'P0',
    authority_level: 'national_ministry',
    authority_score: 0.99,
    authority_body: '中华人民共和国教育部',
    subject_coverage: [subjectSlug],
    grade_signal: 'H4G7-H4G9_shared',
    grade_band_signal: 'H4G7-H4G9',
    url: moePdf(fileName),
    published_at: '2022-04-20',
    allowed_use: ['standards_evidence', 'academic_quality_signal', 'evaluation_guidance_signal', 'teaching_suggestion_signal'],
    disallowed_use: [...COMMON_DISALLOWED_USE, 'standalone_grade_split_truth_source'],
    license_status: 'link_and_metadata_only',
    access_type: 'public_pdf',
    notes: `Official 2022 ${SUBJECTS[subjectSlug]} curriculum standard PDF.`
  })
}

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function sorted(values) {
  return [...new Set((values || []).filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b))
}

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

async function validateUrl(url, timeoutMs) {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const headers = {
    Accept: 'text/html,application/pdf,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0 (compatible; H4GSourceRegistryGate0/1.0)'
  }
  try {
    let response = await fetch(url, {
      headers,
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal
    })
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, {
        headers: { ...headers, Range: 'bytes=0-0' },
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal
      })
    }
    return {
      checked_at: new Date().toISOString(),
      elapsed_ms: Date.now() - startedAt,
      final_url: response.url || url,
      http_status: response.status,
      ok: response.ok || response.status === 206,
      status: response.ok || response.status === 206 ? 'valid' : 'http_error'
    }
  } catch (error) {
    return {
      checked_at: new Date().toISOString(),
      elapsed_ms: Date.now() - startedAt,
      error: error.name === 'AbortError' ? `timeout_after_${timeoutMs}ms` : String(error.message || error),
      final_url: url,
      http_status: null,
      ok: false,
      status: 'network_error'
    }
  } finally {
    clearTimeout(timer)
  }
}

async function withUrlValidation(registry, args) {
  if (!args.validateUrls) {
    return registry.map(item => ({
      ...item,
      url_validation: {
        checked_at: null,
        ok: null,
        status: 'not_checked'
      }
    }))
  }
  const output = []
  for (const item of registry) {
    const urlValidation = await validateUrl(item.url, args.timeoutMs)
    output.push({ ...item, url_validation: urlValidation })
  }
  return output
}

function buildAuthorityMap(registry) {
  const byAuthorityLevel = {}
  const bySourceType = {}
  const bySourceTier = {}
  const byAllowedUse = {}
  const byDisallowedUse = {}

  for (const item of registry) {
    pushGrouped(byAuthorityLevel, item.authority_level, item.source_id)
    pushGrouped(bySourceType, item.source_type, item.source_id)
    pushGrouped(bySourceTier, item.source_tier, item.source_id)
    for (const allowed of item.allowed_use || []) pushGrouped(byAllowedUse, allowed, item.source_id)
    for (const disallowed of item.disallowed_use || []) pushGrouped(byDisallowedUse, disallowed, item.source_id)
  }

  return {
    by_allowed_use: mapGrouped(byAllowedUse),
    by_authority_level: mapGrouped(byAuthorityLevel),
    by_disallowed_use: mapGrouped(byDisallowedUse),
    by_source_tier: Object.fromEntries(TIER_ORDER.filter(tier => bySourceTier[tier]).map(tier => [tier, entry(bySourceTier[tier])])),
    by_source_type: mapGrouped(bySourceType),
    generated_at: new Date().toISOString(),
    purpose: 'h4g_supplemental_source_authority_map',
    writes_public_data: false
  }
}

function buildSubjectIndex(registry) {
  const index = {}
  for (const [subjectSlug, subjectName] of Object.entries(SUBJECTS)) {
    const subjectSources = registry.filter(item => item.subject_coverage.includes(subjectSlug))
    const byAuthorityLevel = {}
    const bySourceTier = {}
    const bySourceType = {}
    const byAllowedUse = {}
    for (const item of subjectSources) {
      pushGrouped(byAuthorityLevel, item.authority_level, item.source_id)
      pushGrouped(bySourceTier, item.source_tier, item.source_id)
      pushGrouped(bySourceType, item.source_type, item.source_id)
      for (const allowed of item.allowed_use || []) pushGrouped(byAllowedUse, allowed, item.source_id)
    }
    const p0p1 = subjectSources.filter(item => ['P0', 'P1'].includes(item.source_tier)).map(item => item.source_id)
    index[subjectSlug] = {
      by_allowed_use: mapGrouped(byAllowedUse),
      by_authority_level: mapGrouped(byAuthorityLevel),
      by_source_tier: mapGrouped(bySourceTier),
      by_source_type: mapGrouped(bySourceType),
      coverage_gaps: p0p1.length ? [] : ['missing_p0_p1_source'],
      p0_p1_source_ids: sorted(p0p1),
      source_ids: sorted(subjectSources.map(item => item.source_id)),
      subject: subjectName,
      subject_slug: subjectSlug,
      total_sources: subjectSources.length
    }
  }
  return {
    generated_at: new Date().toISOString(),
    purpose: 'h4g_supplemental_source_index_by_subject',
    subjects: index,
    writes_public_data: false
  }
}

function pushGrouped(target, key, sourceId) {
  const normalized = key || 'missing'
  if (!target[normalized]) target[normalized] = []
  target[normalized].push(sourceId)
}

function mapGrouped(groups) {
  return Object.fromEntries(
    Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => [key, entry(values)])
  )
}

function entry(values) {
  const sourceIds = sorted(values)
  return {
    count: sourceIds.length,
    source_ids: sourceIds
  }
}

function auditRegistry(registry, authorityMap, subjectIndex, args) {
  const errors = []
  const warnings = []
  const sourceIds = new Set()
  const byAuthorityLevel = {}
  const bySourceTier = {}
  const bySourceType = {}
  const byUrlValidationStatus = {}
  const bySubject = {}

  for (const item of registry) {
    for (const field of REQUIRED_SOURCE_FIELDS) {
      if (item[field] === undefined || item[field] === null || item[field] === '') {
        errors.push(`${item.source_id || 'unknown_source'} missing ${field}`)
      }
    }
    if (sourceIds.has(item.source_id)) errors.push(`duplicate source_id: ${item.source_id}`)
    sourceIds.add(item.source_id)
    if (!Array.isArray(item.subject_coverage) || !item.subject_coverage.length) errors.push(`${item.source_id} subject_coverage must be non-empty`)
    if (!Array.isArray(item.allowed_use) || !item.allowed_use.length) errors.push(`${item.source_id} allowed_use must be non-empty`)
    if (!Array.isArray(item.disallowed_use) || !item.disallowed_use.length) errors.push(`${item.source_id} disallowed_use must be non-empty`)
    if (item.authority_score < 0.6) errors.push(`${item.source_id} authority_score below Gate 0 threshold`)
    if (item.writes_public_data !== false) errors.push(`${item.source_id} writes_public_data must be false`)
    if (item.changes_official_standard_text !== false) errors.push(`${item.source_id} changes_official_standard_text must be false`)
    if (item.direct_matcher_use !== false) errors.push(`${item.source_id} direct_matcher_use must be false`)
    if (item.evidence_extraction_allowed_in_gate0 !== false) errors.push(`${item.source_id} evidence_extraction_allowed_in_gate0 must be false`)
    if (!TIER_ORDER.includes(item.source_tier)) errors.push(`${item.source_id} unknown source_tier: ${item.source_tier}`)
    for (const subject of item.subject_coverage || []) {
      if (!SUBJECTS[subject]) errors.push(`${item.source_id} has unknown subject_coverage: ${subject}`)
      else countInto(bySubject, subject)
    }
    countInto(byAuthorityLevel, item.authority_level)
    countInto(bySourceTier, item.source_tier)
    countInto(bySourceType, item.source_type)
    countInto(byUrlValidationStatus, item.url_validation?.status || 'missing')
    if (args.validateUrls && item.url_validation?.ok !== true) {
      errors.push(`${item.source_id} url validation failed: ${item.url_validation?.status || 'missing'}`)
    }
    if (!args.validateUrls && item.url_validation?.status === 'not_checked') {
      warnings.push(`${item.source_id} url not checked; rerun with --validate-urls before freezing`)
    }
  }

  for (const subjectSlug of Object.keys(SUBJECTS)) {
    const item = subjectIndex.subjects?.[subjectSlug]
    if (!item) errors.push(`source_index_by_subject missing ${subjectSlug}`)
    else if (item.coverage_gaps?.length) errors.push(`${subjectSlug} coverage gaps: ${item.coverage_gaps.join(', ')}`)
  }

  if (!authorityMap.by_authority_level) errors.push('source_authority_map missing by_authority_level')
  if (!authorityMap.by_source_type) errors.push('source_authority_map missing by_source_type')
  if (!authorityMap.by_source_tier) errors.push('source_authority_map missing by_source_tier')

  const payload = {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    purpose: 'h4g_supplemental_source_registry_audit',
    source_inputs: {
      validate_urls: args.validateUrls
    },
    summary: {
      by_authority_level: byAuthorityLevel,
      by_source_tier: bySourceTier,
      by_source_type: bySourceType,
      by_subject: bySubject,
      by_url_validation_status: byUrlValidationStatus,
      official_or_framework_sources: registry.length,
      sources_passing_gate0_authority_threshold: registry.filter(item => item.authority_score >= 0.6).length,
      subjects: Object.keys(SUBJECTS).length
    },
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }
  return payload
}

function markdownSummary(registry, authorityMap, subjectIndex, audit) {
  const sourceRows = registry
    .slice()
    .sort((a, b) => (
      TIER_ORDER.indexOf(a.source_tier) - TIER_ORDER.indexOf(b.source_tier) ||
      a.source_id.localeCompare(b.source_id)
    ))
    .map(item => `| ${markdownCell(item.source_tier)} | ${markdownCell(item.source_id)} | ${markdownCell(item.title)} | ${markdownCell(item.authority_level)} | ${item.authority_score} | ${markdownCell(item.subject_coverage.join(', '))} | ${markdownCell(item.allowed_use.join(', '))} | ${markdownCell(item.url_validation?.status || 'not_checked')} |`)
    .join('\n')
  const subjectRows = Object.values(subjectIndex.subjects)
    .sort((a, b) => a.subject_slug.localeCompare(b.subject_slug))
    .map(item => `| ${markdownCell(item.subject)} | ${markdownCell(item.subject_slug)} | ${item.total_sources} | ${markdownCell(item.p0_p1_source_ids.join(', '))} | ${markdownCell((item.coverage_gaps || []).join(', ') || '-')} |`)
    .join('\n')

  return `# H4G Supplemental Source Registry

Generated at: ${audit.generated_at}

Gate: 0 - Source Ingestion Lock

This registry only classifies sources. It does not extract evidence, infer
grade differences, build a skill graph, write public/data, or change official
standard text.

## Status

| Field | Value |
| --- | ---: |
| valid | ${audit.valid} |
| sources | ${audit.summary.official_or_framework_sources} |
| subjects | ${audit.summary.subjects} |
| writes public data | ${audit.writes_public_data} |
| changes official standard text | ${audit.changes_official_standard_text} |
| direct matcher use | ${audit.direct_matcher_use} |

## Source Tiers

| tier | count |
| --- | ---: |
${countRows(audit.summary.by_source_tier)}

## Authority Levels

| authority level | count |
| --- | ---: |
${countRows(audit.summary.by_authority_level)}

## URL Validation

| status | count |
| --- | ---: |
${countRows(audit.summary.by_url_validation_status)}

## Subject Coverage

| subject | slug | sources | P0/P1 sources | gaps |
| --- | --- | ---: | --- | --- |
${subjectRows}

## Sources

| tier | source id | title | authority | score | subjects | allowed use | URL status |
| --- | --- | --- | --- | ---: | --- | --- | --- |
${sourceRows}

## Errors

${audit.errors.length ? audit.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}

## Warnings

${audit.warnings.length ? audit.warnings.map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}

## Authority Map Keys

- by authority level: ${Object.keys(authorityMap.by_authority_level || {}).length}
- by source type: ${Object.keys(authorityMap.by_source_type || {}).length}
- by source tier: ${Object.keys(authorityMap.by_source_tier || {}).length}
`
}

function freezeRegistry(registry, audit) {
  return {
    audit_hash: hashText(JSON.stringify(stable(audit)), 20),
    frozen_at: new Date().toISOString(),
    freeze_scope: 'source_metadata_only',
    freeze_status: audit.valid ? 'frozen_candidate' : 'blocked',
    gate: 'Gate 0 - Source Ingestion Lock',
    source_hashes: Object.fromEntries(registry.map(item => [item.source_id, item.source_hash])),
    source_registry_hash: hashText(JSON.stringify(stable(registry)), 20),
    writes_public_data: false
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const registry = await withUrlValidation(sources(), args)
  const authorityMap = buildAuthorityMap(registry)
  const subjectIndex = buildSubjectIndex(registry)
  const audit = auditRegistry(registry, authorityMap, subjectIndex, args)
  const payload = {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    generated_at: new Date().toISOString(),
    gate: 'Gate 0 - Source Ingestion Lock',
    purpose: 'h4g_supplemental_source_registry',
    registry,
    source_count: registry.length,
    valid: audit.valid,
    writes_public_data: false
  }

  writeJson(args.out, payload)
  writeJson(args.authorityOut, authorityMap)
  writeJson(args.subjectIndexOut, subjectIndex)
  writeJson(args.auditOut, audit)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(registry, authorityMap, subjectIndex, audit))
  if (args.freeze) writeJson(args.freezeOut, freezeRegistry(registry, audit))

  console.log(JSON.stringify(audit, null, 2))
  if (args.strict && !audit.valid) process.exit(1)
}

main()
