# CSS Modules 样式隔离 Wave 5

日期：2026-07-12

## 完成范围

- `HomePage.css` → `HomePage.module.css`。
- `HomeHeroBanner.css` → `HomeHeroBanner.module.css`。
- Home 根节点增加 `data-kb-route="home"`，Hero 增加 `data-kb-component="home-hero"`。
- 首页筛选、Disclosure、学科入口、技能预览与使用步骤均由 Home owner 管理，不再与 Search / FilterBar / SkillCard 共享偶然同名 class。
- 测试选择器从 `.skills-accordion-header` 改为 accessible name，不再耦合视觉类名。

此外完成：

- `H4GReviewPage`：1,074 行高密度审核样式随 lazy route 隔离。
- `StandardCard`、`SubjectColumn`：跨 Subject、Search/Compare、Skill Detail、Collection Detail 的复用边界。
- `HeroBackground`、`SubjectHeroBanner`、`TSHeroBanner`、`CurriculumCoordinateMap`：父子主题改用 `data-kb-component`。
- `HomeNarrativeSection`：GSAP selector 与 ScrollTrigger pin 使用模块类，仍是唯一 GSAP importer 和独立 lazy chunk。
- `GraphCanvas`、`SkillsGraphWorkspace` 及 LayerPanel、Inspector、MiniMap、Path、Compare、Progression、VirtualizedRelationTree：完整 feature family 使用同一模块样式并留在图谱 lazy chunks。
- 未引用 `FilterBar` 也完成模块化，保留回退代码而不允许全局 CSS 回流。

## 全量证据

- E2E：43/43；新增多学科独立列搜索。
- Visual：12/12。
- axe：17/17，critical/serious 为 0。
- Storybook production state matrix：构建通过。
- Build、Stylelint、design contract、motion contract、graph interaction contract、`git diff --check`：通过。
- 主包：127.85 KB gzip / 150 KB。
- GraphCanvas：39.97 KB gzip / 60 KB。
- SkillsGraphWorkspace：10.67 KB gzip / 30 KB。
- HomeNarrativeSection：46.55 KB gzip / 60 KB。
- lazy graph leak：0。
- TypeScript：通过。
- `npm audit`：0 vulnerabilities。

## CSS 隔离完成判据

- `src/pages`、`src/components`、`src/features` 的非模块 CSS import：0。
- 仅保留 `App.css`、`index.css` 两个 foundation 全局入口和 Storybook 专用 CSS。
- 设计契约现在自动拒绝生产 feature code 新增非 `.module.css` import。
- canonical token 仍为 `design-tokens.css`，175 个 token。

## GitHub 项目与实现取舍

- Vercel React best practices：保持 GraphCanvas、SkillsGraphWorkspace、HomeNarrativeSection 条件 lazy load；不把重型依赖拉入主路径。
- `withmarbleapp/os-taxonomy`：继续用于 taxonomy 层级、节点联动与渐进披露参考，未复制其信息架构。
- React Aria：继续由 kebiao primitives 提供 Dialog、Popover、Disclosure 和焦点行为。
- Sigma.js / Graphology：生产图谱 renderer/model 不变，不引入第二套引擎。

## 主计划下一步

CSS 隔离已完成。后续进入全路由 legacy 实体回退审计、人工 VoiceOver/NVDA 签字和真实灰度观察；这些不能用自动测试冒充完成。
