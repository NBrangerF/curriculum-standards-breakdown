import styles from './HeroBackground.module.css'

function HeroBackground({ themeColor = '#3e5bef', iconPath, uniqueId = 'hero' }) {
    return (
        <div className={styles['hero-background']} style={{ '--hero-signal': themeColor }} aria-hidden="true" data-kb-component="hero-background">
            <svg className={styles['hero-coordinate-field']} viewBox="0 0 720 360" preserveAspectRatio="xMidYMid slice">
                <g className={styles['hero-coordinate-grid']}>
                    <path d="M0 72H720M0 144H720M0 216H720M0 288H720" />
                    <path d="M120 0V360M240 0V360M360 0V360M480 0V360M600 0V360" />
                </g>
                <g className={styles['hero-coordinate-route']}>
                    <path d="M72 280L212 212L350 236L486 126L648 86" />
                    <circle cx="72" cy="280" r="5" />
                    <circle cx="212" cy="212" r="5" />
                    <circle cx="350" cy="236" r="5" />
                    <circle cx="486" cy="126" r="7" />
                    <circle cx="648" cy="86" r="5" />
                </g>
                <g className={styles['hero-coordinate-labels']}>
                    <text x="48" y="314">H1</text>
                    <text x="188" y="196">H2</text>
                    <text x="326" y="270">H3</text>
                    <text x="462" y="110">H4</text>
                    <text x="614" y="70">{uniqueId.toUpperCase().slice(0, 8)}</text>
                </g>
            </svg>
            {iconPath ? (
                <svg className={styles['hero-icon-overlay']} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    {iconPath}
                </svg>
            ) : null}
        </div>
    )
}

export default HeroBackground
