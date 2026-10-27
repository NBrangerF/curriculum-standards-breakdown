# H4G 审核脚本归档

这里是 2026 年 6–7 月为初中（H4G7/H4G8/H4G9）年级分化做审核时写的一次性脚本，共 258 个。它们不在构建、CI 或测试中运行，归档以免继续淹没 `scripts/` 和 `package.json`。

- 目录结构保持原样：`textbooks/`、`grade7_9/` 分别来自 `scripts/textbooks/`、`scripts/grade7_9/`。相对 import 和仓库根目录的推算都已按新位置修正。
- 原来的 257 个 `npm run …h4g…` 命令保存在 `package-scripts.json`，路径已指向这里。需要时在仓库根目录直接运行对应命令，例如：

  ```bash
  node scripts/archive/h4g/textbooks/build_h4g_unit_evidence_candidate.js
  ```

- `docs/H4G_*.md` 里的 `npm run …h4g…` 命令都对应 `package-scripts.json` 中的同名条目。
- `scripts/grade7_9/h4g_supplemental_pipeline_utils.js` 仍被在用的脚本引用，因此留在原处。

这些脚本的结论见 `docs/H4G_DISTINCTIVENESS_REMEDIATION.md`；2026-10 的内容修正见 `docs/data/STANDARDS_CONTENT_FIXES_2026-10.md`。
