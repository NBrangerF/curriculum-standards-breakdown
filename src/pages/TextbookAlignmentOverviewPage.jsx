import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState, PageLoading } from '../components/StateComponents'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import concepts from './ConceptsPage.module.css'
import styles from './TextbookAlignmentPage.module.css'

// 教材与课标对应: how kebiao ties each textbook lesson to 课标 要点, how it was checked, and for each subject and
// 学段 how many 要点 the library's textbooks teach (public/data/textbooks/alignment_coverage.json).
const STEPS = [
    ['找到这一课在原书的哪几页', '按国家平台同步课的课题，在原书里顺着书页往后找标题，跳过目录、单元导语和附录；扫描版教材先做文字识别。5,447 节课里 4,711 节找到了自己的页。'],
    ['读这一课自己的材料', '教材原文那几页；国家平台教学设计里写的教学目标和重难点；没找到原书文字的课，再读学习任务单或课件；平台的课程简介。都没有的，只读课题。'],
    ['对照本年级的全部要点', 'AI 读这门课这个年级的全部课标要点（历史按这一册的时期），判断这一课「主要在教」哪几条——这一课的教学目标，最多两条——和「也涉及」哪几条。'],
    ['每一条都要有原话为证', 'AI 必须从这一课的材料里摘一段原话说明理由。系统逐条核对：原话不在材料里的、摘的是课标原文而不是教材的，一律不算。']
]

const REFERENCES = [
    ['得克萨斯州教材审定（IMRA）', '出版社要逐条证明教材覆盖每条课标，并给出讲解处和学生练习处两类证据。kebiao 的「原话 + 页码」就是这种证据。'],
    ['Illustrative Mathematics 的课时标准', '每课的标准分「本课在教」「建立在…之上」「为…作铺垫」三类。kebiao 合并为「主要在教」和「也涉及」。'],
    ['日本教科书出版社的年间指导计划', '按单元列出教科书页码、指导内容、对应的学习指导要领和评价规准，是教材出发、课标在旁的做法。'],
    ['MathFish（艾伦人工智能研究所等，2024）', '发现大模型会高估一份材料和课标的对应程度。所以 kebiao 要求每条判断都摘原话，另用一个模型抽查，并开放给教研员审校。'],
    ['Webb 对应性分析', '看课标的每个类别有没有被教到、覆盖面够不够。下面的覆盖图就是按学段统计每条要点有没有一课在教。']
]

const share = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0)
const ORDER = ['chinese', 'math', 'english', 'morality_law', 'science', 'physics', 'chemistry', 'biology', 'history', 'geography', 'arts', 'pe', 'labor', 'it']
const byOrder = (a, b) => ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug)

export default function TextbookAlignmentOverviewPage() {
    usePageMeta(STATIC_PAGE_META['/textbook-alignment'])
    const [data, setData] = useState(null)
    const [platformBooks, setPlatformBooks] = useState([])
    const [error, setError] = useState('')
    useEffect(() => {
        fetch('/data/textbooks/alignment_coverage.json').then(response => {
            if (!response.ok) throw new Error('覆盖数据加载失败')
            return response.json()
        }).then(setData).catch(errorValue => setError(errorValue.message))
        // editions the library has no PDF of: lesson titles and 教学设计 only
        fetch('/data/textbooks/platform_books.json').then(response => (response.ok ? response.json() : { books: [] })).then(value => setPlatformBooks(value.books || [])).catch(() => {})
    }, [])
    if (error) return <ErrorState title="教材与课标对应加载失败" message={error} />
    if (!data) return <PageLoading message="正在统计教材覆盖" />
    const subjects = data.subjects.filter(subject => subject.stages.some(stage => stage.books.length)).sort(byOrder)
    const absent = data.subjects.filter(subject => !subject.stages.some(stage => stage.books.length)).sort(byOrder)

    return (
        <div className={`container ${concepts.page}`}>
            <header className={concepts.hero}>
                <p className={concepts.kicker}>教材与课标对应 · 逐课 · 有原文为证</p>
                <h1 className={concepts.title}>教材的每一课，教的是课标的哪几条要点</h1>
                <p className={concepts.lede}>老师平时面对的是教材，课标只在写教案、命题、评课时才翻。kebiao 把馆里每一册教材的国家平台同步课逐课对到《义务教育课程标准（2022年版2025年修订）》的要点上：从教材进来，课标一课一课地出现在旁边。每一条对应都附这一课教材里的原话和页码，可以翻原书核对。</p>
                <div className={styles.actions}>
                    <Link className="btn btn-primary" to="/textbooks">从教材馆选一本书</Link>
                    <Link className="btn btn-secondary" to="/guide">老师上手指南</Link>
                </div>
            </header>

            <section className={concepts.block} aria-labelledby="alignment-how">
                <h2 id="alignment-how">怎么对的</h2>
                <ol className={concepts.path}>
                    {STEPS.map(([title, text]) => <li key={title}><strong>{title}</strong>：{text}</li>)}
                </ol>
            </section>

            <section className={concepts.block} aria-labelledby="alignment-check">
                <h2 id="alignment-check">准不准</h2>
                <p className={concepts.prose}>先在 12 门学科里选了 14 课，用另一个大模型（Claude）按课标原文标出每课该对的要点，再和这里的结果比较：全部跑完后，13 课里有 11 课找到了这一课该教的要点；标「主要在教」的 16 条里，13 条一致。再由 Claude 按学科随机抽样、逐条读这一课的材料和要点原文核对：馆里的书抽了 61 条「主要在教」，53 条对，5 条部分对（应是「也涉及」，或同一条标准下有更贴切的要点），3 条错；试点版本的数学抽了 40 条，36 条对，3 条部分对，1 条错。错的多在同一条标准下相近的要点之间，比如讲正比例的课选了「比」，讲方向和距离的课选了「比例尺」。这些检查都还没有经过老师或教研员复核；「也涉及」放得宽，只作参考。所以页面上的对应都标着「待核验」，看到不对的请点「报错」；教研员可以下载每本书的审校表逐条核对，核对过的会标「教研员已核验」。</p>
            </section>

            <section className={concepts.block} aria-labelledby="alignment-coverage">
                <h2 id="alignment-coverage">馆里的教材教到了课标的多少</h2>
                <p className={concepts.prose}>按学段统计：这一学段的每条要点，馆里这一学段的教材里有没有一课在教。没找到的，可能是教材没专门安排（舞蹈、戏剧等），放在综合实践活动里，也可能是 AI 没认出来。</p>
                <p className={styles.legend}><span><i data-kind="T" />有一课主要在教</span><span><i data-kind="P" />只是涉及</span><span><i data-kind="none" />没找到</span></p>
                {subjects.map(subject => (
                    <div key={subject.slug} className={styles.missingGroup}>
                        <h3>{subject.name}</h3>
                        <div className={styles.coverage}>
                            {subject.stages.filter(stage => stage.books.length).map(stage => {
                                const taught = stage.taught.length
                                const touched = stage.touched.length
                                return (
                                    <div key={stage.stage} className={styles.coverageRow}>
                                        <span>{stage.grades[0]}–{stage.grades.at(-1)} 年级</span>
                                        <div className={styles.bar} role="img" aria-label={`${stage.points} 条要点：${taught} 条有课主要在教，${touched} 条只是涉及，${stage.missing.length} 条没找到`}>
                                            <i data-kind="T" style={{ width: `${share(taught, stage.points)}%` }} />
                                            <i data-kind="P" style={{ width: `${share(touched, stage.points)}%` }} />
                                        </div>
                                        <p className={styles.coverageNote}>
                                            {stage.points} 条要点，{taught} 条有课主要在教（{share(taught, stage.points)}%），{touched} 条只是涉及。教材：{stage.books.map(([edition, title], index) => <span key={edition}>{index ? '、' : ''}<Link to={`/textbooks/${edition}/standards`}>{title.replace(/\s+/gu, '')}</Link></span>)}
                                        </p>
                                        {stage.missing.length ? (
                                            <details className={styles.coverageNote}>
                                                <summary>没找到的 {stage.missing.length} 条</summary>
                                                <ul>{stage.missing.map(([code, text]) => <li key={code}><Link className={styles.code} to={`/standards/${code.replace(/\.\d+$/u, '')}#${code}`}>{code}</Link> {text}</li>)}</ul>
                                            </details>
                                        ) : null}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
                {absent.length ? <p className={concepts.footnote}>馆里还没有{absent.map(subject => subject.name).join('、')}的教材，暂时没有对应。</p> : null}
            </section>

            {platformBooks.length ? (
                <section className={concepts.block} aria-labelledby="alignment-platform">
                    <h2 id="alignment-platform">其他版本（试点）</h2>
                    <p className={concepts.prose}>馆里没有原书的版本，按国家平台上每一课的课题，以及能找到的教学设计、学习任务单或课件逐课对应。没有教材原文，判断比上面的粗，请对照自己手里的书核对。</p>
                    {[...new Set(platformBooks.map(book => `${book.subject}·${book.edition_name}`))].map(group => (
                        <p key={group} className={styles.coverageNote}>
                            <strong>{group.replace('·', ' ')}</strong>：{platformBooks.filter(book => `${book.subject}·${book.edition_name}` === group).map((book, index) => <span key={book.edition_id}>{index ? '、' : ''}<Link to={`/textbooks/${book.edition_id}/standards`}>{book.grade}年级{book.volume}</Link></span>)}
                        </p>
                    ))}
                </section>
            ) : null}

            <section className={concepts.block} aria-labelledby="alignment-references">
                <h2 id="alignment-references">参考了哪些做法</h2>
                <ul className={concepts.path}>
                    {REFERENCES.map(([title, text]) => <li key={title}><strong>{title}</strong>：{text}</li>)}
                </ul>
                <p className={concepts.footnote}>方法和来源的详细说明在项目仓库的 docs/research/2026-10-textbook-standard-alignment.md。数据可以通过 API 和 MCP 取用。</p>
            </section>
        </div>
    )
}
