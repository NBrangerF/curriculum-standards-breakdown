# 反馈页校验与提交状态闭环

日期：2026-07-12

## 对应主计划

闭环 `8.10 反馈页`：即时字段校验、首错聚焦、提交中/成功/失败完整状态、网络失败保留输入。

## Skill 与项目决策

- `frontend-skill`：采用 Linear-style 克制工作面；处理说明、字段和状态各自只有一个职责，不增加表单卡片墙或营销式状态页。
- 保留现有 React controlled form。当前只有 6 个可见字段，引入 React Hook Form、Formik 或 Zod 会增加运行时与双重状态源，无法提升当前体验。
- [Playwright](https://github.com/microsoft/playwright)：测试服务器使用假 Web3Forms key，并通过网络拦截控制 pending、503 failure 和 success；不使用蜜罐分支伪造成功。
- Web3Forms 保持原生产接口；测试 key 只存在于 Playwright webServer command，不进入生产构建或文档秘密。

## 实现

- `相关页面链接` 增加与 `noValidate` 表单一致的自定义校验，只接受完整 HTTP/HTTPS URL。
- 字段失焦即时显示错误；被触碰字段在继续输入时即时恢复。
- 提交按钮 pending 时禁用并显示“提交中”；同一 live status 明确说明当前输入会保留。
- 服务失败保留所有字段，显示原位错误、重试入口和 mailto 降级。
- 成功态替换表单后将页面恢复顶端，再以 `preventScroll` 聚焦成功标题，避免 sticky Header 遮挡标题。
- “继续提交”清空上一轮正文并将焦点放回标题字段。

## 状态证据

- Validation：空提交聚焦标题；无效页面 URL 原位报错；修正后错误立即消失。
- Pending：Web3Forms 请求延迟期间按钮 disabled、名称为“提交中”，live status 可见。
- Failure：503 响应进入失败态，标题和详细说明保持原值，邮件客户端入口出现。
- Success：成功响应进入确认页，标题获得焦点；继续提交恢复干净表单并聚焦标题。

## 验证

- 全量交互/内容/回滚/响应式：57/57。
- axe/辅助模式：26/26，成功态 critical/serious 为 0。
- visual：20/20，新增服务失败保留输入与成功状态基线。
- 五档基线：65 张；10,910 个默认态交互候选低于 44px 为 0，其中移动端 3,948 个失败为 0；console/page error 为 0。
- bundle：main 138.52 KB gzip；FeedbackPage 独立 lazy chunk 8.14 KB gzip；graph lazy leak 为 0。
- 依赖审计：0 vulnerabilities。

## 视觉测试稳定性

清单移动选择态从 page screenshot 改为稳定的 `collection-grid-section` 组件边界截图，直接冻结标题、批量工具条和所有卡片，不再依赖页面滚动量。组件基线连续 3 轮一致，全量 20 张视觉基线随后通过。
