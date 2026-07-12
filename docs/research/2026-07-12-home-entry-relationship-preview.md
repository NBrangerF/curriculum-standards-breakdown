# 首页学科与能力入口关系提示

## 问题

主计划要求首页学科入口和能力入口具备 hover preview 与关系提示。原学科入口只有名称和箭头；能力入口虽有 tagline，但没有表达它连接多少学科、包含多少子技能。入口可用，却没有体现 kebiao 作为“结构化索引与智能引擎”的数据质感。

## 数据与实现

- 学科入口读取 Manifest 的 `record_count`、`domains` 和 `grade_bands`，显示标准数、领域数及前三个领域名称。
- 能力入口读取 `skill_to_subjects` 索引和技能元数据的 `subskills`，显示跨学科覆盖与子技能数量。
- 不增加数据请求瀑布：以上文件已属于首页轻量索引，并使用现有 dataLoader cache。
- 入口顺序、Link 目标和页面区块顺序不变。
- `aria-label` 保持简洁入口名称，关系数据通过 `aria-describedby` 提供补充说明。
- hover/focus 使用 transform 和关系线伸展增强层级；reduced-motion 下取消过渡。

## 视觉与无障碍修正

首版将次级信息设为 46% opacity，实图层级克制，但 axe 检出小字号对比度仅约 1.95–2.21:1。最终移除透明度弱化，改用满足对比度的中性灰；hover/focus 只改变文字层级、位移和关系线。高端质感不能以不可读为代价。

## 外部项目与 skill 边界

- 本轮没有新增运行时；继续使用 Phosphor 图标与现有数据层。
- `high-end-visual-design` 用于控制间距、关系线和微动效，但未采用其 Double-Bezel、胶囊导航或营销页强制结构，因为这些会破坏 kebiao 已冻结的信息组织。
- 未生成图片：关系数据本身比装饰性素材更能表达产品身份。

## 验证

- 新增 E2E：数学入口显示 164 条标准、4 个领域；TS1 显示 9 个学科及子技能关系。
- 完整 E2E 48/48；首页桌面/移动视觉基线通过；首页 axe critical/serious 0。
- 13 路由 × 5 视口共 65 份基线通过；10,730 个交互目标低于 44px 为 0。
- Stylelint、全 workspace typecheck、生产构建和 audit 通过。
- 主包 136.94 KB gzip，低于 150 KB；图谱 chunks 与 lazyGraphLeak 门禁不变。
