import { useRef } from 'react'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import styles from './HomeNarrativeSection.module.css'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const NARRATIVE_STEPS = [
    { index: '01', label: 'Subject', title: '从学科进入', copy: '以九门义务教育学科建立第一层结构入口。', node: '小学数学' },
    { index: '02', label: 'Domain', title: '沿领域定位', copy: '领域把课程内容组织成可浏览、可筛选的知识区域。', node: '图形与几何' },
    { index: '03', label: 'Standard', title: '落到具体标准', copy: '每条标准保留编码、学段、原文和可追溯来源。', node: 'MA-D2-GE-003' },
    { index: '04', label: 'Skill', title: '连接迁移能力', copy: '能力关系把不同学科中的学习表现连接起来。', node: 'TS1 · 批判性思维' }
]

export default function HomeNarrativeSection({ subjectCount, standardCount, skillCount }) {
    const rootRef = useRef(null)

    useGSAP(() => {
        const media = gsap.matchMedia()
        media.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
            const steps = gsap.utils.toArray(`.${styles['home-narrative-step']}`)
            const nodes = gsap.utils.toArray(`.${styles['home-coordinate-node']}`)
            const connectors = gsap.utils.toArray(`.${styles['home-coordinate-connector']}`)

            gsap.set(steps, { opacity: 0.28 })
            gsap.set(nodes, { opacity: 0.34, scale: 0.92, transformOrigin: 'left center' })
            gsap.set(connectors, { scaleY: 0, transformOrigin: 'top center' })

            const timeline = gsap.timeline({
                defaults: { ease: 'none' },
                scrollTrigger: {
                    id: 'kebiao-home-coordinate-story',
                    trigger: rootRef.current,
                    start: 'top top+=72',
                    end: '+=1500',
                    pin: `.${styles['home-narrative-stage']}`,
                    scrub: 0.65,
                    invalidateOnRefresh: true
                }
            })

            steps.forEach((step, index) => {
                const label = `stage-${index}`
                if (index > 0) timeline.to(steps[index - 1], { opacity: 0.28, duration: 0.28 }, label)
                timeline
                    .to(step, { opacity: 1, duration: 0.28 }, label)
                    .to(nodes[index], { opacity: 1, scale: 1.04, duration: 0.34 }, label)
                if (index > 0) timeline.to(connectors[index - 1], { scaleY: 1, duration: 0.32 }, label)
            })

            return () => timeline.kill()
        })
        return () => media.revert()
    }, { scope: rootRef })

    return (
        <section className={styles['home-narrative']} ref={rootRef} aria-labelledby="home-narrative-title" data-kb-component="home-narrative">
            <div className={`${styles['home-narrative-stage']} container`}>
                <header className={styles['home-narrative-heading']}>
                    <span>Structured Curriculum Engine</span>
                    <h2 id="home-narrative-title">从课程目录，到可探索的知识坐标</h2>
                    <p>kebiao 不改变课程标准的原有含义，只把学科、领域、标准与能力之间的真实结构变得可见。</p>
                    <dl aria-label="课程索引规模">
                        <div><dt>学科</dt><dd>{subjectCount}</dd></div>
                        <div><dt>标准</dt><dd>{standardCount}</dd></div>
                        <div><dt>能力</dt><dd>{skillCount}</dd></div>
                    </dl>
                </header>

                <ol className={styles['home-narrative-steps']}>
                    {NARRATIVE_STEPS.map(step => (
                        <li className={styles['home-narrative-step']} key={step.label}>
                            <span>{step.index} · {step.label}</span>
                            <h3>{step.title}</h3>
                            <p>{step.copy}</p>
                        </li>
                    ))}
                </ol>

                <div className={styles['home-coordinate-visual']} aria-hidden="true">
                    {NARRATIVE_STEPS.map((step, index) => (
                        <div className={styles['home-coordinate-row']} key={step.label}>
                            <div className={`${styles['home-coordinate-node']} ${styles[`is-${step.label.toLowerCase()}`]}`}>
                                <span>{step.label}</span>
                                <strong>{step.node}</strong>
                            </div>
                            {index < NARRATIVE_STEPS.length - 1 ? <i className={styles['home-coordinate-connector']}></i> : null}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
