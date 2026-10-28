import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import Ignite from '../../features/starmap/Ignite.jsx'
import { useCountUp } from '../../features/starmap/motionHooks.js'
import styles from './kb.module.css'

/** Class names for pages that need the shared look on their own markup (wrap, panel, list, label…). */
export const kb = styles

export function Wrap({ as: Tag = 'div', className = '', children, ...rest }) {
    return <Tag className={`${styles.wrap} ${className}`} {...rest}>{children}</Tag>
}

/** "课标星图 / 学科 / 数学": every item but the last is a link. */
export function Crumbs({ items, className = '' }) {
    return (
        <p className={`${styles.crumbs} ${className}`}>
            {items.map((item, index) => (
                <Fragment key={`${item.label}-${index}`}>
                    {index > 0 && <span> / </span>}
                    {item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
                </Fragment>
            ))}
        </p>
    )
}

function CountUp({ value }) {
    return useCountUp(value)
}

export function Stat({ value, label }) {
    return (
        <li>
            <b>{typeof value === 'number' ? <CountUp value={value} /> : value}</b>
            <span>{label}</span>
        </li>
    )
}

/**
 * The top of a secondary page: crumbs or a kicker, a display-serif title that lights up, then an optional
 * lede, stats and actions. Transparent, so the sky shows through.
 */
export function PageHero({ crumbs, kicker, title, long = false, lede, stats, actions, color, className = '', children, ...rest }) {
    const titleClass = `${styles.title} ${long ? styles.titleLong : ''}`
    return (
        <header className={`${styles.hero} ${className}`} style={color ? { '--c': color } : undefined} {...rest}>
            <div className={styles.wrap}>
                <div className={styles.heroCopy}>
                    {crumbs ? <Crumbs items={crumbs} /> : kicker ? <p className={styles.kicker}>{kicker}</p> : null}
                    {typeof title === 'string'
                        ? <Ignite as="h1" className={titleClass} text={title} step={long ? 14 : 60} />
                        : <h1 className={titleClass}>{title}</h1>}
                    {lede && <p className={styles.lede}>{lede}</p>}
                    {stats?.length > 0 && <ul className={styles.stats}>{stats.map(stat => <Stat key={stat.label} {...stat} />)}</ul>}
                    {actions && <div className={styles.heroActions}>{actions}</div>}
                    {children}
                </div>
            </div>
        </header>
    )
}

/** Kicker plus a display-serif heading that lights up as it scrolls in; actions sit on the right. */
export function SectionHead({ kicker, title, as: Heading = 'h2', size = 'lg', id, className = '', children }) {
    const headingClass = size === 'sm' ? styles.h3 : styles.h2
    return (
        <div className={`${styles.sectionHead} ${className}`}>
            <div>
                {kicker && <p className={styles.kicker}>{kicker}</p>}
                {typeof title === 'string'
                    ? <Ignite as={Heading} id={id} className={headingClass} text={title} mode="scrub" />
                    : <Heading id={id} className={headingClass}>{title}</Heading>}
            </div>
            {children && <div className={styles.heroActions}>{children}</div>}
        </div>
    )
}

/** Rounded link or button with an optional glowing dot in the subject colour. */
export function Chip({ to, href, color, dot = false, small = false, className = '', children, ...rest }) {
    const props = {
        className: `${styles.chip} ${small ? styles.chipSmall : ''} ${className}`,
        style: color ? { '--c': color } : undefined,
        ...rest
    }
    const body = <>{dot && <i aria-hidden="true" />}{children}</>
    if (to) return <Link to={to} {...props}>{body}</Link>
    if (href) return <a href={href} {...props}>{body}</a>
    return <button type="button" {...props}>{body}</button>
}

/** Toggle pill for filters; pressed state comes from aria-pressed. */
export function Pill({ pressed, color, dot = false, className = '', children, ...rest }) {
    return (
        <button
            type="button"
            className={`${styles.pill} ${className}`}
            aria-pressed={pressed === undefined ? undefined : Boolean(pressed)}
            style={color ? { '--c': color } : undefined}
            {...rest}
        >
            {dot && <i aria-hidden="true" />}{children}
        </button>
    )
}

/** Segmented switch: options [{ value, label }], one pressed at a time. */
export function Seg({ options, value, onChange, label, className = '' }) {
    return (
        <div className={`${styles.seg} ${className}`} role="group" aria-label={label}>
            {options.map(option => (
                <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
                    {option.label}
                </button>
            ))}
        </div>
    )
}
