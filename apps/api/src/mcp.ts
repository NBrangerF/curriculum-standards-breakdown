// A remote MCP server at https://www.kebiao.org/mcp (Streamable HTTP, stateless, JSON responses).
// Every tool is a read-only lookup that answers at once, so there is no session and no server-sent stream.
// It speaks both eras of the protocol (https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning):
// - legacy clients open with initialize and get 2025-11-25 or earlier;
// - modern clients (2026-07-28) send the version in every request's _meta and the MCP-* headers, with no handshake.
import type { Context } from 'hono'
import { KEBIAO_TOOLS, ToolInputError, findTool, runTool, SITE, type ToolContext } from './ai-tools.js'

const MODERN_VERSION = '2026-07-28'
const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const ALL_VERSIONS = [MODERN_VERSION, ...LEGACY_VERSIONS]
export const MAX_BATCH = 20
const SERVER_INFO = {
    name: 'kebiao', title: 'kebiao 课标', version: '1.2.0', websiteUrl: SITE,
    description: '中国义务教育课程标准（2022年版2025年修订）原文、页码与教材逐课对应',
    icons: [{ src: `${SITE}/kebiao-mark.svg`, mimeType: 'image/svg+xml' }]
}
// the tool list is the same for everyone and changes only with a deploy
const LIST_CACHE = { ttlMs: 3_600_000, cacheScope: 'public' }
const META = {
    version: 'io.modelcontextprotocol/protocolVersion',
    capabilities: 'io.modelcontextprotocol/clientCapabilities',
    serverInfo: 'io.modelcontextprotocol/serverInfo'
}
const INSTRUCTIONS = [
    'kebiao 是中国义务教育课程标准（2022年版2025年修订）的结构化索引：14 门学科、513 条标准、2,520 条要点，要点逐字取自课标原文并标明页码；新教材逐课对到要点，附教材原话。所有工具只读，不需要老师的任何个人信息。',
    '怎么选工具：老师说的是教材里的一课，用 find_textbook_chapter，把老师的原话（如「人教版 八年级上册 光的反射」）直接放进 query；说的是教学内容，用 search_standards；要一条标准的全部要点，用 get_standard；从课标反查教材，用 get_textbook_links；核对老师写的学习目标，用 check_objectives；要课堂诊断题，用 get_check_questions；问 2025 修订改了什么，用 compare_versions。',
    '引用规则：课标原文、编码、页码、教材原话只复制工具返回的文字，原文一字不改并放在引号里，附工具给出的 kebiao 链接；编码不要自己拼；工具没找到就如实说没找到，不要凭记忆补写。',
    '标准句可能是 kebiao 用课标原词的概括（会标明）；教材对应和课堂学习目标是 AI 判断，引用时注明「待核验」。',
    'kebiao 整理的数据以 CC BY 4.0 开放，转用时署名「kebiao 课标（https://www.kebiao.org），CC BY 4.0」；课标原文另注教育部《义务教育课程标准（2022年版2025年修订）》。'
].join('\n')

type JsonRpcId = string | number | null
type JsonRpcMessage = { jsonrpc?: string, id?: JsonRpcId, method?: string, params?: Record<string, unknown> }

const result = (id: JsonRpcId, value: unknown) => ({ jsonrpc: '2.0', id, result: value })
const failure = (id: JsonRpcId, code: number, message: string, data?: unknown) => ({ jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } })

export const MCP_TOOL_LIST = KEBIAO_TOOLS.map(tool => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: { title: tool.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}))

async function callTool(message: JsonRpcMessage, ctx: ToolContext) {
    const tool = findTool(String(message.params?.name || ''))
    if (!tool) return null
    const args = (message.params?.arguments && typeof message.params.arguments === 'object') ? message.params.arguments as Record<string, unknown> : {}
    try {
        const out = await runTool(tool, args, ctx)
        return { content: [{ type: 'text', text: out.text }], structuredContent: out.data, isError: false }
    } catch (error) {
        // A caller mistake is a tool result the model can read and correct; anything else is an internal error.
        if (error instanceof ToolInputError) return { content: [{ type: 'text', text: error.message }], isError: true }
        return { content: [{ type: 'text', text: 'kebiao 暂时无法完成这次查询，请稍后再试。' }], isError: true }
    }
}

// Legacy era: initialize negotiates a version for the rest of the conversation (we keep no state either way).
async function answerLegacy(message: JsonRpcMessage, ctx: ToolContext) {
    const id = message.id ?? null
    switch (message.method) {
        case 'initialize': {
            const asked = String(message.params?.protocolVersion || '')
            return result(id, {
                protocolVersion: LEGACY_VERSIONS.includes(asked) ? asked : LEGACY_VERSIONS[0],
                capabilities: { tools: { listChanged: false } },
                serverInfo: SERVER_INFO,
                instructions: INSTRUCTIONS
            })
        }
        case 'ping':
            return result(id, {})
        case 'tools/list':
            return result(id, { tools: MCP_TOOL_LIST })
        case 'tools/call': {
            const out = await callTool(message, ctx)
            return out ? result(id, out) : failure(id, -32602, `Unknown tool: ${String(message.params?.name || '')}`)
        }
        default:
            return failure(id, -32601, `Method not found: ${String(message.method)}`)
    }
}

// Modern era: one request per POST, checked on its own; every result says it is complete and who answered.
async function answerModern(c: Context, message: JsonRpcMessage, ctx: ToolContext) {
    const id = message.id ?? null
    const meta = (message.params?._meta && typeof message.params._meta === 'object') ? message.params._meta as Record<string, unknown> : {}
    const asked = typeof meta[META.version] === 'string' ? meta[META.version] as string : ''
    const reply = (body: unknown, status = 200) => c.json(body, status as 200)
    const complete = (value: Record<string, unknown>) => reply(result(id, { resultType: 'complete', ...value, _meta: { [META.serverInfo]: SERVER_INFO } }))
    // the MCP-* headers mirror the body so intermediaries can route without parsing it; they must agree
    const mismatch = (what: string, header: string | undefined, body: string) => reply(failure(id, -32020, `Header mismatch: ${what} header value '${header ?? ''}' does not match body value '${body}'`), 400)
    const decode = (value: string | undefined) => {
        const b64 = value?.match(/^=\?base64\?(.*)\?=$/u)
        return b64 ? Buffer.from(b64[1], 'base64').toString('utf8') : value
    }
    if (c.req.header('mcp-method') !== message.method) return mismatch('Mcp-Method', c.req.header('mcp-method'), String(message.method))
    if (!asked || !meta[META.capabilities] || typeof meta[META.capabilities] !== 'object') {
        return reply(failure(id, -32602, `Missing required _meta fields: ${META.version} and ${META.capabilities}`), 400)
    }
    if (c.req.header('mcp-protocol-version') !== asked) return mismatch('MCP-Protocol-Version', c.req.header('mcp-protocol-version'), asked)
    if (asked !== MODERN_VERSION) return reply(failure(id, -32022, 'Unsupported protocol version', { supported: ALL_VERSIONS, requested: asked }), 400)
    if (message.method === 'tools/call' && decode(c.req.header('mcp-name')) !== String(message.params?.name || '')) {
        return mismatch('Mcp-Name', c.req.header('mcp-name'), String(message.params?.name || ''))
    }
    if (message.id === undefined) return c.body(null, 202)
    switch (message.method) {
        case 'server/discover':
            return complete({ supportedVersions: ALL_VERSIONS, capabilities: { tools: { listChanged: false } }, instructions: INSTRUCTIONS, ...LIST_CACHE })
        case 'tools/list':
            return complete({ tools: MCP_TOOL_LIST, ...LIST_CACHE })
        case 'tools/call': {
            const out = await callTool(message, ctx)
            return out ? complete(out) : reply(failure(id, -32602, `Unknown tool: ${String(message.params?.name || '')}`))
        }
        default:
            // ping, initialize-era methods, resources/*, prompts/*, subscriptions/listen: none are offered
            return reply(failure(id, -32601, 'Method not found'), 404)
    }
}

const isModern = (c: Context, message: JsonRpcMessage) => {
    if (message.method === 'initialize') return false
    const meta = message.params?._meta as Record<string, unknown> | undefined
    const header = c.req.header('mcp-protocol-version')
    return Boolean(meta && typeof meta === 'object' && META.version in meta) || Boolean(header && !LEGACY_VERSIONS.includes(header))
}

// The data is public and read-only, so any page or desktop app may call (Electron clients send app:// or null);
// only a malformed Origin is refused.
const badOrigin = (origin: string | undefined) => Boolean(origin) && !/^(?:null|[a-z][a-z0-9+.-]*:\/\/[^\s]+)$/iu.test(origin!)

export async function handleMcp(c: Context, ctx: ToolContext) {
    if (badOrigin(c.req.header('origin'))) return c.json(failure(null, -32600, 'Forbidden origin'), 403)
    if (c.req.method === 'GET') {
        // No server-to-client stream is offered; a browser visit gets a short pointer instead.
        return c.json({ name: 'kebiao 课标 MCP 服务器', endpoint: `${SITE}/mcp`, transport: 'streamable-http (POST JSON-RPC)', protocol_versions: ALL_VERSIONS, tools: MCP_TOOL_LIST.map(t => t.name), docs: `${SITE}/llms.txt` }, 405, { allow: 'POST' })
    }
    let body: unknown
    try {
        body = await c.req.json()
    } catch {
        return c.json(failure(null, -32700, 'Parse error'), 400)
    }
    c.header('cache-control', 'no-store')
    const batch = Array.isArray(body)
    const messages = (batch ? body : [body]) as JsonRpcMessage[]
    // one HTTP request counts once against the rate limit, so a batch may not carry thousands of calls
    if (!messages.length || messages.length > MAX_BATCH || messages.some(m => !m || typeof m !== 'object' || m.jsonrpc !== '2.0')) {
        return c.json(failure(null, -32600, 'Invalid Request'), 400)
    }
    if (!batch && isModern(c, messages[0])) return answerModern(c, messages[0], ctx)
    // modern requests travel one per POST; batches belong to the 2025-03-26 era
    if (batch && messages.some(m => isModern(c, m))) return c.json(failure(null, -32600, 'Invalid Request: batches are not allowed in protocol 2026-07-28'), 400)
    // Notifications and responses from the client get no reply.
    const requests = messages.filter(m => m.method && m.id !== undefined)
    if (!requests.length) return c.body(null, 202)
    const replies = await Promise.all(requests.map(m => answerLegacy(m, ctx)))
    return c.json(batch ? replies : replies[0])
}
