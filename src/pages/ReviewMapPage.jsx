import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageLoading, ErrorState } from '../components/StateComponents'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import { useMyBook } from '../features/mybook/myBook.js'
import concepts from './ConceptsPage.module.css'
import styles from './ReviewMapPage.module.css'

// 中考复习地图: each junior-stage standard of a subject, with the textbook units of 七、八、九年级 that teach it
// (from the AI's lesson-by-lesson judgements and page alignments) and the 学业要求 of its theme, so a 初三 teacher can plan review by 课标.
const SUBJECTS = [['chinese', '语文'], ['math', '数学'], ['english', '英语'], ['morality_law', '道德与法治'], ['physics', '物理'], ['chemistry', '化学'], ['biology', '生物学'], ['history', '历史'], ['geography', '地理']]
const GRADES = [7, 8, 9]

async function loadJson(url) {
    const response = await fetch(url)
    if (!response.ok) throw new Error('复习地图数据加载失败')
    return response.json()
}

export default function ReviewMapPage() {
    usePageMeta(STATIC_PAGE_META['/review'])
    const [params, setParams] = useSearchParams()
    // with no subject asked for, open on 「我的书」's subject when it has a 中考 map
    const myBook = useMyBook()
    const fallback = SUBJECTS.some(([value]) => value === myBook?.subject_slug) ? myBook.subject_slug : 'physics'
    const slug = SUBJECTS.some(([value]) => value === params.get('subject')) ? params.get('subject') : fallback
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    useEffect(() => {
        let active = true
        setData(null)
        setError('')
        loadJson(`/data/v2/by_subject/${slug}.json`).then(async subject => {
            const prefix = subject.standards[0]?.code.slice(0, 2)
            const units = await loadJson(`/data/v2/national-lessons/${prefix}.json`).then(value => value.units || {}).catch(() => ({}))
            if (active) setData({ subject, units })
        }).catch(errorValue => { if (active) setError(errorValue.message) })
        return () => { active = false }
    }, [slug])
    const groups = useMemo(() => {
        if (!data) return []
        const junior = data.subject.standards.filter(item => (item.grades || []).some(grade => grade >= 7))
        const requirements = (data.subject.stage_overview?.theme_requirements || []).filter(item => /7/u.test(item.stage))
        const out = []
        for (const standard of junior) {
            let group = out.find(item => item.name === standard.level1)
            if (!group) out.push(group = { name: standard.level1, standards: [], requirements: requirements.filter(item => item.level1 === standard.level1) })
            const byGrade = Object.fromEntries(GRADES.map(grade => [grade, (data.units[standard.code] || []).filter(([, textbook]) => textbook.includes(`${grade}年级`))]))
            group.standards.push({ standard, byGrade })
        }
        return out
    }, [data])

    if (error) return <ErrorState title="复习地图加载失败" message={error} />
    const covered = groups.reduce((sum, group) => sum + group.standards.filter(item => GRADES.some(grade => item.byGrade[grade].length)).length, 0)
    const total = groups.reduce((sum, group) => sum + group.standards.length, 0)
    return (
        <div className={`container ${concepts.page}`}>
            <header className={concepts.hero}>
                <p className={concepts.kicker}>中考复习地图 · 7–9 年级课标 × 三年教材</p>
                <h1 className={concepts.title}>按课标复习：每条课标在七、八、九年级哪一单元教过</h1>
                <p className={concepts.lede}>学业水平考试依据课标的学业质量和学业要求命题。这张图把一门课的初中课标逐条列出，标出它分散在三年教材的哪些单元，并附上课标原文里的学业要求。复习时可以按课标串起三年的内容。</p>
                <div className={styles.tabs} role="tablist" aria-label="学科">
                    {SUBJECTS.map(([value, name]) => <button key={value} type="button" role="tab" aria-selected={slug === value} onClick={() => setParams({ subject: value }, { replace: true })}>{name}</button>)}
                </div>
            </header>
            {!data ? <PageLoading message="正在整理复习地图" /> : (
                <>
                    <p className={styles.summary}>{data.subject.subject}：{total} 条初中课标，其中 {covered} 条找到了对应的教材单元。单元关联来自 AI 逐课读教材后的判断和教材页码对齐，待核验；中考考什么，以当地的考试说明为准。</p>
                    {groups.map(group => (
                        <section key={group.name} className={concepts.block} aria-labelledby={`review-${group.name}`}>
                            <div className={concepts.blockHead}>
                                <h2 id={`review-${group.name}`}>{group.name}</h2>
                            </div>
                            {group.requirements.length ? (
                                <details className={styles.requirements}>
                                    <summary>学业要求（课标原文，{group.requirements.length} 段）</summary>
                                    {group.requirements.map(item => <p key={item.text.slice(0, 20)}>{item.text}<small>修订版第 {item.pages.join('、')} 页</small></p>)}
                                </details>
                            ) : null}
                            <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={`${group.name}：课标与三年教材（可左右滑动）`}>
                                <table>
                                    <thead><tr><th>课标</th>{GRADES.map(grade => <th key={grade}>{grade} 年级</th>)}</tr></thead>
                                    <tbody>
                                        {group.standards.map(({ standard, byGrade }) => (
                                            <tr key={standard.code}>
                                                <td className={styles.standard}><Link to={`/standards/${standard.code}`}>{standard.level2}</Link><code>{standard.code} · {(standard.indicators || []).length} 条要点</code></td>
                                                {GRADES.map(grade => (
                                                    <td key={grade}>
                                                        {byGrade[grade].length ? byGrade[grade].map(([edition, textbook, unit, unitId]) => (
                                                            <Link key={`${edition}-${unit}`} className={styles.unit} to={unitId ? `/textbook-units/${unitId}` : `/textbooks/${edition}`}>{textbook.replace(/^.*?(\d)年级/u, '$1').replace(/册$/u, '').replace('全一', '全')} · {unit.replace(/\s+/gu, ' ')}</Link>
                                                        )) : <span className={styles.none}>—</span>}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    ))}
                    <p className={concepts.footnote}>表里的教材是 kebiao 教材馆收录的版本（多为人教版、统编版）。要按课标出复习卷，可以先用 <Link to="/lesson-plan">AI 备课</Link>的「核验试卷」检查覆盖和超标。</p>
                </>
            )}
        </div>
    )
}
