import { Link } from 'react-router-dom'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import concepts from './ConceptsPage.module.css'
import styles from './GuidePage.module.css'

// 上手指南: the workflows a teacher or student teacher meets in a week, three steps each, with a link to start.
const FLOWS = [
    {
        id: 'lesson', title: '备一节课', who: '任课老师 · 下周要上的一课',
        steps: ['在 AI 备课里选学科、教材和这一课；AI 读完这个年级的全部课标，勾出这节课对应的要点，你核对、增删。', '选班额、课型，写几句学情（或点常用短语），再点「起草教案」：AI 先读课标、定目标和评价，再按大班课堂写教学过程、关键问题和当堂练习，每条目标标出依据的要点编码。想按学校格式自己写，就点「下载教案框架」，课标依据已经填好。', '先读「课标分析」：每条要点要学生做到什么、本课承担哪一部分、怎样用教材去教，以及学生之前学过什么、后面用到哪里。看核验结果，改好后下载 Word 详案，或把一页纸的简案带进课堂；需要时生成说课稿、试讲稿或听课观察表；上完课下载课后反思表。'],
        to: '/lesson-plan', action: '打开 AI 备课'
    },
    {
        id: 'checks', title: '上课先问一道题，批完作业明天补', who: '各科老师 · 大班课堂',
        steps: ['在课堂诊断里选学科、年级（或学段）和单元，挑一两道题；每个错误答案都对应一种常见错法。', '点「投影放映」：全班用手势 1–4、拇指或举草稿纸一起作答，按数字键记人数，翻页揭晓答案和“选错的同学可能怎么想”；也可以下载 PPT 放进自己的课件。', '批完作业，在「批完就用」里点看到的错法和大约多少人，生成明天开课 5 分钟：一道诊断题、比一比、阶梯练习。过几天点「回看」换一道题再查。'],
        to: '/checks', action: '打开课堂诊断'
    },
    {
        id: 'unit', title: '做一个单元的整体设计', who: '任课老师 · 教研组单元备课',
        steps: ['在 AI 备课里选教材后，在「哪一课」里选「◆ 整个单元」。', '核对 AI 勾选的单元要点，设定单元总课时。', '起草单元大概念、基本问题、单元目标、表现性任务，并按教材里的课排好课时；每一课都能接着起草教案。'],
        to: '/lesson-plan', action: '打开 AI 备课'
    },
    {
        id: 'review', title: '初三按课标复习、查漏补缺', who: '九年级 · 中考复习',
        steps: ['在知识图谱里选学科：七、八、九年级各是一列，每条线索一行，线索名下可以展开课标原文里的学业要求。', '点一个要点，看它在三年教材的哪一课教过，以及它要先会的要点。', '学生哪里不会，就顺着「先学」往前追，找到要补的那一课。'],
        to: '/knowledge-graph', action: '打开知识图谱'
    },
    {
        id: 'student', title: '师范生：读懂课标、准备教资', who: '师范生 · 新教师',
        steps: ['先读概念词典的六页阅读路径：一本课标怎么读、核心素养、内容要求·学业要求·教学提示、教学目标、教—学—评一致性、单元整体教学设计。', '在教资课标速记里背自己学科的核心素养和课程理念，可以遮住自测，也能打印。', '用 AI 备课起草一节课，再一键生成说课稿和试讲稿（含答辩准备），对着练。'],
        to: '/concepts', action: '打开概念词典'
    },
    {
        id: 'resources', title: '找资源：同步课、实验、跨学科主题', who: '所有老师 · 兼任科学的老师',
        steps: ['在任一条课标的页面，看「教材里在哪教」和国家平台同步课。', '兼任科学或理化生的老师，先看必做实验清单，按年级备器材。', '要设计跨学科主题学习，在跨学科主题库里选学科和年级，看课标给出的主题和要结合的学科。'],
        to: '/experiments', action: '打开必做实验清单'
    }
]

export default function GuidePage() {
    usePageMeta(STATIC_PAGE_META['/guide'])
    return (
        <div className={`container ${concepts.page}`}>
            <header className={concepts.hero}>
                <p className={concepts.kicker}>上手指南 · 六个常用场景</p>
                <h1 className={concepts.title}>五分钟学会用 kebiao 备课</h1>
                <p className={concepts.lede}>kebiao 从你手上的教材出发，把每一步都对到《义务教育课程标准（2022年版2025年修订）》的原文和页码。下面是一周里最常用的五件事，每件三步。AI 做的判断都标「待核验」，发现不对，点旁边的「报错」或<Link to="/feedback">告诉我们</Link>。</p>
                <ul className={styles.jump} aria-label="场景">
                    {FLOWS.map(flow => <li key={flow.id}><a href={`#guide-${flow.id}`}>{flow.title}</a></li>)}
                </ul>
            </header>
            <ol className={styles.flows}>
                {FLOWS.map((flow, index) => (
                    <li key={flow.id} id={`guide-${flow.id}`} className={styles.flow}>
                        <p className={styles.who}>{String(index + 1).padStart(2, '0')} · {flow.who}</p>
                        <h2>{flow.title}</h2>
                        <ol className={styles.steps}>
                            {flow.steps.map(step => <li key={step}>{step}</li>)}
                        </ol>
                        <Link className="btn btn-secondary" to={flow.to}>{flow.action}</Link>
                    </li>
                ))}
            </ol>
            <p className={concepts.footnote}>网站不需要注册。草稿只保存在你自己的浏览器里；写学情时请不要写学生姓名等个人信息。</p>
        </div>
    )
}
