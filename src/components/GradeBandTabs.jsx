import { GRADE_BANDS } from '../data/dataLoader'
import styles from './GradeBandTabs.module.css'

function GradeBandTabs({ selected = [], onChange, availableBands = ['H1', 'H2', 'H3', 'H4G7', 'H4G8', 'H4G9'], multiSelect = true }) {
    const handleToggle = (band) => {
        if (multiSelect) {
            if (selected.includes(band)) {
                onChange(selected.filter(b => b !== band))
            } else {
                onChange([...selected, band])
            }
        } else {
            onChange([band])
        }
    }

    const handleSelectAll = () => {
        if (selected.length === availableBands.length) {
            onChange([])
        } else {
            onChange([...availableBands])
        }
    }

    return (
        <div className={styles.root} data-kb-component="grade-band-tabs">
            {multiSelect && (
                <button
                    type="button"
                    className={`${styles.tab} ${styles.all} ${selected.length === 0 || selected.length === availableBands.length ? styles.active : ''}`}
                    data-kb-grade-tab="all"
                    data-selected={selected.length === 0 || selected.length === availableBands.length ? 'true' : 'false'}
                    aria-pressed={selected.length === 0 || selected.length === availableBands.length}
                    onClick={handleSelectAll}
                >
                    全部学段/年级
                </button>
            )}
            {availableBands.map(band => {
                const info = GRADE_BANDS[band] || {}
                const isActive = selected.includes(band)
                return (
                    <button
                        type="button"
                        key={band}
                        className={`${styles.tab} ${isActive ? styles.active : ''}`}
                        data-kb-grade-tab={band}
                        data-selected={isActive ? 'true' : 'false'}
                        aria-pressed={isActive}
                        onClick={() => handleToggle(band)}
                    >
                        <span className={styles.label}>{info.label || band}</span>
                        <span className={styles.range} data-kb-grade-range>{info.range}</span>
                    </button>
                )
            })}
        </div>
    )
}

export default GradeBandTabs
