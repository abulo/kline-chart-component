/**
 * kLineChartController.ts —— 空 Pane + K 线 + 成交量 + 指标多 Pane 控制器（v1.4.57）
 *
 * 布局：一个 chart 内多 Pane（lightweight-charts 原生多 Pane，指标可开关）：
 *   指标开启（6 Pane）：
 *     pane0：顶部空 Pane（无数据，仅自绘"测试"文字，固定高度 22px，不可拖拽）
 *     pane1：K 线主图（Candlestick，红涨绿跌，上涨柱体空心；可叠加 MA/EXPMA/BOLL/SAR/BBI）
 *     pane2：空 Pane（设置与 pane0 完全一致，高度绝对相等）
 *     pane3：成交量（自绘：上涨空心红柱 / 下跌绿实心，柱宽与间隔同 pane1 绝对一致）
 *     pane4：空 Pane（设置与 pane0 完全一致，高度绝对相等）
 *     pane5：附图指标（MACD：DIF / DEA 线 + 红绿柱，高度与 pane3 一致）
 *   指标关闭（4 Pane）：pane0..pane3（去掉 pane4 / pane5，main : volume = 80 : 20）
 *
 * 模块划分（每个 class 一个文件）：
 *  - layout.ts：布局常量（paneCount / fixedPaneCount / topPaneHeight / groupRatios
 *    等）与高度算法 calcPaneHeights；
 *  - candlestickWidth.ts：库源码原版 optimalCandlestickWidth（柱宽，与 pane1 同源）；
 *  - volume/：成交量柱自绘（VolumeBarPrimitive + VolumeBarPaneView）；
 *  - overlay/：pane0 顶层遮罩（背景色覆盖十字星竖线，实现"十字星不贯穿 pane0"）；
 *  - testLabel/：空 Pane"测试"文字自绘；
 *  - indicator/：东财指标库（index.ts 统一出口，主图五指标 + 附图 + 分时），
 *    MACD 柱 / SAR 圆点由自绘 primitive（macdBarPrimitive / sarMarkerPrimitive）渲染；
 *  - axis/：左刻度标签自绘（与栅格横线对齐）+ 十字星指示值自绘；
 *  - grid/：固定等分栅格（竖 4 / 横按 pane 配置）自绘；
 *  - highLow/：pane1 可视区最高 / 最低价标注（黄色 / 蓝色 + 连接线）。
 *
 * 高度算法（指标开 60 : 20 : 20 / 指标关 80 : 20）：
 *   库实际可用高度 H = 容器高度 - 时间轴高度（库默认 28px，显隐按库状态）
 *                      - 分隔线总高（patch-lwc-separator.js 已将 SeparatorHeight 1→0）
 *   固定空 Pane 总高 = 固定 Pane 数量 × 22（topPaneHeight），剩余 R = H - 固定总高：
 *     指标开：pane0 = 22px、pane1 = 0.6×R；pane2 = 22px、pane3 = 0.2×R；
 *             pane4 = 22px、pane5 = 0.2×R
 *     指标关：pane0 = 22px、pane1 = 0.8×R；pane2 = 22px、pane3 = 0.2×R
 *   像素因子方案：stretchFactor 直接设为目标像素高度 → stretchPixels = 1
 *   → 非最后 pane = round(factor) 精确、最后 pane = 剩余 = 目标，无舍入误差；
 *   时间轴开 / 关仅影响 H（关时时间轴高度 = 0），组比例不变。
 *
 * 全局控制（全部由 App.vue 提供按钮）：
 *  - 时间轴开关：控制底部时间轴（timeScale）显示 / 隐藏；
 *  - 放大 / 缩小 / 左移 / 右移：全局 timeScale 操作（图表内禁用滚轮/触摸缩放）；
 *  - 风格切换：深系 / 浅系（theme.ts 统一配色，红涨绿跌锁定）；
 *  - 左 / 右刻度区开关：显隐全部 Pane 的 price scale（宽度一致 72px，无边框）；
 *  - 指标开关：动态创建 / 删除 pane4 / pane5（setShowIndicator，防内存泄漏：
 *    series 先 removePane 再置 null）；
 *  - 主图指标（互斥）：MA / EXPMA / BOLL / SAR / BBI（pane1 叠加，东财指标库，
 *    setMainIndicator：切换时先 removeSeries 清空，SAR 用 SarMarkerPrimitive 显隐控制）。
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
  type BarPrice,
  type MouseEventParams,
} from 'lightweight-charts'
import { themeColors, macdColors, mainIndicatorColors, chartFontFamily, chartFont, type ChartThemeName } from './theme'
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
import { TestLabelPrimitive } from '../testLabel/testLabelPrimitive'
import { TopPaneOverlayPrimitive } from '../overlay/topPaneOverlayPrimitive'
import { HighLowMarkerPrimitive } from '../highLow/highLowMarkerPrimitive'
import { VolumeBarPrimitive } from '../volume/volumeBarPrimitive'
import { MacdBarPrimitive, type MacdPoint } from '../indicator/macdBarPrimitive'
import { SarMarkerPrimitive } from '../indicator/sarMarkerPrimitive'
import { PaneBorderPrimitive } from '../border/paneBorderPrimitive'
import { GridPrimitive } from '../grid/gridPrimitive'
import {
  calcMA,
  calcEXPMA,
  calcBOLL,
  calcSAR,
  calcBBI,
  calcMACD,
  type IndicatorLine,
  type SarPoint,
} from '../indicator'
import { formatVolume, formatPrice, formatAxisSmart } from '../util/format'
import { AxisLabelPrimitive } from '../axis/axisLabelPrimitive'
import { CrosshairAxisLabelPrimitive } from '../crosshair/crosshairAxisLabelPrimitive'

/**
 * 主图指标名称（pane1 叠加线；互斥，同一时刻仅一个）：
 *  MA / EXPMA / BOLL / SAR / BBI，null = 关闭
 */
export type MainIndicatorName = 'ma' | 'expma' | 'boll' | 'sar' | 'bbi'

/**
 * 指标 Pane 布局说明：
 *   pane5 = MACD（DIF / DEA 线 + 红绿柱，高度与 pane3 一致）
 * 线色取 theme.macdColors（集中管理）；柱体红绿由 MacdBarPrimitive 自绘。
 */

/**
 * 库系统默认时间轴高度（px）。
 * 非用户参数：lightweight-charts v5.2.1 时间轴为库内部固定渲染（无公开配置），
 * 高度 = borderSize(1) + tickLength(5) + fontSize(12) + paddingTop(3) +
 * paddingBottom(3) + labelBottomOffset(4) = 28（fontSize=12 时，偶数化后不变）。
 * 布局换算必须扣除该高度，否则固定 Pane 的实际像素高度与目标不符。
 */
const LIBRARY_TIME_AXIS_HEIGHT = 28
/** 左右刻度区最小宽度（打开时固定宽度，左右一致；单位 px） */
const PRICE_SCALE_MIN_WIDTH = 72

/** 控制器选项 */
export interface KLineChartOptions {
  /** 图表挂载容器（需有确定宽高） */
  container: HTMLElement
  /** 指标 Pane（pane4 / pane5）初始状态：开启（默认 true）；可运行时切换 */
  showIndicator?: boolean
  /** 股票名称（pane0 顶部信息行显示：名称 [代码]） */
  name?: string
  /** 股票代码（pane0 顶部信息行显示：名称 [代码]） */
  symbol?: string
}

export class KLineChartController {
  /* ===== 图表 / 容器 ===== */
  private readonly chart: ReturnType<typeof createChart>
  private readonly container: HTMLElement

  /* ===== 数据 ===== */
  private readonly bars: BasicBar[]
  /** 股票名称（pane0 顶部信息行显示） */
  private readonly name: string
  /** 股票代码（pane0 顶部信息行显示） */
  private readonly symbol: string
  /** MACD 指标点缓存（applyData 计算一次，自绘 primitive 与 series 共用） */
  private macdPoints: MacdPoint[] = []

  /* ===== series（pane0/pane2/pane4 空线 = 文字载体；pane1 K 线；pane3 成交量；pane5 指标） ===== */
  private klineSeries: ISeriesApi<'Candlestick'>
  private volumeSeries: ISeriesApi<'Histogram'>
  /** pane5 指标柱（Histogram，指标通用；开启时创建，关闭时销毁置 null） */
  private indicatorsBarSeries: ISeriesApi<'Histogram'> | null = null
  /** pane5 DIF 线（MACD 专属；开启时创建，关闭时销毁置 null） */
  private difSeries: ISeriesApi<'Line'> | null = null
  /** pane5 DEA 线（MACD 专属；开启时创建，关闭时销毁置 null） */
  private deaSeries: ISeriesApi<'Line'> | null = null
  /** 各内容 Pane 的十字星左刻度指示值 primitive（pane1 / pane3 常驻，pane5 随指标开关增删） */
  private crosshairAxisLabelPrimitives: CrosshairAxisLabelPrimitive[] = []
  /** pane1 主图指标线（当前激活指标的 LineSeries 集合；互斥，切换时清空重建） */
  private mainIndicatorSeries: ISeriesApi<'Line'>[] = []
  /** SAR 圆点数据缓存（SarMarkerPrimitive 自绘现取；每次开启指标时全量重算） */
  private sarPoints: SarPoint[] = []
  /** SAR 圆点自绘 primitive（挂在 klineSeries 上，visible 控制显隐，复用单例防泄漏） */
  private sarMarkerPrimitive: SarMarkerPrimitive | null = null

  /* ===== 状态 ===== */
  private theme: ChartThemeName
  /** 当前激活的主图指标（null = 关闭；互斥，同一时刻仅一个） */
  private mainIndicator: MainIndicatorName | null = null
  /** 指标 Pane 开关状态（true = 显示 pane4 / pane5，false = 隐藏） */
  private showIndicator: boolean
  /** 左刻度区开关状态（true = 显示左侧刻度，false = 隐藏；默认关） */
  private showLeftScale: boolean
  /** 右刻度区开关状态（true = 显示右侧刻度，false = 隐藏；默认关） */
  private showRightScale: boolean

  /** 容器尺寸监听：尺寸变化时重算固定 Pane 高度（topPaneHeight） */
  private resizeObserver: ResizeObserver | null = null

  constructor(options: KLineChartOptions) {
    this.container = options.container
    this.showIndicator = options.showIndicator ?? true
    this.showLeftScale = false
    this.showRightScale = false
    this.theme = 'dark'
    // 股票信息（pane0 顶部信息行显示，格式：名称 [代码]）
    this.name = options.name ?? ''
    this.symbol = options.symbol ?? ''

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
        // 时间轴（X 轴）十字星指示值标签：背景跟随深浅系 crosshairLabelBackground
        // （文字颜色由库按背景亮度自动对比：深背景白字 / 浅背景黑字）
        vertLine: {
          labelBackgroundColor: initialThemeColors.crosshairLabelBackground,
        },
        horzLine: {
          labelBackgroundColor: initialThemeColors.crosshairLabelBackground,
        },
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
    ).attachPrimitive(
      // pane0 顶层遮罩（topPaneViews）：背景填充 + 股票信息文字，绘制在十字星之上，
      // 借此遮住十字星竖线（实现"十字星不贯穿 pane0"）；文字 = "股票名称 [代码]"
      new TopPaneOverlayPrimitive(
        this.symbol ? `${this.name} [${this.symbol}]` : this.name || '测试',
        () => themeColors(this.theme).background,
        () => themeColors(this.theme).textColor,
      ),
    )

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
        // 隐藏库刻度标签（刻度区保留）：刻度值由 AxisLabelPrimitive 自绘并与栅格横线对齐
        priceFormat: {
          type: 'custom',
          formatter: () => '',
        },
      },
      1,
    )
    // 内容 Pane 边框（pane1）：自绘 1px 矩形，颜色随主题（深浅系区分）
    this.klineSeries.attachPrimitive(
      new PaneBorderPrimitive(() => themeColors(this.theme).paneBorder),
    )
    // pane1 栅格：竖 4 等分；横向等分数随指标开关变化（关 8 / 开 6）
    this.klineSeries.attachPrimitive(
      new GridPrimitive({
        getColor: () => themeColors(this.theme).grid,
        getHorizontalCount: () => (this.showIndicator ? 6 : 8),
      }),
    )
    // pane1 左刻度标签：与栅格横线对齐（值 = 横线处价格，K 线价格 2 位小数）
    this.klineSeries.attachPrimitive(
      new AxisLabelPrimitive({
        series: this.klineSeries,
        getPaneIndex: () => 1,
        getHorizontalCount: () => (this.showIndicator ? 6 : 8),
        getColor: () => themeColors(this.theme).textColor,
        getBackColor: () => themeColors(this.theme).background,
        getFont: () => chartFont,
        format: (price) => formatPrice(price),
      }),
    )
    // pane1 十字星左刻度指示值：十字星横线所在价格（K 线价格 2 位小数）
    const pane1CrosshairLabel = new CrosshairAxisLabelPrimitive({
      series: this.klineSeries,
      getPaneIndex: () => 1,
      getColor: () => themeColors(this.theme).crosshairLabelText,
      getBackColor: () => themeColors(this.theme).crosshairLabelBackground,
      getFont: () => chartFont,
      format: (price) => formatPrice(price),
    })
    this.klineSeries.attachPrimitive(pane1CrosshairLabel)
    this.crosshairAxisLabelPrimitives.push(pane1CrosshairLabel)
    // pane1 最高价 / 最低价标注：可视区域内 high 最大 / low 最小的 bar，
    // 最高价黄色标注在柱顶上方、最低价蓝色标注在柱底下方（各带同色实线
    // 连接到柱体上 / 下边缘中间，随平移 / 缩放实时重算）
    this.klineSeries.attachPrimitive(
      new HighLowMarkerPrimitive({
        series: this.klineSeries,
        getBars: () => this.bars,
        getHighColor: () => themeColors(this.theme).highMarkerColor,
        getLowColor: () => themeColors(this.theme).lowMarkerColor,
        getBackColor: () => themeColors(this.theme).crosshairLabelBackground,
      }),
    )
    // pane1 SAR 圆点：SarMarkerPrimitive 自绘（多头红 / 空头绿，zOrder normal 不遮十字星）；
    // 初始隐藏，由主图指标按钮开启（setMainIndicator('sar') 时 setVisible(true) + 重算数据）
    this.sarMarkerPrimitive = new SarMarkerPrimitive(
      this.chart,
      this.klineSeries,
      () => this.sarPoints,
      themeColors(this.theme),
    )
    this.sarMarkerPrimitive.setVisible(false)
    this.klineSeries.attachPrimitive(this.sarMarkerPrimitive)

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
        // 隐藏库刻度标签（刻度区保留）：刻度值由 AxisLabelPrimitive 自绘并与栅格横线对齐
        priceFormat: {
          type: 'custom',
          formatter: () => '',
        },
      },
      3,
    )
    this.volumeSeries.attachPrimitive(
      new VolumeBarPrimitive(() => this.bars, () => themeColors(this.theme)),
    )
    // 内容 Pane 边框（pane3）：自绘 1px 矩形，颜色随主题（深浅系区分）
    this.volumeSeries.attachPrimitive(
      new PaneBorderPrimitive(() => themeColors(this.theme).paneBorder),
    )
    // pane3 栅格：竖 4 等分；横向 2 等分（中间 1 条）
    this.volumeSeries.attachPrimitive(
      new GridPrimitive({
        getColor: () => themeColors(this.theme).grid,
        getHorizontalCount: () => 2,
      }),
    )
    // pane3 左刻度标签：与栅格横线对齐（值 = 横线处成交量，万 / 亿格式化）
    this.volumeSeries.attachPrimitive(
      new AxisLabelPrimitive({
        series: this.volumeSeries,
        getPaneIndex: () => 3,
        getHorizontalCount: () => 2,
        getColor: () => themeColors(this.theme).textColor,
        getBackColor: () => themeColors(this.theme).background,
        getFont: () => chartFont,
        format: (volume) => formatVolume(Math.max(0, volume)),
      }),
    )
    // pane3 十字星左刻度指示值：十字星横线所在成交量（万 / 亿格式化，不小于 0）
    const pane3CrosshairLabel = new CrosshairAxisLabelPrimitive({
      series: this.volumeSeries,
      getPaneIndex: () => 3,
      getColor: () => themeColors(this.theme).crosshairLabelText,
      getBackColor: () => themeColors(this.theme).crosshairLabelBackground,
      getFont: () => chartFont,
      format: (volume) => formatVolume(Math.max(0, volume)),
    })
    this.volumeSeries.attachPrimitive(pane3CrosshairLabel)
    this.crosshairAxisLabelPrimitives.push(pane3CrosshairLabel)

    /* ---------- 3.3 pane4 / pane5：指标组（仅 showIndicator 开启时创建） ----------
     * 指标开启：pane4 底部空 Pane（自绘"测试"文字，设置与 pane0 一致）+
     *          pane5 MACD（DIF / DEA 线 + 红绿柱，高度与 pane3 一致）；
     * 指标关闭：不创建（4 Pane：pane0..pane3，main : volume = 80 : 20）。
     */
    if (this.showIndicator) {
      this.createIndicatorPanes()
    }

    /* ---------- 4. 高度分配：pane0 / pane2 / pane4 固定 topPaneHeight（同一 factor，绝对相等），pane1 K 线，pane3 成交量 / pane5 指标 ---------- */
    this.applyStretchFactors()

    /* ---------- 5. 数据 + 首绘 ---------- */
    this.bars = genMockBars(120)
    this.applyData()
    this.chart.timeScale().fitContent()

    /* ---------- 6. 容器尺寸监听：重算固定 Pane 高度（topPaneHeight） ---------- */
    this.resizeObserver = new ResizeObserver(() => this.applyStretchFactors())
    this.resizeObserver.observe(this.container)

    /* ---------- 7. 十字星移动联动 ----------
     *  - pane0 内不触发十字星（清除十字星位置，十字星仅可在 pane1 ~ pane5 触发）；
     *  - 命中内容 Pane（pane1 / pane3 / pane5）时，向 CrosshairAxisLabelPrimitive
     *    注入横线本地 y，在左刻度区自绘指示值（横线所在价格）。
     */
    this.chart.subscribeCrosshairMove(this.handleCrosshairMove)
  }

  /** 十字星移动回调：pane0 清除十字星；内容 Pane 注入左刻度指示值。
   *  - point.y 相对整个图表数据区顶部；各 pane 本地 y = point.y - 前序 pane 高度和；
   *  - 十字星离开图表 / 命中非内容 Pane 时，全部指示值置 null（清除残留）。 */
  private handleCrosshairMove = (param: MouseEventParams): void => {
    const point = param.point
    // pane0 内不触发十字星（库十字星由内部 mousemove 驱动，此回调与库 set
    // 同帧执行，同一次 invalidate 重绘，视觉上 pane0 内十字星不出现）
    if (param.paneIndex === 0) {
      this.chart.clearCrosshairPosition()
    }
    if (!point || param.paneIndex === undefined) {
      for (const primitive of this.crosshairAxisLabelPrimitives) {
        primitive.setCrosshairY(null)
      }
      return
    }
    // 库 MouseEventParams.point 相对"十字星当前所在 pane 的 canvas"（数据区本地坐标），
    // 因此 point.y 即为该 pane 内的本地 y，无需再减去前序 pane 高度和
    // （实测：pane3 鼠标绝对 y=560 - pane3 canvas 顶部 493 = point.y=67，完全一致）。
    const localY = point.y
    for (const primitive of this.crosshairAxisLabelPrimitives) {
      // 仅向十字星命中的 pane 注入（其他 pane 清除，避免残留旧指示值）
      primitive.setCrosshairY(
        primitive.config.getPaneIndex() === param.paneIndex ? localY : null,
      )
    }
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
     * 柱体自绘（MacdBarPrimitive，复用成交量 candlestickBarWidth，
     * 宽度 / 间隔与 pane1 蜡烛柱绝对一致）：
     *  - indicatorsBarSeries（Histogram）仅作 scale 锚点：color = 背景色（不可见）；
     *  - 可见柱体：> 0 空心红柱（背景填充 + 红框）、< 0 绿色实心；
     *  - difSeries / deaSeries（Line）：DIF / DEA 线（固定配色，深浅系通用）。
     */
    this.indicatorsBarSeries = this.chart.addSeries(
      HistogramSeries,
      {
        priceScaleId: 'left',
        base: 0, // 柱从 0 轴绘制（正负双方向）
        color: themeColors(this.theme).background, // 不可见（仅建 scale）
        priceLineVisible: false,
        lastValueVisible: false,
        // 隐藏库刻度标签（刻度区保留）：刻度值由 AxisLabelPrimitive 自绘并与栅格横线对齐
        priceFormat: {
          type: 'custom',
          formatter: () => '',
        },
      },
      5,
    )
    this.indicatorsBarSeries.attachPrimitive(
      new MacdBarPrimitive(() => this.macdPoints, () => themeColors(this.theme)),
    )
    // 内容 Pane 边框（pane5）：自绘 1px 矩形，颜色随主题（深浅系区分）
    this.indicatorsBarSeries.attachPrimitive(
      new PaneBorderPrimitive(() => themeColors(this.theme).paneBorder),
    )
    // pane5 栅格：竖 4 等分；横向 2 等分（中间 1 条）
    this.indicatorsBarSeries.attachPrimitive(
      new GridPrimitive({
        getColor: () => themeColors(this.theme).grid,
        getHorizontalCount: () => 2,
      }),
    )
    // pane5 左刻度标签：与栅格横线对齐（值 = 横线处指标值，大数缩写 / 自适应小数）
    this.indicatorsBarSeries.attachPrimitive(
      new AxisLabelPrimitive({
        series: this.indicatorsBarSeries,
        getPaneIndex: () => 5,
        getHorizontalCount: () => 2,
        getColor: () => themeColors(this.theme).textColor,
        getBackColor: () => themeColors(this.theme).background,
        getFont: () => chartFont,
        format: (value) => formatAxisSmart(value),
        // MACD 柱以 0 轴为正负分界：中间刻度固定显示 0（不受 scale 中间值影响）
        fixedMiddleValue: 0,
      }),
    )
    // pane5 十字星左刻度指示值：十字星横线所在 MACD 值（大数缩写 / 自适应小数）
    const pane5CrosshairLabel = new CrosshairAxisLabelPrimitive({
      series: this.indicatorsBarSeries,
      getPaneIndex: () => 5,
      getColor: () => themeColors(this.theme).crosshairLabelText,
      getBackColor: () => themeColors(this.theme).crosshairLabelBackground,
      getFont: () => chartFont,
      format: (value) => formatAxisSmart(value),
    })
    this.indicatorsBarSeries.attachPrimitive(pane5CrosshairLabel)
    this.crosshairAxisLabelPrimitives.push(pane5CrosshairLabel)
    this.difSeries = this.chart.addSeries(
      LineSeries,
      {
        priceScaleId: 'left',
        color: macdColors.difLine,
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
        color: macdColors.deaLine,
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
   *     pane0 = 22px、pane1 = 0.6R（main 组）
   *     pane2 = 22px、pane3 = 0.2R（volume 组）
   *     pane4 = 22px、pane5 = 0.2R（indicator 组）
   *   指标关（4 Pane）：
   *     pane0 = 22px、pane1 = 0.8R（main 组）
   *     pane2 = 22px、pane3 = 0.2R（volume 组）
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
    // 库实际可用高度 = 容器高度 - 时间轴高度（显隐按库当前状态）。
    // Pane 之间无间隔：库分隔线高度已通过 patch（node_modules dist
    // SeparatorConstants.SeparatorHeight: 1 → 0）置零，pane 紧贴、无 1px 预留。
    const timeAxisHeight = this.chart.timeScale().options().visible ? LIBRARY_TIME_AXIS_HEIGHT : 0
    const usableHeight = this.container.clientHeight - timeAxisHeight
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
    // MACD：DIF / DEA 线 + 自绘红绿柱（柱 > 0 空心红、< 0 绿实心）。
    // macdPoints 缓存供 MacdBarPrimitive 自绘复用；仅指标开启时写入
    // （series 关闭时已移除，判空防误用）。
    if (this.indicatorsBarSeries && this.difSeries && this.deaSeries) {
      // 东财指标库：calcMACD 返回 [DIF 线, DEA 线, 柱值线] 三组 IndicatorLine，
      // 适配为 MacdPoint 缓存（供 MacdBarPrimitive 自绘与 series Y 轴锚点共用）
      const [difLine, deaLine, histLine] = calcMACD(this.bars)
      this.macdPoints = difLine.map((point, index) => ({
        time: point.time,
        dif: point.value,
        dea: deaLine[index].value,
        macd: histLine[index].value,
      }))
      this.indicatorsBarSeries.setData(
        // Histogram 仅作 scale 锚点（不可见），颜色统一走 options.color（背景色），
        // 主题切换时由 applyTheme 同步更新；可见柱体由 MacdBarPrimitive 自绘
        this.macdPoints.map((point) => ({
          time: point.time as UTCTimestamp,
          value: point.macd,
        })),
      )
      this.difSeries.setData(
        this.macdPoints.map((point) => ({ time: point.time as UTCTimestamp, value: point.dif })),
      )
      this.deaSeries.setData(
        this.macdPoints.map((point) => ({ time: point.time as UTCTimestamp, value: point.dea })),
      )
    }
    // 主图指标：数据变化时按当前激活指标重建（指标未开时为空操作）
    this.refreshMainIndicatorData()
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
      // 十字星指示值标签背景跟随主题（时间轴 + 价格轴；文字颜色库自动黑白对比）
      crosshair: {
        vertLine: {
          labelBackgroundColor: themeColorSet.crosshairLabelBackground,
        },
        horzLine: {
          labelBackgroundColor: themeColorSet.crosshairLabelBackground,
        },
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
    // MACD 锚点色跟随背景（保持不可见）；可见柱体由 MacdBarPrimitive 动态取新主题色
    this.indicatorsBarSeries?.applyOptions({ color: themeColorSet.background })
    // SAR 圆点颜色（多头红 / 空头绿）随主题更新（SarMarkerPrimitive setTheme）
    this.sarMarkerPrimitive?.setTheme(themeColorSet)
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

  /** 左移（平移 X 轴：视口向左滚动，查看更早数据；步长 = 10 根柱） */
  shiftLeft = (): void => {
    const timeScaleApi = this.chart.timeScale()
    // scrollPosition() = 距最新 bar 的 bar 数；增大 → 视口向右露出更早数据（"左移"）
    timeScaleApi.scrollToPosition(timeScaleApi.scrollPosition() + 10, false)
  }

  /** 右移（平移 X 轴：视口向右滚动，查看最新数据；步长 = 10 根柱） */
  shiftRight = (): void => {
    const timeScaleApi = this.chart.timeScale()
    // 减小距最新 bar 的 bar 数 → 视口向左靠近最新数据（"右移"）；库内部自动钳制
    timeScaleApi.scrollToPosition(timeScaleApi.scrollPosition() - 10, false)
  }

  /* ===================== 主图指标（pane1 叠加，互斥） ===================== */

  /**
   * 主图指标开关（互斥）：
   *  - 传入与当前相同的指标名 → 视为关闭（返回 null 语义，由 App.vue 处理）；
   *  - 传入新指标名 → 先清空当前指标线，再按指标创建对应 LineSeries 并写入数据；
   *  - 传入 null → 仅清空（关闭所有主图指标）。
   */
  setMainIndicator = (name: MainIndicatorName | null): void => {
    this.clearMainIndicatorSeries()
    if (name === null) {
      this.mainIndicator = null
      return
    }
    this.mainIndicator = name
    const colors = mainIndicatorColors
    switch (name) {
      case 'ma': {
        // MA5 / MA10 / MA20 / MA30 / MA60 五条线（东财标准五线）
        const periods = [5, 10, 20, 30, 60]
        periods.forEach((period, index) => {
          this.appendMainIndicatorLine(calcMA(this.bars, period), colors.ma[index])
        })
        break
      }
      case 'expma': {
        // EXPMA12 / EXPMA50 两条线（东财默认参数）
        const periods = [12, 50]
        periods.forEach((period, index) => {
          this.appendMainIndicatorLine(calcEXPMA(this.bars, period), colors.expma[index])
        })
        break
      }
      case 'boll': {
        // BOLL 上轨 / 中轨 / 下轨三条线（东财周期 20、倍数 2）
        const [upper, mid, lower] = calcBOLL(this.bars)
        this.appendMainIndicatorLine(upper, colors.boll[0])
        this.appendMainIndicatorLine(mid, colors.boll[1])
        this.appendMainIndicatorLine(lower, colors.boll[2])
        break
      }
      case 'sar': {
        // SAR：SarMarkerPrimitive 自绘圆点（多头红 / 空头绿，挂在 klineSeries 上），
        // 无需独立 LineSeries；数据全量重算后置入缓存，setVisible(true) 内部触发重绘。
        // 圆点颜色由 applyTheme 同步（构造时已用当前主题初始化），此处无需再 setTheme
        this.sarPoints = calcSAR(this.bars)
        this.sarMarkerPrimitive?.setVisible(true)
        break
      }
      case 'bbi': {
        // BBI 单线（(MA3 + MA6 + MA12 + MA24) / 4）
        this.appendMainIndicatorLine(calcBBI(this.bars), colors.bbi)
        break
      }
    }
  }

  /** 清空当前所有主图指标（LineSeries removeSeries 释放渲染；SAR primitive 仅隐藏，防内存泄漏） */
  private clearMainIndicatorSeries = (): void => {
    this.mainIndicatorSeries.forEach((series) => this.chart.removeSeries(series))
    this.mainIndicatorSeries = []
    this.sarMarkerPrimitive?.setVisible(false)
  }

  /** 在 pane1 创建一条指标 LineSeries（与 K 线同 priceScaleId 'left' → 同刻度叠加） */
  private createMainIndicatorLine = (color: string, lineWidth: 1 | 2 | 3 | 4): ISeriesApi<'Line'> =>
    this.chart.addSeries(
      LineSeries,
      {
        priceScaleId: 'left',
        color,
        lineWidth,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      1,
    )

  /** 创建指标线并写入数据（颜色 / 宽度按指标配置） */
  private appendMainIndicatorLine = (points: IndicatorLine[], color: string): void => {
    const series = this.createMainIndicatorLine(color, 1)
    this.mainIndicatorSeries.push(series)
    series.setData(points.map((point) => ({ time: point.time as UTCTimestamp, value: point.value })))
  }

  /** 数据变化时刷新当前主图指标（applyData 末尾调用；指标未开时为空操作） */
  private refreshMainIndicatorData = (): void => {
    if (this.mainIndicator === null) return
    // 重建：清空当前线并重新按当前指标名写入（复用互斥逻辑）
    const active = this.mainIndicator
    this.setMainIndicator(active)
  }

  /** 时间轴开关：切换显隐后重算 pane 高度（时间轴高度占用随之变化，保证固定空 Pane 仍绝对相等） */
  toggleTimeAxis = (visible: boolean): void => {
    this.chart.timeScale().applyOptions({ visible })
    this.applyStretchFactors()
  }

  /** 左刻度区开关：显隐所有 Pane 的 left price scale，切换后 fitContent 重排数据区 */
  setLeftScaleVisible = (visible: boolean): void => {
    if (this.showLeftScale === visible) return
    this.showLeftScale = visible
    this.applyPriceScaleVisible('left', visible)
  }

  /** 右刻度区开关：显隐所有 Pane 的 right price scale，切换后 fitContent 重排数据区 */
  setRightScaleVisible = (visible: boolean): void => {
    if (this.showRightScale === visible) return
    this.showRightScale = visible
    this.applyPriceScaleVisible('right', visible)
  }

  /** 刻度区统一应用（左右宽度一致）：逐个 Pane 设置 price scale 显隐与最小宽度，最后 fitContent */
  private applyPriceScaleVisible = (side: 'left' | 'right', visible: boolean): void => {
    const panes = this.chart.panes()
    panes.forEach((_, paneIndex) => {
      this.chart.priceScale(side, paneIndex).applyOptions({
        visible,
        borderVisible: false, // 刻度区无边框
        minimumWidth: visible ? PRICE_SCALE_MIN_WIDTH : 0, // 关闭时不占位；打开时左右宽度一致
      })
    })
    // 刻度区开关改变数据区宽度，fitContent 让 K 线重新铺满（不残留空白）
    this.chart.timeScale().fitContent()
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
      // 移除 pane5 十字星指示值 primitive 引用（series 已销毁，清引用防泄漏 /
      // 避免 handleCrosshairMove 继续对已销毁 series 注入）
      this.crosshairAxisLabelPrimitives = this.crosshairAxisLabelPrimitives.filter(
        (primitive) => primitive.config.getPaneIndex() !== 5,
      )
    }
    // 布局重排：pane 数量变化后按新比例分配（指标开 60:20:20 / 指标关 80:20）
    this.applyStretchFactors()
  }

  /** 销毁：移除监听 / primitive / chart / 清除实例标记（防内存泄漏） */
  destroy = (): void => {
    // 移除十字星移动监听 + 清空指示值 primitive 引用（防内存泄漏）
    this.chart.unsubscribeCrosshairMove(this.handleCrosshairMove)
    this.crosshairAxisLabelPrimitives = []
    // 卸载 SAR 圆点 primitive（挂在 klineSeries 上，随 chart.remove 一起释放，显式 detach 更保险）
    if (this.sarMarkerPrimitive) {
      this.klineSeries.detachPrimitive(this.sarMarkerPrimitive)
      this.sarMarkerPrimitive = null
    }
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.chart.remove()
    this.container.dataset.lwcMounted = 'false'
  }
}
