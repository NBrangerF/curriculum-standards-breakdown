import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { PrinterIcon } from '@phosphor-icons/react/dist/csr/Printer'
import { SlidersHorizontalIcon } from '@phosphor-icons/react/dist/csr/SlidersHorizontal'
import { getCollection } from '../data/collections'
import { GRADE_BANDS, loadStandardByCode } from '../data/dataLoader'
import { EmptyState, ErrorState, LoadingState } from '../components/StateComponents'
import styles from './PrintPage.module.css'

const PRINT_OPTIONS = [
    ['context', '包含情境说明'],
    ['practice', '包含实践建议'],
    ['tips', '包含教学提示'],
    ['assessment', '包含评价证据']
]

function PrintPage() {
    const [searchParams] = useSearchParams()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [standards, setStandards] = useState([])
    const [title, setTitle] = useState('课程标准')
    const [options, setOptions] = useState({ context: true, practice: true, tips: false, assessment: false })

    useEffect(() => {
        let cancelled = false
        async function loadData() {
            setLoading(true)
            setError('')
            try {
                const collectionId = searchParams.get('collection')
                const codesParam = searchParams.get('codes')
                let codes = []
                let nextTitle = '课程标准'

                if (collectionId) {
                    const collection = getCollection(collectionId)
                    if (!collection) throw new Error('无法找到要打印的清单')
                    nextTitle = collection.name
                    codes = collection.standardCodes
                } else if (codesParam) {
                    codes = codesParam.split(',').map(code => code.trim()).filter(Boolean)
                    nextTitle = `${codes.length} 条课程标准`
                }

                const loaded = (await Promise.all(codes.map(code => loadStandardByCode(code)))).filter(Boolean)
                if (cancelled) return
                setTitle(nextTitle)
                setStandards(loaded)
            } catch (loadError) {
                if (!cancelled) setError(loadError.message)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        loadData()
        return () => { cancelled = true }
    }, [searchParams])

    if (loading) {
        return <div className={styles.root}><div className={`${styles.loading} ${styles.noPrint}`}><LoadingState message="准备打印内容" /></div></div>
    }

    if (error) {
        return (
            <div className={styles.root}><div className={`${styles.loading} ${styles.noPrint}`}><ErrorState title="无法生成打印预览" message={error} /></div></div>
        )
    }

    return (
        <div className={styles.root} data-kb-route="print">
            <aside className={`${styles.controls} ${styles.noPrint}`} aria-labelledby="print-preview-title">
                <div className={styles.controlsInner}>
                    <div className={styles.controlsTitle}>
                        <Link to="/collections"><ArrowLeftIcon size={17} aria-hidden="true" />返回清单</Link>
                        <span><SlidersHorizontalIcon size={18} aria-hidden="true" />PRINT OPTIONS</span>
                        <h1 id="print-preview-title">打印预览</h1>
                    </div>
                    <fieldset>
                        <legend>内容字段</legend>
                        <div className={styles.optionGrid}>
                            {PRINT_OPTIONS.map(([key, label]) => (
                                <label key={key}>
                                    <input
                                        type="checkbox"
                                        checked={options[key]}
                                        onChange={event => setOptions(previous => ({ ...previous, [key]: event.target.checked }))}
                                    />
                                    <span>{label}</span>
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    <button type="button" className={`btn btn-primary ${styles.action}`} onClick={() => window.print()} disabled={!standards.length}>
                        <PrinterIcon size={18} aria-hidden="true" />打印 {standards.length} 条标准
                    </button>
                </div>
            </aside>

            <main className={styles.content} aria-label="打印内容预览">
                <header className={styles.header}>
                    <span>KEBIAO / CURRICULUM STANDARDS</span>
                    <h2>{title}</h2>
                    <dl>
                        <div><dt>标准数量</dt><dd>{standards.length}</dd></div>
                        <div><dt>打印日期</dt><dd data-kb-field="print-date">{new Date().toLocaleDateString()}</dd></div>
                        <div><dt>来源</dt><dd>义务教育课程标准（2022年版）</dd></div>
                    </dl>
                </header>

                {!standards.length ? (
                    <EmptyState title="没有可打印的标准" message="请从清单详情选择打印，或在 URL 中提供课程标准代码。" />
                ) : (
                    <div className={styles.standards}>
                        {standards.map((standard, index) => (
                            <article key={standard.code} className={styles.standard}>
                                <header className={styles.standardHeader}>
                                    <span className={styles.number}>{String(index + 1).padStart(2, '0')}</span>
                                    <code>{standard.code}</code>
                                    <div>
                                        <span>{standard.subject}</span>
                                        <span>{GRADE_BANDS[standard.grade_band]?.label || standard.grade_band}</span>
                                    </div>
                                </header>
                                <dl className={styles.standardMeta}>
                                    <div><dt>领域</dt><dd>{standard.domain}</dd></div>
                                    {standard.subdomain ? <div><dt>子领域</dt><dd>{standard.subdomain}</dd></div> : null}
                                </dl>
                                <p className={styles.standardText}>{standard.standard}</p>

                                {standard.ts_primary?.length ? (
                                    <p className={styles.skills}>可迁移技能：{[...standard.ts_primary, ...(standard.ts_secondary || [])].join('、')}</p>
                                ) : null}

                                <div className={styles.details}>
                                    {options.context && standard.context ? <section><h3>情境说明</h3><p>{standard.context}</p></section> : null}
                                    {options.practice && standard.practice ? <section><h3>实践建议</h3><p>{standard.practice}</p></section> : null}
                                    {options.tips && standard.teaching_tip ? <section><h3>教学提示</h3><p>{standard.teaching_tip}</p></section> : null}
                                    {options.assessment && standard.assessment_evidence_type ? <section><h3>评价证据</h3><p>{standard.assessment_evidence_type}</p></section> : null}
                                </div>
                            </article>
                        ))}
                    </div>
                )}

                <footer className={styles.footer}>kebiao · 仅供教学与研究参考，请以官方发布文本为准</footer>
            </main>
        </div>
    )
}

export default PrintPage
