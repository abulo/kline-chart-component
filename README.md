# 多 Pane K 线组件（Vue3 + TypeScript + lightweight-charts v5）

多 Pane K 线组件：一个 `chart` 内多 Pane（lightweight-charts v5 原生多 Pane），包含顶部信息行（名称 [代码] 时间 + 主图指标值）、K 线主图、成交量、附图指标层（RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR 十指标互斥单选），指标层随选中指标动态开 / 关。

---

## 一、布局结构

指标**开启**（6 Pane，`main : volume : indicator = 60 : 20 : 20`）：

```
┌──────────────────────────────────────┐
│ pane0  信息行（名称[代码] 时间 + 指标值[各线色]，随十字星）│
│ pane1  K 线主图（Candlestick）         │  ← main 组 60%
│ pane2  成交量信息行（成交量 + MA5/MA10）│
│ pane3  成交量（自绘红绿柱）             │  ← volume 组 20%
│ pane4  指标信息行（各线数值，固定 22px）│
│ pane5  附图指标（十指标互斥）         │  ← indicator 组 20%
└──────────────────────────────────────┘
    底部：共享时间轴（timeScale，可开关）
```

指标**关闭**（4 Pane，`main : volume = 80 : 20`）：去掉 pane4 / pane5，pane1 / pane3 比例变为 80 : 20。

高度分配（时间轴开 / 关一致，仅库可用高度不同）：
- 空 Pane 固定 `topPaneHeight = 22px`（同一 stretchFactor，绝对相等）；
- 剩余高度按组比例分配（`calcPaneHeights` 纯函数，见 `chart/core/layout.ts`）；
- 像素因子方案：`stretchFactor` 直接设为目标像素高度 → 无舍入误差，pane 完全铺满；
- Pane 高度不可拖拽（`layout.panes.enableResize: false`）、Pane 之间无分割线（库 patch `SeparatorHeight: 1 → 0`）。

## 二、视觉与交互

- **主题切换**：深 / 浅两套配色全部集中在 `theme.ts`（`ChartThemeColors` + `chartThemes`，页面无散落硬编码色值）；切换时 App.vue 同步 **html 页面背景**（独立 `pageBackground`：深系 #0B0E13 / 浅系 #EDEFF3，与图表背景 #131722 / #FFFFFF 区分形成对比）+ 图表 `applyTheme`；
- **红涨绿跌**：上涨 `#FF0000`、下跌 `#008000`（深浅系一致，`theme.ts` 集中管理）；
- **上涨柱空心**：K 线 / 成交量 / MACD 柱 > 0 均为"背景色填充 + 红框"的空心红柱，下跌绿色实心；
- **柱宽一致**：pane1 / pane3 / pane5 柱宽 = `candlestickBarWidth(barSpacing, dpr)`（库源码原版 `optimalCandlestickWidth` + 奇偶修正，见 `chart/core/candlestickWidth.ts`），宽度 / 间隔绝对一致；
- **自绘栅格**（`GridPrimitive`，zOrder 'bottom' 位于数据之下）：
  - 竖线：4 等分（3 条）；
  - 横线：pane1 指标关 8 等分 / 指标开 6 等分；pane3 / pane5 2 等分（中间 1 条）；
  - 栅格固定于 Pane 本地坐标，平移 / 缩放数据时不动；
- **自绘左刻度标签**（`AxisLabelPrimitive` + `AxisLabelView` + `AxisLabelPaneView`）：
  - 标签位置与栅格横线完全对齐（同一等分公式），值 = 该 y 处实时价格（coordinateToPrice 反算，随平移 / 缩放变化）；
  - 行数 = 等分数 + 1（含首尾内嵌 8px 防裁切）：pane1 = 9 / 7 个、pane3 / pane5 = 3 个；
  - pane5 中间刻度固定 0（MACD 以 0 轴分正负）；
  - **文字设置与十字星指示值完全一致**（共用 `drawAxisLabel`：右对齐、右缘距 6px、背景左右 6px、高 18px、12px chartFontFamily，颜色随主题）；
- **十字星左刻度指示值**（`CrosshairAxisLabelPrimitive` + `CrosshairAxisLabelPaneView`）：
  - 十字星移动时，在左刻度区绘制横线所在数值标签（价格 / 成交量 / MACD 值，随鼠标逐帧刷新）；
  - **背景块与文字颜色按深浅系定义**（`crosshairLabelBackground` / `crosshairLabelText`，见 theme.ts）：深系背景 #2A2E39 / 文字 #D1D4DC，浅系背景 #F0F2F5 / 文字 #33373E；
  - 实现路径：`priceAxisPaneViews` + zOrder 'top'（价格轴 top canvas，Cursor 级重绘，流畅无卡顿）；
  - 坐标：库 `point.y` 为 Pane 本地坐标，直接注入，不做前序 Pane 高度换算；
  - 文字右对齐绘制（`textAlign = 'right'`），避免超出价格轴 canvas 被裁剪；
- **十字星不贯穿 pane0**：pane0 内不触发十字星（controller 清除），pane0 顶层遮罩（`TopPaneOverlayPrimitive`，zOrder 'top'）以背景色覆盖竖线；
- **十字星细虚线**（`CrosshairLineCapPrimitive` + `CrosshairLineCapPaneView`，v1.4.101）：竖线在 top 层重绘为 0.75 CSS px 亚像素细虚线（虚线周期 [1,1] 物理 px（最密）），底部补齐实线保证"到底"；横竖线颜色 `crosshairLineColor` 透明度 0.25（深浅系区分，theme.ts），视觉更细更淡；库横竖线本体仍保留（时间轴时间 label 依赖库绘制）；
- **指标叠加绘图在十字星之上**（`IndicatorLinePrimitive`，zOrder 'top' top canvas 自绘）：主图指标线（MA / EXPMA / BOLL / BBI）与成交量均量线（VOL MA5 / MA10）自绘折线，绘制在十字星之上 —— 十字星横线穿过时指标线完整可见（库十字星画在 top canvas 的 series 之上，LineSeries 必被横线压住，故改自绘）；坐标 = timeScale.timeToCoordinate × anchorSeries.priceToCoordinate，按可视时间范围裁剪，坐标缺失断开路径；
- **内容 Pane 边框**（`PaneBorderPrimitive`）：pane1 / pane3 / pane5 自绘 1px 直角矩形边框，颜色随主题；bitmap 物理像素绘制（缩放时始终贴住画布最右边缘，无亚像素缝隙）；
- **最高 / 最低价标注**（`HighLowMarkerPrimitive` + `HighLowMarkerPaneView`）：pane1 可视区域内 high 最大 / low 最小的 bar —— 最高价 12px 黄色文字标注在柱顶上方、最低价 12px 蓝色文字标注在柱底下方，各带同色实线从文字块连到柱体上 / 下边缘中间；随平移 / 缩放实时重算、文字左右不越界；颜色深浅系区分（theme.highMarkerColor / lowMarkerColor）；
- **空 Pane "测试"文字**（`TestLabelPrimitive`）：垂直居中、距左 6px、跟随主题文字色。

## 三、全局控制（App.vue 工具栏）

| 按钮 | 功能 |
|---|---|
| 附图指标（互斥） | RSI / KDJ / MACD / WR / DMI / BIAS / OBV / CCI / ROC / CR：选中 = 开指标层（60:20:20）、取消选中 = 关指标层（80:20）；pane4 显示各线数值 |
| 时间轴开/关 | 底部时间轴显示 / 隐藏（重算 pane 高度） |
| 左刻度开/关 | 左刻度区显隐（所有 Pane 统一，宽度 72px，切换后 fitContent） |
| 右刻度开/关 | 右刻度区显隐（同左） |
| 缩小 / 放大 | X 轴 `barSpacing` 全局缩放（限幅 2~80） |
| 左移 / 右移 | X 轴平移（`scrollToPosition` ±10 根/次） |
| 浅系 / 深系 | 主题切换（颜色全集中在 `chart/core/theme.ts`） |

底部"主图指标"容器：MA / EXPMA / BOLL / SAR / BBI 五个按钮**互斥**（点击已激活
= 关闭），指标画在 pane1（与 K 线同价格刻度叠加）；SAR 为抛物点（圆点标记）。

图表内禁止滚轮 / 双指 / 拖轴缩放（`handleScale` 全关），缩放仅由按钮控制；平移保留。

## 四、目录结构

```
src/
├── App.vue                    # 工具栏 + 容器（80% 宽高居中）
├── main.ts                    # 入口
├── components/
│   └── KLineChart.vue         # 图表组件（props: symbol / name / timeAxis / leftScale / rightScale / theme / mainIndicator / subIndicator / dataCount / periodWhitelist；periodWhitelist=周期白名单（数组|逗号分隔字符串），有值时组件内渲染白名单周期按钮并 emit period-change，v1.4.95）
├── chart/                     # 按功能分组的图表源码
│   ├── periods.ts            # 周期配置（PERIODS 13 项：分时 1~5 日 + 日/周/月 K + 60~1 分 K；periodMap O(1) 查询 + getPeriodLabel，v1.4.94）
│   ├── core/                  # 核心：控制器 / 布局 / 主题 / mock / 蜡烛宽度
│   │   ├── KLineChartController.ts # 控制器（v1.4.73 功能拆分版）：Pane 创建 / 布局 / 主题 / 数据 / 缩放平移 / 刻度开关 / 生命周期，职责委托给下方管理器
│   │   ├── indicatorManager.ts # 指标管理器（主图五指标 + 成交量均量线 + pane0/pane2 信息行；setMainIndicator / setSubIndicator 转发附图指标层）
│   │   ├── subIndicatorPaneManager.ts # 附图指标 Pane 管理器（pane4 指标信息行 + pane5 指标图：创建/销毁/数据/信息行/主题；v1.4.89 拆分）
│   │   ├── crosshairManager.ts # 十字星管理器（十字星移动联动 + overlayTime + 左刻度指示值注册表）
│   │   ├── constants.ts        # 共享常量（LIBRARY_TIME_AXIS_HEIGHT / PRICE_SCALE_MIN_WIDTH）
│   │   ├── types.ts            # 公共类型（KLineChartOptions / MainIndicatorName / IndicatorLineSpec）
│   │   ├── indicatorMeta.ts    # 附图指标线名元信息（subIndicatorLabels）
│   │   ├── layout.ts          # 布局常量与高度计算（60/20/20 ⇄ 80/20）
│   │   ├── theme.ts           # 深系 / 浅系主题（所有颜色集中）+ 主图 / 附图指标配色
│   │   ├── mock.ts            # mock 数据（日 K，纯函数可单测）
│   │   └── candlestickWidth.ts# 蜡烛 / 柱体宽度（库原版 optimalCandlestickWidth）
│   ├── axis/                  # 左刻度标签（与栅格横线对齐，文字与指示值一致）
│   │   ├── axisLabelPrimitive.ts
│   │   ├── axisLabelView.ts
│   │   └── axisLabelPaneView.ts  # 自绘渲染 + 公共 drawAxisLabel（指示值共用）
│   ├── crosshair/             # 十字星左刻度指示值 + 竖线底部补齐（虚线相位缺口）
│   │   ├── crosshairAxisLabelPrimitive.ts
│   │   ├── crosshairAxisLabelPaneView.ts
│   │   ├── crosshairLineCapPrimitive.ts # 竖线底部补齐（填 LargeDashed 最后空白段，v1.4.90）
│   │   └── crosshairLineCapPaneView.ts
│   ├── border/                # 内容 Pane 边框自绘
│   │   ├── paneBorderPrimitive.ts
│   │   └── paneBorderPaneView.ts
│   ├── highLow/               # pane1 可视区域最高价 / 最低价标注（实线连接柱体）
│   │   ├── highLowMarkerPrimitive.ts
│   │   └── highLowMarkerPaneView.ts
│   ├── grid/                  # 固定等分栅格（竖 4 等分 / 横随 pane 配置）
│   │   ├── gridPrimitive.ts
│   │   └── gridPaneView.ts
│   ├── volume/                # 成交量柱自绘（红涨空心 / 绿跌实心）
│   │   ├── volumeBarPrimitive.ts
│   │   └── volumeBarPaneView.ts
│   ├── indicator/             # 东财指标库（统一出口 index.ts）：
│   │   │                       #   K 线主图 MA/EXPMA/BOLL/SAR/BBI + 附图 10 指标 + 分时 9 指标
│   │   ├── index.ts           # 统一出口（calcMainIndicators / calcSubIndicators 等）
│   │   ├── types.ts           # 公共类型（IndicatorLine / K / MainIndicators / SarPoint）
│   │   ├── utils.ts           # 共享工具（tdxSMA / ema / runningMax / toLines / toKBars）
│   │   ├── macd.ts            # MACD（calcMACD，东财口径，纯函数）
│   │   ├── macdBarPrimitive.ts
│   │   └── macdBarPaneView.ts
│   │   ├── sarMarkerPrimitive.ts # SAR 圆点自绘插件（挂 klineSeries，多头红 / 空头绿）
│   │   ├── ma.ts              # 简单移动平均（MA5/10/20/30/60）
│   │   ├── expma.ts           # 指数平滑（EXPMA12/50）
│   │   ├── boll.ts            # 布林带（N=20、K=2）
│   │   ├── sar.ts             # 抛物线转向（东财 SAR(4, 0.02, 0.2)）
│   │   ├── bbi.ts             # 多空指标（(MA3+MA6+MA12+MA24)/4）
│   │   └── （rsi/kdj/wr/dmi/bias/obv/cci/roc/cr/volumeMa 附图与分时指标）
│   ├── overlay/               # pane0 顶层遮罩（遮住十字星竖线）
│   │   ├── topPaneOverlayPrimitive.ts
│   │   └── topPaneOverlayPaneView.ts
│   └── util/
│       └── format.ts          # 数值格式化（价格 / 成交量 / 指标刻度 / 日期）
└── types/
    └── chart.ts               # 统一数据点类型（保留，供后端接入）
tests/
├── mock.test.ts               # mock 数据单测
├── theme.test.ts              # 主题 / 配色单测
├── candlestickWidth.test.ts   # 蜡烛宽度单测
├── periods.test.ts            # 周期配置单测（13 项清单 / value 唯一 / periodMap / getPeriodLabel，v1.4.94）
├── macd.test.ts               # MACD 计算单测
├── multipane.test.ts          # 布局常量 / 高度算法单测
├── stress.test.ts             # 数据极限压力测试（10000 条 × 全指标：完整性 / 无 NaN / O(n) 缓存语义 / 耗时上限，v1.4.93）
└── util.test.ts               # 格式化函数单测
```

## 五、组件使用手册（KLineChart）

### 5.1 快速开始

```html
<KLineChart
  symbol="300750"
  name="宁德时代"
  :time-axis="true"
  :left-scale="false"
  :right-scale="false"
  theme="dark"
  main-indicator="ma"
  sub-indicator="macd"
  :data-count="120"
  :period-whitelist="['day', 'week', 'month']"
  @period-change="onPeriodChange"
/>
```

父组件只需维护状态并传 Props（单向数据流）；放大 / 缩小 / 左移 / 右移等瞬时
动作经 `ref` 直接调用控制器。

### 5.2 Props 一览

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `symbol` | `string` | `''` | 股票代码（pane0 信息行：名称 [代码]） |
| `name` | `string` | `''` | 股票名称（pane0 信息行：名称 [代码]） |
| `timeAxis` | `boolean` | `true` | 时间轴显隐（重算 pane 高度） |
| `leftScale` | `boolean` | `false` | 左刻度区显隐（统一宽度 72px，切换后 fitContent） |
| `rightScale` | `boolean` | `false` | 右刻度区显隐（同左） |
| `theme` | `string` | `'dark'` | 风格：`'dark'` 深系 / `'light'` 浅系 |
| `mainIndicator` | `string` | `''` | 主图指标：`MA / EXPMA / BOLL / SAR / BBI`（`''` = 关，互斥） |
| `subIndicator` | `string` | `''` | 附图指标：`RSI / KDJ / MACD / WR / DMI / BIAS / OBV / CCI / ROC / CR`（`''` = 关指标层，互斥） |
| `dataCount` | `number` | `120` | 内置演示数据条数（极限压测可传 10000） |
| `periodWhitelist` | `PeriodValue[] \| string` | `''` | 周期白名单：数组或逗号分隔字符串；有值时组件内渲染白名单周期按钮并 emit `period-change` |

### 5.3 事件

| 事件 | 参数 | 触发时机 |
|---|---|---|
| `period-change` | `value: PeriodValue` | 点击组件内白名单周期按钮（白名单外周期不渲染） |

### 5.4 控制器方法（ref 访问）

```ts
const chartRef = ref<InstanceType<typeof KLineChart> | null>(null)

// 瞬时动作
chartRef.value?.controller?.zoomIn()       // 放大（barSpacing 限幅 2~80）
chartRef.value?.controller?.zoomOut()      // 缩小
chartRef.value?.controller?.shiftLeft()    // 左移（scrollToPosition -10 根）
chartRef.value?.controller?.shiftRight()   // 右移（+10 根）

// 状态设置（Props watch 已自动调用；手动调用仅用于编程式控制）
chartRef.value?.controller?.applyTheme('light')
chartRef.value?.controller?.toggleTimeAxis(false)
chartRef.value?.controller?.setLeftScaleVisible(true)
chartRef.value?.controller?.setRightScaleVisible(true)
chartRef.value?.controller?.setMainIndicator('boll')   // MA/EXPMA/BOLL/SAR/BBI / null
chartRef.value?.controller?.setSubIndicator('kdj')     // 附图指标名 / null = 关指标层

// 生命周期（组件卸载自动调用，手动调用防重复挂载）
chartRef.value?.controller?.destroy()
```

### 5.5 周期白名单用法

```html
<!-- 字符串（逗号分隔） -->
<KLineChart period-whitelist="day,week,month" />
<!-- 数组 -->
<KLineChart :period-whitelist="['day', 'week', 'month']" />
```

白名单外的周期不渲染；App.vue 周期栏与组件内白名单栏共用同一白名单配置源。

### 5.6 数据接入

组件内置演示数据 `genMockBars(dataCount)`（`src/chart/core/mock.ts`，随机游走日K）。
接入后端数据：按统一数据点类型 `ChartDataPoint`（`src/types/chart.ts`）提供

```ts
{
  time: number          // 秒级时间戳，严格递增（库断言要求）
  tradeDate: string     // 'YYYY-MM-DD'（pane0 信息行时间显示）
  preClose: number      // 昨收
  pointType: 'kline'    // K 线类型守卫
  open: number
  high: number
  low: number
  close: number
  volume: number        // 成交量（成交量 Pane 锚点 / 均量线）
}[]
```

### 5.7 主题与配色

- 深系 / 浅系颜色全部集中在 `src/chart/core/theme.ts`（`chartThemes.dark` / `.light`）；
- 主图指标色 `mainIndicatorColors`、附图指标色 `subIndicatorColors`：深浅系共用，
  v1.4.92 起去白化（灰线 `#666666` / BOLL 中轨 `#33373E` / BBI `#607D8B`），浅系下清晰可见；
- 页面 html 背景由 App.vue 随主题同步（`pageBackground`），图表内颜色全部走主题对象。

## 六、运行

```bash
npm install        # 固定版本：lightweight-charts 5.2.1 / vue 3.5.43
npm run dev        # 开发（http://127.0.0.1:5210）
npm run test       # vitest 单测（90 项）
npm run build      # vue-tsc 类型检查 + 构建
```

注意：`node_modules` 安装后必须运行 `npm run patch`（或 `node scripts/patch-lwc-separator.js`，
幂等）—— 该脚本把 lightweight-charts dist 的分隔线高度（SeparatorConstants.SeparatorHeight）
从 1px 置为 0。若未 patch：Pane 之间会出现 1px 分隔线，且内容 Pane 高度被分隔线
挤占（指标开 6 Pane 时共 5px），导致最底部 pane5 高度偏小、**十字星竖线视觉上
"不能到 pane5 底部"**（竖线画满 pane5 canvas，但底部被残留分隔线截断）。

## 七、内存与性能

- **primitive 视图单例复用**：所有 primitive 的 `paneViews()` / `priceAxisPaneViews()` 返回构造时创建的单例视图，避免每帧 `new` 对象产生 GC 压力；
- **渲染裁剪**：成交量 / MACD 柱、SAR 圆点自绘按可见逻辑范围（`getVisibleLogicalRange`）裁剪；指标折线（`IndicatorLinePrimitive`）按 `getVisibleRange()` 裁剪可视点区间 —— 均只遍历可视元素，不遍历全量数据；
- **指标值 O(1) 现取**：pane0 / pane2 信息行按 `Map<time, value>` 现取（`mainIndicatorValueMaps` / `volumeInfoMap` / `sarValueMap`），切换指标 / 换数据时重建、清空指标时置空，无累积；
- **标签缓存**：刻度标签在 `updateAllViews`（图表更新）时重建，渲染 draw 只读取缓存集合，不重复计算；
- **生命周期**：controller `destroy()` 移除十字星监听、断开 ResizeObserver、`detachPrimitive`（SAR 圆点 / 主图指标线 / 成交量均量线）、`chart.remove()`、清除容器标记；指标关闭时 series 先 `removePane` 再置 null；primitive `detached()` 清空引用；
- **实例保护**：容器 `dataset.lwcMounted` 标记防止重复创建 chart 实例。

## 八、固定依赖版本

```json
"dependencies": {
  "lightweight-charts": "5.2.1",
  "vue": "3.5.43"
},
"devDependencies": {
  "@vitejs/plugin-vue": "6.0.9",
  "typescript": "5.9.3",
  "vite": "8.3.4",
  "vitest": "^5.0.3",
  "vue-tsc": "3.3.12"
}
```

## 九、后续规划（用户逐步提出）

- （已实现 v1.4.68）附图指标十项：RSI / KDJ / MACD / WR / DMI / BIAS / OBV / CCI / ROC / CR 互斥切换
- K 线主图指标（MA / EXPMA / BOLL / SAR / BBI）
- 分时线（1d~5d）与周期切换
- 数据服务接入（HTTP / SSE / WebSocket，`types/chart.ts` 数据点结构已预留）
