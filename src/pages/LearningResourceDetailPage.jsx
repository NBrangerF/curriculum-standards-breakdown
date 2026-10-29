import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { loadLearningResource, SUBJECT_COLORS } from '../data/dataLoader'
import { ErrorState, PageLoading } from '../components/StateComponents'
import { learningResourceMeta } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import { Chip, PageHero, SectionHead, kb } from '../components/kb'
import ResourceBadges, { OpenOriginalLink } from '../features/learning-resources/ResourceBadges'
import {
    OPEN_LEVEL_LABELS,
    accessLabel,
    formatLabel,
    languageLabel,
    licenseLabel,
    stageLabel,
    hasDistinctOriginal,
    subjectLabel
} from '../features/learning-resources/labels'
import styles from './LearningResourceDetailPage.module.css'

const ACCESS_NOTES = {
    direct: '在中国大陆网络下两次检测都能正常打开。',
    unstable: '在中国大陆网络下打开较慢或时好时坏，建议课前先试开。',
    blocked: '在中国大陆网络下无法直接打开，课前请确认学校网络能否访问。'
}

export default function LearningResourceDetailPage() {
    const { resourceId } = useParams()
    const [resource, setResource] = useState(undefined)
    usePageMeta(resource ? learningResourceMeta(resource) : null)
    const [error, setError] = useState(null)

    useEffect(() => {
        setResource(undefined)
        loadLearningResource(resourceId).then(setResource).catch(setError)
    }, [resourceId])

    if (error) return <ErrorState title="学习资源暂时不可用" message={error.message} />
    if (resource === undefined) return <PageLoading message="正在整理学习资源" />
    if (!resource) return <ErrorState title="未找到学习资源" message="该资源可能已更新或移出目录。" />

    const facts = [
        ['学科', resource.subjects.map(subjectLabel).join('、')],
        ['学段', resource.stages.map(stageLabel).join('、')],
        ['类型', resource.formats.map(formatLabel).join('、')],
        ['语言', resource.languages.map(languageLabel).join('、')]
    ]

    return (
        <div className={styles.root} data-kb-route="learning-resource-detail">
            <PageHero
                crumbs={[{ to: '/learning-resources', label: '学习资源' }, { label: resource.provider }]}
                title={resource.title_zh}
                long={resource.title_zh.length > 14}
                lede={hasDistinctOriginal(resource) ? resource.title_original : undefined}
                color={SUBJECT_COLORS[resource.subjects[0]]}
                actions={(
                    <>
                        <OpenOriginalLink resource={resource} />
                        <Chip to="/learning-resources">返回资源目录</Chip>
                    </>
                )}
            >
                <ResourceBadges resource={resource} className={styles.heroBadges} />
            </PageHero>

            <div className={`${kb.wrap} ${styles.layout}`}>
                <div className={styles.main}>
                    <section className={styles.block} aria-labelledby="lr-summary">
                        <SectionHead kicker="简介" title="这是什么" size="sm" id="lr-summary" />
                        <p className={styles.prose}>{resource.summary_zh}</p>
                    </section>

                    <section className={styles.block} aria-labelledby="lr-how">
                        <SectionHead kicker="课堂用法" title="怎么用" size="sm" id="lr-how" />
                        <p className={styles.prose}>{resource.how_to_use_zh}</p>
                    </section>

                    <section className={styles.block} aria-labelledby="lr-standards">
                        <SectionHead kicker={`对应课标 · ${resource.standards.length} 条`} title="对应的课程标准" size="sm" id="lr-standards" />
                        <ol className={`${kb.list} ${styles.standards}`}>
                            {resource.standards.map(item => (
                                <li key={item.code} style={{ '--c': SUBJECT_COLORS[item.subject] }}>
                                    <Link to={`/standards/${item.code}`} className={styles.standardLink}>
                                        <span className={styles.code}><i aria-hidden="true" />{item.code}</span>
                                        <span className={styles.standardTitle}>{item.standard_title}</span>
                                        <span className={styles.standardMeta}>{subjectLabel(item.subject)} · {stageLabel(item.stage)}</span>
                                    </Link>
                                    <p className={styles.rationale}>{item.rationale_zh}</p>
                                </li>
                            ))}
                        </ol>
                    </section>
                </div>

                <aside className={`${kb.panel} ${styles.aside}`} aria-labelledby="lr-source">
                    <p className={kb.kicker} id="lr-source">来源与许可</p>
                    <dl className={styles.facts}>
                        <div><dt>提供方</dt><dd>{resource.provider}</dd></div>
                        <div>
                            <dt>许可</dt>
                            <dd>
                                <a href={resource.license_url} target="_blank" rel="noopener noreferrer">{licenseLabel(resource.license)} ↗</a>
                                <small>{OPEN_LEVEL_LABELS[resource.open_level]}</small>
                            </dd>
                        </div>
                        <div>
                            <dt>国内访问</dt>
                            <dd>
                                {accessLabel(resource.china_access)}
                                <small>{ACCESS_NOTES[resource.china_access]}检测于 {resource.checked_at}。</small>
                            </dd>
                        </div>
                        {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                    </dl>
                    <div className={styles.attribution}>
                        <p className={kb.label}>引用署名</p>
                        <p>《{resource.title_original}》，{resource.provider}，{licenseLabel(resource.license)}。</p>
                    </div>
                    <OpenOriginalLink resource={resource} className={styles.asideOpen} />
                </aside>
            </div>
        </div>
    )
}
