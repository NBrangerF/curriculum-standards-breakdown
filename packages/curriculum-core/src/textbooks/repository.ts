import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
    TextbookCatalogDatasetSchema,
    TextbookDetailRecordSchema,
    TextbookResourceCatalogSchema
} from './schemas.js'
import type {
    TextbookCatalogDataset,
    TextbookCatalogRecord,
    TextbookContentNode,
    TextbookDetailRecord,
    TextbookPageContext,
    TextbookResourceCatalog,
    TextbookResourcePairing,
    TextbookResourceUnitMapping,
    TextbookSupportResourceRecord,
    TextbookStage,
    TextbookVolume
} from './types.js'

export interface TextbookSearchFilters {
    stage?: TextbookStage
    subject?: string
    grade?: number
    volume?: TextbookVolume
    query?: string
    resource_type?: string
}

interface TextbookPageIndexEntry {
    node_ids: string[]
    alignment_ids: string[]
    evidence_span_ids: string[]
}

interface TextbookPageAlignmentIndex {
    edition_id: string
    pages: Record<string, TextbookPageIndexEntry>
}

export class FileTextbookRepository {
    private catalogPromise: Promise<TextbookCatalogDataset> | null = null
    private detailPromises = new Map<string, Promise<TextbookDetailRecord>>()
    private pageIndexPromises = new Map<string, Promise<TextbookPageAlignmentIndex | null>>()
    private unitsPromise: Promise<Array<Record<string, unknown>>> | null = null
    private reversePromise: Promise<{
        items: Record<string, Array<Record<string, unknown>>>
        scopes: Record<string, Array<Record<string, unknown>>>
    }> | null = null
    private resourceCatalogPromise: Promise<TextbookResourceCatalog> | null = null

    constructor(private readonly dataRoot: string) {}

    async loadCatalog(): Promise<TextbookCatalogDataset> {
        if (!this.catalogPromise) {
            this.catalogPromise = readFile(resolve(this.dataRoot, 'textbooks/index.json'), 'utf8')
                .then(source => TextbookCatalogDatasetSchema.parse(JSON.parse(source)))
                .catch(error => {
                    this.catalogPromise = null
                    throw error
                })
        }
        return this.catalogPromise
    }

    async search(filters: TextbookSearchFilters = {}): Promise<TextbookCatalogRecord[]> {
        const catalog = await this.loadCatalog()
        const query = filters.query?.trim().toLocaleLowerCase('zh-CN') || ''
        return catalog.items.filter(item => {
            if (filters.stage && item.stage !== filters.stage) return false
            if (filters.subject && item.subject_slug !== filters.subject && item.subject !== filters.subject) return false
            if (filters.grade && item.grade !== filters.grade) return false
            if (filters.volume && item.volume !== filters.volume) return false
            if (filters.resource_type && item.resource_type !== filters.resource_type) return false
            if (!query) return true
            return [item.title, item.subject, item.edition_name, item.grade_label, item.volume]
                .some(value => value.toLocaleLowerCase('zh-CN').includes(query))
        })
    }

    async get(editionId: string): Promise<TextbookDetailRecord | null> {
        if (!/^ed_[a-z0-9]+$/i.test(editionId)) return null
        let pending = this.detailPromises.get(editionId)
        if (!pending) {
            pending = readFile(resolve(this.dataRoot, `textbooks/by-edition/${editionId}.json`), 'utf8')
                // The runtime schema is the source of truth. Keep the explicit output
                // type because Vercel compiles each API entrypoint in isolation and can
                // otherwise widen nullable object fields to optional properties.
                .then(source => TextbookDetailRecordSchema.parse(JSON.parse(source)) as TextbookDetailRecord)
                .catch(error => {
                    this.detailPromises.delete(editionId)
                    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null as never
                    throw error
                })
            this.detailPromises.set(editionId, pending)
        }
        return pending
    }

    async getUnit(unitId: string): Promise<Record<string, unknown> | null> {
        if (!this.unitsPromise) {
            this.unitsPromise = readFile(resolve(this.dataRoot, 'textbooks/units.json'), 'utf8')
                .then(source => {
                    const payload = JSON.parse(source) as { items?: Array<Record<string, unknown>> }
                    return Array.isArray(payload.items) ? payload.items : []
                })
        }
        return (await this.unitsPromise).find(item => item.entry_id === unitId) || null
    }

    private async loadPageIndex(editionId: string): Promise<TextbookPageAlignmentIndex | null> {
        let pending = this.pageIndexPromises.get(editionId)
        if (!pending) {
            pending = readFile(resolve(this.dataRoot, `textbooks/page-context/by-edition/${editionId}.json`), 'utf8')
                .then(source => {
                    const payload = JSON.parse(source) as Partial<TextbookPageAlignmentIndex>
                    if (payload.edition_id !== editionId || !payload.pages || typeof payload.pages !== 'object') return null
                    return payload as TextbookPageAlignmentIndex
                })
                .catch(error => {
                    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
                    this.pageIndexPromises.delete(editionId)
                    throw error
                })
            this.pageIndexPromises.set(editionId, pending)
        }
        return pending
    }

    private legacyContentNodes(detail: TextbookDetailRecord): TextbookContentNode[] {
        return detail.toc
            .filter(entry => entry.pdf_page !== null)
            .map((entry, index, entries) => {
                const nextPage = entries.slice(index + 1).find(candidate =>
                    candidate.pdf_page !== null && candidate.pdf_page > entry.pdf_page!
                )?.pdf_page
                return {
                    node_id: entry.entry_id,
                    parent_id: entry.parent_id,
                    unit_id: entry.entry_id,
                    level: entry.level,
                    kind: entry.kind,
                    title: entry.title,
                    pdf_page: entry.pdf_page!,
                    end_pdf_page: entry.end_pdf_page && entry.end_pdf_page >= entry.pdf_page!
                        ? entry.end_pdf_page
                        : nextPage
                            ? nextPage - 1
                            : detail.page_count,
                    printed_page: entry.printed_page,
                    end_printed_page: null,
                    source: `toc:${entry.source}`,
                    confidence: entry.confidence
                }
            })
    }

    /**
     * Resolve the content tree and concrete standard evidence active on a PDF
     * page. Curriculum scopes are returned separately and never promoted into
     * the page-specific alignment collection.
     */
    async getPageContext(editionId: string, pdfPage: number): Promise<TextbookPageContext | null> {
        const detail = await this.get(editionId)
        if (!detail || pdfPage < 1 || pdfPage > detail.page_count) return null

        const pageIndex = await this.loadPageIndex(editionId)
        const indexed = pageIndex?.pages[String(pdfPage)]
        const nodes = detail.content_nodes.length ? detail.content_nodes : this.legacyContentNodes(detail)
        const indexedNodeIds = new Set(indexed?.node_ids || [])
        const activeNodes = nodes
            .filter(node => indexed
                ? indexedNodeIds.has(node.node_id)
                : node.pdf_page <= pdfPage && node.end_pdf_page >= pdfPage)
            .sort((left, right) => left.level - right.level
                || (right.end_pdf_page - right.pdf_page) - (left.end_pdf_page - left.pdf_page)
                || left.node_id.localeCompare(right.node_id))

        const nodeIds = new Set(activeNodes.map(node => node.node_id))
        const unitIds = new Set(activeNodes.flatMap(node => [node.unit_id, node.node_id].filter(Boolean) as string[]))
        const indexedAlignmentIds = new Set(indexed?.alignment_ids || [])
        const alignments = detail.alignments.filter(alignment => indexed
            ? indexedAlignmentIds.has(alignment.alignment_id)
            : alignment.pdf_page === pdfPage
                || Boolean(alignment.node_id && nodeIds.has(alignment.node_id))
                || Boolean(alignment.unit_id && unitIds.has(alignment.unit_id)))

        const spanById = new Map(detail.evidence_spans.map(span => [span.evidence_span_id, span]))
        const alignmentSpanIds = alignments
            .flatMap(alignment => alignment.evidence_span_ids || [])
            .filter(spanId => spanById.get(spanId)?.pdf_page === pdfPage)
        // A grouped relationship can contain claims from several pages. Page
        // context returns the whole relationship card, but only the literal
        // evidence spans located on the requested page.
        const evidenceSpanIds = new Set([...(indexed?.evidence_span_ids || []), ...alignmentSpanIds])
        const evidenceSpans = detail.evidence_spans.filter(span => evidenceSpanIds.has(span.evidence_span_id))
        const printedPage = detail.page_map.find(entry => entry.pdf_page === pdfPage)?.printed_page || null

        return {
            edition_id: editionId,
            pdf_page: pdfPage,
            printed_page: printedPage,
            active_nodes: activeNodes,
            alignments,
            evidence_spans: evidenceSpans,
            standard_scopes: detail.standard_scopes
        }
    }

    async getTextbooksForStandard(code: string): Promise<Array<Record<string, unknown>>> {
        if (!this.reversePromise) {
            this.reversePromise = readFile(resolve(this.dataRoot, 'textbooks/standards-to-textbooks.json'), 'utf8')
                .then(source => {
                    const payload = JSON.parse(source) as {
                        items?: Record<string, Array<Record<string, unknown>>>
                        scopes?: Record<string, Array<Record<string, unknown>>>
                    }
                    return { items: payload.items || {}, scopes: payload.scopes || {} }
                })
        }
        const reverse = await this.reversePromise
        const specific = reverse.items[code] || []
        const specificEditions = new Set(specific.map(item => item.edition_id))
        const scopes = (reverse.scopes[code] || []).filter(item => !specificEditions.has(item.edition_id))
        return [...specific, ...scopes]
    }

    /**
     * Load the support-resource graph. Older deployments may not have emitted
     * it yet, so a missing file is a valid empty catalog rather than a runtime
     * failure.
     */
    async loadResourceCatalog(): Promise<TextbookResourceCatalog> {
        if (!this.resourceCatalogPromise) {
            this.resourceCatalogPromise = readFile(resolve(this.dataRoot, 'textbooks/resources/index.json'), 'utf8')
                .then(source => TextbookResourceCatalogSchema.parse(JSON.parse(source)) as TextbookResourceCatalog)
                .catch(error => {
                    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                        return {
                            schema_version: 1,
                            generated_at: '1970-01-01T00:00:00.000Z',
                            resources: [],
                            pairings: [],
                            unit_mappings: [],
                            unit_mapping_gaps: [],
                            indexes: {
                                by_textbook: {},
                                by_resource: {},
                                by_textbook_unit: {},
                                by_resource_section: {}
                            }
                        }
                    }
                    this.resourceCatalogPromise = null
                    throw error
                })
        }
        return this.resourceCatalogPromise
    }

    async getResourcesForTextbook(editionId: string): Promise<Array<{
        pairing: TextbookResourcePairing
        resource: TextbookSupportResourceRecord
    }>> {
        const catalog = await this.loadResourceCatalog()
        const relationIds = new Set(catalog.indexes.by_textbook[editionId] || [])
        const pairings = catalog.pairings.filter(pairing => relationIds.has(pairing.relation_id))
        const resources = new Map(catalog.resources.map(resource => [resource.resource_id, resource]))
        return pairings.flatMap(pairing => {
            const resource = resources.get(pairing.resource_id)
            return resource ? [{ pairing, resource }] : []
        })
    }

    async getTextbooksForResource(resourceId: string): Promise<TextbookResourcePairing[]> {
        const catalog = await this.loadResourceCatalog()
        const relationIds = new Set(catalog.indexes.by_resource[resourceId] || [])
        return catalog.pairings.filter(pairing => relationIds.has(pairing.relation_id))
    }

    async getResourceSectionsForUnit(unitId: string): Promise<Array<{
        mapping: TextbookResourceUnitMapping
        resource: TextbookSupportResourceRecord
    }>> {
        const catalog = await this.loadResourceCatalog()
        const mappingIds = new Set(catalog.indexes.by_textbook_unit[unitId] || [])
        const resources = new Map(catalog.resources.map(resource => [resource.resource_id, resource]))
        return catalog.unit_mappings
            .filter(mapping => mappingIds.has(mapping.mapping_id))
            .flatMap(mapping => {
                const resource = resources.get(mapping.resource_id)
                return resource ? [{ mapping, resource }] : []
            })
    }

    async getTextbookUnitsForResourceSection(sectionId: string): Promise<TextbookResourceUnitMapping[]> {
        const catalog = await this.loadResourceCatalog()
        const mappingIds = new Set(catalog.indexes.by_resource_section[sectionId] || [])
        return catalog.unit_mappings.filter(mapping => mappingIds.has(mapping.mapping_id))
    }
}
