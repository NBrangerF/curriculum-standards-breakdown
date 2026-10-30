import { Link } from 'react-router-dom'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import concepts from './ConceptsPage.module.css'
import styles from './GuidePage.module.css'

// 上手指南: the workflows a teacher or student teacher meets in a week, three steps each, with a link to start.
const FLOWS = [
    {
        id: 'lesson', title: '备一节课', who: '任课老师 · 下周要上的一课',
        steps: ['在 AI 备课里选学科、教材和这一课；AI 读完这个年级的全部课标，勾出这节课对应的要点，你核对、增删。', '可以写几句学情（或点常用短语），再点「起草教案」：先写目标和评价，再写教学过程，每条目标标出依据的要点编码。', '看核验结果（超标、目标—活动—评价是否对齐），改好后复制、下载 Word 或打印；需要时生成说课稿、试讲稿或听课观察表。'],
        to: '/lesson-plan', action: '打开 AI 备课'
    },
    {
        id: 'unit', title: '做一个单元的整体设计', who: '任课老师 · 教研组单元备课',
        steps: ['在 AI 备课里选教材后，在「哪一课」里选「◆ 整个单元」。', '核对 AI 勾选的单元要点，设定单元总课时。', '起草单元大概念、基本问题、单元目标、表现性任务，并按教材里的课排好课时；每一课都能接着起草教案。'],
        to: '/lesson-plan', action: '打开 AI 备课'
    },
    {
        id: 'check', title: '核验自己写的（或 AI 写的）教案', who: '教案检查、评优、公开课前',
        steps: ['在 AI 备课选好这一课、核对要点后，切到「核验教案」。', '把教案全文贴进去（手边没有就先点示例试试）。', '看核验报告：哪些目标没有课标依据、哪些动词看不见、哪里超出课标限定、目标和活动评价是否对齐；报告可复制或下载 Word。'],
        to: '/lesson-plan', action: '打开 AI 备课'
    },
    {
        id: 'test', title: '出卷或布置作业前，编一张多维细目表', who: '单元测试、期中期末、作业设计',
        steps: ['在 AI 备课选好教材单元（或一课）和要点，切到「核验试卷」。', '把试卷或作业贴进去，带题号和分值更好。', 'AI 逐题读出考查的要点、素养、层次和难度，程序编成细目表，并指出超出课标限定的题、没对上要点的题和漏考的要点。'],
        to: '/lesson-plan', action: '打开 AI 备课'
    },
    {
        id: 'term', title: '开学排教学进度', who: '每学期初的教学进度表',
        steps: ['在学期进度表里选这学期的教材，填每周课时和学期周数。', '按单元排出周次，每个单元附 AI 判断的课标要点；课时可改，改动只存在你的浏览器里。', '复制表格或下载 Word 交给学校；每个单元都能直接打开单元设计。'],
        to: '/schedule', action: '打开学期进度表'
    },
    {
        id: 'review', title: '初三按课标复习', who: '九年级 · 中考复习',
        steps: ['在中考复习地图里选学科。', '每条初中课标后面列出它在七、八、九年级哪一单元教过，并附课标原文里的学业要求。', '按课标把三年的内容串起来复习；出复习卷前用「核验试卷」查覆盖和超标。'],
        to: '/review', action: '打开中考复习地图'
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
                <p className={concepts.kicker}>上手指南 · 八个常用场景</p>
                <h1 className={concepts.title}>五分钟学会用 kebiao 备课</h1>
                <p className={concepts.lede}>kebiao 从你手上的教材出发，把每一步都对到《义务教育课程标准（2022年版2025年修订）》的原文和页码。下面是一周里最常用的八件事，每件三步。AI 做的判断都标「待核验」，发现不对，点旁边的「报错」或<Link to="/feedback">告诉我们</Link>。</p>
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
            <p className={concepts.footnote}>网站不需要注册。草稿、进度表的改动只保存在你自己的浏览器里；贴进来的教案和试卷只用于这一次核验，请删去学生姓名等个人信息。</p>
        </div>
    )
}
