/**
 * KLineChartController.ts —— 多 Pane K 线图表控制器（v1.4.73 功能拆分版）
 *
 * 布局：一个 chart 内多 Pane（lightweight-charts 原生多 Pane，指标层可开关）：
 *   指标开启（6 Pane）：
 *     pane0：顶部信息行空 Pane（无数据，自绘"名称 [代码] 时间 + 主图指标值"，固定高 22px）
 *     pane1：K 线主图（Candlestick，红涨绿跌，上涨柱体空心；可叠加 MA/EXPMA/BOLL/SAR/BBI）
 *     pane2：成交量信息行空 Pane（设置与 pane0 一致，高度绝对相等）
 *     pane3：成交量（自绘：上涨空心红柱 / 下跌绿实心，柱宽与间隔同 pane1 绝对一致）
 *     pane4：指标信息行空 Pane（自绘所选附图指标各线数值，随十字星）
 *     pane5：附图指标（RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR，互斥单选；
 *            MACD 红绿柱自绘，其余线型指标 top 层自绘，高度与 pane3 一致）
 *   指标关闭（4 Pane）：pane0..pane3（去掉 pane4 / pane5，main : volume = 80 : 20）
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
 * ===== 模块划分（v1.4.73 功能拆分，每个 class / 常量一个文件） =====
 * 本控制器只保留：图表创建 / Pane 构建 / 数据写入 / 布局 / 主题 / 缩放平移 /
 * 刻度开关 / 生命周期，并把职责委托给以下模块：
 *  - constants.ts：共享常量（LIBRARY_TIME_AXIS_HEIGHT / PRICE_SCALE_MIN_WIDTH）；
 *  - types.ts：公共类型（KLineChartOptions / IndicatorLineSpec；主图指标类型
 *    在 ../indicator/types.ts，见 MainIndicatorType）；
 *  - indicatorMeta.ts：附图指标线名元信息（subIndicatorLabels）；
 *  - indicatorManager.ts：指标管理器（主图五指标 + 附图十指标 + 成交量均量线 +
 *    信息行分段构建，全部指标元素 top 层自绘，setMainIndicator / setSubIndicator）；
 *  - crosshairManager.ts：十字星管理器（十字星移动联动 + overlayTime + 左刻度指示值）；
 *  - layout.ts / candlestickWidth.ts / volume/ / overlay/ / indicator/ / axis/ /
 *    grid/ / border/ / highLow/：布局常量与算法、各自绘 primitive（独立文件）。
 *
 * 全局控制（全部由 App.vue 提供按钮）：
 *  - 时间轴开关：控制底部时间轴（timeScale）显示 / 隐藏；
 *  - 放大 / 缩小 / 左移 / 右移：全局 timeScale 操作（图表内禁用滚轮/触摸缩放）；
 *  - 风格切换：深系 / 浅系（theme.ts 统一配色，红涨绿跌锁定）；
 *  - 左 / 右刻度区开关：显隐全部 Pane 的 price scale（宽度一致 72px，无边框）；
 *  - 附图指标（互斥）：RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR（pane5 指标层，
 *    setSubIndicator：选中 = 打开指标层、取消选中 = 关闭指标层，pane4 信息行显示数值；
 *    MACD 柱 + 线、其余指标线全部 top 层自绘，指标切换动态重算缓存）；
 *  - 主图指标（互斥）：MA / EXPMA / BOLL / SAR / BBI（pane1 叠加，东财指标库，
 *    setMainIndicator：切换时先清空缓存，SAR 用 SarMarkerPrimitive 显隐控制）。
 *
 * 生命周期：实例保护（container dataset 标记防重复创建 chart）；
 * ResizeObserver 跟随容器尺寸重算 pane 高度；destroy 销毁（防内存泄漏）。
 */

import {
  createChart,
  ColorType,
  CrosshairMode,
  type ISeriesApi,
  type UTCTimestamp,
  type LogicalRange,
  type Time,
} from 'lightweight-charts'
import { themeColors, chartFontFamily, type ChartThemeName } from './theme'
import { resolveBarColors, type BarPalette } from './resolveBarColors'
import { mergeBars } from './mergeBars'
import type { ChartDataPoint } from '../../types/chart'

import { IndicatorLinePrimitive } from '../overlay/indicatorLinePrimitive'
import { SarMarkerPrimitive } from '../indicator/sarMarkerPrimitive'
import { PriceLinePrimitive } from '../overlay/priceLinePrimitive'
import { TimeshareManager } from './timeshareManager'
import { createPanes } from './paneFactory'
import { applyPaneStretchFactors, calcPaneTop } from './paneLayout'
import {
  zoomIn as viewportZoomIn,
  zoomOut as viewportZoomOut,
  shiftLeft as viewportShiftLeft,
  shiftRight as viewportShiftRight,
  applyPriceScaleVisible as viewportApplyPriceScaleVisible,
  refreshKlineColors as viewportRefreshKlineColors,
  exposeDebugApi as viewportExposeDebugApi,
  computeCrosshairTargetIndex,
} from './viewport'
import { normalizeChartTime, formatTimeByFmt, formatAxisTime, formatDate, formatClock } from '../util/format'
import { type PeriodValueOrEmpty } from '../periods'
import { CrosshairAxisLabelPrimitive } from '../crosshair/crosshairAxisLabelPrimitive'
import { CrosshairLineCapPrimitive } from '../crosshair/crosshairLineCapPrimitive'
import { CrosshairTooltip, type TooltipBounds } from '../crosshair/crosshairTooltip'
import { IndicatorManager } from './indicatorManager'
import { CrosshairManager } from './crosshairManager'
import { PRICE_SCALE_MIN_WIDTH, VISIBLE_BAR_COUNT, REALTIME_FLUSH_MS } from './constants'
import { throttle, type Throttled } from '../util/timing'
import type { KLineChartOptions, ChartLoadStatus } from './types'
import type { MainIndicatorType } from '../indicator'
import type { ChartDataService } from '../../services/chartDataService'
import { RequestTimeoutError } from '../../services/httpChartDataService'

/** 公共类型 re-export（App.vue 等外部使用者继续从本文件导入，保持接口稳定；
 *  主图指标类型已统一迁移至 ../indicator —— 指标公共类型单一来源） */
export type { MainIndicatorType } from '../indicator'
export type { KLineChartOptions } from './types'

/** 控制器构造选项（re-export，见 types.ts） */
// （上方 export type 已统一转发）

export class KLineChartController {
  /** chart 实例（多 Pane 容器） */
  private readonly chart: ReturnType<typeof createChart>
  /** 挂载容器（布局高度 / 实例标记 / ResizeObserver） */
  private readonly container: HTMLElement
  /** K 线数据（ChartDataPoint：统一数据点类型，pointType='kline'，mock 120 根。
   *  直接作为指标库 / primitive / series 数据源，无内部中间类型。
   *  可变引用：service 拉取（setKlineData）整体替换、实时订阅（updateLastBar）原地更新。
   *  分时周期时存 pointType='timeshare' 点（price / avgPrice 口径，无 OHLC） */
  private bars: ChartDataPoint[] = []
  /** 分时价格线（pane1，LineSeries；分时周期渲染 price，K 线周期 setData([]) 不可见） */
  private timesharePriceSeries: ISeriesApi<'Line'> | null = null
  /** 分时均价线（pane1，LineSeries；分时周期渲染 avgPrice） */
  private timeshareAvgSeries: ISeriesApi<'Line'> | null = null
  /** 分时右刻度承载 series（v1.7.1）：挂 pane1 right price scale（空数据透明锚点），
   *  仅为右刻度百分比标签提供 priceAxisPaneViews 画布（右刻度区占位 + 自绘） */
  private timeshareRightAxisSeries: ISeriesApi<'Line'> | null = null
  /** time → bar 索引（十字星 tooltip 命中取数 O(1)；批量重建 / 实时增量维护） */
  private barIndex = new Map<number, ChartDataPoint>()
  /** 各 Pane 像素高度（applyStretchFactors 更新；十字星 tooltip 定位 paneTop 用） */
  private paneHeights: number[] = []
  /** 十字星数据浮层（v1.6.35：命中显示时间/OHLC/涨跌/涨幅/量额九项） */
  private readonly tooltip: CrosshairTooltip
  /** 股票名称（pane0 顶部信息行显示：名称 [代码]） */
  private name: string
  /** 股票代码（pane0 顶部信息行显示：名称 [代码]） */
  private symbol: string
  /** 时间格式模板（v1.6.9 透传 KLineChart.vue format；undefined → 按周期自动） */
  private readonly timeFormat: string | undefined
  /** 当前周期（v1.6.9 setPeriod 更新；pane0 信息行时间格式按周期切换；
   *  v1.7.1 允许 '' 空值 = 周期未设置，init 不发起请求） */
  private period: PeriodValueOrEmpty
  /** 数据服务（init / loadEarlier 经其拉取历史与订阅实时；组件构造时注入） */
  private service: ChartDataService | undefined
  /** 加载状态回调（可选；init 全流程状态通知） */
  private readonly onStatusChange: ((status: ChartLoadStatus) => void) | undefined
  /** 数据加载请求序号（快速切换周期 / 标的时丢弃过期响应，防乱序覆盖） */
  private loadSeq = 0
  /** 是否还有更早历史（返回不足 limit 或合并 0 新增 → false，防死循环） */
  private hasMoreHistory = true
  /** 更早历史加载中标志（防抖：一次只允许一个在途请求） */
  private loadingEarlier = false
  /** 实时订阅退订函数（周期 / 标的切换与 destroy 时调用） */
  private realtimeUnsubscribe: (() => void) | null = null
  /** 可视逻辑范围变化处理：到达最左边缘（from ≤ 0）→ 触发更早历史加载（内部 loadEarlier） */
  private readonly handleVisibleLogicalRangeChange = (range: LogicalRange | null): void => {
    if (range && range.from <= 0) void this.loadEarlier()
  }

  /** K 线 series（pane1；红涨绿跌，上涨柱体空心） */
  private klineSeries: ISeriesApi<'Candlestick'>
  /** pane2 成交量信息行 series（InfoLabelPrimitive 挂载；竖线补齐 primitive 也挂这里） */
  /** 成交量 series（pane3；Histogram 仅作 scale 锚点，可见柱体由 primitive 自绘） */
  private volumeSeries: ISeriesApi<'Histogram'>

  /** 当前主题（深系 / 浅系） */
  private theme: ChartThemeName
  /** 左刻度区开关状态（显隐全部 Pane 的 left price scale） */
  private showLeftScale: boolean
  /** 右刻度区开关状态（显隐全部 Pane 的 right price scale） */
  private showRightScale: boolean

  /** 容器尺寸监听（跟随容器高度重算固定 Pane 高度） */
  private resizeObserver: ResizeObserver | null = null

  /** 指标管理器（主图 / 附图指标 + 信息行 + 成交量均量线） */
  private readonly indicatorManager: IndicatorManager
  /** 十字星管理器（十字星移动联动 + 左刻度指示值） */
  private readonly crosshairManager: CrosshairManager
  /** 分时（1d~5d）计算管理器（v1.7.1 拆分）：刻度 / 值域 / 等分计算 */
  private readonly timeshareManager: TimeshareManager

  /** pane1 SAR 圆点 primitive（构造创建并 attach，destroy 显式 detach） */
  private sarMarkerPrimitive: SarMarkerPrimitive | null = null
  /** pane1 主图指标线 primitive（IndicatorLinePrimitive，top 层自绘） */
  private indicatorLinePrimitive: IndicatorLinePrimitive | null = null
  /** pane1 最后价线 primitive（PriceLinePrimitive 自绘；priceLineVisible 参数控制显隐） */
  private priceLinePrimitive: PriceLinePrimitive | null = null
  /** pane3 成交量均量线 primitive（IndicatorLinePrimitive，top 层自绘） */
  private volumeMaPrimitive: IndicatorLinePrimitive | null = null

  constructor(options: KLineChartOptions) {
    this.container = options.container
    this.showLeftScale = false
    this.showRightScale = false
    this.theme = 'dark'
    // 股票信息（pane0 顶部信息行显示，格式：名称 [代码]）
    this.name = options.name ?? ''
    this.symbol = options.symbol ?? ''
    // 数据服务（组件构造时注入 props.service ?? defaultService；未注入则 init 报错不拉数）
    this.service = options.service
    this.onStatusChange = options.onStatusChange
    // 十字星数据浮层：挂 document.body（position: fixed，v1.6.40 脱离图表 DOM 树，
    // 杜绝层级 / 事件拦截不确定性；传入 chart 容器作为定位基准 rect）
    this.tooltip = new CrosshairTooltip(this.container, themeColors(this.theme))

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
        background: {
          type: ColorType.Solid,
          color: initialThemeColors.background,
        },
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
        // 横 / 竖线：半透明虚线（crosshairLineColor，深浅系区分）——
        // 穿过 MACD 红绿柱 / K 线 / 成交量柱时柱体透出，不被不透明线遮盖；
        // 时间轴（X 轴）十字星指示值标签背景跟随深浅系 crosshairLabelBackground
        // （文字颜色由库按背景亮度自动对比：深背景白字 / 浅背景黑字）
        vertLine: {
          color: initialThemeColors.crosshairLineColor,
          labelBackgroundColor: initialThemeColors.crosshairLabelBackground,
        },
        horzLine: {
          color: initialThemeColors.crosshairLineColor,
          labelBackgroundColor: initialThemeColors.crosshairLabelBackground,
        },
      },
      // 栅格化关闭：纵向 / 横向栅格线全部隐藏（栅格由 GridPrimitive 自绘）
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
      // 左右刻度区隐藏：数据区域铺满整个宽度（刻度区由开关显隐，见 setLeftScaleVisible）
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
        // 时间轴刻度标签（v1.7.0）：K 线状态 → YYYY-MM-DD；分时状态 → HH:mm
        // （不随 format 参数变化；十字光标时间格式仍走下方 localization.timeFormatter）
        tickMarkFormatter: (t: Time) => {
          const ts = t as number
          return this.timeshareManager.isTimeshare ? formatClock(ts) : formatDate(ts)
        },
      },
      localization: {
        // 十字光标时间格式化：format 模板优先；缺省按周期自动
        // （日/周/月 → YYYY-MM-DD；分时 → HH:mm；分钟 K → YYYY-MM-DD HH:mm）
        timeFormatter: (t: Time) => {
          const ts = t as number
          return this.timeFormat ? formatTimeByFmt(ts, this.timeFormat) : formatAxisTime(ts, this.period)
        },
      },
    })

    /* ---------- 2. 管理器：指标 + 十字星 ----------
     * 指标管理器依赖惰性 getter（klineSeries / volumeSeries 尚未创建，
     * getter 在 draw / 调用时才求值，保证构建顺序安全）。
     */
    this.indicatorManager = new IndicatorManager({
      chart: this.chart,
      getBars: () => this.bars,
      getTheme: () => this.theme,
      getOverlayTime: () => this.crosshairManager.getOverlayTime(),
      getCrosshairX: () => this.getCrosshairX(),
      getName: () => this.name,
      getSymbol: () => this.symbol,
      crosshairRegistry: this.crosshairManagerRegistry,
      onIndicatorStateChange: () => this.applyStretchFactors(),
      // v1.6.9：pane0 信息行时间格式（format 模板优先，缺省按周期自动）
      getTimeFormat: () => this.timeFormat,
      getPeriod: () => this.period,
    })
    // 分时（1d~5d）计算管理器（v1.7.1 拆分）：刻度 / 值域 / 等分计算全部收敛于此，
    // controller 只负责调用与数据写入；依赖 chart / bars / indicatorManager（惰性读取）
    this.timeshareManager = new TimeshareManager({
      chart: this.chart,
      getPeriod: () => this.period,
      getBars: () => this.bars,
      getShowIndicator: () => this.indicatorManager.getShowIndicator(),
      getTheme: () => this.theme,
      getPriceSeries: () => this.timesharePriceSeries,
    })
    // 十字星管理器：构造即订阅十字星移动（pane0 不触发 / 内容 Pane 注入左刻度指示值 /
    // 命中更新数据浮层 v1.6.35）
    this.crosshairManager = new CrosshairManager({
      chart: this.chart,
      tooltip: this.tooltip,
      getBarByTime: this.getBarByTime,
      getPaneTop: this.getPaneTop,
      getTimeText: this.getTimeText,
      getWidth: () => this.container.clientWidth,
      // v1.7.1：window mousemove 坐标换算基准（拖拽实时跟随）
      getContainer: () => this.container,
      getTooltipBounds: (): TooltipBounds => ({
        // X：pane1~pane5 数据区左右缘（扣除左 / 右刻度区宽，开关打开时收窄）
        left: this.showLeftScale ? PRICE_SCALE_MIN_WIDTH : 0,
        right: this.container.clientWidth - (this.showRightScale ? PRICE_SCALE_MIN_WIDTH : 0),
        // Y：pane1 顶部 → pane5 底部（信息行 pane2/4 在内）
        top: this.getPaneTop(1),
        bottom: this.getPaneTop(5) + (this.paneHeights[5] ?? 0),
      }),
    })

    /* ---------- 3~6. Pane 构建：pane0~pane3 全部 series / primitive 由
     * paneFactory.createPanes 统一创建装配（v1.7.1 拆分，职责解耦）——
     * 信息行 pane0 / K 线主图 pane1（含分时双线 + 左右刻度 + 十字星指示值 +
     * 高低价标注 + SAR + 指标线）/ 成交量信息行 pane2 / 成交量 pane3 ---------- */
    this.exposeDebugApi()
    const panes = createPanes({
      chart: this.chart,
      getTheme: () => this.theme,
      getBars: () => this.bars,
      getPeriod: () => this.period,
      indicatorManager: this.indicatorManager,
      timeshareManager: this.timeshareManager,
      crosshairManager: this.crosshairManager,
      createCrosshairLineCap: this.createCrosshairLineCap,
    })
    this.klineSeries = panes.klineSeries
    this.timesharePriceSeries = panes.timesharePriceSeries
    this.timeshareAvgSeries = panes.timeshareAvgSeries
    this.timeshareRightAxisSeries = panes.timeshareRightAxisSeries
    this.volumeSeries = panes.volumeSeries
    this.sarMarkerPrimitive = panes.sarMarkerPrimitive
    this.priceLinePrimitive = panes.priceLinePrimitive
    this.indicatorLinePrimitive = panes.indicatorLinePrimitive
    this.volumeMaPrimitive = panes.volumeMaPrimitive

    /* ---------- 7. pane4 / pane5：指标组（初始关闭） ----------
     * 指标层初始关闭（4 Pane：pane0..pane3，main : volume = 80 : 20）；
     * 用户点击附图指标按钮（setSubIndicator）时由 IndicatorManager 创建 pane4 / pane5
     * （60:20:20），关闭时移除 —— 布局随 getShowIndicator 状态重算。
     */

    /* ---------- 8. 高度分配：pane0 / pane2 / pane4 固定 topPaneHeight（同一 factor，绝对相等），pane1 K 线，pane3 成交量 / pane5 指标 ---------- */
    this.timeFormat = options.format
    // v1.7.1：构造即应用初始周期（组件透传 props.period）——分时判定 / 数据过滤
    // 按此生效；缺省**不设置**（父组件未传时周期为空，不发起数据请求）。
    // 此前硬编码 'day' 导致默认周期为分时时 controller 仍按 K 线渲染。
    // 默认值语义（v1.7.1）：options.period 为 undefined（父组件未传）→ ''（不设置，
    // init 守卫跳过，与 symbol 空值守卫一致）；显式传具体周期 → 按该周期加载。
    this.period = options.period ?? ''
    // v1.7.1：最后价线显隐（默认 true；组件 props.priceLineVisible 透传，
    // setPriceLineVisible 可运行时切换）
    this.setPriceLineVisible(options.priceLineVisible ?? true)
    // v1.7.1：构造即应用分时交互（默认周期为分时时 setPeriod 不触发 →
    // 平移禁用必须在此生效，否则分时仍可拖拽平移）
    this.applyTimeshareInteractions()

    this.applyStretchFactors()

    /* ---------- 9. 数据 + 首绘 ----------
     * 数据由组件经 ChartDataService 拉取后 setKlineData 注入（v1.6.16：
     * 控制器不再内置 Mock 生成，统一走 service 层，便于接入真实行情）。 */
    this.applyData()
    this.chart.timeScale().fitContent()

    /* ---------- 10. 容器尺寸监听：重算固定 Pane 高度（topPaneHeight） ---------- */
    this.resizeObserver = new ResizeObserver(() => {
      // 容器尺寸变化 → 重算 pane 高度（pane1..5 高度按比例分配）
      this.applyStretchFactors()
      // 分时（v1.7.1）：fitContent 只在数据加载时按当时宽度 fit，
      // 全屏 / 窗口缩放后容器变宽，X 轴数据带不会自动重新铺满 → 左侧留白。
      // 这里在容器 resize 时重新 fit（分时整日数据全量可见、平移禁用，无副作用）；
      // K 线为固定 120 根可视（setVisibleLogicalRange），库自动调整 barSpacing 撑满，无需处理。
      if (this.timeshareManager.isTimeshare) {
        this.chart.timeScale().fitContent()
      }
    })
    this.resizeObserver.observe(this.container)

    /* ---------- 11. 平移左滑到边缘 → 触发更早历史加载（回调组件拉取） ----------
     * 可视逻辑范围左边界 ≤ 0（到达最左边缘）时触发一次；
     * 组件侧防抖 + added=0 停止（见 loadEarlier），此处仅负责"到达边缘"信号。
     */
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.handleVisibleLogicalRangeChange)

    // v1.6.28：外部自定义数据直通（无 mock / http 环境时构造传入，
    // 跳过 service 拉取；series 已全部就绪，setKlineData 直接渲染 + fitContent）
    if (options.initialBars && options.initialBars.length > 0) {
      this.setKlineData(options.initialBars)
    }
  }

  /** 十字星指示值注册表适配器（IndicatorManager 需要注册 / 移除 pane5 的指示值 primitive） */
  private crosshairManagerRegistry = {
    registerPrimitive: (primitive: CrosshairAxisLabelPrimitive): void => {
      this.crosshairManager.registerPrimitive(primitive)
    },
    removeByPaneIndex: (paneIndex: number): void => {
      this.crosshairManager.removeByPaneIndex(paneIndex)
    },
  }

  /**
   * 十字星竖线底部补齐 primitive（pane1/2/3/4/5 各挂一个）：
   * 填库 LargeDashed 竖线因 pane 高度非虚线周期整数倍产生的底部空白段，
   * 使竖线视觉到底（见 CrosshairLineCapPrimitive 头注释）。
   * 颜色 / 时间 / x 全部动态获取（主题切换、十字星移动即时生效）。
   */
  private createCrosshairLineCap = (): CrosshairLineCapPrimitive =>
    new CrosshairLineCapPrimitive({
      getOverlayTime: () => this.crosshairManager.getOverlayTime(),
      getCrosshairX: () => this.getCrosshairX(),
      getTimeScale: () => this.chart.timeScale(),
      getLineColor: () => themeColors(this.theme).crosshairLineColor,
    })

  /**
   * 十字星竖线实时 x（数据区坐标，v1.7.1）：cap 竖线 draw 优先使用本值，
   * 消除拖拽平移时 crosshairMove 事件空窗导致的 cap 竖线滞后（"两条竖线"）。
   *  - 键盘定位优先（键盘移动晚于鼠标）：moveCrosshairBy 注入的目标 x；
   *  - 鼠标 hover / 拖拽平移：鼠标 x 实时反查（coordinateToTime → timeToCoordinate），
   *    window mousemove 记录鼠标位置（CrosshairManager），pan 手势中事件暂停也能跟随；
   *  - 鼠标离开图表 / 数据浮层悬停（tooltip.isHovered 保持原十字星状态）：返回 null
   *    → cap 回退 timeToCoordinate(overlayTime)。
   * pane1 / pane2 / pane3 / pane4 / pane5 各 cap 实例共用本方法（Controller 单点提供）。
   */
  private getCrosshairX = (): number | null => {
    if (this.crosshairManager.isKeyboardRecent()) {
      return this.crosshairManager.getKeyboardX()
    }
    const mouseX = this.crosshairManager.getLastMouseX()
    if (mouseX === null) return null
    // 鼠标悬停在数据浮层上（浮层选中文字期间十字星状态不被动清除）→ 回退 overlayTime。
    // 但拖拽（鼠标按住）中不适用：拖拽平移时鼠标会穿过 tooltip 浮层 DOM（isHovered=true），
    // 若仍回退会导致 cap 冻结在旧 bar 与库竖线错开成"两条竖线"（v1.7.1 实测）。
    if (this.tooltip.isHovered && !this.crosshairManager.isDragging()) return null
    const ts = this.chart.timeScale()
    // 容器 x → 数据区 x：扣除左刻度区宽（开关打开时收窄）
    const leftScaleWidth = this.showLeftScale
      ? this.chart.priceScale('left').width()
      : 0
    const dataX = mouseX - leftScaleWidth
    // 数据区边界外（鼠标离开图表）→ 不绘制（回退 overlayTime 由 cap 处理）
    if (dataX < 0 || dataX > ts.width()) return null
    // 直接返回鼠标精确数据区 x（v1.7.1 实测修复）：
    // 库 crosshairMode=Normal，竖线精确跟随鼠标（不吸附 bar 中心）；
    // 若此处做 coordinateToTime→timeToCoordinate round trip（bar 中心吸附），
    // 与库竖线相差半个 bar 宽（≈barSpacing/2），拖拽平移时肉眼可见"两根竖线"。
    return dataX
  }

  /* ===================== 布局 ===================== */

  /**
   * 高度分配：固定空 Pane（pane0 / pane2 / pane4）设同一像素因子 topPaneHeight
   * （绝对相等），内容 Pane 按组比例分配剩余高度（指标开 60:20:20 / 关 80:20）。
   */
  /** 高度分配：委托 paneLayout.applyPaneStretchFactors（v1.7.1 拆分） */
  private applyStretchFactors = (): void => {
    applyPaneStretchFactors({
      chart: this.chart,
      container: this.container,
      getShowIndicator: () => this.indicatorManager.getShowIndicator(),
      onHeights: heights => {
        this.paneHeights = heights
      },
    })
  }

  /** 所在 pane 顶部 y（相对图表 canvas）：委托 paneLayout.calcPaneTop（v1.7.1 拆分） */
  private getPaneTop = (paneIndex: number): number => calcPaneTop(this.paneHeights, paneIndex)

  /** 调试数据暴露（仅开发用）：委托 viewport.exposeDebugApi（v1.7.1 拆分），
   *  挂 window.__klineChart，getter 惰性读取 → 数据 / 周期实时变化生效 */
  private exposeDebugApi = (): void => {
    viewportExposeDebugApi({
      symbol: this.symbol,
      name: this.name,
      period: this.period,
      isTimeshare: this.timeshareManager.isTimeshare,
      theme: this.theme,
      getBars: () => this.bars,
      getPreClose: () => this.timeshareManager.preClose,
      getTimeshareHalf: () => this.timeshareManager.half,
      getScaleValues: () => this.timeshareManager.fixedValues,
      getHorizontalCount: () => this.timeshareManager.horizontalCount,
      // 视口探针（v1.7.1 调试）：直接委托 chart.timeScale()
      getVisibleLogicalRange: () => this.chart.timeScale().getVisibleLogicalRange(),
      getVisibleRange: () => this.chart.timeScale().getVisibleRange(),
      // 十字星命中 time 探针（v1.7.1 调试）：拖拽 / 键盘移动时实时查看 overlayTime 是否跟随
      getOverlayTime: () => this.crosshairManager.getOverlayTime(),
      // 拖拽"两条竖线"探针（v1.7.1）：cap 竖线 x 数据源实时值
      //  - lastMouseX：window mousemove 记录的容器相对 x（null = 无记录）
      //  - capX：getCrosshairX 最终返回值（cap 竖线绘制 x，null = 回退 overlayTime）
      getLastMouseX: () => this.crosshairManager.getLastMouseX(),
      getKeyboardX: () => this.crosshairManager.getKeyboardX(),
      getKeyboardRecent: () => this.crosshairManager.isKeyboardRecent(),
      getCapX: () => this.getCrosshairX(),
      // 左刻度区宽（cap 坐标换算基准）
      getLeftScaleWidth: () =>
        this.showLeftScale ? this.chart.priceScale('left').width() : 0,
    })
  }

  /* ===================== 数据 ===================== */

  /** K 线 / 成交量 / 指标数据写入（series 锚点 + 各 primitive 数据缓存重建） */
  private applyData = (): void => {
    // v1.6.10：setData 前统一归一化 time（非法条过滤），series 同步
    const normalized = this.bars
      .map(bar => ({ bar, time: normalizeChartTime(bar.time) }))
      .filter(entry => entry.time !== null)

    // —— 分时周期（v1.7.0）：pane1 双线 + pane3 直方图 ——
    if (this.timeshareManager.isTimeshare) {
      // K 线 series 清空（分时无 OHLC 蜡烛），避免残留旧周期图形
      this.klineSeries.setData([])
      this.timesharePriceSeries?.setData(
        normalized.map(({ bar, time }) => ({
          time: time as UTCTimestamp,
          value: bar.price ?? 0, // pointType='timeshare' 必含 price
        }))
      )
      this.timeshareAvgSeries?.setData(
        normalized.map(({ bar, time }) => ({
          time: time as UTCTimestamp,
          value: bar.avgPrice ?? 0, // pointType='timeshare' 必含 avgPrice
        }))
      )
      // 右刻度承载 series 同步价格数据（v1.7.1 修复）：right scale 必须有
      // firstValue（非空数据）——否则左刻度关 + 右刻度开时，库 defaultPriceScale
      // 回退到 right（空 scale）→ 十字星横线 price/y = NaN 消失；同步 price 后
      // right 范围与 left 同源一致，横线与指示值均正常。
      this.timeshareRightAxisSeries?.setData(
        normalized.map(({ bar, time }) => ({
          time: time as UTCTimestamp,
          value: bar.price ?? 0,
        }))
      )
      // 成交量（分时，v1.7.0）：Histogram 透明锚点（仅建 scale 值域），
      // 可见 1px 细柱由 VolumeBarPrimitive 自绘（红绿按 price vs preClose 三态，
      // 与 K 线柱同一判定基准）；主题切换时由 applyTheme 同步锚点色
      this.volumeSeries.setData(
        normalized.map(({ bar, time }) => ({
          time: time as UTCTimestamp,
          value: bar.volume ?? 0, // pointType='timeshare' 必含 volume
        }))
      )
      // 指标缓存重建（分时：成交量均量 / 附图指标 / 主图指标见 indicatorManager 守卫）
      this.indicatorManager.rebuildVolumeData()
      this.indicatorManager.rebuildIndicatorData()
      this.indicatorManager.refreshMainIndicatorData()
      // 分时 pane1 价格范围：以首根 preClose 为对称中心（v1.7.1，左右刻度中间对齐）
      this.timeshareManager.applyPriceRange()
      return
    }

    // —— K 线周期（原逻辑）：蜡烛 + 成交量自绘柱体 ——
    // 恢复价格轴自动缩放与库默认 margins（分时固定范围 + 对称 margins 不带到 K 线周期，
    // v1.7.1；K 线刻度为坐标反算值，与十字星同源，无"固定中间值"矛盾）
    this.chart.priceScale('left', 1).applyOptions({
      autoScale: true,
      scaleMargins: { top: 0.2, bottom: 0.1 },
    })
    this.chart.priceScale('right', 1).applyOptions({
      scaleMargins: { top: 0.2, bottom: 0.1 },
    })
    // K 线三态颜色（v1.6.57）：按 close vs preClose 红/绿/平盘，覆盖库默认 close>=open
    // 判定（一字板 open===close 会被库画成上涨红）；主题切换时 applyTheme 会重设数据刷新
    const barPalette = themeColors(this.theme)
    this.klineSeries.setData(
      normalized.map(({ bar, time }) => ({
        time: time as UTCTimestamp,
        open: bar.open!, // pointType='kline' 必含 OHLC（mock 已填全，非空断言）
        high: bar.high!,
        low: bar.low!,
        close: bar.close!,
        ...resolveBarColors(bar, barPalette),
      }))
    )
    // v1.7.1 最后价虚线：库 priceLine 已关闭（改由 PriceLinePrimitive 自绘，见
    // paneFactory），此处 applyOptions 保持关闭状态并强制 invalidate —— 周期切换
    // （setData + setVisibleLogicalRange 时序）后触发一次重绘，自绘线随之现取刷新。
    this.klineSeries.applyOptions({ priceLineVisible: false })
    // 分时双线清空（K 线周期不显示分时线）
    this.timesharePriceSeries?.setData([])
    this.timeshareAvgSeries?.setData([])
    // 右刻度承载 series 同步收盘数据（v1.7.1 修复，同分时分支原因）：
    // right scale 保持有数据 → 左刻度关 + 右刻度开时库 defaultPriceScale 回退
    // 到 right 也不至于 firstValue=null（十字星横线不消失）
    this.timeshareRightAxisSeries?.setData(
      normalized.map(({ bar, time }) => ({
        time: time as UTCTimestamp,
        value: bar.close ?? 0,
      }))
    )
    // 成交量：Histogram 仅作 scale 锚点，颜色统一走 options.color（背景色，不可见），
    // 主题切换时由 applyTheme 同步更新；可见柱体由 VolumeBarPrimitive 按 bars 自绘
    this.volumeSeries.setData(
      normalized.map(({ bar, time }) => ({
        time: time as UTCTimestamp,
        value: bar.volume!, // pointType='kline' 必含 volume
      }))
    )
    // 成交量均量线 VOL MA5 / MA10 + pane2 信息行缓存（IndicatorManager 构建）
    this.indicatorManager.rebuildVolumeData()
    // 附图指标：指标层开启时按当前选中指标全量重建
    // （pane5 线 / 柱 / Y 轴锚点 + pane4 信息行值；数据变化时重算，series 关闭时跳过）
    this.indicatorManager.rebuildIndicatorData()
    // 主图指标：数据变化时按当前激活指标重建（指标未开时为空操作）
    this.indicatorManager.refreshMainIndicatorData()
  }

  /* ===================== 数据（service 集成） ===================== */

  /** 更新加载状态并回调外部（可选；状态仅作通知，不持久化） */
  private setStatus = (status: ChartLoadStatus): void => {
    this.onStatusChange?.(status)
  }

  /**
   * 首次初始化（v1.6.17 由组件统一调用，替代原组件 loadData + setupRealtime）：
   * 拉取最新一页历史 → setKlineData 全量重绘 + fitContent → 订阅实时推送。
   * 竞态保护：loadSeq 代际丢弃过期响应；失败 → status='error' 不抛异常。
   * 状态：'loading'（首载）→ 'ready' / 'error'。
   */
  init = async (): Promise<void> => {
    // v1.7.1 修复：symbol / period 未就绪（父组件异步加载代码 / 暂未传入）时不发起请求——
    // 组件 onMounted 创建 controller 后立即 init，构造快照 symbol / period 可能为空
    // （symbol='' → 第一次请求出现 `symbol=` 空参数；period='' → 空周期无意义请求）。
    // 之后就位 → props watch → setSymbol / setPeriod + debouncedInit → 重新拉取。
    // 这里直接跳过，避免无效请求；状态保持 idle 等待后续 init。
    if (!this.symbol || !this.period) {
      return
    }
    this.setStatus('loading')
    const seq = ++this.loadSeq
    if (!this.service) {
      console.error('[KLineChart] init: 未注入 ChartDataService（组件构造时传 service）')
      this.setStatus('error')
      return
    }
    try {
      const points = await this.fetchHistoryWithRetry(seq)
      if (seq !== this.loadSeq) return // 期间又切换了周期 / 标的 → 丢弃过期响应
      // 返回满页说明还有更早数据，允许后续左滑边缘自动加载
      this.hasMoreHistory = points.length >= this.service.fetchLimit
      this.setKlineData(points)
      this.setStatus('ready')
      this.startRealtime()
    } catch (error) {
      if (seq !== this.loadSeq) return
      console.error('[KLineChart] init failed:', error)
      this.setStatus('error')
    }
  }

  /**
   * 拉取最新一页历史：请求超时自动重试 1 次（v1.7.2）。
   *  - 背景：history 接口偶发超时（网络抖动 / 后端慢 / 首次冷加载）时，
   *    此前裸 AbortError 直接走 error 路径，图表首载失败无自愈；
   *  - 行为：仅在 RequestTimeoutError（service 层语义化超时）时重试一次；
   *    其他错误（HTTP 状态 / 业务码 / 网络异常）原样抛出，由 init 走 error 路径；
   *  - 竞态：重试同样受 loadSeq 守卫——期间切换周期 / 标的 / destroy
   *    则静默丢弃过期响应（状态由新 init 自己发），不重复请求。
   */
  private fetchHistoryWithRetry = async (seq: number): Promise<ChartDataPoint[]> => {
    const service = this.service
    if (!service) return []
    const doFetch = () =>
      service.fetchHistory({
        symbol: this.symbol,
        period: this.period,
        limit: service.fetchLimit,
      })
    try {
      return await doFetch()
    } catch (error) {
      if (seq !== this.loadSeq) return [] // 期间切换 / 销毁 → 静默丢弃
      if (error instanceof RequestTimeoutError) {
        console.warn('[KLineChart] 历史请求超时，自动重试 1 次…')
        return await doFetch()
      }
      throw error
    }
  }

  /** 订阅实时行情（先退订旧订阅保证唯一；回调 = 控制器增量更新最后一根） */
  private startRealtime = (): void => {
    this.realtimeUnsubscribe?.()
    if (!this.service) return
    // v1.7.1 节流：订阅回调走 enqueueRealtimePoint（REALTIME_FLUSH_MS 窗口内
    // 批量合并 + trailing 保末点），高频推送不逐点重建指标缓存
    this.realtimeUnsubscribe = this.service.subscribeRealtime(this.symbol, this.period, point =>
      this.enqueueRealtimePoint(point)
    )
  }

  /**
   * 加载更早一页历史（左滑到最左边缘自动触发）：
   * 以当前最早一根 time 为 before 锚点拉取更早页 → prependHistory 前置插入。
   * 停止条件：返回条数 < limit（服务语义：无更早数据）或合并新增 0（重复页）。
   */
  private loadEarlier = async (): Promise<void> => {
    if (this.loadingEarlier || !this.hasMoreHistory || !this.service) return
    const earliest = this.getEarliestTime()
    if (earliest === undefined) return
    this.loadingEarlier = true
    const seq = this.loadSeq
    // v1.6.20：左滑分页回传 'loading-older'（与首次加载 'loading' 区分）
    this.setStatus('loading-older')
    try {
      const points = await this.service.fetchHistory({
        symbol: this.symbol,
        period: this.period,
        before: earliest,
        limit: this.service.fetchLimit,
      })
      if (seq !== this.loadSeq) return // 期间重新 init（周期 / 标的切换）→ 丢弃，状态由新 init 自己发
      const added = this.prependHistory(points)
      if (added === 0 || points.length < this.service.fetchLimit) this.hasMoreHistory = false
      this.setStatus('ready')
    } catch (error) {
      if (seq !== this.loadSeq) return
      console.error('[KLineChart] loadEarlier failed:', error)
      this.setStatus('error')
    } finally {
      this.loadingEarlier = false
    }
  }

  /**
   * 外部数据整体写入（ChartDataService 拉取历史后调用）：
   * 按当前周期过滤数据点（K 线周期取 pointType='kline'，分时周期取 'timeshare'）→
   * 重建 series / 指标缓存并设置初始视口（周期切换、首次加载统一入口）。
   *  - K 线：视口仅展示最近 VISIBLE_BAR_COUNT（120）根，右边缘对齐（用户需求 v1.7.1；
   *    数据不足 120 根时全部展示）；左滑边缘仍可翻更早历史。
   *  - 分时：全量 N 日数据（1d~5d）fitContent，不参与左滑翻页（hasMoreHistory=false）。
   */
  setKlineData = (points: ChartDataPoint[]): void => {
    this.bars = points.filter(point =>
      this.timeshareManager.isTimeshare ? point.pointType === 'timeshare' : point.pointType === 'kline'
    )
    this.rebuildBarIndex()
    // v1.7.1：刻度显隐（Y 轴刻度区宽度）在数据写入前应用——与 X 轴视口完全解耦，
    // 避免 applyPriceScaleVisible 内部"保存/恢复 visibleRange"与下方数据 setData /
    // fitContent / setVisibleLogicalRange 交叉（跨周期数据时间戳跨度大时，恢复的
    // 旧 range 会干扰视口铺满，见 K线→分时视图未铺满修复）。
    // pane 在构造时已全部创建（addSeries 即建 pane），此处遍历全部 pane 生效。
    this.applyPriceScaleVisible('left', this.showLeftScale)
    this.applyPriceScaleVisible('right', this.showRightScale)
    this.applyData()
    // 分时数据为完整 N 个交易日（无更早分页），不触发左滑边缘加载
    if (this.timeshareManager.isTimeshare) {
      this.hasMoreHistory = false
      this.chart.timeScale().fitContent()
      return
    }
    this.hasMoreHistory = points.length >= (this.service?.fetchLimit ?? 0)
    // K 线初始视口：仅展示最近 VISIBLE_BAR_COUNT 根（右边缘对齐，from 不为负）
    const total = this.bars.length
    if (total > 0) {
      this.chart.timeScale().setVisibleLogicalRange({
        from: Math.max(total - VISIBLE_BAR_COUNT, 0),
        to: total - 1,
      })
    }
  }

  /**
   * 实时推送队列（v1.7.1 节流）：订阅回调进入队列，REALTIME_FLUSH_MS 窗口内由
   * realtimeFlush 一次性消费——数据不丢（trailing 保留末次点），渲染合并。
   */
  private realtimeQueue: ChartDataPoint[] = []
  /** 实时批量 flush（throttle 包装，v1.7.1 节流）：消费队列 → 逐点应用 series/bars
   *  → 统一重建指标缓存一次（避免高频推送逐点重建导致的争抢 / 卡顿） */
  private readonly realtimeFlush: Throttled<[]> = throttle((): void => {
    if (this.realtimeQueue.length === 0) return
    const batch = this.realtimeQueue
    this.realtimeQueue = []
    for (const point of batch) this.applyRealtimePoint(point)
    this.rebuildRealtimeIndicators()
  }, REALTIME_FLUSH_MS)

  /** 实时订阅回调入口（节流批量，v1.7.1 节流）：WS / SSE / 轮询高频推送合并
   *  为窗口内一次批量应用，避免数据争抢；单点透传不丢数据。 */
  private enqueueRealtimePoint = (point: ChartDataPoint): void => {
    this.realtimeQueue.push(point)
    this.realtimeFlush()
  }

  /**
   * 实时单点应用（series 更新 + bars/barIndex 维护）：
   *  - 同 time = 刷新最后一点（series.update 覆盖语义）；
   *  - time 更大 = 追加新点（实时推送）。
   * 按周期接收对应点类型：K 线周期收 pointType='kline'（update K 线 / 成交量锚点），
   * 分时周期收 'timeshare'（update 价格 / 均价线 / 成交量直方图）。
   * **不含指标缓存重建**：单点入口（updateLastBar）与批量入口（realtimeFlush）
   * 共用本方法，重建由调用方统一执行一次，避免逐点重建开销。
   */
  private applyRealtimePoint = (point: ChartDataPoint): void => {
    const expected = this.timeshareManager.isTimeshare ? 'timeshare' : 'kline'
    if (point.pointType !== expected) return
    // v1.6.10：time 统一归一化为数字秒（防 BusinessDay 对象 → series.update 报错）
    const time = normalizeChartTime(point.time)
    if (time === null) return
    // 越界防御：新 time 早于最后一根（周期切换残留 / 旧周期实时推送）→ 忽略，
    // 避免 lightweight-charts "Cannot update oldest data, last time=[object Object]"
    const last = this.bars[this.bars.length - 1]
    if (last && time < normalizeChartTime(last.time)!) return
    if (this.timeshareManager.isTimeshare) {
      // 分时：更新价格 / 均价线 + 成交量锚点（1px 细柱由 VolumeBarPrimitive 自绘，
      // 红绿按 price vs preClose 三态，v1.7.0）
      this.timesharePriceSeries?.update({
        time: time as UTCTimestamp,
        value: point.price ?? 0,
      })
      this.timeshareAvgSeries?.update({
        time: time as UTCTimestamp,
        value: point.avgPrice ?? 0,
      })
      this.volumeSeries.update({
        time: time as UTCTimestamp,
        value: point.volume ?? 0,
      })
      // 右刻度承载 series 同步（v1.7.1 修复：保持 right scale 有数据，见 applyData 注释）
      this.timeshareRightAxisSeries?.update({
        time: time as UTCTimestamp,
        value: point.price ?? 0,
      })
    } else {
      this.klineSeries.update({
        time: time as UTCTimestamp,
        open: point.open!,
        high: point.high!,
        low: point.low!,
        close: point.close!,
        ...resolveBarColors(point, themeColors(this.theme)), // 三态色随实时数据更新（v1.6.57）
      })
      this.volumeSeries.update({
        time: time as UTCTimestamp,
        value: point.volume ?? 0,
      })
      // 右刻度承载 series 同步（v1.7.1 修复：K 线实时推送保持 right scale 有数据）
      this.timeshareRightAxisSeries?.update({
        time: time as UTCTimestamp,
        value: point.close ?? 0,
      })
    }
    if (last && time > normalizeChartTime(last.time)!) {
      this.bars.push({ ...point, time })
      // v1.7.1 priceLine 修复：实时追加新 bar 后最后 bar 的 logical index 变大，
      // 视口若仍固定在旧 120 根范围 → 最后 bar 逐渐移出视口 → 库 priceLine
      // （画在最后 bar 位置）随之消失（"不操作，一会这条线就没有了"）。
      // 仅当视口右边缘贴近最后 bar（用户未左滑看历史）时跟随——保持最后 120 根
      // 可视 + 价格线恒在视口；用户左滑查看更早数据时不抢回视口。
      this.followLastBarIfTracking()
    } else {
      const index = this.bars.findIndex(bar => normalizeChartTime(bar.time) === time)
      if (index >= 0) this.bars[index] = { ...point, time }
    }
    // 实时增量维护 tooltip 索引（O(1)；批量场景走 rebuildBarIndex）
    this.barIndex.set(time, { ...point, time })
  }

  /**
   * 实时视口跟随（v1.7.1 priceLine 修复）：K 线模式实时追加新 bar 后，
   * 若视口右边缘贴近最后 bar（用户未左滑查看更早历史），将视口重新定位到
   * 最后 VISIBLE_BAR_COUNT 根——最后 bar（及库 priceLine）恒在视口内；
   * 用户左滑看历史（右边缘远离最后 bar）时不抢回视口。
   * 分时模式：视口由 fitContent 固定（整日数据无追加），直接跳过。
   * 非动画实现（setVisibleLogicalRange），避免 scrollToRealTime 的 400ms 滚动动画
   * 在 60ms 实时 flush 下连续触发导致的闪烁。
   */
  private followLastBarIfTracking = (): void => {
    if (this.timeshareManager.isTimeshare || this.bars.length === 0) return
    const range = this.chart.timeScale().getVisibleLogicalRange()
    if (!range) return
    const lastIndex = this.bars.length - 1
    // 仅当视口右缘与最后 bar 相差不足 1 根（贴住数据末尾、未主动平移 / 越界）时跟随；
    // lightweight-charts 允许逻辑范围越出数据右缘（拖拽后 to 可 > lastIndex），
    // 此时若用宽松条件（to >= lastIndex - 1）会在下一次实时推送把视口拽回最后 120 根
    // （"右移 10 多条后一段时间复原" v1.7.1 修复）——越界（to > lastIndex）或
    // 看历史（to < lastIndex - 1）均视为用户已脱离跟踪，实时追加不再抢回视口。
    if (Math.abs(range.to - lastIndex) < 1) {
      this.chart.timeScale().setVisibleLogicalRange({
        from: Math.max(lastIndex + 1 - VISIBLE_BAR_COUNT, 0),
        to: lastIndex,
      })
    }
  }

  /**
   * 实时指标缓存统一重建（v1.7.1 节流关键）：单点入口（updateLastBar）与批量
   * flush（realtimeFlush）共用，高频推送窗口内只重建一次，避免逐点重建开销。
   */
  private rebuildRealtimeIndicators = (): void => {
    this.indicatorManager.rebuildVolumeData()
    this.indicatorManager.refreshMainIndicatorData()
    this.indicatorManager.rebuildIndicatorData()
    // 分时实时推送：价格范围随最新数据重新对称（v1.7.1）
    this.timeshareManager.applyPriceRange()
  }

  /**
   * 实时增量更新（ChartDataService 订阅回调；外部 / 测试单点调用入口）：
   * series 更新 + bars/barIndex 维护 + 指标缓存重建（单点立即执行，语义与
   * v1.7.1 前一致）；订阅内部走 enqueueRealtimePoint（节流批量合并）。
   */
  updateLastBar = (point: ChartDataPoint): void => {
    this.applyRealtimePoint(point)
    this.rebuildRealtimeIndicators()
  }

  /**
   * 更早历史前置插入（平移左滑到边缘 → 组件拉取更早页后调用）：
   * 过滤 kline 点 → 前置合并（去重 / 升序，见 mergeBars）→ 重建 series / 指标缓存 →
   * 视口逻辑范围右移 added（保持用户当前看到的数据位置不变）。
   * @returns 实际新增条数（0 = 无更早数据，调用方停止后续触发）
   */
  prependHistory = (points: ChartDataPoint[]): number => {
    // 按当前周期过滤（分时周期 hasMoreHistory=false 不会触发翻页，此处统一防御）
    const incoming = points.filter(point =>
      this.timeshareManager.isTimeshare ? point.pointType === 'timeshare' : point.pointType === 'kline'
    )
    if (!incoming.length) return 0
    const { bars, added } = mergeBars(this.bars, incoming)
    if (added === 0) return 0
    // 保存当前可见逻辑范围，setData 后偏移恢复（新数据前置 → 原有数据右移 added 根）
    const range = this.chart.timeScale().getVisibleLogicalRange()
    this.bars = bars
    this.rebuildBarIndex()
    this.applyData()
    if (range) {
      this.chart.timeScale().setVisibleLogicalRange({
        from: range.from + added,
        to: range.to + added,
      })
    }
    return added
  }

  /** 重建 time → bar 索引（批量数据变更后调用：setKlineData / prependHistory） */
  private rebuildBarIndex = (): void => {
    this.barIndex = new Map(this.bars.map(bar => [bar.time, bar]))
  }

  /** 按 time 取整根 K 线（十字星 tooltip 命中数据源，O(1) 索引） */
  private getBarByTime = (time: number): ChartDataPoint | undefined => this.barIndex.get(time)

  /** 时间文本（十字星 tooltip 时间列；与 pane0 信息行同款格式：format 模板或按周期自动） */
  private getTimeText = (time: number): string =>
    this.timeFormat ? formatTimeByFmt(time, this.timeFormat) : formatAxisTime(time, this.period)

  /** 当前最早一根 K 线 time（无数据时 undefined；组件用作 before 分页锚点） */
  getEarliestTime = (): number | undefined => this.bars[0]?.time

  /* ===================== 对外 API ===================== */

  /** 主题切换（深系 / 浅系）：不改变 X 轴视口 / 布局尺寸 */
  /**
   * 周期切换（v1.6.9）：pane0 信息行时间格式随周期变化
   * （日/周/月 → YYYY-MM-DD；分时 → HH:mm；分钟 K → YYYY-MM-DD HH:mm）。
   * 信息行分段在 draw 时现取 getPeriod，此处仅存值 + requestUpdate 触发重绘。
   */
  /** 更新股票代码（v1.6.22 修复：props.symbol 变化时 init 用新标的拉数）；
   *  惰性 getter 现取 this.symbol，触发重绘即刷新 pane0 信息行 */
  setSymbol = (symbol: string): void => {
    this.symbol = symbol
    this.chart.applyOptions({})
  }

  /** 更新股票名称（pane0 信息行：名称 [代码]） */
  setName = (name: string): void => {
    this.name = name
    this.chart.applyOptions({})
  }

  /** 更新数据服务实例（v1.6.22 修复：props.service 变化时 init 用新服务拉数） */
  setService = (service: ChartDataService): void => {
    this.service = service
  }

  setPeriod = (period: PeriodValueOrEmpty): void => {
    if (this.period === period) return
    this.period = period
    // 分时不可平移（v1.7.0）：分时整日数据 fitContent 固定视口，滚轮 / 按住拖拽 /
    // 触摸平移全部关闭（缩放仍由工具栏按钮控制，handleScale 全局已禁滚轮）；
    // 切回 K 线周期恢复默认平移交互
    this.applyTimeshareInteractions()
  }

  /**
   * 平移交互按周期应用（v1.7.1 抽取）：分时（1d~5d）禁用滚轮 / 拖拽平移，
   * K 线恢复默认。setPeriod 与构造（默认周期即分时时，setPeriod 因周期相同
   * 直接 return，必须构造时应用）统一走此方法。
   */
  private applyTimeshareInteractions = (): void => {
    this.chart.applyOptions({
      handleScroll: this.timeshareManager.isTimeshare
        ? {
            mouseWheel: false,
            pressedMouseMove: false,
            horzTouchDrag: false,
            vertTouchDrag: false,
          }
        : {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: true,
          },
    })
  }

  applyTheme = (name: ChartThemeName): void => {
    this.theme = name
    const themeColorSet = themeColors(name)
    this.tooltip.setTheme(themeColorSet)
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
      // 栅格保持关闭（栅格由 GridPrimitive 自绘，draw 时现取新主题色）
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      // 十字星线颜色 + 指示值标签背景跟随主题（半透明线深浅系区分；
      // 时间轴 + 价格轴标签文字颜色库自动黑白对比）
      crosshair: {
        vertLine: {
          color: themeColorSet.crosshairLineColor,
          labelBackgroundColor: themeColorSet.crosshairLabelBackground,
        },
        horzLine: {
          color: themeColorSet.crosshairLineColor,
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
    // 分时双线颜色跟随主题（深浅系区分，v1.7.0）
    this.timesharePriceSeries?.applyOptions({ color: themeColorSet.timesharePriceColor })
    this.timeshareAvgSeries?.applyOptions({ color: themeColorSet.timeshareAvgColor })
    // 成交量锚点色跟随背景（保持不可见）；可见柱体由 primitive 动态取新主题色
    this.volumeSeries.applyOptions({ color: themeColorSet.background })
    // 指标相关颜色（MACD 锚点 / SAR 圆点 / 成交量均量线）由指标管理器统一同步
    this.indicatorManager.updateThemeColors(themeColorSet)
    // K 线逐根三态色基于主题 palette（红/绿/平盘），主题切换后重设数据刷新（v1.6.57）；
    // 分时周期无 K 线数据（bars 为 timeshare 点），跳过防 NaN（v1.7.0）
    if (!this.timeshareManager.isTimeshare) this.refreshKlineColors(themeColorSet)
    // 空 Pane 文字颜色在 draw 时动态取色，applyOptions 触发重绘即自动更新
  }

  /** 按当前主题重设 K 线逐根三态色（主题切换时调用，不动数据与指标） */
  /** K 线逐根三态配色重设：委托 viewport.refreshKlineColors（v1.7.1 拆分） */
  private refreshKlineColors = (palette: BarPalette): void => {
    viewportRefreshKlineColors(this.bars, this.klineSeries, palette)
  }

  /** 放大（X 轴 barSpacing ×1.25，限幅） */
  /** 放大（X 轴 barSpacing ×1.25，限幅 80）：委托 viewport.zoomIn */
  zoomIn = (): void => viewportZoomIn(this.chart)

  /** 缩小（X 轴 barSpacing ÷1.25，限幅） */
  /** 缩小（X 轴 barSpacing ÷1.25，下限 0.5）：委托 viewport.zoomOut */
  zoomOut = (): void => viewportZoomOut(this.chart)

  /**
   * 左移（视口向左平移 60 根K线，看更早数据）。
   * 用逻辑范围平移替代 scrollToPosition（后者距右边缘不足一屏时减幅变负被 clamp，
   * 直接跳到最新数据末尾）；逻辑范围平移到达最左自然停止，无跳变。
   */
  /** 左移（视口向左平移 60 根K线）：委托 viewport.shiftLeft */
  shiftLeft = (): void => viewportShiftLeft(this.chart)

  /** 右移（视口向右平移 60 根K线，看更晚数据；到达最右自然停止，不跳变） */
  /** 右移（视口向右平移 60 根K线）：委托 viewport.shiftRight */
  shiftRight = (): void => viewportShiftRight(this.chart)

  /** 设置主图指标（互斥单选；转发至指标管理器，null = 关闭） */
  setMainIndicator = (name: MainIndicatorType | null): void => {
    this.indicatorManager.setMainIndicator(name)
  }

  /** 设置附图指标（互斥单选；转发至指标管理器，null = 关闭指标层） */
  setSubIndicator = (name: import('../indicator').SubIndicatorType | null): void => {
    this.indicatorManager.setSubIndicator(name)
  }

  /**
   * 重建附图指标数据缓存（v1.7.1）：数据未变化但指标层可能处于"过期/清空"状态时
   * 强制按当前 bars 重算——典型场景：分时切回 K 线（分时下 CR 被防御清空缓存但
   * 状态保留；data 直通模式下切周期不触发 applyData → 需显式重建，见 KLineChart.vue
   * period watch）。指标层关闭时为空操作（rebuildDataIfOpen 幂等）。
   */
  refreshSubIndicatorData = (): void => {
    this.indicatorManager.rebuildIndicatorData()
  }

  /** 时间轴开关：切换显隐后重算 pane 高度（时间轴高度占用随之变化，保证固定空 Pane 仍绝对相等） */
  toggleTimeAxis = (visible: boolean): void => {
    this.chart.timeScale().applyOptions({ visible })
    this.applyStretchFactors()
  }

  /** 左刻度区开关：显隐所有 Pane 的 left price scale（视图内数据不变） */
  setLeftScaleVisible = (visible: boolean): void => {
    if (this.showLeftScale === visible) return
    this.showLeftScale = visible
    this.applyPriceScaleVisible('left', visible)
  }

  /** 右刻度区开关：显隐所有 Pane 的 right price scale（视图内数据不变） */
  setRightScaleVisible = (visible: boolean): void => {
    if (this.showRightScale === visible) return
    this.showRightScale = visible
    this.applyPriceScaleVisible('right', visible)
  }

  /** 最后价线显隐（v1.7.1）：切换自绘 priceLine（幂等）。
   *  变化时对 klineSeries 同值 applyOptions 强制 invalidate 立即生效
   *  （库 priceLine 保持关闭，重绘由自绘 primitive 现取 visible）；
   *  分时模式无 kline 点天然不绘制，调用无副作用。 */
  setPriceLineVisible = (visible: boolean): void => {
    if (!this.priceLinePrimitive) return
    this.priceLinePrimitive.setVisible(visible)
    this.klineSeries.applyOptions({ priceLineVisible: false })
  }

  /**
   * 键盘方向键移动十字星（v1.7.1）：每次移动 1 根 bar。
   *  - 基准：十字星当前命中的 bar（overlayTime 反查，鼠标 / 上次键盘位置天然同步）；
   *    未激活（overlayTime = null）时从最后 bar 起算（首次按键定位到最后 bar 附近）；
   *  - 目标：委托 viewport.computeCrosshairTargetIndex（纯函数，clamp 到数据范围）；
   *  - 定位：chart.setCrosshairPosition(价格, time, 主 series)——库自动重绘竖线 / 横线 /
   *    轴标签，并触发 crosshairMove 事件 → CrosshairManager 联动 overlayTime / tooltip /
   *    左刻度指示值（与鼠标命中同一条链路，无重复逻辑）；
   *  - 分时模式（1d~5d）同样支持（每 bar = 每分钟，price 取分时价格）；
   *    K 线模式 price 取 bar.close。
   */
  moveCrosshairBy = (delta: -1 | 1): void => {
    if (this.bars.length === 0) return
    const series = this.timeshareManager.isTimeshare
      ? this.timesharePriceSeries
      : this.klineSeries
    if (!series) return
    const target = computeCrosshairTargetIndex(
      this.bars,
      this.crosshairManager.getOverlayTime(),
      delta,
    )
    if (target === null) return
    const bar = this.bars[target]
    const time = normalizeChartTime(bar.time)
    if (time === null) return
    const price = this.timeshareManager.isTimeshare
      ? (bar.price ?? 0)
      : (bar.close ?? 0)
    this.chart.setCrosshairPosition(price, time as UTCTimestamp, series)
    // 全链路同步（v1.7.1）：setCrosshairPosition 触发的 crosshairMove 事件经 rAF
    // 节流**下一帧**才处理 —— 同帧内 cap 竖线仍画旧位置（"两条竖线"）、tooltip
    // 数据浮层仍显示旧 bar（更新延迟）。此处同步对齐 overlayTime / tooltip /
    // 左刻度指示值，随后的 rAF 事件写入相同值无副作用（见 CrosshairManager.syncKeyboardMove）。
    this.crosshairManager.syncKeyboardMove(bar, time, series.priceToCoordinate(price) ?? null)
    // 键盘定位 x 注入：键盘后鼠标未动时 cap 竖线跟随键盘目标（时间戳优先于鼠标）
    this.crosshairManager.setKeyboardX(
      this.chart.timeScale().timeToCoordinate(time as Time) ?? null,
    )
  }

  /** 刻度区统一应用（左右宽度一致）：逐个 Pane 设置 price scale 显隐与最小宽度。
   *  切换前后**保持当前可见时间范围不变**——刻度区开关只改变数据区宽度，
   *  不改变视图内的数据（不再 fitContent 重置视口）。 */
  /** 刻度区统一应用（左右宽度一致，切换前后保持可见时间范围不变）：
   *  委托 viewport.applyPriceScaleVisible（v1.7.1 拆分） */
  private applyPriceScaleVisible = (side: 'left' | 'right', visible: boolean): void => {
    viewportApplyPriceScaleVisible(this.chart, side, visible)
  }

  /** 销毁：移除监听 / primitive / chart / 清除实例标记（防内存泄漏） */
  destroy = (): void => {
    // 退订实时推送 + 使在途 init / loadEarlier 请求失效（destroyed 语义）
    this.realtimeUnsubscribe?.()
    this.realtimeUnsubscribe = null
    // 清理实时节流：取消窗口内 trailing 定时器 + 清空未消费队列（防泄漏 / 防销毁后回调）
    this.realtimeFlush.cancel()
    this.realtimeQueue = []
    this.loadSeq++
    // 十字星管理器退订监听 + 清空指示值 primitive 引用
    this.crosshairManager.destroy()
    // 移除十字星数据浮层节点（防泄漏）
    this.tooltip.destroy()
    // 指标管理器清空全部内部引用 / 缓存
    this.indicatorManager.destroy()
    // 卸载 SAR 圆点 primitive（挂在 klineSeries 上，随 chart.remove 一起释放，显式 detach 更保险）
    if (this.sarMarkerPrimitive) {
      this.klineSeries.detachPrimitive(this.sarMarkerPrimitive)
      this.sarMarkerPrimitive = null
    }
    // 卸载主图指标线 primitive（同挂在 klineSeries 上）
    if (this.indicatorLinePrimitive) {
      this.klineSeries.detachPrimitive(this.indicatorLinePrimitive)
      this.indicatorLinePrimitive = null
    }
    // 卸载成交量均量线 primitive（挂在 volumeSeries 上）
    if (this.volumeMaPrimitive) {
      this.volumeSeries.detachPrimitive(this.volumeMaPrimitive)
      this.volumeMaPrimitive = null
    }
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.handleVisibleLogicalRangeChange)
    this.chart.remove()
    this.container.dataset.lwcMounted = 'false'
    // 数据引用显式清空（防 chart.remove 后仍持有大数组 / 索引，加快 GC，v1.7.0）
    this.bars = []
    this.barIndex = new Map()
  }
}
