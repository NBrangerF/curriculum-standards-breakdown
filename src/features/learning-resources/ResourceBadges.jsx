import { accessLabel, licenseLabel } from './labels'
import styles from './ResourceBadges.module.css'

/** Licence, noncommercial flag and mainland access, in that order. */
export default function ResourceBadges({ resource, className = '' }) {
    return (
        <ul className={`${styles.badges} ${className}`} aria-label="许可与访问">
            <li className={styles.license}>{licenseLabel(resource.license)}</li>
            {resource.open_level === 'noncommercial' && <li className={styles.nc}>仅限非商业使用</li>}
            <li className={styles.access} data-access={resource.china_access}>
                <i aria-hidden="true" />{accessLabel(resource.china_access)}
            </li>
        </ul>
    )
}

/** External link to the original site; opens in a new tab. */
export function OpenOriginalLink({ resource, className = '' }) {
    return (
        <a
            className={`${styles.open} ${className}`}
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`打开原站：${resource.title_zh}（新窗口）`}
        >
            打开原站 <span aria-hidden="true">↗</span>
        </a>
    )
}
