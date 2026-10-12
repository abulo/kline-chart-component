/**
 * kLineChartController.ts —— 顶/底空 Pane + K 线 + 成交量 + 指标控制器（v1.4.17）
 *
 * 布局：一个 chart 内多 Pane（lightweight-charts 原生多 Pane，指标可开关）：
 *   指标开启（6 Pane）：
 *     pane0：顶部空 Pane（无数据，仅自绘"测试"文字，固定高度 24px，不可拖拽）
 *     pane1：K 线主图（Candlestick，红涨绿跌，上涨柱体空心）
 *     pane2：底部空 Pane（设置与 pane0 完全一致，高度绝对相等）
 *     pane3：成交量（自绘：上涨空心红柱 / 下跌绿实心，柱宽与间隔同 pane1 绝对一致）
 *     pane4：底部空 Pane（设置与 pane0 完全一致，高度绝对相等）
 *     pane5：附图指标（MACD：DIF / DEA 线 + 红绿柱，高度与 pane3 一致）
 *   指标关闭（4 Pane）：pane0..pane3（去掉 pane4 / pane5，main : volume = 80 : 20）
 *
 * 模块划分（每个 class 一个文件）：
 *  - layout.ts：布局常量（paneCount / fixedPaneCount / topPaneHeight / groupRatios
 *    等）与高度算法 calcPaneHeights；
 *  - candlestickWidth.ts：库源码原版 optimalCandlestickWidth（柱宽，与 pane1 同源）；
 *  - volumeBarPrimitive.ts / volumeBarPaneView.ts：成交量柱自绘；
 *  - testLabelPrimitive.ts / testLabelPaneView.ts：空 Pane"测试"文字；
 *  - indicators/macd.ts：MACD 指标计算（东方财富算法，纯函数）。
 *
 * 高度算法（指标开 60 : 20 : 20 / 指标关 80 : 20）：
 *   库实际可用高度 H = 容器高度 - 时间轴高度（库默认 28px，显隐按库状态）
 *                      - 分隔线总高（每 pane 间隔 1px）
 *   固定空 Pane 总高 = 固定 Pane 数量 × 24，剩余 R = H - 固定总高：
 *     指标开：pane0 = 24px、pane1 = 0.6×R；pane2 = 24px、pane3 = 0.2×R；
 *             pane4 = 24px、pane5 = 0.2×R
 *     指标关：pane0 = 24px、pane1 = 0.8×R；pane2 = 24px、pane3 = 0.2×R
 *   像素因子方案：stretchFactor 直接设为目标像素高度 → stretchPixels = 1
 *   → 非最后 pane = round(factor) 精确、最后 pane = 剩余 = 目标，无舍入误差；
 *   时间轴开 / 关仅影响 H（关时时间轴高度 = 0），组比例不变。
 *
 * 全局控制（全部由 App.vue 提供按钮）：
 *  - 时间轴开关：控制底部时间轴（timeScale）显示 / 隐藏；
 *  - 放大 / 缩小：全局 timeScale.barSpacing（图表内禁用滚轮/触摸缩放）；
 *  - 风格切换：深系 / 浅系；
 *  - 指标开关：动态创建 / 删除 pane4 / pane5（setShowIndicator，防内存泄漏：
 *    series 先 remove() 再 removePane）。
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
import {
  paneCount,
  paneCountWithoutIndicator,
  fixedPaneCount,
  fixedPaneCountWithoutIndicator,
  topPaneHeight,
  groupRatios,
  groupRatiosWithoutIndicator,
  calcPaneHeights,
} from './layout'
import { TestLabelPrimitive } from './testLabelPrimitive'
import { VolumeBarPrimitive } from './volumeBarPrimitive'
import { calcMacd } from './indicators/macd'

/**
 * MACD 指标配色（东方财富风格，深浅系通用不随主题变化）：
 *   DIF / DEA 线、MACD 柱红涨绿跌（柱 > 0 红、< 0 绿）
 */
const MACD_COLORS = {
  /** DIF 线 */
  difLine: '#A0A0A0',
  /** DEA 线 */
  deaLine: '#F4AA0A',
  /** MACD 柱上涨（> 0）红 */
  macdUp: '#FF0000',
  /** MACD 柱下跌（< 0）绿 */
  macdDown: '#008000',
} as const

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
  /** 指标 Pane（pane4 / pane5）初始状态：开启（默认 true）；可运行时切换 */
  showIndicator?: boolean
}

export class KLineChartController {
  /* ===== 图表 / 容器 ===== */
  private readonly chart: ReturnType<typeof createChart>
  private readonly container: HTMLElement

  /* ===== 数据 ===== */
  private readonly bars: BasicBar[]

  /* ===== series（pane0/pane2/pane4 空线 = 文字载体；pane1 K 线；pane3 成交量；pane5 指标） ===== */
  private klineSeries: ISeriesApi<'Candlestick'>
  private volumeSeries: ISeriesApi<'Histogram'>
  /** pane5 指标柱（Histogram，指标通用；开启时创建，关闭时销毁置 null） */
  private indicatorsBarSeries: ISeriesApi<'Histogram'> | null = null
  /** pane5 DIF 线（MACD 专属；开启时创建，关闭时销毁置 null） */
  private difSeries: ISeriesApi<'Line'> | null = null
  /** pane5 DEA 线（MACD 专属；开启时创建，关闭时销毁置 null） */
  private deaSeries: ISeriesApi<'Line'> | null = null

  /* ===== 状态 ===== */
  private theme: ChartThemeName
  /** 指标 Pane 开关状态（true = 显示 pane4 / pane5，false = 隐藏） */
  private showIndicator: boolean

  /** 容器尺寸监听：尺寸变化时重算固定 Pane 高度（24px） */
  private resizeObserver: ResizeObserver | null = null

  constructor(options: KLineChartOptions) {
    this.container = options.container
    this.showIndicator = options.showIndicator ?? true
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

    /* ---------- 3.3 pane4 / pane5：指标组（仅 showIndicator 开启时创建） ----------
     * 指标开启：pane4 底部空 Pane（自绘"测试"文字，设置与 pane0 一致）+
     *          pane5 MACD（DIF / DEA 线 + 红绿柱，高度与 pane3 一致）；
     * 指标关闭：不创建（4 Pane：pane0..pane3，main : volume = 80 : 20）。
     */
    if (this.showIndicator) {
      this.createIndicatorPanes()
    }

    /* ---------- 4. 高度分配：pane0 / pane2 / pane4 固定 24px（同一 factor，绝对相等），pane1 K 线，pane3 成交量 / pane5 指标 ---------- */
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
   * 创建指标组 Pane（pane4 空 Pane + pane5 指标内容 Pane）。
   *
   * 注意库 addSeries 行为：指定的 paneIndex 超出当前 pane 数量时，库自动
   * 创建中间缺失的 pane（pane4 / pane5 一次性补齐）。
   */
  private createIndicatorPanes = (): void => {
    /* pane4：底部空 Pane（自绘"测试"文字，设置与 pane0 一致） */
    this.chart.addSeries(
      LineSeries,
      {
        priceScaleId: 'left',
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      4,
    ).attachPrimitive(new TestLabelPrimitive('测试', () => themeColors(this.theme).textColor))

    /* pane5：MACD 指标（DIF / DEA 线 + 红绿柱，高度与 pane3 一致）
     * 库原生 series 渲染：
     *  - indicatorsBarSeries（Histogram，指标通用柱）：柱 > 0 红、< 0 绿（红涨绿跌，数据级 color）；
     *  - difSeries / deaSeries（Line）：DIF / DEA 线（固定配色，深浅系通用）。
     */
    this.indicatorsBarSeries = this.chart.addSeries(
      HistogramSeries,
      {
        priceScaleId: 'left',
        base: 0, // 柱从 0 轴绘制（正负双方向）
        priceLineVisible: false,
        lastValueVisible: false,
      },
      5,
    )
    this.difSeries = this.chart.addSeries(
      LineSeries,
      {
        priceScaleId: 'left',
        color: MACD_COLORS.difLine,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      5,
    )
    this.deaSeries = this.chart.addSeries(
      LineSeries,
      {
        priceScaleId: 'left',
        color: MACD_COLORS.deaLine,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      5,
    )
  }

  /**
   * 重算 pane 高度（指标开 60:20:20 / 指标关 80:20，像素因子方案）：
   *   指标开（6 Pane）：
   *     pane0 = 24px、pane1 = 0.6R（main 组）
   *     pane2 = 24px、pane3 = 0.2R（volume 组）
   *     pane4 = 24px、pane5 = 0.2R（indicator 组）
   *   指标关（4 Pane）：
   *     pane0 = 24px、pane1 = 0.8R（main 组）
   *     pane2 = 24px、pane3 = 0.2R（volume 组）
   *   R = 库可用高度 - 固定空 Pane 总高（时间轴开 / 关一致，仅 H 不同）
   *
   * 像素因子精确性（库 _adjustSizeImpl）：
   *   stretchFactor 直接设为目标像素高度 → totalStretch = Σ高度 = H
   *   → stretchPixels = H / Σ = 1 → 非最后 pane = round(factor×1) = factor 精确；
   *   最后 pane = 剩余 = 目标高度，同样精确。无舍入误差。
   */
  private applyStretchFactors = (): void => {
    const panes = this.chart.panes()
    if (panes.length < 2) return
    // 库实际可用高度 = 容器高度 - 时间轴高度（显隐按库当前状态） - 分隔线总高（每 pane 间隔 1px）
    const timeAxisHeight = this.chart.timeScale().options().visible ? LIBRARY_TIME_AXIS_HEIGHT : 0
    const separatorHeight = panes.length - 1
    const usableHeight = this.container.clientHeight - timeAxisHeight - separatorHeight
    // 指标开启：3 个固定空 Pane、60:20:20；指标关闭：2 个固定空 Pane、80:20
    const fixedCount = this.showIndicator ? fixedPaneCount : fixedPaneCountWithoutIndicator
    const ratios = this.showIndicator ? groupRatios : groupRatiosWithoutIndicator
    const paneHeights = calcPaneHeights(usableHeight, topPaneHeight, fixedCount, ratios)
    panes.forEach((pane, index) => pane.setStretchFactor(paneHeights[index]))
  }

  /* ===================== 数据 ===================== */

  /** K 线 / 成交量 / MACD 数据写入 */
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
    // MACD：DIF / DEA 线 + 红绿柱（柱 > 0 红、< 0 绿，数据级 color）；
    // 仅指标开启时写入（series 关闭时已销毁，判空防误用）
    if (this.indicatorsBarSeries && this.difSeries && this.deaSeries) {
      const macdPoints = calcMacd(this.bars)
      this.indicatorsBarSeries.setData(
        macdPoints.map((point) => ({
          time: point.time as UTCTimestamp,
          value: point.macd,
          color: point.macd >= 0 ? MACD_COLORS.macdUp : MACD_COLORS.macdDown,
        })),
      )
      this.difSeries.setData(
        macdPoints.map((point) => ({ time: point.time as UTCTimestamp, value: point.dif })),
      )
      this.deaSeries.setData(
        macdPoints.map((point) => ({ time: point.time as UTCTimestamp, value: point.dea })),
      )
    }
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

  /** 时间轴开关：切换显隐后重算 pane 高度（时间轴高度占用随之变化，保证固定空 Pane 仍绝对相等） */
  toggleTimeAxis = (visible: boolean): void => {
    this.chart.timeScale().applyOptions({ visible })
    this.applyStretchFactors()
  }

  /** 指标开关：动态创建 / 删除 indicator 组（pane4 / pane5），布局随之切换 60:20:20 ⇄ 80:20 */
  setShowIndicator = (visible: boolean): void => {
    if (this.showIndicator === visible) return
    this.showIndicator = visible
    if (visible) {
      // 开：重建 pane4 / pane5（addSeries 指定 paneIndex 自动补齐缺失 pane），重算指标数据
      this.createIndicatorPanes()
      this.applyData()
    } else {
      // 关：移除 indicator 组两个 Pane（pane4 / pane5）。
      // 库 removePane 从 panes 数组 splice，pane 上 series（含 primitive）的强引用
      // 随之断开可被 GC；控制器再置 null 解除自身引用，保证反复开关无内存泄漏。
      // removePane(4) 两次：删 pane4 后原 pane5 顺移到 index 4，再删一次即移除整组。
      this.chart.removePane(4)
      this.chart.removePane(4)
      this.indicatorsBarSeries = null
      this.difSeries = null
      this.deaSeries = null
    }
    // 布局重排：pane 数量变化后按新比例分配（指标开 60:20:20 / 指标关 80:20）
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
