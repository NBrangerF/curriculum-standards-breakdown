# kebiao UI V2 五档本地预发布基线

日期：2026-07-12

## 范围

- 13 个生产路由。
- 5 个主计划指定视口：1440 × 900、1024 × 768、768 × 1024、390 × 844、360 × 800。
- 共 65 张 viewport screenshot；不使用 full-page 拼接，保留每个断点的真实首屏构图。
- 本地地址：`http://127.0.0.1:4175`。
- 类型：`local-preproduction`，不是生产部署截图。

`manifest.json` 记录每张图片的 SHA-256、字节数、路由、视口、文档高度、横向溢出、Content Inventory 缺失项、触控目标、console error 与 page error。它还记录 Git SHA、当前源码指纹、数据 manifest 时间、浏览器版本和冻结的应用时间。

## 结果

- 65 / 65 截图存在并通过 checksum。
- 13 / 13 路由在 5 个视口都保留冻结 Content Inventory。
- 横向溢出：0。
- Content Inventory 缺失：0。
- Console error：0。
- Page error：0。
- 两档移动视口触控候选：3,876；小于 44 × 44px：0。
- 五档全视口触控候选：10,333；小于 44 × 44px：0。验证器现对全部视口阻断，不再只守移动端。
- 面包屑内联文字链接语义例外：10；逐项保存在 manifest，不隐藏于总数之外。

捕获首次发现 Skill Detail 的筛选区在 390px 和 360px 下分别溢出 72px 与 102px。原因是 Grid child 的默认 min-content width 把父网格 track 撑开；现通过 `.filter-group { min-width: 0; }` 修复，重新捕获后两档均为 0px。

触控审计随后把按钮、标签包裹的表单控件、Tabs、搜索清除、视图切换和卡片操作统一到实际 44px。StandardCard 最后一轮移除了 28/32px 桌面操作与会跳动的 hover footer 后，五档失败数归零；`validate:ui-baseline` 现将任意视口低于 44px 的目标作为发布阻断项。

## 重放

```bash
npm run capture:ui-baseline
npm run validate:ui-baseline
npm run compare:ui-baseline
```

对已启动环境或部署环境：

```bash
BASELINE_BASE_URL=https://example.invalid npm run capture:ui-baseline
```

使用部署地址时，manifest 会标记为 `deployed-environment`。当前正式域名已经完成只读捕获，差异见相邻生产基线与 comparison manifest；本地基线仍不能替代产品确认或 V2 的真实发布。
