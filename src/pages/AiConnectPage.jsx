import { useState } from 'react'
import { Link } from 'react-router-dom'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import concepts from './ConceptsPage.module.css'
import guide from './GuidePage.module.css'
import styles from './AiConnectPage.module.css'

// 在 AI 里用 kebiao: connect the AI a teacher already uses to kebiao's read-only tools, so every 课标 it quotes
// comes with the code, the 原文, the page and a link back here.
export const MCP_URL = 'https://www.kebiao.org/mcp'
const MCP_JSON = JSON.stringify({ mcpServers: { kebiao: { type: 'streamableHttp', url: MCP_URL } } }, null, 2)

export const PROMPTS = [
    {
        id: 'basis', title: '查依据',
        text: '用 kebiao 查一下：人教版数学五年级下册《分数的基本性质》对应哪几条课标要点？列出编码、要点原文、页码和 kebiao 链接，原文一字不改。'
    },
    {
        id: 'plan', title: '先确认依据，再写教案',
        text: '我要备人教版数学五年级下册《分数的基本性质》第 1 课时，班上 45 人。请分三步：\n1. 先用 kebiao 查这一课对应的课标要点和它在教材里的位置，列给我确认，先不要写教案；\n2. 等我确认或修改要点后，再写教案；\n3. 每个教学目标后面标出依据的要点编码，最后列出全部依据和 kebiao 链接。\n不要编造编码和课标原文。'
    },
    {
        id: 'check', title: '核对我自己的教案',
        text: '下面是我写的教案。请用 kebiao 查它对应的课标要点，告诉我：哪些目标有课标依据（给编码和原文）、哪些超出了本学段的要求、有没有漏掉这一课该教的要点。只指出问题和依据，不要替我重写。\n\n（把教案贴在这里）'
    }
]

const CLIENTS = [
    { name: '扣子', how: '资源库 → 新建插件 → 类型选 MCP，插件 URL 填上面的地址，授权选「不需要授权」。' },
    { name: 'Cherry Studio · 魔搭', how: '设置 → MCP 服务器 → 添加服务器，类型选 streamableHttp，URL 填上面的地址。' },
    { name: 'Claude', how: '设置 → 连接器 → 添加自定义连接器，名称「kebiao 课标」，URL 填上面的地址。' },
    { name: 'Cursor · VS Code · 其他 MCP 客户端', how: 'Cursor 在 ~/.cursor/mcp.json 里加 {"mcpServers":{"kebiao":{"url":"https://www.kebiao.org/mcp"}}}；VS Code 用 {"servers":{"kebiao":{"type":"http","url":"https://www.kebiao.org/mcp"}}}。' },
    { name: '只能接 API 的平台', how: '用插件 OpenAPI：https://www.kebiao.org/api/v1/plugin/openapi.yaml，不需要授权。' }
]

const TOOLS = [
    ['检索课标', '一句话找课标，返回命中的要点原文'],
    ['查看标准', '标准句、全部要点和页码；旧编码会说明并入了哪条'],
    ['从教材章节找课标', '按教材的课题找它主要在教的要点和教材原话'],
    ['标准对应的教材', '一条课标在哪些教材的哪一课教'],
    ['学段目标', '各学科学段目标原文'],
    ['2025 修订对照', '一条标准在修订版里改了什么'],
    ['课堂诊断题', '全班一起作答的题，每个错误答案对应一种常见错法'],
    ['列出标准 · 列出学科', '浏览一门学科或全部 14 门学科']
]

export function CopyBlock({ text, label }) {
    const [copied, setCopied] = useState(false)
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1800)
        } catch {
            setCopied(false)
        }
    }
    return (
        <div className={styles.block}>
            <pre tabIndex={0} aria-label={label}>{text}</pre>
            <button type="button" className="btn btn-secondary" onClick={copy}>{copied ? '已复制' : '复制'}</button>
        </div>
    )
}

export default function AiConnectPage() {
    usePageMeta(STATIC_PAGE_META['/ai'])
    return (
        <div className={`container ${concepts.page}`}>
            <header className={concepts.hero}>
                <p className={concepts.kicker}>在 AI 里用 kebiao · 免费、只读、不用登录</p>
                <h1 className={concepts.title}>让你常用的 AI 引用课标原文</h1>
                <p className={concepts.lede}>WorkBuddy、扣子、豆包这些 AI 会写教案，但不知道 2025 修订版课标的原文，也不知道你手上这本教材。把 kebiao 接进去以后，它查到的每条课标都带编码、原文、页码和 kebiao 链接，你可以点回来核对。依据是什么、用不用，由你决定。</p>
                <ul className={guide.jump} aria-label="本页内容">
                    <li><a href="#ai-workbuddy">WorkBuddy</a></li>
                    <li><a href="#ai-prompts">三条提示词</a></li>
                    <li><a href="#ai-clients">扣子、魔搭和其他</a></li>
                    <li><a href="#ai-no-connector">豆包、DeepSeek</a></li>
                </ul>
            </header>

            <section id="ai-workbuddy" className={styles.section}>
                <p className={guide.who}>腾讯 WorkBuddy · 教师版每月有免费积分</p>
                <h2>在 WorkBuddy 里接上 kebiao</h2>
                <ol className={guide.steps}>
                    <li>打开 WorkBuddy，进入「连接器」，选「自定义连接器」。</li>
                    <li>粘贴下面这段配置，名称写「kebiao 课标」，保存。</li>
                    <li>新开一个对话，用下面的提示词试一次。回答里出现 MA-S3- 这样的编码和 kebiao.org 链接，就接好了。</li>
                </ol>
                <CopyBlock text={MCP_JSON} label="WorkBuddy 自定义连接器配置" />
                <p className={styles.note}>只有地址的地方填 <code>{MCP_URL}</code>。传输方式是 Streamable HTTP，不需要 API Key。</p>
            </section>

            <section id="ai-prompts" className={styles.section}>
                <p className={guide.who}>换成你自己的教材和课题</p>
                <h2>三条提示词</h2>
                <div className={styles.prompts}>
                    {PROMPTS.map(prompt => (
                        <div key={prompt.id} className={styles.prompt}>
                            <h3>{prompt.title}</h3>
                            <CopyBlock text={prompt.text} label={`提示词：${prompt.title}`} />
                        </div>
                    ))}
                </div>
                <p className={styles.note}>第二条让 AI 先把依据交给你确认，第三条只挑问题不重写。教案由你定稿，AI 和 kebiao 只提供依据和检查。</p>
            </section>

            <section id="ai-clients" className={styles.section}>
                <p className={guide.who}>同一个地址，各家都能接</p>
                <h2>扣子、魔搭和其他 AI 工具</h2>
                <CopyBlock text={MCP_URL} label="kebiao MCP 服务器地址" />
                <dl className={styles.clients}>
                    {CLIENTS.map(client => (
                        <div key={client.name}><dt>{client.name}</dt><dd>{client.how}</dd></div>
                    ))}
                </dl>
                <h3 className={styles.subhead}>接上以后能查什么</h3>
                <ul className={styles.tools}>
                    {TOOLS.map(([name, what]) => <li key={name}><b>{name}</b>{what}</li>)}
                </ul>
            </section>

            <section id="ai-no-connector" className={styles.section}>
                <p className={guide.who}>网页版豆包、DeepSeek、元宝</p>
                <h2>接不了连接器的 AI</h2>
                <p className={styles.para}>在 <Link to="/lesson-plan">AI 备课</Link>里选好教材和这一课、勾好要点后点「复制成提示词」，或者在任一条课标页面点「复制成提示词」，课标原文和页码会一起带过去，贴进你常用的 AI 就行。</p>
            </section>

            <p className={concepts.footnote}>这些工具只读，不收集任何个人信息；请不要把学生姓名等个人信息或考试原题发给 AI。每个回答都带 kebiao 链接；课标原文取自《义务教育课程标准（2022年版2025年修订）》，教材对应是 AI 判断、待核验。开发者看 <Link to="/open-data">数据与接口</Link> 和 <a href="/llms.txt">llms.txt</a>。</p>
        </div>
    )
}
