# 搜索筛选可逆工作流

## 问题

主计划要求已选筛选条件可回退、可批量清除并有撤销反馈。原搜索页使用 draft → apply 模型，逻辑安全，但界面只有复选框和“重置”：缺少当前选择摘要、单项移除、批量清除以及清除后的可见撤销入口。

## 实现

- 筛选面板顶部增加已选条件 toolbar，分别呈现学科、学段和能力 chip。
- 每个 chip 是真实按钮，可单项移除，并保留明确 accessible name。
- “批量清除”把 draft 置空，但不会改变 applied results 或 URL；应用按钮保持禁用并显示校验提示。
- “撤销清除”恢复清除前的完整 draft；“重置”恢复当前 applied filters。
- 清除、撤销和重置均通过非阻塞 Toast 反馈。
- 手动编辑新条件后会清除旧 undo snapshot，避免撤销覆盖用户后续选择。
- 桌面与移动布局保持同一信息顺序；新增按钮全部至少 44px。

## 外部项目决策

- 审查了 [formkit/auto-animate](https://github.com/formkit/auto-animate)。它适合简单列表增删，但主计划已经约束 Motion 为唯一常规动效运行时。
- 本次 chips 数量有限，主要价值是状态可逆而非列表编舞，因此不新增约 3KB 的第二动画 runtime。
- 使用现有 React 状态、CSS transform/opacity 和 kebiao Toast primitive。

## 无障碍修正

- 为展开态筛选面板新增独立 axe 场景，而不是只扫描默认关闭页面。
- 该场景发现原有学段提示色为 4.49:1、校验提示为 3.84:1；均改为更深的中性/警示色后通过。
- chips 未覆盖原生 button role；避免错误使用 `role=listitem` 导致操作从可访问按钮树中消失。

## 验证

- 完整功能场景覆盖单项移除、批量清除、撤销、非法空状态和重置反馈。
- E2E 场景总数 49；axe/辅助模式总数 21。
- 慢速环境中 13 路由循环审计超过原 30 秒总预算，已把长循环测试预算明确为 120 秒；7 个超时场景单独复跑全部通过。
- 13 路由 × 5 视口共 65 份基线通过；默认态 10,730 个交互目标低于 44px 为 0；展开态新增控件显式验证至少 44px。
- Stylelint、全 workspace typecheck、生产构建和 audit 通过。
- 主包 137.55 KB gzip，低于 150 KB；图谱 chunks 与 lazyGraphLeak 门禁不变。
