# 多 Pane K 线组件（Vue3 + TypeScript + lightweight-charts v5）

多 Pane K 线组件：一个 `chart` 内多 Pane（lightweight-charts v5 原生多 Pane），包含顶部信息行（名称 [代码] 时间 + 主图指标值）、K 线主图、成交量、附图指标层（RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR 十指标互斥单选），指标层随选中指标动态开 / 关。

---

## 版本记录

- **v1.7.16（当前）**：services 层重构——`chartDataService.ts` 只保留接口定义
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

成交量组开关（v1.7.2，工具栏「成交量」按钮，仿 pane4/5 创建/移除式）与指标开关组合出**四态布局**：

| 成交量组 | 附图指标 | Pane 数 | 内容比例 |
|---|---|---|---|
| 开 | 开 | 6 | main : volume : indicator = 60 : 20 : 20 |
| 开 | 关 | 4 | main : volume = 80 : 20 |
| 关 | 开 | 4 | main : indicator = 80 : 20（与 indicator 关闭时的 80:20 对称） |
| 关 | 关 | 2 | main = 100%（仅 K 线） |

**分时均价线开关（v1.7.4，工具栏「均价」按钮，仅分时周期显示）**：
- 默认渲染均价线（pane1 黄色均价线）；关闭时均价线不渲染（`lineVisible: false`，series 保留避免重建）；
- 关闭时 pane0 信息行「均价」段与 tooltip「均价」行同步隐藏；
- 实现：controller `setAvgLineVisible` + `getShowAvg` 依赖注入（CrosshairManager / IndicatorManager），与 `getShowVolume` 同一注入范式。

**成交量组关闭时数据面联动（v1.7.3）**：
- **tooltip**：隐藏「成交量 / 成交额」两行（K 线 9 行 → 7 行；分时 7 行 → 5 行）；
- **pane0 信息行**：分时状态下隐藏「成交量 / 成交额」段（K 线状态量额本就位于 pane2 成交量信息行，随成交量组一并移除）；
- 实现：`buildTooltipRows` 第 4 参 `showVolume`（默认 true）+ `IndicatorManager.buildInfoSegments` 分时量额守卫，开关状态经 `getShowVolume` 依赖注入透传（controller → CrosshairManager / IndicatorManager）。

高度分配（时间轴开 / 关一致，仅库可用高度不同）：
- 空 Pane 固定 `topPaneHeight = 22px`（同一 stretchFactor，绝对相等）；
- 剩余高度按组比例分配（`calcPaneHeights` 纯函数，见 `chart/core/layout.ts`）；
- 像素因子方案：`stretchFactor` 直接设为目标像素高度 → 无舍入误差，pane 完全铺满；
- Pane 高度不可拖拽（`layout.panes.enableResize: false`）、Pane 之间分割线为库默认 1px（早期曾用脚本 patch 置 0，竖线"不到底"已由源码层虚线相位修复解决，patch 脚本已移除）。

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
- **键盘方向键移动十字星（v1.7.1）**：K 线模式（分时 1d~5d 同样支持）下，**左右方向键每按一次移动 1 根 bar**——
  基准取十字星当前命中的 bar（`overlayTime` 反查，鼠标 / 键盘位置天然同步），未激活（overlayTime null）时从最后 bar 起算；
  目标索引委托纯函数 `viewport.computeCrosshairTargetIndex`（clamp 到 `[0, lastIndex]`，可单测）；
  定位用 `chart.setCrosshairPosition(价格, time, 主 series)`——库自动重绘竖线 / 横线 / 轴标签，
  并触发 crosshairMove 事件 → CrosshairManager 联动 tooltip / pane0 信息行 / 左刻度指示值（与鼠标命中同一条链路）；
  K 线 price 取 `bar.close`，分时取 `bar.price`；组件 keydown 监听（KLineChart.vue）在输入控件内不劫持，且 `preventDefault` 阻止页面滚动；
  **修复"两条竖线"（v1.7.1）**：`setCrosshairPosition` 触发的 crosshairMove 事件经 rAF 节流**下一帧**才更新 `overlayTime`——
  同帧内 `CrosshairLineCapPrimitive` 竖线仍以旧 `overlayTime` 绘制，与库竖线（已到键盘目标）错位成两条竖线；
  控制器在 `setCrosshairPosition` 后同步调用 `CrosshairManager.setOverlayTimeByKeyboard(time)` 立即对齐（cap 竖线与库竖线同帧重叠，随后的 rAF 事件写入相同值无副作用）；
        **缓存内存管理（v1.7.1）**：MockChartDataService 各缓存引入 LRU 上限（`touchCache` 纯函数，模块级可单测）——日 K / 分时池最多 4 个 symbol、派生周期池（week/month/分钟 K，1 分 K 每 symbol 约 1.4 万根）最多 8 个 key、实时定时器最多 8 个订阅，超限淘汰最久未使用，防多 symbol 切换内存无限增长；价格线标签反色文字提取为 `priceLabelInverseText`（theme.ts），组件内不再硬编码色值；
**方向键按住自动加速（v1.7.1）**：浏览器 keydown 原生重复有 ~500ms 初始延迟且受系统重复速率限制——改为自定义节拍（`KEYBOARD_REPEAT_MS=40`，KLineChart.vue）：首次按下立即移动 1 根、随后每 40ms 移动 1 根（25 根/秒），`event.repeat` 重复事件忽略防双重加速；keyup / window blur / 组件卸载停止（防泄漏）；实测按住左 500ms 移动约 19 根（日K 含周末按自然日计数）；
**键盘十字星视口跟随（v1.7.1）**：方向键移动到可视区最后一个数据（左 / 右）再按键时，目标 bar 已超出可视区——`getCrosshairScrollOffset`（纯函数）计算滚动量，视口平移让目标进入视野（边缘场景恰好平移 1 个 bar；距可视区较远时一次滚动到位，如未激活直接按键时十字星立即可见）；实测：可视区 [280,399] 内 hover 左缘 bar 280 → 按左 → 视口 [279,398]、十字星命中 279；
**同步修复"tooltip 更新延迟"（v1.7.1）**：数据浮层同样经 rAF 事件链路（下一帧才 `tooltip.show` 新 bar），键盘连发时持续滞后——
  控制器改为同步调用 `CrosshairManager.syncKeyboardMove(bar, time, pane1LocalY)` 全链路对齐（overlayTime + tooltip 数据 + 左刻度指示值，指示值仅注入 pane1：键盘横线在主 series 的 close/price 价）；
  **"两条竖线"最终方案：删除自绘 cap 竖线（v1.7.1）**：多次对齐修复（window mousemove 鼠标反查 / 拖拽状态忽略浮层回退 / 精确数据区 x）后仍有边界场景错位（拖拽路径穿 tooltip 浮层、bar 中心吸附 vs 库精确跟随）——直接**删除自绘细竖线**（`CrosshairLineCapPrimitive` / `CrosshairLineCapPaneView`，pane1~5 五处挂载全部移除），**只保留库竖线**（`CrosshairMode.Normal` 精确跟随鼠标，键盘移动由 `setCrosshairPosition` 驱动）。同步清理：`CrosshairManager` 的 window mousemove / mousedown / mouseup 跟踪与键盘 x 注入、controller `getCrosshairX`、IndicatorManager / SubIndicatorPaneManager 透传、调试探针（capX / lastMouseX / keyboardX 等）。键盘十字星导航保留（`syncKeyboardMove` 对齐 overlayTime / tooltip / 左刻度指示值），实测 hover / 键盘 / 拖拽均为**单条竖线**；
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
│   │   ├── KLineChartController.ts # 控制器（v1.7.2 拆分版，<1000 行）：数据 / 生命周期 / 对外 API，Pane 构建与分时计算等职责委托给下方模块
│   │   ├── indicatorManager.ts # 指标管理器（主图五指标 + 成交量均量线 + pane0/pane2 信息行；setMainIndicator / setSubIndicator 转发附图指标层）
│   │   ├── subIndicatorPaneManager.ts # 附图指标 Pane 管理器（pane4 指标信息行 + pane5 指标图：创建/销毁/数据/信息行/主题；v1.4.89 拆分）
│   │   ├── crosshairManager.ts # 十字星管理器（十字星移动联动 + overlayTime + 左刻度指示值注册表）
│   │   ├── timeshareManager.ts # 分时计算管理器（v1.7.1 拆分：isTimeshare / preClose / 对称半幅 / 等差刻度 / 三态着色 / 固定价格范围）
│   │   ├── paneFactory.ts      # Pane 构建工厂（v1.7.1 拆分：pane0~pane3 全部 series / primitive 创建装配；v1.7.2 抽 createVolumePanes 供成交量组重建）
│   │   ├── paneLayout.ts       # Pane 高度分配工具（v1.7.1 拆分：固定空 Pane 等高等分 + 组比例；paneTop 累加定位）
│   │   ├── chartDataBridge.ts   # 数据 IO 桥（v1.7.2 拆分：历史首载 / 更早翻页 / 实时订阅生命周期 / 加载状态，竞态守卫与退订清理集中于此）
│   │   ├── realtimePipeline.ts  # 实时增量管线（v1.7.2 拆分：节流入队 → 批量消费 → series/bars/barIndex 增量更新 → 指标重建 + priceLine 视口跟随）
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
│   │   └── crosshairTooltip.ts   # 十字星数据浮层（九项数据跟随鼠标，v1.6.35；竖线底部补齐已并入轴线自绘，v1.7.2）
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
│   │   ├── options.ts         # 主图/附图指标按钮配置（MainIndicatorOptions / SubIndicatorOptions，自 App.vue 迁入）
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
| `priceLineVisible` | `boolean` | `true` | 最后价线显隐（K 线主图自绘 priceLine，v1.7.1） |
| `volumeVisible` | `boolean` | `true` | 成交量组显隐（pane2 信息行 + pane3 成交量图；关闭销毁整组 + 布局重算，v1.7.2；关闭时 tooltip 与 pane0 信息行隐藏量额，v1.7.3） |
| `avgLineVisible` | `boolean` | `true` | 分时均价线显隐（v1.7.4）：关闭时均价线不渲染，pane0 信息行与 tooltip 同步隐藏均价（K 线周期无均价线，开关仅分时生效） |

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

### HttpChartDataService 构造参数总表（v1.7.1）

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

**实时传输三模式对比**：

| 模式 | 使用参数 | 自定义 headers / cookies | 说明 |
|---|---|---|---|
| `'ws'`（默认） | `wsUrl` | ✗ 浏览器限制无法注入 | WebSocket 全双工推送，跨域需后端配合 |
| `'sse'` | `sseUrl` + `sseEventName` | ✓ 基于 `@microsoft/fetch-event-source` | 单向服务端推送，断线自动 3s 重连，401/403 自动中止 |
| `'poll'` | `pollUrl` + `pollIntervalMs` | ✓ 普通 fetch | HTTP 轮询（默认 3000ms），无长连接，最简单 |

鉴权依赖自定义请求头时，请优先选用 `'sse'` 或 `'poll'`（WebSocket 无法注入头）。

**完整地址语义**（v1.6.30）：`historyUrl` / `wsUrl` / `sseUrl` / `pollUrl` 一律传**完整
URL**（可含自有路由 / query）；库在请求时以 `&` 追加 `symbol` / `period` / `before` /
`limit` 等核心参数（`params` 同名冲突时核心参数优先）。缺省对应模式的地址 = 该模式
不启用并 console.warn。

**请求协议约定**：历史 `GET {historyUrl}?symbol=&period=&before=&limit=` 返回
`{ code: 200, data: ChartDataPoint[] }`（time 升序、返回条数 < limit 表示无更早数据）
或直接返回数组；实时推送与历史同结构，`time` 与最后一根相同 = 刷新该根、更大 = 追加。

**内存管理**：历史缓存按 `symbol|period` 组合做 LRU 淘汰（`maxCacheEntries` 默认 12）；
`knownTotals` 独立记录各 key 已知总条数（淘汰缓存不清除），超过 `maxKnownTotals`（默认
64）才按 LRU 清理，防止分页往返下「总条数」元数据无限增长；返回调用方的数据一律为
独立副本，实时更新不污染缓存。

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

#### 5.6.1 最后价线（priceLine，v1.7.1）

- **为什么自绘**：库原生 `priceLine` 只有两种锚定——`LastBar`（真实最后 bar，左移看历史时移出视口而消失）与 `LastVisible`（视口右缘 bar，左移可见但显示历史价格，"最后价"语义失真），均无法同时满足"真实最后价 + 始终可见"；
- **实现**：`PriceLinePrimitive` 自绘（`src/chart/overlay/priceLinePrimitive.ts` + `priceLinePaneView.ts`）——价格 = 真实最后 K 线 bar 的 close（`findLastKlineBar` 逆序过滤分时点，纯函数可单测），横虚线**横贯 pane1 全宽**（1px，`setLineDash([6,4])` 模拟库 dashed），右缘内侧价格标签（线色背景 + 按亮度自动黑白文字）；
- **钳制**：最新价超出当前视口值域（如左移看历史）时，线钳到主图顶部 / 底部边缘、标签仍显示真实最新价——任何视口位置都持续可见；
- **涨跌色**：最后 bar `close vs preClose` → 红（`upColor`）/ 绿（`downColor`）/ 平盘（`flatColor`，深系白·浅系黑），与 K 线柱体同一套主题色，实时推送自动变色；
- **分时模式**：`klineSeries` 隐藏且 `getBars` 无 kline 点 → 自动不绘制；
- **显隐参数**：`KLineChartOptions.priceLineVisible`（默认 `true`，组件 props `priceLineVisible` 透传，App.vue 工具栏"价格线"按钮运行时切换）→ `KLineChartController.setPriceLineVisible(visible)`（幂等，变化时对 `klineSeries` 同值 `applyOptions({ priceLineVisible: false })` 强制 invalidate 立即生效；库 priceLine 保持关闭，重绘由自绘 primitive 现取 `visible`）；
- **实时视口跟随**（`followLastBarIfTracking`，v1.7.1）：K 线实时追加新 bar 后，**仅当视口右缘与最后 bar 相差不足 1 根**（`|range.to - lastIndex| < 1`，贴住数据末尾）时，视口重新定位到最后 120 根——最后 bar / 价格线恒在视口内。lightweight-charts 允许逻辑范围越出数据右缘（拖拽后 `to` 可 > `lastIndex`），**越界或右拖看历史（右缘远离最后 bar）都视为用户已脱离跟踪，实时推送不再把视口拽回**（修复"右移 10 多条后一段时间复原"）；右拖看历史后视口完全保持不动（实测 20 秒 / 2 根新 bar 不位移）；
- 取数 / 显隐测试见 `tests/priceLine.test.ts`（8 用例：4 取数 + 3 显隐 + 1 构造）。

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
pnpm install       # 固定版本：lightweight-charts 5.2.1 / vue 3.5.43
pnpm dev           # 开发（http://127.0.0.1:5210）
pnpm test          # vitest 单测（含拆分模块 splitModules.test.ts）
pnpm build         # vue-tsc 类型检查 + 构建
```

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

## GitHub Pages 在线预览

项目已内置 GitHub Pages 自动部署（`.github/workflows/pages.yml`，v1.7.1）：

- **部署地址**：`https://abulo.github.io/kline-chart-component/`（Pages 项目路径 = 仓库名，本仓库即 kline-chart-component）
- **触发**：push 到 `main` 分支（或仓库 Actions 页手动 Run workflow）
- **流程**：`pnpm install --frozen-lockfile` → `pnpm run build` → `actions/upload-pages-artifact` → `actions/deploy-pages`
- **首次启用（一次性）**：repo `Settings → Pages → Build and deployment → Source` 选择 `GitHub Actions`
- **环境**：node 24.16.0 + pnpm 12.15.0（`package.json` 的 `packageManager` 锁定 `pnpm@12.15.0`，Actions 用 `pnpm/action-setup@v4` 12.15.0 + `actions/setup-node@v4` node 24.16.0）
- **本地验证**：`pnpm run build` 后 `npx vite preview`，访问 `http://127.0.0.1:4173/kline-chart-component/`

> 包管理说明（v1.7.1）：项目使用 **pnpm**（删除 `package-lock.json`，锁定 `pnpm-lock.yaml`）；如需迁移回 npm，删掉 `pnpm-lock.yaml` 后 `npm install` 重新生成即可。
