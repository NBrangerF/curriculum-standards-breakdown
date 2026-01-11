import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { getCollection } from '../data/collections'
import { loadStandardByCode, GRADE_BANDS, SKILL_COLORS } from '../data/dataLoader'
import { LoadingState } from '../components/StateComponents'
import './PrintPage.css'

function PrintPage() {
    const [searchParams] = useSearchParams()
    const [loading, setLoading] = useState(true)
    const [standards, setStandards] = useState([])
    const [title, setTitle] = useState('课程标准')

    // Options
    const [showContext, setShowContext] = useState(true)
    const [showPractice, setShowPractice] = useState(true)
    const [showTips, setShowTips] = useState(false)
    const [showAssessment, setShowAssessment] = useState(false)

    // Load standards from URL params
    useEffect(() => {
        const loadData = async () => {
            setLoading(true)

            const collectionId = searchParams.get('collection')
            const codesParam = searchParams.get('codes')

            let codes = []

            if (collectionId) {
                const col = getCollection(collectionId)
                if (col) {
                    setTitle(col.name)
                    codes = col.standardCodes
                }
            } else if (codesParam) {
                codes = codesParam.split(',').filter(Boolean)
                setTitle(`${codes.length} 条课程标准`)
            }

            const loaded = []
            for (const code of codes) {
                const std = await loadStandardByCode(code)
                if (std) loaded.push(std)
            }

            setStandards(loaded)
            setLoading(false)
        }

        loadData()
    }, [searchParams])

    const handlePrint = () => {
        window.print()
    }

    if (loading) {
        return (
            <div className="print-page">
                <div className="print-controls no-print">
                    <LoadingState message="加载标准..." />
                </div>
            </div>
        )
    }

    return (
        <div className="print-page">
            {/* Controls - Hidden in print */}
            <div className="print-controls no-print">
                <div className="controls-header">
                    <Link to="/collections" className="back-link">← 返回</Link>
                    <h2>打印预览</h2>
                </div>

                <div className="options-grid">
                    <label className="option">
                        <input
                            type="checkbox"
                            checked={showContext}
                            onChange={e => setShowContext(e.target.checked)}
                        />
                        包含情境说明
                    </label>
                    <label className="option">
                        <input
                            type="checkbox"
                            checked={showPractice}
                            onChange={e => setShowPractice(e.target.checked)}
                        />
                        包含实践建议
                    </label>
                    <label className="option">
                        <input
                            type="checkbox"
                            checked={showTips}
                            onChange={e => setShowTips(e.target.checked)}
                        />
                        包含教学提示
                    </label>
                    <label className="option">
                        <input
                            type="checkbox"
                            checked={showAssessment}
                            onChange={e => setShowAssessment(e.target.checked)}
                        />
                        包含评价证据
                    </label>
                </div>

                <button className="btn btn-primary print-btn" onClick={handlePrint}>
                    🖨️ 打印
                </button>
            </div>

            {/* Printable Content */}
            <div className="print-content">
                <header className="print-header">
                    <h1>{title}</h1>
                    <p className="print-meta">共 {standards.length} 条标准 | 打印时间: {new Date().toLocaleDateString()}</p>
                </header>

                <div className="print-standards">
                    {standards.map((std, index) => (
                        <div key={std.code} className="print-standard">
                            <div className="print-standard-header">
                                <span className="print-number">{index + 1}</span>
                                <span className="print-code">{std.code}</span>
                                <span className="print-subject">{std.subject}</span>
                                <span className="print-band">{GRADE_BANDS[std.grade_band]?.label || std.grade_band}</span>
                            </div>

                            <div className="print-standard-meta">
                                <span>领域: {std.domain}</span>
                                {std.subdomain && <span>子领域: {std.subdomain}</span>}
                            </div>

                            <p className="print-standard-text">{std.standard}</p>

                            {std.ts_primary?.length > 0 && (
                                <div className="print-skills">
                                    技能: {std.ts_primary.join(', ')}
                                    {std.ts_secondary?.length > 0 && `, ${std.ts_secondary.join(', ')}`}
                                </div>
                            )}

                            {showContext && std.context && (
                                <div className="print-detail">
                                    <strong>情境说明:</strong>
                                    <p>{std.context}</p>
                                </div>
                            )}

                            {showPractice && std.practice && (
                                <div className="print-detail">
                                    <strong>实践建议:</strong>
                                    <p>{std.practice}</p>
                                </div>
                            )}

                            {showTips && std.teaching_tip && (
                                <div className="print-detail">
                                    <strong>教学提示:</strong>
                                    <p>{std.teaching_tip}</p>
                                </div>
                            )}

                            {showAssessment && std.assessment_evidence_type && (
                                <div className="print-detail">
                                    <strong>评价证据:</strong>
                                    <p>{std.assessment_evidence_type}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <footer className="print-footer">
                    <p>义务教育课程标准（2022年版）| 仅供教学研究参考</p>
                </footer>
            </div>
        </div>
    )
}

export default PrintPage
