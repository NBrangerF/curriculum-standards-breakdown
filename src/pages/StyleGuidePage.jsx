import { useState } from 'react'
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { CircleNotchIcon } from '@phosphor-icons/react/dist/csr/CircleNotch'
import { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { StarIcon } from '@phosphor-icons/react/dist/csr/Star'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import { EmptyState, ErrorState, LoadingState } from '../components/StateComponents'
import { Chip, Pill, SectionHead, Seg } from '../components/kb'
import { Disclosure, DisclosureIndicator } from '../ui/primitives/Disclosure'
import { Tooltip } from '../ui/primitives/Tooltip'
import styles from './StyleGuidePage.module.css'

const FOUNDATION_COLORS = [
    ['夜空', '--kb-night', '#07080C'],
    ['玻璃', '--kb-night-glass', 'rgba(9,11,16,.84)'],
    ['月白', '--kb-moon', '#ECEFF4'],
    ['薄雾', '--kb-mist', '#AAB2BF'],
    ['暗星', '--kb-dim', '#858E9C'],
    ['金', '--kb-gold', '#E9C887']
]

const SEMANTIC_COLORS = [
    ['成功', '--color-success', '#5BD08F'],
    ['提醒', '--color-warning', '#F0B35A'],
    ['错误', '--color-error', '#F27A84'],
    ['图谱画布', '--kb-graph-canvas', '#07080C'],
    ['图谱面板', '--kb-graph-surface', '#0E1118'],
    ['图谱文字', '--kb-graph-text', '#ECEFF4']
]

const SUBJECTS = [
    ['语文', '--subject-chinese'], ['数学', '--subject-math'], ['英语', '--subject-english'],
    ['科学', '--subject-science'], ['信息科技', '--subject-it'], ['艺术', '--subject-arts']
]

const SKILLS = ['TS1', 'TS2', 'TS3', 'TS4', 'TS5', 'TS6', 'TS7']
const GRADE_TABS = [['H1', '1–2年级'], ['H2', '3–4年级'], ['H3', '5–6年级'], ['H4G7', '7年级'], ['H4G8', '8年级'], ['H4G9', '9年级']]

function StyleGuidePage() {
    const [density, setDensity] = useState('compact')
    const [activeTab, setActiveTab] = useState('H2')
    const [disclosureOpen, setDisclosureOpen] = useState(true)
    const [selectedSkill, setSelectedSkill] = useState('TS4')
    const [checked, setChecked] = useState(true)
    const [kbPill, setKbPill] = useState(true)
    const [kbSeg, setKbSeg] = useState('table')

    return (
        <div className={styles.root} data-density={density} data-kb-route="styleguide">
            <header className={styles.header}>
                <div className={`container ${styles.headerLayout}`}>
                    <div>
                        <span className={styles.coordinate} aria-hidden="true">设计系统 · 课标星图</span>
                        <h1>kebiao Design System</h1>
                        <p>2,025 颗星组成的课标星图：夜空打底，月白文字，金色强调；标题用衬线，数字用斜体。所有页面共用这一套组件与设计变量。</p>
                    </div>
                    <div className={styles.density} role="group" aria-label="预览密度">
                        <span>密度</span>
                        {['compact', 'comfortable'].map(value => (
                            <button key={value} type="button" aria-pressed={density === value} onClick={() => setDensity(value)}>
                                {value === 'compact' ? '紧凑' : '舒适'}
                            </button>
                        ))}
                    </div>
                </div>
                <nav className={`container ${styles.nav}`} aria-label="设计系统目录">
                    <a href="#foundation">Foundation</a>
                    <a href="#primitives">Primitives</a>
                    <a href="#states">States</a>
                    <a href="#graph-language">Graph language</a>
                    <a href="#brand">Brand</a>
                </nav>
            </header>

            <main>
                <section id="foundation" className={styles.section}>
                    <div className="container">
                        <SectionHeading index="01" title="Foundation" description="单一 canonical token 源，legacy 变量只作为单向兼容别名。" />

                        <div className={styles.tokenLayout}>
                            <div className={styles.tokenGroup}>
                                <h3>核心表面</h3>
                                <div className={styles.colorGrid}>
                                    {FOUNDATION_COLORS.map(token => <TokenSwatch key={token[1]} token={token} />)}
                                </div>
                            </div>
                            <div className={styles.tokenGroup}>
                                <h3>语义与图谱</h3>
                                <div className={styles.colorGrid}>
                                    {SEMANTIC_COLORS.map(token => <TokenSwatch key={token[1]} token={token} />)}
                                </div>
                            </div>
                        </div>

                        <div className={styles.typography}>
                            <div className={styles.typeDisplay}>
                                <span>DISPLAY / NOTO SERIF SC 900</span>
                                <p>课程标准<br />关系索引</p>
                            </div>
                            <div className={styles.typeBody}>
                                <span>BODY / PINGFANG SC 400</span>
                                <p>学生通过观察、操作、想象等活动，认识物体的形状与结构，理解图形的位置与运动，发展空间观念。</p>
                                <code>MA-D2-GE-003 · IBM Plex Mono 500</code>
                            </div>
                        </div>

                        <div className={styles.dataColors}>
                            <div>
                                <h3>学科数据色</h3>
                                <div>{SUBJECTS.map(([label, variable]) => <span key={label} style={{ '--data-color': `var(${variable})` }}>{label}</span>)}</div>
                            </div>
                            <div>
                                <h3>可迁移技能</h3>
                                <div>{SKILLS.map((skill, index) => <span key={skill} style={{ '--data-color': `var(--skill-ts${index + 1})` }}>{skill}</span>)}</div>
                            </div>
                        </div>

                        <div className={styles.motionTable}>
                            <div><span>反馈</span><strong>140ms</strong><code>cubic-bezier(.2,0,0,1)</code></div>
                            <div><span>组件</span><strong>220ms</strong><code>cubic-bezier(.2,0,0,1)</code></div>
                            <div><span>面板</span><strong>340ms</strong><code>cubic-bezier(.16,1,.3,1)</code></div>
                            <div><span>视图</span><strong>520ms</strong><code>cubic-bezier(.16,1,.3,1)</code></div>
                        </div>
                    </div>
                </section>

                <section id="primitives" className={`${styles.section} ${styles.muted}`}>
                    <div className="container">
                        <SectionHeading index="02" title="Primitives" description="所有状态必须可见、可聚焦、可按键操作，并保持 44px 关键触摸目标。" />

                        <div className={styles.primitiveGrid}>
                            <article>
                                <h3>Button</h3>
                                <div className={styles.buttonStates}>
                                    <button className="btn btn-primary">主要操作</button>
                                    <button className="btn btn-secondary">次要操作</button>
                                    <button className="btn btn-ghost">文字操作</button>
                                    <button className="btn btn-primary" disabled>不可用</button>
                                </div>
                                <div className={styles.iconButtons}>
                                    <button type="button" aria-label="收藏"><StarIcon size={19} aria-hidden="true" /></button>
                                    <Tooltip content="复制编码">
                                        <button type="button" aria-label="复制编码"><CopyIcon size={19} aria-hidden="true" /></button>
                                    </Tooltip>
                                    <button type="button" aria-label="已收藏" aria-pressed="true"><StarIcon size={19} weight="fill" aria-hidden="true" /></button>
                                </div>
                            </article>

                            <article>
                                <h3>Search & checkbox</h3>
                                <label className={styles.search}>
                                    <span className="sr-only">搜索课程标准</span>
                                    <MagnifyingGlassIcon size={18} aria-hidden="true" />
                                    <input type="search" placeholder="搜索标准编码、领域或能力" />
                                    <kbd>⌘ K</kbd>
                                </label>
                                <label className={styles.checkbox}>
                                    <input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />
                                    <span aria-hidden="true"><CheckIcon size={14} weight="bold" /></span>
                                    显示学段进阶关系
                                </label>
                            </article>

                            <article className={styles.wide}>
                                <h3>Grade tabs</h3>
                                <div className={styles.tabs} role="tablist" aria-label="学段">
                                    {GRADE_TABS.map(([code, label]) => (
                                        <button
                                            key={code}
                                            type="button"
                                            role="tab"
                                            aria-selected={activeTab === code}
                                            onClick={() => setActiveTab(code)}
                                        >
                                            <span>{label}</span><code>{code}</code>
                                        </button>
                                    ))}
                                </div>
                            </article>

                            <article>
                                <h3>Filter chips</h3>
                                <div className={styles.skillChips} role="group" aria-label="能力筛选">
                                    {SKILLS.map(skill => (
                                        <button key={skill} type="button" aria-pressed={selectedSkill === skill} onClick={() => setSelectedSkill(skill)}>{skill}</button>
                                    ))}
                                </div>
                            </article>

                            <article>
                                <h3>Disclosure</h3>
                                <Disclosure
                                    isExpanded={disclosureOpen}
                                    onExpandedChange={setDisclosureOpen}
                                    triggerClassName={styles.disclosureTrigger}
                                    panelClassName={styles.disclosureContent}
                                    panelId="styleguide-disclosure-content"
                                    trigger={({ isExpanded }) => (
                                        <><span>图形与几何</span><DisclosureIndicator isExpanded={isExpanded} /></>
                                    )}
                                >
                                    领域展开保持原行位置；关闭后焦点仍停留在触发器。
                                </Disclosure>
                            </article>
                        </div>
                    </div>
                </section>

                <section id="states" className={styles.section}>
                    <div className="container">
                        <SectionHeading index="03" title="States" description="状态不是装饰；每一种都说明当前发生了什么，以及用户下一步能做什么。" />
                        <div className={styles.controlStates}>
                            <div><span>Default</span><button className="btn btn-secondary">保存到清单</button></div>
                            <div><span>Pressed</span><button className={`btn btn-secondary ${styles.forcePressed}`}>保存到清单</button></div>
                            <div><span>Loading</span><button className="btn btn-primary" disabled><CircleNotchIcon className={styles.spin} size={17} />正在保存</button></div>
                            <div><span>Success</span><button className={`btn ${styles.success}`}><CheckIcon size={17} />已保存</button></div>
                            <div><span>Error</span><button className={`btn ${styles.error}`}><WarningCircleIcon size={17} />重试保存</button></div>
                        </div>
                        <div className={styles.resultStates}>
                            <div><LoadingState message="正在加载课程标准" /></div>
                            <div><ErrorState title="数据暂时不可用" message="请检查连接后重试" /></div>
                            <div><EmptyState title="没有匹配结果" message="调整学科、学段或能力筛选" /></div>
                        </div>
                    </div>
                </section>

                <section id="graph-language" className={`${styles.section} ${styles.graphSection}`}>
                    <div className="container">
                        <SectionHeading index="04" title="Graph language" description="深石墨只服务关系探索；实体类型、关系和焦点不只依赖颜色。" />
                        <div className={styles.graphSample}>
                            <div className={`${styles.graphNode} ${styles.subjectNode}`}><span>SUBJECT</span><strong>数学</strong></div>
                            <i aria-hidden="true" />
                            <div className={`${styles.graphNode} ${styles.domainNode}`}><span>DOMAIN</span><strong>图形与几何</strong></div>
                            <i className={styles.progressionLine} aria-hidden="true" />
                            <div className={`${styles.graphNode} ${styles.standardNode}`}><span>STANDARD</span><strong>MA-D2-GE-003</strong></div>
                            <i className={styles.skillLine} aria-hidden="true" />
                            <div className={`${styles.graphNode} ${styles.skillNode}`}><span>SKILL</span><strong>TS1 批判性思维</strong></div>
                        </div>
                        <div className={styles.graphLegend}>
                            <span><i />结构包含</span>
                            <span><i className={styles.progressionLine} />学段进阶</span>
                            <span><i className={styles.skillLine} />能力关联</span>
                            <span>Canvas 失败时必须提供 DOM 等价关系列表</span>
                        </div>
                    </div>
                </section>

                <section id="brand" className={styles.section}>
                    <div className="container">
                        <SectionHeading index="05" title="Brand" description="品牌来自 2,025 条真实课标组成的星图，不来自装饰性的数据面板或通用 AI 光球。" />
                        <div className={styles.brandLayout}>
                            <div className={styles.brandLockup}>
                                <img src="/kebiao-mark.svg" alt="" />
                                <div><strong>kebiao</strong><span>中国课程标准的结构化索引与智能引擎</span></div>
                            </div>
                            <div className={styles.brandRules}>
                                <div><span>使用</span><p>夜空底色、月白文字、金色强调、学科九色（只点在星与编码上）、衬线标题与斜体数字、中文小标题。</p></div>
                                <div><span>避免</span><p>不透明色块与方格纸背景、蓝紫渐变、英文小标题、厚重阴影、整块填色的标签。</p></div>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="starmap" className={styles.section}>
                    <div className="container">
                        <SectionHeading index="06" title="星图组件" description="二级页面共用的页头、区块标题与控件，来自 src/components/kb。" />
                        <div className={styles.kbDemo}>
                            <SectionHead kicker="区块 · 示例" title="一门学科，九个年级" size="sm" />
                            <div className={styles.kbRow}>
                                <Chip color="#3FA2E0" dot>数学 <code>370</code></Chip>
                                <Chip to="/skills" small>可迁移技能</Chip>
                                <Pill pressed={kbPill} onClick={() => setKbPill(value => !value)}>数与代数</Pill>
                                <Seg label="视图" options={[{ value: 'table', label: '对照表' }, { value: 'graph', label: '关系图谱' }]} value={kbSeg} onChange={setKbSeg} />
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    )
}

function SectionHeading({ index, title, description }) {
    return (
        <header className={styles.sectionHeading}>
            <span>{index}</span><h2>{title}</h2><p>{description}</p>
        </header>
    )
}

function TokenSwatch({ token: [label, variable, value] }) {
    return (
        <div className={styles.swatch} style={{ '--swatch': `var(${variable}, ${value})` }}>
            <i aria-hidden="true" /><strong>{label}</strong><code>{variable}</code><span>{value}</span>
        </div>
    )
}

export default StyleGuidePage
