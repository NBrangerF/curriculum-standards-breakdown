# kebiao V2 Phase 9 Preview 1

日期：2026-07-12
分支：`codex/kebiao-v2-rc2`
源码提交：`e690a34`

## 部署

- 状态：Vercel Preview `READY`
- Deployment ID：`dpl_BZFjdkez7V43NUHCCsXuWoN33CHy`
- Preview URL：`https://curriculum-standards-breakdown-i4w6uwiay-sichuang-fans-projects.vercel.app`
- Inspector：`https://vercel.com/sichuang-fans-projects/curriculum-standards-breakdown/BZFjdkez7V43NUHCCsXuWoN33CHy`
- Preview 环境：`VITE_UI_V2_DEFAULT=true`
- Production：未部署、未修改，`kebiao.org` 继续指向旧生产版本。

首个 Preview `dpl_DKGo7XTsKnaNTsJRqfw4nss9REdE` 已由本部署取代；它用于确认 RC2 可构建，但早于 fail-closed rollout 控制，不作为 Phase 9 晋级候选。

## 发布控制证据

- 无 V2 配置的 production build：`legacy / production-default`。
- Preview 全开 build：`v2 / environment`。
- 5% build：稳定匿名 subject `test-7` → bucket 427 → V2；`test-0` → bucket 8522 → legacy。
- 10,000 个确定性样本：5% = 475、20% = 1,989、50% = 4,993，均在 2pp 容差内。
- rollout subject 只保存在浏览器本地，不包含用户身份；DOM 暴露 percentage 与 bucket 供验收。

## 本地晋级门

- rollout contract：通过。
- E2E：55/55。
- axe / 辅助模式：25/25。
- visual：19/19；sticky reading indicator 额外重复 3 次通过。
- 12 × 5 baseline：60/60；内容、溢出、触控、console/page error 均为 0。
- production default-off、Preview default-on、5% 双 cohort：均使用 production build 实测。

## 仍需外部决策/时间

1. 是否允许对 Preview/Production 启用前端 Web Analytics，以及是否加入 Speed Insights 与核心任务自定义事件。当前 `VITE_ENABLE_ANALYTICS` 未设置，无法用真实流量计算任务完成率、p75 INP/LCP 与 cohort 差异。
2. 是否明确授权首次 Production 发布。按照部署 skill，未取得明确 production 指令前只发布 Preview。
3. Windows + NVDA 与 VoiceOver 中文听觉自然度仍需真人回填。
4. 5%/20%/50%/100% 的 48h/72h/7d/两个稳定周期必须真实经过观察窗口，不能在同一执行时段伪造完成。
