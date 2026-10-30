import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageLoading, ErrorState } from '../components/StateComponents'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import { loadConcepts } from '../features/concepts/conceptsData'
import IdeasList from '../features/concepts/IdeasList'
import styles from './ConceptsPage.module.css'

// 教资课标速记: each 课标's 核心素养 and 课程理念 on one page, with page numbers and a cover-and-recall self-test.
export default function TeacherExamPage() {
    usePageMeta(STATIC_PAGE_META['/teacher-exam'])
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
    return (
        <div className={`container ${styles.page}`}>
            <header className={styles.hero}>
                <p className={styles.kicker}>教资课标速记 · {subjects.length} 门课程 · 修订版原文</p>
                <h1 className={styles.title}>每门课的核心素养和课程理念</h1>
                <p className={styles.lede}>
                    教师资格笔试的学科知识与教学能力、面试答辩，都会问到所教学科课标的课程理念和核心素养。这里按《义务教育课程标准（2022年版2025年修订）》逐条列出，标明页码。点「遮住自测」，先自己说出来，再一条条点开核对。
                </p>
                <ul className={styles.examNav} aria-label="学科">
                    {subjects.map(subject => <li key={subject.slug}><a href={`#exam-${subject.slug}`}>{subject.name}</a></li>)}
                </ul>
            </header>
            {subjects.map(subject => (
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
            <p className={styles.footnote}>想弄清课程理念、核心素养这些词在一本课标里的位置，先读<Link to="/concepts/standard-document">一本课标怎么读</Link>。说课和试讲可以用 <Link to="/lesson-plan">AI 备课</Link>起草教案后一键生成。</p>
            <p className={styles.footnote}>教学设计和评价的常用概念，课标原文怎么说：<Link to="/concepts/learning-objective">学习目标怎么写</Link>、<Link to="/concepts/action-verbs">行为动词与目标层次</Link>、<Link to="/concepts/teach-learn-assess">教—学—评一致性</Link>、<Link to="/concepts/performance-assessment">表现性评价</Link>、<Link to="/concepts/four-evaluations">结果评价、过程评价、增值评价、综合评价</Link>、<Link to="/concepts/project-learning">项目式学习</Link>。</p>
        </div>
    )
}
