// public/data/v2/export/: the 2025 standards as two CSV files a teacher can open in Excel (UTF-8 with BOM), plus the
// counts the 数据 page shows. Runs after build-public-v2 (build:public-data rebuilds public/data from scratch).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.argv[2] || 'public/data/v2'
const OUT = join(ROOT, 'export')
const SITE = 'https://www.kebiao.org'
const CHECK = { verified: '已核对', revised: '修订版有改动', ocr_doubt: '识别存疑，以 PDF 为准', table: '表格重建，以 PDF 为准' }
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'))

const cell = value => {
    const text = String(value ?? '')
    return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text
}
const csv = rows => `﻿${rows.map(row => row.map(cell).join(',')).join('\r\n')}\r\n`
const grades = list => (list?.length ? (list.length > 1 ? `${list[0]}–${list.at(-1)}` : String(list[0])) : '')
const pages = list => (list || []).join('、')

const standardRows = [['学科', '学科代码', '学段', '年级', '一级领域', '标准名', '标准编码', '标准句', '标准句来源', '要点数', '标准句页码', '2022 年版旧编码', '链接']]
const indicatorRows = [['学科', '学科代码', '学段', '年级', '一级领域', '标准名', '标准编码', '要点编码', '要点原文', '出处', '页码', '核对状态', '2022 年版旧编码', '链接']]
const checks = {}
const statements = { official: 0, kebiao_summary: 0 }
for (const entry of manifest.subjects) {
    const subject = JSON.parse(readFileSync(join(ROOT, 'by_subject', `${entry.subject_slug}.json`), 'utf8'))
    const stageLabel = code => subject.stages.find(stage => stage.stage_code === code)?.label || code
    for (const standard of subject.standards) {
        const base = [subject.subject, subject.subject_slug, stageLabel(standard.stage_code), grades(standard.grades), standard.level1, standard.level2, standard.code]
        statements[standard.statement_source] = (statements[standard.statement_source] || 0) + 1
        standardRows.push([...base, standard.statement, standard.statement_source === 'official' ? '课标原文' : 'kebiao 整理', standard.indicators.length, pages(standard.statement_pages), (standard.legacy_codes || []).join(' '), `${SITE}/standards/${standard.code}`])
        for (const item of standard.indicators) {
            const status = item.check?.status || 'verified'
            checks[status] = (checks[status] || 0) + 1
            indicatorRows.push([...base, item.code, item.text, item.section || '', pages(item.pages), CHECK[status] || status, (item.legacy_codes || []).join(' '), `${SITE}/standards/${standard.code}#${item.code}`])
        }
    }
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'kebiao-standards.csv'), csv(standardRows))
writeFileSync(join(OUT, 'kebiao-indicators.csv'), csv(indicatorRows))
writeFileSync(join(OUT, 'summary.json'), `${JSON.stringify({ totals: manifest.totals, checks, statements, files: { standards: standardRows.length - 1, indicators: indicatorRows.length - 1 } }, null, 1)}\n`)
console.log(`v2 export: ${standardRows.length - 1} standards, ${indicatorRows.length - 1} 要点`)
