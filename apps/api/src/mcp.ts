// A remote MCP server at https://www.kebiao.org/mcp (Streamable HTTP, stateless, JSON responses).
// Clients POST JSON-RPC messages; there is no session and no server-sent stream, since every tool is a
// read-only lookup that answers at once. Spec: https://modelcontextprotocol.io/specification
import type { Context } from 'hono'
import { KEBIAO_TOOLS, ToolInputError, findTool, SITE, type ToolContext } from './ai-tools.js'

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
const SERVER_INFO = { name: 'kebiao', title: 'kebiao 课标', version: '1.0.0', websiteUrl: SITE }
const INSTRUCTIONS = [
    'kebiao 是中国义务教育课程标准（2022年版2025年修订）的结构化索引：14 门学科，每条标准对应一个学段的一个内容单元，下列「要点」逐字取自课标原文并标明页码。',
    '回答课标问题时：先用 search_standards 或 find_textbook_chapter 找到条目，再用 get_standard 看原文；引用时给出编码、要点原文和链接，不要编造编码或改写原文。',
    '标准句可能是 kebiao 用课标原词的概括（会标明）；表现示例和教材对应多为 kebiao 整理或机器对齐，引用时说明。'
].join('\n')

type JsonRpcId = string | number | null
type JsonRpcMessage = { jsonrpc?: string, id?: JsonRpcId, method?: string, params?: Record<string, unknown> }

const result = (id: JsonRpcId, value: unknown) => ({ jsonrpc: '2.0', id, result: value })
const failure = (id: JsonRpcId, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } })

export const MCP_TOOL_LIST = KEBIAO_TOOLS.map(tool => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: { title: tool.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}))

async function answer(message: JsonRpcMessage, ctx: ToolContext) {
    const id = message.id ?? null
    switch (message.method) {
        case 'initialize': {
            const asked = String(message.params?.protocolVersion || '')
            return result(id, {
                protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
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
            const tool = findTool(String(message.params?.name || ''))
            if (!tool) return failure(id, -32602, `Unknown tool: ${String(message.params?.name || '')}`)
            const args = (message.params?.arguments && typeof message.params.arguments === 'object') ? message.params.arguments as Record<string, unknown> : {}
            try {
                const out = await tool.run(args, ctx)
                return result(id, { content: [{ type: 'text', text: out.text }], structuredContent: out.data, isError: false })
            } catch (error) {
                // A caller mistake is a tool result the model can read and correct; anything else is an internal error.
                if (error instanceof ToolInputError) return result(id, { content: [{ type: 'text', text: error.message }], isError: true })
                return result(id, { content: [{ type: 'text', text: 'kebiao 暂时无法完成这次查询，请稍后再试。' }], isError: true })
            }
        }
        default:
            return failure(id, -32601, `Method not found: ${String(message.method)}`)
    }
}

export async function handleMcp(c: Context, ctx: ToolContext) {
    if (c.req.method === 'GET') {
        // No server-to-client stream is offered; a browser visit gets a short pointer instead.
        return c.json({ name: 'kebiao 课标 MCP 服务器', endpoint: `${SITE}/mcp`, transport: 'streamable-http (POST JSON-RPC)', tools: MCP_TOOL_LIST.map(t => t.name), docs: `${SITE}/llms.txt` }, 405, { allow: 'POST' })
    }
    let body: unknown
    try {
        body = await c.req.json()
    } catch {
        return c.json(failure(null, -32700, 'Parse error'), 400)
    }
    const batch = Array.isArray(body)
    const messages = (batch ? body : [body]) as JsonRpcMessage[]
    if (!messages.length || messages.some(m => !m || typeof m !== 'object' || m.jsonrpc !== '2.0')) {
        return c.json(failure(null, -32600, 'Invalid Request'), 400)
    }
    // Notifications and responses from the client get no reply.
    const requests = messages.filter(m => m.method && m.id !== undefined)
    if (!requests.length) return c.body(null, 202)
    const replies = await Promise.all(requests.map(m => answer(m, ctx)))
    c.header('cache-control', 'no-store')
    return c.json(batch ? replies : replies[0])
}
