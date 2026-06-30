# 匹配规则

## 三层匹配

### 1. 确定性筛选

优先使用明确条件：

- `subject_slug`
- `grade_band`
- `grade_range`
- `domain`
- `subdomain`
- `ts_primary` / `ts_secondary`

没有确定条件时，不要假装确定；把字段列入 warnings。

### 2. 关键词和语义匹配

将课程方案中的字段：

- 单元标题
- 学习目标
- 教学活动
- 关键词
- 评价方式

与标准字段匹配：

- `standard`
- `context`
- `practice`
- `teaching_tip`
- `assessment_evidence_type`
- `domain`
- `subdomain`

### 3. 可解释输出

每个匹配必须包含：

- `score`
- `match_type`
- `matched_fields`
- `rationale`
- 是否需要人工确认

## 分数口径

- `>=0.80`：高置信度。
- `0.55-0.79`：中置信度。
- `0.30-0.54`：低置信度候选。
- `<0.30`：默认不输出。

## 禁止

- 禁止生成不存在的 code。
- 禁止把“领域相似”当成“标准完全匹配”。
- 禁止把没有数据支持的教材版本关系写成确定事实。
