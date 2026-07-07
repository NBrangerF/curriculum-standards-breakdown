import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './Header.css'

function Header() {
    const location = useLocation()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    const isActive = (path) => {
        if (path === '/') {
            return location.pathname === '/'
        }
        return location.pathname.startsWith(path)
    }

    const navItems = [
        { path: '/', label: '首页' },
        { path: '/skills', label: '可迁移技能' },
        { path: '/search', label: '筛选搜索' },
        { path: '/h4g-review', label: '人工审核' },
        // 术语表 removed
        { path: '/collections', label: '我的清单', icon: '⭐' }
    ]

    return (
        <header className="header">
            <div className="container header-container">
                {/* Brand */}
                <Link to="/" className="header-logo">
                    <span className="logo-icon">🧭</span>
                    <span className="logo-text">
                        <span className="logo-title">课标罗盘</span>
                        <span className="logo-subtitle">义务教育 2022</span>
                    </span>
                </Link>

                {/* Desktop Nav */}
                <nav className="header-nav desktop-nav">
                    {navItems.map(item => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`nav-pill ${isActive(item.path) ? 'active' : ''}`}
                        >
                            {item.icon && <span className="nav-icon">{item.icon}</span>}
                            {item.label}
                        </Link>
                    ))}
                </nav>

                {/* Mobile Menu Button */}
                <button
                    className="mobile-menu-btn"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    aria-label="Toggle menu"
                >
                    <span className={`hamburger ${mobileMenuOpen ? 'open' : ''}`}>
                        <span></span>
                        <span></span>
                        <span></span>
                    </span>
                </button>
            </div>

            {/* Mobile Nav */}
            {mobileMenuOpen && (
                <nav className="mobile-nav">
                    {navItems.map(item => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`mobile-nav-link ${isActive(item.path) ? 'active' : ''}`}
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            {item.icon && <span className="nav-icon">{item.icon}</span>}
                            {item.label}
                        </Link>
                    ))}
                </nav>
            )}
        </header>
    )
}

export default Header
