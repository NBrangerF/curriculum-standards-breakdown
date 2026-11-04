import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadV2Subjects } from '../data/v2Data.js'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import { CopyBlock, MCP_URL } from './AiConnectPage.jsx'
import concepts from './ConceptsPage.module.css'
import guide from './GuidePage.module.css'
import ai from './AiConnectPage.module.css'
import styles from './OpenDataPage.module.css'

// 数据: the free public base. What the data is, how to take it (files, API, MCP), how to cite it, where it comes
// from and how it was checked, and which version it is. kebiao's own part is CC BY 4.0 (DATA_LICENSE.md).
const LICENSE_URL = 'https://github.com/NBrangerF/curriculum-standards-breakdown/blob/main/DATA_LICENSE.md'
const ATTRIBUTION = '课标结构化数据：kebiao 课标（https://www.kebiao.org），CC BY 4.0'
const CITE_EXAMPLE = 'MA-S3-NA-01.3 能用直观的方式表示分数和小数，能比较两个分数的大小和两个小数的大小；会进行小数和分数的转化（不包括将循环小数转化成分数）。\n——教育部《义务教育课程标准（2022年版2025年修订）》数学，第 27、28 页；kebiao 课标 https://www.kebiao.org/standards/MA-S3-NA-01#MA-S3-NA-01.3'
const CURL = `curl -s -X POST https://www.kebiao.org/api/v1/standards/search \\
  -H 'content-type: application/json' \\
  -d '{"subjects":["math"],"stages":["S3"],"keyword":"分数","limit":5}'`

const FILES = [
    { href: '/data/v2/export/kebiao-indicators.csv', name: '全部要点 · CSV', what: '每行一条要点：学科、学段、领域、标准编码、要点编码、要点原文、页码、核对状态、旧编码、链接。Excel 可以直接打开。', count: summary => summary?.files?.indicators, unit: '行' },
    { href: '/data/v2/export/kebiao-standards.csv', name: '全部标准 · CSV', what: '每行一条标准：标准名、标准句及其来源（课标原文或 kebiao 整理）、要点数、旧编码、链接。', count: summary => summary?.files?.standards, unit: '行' },
    { href: '/data/v2/legacy_codes.json', name: '新旧编码对照 · JSON', what: '2022 年版的每个旧编码，对应到 2025 修订版的哪条标准、哪个要点。', count: summary => summary?.totals?.legacy_codes, unit: '个旧编码' },
    { href: '/data/v2/manifest.json', name: '目录 · JSON', what: '14 门学科、各学段的标准和要点数量，以及每门学科文件的位置。' }
]

const CHECK_ROWS = [
    ['verified', '已核对', '和修订版原文逐句对上，页码已标。'],
    ['revised', '修订版有改动', '2025 修订版改过的句子，标准页上高亮新写入的文字。'],
    ['ocr_doubt', '识别存疑', '扫描件识别有疑问，请以官方 PDF 为准。'],
    ['table', '表格重建', '原文是表格，按扫描件逐格重建，请以官方 PDF 为准。']
]

const CHANGES = [
    ['2026-11-04', '公开 API 只返回 2025 修订版，2022 年版旧记录移到 /api/v1/legacy/ 对照；数据版本改由标准内容算出；kebiao 整理的数据以 CC BY 4.0 开放；新增 CSV 下载。'],
    ['2026-11-03', '语文 73 条原先以「学段要求」为名的标准，按各自内容重新命名。'],
    ['2026-10-31', '推断层：教材每一课主要在教哪几条要点，附教材原话（待核验）。'],
    ['2026-10-30', '按《义务教育课程标准（2022年版2025年修订）》重建 14 门学科的标准与要点，要点逐字取自原文并标页码；2022 年版的 2,025 个旧编码全部对应到新标准。']
]

const n = value => (typeof value === 'number' ? value.toLocaleString('en-US') : '…')

export default function OpenDataPage() {
    usePageMeta(STATIC_PAGE_META['/open-data'])
    const [version, setVersion] = useState(null)
    const [summary, setSummary] = useState(null)
    const [subjects, setSubjects] = useState([])
    useEffect(() => {
        const json = path => fetch(path).then(response => (response.ok ? response.json() : null)).catch(() => null)
        json('/data/v2/version.json').then(setVersion)
        json('/data/v2/export/summary.json').then(setSummary)
        loadV2Subjects().then(setSubjects).catch(() => setSubjects([]))
    }, [])
    const totals = summary?.totals || version?.totals

    return (
        <div className={`container ${concepts.page}`}>
            <header className={concepts.hero}>
                <p className={concepts.kicker}>数据与接口 · 免费、不用登录 · CC BY 4.0</p>
                <h1 className={concepts.title}>课标数据，拿去用</h1>
                <p className={concepts.lede}>《义务教育课程标准（2022年版2025年修订）》的结构化数据：{n(totals?.subjects)} 门学科、{n(totals?.standards)} 条标准、{n(totals?.indicators)} 条要点，要点逐字取自课标原文并标明页码。可以整包下载，也可以用 API 和 MCP 按需取。kebiao 整理的部分以 CC BY 4.0 开放，注明出处就能复制、改编和商用。</p>
                <ul className={guide.jump} aria-label="本页内容">
                    <li><a href="#data-download">下载</a></li>
                    <li><a href="#data-cite">怎么引用</a></li>
                    <li><a href="#data-api">API 与 MCP</a></li>
                    <li><a href="#data-source">来源与核对</a></li>
                    <li><a href="#data-version">版本</a></li>
                </ul>
            </header>

            <section id="data-download" className={ai.section}>
                <p className={guide.who}>当前版本 <code className={styles.version}>{version?.data_version || '…'}</code></p>
                <h2>下载</h2>
                <ul className={styles.files}>
                    {FILES.map(file => (
                        <li key={file.href}>
                            <a href={file.href} download>{file.name}</a>
                            <span>{file.what}{file.count ? <small>{n(file.count(summary))} {file.unit}</small> : null}</span>
                        </li>
                    ))}
                </ul>
                <h3 className={ai.subhead}>按学科 · JSON</h3>
                <p className={ai.note}>每门学科一个文件：标准、要点、学业要求、教学提示、学段目标，字段说明见 <a href="/api/v1/docs">API 文档</a>。</p>
                <ul className={styles.subjects}>
                    {subjects.map(subject => (
                        <li key={subject.subject_slug}><a href={`/data/v2/by_subject/${subject.subject_slug}.json`} download>{subject.subject}</a><small>{subject.record_count} 条 · {subject.indicator_count} 要点</small></li>
                    ))}
                </ul>
                <h3 className={ai.subhead}>推断层（待核验）</h3>
                <p className={ai.note}>由程序和 AI 生成，没有逐条人工审核，转用时请保留「待核验」：<a href="/data/v2/lesson_alignment.json" download>教材每一课与要点的对应</a>（约 2 MB，含引用的教材原话，原话版权归出版社）。</p>
            </section>

            <section id="data-cite" className={ai.section}>
                <p className={guide.who}>署名即可复制、改编和商用</p>
                <h2>怎么引用</h2>
                <p className={ai.para}>转用 kebiao 的数据时，写上这一行：</p>
                <CopyBlock text={ATTRIBUTION} label="署名" />
                <p className={ai.para}>引用一条要点时，给出编码、原文、页码和链接，原文一字不改：</p>
                <CopyBlock text={CITE_EXAMPLE} label="引用一条要点的示例" />
                <dl className={ai.clients}>
                    <div><dt>在许可内</dt><dd>编码与结构、kebiao 整理的文字、新旧编码对照、修订与核对标记、推断层、kebiao 编写的课堂诊断题。</dd></div>
                    <div><dt>不在许可内</dt><dd>课标原文（它是教育部的文件，kebiao 不主张权利）、教材内容和引用的教材原话、国家平台等第三方平台的内容、学习资源、源代码。</dd></div>
                </dl>
                <p className={ai.note}>全文见 <a href={LICENSE_URL} target="_blank" rel="noopener">DATA_LICENSE.md</a>。</p>
            </section>

            <section id="data-api" className={ai.section}>
                <p className={guide.who}>不用 API Key · 每分钟 30 次</p>
                <h2>API 与 MCP</h2>
                <p className={ai.para}>REST 接口在 <code>https://www.kebiao.org/api/v1</code>，返回和下载文件同一份数据。常用的几个：</p>
                <ul className={ai.tools}>
                    <li><b>GET /standards/{'{code}'}</b>一条标准和它的全部要点；要点编码、2022 年版旧编码也能查，会说明并入了哪条</li>
                    <li><b>POST /standards/search</b>按学科、学段、年级、领域、关键词筛选</li>
                    <li><b>GET /subjects · GET /meta</b>学科列表、数量和可用的筛选项</li>
                    <li><b>GET /data-version</b>当前数据版本，用来判断要不要重新同步</li>
                </ul>
                <CopyBlock text={CURL} label="第一次调用" />
                <p className={ai.note}>全部接口见 <a href="/api/v1/docs">API 文档</a>和 <a href="/api/v1/openapi.yaml">OpenAPI</a>。给 AI 用的 MCP 服务器是 <code>{MCP_URL}</code>，接法见 <Link to="/ai">在 AI 里用 kebiao</Link>；网站说明在 <a href="/llms.txt">llms.txt</a>。需要更高的调用频率，请<Link to="/contact">联系我们</Link>。</p>
            </section>

            <section id="data-source" className={ai.section}>
                <p className={guide.who}>原文以官方出版物为准</p>
                <h2>来源与核对</h2>
                <p className={ai.para}>修订版的文本取自上海市青浦区凤溪中学网站转载的《义务教育课程标准 日常修订版（2022年版2025年修订）》，页码是这份修订版扫描件的页码。kebiao 在原文上加了编码、标准名和分类，没有改写原文。</p>
                <p className={ai.para}>每次发布前，程序逐条检查：每条要点都和修订版原文逐句对得上，并标了页码；课标里该用的每一条原文都被某条标准用到；编码唯一；2022 年版的每个旧编码都有去处。核对状态：</p>
                <table className={styles.checks}>
                    <thead><tr><th scope="col">标记</th><th scope="col">意思</th><th scope="col">要点数</th></tr></thead>
                    <tbody>
                        {CHECK_ROWS.map(([key, label, meaning]) => (
                            <tr key={key}><th scope="row">{label}</th><td>{meaning}</td><td>{n(summary?.checks?.[key])}</td></tr>
                        ))}
                    </tbody>
                </table>
                <p className={ai.para}>标准句有两种：{n(summary?.statements?.official)} 条是课标原句，{n(summary?.statements?.kebiao_summary)} 条是 kebiao 用课标原词写的概括，页面上标「kebiao 整理」。</p>
                <p className={ai.note}>发现哪句和原文对不上，请<Link to="/feedback">告诉我们</Link>，写上编码就行。</p>
            </section>

            <section id="data-version" className={ai.section}>
                <p className={guide.who}>内容不变，版本就不变</p>
                <h2>版本与变更</h2>
                <p className={ai.para}>数据版本 <code className={styles.version}>{version?.data_version || '…'}</code> 由已发布的标准内容算出：任何一句改了，版本才会变。API 的每个响应都带着它（<code>meta.data_version</code>）。</p>
                <ol className={styles.changes}>
                    {CHANGES.map(([date, text]) => <li key={date}><time dateTime={date}>{date}</time><span>{text}</span></li>)}
                </ol>
            </section>

            <p className={concepts.footnote}>kebiao 是独立的开放索引，与教育部无隶属关系。源代码在 <a href="https://github.com/NBrangerF/curriculum-standards-breakdown" target="_blank" rel="noopener">GitHub</a>，代码许可另行说明。</p>
        </div>
    )
}
