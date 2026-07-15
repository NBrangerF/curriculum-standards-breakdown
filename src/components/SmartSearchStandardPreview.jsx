import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/csr/ArrowSquareOut'
import { BookmarkSimpleIcon } from '@phosphor-icons/react/dist/csr/BookmarkSimple'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { loadStandardByCode } from '../data/dataLoader'
import { Button, Dialog, Heading, Modal, ModalOverlay } from '../ui/primitives/dialog.jsx'
import styles from './SmartSearchStandardPreview.module.css'

gsap.registerPlugin(useGSAP)

const previewCache = new Map()

const PROVENANCE_LABELS = {
    official: '课标原文',
    extracted: '课标章节抽取',
    editorial: 'kebiao 结构化整理',
    rule_generated: '规则生成',
    ai_generated: 'AI 生成'
}

const REVIEW_LABELS = {
    human_reviewed: '已人工复核',
    machine_checked: '已机器检查',
    unreviewed: '未经人工复核'
}

function requestStandard(code) {
    const normalizedCode = String(code || '').trim()
    if (!normalizedCode) return Promise.resolve(null)
    if (!previewCache.has(normalizedCode)) {
        const request = loadStandardByCode(normalizedCode).catch(error => {
            previewCache.delete(normalizedCode)
            throw error
        })
        previewCache.set(normalizedCode, request)
    }
    return previewCache.get(normalizedCode)
}

export function prefetchStandardPreview(code) {
    return requestStandard(code).catch(() => null)
}

function SourceBadge({ metadata }) {
    if (!metadata) return <span className={styles.sourceBadge}>来源待确认</span>
    const hasQualityRisk = Boolean(metadata.quality_flags?.length)
    return (
        <span className={styles.sourceBadge} data-provenance={metadata.provenance} data-quality-risk={hasQualityRisk || undefined}>
            {PROVENANCE_LABELS[metadata.provenance] || '来源待确认'}
        </span>
    )
}

function ContentSection({ title, value, metadata, prominent = false }) {
    if (!value) return null
    const qualityFlags = metadata?.quality_flags || []
    const quarantined = qualityFlags.length > 0
    return (
        <section className={`${styles.contentSection} ${prominent ? styles.prominent : ''}`}>
            <div className={styles.contentHeading}>
                <h3>{title}</h3>
                <SourceBadge metadata={metadata} />
            </div>
            {quarantined ? (
                <div className={styles.qualityWarning} role="note">
                    <strong>内容暂缓展示</strong>
                    <span>检测到文本截断、OCR 残片或占位内容；请在完整标准页复核来源。</span>
                </div>
            ) : <p>{value}</p>}
            {metadata ? (
                <small className={styles.sourceLine}>
                    {REVIEW_LABELS[metadata.review_status] || '复核状态待确认'}
                    {metadata.source_ref?.section ? ` · ${metadata.source_ref.section}` : ''}
                </small>
            ) : null}
        </section>
    )
}

function getDisplayTitle(standard) {
    const candidate = String(standard.standard_title || '').trim()
    if (candidate && candidate.length <= 32 && !candidate.includes('...') && !candidate.includes('…')) return candidate
    const fullText = String(standard.standard || '').trim()
    return fullText.split(/[；。]/u).map(part => part.trim()).find(Boolean) || candidate || standard.code
}

function SmartSearchStandardPreview({ item, saved, onSave, onClose }) {
    const code = item.code
    const fallbackStandard = item.standard || {}
    const [record, setRecord] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const overlayRef = useRef(null)
    const panelRef = useRef(null)
    const closingRef = useRef(false)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError('')
        requestStandard(code)
            .then(standard => {
                if (cancelled) return
                if (!standard) setError(`找不到标准 ${code} 的完整记录。`)
                setRecord(standard)
            })
            .catch(loadError => {
                if (!cancelled) setError(loadError.message || '标准详情加载失败。')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => { cancelled = true }
    }, [code])

    useGSAP(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
        const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
        timeline
            .fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.22 })
            .fromTo(panelRef.current, { xPercent: 100 }, { xPercent: 0, duration: 0.42 }, '<')
        return () => timeline.kill()
    }, { dependencies: [code] })

    const requestClose = useCallback(() => {
        if (closingRef.current) return
        closingRef.current = true
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            onClose()
            return
        }
        const timeline = gsap.timeline({ onComplete: onClose })
        timeline
            .to(panelRef.current, { xPercent: 100, duration: 0.26, ease: 'power3.in' })
            .to(overlayRef.current, { opacity: 0, duration: 0.18, ease: 'power2.in' }, '<')
    }, [onClose])

    const standard = record || fallbackStandard
    const title = getDisplayTitle(standard)
    const fieldProvenance = standard.field_provenance || {}
    const classification = [standard.subject, standard.grade || standard.grade_range, standard.domain, standard.subdomain].filter(Boolean)
    const skills = useMemo(() => [...new Set([...(standard.ts_primary || []), ...(standard.ts_secondary || [])])], [standard.ts_primary, standard.ts_secondary])
    const sourceDocument = fieldProvenance.standard?.source_ref?.document

    return (
        <ModalOverlay
            ref={overlayRef}
            className={styles.overlay}
            isDismissable
            isOpen
            onOpenChange={isOpen => { if (!isOpen) requestClose() }}
        >
            <Modal ref={panelRef} className={styles.modal} data-standard-preview={code}>
                <Dialog className={styles.dialog}>
                    <header className={styles.header}>
                        <div>
                            <span className={styles.kicker}>标准快速预览</span>
                            <span className={styles.code}>{code}</span>
                        </div>
                        <Button autoFocus className={styles.closeButton} onPress={requestClose} aria-label="关闭标准预览">
                            <XIcon size={20} aria-hidden="true" />
                        </Button>
                    </header>

                    <div className={styles.body} role="region" aria-label="标准详情内容" tabIndex={0}>
                        <div className={styles.identity}>
                            <div className={styles.classification} aria-label="标准分类">
                                {classification.map((value, index) => <span key={`${value}-${index}`}>{value}</span>)}
                            </div>
                            <Heading slot="title" className={styles.title}>{title}</Heading>
                            {sourceDocument ? <p className={styles.document}>{sourceDocument}</p> : null}
                        </div>

                        {loading ? <p className={styles.loading} role="status"><span />正在读取完整标准记录…</p> : null}
                        {error ? <p className={styles.error} role="alert">{error} 当前先展示检索结果中的摘要。</p> : null}

                        <ContentSection title="标准正文" value={standard.standard} metadata={fieldProvenance.standard} prominent />
                        <ContentSection title="情境说明" value={standard.context} metadata={fieldProvenance.context} />
                        <ContentSection title="实践建议" value={standard.practice} metadata={fieldProvenance.practice} />
                        <ContentSection title="教学提示" value={standard.teaching_tip} metadata={fieldProvenance.teaching_tip} />
                        <ContentSection title="评价证据" value={standard.assessment_evidence_type} metadata={fieldProvenance.assessment_evidence_type} />

                        {skills.length ? (
                            <section className={styles.skillSection}>
                                <h3>可迁移技能关联</h3>
                                <div>{skills.map(skill => <span key={skill}>{skill}</span>)}</div>
                            </section>
                        ) : null}
                    </div>

                    <footer className={styles.footer}>
                        <Button className={styles.saveButton} onPress={() => onSave(code)} isDisabled={saved}>
                            <BookmarkSimpleIcon size={18} weight={saved ? 'fill' : 'regular'} aria-hidden="true" />
                            {saved ? '已加入清单' : '加入清单'}
                        </Button>
                        <Link className={styles.fullLink} to={`/standards/${code}`}>
                            打开完整标准页面
                            <ArrowSquareOutIcon size={18} aria-hidden="true" />
                        </Link>
                    </footer>
                </Dialog>
            </Modal>
        </ModalOverlay>
    )
}

export default SmartSearchStandardPreview
