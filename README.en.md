# KLineChart (kline-chart-component)

> A multi-pane K-line + intraday (1d~5d) chart component in the style of East Money / TongDaXin desktop clients. Deeply customized on **Vue 3 + TypeScript + lightweight-charts v5.2.1**. Works out of the box, interface separated from implementation — plug in real market data with zero component changes.

[![TypeScript](https://img.shields.io/badge/TypeScript-6.0.3-blue)](https://www.typescriptlang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.5.44-42b883)](https://vuejs.org/)
[![lightweight-charts](https://img.shields.io/badge/lightweight--charts-5.2.1-0593ff)](https://github.com/tradingview/lightweight-charts)
[![pnpm](https://img.shields.io/badge/pnpm-12.15.0-orange)](https://pnpm.io/)
[![Tests](https://img.shields.io/badge/tests-257%20passed-brightgreen)](tests/)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-online-success)](https://abulo.github.io/kline-chart-component/)

---

## Table of Contents

- [1. Features](#1-features)
- [2. Installation](#2-installation)
- [3. Quick Start](#3-quick-start)
- [4. Documentation](#4-documentation)
- [5. API Reference](#5-api-reference)
- [6. Options](#6-options)
- [7. Types](#7-types)
- [8. Examples](#8-examples)
- [9. Development](#9-development)
- [10. Contributing](#10-contributing)
- [11. Changelog](#11-changelog)
- [12. FAQ](#12-faq)
- [13. Credits](#13-credits)
- [14. License](#14-license)

---

## 1. Features

- 💪 **100% TypeScript**: fully typed across the repo (`vue-tsc --noEmit` zero errors); every component prop, event and controller method ships with complete type signatures; one unified data-point type `ChartDataPoint` with a `pointType` type guard — K-line, intraday and call-auction data share a single array
- 🧬 **Interface / implementation separation**: the data layer goes through the `ChartDataService` interface (paginated history + realtime subscription); a built-in Mock service works out of the box, and switching to real quotes only means swapping in `HttpChartDataService` — zero component changes
- 📦 **Multi-pane layout**: pane0 info row → pane1 main chart → pane2 volume info row → pane3 volume chart → pane4 indicator info row → pane5 sub-indicator chart; `60 : 20 : 20` configurable, volume group and indicator group independently toggleable (four-state layout)
- 🕯️ **K-line main chart**: Candlestick + main indicators (MA / EXPMA / BOLL / SAR / BBI, mutually exclusive) + high / low price markers + last-price line (priceLine, dashed, toggleable) + hollow red bars
- ⏱️ **Intraday chart (1d~5d)**: LineSeries dual lines (price + average price, avg line toggleable), 1px histograms for volume / MACD, grid verticals divided 4/2/3/4/5 by period, left/right price scales symmetrically expanded around the first bar's `preClose` (right side in percentage), three-state up/down coloring
- 📈 **Ten sub-indicators**: RSI / KDJ / MACD / WR / DMI / BIAS / OBV / CCI / ROC / CR, mutually exclusive single-select (no CR in intraday); every indicator is a pure function, independently unit-testable
- 🎯 **Crosshair linkage**: vertical / horizontal dashed lines (6px on / 4px off) + left / right scale indicator values + draggable tooltip (with up/down coloring); speed-adaptive — pixel-level tracking on fast moves, magnetic snap on slow moves / dwell
- ⌨️ **Keyboard navigation**: left / right arrow keys move one bar at a time, viewport auto-follows at the edges, auto-repeat after 40ms hold
- 🎨 **Dark / light themes**: all colors centralized in `theme.ts` (no scattered hardcoded hex values on pages); red up / green down, flat = white (dark) / black (light)
- 🧠 **Memory & performance**: crosshair rAF throttling, primitive view singleton reuse, viewport-only render culling (~120 visible bars per frame even with 10,000 bars), Mock pool LRU eviction (`touchCache`), Http history LRU cache + known-total cap, `destroy()` fully unsubscribes to prevent leaks
- ✅ **Strict mode**: zero type errors under `strict: true`; vitest 27 files / 257 cases all green (incl. LRU cache, intraday, indicator and memory-specific tests)

---

## 2. Installation

Currently distributed as a **source repository** (GitHub Pages demo live); npm package publishing is on the Roadmap.

```bash
git clone git@github.com:abulo/kline-chart-component.git
cd kline-chart-component
pnpm install
```

Environment requirements:

| Item | Requirement |
|---|---|
| Node.js | ≥ 24 (dev environment pinned to 24.16.0) |
| pnpm | 12.15.0 (locked via `packageManager: pnpm@12.15.0`) |
| TypeScript | 6.0.3 (devDependency pinned, `strict: true`) |

> Pinned dependencies: `lightweight-charts@5.2.1` (chart engine, pinned to prevent API drift), `vue@3.5.44`, `vite@8.3.5`, `vitest@5.0.5`, `vue-tsc@3.3.13`.

---

## 3. Quick Start

### 3.1 Minimal usage (Vue component)

```vue
<script setup lang="ts">
import { ref } from 'vue'
import KLineChart from './components/KLineChart.vue'
import type { PeriodValue } from './chart/periods'

const period = ref<PeriodValue>('day')
const onPeriodChange = (value: PeriodValue) => {
  period.value = value
}
</script>

<template>
  <KLineChart
    symbol="300750"
    name="宁德时代"
    :period="period"
    theme="dark"
    main-indicator="ma"
    sub-indicator="macd"
    @period-change="onPeriodChange"
  />
</template>
```

> The parent component only keeps state and passes Props (one-way data flow); transient actions such as zoom in / out and shift left / right go straight to the controller via `ref` (see [Examples](#8-examples)).

### 3.2 Custom data without a backend

```vue
<script setup lang="ts">
import KLineChart from './components/KLineChart.vue'
import type { ChartDataPoint } from './types/chart'

const myBars: ChartDataPoint[] = [
  // { time: 1728000000, open: 10, high: 10.5, low: 9.8, close: 10.2, volume: 12345, amount: 126000000, ... }
]
</script>

<template>
  <KLineChart symbol="600519" name="贵州茅台" :period="'day'" :data="myBars" />
</template>
```

> When `data` is provided the component **skips service fetching / pagination / realtime subscription** and renders the custom data directly.

---

## 4. Documentation

- **Live demo (GitHub Pages)**: https://abulo.github.io/kline-chart-component/
- **中文版 README**: [README.md](README.md)
- **Changelog**: [Version History](#version-history) at the bottom of this file
- **Source tree index**: see the directory structure under [Development](#9-development)

---

## 5. API Reference

### 5.1 Component Props (inputs)

```ts
interface KLineChartProps {
  symbol?: string            // stock code
  name?: string              // stock name
  period?: PeriodValueOrEmpty // current period ('' = not set, no request issued)
  theme?: string             // 'dark' | 'light'
  timeAxis?: boolean         // bottom time axis
  leftScale?: boolean        // left price scale
  rightScale?: boolean       // right price scale
  mainIndicator?: string     // main indicator ('' = off)
  subIndicator?: string      // sub indicator ('' = off)
  service?: ChartDataService // data service (default: Mock singleton)
  data?: ChartDataPoint[]    // external custom data (rendered first)
  format?: string            // time format template (auto by period when empty)
  priceLineVisible?: boolean // last-price line
  volumeVisible?: boolean    // volume group
  avgLineVisible?: boolean   // intraday average-price line
  fullscreen?: boolean       // fullscreen
}
```

Full input table: see [Options](#6-options).

### 5.2 Component events (outputs)

| Event | Payload type | Fired when |
|---|---|---|
| `period-change` | `(value: PeriodValue) => void` | period changes |
| `status-change` | `(status: ChartLoadStatus) => void` | load status changes: `'idle' \| 'loading' \| 'loading-older' \| 'ready' \| 'error'` |
| `fullscreen-change` | `(fullscreen: boolean) => void` | "exit fullscreen" button inside the component is pressed |

### 5.3 Controller methods (via ref, inputs → outputs)

```ts
const chartRef = ref<InstanceType<typeof KLineChart> | null>(null)

// —— transient actions (no input) ——
chartRef.value?.controller?.zoomIn()      // zoom in (barSpacing clamped 2~80)
chartRef.value?.controller?.zoomOut()     // zoom out
chartRef.value?.controller?.shiftLeft()   // shift left by one viewport (stops naturally at the oldest bar)
chartRef.value?.controller?.shiftRight()  // shift right

// —— data & symbol (takes effect after input) ——
chartRef.value?.controller?.init()                    // no input: fetch history + redraw + subscribe realtime (auto-called by the component)
chartRef.value?.controller?.setSymbol('600519')       // (symbol: string) → update stock code
chartRef.value?.controller?.setName('贵州茅台')        // (name: string) → update stock name
chartRef.value?.controller?.setService(mockService)   // (service: ChartDataService) → swap data service
chartRef.value?.controller?.setPeriod('day')          // (period: PeriodValue) → switch period (time format follows)

// —— state setters (already auto-called by Prop watchers; manual use is for programmatic control) ——
chartRef.value?.controller?.applyTheme('light')       // (theme: ChartThemeName)
chartRef.value?.controller?.toggleTimeAxis(false)     // (visible: boolean)
chartRef.value?.controller?.setLeftScaleVisible(true) // (visible: boolean)
chartRef.value?.controller?.setRightScaleVisible(true)
chartRef.value?.controller?.setMainIndicator('boll')  // (name: MainIndicatorType | null)
chartRef.value?.controller?.setSubIndicator('kdj')    // (name: SubIndicatorType | null, null = off)

// —— lifecycle (auto-called on component unmount) ——
chartRef.value?.controller?.destroy()                 // no input: unsubscribe realtime / disconnect ResizeObserver / detach primitives / chart.remove()

// —— load status (read via ref) ——
chartRef.value?.loadStatus                            // 'idle' | 'loading' | 'loading-older' | 'ready' | 'error'
```

---

## 6. Options

### 6.1 Component Props table

| Prop | Type | Default | Description |
|---|---|---|---|
| `symbol` | `string` | `''` | stock code (pane0 info row: name [code]) |
| `name` | `string` | `''` | stock name |
| `period` | `PeriodValueOrEmpty` | `'day'` | current period; refetched via service on change; `''` = period not set, no request |
| `theme` | `ChartThemeName` | `'dark'` | `'dark'` / `'light'` (colors centralized in `theme.ts`) |
| `timeAxis` | `boolean` | `true` | bottom time axis visibility (pane heights recalculated on toggle) |
| `leftScale` | `boolean` | `false` | left price scale (fixed 72px width, fitContent after toggle) |
| `rightScale` | `boolean` | `false` | right price scale |
| `mainIndicator` | `MainIndicatorType \| ''` | `''` | main indicator `'ma' / 'expma' / 'boll' / 'sar' / 'bbi'` (mutually exclusive; clicking the active one turns it off) |
| `subIndicator` | `SubIndicatorType \| ''` | `''` | sub indicator `'rsi' / 'kdj' / 'macd' / 'wr' / 'dmi' / 'bias' / 'obv' / 'cci' / 'roc' / 'cr'` (mutually exclusive) |
| `service` | `ChartDataService` | Mock singleton | data service implementation (pass `HttpChartDataService` for real quotes) |
| `data` | `ChartDataPoint[]` | `undefined` | external custom data (rendered first, service skipped) |
| `format` | `string` | `''` | time format template (e.g. `'YYYY-MM-DD'` / `'YYYY-MM-DD HH:mm'`); auto by period when empty |
| `priceLineVisible` | `boolean` | `true` | last-price line on the K-line main chart |
| `volumeVisible` | `boolean` | `true` | volume group (pane2 info row + pane3 chart; closing destroys the whole group + recomputes layout + hides volume/turnover in tooltip and info row) |
| `avgLineVisible` | `boolean` | `true` | intraday average-price line (when off: line not rendered, avg price hidden in pane0 info row / tooltip; intraday periods only) |
| `fullscreen` | `boolean` | `false` | fullscreen (true fills the browser viewport; Esc exits) |

### 6.2 MockChartDataService constructor options

```ts
interface MockChartDataServiceOptions {
  /** page size (shared by history & left-scroll pagination, required) */
  fetchLimit: number
}
```

### 6.3 HttpChartDataService constructor options

```ts
interface HttpChartDataServiceOptions {
  fetchLimit: number                  // required: page size
  historyUrl: string                  // required: full history URL (GET?symbol=&period=&before=&limit=&total=)
  realtimeTransport?: 'ws' | 'sse' | 'poll' // realtime mode, default 'ws'
  wsUrl?: string                      // 'ws' mode: full URL required
  sseUrl?: string                     // 'sse' mode: full URL required
  sseEventName?: string               // SSE event name, default 'message'
  pollUrl?: string                    // 'poll' mode: full URL required
  pollIntervalMs?: number             // polling interval ms, default 3000
  timeoutMs?: number                  // fetch timeout ms, default 8000
  headers?: Record<string, string>    // injected into all HTTP request headers
  cookies?: Record<string, string>    // object form, serialized into the Cookie header
  params?: Record<string, string>     // extra URL query on all requests
  cache?: boolean                     // history cache toggle, default true
  maxCacheEntries?: number            // LRU cache entry cap (symbol|period combinations)
  maxKnownTotals?: number             // "known total" records cap (prevents unbounded memory growth)
  cacheTtlMs?: number                 // newest-page cache TTL ms (older pages unaffected)
}
```

---

## 7. Types

All public types carry `export` declarations and can be imported straight from source (`.d.ts` will be shipped alongside once published to npm):

| Type | Defined in | Description |
|---|---|---|
| `ChartDataPoint` | `src/types/chart.ts` | unified data point (K-line / intraday / call auction), `pointType` type guard |
| `HistoryQuery` | `src/services/chartDataService.ts` | history query input (symbol / period / before / limit / total) |
| `RealtimeHandler` | `src/services/chartDataService.ts` | realtime callback output: `(point: ChartDataPoint) => void` |
| `ChartDataService` | `src/services/chartDataService.ts` | data service interface (the component depends only on it) |
| `MainIndicatorType` | `src/chart/indicator/` | main indicator name union: `'ma' \| 'expma' \| 'boll' \| 'sar' \| 'bbi'` |
| `SubIndicatorType` | `src/chart/indicator/` | sub indicator name union (10 entries) |
| `PeriodValue / PeriodValueOrEmpty` | `src/chart/periods.ts` | period value / period value or empty |
| `ChartThemeName` | `src/chart/core/theme.ts` | theme name: `'dark' \| 'light'` |
| `ChartLoadStatus` | `src/chart/core/types.ts` | load status union |

Core fields of `ChartDataPoint` (full field table: [8.3 Data point format](#83-data-point-formatchartdatapoint)):

```ts
export interface ChartDataPoint {
  /** second-level timestamp (lightweight-charts standard time format) */
  time: number
  /** trading date 'YYYY-MM-DD' */
  tradeDate: string
  /** previous close (basis for change & up/down coloring) */
  preClose: number
  /** type guard: 'kline' | 'timeshare' | 'auction' */
  pointType: 'kline' | 'timeshare' | 'auction'
  // K-line: open / high / low / close / volume / amount / risePrice / riseRate
  // Intraday: price / avgPrice / volume / amount
  // Call auction: matched / unMatched / matchType / isAuction
  [key: string]: any
}
```

---

## 8. Examples

### 8.1 Basic K-line (default Mock data)

```vue
<KLineChart symbol="600000" name="浦发银行" :period="'day'" theme="dark" />
```

### 8.2 Intraday chart (1d~5d)

```vue
<KLineChart symbol="300750" name="宁德时代" :period="'1d'" theme="dark" />
```

> In intraday mode: pan / zoom buttons hidden, no main indicator, no CR sub-indicator, time format `YYYY-MM-DD HH:mm`, average line toggleable.

### 8.3 Data point format (ChartDataPoint)

| Field | Type | pointType | Description |
|---|---|---|---|
| `time` | `number` | all | second-level timestamp (strictly increasing, library assertion) |
| `tradeDate` | `string` | all | trading date `YYYY-MM-DD` |
| `preClose` | `number` | all | previous close (coloring basis / intraday scale midpoint / change basis) |
| `pointType` | `'kline' \| 'timeshare' \| 'auction'` | all | data point type marker |
| `open / high / low / close` | `number` | kline | open / high / low / close |
| `volume` | `number` | kline | volume (lots / shares) |
| `amount` | `number` | kline | turnover |
| `risePrice / riseRate` | `number` | kline | change amount / change % (vs previous close) |
| `price` | `number` | timeshare | intraday current traded price |
| `avgPrice` | `number` | timeshare | intraday average traded price |
| `matched / unMatched` | `number` | auction | matched / unmatched volume |
| `matchType` | `-1 \| 1` | auction | trade direction: -1 sell-heavy (green) / 1 buy-heavy (red) |
| `isAuction` | `boolean` | auction | whether in the call-auction session |

### 8.4 Connecting real quotes (HttpChartDataService)

```ts
import { HttpChartDataService } from './services/httpChartDataService'

const service = new HttpChartDataService({
  fetchLimit: 200,
  historyUrl: 'http://<host>/api/kline/history',
  realtimeTransport: 'ws',
  wsUrl: 'wss://<host>/ws',
})

// pass the service into the component; the controller paginates + subscribes realtime on init
<KLineChart :service="service" symbol="600000" name="浦发银行" :period="'day'" />
```

### 8.5 Realtime transport modes in detail (ws / sse / poll)

`realtimeTransport` is the single switch (default `'ws'`); the remaining options are filled per the chosen mode. The realtime data format is identical across all three modes (normalized by `normalizePoint` in the service layer, `o/h/l/c/v` abbreviations accepted), so the backend only needs to follow the contract — switching modes changes constructor options only.

**Overview**

| Option | Type | Default | Mode | Description |
|---|---|---|---|---|
| `realtimeTransport` | `'ws' \| 'sse' \| 'poll'` | `'ws'` | all | realtime transport switch |
| `wsUrl` | `string` | — | **ws** | full WebSocket URL; no subscription when omitted |
| `sseUrl` | `string` | — | **sse** | full SSE URL; no subscription when omitted (warn) |
| `sseEventName` | `string` | `'message'` | **sse** | backend custom event name (e.g. `'quote'`) |
| `pollUrl` | `string` | — | **poll** | dedicated polling endpoint (**not** the history URL) |
| `pollIntervalMs` | `number` | `3000` | **poll** | polling interval |

**① `'ws'` WebSocket push (default, lowest latency)**

```ts
new HttpChartDataService({
  fetchLimit: 200,
  historyUrl: 'http://host/api/kline/history',
  realtimeTransport: 'ws',
  wsUrl: 'wss://host/ws',
})
```

Backend contract: `{wsUrl}?symbol=<code>&period=<period>`, pushing any of four shapes:

```json
{"time":1728000000,"open":10,"close":10.2,"volume":1234}   // single point
{"data":{"time":...}}                                       // { data: single point }
{"data":[{...},{...}]}                                      // { data: array }
[{...},{...}]                                               // bare array
```

Behavior: `handler` is called on every message; returns `() => ws.close()` as the cleanup function. `time` equal to the last bar = refresh that bar; larger = append a new bar.
Limitation: browsers cannot inject custom headers / cookies into WebSocket (auth only via URL query or same-origin cookies) — **use sse / poll when auth depends on custom headers**.

**② `'sse'` Server-Sent Events (custom auth headers supported)**

```ts
new HttpChartDataService({
  fetchLimit: 200,
  historyUrl: 'http://host/api/kline/history',
  realtimeTransport: 'sse',
  sseUrl: 'http://host/api/kline/sse',
  sseEventName: 'quote',                        // backend custom event name (default 'message')
  headers: { Authorization: 'Bearer <token>' },  // SSE accepts auth headers
})
```

Backend contract: `{sseUrl}?symbol=&period=`, the server streams SSE (`event: <sseEventName>` / `data: <JSON>`); payload shape identical to WS.
Behavior: built on `@microsoft/fetch-event-source` (fetch streaming) so **`headers` / `cookies` auth is injectable** (impossible with native EventSource); auto-reconnect after **3s** on drop; HTTP **401/403 aborts immediately** (no infinite reconnect loop on auth failure); returns `() => ctrl.abort()` as cleanup. Best for: one-way server push with auth headers.

**③ `'poll'` HTTP polling (simplest, most robust)**

```ts
new HttpChartDataService({
  fetchLimit: 200,
  historyUrl: 'http://host/api/kline/history',
  realtimeTransport: 'poll',
  pollUrl: 'http://host/api/kline/latest',
  pollIntervalMs: 3000,
})
```

Backend contract: `GET {pollUrl}?symbol=&period=[&total=N]` returns the **latest snapshot array** directly (no `limit` attached — the backend returns whatever it has and everything is delivered).
Behavior: fetches **once immediately** on subscribe, then every `pollIntervalMs`; uses the dedicated `fetchLatest` (bypasses the history cache so every call is fresh); **reentrancy guard** (skips a tick while a previous request is in flight — slow endpoints never pile up requests); **incremental filter** (only points with `time >= max delivered time` are delivered; same-bar intraday refresh also delivered — the library treats same-`time` as overwrite); every successful fetch is **merged into the history cache** (later `fetchHistory` hits the fresh snapshot); returns `() => { stopped = true; clearInterval(timer) }` as cleanup. Best for: no WS/SSE infrastructure, simplest integration, latency-insensitive.

**Shared options (auth / context, common to all three modes)**

| Option | Injected into | Example |
|---|---|---|
| `headers` | all HTTP requests (history / latest / **SSE yes**; WS no) | `{ Authorization: 'Bearer <token>' }` |
| `cookies` | object form serialized into the `Cookie` header of all HTTP requests | `{ session: 'abc123' }` |
| `params` | URL query appended to all requests (history / latest / SSE / WS); **core params win, never overridden** | `{ market: 'SH' }` |

**Cheat sheet**

| Dimension | ws | sse | poll |
|---|---|---|---|
| Latency | lowest (push) | low (push) | high (≥3000ms interval) |
| Custom auth headers | ❌ no | ✅ yes | ✅ yes |
| Backend complexity | needs WS service | needs SSE stream | one GET endpoint |
| Disconnect handling | self-managed reconnect | auto 3s reconnect | auto retry next tick |
| Typical use | high-frequency quotes | push with auth | simple / low-frequency |

### 8.6 Programmatic control (controller via ref)

```ts
const chartRef = ref<InstanceType<typeof KLineChart> | null>(null)

const onZoomIn = () => chartRef.value?.controller?.zoomIn()
const onShiftLeft = () => chartRef.value?.controller?.shiftLeft()
const switchToTimeshare = () => chartRef.value?.controller?.setPeriod('1d')
const toggleRightScale = () => chartRef.value?.controller?.setRightScaleVisible(true)
```

---

## 9. Development

### 9.1 Environment & commands

| Command | Description |
|---|---|
| `pnpm install` | install dependencies (locked via `pnpm-lock.yaml`, lightweight-charts 5.2.1) |
| `pnpm dev` | dev preview http://127.0.0.1:5199 (`/api` proxied to backend, `ws: true` proxies WebSocket) |
| `pnpm type-check` | type check (`vue-tsc --noEmit`, strict zero errors) |
| `pnpm test` | unit tests (vitest, 27 files / 257 cases) |
| `pnpm build` | type check + build (`vite build`, output `dist/`, base `/kline-chart-component/`) |
| `pnpm preview` | preview the build http://127.0.0.1:4173/kline-chart-component/ |

### 9.2 Directory structure

```
src/
├── App.vue                    # toolbar + container (period bar / theme / toggles / fullscreen)
├── main.ts                    # entry
├── components/
│   └── KLineChart.vue         # chart component (Props / events / controller ref)
├── chart/                     # chart source grouped by feature
│   ├── periods.ts             # period config (13 entries + periodMap O(1) lookup + intraday grid divisions)
│   ├── core/                  # core: controller / layout / theme / data bridge
│   │   ├── kLineChartController.ts   # controller: data / lifecycle / public API
│   │   ├── chartDataBridge.ts        # data IO bridge (history / pagination / realtime orchestration + race guard)
│   │   ├── realtimePipeline.ts       # realtime incremental pipeline (throttle → batch consume → incremental update)
│   │   ├── indicatorManager.ts       # main indicators + volume MA lines + info row
│   │   ├── subIndicatorPaneManager.ts # sub-indicator pane management (pane4/5 create/destroy)
│   │   ├── crosshairManager.ts       # crosshair linkage + overlayTime + indicator-value registry
│   │   ├── timeshareManager.ts       # intraday computation (preClose symmetric half-range / arithmetic scale / three-state coloring)
│   │   ├── paneFactory.ts / paneLayout.ts / viewport.ts
│   │   ├── theme.ts / resolveBarColors.ts / mergeBars.ts
│   │   └── candlestickWidth.ts / constants.ts / types.ts / indicatorMeta.ts / mock.ts
│   ├── axis/                  # left scale labels (grid-aligned, shares drawAxisLabel with indicator values)
│   ├── crosshair/             # crosshair indicator values + data tooltip
│   ├── border/ / highLow/ / grid/ / volume/ / overlay/
│   ├── indicator/             # East Money indicator library (index.ts single export + pure indicator functions)
│   └── util/format.ts         # value formatting (price / volume / indicator scale / date)
├── services/
│   ├── chartDataService.ts    # interface definitions (HistoryQuery / RealtimeHandler / ChartDataService)
│   ├── mockChartDataService.ts # Mock service implementation (lazy pools + pagination / realtime orchestration + LRU)
│   ├── mockDataGenerator.ts   # pure data generation (daily K / intraday / minute aggregation / weekly-monthly aggregation)
│   └── httpChartDataService.ts # HTTP history + WS/SSE/Poll realtime + LRU cache
└── types/chart.ts             # unified data point type (ChartDataPoint)
```

### 9.3 Engineering constraints (read before contributing)

- **Build**: Vite 8 + `@vitejs/plugin-vue`; `vue-tsc` type check runs before build
- **Tests**: Vitest 5 + jsdom (chart-engine tests do not depend on browser rendering)
- **Code style**: camelCase, semantic function names; class methods use arrow fields (this bound to the instance, safe when called back by the library)
- **Colors**: centralized in `src/chart/core/theme.ts`, no scattered hardcoded hex values on pages
- **Files**: split TS files over 1000 lines; filenames must not contain digits; case-sensitive filesystem (imports must match exactly)
- **Versioning**: changes must stay in sync between `package.json` and the README version history

---

## 10. Contributing

PRs and issues are welcome. Before submitting:

1. Run `pnpm type-check` (zero type errors) and `pnpm test` (all green)
2. New features **must** ship type definitions and test cases (incl. edge / memory scenarios)
3. Follow the §9.3 engineering constraints (camelCase / centralized theme colors / comments with inputs & outputs)
4. Suggested commit format: `v<version> <change summary>（\n- details）`

> Full PR / issue process conventions are documented in [CONTRIBUTING.md](CONTRIBUTING.md) (development environment / commands / engineering constraints / test requirements / commit conventions / PR & issue flows).

---

## 11. Changelog

The version history is **embedded at the bottom of this file** (no separate CHANGELOG file), see [Version History](#version-history).

- Full history: v1.7.3 ~ v1.7.18 (intraday chart / scale algorithm / crosshair / volume toggle / layout refactor / data-service split / README iterations, etc.)
- Release flow: commit → push `main` → GitHub Pages Actions auto-deploys https://abulo.github.io/kline-chart-component/

---

## 12. FAQ

**Q1: What happens when `period` is an empty string?**
The component treats it as "period not set": no data request is issued, `tickMarkFormatter` falls back to the K-line format; passing a valid period afterwards refetches. An empty `symbol` / `total` on the very first request is normal (no data held yet in HistoryQuery); later requests carry them automatically.

**Q2: Data does not fill the viewport after switching periods (especially intraday)?**
The controller calls `fitContent` after period switches / volume-group toggles; if it still looks unfilled, it is usually the combined path "close volume group then switch to intraday" — see the fixes in version history v1.7.14 / v1.7.15 (clear series before `removePane` to prevent timeScale residue).

**Q3: Where does the `total` parameter of `HttpChartDataService` come from?**
Auto-computed: the larger of "deduplicated cumulative count for this symbol|period" and "the backend's last-returned `total` field", appended as `total=<n>` to the request URL for backend incremental / resume decisions; callers may also pass it explicitly to override.

**Q4: Why does the crosshair vertical sometimes deviate from the bar center during fast moves?**
Speed-adaptive behavior: fast moves use pixel-level tracking (zero deviation), slow moves / dwell use magnetic snap (stays on bar centers). This is the hybrid behavior iterated from v1.7.9 to v1.7.11 per requirements.

**Q5: Why are there no pan / zoom buttons in intraday mode?**
Intraday periods (1d~5d) are fixed full-width by product semantics and cannot be panned / zoomed; the corresponding App toolbar buttons are hidden.

**Q6: Why do imports fail on the filesystem?**
The repo is maintained on a case-sensitive filesystem; import paths must match filenames exactly (e.g. the casing of `kLineChartController.ts`).

---

## 13. Credits

- Chart engine: [lightweight-charts](https://github.com/tradingview/lightweight-charts) (v5.2.1)
- UI / interaction reference: East Money and TongDaXin desktop clients
- Realtime deps: [@microsoft/fetch-event-source](https://www.npmjs.com/package/@microsoft/fetch-event-source) (SSE), fancy-canvas

---

## 14. License

Licensed under the **MIT License**, see [LICENSE](LICENSE) (Copyright (c) 2026 abulo). Free to use, modify and redistribute with attribution.

---

## Version History

- **v1.7.18 (current)**: README rewritten to the "TypeScript OSS standard template" — value first, then quick start, then details: hero banner + badges → features (TS selling points: type guard / interface separation / strict zero errors) → installation (source-repo form + Node/pnpm/TS requirements) → quick start (minimal usage + custom-data passthrough) → documentation (Pages / EN README) → API reference (Props / events / controller methods with type signatures) → options (Props table + Mock/Http constructor tables) → exported types (9 public types) → examples (6 scenarios) → development (commands + directory tree + engineering constraints) → contributing → changelog (built-in version history) → FAQ (6 real high-frequency questions) → credits → license. Full version history preserved. Verified: tsc 0 errors, vitest 27 files / 257 tests green.
  Additions: section "8.5 Realtime transport modes in detail (ws / sse / poll)" — parameter overview, backend contracts, behavior semantics (reconnect / reentrancy guard / incremental filter / cache merge), shared auth-option table, cheat sheet; MIT LICENSE file added, License section points to it.

- **v1.7.17**: README fully rewritten + core code comments upgraded. README restructured as standard OSS docs: project intro (positioning / tech stack / capabilities / architecture layers), quick start (install / minimal usage / custom-data passthrough), component API (Props input table / events output table / controller methods inputs→outputs), data access (ChartDataService interface docs: HistoryQuery inputs, fetchHistory outputs, subscribeRealtime outputs, Mock/Http constructor tables), data-point format (all ChartDataPoint fields), periods & indicators, theme colors, layout structure, directory tree, build/test/package, memory & performance, Pages deployment; full version history preserved. Code comments upgraded to an input/output standard: `types/chart.ts` (field purposes), `services/chartDataService.ts` (interface methods @param/@returns), `services/mockChartDataService.ts` (fetchHistory / subscribeRealtime / ensurePool / ensureTsPool / ensurePeriodPool / lowerBound / touchCache), `services/mockDataGenerator.ts` (core generator functions @param/@returns), `chart/periods.ts`, `chart/util/format.ts`. Verified: tsc 0 errors, vitest 27 files / 257 tests green.

- **v1.7.16**: services layer refactor — `chartDataService.ts` keeps only the interface definitions (`HistoryQuery` / `RealtimeHandler` / `ChartDataService`); the Mock implementation moved out: `MockChartDataService` class + `touchCache` (LRU cache management) + `MockChartDataServiceOptions` relocated from `chartDataService.ts` into `mockDataGenerator.ts` (data generation + Mock service in one file, interfaces imported from `chartDataService.ts`, no circular dependency); then, per the **>1000-lines split discipline**, the Mock service implementation was separated into `mockChartDataService.ts` (lazy pools + pagination / realtime orchestration, ~640 lines) and `mockDataGenerator.ts` returned to pure data generation (~490 lines). Import sites updated: `App.vue` / `KLineChart.vue` / `tests/timeshare.test.ts` / `tests/cacheLru.test.ts` / `tests/mockRealistic.test.ts` / `tests/chartDataService.test.ts`. Verified: tsc 0 errors, vitest 27 files / 257 tests green.

- **v1.7.15**: fixed "daily → volume off → volume on → 1d intraday bottom time axis wrong, main & indicator charts compressed" — the **indicator-group variant** of the same root cause as v1.7.14: when `vol` is re-enabled, `setVolumeVisible(true)` runs the coordination flow "temporarily remove indicator group (`setSubIndicator(null)`) → rebuild indicator group (`setSubIndicator(active)`)"; `SubIndicatorPaneManager.removePanes` directly `removePane`s the indicator group, and the removed MACD series (~400 K-line points) likewise **remains attached to the timeScale** (library `_private__points` length 641 = 400 residual + 241 intraday). Fix: clear all series data of the indicator-group panes (startIndex / startIndex+1) **before** `removePane` — same paradigm as `removeVolumePanes`; a repo-wide grep confirmed only these two `removePane` call sites, both covered. Verified: browser — path B logical 0-240, time axis 09:30~15:00 normal; same-page round-trips / vol-off path / daily viewport (280-399) all clean. tsc 0 errors, vitest 28 files / 258 tests green.

- **v1.7.14**: fixed "daily → volume off → 1d intraday bottom time axis wrong, main & indicator charts compressed" — `removeVolumePanes` directly `removePane(2)`s the volume group, and the removed series' K-line data (~400 points) **remains attached to the timeScale**: after switching to intraday, `fitContent` stretches the viewport to 1.5 years (logical 0-640), the time axis mixes K-line dates / 08:00 labels, and the 1-day intraday data is squashed. Fix: clear all series data on pane2/3 (`setData([])`) **before** `removePane` — no timeScale residue (logical restored to 0-240). Clearing while the indicator group is still on pane4/5 (not shifted) has no side effects; K-line volume bars are self-drawn by `VolumeBarPrimitive`, so clearing the series does not affect display. Verified: browser — volume off → 1d intraday logical 0-240, time axis 09:30~15:00 restored; re-enable volume / daily→intraday round-trips all normal. tsc 0 errors, vitest 28 files / 258 tests green.

- **v1.7.13**: fixed "daily K zoomed x5, image reverts after 10s" — realtime viewport follow (`followLastBarIfTracking`) previously used `setVisibleLogicalRange` to **force the last 120 bars back** (added so priceLine stays in view); after zooming, a ~38-bar viewport was also forcibly reset to 120 bars. Switched to `scrollToPosition(0, false)` (right offset 0) — **barSpacing / viewport width completely unchanged**, only the right edge hugs the data tail; also eliminated the per-frame -1px width drift from `setVisibleLogicalRange` recomputing barSpacing. Verified: browser — zoom x5 width 38.32 → after 10s width 38.32 zero drift with the right edge following new bars; zoom out x5 width 365.2 holds; shifting left to view history no longer steals the viewport (v1.7.1 semantics preserved); right-shift past the edge is library rightOffset linkage (content unchanged, not a revert). tsc 0 errors, vitest 28 files / 258 tests green.

- **v1.7.12**: crosshair vertical **center-aligned to bar center** — user example: "bar width 11, line width 3, snapping should make the line cover the bar-center columns (5,6,7), that's the true bar middle". Root cause: drawing with `Math.round(x)+0.5` shifted bar center 291.57 to 292.5 (right-biased; the wider the line, the larger the offset — 1.5px right at 3px width). Fix: draw the vertical line with the bar center's **float x as the geometric center** (no rounding offset), so the line center aligns exactly with the bar center; the horizontal line (mouse-following, no center semantics) keeps sub-pixel alignment. Verified: tsc 0 errors, vitest 28 files / 258 tests green, browser pixel scan — daily snap bar center 291.57 → line pixel columns [291,292] center 291.5 (0.07px sub-pixel) / intraday bar center 292.61 → line columns [292,293] center 292.5.

- **v1.7.11**: crosshair **dwell snap** fix — user reported "vertical line not snapped to the middle on volume / K-line bars". Root cause: after a fast move stops abruptly, the mouse stops producing events (last event speed still above threshold → pixel mode), the line rests at a pixel position (possibly ≤4px off bar center), and no further event triggers snapping. Fix: a **dwell timer** in the hit branch — after the mouse is still for 120ms (`STOP_SNAP_DELAY_MS`), re-snap to the nearest hit param's integer logical (line returns exactly to the bar / volume-bar center, same `logicalToCoordinate` grid as `volumeBarPaneView`); any new event resets the timer; cancelled on miss / pane0 / destroy. Verified: tsc 0 errors, vitest 28 files / 258 tests green, browser — fast sweep pixel (mouse-following) → 50ms stop still pixel → 450ms dwell snap (daily back-jumps 3px to grid 474.97 / intraday 0.9px to grid) → fast again returns to pixel. Added `window.__klineChart.syncMode` probe (pixel / snap / none).

- **v1.7.10**: crosshair **speed-adaptive hybrid** — both "full hand-tracking" and "magnetic snap" at once. Background: after v1.7.9 pixel-level tracking was confirmed "good enough", the user noted it **lost the snap feel** (line no longer rests on bar centers). Fix: `syncLineX` gains a **40ms sliding-window average speed** decision — fast movement (window avg ≥ 0.5px/ms) uses pixel mode (smooth tracking, zero deviation, no jumps); slow / dwell uses snap (line stable on bar center, magnetic feel preserved). The speed state machine only updates in the `handleCrosshairMove` sync section (the single vertical-line set point); `applyCrosshairMove` (rAF) no longer re-sets the line (avoids overwriting with the wrong mode); keyboard moves remain always-snap (per-bar semantics). Verified: tsc 0 errors, vitest 28 files / 258 tests green, browser frame sampling — fast (3.75px/ms) daily 31 frames / intraday 28 frames **all pixel-level zero deviation**; slow (0.09px/ms) 72 frames all snapped to bar centers (deviation ≤ bar half-width, magnetism normal).

- **v1.7.9**: crosshair vertical **pixel-level mouse tracking** (user reported "fast-move lag" three times; frame sampling located the jump-grid deviation of snap-to-bar-center: with 120 bars, bar spacing ~8.6px, the line jumped ±4.3px between bar centers each frame during fast moves). Fix: in the hit branch the vertical line x takes `param.point.x` (mouse coordinate relative to the data area, pixel-level) — exactly like the horizontal line (also mouse-following), **zero deviation** at any speed; keyboard moves (per-bar semantics) keep `logicalToCoordinate` snapping to bar centers. Added `window.__klineChart.lineX` debug probe (current main-chart line x, for frame sampling). Verified: tsc 0 errors, vitest 28 files / 258 tests green, browser CDP high-frequency moves + page rAF frame sampling (2ms/step sweep 300→1250, incl. tooltip-covered area) — all frames vertical-line deviation **0.00px**, 0 frozen frames, stable 16.6ms frame interval.

- **v1.7.8**: crosshair **unified dashed horizontal + vertical lines** (same as last-price line, 6px on / 4px off). Background: the library's crosshair horizontal (horzLine) defaults to solid, its dash derived from line width (`Dashed=[2w,2w]`), unable to express the price line's [6,4] style. Approach: the horizontal line also becomes self-drawn (same `CrosshairLinePrimitive` as the v1.7.6 vertical, paneIndex injected at construction, one instance per pane) — both lines unify `setLineDash([6,4])`; the horizontal renders only on the **pane the crosshair hit** (same semantics as library horzLine, y is the hit pane's local coordinate), while the vertical still spans all panes; the library horizontal is disabled too (`visible:false` to avoid solid + dashed overlap rendering solid). The y dispatch shares the vertical's chain, **moved to same-frame sync before rAF** (horizontal follows hand in the same frame on fast moves); keyboard-move horizontal injects into pane1 (same basis as the left-scale indicator value). Verified: tsc 0 errors, vitest 28 files / 258 tests green, browser pixel diff — daily / intraday bright segments all 6px (6 on / 4 off), horizontal only on the hit pane (pane3 has none), fast sweep across the tooltip tracks throughout, keyboard lines normal, dark/light screenshots normal.

- **v1.7.7**: crosshair **fast-move lag fully fixed** (finishing after the v1.7.6 self-drawn line regression). Two-stage root cause & fix:
  ① **Vertical-line update chain lag** (initial): line sync went through rAF throttle (+1 frame) + forced invalidate (+1 frame), accumulating ~2 frames (~33ms) of trail on fast moves. Fix: the vertical x computation and `setX` (cheap) **execute same-frame synchronously before rAF**; heavy work (tooltip / indicator values) still merges into rAF to avoid drag jank; redraw no longer depends on `requestUpdate` (the library ChartApi has no such method — a no-op in the v1.7.7 first version) — the library already redraws the horizontal with the new position before dispatching crosshairMove, so the series-level vertical setX that same frame tracks the hand.
  ② **Tooltip fixed-area occlusion** (the real sticking point the user re-tested as "lag still exists"): the tooltip overlay (zIndex 9999, fixed at a pane1 corner) covers the library's mousemove targets (each pane's top canvas, style.zIndex='2'); sweeping fast over the overlay means events never enter the canvas event stream, and entering the overlay triggers canvas mouseleave → the library clears the crosshair (line disappears) → perceived as "lag / break". Fix (**event forwarding**): on `mousemove` inside the overlay, **forward** the event to the top canvas of the pane under the mouse — synthesize `mouseenter` first (library mouseEnterHandler re-attaches the mousemove listener) then synthesize `mousemove` (drives the crosshair by coordinates); all existing overlay features (corner positioning / text selection / press-to-drag) are preserved and the crosshair tracks throughout; no forwarding during drag / selection freeze; after pane rebuild (volume / indicator toggles) invalidated canvases are lazily refreshed by `ensureTopCanvases`, no residue, no leaks. Verified: tsc 0 errors, vitest 28 files / 258 tests green, browser frame-by-frame (16ms/step) sweep over the fixed tooltip area (x≈1139~1258) — daily / intraday vertical single-column tracking (deviation ≤4px), tooltip stays visible, MACD / volume toggle combinations all normal throughout.

- **v1.7.6**: crosshair vertical **self-drawn primitive** (the v1.7.5 solid-line approach was rejected in acceptance; root cause confirmed as "the line was covered by bars"). Approach: new `CrosshairLinePrimitive` (zOrder 'top', mounted last on each pane's representative series) self-draws the vertical, spanning the full pane height, drawn above K-line / volume / MACD / indicator lines — fully visible at every tick position, no gaps, no coverage; the library vertical is disabled (`vertLine.visible = false`) to avoid double lines; color follows theme `crosshairLineColor` (opaque, alpha 1.0, dark/light distinguished), horizontal still drawn by the library (Solid). Supporting fixes: vertical x dispatch consolidated in `CrosshairManager` (mouse logical → coordinate, keyboard timeToIndex → coordinate); **intraday has no realtime frame loop and the library does not auto-redraw after crosshairMove** → `syncLineX` / `syncKeyboardMove` trigger the redraw so the line renders instantly; the vertical primitive is unregistered when panes are removed by indicator / volume toggles (leak prevention). Verified: tsc 0 errors, vitest 28 files / 257 tests green, canvas pixel verification — dark daily multiple bar positions pane1/3/5 lines 100% spanning (285/95/95px), intraday pane1/3/5 100% (327/109/109px), no residual double line (library vertical off), lines still normal after volume / indicator toggles.

- **v1.7.5**: crosshair vertical fix — horizontal / vertical lines switched from the library default dash (6px bright / 6px dim) to **solid (LineStyle.Solid)**, fixing the missing bottom of the vertical in sub-panes pane3/pane5 (95px high; a 12px dash cycle does not divide 95px, leaving the bottom 5px in the dim segment); `crosshairLineColor` alpha raised from 0.25 to **0.6** (dark/light consistent) so the line is clearer in the gaps between K-line / volume / MACD bars. (This release failed acceptance and was replaced by the self-drawn approach in v1.7.6.)

- **v1.7.4**: intraday average-price line toggle `avgLineVisible` (rendered by default; when off the line is not rendered and pane0 info row / tooltip hide the average price).

- **v1.7.3**: when the volume group (pane2 info row / pane3) is closed, volume / turnover are hidden in both the tooltip and the main info row.
