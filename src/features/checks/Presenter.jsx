import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft'
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight'
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { TimerIcon } from '@phosphor-icons/react/dist/csr/Timer'
import { ChartBarHorizontalIcon } from '@phosphor-icons/react/dist/csr/ChartBarHorizontal'
import { NotebookIcon } from '@phosphor-icons/react/dist/csr/Notebook'
import { CircleHalfIcon } from '@phosphor-icons/react/dist/csr/CircleHalf'
import { CornersOutIcon } from '@phosphor-icons/react/dist/csr/CornersOut'
import { CornersInIcon } from '@phosphor-icons/react/dist/csr/CornersIn'
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple'
import { ThumbsUpIcon } from '@phosphor-icons/react/dist/csr/ThumbsUp'
import { ThumbsDownIcon } from '@phosphor-icons/react/dist/csr/ThumbsDown'
import { PencilSimpleLineIcon } from '@phosphor-icons/react/dist/csr/PencilSimpleLine'
import { HandIcon } from '@phosphor-icons/react/dist/csr/Hand'
import MathText from './MathText.jsx'
import { TYPE_META, choicesOf } from './checksData.js'
import styles from './Presenter.module.css'

const THEME_KEY = 'kebiao.checks.theme'
const LADDER_LEVELS = ['基础', '巩固', '挑战']
const STEP_MARKS = ['①', '②', '③', '④']

function readTheme() {
    try { return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

// how many in-slide steps a slide has before "next" moves on (contrast: mark the two workings; ladder: show answers)
const stepsOf = slide => (slide?.kind === 'contrast' || slide?.kind === 'ladder' ? 1 : 0)

function HowToAnswer({ type }) {
    const Icon = type === 'judge' ? ThumbsUpIcon : type === 'write' ? PencilSimpleLineIcon : HandIcon
    return <span className={styles.how}><Icon weight="bold" aria-hidden="true" />{TYPE_META[type].how}</span>
}

// the topic often names the rule being checked, so the class sees it only from the reveal on
function SlideHead({ slide, label }) {
    return (
        <header className={styles.head}>
            <span className={styles.count}>{label || `第 ${slide.n} 题`}{slide.total > 1 ? <small> / 共 {slide.total} 题</small> : null}</span>
            <span className={styles.topic}>{slide.kind === 'question' ? '' : slide.item?.topic}</span>
        </header>
    )
}

// how many chose this answer: the row fills from the left in proportion (readable from the back), with the count
// and, while counting, buttons beside it
function Tally({ value, max, onChange, show }) {
    if (!show && !value) return null
    const width = max ? Math.round((value / max) * 100) : 0
    return (
        <>
            <span className={styles.tallyBar} style={{ width: `${width}%` }} aria-hidden="true" />
            <span className={styles.tally}>
                <span className={styles.tallyNum}>{value || 0} 人</span>
                {show ? (
                    <span className={styles.tallyButtons}>
                        <button type="button" onClick={() => onChange(-1)} aria-label="减一人">−</button>
                        <button type="button" onClick={() => onChange(1)} aria-label="加一人">+</button>
                        <button type="button" onClick={() => onChange(5)} aria-label="加五人">+5</button>
                    </span>
                ) : null}
            </span>
        </>
    )
}

function Choices({ item, revealed, tally, showTally, onTally, misconceptions }) {
    const choices = choicesOf(item)
    // counting happens while the hands are up, on the question; the reveal only shows the counts
    const counting = showTally && !revealed
    const max = Math.max(1, ...choices.map(choice => tally[choice.key] || 0))
    const total = choices.reduce((sum, choice) => sum + (tally[choice.key] || 0), 0)
    // the wrong answer most of the class gave, once anyone counted
    const top = total ? choices.filter(choice => !choice.correct).sort((a, b) => (tally[b.key] || 0) - (tally[a.key] || 0))[0] : null
    const state = choice => (!revealed ? '' : choice.correct ? styles.right : styles.wrong)
    const caption = choice => (revealed && !choice.correct && choice.misconceptions.length
        ? <span className={`${styles.caption} ${top && top.key === choice.key && tally[choice.key] ? styles.captionTop : ''}`}>可能想的是：{choice.misconceptions.map(id => misconceptions[id]?.name).filter(Boolean).join('；或 ')}</span>
        : null)

    if (item.type === 'judge') {
        return (
            <div className={styles.judge}>
                {choices.map(choice => (
                    <div key={choice.key} className={`${styles.option} ${styles.judgeOption} ${state(choice)}`}>
                        {choice.key === 'agree' ? <ThumbsUpIcon weight="fill" className={styles.thumb} aria-hidden="true" /> : <ThumbsDownIcon weight="fill" className={styles.thumb} aria-hidden="true" />}
                        <span className={styles.optionText}>{choice.text}</span>
                        {revealed ? (choice.correct ? <CheckIcon weight="bold" className={styles.mark} aria-label="正确" /> : <XIcon weight="bold" className={styles.mark} aria-label="错误" />) : null}
                        <Tally value={tally[choice.key] || 0} max={max} show={counting} onChange={delta => onTally(choice.key, delta)} />
                        {caption(choice)}
                    </div>
                ))}
            </div>
        )
    }
    if (item.type === 'write') {
        return (
            <div className={styles.writeBox}>
                {!revealed ? (
                    <p className={styles.writePrompt}><PencilSimpleLineIcon weight="bold" aria-hidden="true" />把答案写在草稿纸上，听口令一起举起来</p>
                ) : (
                    <div className={styles.writeAnswers}>
                        <div className={`${styles.option} ${styles.right}`}>
                            <span className={styles.badge}>答案</span>
                            <MathText className={styles.optionText} text={item.answer} />
                            <CheckIcon weight="bold" className={styles.mark} aria-label="正确" />
                            <Tally value={tally.right || 0} max={max} show={counting} onChange={delta => onTally('right', delta)} />
                        </div>
                        {choices.filter(choice => !choice.correct && choice.key !== 'other').map(choice => (
                            <div key={choice.key} className={`${styles.option} ${styles.wrong}`}>
                                <span className={styles.badge}>常见错答</span>
                                <MathText className={styles.optionText} text={choice.text} />
                                <Tally value={tally[choice.key] || 0} max={max} show={counting} onChange={delta => onTally(choice.key, delta)} />
                                {caption(choice)}
                            </div>
                        ))}
                    </div>
                )}
                {!revealed && showTally ? (
                    <div className={styles.writeTally}>
                        {choices.map(choice => (
                            <span key={choice.key} className={styles.writeTallyItem}>
                                <span>{choice.key === 'right' ? '答对' : choice.key === 'other' ? '其他' : <MathText text={choice.text} />}</span>
                                <Tally value={tally[choice.key] || 0} max={max} show onChange={delta => onTally(choice.key, delta)} />
                            </span>
                        ))}
                    </div>
                ) : null}
            </div>
        )
    }
    if (item.type === 'step') {
        return (
            <ol className={styles.steps}>
                {choices.map(choice => (
                    <li key={choice.key} className={`${styles.option} ${styles.stepRow} ${revealed && choice.correct ? styles.stepWrong : ''}`}>
                        <span className={styles.badge}>{choice.label}</span>
                        <MathText className={styles.optionText} text={choice.text} />
                        <Tally value={tally[choice.key] || 0} max={max} show={counting} onChange={delta => onTally(choice.key, delta)} />
                        {revealed && choice.correct ? <span className={styles.caption}>从这一步开始错：{misconceptions[item.error]?.name}</span> : null}
                    </li>
                ))}
            </ol>
        )
    }
    const long = item.options.some(text => text.replace(/\{[^}]*\}/gu, '00').length > 12)
    return (
        <div className={`${styles.options} ${long ? styles.optionsList : ''}`}>
            {choices.map(choice => (
                <div key={choice.key} className={`${styles.option} ${state(choice)}`}>
                    <span className={styles.badge}>{choice.label}</span>
                    <MathText className={styles.optionText} text={choice.text} />
                    {revealed ? (choice.correct ? <CheckIcon weight="bold" className={styles.mark} aria-label="正确" /> : <XIcon weight="bold" className={styles.mark} aria-label="错误" />) : null}
                    <Tally value={tally[choice.key] || 0} max={max} show={counting} onChange={delta => onTally(choice.key, delta)} />
                    {caption(choice)}
                </div>
            ))}
        </div>
    )
}

function Work({ item }) {
    if (item.type !== 'judge') return null
    return (
        <div className={styles.work}>
            <span className={styles.workWho}>小明说：</span>
            {item.work.map((line, index) => <MathText key={index} as="p" text={line} />)}
        </div>
    )
}

function QuestionSlide({ slide, revealed, tally, showTally, onTally, misconceptions }) {
    const { item } = slide
    return (
        <div className={`${styles.slide} ${revealed ? styles.revealSlide : ''}`}>
            <SlideHead slide={slide} />
            <div className={styles.body}>
                <div className={styles.ask}>
                    <MathText as="h2" className={styles.stem} text={item.stem} />
                    <Work item={item} />
                    <Choices item={item} revealed={revealed} tally={tally} showTally={showTally} onTally={onTally} misconceptions={misconceptions} />
                </div>
                {revealed ? (
                    <aside className={styles.solution} aria-label="正确做法">
                        <h3>正确做法</h3>
                        {item.right.map((line, index) => <MathText key={index} as="p" text={line} />)}
                        {item.type === 'choice' || item.type === 'step' ? <p className={styles.discuss}>请选错的同学说说想法，再请同桌讲讲正确做法。</p> : null}
                        {item.type === 'judge' ? <p className={styles.discuss}>请不同意的同学说说理由。</p> : null}
                    </aside>
                ) : null}
            </div>
            {!revealed ? <footer className={styles.foot}><HowToAnswer type={item.type} /></footer> : null}
        </div>
    )
}

function ContrastSlide({ slide, step, misconceptions }) {
    const { item, typical } = slide
    const marked = step >= 1
    const wrongName = misconceptions[slide.error]?.name
    return (
        <div className={styles.slide}>
            <SlideHead slide={slide} label="比一比" />
            <div className={styles.body}>
                <h2 className={styles.stemSmall}>这两种做法，哪个对？哪里不一样？</h2>
                <div className={styles.contrast}>
                    <section className={`${styles.paper} ${marked ? styles.wrong : ''}`}>
                        <h3>小明{marked ? <XIcon weight="bold" className={styles.mark} aria-label="错误" /> : null}</h3>
                        {typical.map((line, index) => <MathText key={index} as="p" text={line} />)}
                        {marked && wrongName ? <p className={styles.caption}>错在：{wrongName}</p> : null}
                    </section>
                    <section className={`${styles.paper} ${marked ? styles.right : ''}`}>
                        <h3>小红{marked ? <CheckIcon weight="bold" className={styles.mark} aria-label="正确" /> : null}</h3>
                        {item.right.map((line, index) => <MathText key={index} as="p" text={line} />)}
                    </section>
                </div>
            </div>
            {!marked ? <footer className={styles.foot}><span className={styles.how}><HandIcon weight="bold" aria-hidden="true" />认为小明对的举 1，认为小红对的举 2</span></footer> : null}
        </div>
    )
}

function LadderSlide({ slide, step }) {
    const { item } = slide
    return (
        <div className={styles.slide}>
            <SlideHead slide={slide} label="阶梯练习" />
            <div className={styles.body}>
                <h2 className={styles.stemSmall}>写在练习本上：从 ① 做起，做完一题再往下</h2>
                <ol className={styles.ladder}>
                    {item.ladder.map((entry, index) => (
                        <li key={index}>
                            <span className={styles.level}>{STEP_MARKS[index]} {LADDER_LEVELS[index]}</span>
                            <MathText className={styles.ladderQ} text={entry.q} />
                            {step >= 1 ? <span className={styles.ladderA}>答案：<MathText text={entry.a} /></span> : null}
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    )
}

function CoverSlide({ slide }) {
    const types = [...new Set(slide.items.map(item => item.type))]
    return (
        <div className={`${styles.slide} ${styles.cover}`}>
            <p className={styles.coverKicker}>课堂诊断 · 共 {slide.items.length} 题</p>
            <h1 className={styles.coverTitle}>{slide.title}</h1>
            <ul className={styles.coverTopics}>
                {[...new Set(slide.items.map(item => item.unit))].map(unit => <li key={unit}>{unit}</li>)}
            </ul>
            <div className={styles.coverHow}>
                <p>全班一起作答，先想好，听口令再举：</p>
                {types.map(type => <HowToAnswer key={type} type={type} />)}
            </div>
        </div>
    )
}

function Notes({ slide, misconceptions, onClose }) {
    const item = slide?.item
    return (
        <aside className={styles.notes} aria-label="教师提示">
            <header>
                <strong>教师提示</strong>
                <span>{item ? `${item.topic} · ${item.points.join('、')}` : '封面'}</span>
                <button type="button" onClick={onClose} aria-label="关闭教师提示"><XIcon weight="bold" /></button>
            </header>
            {item ? (
                <div className={styles.notesBody}>
                    {item.type === 'step' ? (
                        <div className={styles.note}><b>第 {item.answer + 1} 步开始错：{misconceptions[item.error]?.name}</b><MathText as="p" text={misconceptions[item.error]?.why} /><p>怎么办：<MathText text={misconceptions[item.error]?.move} /></p></div>
                    ) : choicesOf(item).filter(choice => !choice.correct && choice.misconceptions.length).map(choice => (
                        <div key={choice.key} className={styles.note}>
                            <b>{item.type === 'choice' ? `选 ${choice.label}` : item.type === 'judge' ? choice.text : <>写 <MathText text={choice.text} /></>}：{choice.misconceptions.map(id => misconceptions[id]?.name).join('；')}</b>
                            {choice.misconceptions.map(id => <p key={id}><MathText text={misconceptions[id]?.why} /> 怎么办：<MathText text={misconceptions[id]?.move} /></p>)}
                        </div>
                    ))}
                    <p className={styles.noteKeys}>键盘：→ 下一页 · ← 上一页 · C 统计 · 1–4 加一人（Shift 加五人）· T 计时 · B 黑屏 · F 全屏 · N 提示</p>
                </div>
            ) : <p className={styles.noteKeys}>先让全班看清怎么作答，再进入第 1 题。</p>}
        </aside>
    )
}

export default function Presenter({ slides, title, misconceptions, onExit, onDownload }) {
    const rootRef = useRef(null)
    const [index, setIndex] = useState(0)
    const [step, setStep] = useState(0)
    const [tallies, setTallies] = useState({})
    const [showTally, setShowTally] = useState(false)
    const [showNotes, setShowNotes] = useState(false)
    const [theme, setTheme] = useState(readTheme)
    const [blackout, setBlackout] = useState(false)
    const [timer, setTimer] = useState(null)
    const [idle, setIdle] = useState(false)
    const [fullscreen, setFullscreen] = useState(false)
    const [busy, setBusy] = useState(false)
    const slide = slides[index]

    const go = useCallback(delta => {
        setBlackout(false)
        if (delta > 0 && step < stepsOf(slides[index])) { setStep(value => value + 1); return }
        if (delta < 0 && step > 0) { setStep(value => value - 1); return }
        const next = Math.min(slides.length - 1, Math.max(0, index + delta))
        if (next === index) return
        setIndex(next)
        setStep(delta < 0 ? stepsOf(slides[next]) : 0)
    }, [index, step, slides])

    const itemId = slide?.item?.id
    const tally = (itemId && tallies[itemId]) || {}
    const onTally = useCallback((key, delta) => {
        if (!itemId) return
        setTallies(current => {
            const forItem = { ...(current[itemId] || {}) }
            forItem[key] = Math.max(0, (forItem[key] || 0) + delta)
            return { ...current, [itemId]: forItem }
        })
    }, [itemId])

    const toggleFullscreen = useCallback(() => {
        const root = rootRef.current
        if (!document.fullscreenElement) root?.requestFullscreen?.().catch(() => {})
        else document.exitFullscreen?.().catch(() => {})
    }, [])

    useEffect(() => {
        const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
        document.addEventListener('fullscreenchange', onChange)
        return () => document.removeEventListener('fullscreenchange', onChange)
    }, [])

    useEffect(() => {
        try { window.localStorage.setItem(THEME_KEY, theme) } catch { /* private mode */ }
    }, [theme])

    // timer: seconds left, counts down once a second; null when off
    useEffect(() => {
        if (timer === null || timer <= 0) return undefined
        const id = window.setTimeout(() => setTimer(value => (value === null ? null : value - 1)), 1000)
        return () => window.clearTimeout(id)
    }, [timer])

    // the toolbar fades after a few still seconds so it does not sit on the projected slide
    useEffect(() => {
        let id = null
        const wake = () => {
            setIdle(false)
            window.clearTimeout(id)
            id = window.setTimeout(() => setIdle(true), 3000)
        }
        wake()
        window.addEventListener('mousemove', wake)
        window.addEventListener('touchstart', wake)
        return () => {
            window.clearTimeout(id)
            window.removeEventListener('mousemove', wake)
            window.removeEventListener('touchstart', wake)
        }
    }, [])

    const keysFor = useMemo(() => (slide?.item ? choicesOf(slide.item).map(choice => choice.key) : []), [slide])

    useEffect(() => {
        const onKey = event => {
            if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/u.test(event.target.tagName)) return
            if (event.metaKey || event.ctrlKey) return
            const key = event.key
            // number keys count answers: 1–4 (Shift: five at once, Alt: take one back)
            const digit = /^Digit([1-9])$/u.exec(event.code)
            if (digit && keysFor.length && (slide.kind === 'question' || slide.kind === 'reveal')) {
                const choice = keysFor[Number(digit[1]) - 1]
                if (choice !== undefined) {
                    event.preventDefault()
                    setShowTally(true)
                    onTally(choice, event.altKey ? -1 : event.shiftKey ? 5 : 1)
                }
                return
            }
            if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(key)) { event.preventDefault(); go(1) }
            else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(key)) { event.preventDefault(); go(-1) }
            else if (key === 'Home') { setIndex(0); setStep(0) }
            else if (key === 'End') { setIndex(slides.length - 1); setStep(0) }
            else if (key === 'f' || key === 'F') toggleFullscreen()
            else if (key === 'n' || key === 'N') setShowNotes(value => !value)
            else if (key === 'c' || key === 'C') setShowTally(value => !value)
            else if (key === 'b' || key === 'B' || key === '.') setBlackout(value => !value)
            else if (key === 't') setTimer(value => (value === null ? 30 : null))
            else if (key === 'T') setTimer(60)
            else if (key === 'Escape') {
                if (showNotes) setShowNotes(false)
                else if (blackout) setBlackout(false)
                else if (!document.fullscreenElement) onExit?.()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [go, keysFor, onTally, slide, slides.length, toggleFullscreen, showNotes, blackout, onExit])

    const download = async () => {
        if (busy) return
        setBusy(true)
        try { await onDownload?.(tallies) } finally { setBusy(false) }
    }

    if (!slide) return null
    let content = null
    if (slide.kind === 'cover') content = <CoverSlide slide={slide} />
    else if (slide.kind === 'question' || slide.kind === 'reveal') content = <QuestionSlide slide={slide} revealed={slide.kind === 'reveal'} tally={tally} showTally={showTally} onTally={onTally} misconceptions={misconceptions} />
    else if (slide.kind === 'contrast') content = <ContrastSlide slide={slide} step={step} misconceptions={misconceptions} />
    else if (slide.kind === 'ladder') content = <LadderSlide slide={slide} step={step} />

    return (
        <div ref={rootRef} className={`${styles.root} ${idle ? styles.idle : ''}`} data-theme={theme}>
            <div className={styles.stageWrap} onClick={event => { if (event.target === event.currentTarget) go(1) }}>
                <div className={styles.stage} role="region" aria-roledescription="幻灯片" aria-label={`${title || '课堂诊断'}，第 ${index + 1} 页，共 ${slides.length} 页`}>
                    {content}
                    {timer !== null ? <div className={`${styles.timer} ${timer <= 0 ? styles.timeUp : ''}`} role="timer" aria-live="off">{timer > 0 ? `${timer}″` : '时间到'}</div> : null}
                    {blackout ? <div className={styles.blackout} onClick={() => setBlackout(false)} aria-hidden="true" /> : null}
                </div>
            </div>
            {showNotes ? <Notes slide={slide} misconceptions={misconceptions} onClose={() => setShowNotes(false)} /> : null}
            <nav className={styles.toolbar} aria-label="放映控制">
                <button type="button" onClick={() => go(-1)} disabled={index === 0 && step === 0} aria-label="上一页"><CaretLeftIcon weight="bold" /></button>
                <span className={styles.page}>{index + 1} / {slides.length}</span>
                <button type="button" onClick={() => go(1)} disabled={index === slides.length - 1 && step >= stepsOf(slide)} aria-label="下一页"><CaretRightIcon weight="bold" /></button>
                <span className={styles.sep} />
                <button type="button" onClick={() => setTimer(value => (value === null ? 30 : null))} aria-pressed={timer !== null} title="计时 30 秒（T；Shift+T 60 秒）"><TimerIcon weight="bold" /><span>计时</span></button>
                <button type="button" onClick={() => setShowTally(value => !value)} aria-pressed={showTally} title="统计各选项人数（C；数字键 1–4 加一人）"><ChartBarHorizontalIcon weight="bold" /><span>统计</span></button>
                <button type="button" onClick={() => setShowNotes(value => !value)} aria-pressed={showNotes} title="教师提示（N）"><NotebookIcon weight="bold" /><span>提示</span></button>
                <button type="button" onClick={() => setTheme(value => (value === 'light' ? 'dark' : 'light'))} title="白底 / 黑底"><CircleHalfIcon weight="bold" /><span>{theme === 'light' ? '黑底' : '白底'}</span></button>
                <button type="button" onClick={toggleFullscreen} title="全屏（F）">{fullscreen ? <CornersInIcon weight="bold" /> : <CornersOutIcon weight="bold" />}<span>{fullscreen ? '退出全屏' : '全屏'}</span></button>
                {onDownload ? <button type="button" onClick={download} disabled={busy} title="下载可编辑的 PPT"><DownloadSimpleIcon weight="bold" /><span>{busy ? '生成中' : 'PPT'}</span></button> : null}
                <button type="button" onClick={() => onExit?.()} title="退出放映（Esc）"><XIcon weight="bold" /><span>退出</span></button>
            </nav>
        </div>
    )
}
