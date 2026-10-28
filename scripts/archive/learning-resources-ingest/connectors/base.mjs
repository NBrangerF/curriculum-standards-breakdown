import { cleanText, sha256, stableId } from '../lib/canonical.mjs'

const LICENSES = {
  'CC-BY-4.0': {
    url: 'https://creativecommons.org/licenses/by/4.0/',
    derivatives: true,
    commercial: true,
    shareAlike: false,
    decision: 'publish_translation'
  },
  'CC-BY-3.0': {
    url: 'https://creativecommons.org/licenses/by/3.0/',
    derivatives: true,
    commercial: true,
    shareAlike: false,
    decision: 'publish_translation'
  },
  'CC-BY-SA-4.0': {
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    derivatives: true,
    commercial: true,
    shareAlike: true,
    decision: 'publish_translation_share_alike'
  },
  'CC-BY-SA-2.5': {
    url: 'https://creativecommons.org/licenses/by-sa/2.5/',
    derivatives: true,
    commercial: true,
    shareAlike: true,
    decision: 'publish_translation_share_alike'
  },
  'OGL-3.0': {
    url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    derivatives: true,
    commercial: true,
    shareAlike: false,
    decision: 'publish_translation'
  }
}

function blockTypeForLine(line) {
  if (/^#{1,6}\s+/u.test(line)) return 'heading'
  if (/^\d+[.)]\s+/u.test(line)) return 'ordered_list'
  if (/^[-*+]\s+/u.test(line)) return 'unordered_list'
  if (/^>\s*/u.test(line)) return 'quotation'
  if (/^```/u.test(line)) return 'code'
  return 'paragraph'
}

function stripMarkdown(value) {
  return cleanText(value)
    .replace(/^---\n[\s\S]*?\n---\n?/u, '')
    .replace(/\{%[\s\S]*?%\}/gu, '')
    .replace(/\{\{[\s\S]*?\}\}/gu, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/`{1,3}([^`]+)`{1,3}/gu, '$1')
}

export function markdownToBlocks(markdown, { locator = '', language = 'en' } = {}) {
  const source = stripMarkdown(markdown)
  const chunks = source.split(/\n\s*\n/gu).map(cleanText).filter(Boolean)
  return chunks.map((chunk, index) => {
    const type = blockTypeForLine(chunk)
    const text = cleanText(chunk
      .replace(/^#{1,6}\s+/u, '')
      .replace(/^(?:[-*+]|\d+[.)])\s+/gmu, '')
      .replace(/^>\s?/gmu, ''))
    return {
      source_block_id: stableId('lrb', locator, index, text),
      type,
      text,
      source_hash: sha256(text),
      source_locator: locator ? `${locator}#block-${index + 1}` : null,
      language
    }
  }).filter(block => block.text)
}

export function splitStoryMarkdown(markdown, options = {}) {
  const clean = stripMarkdown(markdown)
  const pages = clean.split(/\n##\s*\n/gu).map(cleanText).filter(Boolean)
  return pages.map((page, index) => ({
    upstream_fragment_id: `page-${index + 1}`,
    fragment_type: index === 0 ? 'story_opening' : 'story_page',
    order: index,
    title: index === 0 ? page.replace(/^#\s+/u, '').split('\n')[0] : `第 ${index + 1} 页`,
    blocks: markdownToBlocks(page, {
      ...options,
      locator: `${options.locator || ''}#page-${index + 1}`
    })
  }))
}

export function titleFromMarkdown(markdown, fallback) {
  const frontmatter = String(markdown).match(/^---\n([\s\S]*?)\n---/u)?.[1] || ''
  const frontmatterTitle = frontmatter.match(/^title:\s*["']?(.+?)["']?\s*$/mu)?.[1]
  const heading = String(markdown).match(/^#\s+(.+)$/mu)?.[1]
  return cleanText(frontmatterTitle || heading || fallback)
}

export function createRightsProfile({ source, licenseId, creators = [], attributionText, scope = 'resource' }) {
  const license = LICENSES[licenseId]
  if (!license) throw new Error(`Unsupported or unresolved public license: ${licenseId}`)
  return {
    rights_profile_id: stableId('lrr', source.source_id, licenseId, scope),
    license_id: licenseId,
    license_url: license.url,
    rights_holder: source.name,
    creators: creators.map(cleanText).filter(Boolean),
    attribution_text: cleanText(attributionText || `${source.name}，${licenseId}`),
    derivatives_allowed: license.derivatives,
    commercial_use_allowed: license.commercial,
    share_alike_required: license.shareAlike,
    source_notice: '',
    third_party_exceptions: [],
    public_decision: license.decision,
    decision_reason: `来源或条目明确标注 ${licenseId}，允许生成简体中文改作。`,
    checked_at: new Date().toISOString(),
    policy_version: 'learning-resource-license-policy-v1'
  }
}

export function normalizeCandidate(candidate, context) {
  const { source, revision, retrievedAt = new Date().toISOString() } = context
  const resourceId = stableId('lr', source.source_id, candidate.upstream_id)
  const rights = createRightsProfile({
    source,
    licenseId: candidate.license_id || source.default_license_id,
    creators: candidate.creators,
    attributionText: candidate.attribution_text,
    scope: candidate.upstream_id
  })
  const rawFragments = candidate.fragments?.length ? candidate.fragments : [{
    upstream_fragment_id: 'main',
    fragment_type: candidate.resource_type || 'resource',
    order: 0,
    title: candidate.title,
    blocks: candidate.blocks
  }]
  const fragments = rawFragments.map((raw, index) => {
    const blocks = (raw.blocks || []).map((block, blockIndex) => ({
      ...block,
      source_block_id: block.source_block_id || stableId('lrb', resourceId, raw.upstream_fragment_id, blockIndex, block.text),
      source_hash: block.source_hash || sha256(cleanText(block.text)),
      language: block.language || candidate.source_language || source.default_language
    }))
    const sourceText = cleanText(blocks.map(block => block.text).join('\n\n'))
    return {
      fragment_id: stableId('lrf', resourceId, raw.upstream_fragment_id),
      resource_id: resourceId,
      upstream_fragment_id: raw.upstream_fragment_id,
      parent_fragment_id: null,
      fragment_type: raw.fragment_type || 'section',
      order: Number.isInteger(raw.order) ? raw.order : index,
      breadcrumb: [candidate.title, raw.title].filter(Boolean).map(cleanText),
      source_text: sourceText,
      source_text_hash: sha256(sourceText),
      source_locator: raw.source_locator || candidate.canonical_url,
      blocks,
      visual_dependency: raw.visual_dependency || candidate.visual_dependency || 'none',
      rights_profile_id: rights.rights_profile_id,
      attribution_id: stableId('lrat', source.source_id, candidate.upstream_id),
      license_scope: candidate.license_scope || 'resource',
      third_party_exception_refs: candidate.third_party_exception_refs || []
    }
  }).filter(fragment => fragment.blocks.length && fragment.source_text)

  if (!fragments.length) throw new Error(`Candidate ${candidate.upstream_id} produced no text fragments`)
  const sourcePayload = {
    title: candidate.title,
    revision,
    fragments: fragments.map(fragment => ({
      upstream_fragment_id: fragment.upstream_fragment_id,
      source_text_hash: fragment.source_text_hash
    }))
  }
  const sourceHash = sha256(sourcePayload)
  const resource = {
    resource_id: resourceId,
    resource_version_id: stableId('lrv', resourceId, sourcePayload),
    source_id: source.source_id,
    upstream_id: candidate.upstream_id,
    canonical_url: candidate.canonical_url,
    resource_type: candidate.resource_type || 'explanation',
    audience: candidate.audience || 'student',
    source_language: candidate.source_language || source.default_language,
    title_source: cleanText(candidate.title),
    source_curriculum: cleanText(candidate.source_curriculum || ''),
    source_subject: cleanText(candidate.source_subject || ''),
    source_grade_range: cleanText(candidate.source_grade_range || ''),
    mapped_subject_slugs: [...new Set(candidate.mapped_subject_slugs || [])],
    mapped_china_stage: candidate.mapped_china_stage || null,
    mapped_china_grade_scope: [...new Set(candidate.mapped_china_grade_scope || [])].sort((a, b) => a - b),
    mapping_method: candidate.mapping_method || 'source_connector_candidate',
    mapping_version: 'source-mapping-v1',
    mapping_status: candidate.mapping_status || 'candidate',
    estimated_minutes: Number.isInteger(candidate.estimated_minutes) ? candidate.estimated_minutes : null,
    pedagogical_roles: [...new Set(candidate.pedagogical_roles || ['explain'])],
    safety_profile: candidate.safety_profile || {
      risk_level: 'low',
      minimum_age: null,
      adult_supervision: false,
      materials: [],
      warnings_source_block_ids: []
    },
    rights_profile_id: rights.rights_profile_id,
    source_revision: revision,
    source_hash: sourceHash,
    delivery_mode: 'structured_text',
    visual_dependency: candidate.visual_dependency || 'none',
    publication_status: 'shadow'
  }
  const snapshotPayload = {
    source_id: source.source_id,
    upstream_id: candidate.upstream_id,
    revision,
    source_hash: sourceHash
  }
  const snapshot = {
    snapshot_id: stableId('lrs', source.source_id, candidate.upstream_id, revision),
    source_id: source.source_id,
    upstream_id: candidate.upstream_id,
    canonical_url: candidate.canonical_url,
    retrieved_at: retrievedAt,
    source_revision: revision,
    etag: candidate.etag || null,
    last_modified: candidate.last_modified || null,
    git_commit: context.gitCommit || null,
    media_type: candidate.media_type || 'text/markdown',
    payload_hash: sha256(snapshotPayload),
    extractor_name: candidate.extractor_name || source.connector,
    extractor_version: 'learning-resource-connector-v1',
    retention_policy: source.retention_policy,
    upstream_status: 'available'
  }
  return { snapshot, rights, resource, fragments }
}

export class LearningResourceConnector {
  constructor(source, options = {}) {
    this.source = source
    this.options = options
  }

  async discover() {
    throw new Error(`${this.source.connector} must implement discover()`)
  }

  async run() {
    const result = await this.discover()
    const revision = result.revision || 'unknown'
    return {
      source: this.source,
      revision,
      items: result.candidates.map(candidate => normalizeCandidate(candidate, {
        source: this.source,
        revision,
        gitCommit: result.git_commit,
        retrievedAt: result.retrieved_at
      }))
    }
  }
}

