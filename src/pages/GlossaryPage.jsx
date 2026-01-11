import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { LoadingState, ErrorState } from '../components/StateComponents'
import './GlossaryPage.css'

function GlossaryPage() {
    const [glossary, setGlossary] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [selectedCategory, setSelectedCategory] = useState('all')
    const [searchTerm, setSearchTerm] = useState('')

    useEffect(() => {
        fetch('/data/glossary.json')
            .then(res => {
                if (!res.ok) throw new Error('Failed to load glossary')
                return res.json()
            })
            .then(data => {
                setGlossary(data)
                setLoading(false)
            })
            .catch(err => {
                setError(err.message)
                setLoading(false)
            })
    }, [])

    if (loading) {
        return (
            <div className="page-content container">
                <LoadingState message="加载术语表..." />
            </div>
        )
    }

    if (error) {
        return (
            <div className="page-content container">
                <ErrorState
                    title="加载失败"
                    message={error}
                    onRetry={() => window.location.reload()}
                />
            </div>
        )
    }

    const categories = glossary?.categories || []
    const terms = glossary?.terms || []

    // Filter terms
    const filteredTerms = terms.filter(term => {
        const matchesCategory = selectedCategory === 'all' || term.category === selectedCategory
        const matchesSearch = !searchTerm ||
            term.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
            term.term_en.toLowerCase().includes(searchTerm.toLowerCase()) ||
            term.definition.toLowerCase().includes(searchTerm.toLowerCase())
        return matchesCategory && matchesSearch
    })

    return (
        <div className="glossary-page">
            {/* Header */}
            <section className="glossary-hero">
                <div className="container">
                    <Link to="/" className="back-link">← 返回首页</Link>
                    <h1>📖 术语表</h1>
                    <p>课程标准与可迁移技能系统的关键术语定义</p>
                </div>
            </section>

            {/* Filters */}
            <section className="glossary-filters">
                <div className="container">
                    <div className="filter-row">
                        <input
                            type="text"
                            className="input search-input"
                            placeholder="搜索术语..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <div className="category-tabs">
                            <button
                                className={`category-tab ${selectedCategory === 'all' ? 'active' : ''}`}
                                onClick={() => setSelectedCategory('all')}
                            >
                                全部
                            </button>
                            {categories.map(cat => (
                                <button
                                    key={cat.id}
                                    className={`category-tab ${selectedCategory === cat.id ? 'active' : ''}`}
                                    onClick={() => setSelectedCategory(cat.id)}
                                >
                                    {cat.id}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Terms List */}
            <section className="glossary-content">
                <div className="container">
                    <div className="terms-count">
                        共 {filteredTerms.length} 个术语
                    </div>

                    <div className="terms-list">
                        {filteredTerms.map((term, index) => (
                            <div key={index} className="term-card">
                                <div className="term-header">
                                    <h3 className="term-name">{term.term}</h3>
                                    <span className="term-category">{term.category}</span>
                                </div>

                                <p className="term-definition">{term.definition}</p>

                                {term.examples && term.examples.length > 0 && (
                                    <div className="term-examples">
                                        <strong>示例：</strong>
                                        <ul>
                                            {term.examples.map((ex, i) => (
                                                <li key={i}>{ex}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {term.related_terms && term.related_terms.length > 0 && (
                                    <div className="term-related">
                                        <strong>相关术语：</strong>
                                        {term.related_terms.map((rt, i) => (
                                            <span key={i} className="related-tag">{rt}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {filteredTerms.length === 0 && (
                        <div className="empty-state">
                            <p>没有找到匹配的术语</p>
                            <button
                                className="btn btn-secondary"
                                onClick={() => { setSearchTerm(''); setSelectedCategory('all') }}
                            >
                                清除筛选
                            </button>
                        </div>
                    )}
                </div>
            </section>
        </div>
    )
}

export default GlossaryPage
