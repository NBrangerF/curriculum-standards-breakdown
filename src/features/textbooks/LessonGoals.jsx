import { useState } from 'react'
import { Link } from 'react-router-dom'
import styles from './LessonGoals.module.css'

const standardHref = code => `/standards/${code.replace(/\.\d+$/u, '')}#${code}`

/**
 * 课堂学习目标: what this lesson's students should be able to do, written from the 课标 要点 the lesson teaches, this
 * textbook's lesson and an ordinary class at the grade. Each objective shows the 要点 it rests on and the 课标's own
 * words it comes from, so the teacher can walk back to the 课标. `focus` dims objectives that rest on other 要点.
 * goals = { take, later, items: [[text, basis[], from, show]] }
 */
export default function LessonGoals({ goals, lessonHref, focus = null, compact = false }) {
    const [copied, setCopied] = useState(false)
    if (!goals?.items?.length) return null
    const items = focus ? goals.items.filter(item => item[1].includes(focus)) : goals.items
    if (!items.length) return null
    async function copy() {
        const text = items.map(([text, basis, from], index) => `${index + 1}. ${text}（依据 ${basis.join('、')}：「${from}」）`).join('\n')
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
        } catch { setCopied(false) }
    }
    return (
        <section className={`${styles.goals} ${compact ? styles.compact : ''}`} aria-label="课堂学习目标">
            <header className={styles.head}>
                <h4>课堂学习目标</h4>
                <span className={styles.basis}>课标要点 × 这一课教材 × 一般学情</span>
            </header>
            {!compact && goals.take ? <p className={styles.take}><b>本课承担</b>{goals.take}</p> : null}
            <ol className={styles.list}>
                {items.map(([text, basis, from, show]) => (
                    <li key={text}>
                        <p className={styles.text}>{text}</p>
                        <p className={styles.trace}>
                            <span className={styles.arrow} aria-hidden="true">↳</span>
                            {basis.map(code => <Link key={code} className={styles.code} to={standardHref(code)}>{code}</Link>)}
                            <span className={styles.from}>课标原词「{from}」</span>
                        </p>
                        {!compact && show ? <p className={styles.show}>怎样算做到：{show}</p> : null}
                    </li>
                ))}
            </ol>
            {!compact && goals.later ? <p className={styles.later}><b>留给后面</b>{goals.later}</p> : null}
            <footer className={styles.foot}>
                {lessonHref ? <Link to={lessonHref}>从这些目标开始备课 →</Link> : null}
                <button type="button" onClick={copy}>{copied ? '已复制' : '复制目标'}</button>
                <span>AI 依据课标原文起草，待老师核验</span>
            </footer>
        </section>
    )
}
