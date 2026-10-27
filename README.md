# KLineChart（kline-chart-component）

> 仿东方财富 / 通达信风格的多 Pane K 线 + 分时（1d~5d）图表组件。基于 **Vue 3 + TypeScript + lightweight-charts v5.2.1** 深度定制，开箱即用、接口与实现分离，接入真实行情零改动。

[![TypeScript](https://img.shields.io/badge/TypeScript-6.0.3-blue)](https://www.typescriptlang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.5.44-42b883)](https://vuejs.org/)
[![lightweight-charts](https://img.shields.io/badge/lightweight--charts-5.2.1-0593ff)](https://github.com/tradingview/lightweight-charts)
[![pnpm](https://img.shields.io/badge/pnpm-12.15.0-orange)](https://pnpm.io/)
[![Tests](https://img.shields.io/badge/tests-257%20passed-brightgreen)](tests/)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-online-success)](https://abulo.github.io/kline-chart-component/)

---

## 目录

- [1. 特性 Features](#1-特性-features)
- [2. 安装 Installation](#2-安装-installation)
- [3. 快速上手 Quick Start](#3-快速上手-quick-start)
- [4. 文档入口 Documentation](#4-文档入口-documentation)
- [5. API 参考 API Reference](#5-api-参考-api-reference)
- [6. 配置项 Options](#6-配置项-options)
- [7. 类型导出 Types](#7-类型导出-types)
- [8. 示例 Examples](#8-示例-examples)
- [9. 本地开发 Development](#9-本地开发-development)
- [10. 贡献指南 Contributing](#10-贡献指南-contributing)
- [11. 变更日志 Changelog](#11-变更日志-changelog)
- [12. 常见问题 FAQ](#12-常见问题-faq)
- [13. 致谢 Credits](#13-致谢-credits)
- [14. 许可证 License](#14-许可证-license)

---

## 1. 特性 Features

- 💪 **100% TypeScript**：全仓强类型（`vue-tsc --noEmit` 零错误），组件 Props / 事件 / 控制器方法均有完整类型签名；统一数据点类型 `ChartDataPoint` + `pointType` 类型守卫，三种数据（K 线 / 分时 / 集合竞价）共用同一数组
- 🧬 **接口与实现分离**：数据层统一走 `ChartDataService` 接口（历史分页 + 实时订阅），内置 Mock 服务开箱即用，接入真实行情只需替换 `HttpChartDataService`，组件零改动
- 📦 **多 Pane 布局**：pane0 信息行 → pane1 主图 → pane2 量信息行 → pane3 成交量图 → pane4 指标信息行 → pane5 附图指标图；`60 : 20 : 20` 可配，成交量组 / 指标组独立开关（四态布局）
- 🕯️ **K 线主图**：Candlestick + 主图指标（MA / EXPMA / BOLL / SAR / BBI 互斥）+ 最高 / 最低价标注 + 最后价线（priceLine，虚线可开关）+ 空心红柱
- ⏱️ **分时图（1d~5d）**：LineSeries 双线（价格 + 均价，均价可开关）、成交量 / MACD 1px 直方图、栅格竖线 4/2/3/4/5 等分、左右刻度以首根 preClose 为中值对称等差扩展（右侧同步百分比）、涨跌三态着色
- 📈 **十种附图指标**：RSI / KDJ / MACD / WR / DMI / BIAS / OBV / CCI / ROC / CR 互斥单选（分时无 CR），各指标纯函数独立可单测
- 🎯 **十字星联动**：竖 / 横虚线（6px 线 / 4px 空）+ 左 / 右刻度指示值 + 可拖拽 tooltip（含涨跌着色）；速度自适应——快速移动像素级跟手、慢速停驻磁吸吸附
- ⌨️ **键盘导航**：左右方向键逐 bar 移动，到可视区边缘自动平移跟随，按住 40ms 自动连发
- 🎨 **深 / 浅双主题**：全部颜色集中在 `theme.ts` 公共文件（页面零散落硬编码色值），红涨绿跌、平盘深系白 / 浅系黑
- 🧠 **内存与性能**：十字星 rAF 节流、primitive 视图单例复用、可视区渲染裁剪（10000 条数据下每帧仅绘制可视 ~120 根）、Mock 池 LRU 淘汰（`touchCache`）、Http 历史缓存 LRU + 已知 total 上限，`destroy()` 完整退订防泄漏
- ✅ **严格模式**：`strict: true` 下类型检查零错误；vitest 27 文件 / 257 用例全绿（含 LRU 缓存、分时、指标、内存相关专测）

---

## 2. 安装 Installation

当前以**源码仓库**形态交付（GitHub Pages 演示在线可用）；npm 包发布形态见 [Roadmap](#）。

```bash
git clone git@github.com:abulo/kline-chart-component.git
cd kline-chart-component
pnpm install
```

环境要求：

| 项 | 要求 |
|---|---|
| Node.js | ≥ 24（开发环境锁定 24.16.0） |
| pnpm | 12.15.0（`packageManager` 字段锁定 `pnpm@12.15.0`） |
| TypeScript | 6.0.3（devDependency 锁定，`strict: true`） |

> 依赖锁定：`lightweight-charts@5.2.1`（图表内核，版本锁定防 API 漂移）、`vue@3.5.44`、`vite@8.3.5`、`vitest@5.0.5`、`vue-tsc@3.3.13`。

---

## 3. 快速上手 Quick Start

### 3.1 最小用法（Vue 组件）

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

> 父组件只维护状态并传 Props（单向数据流）；放大 / 缩小 / 左移 / 右移等瞬时动作经 `ref` 直接调控制器（见 [示例 Examples](#8-示例-examples)）。

### 3.2 无后端直通自定义数据

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

> 提供 `data` 时组件**跳过 service 拉取 / 分页 / 实时订阅**，直接渲染自定义数据。

---

## 4. 文档入口 Documentation

- **在线预览（GitHub Pages）**：https://abulo.github.io/kline-chart-component/
- **英文版 README**：[README.en.md](README.en.md)
- **版本记录（Changelog）**：本文件底部 [版本记录](#11-变更日志-changelog)
- **源码目录索引**：见 [本地开发 Development](#9-本地开发-development) 的目录结构

---

## 5. API 参考 API Reference

### 5.1 组件 Props（入参）

```ts
interface KLineChartProps {
  symbol?: string            // 股票代码
  name?: string              // 股票名称
  period?: PeriodValueOrEmpty // 当前周期（'' = 未设置，不发起请求）
  theme?: string             // 'dark' | 'light'
  timeAxis?: boolean         // 底部时间轴
  leftScale?: boolean        // 左刻度区
  rightScale?: boolean       // 右刻度区
  mainIndicator?: string     // 主图指标（'' = 关）
  subIndicator?: string      // 附图指标（'' = 关）
  service?: ChartDataService // 数据服务（默认 Mock 单例）
  data?: ChartDataPoint[]    // 外部自定义数据（优先渲染）
  format?: string            // 时间格式模板（缺省按周期自动）
  priceLineVisible?: boolean // 最后价线
  volumeVisible?: boolean    // 成交量组
  avgLineVisible?: boolean   // 分时均价线
  fullscreen?: boolean       // 全屏
}
```

完整入参总表见 [6. 配置项 Options](#6-配置项-options)。

### 5.2 组件事件（出参）

| 事件 | 出参类型 | 触发时机 |
|---|---|---|
| `period-change` | `(value: PeriodValue) => void` | 周期变化时触发 |
| `status-change` | `(status: ChartLoadStatus) => void` | 加载状态变化：`'idle' \| 'loading' \| 'loading-older' \| 'ready' \| 'error'` |
| `fullscreen-change` | `(fullscreen: boolean) => void` | 组件内"退出全屏"按钮触发 |

### 5.3 控制器方法（ref 访问，入参 → 出参）

```ts
const chartRef = ref<InstanceType<typeof KLineChart> | null>(null)

// —— 瞬时动作（无入参） ——
chartRef.value?.controller?.zoomIn()      // 放大（barSpacing 限幅 2~80）
chartRef.value?.controller?.zoomOut()     // 缩小
chartRef.value?.controller?.shiftLeft()   // 左移一屏宽（到最左自然停）
chartRef.value?.controller?.shiftRight()  // 右移

// —— 数据与标的（入参后生效） ——
chartRef.value?.controller?.init()                    // 无入参：拉历史 + 重绘 + 订阅实时（组件自动调用）
chartRef.value?.controller?.setSymbol('600519')       // (symbol: string) → 更新股票代码
chartRef.value?.controller?.setName('贵州茅台')        // (name: string) → 更新股票名称
chartRef.value?.controller?.setService(mockService)   // (service: ChartDataService) → 换数据服务
chartRef.value?.controller?.setPeriod('day')          // (period: PeriodValue) → 切换周期（时间格式联动）

// —— 状态设置（Props watch 已自动调用；手动仅用于编程式控制） ——
chartRef.value?.controller?.applyTheme('light')       // (theme: ChartThemeName)
chartRef.value?.controller?.toggleTimeAxis(false)     // (visible: boolean)
chartRef.value?.controller?.setLeftScaleVisible(true) // (visible: boolean)
chartRef.value?.controller?.setRightScaleVisible(true)
chartRef.value?.controller?.setMainIndicator('boll')  // (name: MainIndicatorType | null)
chartRef.value?.controller?.setSubIndicator('kdj')    // (name: SubIndicatorType | null, null = 关)

// —— 生命周期（组件卸载自动调用） ——
chartRef.value?.controller?.destroy()                 // 无入参：退订实时 / 断开 ResizeObserver / detach primitive / chart.remove()

// —— 加载状态（ref 访问当前值） ——
chartRef.value?.loadStatus                            // 'idle' | 'loading' | 'loading-older' | 'ready' | 'error'
```

---

## 6. 配置项 Options

### 6.1 组件 Props 总表

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `symbol` | `string` | `''` | 股票代码（pane0 信息行：名称 [代码]） |
| `name` | `string` | `''` | 股票名称 |
| `period` | `PeriodValueOrEmpty` | `'day'` | 当前周期；变化时经 service 重新拉取；`''` = 周期未设置，组件不发起请求 |
| `theme` | `ChartThemeName` | `'dark'` | `'dark'` 深系 / `'light'` 浅系（颜色集中在 `theme.ts`） |
| `timeAxis` | `boolean` | `true` | 底部时间轴显隐（切换时重算 pane 高度） |
| `leftScale` | `boolean` | `false` | 左刻度区显隐（统一宽 72px，切换后 fitContent） |
| `rightScale` | `boolean` | `false` | 右刻度区显隐 |
| `mainIndicator` | `MainIndicatorType \| ''` | `''` | 主图指标 `'ma' / 'expma' / 'boll' / 'sar' / 'bbi'`（互斥，点击已激活项关闭） |
| `subIndicator` | `SubIndicatorType \| ''` | `''` | 附图指标 `'rsi' / 'kdj' / 'macd' / 'wr' / 'dmi' / 'bias' / 'obv' / 'cci' / 'roc' / 'cr'`（互斥） |
| `service` | `ChartDataService` | Mock 单例 | 数据服务实现（真实行情传 `HttpChartDataService`） |
| `data` | `ChartDataPoint[]` | `undefined` | 外部自定义数据（提供时优先渲染，跳过 service） |
| `format` | `string` | `''` | 时间格式模板（如 `'YYYY-MM-DD'` / `'YYYY-MM-DD HH:mm'`）；缺省按周期自动 |
| `priceLineVisible` | `boolean` | `true` | 最后价线显隐（K 线主图） |
| `volumeVisible` | `boolean` | `true` | 成交量组（pane2 信息行 + pane3 图；关闭销毁整组 + 布局重算 + tooltip / 信息行隐藏量额） |
| `avgLineVisible` | `boolean` | `true` | 分时均价线（关闭时均价线不渲染，pane0 信息行 / tooltip 同步隐藏均价；仅分时生效） |
| `fullscreen` | `boolean` | `false` | 全屏（true 铺满浏览器视口；Esc 退出） |

### 6.2 MockChartDataService 构造参数

```ts
interface MockChartDataServiceOptions {
  /** 每页拉取条数（历史 / 左滑分页共用，必填） */
  fetchLimit: number
}
```

### 6.3 HttpChartDataService 构造参数

```ts
interface HttpChartDataServiceOptions {
  fetchLimit: number                  // 必填：每页拉取条数
  historyUrl: string                  // 必填：历史完整地址（GET?symbol=&period=&before=&limit=&total=）
  realtimeTransport?: 'ws' | 'sse' | 'poll' // 实时模式，默认 'ws'
  wsUrl?: string                      // 'ws' 模式必填完整地址
  sseUrl?: string                     // 'sse' 模式必填完整地址
  sseEventName?: string               // SSE 事件名，默认 'message'
  pollUrl?: string                    // 'poll' 模式必填完整地址
  pollIntervalMs?: number             // 轮询频率 ms，默认 3000
  timeoutMs?: number                  // fetch 超时 ms，默认 8000
  headers?: Record<string, string>    // 注入所有 HTTP 请求头
  cookies?: Record<string, string>    // 对象形式，序列化注入 Cookie 头
  params?: Record<string, string>     // 附加所有请求的 URL query
  cache?: boolean                     // 历史缓存开关，默认 true
  maxCacheEntries?: number            // LRU 缓存条目上限（symbol|period 组合数）
  maxKnownTotals?: number             // 「已知总条数」记录上限（防内存无限增长）
  cacheTtlMs?: number                 // 最新页缓存有效期 ms（更早分页不受限）
}
```

---

## 7. 类型导出 Types

公共类型全部带 `export` 声明，消费方可从源码直接 import（npm 发布后将同步 `.d.ts`）：

| 类型 | 定义位置 | 说明 |
|---|---|---|
| `ChartDataPoint` | `src/types/chart.ts` | 统一数据点（K 线 / 分时 / 集合竞价），`pointType` 类型守卫 |
| `HistoryQuery` | `src/services/chartDataService.ts` | 历史查询入参（symbol / period / before / limit / total） |
| `RealtimeHandler` | `src/services/chartDataService.ts` | 实时回调出参：`(point: ChartDataPoint) => void` |
| `ChartDataService` | `src/services/chartDataService.ts` | 数据服务接口（组件只依赖它） |
| `MainIndicatorType` | `src/chart/indicator/` | 主图指标名联合类型：`'ma' \| 'expma' \| 'boll' \| 'sar' \| 'bbi'` |
| `SubIndicatorType` | `src/chart/indicator/` | 附图指标名联合类型：10 项 |
| `PeriodValue / PeriodValueOrEmpty` | `src/chart/periods.ts` | 周期值 / 周期值或空 |
| `ChartThemeName` | `src/chart/core/theme.ts` | 主题名：`'dark' \| 'light'` |
| `ChartLoadStatus` | `src/chart/core/types.ts` | 加载状态联合类型 |

`ChartDataPoint` 核心字段（完整字段表见 [8.3 数据点格式](#83-数据点格式chartdatapoint)）：

```ts
export interface ChartDataPoint {
  /** 秒级时间戳（lightweight-charts 标准时间格式） */
  time: number
  /** 交易日期 'YYYY-MM-DD' */
  tradeDate: string
  /** 昨收价（涨跌幅 / 涨跌着色基准） */
  preClose: number
  /** 类型守卫：'kline' | 'timeshare' | 'auction' */
  pointType: 'kline' | 'timeshare' | 'auction'
  // K 线：open / high / low / close / volume / amount / risePrice / riseRate
  // 分时：price / avgPrice / volume / amount
  // 集合竞价：matched / unMatched / matchType / isAuction
  [key: string]: any
}
```

---

## 8. 示例 Examples

### 8.1 基础 K 线（默认 Mock 数据）

```vue
<KLineChart symbol="600000" name="浦发银行" :period="'day'" theme="dark" />
```

### 8.2 分时图（1d~5d）

```vue
<KLineChart symbol="300750" name="宁德时代" :period="'1d'" theme="dark" />
```

> 分时状态下：平移 / 放大缩小按钮隐藏、无主图指标、附图无 CR、时间格式 `YYYY-MM-DD HH:mm`、均价线可关。

### 8.3 数据点格式（ChartDataPoint）

| 字段 | 类型 | pointType | 说明 |
|---|---|---|---|
| `time` | `number` | 全部 | 秒级时间戳（严格递增，库断言要求） |
| `tradeDate` | `string` | 全部 | 交易日期 `YYYY-MM-DD` |
| `preClose` | `number` | 全部 | 昨收价（涨跌着色 / 分时刻度中值 / 涨跌幅基准） |
| `pointType` | `'kline' \| 'timeshare' \| 'auction'` | 全部 | 数据点类型标记 |
| `open / high / low / close` | `number` | kline | 开 / 高 / 低 / 收 |
| `volume` | `number` | kline | 成交量（手 / 股） |
| `amount` | `number` | kline | 成交额 |
| `risePrice / riseRate` | `number` | kline | 涨跌额 / 涨跌幅 %（相对昨收） |
| `price` | `number` | timeshare | 分时当前成交价 |
| `avgPrice` | `number` | timeshare | 分时平均成交价 |
| `matched / unMatched` | `number` | auction | 已匹配 / 未匹配量 |
| `matchType` | `-1 \| 1` | auction | 买卖方向：-1 卖多（绿）/ 1 买多（红） |
| `isAuction` | `boolean` | auction | 是否集合竞价时段 |

### 8.4 接入真实行情（HttpChartDataService）

```ts
import { HttpChartDataService } from './services/httpChartDataService'

const service = new HttpChartDataService({
  fetchLimit: 200,
  historyUrl: 'http://<host>/api/kline/history',
  realtimeTransport: 'ws',
  wsUrl: 'wss://<host>/ws',
})

// 组件内直接传入 service；控制器 init 时按需分页 + 订阅实时
<KLineChart :service="service" symbol="600000" name="浦发银行" :period="'day'" />
```

### 8.5 编程式控制（ref 调用控制器）

```ts
const chartRef = ref<InstanceType<typeof KLineChart> | null>(null)

const onZoomIn = () => chartRef.value?.controller?.zoomIn()
const onShiftLeft = () => chartRef.value?.controller?.shiftLeft()
const switchToTimeshare = () => chartRef.value?.controller?.setPeriod('1d')
const toggleRightScale = () => chartRef.value?.controller?.setRightScaleVisible(true)
```

---

## 9. 本地开发 Development

### 9.1 环境与命令

| 命令 | 说明 |
|---|---|
| `pnpm install` | 安装依赖（锁定 `pnpm-lock.yaml`，lightweight-charts 5.2.1） |
| `pnpm dev` | 开发预览 http://127.0.0.1:5199（`/api` 代理到后端，`ws: true` 代理 WebSocket） |
| `pnpm type-check` | 类型检查（`vue-tsc --noEmit`，strict 零错误） |
| `pnpm test` | 单元测试（vitest，27 文件 / 257 用例） |
| `pnpm build` | 类型检查 + 构建（`vite build`，产物 `dist/`，base `/kline-chart-component/`） |
| `pnpm preview` | 预览构建产物 http://127.0.0.1:4173/kline-chart-component/ |

### 9.2 目录结构

```
src/
├── App.vue                    # 工具栏 + 容器（周期栏 / 主题 / 开关 / 全屏）
├── main.ts                    # 入口
├── components/
│   └── KLineChart.vue         # 图表组件（Props / 事件 / 控制器 ref）
├── chart/                     # 按功能分组的图表源码
│   ├── periods.ts             # 周期配置（13 项 + periodMap O(1) 查询 + 分时栅格等分数）
│   ├── core/                  # 核心：控制器 / 布局 / 主题 / 数据桥
│   │   ├── kLineChartController.ts   # 控制器：数据 / 生命周期 / 对外 API
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

### 9.3 工程约束（贡献前必读）

- **构建**：Vite 8 + `@vitejs/plugin-vue`；`vue-tsc` 类型检查在 build 前置
- **测试**：Vitest 5 + jsdom（图表内核测试不依赖浏览器渲染）
- **代码风格**：函数名驼峰语义化；类方法用箭头字段（this 绑实例、被库回调调用不丢 this）
- **颜色**：全部集中在 `src/chart/core/theme.ts`，页面零散落硬编码色值
- **文件**：超 1000 行的 TS 文件拆分；文件名不包含数字；文件系统大小写敏感（import 必须精确匹配）
- **版本**：变更需同步 `package.json` + README 版本记录

---

## 10. 贡献指南 Contributing

欢迎 PR 与 Issue。提交前请：

1. 运行 `pnpm type-check`（类型零错误）与 `pnpm test`（全绿）
2. 新增功能**必须**提供类型定义与测试用例（含边界 / 内存场景）
3. 遵循 §9.3 工程约束（驼峰命名 / 主题色集中 / 注释含入参出参）
4. 提交信息建议格式：`v<版本> <变更摘要>（\n- 明细）`

> 完整的 PR / Issue 流程约定将整理到独立的 `CONTRIBUTING.md`。

---

## 11. 变更日志 Changelog

版本记录**内置于本文件底部**（不单设 CHANGELOG 文件），见 [版本记录](#版本记录)。

- 完整历史：v1.7.4 ~ v1.7.18（分时图 / 刻度算法 / 十字星 / 成交量开关 / 布局重构 / 数据服务拆分 / README 迭代等）
- 发布流程：commit → push `main` → GitHub Pages Actions 自动部署 https://abulo.github.io/kline-chart-component/

---

## 12. 常见问题 FAQ

**Q1：`period` 传空字符串会发生什么？**
组件视为"周期未设置"：不发起数据请求，`tickMarkFormatter` 按 K 线口径兜底；就位后传入有效周期会重新拉取。首次请求 `symbol` / `total` 为空属正常（HistoryQuery 首次未持有数据），后续请求自动携带。

**Q2：切换周期后数据没有铺满（分时尤其明显）？**
周期切换 / 成交量组开关后控制器会 `fitContent`；若观察到未铺满，多为先关成交量组再切分时的组合路径，相关修复见版本记录 v1.7.14 / v1.7.15（removePane 前清空 series 防 timeScale 残留）。

**Q3：`HttpChartDataService` 的 `total` 参数是怎么来的？**
自动计算：取「该 symbol|period 累计拉取去重条数」与「后端上次返回的 total 字段」的较大值，以 `total=<n>` 附加到请求 URL，供后端增量 / 续传判断；调用方也可显式传入覆盖。

**Q4：十字星竖线在快速移动时为什么有时偏离柱体中心？**
速度自适应：快速移动用像素级（跟手零偏差），慢速 / 停驻用磁吸吸附（停在 bar 中心）。这是 v1.7.9~v1.7.11 按需求迭代的混合行为。

**Q5：分时状态下为什么没有平移 / 放大缩小按钮？**
分时周期（1d~5d）按产品语义固定满铺，不可平移缩放；App 工具栏对应按钮隐藏。

**Q6：为什么文件系统上 import 会报错？**
仓库按大小写敏感文件系统维护，import 路径必须与文件名精确一致（如 `kLineChartController.ts` 的大小写）。

---

## 13. 致谢 Credits

- 图表内核：[lightweight-charts](https://github.com/tradingview/lightweight-charts)（v5.2.1）
- UI / 交互参考：东方财富、通达信桌面端
- 实时接入依赖：[@microsoft/fetch-event-source](https://www.npmjs.com/package/@microsoft/fetch-event-source)（SSE）、fancy-canvas

---

## 14. 许可证 License

本项目采用 **MIT License** 开源（LICENSE 文件待补充，代码与文档可自由使用、修改与分发，注明出处即可）。

---

## 版本记录

- **v1.7.18（当前）**：README 按「TypeScript 开源项目标准模板」重写——先价值后上手再细节：
  头部横幅 + 徽章 → 特性（TS 卖点：类型守卫 / 接口分离 / strict 零错误）→ 安装（源码仓库形态 +
  Node/pnpm/TS 版本要求）→ 快速上手（最小用法 + 自定义数据直通）→ 文档入口（Pages / 英文
  README）→ API 参考（Props / 事件 / 控制器方法含类型签名）→ 配置项（Props 总表 + Mock/Http
  构造参数表）→ 类型导出（9 项公共类型清单）→ 示例（6 场景）→ 本地开发（命令表 + 目录结构 +
  工程约束）→ 贡献指南 → 变更日志（内置版本记录）→ FAQ（6 条真实高频问题）→ 致谢 → 许可证。
  完整版本记录保留。验证：tsc 0 错误、vitest 27 文件 257 tests 全绿。

- **v1.7.17**：README 全面重写 + 核心代码注释升级。README 重构为标准开源
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

