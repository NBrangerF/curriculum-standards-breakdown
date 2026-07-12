# kebiao V2 Phase 9 同日加速发布记录

日期：2026-07-12  
生产候选：`520f31c`（tag：`kebiao-v2-phase9-accelerated`）  
生产域名：`https://www.kebiao.org`

## 结论边界

本次依产品方授权不等待 48 小时，完成的是“同日加速生产验收”，不是 48 小时或更长时间的真实流量稳定性声明。Analytics 与 Speed Insights 保持关闭；证据来自确定性 cohort、真实 production bundle 矩阵、完整自动化门禁、Lighthouse、Vercel READY、即时 Runtime Logs 与两个连续 100% 部署。

## 部署链

| 阶段 | Deployment | 结果 | error-level Runtime Logs |
| --- | --- | --- | ---: |
| production-default-off | `dpl_H88dHmg4icwUBETboqqZDWsZRiYE` | READY | 0 |
| 5% | `dpl_9nboTdDifMmKzbszjc3EU5Esb2d2` | READY | 0 |
| 20% | `dpl_26HB6zykoipZkc7xxrC1m3WYTG7A` | READY | 0 |
| 50% | `dpl_718GHgodaTMfrH1DBxTyCcPQ3YEp` | READY | 0 |
| 100% cycle 1 | `dpl_4GqcGaXGP8DMxYx6thWU8xQMwfpq` | READY | 0 |
| 100% cycle 2 | `dpl_78YUvNsAb21gr5sZjpJ8RGn74aNE` | READY | 0 |

最终 production URL：`https://curriculum-standards-breakdown-5slosmtv8-sichuang-fans-projects.vercel.app`，已 alias 到 `https://www.kebiao.org`、`https://kebiao.org`。

## 自动化证据

- 五档 production build matrix：`default-off / 5 / 20 / 50 / 100`，每档 12 路由，cohort 内外与 query rollback 通过。
- E2E：55 / 55。
- axe：25 / 25，critical / serious 为 0。
- visual：19 / 19。
- 五视口基线：60 / 60；route readiness、横向溢出、触控目标、console error、page error 均为 0。
- Bundle：main 138.96 KiB gzip；graph lazy leak 为 0。
- Lighthouse：Home、Skills、Standard 三条 production build 路径全部满足断言。
- TypeScript、Storybook、设计/动效/图谱/rollout/observability/observation contracts 均通过；`npm audit` 为 0 vulnerabilities。

## 保留项

- `?ui-v2=0` 与 `?ui-v2=1` 继续保留为即时诊断/回滚入口。
- 路由级 Production flags 保留；如需回滚，可将目标路由设为 `false` 后重新部署。
- Analytics 与 Speed Insights 仍为 `false`，未引入新的付费遥测。
- 本记录不替代后续真实用户反馈；若出现 P0/P1 或 error-level Runtime Logs，按 `docs/PHASE_9_ROLLOUT_RUNBOOK.md` 回滚。
