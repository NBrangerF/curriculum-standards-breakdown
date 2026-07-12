import styles from './ContactPage.module.css'

const CONTACTS = [
    {
        label: 'Email',
        title: 'strangfan@hotmail.com',
        description: 'API 需求、数据合作与项目沟通，建议优先通过邮件联系。',
        href: 'mailto:strangfan@hotmail.com?subject=kebiao%20API%20合作咨询',
        action: '发送邮件'
    },
    {
        label: 'Website',
        title: 'sichuangfan.com',
        description: '了解我的研究、课程设计、教育技术与其他项目。',
        href: 'https://sichuangfan.com',
        action: '访问网站'
    },
    {
        label: 'GitHub',
        title: '@NBrangerF',
        description: '查看 kebiao 及其他公开项目、代码与开发动态。',
        href: 'https://github.com/NBrangerF',
        action: '查看 GitHub'
    }
]

function ExternalArrow() {
    return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 15L15 5M8 5h7v7" />
        </svg>
    )
}

function ContactPage() {
    return (
        <div className={styles.page} data-kb-route="contact">
            <section className={styles.hero}>
                <div className={`container ${styles.heroLayout}`}>
                    <div>
                        <span className={styles.eyebrow}>CONTACT · 联系</span>
                        <h1>一起把课程数据做得更有用</h1>
                    </div>
                    <p>如果你需要 API 的更多功能、希望将课程标准接入产品，或想讨论课程设计与教育技术合作，欢迎联系我。</p>
                </div>
            </section>

            <section className={styles.contactSection} aria-labelledby="contact-options-title">
                <div className={`container ${styles.contactLayout}`}>
                    <div className={styles.contactIntro}>
                        <span>DIRECT CONTACT</span>
                        <h2 id="contact-options-title">联系方式</h2>
                        <p>邮件通常是最清晰的起点。请简单说明你的使用场景、需要的能力或希望合作的方向。</p>
                    </div>
                    <div className={styles.contactList}>
                        {CONTACTS.map(contact => (
                            <a
                                className={styles.contactRow}
                                href={contact.href}
                                key={contact.label}
                                target={contact.href.startsWith('http') ? '_blank' : undefined}
                                rel={contact.href.startsWith('http') ? 'noreferrer' : undefined}
                            >
                                <span className={styles.contactLabel}>{contact.label}</span>
                                <div>
                                    <h3>{contact.title}</h3>
                                    <p>{contact.description}</p>
                                </div>
                                <span className={styles.contactAction}>{contact.action}<ExternalArrow /></span>
                            </a>
                        ))}
                    </div>
                </div>
            </section>

            <section className={styles.wechatSection} id="wechat" aria-labelledby="wechat-title">
                <div className={`container ${styles.wechatLayout}`}>
                    <div className={styles.wechatCopy}>
                        <span>WECHAT PUBLIC ACCOUNT</span>
                        <h2 id="wechat-title">关注公众号</h2>
                        <p>使用微信扫描二维码，关注我的公众号。这里会分享教育研究、课程设计、AI 与学习系统相关内容。</p>
                        <small>请使用微信扫一扫</small>
                    </div>
                    <figure className={styles.qrFigure}>
                        <div className={styles.qrFrame}>
                            <img src="/wechat-public-account-qr.jpg" alt="Sichuang Fan 微信公众号二维码" width="258" height="258" />
                            <span className={styles.scanLine} aria-hidden="true"></span>
                        </div>
                        <figcaption>微信公众号 · WeChat</figcaption>
                    </figure>
                </div>
            </section>

            <section className={styles.scopeSection} aria-labelledby="contact-scope-title">
                <div className="container">
                    <div className={styles.scopeHeader}>
                        <span>GOOD TO INCLUDE</span>
                        <h2 id="contact-scope-title">联系时可以告诉我</h2>
                    </div>
                    <div className={styles.scopeList}>
                        <div><span>01</span><strong>你的使用场景</strong><p>课程平台、知识图谱、教学设计工具、AI 应用或研究项目。</p></div>
                        <div><span>02</span><strong>需要的 API 能力</strong><p>新的端点、更多字段、调用频率、批量访问或技术支持。</p></div>
                        <div><span>03</span><strong>希望达成的结果</strong><p>预计时间、用户规模，以及你希望这次合作解决的问题。</p></div>
                    </div>
                </div>
            </section>
        </div>
    )
}

export default ContactPage
