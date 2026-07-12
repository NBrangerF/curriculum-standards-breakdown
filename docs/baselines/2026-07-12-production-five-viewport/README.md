# kebiao 当前生产环境五档基线

日期：2026-07-12

## 来源

- 正式域名：`https://www.kebiao.org`。
- HTTP：200，Vercel。
- 当前线上标题：`课程标准 | 义务教育课程标准（2022年版）`。
- 当前线上品牌仍为“课标罗盘”，不是本地 kebiao V2。
- 精确 ETag、Last-Modified、Vercel request id 与入口 HTML SHA-256 记录在 `manifest.json` 的 `deployment` 字段。

## 捕获结果

- 13 路由 × 5 视口 = 65 / 65 张生产截图。
- 横向溢出：0。
- Page error：0。
- Console error：3 次；唯一错误类型包含标准数据 fetch 失败和资源 `ERR_SSL_PROTOCOL_ERROR`。
- 65 / 65 张生产截图与本地 V2 checksum 不同。
- 65 / 65 个页面缺少 V2 `#main-content` 锚点。
- 首个冻结标题不匹配：25 次。
- Content Inventory 不匹配：260 项。该数字按五个视口重复计数，不代表 260 个独立产品缺陷。

完整逐路由、逐视口差异位于：

- `../2026-07-12-production-vs-local-comparison.machine.json`

## 结论

生产环境当前仍是升级前版本，因此不能用它证明 kebiao V2 已上线或完成真实灰度。它现在是可追溯的旧版生产对照组；本地 V2 的 65 张基线则是待部署候选。发布 V2 后应使用相同命令重新捕获，直到 `candidateMeetsV2Contract=true`，再进入流量观察。
