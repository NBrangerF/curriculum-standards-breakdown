# CSS Modules 样式隔离 Wave 4

日期：2026-07-12

## 完成范围

| Owner | 边界与契约 | 验证重点 |
| --- | --- | --- |
| Skills Overview + SkillCard | `data-kb-route="skills"`、`data-kb-component="skill-card"` | 列表/图谱 URL 恢复、rollback、卡片对比度 |
| Subject Page | `data-kb-route="subject"`、`data-kb-locked-filter="subject"` | 列表/对比/单学科图谱、锁定学科、浏览器历史 |
| Skill Detail | `data-kb-route="skill-detail"`、`data-kb-locked-filter="skill"` | 浅色定义、深色 taxonomy、技能范围图谱、浏览器历史 |
| Standard Detail | `data-kb-route="standard"` | 阅读目录、收藏/复制、局部图谱、H4G 证据与前后标准 |
| FavoriteButton + Popover | `data-kb-component="favorite-button"`、`data-kb-action` | lazy Popover、Escape、焦点返回、axe |
| StandardRelationPanel | `data-kb-component="graph-fallback-list"` | WebGL 局部图、等价 DOM 列表、关系 provenance |

Sigma / Graphology 的 `SkillsGraphWorkspace` 与 `GraphCanvas` 继续独立 lazy load；本 Wave 没有替换 renderer，也没有改变图谱数据模型。

## 隔离时发现的问题

`SkillDetailPage.css` 与 `SkillCard.css` 都使用全局 `.subskill-name`。Skill Detail 的深色 taxonomy 文本规则会覆盖 Skills Overview 的浅色卡片，旧代码依靠更高 specificity 的 `.skills-overview-page .skill-card .subskill-name` 偶然压回去。

首次隔离 Skills page 后，axe 报出 26 个节点的 serious color-contrast 问题，证明这不是纯工程洁癖，而是真实的视觉与可访问性耦合。同步隔离 `SkillCard` 后同名 class 不再相遇，删除 specificity 补丁，axe 恢复通过。

Skill Detail 此前没有进入通用 axe 路由。本 Wave 补入后发现小号辅助文字不足 4.5:1，且 TS1 红色在深色 taxonomy 区不足。浅色 muted ink 被增强，深色区使用技能色与白色的受控混合，保留技能识别色并通过 WCAG AA。

## 全量证据

- E2E：42/42；新增 Subject 与 Skill Detail 图谱锁定范围、URL 与浏览器历史恢复。
- Visual：12/12。
- axe：17/17，critical/serious 为 0；新增 Skill Detail 路由。
- 六档响应式全路由 overflow：通过。
- Build、Stylelint、design contract、`git diff --check`：通过。
- 主包：125.81 KB gzip / 150 KB。
- GraphCanvas：39.87 KB gzip / 60 KB。
- SkillsGraphWorkspace：9.88 KB gzip / 30 KB。
- lazy graph leak：0。
- TypeScript：通过。
- `npm audit`：0 vulnerabilities。

## GitHub 项目取舍

- `withmarbleapp/os-taxonomy` 继续提供 taxonomy 层级浏览、节点详情联动和大图谱渐进披露参考。
- React Aria 的焦点、Popover 与 Disclosure 行为继续通过 kebiao primitive 使用。
- Sigma.js / Graphology 仍是生产 renderer / model；无第二图谱引擎进入 bundle。
- CSS Modules 由现有 Vite 工具链提供；无 CSS-in-JS 或 Tailwind runtime。

## 下一 Wave

1. Home 与 H4G 两个剩余高耦合页面 owner。
2. HomeHeroBanner、FilterBar、StandardCard、SubjectColumn 等剩余复用组件 globals。
3. 完成 CSS 隔离后重新审计 legacy 实体回退、人工读屏与真实灰度 Gate。
