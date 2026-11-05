#!/usr/bin/env node
// Builds the WorkBuddy skill and expert zips from docs/ai/workbuddy plus a snapshot of the 课标 要点.
// The kebiao connector (docs/ai/workbuddy/connector) is its own asset. The expert declares no MCP dependency:
// it uses the connector's tools when a teacher has connected it, else reads kebiao over curl/WebFetch,
// with references/standards-*.md as the offline copy.
// Usage: node scripts/ai/build_workbuddy_packages.mjs [--out <dir>]   (needs `zip` on PATH)
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const args = process.argv.slice(2)
const OUT = resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : join(ROOT, 'output/workbuddy'))
const SRC = join(ROOT, 'docs/ai/workbuddy')
const BUILD = join(OUT, 'build')
const SITE = 'https://www.kebiao.org'

rmSync(BUILD, { recursive: true, force: true })
mkdirSync(BUILD, { recursive: true })

// ---- 要点 snapshot: one Markdown file per subject ----
function standardsReferences(dir) {
    mkdirSync(dir, { recursive: true })
    const subjectsDir = join(ROOT, 'public/data/v2/by_subject')
    const manifest = JSON.parse(readFileSync(join(ROOT, 'public/data/v2/manifest.json'), 'utf8'))
    const index = []
    for (const file of readdirSync(subjectsDir).filter(f => f.endsWith('.json')).sort()) {
        const data = JSON.parse(readFileSync(join(subjectsDir, file), 'utf8'))
        const stageLabel = code => data.stages?.find(st => st.stage_code === code)?.label || code
        const pages = list => (list?.length ? `（课标第 ${list.join('、')} 页）` : '')
        const lines = [
            `# ${data.subject}课程标准要点（${data.source_version}）`,
            '',
            `打包时的快照，共 ${data.standards.length} 条标准。原文一字不改；最新版和教材对应以 ${SITE}/subjects/${data.subject_slug} 为准。`,
            ''
        ]
        for (const s of data.standards) {
            lines.push(`## ${s.code} ${s.title || s.level2}`)
            lines.push(`${s.level1} · ${stageLabel(s.stage_code)} · ${SITE}/standards/${s.code}`)
            lines.push(`标准${s.statement_source === 'official' ? '（课标原文）' : '（kebiao 整理）'}：${s.statement}`)
            for (const item of s.indicators) lines.push(`- ${item.code} ${item.text}${pages(item.pages)}${item.check?.status === 'revised' ? '【2025 修订有改动】' : ''}`)
            lines.push('')
        }
        writeFileSync(join(dir, `standards-${data.subject_slug}.md`), lines.join('\n'))
        index.push(`- ${data.subject}（${data.subject_slug}）：${data.standards.length} 条标准 → standards-${data.subject_slug}.md`)
    }
    writeFileSync(join(dir, 'standards-index.md'), [
        `# 课标要点快照（${manifest.source_version}）`,
        '',
        `${manifest.totals.subjects} 门学科、${manifest.totals.standards} 条标准、${manifest.totals.indicators} 条要点，按学科一个文件；打包日期 ${new Date().toISOString().slice(0, 10)}。`,
        '编码规则：MA-S3-NA-01 = 数学 · 第三学段 · 数与运算 · 第 1 条；MA-S3-NA-01.3 = 它的第 3 条要点。',
        `只在联网查不到时用；最新数据、教材逐课对应和课堂诊断题请用 ${SITE} 的接口。`,
        '',
        ...index,
        ''
    ].join('\n'))
}

function zipDir(parent, name, zipPath, extra = []) {
    rmSync(zipPath, { force: true })
    execFileSync('zip', ['-qrX', zipPath, name, '-x', '*.DS_Store', ...extra], { cwd: parent })
    return statSync(zipPath).size
}

// ---- skill ----
const skillName = 'kebiao-lesson-prep'
const skillDir = join(BUILD, 'skill', skillName)
cpSync(join(SRC, 'skill', skillName), skillDir, { recursive: true })
rmSync(join(skillDir, 'icon.svg'), { force: true })
// WorkBuddy skill packages allow only root/folder/file, so the snapshot sits flat in references/
standardsReferences(join(skillDir, 'references'))
const skillZip = join(OUT, `workbuddy-skill-${skillName}.zip`)
const tooDeep = execFileSync('find', ['.', '-mindepth', '3', '-type', 'd'], { cwd: skillDir, encoding: 'utf8' }).trim()
if (tooDeep) throw new Error(`skill has folders below the second level: ${tooDeep}`)
const skillSize = zipDir(join(BUILD, 'skill'), skillName, skillZip)

// ---- expert: its own files plus the same skill ----
const expertName = 'kebiao-lesson-coach'
const expertDir = join(BUILD, 'expert', expertName)
cpSync(join(SRC, 'expert', expertName), expertDir, { recursive: true })
cpSync(skillDir, join(expertDir, 'skills', skillName), { recursive: true })
const expertZip = join(OUT, `workbuddy-expert-${expertName}.zip`)
for (const required of ['.codebuddy-plugin/plugin.json', `agents/${expertName}.md`, 'avatars/expert.png', 'README.md']) {
    if (!existsSync(join(expertDir, required))) throw new Error(`expert is missing ${required}`)
}
const expertSize = zipDir(join(BUILD, 'expert'), expertName, expertZip, ['-x', '*/avatars/expert.svg'])

const mb = n => `${(n / 1024 / 1024).toFixed(2)} MB`
console.log(`skill  ${skillZip}  ${mb(skillSize)}  (limit 3 MB)`)
console.log(`expert ${expertZip}  ${mb(expertSize)}  (limit 20 MB)`)
if (skillSize > 3 * 1024 * 1024) throw new Error('skill zip is over 3 MB')
