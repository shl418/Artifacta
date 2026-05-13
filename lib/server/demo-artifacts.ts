export const salesDashboardHtml = String.raw`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Q2 销售业绩分析</title>
    <style>
      :root { color-scheme: light; --ink: #132222; --muted: #5d6f6f; --line: #d9e7e4; --teal: #00a7a7; --green: #12a05c; --amber: #d88a16; --rose: #d94f70; --panel: #ffffff; --wash: #f4f8f6; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--wash); color: var(--ink); }
      main { min-height: 100vh; padding: 28px; }
      .shell { width: min(1180px, 100%); margin: 0 auto; }
      .topbar { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
      .eyebrow { margin: 0 0 8px; color: var(--teal); font-size: 12px; font-weight: 800; letter-spacing: 0; text-transform: uppercase; }
      h1 { margin: 0; font-size: clamp(26px, 4vw, 44px); letter-spacing: 0; line-height: 1.05; }
      .period { color: var(--muted); font-size: 14px; }
      .grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 14px; }
      .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 18px 40px rgba(20, 54, 48, .08); }
      .metric { grid-column: span 3; padding: 18px; min-height: 132px; }
      .label { color: var(--muted); font-size: 13px; }
      .value { margin-top: 10px; font-size: 30px; font-weight: 800; letter-spacing: 0; }
      .delta { margin-top: 12px; display: inline-flex; gap: 6px; align-items: center; font-size: 12px; color: var(--green); background: #e9f8ef; border: 1px solid #c8ead4; border-radius: 999px; padding: 5px 8px; }
      .delta.warn { color: var(--amber); background: #fff5df; border-color: #efd8a6; }
      .chart { grid-column: span 8; padding: 20px; min-height: 360px; }
      .side { grid-column: span 4; padding: 20px; min-height: 360px; }
      .section-title { margin: 0 0 16px; font-size: 16px; }
      .bars { height: 230px; display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; align-items: end; border-bottom: 1px solid var(--line); padding-top: 16px; }
      .bar { position: relative; min-height: 42px; border-radius: 7px 7px 0 0; background: linear-gradient(180deg, #24c6b8, #018f9a); }
      .bar:nth-child(2n) { background: linear-gradient(180deg, #68c77f, #20845a); }
      .bar span { position: absolute; left: 50%; bottom: calc(100% + 8px); transform: translateX(-50%); color: var(--ink); font-size: 12px; font-weight: 800; white-space: nowrap; }
      .xaxis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; color: var(--muted); font-size: 12px; margin-top: 10px; text-align: center; }
      .pipeline { display: grid; gap: 12px; }
      .stage { display: grid; grid-template-columns: 82px 1fr 54px; align-items: center; gap: 10px; font-size: 13px; }
      .track { height: 10px; background: #edf3f2; border-radius: 999px; overflow: hidden; }
      .fill { height: 100%; background: var(--teal); border-radius: inherit; }
      .fill.green { background: var(--green); }
      .fill.amber { background: var(--amber); }
      .table { grid-column: span 7; overflow: hidden; }
      .table header, .table .row { display: grid; grid-template-columns: 1.2fr .9fr .9fr .9fr; gap: 12px; padding: 13px 18px; align-items: center; }
      .table header { color: var(--muted); font-size: 12px; background: #f8fbfa; border-bottom: 1px solid var(--line); }
      .table .row { border-bottom: 1px solid var(--line); font-size: 14px; }
      .table .row:last-child { border-bottom: 0; }
      .rank { grid-column: span 5; padding: 20px; }
      .chipline { display: flex; flex-wrap: wrap; gap: 10px; }
      .chip { border: 1px solid var(--line); border-radius: 999px; padding: 9px 12px; color: var(--muted); background: #fbfdfc; font-size: 13px; }
      @media (max-width: 860px) { main { padding: 16px; } .metric, .chart, .side, .table, .rank { grid-column: 1 / -1; } .topbar { align-items: start; flex-direction: column; } }
    </style>
  </head>
  <body>
    <main>
      <div class="shell">
        <div class="topbar">
          <div>
            <p class="eyebrow">Artifacta Hosted Dashboard</p>
            <h1>Q2 销售业绩分析</h1>
          </div>
          <div class="period">刷新时间 2026-05-11 09:30</div>
        </div>

        <section class="grid">
          <article class="panel metric"><div class="label">总收入</div><div class="value">¥8.42M</div><div class="delta">+18.4% vs Q1</div></article>
          <article class="panel metric"><div class="label">订单量</div><div class="value">42,180</div><div class="delta">+9.7% 环比</div></article>
          <article class="panel metric"><div class="label">客单价</div><div class="value">¥199.6</div><div class="delta warn">-2.1% 需关注</div></article>
          <article class="panel metric"><div class="label">转化率</div><div class="value">7.8%</div><div class="delta">+0.9 pct</div></article>

          <article class="panel chart">
            <h2 class="section-title">月度收入走势</h2>
            <div class="bars">
              <div class="bar" style="height: 56%"><span>1.18M</span></div>
              <div class="bar" style="height: 72%"><span>1.54M</span></div>
              <div class="bar" style="height: 66%"><span>1.42M</span></div>
              <div class="bar" style="height: 84%"><span>1.80M</span></div>
              <div class="bar" style="height: 78%"><span>1.67M</span></div>
              <div class="bar" style="height: 94%"><span>2.01M</span></div>
            </div>
            <div class="xaxis"><span>1月</span><span>2月</span><span>3月</span><span>4月</span><span>5月</span><span>6月</span></div>
          </article>

          <aside class="panel side">
            <h2 class="section-title">销售漏斗健康度</h2>
            <div class="pipeline">
              <div class="stage"><span>线索</span><div class="track"><div class="fill" style="width: 94%"></div></div><strong>18.2k</strong></div>
              <div class="stage"><span>商机</span><div class="track"><div class="fill green" style="width: 76%"></div></div><strong>7.4k</strong></div>
              <div class="stage"><span>报价</span><div class="track"><div class="fill amber" style="width: 51%"></div></div><strong>3.1k</strong></div>
              <div class="stage"><span>成交</span><div class="track"><div class="fill" style="width: 38%"></div></div><strong>1.6k</strong></div>
            </div>
          </aside>

          <article class="panel table">
            <header><span>区域</span><span>收入</span><span>订单</span><span>转化</span></header>
            <div class="row"><strong>华东</strong><span>¥3.20M</span><span>16,320</span><span>8.3%</span></div>
            <div class="row"><strong>华南</strong><span>¥2.40M</span><span>11,940</span><span>7.1%</span></div>
            <div class="row"><strong>华北</strong><span>¥1.78M</span><span>8,920</span><span>6.9%</span></div>
            <div class="row"><strong>西南</strong><span>¥1.04M</span><span>5,000</span><span>6.1%</span></div>
          </article>

          <article class="panel rank">
            <h2 class="section-title">本周经营信号</h2>
            <div class="chipline">
              <span class="chip">华东大客户续费率 91%</span>
              <span class="chip">华南渠道库存下降 14%</span>
              <span class="chip">低客单价 SKU 占比上升</span>
              <span class="chip">新客首购 7 日留存提升</span>
            </div>
          </article>
        </section>
      </div>
    </main>
  </body>
</html>`

export const growthDashboardHtml = String.raw`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>用户行为漏斗</title>
    <style>
      :root { --ink: #162021; --muted: #657273; --line: #dce5e1; --panel: #fff; --wash: #f7f6f1; --teal: #0a9e9e; --blue: #3578e5; --green: #11a36a; --coral: #d76545; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: var(--wash); }
      main { min-height: 100vh; padding: 28px; }
      .shell { width: min(1120px, 100%); margin: 0 auto; }
      .heading { display: flex; justify-content: space-between; gap: 20px; align-items: end; margin-bottom: 18px; }
      h1 { margin: 0; font-size: clamp(26px, 4vw, 42px); letter-spacing: 0; }
      .caption { margin: 6px 0 0; color: var(--muted); }
      .badge { border: 1px solid var(--line); border-radius: 999px; padding: 8px 12px; background: #fff; color: var(--muted); font-size: 13px; }
      .grid { display: grid; grid-template-columns: 1.15fr .85fr; gap: 14px; }
      .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 18px 36px rgba(44, 45, 35, .08); }
      .funnel { padding: 22px; }
      .steps { display: grid; gap: 12px; margin-top: 18px; }
      .step { display: grid; grid-template-columns: 110px 1fr 94px; align-items: center; gap: 14px; }
      .step strong { font-size: 14px; }
      .track { height: 48px; border-radius: 7px; background: #eff3f1; overflow: hidden; position: relative; }
      .fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--teal), var(--blue)); display: flex; align-items: center; justify-content: end; padding-right: 14px; color: #fff; font-weight: 800; }
      .fill.green { background: linear-gradient(90deg, var(--green), var(--teal)); }
      .fill.coral { background: linear-gradient(90deg, var(--coral), #e1a243); }
      .insights { padding: 22px; display: grid; gap: 14px; }
      .card { border: 1px solid var(--line); border-radius: 8px; padding: 16px; background: #fbfdfb; }
      .card p { margin: 8px 0 0; color: var(--muted); line-height: 1.55; }
      .mini { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 14px; }
      .metric { padding: 18px; }
      .metric span { color: var(--muted); font-size: 13px; }
      .metric strong { display: block; margin-top: 8px; font-size: 28px; }
      @media (max-width: 860px) { main { padding: 16px; } .heading { flex-direction: column; align-items: start; } .grid, .mini { grid-template-columns: 1fr; } .step { grid-template-columns: 82px 1fr; } .step em { grid-column: 2; } }
    </style>
  </head>
  <body>
    <main>
      <div class="shell">
        <div class="heading">
          <div>
            <h1>用户行为漏斗</h1>
            <p class="caption">从访问到付费的关键转化路径，自动同步自增长实验表。</p>
          </div>
          <div class="badge">公开分享 · Artifacta 托管</div>
        </div>

        <section class="grid">
          <article class="panel funnel">
            <h2>核心路径</h2>
            <div class="steps">
              <div class="step"><strong>访问</strong><div class="track"><div class="fill" style="width: 100%">120,000</div></div><em>100%</em></div>
              <div class="step"><strong>注册</strong><div class="track"><div class="fill green" style="width: 74%">88,800</div></div><em>74%</em></div>
              <div class="step"><strong>激活</strong><div class="track"><div class="fill" style="width: 42%">50,400</div></div><em>42%</em></div>
              <div class="step"><strong>付费</strong><div class="track"><div class="fill coral" style="width: 21%">25,200</div></div><em>21%</em></div>
            </div>
          </article>

          <aside class="panel insights">
            <div class="card"><strong>关键瓶颈</strong><p>注册后 24 小时内未创建首个看板的用户，后续激活率下降 38%。</p></div>
            <div class="card"><strong>增长机会</strong><p>团队邀请发生在首日的账户，付费转化率达到普通账户的 2.4 倍。</p></div>
            <div class="card"><strong>建议动作</strong><p>把「生成示例看板」放到 onboarding 第一屏，并提供团队分享模板。</p></div>
          </aside>
        </section>

        <section class="mini">
          <article class="panel metric"><span>7 日留存</span><strong>46.8%</strong></article>
          <article class="panel metric"><span>团队邀请率</span><strong>31.2%</strong></article>
          <article class="panel metric"><span>付费账户 ARPA</span><strong>¥1,280</strong></article>
        </section>
      </div>
    </main>
  </body>
</html>`

export const salesDatasetCsv = "region,revenue,orders,conversion\n华东,3200000,16320,0.083\n华南,2400000,11940,0.071\n华北,1780000,8920,0.069\n西南,1040000,5000,0.061\n"

export const growthDatasetJson = JSON.stringify(
  [
    { step: "访问", users: 120000 },
    { step: "注册", users: 88800 },
    { step: "激活", users: 50400 },
    { step: "付费", users: 25200 },
  ],
  null,
  2
)
