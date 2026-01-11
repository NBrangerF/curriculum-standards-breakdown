import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './FeedbackPage.css'

/**
 * FeedbackPage - 反馈与纠错表单
 * 
 * 实现策略:
 * 1. 主路径: Web3Forms (免费表单转发服务)
 * 2. Fallback: mailto 链接预填内容
 * 
 * 配置说明:
 * - 需要在 Web3Forms 获取 access_key
 * - 设置环境变量 VITE_WEB3FORMS_KEY
 * - 或在 Web3Forms dashboard 配置允许域名
 */

const FEEDBACK_TYPES = [
    { value: 'error', label: '内容纠错', icon: '🔧' },
    { value: 'suggestion', label: '功能建议', icon: '💡' },
    { value: 'contact', label: '合作/联系', icon: '🤝' }
]

const TARGET_EMAIL = 'strangfan@hotmail.com'

// Web3Forms endpoint - free tier, no account required for basic use
const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit'

function FeedbackPage() {
    const [formData, setFormData] = useState({
        type: 'error',
        title: '',
        message: '',
        pageLink: '',
        relatedCode: '',
        contactEmail: '',
        // Honeypot field
        website: ''
    })

    const [status, setStatus] = useState('idle') // idle | loading | success | error
    const [errorMessage, setErrorMessage] = useState('')

    // Auto-fill current page link
    useEffect(() => {
        const referrer = document.referrer || window.location.origin
        setFormData(prev => ({ ...prev, pageLink: referrer }))
    }, [])

    const handleChange = (e) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleTypeChange = (type) => {
        setFormData(prev => ({ ...prev, type }))
    }

    // Validate form
    const validateForm = () => {
        if (!formData.title.trim()) {
            return '请填写标题'
        }
        if (formData.title.length > 60) {
            return '标题不能超过60字'
        }
        if (!formData.message.trim()) {
            return '请填写详细说明'
        }
        if (formData.message.length < 20) {
            return '详细说明至少20字'
        }
        if (formData.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail)) {
            return '邮箱格式不正确'
        }
        return null
    }

    // Build mailto fallback URL
    const buildMailtoUrl = () => {
        const typeLabel = FEEDBACK_TYPES.find(t => t.value === formData.type)?.label || formData.type
        const subject = encodeURIComponent(`[${typeLabel}] ${formData.title}`)
        const body = encodeURIComponent(
            `类型: ${typeLabel}\n` +
            `标题: ${formData.title}\n` +
            `页面: ${formData.pageLink}\n` +
            (formData.relatedCode ? `关联条目: ${formData.relatedCode}\n` : '') +
            (formData.contactEmail ? `联系邮箱: ${formData.contactEmail}\n` : '') +
            `\n详细说明:\n${formData.message}`
        )
        return `mailto:${TARGET_EMAIL}?subject=${subject}&body=${body}`
    }

    // Submit form
    const handleSubmit = async (e) => {
        e.preventDefault()

        // Honeypot check - if filled, silently "succeed" but don't send
        if (formData.website) {
            setStatus('success')
            return
        }

        const error = validateForm()
        if (error) {
            setErrorMessage(error)
            setStatus('error')
            return
        }

        setStatus('loading')
        setErrorMessage('')

        // Get access key from env (fallback to placeholder for dev)
        const accessKey = import.meta.env.VITE_WEB3FORMS_KEY || ''

        // If no access key configured, go directly to mailto fallback
        if (!accessKey) {
            console.warn('Web3Forms key not configured, using mailto fallback')
            setStatus('error')
            setErrorMessage('表单服务未配置，请使用邮件客户端发送')
            return
        }

        try {
            const typeLabel = FEEDBACK_TYPES.find(t => t.value === formData.type)?.label || formData.type

            const response = await fetch(WEB3FORMS_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    access_key: accessKey,
                    subject: `[虎鲸课程标准] [${typeLabel}] ${formData.title}`,
                    from_name: formData.contactEmail || '匿名用户',
                    // Form fields
                    type: typeLabel,
                    title: formData.title,
                    message: formData.message,
                    page_link: formData.pageLink,
                    related_code: formData.relatedCode || '无',
                    contact_email: formData.contactEmail || '未提供'
                })
            })

            const result = await response.json()

            if (result.success) {
                setStatus('success')
            } else {
                throw new Error(result.message || '提交失败')
            }
        } catch (err) {
            console.error('Form submission error:', err)
            setStatus('error')
            setErrorMessage('提交失败，请使用邮件客户端发送')
        }
    }

    // Success state
    if (status === 'success') {
        return (
            <div className="feedback-page">
                <div className="feedback-container container">
                    <div className="feedback-card success-card">
                        <div className="success-icon">✅</div>
                        <h2>已提交，感谢反馈！</h2>
                        <p>我们会尽快处理您的反馈。</p>
                        <div className="success-actions">
                            <Link to="/" className="btn btn-primary">返回首页</Link>
                            <button
                                className="btn btn-secondary"
                                onClick={() => {
                                    setStatus('idle')
                                    setFormData(prev => ({
                                        ...prev,
                                        title: '',
                                        message: '',
                                        relatedCode: '',
                                        contactEmail: ''
                                    }))
                                }}
                            >
                                继续提交
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="feedback-page">
            <div className="feedback-container container">
                <div className="feedback-header">
                    <h1>反馈与纠错</h1>
                    <p>用于内容纠错、功能建议与合作联系</p>
                </div>

                <form className="feedback-card" onSubmit={handleSubmit}>
                    {/* Type Selector */}
                    <div className="form-group">
                        <label className="form-label">反馈类型 *</label>
                        <div className="type-selector">
                            {FEEDBACK_TYPES.map(type => (
                                <button
                                    key={type.value}
                                    type="button"
                                    className={`type-btn ${formData.type === type.value ? 'active' : ''}`}
                                    onClick={() => handleTypeChange(type.value)}
                                >
                                    <span className="type-icon">{type.icon}</span>
                                    <span>{type.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Title */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="title">
                            标题 * <span className="char-count">{formData.title.length}/60</span>
                        </label>
                        <input
                            type="text"
                            id="title"
                            name="title"
                            value={formData.title}
                            onChange={handleChange}
                            placeholder="简要描述问题或建议"
                            maxLength={60}
                            className="form-input"
                            required
                        />
                    </div>

                    {/* Message */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="message">
                            详细说明 * <span className="char-count">{formData.message.length}字 (至少20字)</span>
                        </label>
                        <textarea
                            id="message"
                            name="message"
                            value={formData.message}
                            onChange={handleChange}
                            placeholder="请详细描述问题、期望的修正内容或您的建议..."
                            rows={5}
                            className="form-input form-textarea"
                            required
                        />
                    </div>

                    {/* Page Link */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="pageLink">
                            相关页面链接
                        </label>
                        <input
                            type="url"
                            id="pageLink"
                            name="pageLink"
                            value={formData.pageLink}
                            onChange={handleChange}
                            placeholder="https://..."
                            className="form-input"
                        />
                    </div>

                    {/* Related Code */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="relatedCode">
                            关联条目代码 <span className="form-hint">(可选：标准/技能/学科代码)</span>
                        </label>
                        <input
                            type="text"
                            id="relatedCode"
                            name="relatedCode"
                            value={formData.relatedCode}
                            onChange={handleChange}
                            placeholder="如 IT-H1-DL-001 或 TS2"
                            className="form-input"
                        />
                    </div>

                    {/* Contact Email */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="contactEmail">
                            联系邮箱 <span className="form-hint">(可选，方便我们回复)</span>
                        </label>
                        <input
                            type="email"
                            id="contactEmail"
                            name="contactEmail"
                            value={formData.contactEmail}
                            onChange={handleChange}
                            placeholder="your@email.com"
                            className="form-input"
                        />
                    </div>

                    {/* Honeypot - hidden from users */}
                    <input
                        type="text"
                        name="website"
                        value={formData.website}
                        onChange={handleChange}
                        style={{ display: 'none' }}
                        tabIndex={-1}
                        autoComplete="off"
                    />

                    {/* Error Message */}
                    {status === 'error' && (
                        <div className="form-error">
                            <span className="error-icon">⚠️</span>
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="form-actions">
                        <button
                            type="submit"
                            className="btn btn-primary btn-lg"
                            disabled={status === 'loading'}
                        >
                            {status === 'loading' ? (
                                <>
                                    <span className="spinner"></span>
                                    提交中...
                                </>
                            ) : (
                                '提交反馈'
                            )}
                        </button>

                        {status === 'error' && (
                            <a
                                href={buildMailtoUrl()}
                                className="btn btn-secondary btn-lg"
                            >
                                📧 用邮件客户端发送
                            </a>
                        )}
                    </div>
                </form>
            </div>
        </div>
    )
}

export default FeedbackPage
