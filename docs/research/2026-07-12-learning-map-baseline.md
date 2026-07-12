# Learning Map 实施前基线（2026-07-12）

## Git 状态

- 基线提交：`88ea3ee docs(learning-map): add execution plan`
- 实施分支：`feat/learning-map`
- 运行方式：独立 `.worktrees/feat-learning-map` worktree。

## 关系数据边界

`npm run audit:graph-data` 的结果：

| 项目 | 数值 |
|---|---:|
| 标准记录 | 2,025 |
| 全局图实体 | 2,079 |
| 全局图关系 | 6,373 |
| `contains` | 2,063 |
| `progression` | 788 |
| `skill_alignment` | 3,522 |
| 显式 prerequisite | 0 |
| 推断 prerequisite | 0 |
| progression groups | 390 |

结论：现有 `progression` 是已批准的显式学段进阶，不能作为认知先修；`previous_code` / `next_code` 仍仅用于详情导航。

## 通过的基线命令

```bash
npm run validate:graph-model
npm run audit:graph-data
npm run validate:graph-interaction
npm run test:e2e
npm run test:a11y
```

结果：图模型、数据审计、图交互契约、55 个核心 E2E 与 25 个无障碍测试均通过。

## 已对齐的历史测试契约

1. `fa98e2a fix(ui): hide internal grade metadata` 已有意移除“年级归属依据”公共区块；内容清单同步删除该过期 heading，避免重新暴露内部审核信息。
2. 搜索筛选按钮在运行时满足 44px 触控目标；原测试在 CSS 稳定前只读取一次。断言改为轮询真实几何尺寸，避免偶发假失败。

## 未在此阶段执行

- 生产先修数据：须在后续 Task 3 通过真实课程领域专家签字后才能生成。
- 新 Learning Map 视觉、交互、URL 状态和 feature flag：尚未开始实现。
