export function renderApiDocsPage() {
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="课程智能 API 中文开发者文档：课程标准检索、关系图谱、教学计划匹配与覆盖分析。" />
  <title>课程智能 API 中文开发者文档</title>
  <link rel="icon" href="data:," />
  <link rel="stylesheet" href="/api/v1/docs/assets/swagger-ui.css?v=5.32.8" onerror="this.onerror=null;this.href='https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.8/swagger-ui.css'" />
  <style>
    :root {
      color-scheme: light;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      --ink: #17211e;
      --muted: #596762;
      --subtle: #74807c;
      --line: #dce3e0;
      --canvas: #f5f7f6;
      --paper: #ffffff;
      --accent: #08785c;
      --accent-strong: #056046;
      --accent-soft: #e9f6f1;
      --blue: #2563eb;
      --amber: #b45309;
      --code: #14201c;
      --focus: #0b7f61;
      --radius: 6px;
    }

    * { box-sizing: border-box; }
    html { overflow-x: clip; scroll-behavior: smooth; }
    body { margin: 0; overflow-x: clip; background: var(--paper); color: var(--ink); }
    button, input, select, textarea { font: inherit; }
    button, a { -webkit-tap-highlight-color: transparent; }
    a { color: inherit; }
    :focus-visible { outline: 3px solid color-mix(in srgb, var(--focus) 28%, transparent); outline-offset: 2px; }
    #quick-start,
    #api-reference,
    .swagger-ui .opblock-tag-section,
    .swagger-ui .opblock { scroll-margin-top: 72px; }

    .docs-topbar {
      position: sticky;
      top: 0;
      z-index: 50;
      min-height: 58px;
      border-bottom: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(12px);
    }

    .docs-topbar__inner,
    .docs-shell {
      width: min(1180px, calc(100% - 40px));
      margin: 0 auto;
    }

    .docs-topbar__inner {
      min-height: 58px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }

    .docs-brand {
      display: inline-flex;
      align-items: center;
      gap: 11px;
      text-decoration: none;
      font-size: 15px;
      font-weight: 720;
      white-space: nowrap;
    }

    .docs-brand__mark {
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      border-radius: 5px;
      background: var(--accent);
      color: #fff;
      font-size: 15px;
      font-weight: 750;
    }

    .docs-nav {
      display: flex;
      align-items: center;
      gap: 22px;
      font-size: 13px;
      color: var(--muted);
    }

    .docs-nav a {
      text-decoration: none;
      white-space: nowrap;
    }

    .docs-nav a:hover { color: var(--accent-strong); }

    .docs-status {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: var(--muted);
      white-space: nowrap;
    }

    .docs-status::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #9ca3af;
    }

    .docs-status[data-state="ok"]::before { background: #0a8f68; }
    .docs-status[data-state="error"]::before { background: #c2413b; }

    .docs-intro {
      border-bottom: 1px solid var(--line);
      background: var(--canvas);
    }

    .docs-shell { padding: 38px 0; }

    .docs-eyebrow {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 9px;
      margin-bottom: 13px;
      color: var(--accent-strong);
      font-size: 12px;
      font-weight: 700;
    }

    .docs-badge {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 2px 8px;
      border: 1px solid #b8d8cc;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent-strong);
      font-size: 11px;
      font-weight: 700;
    }

    .docs-intro h1 {
      max-width: 820px;
      margin: 0;
      font-size: 34px;
      line-height: 1.24;
      letter-spacing: 0;
      font-weight: 760;
    }

    .docs-lead {
      max-width: 820px;
      margin: 14px 0 0;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.8;
    }

    .docs-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 22px;
    }

    .docs-button {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 14px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: #fff;
      color: var(--ink);
      font-size: 13px;
      font-weight: 680;
      text-decoration: none;
      cursor: pointer;
    }

    .docs-button:hover { border-color: #a8b7b1; background: #fbfcfc; }
    .docs-button--primary { border-color: var(--accent); background: var(--accent); color: #fff; }
    .docs-button--primary:hover { border-color: var(--accent-strong); background: var(--accent-strong); }

    .docs-onboarding {
      border-bottom: 1px solid var(--line);
      background: var(--paper);
    }

    .docs-onboarding .docs-shell {
      display: grid;
      grid-template-columns: minmax(0, 1.55fr) minmax(280px, 0.85fr);
      gap: 40px;
      padding-top: 34px;
      padding-bottom: 34px;
    }

    .docs-onboarding .docs-shell > * { min-width: 0; }

    .docs-section-title {
      margin: 0;
      font-size: 19px;
      line-height: 1.35;
      letter-spacing: 0;
      font-weight: 740;
    }

    .docs-section-copy {
      margin: 7px 0 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.7;
    }

    .quick-steps {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0;
      margin: 18px 0 0;
      padding: 0;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      list-style: none;
    }

    .quick-steps li {
      min-height: 54px;
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 10px 13px;
      border-right: 1px solid var(--line);
      color: var(--muted);
      font-size: 12px;
    }

    .quick-steps li:first-child { padding-left: 0; }
    .quick-steps li:last-child { border-right: 0; }
    .quick-steps span {
      width: 22px;
      height: 22px;
      flex: 0 0 22px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent-strong);
      font-size: 11px;
      font-weight: 750;
    }

    .code-example {
      width: 100%;
      min-width: 0;
      max-width: 100%;
      margin-top: 17px;
      overflow: hidden;
      border: 1px solid #26332e;
      border-radius: var(--radius);
      background: var(--code);
    }

    .code-example__toolbar {
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 6px 8px 6px 12px;
      border-bottom: 1px solid #31413b;
    }

    .code-tabs { display: flex; align-items: center; gap: 4px; }
    .code-tab,
    .copy-button {
      min-height: 32px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: #b8c7c1;
      font-size: 12px;
      cursor: pointer;
    }

    .code-tab { padding: 5px 9px; }
    .code-tab[aria-selected="true"] { background: #2a3a34; color: #fff; }
    .copy-button { padding: 5px 10px; border: 1px solid #42534c; }
    .copy-button:hover { border-color: #6f847b; color: #fff; }

    .code-panel { margin: 0; padding: 18px; overflow-x: auto; color: #e5eee9; }
    .code-panel[hidden] { display: none; }
    .code-panel code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.75;
      white-space: pre;
    }

    .response-note {
      margin: 13px 0 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.7;
    }

    .response-note strong { color: var(--ink); }

    .access-guide {
      padding-left: 36px;
      border-left: 1px solid var(--line);
    }

    .access-list {
      display: grid;
      gap: 0;
      margin: 17px 0 0;
      padding: 0;
      list-style: none;
      border-top: 1px solid var(--line);
    }

    .access-list li {
      display: grid;
      grid-template-columns: 76px minmax(0, 1fr);
      gap: 14px;
      padding: 13px 0;
      border-bottom: 1px solid var(--line);
      font-size: 12px;
      line-height: 1.65;
    }

    .access-list strong { color: var(--ink); font-size: 13px; }
    .access-list span { color: var(--muted); }
    .access-note { margin: 14px 0 0; color: var(--subtle); font-size: 12px; line-height: 1.7; }
    code.inline { padding: 2px 5px; border-radius: 3px; background: #eef2f0; color: var(--accent-strong); font-family: "SFMono-Regular", Consolas, monospace; }

    .docs-scenarios {
      border-bottom: 1px solid var(--line);
      background: #fbfcfb;
    }

    .docs-scenarios .docs-shell {
      display: grid;
      grid-template-columns: 180px repeat(4, minmax(0, 1fr));
      gap: 0;
      padding-top: 0;
      padding-bottom: 0;
    }

    .scenario-label,
    .scenario-link {
      min-height: 82px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 14px 18px;
      border-right: 1px solid var(--line);
    }

    .scenario-label { padding-left: 0; color: var(--muted); font-size: 12px; }
    .scenario-label strong { margin-bottom: 3px; color: var(--ink); font-size: 14px; }
    .scenario-link { text-decoration: none; }
    .scenario-link:last-child { border-right: 0; }
    .scenario-link:hover { background: var(--accent-soft); }
    .scenario-link strong { margin-bottom: 4px; color: var(--ink); font-size: 13px; }
    .scenario-link span { color: var(--muted); font-size: 11px; line-height: 1.45; }

    .reference-heading {
      width: min(1180px, calc(100% - 40px));
      margin: 0 auto;
      padding: 34px 0 18px;
    }

    .reference-heading__row {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 24px;
    }

    .reference-heading h2 { margin: 0; font-size: 23px; line-height: 1.3; letter-spacing: 0; }
    .reference-heading p { margin: 7px 0 0; color: var(--muted); font-size: 13px; line-height: 1.7; }
    .reference-heading a { color: var(--accent-strong); font-size: 12px; text-underline-offset: 3px; white-space: nowrap; }

    #swagger-ui { min-height: 65vh; padding-bottom: 44px; }
    .swagger-load-error {
      width: min(1180px, calc(100% - 40px));
      margin: 0 auto 44px;
      padding: 18px;
      border: 1px solid #e5b9b5;
      border-radius: var(--radius);
      background: #fff7f6;
      color: #7f1d1d;
      font-size: 13px;
      line-height: 1.7;
    }
    .swagger-load-error a { color: var(--accent-strong); text-underline-offset: 3px; }
    .swagger-ui,
    .swagger-ui .info .title,
    .swagger-ui .opblock-tag,
    .swagger-ui button,
    .swagger-ui input,
    .swagger-ui select,
    .swagger-ui textarea {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }

    .swagger-ui .information-container { display: none; }
    .swagger-ui .wrapper { max-width: 1180px; padding: 0 20px; }
    .swagger-ui .scheme-container {
      margin: 0 0 24px;
      padding: 16px 0;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      background: #fff;
      box-shadow: none;
    }

    .swagger-ui .scheme-container .schemes { align-items: flex-end; }
    .swagger-ui .auth-wrapper .authorize {
      min-height: 38px;
      border-color: var(--accent);
      border-radius: var(--radius);
      color: var(--accent-strong);
    }

    .swagger-ui .filter-container { margin: 0 0 18px; }
    .swagger-ui .filter .operation-filter-input {
      width: 100%;
      max-width: 100%;
      height: 42px;
      padding: 9px 12px;
      border: 1px solid #bfcac6;
      border-radius: var(--radius);
      color: var(--ink);
      font-size: 13px;
    }

    .swagger-ui .opblock-tag {
      margin: 0;
      padding: 16px 4px;
      border-bottom-color: var(--line);
      color: var(--ink);
      font-size: 19px;
    }

    .swagger-ui .opblock-tag small { color: var(--muted); font-size: 12px; line-height: 1.55; }
    .swagger-ui .opblock { margin: 0 0 10px; border-radius: var(--radius); box-shadow: none; }
    .swagger-ui .opblock .opblock-summary { min-height: 52px; padding: 6px 10px; }
    .swagger-ui .opblock .opblock-summary-method { min-width: 66px; border-radius: 4px; }
    .swagger-ui .opblock .opblock-summary-path { font-size: 13px; overflow-wrap: anywhere; }
    .swagger-ui .opblock .opblock-summary-description { color: #35413d; font-size: 12px; }
    .swagger-ui .opblock-description-wrapper p,
    .swagger-ui .opblock-external-docs-wrapper p,
    .swagger-ui .opblock-title_normal p { color: #35413d; font-size: 13px; line-height: 1.75; }
    .swagger-ui .markdown code { color: var(--accent-strong); }
    .swagger-ui .btn { border-radius: 4px; }
    .swagger-ui .btn.execute { border-color: var(--accent); background: var(--accent); }
    .swagger-ui .btn.execute:hover { background: var(--accent-strong); }
    .swagger-ui .response-control-media-type__accept-message { display: none; }
    .swagger-ui section.models { margin: 26px 0 0; border-color: var(--line); border-radius: var(--radius); }
    .swagger-ui section.models h4 { color: var(--ink); font-size: 16px; }
    .swagger-ui .model-container { border-radius: 4px; background: #f5f7f6; }

    @media (max-width: 900px) {
      .docs-onboarding .docs-shell { grid-template-columns: minmax(0, 1fr); gap: 30px; }
      .access-guide { padding-left: 0; padding-top: 28px; border-top: 1px solid var(--line); border-left: 0; }
      .docs-scenarios .docs-shell { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .scenario-label { grid-column: 1 / -1; min-height: 60px; border-right: 0; border-bottom: 1px solid var(--line); }
      .scenario-link:nth-child(3) { border-right: 0; }
      .scenario-link:nth-child(4), .scenario-link:nth-child(5) { border-top: 1px solid var(--line); }
    }

    @media (max-width: 720px) {
      .docs-topbar__inner,
      .docs-shell,
      .reference-heading { width: min(100% - 28px, 1180px); }
      .docs-topbar__inner { gap: 12px; }
      .docs-nav a:not(.docs-status) { display: none; }
      .docs-shell { padding-top: 28px; padding-bottom: 28px; }
      .docs-intro h1 { font-size: 28px; }
      .docs-lead { font-size: 15px; }
      .docs-actions { align-items: stretch; }
      .docs-button { flex: 1 1 auto; }
      .code-example__toolbar { align-items: flex-start; }
      .code-tabs { overflow-x: auto; }
      .quick-steps { grid-template-columns: 1fr; }
      .quick-steps li { min-height: 44px; padding-left: 0; border-right: 0; border-bottom: 1px solid var(--line); }
      .quick-steps li:last-child { border-bottom: 0; }
      .access-list li { grid-template-columns: 68px minmax(0, 1fr); }
      .docs-scenarios .docs-shell { width: 100%; }
      .scenario-label, .scenario-link { padding-left: 14px; padding-right: 14px; }
      .reference-heading { padding-top: 28px; }
      .reference-heading__row { align-items: flex-start; flex-direction: column; gap: 8px; }
      .swagger-ui .wrapper { padding: 0 14px; }
      .swagger-ui .scheme-container .schemes { align-items: stretch; flex-direction: column; }
      .swagger-ui .scheme-container .auth-wrapper { margin-top: 12px; }
      .swagger-ui .opblock-tag { align-items: flex-start; font-size: 17px; }
      .swagger-ui .opblock-tag small { display: block; margin-top: 5px; }
      .swagger-ui .opblock .opblock-summary { align-items: flex-start; flex-wrap: wrap; }
      .swagger-ui .opblock .opblock-summary-path { max-width: calc(100% - 82px); padding-top: 7px; }
      .swagger-ui .opblock .opblock-summary-description { flex-basis: 100%; padding: 3px 4px 5px 76px; }
      .swagger-ui .opblock-body { overflow-x: auto; }
    }
  </style>
</head>
<body>
  <header class="docs-topbar">
    <div class="docs-topbar__inner">
      <a class="docs-brand" href="#top" aria-label="课程智能 API 文档首页">
        <span class="docs-brand__mark" aria-hidden="true">课</span>
        <span>课程智能 API</span>
      </a>
      <nav class="docs-nav" aria-label="文档导航">
        <a href="#quick-start">快速开始</a>
        <a href="#api-reference">接口参考</a>
        <a href="/api/v1/openapi.yaml">OpenAPI YAML</a>
        <a class="docs-status" id="service-status" href="/api/v1/health" data-state="loading">正在检查服务</a>
      </nav>
    </div>
  </header>

  <main id="top">
    <section class="docs-intro" aria-labelledby="docs-title">
      <div class="docs-shell">
        <div class="docs-eyebrow">
          <span>中文开发者文档</span>
          <span class="docs-badge">API v0.2.0</span>
          <span class="docs-badge">OpenAPI 3.1</span>
        </div>
        <h1 id="docs-title">把课程标准数据接入你的教育产品</h1>
        <p class="docs-lead">查询结构化课程标准，理解标准之间的进阶与能力关系，并将教学计划匹配到可追溯的真实标准。接口路径、JSON 字段名和枚举值保留英文，所有使用说明均以中文呈现。</p>
        <div class="docs-actions">
          <a class="docs-button docs-button--primary" href="#api-reference">浏览接口</a>
          <button class="docs-button" id="open-auth" type="button">设置 API Key</button>
          <a class="docs-button" href="/api/v1/openapi.yaml">查看 OpenAPI 契约</a>
        </div>
      </div>
    </section>

    <section class="docs-onboarding" id="quick-start" aria-labelledby="quick-start-title">
      <div class="docs-shell">
        <div>
          <h2 class="docs-section-title" id="quick-start-title">三步完成第一次调用</h2>
          <p class="docs-section-copy">下面的标准搜索接口可匿名调用。选择语言、复制代码并运行，即可获得真实课程标准数据。</p>
          <ol class="quick-steps" aria-label="第一次调用步骤">
            <li><span>1</span>选择调用语言</li>
            <li><span>2</span>复制示例代码</li>
            <li><span>3</span>运行并读取响应</li>
          </ol>
          <div class="code-example">
            <div class="code-example__toolbar">
              <div class="code-tabs" role="tablist" aria-label="代码示例语言">
                <button class="code-tab" type="button" role="tab" aria-selected="true" aria-controls="snippet-curl" data-snippet="curl">curl</button>
                <button class="code-tab" type="button" role="tab" aria-selected="false" aria-controls="snippet-js" data-snippet="js">JavaScript</button>
                <button class="code-tab" type="button" role="tab" aria-selected="false" aria-controls="snippet-python" data-snippet="python">Python</button>
              </div>
              <button class="copy-button" id="copy-snippet" type="button">复制代码</button>
            </div>
            <pre class="code-panel" id="snippet-curl" role="tabpanel" data-code-panel="curl"><code>curl --request POST '__API_BASE__/api/v1/standards/search' &#92;
  --header 'Content-Type: application/json' &#92;
  --data '{"subjects":["science"],"keyword":"观察","limit":3}'</code></pre>
            <pre class="code-panel" id="snippet-js" role="tabpanel" data-code-panel="js" hidden><code>const response = await fetch(
  '__API_BASE__/api/v1/standards/search',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subjects: ['science'],
      keyword: '观察',
      limit: 3
    })
  }
)

const { data, meta } = await response.json()</code></pre>
            <pre class="code-panel" id="snippet-python" role="tabpanel" data-code-panel="python" hidden><code>import requests

response = requests.post(
    '__API_BASE__/api/v1/standards/search',
    json={
        'subjects': ['science'],
        'keyword': '观察',
        'limit': 3,
    },
)

payload = response.json()</code></pre>
          </div>
          <p class="response-note"><strong>响应约定：</strong>业务结果在 <code class="inline">data</code>，请求追踪、数据版本和提示信息在 <code class="inline">meta</code>。发生错误时，请按稳定的英文 <code class="inline">error.code</code> 处理，并保留 <code class="inline">request_id</code> 用于排查。</p>
        </div>

        <aside class="access-guide" aria-labelledby="access-title">
          <h2 class="docs-section-title" id="access-title">访问权限</h2>
          <p class="docs-section-copy">无需 API Key 即可体验公开数据。更高权限通过请求头 <code class="inline">x-api-key</code> 识别。</p>
          <ul class="access-list">
            <li><strong>匿名</strong><span>公开字段、基础检索和元信息，无需 API Key。</span></li>
            <li><strong>开发者</strong><span>增加来源与证据字段集：<code class="inline">source</code>、<code class="inline">evidence</code>。</span></li>
            <li><strong>合作伙伴</strong><span>增加教材相关字段集：<code class="inline">textbook</code>。</span></li>
            <li><strong>管理员</strong><span>管理字段与运行指标：<code class="inline">admin</code>、<code class="inline">/metrics</code>。</span></li>
          </ul>
          <p class="access-note">已有 API Key 时，可点击页面顶部“设置 API Key”，或在请求中加入 <code class="inline">x-api-key</code>。不要把密钥写入浏览器前端或公开仓库。</p>
        </aside>
      </div>
    </section>

    <section class="docs-scenarios" aria-label="常用场景">
      <div class="docs-shell">
        <div class="scenario-label"><strong>按场景开始</strong><span>直接定位常用接口</span></div>
        <a class="scenario-link" href="#/课程标准/searchStandards" data-api-tag="课程标准" data-operation-id="searchStandards"><strong>查找课程标准</strong><span>按学科、学段、领域、能力或关键词检索</span></a>
        <a class="scenario-link" href="#/关系图谱/getStandardNeighbors" data-api-tag="关系图谱" data-operation-id="getStandardNeighbors"><strong>查看标准关系</strong><span>获取前后、同领域、同能力和进阶标准</span></a>
        <a class="scenario-link" href="#/教学规划/matchPlanToStandards" data-api-tag="教学规划" data-operation-id="matchPlanToStandards"><strong>匹配教学计划</strong><span>返回真实标准 code、匹配分数与理由</span></a>
        <a class="scenario-link" href="#/教学规划/analyzePlanCoverage" data-api-tag="教学规划" data-operation-id="analyzePlanCoverage"><strong>分析课程覆盖</strong><span>识别已覆盖标准、覆盖领域和待复核项</span></a>
      </div>
    </section>

    <section id="api-reference" aria-labelledby="api-reference-title">
      <div class="reference-heading">
        <div class="reference-heading__row">
          <div>
            <h2 id="api-reference-title">接口参考</h2>
            <p>按分类展开接口，或使用搜索框按路径和关键词筛选。点击“试运行”可直接向当前服务发送请求。</p>
          </div>
          <a href="/api/v1/openapi.yaml">下载 OpenAPI YAML</a>
        </div>
      </div>
      <div id="swagger-ui"></div>
    </section>
  </main>

  <script src="/api/v1/docs/assets/swagger-ui-bundle.js?v=5.32.8"></script>
  <script>
    if (typeof SwaggerUIBundle === 'undefined') {
      document.write('<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.8/swagger-ui-bundle.js"><\\/script>')
    }
  </script>
  <script>
    const apiBase = window.location.origin
    document.querySelectorAll('[data-code-panel] code').forEach(function (code) {
      code.textContent = code.textContent.replaceAll('__API_BASE__', apiBase)
    })

    const snippetTabs = document.querySelectorAll('[data-snippet]')
    const snippetPanels = document.querySelectorAll('[data-code-panel]')
    snippetTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        const selected = tab.getAttribute('data-snippet')
        snippetTabs.forEach(function (item) {
          item.setAttribute('aria-selected', String(item === tab))
        })
        snippetPanels.forEach(function (panel) {
          panel.hidden = panel.getAttribute('data-code-panel') !== selected
        })
      })
    })

    async function copyText(value) {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value)
        return
      }
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }

    document.getElementById('copy-snippet').addEventListener('click', async function (event) {
      const activePanel = document.querySelector('[data-code-panel]:not([hidden]) code')
      if (!activePanel) return
      const button = event.currentTarget
      await copyText(activePanel.textContent.trim())
      button.textContent = '已复制'
      window.setTimeout(function () { button.textContent = '复制代码' }, 1600)
    })

    fetch('/api/v1/health')
      .then(function (response) {
        if (!response.ok) throw new Error('health check failed')
        return response.json()
      })
      .then(function (payload) {
        const status = document.getElementById('service-status')
        status.dataset.state = 'ok'
        status.textContent = '服务正常 · 数据 ' + payload.data.data_version
      })
      .catch(function () {
        const status = document.getElementById('service-status')
        status.dataset.state = 'error'
        status.textContent = '服务状态未知'
      })

    const zhText = new Map(Object.entries({
      "Servers": "服务地址",
      "Schemas": "数据结构",
      "Authorize": "设置 API Key",
      "Authorization": "认证",
      "Close": "关闭",
      "Available authorizations": "API Key 认证",
      "Value": "API Key",
      "Logout": "清除 API Key",
      "Try it out": "试运行",
      "Cancel": "取消",
      "Execute": "发送请求",
      "Clear": "清除结果",
      "Reset": "重置",
      "Responses": "响应",
      "Response body": "响应体",
      "Response headers": "响应头",
      "Request body": "请求体",
      "Parameters": "参数",
      "Name": "名称",
      "Name:": "请求头名称：",
      "In:": "位置：",
      "Value:": "API Key：",
      "Description": "说明",
      "Details": "详情",
      "Default value": "默认值",
      "Required": "必填",
      "Schema": "结构",
      "Example Value": "示例值",
      "Example": "示例",
      "Examples:": "示例：",
      "Edit Value": "编辑值",
      "Model": "模型",
      "Media type": "媒体类型",
      "Code": "状态码",
      "Links": "链接",
      "No links": "无链接",
      "Server response": "服务端响应",
      "Curl": "curl 命令",
      "Request URL": "请求地址",
      "Request duration": "请求耗时",
      "Undocumented": "未文档化",
      "Parameter content type": "参数内容类型",
      "Request content type": "请求内容类型",
      "Responses content type": "响应内容类型",
      "Media Type": "响应媒体类型",
      "No parameters": "无参数",
      "Download": "下载",
      "Copy to clipboard": "复制到剪贴板",
      "Apply credentials": "保存 API Key",
      "Deprecated": "已弃用",
      "Filter by tag": "搜索接口或路径",
      "string": "字符串",
      "object": "对象",
      "integer": "整数",
      "number": "数字",
      "boolean": "布尔值",
      "array": "数组"
    }))

    const zhAttributes = new Map(Object.entries({
      "Collapse operation": "收起接口",
      "Expand operation": "展开接口",
      "Expand all": "全部展开",
      "Collapse all": "全部收起",
      "authorization header": "认证请求头",
      "Request content type": "请求内容类型",
      "Media Type": "响应媒体类型",
      "Filter by tag": "搜索接口或路径",
      "Copy to clipboard": "复制到剪贴板"
    }))

    function replaceExactText(node) {
      const raw = node.nodeValue || ""
      const trimmed = raw.trim()
      const replacement = zhText.get(trimmed) || zhAttributes.get(trimmed)
      if (!replacement) return
      node.nodeValue = raw.replace(trimmed, replacement)
    }

    function localizeAttributes(element) {
      for (const attribute of ["aria-label", "title", "placeholder", "value"]) {
        const value = element.getAttribute(attribute)
        if (!value) continue
        let replacement = zhText.get(value.trim()) || zhAttributes.get(value.trim())
        if (!replacement && /^authorization button locked$/i.test(value)) replacement = "此接口支持 API Key"
        if (!replacement && /^authorization button unlocked$/i.test(value)) replacement = "已设置 API Key"
        if (replacement) element.setAttribute(attribute, replacement)
      }
    }

    function localizeSwaggerUi(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let textNode = walker.nextNode()
      while (textNode) {
        replaceExactText(textNode)
        textNode = walker.nextNode()
      }
      root.querySelectorAll("[aria-label], [title], [placeholder], [value]").forEach(localizeAttributes)
    }

    let localizationScheduled = false
    function scheduleLocalization() {
      if (localizationScheduled) return
      localizationScheduled = true
      window.requestAnimationFrame(function () {
        const root = document.getElementById("swagger-ui")
        if (root) localizeSwaggerUi(root)
        localizationScheduled = false
      })
    }

    function initializeSwaggerUi() {
      window.ui = SwaggerUIBundle({
        url: '/api/v1/openapi.yaml',
        dom_id: '#swagger-ui',
        deepLinking: true,
        docExpansion: 'none',
        filter: true,
        persistAuthorization: false,
        displayRequestDuration: true,
        defaultModelsExpandDepth: 0,
        defaultModelExpandDepth: 1,
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout',
        onComplete: scheduleLocalization
      })

      const observer = new MutationObserver(scheduleLocalization)
      observer.observe(document.getElementById("swagger-ui"), { childList: true, subtree: true })
      scheduleLocalization()
    }

    if (typeof SwaggerUIBundle === 'function') {
      initializeSwaggerUi()
    } else {
      document.getElementById('swagger-ui').innerHTML = '<div class="swagger-load-error"><strong>接口参考资源加载失败。</strong><br />请刷新页面重试，或直接打开 <a href="/api/v1/openapi.yaml">OpenAPI YAML</a> 查看完整契约。</div>'
    }

    document.getElementById('open-auth').addEventListener('click', function () {
      document.getElementById('api-reference').scrollIntoView({ behavior: 'smooth' })
      window.setTimeout(function () {
        const authButton = document.querySelector('.swagger-ui .authorize')
        if (authButton) authButton.click()
      }, 350)
    })

    document.querySelectorAll('[data-operation-id]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault()
        const tag = link.getAttribute('data-api-tag')
        const operationId = link.getAttribute('data-operation-id')
        if (!tag || !operationId) return
        document.getElementById('api-reference').scrollIntoView({ behavior: 'smooth' })

        window.setTimeout(function () {
          const sections = Array.from(document.querySelectorAll('.swagger-ui .opblock-tag-section'))
          const section = sections.find(function (item) {
            const tagLink = item.querySelector('.opblock-tag a')
            return tagLink && tagLink.textContent.trim() === tag
          })
          if (!section) return
          if (!section.classList.contains('is-open')) {
            const tagHeading = section.querySelector('.opblock-tag')
            if (tagHeading) tagHeading.click()
          }

          window.setTimeout(function () {
            const operation = document.getElementById('operations-' + tag + '-' + operationId)
            if (!operation) return
            if (!operation.classList.contains('is-open')) {
              const summaryControl = operation.querySelector('.opblock-summary-control')
              if (summaryControl) summaryControl.click()
            }
            operation.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }, 180)
        }, 120)
      })
    })
  </script>
</body>
</html>`
}
