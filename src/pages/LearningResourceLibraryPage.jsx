import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { loadLearningResourceCatalog, SUBJECT_COLORS } from '../data/dataLoader'
import { ErrorState, PageLoading } from '../components/StateComponents'
import { learningResourcesMeta } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import { Chip, PageHero, Pill, Seg, kb } from '../components/kb'
import ResourceBadges, { OpenOriginalLink } from '../features/learning-resources/ResourceBadges'
import { loadPlatforms } from '../features/learning-resources/platforms'
import {
    FORMAT_LABELS,
    STAGE_LABELS,
    SUBJECT_LABELS,
    formatLabel,
    stageLabel,
    hasDistinctOriginal,
    subjectLabel
} from '../features/learning-resources/labels'
import styles from './LearningResourceLibraryPage.module.css'

const STANDARD_CHIP_LIMIT = 4

function matches(resource, { subject, stage, format, reachable, keyword }) {
    if (subject && !resource.subjects.includes(subject)) return false
    if (stage && !resource.stages.includes(stage)) return false
    if (format && !resource.formats.includes(format)) return false
    if (reachable && resource.china_access === 'blocked') return false
    if (!keyword) return true
    return [
        resource.title_zh,
        resource.title_original,
        resource.provider,
        resource.summary_zh,
        ...resource.standards.flatMap(item => [item.code, item.standard_title])
    ].join(' ').toLocaleLowerCase('zh-CN').includes(keyword)
}

function ResourceRow({ resource, index }) {
    const extraStandards = resource.standards.length - STANDARD_CHIP_LIMIT
    return (
        <li className={styles.row}>
            <span className={styles.index} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <article className={styles.body} aria-labelledby={`lr-${resource.id}`}>
                <p className={styles.meta}>
                    <span>{resource.provider}</span>
                    <span>{resource.formats.map(formatLabel).join(' · ')}</span>
                    <span>{resource.stages.map(stageLabel).join('、')}</span>
                </p>
                <h2 className={styles.title} id={`lr-${resource.id}`}>
                    <Link to={`/learning-resources/${resource.id}`}>{resource.title_zh}</Link>
                </h2>
                {hasDistinctOriginal(resource) && <p className={styles.original}>{resource.title_original}</p>}
                <ResourceBadges resource={resource} className={styles.badges} />
                <p className={styles.summary}>{resource.summary_zh}</p>
                <div className={styles.standards} aria-label="对应课标">
                    {resource.standards.slice(0, STANDARD_CHIP_LIMIT).map(item => (
                        <Chip
                            key={item.code}
                            to={`/standards/${item.code}`}
                            small
                            dot
                            color={SUBJECT_COLORS[item.subject]}
                            className={styles.standardChip}
                            title={`${item.code} ${item.standard_title}`}
                        >
                            <code>{item.code}</code>
                            <span>{item.standard_title}</span>
                        </Chip>
                    ))}
                    {extraStandards > 0 && (
                        <Link className={styles.more} to={`/learning-resources/${resource.id}`}>另有 {extraStandards} 条</Link>
                    )}
                </div>
            </article>
            <div className={styles.actions}>
                <OpenOriginalLink resource={resource} />
                <Link className={styles.detail} to={`/learning-resources/${resource.id}`}>
                    详情<span className="sr-only">：{resource.title_zh}</span>
                </Link>
            </div>
        </li>
    )
}

const SUBJECT_NAMES = { chinese: '语文', math: '数学', english: '英语', morality_law: '道德与法治', science: '科学', physics: '物理', chemistry: '化学', biology: '生物学', history: '历史', geography: '地理', it: '信息科技', pe: '体育与健康', arts: '艺术', labor: '劳动' }

// Official and public-interest platforms that open in mainland China, listed before the curated (mostly overseas) items.
function PlatformList() {
    const [platforms, setPlatforms] = useState([])
    useEffect(() => { loadPlatforms().then(data => setPlatforms(data.platforms || [])) }, [])
    if (!platforms.length) return null
    return (
        <section className={`${kb.wrap} ${styles.platforms}`} aria-labelledby="lr-platforms-title">
            <h2 id="lr-platforms-title" className={styles.resultsTitle}>国内官方平台 <small>{platforms.length} 个，直接访问</small></h2>
            <ul className={styles.platformGrid}>
                {platforms.map(platform => {
                    const subjects = [...new Set(platform.match.flatMap(rule => rule.subjects))]
                    return (
                        <li key={platform.id}>
                            <a href={platform.url} target="_blank" rel="noopener noreferrer"><b>{platform.title}</b> ↗</a>
                            <span>{platform.provider} · {platform.cost}</span>
                            <p>{platform.summary}</p>
                            <p className={styles.platformUse}>{platform.how_to_use}</p>
                            <span className={styles.platformSubjects}>{subjects.length >= 10 ? '全部学科' : subjects.map(slug => SUBJECT_NAMES[slug] || slug).join(' · ')}</span>
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}

export default function LearningResourceLibraryPage() {
    const [catalog, setCatalog] = useState(null)
    usePageMeta(catalog ? learningResourcesMeta({ resourceCount: catalog.resources.length }) : null)
    const [error, setError] = useState(null)
    const [searchParams, setSearchParams] = useSearchParams()
    const [query, setQuery] = useState(searchParams.get('q') || '')

    useEffect(() => {
        loadLearningResourceCatalog().then(setCatalog).catch(setError)
    }, [])

    const filters = {
        subject: SUBJECT_LABELS[searchParams.get('subject')] ? searchParams.get('subject') : '',
        stage: STAGE_LABELS[searchParams.get('stage')] ? searchParams.get('stage') : '',
        format: FORMAT_LABELS[searchParams.get('format')] ? searchParams.get('format') : '',
        reachable: searchParams.get('access') === 'cn',
        keyword: query.trim().toLocaleLowerCase('zh-CN')
    }

    const setFilter = (key, value) => {
        const next = new URLSearchParams(searchParams)
        if (value) next.set(key, value)
        else next.delete(key)
        setSearchParams(next, { replace: true })
    }

    const updateQuery = value => {
        setQuery(value)
        setFilter('q', value.trim())
    }

    if (error) return <ErrorState title="学习资源暂时不可用" message={error.message} />
    if (!catalog) return <PageLoading message="正在打开学习资源库" />

    const all = catalog.resources
    const resources = all.filter(resource => matches(resource, filters))
    const reachableCount = all.filter(resource => resource.china_access !== 'blocked').length
    const formatsInUse = Object.keys(FORMAT_LABELS).filter(format => all.some(resource => resource.formats.includes(format)))
    const hasFilters = filters.subject || filters.stage || filters.format || filters.reachable || filters.keyword

    return (
        <div className={styles.root} data-kb-route="learning-resources">
            <PageHero
                kicker="学习资源 · 精选开放资源目录"
                title="学习资源"
                lede="从全球开放教育资源中挑出适合义务教育课堂的条目，逐条核对许可、写好中文简介、标注对应课标。点击即跳转原站，本站不转载正文。"
                stats={[
                    { value: catalog.counts.resources, label: '项精选资源' },
                    { value: catalog.counts.standards, label: '条课标有对应' },
                    { value: reachableCount, label: '项国内可访问' }
                ]}
            />

            <PlatformList />

            <section className={styles.filters} aria-label="筛选学习资源">
                <div className={`${kb.wrap} ${styles.filterInner}`}>
                    <label className={styles.search}>
                        <span className="sr-only">搜索学习资源</span>
                        <input
                            type="search"
                            value={query}
                            onChange={event => updateQuery(event.target.value)}
                            placeholder="搜索资源、提供方或课标编码"
                        />
                    </label>
                    <div className={styles.filterRow}>
                        <span className={kb.label}>学科</span>
                        <div className={styles.scroller} role="group" aria-label="按学科筛选">
                            <Pill pressed={!filters.subject} onClick={() => setFilter('subject', '')}>全部</Pill>
                            {Object.keys(SUBJECT_LABELS).map(subject => (
                                <Pill
                                    key={subject}
                                    pressed={filters.subject === subject}
                                    onClick={() => setFilter('subject', filters.subject === subject ? '' : subject)}
                                    color={SUBJECT_COLORS[subject]}
                                    dot
                                >
                                    {subjectLabel(subject)}
                                    <span className={styles.count}>{catalog.counts.by_subject[subject] || 0}</span>
                                </Pill>
                            ))}
                        </div>
                    </div>
                    <div className={styles.filterRow}>
                        <span className={kb.label}>学段</span>
                        <div className={styles.scroller}>
                            <Seg
                                label="按学段筛选"
                                value={filters.stage}
                                onChange={value => setFilter('stage', value)}
                                options={[{ value: '', label: '全部' }, ...Object.entries(STAGE_LABELS).map(([value, label]) => ({ value, label }))]}
                            />
                        </div>
                    </div>
                    <div className={styles.filterRow}>
                        <span className={kb.label}>类型</span>
                        <div className={styles.scroller} role="group" aria-label="按资源类型筛选">
                            <Pill pressed={!filters.format} onClick={() => setFilter('format', '')}>全部</Pill>
                            {formatsInUse.map(format => (
                                <Pill
                                    key={format}
                                    pressed={filters.format === format}
                                    onClick={() => setFilter('format', filters.format === format ? '' : format)}
                                >
                                    {formatLabel(format)}
                                </Pill>
                            ))}
                        </div>
                    </div>
                    <div className={styles.filterRow}>
                        <span className={kb.label}>访问</span>
                        <div className={styles.scroller}>
                            <Pill pressed={filters.reachable} onClick={() => setFilter('access', filters.reachable ? '' : 'cn')}>
                                只看国内可访问
                                <span className={styles.count}>{reachableCount}</span>
                            </Pill>
                        </div>
                    </div>
                </div>
            </section>

            <section className={`${kb.wrap} ${styles.results}`} aria-labelledby="lr-results-title">
                <div className={styles.resultsHead}>
                    <h2 id="lr-results-title" className={styles.resultsTitle}>
                        <b>{resources.length}</b> 项资源
                    </h2>
                    <p className={styles.note}>
                        “国内可访问”是本站在中国大陆网络下的实测结果，每条资源的检测日期见详情页。
                    </p>
                </div>
                {resources.length ? (
                    <ol className={kb.list}>
                        {resources.map((resource, index) => <ResourceRow key={resource.id} resource={resource} index={index} />)}
                    </ol>
                ) : (
                    <div className={styles.empty}>
                        <p>没有符合条件的资源。</p>
                        {hasFilters && (
                            <button type="button" className={styles.clear} onClick={() => { setQuery(''); setSearchParams({}, { replace: true }) }}>
                                清除全部筛选
                            </button>
                        )}
                    </div>
                )}
            </section>
        </div>
    )
}
