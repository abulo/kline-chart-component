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
- **十字星数据浮层 tooltip**（`CrosshairTooltip`，v1.6.35）：十字星命中（pane1/3/5）时
  跟随鼠标显示九项数据 —— 时间 / 开盘 / 收盘 / 最高 / 最低 / 涨跌 / 涨幅 / 成交量 / 成交额；
  - **时间格式与 pane0 信息行一致**（`format` 模板或按周期自动，见 §5.2 format）；
  - **涨跌 / 涨幅红涨绿跌**（theme.upColor / downColor），其余文字用主题默认色；
  - 背景 / 边框 / 文字色随深浅系（`tooltipBackground` / `tooltipText` / `paneBorder`）；
  - **进入方向定位（v1.6.43 修正）**：鼠标从图表左半区进入 → 浮层固定
    **pane1**（K 线主图）**右上角**；从右半区进入 → 固定 pane1 **左上角**
    （不再跟随鼠标、不随命中 pane 变化）；
  - **可移动 / 可拖动区域（v1.6.58）**：默认角落定位与拖动边界均限定在
    **pane1~pane5 数据区**（`TooltipBounds` 每次命中注入）：X 方向扣除左 / 右刻度区宽
    （左右刻度开关打开时浮层不越界到刻度区），Y 方向 pane1 顶部 → pane5 底部；
  - **拖动与选中（v1.6.53 按下即拖 / v1.6.59 性能）**：**只要鼠标在 tooltip 任何位置按下即可
    拖动**（无 ≡ 手柄图标，grab 光标）——按下后位移 ≥ 4px 即拖动浮层（拖动期间
    userSelect:none），松开后位置固定直到鼠标离开图表，再次进入重新角落定位；
    **无位移 = 点击**（单击放光标 / **双击选词 / 三击选行**仍可用，与拖动互不
    冲突）；拖动 clamp 抽为纯函数 `clampTooltipPosition`（可单测），拖动期间缓存
    容器坐标原点（不每帧 getBoundingClientRect 强制 reflow）；
  - **文字可选中（v1.6.48 修复根因）**：浮层主体可自由选中 / 复制文字；浮层固定角落，
  - **可选中根因修复（v1.6.48）**：浮层挂 body（图表 DOM 外），鼠标移入浮层时
    lightweight-charts 会向图表容器派发 mouseleave → 清除十字星 → crosshairMove(null)
    → 未命中分支隐藏浮层（文字无法选中）。修复：浮层记录悬停态（mouseenter /
    mouseleave → `isHovered`），`applyCrosshairMove` 未命中分支在鼠标仍悬停于
    浮层上时跳过 hide / 时间回退 / 指示值清除，选区可正常进行（CDP 实测：
    移入浮层保持显示、按下拖动选出文本、松开后选区持续）；
    无拖动功能（v1.6.42 已移除拖动手柄）；鼠标离开图表再进入 → 按新进入方向重新定位；
  - **挂载与防闪（v1.6.40）**：浮层挂 document.body（position: fixed），脱离图表
    DOM 树；显示后仅更新文本、不重定位 / 不强制 reflow（幂等显示，无高频闪现）；
  - 性能：预建九行固定节点（仅 textContent 更新，无 innerHTML）、十字星事件 rAF 节流
    已复用（每帧至多一次 DOM 更新）、命中取数走 time→bar 索引 O(1)（实时增量维护）；
  - 定位算法抽为纯函数 resolveTooltipPosition（单测覆盖：角落定位 / 拖动固定 / 越界 clamp）；
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
│   └── KLineChart.vue         # 图表组件（props: symbol / name / timeAxis / leftScale / rightScale / theme / mainIndicator / subIndicator / period / service；周期由父组件全量控制并 emit period-change，v1.5.7）
├── chart/                     # 按功能分组的图表源码
│   ├── periods.ts            # 周期配置（PERIODS 13 项：分时 1~5 日 + 日/周/月 K + 60~1 分 K；periodMap O(1) 查询 + getPeriodLabel，v1.4.94）
│   ├── core/                  # 核心：控制器 / 布局 / 主题 / mock / 蜡烛宽度
│   │   ├── KLineChartController.ts # 控制器（v1.7.1 拆分版，<1000 行）：数据 / 生命周期 / 对外 API，Pane 构建与分时计算等职责委托给下方模块
│   │   ├── indicatorManager.ts # 指标管理器（主图五指标 + 成交量均量线 + pane0/pane2 信息行；setMainIndicator / setSubIndicator 转发附图指标层）
│   │   ├── subIndicatorPaneManager.ts # 附图指标 Pane 管理器（pane4 指标信息行 + pane5 指标图：创建/销毁/数据/信息行/主题；v1.4.89 拆分）
│   │   ├── crosshairManager.ts # 十字星管理器（十字星移动联动 + overlayTime + 左刻度指示值注册表）
│   │   ├── timeshareManager.ts # 分时计算管理器（v1.7.1 拆分：isTimeshare / preClose / 对称半幅 / 等差刻度 / 三态着色 / 固定价格范围）
│   │   ├── paneFactory.ts      # Pane 构建工厂（v1.7.1 拆分：pane0~pane3 全部 series / primitive 创建装配）
│   │   ├── paneLayout.ts       # Pane 高度分配工具（v1.7.1 拆分：固定空 Pane 等高等分 + 组比例；paneTop 累加定位）
│   │   ├── viewport.ts         # 视口 / 刻度 / 配色工具（v1.7.1 拆分：缩放平移 / 刻度区显隐 / K 线换色 / 调试对象）
│   │   ├── constants.ts        # 共享常量（LIBRARY_TIME_AXIS_HEIGHT / PRICE_SCALE_MIN_WIDTH / VIEW_SHIFT_STEP）
│   │   ├── types.ts            # 核心公共类型（KLineChartOptions / IndicatorLineSpec；主图/附图指标类型见 indicator/types.ts）
│   │   ├── indicatorMeta.ts    # 附图指标线名元信息（subIndicatorLabels）
│   │   ├── layout.ts          # 布局常量与高度计算（60/20/20 ⇄ 80/20）
│   │   ├── theme.ts           # 深系 / 浅系主题（所有颜色集中）+ 主图 / 附图指标配色
│   │   ├── resolveBarColors.ts# K 线逐根三态配色（close vs preClose 红 / 绿 / 平盘）
│   │   ├── mergeBars.ts        # 新旧数据合并（实时推送 / 分页衔接去重）
│   │   ├── mock.ts            # mock 数据（日 K，纯函数可单测）
│   │   └── candlestickWidth.ts# 蜡烛 / 柱体宽度（库原版 optimalCandlestickWidth）
│   ├── axis/                  # 左刻度标签（与栅格横线对齐，文字与指示值一致）
│   │   ├── axisLabelPrimitive.ts
│   │   ├── axisLabelView.ts
│   │   └── axisLabelPaneView.ts  # 自绘渲染 + 公共 drawAxisLabel（指示值共用）
│   ├── crosshair/             # 十字星左刻度指示值 + 竖线底部补齐 + 数据浮层 tooltip
│   │   ├── crosshairAxisLabelPrimitive.ts
│   │   ├── crosshairAxisLabelPaneView.ts
│   │   ├── crosshairTooltip.ts   # 十字星数据浮层（九项数据跟随鼠标，v1.6.35）
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
│   │   ├── index.ts           # 统一出口（主图 calcMA/EXPMA/BOLL/SAR/BBI + 附图 calcSubIndicator 按名单算，v1.7.0）
│   │   ├── types.ts           # 公共类型（IndicatorLine / K / MainIndicators / SarPoint；
│   │   │                       #   主图 MainIndicatorType + 附图 SubIndicatorType 类型枚举）
│   │   ├── options.ts         # 主图/附图指标按钮配置（mainIndicatorOptions / subIndicatorOptions，自 App.vue 迁入）
│   │   ├── utils.ts           # 共享工具（tdxSMA / ema / runningMax / toLines）
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
  :period="'day'"
  format="YYYY-MM-DD"
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
| `period` | `PeriodValue` | `'day'` | 当前周期（外部可控；变化时经 service 重新拉取该周期数据） |
| `service` | `ChartDataService` | `MockChartDataService` 单例 | 数据服务实现（接入真实行情传 `HttpChartDataService` 实例，组件零改动） |
| `data` | `ChartDataPoint[]` | `undefined` | 外部自定义数据（提供时优先渲染 data，跳过 service 拉取 / 分页 / 实时，v1.6.28） |
| `format` | `string` | `''` | 时间格式模板（如 `'YYYY-MM-DD'` / `'YYYY-MM-DD HH:mm'`）；缺省按周期自动（v1.6.9） |

> 已移除参数：`dataCount / total / size / pageSize`（每页条数，v1.6.27 改由 `new MockChartDataService({ fetchLimit })` 注入）、`periodWhitelist`（周期白名单，v1.6.34 删除，周期栏由父组件全量控制）。

### 5.3 事件

| 事件 | 参数 | 触发时机 |
|---|---|---|
| `period-change` | `value: PeriodValue` | 周期变化时触发（App 周期栏点击 / 内部切换） |
| `status-change` | `status: ChartLoadStatus` | 加载状态变化：`'loading'`（首载）/ `'loading-older'`（左滑分页）/ `'ready'` / `'error'`（v1.6.18） |

### 5.4 控制器方法（ref 访问）

```ts
const chartRef = ref<InstanceType<typeof KLineChart> | null>(null)

// 瞬时动作
chartRef.value?.controller?.zoomIn()       // 放大（barSpacing 限幅 2~80）
chartRef.value?.controller?.zoomOut()      // 缩小
chartRef.value?.controller?.shiftLeft()    // 左移（逻辑范围平移一屏宽，到最左自然停）
chartRef.value?.controller?.shiftRight()   // 右移（逻辑范围平移一屏宽，到最右自然停）

// 数据与标的（v1.6.17+：数据流收进控制器）
chartRef.value?.controller?.init()                    // 拉历史 + 重绘 + 订阅实时（组件自动调用）
chartRef.value?.controller?.setSymbol('600519')       // 更新股票代码（pane0 显示 + 后续 init 生效）
chartRef.value?.controller?.setName('贵州茅台')        // 更新股票名称
chartRef.value?.controller?.setService(mockService)   // 更新数据服务实例（后续 init 生效）
chartRef.value?.controller?.setPeriod('day')          // 更新周期（pane0 时间格式随之切换）

// 状态设置（Props watch 已自动调用；手动调用仅用于编程式控制）
chartRef.value?.controller?.applyTheme('light')
chartRef.value?.controller?.toggleTimeAxis(false)
chartRef.value?.controller?.setLeftScaleVisible(true)
chartRef.value?.controller?.setRightScaleVisible(true)
chartRef.value?.controller?.setMainIndicator('boll')   // MA/EXPMA/BOLL/SAR/BBI / null
chartRef.value?.controller?.setSubIndicator('kdj')     // 附图指标名 / null = 关指标层

// 生命周期（组件卸载自动调用，手动调用防重复挂载）
chartRef.value?.controller?.destroy()

// 加载状态（组件内部 ref；ref 访问当前值）
chartRef.value?.loadStatus  // 'idle' | 'loading' | 'loading-older' | 'ready' | 'error'
```

### 5.5 数据接入（src/services 集成）

组件数据层统一走 `ChartDataService` 接口（`src/services/chartDataService.ts`）：
历史分页 `fetchHistory` + 实时订阅 `subscribeRealtime`，组件 / 控制器零依赖具体实现。
v1.7.1 拆分：纯数据生成层（日 K 池 / 分时形态 / 分钟聚合 / 周月聚合）抽至
`src/services/mockDataGenerator.ts`（35 个顶层导出，可单测），服务层只保留编排与缓存。

- **默认**：`MockChartDataService` 单例（内置约 3 年日 K 池 + 分时 / 分钟 K / 周 / 月聚合 +
  模拟实时推送；同 symbol 同周期缓存复用，内存友好）。
  每页拉取条数（v1.6.27）为**服务实例级必填配置**：
  `new MockChartDataService({ fetchLimit: 200 })` 或
  `new HttpChartDataService({ historyUrl: '/api/kline/history', fetchLimit: 200 })`
  （无全局常量）；
  controller 的 init / 左滑分页均使用 `service.fetchLimit`，`hasMoreHistory`
  满页判断随之生效。
  分钟 K（60/30/15/5/1 分）为**真实化模拟**：布朗桥锚定日 K 开/收（跨周期价格自洽、
  无跳空）、按真实交易时段聚合（60 分 4 段 / 30 分 8 段 / 15 分 16 段 / 5 分 48 段 /
  1 分 241 段，段首 09:30/10:30/13:00…），成交量 U 型分布（开收盘放量）；
- **自定义数据直通（v1.6.28）**：无 mock / http 环境时，父组件直接传 `data`（
  `ChartDataPoint[]`，K 线结构同 fetchHistory 返回）：组件构造时经 `initialBars`
  注入渲染，**跳过 service 拉取 / 左滑分页 / 实时订阅**；`data` 变化时 watch 自动
  `setKlineData` 重绘。`data` 与 `service` 同时存在时 `data` 优先。
- **接入真实行情**：父组件传 `HttpChartDataService` 实例（`src/services/httpChartDataService.ts`，
  HTTP 历史 + WS / SSE / Poll 三种实时模式 + LRU 历史缓存）：

```html
<KLineChart
  symbol="300750"
  name="宁德时代"
  :period="activePeriod"
  :service="new HttpChartDataService({
    historyUrl: 'http://10.0.0.8:8080/api/v2/kline_list', // 必填完整地址（v1.6.30）
    wsUrl: 'wss://...',
  })"
  @period-change="onPeriodChange"
/>
```
历史 / 实时接口地址**全部显式配置**（v1.6.30，无基址派生）：`historyUrl`（历史，
**必填**完整地址）、`wsUrl` / `sseUrl` / `pollUrl`（实时三种模式，使用时必填完整
地址；缺省对应模式不启用并 warn）；自带 query 的完整地址以 `&` 追加参数。

SSE 实时（v1.6.31）基于 **`@microsoft/fetch-event-source`**（fetch 流式读取）：可携带
自定义 `headers` / `cookies`（与 HTTP 请求一致注入），断线自动 3s 重连；HTTP 401/403
鉴权失败时中止订阅避免死循环。WebSocket 仍受浏览器限制无法注入自定义头，鉴权依赖
自定义头时请改用 `'sse'` 或 `'poll'`。

后端接口约定：`GET {historyUrl}?symbol=&period=&before=&limit=` 返回（historyUrl 必填）
`{ code: 200, data: ChartDataPoint[] }`（time 升序、返回条数 < limit 表示无更早数据）；
实时推送与历史同结构，`time` 与最后一根相同 = 刷新该根、更大 = 追加新 K 线。

**数据流（v1.6.17）**：`controller.init()` 统一管理 —— 拉最新页 → `setKlineData`
重绘 + fitContent → 订阅实时；`symbol` / `period` / `service` 变化时组件更新控制器后
重新 `init()`（loadSeq 竞态丢弃过期响应）。

**平移左滑自动加载更早历史**（v1.6.17 移入控制器 `loadEarlier`）：可视范围到达最左
边缘时，控制器以当前最早一根 time 为 `before` 锚点拉取更早一页，经 `prependHistory`
前置插入（去重 / 升序 + 视口保持原数据位置）；返回不足 limit 或合并新增 0 时停止触发。

数据点类型 `ChartDataPoint`（`src/types/chart.ts`，K 线）：

```ts
{
  time: number          // 秒级时间戳，严格递增（库断言要求）
  tradeDate: string     // 'YYYY-MM-DD'（pane0 信息行时间显示）
  preClose: number      // 昨收
  pointType: 'kline'    // K 线类型守卫（分时点 'timeshare' 暂不渲染）
  open: number
  high: number
  low: number
  close: number
  volume: number        // 成交量（成交量 Pane 锚点 / 均量线）
}[]
```

### 5.6 主题与配色

- 深系 / 浅系颜色全部集中在 `src/chart/core/theme.ts`（`chartThemes.dark` / `.light`）；
- 主图指标色 `mainIndicatorColors`、附图指标色 `subIndicatorColors`：深浅系共用，
  v1.4.92 起去白化（灰线 `#666666` / BOLL 中轨 `#33373E` / BBI `#607D8B`），浅系下清晰可见；
- 页面 html 背景由 App.vue 随主题同步（`pageBackground`），图表内颜色全部走主题对象。

### 5.7 分时图（1d~5d，v1.7.0）

分时周期（`1d` ~ `5d`）与 K 线周期共用同一组件与布局，渲染 / 交互差异如下：

- **数据格式**：`pointType='timeshare'` 点 —— `time`（秒级时间戳，严格递增）/ `tradeDate`（'YYYY-MM-DD'）/ `preClose`（昨收）/ `price`（当前价）/ `avgPrice`（均价）/ `volume`（成交量）；
- **mock 条数（情绪形态，v1.7.0）**：按"形态序列 × symbol 偏移"为每日分配分时形态（确定性覆盖 8 种）：半日（09:31~11:30 共 **120 条**）/ 厂字板（一字涨停开盘→开板回落→尾盘回封）/ 一字板涨停 / 一字板跌停 / 天地天（涨停→跌停→涨停）/ 地天地（跌停→涨停→跌停）/ 连板涨（高开→尾盘封涨停）/ 连板跌（高开→尾盘封跌停）；最新日完整 241 条 / 久远日 240 条（缺首分钟）；`fetchHistory` 按交易日分组取最近 N 日（`timesharePatternPath` 纯函数可单测）；
- **pane1 分时双线**：`LineSeries` 价格线 + 均价线（深系 #FFFFFF / #F4AA0A，浅系 #33373E / #B8860B，`theme.timesharePriceColor` / `timeshareAvgColor`）；K 线周期双线清空不可见；
- **无主图指标**：分时下主图指标栏隐藏（MA/EXPMA/BOLL/SAR/BBI 基于 OHLC，分时点无 OHLC）；
- **成交量 pane3**：K 线周期为自绘红绿柱体 + VOL MA5/MA10 均量线；分时周期为自绘 **1px 细柱**且 **去掉均量线**（`rebuildVolumeData` 分时守卫，pane2 信息行仅显示成交量，v1.7.0）；**分时量柱红绿规则**：交易日首根对比昨收 preClose，其余对比上一分钟价（> 红 / < 绿 / = 平盘色，`resolveTimeshareVolumeColor` 纯函数）；
- **MACD pane5**：K 线周期为 `MacdBarPrimitive` 自绘红绿柱（柱宽与 K 线一致，正值空心红柱）；分时周期同为自绘但 **柱宽固定 1px 的实心细线**（`getIsTimeshare` 注入：正值实心红线 / 负值实心绿线，不做空心）；
- **附图指标**：分时下无 CR（`TIMESHARE_DISABLED_SUB_INDICATORS`，App 按钮过滤）；其余指标按价格序列计算（数据源换算 K 口径 `close = price`）；
- **栅格竖线份数**：`timeshareGridVerticalCount` —— 1d=4 / 2d=2 / 3d=3 / 4d=4 / 5d=5（`getVerticalCount` 动态取数，K 线恒 4）；
- **交互**：分时下平移 / 缩放按钮隐藏，且 **图表平移交互整体禁用**（滚轮 / 按住拖拽 / 触摸，`setPeriod` 动态切换 `handleScroll`，缩放仍由工具栏按钮控制）；`hasMoreHistory=false`（分时数据完整，不触发左滑翻页）；pane0 / tooltip / 时间轴指示值时间格式 **YYYY-MM-DD HH:mm**（`formatAxisTime` 分时分支，v1.7.0 由 HH:mm 调整，跨多交易日分时区分日期）；**时间轴刻度标签**（`tickMarkFormatter`）：K 线状态 **YYYY-MM-DD** / 分时状态 **HH:mm**（不随 format 参数变化）；
- **pane0 信息行（分时）**：追加 价格 / **均价** / 涨跌 / 涨幅 / 成交量 / 成交额（价格 / 涨跌 / 涨幅 **数字**按 vs 昨收红涨绿跌平盘着色、label 用文字色；**均价数字 = 均价线同色**（timeshareAvgColor）；量额不着色，`buildInfoSegments` 分时分支 + `barTimeMap` O(1) 现取）；
- **tooltip**：分时点显示 时间 / 价格（着色）/ **均价（均价线同色）** / 涨跌 / 涨幅 / 成交量 / 成交额（七行，涨跌基准 = 昨收）；
- **文件**：`src/chart/periods.ts`（`isTimesharePeriod` / `timeshareGridVerticalCount` / `timeshareVerticalCount`）、`src/chart/core/kLineChartController.ts`（分时双线分支）、`src/chart/core/subIndicatorPaneManager.ts`（分时指标适配）、`src/services/chartDataService.ts`（分时 mock：`timesharePatternPath` 8 形态 + `buildTsPool` 按日分配）。

#### 5.7.1 分时 pane1 左右刻度（v1.7.1）

- **值域**：区间对称扩展（用户定版 `symmetricExpandRange`）——半幅 `expandDistance = max(上偏, 下偏)`，范围 `[preClose−half, preClose+half]`，**中间值恒为首根 bar 的 preClose**（1d~5d 统一，`getTimesharePreClose`）；刻度值按 `buildTimeshareScaleValues` 生成严格等差序列（首尾 = newMax / newMin，中间 = preClose，指标开 6 等分 / 关 8 等分）；
- **0 margins**：分时下 pane1 左 / 右刻度 `scaleMargins = { top: 0, bottom: 0 }`（对称）→ 中间横线精确在像素中间，一字板涨停价格线**紧贴 pane1 上边框**、跌停贴下边框；K 线周期恢复库默认 margins；
- **十字星指示值 = 刻度值**：对称 0 margins 保证坐标中间 ↔ 像素中间严格对齐，十字星放中间横线指示值 = preClose（刻度中间值），上下逐格一一对应（修复：库默认不对称 margins 下同一 y 显示 9.43 而非 10）；
- **右刻度**：百分比 = `(左刻度显示值 − preClose) / preClose × 100%`（序列值先按左刻度 2 位小数回算，左 12.67 → 右 +26.70%，`formatPercent` 自带 +/-）；**右刻度区十字星指示值**另挂 primitive（库按 priceScaleId 过滤，左轴指示值不画右刻度区），反算用 left 固定范围、背景 / 文字色 / 字体照搬左刻度指示值、左对齐贴区左缘，仅分时渲染；
- **着色**：左刻度价格 / 右刻度百分比 vs preClose 三态（> 红 / < 绿 / = 平盘深系白 / 浅系黑，`getScaleValueColor` + `resolveVsBaseColor`）；
- **调试**：`window.__klineChart`（仅开发）实时查看 `bars` / `preClose` / `timeshareHalf` / `scaleValues` / `horizontalCount` / `getMaxMin()`。

## 六、运行

```bash
npm install        # 固定版本：lightweight-charts 5.2.1 / vue 3.5.43
npm run dev        # 开发（http://127.0.0.1:5210）
npm run test       # vitest 单测（202 项，21 files；含拆分模块 splitModules.test.ts）
npm run build      # vue-tsc 类型检查 + 构建
```

注意：`node_modules` 安装后必须运行 `npm run patch`（或 `node scripts/patch-lwc-separator.js`，
幂等）—— 该脚本把 lightweight-charts dist 的分隔线高度（SeparatorConstants.SeparatorHeight）
从 1px 置为 0。若未 patch：Pane 之间会出现 1px 分隔线，且内容 Pane 高度被分隔线
挤占（指标开 6 Pane 时共 5px），导致最底部 pane5 高度偏小、**十字星竖线视觉上
"不能到 pane5 底部"**（竖线画满 pane5 canvas，但底部被残留分隔线截断）。

## 七、内存与性能

- **十字星事件 rAF 节流（v1.5.9）**：拖拽平移 / 快速 mousemove 时库 crosshairMove
  可能高频触发，控制器将同帧多次事件合并为一次处理（每帧至多一次重绘）；
  `setCrosshairY` 同值跳过，无变化的移动不再触发 fullUpdate。

- **函数风格约定（v1.6.24）**：全库统一箭头函数 —— 顶层 / 对象方法已全为箭头；
  类方法一律使用箭头函数字段（`method = (): T => {}`，this 绑实例、被库回调调用
  不丢 this）；`constructor` / `get` / `set` 存取器按语法要求保留方法形式。
  构造函数中不调用类方法，字段引用均在惰性箭头体内，无初始化顺序风险。
- 所有自绘 primitive（柱体 / 指标线 / SAR 点 / 最高最低价标注 / 栅格 / 十字星竖线）
  均按**可视逻辑范围裁剪**，长数据（10000 条）下每帧仅绘制可视 ~120 根，
  平移 / 缩放不会因数据总量线性变慢。

## 七、内存与性能

- **primitive 视图单例复用**：所有 primitive 的 `paneViews()` / `priceAxisPaneViews()` 返回构造时创建的单例视图，避免每帧 `new` 对象产生 GC 压力；
- **渲染裁剪**：成交量 / MACD 柱、SAR 圆点自绘按可见逻辑范围（`getVisibleLogicalRange`）裁剪；指标折线（`IndicatorLinePrimitive`）按 `getVisibleRange()` 裁剪可视点区间 —— 均只遍历可视元素，不遍历全量数据；
- **指标值 O(1) 现取**：pane0 / pane2 信息行按 `Map<time, value>` 现取（`mainIndicatorValueMaps` / `volumeInfoMap` / `sarValueMap`），切换指标 / 换数据时重建、清空指标时置空，无累积；
- **标签缓存**：刻度标签在 `updateAllViews`（图表更新）时重建，渲染 draw 只读取缓存集合，不重复计算；
- **生命周期**：controller `destroy()` 移除十字星监听、断开 ResizeObserver、`detachPrimitive`（SAR 圆点 / 主图指标线 / 成交量均量线）、`chart.remove()`、清除容器标记；指标关闭时 series 先 `removePane` 再置 null；primitive `detached()` 清空引用；
- **实例保护**：容器 `dataset.lwcMounted` 标记防止重复创建 chart 实例。
