# 让 AI 用上 kebiao 课标

kebiao 给 AI 提供三个入口，都免费、只读、无需登录：

| 入口 | 地址 | 给谁用 |
| --- | --- | --- |
| MCP 服务器 | `https://www.kebiao.org/mcp` | Claude、Cursor、Cherry Studio、VS Code 等客户端；扣子、元器、ModelScope 也能直接接 |
| 插件 OpenAPI | `https://www.kebiao.org/api/v1/plugin/openapi.yaml` | 接不了 MCP 时的备用：扣子、元器的 API 插件，文心智能体等 |
| llms.txt | `https://www.kebiao.org/llms.txt` | 会读网站说明的 AI 和爬虫 |

两套接口背后是同一组工具（`apps/api/src/ai-tools.ts`），回答内容一致：

| 工具 | 插件接口 | 作用 |
| --- | --- | --- |
| `list_subjects` | `GET /api/v1/plugin/subjects` | 14 门学科、学段和条数 |
| `search_standards` | `GET /api/v1/plugin/search?query=` | 用一句话检索课标，返回命中的要点原文 |
| `get_standard` | `GET /api/v1/plugin/standard?code=` | 一条标准的标准句、全部要点和页码；接受旧编码 |
| `list_standards` | `GET /api/v1/plugin/standards?subject=` | 一门学科（可限学段）的标准列表 |
| `get_stage_goals` | `GET /api/v1/plugin/stage-goals?subject=` | 学段目标原文 |
| `get_textbook_links` | `GET /api/v1/plugin/textbooks?code=` | 一条标准对应的教材章节 |
| `find_textbook_chapter` | `GET /api/v1/plugin/textbook-chapter?query=` | 从教材章节标题找课标 |
| `compare_versions` | `GET /api/v1/plugin/changes?code=` | 2025 修订改了哪些要点 |

每个插件接口都返回 `answer` 字段：一段可直接引用的中文，带编码、要点原文和链接。MCP 工具把同样的文字放在 `content` 里，结构化数据放在 `structuredContent` 里。

速率：MCP 和插件接口匿名每个来源 IP 每分钟 300 次；同样的插件请求会被 CDN 缓存一天。

---

## 一、MCP 客户端

服务器用 Streamable HTTP（POST JSON-RPC），无状态，不需要 API Key。

**Claude（网页版、桌面版）**：设置 → 连接器（Connectors）→ 添加自定义连接器 → 名称填「kebiao 课标」，URL 填 `https://www.kebiao.org/mcp`。

**Claude Code**：

```bash
claude mcp add --transport http kebiao https://www.kebiao.org/mcp
```

**Cursor**：`~/.cursor/mcp.json`

```json
{ "mcpServers": { "kebiao": { "url": "https://www.kebiao.org/mcp" } } }
```

**VS Code**：`.vscode/mcp.json`

```json
{ "servers": { "kebiao": { "type": "http", "url": "https://www.kebiao.org/mcp" } } }
```

**Cherry Studio**：设置 → MCP 服务器 → 添加服务器 → 类型选「可流式传输的 HTTP（streamableHttp）」，URL 填 `https://www.kebiao.org/mcp`。

**自己测试**：

```bash
curl -s https://www.kebiao.org/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_standards","arguments":{"query":"初中物理 浮力"}}}'
```

---

## 二、扣子（Coze）插件

需要你的扣子账号（coze.cn）。插件和智能体在「扣子开发平台」（旧版）里管理；如果打开的是「扣子编程」新版首页，点右上角「回到旧版」。

**创建插件（推荐 MCP，填一个地址就行）**

1. 顶部选工作空间 → 左侧「资源库」→ 右上角「+资源」→「插件」。
2. 类型选 **MCP**。插件名称「kebiao 课标」，一句话介绍和描述用第六节的文案，图标上传 `public/apple-touch-icon.png`；插件 URL 填 `https://www.kebiao.org/mcp`，授权方式选「不需要授权」。
3. 确认后扣子会自动同步 8 个工具。试运行 `search_standards`，`query` 填「分数的大小比较」，返回里有编码和要点原文就算通过。
4. 右上角「发布」。问到是否收集个人信息时选不收集：这些工具不需要用户的任何个人信息。

**备用：导入 OpenAPI**（MCP 类型不可用时）：同一入口点右上角「导入」→「URL 和原始数据」→ 填 `https://www.kebiao.org/api/v1/plugin/openapi.yaml` → 授权方式「不需要授权」。导入的 7 个工具默认没启用：逐个打开「启用」，点「调试」通过后再「发布」。

**上架插件商店**：资源库里找到插件点「上架插件」（或左侧「更多 → 社区 → 插件市场 → 上架插件」），填描述、使用说明和分类后提交。扣子插件商店和企业插件商店只能选一个，选扣子插件商店。插件以后有改动，先在插件页重新发布，再到插件市场的详情页点「提交更新」。

**做一个「课标助手」智能体**：新建智能体 → 人设与回复逻辑粘贴第四节的提示词 → 技能 → 插件里添加「kebiao 课标」的全部工具 → 开场白和预置问题用第四节的示例 → 发布。渠道可选扣子商店、飞书、微信（客服、服务号、订阅号）、抖音和微信小程序、API。每次发布先过扣子审核，再过各渠道审核。

## 三、腾讯元器插件

需要你的元器账号（yuanqi.tencent.com）。元器里能被别人找到的是智能体；插件给你自己的智能体用。

**接入插件**，两种方式按要做的智能体选：

- **MCP 插件**（Multi-Agent 模式和工作流里能用）：插件广场 →「接入MCP插件」→ 填名称「kebiao 课标」和描述，URL 填 `https://www.kebiao.org/mcp` → 保存。
- **API 插件**（单 Agent 模式也能用）：插件广场 →「创建插件」→ 填名称、描述、图标，授权方式选「无需授权」→ 添加工具时按 OpenAPI 导入（见元器帮助中心「OpenAPI、Swagger、Postman 协议的使用说明」），内容用 `https://www.kebiao.org/api/v1/plugin/openapi.yaml` 的全文 →「解析为工具」→「去校验」试运行。校验通过才能保存。

**做智能体并发布**：新建智能体，提示词用第四节的「课标助手」，挂上插件，点发布。

- 发布后默认先上「腾讯元器」渠道。这一步不可撤销，但可以用开放方式限制谁能看到。
- 还可以发布到公众号/服务号、微信客服、企业微信、应用宝、小米应用商店、荣耀 YOYO，或发布成 API。
- 元宝：发布通路里已经没有元宝选项。元器的智能体仍会出现在元宝的「我的 → 智能体」里，但暂时不进元宝应用广场（元器 2025-12 公告）。

---

## 四、「课标助手」提示词

```text
你是「课标助手」，帮助中小学老师查找和引用《义务教育课程标准（2022年版2025年修订）》。

工作方式：
1. 老师问到某个教学内容、单元或一节课时，先用 search_standards（按内容）或 find_textbook_chapter（按教材章节标题）找到对应标准；需要细节时再用 get_standard 看全部要点。
2. 问学段目标用 get_stage_goals；问这条标准在哪本教材、哪一章，用 get_textbook_links；问 2025 修订改了什么，用 compare_versions。
3. 老师给出旧编码（如 MA-D2-AL-005）时，用 get_standard 查它并入了哪条新标准。

回答要求：
- 每条引用都写出编码（如 MA-S3-NA-01.2）、要点原文和 kebiao 链接。原文一字不改，放在引号里。
- 只引用工具返回的内容，不要编造编码、页码或课标原文；工具没找到就说没找到，并建议换个说法。
- 标准句标为「kebiao 整理」的，是用课标原词写的概括，不是课标原句，引用时说明。
- 教材对应是机器对齐，提醒老师核对教材。
- 写教案、学习目标或评价任务时，先列出依据的要点原文，再写你的建议，并把两者分开。
- 用简洁的中文回答，先给结论。

数据来自 kebiao.org，修订版文本取自凤溪中学网站转载的日常修订版，以官方出版物为准。
```

**开场白**：我可以帮你查义务教育课程标准（2025 修订版）：按教学内容或教材章节找课标、看要点原文和页码、查学段目标、看 2025 修订改了什么。

**预置问题**：
- 五年级「分数的基本性质」对应哪条课标？
- 初中物理浮力的课标要求是什么？
- 三年级科学讲植物生长的课标有哪些？
- 2025 修订版的历史课标改了哪些地方？

---

## 五、MCP 目录

都需要你的账号，由你提交。文案用第六节。

**ModelScope 魔搭 MCP 广场**（modelscope.cn/mcp）

1. MCP 广场右上角「创建」→ 左上角切到「自定义创建」。「从 GitHub 快速创建」只认 README 里的本地（STDIO）配置，我们是远程地址，用不了。
2. 英文名填 `kebiao`（服务 ID 会是「你的用户名/kebiao」），显示名「kebiao 课标」，公开，托管类型选「可托管部署」，上传图标。
3. 服务配置选 StreamableHttp，粘贴下面这段（JSON 里不能有注释）：

   ```json
   {"mcpServers":{"kebiao":{"type":"streamable_http","url":"https://www.kebiao.org/mcp"}}}
   ```

4. 创建后魔搭会通过它的代理连一次、列出工具。通过后标上「可部署」「已托管」，Cherry Studio、Kimi Playground、通义灵码这些接了魔搭的客户端就能直接用。

**官方 MCP Registry**（registry.modelcontextprotocol.io）

`docs/ai/server.json` 已经写好，名称是 `io.github.NBrangerF/kebiao`。在仓库根目录运行：

```bash
brew install mcp-publisher
```

```bash
mcp-publisher login github
```

```bash
mcp-publisher publish docs/ai/server.json
```

- 登录时按提示在浏览器里用 NBrangerF 账号授权。
- 不审核，发布即上线。Registry 目前是预览版，可能重置数据。
- 很多 MCP 目录会定期从这里同步。
- 以后改了服务，把 `version` 加一再发布。

**Smithery**（smithery.ai）：打开 smithery.ai/new，填 `https://www.kebiao.org/mcp`，按提示完成。Smithery 会扫描工具列表生成页面，调用经它的网关转发。

**mcp.so**：用网站上的提交入口，填名称、地址和介绍。

## 六、上架文案

- **名称**：kebiao 课标 / kebiao-curriculum-standards
- **一句话介绍**：中国义务教育课程标准（2022年版2025年修订）的检索与查证：14 门学科，要点逐字取自课标原文并标明页码。
- **英文一句话**（英文目录用，100 字符内）：Search and cite China's compulsory-education curriculum standards (2022, rev. 2025), 14 subjects.
- **介绍**：kebiao 把义务教育 14 门学科的课程标准整理成「标准 → 要点」两层：每条标准对应一个学段的一个内容单元，要点逐字取自课标原文并标明页码，旧版编码可以跳到新标准。MCP 服务器提供 8 个只读工具：检索课标、查看标准、列出标准、学段目标、标准对应的教材、从教材章节找课标、2025 修订对照。适合备课、写教案、做单元设计时查依据。
- **连接方式**：Streamable HTTP，`https://www.kebiao.org/mcp`，无需 API Key
- **标签**：教育、课程标准、K12、中文、备课
- **主页**：https://www.kebiao.org
- **源码**：https://github.com/NBrangerF/curriculum-standards-breakdown

---

## 维护

- 工具定义：`apps/api/src/ai-tools.ts`；MCP 协议：`apps/api/src/mcp.ts`；插件路由：`apps/api/src/app.ts`（`/api/v1/plugin/*`）。
- 改了工具参数，要同步改 `docs/api/plugin-openapi.yaml`，并在扣子、元器里重新导入或重新同步；`docs/ai/server.json` 的 `version` 加一后重新发布到 Registry。
- `find_textbook_chapter` 读 `public/data/v2/textbook_chapters.json`，由 `scripts/build-public-v2.mjs` 生成；教材目录缓存在 `data/v2/textbook_contents.json`（`node scripts/v2/cache_textbook_contents.mjs`，需要教材盘）。
- `public/llms.txt` 也由 `scripts/build-public-v2.mjs` 按当前条数生成。
