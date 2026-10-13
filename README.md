# 多 Pane K 线组件（Vue3 + TypeScript + lightweight-charts v5）

> **当前版本：v1.4.50（2026-10-13）**
> 版本号遵循语义化版本（主.次.修订），同步于 `package.json` version、App.vue 底部 hint、CHANGELOG.md，交付 zip 文件名带版本号。

多 Pane K 线组件：一个 `chart` 内多 Pane（lightweight-charts v5 原生多 Pane），包含顶部空 Pane（"测试"文字）、K 线主图、成交量、附图指标（MACD），指标 Pane 可动态开关。

---

## 一、布局结构

指标**开启**（6 Pane，`main : volume : indicator = 60 : 20 : 20`）：

```
┌──────────────────────────────────────┐
│ pane0  空 Pane（"测试"文字，固定 22px） │
│ pane1  K 线主图（Candlestick）         │  ← main 组 60%
│ pane2  空 Pane（"测试"文字，固定 22px） │
│ pane3  成交量（自绘红绿柱）             │  ← volume 组 20%
│ pane4  空 Pane（"测试"文字，固定 22px） │
│ pane5  MACD（DIF/DEA 线 + 红绿柱）      │  ← indicator 组 20%
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
- **内容 Pane 边框**（`PaneBorderPrimitive`）：pane1 / pane3 / pane5 自绘 1px 直角矩形边框，颜色随主题；
- **最高 / 最低价标注**（`HighLowMarkerPrimitive` + `HighLowMarkerPaneView`）：pane1 可视区域内 high 最大 / low 最小的 bar —— 最高价 12px 黄色文字标注在柱顶上方、最低价 12px 蓝色文字标注在柱底下方，各带同色实线从文字块连到柱体上 / 下边缘中间；随平移 / 缩放实时重算、文字左右不越界；颜色深浅系区分（theme.highMarkerColor / lowMarkerColor）；
- **空 Pane "测试"文字**（`TestLabelPrimitive`）：垂直居中、距左 6px、跟随主题文字色。

## 三、全局控制（App.vue 工具栏）

| 按钮 | 功能 |
|---|---|
| 指标开/关 | 动态创建 / 删除 pane4 / pane5（布局 60:20:20 ⇄ 80:20） |
| 时间轴开/关 | 底部时间轴显示 / 隐藏（重算 pane 高度） |
| 左刻度开/关 | 左刻度区显隐（所有 Pane 统一，宽度 72px，切换后 fitContent） |
| 右刻度开/关 | 右刻度区显隐（同左） |
| 缩小 / 放大 | X 轴 `barSpacing` 全局缩放（限幅 2~80） |
| 浅系 / 深系 | 主题切换（颜色全集中在 `chart/core/theme.ts`） |

图表内禁止滚轮 / 双指 / 拖轴缩放（`handleScale` 全关），缩放仅由按钮控制；平移保留。

## 四、目录结构

```
src/
├── App.vue                    # 工具栏 + 容器（80% 宽高居中）
├── main.ts                    # 入口
├── components/
│   └── KLineChart.vue         # 图表组件（挂载控制器，expose controller）
├── chart/                     # 按功能分组的图表源码
│   ├── core/                  # 核心：控制器 / 布局 / 主题 / mock / 蜡烛宽度
│   │   ├── KLineChartController.ts # 控制器：Pane 创建 / 布局 / 主题 / 数据 / 十字星联动
│   │   ├── layout.ts          # 布局常量与高度计算（60/20/20 ⇄ 80/20）
│   │   ├── theme.ts           # 深系 / 浅系主题（所有颜色集中）+ MACD 指标配色
│   │   ├── mock.ts            # mock 数据（日 K，纯函数可单测）
│   │   └── candlestickWidth.ts# 蜡烛 / 柱体宽度（库原版 optimalCandlestickWidth）
│   ├── axis/                  # 左刻度标签（与栅格横线对齐，文字与指示值一致）
│   │   ├── axisLabelPrimitive.ts
│   │   ├── axisLabelView.ts
│   │   └── axisLabelPaneView.ts  # 自绘渲染 + 公共 drawAxisLabel（指示值共用）
│   ├── crosshair/             # 十字星左刻度指示值（文字与刻度标签一致）
│   │   ├── crosshairAxisLabelPrimitive.ts
│   │   └── crosshairAxisLabelPaneView.ts
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
│   ├── indicator/             # 附图指标（MACD 计算 + 柱体自绘）
│   │   ├── macd.ts            # MACD 计算（东方财富口径，纯函数）
│   │   ├── macdBarPrimitive.ts
│   │   └── macdBarPaneView.ts
│   ├── overlay/               # pane0 顶层遮罩（遮住十字星竖线）
│   │   ├── topPaneOverlayPrimitive.ts
│   │   └── topPaneOverlayPaneView.ts
│   ├── testLabel/             # 空 Pane "测试" 文字自绘
│   │   ├── testLabelPrimitive.ts
│   │   └── testLabelPaneView.ts
│   └── util/
│       └── format.ts          # 数值格式化（价格 / 成交量 / 指标刻度）
└── types/
    └── chart.ts               # 统一数据点类型（保留，供后端接入）
tests/
├── mock.test.ts               # mock 数据单测
├── theme.test.ts              # 主题 / 配色单测
├── candlestickWidth.test.ts   # 蜡烛宽度单测
├── macd.test.ts               # MACD 计算单测
├── multipane.test.ts          # 布局常量 / 高度算法单测
└── util.test.ts               # 格式化函数单测
```

## 五、运行

```bash
npm install        # 固定版本：lightweight-charts 5.2.1 / vue 3.5.43
npm run dev        # 开发（http://127.0.0.1:5210）
npm run test       # vitest 单测（43 项）
npm run build      # vue-tsc 类型检查 + 构建
```

注意：`node_modules` 安装后需运行 `npm run patch`（若已配置）或手动应用库分隔线 patch
（`scripts/patch-lwc-separator.js`，SeparatorHeight 1 → 0，幂等），否则 Pane 间会出现 1px 分隔线。

## 六、内存与性能

- **primitive 视图单例复用**：所有 primitive 的 `paneViews()` / `priceAxisPaneViews()` 返回构造时创建的单例视图，避免每帧 `new` 对象产生 GC 压力；
- **渲染裁剪**：成交量 / MACD 柱自绘按可见逻辑范围（`getVisibleLogicalRange`）裁剪，仅遍历可视柱体，不遍历全量数据；
- **生命周期**：controller `destroy()` 移除十字星监听、断开 ResizeObserver、`chart.remove()`、清除容器标记；指标关闭时 series 先 `removePane` 再置 null；primitive `detached()` 清空引用；
- **实例保护**：容器 `dataset.lwcMounted` 标记防止重复创建 chart 实例。

## 七、固定依赖版本

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

## 八、后续规划（用户逐步提出）

- 附图指标扩展（RSI / KDJ / WR / DMI / BIAS / OBV / CCI / ROC / CR）
- K 线主图指标（MA / EXPMA / BOLL / SAR / BBI）
- 分时线（1d~5d）与周期切换
- 数据服务接入（HTTP / SSE / WebSocket，`types/chart.ts` 数据点结构已预留）
