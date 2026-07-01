# 初中段 7-9 学段口径政策审计

更新时间：2026-07-01

本文记录当前 runtime 数据采用的学段口径、旧 H3 数据恢复方式，以及可执行的发布 gate。

## 1. 当前正式口径

当前正式 `public/data/by_subject/` 采用以下展示口径：

| grade_band | grade_range | 前端展示 |
| --- | --- | --- |
| H1 | 1-2 | 1-2年级 |
| H2 | 3-4 | 3-4年级 |
| H3 | 5-6 | 5-6年级 |
| H4 | 7-9 | 7-9年级 |

7-9 年级记录使用：

```json
{
  "grade_band": "H4",
  "grade_range": "7-9",
  "grade": "七年级 | 八年级 | 九年级"
}
```

`src/data/dataLoader.js` 中 `GRADE_BANDS.H3.range` 已恢复为 `5-6年级`，并新增 `GRADE_BANDS.H4.range = "7-9年级"`。

## 2. 数据范围说明

当前 strict gate 区分“前端展示口径”和“数据允许范围”：

| grade_band | 展示口径 | 允许的数据范围 |
| --- | --- | --- |
| H1 | 1-2 | 1-2 |
| H2 | 3-4 | 3-4，艺术旧数据 3-5 |
| H3 | 5-6 | 5-6，艺术旧数据 6-7 |
| H4 | 7-9 | 7-9 |

艺术学科保留 `H2:3-5` 和 `H3:6-7` 是为了不篡改旧 public 数据中的来源年级范围；前端仍按 H2/H3 的顺序展示，并在详情页显示记录自己的 `grade_range`。

## 3. 审计命令

发布 gate 使用 strict 模式：

```bash
npm run grade7_9:audit-grade-band-policy -- --strict
```

当前 strict 结果要点：

```json
{
  "policy_ready": true,
  "public_data": {
    "totals": {
      "records": 1933,
      "subjects": 9,
      "incompatible_records": 0
    }
  },
  "frontend": {
    "grade_bands": {
      "H1": { "matches": true },
      "H2": { "matches": true },
      "H3": { "matches": true },
      "H4": { "matches": true }
    }
  },
  "blockers": [],
  "errors": [],
  "warnings": []
}
```

## 4. 当前正式数据分布

| 学科 | H1 | H2 | H3 | H4 | 合计 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 艺术 | 42 | 46 | 48 | 97 | 233 |
| 语文 | 15 | 26 | 28 | 156 | 225 |
| 英语 | 0 | 57 | 47 | 132 | 236 |
| 信息科技 | 16 | 19 | 15 | 66 | 116 |
| 劳动 | 25 | 43 | 47 | 66 | 181 |
| 数学 | 7 | 18 | 22 | 114 | 161 |
| 道德与法治 | 36 | 31 | 28 | 126 | 221 |
| 体育 | 30 | 29 | 29 | 123 | 211 |
| 科学 | 65 | 39 | 44 | 201 | 349 |
| **合计** | **236** | **308** | **308** | **1081** | **1933** |

## 5. 候选 runtime 工具

候选生成器现在采用“恢复 H3、追加 H4”策略：

```bash
npm run grade7_9:build-release-candidate
```

实际写入仍必须显式确认：

```bash
npm run grade7_9:apply-release-candidate -- --write --confirm-target-policy
```

后续维护时，如果当前 public 已包含 H4，候选生成器会替换旧 H4 记录并追加最新 staging H4，避免重复。

## 6. 不应执行的操作

后续维护时不应：

- 把 7-9 写入 H3。
- 为了通过校验而删除旧 `H3:5-6` 数据。
- 把旧 `H3:5-6` 或艺术 `H3:6-7` 直接改成 `H4:7-9`。
- 把艺术旧 `H2:3-5` 或 `H3:6-7` 强行改成通用展示范围。
- 绕过 release candidate 手工拼接 `public/data/by_subject/*.json`。

这些做法都会造成课标数据与年级含义不一致。

## 7. 推荐 gate

每次准备发布或改动正式数据后运行：

```bash
npm run validate:indexes
npm run grade7_9:audit-grade-band-policy -- --strict
npm run grade7_9:audit-release -- --staging-root generated/grade7_9_all_curated --strict
npm run build
```

只有以上 gates 通过，当前 `H1=1-2, H2=3-4, H3=5-6, H4=7-9` runtime 口径才算保持一致。
