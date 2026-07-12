# CSS Modules 样式隔离 Wave 1

日期：2026-07-12

## 目标

继续执行 Master Plan Phase 2，先迁移复用范围大、边界清晰的组件，验证 CSS Modules、页面主题覆盖、打印模式和视觉回归可以共存，再进入高耦合页面样式。

## 已迁移

| 组件 | 隔离方式 | 稳定跨组件契约 |
| --- | --- | --- |
| Header | `Header.module.css` | `data-kb-shell="header"` 用于打印隐藏 |
| Footer | `Footer.module.css` | `data-kb-shell="footer"` 用于打印隐藏 |
| GradeBandTabs | `GradeBandTabs.module.css` | `data-kb-grade-tab`、`data-selected` 允许 Subject 页面做显式主题覆盖 |
| TSBadge | `TSBadge.module.css` | `data-kb-component="ts-badge"` 用于 StandardCard hover 联动 |
| StateComponents | `StateComponents.module.css` | `data-kb-state` 用于状态识别与测试 |
| Tooltip / Toast / Skeleton / Disclosure | 各自 `.module.css` | `data-kb-primitive` 用于 Storybook、测试和有限外部布局覆盖 |

## 同步修复

- Header 主导航增加 `aria-current="page"`，移动端导航增加独立 label。
- Header 导航项提升到模块常量，菜单开关使用函数式状态更新。
- CopyLinkButton 清理未卸载定时器，移除重复 native title。
- 清理 `App.css` 中未被使用的旧 Footer 样式。
- Collections 视觉测试固定默认清单创建日期，消除跨日期的 14 像素非产品差异。
- 建立 `reset → tokens → base → components → utilities → overrides` canonical layer 顺序；tokens、reset、base、utilities 与 view-transition overrides 已进入相应 layer。
- 增加全站 `.sr-only` utility，Glossary 搜索框不再把读屏 label 当作第二个可见标签；该预期修复已人工检查并更新对应视觉基线。
- legacy `.btn`、Card、Form 等全局组件样式暂时保持 unlayered，避免在其页面尚未迁移前发生优先级漂移；将在对应 owner 迁移时进入 components layer。

## 自动防回退

`validate:design-contract` 现在验证：

- 九个已迁移 owner 必须导入各自 `.module.css`；
- 对应旧全局 stylesheet 不允许重新出现；
- `src/ui/primitives` 内全局 CSS 文件数量必须为 0。
- canonical cascade layer 顺序、tokens layer import 和 `.sr-only` utility 必须存在。

## 验证

- 生产构建通过。
- Stylelint 与设计契约通过。
- Header 桌面、移动、打印交互与视觉基线通过。
- Subject、Standard、Skills、Compare、Style Guide 相关视觉与 axe 抽检通过。
- Collections 固定 fixture 后原视觉基线通过，无需更新截图。
- 完整视觉基线 12/12、axe 16/16；主包自定义统计 122.39 KB gzip，低于 150 KB 门槛。
- CSS Modules 移除旧 class 后，Compare copy 测试改用 role 与 `data-kb-component`，不再耦合视觉类名。

## 仍需继续

- 页面级 CSS 仍是主要污染来源，下一批优先处理独立 lazy route 或低耦合组件。
- layer 顺序已经建立，但 legacy 全局 component classes 尚未全部迁移进 components layer。
- SubjectPage 对 GradeBandTabs 的主题覆盖虽已显式化，后续可进一步改为组件 variant，减少页面反向选择器。
