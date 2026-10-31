import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageLoading, ErrorState } from '../components/StateComponents'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import { loadConcepts } from '../features/concepts/conceptsData'
import IdeasList from '../features/concepts/IdeasList'
import { READING_PATH, readPathProgress } from '../features/concepts/readingPath'
import styles from './ConceptsPage.module.css'
import exam from './TeacherExamPage.module.css'

// the subject a 师范生 sits the exam in, kept on this device
const SUBJECT_KEY = 'kebiao.exam.subject'
const readSubject = () => { try { return window.localStorage.getItem(SUBJECT_KEY) || '' } catch { return '' } }

// 教资: the 师范生's starting point. A four-step route (先读六页 → 速记 → 试讲 → 词典), and each 课标's 核心素养 and
// 课程理念 with page numbers and a cover-and-recall self-test, for the one subject they sit or for all 14.
export default function TeacherExamPage() {
    usePageMeta(STATIC_PAGE_META['/teacher-exam'])
    const [params, setParams] = useSearchParams()
    const [stored, setStored] = useState(readSubject)
    const [readCount] = useState(readPathProgress)
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    useEffect(() => {
        let active = true
        loadConcepts().then(value => active && setData(value)).catch(errorValue => active && setError(errorValue.message))
        return () => { active = false }
    }, [])
    if (error) return <ErrorState title="教资课标速记加载失败" message={error} />
    if (!data) return <PageLoading message="正在打开教资课标速记" />
    const subjects = data.subjects.filter(subject => subject.ideas)
    const asked = params.get('subject') ?? stored
    const chosen = subjects.find(subject => subject.slug === asked) || null
    const shown = chosen ? [chosen] : subjects
    const pick = slug => {
        setStored(slug)
        try { if (slug) window.localStorage.setItem(SUBJECT_KEY, slug); else window.localStorage.removeItem(SUBJECT_KEY) } catch { /* private mode */ }
        setParams(slug ? { subject: slug } : {}, { replace: true })
    }
    return (
        <div className={`container ${styles.page}`}>
            <header className={`${styles.hero} ${exam.heroGrid}`}>
                <div>
                    <p className={styles.kicker}>教资备考 · {subjects.length} 门课程 · 修订版课标原文，标明页码</p>
                    <h1 className={styles.title}>考前把课标读懂</h1>
                    <p className={styles.lede}>
                        教师资格笔试的学科知识与教学能力、面试的试讲和答辩，都会问到所教学科课标的课程理念和核心素养。按右边四步走；速记里点「遮住自测」，先自己说出来，再一条条点开核对。
                    </p>
                    <div className={exam.who} role="group" aria-label="我考的学科">
                        <span>我考的</span>
                        <button type="button" aria-pressed={!chosen} onClick={() => pick('')}>全部 {subjects.length} 门</button>
                        {subjects.map(subject => (
                            <button key={subject.slug} type="button" aria-pressed={chosen?.slug === subject.slug} style={{ '--c': subject.color || 'var(--kb-gold)' }} onClick={() => pick(subject.slug)}>
                                <i aria-hidden="true" />{subject.name}
                            </button>
                        ))}
                    </div>
                </div>
                <ol className={exam.route} aria-label="备考路线">
                    <li className={readCount >= READING_PATH.length ? exam.done : ''}>
                        <Link to="/concepts#concept-path"><span className={exam.n}>1</span><span><b>先读这六页</b><small>一本课标怎么读、核心素养、目标怎么写</small></span><em>{readCount ? `读过 ${readCount}/${READING_PATH.length}` : `${READING_PATH.length} 页`}</em></Link>
                    </li>
                    <li className={exam.now}>
                        <a href="#exam-notes"><span className={exam.n}>2</span><span><b>课标速记{chosen ? `：${chosen.name}` : ''}</b><small>课程理念和核心素养，遮住自测</small></span><em>就在下面</em></a>
                    </li>
                    <li>
                        <Link to="/lesson-plan?for=trial"><span className={exam.n}>3</span><span><b>试讲稿与答辩</b><small>选一课起草教案，再生成 10 分钟试讲和 3 道答辩</small></span><em>约 1 分钟</em></Link>
                    </li>
                    <li>
                        <Link to="/concepts"><span className={exam.n}>4</span><span><b>概念词典</b><small>大单元、任务群、教—学—评一致性</small></span><em>{data.terms.length} 个词</em></Link>
                    </li>
                </ol>
            </header>
            <div id="exam-notes" className={exam.notes}>
                {shown.map(subject => (
                    <section key={subject.slug} id={`exam-${subject.slug}`} className={styles.examSubject} style={{ '--subject-color': subject.color || 'var(--kb-gold)' }} aria-labelledby={`exam-${subject.slug}-title`}>
                        <h2 id={`exam-${subject.slug}-title`}>{subject.name}<Link to={`/concepts/subjects/${subject.slug}`}>看这门课的骨架</Link></h2>
                        <h3>核心素养</h3>
                        <ul className={styles.literacy} aria-label={`${subject.name}核心素养`}>
                            {subject.core_literacy.map(name => <li key={name}>{name}</li>)}
                        </ul>
                        <h3>课程理念</h3>
                        <IdeasList subject={subject} />
                    </section>
                ))}
            </div>
            {chosen ? <p className={styles.footnote}>只显示了{chosen.name}。<button type="button" className={exam.all} onClick={() => pick('')}>看全部 {subjects.length} 门</button></p> : null}
            <p className={styles.footnote}>想弄清课程理念、核心素养这些词在一本课标里的位置，先读<Link to="/concepts/standard-document">一本课标怎么读</Link>。说课和试讲可以用 <Link to="/lesson-plan">AI 备课</Link>起草教案后一键生成。</p>
            <p className={styles.footnote}>教学设计和评价的常用概念，课标原文怎么说：<Link to="/concepts/learning-objective">学习目标怎么写</Link>、<Link to="/concepts/action-verbs">行为动词与目标层次</Link>、<Link to="/concepts/teach-learn-assess">教—学—评一致性</Link>、<Link to="/concepts/performance-assessment">表现性评价</Link>、<Link to="/concepts/four-evaluations">结果评价、过程评价、增值评价、综合评价</Link>、<Link to="/concepts/project-learning">项目式学习</Link>。</p>
        </div>
    )
}
