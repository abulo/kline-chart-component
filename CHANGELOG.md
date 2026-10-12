# 版本记录（CHANGELOG）

版本号遵循语义化版本（Semantic Versioning）：`主版本号.次版本号.修订号`

- **主版本号（MAJOR）**：不兼容的重构 / 架构变更；
- **次版本号（MINOR）**：向后兼容的功能新增；
- **修订号（PATCH）**：向后兼容的缺陷修复。

---

## v1.4.0（2026-10-12）

新增**顶部空 Pane**（pane0），K 线主图下移至 pane1。

### 变更（KLineChartController.ts）
- 顶部空 Pane（pane0）：无数据，仅通过 `ISeriesPrimitive` 自绘"测试"文字；
- 文字规格：垂直居中、距左 **6px**、颜色跟随主题 `textColor`（深/浅系自动适配）；
- 高度：固定 **24px**（`TOP_PANE_HEIGHT`），Pane 高度不可拖拽
  （`layout.panes.enableResize: false`）；
- 高度算法：`calcFixedTopFactor(totalHeight, topHeight)`（导出纯函数可单测），
  使 pane0 stretchFactor = 24 / (可用高度 - 24)，K 线 pane factor = 1；
- 重新引入 `ResizeObserver` 与 `_timeAxisVisible` 状态：容器尺寸 / 时间轴开关
  变化时重算 pane0 高度（时间轴高度按 v5 固定值 `TIME_AXIS_HEIGHT = 28` 扣除）。

### 测试与验证
- vitest 17 项全绿（新增 calcFixedTopFactor 3 项、PANE_COUNT=2、TOP_PANE_HEIGHT）；
- vue-tsc 类型检查通过；
- 未生成运行截图（按用户偏好仅做代码级验证）。

---

## v1.3.0（2026-10-12）

K 线颜色风格调整：**红涨绿跌 + 上涨柱体空心**。

### 变更（KLineChartController.ts）
- 上涨（up）柱体：填充色改为图表背景色（视觉空心），红色边框 + 红色影线；
- 下跌（down）柱体：绿色实心（填充 / 边框 / 影线均绿）；
- 主题切换时上涨柱体填充色跟随新主题背景色，空心效果在深系 / 浅系下均正确。

### 测试与验证
- vitest 13 项全绿；
- vue-tsc 类型检查通过；
- 实拍截图：深系 / 浅系（可见红色空心柱体 + 绿色实心柱体）。

---

## v1.2.1（2026-10-12）

单 Pane K 线版本（v1.2.0）的**未使用参数清理**，无行为变更。

### 清理（KLineChartController.ts）
- 删除 `KLineChartOptions.symbol` 与 `_symbol` 字段（存入后从未读取）；
- 删除 `_resizeObserver` 空监听（autoSize 已由库处理，无实际功能）；
- 删除 `layout.panes` 配置（单 Pane 无 pane 分隔线，参数无渲染效果）；
- 删除 `crosshair.mode`（0 为库默认值）与 `timeScale.timeVisible/secondsVisible`
  （false 为库默认值），保留有实际效果的 `timeScale.borderVisible: false`；
- 删除无调用者的 getter（`chart` / `theme` / `timeAxisVisible`）与
  `_timeAxisVisible` 冗余状态，`toggleTimeAxis` 直接应用库选项。

### 清理（theme.ts / mock.ts）
- 删除 `CHART_FONT`（未使用，保留 `CHART_FONT_FAMILY`）；
- 删除 `separatorColor`（单 Pane 无分隔线 + 栅格关闭，无渲染效果）；
- 删除 `BasicBar.volume` 字段与生成逻辑（单 Pane 不渲染成交量；
  统一数据模型的 volume 保留在 `types/chart.ts`）。

### 测试与验证
- vitest 13 项全绿（mock / theme / multipane，新增 separatorColor 清理断言）；
- vue-tsc 类型检查通过；
- 实拍截图：深系 / 浅系 / 时间轴开关。

---

## v1.2.0（2026-10-12）

在 v1.1.0（2 Pane：K 线 + 成交量）基础上收敛为 **单 Pane**。

### 变更
- **仅保留 pane0 K 线主图**（Candlestick）；删除 pane1 成交量（Histogram）及其数据写入。
- 栅格化 / 左右刻度区保持关闭（v1.1.0 起生效），数据区铺满。

### 清理
- 控制器删除 `HistogramSeries` 导入、成交量 series 创建、成交量数据写入；
- `_series` 数组简化为单一 `_klineSeries` 字段。

### 测试与验证
- vitest 12 项全绿（mock / theme / multipane，PANE_COUNT=1）；
- vue-tsc 类型检查通过；
- CDP 实拍截图：深系 / 浅系 / 时间轴开关。

---

## v1.1.0（2026-10-12）

在 v1.0.0（6 Pane 骨架）基础上收敛为 **2 个 Pane**。

### 变更
- **仅保留 2 个 Pane**：pane0 K 线主图（Candlestick）+ pane1 成交量（Histogram）；
  删除 pane2~5 示例折线（Line）。
- **删除栅格化**：`grid.vertLines / horzLines` 全部隐藏（深系 / 浅系均无栅格线）。
- **删除左右刻度区**：`leftPriceScale / rightPriceScale` 全部隐藏，数据区铺满整个宽度。

### 清理
- `theme.ts` 删除 `auxLineColors`（示例线颜色）字段；
- `mock.ts` 删除 `genAuxLines`（示例折线数据）；
- 控制器删除 `SCALE_AREA_WIDTH` 常量与示例折线创建 / 写入逻辑。

### 测试与验证
- vitest 12 项全绿（mock / theme / multipane）；
- vue-tsc 类型检查通过；
- CDP 实拍截图：深系 / 浅系 / 时间轴开关。

---

## v1.0.0（2026-10-12）

首个版本。**放弃之前所有需求，全新架构重构**：多 Pane 布局（一个 chart 内 6 个
Pane），版本号从 v1.0.0 重新起算。本阶段完成"绘制 6 个 Pane"骨架。

### 架构
- **6 个 Pane（lightweight-charts 原生多 Pane）**：
  - pane0：K 线主图（Candlestick，红涨绿跌实心）；
  - pane1：成交量（Histogram，红涨绿跌柱）；
  - pane2~5：示例折线（Line，占位，后续替换为附图指标）。
- **高度均分**：6 个 Pane `stretchFactor` 均分（1:1:1:1:1:1），高度跟随父容器
  （库 autoSize 自适应，不设死值）。
- **底部共享时间轴**：所有 Pane 共用一条 timeScale。

### 全局控制（App.vue）
- 时间轴开 / 关（`timeScale.visible`）；
- 缩小 / 放大（X 轴 `barSpacing` 限幅 2~80，图表内禁滚轮 / 触摸缩放）；
- 深系 / 浅系主题切换（颜色集中在 `chart/theme.ts`）。

### 清理
- 删除旧架构全部代码：`panes/ChartOverlay.ts`、`panes/ColumnSeries.ts`、
  `layout.ts`（三层 60:20:20 / 80:20 布局）及旧测试（layout / macd）；
- 保留 `types/chart.ts`（统一数据点类型，供后续后端接入）。

### 测试与验证
- vitest 16 项全绿（mock / theme / multipane）；
- vue-tsc 类型检查通过；
- CDP 实拍截图：6 Pane 均分可见、深系 / 浅系、时间轴开关。
