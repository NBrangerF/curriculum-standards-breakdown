import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle'
import { CircleNotchIcon } from '@phosphor-icons/react/dist/csr/CircleNotch'
import { EnvelopeSimpleIcon } from '@phosphor-icons/react/dist/csr/EnvelopeSimple'
import { HandshakeIcon } from '@phosphor-icons/react/dist/csr/Handshake'
import { LightbulbIcon } from '@phosphor-icons/react/dist/csr/Lightbulb'
import { PaperPlaneTiltIcon } from '@phosphor-icons/react/dist/csr/PaperPlaneTilt'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import { WrenchIcon } from '@phosphor-icons/react/dist/csr/Wrench'
import styles from './FeedbackPage.module.css'

const FEEDBACK_TYPES = [
    { value: 'error', label: '内容纠错', Icon: WrenchIcon },
    { value: 'suggestion', label: '功能建议', Icon: LightbulbIcon },
    { value: 'contact', label: '合作/联系', Icon: HandshakeIcon }
]

const TARGET_EMAIL = 'strangfan@hotmail.com'
const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit'

function validateFeedback(formData) {
    const errors = {}
    if (!formData.title.trim()) errors.title = '请填写标题'
    else if (formData.title.length > 60) errors.title = '标题不能超过 60 字'

    if (!formData.message.trim()) errors.message = '请填写详细说明'
    else if (formData.message.trim().length < 20) errors.message = '详细说明至少需要 20 字'

    if (formData.pageLink.trim()) {
        try {
            const url = new URL(formData.pageLink)
            if (!['http:', 'https:'].includes(url.protocol)) errors.pageLink = '请输入以 http:// 或 https:// 开头的页面链接'
        } catch {
            errors.pageLink = '请输入完整有效的页面链接'
        }
    }

    if (formData.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail)) {
        errors.contactEmail = '请输入有效的邮箱地址'
    }
    return errors
}

function FeedbackPage() {
    const formRef = useRef(null)
    const successHeadingRef = useRef(null)
    const [formData, setFormData] = useState({
        type: 'error',
        title: '',
        message: '',
        pageLink: '',
        relatedCode: '',
        contactEmail: '',
        website: ''
    })
    const [status, setStatus] = useState('idle')
    const [errorMessage, setErrorMessage] = useState('')
    const [fieldErrors, setFieldErrors] = useState({})
    const [touchedFields, setTouchedFields] = useState({})

    useEffect(() => {
        const referrer = document.referrer || window.location.origin
        setFormData(previous => ({ ...previous, pageLink: referrer }))
    }, [])

    useEffect(() => {
        if (status !== 'success') return undefined
        const frame = requestAnimationFrame(() => {
            window.scrollTo({ top: 0, behavior: 'auto' })
            successHeadingRef.current?.focus({ preventScroll: true })
        })
        return () => cancelAnimationFrame(frame)
    }, [status])

    const handleChange = event => {
        const { name, value } = event.target
        const nextData = { ...formData, [name]: value }
        setFormData(nextData)
        if (touchedFields[name]) {
            const nextErrors = validateFeedback(nextData)
            setFieldErrors(previous => ({ ...previous, [name]: nextErrors[name] }))
        }
    }

    const handleBlur = event => {
        const field = event.target.name
        setTouchedFields(previous => ({ ...previous, [field]: true }))
        const nextErrors = validateFeedback(formData)
        setFieldErrors(previous => ({ ...previous, [field]: nextErrors[field] }))
    }

    const handleTypeChange = type => {
        setFormData(previous => ({ ...previous, type }))
    }

    const buildMailtoUrl = () => {
        const typeLabel = FEEDBACK_TYPES.find(type => type.value === formData.type)?.label || formData.type
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

    const handleSubmit = async event => {
        event.preventDefault()

        if (formData.website) {
            setStatus('success')
            return
        }

        const errors = validateFeedback(formData)
        if (Object.keys(errors).length) {
            setFieldErrors(errors)
            setTouchedFields({ title: true, message: true, pageLink: true, contactEmail: true })
            setErrorMessage('请先修正标记的字段')
            setStatus('error')
            const firstInvalidField = Object.keys(errors)[0]
            requestAnimationFrame(() => formRef.current?.elements.namedItem(firstInvalidField)?.focus())
            return
        }

        setFieldErrors({})
        setStatus('loading')
        setErrorMessage('')
        const accessKey = import.meta.env.VITE_WEB3FORMS_KEY || ''

        if (!accessKey) {
            setStatus('error')
            setErrorMessage('在线表单暂未配置。内容仍保留在页面中，你可以改用邮件客户端发送。')
            return
        }

        try {
            const typeLabel = FEEDBACK_TYPES.find(type => type.value === formData.type)?.label || formData.type
            const response = await fetch(WEB3FORMS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({
                    access_key: accessKey,
                    subject: `[kebiao] [${typeLabel}] ${formData.title}`,
                    from_name: formData.contactEmail || '匿名用户',
                    type: typeLabel,
                    title: formData.title,
                    message: formData.message,
                    page_link: formData.pageLink,
                    related_code: formData.relatedCode || '无',
                    contact_email: formData.contactEmail || '未提供'
                })
            })
            const result = await response.json()
            if (!result.success) throw new Error(result.message || '提交失败')
            setStatus('success')
        } catch (error) {
            console.error('Form submission error:', error)
            setStatus('error')
            setErrorMessage('在线提交失败。内容仍保留在页面中，你可以重试或改用邮件发送。')
        }
    }

    const resetForm = () => {
        setStatus('idle')
        setErrorMessage('')
        setFieldErrors({})
        setTouchedFields({})
        setFormData(previous => ({
            ...previous,
            type: 'error',
            title: '',
            message: '',
            relatedCode: '',
            contactEmail: '',
            website: ''
        }))
        requestAnimationFrame(() => requestAnimationFrame(() => formRef.current?.elements.namedItem('title')?.focus()))
    }

    if (status === 'success') {
        return (
            <div className={styles.root} data-kb-route="feedback">
                <div className={`container ${styles.container}`}>
                    <section className={styles.success} aria-labelledby="feedback-success-title">
                        <CheckCircleIcon size={42} weight="fill" aria-hidden="true" />
                        <span>FEEDBACK / RECEIVED</span>
                        <h1 ref={successHeadingRef} id="feedback-success-title" tabIndex="-1">反馈已提交</h1>
                        <p>感谢你帮助我们校正课程标准信息。我们会按内容类型进行核对。</p>
                        <div className={styles.successActions}>
                            <Link to="/" className="btn btn-primary">返回首页</Link>
                            <button type="button" className="btn btn-secondary" onClick={resetForm}>继续提交</button>
                        </div>
                    </section>
                </div>
            </div>
        )
    }

    return (
        <div className={styles.root} data-kb-route="feedback">
            <div className={`container ${styles.container}`}>
                <header className={styles.header}>
                    <div className={styles.intro}>
                        <Link to="/" className={styles.backLink}>
                            <ArrowLeftIcon size={17} aria-hidden="true" />
                            返回首页
                        </Link>
                        <span className={styles.coordinate} aria-hidden="true">FEEDBACK / CORRECTION</span>
                        <h1>反馈与纠错</h1>
                        <p>报告内容问题、提出功能建议，或与 kebiao 团队建立联系。</p>
                    </div>
                    <dl className={styles.process} aria-label="反馈处理说明">
                        <div><dt>01</dt><dd>选择反馈类型</dd></div>
                        <div><dt>02</dt><dd>提供可核对的上下文</dd></div>
                        <div><dt>03</dt><dd>通过在线表单或邮件发送</dd></div>
                    </dl>
                </header>

                <form ref={formRef} className={styles.form} onSubmit={handleSubmit} noValidate>
                    <fieldset className={styles.typeFieldset}>
                        <legend>反馈类型 <span aria-hidden="true">*</span></legend>
                        <div className={styles.typeSelector}>
                            {FEEDBACK_TYPES.map(({ value, label, Icon }) => (
                                <button
                                    key={value}
                                    type="button"
                                    aria-pressed={formData.type === value}
                                    onClick={() => handleTypeChange(value)}
                                >
                                    <Icon size={20} aria-hidden="true" />
                                    <span>{label}</span>
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    <div className={styles.field}>
                        <label htmlFor="title">标题 <span aria-hidden="true">*</span><small>{formData.title.length}/60</small></label>
                        <input
                            id="title"
                            name="title"
                            value={formData.title}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            placeholder="简要描述问题或建议"
                            maxLength={60}
                            aria-invalid={Boolean(fieldErrors.title)}
                            aria-describedby={fieldErrors.title ? 'title-error' : undefined}
                        />
                        {fieldErrors.title ? <p id="title-error" className={styles.fieldError}>{fieldErrors.title}</p> : null}
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="message">详细说明 <span aria-hidden="true">*</span><small>{formData.message.length} 字，至少 20 字</small></label>
                        <textarea
                            id="message"
                            name="message"
                            value={formData.message}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            placeholder="请描述发现位置、当前内容、建议修正方式或预期行为"
                            rows={7}
                            aria-invalid={Boolean(fieldErrors.message)}
                            aria-describedby={fieldErrors.message ? 'message-error' : undefined}
                        />
                        {fieldErrors.message ? <p id="message-error" className={styles.fieldError}>{fieldErrors.message}</p> : null}
                    </div>

                    <div className={styles.fieldGrid}>
                        <div className={styles.field}>
                            <label htmlFor="pageLink">相关页面链接</label>
                            <input
                                id="pageLink"
                                name="pageLink"
                                type="url"
                                value={formData.pageLink}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                placeholder="https://..."
                                aria-invalid={Boolean(fieldErrors.pageLink)}
                                aria-describedby={fieldErrors.pageLink ? 'page-link-error' : undefined}
                            />
                            {fieldErrors.pageLink ? <p id="page-link-error" className={styles.fieldError}>{fieldErrors.pageLink}</p> : null}
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="relatedCode">关联条目代码 <small>可选</small></label>
                            <input id="relatedCode" name="relatedCode" value={formData.relatedCode} onChange={handleChange} placeholder="例如 MA-D2-GE-003" />
                        </div>
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="contactEmail">联系邮箱 <small>可选，方便回复</small></label>
                        <input
                            id="contactEmail"
                            name="contactEmail"
                            type="email"
                            value={formData.contactEmail}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            placeholder="name@example.com"
                            aria-invalid={Boolean(fieldErrors.contactEmail)}
                            aria-describedby={fieldErrors.contactEmail ? 'contact-email-error' : undefined}
                        />
                        {fieldErrors.contactEmail ? <p id="contact-email-error" className={styles.fieldError}>{fieldErrors.contactEmail}</p> : null}
                    </div>

                    <input hidden type="text" name="website" value={formData.website} onChange={handleChange} tabIndex={-1} autoComplete="off" />

                    {status === 'error' ? (
                        <div className={styles.formError} role="alert">
                            <WarningCircleIcon size={20} aria-hidden="true" />
                            <span>{errorMessage}</span>
                        </div>
                    ) : null}

                    <div className={styles.formActions}>
                        <button type="submit" className="btn btn-primary" disabled={status === 'loading'}>
                            {status === 'loading'
                                ? <><CircleNotchIcon className={styles.spinner} size={18} aria-hidden="true" />提交中</>
                                : <><PaperPlaneTiltIcon size={18} aria-hidden="true" />提交反馈</>}
                        </button>
                        {status === 'error' && !Object.keys(fieldErrors).length ? (
                            <a href={buildMailtoUrl()} className="btn btn-secondary">
                                <EnvelopeSimpleIcon size={18} aria-hidden="true" />
                                用邮件客户端发送
                            </a>
                        ) : null}
                        <p className={styles.submitStatus} role="status" aria-live="polite" data-kb-feedback-status={status}>
                            {status === 'loading'
                                ? '正在安全发送，当前输入会完整保留。'
                                : status === 'error'
                                    ? Object.keys(fieldErrors).length
                                        ? '请检查标记字段，当前输入已保留。'
                                        : '在线提交未完成，当前输入已保留，可重试或改用邮件。'
                                    : '提交时不会清空当前输入；在线服务不可用时可切换到邮件。'}
                        </p>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default FeedbackPage
