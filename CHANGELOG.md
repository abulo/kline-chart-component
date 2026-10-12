# 版本记录（CHANGELOG）

版本号遵循语义化版本（Semantic Versioning）：`主版本号.次版本号.修订号`

- **主版本号（MAJOR）**：不兼容的重构 / 架构变更；
- **次版本号（MINOR）**：向后兼容的功能新增；
- **修订号（PATCH）**：向后兼容的缺陷修复。

---

## v1.4.16（2026-10-12）

`macdBarSeries` 重命名为 `indicatorsBarSeries`（指标通用柱，为后续扩展其他指标预留）。

### 变更
- controller：`macdBarSeries` → `indicatorsBarSeries`（字段 / 创建 / setData / 注释）；
  DIF / DEA 线保留 MACD 语义（具体指标专属）。

### 验证
- vue-tsc 类型检查通过；vitest 35 项全绿；未运行 / 未截图。

---

## v1.4.15（2026-10-12）

Pane 分组：main / volume / indicator = 60 : 20 : 20（时间轴开 / 关一致）。

### 变更
- 分组：pane0 + pane1 => main、pane2 + pane3 => volume、pane4 + pane5 => indicator；
- `layout.ts`：删除 `calcPaneFactors` / `volumeRatio` / `indicatorRatio`（不再使用），
  新增 `groupRatios`（main 0.6 / volume 0.2 / indicator 0.2）与 `calcPaneHeights`：
  R = 可用高度 − 3×24（空 Pane 高度已扣除），内容 Pane 按组比例分配
  （pane1 = 0.6R、pane3 = 0.2R、pane5 = 0.2R），空 Pane 固定 24px，
  总高度 = R + 72 = 可用高度（完全铺满）；
- controller：`applyStretchFactors` 改**像素因子方案**——stretchFactor 直接设为目标
  像素高度 → 库 totalStretch = Σ高度 = H → stretchPixels = 1，非最后 Pane
  = round(factor) 精确、最后 Pane = 剩余 = 目标，**无舍入误差**；
  时间轴开 / 关仅影响 H（关时时间轴高度 = 0），组比例不变。

### 验证
- vitest 35 项全绿（multipane 更新：内容比例 60:20:20、总和守恒、时间轴开关
  仅 H 不同比例不变、不足兜底）；
- vue-tsc 类型检查通过；未运行 / 未截图。

---

## v1.4.14（2026-10-12）

新增 pane5 指标 Pane（先实现 MACD），高度与 pane3 成交量一致。

### 变更
- 布局升级为 6 Pane：pane0 顶部空 Pane + pane1 K 线 + pane2 底部空 Pane +
  pane3 成交量 + pane4 底部空 Pane + **pane5 指标**；
- `layout.ts`：`paneCount = 6`，新增 `indicatorRatio = 0.25`（与成交量一致）；
  `calcPaneFactors` 按 `S = (total - 3×24) / (1 + 0.25 + 0.25)` 计算，
  返回 `indicatorFactor`；
- 新增 `src/chart/indicators/macd.ts`：MACD 纯计算（东方财富算法）——
  `EMA(close,12)` / `EMA(close,26)` → DIF，`EMA(DIF,9)` → DEA，
  `MACD = 2×(DIF-DEA)`；
- controller：pane5 创建 MACD（`Histogram` 红绿柱 base:0 + `Line` DIF/DEA），
  `applyData` 计算并写入；配色固定（DIF `#A0A0A0`、DEA `#F4AA0A`、
  柱 > 0 红 `#FF0000`、< 0 绿 `#008000`，深浅系通用）；
- pane0 / pane2 / pane4 仍同一 fixedFactor，绝对相等（非最后 Pane = round(fixed)）；
  pane5 为库最后 Pane，吸收舍入，与 pane3 偏差 ≤ 2px（库机制，不可配置）。

### 验证
- vitest 36 项全绿（新增 macd.test.ts 9 项：EMA 手算逐项一致 / 首值 = 0 /
  MACD = 2×(DIF-DEA) / 单调序列 DIF > 0；multipane 更新 6 Pane 模拟，
  断言固定 Pane 恒 24、pane3 与 pane5 偏差 ≤ 2px、高度守恒）；
- vue-tsc 类型检查通过；未运行 / 未截图。

---

## v1.4.13（2026-10-12）

新增 pane4（在 pane3 之后），设置与 pane0 完全一致（"测试"文字、24px、不可拖拽）。

### 变更
- 布局升级为 5 Pane：pane0 顶部空 Pane + pane1 K 线 + pane2 底部空 Pane +
  pane3 成交量 + pane4 底部空 Pane；
- `layout.ts`：`paneCount = 5`，新增 `fixedPaneCount = 3`；`calcPaneFactors`
  按 3 个固定空 Pane 计算：`S = (total - 3×24) / 1.25`，三者同一 `fixedFactor`；
- controller：新增 pane4（LineSeries + `TestLabelPrimitive('测试')`，index 4），
  `applyStretchFactors` 给 panes[4] 同一 fixedFactor。

### pane4 精确性证明（库最后 Pane = 剩余吸收者）
库 `_adjustSizeImpl`：最后 Pane 高度 = 剩余（吸收前面 round 误差）。
推导：`S = (total-72)/1.25 = 0.8×T`，`0.25S = 0.2×T`，记 f=frac(S)、g=frac(0.25S)，
因 `0.8T + 0.2T = T` 为整数 → `f+g ∈ {0,1}`，二者舍入误差互补 → 最后 Pane
`pane4 = ceil(24 + 0) = 24` 精确，与 pane0/pane2 **绝对相等**。

### 验证
- vitest 28 项全绿（multipane 库分配模拟覆盖 total ≡ 0..4 mod 5 全部情形，
  断言 pane0 = pane2 = pane4 = 24 恒成立 + 高度总和守恒）；
- vue-tsc 类型检查通过；未运行 / 未截图。

---

## v1.4.12（2026-10-12）

所有文件名统一为小驼峰命名（camelCase）。

### 变更
- `src/chart/`：`KLineChartController.ts → kLineChartController.ts`、
  `TestLabelPrimitive.ts → testLabelPrimitive.ts`、`TestLabelPaneView.ts → testLabelPaneView.ts`、
  `VolumeBarPrimitive.ts → volumeBarPrimitive.ts`、`VolumeBarPaneView.ts → volumeBarPaneView.ts`；
- `src/components/`：`KLineChart.vue → kLineChart.vue`；
- 全部 import 路径与注释同步更新；class 名保持 PascalCase（TS 类型惯例）；
- `git mv` 保留文件历史。

### 验证
- vue-tsc 类型检查通过；vitest 27 项全绿；未运行 / 未截图。

---

## v1.4.11（2026-10-12）

修复 pane3 成交量柱体底部**未贴合 Pane 底部**（底部留缝隙）。

### 根因
自绘 yBase 用的是 `series.priceToCoordinate(0)`。Histogram `base: 0` 的
autoScale 值域从 0 起算，`priceToCoordinate(0)` 映射到的是 **Pane 底部内边距处**
（`scaleMargins.bottom`），而非 Pane 底部 → 柱体底部留出一条内边距缝隙。

### 修复
柱体底部直接取 Pane 底部坐标 `mediaSize.height`（CSS 像素），
与价格 scale 无关，任何缩放 / 时间轴显隐下都**绝对贴底**；
柱顶仍用 `series.priceToCoordinate(volume)`（volume 在值域内，映射准确）。

### 验证
- vue-tsc 类型检查通过；vitest 27 项全绿；未运行 / 未截图。

---

## v1.4.10（2026-10-12）

修复 pane3 成交量柱体与 pane1 K 线柱体**不完全一致**（宽度偏差 1px）。

### 根因
v1.4.9 复刻的是**用户提供的插件版** `optimalCandlestickWidth`，与库源码
（`PaneRendererCandlesticks`）存在三处差异：
1. coeff 分母：插件版 `Math.PI`，库源码 `Math.PI * 0.5`（barSpacing=10 时柱宽差 1px）；
2. 库源码多 `optimal = Math.min(res, floor(barSpacing×dpr))` 上限裁剪；
3. 库渲染后还有**奇偶修正**：柱宽 ≥ 2 时与影线宽 `wickWidth = floor(dpr)` 同奇偶，
   否则 `barWidth--`（保证十字星叠加对称）——dpr=1 时偶数柱宽会再减 1px。

### 修复
- `candlestickWidth.ts` 改为**库源码原版**：coeff 分母 `Math.PI * 0.5` + min 上限 + max 兜底；
  新增 `candlestickBarWidth` = 原版 + 奇偶修正（渲染最终柱宽）；
- `VolumeBarPaneView` 使用 `candlestickBarWidth`，并按库 bitmap 取整对齐柱位：
  `left = round(center×dpr) - floor(barWidthBitmap/2)`，再转 CSS 像素
  → 柱宽 / 间隔 / 位置与 pane1 **绝对一致**。

### 验证
- vitest 27 项全绿（candlestickWidth 扩为 7 项：与库源码**逐值断言**——
  b=10/dpr=1→7、b=20/dpr=1→15、b=8/dpr=2→12 等，含奇偶修正用例）；
- vue-tsc 类型检查通过；未运行 / 未截图。

---

## v1.4.9（2026-10-12）

成交量红柱空心 + 柱宽/间隔与 pane1 绝对一致。

### 变更
- **成交量改为自绘**（新增 `VolumeBarPrimitive.ts` / `VolumeBarPaneView.ts`）：
  HistogramSeries 仅作 Y 轴（volume 值域）scale 锚点，color = 背景色（不可见），
  主题切换时随背景同步；
- **上涨空心红柱**：背景色填充 + 红色边框（同 pane1 上涨柱）；**下跌绿实心**；
- **柱宽/间隔与 pane1 绝对一致**：新增 `candlestickWidth.ts`
  （官方原版 `optimalCandlestickWidth`，库 npm 包未随附 plugins，按官方实现复刻）——
  自绘柱宽 = optimalCandlestickWidth(barSpacing, dpr)/dpr（与 pane1 Candlestick
  内部同一函数同一 barSpacing），柱中心 = 同一逻辑索引坐标 → 宽度与间隔完全对齐；
- primitive `detached` 清空引用（防内存泄漏）。

### 验证
- vitest 24 项全绿（新增 candlestickWidth 4 项：特殊区间 / 常规区间 / 兜底 / 同源一致）；
- vue-tsc 类型检查通过；未运行 / 未截图（按用户偏好）。

---

## v1.4.8（2026-10-12）

新增 pane3 成交量图（红涨绿跌参考 pane1）。

### 变更
- **布局扩为 4 Pane**：pane0（顶部空 Pane 24px）→ pane1（K 线）→ pane2（底部空
  Pane 24px）→ pane3（成交量，最底部）；
- **pane3 成交量**：`HistogramSeries`（`base: 0` 柱体紧贴 Pane 底部）；
  颜色语义与 pane1 一致——上涨（close >= open）红 `#FF0000`、下跌绿
  `#008000`（深浅系色值相同，无需随主题切换重设）；
- **高度分配**：`calcFixedEdgeFactor` → `calcPaneFactors`，
  `stretchPixels S = (H - 2×24)/(1 + 0.25)`，
  `pane0 : pane1 : pane2 : pane3 = f : 1 : f : 0.25`（`f = 24/S`）；
  数学恒等保证 `f×S = 24` → pane0 与 pane2 仍**绝对相等**，
  K 线 round 误差由最后的成交量 Pane 吸收；
- `mock.ts` 恢复 `volume` 字段（随机正整数，8000~20000）；
- 删除 `calcFixedEdgeFactor`（被 `calcPaneFactors` 取代，无残留引用）。

### 验证
- vitest 20 项全绿（布局常量 + 库分配模拟 4 Pane + 成交量数据合法性）；
- vue-tsc 类型检查通过；未运行 / 未截图（按用户偏好）。

---

## v1.4.7（2026-10-12）

修复 pane0 / pane2 高度不相等（时间轴开关均精确相等）。

### 背景
v1.4.6 删除 `timeAxisHeight` 后，因子按容器全高计算；而库 `_adjustSizeImpl`
实际可用高度 = 容器 − 时间轴默认高度(28px) − 分隔线总高(2px)，二者不匹配，
导致 pane0 ≈ 21px、pane2 ≈ 25px（差约 4px，用户实测发现）。

### 变更
- 新增控制器私有常量 `LIBRARY_TIME_AXIS_HEIGHT = 28`（**非用户参数**）：
  来自库源码 rendererOptions 合计（borderSize 1 + tickLength 5 + fontSize 12 +
  paddingTop 3 + paddingBottom 3 + labelBottomOffset 4，fontSize=12 时偶数化不变），
  仅用于布局换算；
- `applyStretchFactors` 按**库实际可用高度**计算：
  `usableHeight = clientHeight - 时间轴高（按库当前显隐状态） - 分隔线总高(panes.length-1)`；
  数学恒等：`e = fixed/(H-48)` 时 `2e+1 = H/(H-48)`、`S = H-48`、`e×S = fixed`，
  `pane2 = H - fixed - (H-2×fixed) = fixed` → pane0 与 pane2 **绝对相等**；
- `toggleTimeAxis` 切换显隐后重算 stretchFactor（时间轴开/关均精确相等）；
- 新增单测「库分配模拟：e = fixed/(H-2fixed) 时 pane0 与 pane2 高度绝对相等」
  （模拟库 round/剩余分配逻辑，覆盖时间轴开/关多种容器高度）。

### 验证
- vitest 18 项全绿（新增 1 项）；vue-tsc 类型检查通过；未运行 / 未截图。

---

## v1.4.6（2026-10-12）

移除 timeAxisHeight 参数，时间轴完全交给库默认处理。

### 变更
- `layout.ts` 删除 `timeAxisHeight` 常量（时间轴采用库系统默认高度，
  不再持有高度参数）；
- `KLineChartController.ts`：
  - `applyStretchFactors` 直接基于容器高度计算
    （`calcFixedEdgeFactor(container.clientHeight, 24)`），
    时间轴高度由库内部占位；
  - 删除 `timeAxisVisible` 状态与 `toggleTimeAxis` 中的重算逻辑
    （pane 比例与时间轴显隐无关），开关仅切换 `timeScale.visible`；
- 清理残留引用（grep 确认无 `timeAxisHeight` / `timeAxisVisible` 代码引用）。

### 验证
- vitest 17 项全绿；vue-tsc 类型检查通过；未运行 / 未截图（按用户偏好）。

---

## v1.4.5（2026-10-12）

时间轴恢复系统默认 + pane0/pane2 绝对等高 + 清理未用文件。

### 变更
- **时间轴采用系统默认设置**：删除自绘时间轴 primitive
  （`TimeAxisCenteredLabelsPrimitive.ts` 整文件移除），时间轴文字 / tick /
  高度全部恢复库默认渲染；高度计算仍按库默认时间轴高度（25px）从可用高度扣除；
- **pane0 与 pane2 高度绝对相等**：两者使用**同一个** stretchFactor
  （`calcFixedEdgeFactor`），库按相同比例分配，无任何额外偏移；
- 清理未使用引用：控制器移除 `TimeAxisCenteredLabelsPrimitive` import 与挂载代码；
  全仓库 grep 确认无 `formatTradeDate` / `calcFixedTopFactor` 残留。

### 验证
- vitest 17 项全绿；vue-tsc 类型检查通过；未运行 / 未截图（按用户偏好）。

---

## v1.4.4（2026-10-12）

时间轴文字垂直居中 + 底部空 Pane。

### 变更
- **时间轴文字垂直居中**（新增 `TimeAxisCenteredLabelsPrimitive.ts`）：
  lightweight-charts v5 时间轴文字默认中心 y≈14.5px（总高 25px，偏下约 2px，
  无公开配置项）。新增 primitive 挂载到 K 线 series，通过 `timeAxisPaneViews`
  自绘刻度文字：背景色覆盖库默认文字（保留顶部 tick 区域）、按可见逻辑范围与
  barSpacing 选择刻度（最小文字间隔 72px）、`coordinateToTime` 取时间戳格式化为
  YYYY-MM-DD、垂直居中绘制（y = 高度 / 2）；颜色 / 背景跟随主题动态取色。
- **底部空 Pane（pane2）**：设置与 pane0 完全一致（"测试"文字、24px、
  距左 6px、垂直居中、不可拖拽）；
- 高度算法升级：`calcFixedTopFactor` → `calcFixedEdgeFactor`（顶 / 底双固定
  Pane：factor = fixedHeight / (totalHeight - 2 × fixedHeight)）；
- `timeAxisHeight` 修正为 25px（v5 时间轴 cell 实际高度，按库源码常量）。

### 验证
- vitest 17 项全绿（新增 calcFixedEdgeFactor 3 项、paneCount=3）；
- vue-tsc 类型检查通过；未运行 / 未截图（按用户偏好）。

---

## v1.4.3（2026-10-12）

代码结构拆分：每个 class 独立一个文件，布局常量 / 算法独立成模块。

### 变更（src/chart/ 目录结构）
```
src/chart/
├── KLineChartController.ts   # class KLineChartController（控制器）
├── TestLabelPrimitive.ts     # class TestLabelPrimitive（空 Pane 文字 primitive）
├── TestLabelPaneView.ts      # class TestLabelPaneView（文字渲染视图）
├── layout.ts                 # 布局常量（paneCount / topPaneHeight /
│                             #   timeAxisHeight）与 calcFixedTopFactor 算法
├── theme.ts                  # 主题色配置（无 class，保留）
└── mock.ts                   # mock 数据（无 class，保留）
```
- primitive 字段改为 public readonly（text / getColor），供渲染视图跨文件访问；
- 测试 import 同步指向 layout.ts。

### 验证
- vitest 17 项全绿；vue-tsc 类型检查通过；未运行 / 未截图（按用户偏好）。

---

## v1.4.2（2026-10-12）

命名规范化：全部变量改成语义化驼峰（纯字母，无下划线 / 缩写 / 特殊符号）。

### 变更（全仓库）
- 类私有成员去掉 `_` 前缀（`_chart` → `chart`、`_container` → `container`、
  `_bars` → `bars`、`_klineSeries` → `klineSeries`、`_theme` → `theme`、
  `_timeAxisVisible` → `timeAxisVisible`、`_resizeObserver` → `resizeObserver`、
  `_applyStretchFactors` → `applyStretchFactors`、`_applyData` → `applyData`）；
- primitive 内部成员：`_source` → `source`、`_text` → `text`、`_getColor` → `getColor`；
- 缩写展开：`c0` → `initialThemeColors`、`c` → `themeColorSet`、
  `ts` → `timeScaleApi`、`bs` → `barSpacing`、`k` → `remainingHeight`、
  `total` → `availableHeight`、`b` → `bar`、`i` → `index`、`n` → `barCount`、
  `d` → `dateCursor`、`f` → `factor`；
- 常量改为驼峰：`PANE_COUNT` → `paneCount`、`TOP_PANE_HEIGHT` → `topPaneHeight`、
  `TIME_AXIS_HEIGHT` → `timeAxisHeight`、`CHART_FONT_FAMILY` → `chartFontFamily`、
  `DEFAULT_THEME` → `defaultTheme`（导出引用同步更新：控制器 / 测试）。

### 验证
- vitest 17 项全绿；vue-tsc 类型检查通过；未运行 / 未截图（按用户偏好）。

---

## v1.4.1（2026-10-12）

缺陷修复：Pane 分割线不可见 + 十字星跟随鼠标。

### 变更（KLineChartController.ts）
- **Pane 分割线**：`layout.panes.separatorColor / separatorHoverColor`
  设置为当前主题背景色（视觉上 pane 之间无分割线），主题切换时同步跟随；
- **十字星**：`crosshair.mode = CrosshairMode.Normal`，横向 / 竖向十字线
  自由跟随鼠标位置（不再吸附数据点）。

### 验证
- vitest 17 项全绿；vue-tsc 类型检查通过；未运行 / 未截图（按用户偏好）。

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
