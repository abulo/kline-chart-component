# 版本记录（CHANGELOG）

版本号遵循语义化版本（Semantic Versioning）：`主版本号.次版本号.修订号`

- **主版本号（MAJOR）**：不兼容的重构 / 架构变更；
- **次版本号（MINOR）**：向后兼容的功能新增；
- **修订号（PATCH）**：向后兼容的缺陷修复。

---

## v1.4.52（2026-10-13）

KLineChart.vue 新增 `symbol` / `name` 参数，pane0 顶部信息行显示"股票名称 [代码]"。

### 变更
- KLineChart.vue：`withDefaults(defineProps)` 新增 `symbol?` / `name?`（默认空串），
  透传给 KLineChartController；
- controller：KLineChartOptions 新增 `name?` / `symbol?`；pane0 顶层遮罩文字由
  固定"测试"改为 `名称 [代码]`（symbol 为空时仅显示 name，两者都空回退"测试"）；
- App.vue：示例传 `symbol="300750" name="宁德时代"`；
- 验证：vitest 57 项全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.51（2026-10-13）

App.vue 工具栏新增"左移 / 右移"按钮（X 轴平移）。

### 变更
- controller 新增 `shiftLeft` / `shiftRight`：基于 lightweight-charts 5.2.1
  `scrollToPosition(position, animated)` 平移（position = 距最新 bar 的 bar 数，
  ±10 根/次；右移时库内部自动钳制到边界）；
- App.vue 工具栏在"缩小 / 放大"前插入"左移 / 右移"按钮；
- 验证：vitest 57 项全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.50（2026-10-13）

最高价 / 最低价标注与十字星标签背景：浅系配色优化（白底可读性）。

### 变更
- theme.ts 浅系调整（深系不变）：
  - `crosshairLabelBackground`：#E9EBEF → **#F0F2F5**（极浅灰，柔和衬托）；
  - `highMarkerColor`：#CC8800 → **#B8860B**（深金黄，主流软件同款）；
  - `lowMarkerColor`：#1E4FE0 → **#2452CC**（深蓝，白底对比更稳）。
- 深系保持：#2A2E39 / #F4AA0A / #2962FF。
- 测试：theme.test.ts 色值断言同步更新，57 项全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.49（2026-10-13）

修复：最高价 / 最低价标注**同时显示**（此前最低价被丢弃）。

### 变更
- 问题根因：v1.4.48 的 `findExtremeBar` 返回单个标注且最高价优先 —— 最高价与
  最低价不同根时，最低价不显示。
- 修复：改为 `findExtremeBars`（纯函数，返回 `{ high, low }` 两个极值，互不
  抢占，同根也各自返回）；渲染时分别绘制：最高价黄色标注在柱顶上方 +
  黄色实线连接柱体上边缘中间，最低价蓝色标注在柱底下方 + 蓝色实线连接
  柱体下边缘中间。
- 测试：tests/highLow.test.ts 改为断言 `findExtremeBars`（同时返回两值 /
  子区间 / 空区间 / 无效索引容错），57 项全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.48（2026-10-13）

pane1 主图标注**可视区域内**最高价 / 最低价（带同色实线连接柱体）。

### 变更
- 新增 `src/chart/highLow/highLowMarkerPrimitive.ts` + `highLowMarkerPaneView.ts`
  （每个 class 独立文件、渲染器单例复用防内存泄漏），挂载到 pane1 klineSeries；
- 逻辑：遍历当前可视逻辑范围取 high 最大 / low 最小的 bar，随平移 / 缩放实时重算；
- **最高价**：12px 黄色文字 + 背景块，标注在柱体最高价位置**上方**，
  黄色实线从文字块边缘连到**柱体上边缘中间**（连接点 = 柱体中心 x / 柱顶 y）；
- **最低价**：12px 蓝色文字 + 背景块，标注在柱体最低价位置**下方**，
  蓝色实线从文字块边缘连到**柱体下边缘中间**（连接点 = 柱体中心 x / 柱底 y）；
- 文字左右不越界（靠近 pane 边界自动内靠）；
- **深浅系配色**（theme.ts 新增 `highMarkerColor` / `lowMarkerColor`）：
  深系 黄 #F4AA0A / 蓝 #2962FF；浅系 黄 #CC8800 / 蓝 #1E4FE0（白底加深保证可读）；
  背景块 = crosshairLabelBackground；
- 极值查找提取为纯函数 `findExtremeBar`（可单测：最高优先、子区间、空区间、
  无效索引跳过容错）。
- 测试：theme.test.ts 新增标注色断言；新增 tests/highLow.test.ts（3 用例），
  总 53 → 57 全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.47（2026-10-13）

左刻度**指示值**文字不越界：十字星靠近 pane 顶部 / 底部时，标签完整位于 pane 内。

### 变更
- `crosshairAxisLabelPaneView` 绘制时对横线 y 做钳制：
  `yClamped = clamp(y, AXIS_LABEL_HEIGHT/2, mediaSize.height - AXIS_LABEL_HEIGHT/2)`，
  标签块（高 18px、垂直居中）始终不超出当前 pane 的垂直范围；
  pane 高度不足 18px 时跳过绘制（防异常）。
- 验证：vitest 53 项全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.46（2026-10-13）

文件命名去除数字：`pane0Overlay*` → `topPaneOverlay*`（语义化驼峰）。

### 变更
- `git mv src/chart/overlay/pane0OverlayPrimitive.ts` → `topPaneOverlayPrimitive.ts`、
  `pane0OverlayPaneView.ts` → `topPaneOverlayPaneView.ts`；
- 类名 `Pane0OverlayPrimitive` → `TopPaneOverlayPrimitive`、
  `Pane0OverlayPaneView` → `TopPaneOverlayPaneView`；controller import / 实例化、
  README 同步更新；`find src -name '*[0-9]*'` 无命中（源码无数字命名文件）。
- 验证：vitest 53 项全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.45（2026-10-13）

时间轴（X 轴）十字星指示值标签背景色接入深浅系配色。

### 变更
- createChart 与 applyTheme 的 crosshair 配置新增
  `vertLine.labelBackgroundColor` / `horzLine.labelBackgroundColor` =
  主题 `crosshairLabelBackground`（深系 #2A2E39 / 浅系 #E9EBEF）；
  时间轴十字星日期标签背景随深浅系切换同步更新。
- 文字颜色说明：lightweight-charts 十字星标签文字色由库按背景亮度自动
  黑白对比（深背景白字 / 浅背景黑字），方向与 crosshairLabelText 一致。
- 验证：vitest 53 项全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.44（2026-10-13）

十字星左刻度**指示值**标签背景块与文字颜色按深浅系定义。

### 变更
- `theme.ts` 新增 `crosshairLabelBackground` / `crosshairLabelText` 字段：
  - 深系：背景 `#2A2E39`（与图表背景 #131722 可见区分）、文字 `#D1D4DC`；
  - 浅系：背景 `#E9EBEF`（与白底可见区分）、文字 `#33373E`。
- controller 三处 CrosshairAxisLabelPrimitive（pane1 / pane3 / pane5 指示值）的
  getColor / getBackColor 改用上述字段（原为 textColor / background —— 背景块
  与图表底色同色不可见）。
- 测试：theme.test.ts 新增用例（深浅系各自取值、背景块与图表背景可区分、
  文字色互不相同），总用例 52 → 53 全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.43（2026-10-13）

左刻度标签文字右缘距调整：4px → 6px（文字右缘 = 价格轴右缘 − 6px）。

### 变更
- `axisLabelPaneView.ts` 公共常量 `AXIS_LABEL_PAD_X` 由 4 改为 6 —— 指示值与刻度值
  共用同一常量，两处文字右缘距同步变为 6px（背景块左右内边距随之为 6px，背景与
  图表底色同色无视觉影响）；相关注释 / README / CHANGELOG 同步更新。
- 验证：vitest 52 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.42（2026-10-13）

优化：左刻度**指示值**与**刻度值**文字设置统一（以指示值为基准）。

### 变更
- **背景**：指示值（crosshairAxisLabelPaneView）为自绘 canvas；刻度值原走库
  ISeriesPrimitiveAxisView（axis 标签）渲染，库自带内边距 / 对齐细节，两处文字
  视觉不一致。
- **修复**：刻度值改为自绘（AxisLabelPaneView），与指示值**共用同一套绘制规格**
  （axisLabelPaneView 导出的公共常量 AXIS_LABEL_PAD_X = 4 / AXIS_LABEL_HEIGHT =
  18 与公共绘制函数 drawAxisLabel）：
  - 字体：12px chartFontFamily（新增 theme.chartFont 统一常量）；
  - 对齐：textAlign = 'right'，文字右缘 = 价格轴右缘 - 6px；
  - 背景块：左右内边距各 4px、高 18px、垂直居中；
  - 颜色：文字 = 主题 textColor、背景 = 主题 background（跟随深浅系）。
- **AxisLabelPrimitive**：priceAxisViews（axis 标签路径）→ priceAxisPaneViews
  （zOrder 'top' 自绘，与指示值同一层）；config 新增 getFont；
  AxisLabelView 退化为纯数据载体（不再实现库 axis view 接口，保留 coordinate /
  fixedValue / text()）。
- **统一字体**：theme.ts 新增 chartFont（`12px ${chartFontFamily}`）；
  controller 三处指示值 getFont、三处刻度 getFont、空 Pane "测试"文字
  （testLabel / pane0Overlay）全部改用 chartFont。
- 验证：vitest 52 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.41（2026-10-13）

代码质量整理（内存 / 缓存 / 命名 / 颜色集中 / 效率 / 文档 / 测试 / 清理）。

### 变更
- **执行效率（primitive 视图单例化）**：6 个 primitive（volumeBar / macdBar /
  paneBorder / grid / testLabel / pane0Overlay）的 `paneViews()` 原每次绘制都
  `new XxxPaneView(this)`（每帧产生 6 个新对象 → GC 压力）；改为构造时创建单例
  视图、`paneViews()` 返回同一实例（与 crosshairAxisLabelPrimitive /
  axisLabelPrimitive 一致）。十字星移动 / 缩放等高频绘制场景不再有对象创建开销；
- **清理未使用函数**：`chart/util/format.ts` 删除 11 个未被引用的遗留函数 / 常量
  （早期分时 / 浮层 / 信息行功能遗留）：formatSigned、formatSignedPct、
  formatPctAbs、formatAmount、calcTsRise、stretchRange、PERIOD_DATE_FORMAT、
  resolvePeriodDateFormat、formatDateStr、formatTimeByFmt、layoutTickPositions；
  保留 formatPrice / formatVolume / formatAxisSmart（当前实际使用）；
- **颜色集中到公共文件**：controller 内硬编码的 `MACD_COLORS`（DIF #A0A0A0 /
  DEA #F4AA0A）提取到 `chart/core/theme.ts` 的 `macdColors`（指标配色集中管理，
  深浅系通用）；controller 改为引用 theme 导出；
- **文档**：README.md 全面重写 —— 由过时的"单 Pane"描述更新为当前 6 Pane 多 Pane
  布局（分组比例 / 空 Pane / 自绘栅格 / 刻度标签 / 十字星指示值 / 内存性能），
  目录结构补齐 axis / crosshair / overlay / util；
- **测试**：tests/util.test.ts 由仅 4 项扩展至 13 项 —— 新增 formatPrice
  （小数位 / 空值）与 formatAxisSmart（亿 / 万 / 普通 / 极小值自适应小数位）覆盖；
- **命名检查**：全量扫描确认无下划线命名，类 / 方法 / 常量均驼峰语义化，无需调整；
- 验证：vitest 43 → 52 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.40（2026-10-13）

修复十字星左刻度指示值：pane1 显示但刷新卡顿、pane3 / pane5 完全不显示。

### 变更
- 定位过程（像素级诊断，诊断设施已清理）：
  1. **卡顿根因**：v1.4.39 用 priceAxisViews（axis 标签）渲染，而库价格轴 main canvas
     仅在**非 Cursor 级** invalidate 时重绘（含 backLabels → axis 标签），十字星移动
     是 Cursor 级 → 标签刷新滞后 → pane1 卡顿；
  2. **pane3 / pane5 不显示根因①**：库 MouseEventParams.point 是**当前 pane 的本地
     坐标**（相对 pane canvas 顶部），controller 错误地累计前序 pane 高度做 offset
     减法，导致注入 y 严重偏移、coordinateToPrice 越界返回 null；
  3. **不显示根因②**：paneView 内 fillText 未设置 `textAlign`（默认 'left'），文字
     从 x=68 向右绘制超出 72px 宽的价格轴 canvas 被裁剪 → 文字不可见（背景块可见
     但文字消失）。
- 修复方案（回到 priceAxisPaneViews + zOrder 'top'，v1.4.38 路径并修正两处根因）：
  - crosshairAxisLabelPrimitive：`priceAxisPaneViews()` 返回单例
    crosshairAxisLabelPaneView（IPrimitivePaneView，zOrder 'top'）；
  - controller `handleCrosshairMove`：`localY = point.y` **直接使用**（不再减前序
    pane 高度），命中 pane 注入本地 y、其他 pane 置 null；
  - crosshairAxisLabelPaneView：绘制在价格轴 top canvas（Cursor 级重绘、流畅），
    值 = series.coordinateToPrice(y) 反算；`ctx.textAlign = 'right'` +
    `fillText(text, width - PAD, y)`（文字右对齐，避免被 canvas 裁剪），背景块
    包裹文字并留内边距；
  - 删除 v1.4.39 的 crosshairAxisLabelView.ts（不再使用的 axis 标签路径）。
- 验证：像素直方图确认 pane1 / pane3 / pane5 价格轴 top canvas 均出现文字色像素；
  完整截图 OCR 确认 pane3 出现第 4 个标签（指示值 1.48万）；
  vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图（诊断截图仅存 /tmp 已清理）。

## v1.4.39（2026-10-13）

修复 pane3 / pane5 十字星左刻度指示值不显示。

### 变更
- 原因：v1.4.38 用 priceAxisPaneViews（IPrimitivePaneView）渲染指示值，
  pane1 正常但 pane3 / pane5 不显示（该路径对部分 Pane 的价格轴不可靠）；
- 修复：改用 priceAxisViews（ISeriesPrimitiveAxisView）—— 与 AxisLabelPrimitive
  刻度标签同一渲染路径（pane1 / pane3 / pane5 刻度标签均正常显示的最可靠机制）：
  - crosshairAxisLabelPrimitive：priceAxisViews() 返回单例 CrosshairAxisLabelView，
    setCrosshairY(y) 注入 / 读取十字星横线本地 y；
  - 新增 crosshairAxisLabelView（ISeriesPrimitiveAxisView）：visible = y 非 null；
    fixedCoordinate() = y（精确贴横线，自动避让不影响，且固定标签绘制在普通
    刻度标签之上不被遮挡）；coordinate() 返回大负数（不参与 unfixed 布局）；
    text() = series.coordinateToPrice(y) 实时反算 + format（越界返回空串）；
    textColor / backColor 取主题（跟随深浅系）；
  - 删除不再使用的 crosshairAxisLabelPaneView.ts；
- controller 挂载 / 注入逻辑不变（v1.4.38）；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.38（2026-10-13）

十字星移动时，左刻度区显示指示值（横线所在数值标签）。

### 变更
- 新增 `src/chart/crosshair/`：crosshairAxisLabelPrimitive.ts +
  crosshairAxisLabelPaneView.ts
  - priceAxisPaneViews() + zOrder 'top'：绘制在价格轴 top canvas（最上层，
    库 9637 行 sourceTopPaneViews 路径），不干扰刻度标签（刻度标签仍由
    AxisLabelPrimitive 按栅格等分对齐）；
  - setCrosshairY(y) 注入十字星横线本地 y；标签值 = series.coordinateToPrice(y)
    实时反算；样式 = 圆角背景块（主题背景色）+ 文字（主题文字色），右对齐贴
    价格轴右缘（"冒泡"观感）；
- controller：
  - 字段 crosshairAxisLabelPrimitives（pane1 / pane3 常驻，pane5 随指标开关增删）；
  - 统一 handleCrosshairMove 回调：pane0 清除十字星（v1.4.37 逻辑）+ 按前序
    pane 高度和换算本地 y 注入命中 pane 的指示值（未命中 pane 置 null 清除残留）；
  - 指标关闭时 filter 移除 pane5 引用（series 已销毁，防对已销毁 series 注入）；
  - destroy：unsubscribeCrosshairMove + 清空数组（防内存泄漏）；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.37（2026-10-13）

pane0 内不触发十字星。

### 变更
- controller：新增 `handleCrosshairMoveInPane0`（const 箭头函数）——
  鼠标位于 pane0（index 0）时调用 `chart.clearCrosshairPosition()` 清除十字星；
  十字星仅可在 pane1 ~ pane5（K 线 / 成交量 / 指标）内触发与移动；
- 说明：库十字星由内部 mousemove 驱动，回调与库 set 同帧（同一次 invalidate
  重绘），pane0 内十字星不出现；pane0 顶层背景遮罩（v1.4.36）保留作双保险；
- 内存：destroy 中 `unsubscribeCrosshairMove` 移除监听，防泄漏；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.36（2026-10-13）

pane0 永远位于十字星上层，遮住十字星竖线（竖线不贯穿 pane0）。

### 变更
- 库渲染层级确认（dist 源码）：
  - 每个 PaneWidget 有 bottom / top 两层 canvas；
  - bottom canvas：背景 → 栅格 → 系列 → 十字星线（CrosshairPaneView 属
    pane 级视图，画在各 pane 的 bottom canvas 上）→ 刻度标签；
  - top canvas：十字星标签 → **zOrder 'top' 的 paneViews**（库 9637 行）；
- 新增 `src/chart/overlay/`：pane0OverlayPrimitive.ts + pane0OverlayPaneView.ts
  - 挂载到 pane0 空 series，`paneViews()` 返回 zOrder 'top' 的视图；
  - draw：先用主题背景色填充整个 pane0 区域（不透明覆盖 → 遮住底层十字星
    竖线），再绘制"测试"文字（垂直居中、距左 6px、主题 textColor）；
  - 颜色每次 draw 动态获取（跟随深浅系主题）；
- controller：pane0 挂载由 TestLabelPrimitive 替换为 Pane0OverlayPrimitive
  （TestLabelPrimitive 仍被 pane2 / pane4 使用，未删除）；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.35（2026-10-13）

修复 `primitive.setCrosshairY is not a function` 崩溃（工作树混版）。

### 变更
- 背景：工作树被覆盖回 v1.4.33 的 controller（含 handleCrosshairMove /
  subscribeCrosshairMove / axisLabelPrimitives 十字星注入配置），而
  axisLabelPrimitive.ts 已回滚为无 setCrosshairY 的版本 → 十字星移动时
  调用不存在的方法，运行时抛 `TypeError: primitive.setCrosshairY is not a function`；
- 按"删除 axis 相关配置"意图重新清理 controller：
  - 删除 axisLabelPrimitives 数组、handleCrosshairMove 方法、
    subscribeCrosshairMove / unsubscribeCrosshairMove、MouseEventParams 导入；
  - pane1 / pane3 / pane5 挂载恢复直接 attachPrimitive(new AxisLabelPrimitive(...))；
  - handleScale 的 axisPressedMouseMove / axisDoubleClickReset 保持删除（v1.4.34）；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.34（2026-10-13）

删除 axis 相关配置。

### 变更
- handleScale：删除 `axisPressedMouseMove: false` / `axisDoubleClickReset: false`
  （axis 相关配置）——恢复库默认：按住价格轴拖动可缩放、双击价格轴可重置；
  滚轮 / 双指缩放仍关闭（mouseWheel / pinch: false），缩放仅由工具栏按钮控制；
- controller：删除十字星左刻度指示值相关的 axis 注入配置
  （axisLabelPrimitives 数组、handleCrosshairMove 方法、subscribeCrosshairMove /
  unsubscribeCrosshairMove、MouseEventParams 导入）；
- 同步用户手动回滚：axisLabelPrimitive.ts 恢复 v1.4.31 版本（无 crosshairY），
  pane1 / pane3 / pane5 挂载恢复直接 attachPrimitive(new AxisLabelPrimitive(...))；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.31（2026-10-13）

MACD 柱改为从中间值（数据区中间，与中间刻度 0 对齐）向上下延伸。

### 变更
- macdBarPaneView：柱底基准由 `priceToCoordinate(0)`（scale 的 0 轴位置）
  改为 `mediaSize.height / 2`（数据区中间）—— 与中间刻度固定值 0 对齐；
  - 延伸量 = |priceToCoordinate(0) - priceToCoordinate(macd)|（值相对 0 轴的像素距离，
    比例仍由 scale 决定，随平移 / 缩放一致）；
  - 柱 > 0：从中间向上（空心红柱）；柱 < 0：从中间向下（绿色实心）；
- macdBarPrimitive：文件头注释同步更新；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.30（2026-10-13）

MACD（pane5）左刻度中间值固定为 0。

### 变更
- axisLabelPrimitive：AxisLabelConfig 新增可选 `fixedMiddleValue`；
  buildLabelViews 对中间刻度（i = count / 2）传入固定值；
- axisLabelView：AxisLabelView 新增可选 `fixedValue`，text() 优先显示
  固定值（否则按坐标反算价格）；
- controller：pane5 挂载 `fixedMiddleValue: 0` —— MACD 柱以 0 轴为正负分界，
  中间刻度不再受 scale 中间值影响，固定显示 0；
- pane1 / pane3 不受影响（未设置 fixedMiddleValue）；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.29（2026-10-13）

成交量（pane3）尾部刻度值 clamp 到非负（不小于 0）。

### 变更
- pane3 AxisLabelPrimitive 的 format 增加 `Math.max(0, volume)`：
  priceScale 底部默认留白可能使刻度 y 处反算出负成交量，
  成交量最低为 0，负值无意义 → 截断为 0 显示（'0' / '0.00万'）；
- K 线（价格恒正）/ MACD（允许负值）不受影响；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.28（2026-10-13）

左刻度刻度值数量调整为「等分数 + 1（含首尾）」，首尾刻度内嵌完整可见。

### 变更
- axisLabelPrimitive：`buildLabelViews` 循环 i = 0..count（含首尾），
  刻度行数 = 等分数 + 1：
  - 指标关：pane1 = 9 个值（8 等分）、pane3 = 3 个值（2 等分）；
  - 指标开：pane1 = 7 个值（6 等分）、pane3 / pane5 = 3 个值（2 等分）；
- 中间刻度（i = 1..count-1）仍与栅格横线同一等分公式（完全对齐）；
- 首尾刻度（i = 0 / count）内嵌 `AXIS_LABEL_PAD = 8` px，
  避免库渲染的背景块 / 文字被价格轴边缘裁切；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.27（2026-10-13）

左刻度区刻度值与自绘栅格横线**完全对齐**（自绘价格轴刻度标签）。

### 变更
- 新增 `src/chart/axis/axisLabelPrimitive.ts` + `axisLabelView.ts`：
  - `AxisLabelPrimitive`（ISeriesPrimitive）：`priceAxisViews()` 返回刻度标签集合，
    标签 y 与 `GridPrimitive` 同一等分公式（`Math.round(h * i / count)`，
    i = 1..count-1），pane 高度取自 `chartApi.panes()[i].getHeight()`；
  - `AxisLabelView`（ISeriesPrimitiveAxisView）：`fixedCoordinate()` 强制标签
    绘制在栅格横线 y 处（防库自动防重叠移动导致错位）；
    `text()` 用 `series.coordinateToPrice(y)` 实时反算当前价格并格式化
    （随数据平移 / 缩放变化，位置固定）；textColor / backColor 取主题
    textColor / background（深浅系区分）；
- 隐藏库刻度标签（刻度区保留）：pane1 klineSeries / pane3 volumeSeries /
  pane5 indicatorsBarSeries 的 `priceFormat formatter` 返回 `''`，
  刻度值全部由自绘标签承担（刻度区宽度仍受 leftPriceScale minimumWidth = 72 控制）；
- 挂载与格式化：
  - pane1：`formatPrice`（K 线价格 2 位小数），行数随指标开关 6 / 8 等分变化；
  - pane3：`formatVolume`（成交量 万 / 亿）；
  - pane5：`formatAxisSmart`（MACD 值，自适应小数位）；
- 机制已验证：库 dist 在渲染价格轴时调用 `_internal_priceAxisViews` 收集
  primitive 视图并绘制（19 处相关代码）；pane 尺寸变化触发 primitive
  `updateAllViews` 重建标签，平移 / 缩放时 `text()` 每次渲染求值；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.19（2026-10-12）

给内容 Pane（pane1 / pane3 / pane5）添加 1px 自绘边框，颜色区分深浅系。

### 变更
- 新增 `paneBorderPrimitive.ts` / `paneBorderPaneView.ts`：`ISeriesPrimitive`
  自绘直角矩形边框（strokeRect(0.5, 0.5, w-1, h-1)，CSS 像素网格对齐不模糊）；
- 挂载：pane1（K 线）→ klineSeries、pane3（成交量）→ volumeSeries、
  pane5（指标）→ indicatorsBarSeries（指标开启时随 pane 创建）；
  空 Pane（pane0 / pane2 / pane4）不加边框；
- theme.ts：新增 `paneBorder`（深系 `#2A2E39` / 浅系 `#D4D8DE`），
  主题切换 draw 动态取色自动更新；
- 同步用户修改：`topPaneHeight` 24 → 22（layout.ts），控制器注释 24px → 22px
  口径同步。

### 验证
- vitest 38 项全绿（新增 theme paneBorder 深浅系断言、topPaneHeight=22）；
- vue-tsc 类型检查通过；未运行 / 未截图。

---

## v1.4.18（2026-10-12）

MACD 红绿柱改为自绘，宽度 / 间隔复用成交量函数（`candlestickBarWidth`），与 pane1 蜡烛柱绝对一致。

### 变更
- 新增 `macdBarPrimitive.ts` / `macdBarPaneView.ts`：MACD 柱自绘
  （`ISeriesPrimitive` 挂载到 pane5 指标 series）——
  柱宽 = `candlestickBarWidth(barSpacing, dpr)`（与成交量同一函数，
  宽度 / 间隔与 pane1 绝对一致）；柱中心 = 同一逻辑索引坐标；
  柱 > 0 **空心红柱**（背景填充 + 红框）、柱 < 0 绿色实心；柱底 = 0 轴；
- controller：
  - `indicatorsBarSeries`（Histogram）改为仅作 scale 锚点（color = 背景色不可见），
    与成交量同机制；
  - 新增 `macdPoints` 缓存字段（applyData 计算一次，primitive 与 series 共用）；
  - `applyTheme` 同步更新锚点色（保持不可见）；
  - 删除不再使用的 `MACD_COLORS.macdUp` / `macdDown`（自绘取主题 up/down，
    红涨绿跌与 pane1 / pane3 一致）。

### 验证
- vue-tsc 类型检查通过；vitest 37 项全绿；未运行 / 未截图。

---

## v1.4.17（2026-10-12）

新增 App.vue 指标开关：指标关时 4 Pane（main : volume = 80 : 20），指标开时 6 Pane（60 : 20 : 20）。

### 变更
- App.vue：新增「指标开 / 关」按钮，调控制器 `setShowIndicator`；
- controller：
  - options 新增 `showIndicator?`（默认 true，指标 Pane 初始状态）；
  - 指标 Pane（pane4 / pane5）创建提取为 `createIndicatorPanes`（仅开启时创建）；
  - 新增 `setShowIndicator`：开 = `createIndicatorPanes` + 重算指标数据 + 重排布局；
    关 = `removePane(4)` ×2（删 pane4 后原 pane5 顺移到 index 4，再删一次移除整组）
    + 引用置 null。**防内存泄漏**：库 removePane 从 panes 数组 splice，pane 上
    series（含 primitive）强引用随之断开可被 GC，控制器解除自身引用即安全；
  - `applyStretchFactors` 参数化：指标开 3 固定空 Pane + 60:20:20，
    指标关 2 固定空 Pane + 80:20（时间轴开 / 关一致，仅 H 不同）；
- layout.ts：新增 `paneCountWithoutIndicator`（4）/ `fixedPaneCountWithoutIndicator`（2）/
  `groupRatiosWithoutIndicator`（80:20）；`calcPaneHeights` 泛化接收
  `fixedCount` 与 `ratios`，返回 4 或 6 项，空 Pane 高度扣除后内容按比例分配，
  总高度 = 固定 + 剩余 = 可用高度（完全铺满）。

### 验证
- vitest 37 项全绿（新增指标关 80:20 分配 / 数量守恒断言）；
- vue-tsc 类型检查通过；未运行 / 未截图。

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
