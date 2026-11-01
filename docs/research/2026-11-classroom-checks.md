# 课堂诊断（2026-11）

上课先问一道题，看清全班怎么想；批完作业，明天开课用 5 分钟补上。调研见 artifact「批完就用」(https://claude.ai/artifact/3KwJNVAEPV8PX9ZAbgyb3k)。

## 为什么这样做

- 证据：作业和小测要真正改变教学，靠离课堂近、能马上变成动作的证据（ASSISTments 缅因州随机试验 g = 0.18，老师按错题第二天讲评；EEF Embedding Formative Assessment +2 个月）。看错因比看正确率有用（Eedi 的诊断题：每个错误选项对应一种迷思）。
- 国内主流产品（智学网个册、极课、点阵笔、希沃批阅机）把力气花在采集上，要采购硬件；最弱的一环是“明天做什么”。
- 用户的两条要求（2026-11-01）：题库要事先备好；输出要适合大班，能直接用电脑、投影、PPT 呈现。

所以：
1. **大班作答方式**：没有学生设备也能 30 秒看清全班——手势 1–4、拇指上下、举草稿纸。题型只有四种：`choice`（四选一，错项对应错法）、`judge`（同意吗：评判一份做法）、`step`（哪一步开始错）、`write`（写答案举起来，列出常见错答）。
2. **投影优先**：`/checks/present` 是 16:9 的舞台，尺寸全用 cqh（舞台高度的 1%），像幻灯片一样缩放，4:3 投影自动加黑边；白底（亮教室）/黑底；翻页笔的 PageUp/PageDown、B（黑屏）都能用；数字键 1–4 记人数（Shift 加 5）；N 打开教师提示（错法的原因和应对，只在老师需要时显示）。
3. **一题几屏**：题目 → 揭晓（正确答案、每个错项“可能想的是”、正确做法、请答错的同学说想法）→ 比一比（小明的典型错法 vs 小红的正确做法，先让全班判断再标出）→ 阶梯练习（① 基础 ② 巩固 ③ 挑战，全班在练习本上从 ① 做起；大班里用“阶梯”代替分组发小条）。
4. **PPT**：同一套幻灯片导出为可编辑的 .pptx（pptxgenjs，按需加载），微软雅黑；分数写成 a/b、幂写成 x²；需要按键分步的屏（比一比、阶梯练习）在 PPT 里拆成两页；教师提示放在备注里。
5. **批完就用**（`/checks/after`）：批改时按单元点“看到的错法 + 大约多少人”（没看到 / 几个人 / 不少人 / 一大半），不按题数人数、不记学生名字。生成“明天开课 5 分钟”：最多处理两种错法，第一种走完整一轮（开课一问、揭晓、比一比、阶梯练习），第二种课尾再查一题。记录只存在本机 localStorage（`kebiao.checks.records`），“回看”换一道针对同样错法的题再查。

## 题库

- 位置：`data/checks/<学科>/<年级><a|b>.json`（a 上册、b 下册），目前只有数学，人教版 1–9 年级 18 册，197 题、291 种错法。
- 每个文件：`book`、`misconceptions`（id、name、why、move）、`items`。错法可以被其他册的题引用（校验先读全部错法）。
- 题目字段：`id`（`ma-5b-05`）、`type`、`unit`（人教版单元名的一部分）、`lessons`（课时名关键词）、`points`（v2 要点编码）、`topic`、`stem`、`work`（judge/step）、`options`（choice）、`answer`、`wrong`（答案 → 错法 id，可为数组）、`error`（step 的错法）、`right`（正确做法）、`typical` + `typical_error`（choice/write 的典型错法，用于比一比）、`ladder`（3 级）、`verify`（精确验算）。
- 数学标记：`{5/6}` 分数，`2{1/3}` 带分数，`x^2`、`a^{n+1}` 上标，`x_1` 下标，`√2`、`√{x+1}` 根号（`src/features/checks/mathText.js`）。
- 校验：`npm run check:checks`（`scripts/checks/bank.mjs --check`）——要点编码存在、单元是人教版该册的单元、课时关键词能找到、每个错项都有错法、`verify` 用有理数精确计算为真（`scripts/checks/rational.mjs`）、投影文字长度。构建：`build:public-data` 最后一步写 `public/data/checks/{math.json,index.json}`。
- 加题：在对应册的文件里加题和需要的新错法，跑 `npm run check:checks`，有数值就写 `verify`。

## 接口

- 页面：`/checks`（按册、单元选题，`?point=` 按要点）、`/checks/present?q=&with=contrast,ladder[,first]&title=&back=`、`/checks/after`。
- 入口：备课导航“课堂诊断”；课标页每条要点下“课堂诊断题 n 道”；数学教材页“课堂诊断题”；AI 备课的课时卡片里列出这一课可用的题。
- API：`GET /api/v1/checks?code=&grade=&term=&q=&limit=`、`GET /api/v1/checks/{id}`；MCP 工具 `get_check_questions`（code / grade / topic）。

## 还没做

- 只有数学、只按人教版单元编排（其他版本按要点和课时名匹配）。
- 题目由 kebiao（Claude）编写，数值经程序验算，但没有教研员审读；欢迎老师报错。
- 需要图形的内容（观察物体、图形的运动的画图题等）暂时只用文字题。
- 学生端作答、班级统计、长期档案都没有做；记录只在本机。
