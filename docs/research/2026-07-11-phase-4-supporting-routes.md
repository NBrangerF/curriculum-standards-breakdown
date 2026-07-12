# Phase 4 支撑路由视觉与交互升级记录

日期：2026-07-11

## 范围

本批次完成清单列表、清单详情、术语表、反馈表单和打印预览。页面责任、字段顺序、本地存储、URL 参数、导入导出、反馈回退和打印行为保持不变；没有新增账号、云同步或搜索相关性逻辑。

## 外部项目

| 项目 | 版本 | 许可证 | 使用边界 |
| --- | --- | --- | --- |
| `@phosphor-icons/react` | 2.1.10 | MIT | 只使用按文件路径导入的界面图标；不作为 kebiao Logo |
| `react-aria-components` | 1.19.0 | Apache-2.0 | 仅用于清单创建/删除 Dialog 的焦点、键盘和跨输入行为；不采用 Adobe 视觉皮肤 |
| `stylelint` | 17.14.0 | MIT | CSS 正确性与兼容性门禁 |
| `stylelint-config-standard` | 40.0.0 | MIT | 在现有 Vanilla CSS 上建立可执行基线；关闭纯格式及遗留 specificity 噪声，保留未知属性、非法值、重复声明等正确性规则 |

官方仓库：

- https://github.com/phosphor-icons/react
- https://github.com/adobe/react-spectrum
- https://github.com/stylelint/stylelint

## 视觉与交互结果

### 清单列表

- 暖/暗渐变和 Emoji 已移除，改为冷白课程坐标系与浏览器本地存储说明。
- 默认清单与普通清单使用统一的实体索引行；奇数最后一项跨满两列，不留下空网格。
- 删除操作始终可见，不再仅靠 hover。
- 新建与删除使用 React Aria Dialog；首字段自动获得焦点，Esc 关闭后焦点返回触发器。
- 导入失败改为上下文内错误，不再使用 `alert`。

### 清单详情

- 数据加载由逐条串行改为 `Promise.all`，保持原始标准顺序。
- 学科、学段、技能覆盖改为无卡片分隔统计表面。
- 移除标准后显示 6 秒可撤销 Toast，并恢复原索引位置。
- 编辑、导出、打印和空状态保留。
- 页面改为路由级 lazy chunk，解除旧 `.hero-content`、`.collection-actions` 等全局选择器对首页的污染。

### 术语表

- 术语由卡片墙改为带当前索引的编辑式定义列表。
- 类别使用 `aria-pressed`，搜索支持显式清除，结果数使用 `aria-live`。
- 中文、英文、定义保持共同检索；示例与相关术语保持原顺序。

### 反馈

- 移除与全站割裂的深色玻璃表面与 Emoji。
- 字段在 blur 后即时校验；提交时聚焦第一个错误字段。
- 在线服务未配置或失败时保留全部输入，并提供邮件回退。
- honeypot 从可访问树中移除。

### Print

- `collection` 与 `codes` URL 参数继续解析，标准并行加载。
- 内容选项使用可聚焦 checkbox，屏幕预览与 A4 黑白输出分离。
- print media 会隐藏全站 Header、Footer 和控制区。
- 无内容和无效清单均有明确状态。

## 加载边界

五个支撑页面均改为 route-level lazy import：

| Chunk | gzip |
| --- | ---: |
| CollectionsPage | 29.29 KB |
| CollectionDetailPage | 4.30 KB |
| FeedbackPage | 9.46 KB |
| GlossaryPage | 3.24 KB |
| PrintPage | 2.64 KB |

主包由上一阶段约 123 KB 降至 Vite gzip 118.98 KB（自定义 budget 统计 116.19 KB）。

## 自动化证据

- E2E：18/18。
- axe：12/12，critical/serious 为 0。
- 视觉基线：8/8。
- 响应式：7 条路由覆盖 1440、1280、1024、768、390、360 六档宽度，无横向溢出。
- Stylelint：通过。
- TypeScript：通过。
- 完整 `npm audit`：0 vulnerabilities。
- Lighthouse CI override 兼容验证通过；三条关键路由全部满足原门槛。

## 未完成

- H4G 审核页仍需单独进行高密度工具视觉与状态升级。
- Style Guide 仍需同步展示新 primitive 与支撑路由状态。
- VoiceOver/NVDA 人工任务流仍未完成。
