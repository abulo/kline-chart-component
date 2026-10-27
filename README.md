# K 线图表组件（KLineChart）

> 仿东方财富 / 通达信风格的多 Pane K 线与分时图组件，基于 **Vue3 + TypeScript + lightweight-charts v5.2.1** 深度定制。

## 一、项目介绍

### 1.1 这是什么

一个开箱即用的**多 Pane K 线 / 分时图表组件**：单个 `<KLineChart>` 组件内通过 lightweight-charts v5 原生多 Pane 能力承载完整的行情图表，覆盖 **K 线主图、成交量、附图指标、分时（1d~5d）** 四大视图，支持深 / 浅双主题、十字星联动、tooltip 拖拽、键盘导航、实时数据订阅等交易软件级交互。

组件遵循「**接口与实现分离**」设计：数据层统一走 `ChartDataService` 接口（历史分页拉取 + 实时订阅），内置 Mock 服务开箱即用，接入真实行情只需替换为 `HttpChartDataService`，组件零改动。

### 1.2 技术栈

| 依赖 | 版本 | 用途 |
|---|---|---|
| Vue | 3.5.x | 组件框架（Composition API） |
| TypeScript | 5.x | 全仓强类型（`vue-tsc` 零错误） |
| lightweight-charts | **5.2.1（锁定）** | 图表内核（原生多 Pane / timeScale / series） |
| Vite | 5.x | 开发与构建 |
| Vitest | 2.x | 单元测试（27 文件 / 257 用例） |

包管理器：**pnpm**（`packageManager` 锁定 `pnpm@12.15.0`）；Node ≥ 24。

### 1.3 核心能力总览

- **多 Pane 布局**：pane0 信息行 → pane1 K 线主图 → pane2 成交量信息行 → pane3 成交量图 → pane4 指标信息行 → pane5 附图指标图；`main : volume : indicator = 60 : 20 : 20`，成交量组 / 指标组可独立开关（四态布局，见 §7）。
- **K 线主图**：Candlestick 蜡烛 + 主图指标叠加（MA / EXPMA / BOLL / SAR / BBI 互斥）+ 最高 / 最低价标注 + 最后价线（priceLine）+ 空心红柱（上涨柱背景填充 + 红框）。
- **分时图（1d~5d）**：pane1 用 LineSeries 双线（价格 + 均价），成交量 / MACD 用 1px 直方图，栅格竖线按周期 4/2/3/4/5 等分，左右刻度以「首根 preClose」为中值对称等差扩展，右侧同步百分比刻度。
- **附图指标**：RSI / KDJ / MACD / WR / DMI / BIAS / OBV / CCI / ROC / CR 十指标互斥单选（分时无 CR），指标信息行 + 自绘指标图。
- **十字星联动**：竖 / 横线 + 左 / 右刻度指示值 + 数据浮层 tooltip（K 线 OHLC / 分时价格均价，含涨跌着色）；tooltip 可拖拽、文字可选中，边界 clamp 在 pane1~pane5 数据区。
- **键盘导航**：左右方向键移动十字星（每按 1 bar、按住 40ms 自动连发），到可视区边缘自动滚动视口跟随。
- **主题**：深 / 浅双系，所有颜色集中在 `theme.ts` 公共文件（页面零散落硬编码色值）；红涨绿跌、平盘白 / 黑。
- **数据服务**：Mock 服务（约 3 年日 K + 分时 + 分钟 K 聚合 + A股情绪形态注入 + 模拟实时推送，LRU 内存上限防溢出）；Http 服务（HTTP 历史 + WS / SSE / Poll 三种实时模式）；`data` prop 直通自定义数据。

### 1.4 架构分层

```
┌─────────────────────────────────────────────────────┐
│ 接入层  App.vue（工具栏 / 周期栏 / 语言 / 主题）        │
│         KLineChart.vue（组件：Props / 事件 / 控制器 ref）│
├─────────────────────────────────────────────────────┤
│ 控制器层  KLineChartController（数据 / 生命周期 / API） │
│   ├─ chartDataBridge（历史 / 翻页 / 实时订阅编排）      │
│   ├─ realtimePipeline（实时增量管线 / 节流消费）        │
│   ├─ indicatorManager / subIndicatorPaneManager       │
│   ├─ crosshairManager / timeshareManager              │
│   └─ paneFactory / paneLayout / viewport              │
├─────────────────────────────────────────────────────┤
│ 数据层    ChartDataService（接口）                     │
│   ├─ MockChartDataService（本地模拟）                  │
│   ├─ HttpChartDataService（HTTP/SSE/WS/Poll 真实行情） │
│   └─ mockDataGenerator（纯数据生成，可单测）            │
├─────────────────────────────────────────────────────┤
│ 渲染层    lightweight-charts v5 内核 + 自绘 Primitive   │
│   （栅格 / 左刻度标签 / 成交量柱 / MACD 柱 / 指标线 /    │
│     SAR 点 / 高低价标注 / priceLine / tooltip / 边框）  │
└─────────────────────────────────────────────────────┘
```

数据流：`init()` 拉最新页 → `setKlineData` 重绘 + fitContent → 订阅实时 → 实时点经 `realtimePipeline` 节流增量更新；平移到达最左自动 `loadEarlier` 分页拉更早历史（`before` 锚点 + 去重升序前置插入）。

---

## 二、快速开始

### 2.1 安装依赖

```bash
pnpm install        # 锁定 lightweight-charts 5.2.1 / vue 3.5.x
pnpm dev            # 开发预览 http://127.0.0.1:5210
pnpm test           # vitest 单元测试
pnpm build          # vue-tsc 类型检查 + 构建（产物 dist/）
```

### 2.2 最小用法

```html
<KLineChart
  symbol="300750"
  name="宁德时代"
  theme="dark"
  :period="'day'"
  main-indicator="ma"
  sub-indicator="macd"
  @period-change="onPeriodChange"
/>
```

父组件只需维护状态并传 Props（单向数据流）；放大 / 缩小 / 左移 / 右移等瞬时动作经 `ref` 直接调用控制器：

```ts
const chartRef = ref<InstanceType<typeof KLineChart> | null>(null)
chartRef.value?.controller?.zoomIn()
chartRef.value?.controller?.setPeriod('1d')
```

### 2.3 无后端直通自定义数据

```html
<KLineChart
  symbol="600519"
  name="贵州茅台"
  :period="'day'"
  :data="myBars"          <!-- ChartDataPoint[]，提供时跳过 service 拉取 / 分页 / 实时 -->
/>
```

---

## 三、组件 API 文档（KLineChart.vue）

### 3.1 Props（入参总表）

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `symbol` | `string` | `''` | 股票代码（pane0 信息行：名称 [代码]；`setSymbol` 可更新） |
| `name` | `string` | `''` | 股票名称（pane0 信息行显示） |
| `period` | `PeriodValueOrEmpty` | `'day'` | 当前周期（外部可控；变化时经 service 重新拉取该周期数据；`''` = 周期未设置，组件不发起请求） |
| `theme` | `ChartThemeName` | `'dark'` | 主题：`'dark'` 深系 / `'light'` 浅系（全部颜色见 `theme.ts`） |
| `timeAxis` | `boolean` | `true` | 底部时间轴显隐（切换时重算 pane 高度） |
| `leftScale` | `boolean` | `false` | 左刻度区显隐（统一宽 72px，切换后 fitContent） |
| `rightScale` | `boolean` | `false` | 右刻度区显隐（同左） |
| `mainIndicator` | `MainIndicatorType \| ''` | `''` | 主图指标：`'ma' / 'expma' / 'boll' / 'sar' / 'bbi'`（`''` = 关；互斥，点击已激活项关闭） |
| `subIndicator` | `SubIndicatorType \| ''` | `''` | 附图指标：`'rsi' / 'kdj' / 'macd' / 'wr' / 'dmi' / 'bias' / 'obv' / 'cci' / 'roc' / 'cr'`（`''` = 关指标层；互斥） |
| `service` | `ChartDataService` | `MockChartDataService` 单例 | 数据服务实现（接入真实行情传 `HttpChartDataService` 实例，组件零改动） |
| `data` | `ChartDataPoint[]` | `undefined` | 外部自定义数据（提供时优先渲染，跳过 service 拉取 / 分页 / 实时，v1.6.28） |
| `format` | `string` | `''` | 时间格式模板（如 `'YYYY-MM-DD'` / `'YYYY-MM-DD HH:mm'`）；缺省按周期自动：K 线 `YYYY-MM-DD`、分时 `HH:mm` |
| `priceLineVisible` | `boolean` | `true` | 最后价线显隐（K 线主图自绘 priceLine） |
| `volumeVisible` | `boolean` | `true` | 成交量组显隐（pane2 信息行 + pane3 成交量图；关闭销毁整组 + 布局重算；关闭时 tooltip 与 pane0 信息行隐藏量额） |
| `avgLineVisible` | `boolean` | `true` | 分时均价线显隐（关闭时均价线不渲染，pane0 信息行 / tooltip 同步隐藏均价；仅分时周期生效） |

### 3.2 事件（出参总表）

| 事件 | 出参 | 触发时机 |
|---|---|---|
| `period-change` | `value: PeriodValue` | 周期变化时触发（App 周期栏点击 / 内部切换） |
| `status-change` | `status: ChartLoadStatus` | 加载状态变化：`'idle' / 'loading'（首载）/ 'loading-older'（左滑分页）/ 'ready' / 'error'` |

### 3.3 控制器方法（ref 访问，入参 → 出参）

```ts
const chartRef = ref<InstanceType<typeof KLineChart> | null>(null)

// —— 瞬时动作（无入参） ——
chartRef.value?.controller?.zoomIn()        // 放大（barSpacing 限幅 2~80）
chartRef.value?.controller?.zoomOut()       // 缩小
chartRef.value?.controller?.shiftLeft()     // 左移（逻辑范围平移一屏宽，到最左自然停）
chartRef.value?.controller?.shiftRight()    // 右移（同左）

// —— 数据与标的（入参后生效） ——
chartRef.value?.controller?.init()                     // 无入参：拉历史 + 重绘 + 订阅实时（组件自动调用）
chartRef.value?.controller?.setSymbol('600519')        // 入参 symbol: string —— 更新股票代码（pane0 显示 + 后续 init 生效）
chartRef.value?.controller?.setName('贵州茅台')         // 入参 name: string —— 更新股票名称
chartRef.value?.controller?.setService(mockService)    // 入参 service: ChartDataService —— 更新数据服务实例（后续 init 生效）
chartRef.value?.controller?.setPeriod('day')           // 入参 period: PeriodValue —— 更新周期（时间格式随之切换）

// —— 状态设置（Props watch 已自动调用；手动仅用于编程式控制） ——
chartRef.value?.controller?.applyTheme('light')                  // 入参 theme: ChartThemeName
chartRef.value?.controller?.toggleTimeAxis(false)                // 入参 visible: boolean
chartRef.value?.controller?.setLeftScaleVisible(true)            // 入参 visible: boolean
chartRef.value?.controller?.setRightScaleVisible(true)           // 入参 visible: boolean
chartRef.value?.controller?.setMainIndicator('boll')             // 入参 name: MainIndicatorType | null
chartRef.value?.controller?.setSubIndicator('kdj')               // 入参 name: SubIndicatorType | null（null = 关指标层）

// —— 生命周期（组件卸载自动调用） ——
chartRef.value?.controller?.destroy()          // 无入参：移除监听 / 断开 ResizeObserver / detach primitive / chart.remove()

// —— 加载状态（ref 访问当前值） ——
chartRef.value?.loadStatus                     // 'idle' | 'loading' | 'loading-older' | 'ready' | 'error'
```

---

## 四、数据接入（src/services）

### 4.1 服务接口（chartDataService.ts）

组件数据层统一走 `ChartDataService` 接口，组件 / 控制器零依赖具体实现：

| 成员 | 签名 | 入参说明 | 出参说明 |
|---|---|---|---|
| `fetchLimit` | `readonly number` | 构造时必填（每页拉取条数） | — |
| `fetchHistory` | `(query: HistoryQuery) => Promise<ChartDataPoint[]>` | `query` 见下 | 按 `time` 升序的数据点数组；**返回条数 < `limit` 表示已无更早数据** |
| `subscribeRealtime` | `(symbol: string, period: string, handler: RealtimeHandler) => () => void` | `symbol` 证券代码 / `period` 周期 | 返回**取消订阅函数**（组件 / 控制器退订时调用，防泄漏） |

`HistoryQuery`（历史查询入参）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `symbol` | `string` | ✓ | 证券代码，如 `'600000.SH'` |
| `period` | `string` | ✓ | 周期：`'1d'`（日线）/ `'1m' / '5m' / '15m' / '60m'` 分钟 K |
| `before` | `number` | ✗ | 拉取该时间戳（秒）**之前**的数据；不传取最新一页 |
| `limit` | `number` | ✓ | 每页条数 |
| `total` | `number` | ✗ | 当前已持有数据条数；**HttpChartDataService 自动计算**（累计去重数 与 后端上次 `total` 较大值），以 `total=<n>` 附加到请求 URL 供后端增量 / 续传判断；调用方可显式传入覆盖 |

`RealtimeHandler`（实时回调出参）：`(point: ChartDataPoint) => void` —— 实时推送数据点，`time` 与最后一根相同 = 刷新该根，更大 = 追加新 K 线。

### 4.2 MockChartDataService（默认，本地模拟）

```ts
new MockChartDataService({ fetchLimit: 200 })   // 必填：每页拉取条数
```

- 内置约 3 年日 K 池 + A股情绪形态注入（一字板 1~10 连板 / 厂字板 / 尾盘上板 / 地天板 / 天地天板 / 尾盘下板 / 天底板 / 地天地板，涨跌停按主板 ±10%）；
- 分时（1d~5d）按最近 N 个交易日生成 241 分钟分时点 / 交易日（价格线 / 均价线 / 量，`timesharePatternPath` 8 种确定性情绪路径）；
- 分钟 K（60/30/15/5/1 分）按真实交易时段聚合、布朗桥锚定日 K 开收（跨周期价格自洽）；周 / 月 K 由日 K 聚合；
- 模拟实时推送（K 线 tick / 分时每分钟刷新）；
- **内存管理**：`touchCache` LRU 淘汰——日 K / 分时池最多 4 个 symbol、派生周期池最多 8 个 key、实时定时器最多 8 个订阅，超限淘汰最久未使用（防多 symbol 切换内存无限增长）。

### 4.3 HttpChartDataService（接入真实行情）

```ts
new HttpChartDataService({
  fetchLimit: 200,                    // 必填：每页拉取条数（历史 / 左滑分页共用）
  historyUrl: 'http://<host>/api/kline/history', // 必填：历史完整地址（含自有路由 / query）
  realtimeTransport: 'ws',            // 可选：'ws'（默认）| 'sse' | 'poll'
  wsUrl: 'wss://<host>/ws',           // 'ws' 模式必填完整地址
  sseUrl: 'https://<host>/sse',       // 'sse' 模式必填完整地址
  sseEventName: 'message',            // 可选：SSE 事件名，默认 'message'
  pollUrl: 'https://<host>/api/kline/latest', // 'poll' 模式必填完整地址
  pollIntervalMs: 3000,               // 可选：轮询频率 ms，默认 3000
  timeoutMs: 8000,                    // 可选：fetch 超时 ms，默认 8000
  headers: { Authorization: 'Bearer <token>' },  // 可选：注入所有 HTTP 请求头
  cookies: { session: 'abc123' },     // 可选：对象形式，序列化注入 Cookie 头
  params: { market: 'SH' },           // 可选：附加所有请求的 URL query
  cache: true,                        // 可选：历史缓存开关，默认 true
  maxCacheEntries: 12,                // 可选：LRU 缓存条目上限（symbol|period 组合数）
  maxKnownTotals: 64,                 // 可选：「已知总条数」记录上限（防内存无限增长）
  cacheTtlMs: 30000,                  // 可选：最新页缓存有效期 ms（更早分页不受限）
})
```

**后端接口约定**：`GET {historyUrl}?symbol=&period=&before=&limit=[&total=]` 返回 `{ code: 200, data: ChartDataPoint[] }`（`time` 升序；返回条数 < `limit` 表示无更早数据）。

**实时模式**：
- `ws`：WebSocket，无法注入自定义请求头（浏览器限制），鉴权依赖自定义头时改用 `sse` / `poll`；
- `sse`：基于 `@microsoft/fetch-event-source`（fetch 流式读取），可携带自定义 `headers` / `cookies`，断线自动 3s 重连；HTTP 401/403 中止订阅防死循环；
- `poll`：HTTP 轮询 `pollUrl`，间隔 `pollIntervalMs`。

---

## 五、数据点格式（ChartDataPoint）

统一数据点类型（`src/types/chart.ts`），三种数据类型合并为同一数组，通过 `pointType` 字段做类型守卫：

| 字段 | 类型 | pointType | 说明 |
|---|---|---|---|
| `time` | `number` | 全部 | 秒级时间戳（lightweight-charts 标准时间格式） |
| `tradeDate` | `string` | 全部 | 交易日期 `YYYY-MM-DD` |
| `preClose` | `number` | 全部 | 昨收价（涨跌幅 / 涨跌着色基准） |
| `pointType` | `'kline' \| 'timeshare' \| 'auction'` | 全部 | 数据点类型标记（类型守卫） |
| `open / high / low / close` | `number` | kline | 开 / 高 / 低 / 收 |
| `volume` | `number` | kline | 成交量（手 / 股） |
| `amount` | `number` | kline | 成交额 |
| `risePrice / riseRate` | `number` | kline | 涨跌额 / 涨跌幅 %（相对昨收） |
| `price` | `number` | timeshare | 分时当前成交价 |
| `avgPrice` | `number` | timeshare | 分时平均成交价 |
| `matched / unMatched` | `number` | auction | 已匹配 / 未匹配量 |
| `matchType` | `-1 \| 1` | auction | 买卖方向：-1 卖多（绿）/ 1 买多（红） |
| `isAuction` | `boolean` | auction | 是否集合竞价时段 |

---

## 六、周期与指标

### 6.1 周期表（periods.ts）

| value | label | 说明 |
|---|---|---|
| `1d ~ 5d` | 1日分时 ~ 5日分时 | 分时图（栅格竖线 4/2/3/4/5 等分，时间轴 `HH:mm`，241 分钟点/日） |
| `day` | 日K | 时间轴 `YYYY-MM-DD` |
| `week / month` | 周K / 月K | 由日 K 聚合 |
| `60min / 30min / 15min / 5min / 1min` | 60分K ~ 1分K | 按真实交易时段聚合 |

### 6.2 主图指标（pane1，互斥）

| 指标 | 线 | 说明 |
|---|---|---|
| MA | 5 / 10 / 20 / 30 / 60 | 简单移动平均 |
| EXPMA | 12 / 50 | 指数平滑移动平均 |
| BOLL | 上 / 中 / 下轨（N=20, K=2） | 布林带 |
| SAR | 抛物点 | 多头红 / 空头绿圆点 |
| BBI | 单线 | 多空指标 (MA3+MA6+MA12+MA24)/4 |

### 6.3 附图指标（pane5，互斥；分时无 CR）

RSI / KDJ / MACD / WR / DMI / BIAS / OBV / CCI / ROC / CR；MACD 红绿柱 K 线为空心红柱 + 绿实心，分时为 1px 直方图。

### 6.4 分时特殊规则（v1.7.0~v1.7.4）

- pane1 用 LineSeries 双线（价格 + 均价），无 K 线主图指标；
- pane3 成交量用直方图（Histogram，1px），不用 K 线柱体自绘；MACD 同；
- 附图指标无 CR；App 平移 / 缩放按钮隐藏；分时不可平移；
- 时间格式 `YYYY-MM-DD HH:mm`（tooltip / 信息行）；
- 成交量红绿柱：第一根按「本分钟价 vs preClose」；其余按「本分钟价 vs 上一分钟价」（上涨红 / 下跌绿 / 平盘白黑）；
- 均价线可开关（`avgLineVisible`，v1.7.4）；关闭时 pane0 信息行 / tooltip 同步隐藏均价。

---

## 七、布局结构

指标开启（6 Pane，`main : volume : indicator = 60 : 20 : 20`）：

```
┌──────────────────────────────────────┐
│ pane0  信息行（名称[代码] 时间 + 指标值）│
│ pane1  K 线主图（Candlestick）         │  ← main 组 60%
│ pane2  成交量信息行（成交量 + MA5/MA10）│
│ pane3  成交量（自绘红绿柱）             │  ← volume 组 20%
│ pane4  指标信息行（各线数值，固定 22px）│
│ pane5  附图指标（十指标互斥）           │  ← indicator 组 20%
└──────────────────────────────────────┘
    底部：共享时间轴（timeScale，可开关）
```

成交量组 / 指标组开关组合出**四态布局**：

| 成交量组 | 附图指标 | Pane 数 | 内容比例 |
|---|---|---|---|
| 开 | 开 | 6 | main : volume : indicator = 60 : 20 : 20 |
| 开 | 关 | 4 | main : volume = 80 : 20 |
| 关 | 开 | 4 | main : indicator = 80 : 20 |
| 关 | 关 | 2 | main = 100%（仅 K 线） |

**数据面联动**：成交量组关闭时，tooltip 隐藏「成交量 / 成交额」行、pane0 信息行隐藏量额段；指标组关闭时对应 pane4/pane5 移除，主图 / 成交量比例自动调整为 80:20。

---

## 八、主题与配色（theme.ts）

- **主题切换**：深 / 浅两套配色全部集中在 `src/chart/core/theme.ts`（`ChartThemeColors` + `chartThemes`，页面无散落硬编码色值）；
- **红涨绿跌**：上涨 `#FF0000`、下跌 `#008000`（深浅系一致）；**平盘**深系白 / 浅系黑（`flatColor`）；
- **上涨柱空心**：K 线 / 成交量 / MACD 柱 > 0 均为「背景色填充 + 红框」空心红柱，下跌绿色实心；
- **分时双线**：深系价格线白 / 均价线亮黄；浅系价格线深灰 / 均价线深金黄；
- 指标配色（主图 / 附图）深浅系通用，集中于 `mainIndicatorColors` / `subIndicatorColors`。

---

## 九、目录结构

```
src/
├── App.vue                    # 工具栏 + 容器（80% 宽高居中）
├── main.ts                    # 入口
├── components/
│   └── KLineChart.vue         # 图表组件（Props / 事件 / 控制器 ref）
├── chart/                     # 按功能分组的图表源码
│   ├── periods.ts             # 周期配置（13 项 + periodMap O(1) 查询 + 分时栅格等分数）
│   ├── core/                  # 核心：控制器 / 布局 / 主题 / 数据桥
│   │   ├── kLineChartController.ts   # 控制器（<1000 行）：数据 / 生命周期 / 对外 API
│   │   ├── chartDataBridge.ts        # 数据 IO 桥（历史 / 翻页 / 实时订阅编排 + 竞态守卫）
│   │   ├── realtimePipeline.ts       # 实时增量管线（节流 → 批量消费 → 增量更新）
│   │   ├── indicatorManager.ts       # 主图指标 + 成交量均量线 + 信息行
│   │   ├── subIndicatorPaneManager.ts # 附图指标 Pane 管理（pane4/5 创建销毁）
│   │   ├── crosshairManager.ts       # 十字星联动 + overlayTime + 指示值注册表
│   │   ├── timeshareManager.ts       # 分时计算（preClose 对称半幅 / 等差刻度 / 三态着色）
│   │   ├── paneFactory.ts / paneLayout.ts / viewport.ts
│   │   ├── theme.ts / resolveBarColors.ts / mergeBars.ts
│   │   └── candlestickWidth.ts / constants.ts / types.ts / indicatorMeta.ts / mock.ts
│   ├── axis/                  # 左刻度标签（与栅格对齐，指示值共用 drawAxisLabel）
│   ├── crosshair/             # 十字星指示值 + 数据浮层 tooltip
│   ├── border/ / highLow/ / grid/ / volume/ / overlay/
│   ├── indicator/             # 东财指标库（index.ts 统一出口 + 各指标纯函数）
│   └── util/format.ts         # 数值格式化（价格 / 成交量 / 指标刻度 / 日期）
├── services/
│   ├── chartDataService.ts    # 接口定义（HistoryQuery / RealtimeHandler / ChartDataService）
│   ├── mockChartDataService.ts # Mock 服务实现（懒生成池 + 分页 / 实时编排 + LRU）
│   ├── mockDataGenerator.ts   # 纯数据生成（日 K / 分时 / 分钟聚合 / 周月聚合）
│   └── httpChartDataService.ts # HTTP 历史 + WS/SSE/Poll 实时 + LRU 缓存
└── types/chart.ts             # 统一数据点类型（ChartDataPoint）
```

---

## 十、构建 / 测试 / 打包

```bash
pnpm dev           # 开发（http://127.0.0.1:5210）
pnpm test          # vitest 单测（27 文件 / 257 用例，含拆分模块 splitModules.test.ts）
pnpm build         # vue-tsc 类型检查（零错误）+ 构建
npx vite preview   # 预览构建产物（http://127.0.0.1:4173/kline-chart-component/）
```

打包 zip（交付物约定，zip 不入 git）：

```bash
zip -r kline-chart-component-v<版本>.zip . -x "node_modules/*" -x "dist/*" -x ".git/*" -x "*.zip" -x "coverage/*" -x ".DS_Store" -x "*.log"
```

---

## 十一、内存与性能

- **十字星事件 rAF 节流**：同帧多次 crosshairMove 合并为一次处理（每帧至多一次重绘）；`setCrosshairY` 同值跳过；
- **primitive 视图单例复用**：`paneViews()` / `priceAxisPaneViews()` 返回构造时创建的单例视图，避免每帧 `new` 对象产生 GC 压力；
- **渲染裁剪**：成交量 / MACD 柱、SAR 圆点、指标折线均按可见逻辑范围裁剪——长数据（10000 条）下每帧仅绘制可视 ~120 根，平移 / 缩放不因数据总量线性变慢；
- **指标值 O(1) 现取**：信息行按 `Map<time, value>` 现取，切换指标 / 清空时重建 / 置空，无累积；
- **标签缓存**：刻度标签在 `updateAllViews` 时重建，渲染 draw 只读缓存集合；
- **生命周期**：`destroy()` 移除十字星监听、断开 ResizeObserver、detach 全部 primitive、`chart.remove()`、清除容器标记；`dataset.lwcMounted` 防止重复创建 chart 实例；
- **Mock 缓存 LRU**：见 §4.2（`touchCache` 纯函数，模块级可单测）；
- **函数风格**：全库统一箭头函数（类方法箭头字段，this 绑实例、被库回调调用不丢 this）。

---

## 十二、GitHub Pages 在线预览

- **部署地址**：`https://abulo.github.io/kline-chart-component/`（Pages 项目路径 = 仓库名）
- **触发**：push 到 `main` 分支（或 Actions 页手动 Run workflow）
- **流程**：`pnpm install --frozen-lockfile` → `pnpm run build` → `actions/upload-pages-artifact` → `actions/deploy-pages`
- **环境**：node 24.16.0 + pnpm 12.15.0（`packageManager` 锁定 `pnpm@12.15.0`，Actions 用 `pnpm/action-setup@v4` 12.15.0 + `actions/setup-node@v4` node 24.16.0）
- **首次启用（一次性）**：repo `Settings → Pages → Build and deployment → Source` 选择 `GitHub Actions`

> 包管理说明：项目使用 **pnpm**（锁定 `pnpm-lock.yaml`）；如需迁移回 npm，删掉 `pnpm-lock.yaml` 后 `npm install` 重新生成即可。

---

## 版本记录

- **v1.7.17（当前）**：README 全面重写 + 核心代码注释升级。README 重构为标准开源
  文档：项目介绍（定位 / 技术栈 / 核心能力 / 架构分层）、快速开始（安装 / 最小用法 /
  自定义数据直通）、组件 API（Props 入参总表 / 事件出参总表 / 控制器方法入参→出参）、
  数据接入（ChartDataService 接口文档：HistoryQuery 入参、fetchHistory 出参、
  subscribeRealtime 出参、Mock / Http 构造参数表）、数据点格式（ChartDataPoint 全字段）、
  周期与指标、主题配色、布局结构、目录结构、构建测试打包、内存性能、Pages 部署；
  完整版本记录保留。代码注释按「入参 / 出参」标准升级：`types/chart.ts`（数据点字段
  用途）、`services/chartDataService.ts`（接口方法 @param/@returns）、
  `services/mockChartDataService.ts`（fetchHistory / subscribeRealtime / ensurePool /
  ensureTsPool / ensurePeriodPool / lowerBound / touchCache）、
  `services/mockDataGenerator.ts`（核心生成函数 @param/@returns）、
  `chart/periods.ts`、`chart/util/format.ts`。验证：tsc 0 错误、vitest 27 文件
  257 tests 全绿。

- **v1.7.16**：services 层重构——`chartDataService.ts` 只保留接口定义
  （`HistoryQuery` / `RealtimeHandler` / `ChartDataService`），Mock 实现整体迁出：
  `MockChartDataService` 类 + `touchCache`（LRU 缓存管理）+ `MockChartDataServiceOptions`
  自 `chartDataService.ts` 迁至 `mockDataGenerator.ts` 聚合（数据生成与 Mock 服务
  同文件，接口类型自 `chartDataService.ts` 导入，无循环依赖）；随后按
  **超 1000 行拆分纪律**，Mock 服务实现独立成 `mockChartDataService.ts`
  （懒生成池 + 分页 / 实时编排，~640 行），`mockDataGenerator.ts` 还原纯数据生成层
  （~490 行）。引用点同步更新：`App.vue` / `KLineChart.vue` /
  `tests/timeshare.test.ts` / `tests/cacheLru.test.ts` / `tests/mockRealistic.test.ts` /
  `tests/chartDataService.test.ts`。验证：tsc 0 错误、vitest 27 文件 257 tests 全绿。

- **v1.7.15**：修复"日K → 成交量关 → 成交量开 → 1日分时 底部时间轴
  不对，主图和指标图被压缩"——与 v1.7.14 同根因的**指标组版本**：`vol` 重开时
  `setVolumeVisible(true)` 走"临时移除指标组（`setSubIndicator(null)`）→ 重建
  指标组（`setSubIndicator(active)`）"协调流程，`SubIndicatorPaneManager.removePanes`
  直接 `removePane` 移除指标组，被移除的 MACD series（K 线 ~400 点）同样
  **残留挂载 timeScale**（库 `_private__points` 长度 641 = 残留 400 + 分时 241）。
  修复：removePane **前**先清空指标组 pane（startIndex / startIndex+1）所有
  series 数据再移除——与 `removeVolumePanes` 同一范式；全仓 grep 确认仅这两处
  removePane 调用点，均已覆盖。验证：浏览器——路径B 逻辑 0-240、时间轴
  09:30~15:00 正常；同页往返 / vol 关路径 / 日K 视口（280-399）均正常无污染。
  tsc 0 错误、vitest 28 文件 / 258 tests 全绿。
- **v1.7.14**：修复"日K → 成交量关 → 1日分时 底部时间轴不对，
  主图和指标图被压缩"——`removeVolumePanes` 直接 `removePane(2)` 移除成交量
  组，被移除 series 的 K 线数据（~400 点）**残留挂载 timeScale**：切分时后
  `fitContent` 视口被撑到 1.5 年（逻辑 0-640），时间轴混入 K 线日期 / 08:00
  标签，分时 1 天数据被压扁。修复：removePane **前**先清空 pane2/3 上所有
  series 数据（`setData([])`）再移除——timeScale 无残留（逻辑恢复 0-240）。
  清空时指标组仍在 pane4/5 未顺移，无副作用；K 线量柱由 VolumeBarPrimitive
  自绘，清空 series 不影响显示。验证：浏览器——volume 关 → 1日分时逻辑
  0-240、时间轴 09:30~15:00 恢复正常；重开 volume / 日K→分时往返均正常。
  tsc 0 错误、vitest 28 文件 / 258 tests 全绿。
- **v1.7.13**：修复"日K 放大 5 次等待 10 秒后图像复原"——实时视口
  跟随（`followLastBarIfTracking`）原用 `setVisibleLogicalRange` **固定拉回最后
  120 根**（为 priceLine 恒在视口而加），放大后视口宽 ~38 也被强制重置回 120 根。
  改用 `scrollToPosition(0, false)`（右偏移置 0）——**barSpacing / 视口宽度
  完全不变**，仅右缘贴数据末尾；同时消除 setVisibleLogicalRange 重算 barSpacing
  的每帧 -1px 宽度漂移。验证：浏览器——放大 5 次宽 38.32 → 等 10 秒宽 38.32
  零漂移且右缘跟随新 bar；缩小 5 次宽 365.2 保持；左移看历史不抢回视口
  （v1.7.1 语义保持）；右移越界为库 rightOffset 联动（内容不变，非复原）。
  tsc 0 错误、vitest 28 文件 / 258 tests 全绿。
- **v1.7.12**：十字星竖线**中心对齐柱体中心**修复——用户例证："柱体宽 11、
  竖线宽 3 时，吸附应让竖线覆盖柱体中心列 (5,6,7)，这才是柱体中间"。根因：
  竖线绘制 `Math.round(x)+0.5` 使 bar 中心 291.57 被取整偏移到 292.5（整体
  右偏，线宽越大偏差越大——宽 3px 时中心偏右 1.5px）。修复：竖线以 bar 中心
  **浮点 x 为几何中心**绘制（不再取整偏移），竖线中心与柱体中心精确对齐；
  横线（贴鼠标，无中心语义）保留亚像素对齐。验证：tsc 0 错误、vitest 28 文件 /
  258 tests 全绿、浏览器像素扫描——日K 吸附 bar 中心 291.57 → 竖线像素列
  [291,292] 中心 291.5（偏差 0.07px 亚像素）/ 分时 bar 中心 292.61 → 竖线列
  [292,293] 中心 292.5。
- **v1.7.11**：十字星**停驻吸附**修复——用户报"竖线在成交量 / K线柱体上
  不在吸附的中间位置"。根因：快速移动急停后鼠标不再产生事件（最后事件速度仍
  高于阈值 → 像素级），竖线停在像素位置（可能偏离柱体中心 ≤4px），且停止后
  无事件触发吸附。修复：命中分支新增**停驻定时器**——鼠标静止 120ms（`STOP_SNAP_DELAY_MS`）
  后以最近命中 param 的整数 logical 重新吸附（竖线精确回到 bar / 柱体中心，与
  volumeBarPaneView 同一 logicalToCoordinate 格点）；新事件到达即重置定时器；
  未命中 / pane0 / destroy 时取消。验证：tsc 0 错误、vitest 28 文件 / 258 tests
  全绿、浏览器——快速横扫 pixel（贴鼠标）→ 急停 50ms 仍 pixel → 停驻 450ms
  snap（日K 回跳 3px 至格点 474.97 / 分时回跳 0.9px 至格点）→ 再次快速恢复
  pixel。新增 `window.__klineChart.syncMode` 探针（pixel / snap / none）。
- **v1.7.10**：十字星**速度自适应混合**——"全程跟手"与"磁吸吸附"两者兼得。
  背景：v1.7.9 竖线像素级跟手后用户确认"可以了"，但指出**失去了吸附效果**
  （竖线不再停在 bar 中心）。修复：`syncLineX` 增加 **40ms 滑动窗口平均速度**
  判定——快速移动（窗口平均 ≥ 0.5px/ms）用像素级（平滑跟手、零偏差、无跳格）；
  慢速 / 停驻用吸附（竖线稳定在 bar 中心，保留十字星磁吸感）。速度状态机
  只在 handleCrosshairMove 同步段更新（唯一竖线设置点），applyCrosshairMove
  （rAF）不再重复设置竖线（避免覆盖为错误模式）；键盘移动仍恒为吸附（逐 bar 语义）。
  验证：tsc 0 错误、vitest 28 文件 / 258 tests 全绿、浏览器分段帧级采样——
  快速（3.75px/ms）日K 31 帧 / 分时 28 帧 **全像素级零偏差**；慢速（0.09px/ms）
  72 帧全吸附 bar 中心（偏差 ≤ bar 半宽，磁吸正常）。
- **v1.7.9**：十字星**竖线像素级跟随鼠标**（用户三报"快速移动延迟"，帧级采样定位到
  竖线吸附 bar 中心的跳格偏差：120 条数据下 bar 间距 ~8.6px，快速移动时竖线每帧
  在 bar 中心间跳 ±4.3px）。修复：命中分支竖线 x 改取 `param.point.x`（鼠标相对
  数据区坐标，像素级）——与横线（同样贴鼠标）完全一致，任何速度**零偏差**跟手；
  键盘移动（逐 bar 语义）保持 logicalToCoordinate 吸附 bar 中心。新增
  `window.__klineChart.lineX` 调试探针（主图竖线当前 x，帧级采样用）。
  验证：tsc 0 错误、vitest 28 文件 / 258 tests 全绿、浏览器 CDP 高频移动 +
  页面 rAF 帧级采样（2ms/步横扫 300→1250，含 tooltip 覆盖区）——日K / 分时
  全部帧竖线偏差 **0.00px**、0 冻结帧、帧间隔稳定 16.6ms。
- **v1.7.8**：十字星**横竖线统一虚线**（与最后价线一致，6px 线 / 4px 空）。
  背景：库 crosshair 横线（horzLine）默认实线，其 dash 由线宽派生（`Dashed=[2w,2w]`），
  无法表达价格线 [6,4] 样式。方案：横线也改为自绘（v1.7.6 竖线同款
  `CrosshairLinePrimitive`，构造注入 paneIndex、每 pane 独立实例）——横竖线统一
  `setLineDash([6,4])`；横线仅在**十字星命中的 pane** 绘制（与库 horzLine 语义一致，
  y 为命中 pane 本地坐标），竖线仍贯穿全部 pane；库横线一并关闭（visible:false，
  避免库实线横线与自绘虚线叠加成实线）。y 分发与竖线同链路**提前到 rAF 之前当帧
  同步**（快速移动横线同帧跟手）；键盘移动横线注入 pane1（与左刻度指示值同口径）。
  验证：tsc 0 错误、vitest 28 文件 / 258 tests 全绿、浏览器像素差分——日K / 分时
  横竖线亮段均 6px（6 线 / 4 空）、横线仅命中 pane（pane3 无横线）、快速移动横扫
  tooltip 全程跟手、键盘移动横竖线正常、深浅系截图正常。
- **v1.7.7**：十字星**快速移动跟随延迟**彻底修复（v1.7.6 自绘竖线回归后收尾）。
  两阶段根因与修复：
  ① **竖线更新链路滞后**（初版）：竖线同步走 rAF 节流（+1 帧）+ 强制 invalidate（+1 帧），
  快速移动时累计滞后约 2 帧（~33ms）拖尾。修复：竖线 x 计算与 `setX`（廉价操作）
  **提前到 rAF 之前当帧同步执行**，重活（tooltip / 指示值）仍走 rAF 合并防拖拽卡顿；
  重绘触发不再依赖 `requestUpdate`（库 ChartApi 无此方法，v1.7.7 初版该调用为 no-op）——
  库在派发 crosshairMove 前已用新位置重绘横线，series 级竖线当帧 setX 即可跟手。
  ② **tooltip 固定区域遮挡**（用户复测"延迟仍存在"的真正卡点）：tooltip 浮层
  （zIndex 9999，固定 pane1 角落）覆盖在库的 mousemove 监听目标（各 Pane top canvas，
  style.zIndex='2'）之上，鼠标快速横扫经过浮层时事件进不了 canvas 事件流，
  且移入浮层触发 canvas mouseleave → 库清除十字星（竖线消失）→ 感知为"延迟/断"。
  修复（**事件转发**）：浮层内 `mousemove` 时把事件**转发**到鼠标所在 Pane 的 top canvas——
  先合成 `mouseenter`（库 mouseEnterHandler 重挂 mousemove 监听）再合成 `mousemove`
  （按坐标驱动十字星），浮层既有功能（角落定位 / 文字选中 / 按下即拖）全部保留，
  十字星全程跟手；拖动 / 选中冻结期间不转发；pane 重建（成交量 / 指标开关）后
  canvas 失效时 `ensureTopCanvases` 惰性刷新集合，无残留无泄漏。
  验证：tsc 0 错误、vitest 28 文件 / 258 tests 全绿、浏览器逐帧（16ms/步）横扫
  tooltip 固定区（x≈1139~1258）——日K / 分时竖线单列跟手（偏差 ≤4px）、
  tooltip 保持显示、MACD / 成交量开关组合下同样全程正常。
- **v1.7.6**：十字星竖线**自绘 primitive**（v1.7.5 实线方案被验收否决，根因确认为"竖线被柱体盖住"）。
  方案：新建 `CrosshairLinePrimitive`（zOrder 'top'、各 pane 代表 series 最后挂载）自绘竖线，贯穿 pane 全高，
  画在 K 线 / 成交量柱 / MACD 柱 / 指标线之上——逐刻度移动任何位置都完整可见、无缺口、无被覆盖；
  同时关闭库竖线（`vertLine.visible = false`）避免双竖线；颜色跟随主题 `crosshairLineColor`（不透明，
  alpha 1.0，深浅系区分），横线仍由库绘制（Solid）。
  修复配套：竖线 x 分发收敛到 `CrosshairManager`（鼠标 logical → 坐标、键盘 timeToIndex → 坐标）；
  **分时模式下无实时帧循环、crosshairMove 后库不自动重绘** → `syncLineX` / `syncKeyboardMove` 触发重绘，
  竖线即时上屏；
  指标层 / 成交量组开关移除 Pane 时注销竖线 primitive（防泄漏）。
  验证：tsc 0 错误、vitest 28 文件 / 257 tests 全绿、canvas 级像素验证——
  深系日K 多 bar 位置 pane1/3/5 竖线均 100% 贯穿（285/95/95px）、分时模式 pane1/3/5 100% 贯穿（327/109/109px）、
  无残留双竖线（库竖线已关闭）、成交量 / 指标开关后竖线仍正常。
- **v1.7.5**：十字星竖线修复——横 / 竖线由库默认虚线（6px 亮 / 6px 暗）改为**实线（LineStyle.Solid）**，
  修复副图 pane3/pane5（高 95px）底部竖线缺失问题（虚线周期 12px 不整除 95px，底部 5px 落在暗段）；
  同时 `crosshairLineColor` 透明度由 0.25 提升至 **0.6**（深浅系一致），竖线在 K 线 / 成交量 / MACD 柱间隙处更清晰。
  （该版本验收未通过，v1.7.6 改为自绘竖线方案）
- **v1.7.4**：分时均价线开关 `avgLineVisible`（默认渲染；关闭时均价线不渲染，pane0 信息行 / tooltip 同步隐藏均价）。
- **v1.7.3**：成交量组（pane2 信息行 / pane3）关闭时，tooltip 与 main 信息行的 成交量 / 成交额 同步隐藏。

