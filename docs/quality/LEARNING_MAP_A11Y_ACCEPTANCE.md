# 学习脉络：可访问性与响应式验收

本说明适用于“学习脉络”功能，而非旧有课程结构图。它回答的是：某个知识点需要先掌握什么、会解锁什么，以及在分类与 DAG 中如何持续定位。

## 公开体验的不可破坏约束

- 先修与解锁只来自经审核、带证据的 `prerequisite` 边；taxonomy、学段进阶和普通关联不会被描述为先修。
- 语义关系列表是主路径，顺序固定为：当前知识点 → 需要先掌握 → 将会解锁。图形只作桌面辅助；它带有 `aria-hidden`，不会成为唯一内容或唯一操作路径。
- 手机宽度（390×844）不加载 React Flow；触控关系按钮的可点击矩形至少为 44×44 CSS px，且页面不得横向溢出。
- 关系依据、证据、课程标准对齐与必要性必须可由 DOM 读取，不能只出现在画布、颜色或动效中。
- 公开数据仍须通过课程领域专家审核；本验收不构成专家对任何先修边的签署。

## 自动化验收

| 需求 | 自动化证据 |
| --- | --- |
| 键盘进入 taxonomy、在列内移动并选择知识点 | `tests/e2e/a11y.spec.js` 的 `learning map keeps a semantic, keyboard-operable path in forced colors` |
| live region 告知当前知识点及直接前置/解锁数 | 同一测试，断言 `B：1 个直接前置项，1 个直接解锁项。` |
| 语义列表、图形 `aria-hidden` 与 Axe 0 critical/serious | 同一测试及 `tests/e2e/learning-map-route.spec.js` |
| 390px 语义堆叠、DOM 顺序、无横向溢出、44px 控件 | `tests/e2e/responsive.spec.js` 的 mobile learning map 测试 |
| 1440px 位置栏、Columns、语义关系、DAG、Inspector 同时可用 | `tests/e2e/responsive.spec.js` 的 desktop learning map 测试 |
| 强制色彩、减少动效 | `tests/e2e/a11y.spec.js` 的 forced-colors learning map 测试 |
| 200% 显示缩放代理下无横向溢出 | `tests/e2e/a11y.spec.js` 的 learning map scaling 测试 |
| 固定 fixture 的视觉回归 | `tests/e2e/visual.spec.js` 的 7 个 `learning map` baseline 测试 |

运行：

```bash
npx playwright test tests/e2e/a11y.spec.js --grep "learning map"
npx playwright test tests/e2e/responsive.spec.js --grep "learning map"
npx playwright test tests/e2e/visual.spec.js --grep "learning map"
```

视觉截图仅截取语义关系列表或 Inspector，而不是 React Flow SVG。这样可以验证真正的阅读/操作内容，并避免 SVG 抗锯齿、自动布局和字体栅格化造成没有意义的像素噪声。

## 必须人工完成的读屏验收

自动化测试不能代替 VoiceOver 或 NVDA 的真实语音输出。发布前由相应环境的人工验收者完成下表并保留记录；若未执行，应标记为“未验收”，不得写成通过。

| 环境 | 操作 | 预期结果 | 记录 |
| --- | --- | --- | --- |
| macOS + VoiceOver + Safari | 搜索知识点；在 taxonomy 中上下/左右移动；选择前置、解锁与“依据” | 能读出控件名称、当前位置、关系必要性、证据与标准对齐；没有焦点陷阱 | 待人工验收 |
| Windows + NVDA + Firefox/Chrome | 重复上述流程；切换多父 context | 替代 taxonomy 路径可理解，选择后 live region 报告新的当前点与数量 | 待人工验收 |
| 触屏或移动浏览器 | 390px 打开 relationship 与 evidence | 语义列表可完整操作，目标不小于 44px，页面无横向滚动 | 自动化覆盖；可按发布设备复核 |

## 视觉基线范围

基线固定使用测试 fixture：chain、diamond、多父、已审核空关系、未审核空关系、390px 语义堆叠、已打开 Inspector。fixture 是测试数据，不会写入公共知识图谱，也不代表课程专家已审核真实课程关系。
