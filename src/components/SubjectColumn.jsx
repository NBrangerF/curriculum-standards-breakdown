import { useState, useMemo } from 'react'
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CaretUpIcon } from '@phosphor-icons/react/dist/csr/CaretUp'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import StandardCard from './StandardCard'
import { SUBJECT_COLORS, groupByDomain } from '../data/dataLoader'
import styles from './SubjectColumn.module.css'

/**
 * SubjectColumn - Independent column for multi-subject comparison
 * Each column has its own:
 * - Domain accordions (independent expand/collapse)
 * - Column-level search
 * - Vertical scrolling
 */
function SubjectColumn({
    subjectSlug,
    subjectName,
    gradeBand,
    standards,
    defaultExpandFirst = true,
    quickPreview = false
}) {
    const subjectColor = SUBJECT_COLORS[subjectSlug] || 'var(--color-primary)'

    // Per-column search
    const [searchTerm, setSearchTerm] = useState('')

    // Per-column expanded domains (independent from other columns)
    const [expandedDomains, setExpandedDomains] = useState(() => {
        // Default: expand first domain
        const domains = Object.keys(groupByDomain(standards))
        if (defaultExpandFirst && domains.length > 0) {
            return { [domains[0]]: true }
        }
        return {}
    })

    // Group standards by domain, then by subdomain
    const domainTree = useMemo(() => {
        const byDomain = groupByDomain(standards)

        // For each domain, optionally group by subdomain
        const tree = {}
        Object.entries(byDomain).forEach(([domain, domainStandards]) => {
            const bySubdomain = {}
            domainStandards.forEach(std => {
                const subdomain = std.display_subcategory || std.subdomain || ''
                if (!bySubdomain[subdomain]) {
                    bySubdomain[subdomain] = []
                }
                bySubdomain[subdomain].push(std)
            })
            tree[domain] = bySubdomain
        })
        return tree
    }, [standards])

    // Filter by search term
    const filteredTree = useMemo(() => {
        if (!searchTerm.trim()) return domainTree

        const term = searchTerm.toLowerCase()
        const result = {}

        Object.entries(domainTree).forEach(([domain, subdomains]) => {
            const domainMatches = domain.toLowerCase().includes(term)
            const filteredSubdomains = {}

            Object.entries(subdomains).forEach(([subdomain, stds]) => {
                const subdomainMatches = subdomain.toLowerCase().includes(term)
                const filteredStds = stds.filter(std =>
                    domainMatches ||
                    subdomainMatches ||
                    std.code?.toLowerCase().includes(term) ||
                    std.display_subcategory?.toLowerCase().includes(term) ||
                    std.standard_title?.toLowerCase().includes(term) ||
                    std.content?.toLowerCase().includes(term) ||
                    std.standard?.toLowerCase().includes(term) ||
                    std.context?.toLowerCase().includes(term)
                )

                if (filteredStds.length > 0) {
                    filteredSubdomains[subdomain] = filteredStds
                }
            })

            if (Object.keys(filteredSubdomains).length > 0) {
                result[domain] = filteredSubdomains
            }
        })

        return result
    }, [domainTree, searchTerm])

    // Auto-expand domains that have search matches
    const visibleDomains = useMemo(() => {
        if (searchTerm.trim()) {
            // When searching, expand all matching domains
            const expanded = {}
            Object.keys(filteredTree).forEach(domain => {
                expanded[domain] = true
            })
            return expanded
        }
        return expandedDomains
    }, [filteredTree, searchTerm, expandedDomains])

    const toggleDomain = (domain) => {
        if (searchTerm.trim()) return // Don't toggle during search
        setExpandedDomains(prev => ({
            ...prev,
            [domain]: !prev[domain]
        }))
    }

    const domainKeys = Object.keys(filteredTree)
    const totalCount = standards.length
    const filteredCount = Object.values(filteredTree)
        .flatMap(subs => Object.values(subs).flat())
        .length

    return (
        <div className={styles['subject-column']} style={{ '--column-color': subjectColor }} data-kb-component="subject-column">
            {/* Sticky Header */}
            <div className={styles['column-header']}>
                <div className={styles['column-title-row']}>
                    <h3 className={styles['column-title']}>{subjectName}</h3>
                    <span className={styles['column-badge']}>{gradeBand}</span>
                </div>

                {/* Column Search */}
                <div className={styles['column-search']}>
                    <input
                        type="text"
                        placeholder="搜索本列..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles['column-search-input']}
                    />
                    {searchTerm && (
                        <button
                            className={styles['column-search-clear']}
                            onClick={() => setSearchTerm('')}
                            type="button"
                            aria-label={`清空${subjectName}列搜索`}
                        >
                            <XIcon size={15} aria-hidden="true" />
                        </button>
                    )}
                </div>

                {searchTerm && (
                    <div className={styles['column-search-status']}>
                        找到 {filteredCount} / {totalCount} 条
                    </div>
                )}
            </div>

            {/* Scrollable Content */}
            <div className={styles['column-content']}>
                {domainKeys.length === 0 ? (
                    <div className={styles['column-empty']}>
                        {searchTerm ? (
                            <span>未找到匹配内容</span>
                        ) : (
                            <span>该学科在此学段暂无标准</span>
                        )}
                    </div>
                ) : (
                    domainKeys.map(domain => {
                        const isExpanded = visibleDomains[domain]
                        const subdomains = filteredTree[domain]
                        const subdomainKeys = Object.keys(subdomains)

                        // Count standards in this domain
                        const domainCount = Object.values(subdomains).flat().length

                        return (
                            <div key={domain} className={styles['domain-group']}>
                                {/* Domain Header */}
                                <button
                                    className={`${styles['domain-header']} ${isExpanded ? styles.expanded : ''}`}
                                    onClick={() => toggleDomain(domain)}
                                    type="button"
                                    aria-expanded={Boolean(isExpanded)}
                                >
                                    <span className={styles['domain-name']}>
                                        {highlightMatch(domain, searchTerm)}
                                    </span>
                                    <span className={styles['domain-meta']}>
                                        <span className={styles['domain-count']}>{domainCount}</span>
                                        {isExpanded
                                            ? <CaretUpIcon className={`${styles['domain-toggle']} ${styles.up}`} size={16} aria-hidden="true" />
                                            : <CaretDownIcon className={styles['domain-toggle']} size={16} aria-hidden="true" />}
                                    </span>
                                </button>

                                {/* Domain Content */}
                                {isExpanded && (
                                    <div className={styles['domain-content']}>
                                        {subdomainKeys.map(subdomain => {
                                            const stds = subdomains[subdomain]
                                            const hasSubdomain = subdomain !== ''

                                            return (
                                                <div key={subdomain || '__root__'} className={styles['subdomain-group']}>
                                                    {hasSubdomain && (
                                                        <h5 className={styles['subdomain-title']}>
                                                            {highlightMatch(subdomain, searchTerm)}
                                                        </h5>
                                                    )}
                                                    <div className={styles['standards-list']}>
                                                        {stds.map(std => (
                                                            <StandardCard
                                                                key={std.code}
                                                                standard={std}
                                                                highlightTerm={searchTerm}
                                                                quickPreview={quickPreview}
                                                                contextLabel={`${subjectName} · ${gradeBand}`}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}

/**
 * Highlight matching text
 */
function highlightMatch(text, term) {
    if (!term?.trim() || !text) return text

    const regex = new RegExp(`(${escapeRegex(term)})`, 'gi')
    const parts = text.split(regex)

    return parts.map((part, i) =>
        regex.test(part)
            ? <mark key={i} className={styles['search-highlight']}>{part}</mark>
            : part
    )
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default SubjectColumn
