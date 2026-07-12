import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import styles from './ApiPage.module.css'

const CAPABILITIES = [
    {
        index: '01',
        title: '检索结构化课程标准',
        description: '按学科、年级、领域、可迁移技能或关键词筛选标准，并批量读取指定标准。',
        endpoints: ['POST /standards/search', 'POST /standards/batch', 'GET /standards/{code}']
    },
    {
        index: '02',
        title: '理解标准之间的关系',
        description: '查询前后进阶、相邻标准和证据摘要，让课程图谱与学习路径拥有可追溯的数据基础。',
        endpoints: ['GET /standards/{code}/progression', 'GET /standards/{code}/neighbors', 'GET /standards/{code}/evidence']
    },
    {
        index: '03',
        title: '把教学计划连接到课标',
        description: '解析与校验教学计划、匹配相关标准、分析覆盖情况，并生成按周教学安排。',
        endpoints: ['POST /matching/plan-to-standards', 'POST /coverage/analyze', 'POST /schedules/weekly']
    }
]

const ACCESS_LEVELS = [
    ['公开访问', '无需 API Key', '公开字段、基础检索与元信息；每分钟 30 次请求。'],
    ['开发者', 'x-api-key', '每分钟 300 次请求，并可申请来源与证据字段。'],
    ['合作伙伴', '定制权限', '每分钟 3,000 次请求，可申请教材字段与更深度集成。']
]

function ApiPage() {
    const [copied, setCopied] = useState(false)
    const apiBase = `${window.location.origin}/api/v1`
    const example = useMemo(() => `curl --request POST '${apiBase}/standards/search' \\
  --header 'Content-Type: application/json' \\
  --data '{
    "subjects": ["science"],
    "grade_bands": ["H4G7"],
    "keyword": "观察",
    "limit": 3
  }'`, [apiBase])

    const copyExample = async () => {
        try {
            await navigator.clipboard.writeText(example)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1800)
        } catch {
            setCopied(false)
        }
    }

    return (
        <div className={styles.page} data-kb-route="api">
            <section className={styles.hero}>
                <div className={`container ${styles.heroLayout}`}>
                    <div className={styles.heroCopy}>
                        <span className={styles.eyebrow}>KEBIAO API · V1</span>
                        <h1>把课程标准接入你的教育产品</h1>
                        <p>通过稳定、版本化的接口检索中国课程标准，理解标准关系，并把教学计划连接到真实、可追溯的数据。</p>
                        <div className={styles.heroActions}>
                            <a className="btn btn-primary btn-lg" href="/api/v1/docs">打开完整 API 文档</a>
                            <Link className="btn btn-secondary btn-lg" to="/contact">联系我们</Link>
                        </div>
                    </div>
                    <div className={styles.endpointPanel} aria-label="API 基本信息">
                        <span>BASE URL</span>
                        <code>{apiBase}</code>
                        <div className={styles.endpointMeta}>
                            <span><i aria-hidden="true"></i>公开接口可直接体验</span>
                            <a href="/api/v1/health">查看服务状态 →</a>
                        </div>
                    </div>
                </div>
            </section>

            <section className={styles.capabilities} aria-labelledby="api-capabilities-title">
                <div className="container">
                    <div className={styles.sectionIntro}>
                        <span>WHAT YOU CAN BUILD</span>
                        <div>
                            <h2 id="api-capabilities-title">一套数据，多种教育场景</h2>
                            <p>适用于课程检索、教学设计工具、知识图谱、学习路径、课程审查与 AI 教育应用。</p>
                        </div>
                    </div>
                    <div className={styles.capabilityList}>
                        {CAPABILITIES.map(capability => (
                            <article className={styles.capability} key={capability.index}>
                                <span className={styles.capabilityIndex}>{capability.index}</span>
                                <div className={styles.capabilityCopy}>
                                    <h3>{capability.title}</h3>
                                    <p>{capability.description}</p>
                                </div>
                                <div className={styles.endpointList}>
                                    {capability.endpoints.map(endpoint => <code key={endpoint}>{endpoint}</code>)}
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className={styles.quickStart} id="quick-start" aria-labelledby="quick-start-title">
                <div className={`container ${styles.quickStartLayout}`}>
                    <div className={styles.quickStartCopy}>
                        <span className={styles.sectionLabel}>QUICK START</span>
                        <h2 id="quick-start-title">三步完成第一次调用</h2>
                        <ol>
                            <li><span>1</span><div><strong>选择公开接口</strong><p>基础检索无需 API Key，可直接从浏览器、终端或服务端调用。</p></div></li>
                            <li><span>2</span><div><strong>发送 JSON 请求</strong><p>使用英文键名传入学科、年级、关键词和返回数量。</p></div></li>
                            <li><span>3</span><div><strong>读取统一响应</strong><p>业务结果位于 <code>data</code>，版本、分页与请求追踪信息位于 <code>meta</code>。</p></div></li>
                        </ol>
                    </div>
                    <div className={styles.codeExample}>
                        <div className={styles.codeToolbar}>
                            <span>curl · 标准检索</span>
                            <button type="button" onClick={copyExample}>{copied ? '已复制' : '复制代码'}</button>
                        </div>
                        <pre><code>{example}</code></pre>
                        <span className={styles.copyStatus} aria-live="polite">{copied ? '示例代码已复制到剪贴板' : ''}</span>
                    </div>
                </div>
            </section>

            <section className={styles.contract} aria-labelledby="response-contract-title">
                <div className={`container ${styles.contractLayout}`}>
                    <div>
                        <span className={styles.sectionLabel}>RESPONSE CONTRACT</span>
                        <h2 id="response-contract-title">可预测的响应，便于长期集成</h2>
                        <p>所有接口都返回数据版本与请求 ID。请求失败时使用正确的 HTTP 状态码，并提供稳定的英文错误代码，方便程序处理与问题排查。</p>
                        <a href="/api/v1/openapi.yaml">查看 OpenAPI 3.1 契约 →</a>
                    </div>
                    <pre className={styles.responseExample}><code>{`{
  "data": [ ... ],
  "meta": {
    "request_id": "...",
    "data_version": "...",
    "total": 3,
    "next_cursor": null
  }
}`}</code></pre>
                </div>
            </section>

            <section className={styles.access} aria-labelledby="api-access-title">
                <div className="container">
                    <div className={styles.sectionIntro}>
                        <span>ACCESS</span>
                        <div>
                            <h2 id="api-access-title">从公开体验开始</h2>
                            <p>需要更高频率、更多字段或产品级支持时，可以联系我们讨论合适的访问层级。</p>
                        </div>
                    </div>
                    <div className={styles.accessTable}>
                        {ACCESS_LEVELS.map(([name, auth, detail]) => (
                            <div className={styles.accessRow} key={name}>
                                <strong>{name}</strong>
                                <code>{auth}</code>
                                <p>{detail}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className={styles.cta}>
                <div className={`container ${styles.ctaLayout}`}>
                    <div>
                        <span>NEED MORE?</span>
                        <h2>需要新的端点、字段或集成支持？</h2>
                        <p>告诉我们你的产品场景、需要的数据范围和预计调用规模，我们会一起评估可行的 API 方案。</p>
                    </div>
                    <Link className="btn btn-primary btn-lg" to="/contact">联系我们讨论 API</Link>
                </div>
            </section>
        </div>
    )
}

export default ApiPage
