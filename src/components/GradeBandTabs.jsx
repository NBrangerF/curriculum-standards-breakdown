import { GRADE_BANDS } from '../data/dataLoader'
import './GradeBandTabs.css'

function GradeBandTabs({ selected = [], onChange, availableBands = ['H1', 'H2', 'H3'], multiSelect = true }) {
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
        <div className="grade-band-tabs">
            {multiSelect && (
                <button
                    className={`grade-band-tab all ${selected.length === 0 || selected.length === availableBands.length ? 'active' : ''}`}
                    onClick={handleSelectAll}
                >
                    全部学段
                </button>
            )}
            {availableBands.map(band => {
                const info = GRADE_BANDS[band] || {}
                const isActive = selected.includes(band)
                return (
                    <button
                        key={band}
                        className={`grade-band-tab ${isActive ? 'active' : ''}`}
                        onClick={() => handleToggle(band)}
                    >
                        <span className="grade-band-label">{info.label || band}</span>
                        <span className="grade-band-range">{info.range}</span>
                    </button>
                )
            })}
        </div>
    )
}

export default GradeBandTabs
