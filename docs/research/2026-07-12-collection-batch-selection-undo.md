# 清单批量选择与可撤销删除

日期：2026-07-12

## 对应主计划

闭环 `8.8 清单页与清单详情` 中尚未完成的三个要求：批量选择、删除反馈、可撤销操作。导入、导出、打印、详情编辑和单条标准撤销继续沿用现有行为。

## GitHub 项目与 skill 决策

- 采用 `gpt-taste` 中与 kebiao 相容的宽幅层级、状态连续性和克制动效原则；不采用其强制 AIDA、随机布局或“所有卡片放大”规则，因为这些会破坏已冻结的信息架构和高密度工作集语义。
- [Motion](https://github.com/motiondivision/motion) 复用现有 `LazyMotion + m`，只负责选择工具条的进入/退出连续性。
- [React Aria](https://github.com/adobe/react-spectrum/tree/main/packages/react-aria-components) 继续承担确认 Dialog、焦点约束和 disabled 语义；页面不新增第三方 primitive 直连。
- 借鉴主计划中 Linear 的“进入选择模式后出现上下文工具条”原则，不复制品牌、布局或商业视觉。
- 未引入 TanStack Table、Virtual 或新的 selection library：当前清单规模和二维卡片结构不需要额外运行时。

## 数据安全契约

- `deleteCollections(ids)` 在一次 localStorage 写入中删除多条记录，并返回包含 `standardCodes` 的完整快照。
- 默认收藏夹 `default` 永远不会进入可删除集合。
- `restoreCollections(snapshots)` 以原 ID 恢复；若 ID 已被新数据占用则保留新数据，撤销不会覆盖用户后续操作。
- 单条和批量删除共用同一事务与 Toast 撤销路径。
- 撤销窗口为 6 秒，和清单详情的可逆操作节奏一致。

## 视觉与交互

- “选择清单”是显式模式开关，并用 `aria-pressed` 暴露状态。
- 选择工具条显示数量、默认收藏夹保护说明、全选/取消全选和批量删除。
- 选中卡片同时使用边框、浅靛蓝表面与勾选图标，不依赖单一颜色。
- 删除确认明确说明仍可撤销；完成后 Toast 提供直接恢复动作。
- 390px 下工具条改为纵向摘要 + 双列操作，卡片和选择控件不溢出。

## 验证

- 批量删除两条清单后 localStorage 只剩默认收藏夹；撤销后原 ID、名称、描述与 `standardCodes` 完整恢复。
- 选择模式的 Dialog/checkbox/toolbar axe critical/serious 为 0。
- 390px 专项验证横向溢出为 0，选择控件和所有批量操作均至少 44 × 44px。
- 全量交互/内容/回滚/响应式：54/54。
- axe/辅助模式：24/24。
- visual：17/17，新增桌面与移动选择态基线。
- 五档基线：65 张；10,730 个默认态交互候选低于 44px 为 0，console/page error 为 0。
- bundle：main 138.52 KB gzip；CollectionsPage 独立 lazy chunk 6.65 KB gzip；graph lazy leak 为 0。
- 依赖审计：0 vulnerabilities。
