# 初中段 7-9 学段口径政策审计

更新时间：2026-07-01

本文记录 7-9 年级 staging 正式接入 `public/data/by_subject/` 前必须解决的学段口径问题。它只整理当前仓库事实和可执行 gate，不做产品决策。

## 1. 目标口径

当前 7-9 扩展任务要求的目标口径是：

| grade_band | grade_range |
| --- | --- |
| H1 | 1-2 |
| H2 | 3-4 |
| H3 | 7-9 |

7-9 staging 已按该目标口径生成：

```json
{
  "grade_band": "H3",
  "grade_range": "7-9",
  "grade": "七年级 | 八年级 | 九年级"
}
```

## 2. 审计命令

非 strict 模式会生成报告但不失败：

```bash
npm run grade7_9:audit-grade-band-policy -- \
  --out generated/grade7_9_grade_band_policy.json
```

发布 gate 必须使用 strict 模式：

```bash
npm run grade7_9:audit-grade-band-policy -- --strict
```

只要正式数据或前端口径仍不满足目标政策，strict 模式就应该退出非零。

## 3. 当前结论

当前审计结果：

```json
{
  "policy_ready": false,
  "public_incompatible": 354,
  "staging_incompatible": 0,
  "policy_gap_ranges": {
    "H2:3-5": 46,
    "H3:5-6": 260,
    "H3:6-7": 48
  }
}
```

含义：

- 7-9 staging 本身符合目标口径。
- 正式 `public/data/by_subject` 仍有 354 条记录不符合目标口径。
- 当前正式数据存在 3 个目标口径无法容纳的范围：`H2:3-5`、`H3:5-6`、`H3:6-7`。
- 前端 `src/data/dataLoader.js` 中 `GRADE_BANDS.H3.range` 仍是 `5-6年级`，尚未匹配 `7-9`。

## 4. 冲突明细

| 冲突范围 | 条数 | 涉及学科 | 样例 code |
| --- | ---: | --- | --- |
| H2:3-5 | 46 | arts | `AR-D2-AA-MU-001`, `AR-D2-AE-MU-002`, `AR-D2-CU-MU-003` |
| H3:5-6 | 260 | chinese, english, it, labor, math, morality_law, pe, science | `CN-D3-LI-001`, `CN-D3-LI-002`, `CN-D3-LI-003` |
| H3:6-7 | 48 | arts | `AR-D3-AA-MU-001`, `AR-D3-AE-MU-002`, `AR-D3-AE-MU-003` |

分学科计数：

| 学科 | 冲突范围 | 条数 |
| --- | --- | ---: |
| arts | H2:3-5 | 46 |
| arts | H3:6-7 | 48 |
| chinese | H3:5-6 | 28 |
| english | H3:5-6 | 47 |
| it | H3:5-6 | 15 |
| labor | H3:5-6 | 47 |
| math | H3:5-6 | 22 |
| morality_law | H3:5-6 | 28 |
| pe | H3:5-6 | 29 |
| science | H3:5-6 | 44 |

## 5. 可选迁移策略

以下是审计脚本输出的决策矩阵。它们不是已批准方案。

| 方案 | 是否满足目标口径 | 是否保留现有 public 记录 | gate 影响 |
| --- | --- | --- | --- |
| 保留现有 public 数据，暂不追加 7-9 | 否 | 是 | strict gates 继续失败 |
| 将目标口径无法容纳的范围移出 runtime `by_subject` 后追加 7-9 | 是 | 否 | 更新前端 H3 后 strict gates 可通过 |
| 为 5-6 引入新 grade_band | 否，除非修改目标政策 | 是 | 需要明确 schema/政策变更 |
| 拆分小学和初中 runtime dataset | 取决于新数据契约 | 是 | 需要新增 runtime 数据契约和前端 dataset 选择 |

## 6. 不可直接做的事

在没有明确产品决策前，不应执行：

- 把 7-9 staging 直接 append 到 `public/data/by_subject`。
- 把 `H3:5-6` 或 `H3:6-7` 直接改成 `H3:7-9`。
- 把 5-6 数据强行塞入 `H2:3-4`。
- 新增 grade_band 但不同步更新 schema、前端文案、manifest、indexes 和文档。

这些做法都会造成课标数据与年级含义不一致。

## 7. 推荐下一步

1. 明确是否接受目标口径 `H1=1-2, H2=3-4, H3=7-9` 作为正式 runtime 数据口径。
2. 决定 `H2:3-5`、`H3:5-6`、`H3:6-7` 这 354 条现有 public 记录的去向。
3. 按已确认方案修改正式数据或 runtime 数据契约。
4. 更新 `src/data/dataLoader.js` 中 `GRADE_BANDS`。
5. 重新生成 manifest/indexes。
6. 运行以下 gates：

```bash
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-release -- --staging-root generated/grade7_9_all_curated --strict
npm run build:indexes
npm run validate:indexes
npm run build
```

只有这些 gates 通过后，7-9 staging 才能正式写入或接入 runtime 数据。
