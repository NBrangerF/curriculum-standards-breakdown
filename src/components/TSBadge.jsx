import { useMemo } from 'react'
import { SKILL_COLORS } from '../data/dataLoader'
import './TSBadge.css'

/**
 * TS Icon Mappings
 * Single-color outline icons using currentColor
 * Each icon is an SVG path designed for consistency
 */
const TS_ICONS = {
    TS1: {
        // Critical Thinking - Brain/Network pattern
        name: '批判性思维',
        name_en: 'Critical Thinking',
        viewBox: '0 0 24 24',
        paths: [
            'M9.5 2A2.5 2.5 0 0 1 12 4.5v5a2.5 2.5 0 0 1-5 0v-5A2.5 2.5 0 0 1 9.5 2Z',
            'M14.5 4A2.5 2.5 0 0 1 17 6.5v3a2.5 2.5 0 0 1-5 0v-3A2.5 2.5 0 0 1 14.5 4Z',
            'M9.5 14a2.5 2.5 0 0 1 2.5 2.5v3a2.5 2.5 0 0 1-5 0v-3a2.5 2.5 0 0 1 2.5-2.5Z',
            'M14.5 12a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-5 0v-5a2.5 2.5 0 0 1 2.5-2.5Z',
            'M5 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
            'M19 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z'
        ],
        strokePaths: ['M12 10v4', 'M7 10h2', 'M15 14h2']
    },
    TS2: {
        // Innovation & Creativity - Sparkle/Wand
        name: '创新创造',
        name_en: 'Innovation & Creativity',
        viewBox: '0 0 24 24',
        strokePaths: [
            'M12 3v2',
            'M12 19v2',
            'M3 12h2',
            'M19 12h2',
            'M5.64 5.64l1.41 1.41',
            'M16.95 16.95l1.41 1.41',
            'M5.64 18.36l1.41-1.41',
            'M16.95 7.05l1.41-1.41'
        ],
        paths: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z']
    },
    TS3: {
        // Self-Directed Learning - Compass/Target
        name: '自我导向学习',
        name_en: 'Self-Directed Learning',
        viewBox: '0 0 24 24',
        strokePaths: [
            'M12 2v4',
            'M12 18v4',
            'M2 12h4',
            'M18 12h4'
        ],
        paths: [
            'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
            'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z'
        ]
    },
    TS4: {
        // Collaboration - Users/People
        name: '协作',
        name_en: 'Collaboration',
        viewBox: '0 0 24 24',
        paths: [
            'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
            'M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z'
        ],
        strokePaths: [
            'M22 21v-2a4 4 0 0 0-3-3.87',
            'M16 3.13a4 4 0 0 1 0 7.75'
        ]
    },
    TS5: {
        // Communication - Speech bubble
        name: '沟通表达',
        name_en: 'Communication',
        viewBox: '0 0 24 24',
        paths: [
            'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z'
        ],
        strokePaths: [
            'M8 9h8',
            'M8 13h6'
        ]
    },
    TS6: {
        // Digital Literacy - Binary/Laptop
        name: '数字信息素养',
        name_en: 'Digital Literacy',
        viewBox: '0 0 24 24',
        paths: [
            'M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16'
        ],
        strokePaths: [
            'M9 9v2',
            'M12 9v2',
            'M15 9v2'
        ]
    },
    TS7: {
        // Global Citizenship - Globe
        name: '全球公民与责任',
        name_en: 'Global Citizenship',
        viewBox: '0 0 24 24',
        strokePaths: [
            'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',
            'M2 12h20',
            'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z'
        ]
    }
}

/**
 * TSBadge - Unified Transferable Skill badge component
 * 
 * @param {string} tsId - TS1-TS7
 * @param {'sm'|'md'|'lg'} size - Badge size (sm=16px, md=24px, lg=32px)
 * @param {'soft'|'solid'|'outline'} variant - Visual style
 * @param {boolean} showLabel - Whether to show text label
 * @param {string} className - Additional classes
 */
function TSBadge({
    tsId,
    size = 'sm',
    variant = 'soft',
    showLabel = false,
    className = ''
}) {
    const iconData = TS_ICONS[tsId]
    const color = SKILL_COLORS[tsId] || 'var(--color-primary)'

    const sizeConfig = useMemo(() => ({
        sm: { icon: 16, padding: 4, fontSize: 10 },
        md: { icon: 24, padding: 6, fontSize: 12 },
        lg: { icon: 32, padding: 8, fontSize: 14 }
    }), [])

    const config = sizeConfig[size] || sizeConfig.sm

    if (!iconData) {
        return (
            <span
                className={`ts-badge ts-badge-${size} ts-badge-${variant} ${className}`}
                style={{ '--ts-color': color }}
                title={tsId}
            >
                <span className="ts-badge-text">{tsId}</span>
            </span>
        )
    }

    return (
        <span
            className={`ts-badge ts-badge-${size} ts-badge-${variant} ${className}`}
            style={{ '--ts-color': color }}
            title={`${iconData.name} (${tsId})`}
            aria-label={`${iconData.name}`}
        >
            <svg
                className="ts-badge-icon"
                width={config.icon}
                height={config.icon}
                viewBox={iconData.viewBox}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                {/* Filled paths */}
                {iconData.paths?.map((d, i) => (
                    <path key={`p-${i}`} d={d} fill="none" />
                ))}
                {/* Stroke-only paths */}
                {iconData.strokePaths?.map((d, i) => (
                    <path key={`s-${i}`} d={d} />
                ))}
            </svg>
            {showLabel && (
                <span className="ts-badge-label">{iconData.name}</span>
            )}
        </span>
    )
}

/**
 * TSBadgeGroup - Display multiple TS badges
 */
export function TSBadgeGroup({
    skills = [],
    size = 'sm',
    variant = 'soft',
    max = 3,
    className = ''
}) {
    if (!skills || skills.length === 0) return null

    const displayed = skills.slice(0, max)
    const remaining = skills.length - max

    return (
        <span className={`ts-badge-group ${className}`}>
            {displayed.map(skill => {
                const code = typeof skill === 'string' ? skill : skill.code
                return (
                    <TSBadge
                        key={code}
                        tsId={code}
                        size={size}
                        variant={variant}
                    />
                )
            })}
            {remaining > 0 && (
                <span className="ts-badge-more" title={`还有 ${remaining} 个`}>
                    +{remaining}
                </span>
            )}
        </span>
    )
}

/**
 * Get TS skill info by code
 */
export function getTSInfo(tsId) {
    return TS_ICONS[tsId] || null
}

export default TSBadge
