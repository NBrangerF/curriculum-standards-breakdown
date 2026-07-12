# CSS Modules 样式隔离 Wave 3

日期：2026-07-12

## 目标

继续执行 Master Plan Phase 2，在不改变信息架构、字段顺序、搜索参数和图谱语义的前提下，处理页面级视觉 owner 与高耦合 Search / Compare 边界。重点不是换框架，而是消除跨路由串色，让后续质感、动效与图谱升级可以在可控边界内演进。

## 完成范围

| Owner | 新样式边界 | 稳定契约 | 结果 |
| --- | --- | --- | --- |
| `CollectionsPage` | `CollectionsPage.module.css` | `data-kb-route="collections"`、React Aria Dialog role | 列表、创建、导入、删除与响应式保持 |
| `StyleGuidePage` | `StyleGuidePage.module.css` | `data-kb-route="styleguide"`、primitive 的 `data-kb-*` | Foundation、States、Graph language 与键盘状态保持 |
| `SearchResultsPage` | `SearchResultsPage.module.css` | `data-kb-route="search"`、URL query、ARIA Disclosure | draft/apply、学科/学段约束、可分享 URL 保持 |
| `CompareView` | `CompareView.module.css` | `data-kb-feature="compare-view"`、`aria-expanded` | 多学科独立列、多学段 aligned matrix 与空状态保持 |

设计契约已把四个 owner 纳入不可回退列表：旧同名全局 stylesheet 一旦恢复，`validate:design-contract` 会失败。

## 发现并修复的视觉污染

旧 `SearchResultsPage.css` 的 `.filter-group-secondary` 等选择器会在首页同时生效，使首页学段面板意外获得搜索页的灰底、圆角与 padding。迁移后 Search 的样式仅作用于 Search，首页恢复为 `HomePage.css` 原本定义的统一白色分栏。

该变化造成首页桌面基线 646 像素差异；人工对比 expected / actual / diff 后确认是跨路由串色消失，只更新 `home-desktop` 基线。移动首页、Search / Compare、其余十张基线均未改变。

## 外部 GitHub 项目分工

| 项目 | 本阶段采用内容 | 未采用内容 |
| --- | --- | --- |
| [`withmarbleapp/os-taxonomy`](https://github.com/withmarbleapp/os-taxonomy) | taxonomy 工作区的层级浏览、节点—详情联动与大图谱渐进披露，继续作为 kebiao 图谱呈现参照 | 不复制其信息架构，不把 taxonomy 视觉强塞进搜索筛选页 |
| [`adobe/react-spectrum`](https://github.com/adobe/react-spectrum) / React Aria | Dialog、Disclosure、Popover 的键盘、焦点与 ARIA 行为；页面只组合 kebiao primitive | 页面不直接导入 React Aria，不另造第二套交互状态机 |
| [`shadcn-ui/ui`](https://github.com/shadcn-ui/ui) | primitive 与 feature owner 分离、可复制组合的工程方式 | 不引入 Tailwind，不替换现有 token 与 CSS stack |
| [`css-modules/css-modules`](https://github.com/css-modules/css-modules) + Vite | 本地 class 映射与渐进迁移；保留少量明确的 foundation `:global()` bridge | 不引入 CSS-in-JS runtime，不做全站重写 |

本 Wave 没有新增生产依赖。已有 Sigma.js / Graphology 继续负责生产知识图谱；`os-taxonomy` 是交互与信息密度参考，不是新的 renderer。

## 全量门禁

- E2E：40/40。
- Visual：12/12；仅首页桌面基线因确认的串色修复更新。
- axe：16/16，critical/serious 为 0。
- 主包：123.35 KB gzip / 150 KB。
- GraphCanvas：39.87 KB gzip / 60 KB。
- SkillsGraphWorkspace：9.86 KB gzip / 30 KB。
- Bundle lazy graph leak：0。
- TypeScript、Stylelint、design contract：通过。
- `npm audit`：0 vulnerabilities。

## 下一 Wave

1. Subject / Skills / Skill Detail 与 graph workspace 的样式所有权整理，保持 Sigma lazy boundary。
2. Standard Detail 与局部图谱、关系面板的边界整理。
3. 最后迁移 Home 与 H4G 两个高耦合大 owner，并清理剩余 legacy component globals。
4. CSS 隔离完成后再进入人工读屏与真实灰度，不把自动门禁误写成已上线。
