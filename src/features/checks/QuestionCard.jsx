import { Link } from 'react-router-dom'
import MathText from './MathText.jsx'
import { TYPE_META, choicesOf, misconceptionsOf, presentHref } from './checksData.js'
import styles from './QuestionCard.module.css'

const answerText = item => {
    if (item.type === 'choice') return `${item.answer + 1}`
    if (item.type === 'judge') return item.answer ? '同意' : '不同意'
    if (item.type === 'step') return `第 ${item.answer + 1} 步开始错`
    return item.answer
}

/** One question as a small paper slide, with what it can reveal and its answer folded away. */
export default function QuestionCard({ item, misconceptions, selected, onToggle, back = '/checks', headingLevel = 3 }) {
    const Heading = `h${headingLevel}`
    const choices = item.type === 'choice' || item.type === 'step' ? choicesOf(item) : []
    const reveals = misconceptionsOf(item).map(id => misconceptions[id]).filter(Boolean)
    return (
        <article className={`${styles.card} ${selected ? styles.selected : ''}`} aria-labelledby={`q-${item.id}`}>
            <header className={styles.head}>
                <span className={styles.type}>{TYPE_META[item.type].short}</span>
                {item.lesson ? <span className={styles.lesson}>{item.lesson}</span> : null}
                <Heading id={`q-${item.id}`} className={styles.topic}>{item.topic}</Heading>
            </header>
            <div className={styles.slip}>
                <MathText as="p" className={styles.stem} text={item.stem} />
                {item.type === 'judge' ? <div className={styles.work}>{item.work.map((line, index) => <MathText key={index} as="p" text={line} />)}</div> : null}
                {choices.length ? (
                    <ol className={styles.choices}>
                        {choices.map(choice => <li key={choice.key}><span>{choice.label}</span><MathText text={choice.text} /></li>)}
                    </ol>
                ) : null}
                {item.type === 'write' ? <p className={styles.writeHint}>写在草稿纸上，举起来</p> : null}
            </div>
            {reveals.length ? (
                <p className={styles.reveals}><b>能看出</b>{reveals.map(entry => <span key={entry.name}>{entry.name}</span>)}</p>
            ) : null}
            <details className={styles.answer}>
                <summary>答案和正确做法</summary>
                <p><b>答案：</b><MathText text={answerText(item)} /></p>
                {item.right.map((line, index) => <MathText key={index} as="p" text={line} />)}
            </details>
            <footer className={styles.actions}>
                {onToggle ? (
                    <button type="button" className={styles.pick} aria-pressed={selected} onClick={() => onToggle(item.id)}>
                        {selected ? '已选' : '选这题'}
                    </button>
                ) : null}
                <Link className={styles.present} to={presentHref([item.id], { back })}>放映这一题</Link>
                <span className={styles.points}>{item.points.map(code => <Link key={code} to={`/standards/${code.replace(/\.\d+$/u, '')}#${code}`}>{code}</Link>)}</span>
            </footer>
        </article>
    )
}
