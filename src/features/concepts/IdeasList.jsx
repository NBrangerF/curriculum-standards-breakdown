import { useState } from 'react'
import styles from '../../pages/ConceptsPage.module.css'

// A 课标's 课程理念 as a numbered list, with a self-test: cover them, say them, uncover one at a time.
export default function IdeasList({ subject }) {
    const [covered, setCovered] = useState(false)
    const [shown, setShown] = useState(() => new Set())
    const toggle = () => {
        setCovered(value => !value)
        setShown(new Set())
    }
    return (
        <div className={styles.ideas}>
            <ol>
                {subject.ideas.items.map((item, index) => (
                    <li key={item}>
                        {covered && !shown.has(index)
                            ? <button type="button" className={styles.ideaCover} onClick={() => setShown(current => new Set(current).add(index))}>第 {index + 1} 条：先自己说，再点开</button>
                            : <span>{item}</span>}
                    </li>
                ))}
            </ol>
            <p className={styles.quoteSource}>
                {subject.name}课标「二、课程理念」· 修订版 PDF 第 {subject.ideas.pages.length > 1 ? `${subject.ideas.pages[0]}–${subject.ideas.pages.at(-1)}` : subject.ideas.pages[0]} 页
                <button type="button" className={styles.ideaToggle} onClick={toggle} aria-pressed={covered}>{covered ? '全部显示' : '遮住自测'}</button>
            </p>
        </div>
    )
}
