import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageLoading, ErrorState } from '../components/StateComponents'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import concepts from './ConceptsPage.module.css'
import styles from './ExperimentsPage.module.css'

// 必做实验清单: 科学 附录 4 (1–9 年级) and the 物理、化学 学生必做实验, each with its 课标 page, the 国家平台 同步课 of the
// same name, and a link into AI 备课. For 兼任 科学 teachers and for the 实验操作 part of 中考.
const NATIONAL_URL = id => `https://basic.smartedu.cn/syncClassroom/classActivity?activityId=${id}`
const SUBJECT_NAME = { science: '科学', physics: '物理', chemistry: '化学' }
const STAGE_LABEL = { '1-2': '1–2 年级', '3-4': '3–4 年级', '5-6': '5–6 年级', '7-9': '7–9 年级' }

let pending = null
function loadExperiments() {
    pending ??= fetch('/data/experiments.json').then(response => {
        if (!response.ok) throw new Error('必做实验数据加载失败')
        return response.json()
    }).catch(error => {
        pending = null
        throw error
    })
    return pending
}

const planLink = (subject, grade, topic, code) => `/lesson-plan?mode=topic&subject=${encodeURIComponent(SUBJECT_NAME[subject])}&grade=${grade || ''}&topic=${encodeURIComponent(topic.slice(0, 40))}${code ? `&codes=${code}` : ''}`

function Item({ text, source, lessons, plan }) {
    return (
        <li className={styles.item}>
            <span className={styles.text}>{text}</span>
            <span className={styles.links}>
                <span className={styles.source}>{source}</span>
                {lessons.map(([, id, title, textbook]) => <a key={id} href={NATIONAL_URL(id)} target="_blank" rel="noopener noreferrer">同步课：{textbook}《{title.replace(/^(实验活动\d+|第\d+节|课题\d+)\s*/u, '')}》↗</a>)}
                <Link to={plan}>用 AI 备课设计这节课</Link>
            </span>
        </li>
    )
}

export default function ExperimentsPage() {
    usePageMeta(STATIC_PAGE_META['/experiments'])
    const [params, setParams] = useSearchParams()
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const subject = params.get('subject') || ''
    useEffect(() => {
        let active = true
        loadExperiments().then(value => active && setData(value)).catch(errorValue => active && setError(errorValue.message))
        return () => { active = false }
    }, [])
    if (error) return <ErrorState title="必做实验清单加载失败" message={error} />
    if (!data) return <PageLoading message="正在打开必做实验清单" />
    const scienceCount = data.science.stages.reduce((sum, stage) => sum + stage.items.length, 0)
    const counts = Object.fromEntries(data.groups.map(group => [group.subject_slug, group.standards.reduce((sum, standard) => sum + standard.items.length, 0)]))
    const show = slug => !subject || subject === slug
    const pick = value => setParams(value ? { subject: value } : {}, { replace: true })
    return (
        <div className={`container ${concepts.page}`}>
            <header className={concepts.hero}>
                <p className={concepts.kicker}>必做实验清单 · 科学 {scienceCount} 项 · 物理 {counts.physics} 项 · 化学 {counts.chemistry} 项</p>
                <h1 className={concepts.title}>课标规定的必做实验和探究实践</h1>
                <p className={concepts.lede}>
                    科学课标附录 4 列出了 1–9 年级的学生必做探究实践活动，并写明「{data.science.intro.text}」物理、化学课标列出了初中学生必做实验。每一项都标出课标页码，能找到同名的国家平台同步课就附上，也可以直接交给 AI 备课设计成一节课。
                </p>
                <p className={styles.note}>兼任科学课的老师，可以按年级先看这份清单，备齐器材。不少地方的中考有实验操作考查，具体考哪些实验，以当地考试说明为准。</p>
                <div className={styles.tabs} role="tablist" aria-label="学科">
                    {[['', '全部'], ['science', '科学'], ['physics', '物理'], ['chemistry', '化学']].map(([slug, name]) => (
                        <button key={slug || 'all'} type="button" role="tab" aria-selected={subject === slug} onClick={() => pick(slug)}>{name}</button>
                    ))}
                </div>
            </header>

            {show('science') ? data.science.stages.map(stage => (
                <section key={stage.stage} className={concepts.block} aria-labelledby={`ex-sc-${stage.stage}`}>
                    <div className={concepts.blockHead}>
                        <h2 id={`ex-sc-${stage.stage}`}>科学 · {STAGE_LABEL[stage.stage]}<small className={styles.count}>{stage.items.length} 项</small></h2>
                        {stage.stage === '7-9' ? <p>初中开设综合科学的地区用这一组；分科教学的地区，对应的实验分别在物理、化学、生物学里。</p> : null}
                    </div>
                    <ol className={styles.list}>
                        {stage.items.map(item => <Item key={item.no} text={item.text} source={`附录 4 · 修订版第 ${item.page} 页`} lessons={item.lessons} plan={planLink('science', stage.grades[0], item.text)} />)}
                    </ol>
                </section>
            )) : null}

            {data.groups.filter(group => show(group.subject_slug)).map(group => group.standards.map(standard => (
                <section key={standard.code} className={concepts.block} aria-labelledby={`ex-${standard.code}`}>
                    <div className={concepts.blockHead}>
                        <h2 id={`ex-${standard.code}`}>{SUBJECT_NAME[group.subject_slug]} · {standard.title}<small className={styles.count}>{standard.items.length} 项</small></h2>
                        <p><Link to={`/standards/${standard.code}`}>{standard.code}</Link> · 7–9 年级</p>
                    </div>
                    <ol className={styles.list}>
                        {standard.items.map(item => <Item key={item.code} text={item.text} source={`${item.code} · 修订版第 ${item.pages.join('、')} 页`} lessons={item.lessons} plan={planLink(group.subject_slug, 8, item.text, item.code)} />)}
                    </ol>
                </section>
            )))}

            <p className={concepts.footnote}>{data.note} 同步课按课名匹配，只列出和实验名基本一致的课。</p>
        </div>
    )
}
