const H4G_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])
const APPROVED_REVIEW_STATUSES = new Set([
    'grade_differentiation_approved',
    'manual_grade_differentiation_approved',
    'manual_review_approved',
    'unit_evidence_approved',
    'unit_evidence_reviewed',
    'publication_approved',
    'source_aligned_standard_rewrite_v2_published'
])

function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim()
}

export function isH4GStandard(standard) {
    return H4G_GRADE_BANDS.has(standard?.grade_band)
}

export function isPlaceholderGradeFocus(value) {
    const text = normalizeText(value)
    return !text ||
        text.startsWith('待基于') ||
        text.includes('待基于') ||
        (text.includes('补充本年级专属学习重点') && !text.startsWith('候选：'))
}

export function hasH4GUnitLevelEvidence(standard) {
    const evidence = [
        ...(Array.isArray(standard?.textbook_unit_evidence) ? standard.textbook_unit_evidence : []),
        ...(Array.isArray(standard?.textbook_evidence) ? standard.textbook_evidence : [])
    ]
    const hasUnitEvidenceIds = Array.isArray(standard?.textbook_unit_evidence_ids) && standard.textbook_unit_evidence_ids.length > 0
    return evidence.some(item => (
        item.unit_evidence_id ||
        item.unit_title ||
        item.chapter_title ||
        item.section_title ||
        item.page_range ||
        item.page_start ||
        item.matched_keywords?.length
    )) || (standard?.evidence_granularity === 'textbook_unit_level' && hasUnitEvidenceIds)
}

export function isH4GReviewApproved(standard) {
    return APPROVED_REVIEW_STATUSES.has(String(standard?.review_status || ''))
}

export function getH4GDifferentiationState(standard) {
    const isH4G = isH4GStandard(standard)
    const gradeFocus = normalizeText(standard?.grade_specific_focus)
    const hasUsableGradeFocus = isH4G && !isPlaceholderGradeFocus(gradeFocus)
    const hasUnitLevelEvidence = isH4G && hasH4GUnitLevelEvidence(standard)
    const reviewStatus = String(standard?.review_status || '')
    const rewriteStatus = String(standard?.source_aligned_rewrite_status || '')
    const isSourceAlignedPublished = isH4G && (
        reviewStatus === 'source_aligned_standard_rewrite_v2_published' ||
        rewriteStatus === 'v2_published_to_public_preview' ||
        standard?.published_from_source_aligned_candidate === true
    )
    const reviewApproved = isH4G && (isH4GReviewApproved(standard) || isSourceAlignedPublished)
    const isCandidate = hasUsableGradeFocus && hasUnitLevelEvidence && !reviewApproved
    const isFinalReady = isSourceAlignedPublished || (hasUsableGradeFocus && hasUnitLevelEvidence && reviewApproved)
    const isSharedSource = isH4G && (
        standard?.standard_variant_type === 'same_source_shared' ||
        standard?.source_standard_scope === 'stage_shared_7_9' ||
        reviewStatus.includes('needs_grade_differentiation')
    )
    const needsDifferentiation = isH4G && !isFinalReady && isSharedSource

    let statusLabel = ''
    if (isSourceAlignedPublished) statusLabel = '已发布'
    else if (isFinalReady) statusLabel = '已年级化'
    else if (isCandidate) statusLabel = '候选待复核'
    else if (needsDifferentiation) statusLabel = '共同课标待细分'

    let focusLabel = ''
    if (isSourceAlignedPublished) focusLabel = '年级化说明'
    else if (isFinalReady) focusLabel = '本年级学习重点'
    else if (isCandidate) focusLabel = '本年级学习重点候选'
    else if (isH4G) focusLabel = '年级化状态'

    const statusMessage = isSourceAlignedPublished
        ? '已按审核通过的 Source-Aligned Candidate 发布为年级化课标。'
        : isH4G
        ? '当前仍是 7-9 共同课标原文，待基于教材单元/章节补充本年级学习重点。'
        : ''
    const shouldLeadWithGradeFocus = hasUsableGradeFocus && !isSourceAlignedPublished
    const showGradeLens = isH4G && !isSourceAlignedPublished

    return {
        isH4G,
        isSharedSource,
        isSourceAlignedPublished,
        hasUsableGradeFocus,
        hasUnitLevelEvidence,
        reviewApproved,
        isCandidate,
        isFinalReady,
        needsDifferentiation,
        shouldLeadWithGradeFocus,
        showGradeLens,
        gradeFocus,
        statusLabel,
        focusLabel,
        statusMessage,
        sourceTextLabel: isSharedSource ? '7-9 共同课标原文' : '课标原文'
    }
}
