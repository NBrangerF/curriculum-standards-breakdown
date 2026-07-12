# kebiao V2 Windows + NVDA 外部验收单

日期：2026-07-12
适用候选：kebiao V2 RC2（12 个生产路由）
状态：已获产品方许可，等待 Windows 验收者回填

## 环境

- Windows 11，系统缩放 100% 与 200% 各抽检一次。
- 最新稳定版 NVDA；Chrome 或 Edge 最新稳定版。
- 使用 RC2 Preview URL；记录 URL、Git SHA、浏览器版本与 NVDA 版本。

## 必做任务

1. Home：从顶部使用 `H`、`D`、`K` 和 Tab 浏览；验证“跳到主要内容”。
2. Search：筛选数学与第二学段，修改条件并进入一条标准。
3. Standard：读取编码、标题、正文、来源；执行复制、收藏与页内目录跳转。
4. Graph：进入 DOM“邻接关系”路径，选择节点并读取 Inspector、关系来源；Canvas 不得成为唯一入口。
5. Collection：新建清单，验证 Dialog 初始焦点；Escape 后焦点返回触发器。
6. Browse / Focus Mode 往返：Tabs、searchbox、combobox、checkbox 与 Dialog 不丢角色、名称或状态。
7. Live region：操作后不重复播报，不持续打断正文。

## 缺陷分级与 Gate

- P0：任务完全不可达、数据丢失或无替代路径；立即阻断。
- P1：焦点丢失、错误名称/状态导致核心任务不可可靠完成；阻断 RC2 外部签字。
- P2：播报冗余、顺序或文案可改善但任务可完成；记录 owner 与期限。

通过条件：P0 = 0、P1 = 0；P2 全部有 owner 和处理期限。

## 回填

| 字段 | 结果 |
| --- | --- |
| Preview URL / Git SHA | 待填写 |
| Windows / 浏览器 / NVDA 版本 | 待填写 |
| Home / Search / Standard | 待填写 |
| Graph DOM 路径 | 待填写 |
| Collection Dialog 焦点 | 待填写 |
| Browse / Focus Mode | 待填写 |
| P0 / P1 / P2 | 待填写 |
| 验收人 / 日期 | 待填写 |

结论：待外部验收。
