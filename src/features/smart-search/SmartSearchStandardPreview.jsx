import { Link } from 'react-router-dom'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/csr/ArrowSquareOut'
import { BookmarkSimpleIcon } from '@phosphor-icons/react/dist/csr/BookmarkSimple'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { Button, Dialog, Heading, Modal, ModalOverlay } from '../../ui/primitives/dialog.jsx'
import Marked from './Marked.jsx'
import { PROVENANCE_LABELS, subjectColor } from './smartSearchModel.js'
import styles from './SmartSearchStandardPreview.module.css'

const REVIEW_LABELS = {
    human_reviewed: '已人工复核',
    machine_checked: '已机器检查',
    unreviewed: '未经人工复核'
}

function ContentSection({ title, value, metadata, terms, prominent = false }) {
    if (!value) return null
    const quarantined = Boolean(metadata?.quality_flags?.length)
    return (
        <section className={`${styles.section} ${prominent ? styles.prominent : ''}`}>
            <div className={styles.sectionHead}>
                <h3>{title}</h3>
                <span className={styles.source} data-provenance={metadata?.provenance} data-quality-risk={quarantined || undefined}>
                    {PROVENANCE_LABELS[metadata?.provenance] || '来源待确认'}
                </span>
            </div>
            {quarantined ? (
                <p className={styles.quality} role="note">内容暂缓展示：检测到文本截断、OCR 残片或占位内容，请在完整标准页复核来源。</p>
            ) : <p><Marked text={value} terms={terms} /></p>}
            {metadata ? (
                <small>
                    {REVIEW_LABELS[metadata.review_status] || '复核状态待确认'}
                    {metadata.source_ref?.section ? ` · ${metadata.source_ref.section}` : ''}
                </small>
            ) : null}
        </section>
    )
}

function displayTitle(standard, code) {
    const candidate = String(standard.standard_title || '').trim()
    if (candidate && candidate.length <= 32 && !candidate.includes('...') && !candidate.includes('…')) return candidate
    const fullText = String(standard.standard || '').trim()
    return fullText.split(/[；。]/u).map(part => part.trim()).find(Boolean) || candidate || code
}

/** The search result already carries the standard's public record, so the drawer opens without a network request. */
function SmartSearchStandardPreview({ item, isOpen, saved, onSave, onClose }) {
    const code = item.code
    const standard = item.standard || {}
    const provenance = standard.field_provenance || {}
    const terms = item.matched_concepts || []
    const classification = [standard.subject, standard.grade || standard.grade_range, standard.domain, standard.subdomain].filter(Boolean)
    const skills = [...new Set([...(standard.ts_primary || []), ...(standard.ts_secondary || [])])]
    const sourceDocument = provenance.standard?.source_ref?.document

    return (
        <ModalOverlay
            className={styles.overlay}
            isDismissable
            isOpen={isOpen}
            onOpenChange={open => { if (!open) onClose() }}
        >
            <Modal className={styles.modal} data-standard-preview={code} style={{ '--c': subjectColor(standard.subject_slug) }}>
                <Dialog className={styles.dialog}>
                    <header className={styles.header}>
                        <p className={styles.kicker}><i aria-hidden="true" />标准预览 · <code>{code}</code></p>
                        <Button autoFocus className={styles.close} onPress={onClose} aria-label="关闭标准预览">
                            <XIcon size={18} aria-hidden="true" />
                        </Button>
                    </header>

                    <div className={styles.body} role="region" aria-label="标准详情内容" tabIndex={0}>
                        <ul className={styles.classification} aria-label="标准分类">
                            {classification.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}
                        </ul>
                        <Heading slot="title" className={styles.title}>{displayTitle(standard, code)}</Heading>
                        {sourceDocument ? <p className={styles.document}>{sourceDocument}</p> : null}

                        <ContentSection title="标准正文" value={standard.standard} metadata={provenance.standard} terms={terms} prominent />
                        <ContentSection title="情境说明" value={standard.context} metadata={provenance.context} terms={terms} />
                        <ContentSection title="实践建议" value={standard.practice} metadata={provenance.practice} terms={terms} />
                        <ContentSection title="教学提示" value={standard.teaching_tip} metadata={provenance.teaching_tip} terms={terms} />
                        <ContentSection title="评价证据" value={standard.assessment_evidence_type} metadata={provenance.assessment_evidence_type} terms={terms} />

                        {skills.length ? (
                            <section className={styles.section}>
                                <h3>可迁移技能关联</h3>
                                <ul className={styles.skills}>{skills.map(skill => <li key={skill}>{skill}</li>)}</ul>
                            </section>
                        ) : null}
                    </div>

                    <footer className={styles.footer}>
                        <Button className={styles.save} onPress={() => onSave(code)} isDisabled={saved}>
                            <BookmarkSimpleIcon size={18} weight={saved ? 'fill' : 'regular'} aria-hidden="true" />
                            {saved ? '已加入清单' : '加入清单'}
                        </Button>
                        <Link className={styles.full} to={`/standards/${code}`}>
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
