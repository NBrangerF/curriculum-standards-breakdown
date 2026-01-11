import './HeroBackground.css'

/**
 * HeroBackground - Shared background layer for Hero Banners
 * 
 * Provides the TS-style visual quality:
 * - Deep gradient base
 * - Noise texture overlay
 * - Right-side dynamic blob shapes (themeColor driven)
 * - Faded icon overlay
 * 
 * @param {string} themeColor - Primary color for shapes (hex)
 * @param {React.ReactNode} iconPath - SVG path elements for the icon
 * @param {string} uniqueId - Unique ID for gradient definitions
 */
function HeroBackground({ themeColor = '#3b82f6', iconPath, uniqueId = 'hero' }) {
    return (
        <div className="hero-background">
            {/* Noise texture overlay */}
            <div className="hero-noise" />

            {/* Right side decorative shape - dynamic fluid blob */}
            <div className="hero-shape-container">
                <svg
                    className="hero-blob"
                    viewBox="0 0 400 400"
                    fill="none"
                    preserveAspectRatio="xMidYMid slice"
                >
                    <defs>
                        <linearGradient id={`blob-grad-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor={themeColor} stopOpacity="0.35" />
                            <stop offset="50%" stopColor={themeColor} stopOpacity="0.15" />
                            <stop offset="100%" stopColor={themeColor} stopOpacity="0.05" />
                        </linearGradient>
                        <filter id={`blur-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur in="SourceGraphic" stdDeviation="20" />
                        </filter>
                    </defs>
                    {/* Primary fluid blob */}
                    <path
                        d="M300,50 Q400,100 380,200 Q360,300 280,350 Q200,400 150,350 Q100,300 120,200 Q140,100 200,50 Q260,0 300,50 Z"
                        fill={`url(#blob-grad-${uniqueId})`}
                        filter={`url(#blur-${uniqueId})`}
                    />
                    {/* Secondary accent blob */}
                    <ellipse
                        cx="320" cy="180" rx="180" ry="140"
                        fill={themeColor}
                        fillOpacity="0.08"
                    />
                    {/* Tertiary highlight */}
                    <ellipse
                        cx="280" cy="120" rx="100" ry="80"
                        fill={themeColor}
                        fillOpacity="0.04"
                    />
                </svg>

                {/* Decorative icon overlay */}
                {iconPath && (
                    <svg
                        className="hero-icon-overlay"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={themeColor}
                    >
                        {iconPath}
                    </svg>
                )}
            </div>
        </div>
    )
}

export default HeroBackground
