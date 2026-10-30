# 让 AI 用上 kebiao 课标

kebiao 给 AI 提供三个入口，都免费、只读、无需登录：

| 入口 | 地址 | 给谁用 |
| --- | --- | --- |
| MCP 服务器 | `https://www.kebiao.org/mcp` | Claude、Cursor、Cherry Studio、VS Code 等支持 MCP 的客户端 |
| 插件 OpenAPI | `https://www.kebiao.org/api/v1/plugin/openapi.yaml` | 扣子（Coze）、腾讯元器等智能体平台 |
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

需要你的扣子账号（coze.cn）。

1. 工作空间 → 资源库 → 新建 → 插件 → 选「云侧插件 - 基于已有服务创建」里的**导入**（或在插件页右上角点「导入」）。
2. 选「URL 和原始数据」，填 `https://www.kebiao.org/api/v1/plugin/openapi.yaml`，下一步。
3. 插件名称「kebiao 课标」，图标用 `https://www.kebiao.org/apple-touch-icon.png`；授权方式选「不需要授权」。
4. 导入后会出现 7 个工具。逐个点「调试」，例如 `search_standards` 填 `query=分数的大小比较`，看到 `answer` 有内容就点「完成」。
5. 全部调试通过后点「发布」。想让别人也能搜到，再在插件详情里「上架到商店」。

**做一个「课标助手」智能体**：新建智能体 → 人设与回复逻辑粘贴下面的提示词 → 技能 → 插件里添加「kebiao 课标」的全部工具 → 开场白和预置问题用下面的示例 → 发布到扣子商店（以及你想要的渠道，如豆包、飞书、微信公众号）。

## 三、腾讯元器插件

需要你的元器账号（yuanqi.tencent.com）。

1. 插件 → 创建插件 → 选「导入 API」或「通过 OpenAPI 创建」，粘贴 `https://www.kebiao.org/api/v1/plugin/openapi.yaml` 的内容（元器要求粘贴原文时，先在浏览器打开这个地址复制全文）。
2. 服务地址 `https://www.kebiao.org`，鉴权选「无需鉴权」。
3. 逐个工具测试后提交审核。
4. 新建智能体，提示词用下面的「课标助手」，挂上这个插件，发布到元器和微信（公众号、小程序、QQ）。

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

## 五、上架文案（ModelScope MCP 广场、mcp.so 等）

需要你的账号，由你提交。

- **名称**：kebiao 课标 / kebiao-curriculum-standards
- **一句话介绍**：中国义务教育课程标准（2022年版2025年修订）的检索与查证：14 门学科，要点逐字取自课标原文并标明页码。
- **介绍**：kebiao 把义务教育 14 门学科的课程标准整理成「标准 → 要点」两层：每条标准对应一个学段的一个内容单元，要点逐字取自课标原文并标明页码，旧版编码可以跳到新标准。MCP 服务器提供 8 个只读工具：检索课标、查看标准、列出标准、学段目标、标准对应的教材、从教材章节找课标、2025 修订对照。适合备课、写教案、做单元设计时查依据。
- **连接方式**：Streamable HTTP，`https://www.kebiao.org/mcp`，无需 API Key
- **标签**：教育、课程标准、K12、中文、备课
- **主页**：https://www.kebiao.org
- **源码**：https://github.com/NBrangerF/curriculum-standards-breakdown

---

## 维护

- 工具定义：`apps/api/src/ai-tools.ts`；MCP 协议：`apps/api/src/mcp.ts`；插件路由：`apps/api/src/app.ts`（`/api/v1/plugin/*`）。
- 改了工具参数，要同步改 `docs/api/plugin-openapi.yaml`，并在扣子、元器里重新导入。
- `find_textbook_chapter` 读 `public/data/v2/textbook_chapters.json`，由 `scripts/build-public-v2.mjs` 生成；教材目录缓存在 `data/v2/textbook_contents.json`（`node scripts/v2/cache_textbook_contents.mjs`，需要教材盘）。
- `public/llms.txt` 也由 `scripts/build-public-v2.mjs` 按当前条数生成。
