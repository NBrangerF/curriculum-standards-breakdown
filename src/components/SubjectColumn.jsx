import { useState, useMemo } from 'react'
import StandardCard from './StandardCard'
import { SUBJECT_COLORS, groupByDomain } from '../data/dataLoader'
import './SubjectColumn.css'

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
    defaultExpandFirst = true
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
                const subdomain = std.subdomain || ''
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
                    std.content?.toLowerCase().includes(term) ||
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
        <div className="subject-column" style={{ '--column-color': subjectColor }}>
            {/* Sticky Header */}
            <div className="column-header">
                <div className="column-title-row">
                    <h3 className="column-title">{subjectName}</h3>
                    <span className="column-badge">{gradeBand}</span>
                </div>

                {/* Column Search */}
                <div className="column-search">
                    <input
                        type="text"
                        placeholder="搜索本列..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="column-search-input"
                    />
                    {searchTerm && (
                        <button
                            className="column-search-clear"
                            onClick={() => setSearchTerm('')}
                        >
                            ✕
                        </button>
                    )}
                </div>

                {searchTerm && (
                    <div className="column-search-status">
                        找到 {filteredCount} / {totalCount} 条
                    </div>
                )}
            </div>

            {/* Scrollable Content */}
            <div className="column-content">
                {domainKeys.length === 0 ? (
                    <div className="column-empty">
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
                            <div key={domain} className="domain-group">
                                {/* Domain Header */}
                                <button
                                    className={`domain-header ${isExpanded ? 'expanded' : ''}`}
                                    onClick={() => toggleDomain(domain)}
                                >
                                    <span className="domain-name">
                                        {highlightMatch(domain, searchTerm)}
                                    </span>
                                    <span className="domain-meta">
                                        <span className="domain-count">{domainCount}</span>
                                        <span className={`domain-toggle ${isExpanded ? 'up' : 'down'}`}>
                                            ▼
                                        </span>
                                    </span>
                                </button>

                                {/* Domain Content */}
                                {isExpanded && (
                                    <div className="domain-content">
                                        {subdomainKeys.map(subdomain => {
                                            const stds = subdomains[subdomain]
                                            const hasSubdomain = subdomain !== ''

                                            return (
                                                <div key={subdomain || '__root__'} className="subdomain-group">
                                                    {hasSubdomain && (
                                                        <h5 className="subdomain-title">
                                                            {highlightMatch(subdomain, searchTerm)}
                                                        </h5>
                                                    )}
                                                    <div className="standards-list">
                                                        {stds.map(std => (
                                                            <StandardCard
                                                                key={std.id}
                                                                standard={std}
                                                                highlightTerm={searchTerm}
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
            ? <mark key={i} className="search-highlight">{part}</mark>
            : part
    )
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default SubjectColumn
