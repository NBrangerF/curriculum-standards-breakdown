import { useState } from 'react'
import { Link } from 'react-router-dom'
import { postApi } from '../../data/api'
import styles from './ObjectiveCheck.module.css'

const standardHref = code => `/standards/${code.replace(/\.\d+$/u, '')}#${code}`
const LEVEL = {
    match: ['程度相当', styles.good],
    above: ['超出要点', styles.warn],
    below: ['没到要点', styles.warn],
    unclear: ['程度没写清', styles.warn]
}

/**
 * 目标体检: the teacher pastes the objectives they already wrote; each comes back traced to the 要点 it rests on
 * (with the 课标's own words), its level against the 要点, what it lacks, and a suggested wording.
 * `lesson` is the request's lesson; `codes` the 要点 it may rest on; `taught` the ones this lesson is meant to teach.
 * `isUnit` checks 单元目标 instead (this replaced the old 课程对齐工作台); `open` starts it unfolded.
 */
export default function ObjectiveCheck({ lesson, codes, taught, isUnit = false, open = false }) {
    const [text, setText] = useState('')
    const [state, setState] = useState({ status: 'idle', data: null, error: '' })
    async function run(event) {
        event.preventDefault()
        setState({ status: 'loading', data: null, error: '' })
        try {
            const response = await postApi('/api/v1/lesson-plans/check-objectives', { lesson, indicator_codes: codes.slice(0, 24), taught_codes: taught.slice(0, 24), objectives_text: text.trim(), ...(isUnit ? { scope: 'unit' } : {}) })
            setState({ status: 'ok', data: response.data, error: '' })
        } catch (error) {
            setState({ status: 'error', data: null, error: error?.message || 'AI 这次没有读完，请再试一次。' })
        }
    }
    const data = state.data
    return (
        <details className={styles.box} open={open}>
            <summary>{isUnit ? '已经写好单元目标了？贴进来做个体检' : '已经写好目标了？贴进来做个体检'}</summary>
            <form onSubmit={run} className={styles.form}>
                <label>
                    <span>你的学习目标（一行一条）</span>
                    <textarea rows={4} maxLength={3000} value={text} onChange={event => setText(event.target.value)} placeholder={'1. 学生能……\n2. ……'} />
                </label>
                <button type="submit" className="btn btn-secondary" disabled={state.status === 'loading' || text.trim().length < 6}>{state.status === 'loading' ? '正在对照课标…' : '体检'}</button>
                <small>逐条对照上面的课标要点：依据哪条、出自哪几个字、程度够不够、缺了什么。</small>
            </form>
            <div aria-live="polite">
                {state.status === 'error' ? <p className={styles.error}>{state.error}</p> : null}
                {data ? (
                    <div className={styles.result}>
                        <ol className={styles.list}>
                            {data.objectives.map(item => (
                                <li key={item.text}>
                                    <p className={styles.text}>
                                        {item.text}
                                        {item.basis.length ? (item.level ? <b className={LEVEL[item.level][1]}>{LEVEL[item.level][0]}</b> : null) : <b className={styles.bad}>找不到依据</b>}
                                    </p>
                                    {item.basis.length ? (
                                        <p className={styles.trace}>
                                            <span aria-hidden="true">↳</span>
                                            {item.basis.map(code => <Link key={code} className={styles.code} to={standardHref(code)} target="_blank" rel="noopener">{code}</Link>)}
                                            {item.from ? <span>课标原词「{item.from}」</span> : null}
                                        </p>
                                    ) : null}
                                    {item.level_note ? <p className={styles.note}>{item.level_note}</p> : null}
                                    {item.missing.length ? <p className={styles.note}>缺：{item.missing.join('、')}</p> : null}
                                    {item.flags.map(flag => <p key={flag.kind + flag.message} className={styles.flag}>{flag.message}</p>)}
                                    {item.rewrite ? <p className={styles.rewrite}><span>可以这样写</span>{item.rewrite}</p> : null}
                                </li>
                            ))}
                        </ol>
                        {data.uncovered.length ? (
                            <div className={styles.uncovered}>
                                <p>{isUnit ? '这个单元' : '这节课'}主要教的要点里，还没有目标落到：</p>
                                <ul>{data.uncovered.map(point => <li key={point.code}><Link className={styles.code} to={standardHref(point.code)} target="_blank" rel="noopener">{point.code}</Link> {point.text}</li>)}</ul>
                            </div>
                        ) : null}
                        {data.notes.map(note => <p key={note} className={styles.note}>{note}</p>)}
                        <p className={styles.foot}>AI 依据课标原文体检，供参考；对不对由你判断。{data.privacy?.redacted ? ' 已隐去疑似个人信息。' : ''}</p>
                    </div>
                ) : null}
            </div>
        </details>
    )
}
