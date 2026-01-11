import { useState } from 'react'
import { LoadingState, ErrorState, EmptyState } from '../components/StateComponents'
import './StyleGuidePage.css'

function StyleGuidePage() {
    const [density, setDensity] = useState('compact')
    const [accordionOpen, setAccordionOpen] = useState(false)
    const [selectedChip, setSelectedChip] = useState('chip-1')
    const [activeTab, setActiveTab] = useState('H1')

    return (
        <div className="styleguide-page" data-density={density}>
            {/* Header */}
            <header className="styleguide-header">
                <div className="container">
                    <div className="header-content">
                        <div className="header-text">
                            <h1>Style Guide</h1>
                            <p className="tagline">Ocean Soft · Orca Brand System</p>
                        </div>
                        <div className="density-toggle">
                            <span className="toggle-label">密度</span>
                            <button
                                className={`toggle-btn ${density === 'compact' ? 'active' : ''}`}
                                onClick={() => setDensity('compact')}
                            >
                                紧凑
                            </button>
                            <button
                                className={`toggle-btn ${density === 'comfortable' ? 'active' : ''}`}
                                onClick={() => setDensity('comfortable')}
                            >
                                舒适
                            </button>
                        </div>
                    </div>
                </div>
                {/* Wave divider */}
                <div className="wave-divider">
                    <svg viewBox="0 0 1200 120" preserveAspectRatio="none">
                        <path d="M0,60 C200,120 400,0 600,60 C800,120 1000,0 1200,60 L1200,120 L0,120 Z" />
                    </svg>
                </div>
            </header>

            {/* Bubble pattern background */}
            <div className="bubble-pattern" aria-hidden="true">
                <div className="bubble b1"></div>
                <div className="bubble b2"></div>
                <div className="bubble b3"></div>
                <div className="bubble b4"></div>
                <div className="bubble b5"></div>
            </div>

            <main className="styleguide-content">
                {/* ================================
            SECTION A: TOKENS
            ================================ */}
                <section className="guide-section" id="tokens">
                    <div className="container">
                        <h2 className="section-title">
                            <span className="orca-fin"></span>
                            Tokens
                        </h2>

                        {/* Colors */}
                        <div className="subsection">
                            <h3>Color Palette</h3>

                            <h4>Primary & Secondary</h4>
                            <div className="color-grid">
                                <div className="color-swatch" style={{ '--swatch': 'var(--color-primary)' }}>
                                    <div className="swatch"></div>
                                    <span className="name">Primary</span>
                                    <code>#0891B2</code>
                                </div>
                                <div className="color-swatch" style={{ '--swatch': 'var(--color-primary-light)' }}>
                                    <div className="swatch"></div>
                                    <span className="name">Primary Light</span>
                                    <code>#22D3EE</code>
                                </div>
                                <div className="color-swatch" style={{ '--swatch': 'var(--color-primary-dark)' }}>
                                    <div className="swatch"></div>
                                    <span className="name">Primary Dark</span>
                                    <code>#0E7490</code>
                                </div>
                                <div className="color-swatch" style={{ '--swatch': 'var(--color-secondary)' }}>
                                    <div className="swatch"></div>
                                    <span className="name">Secondary</span>
                                    <code>#06B6D4</code>
                                </div>
                                <div className="color-swatch" style={{ '--swatch': 'var(--color-accent)' }}>
                                    <div className="swatch"></div>
                                    <span className="name">Accent</span>
                                    <code>#F97316</code>
                                </div>
                            </div>

                            <h4>Semantic</h4>
                            <div className="color-grid">
                                <div className="color-swatch" style={{ '--swatch': 'var(--color-success)' }}>
                                    <div className="swatch"></div>
                                    <span className="name">Success</span>
                                    <code>#10B981</code>
                                </div>
                                <div className="color-swatch" style={{ '--swatch': 'var(--color-warning)' }}>
                                    <div className="swatch"></div>
                                    <span className="name">Warning</span>
                                    <code>#F59E0B</code>
                                </div>
                                <div className="color-swatch" style={{ '--swatch': 'var(--color-error)' }}>
                                    <div className="swatch"></div>
                                    <span className="name">Error</span>
                                    <code>#EF4444</code>
                                </div>
                                <div className="color-swatch" style={{ '--swatch': 'var(--color-info)' }}>
                                    <div className="swatch"></div>
                                    <span className="name">Info</span>
                                    <code>#3B82F6</code>
                                </div>
                            </div>

                            <h4>Background & Text</h4>
                            <div className="color-grid">
                                <div className="color-swatch" style={{ '--swatch': 'var(--bg-primary)' }}>
                                    <div className="swatch bordered"></div>
                                    <span className="name">BG Primary</span>
                                    <code>#F8FAFC</code>
                                </div>
                                <div className="color-swatch" style={{ '--swatch': 'var(--bg-secondary)' }}>
                                    <div className="swatch bordered"></div>
                                    <span className="name">BG Secondary</span>
                                    <code>#F1F5F9</code>
                                </div>
                                <div className="color-swatch" style={{ '--swatch': 'var(--text-primary)' }}>
                                    <div className="swatch"></div>
                                    <span className="name">Text Primary</span>
                                    <code>#0F172A</code>
                                </div>
                                <div className="color-swatch" style={{ '--swatch': 'var(--text-secondary)' }}>
                                    <div className="swatch"></div>
                                    <span className="name">Text Secondary</span>
                                    <code>#475569</code>
                                </div>
                                <div className="color-swatch" style={{ '--swatch': 'var(--border-default)' }}>
                                    <div className="swatch bordered"></div>
                                    <span className="name">Border</span>
                                    <code>#E2E8F0</code>
                                </div>
                            </div>
                        </div>

                        {/* Typography */}
                        <div className="subsection">
                            <h3>Typography</h3>
                            <div className="typography-samples">
                                <div className="type-sample">
                                    <span className="type-label">H1 · Display</span>
                                    <h1 className="demo-h1">课程标准导航</h1>
                                </div>
                                <div className="type-sample">
                                    <span className="type-label">H2 · Section</span>
                                    <h2 className="demo-h2">义务教育课程标准</h2>
                                </div>
                                <div className="type-sample">
                                    <span className="type-label">H3 · Subsection</span>
                                    <h3 className="demo-h3">可迁移技能概述</h3>
                                </div>
                                <div className="type-sample">
                                    <span className="type-label">Body · 正文</span>
                                    <p className="demo-body">
                                        能结合生活情境，初步感受数学与日常生活的密切联系。在具体情境中理解加法和减法运算的意义，熟练口算20以内的加减法。
                                    </p>
                                </div>
                                <div className="type-sample">
                                    <span className="type-label">Caption · 说明</span>
                                    <p className="demo-caption">
                                        数据来源：《义务教育课程标准（2022年版）》· 仅供教学研究参考
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Spacing & Radius & Shadow */}
                        <div className="subsection">
                            <h3>Spacing · Radius · Shadow</h3>
                            <div className="token-demos">
                                <div className="token-demo-group">
                                    <h4>Spacing (8px Grid)</h4>
                                    <div className="spacing-samples">
                                        {[1, 2, 3, 4, 6, 8, 12].map(n => (
                                            <div key={n} className="spacing-item">
                                                <div className="spacing-bar" style={{ width: `var(--space-${n})` }}></div>
                                                <code>--space-{n}</code>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="token-demo-group">
                                    <h4>Border Radius</h4>
                                    <div className="radius-samples">
                                        {['sm', 'md', 'lg', 'xl', '2xl', 'full'].map(r => (
                                            <div key={r} className="radius-item">
                                                <div className="radius-box" style={{ borderRadius: `var(--radius-${r})` }}></div>
                                                <code>--radius-{r}</code>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="token-demo-group">
                                    <h4>Shadow</h4>
                                    <div className="shadow-samples">
                                        {['sm', 'md', 'lg', 'xl'].map(s => (
                                            <div key={s} className="shadow-item">
                                                <div className="shadow-box" style={{ boxShadow: `var(--shadow-${s})` }}></div>
                                                <code>--shadow-{s}</code>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ================================
            SECTION B: COMPONENTS
            ================================ */}
                <section className="guide-section" id="components">
                    <div className="container">
                        <h2 className="section-title">
                            <span className="orca-fin"></span>
                            Components
                        </h2>

                        {/* Buttons */}
                        <div className="subsection">
                            <h3>Buttons</h3>
                            <div className="component-row">
                                <div className="component-group">
                                    <h4>Primary</h4>
                                    <div className="button-states">
                                        <button className="btn btn-primary">默认</button>
                                        <button className="btn btn-primary hover">悬停</button>
                                        <button className="btn btn-primary active">激活</button>
                                        <button className="btn btn-primary" disabled>禁用</button>
                                    </div>
                                </div>
                                <div className="component-group">
                                    <h4>Secondary</h4>
                                    <div className="button-states">
                                        <button className="btn btn-secondary">默认</button>
                                        <button className="btn btn-secondary hover">悬停</button>
                                        <button className="btn btn-secondary active">激活</button>
                                        <button className="btn btn-secondary" disabled>禁用</button>
                                    </div>
                                </div>
                                <div className="component-group">
                                    <h4>Ghost</h4>
                                    <div className="button-states">
                                        <button className="btn btn-ghost">默认</button>
                                        <button className="btn btn-ghost hover">悬停</button>
                                        <button className="btn btn-ghost active">激活</button>
                                        <button className="btn btn-ghost" disabled>禁用</button>
                                    </div>
                                </div>
                                <div className="component-group">
                                    <h4>Icon</h4>
                                    <div className="button-states">
                                        <button className="btn btn-icon" aria-label="收藏">★</button>
                                        <button className="btn btn-icon hover" aria-label="收藏">★</button>
                                        <button className="btn btn-icon active" aria-label="收藏">★</button>
                                        <button className="btn btn-icon" disabled aria-label="收藏">★</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Chips */}
                        <div className="subsection">
                            <h3>Chips / Tags</h3>
                            <div className="component-row">
                                <div className="component-group">
                                    <h4>Default</h4>
                                    <div className="chip-demo">
                                        <span
                                            className={`chip ${selectedChip === 'chip-1' ? 'selected' : ''}`}
                                            onClick={() => setSelectedChip('chip-1')}
                                        >
                                            H1 (1-2年级)
                                        </span>
                                        <span
                                            className={`chip ${selectedChip === 'chip-2' ? 'selected' : ''}`}
                                            onClick={() => setSelectedChip('chip-2')}
                                        >
                                            H2 (3-6年级)
                                        </span>
                                        <span
                                            className={`chip ${selectedChip === 'chip-3' ? 'selected' : ''}`}
                                            onClick={() => setSelectedChip('chip-3')}
                                        >
                                            H3 (7-9年级)
                                        </span>
                                    </div>
                                </div>
                                <div className="component-group">
                                    <h4>Subject Color</h4>
                                    <div className="chip-demo">
                                        <span className="chip subject" style={{ '--chip-color': '#E53935' }}>语文</span>
                                        <span className="chip subject" style={{ '--chip-color': '#1E88E5' }}>数学</span>
                                        <span className="chip subject" style={{ '--chip-color': '#43A047' }}>英语</span>
                                        <span className="chip subject" style={{ '--chip-color': '#8E24AA' }}>科学</span>
                                    </div>
                                </div>
                                <div className="component-group">
                                    <h4>Skill Color</h4>
                                    <div className="chip-demo">
                                        <span className="chip skill" style={{ '--chip-color': '#0891B2' }}>CT</span>
                                        <span className="chip skill" style={{ '--chip-color': '#059669' }}>CM</span>
                                        <span className="chip skill" style={{ '--chip-color': '#7C3AED' }}>CL</span>
                                        <span className="chip skill" style={{ '--chip-color': '#DC2626' }}>CR</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="subsection">
                            <h3>Tabs</h3>
                            <div className="component-row">
                                <div className="component-group full-width">
                                    <h4>Grade Band Tabs</h4>
                                    <div className="tabs-demo">
                                        {['H1', 'H2', 'H3'].map(tab => (
                                            <button
                                                key={tab}
                                                className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                                                onClick={() => setActiveTab(tab)}
                                            >
                                                {tab === 'H1' && '1-2年级'}
                                                {tab === 'H2' && '3-6年级'}
                                                {tab === 'H3' && '7-9年级'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Card */}
                        <div className="subsection">
                            <h3>Card (StandardCard)</h3>
                            <div className="component-row">
                                <div className="card-demo">
                                    <div className="demo-card">
                                        <div className="card-header">
                                            <span className="card-code">ML-H1-ENR-001</span>
                                            <span className="card-band">1-2年级</span>
                                            <button className="card-favorite">☆</button>
                                        </div>
                                        <p className="card-text">
                                            能结合生活情境，初步感受数学与日常生活的密切联系。在具体情境中理解加法和减法运算的意义。
                                        </p>
                                        <div className="card-tags">
                                            <span className="skill-tag" style={{ '--skill-color': '#0891B2' }}>CT.1</span>
                                            <span className="skill-tag" style={{ '--skill-color': '#059669' }}>CM.2</span>
                                        </div>
                                        <div className="card-expand">
                                            <button className="expand-btn">展开详情 ▼</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Accordion */}
                        <div className="subsection">
                            <h3>Accordion</h3>
                            <div className="component-row">
                                <div className="accordion-demo">
                                    <div className={`accordion ${accordionOpen ? 'open' : ''}`}>
                                        <button
                                            className="accordion-header"
                                            onClick={() => setAccordionOpen(!accordionOpen)}
                                        >
                                            <span>数与代数</span>
                                            <span className="accordion-icon">{accordionOpen ? '▲' : '▼'}</span>
                                        </button>
                                        <div className="accordion-content">
                                            <p>包含数的认识、数的运算、式与方程等子领域内容...</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Filter Bar */}
                        <div className="subsection">
                            <h3>Filter Bar</h3>
                            <div className="component-row">
                                <div className="filter-bar-demo">
                                    <div className="filter-bar">
                                        <div className="filter-search">
                                            <input type="text" placeholder="搜索标准..." />
                                        </div>
                                        <div className="filter-chips">
                                            <span className="chip selected">全部</span>
                                            <span className="chip">语文</span>
                                            <span className="chip">数学</span>
                                            <span className="chip">英语</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* States */}
                        <div className="subsection">
                            <h3>States</h3>
                            <div className="states-grid">
                                <div className="state-demo">
                                    <h4>Loading</h4>
                                    <div className="state-box">
                                        <LoadingState message="加载中..." />
                                    </div>
                                </div>
                                <div className="state-demo">
                                    <h4>Error</h4>
                                    <div className="state-box">
                                        <ErrorState title="加载失败" message="请检查网络后重试" />
                                    </div>
                                </div>
                                <div className="state-demo">
                                    <h4>Empty</h4>
                                    <div className="state-box">
                                        <EmptyState title="暂无数据" message="尝试调整筛选条件" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ================================
            SECTION C: ORCA BRAND ELEMENTS
            ================================ */}
                <section className="guide-section" id="brand">
                    <div className="container">
                        <h2 className="section-title">
                            <span className="orca-fin"></span>
                            Orca Brand Elements
                        </h2>

                        <div className="brand-elements-grid">
                            {/* Wave Divider */}
                            <div className="brand-element">
                                <h4>Wave Divider</h4>
                                <div className="element-demo wave-demo">
                                    <div className="wave-divider-sample">
                                        <svg viewBox="0 0 1200 120" preserveAspectRatio="none">
                                            <path d="M0,60 C200,120 400,0 600,60 C800,120 1000,0 1200,60 L1200,120 L0,120 Z" />
                                        </svg>
                                    </div>
                                </div>
                                <code>.wave-divider</code>
                            </div>

                            {/* Bubble Pattern */}
                            <div className="brand-element">
                                <h4>Bubble Pattern</h4>
                                <div className="element-demo bubble-demo">
                                    <div className="bubble-pattern-sample">
                                        <div className="bubble"></div>
                                        <div className="bubble"></div>
                                        <div className="bubble"></div>
                                    </div>
                                </div>
                                <code>.bubble-pattern (4% opacity)</code>
                            </div>

                            {/* Orca Fin */}
                            <div className="brand-element">
                                <h4>Orca Fin Corner Mark</h4>
                                <div className="element-demo fin-demo">
                                    <span className="orca-fin large"></span>
                                </div>
                                <code>.orca-fin</code>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="styleguide-footer">
                <div className="container">
                    <p>Ocean Soft Design System · Version 1.0</p>
                </div>
            </footer>
        </div>
    )
}

export default StyleGuidePage
