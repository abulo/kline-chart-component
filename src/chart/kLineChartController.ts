/**
 * kLineChartController.ts —— 顶/底空 Pane + K 线 + 成交量控制器（v1.4.9）
 *
 * 布局：一个 chart 内 4 个 Pane（lightweight-charts 原生多 Pane）：
 *   pane0：顶部空 Pane（无数据，仅自绘"测试"文字，固定高度 24px，不可拖拽）
 *   pane1：K 线主图（Candlestick，红涨绿跌，上涨柱体空心）
 *   pane2：底部空 Pane（设置与 pane0 完全一致，高度绝对相等）
 *   pane3：成交量（自绘：上涨空心红柱 / 下跌绿实心，柱宽与间隔同 pane1 绝对一致）
 *
 * 模块划分（每个 class 一个文件）：
 *  - layout.ts：布局常量（paneCount / topPaneHeight / volumeRatio）与高度算法
 *    calcPaneFactors；
 *  - candlestickWidth.ts：官方原版 optimalCandlestickWidth（柱宽，与 pane1 同源）；
 *  - volumeBarPrimitive.ts / volumeBarPaneView.ts：成交量柱自绘；
 *  - testLabelPrimitive.ts / testLabelPaneView.ts：空 Pane"测试"文字。
 *
 * 高度算法（pane0 与 pane2 使用同一 stretchFactor，绝对相等）：
 *   库实际可用高度 H = 容器高度 - 时间轴高度（库默认 28px，显隐按库状态）
 *                      - 分隔线总高（每 pane 间隔 1px）
 *   stretchPixels S = (H - 2×24) / (1 + 0.25)
 *   pane0 : pane1 : pane2 : pane3 = f : 1 : f : 0.25，f = 24 / S
 *   （数学恒等：f×S = 24，pane0 = pane2 = 24 绝对相等；
 *     K 线 round 误差由最后的成交量 Pane 吸收）
 *
 * 全局控制（全部由 App.vue 提供按钮）：
 *  - 时间轴开关：控制底部时间轴（timeScale）显示 / 隐藏；
 *  - 放大 / 缩小：全局 timeScale.barSpacing（图表内禁用滚轮/触摸缩放）；
 *  - 风格切换：深系 / 浅系。
 *
 * 生命周期：实例保护（container dataset 标记防重复创建 chart）；
 * ResizeObserver 跟随容器尺寸重算 pane 高度；destroy 销毁（防内存泄漏）。
 */

import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { themeColors, chartFontFamily, type ChartThemeName } from './theme'
import { genMockBars, type BasicBar } from './mock'
import { paneCount, topPaneHeight, volumeRatio, calcPaneFactors } from './layout'
import { TestLabelPrimitive } from './testLabelPrimitive'
import { VolumeBarPrimitive } from './volumeBarPrimitive'

/**
 * 库系统默认时间轴高度（px）。
 * 非用户参数：lightweight-charts v5.2.1 时间轴为库内部固定渲染（无公开配置），
 * 高度 = borderSize(1) + tickLength(5) + fontSize(12) + paddingTop(3) +
 * paddingBottom(3) + labelBottomOffset(4) = 28（fontSize=12 时，偶数化后不变）。
 * 布局换算必须扣除该高度，否则固定 Pane 的实际像素高度与目标不符。
 */
const LIBRARY_TIME_AXIS_HEIGHT = 28

/** 控制器选项 */
export interface KLineChartOptions {
  /** 图表挂载容器（需有确定宽高） */
  container: HTMLElement
}

export class KLineChartController {
  /* ===== 图表 / 容器 ===== */
  private readonly chart: ReturnType<typeof createChart>
  private readonly container: HTMLElement

  /* ===== 数据 ===== */
  private readonly bars: BasicBar[]

  /* ===== series（pane0/pane2 空线 = 文字载体；pane1 K 线；pane3 成交量） ===== */
  private klineSeries: ISeriesApi<'Candlestick'>
  private volumeSeries: ISeriesApi<'Histogram'>

  /* ===== 状态 ===== */
  private theme: ChartThemeName

  /** 容器尺寸监听：尺寸变化时重算固定 Pane 高度（24px） */
  private resizeObserver: ResizeObserver | null = null

  constructor(options: KLineChartOptions) {
    this.container = options.container
    this.theme = 'dark'

    /* ---------- 0. 实例保护：容器打标记防重复创建 chart 实例 ----------
     * 组件重复挂载 / HMR / 路由切换时可能再次进入构造；标记在 destroy 时清除，
     * 保证同一容器同一时刻只有一个 chart 实例（防止内存泄漏与布局错乱）。
     */
    if (this.container.dataset.lwcMounted === 'true') {
      throw new Error('KLineChartController: 容器已挂载 chart 实例，禁止重复创建')
    }
    this.container.dataset.lwcMounted = 'true'

    /* ---------- 1. 创建 chart ---------- */
    const initialThemeColors = themeColors(this.theme)
    this.chart = createChart(this.container, {
      autoSize: true, // 自动跟随容器尺寸
      layout: {
        background: { type: ColorType.Solid, color: initialThemeColors.background },
        textColor: initialThemeColors.textColor,
        fontSize: 12,
        fontFamily: chartFontFamily,
        attributionLogo: false,
        panes: {
          enableResize: false, // Pane 高度不可拖拽（由代码固定比例）
          // 分隔线颜色 = 背景色（视觉上不设置分割线）
          separatorColor: initialThemeColors.background,
          separatorHoverColor: initialThemeColors.background,
        },
      },
      // 十字星：Normal 模式 = 横竖线自由跟随鼠标（不吸附数据点）
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      // 栅格化关闭：纵向 / 横向栅格线全部隐藏
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      // 图表区域内禁止缩放（滚轮 / 双指捏合 / 按住坐标轴拖动 / 双击重置全部关闭），
      // 缩放仅由工具栏按钮控制；平移（拖动）保留
      handleScale: {
        mouseWheel: false,
        pinch: false,
        axisPressedMouseMove: false,
        axisDoubleClickReset: false,
      },
      // 左右刻度区隐藏：数据区域铺满整个宽度
      rightPriceScale: {
        visible: false,
        borderVisible: false,
      },
      leftPriceScale: {
        visible: false,
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        allowBoldLabels: false,
      },
    })

    /* ---------- 2. pane0：顶部空 Pane（无数据，自绘"测试"文字） ---------- */
    this.chart.addSeries(
      LineSeries,
      {
        priceScaleId: 'left',
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      0,
    ).attachPrimitive(new TestLabelPrimitive('测试', () => themeColors(this.theme).textColor))

    /* ---------- 3. pane1：K 线主图（红涨绿跌；上涨柱体空心） ----------
     * 空心实现：上涨（up）柱体填充色 = 图表背景色（视觉空心），
     * 边框 / 影线保留红色；下跌（down）柱体绿色实心。
     */
    this.klineSeries = this.chart.addSeries(
      CandlestickSeries,
      {
        priceScaleId: 'left',
        upColor: initialThemeColors.background, // 上涨柱体填充 = 背景色（空心）
        downColor: initialThemeColors.downColor,
        borderUpColor: initialThemeColors.upColor, // 上涨边框红色
        borderDownColor: initialThemeColors.downColor,
        wickUpColor: initialThemeColors.upColor, // 上涨影线红色
        wickDownColor: initialThemeColors.downColor,
        priceLineVisible: false,
        lastValueVisible: false,
      },
      1,
    )

    /* ---------- 3.1 pane2：底部空 Pane（无数据，自绘"测试"文字，设置与 pane0 一致） ---------- */
    this.chart.addSeries(
      LineSeries,
      {
        priceScaleId: 'left',
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      2,
    ).attachPrimitive(new TestLabelPrimitive('测试', () => themeColors(this.theme).textColor))

    /* ---------- 3.2 pane3：成交量（自绘柱体，视觉与 pane1 完全一致） ----------
     * HistogramSeries 仅作数据锚点：color = 背景色（不可见），
     * 用于建立 Y 轴（volume 值域）的 scale 范围；
     * 可见柱体由 VolumeBarPrimitive 自绘：
     *   上涨（close >= open）：空心红柱（背景填充 + 红框，同 pane1 上涨柱）
     *   下跌：绿色实心（同 pane1 下跌柱）
     *   柱宽 = optimalCandlestickWidth(barSpacing, dpr)（与 pane1 同函数，
     *   宽度 / 间隔绝对一致）
     */
    this.volumeSeries = this.chart.addSeries(
      HistogramSeries,
      {
        priceScaleId: 'left',
        base: 0,
        color: initialThemeColors.background, // 不可见（仅建 scale）
        priceLineVisible: false,
        lastValueVisible: false,
      },
      3,
    )
    this.volumeSeries.attachPrimitive(
      new VolumeBarPrimitive(() => this.bars, () => themeColors(this.theme)),
    )

    /* ---------- 4. 高度分配：pane0 / pane2 固定 24px（同一 factor，绝对相等），pane1 K 线，pane3 成交量 ---------- */
    this.applyStretchFactors()

    /* ---------- 5. 数据 + 首绘 ---------- */
    this.bars = genMockBars(120)
    this.applyData()
    this.chart.timeScale().fitContent()

    /* ---------- 6. 容器尺寸监听：重算固定 Pane 高度（24px） ---------- */
    this.resizeObserver = new ResizeObserver(() => this.applyStretchFactors())
    this.resizeObserver.observe(this.container)
  }

  /* ===================== 布局 ===================== */

  /**
   * 重算 pane 高度：
   *   pane0 / pane2 = 24px（同一 stretchFactor，绝对相等）
   *   pane1（K 线）    = 1
   *   pane3（成交量）   = volumeRatio（0.25，相对 K 线）
   *
   * 精确相等的数学依据（库 _adjustSizeImpl）：
   *   库按 totalPaneHeight / Σfactor 分配，最后一个 pane 高度 = 剩余（吸收舍入）。
   *   stretchPixels S = (H - 2×fixed) / (1 + ratio)，
   *   fixedFactor = fixed / S → fixedFactor × S = fixed 精确，
   *   故 pane0 = round(fixed) = fixed、pane2 = round(fixed) = fixed，绝对相等；
   *   K 线 round 误差由最后的成交量 Pane 吸收。
   */
  private applyStretchFactors = (): void => {
    const panes = this.chart.panes()
    if (panes.length < paneCount) return
    // 库实际可用高度 = 容器高度 - 时间轴高度（显隐按库当前状态） - 分隔线总高（每 pane 间隔 1px）
    const timeAxisHeight = this.chart.timeScale().options().visible ? LIBRARY_TIME_AXIS_HEIGHT : 0
    const separatorHeight = panes.length - 1
    const usableHeight = this.container.clientHeight - timeAxisHeight - separatorHeight
    const { fixedFactor, klineFactor, volumeFactor } = calcPaneFactors(usableHeight, topPaneHeight, volumeRatio)
    panes[0].setStretchFactor(fixedFactor)
    panes[1].setStretchFactor(klineFactor)
    panes[2].setStretchFactor(fixedFactor)
    panes[3].setStretchFactor(volumeFactor)
  }

  /* ===================== 数据 ===================== */

  /** K 线与成交量数据写入 */
  private applyData = (): void => {
    this.klineSeries.setData(
      this.bars.map((bar) => ({
        time: bar.time as UTCTimestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    )
    // 成交量：Histogram 仅作 scale 锚点，颜色统一走 options.color（背景色，不可见），
    // 主题切换时由 applyTheme 同步更新；可见柱体由 VolumeBarPrimitive 按 bars 自绘
    this.volumeSeries.setData(
      this.bars.map((bar) => ({
        time: bar.time as UTCTimestamp,
        value: bar.volume,
      })),
    )
  }

  /* ===================== 对外 API ===================== */

  /** 主题切换（深系 / 浅系）：不改变 X 轴视口 / 布局尺寸 */
  applyTheme = (name: ChartThemeName): void => {
    this.theme = name
    const themeColorSet = themeColors(name)
    this.chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: themeColorSet.background },
        textColor: themeColorSet.textColor,
        panes: {
          // 分隔线颜色跟随背景（保持分割线不可见）
          separatorColor: themeColorSet.background,
          separatorHoverColor: themeColorSet.background,
        },
      },
      // 栅格保持关闭
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
    })
    // K 线换色（上涨柱体填充跟随背景色保持空心）
    this.klineSeries.applyOptions({
      upColor: themeColorSet.background, // 空心填充 = 新主题背景色
      downColor: themeColorSet.downColor,
      borderUpColor: themeColorSet.upColor,
      borderDownColor: themeColorSet.downColor,
      wickUpColor: themeColorSet.upColor,
      wickDownColor: themeColorSet.downColor,
    })
    // 成交量锚点色跟随背景（保持不可见）；可见柱体由 primitive 动态取新主题色
    this.volumeSeries.applyOptions({ color: themeColorSet.background })
    // 空 Pane 文字颜色在 draw 时动态取色，applyOptions 触发重绘即自动更新
  }

  /** 放大（X 轴 barSpacing ×1.25，限幅） */
  zoomIn = (): void => {
    const timeScaleApi = this.chart.timeScale()
    const barSpacing = timeScaleApi.options().barSpacing
    timeScaleApi.applyOptions({ barSpacing: Math.min(barSpacing * 1.25, 80) })
  }

  /** 缩小（X 轴 barSpacing ÷1.25，限幅） */
  zoomOut = (): void => {
    const timeScaleApi = this.chart.timeScale()
    const barSpacing = timeScaleApi.options().barSpacing
    timeScaleApi.applyOptions({ barSpacing: Math.max(barSpacing / 1.25, 2) })
  }

  /** 时间轴开关：切换显隐后重算 pane 高度（时间轴高度占用随之变化，保证 pane0/pane2 仍绝对相等） */
  toggleTimeAxis = (visible: boolean): void => {
    this.chart.timeScale().applyOptions({ visible })
    this.applyStretchFactors()
  }

  /** 销毁：移除监听 / chart / 清除实例标记（防内存泄漏） */
  destroy = (): void => {
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.chart.remove()
    this.container.dataset.lwcMounted = 'false'
  }
}
