import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageLoading, ErrorState } from '../components/StateComponents'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import concepts from './ConceptsPage.module.css'
import styles from './InterdisciplinaryPage.module.css'

// 跨学科主题库: the themes the 课标 give for 跨学科主题学习, and the 跨学科 standards of other subjects.
// A teacher picks a subject and a grade; themes led by that subject come first, then themes of other subjects
// that draw on it.
const SUBJECTS = [['chinese', '语文'], ['math', '数学'], ['english', '英语'], ['morality_law', '道德与法治'], ['science', '科学'], ['physics', '物理'], ['chemistry', '化学'], ['biology', '生物学'], ['history', '历史'], ['geography', '地理'], ['it', '信息科技'], ['pe', '体育与健康'], ['arts', '艺术'], ['labor', '劳动']]
// the subject names AI 备课 「直接写课题」 lists
const PLAN_SUBJECT = { arts: '艺术（音乐、美术等）' }

let pending = null
function loadThemes() {
    pending ??= fetch('/data/interdisciplinary.json').then(response => {
        if (!response.ok) throw new Error('跨学科主题数据加载失败')
        return response.json()
    }).catch(error => {
        pending = null
        throw error
    })
    return pending
}

const gradeText = grades => (grades.length > 1 ? `${grades[0]}–${grades.at(-1)} 年级` : `${grades[0]} 年级`)
const planLink = ({ slug, name, grade, topic, code }) => `/lesson-plan?mode=topic&subject=${encodeURIComponent(PLAN_SUBJECT[slug] || name)}&grade=${grade || ''}&topic=${encodeURIComponent(topic.slice(0, 40))}${code ? `&codes=${code}` : ''}`

function ThemeCard({ group, theme, grade }) {
    const topic = theme.group ? `${theme.group.replace(/[“”]/gu, '')}：${theme.name}` : theme.name
    return (
        <li className={styles.card} style={{ '--subject-color': group.color || 'var(--kb-gold)' }}>
            <p className={styles.meta}>
                <span className={styles.lead}><i aria-hidden="true" />{group.subject}</span>
                <span>{theme.level ? `${theme.level}（${gradeText(theme.grades)}）` : gradeText(theme.grades)}</span>
                {theme.group ? <span>{theme.group}</span> : null}
                {theme.kind ? <span>{theme.kind}</span> : null}
            </p>
            <h3>{theme.name}</h3>
            {theme.with.length ? <p className={styles.with}>结合 {theme.with.map(name => <span key={name}>{name}</span>)}</p> : null}
            <blockquote>{theme.quote}</blockquote>
            <p className={styles.source}>{group.subject}课标 · 修订版第 {theme.pages.join('、')} 页</p>
            <Link className={styles.action} to={planLink({ slug: group.subject_slug, name: group.subject, grade: grade || theme.grades[0], topic })}>用 AI 备课设计这个主题</Link>
        </li>
    )
}

function StandardCard({ standard, grade }) {
    return (
        <li className={styles.card} style={{ '--subject-color': standard.color || 'var(--kb-gold)' }}>
            <p className={styles.meta}>
                <span className={styles.lead}><i aria-hidden="true" />{standard.subject}</span>
                <span>{standard.stage_label}</span>
            </p>
            <h3><Link to={`/standards/${standard.code}`}>{standard.title}</Link> <code>{standard.code}</code></h3>
            <ul className={styles.activities}>
                {standard.indicators.map(item => <li key={item.code}>{item.text.length > 90 ? `${item.text.slice(0, 90)}…` : item.text}</li>)}
            </ul>
            <Link className={styles.action} to={planLink({ slug: standard.subject_slug, name: standard.subject, grade: grade || standard.grades[0], topic: standard.title, code: standard.code })}>用 AI 备课设计</Link>
        </li>
    )
}

export default function InterdisciplinaryPage() {
    usePageMeta(STATIC_PAGE_META['/interdisciplinary'])
    const [params, setParams] = useSearchParams()
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const subject = params.get('subject') || ''
    const grade = Number(params.get('grade')) || 0
    useEffect(() => {
        let active = true
        loadThemes().then(value => active && setData(value)).catch(errorValue => active && setError(errorValue.message))
        return () => { active = false }
    }, [])
    const update = changes => {
        const next = new URLSearchParams(params)
        for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value)
            else next.delete(key)
        }
        setParams(next, { replace: true })
    }
    const view = useMemo(() => {
        if (!data) return null
        const fits = grades => !grade || grades.includes(grade)
        const themes = data.groups.flatMap(group => group.themes.filter(theme => fits(theme.grades)).map(theme => ({ group, theme })))
        const standards = data.standards.filter(item => fits(item.grades))
        if (!subject) return { own: themes, ownStandards: standards, others: [], otherStandards: [] }
        return {
            own: themes.filter(item => item.group.subject_slug === subject),
            ownStandards: standards.filter(item => item.subject_slug === subject),
            // themes of other subjects that name this one among the subjects they draw on
            others: themes.filter(item => item.group.subject_slug !== subject && item.theme.with_slugs.includes(subject)),
            otherStandards: []
        }
    }, [data, subject, grade])

    if (error) return <ErrorState title="跨学科主题加载失败" message={error} />
    if (!data || !view) return <PageLoading message="正在打开跨学科主题库" />
    const subjectName = SUBJECTS.find(([slug]) => slug === subject)?.[1] || ''
    const empty = !view.own.length && !view.ownStandards.length && !view.others.length
    return (
        <div className={`container ${concepts.page}`}>
            <header className={concepts.hero}>
                <p className={concepts.kicker}>跨学科主题库 · 课标给出的 {data.theme_count} 个主题 · {data.standards.length} 条课标条目</p>
                <h1 className={concepts.title}>跨学科主题学习，课标里给了哪些主题</h1>
                <blockquote className={styles.basis}>{data.basis.text}<small>义务教育课程方案（2022年版2025年修订）第 {data.basis.pages.join('、')} 页</small></blockquote>
                <p className={concepts.lede}>
                    历史、地理、体育与健康三科的课标给出了具体的参考主题；语文、数学、信息科技、物理、化学、生物学和美术把跨学科学习写进了内容要求。选你教的学科和年级，看本学科的主题，以及其他学科里要用到你学科的主题。
                </p>
                <div className={styles.filters}>
                    <label><span>学科</span>
                        <select value={subject} onChange={event => update({ subject: event.target.value })}>
                            <option value="">全部学科</option>
                            {SUBJECTS.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
                        </select>
                    </label>
                    <label><span>年级</span>
                        <select value={grade || ''} onChange={event => update({ grade: event.target.value })}>
                            <option value="">全部年级</option>
                            {Array.from({ length: 9 }, (_, k) => k + 1).map(value => <option key={value} value={value}>{value} 年级</option>)}
                        </select>
                    </label>
                </div>
            </header>

            {empty ? <p className={styles.empty}>{subjectName}{grade ? ` ${grade} 年级` : ''}没有课标直接给出的跨学科主题。可以换个年级，或用 <Link to={`/lesson-plan?mode=topic${subjectName ? `&subject=${encodeURIComponent(PLAN_SUBJECT[subject] || subjectName)}` : ''}`}>AI 备课</Link>按自己的主题设计。</p> : null}

            {view.own.length ? (
                <section className={concepts.block} aria-labelledby="xd-own">
                    <div className={concepts.blockHead}>
                        <h2 id="xd-own">{subjectName ? `${subjectName}课标给出的主题` : '课标给出的主题'}</h2>
                        <p>{(subjectName ? data.groups.filter(group => group.subject_slug === subject) : data.groups).map(group => `${group.subject}：${group.where}`).join('；')}。课标说明这些是参考示例，可以按学校和学生的实际调整或自主设计。</p>
                    </div>
                    <ul className={styles.grid}>{view.own.map(({ group, theme }) => <ThemeCard key={theme.id} group={group} theme={theme} grade={grade} />)}</ul>
                </section>
            ) : null}

            {view.ownStandards.length ? (
                <section className={concepts.block} aria-labelledby="xd-standards">
                    <div className={concepts.blockHead}>
                        <h2 id="xd-standards">{subjectName ? `${subjectName}课标里的跨学科学习` : '写进内容要求的跨学科学习'}</h2>
                        <p>这些学科把跨学科学习写成了标准，下面列的是课标原文里的活动和要求。点标题看要点和页码。</p>
                    </div>
                    <ul className={styles.grid}>{view.ownStandards.map(standard => <StandardCard key={standard.code} standard={standard} grade={grade} />)}</ul>
                </section>
            ) : null}

            {view.others.length ? (
                <section className={concepts.block} aria-labelledby="xd-others">
                    <div className={concepts.blockHead}>
                        <h2 id="xd-others">其他学科的主题里，要用到{subjectName}的</h2>
                        <p>课标在这些主题里点名要结合{subjectName}。可以和这些学科的老师一起设计，各自的课时都算进跨学科主题学习。</p>
                    </div>
                    <ul className={styles.grid}>{view.others.map(({ group, theme }) => <ThemeCard key={theme.id} group={group} theme={theme} grade={grade} />)}</ul>
                </section>
            ) : null}

            <p className={concepts.footnote}>{data.note} 想先弄清「跨学科主题学习」在各学科里指什么，读<Link to="/concepts/interdisciplinary">概念词典里的这一条</Link>。</p>
        </div>
    )
}
