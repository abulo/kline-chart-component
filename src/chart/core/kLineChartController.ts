// KLineChartController.ts —— 多 Pane K 线图表控制器（功能拆分版）。
// 布局：一个 chart 内多 Pane（lightweight-charts 原生多 Pane，指标层可开关）：
//   指标开启（6 Pane）：
//     pane0：顶部信息行空 Pane（无数据，自绘"名称 [代码] 时间 + 主图指标值"，固定高 22px）
//     pane1：K 线主图（Candlestick，红涨绿跌，上涨柱体空心；可叠加 MA/EXPMA/BOLL/SAR/BBI）
//     pane2：成交量信息行空 Pane（设置与 pane0 一致，高度绝对相等）
//     pane3：成交量（自绘：上涨空心红柱 / 下跌绿实心，柱宽与间隔同 pane1 绝对一致）
//     pane4：指标信息行空 Pane（自绘所选附图指标各线数值，随十字星）
//     pane5：附图指标（RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR，互斥单选；
//            MACD 红绿柱自绘，其余线型指标 top 层自绘，高度与 pane3 一致）
//   指标关闭（4 Pane）：pane0..pane3（去掉 pane4 / pane5，main : volume = 80 : 20）
//
// 高度算法（指标开 60 : 20 : 20 / 指标关 80 : 20）：
//   库实际可用高度 H = 容器高度 - 时间轴高度（库默认 28px，显隐按库状态）
//                      - 分隔线总高（patch 已将 SeparatorHeight 1→0）
//   固定空 Pane 总高 = 固定 Pane 数量 × 22（topPaneHeight），剩余 R = H - 固定总高：
//     指标开：pane0 = 22px、pane1 = 0.6×R；pane2 = 22px、pane3 = 0.2×R；
//             pane4 = 22px、pane5 = 0.2×R
//     指标关：pane0 = 22px、pane1 = 0.8×R；pane2 = 22px、pane3 = 0.2×R
//   像素因子方案：stretchFactor 直接设为目标像素高度 → stretchPixels = 1
//   → 非最后 pane = round(factor) 精确、最后 pane = 剩余 = 目标，无舍入误差；
//   时间轴开 / 关仅影响 H（关时时间轴高度 = 0），组比例不变。
//
// 模块划分（每个 class / 常量一个文件）：
// 本控制器只保留：图表创建 / Pane 构建 / 数据写入 / 布局 / 主题 / 缩放平移 /
// 刻度开关 / 生命周期，并把职责委托给以下模块：
//  - constants.ts：共享常量（LIBRARY_TIME_AXIS_HEIGHT / PRICE_SCALE_MIN_WIDTH）；
//  - types.ts：公共类型（KLineChartOptions / IndicatorLineSpec；主图指标类型
//    在 ../indicator/types.ts，见 MainIndicatorType）；
//  - indicatorMeta.ts：附图指标线名元信息（subIndicatorLabels）；
//  - indicatorManager.ts：指标管理器（主图五指标 + 附图十指标 + 成交量均量线 +
//    信息行分段构建，全部指标元素 top 层自绘，setMainIndicator / setSubIndicator）；
//  - crosshairManager.ts：十字星管理器（十字星移动联动 + overlayTime + 左刻度指示值）；
//  - layout.ts / candlestickWidth.ts / volume/ / overlay/ / indicator/ / axis/ /
//    grid/ / border/ / highLow/：布局常量与算法、各自绘 primitive（独立文件）。
//
// 全局控制（全部由 App.vue 提供按钮）：
//  - 时间轴开关：控制底部时间轴（timeScale）显示 / 隐藏；
//  - 放大 / 缩小 / 左移 / 右移：全局 timeScale 操作（图表内禁用滚轮/触摸缩放）；
//  - 风格切换：深系 / 浅系（theme.ts 统一配色，红涨绿跌锁定）；
//  - 左 / 右刻度区开关：显隐全部 Pane 的 price scale（宽度一致 72px，无边框）；
//  - 附图指标（互斥）：RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR（pane5 指标层，
//    setSubIndicator：选中 = 打开指标层、取消选中 = 关闭指标层，pane4 信息行显示数值；
//    MACD 柱 + 线、其余指标线全部 top 层自绘，指标切换动态重算缓存）；
//  - 主图指标（互斥）：MA / EXPMA / BOLL / SAR / BBI（pane1 叠加，东财指标库，
//    setMainIndicator：切换时先清空缓存，SAR 用 SarMarkerPrimitive 显隐控制）。
//
// 生命周期：实例保护（container dataset 标记防重复创建 chart）；
// ResizeObserver 跟随容器尺寸重算 pane 高度；destroy 销毁（防内存泄漏）。

import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
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
import { createPanes, createVolumePanes } from './paneFactory'
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
  getCrosshairScrollOffset,
} from './viewport'
import { normalizeChartTime, formatTimeByFmt, formatAxisTime, formatDate, formatClock } from '../util/format'
import { type PeriodValueOrEmpty } from '../periods'
import { CrosshairAxisLabelPrimitive } from '../crosshair/crosshairAxisLabelPrimitive'
import { CrosshairLinePrimitive } from '../crosshair/crosshairLinePrimitive'
import { CrosshairTooltip, type TooltipBounds } from '../crosshair/crosshairTooltip'
import { IndicatorManager } from './indicatorManager'
import { ChartDataBridge } from './chartDataBridge'
import { RealtimePipeline } from './realtimePipeline'
import { CrosshairManager } from './crosshairManager'
import { PRICE_SCALE_MIN_WIDTH, VISIBLE_BAR_COUNT } from './constants'
import type { KLineChartOptions, ChartLoadStatus } from './types'
import type { MainIndicatorType } from '../indicator'
import type { ChartDataService } from '../../services/chartDataService'

// 公共类型 re-export（App.vue 等外部使用者继续从本文件导入，保持接口稳定；
// 主图指标类型已统一迁移至 ../indicator —— 指标公共类型单一来源）。
export type { MainIndicatorType } from '../indicator'
export type { KLineChartOptions } from './types'

/**
 * 多 Pane K 线图表控制器。
 *
 * @remarks
 * 负责图表创建 / Pane 构建 / 数据写入 / 布局 / 主题 / 缩放平移 / 刻度开关 /
 * 生命周期；指标、十字星、数据 IO、实时增量分别委托 IndicatorManager /
 * CrosshairManager / ChartDataBridge / RealtimePipeline / TimeshareManager。
 * 实例保护（container dataset 标记防重复创建）；ResizeObserver 跟随容器尺寸
 * 重算 pane 高度；destroy 销毁（防内存泄漏）。
 */
export class KLineChartController {
  /** chart 实例（多 Pane 容器）。 */
  private readonly chart: ReturnType<typeof createChart>
  /** 挂载容器（布局高度 / 实例标记 / ResizeObserver）。 */
  private readonly container: HTMLElement
  // K 线数据（ChartDataPoint：统一数据点类型，pointType='kline'，mock 120 根。
  // 直接作为指标库 / primitive / series 数据源，无内部中间类型。
  // 可变引用：service 拉取（setKlineData）整体替换、实时订阅（updateLastBar）原地更新。
  // 分时周期时存 pointType='timeshare' 点（price / avgPrice 口径，无 OHLC）。
  private bars: ChartDataPoint[] = []
  /** 分时价格线（pane1，LineSeries；分时周期渲染 price，K 线周期 setData([]) 不可见）。 */
  private timesharePriceSeries: ISeriesApi<'Line'> | null = null
  /** 分时均价线（pane1，LineSeries；分时周期渲染 avgPrice）。 */
  private timeshareAvgSeries: ISeriesApi<'Line'> | null = null
  // 分时右刻度承载 series：挂 pane1 right price scale（空数据透明锚点），
  // 仅为右刻度百分比标签提供 priceAxisPaneViews 画布（右刻度区占位 + 自绘）。
  private timeshareRightAxisSeries: ISeriesApi<'Line'> | null = null
  // time → bar 索引（十字星 tooltip 命中取数 O(1)；批量重建 / 实时增量维护）。
  private barIndex = new Map<number, ChartDataPoint>()
  /** 各 Pane 像素高度（applyStretchFactors 更新；十字星 tooltip 定位 paneTop 用）。 */
  private paneHeights: number[] = []
  /** 十字星数据浮层（命中显示时间/OHLC/涨跌/涨幅/量额九项）。 */
  private readonly tooltip: CrosshairTooltip
  /** 股票名称（pane0 顶部信息行显示：名称 [代码]）。 */
  private name: string
  /** 股票代码（pane0 顶部信息行显示：名称 [代码]）。 */
  private symbol: string
  /** 时间格式模板（透传 KLineChart.vue format；undefined → 按周期自动）。 */
  private readonly timeFormat: string | undefined
  // 当前周期（setPeriod 更新；pane0 信息行时间格式按周期切换；
  // 允许 '' 空值 = 周期未设置，init 不发起请求）。
  private period: PeriodValueOrEmpty
  /** 数据服务（init / loadEarlier 经其拉取历史与订阅实时；组件构造时注入）。 */
  private service: ChartDataService | undefined
  /** 加载状态回调（可选；init 全流程状态通知）。 */
  private readonly onStatusChange: ((status: ChartLoadStatus) => void) | undefined
  // 数据 IO 桥：历史首载 / 更早翻页 / 实时订阅生命周期 / 加载状态。
  // 竞态守卫（loadSeq 代际）、hasMoreHistory / loadingEarlier / 订阅退订均在此类内；
  // 拉到的数据经回调交还本控制器（setKlineData / prependHistory / enqueueRealtimePoint）。
  private readonly dataBridge: ChartDataBridge
  // 实时增量管线：节流入队 → 批量消费 → series/bars/barIndex 增量更新
  // → 指标缓存统一重建 + priceLine 视口跟随；chart 经 getter 惰性取
  //（构造时序：pipeline 先于 chart 创建）。
  private readonly realtimePipeline: RealtimePipeline
  // 可视逻辑范围变化处理：到达最左边缘（from ≤ 0）→ 触发更早历史加载（内部 loadEarlier）。
  private readonly handleVisibleLogicalRangeChange = (range: LogicalRange | null): void => {
    if (range && range.from <= 0) void this.dataBridge.loadEarlier()
  }

  /** K 线 series（pane1；红涨绿跌，上涨柱体空心）。 */
  private klineSeries: ISeriesApi<'Candlestick'>
  // 成交量 series（pane3；Histogram 仅作 scale 锚点，可见柱体由 primitive 自绘）。
  // 成交量组开关关闭时置 null（整组销毁，仿 pane4/5）。
  private volumeSeries: ISeriesApi<'Histogram'> | null

  /** 当前主题（深系 / 浅系）。 */
  private theme: ChartThemeName
  /** 左刻度区开关状态（显隐全部 Pane 的 left price scale）。 */
  private showLeftScale: boolean
  /** 右刻度区开关状态（显隐全部 Pane 的 right price scale）。 */
  private showRightScale: boolean

  /** 容器尺寸监听（跟随容器高度重算固定 Pane 高度）。 */
  private resizeObserver: ResizeObserver | null = null

  /** 指标管理器（主图 / 附图指标 + 信息行 + 成交量均量线）。 */
  private readonly indicatorManager: IndicatorManager
  /** 十字星管理器（十字星移动联动 + 左刻度指示值）。 */
  private readonly crosshairManager: CrosshairManager
  /** 分时（1d~5d）计算管理器：刻度 / 值域 / 等分计算。 */
  private readonly timeshareManager: TimeshareManager

  /** pane1 SAR 圆点 primitive（构造创建并 attach，destroy 显式 detach）。 */
  private sarMarkerPrimitive: SarMarkerPrimitive | null = null
  /** pane1 主图指标线 primitive（IndicatorLinePrimitive，top 层自绘）。 */
  private indicatorLinePrimitive: IndicatorLinePrimitive | null = null
  /** pane1 最后价线 primitive（PriceLinePrimitive 自绘；priceLineVisible 参数控制显隐）。 */
  private priceLinePrimitive: PriceLinePrimitive | null = null
  /** 成交量组显隐（pane2 信息行 + pane3 成交量，默认开；App 按钮 / props 驱动）。 */
  private volumeVisible = true
  /** 分时均价线显隐（默认渲染；关闭时均价线不渲染，pane0 信息行 / tooltip 同步隐藏）。 */
  private avgLineVisible = true
  /** pane3 成交量均量线 primitive（IndicatorLinePrimitive，top 层自绘）。 */
  private volumeMaPrimitive: IndicatorLinePrimitive | null = null
  /** 成交量组自绘竖线实例（volume 关闭时注销，防注册表残留泄漏）。 */
  private volumePane2LinePrimitive: CrosshairLinePrimitive | null = null
  private volumePane3LinePrimitive: CrosshairLinePrimitive | null = null

  constructor(options: KLineChartOptions) {
    this.container = options.container
    this.showLeftScale = false
    this.showRightScale = false
    this.theme = 'dark'
    // 股票信息（pane0 顶部信息行显示，格式：名称 [代码]）。
    this.name = options.name ?? ''
    this.symbol = options.symbol ?? ''
    // 数据服务（组件构造时注入 props.service ?? defaultService；未注入则 init 报错不拉数）。
    this.service = options.service
    this.onStatusChange = options.onStatusChange
    // 数据 IO 桥：deps 惰性取当前 symbol / period / service（切换后无需重建），
    // 回调绑定本控制器数据处理入口（setKlineData / prependHistory / enqueueRealtimePoint）。
    this.dataBridge = new ChartDataBridge({
      getSymbol: () => this.symbol,
      getPeriod: () => this.period,
      getService: () => this.service,
      onStatus: status => this.onStatusChange?.(status),
      onHistory: points => this.setKlineData(points),
      onPrepend: points => this.prependHistory(points),
      onEarliest: () => this.getEarliestTime(),
      onRealtimePoint: point => this.realtimePipeline.enqueueRealtimePoint(point),
    })
    // 实时增量管线：订阅回调 → 节流批量 → series/bars/barIndex 增量更新 →
    // 指标缓存统一重建 + 视口跟随。series / bars / barIndex 经 getter 取引用直接变异。
    this.realtimePipeline = new RealtimePipeline({
      // 惰性 getter：本构造内 pipeline 先于 chart 创建（createChart 在后段），
      // 取快照会得到 undefined（修复：realtimePipeline.deps.chart → getChart）。
      getChart: () => this.chart,
      getBars: () => this.bars,
      getBarIndex: () => this.barIndex,
      getIsTimeshare: () => this.timeshareManager.isTimeshare,
      getTheme: () => this.theme,
      getKlineSeries: () => this.klineSeries,
      getVolumeSeries: () => this.volumeSeries ?? undefined,
      getTimesharePriceSeries: () => this.timesharePriceSeries ?? undefined,
      getTimeshareAvgSeries: () => this.timeshareAvgSeries ?? undefined,
      getTimeshareRightAxisSeries: () => this.timeshareRightAxisSeries ?? undefined,
      onRebuildIndicators: () => this.rebuildRealtimeIndicators(),
    })
    // 十字星数据浮层：挂 document.body（position: fixed，脱离图表 DOM 树，
    // 杜绝层级 / 事件拦截不确定性；传入 chart 容器作为定位基准 rect）。
    this.tooltip = new CrosshairTooltip(this.container, themeColors(this.theme))

    // 实例保护：容器打标记防重复创建 chart 实例。
    // 组件重复挂载 / HMR / 路由切换时可能再次进入构造；标记在 destroy 时清除，
    // 保证同一容器同一时刻只有一个 chart 实例（防止内存泄漏与布局错乱）。
    if (this.container.dataset.lwcMounted === 'true') {
      throw new Error('KLineChartController: 容器已挂载 chart 实例，禁止重复创建')
    }
    this.container.dataset.lwcMounted = 'true'

    // 创建 chart：自动跟随容器尺寸；分隔线颜色 = 背景色（视觉上不设置分割线）。
    const initialThemeColors = themeColors(this.theme)
    this.chart = createChart(this.container, {
      autoSize: true,
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
          separatorColor: initialThemeColors.background,
          separatorHoverColor: initialThemeColors.background,
        },
      },
      // 十字星：Normal 模式 = 横竖线自由跟随鼠标（不吸附数据点）。
      // 竖线：改为自绘（CrosshairLinePrimitive，zOrder 'top' 最后挂载，
      // 贯穿 pane 全高、画在所有指标内容之上）→ 库竖线关闭（visible: false），
      // 避免双竖线；自绘竖线颜色跟随 crosshairLineColor（不透明，深浅系区分）。
      // 横线也改为自绘（与价格线一致 [6,4] 虚线；库 horzLine 的 dash 由线宽派生
      // [2w,2w]，无法表达该样式）→ 库横线一并关闭（visible: false），
      // 避免库实线横线与自绘虚线叠加成实线；横线仅命中 pane 绘制（自绘同语义）。
      // 时间轴（X 轴）十字星指示值标签背景跟随深浅系 crosshairLabelBackground
      //（文字颜色由库按背景亮度自动对比：深背景白字 / 浅背景黑字）。
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: initialThemeColors.crosshairLineColor,
          labelBackgroundColor: initialThemeColors.crosshairLabelBackground,
          style: LineStyle.Solid,
          visible: false,
        },
        horzLine: {
          color: initialThemeColors.crosshairLineColor,
          labelBackgroundColor: initialThemeColors.crosshairLabelBackground,
          style: LineStyle.Solid,
          visible: false,
        },
      },
      // 栅格化关闭：纵向 / 横向栅格线全部隐藏（栅格由 GridPrimitive 自绘）。
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      // 图表区域内禁止缩放（滚轮 / 双指捏合 / 按住坐标轴拖动 / 双击重置全部关闭），
      // 缩放仅由工具栏按钮控制；平移（拖动）保留。
      handleScale: {
        mouseWheel: false,
        pinch: false,
        axisPressedMouseMove: false,
        axisDoubleClickReset: false,
      },
      // 左右刻度区隐藏：数据区域铺满整个宽度（刻度区由开关显隐，见 setLeftScaleVisible）。
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
        // 时间轴刻度标签：K 线状态 → YYYY-MM-DD；分时状态 → HH:mm
        //（不随 format 参数变化；十字光标时间格式仍走下方 localization.timeFormatter）。
        tickMarkFormatter: (t: Time) => {
          const ts = t as number
          return this.timeshareManager.isTimeshare ? formatClock(ts) : formatDate(ts)
        },
      },
      localization: {
        // 十字光标时间格式化：format 模板优先；缺省按周期自动
        //（日/周/月 → YYYY-MM-DD；分时 → HH:mm；分钟 K → YYYY-MM-DD HH:mm）。
        timeFormatter: (t: Time) => {
          const ts = t as number
          return this.timeFormat ? formatTimeByFmt(ts, this.timeFormat) : formatAxisTime(ts, this.period)
        },
      },
    })

    // 管理器：指标 + 十字星 + 分时。
    // 指标管理器依赖惰性 getter（klineSeries / volumeSeries 尚未创建，
    // getter 在 draw / 调用时才求值，保证构建顺序安全）。
    this.indicatorManager = new IndicatorManager({
      chart: this.chart,
      getBars: () => this.bars,
      getTheme: () => this.theme,
      getOverlayTime: () => this.crosshairManager.getOverlayTime(),
      getName: () => this.name,
      getSymbol: () => this.symbol,
      crosshairRegistry: this.crosshairManagerRegistry,
      onIndicatorStateChange: () => this.applyStretchFactors(),
      // pane0 信息行时间格式（format 模板优先，缺省按周期自动）。
      getTimeFormat: () => this.timeFormat,
      getPeriod: () => this.period,
      // 成交量组显隐（pane0 分时信息行隐藏 成交量 / 成交额 段）。
      getShowVolume: () => this.volumeVisible,
      // 均价线显隐（pane0 分时信息行隐藏 均价 段）。
      getShowAvg: () => this.avgLineVisible,
    })
    // 分时（1d~5d）计算管理器：刻度 / 值域 / 等分计算全部收敛于此，
    // controller 只负责调用与数据写入；依赖 chart / bars / indicatorManager（惰性读取）。
    this.timeshareManager = new TimeshareManager({
      chart: this.chart,
      getPeriod: () => this.period,
      getBars: () => this.bars,
      getShowIndicator: () => this.indicatorManager.getShowIndicator(),
      getTheme: () => this.theme,
      getPriceSeries: () => this.timesharePriceSeries,
    })
    // 十字星管理器：构造即订阅十字星移动（pane0 不触发 / 内容 Pane 注入左刻度指示值 /
    // 命中更新数据浮层）。
    this.crosshairManager = new CrosshairManager({
      chart: this.chart,
      tooltip: this.tooltip,
      getBarByTime: this.getBarByTime,
      getPaneTop: this.getPaneTop,
      getTimeText: this.getTimeText,
      getWidth: () => this.container.clientWidth,
      getShowVolume: () => this.volumeVisible,
      getShowAvg: () => this.avgLineVisible,
      getTooltipBounds: (): TooltipBounds => ({
        // X：pane1~pane5 数据区左右缘（扣除左 / 右刻度区宽，开关打开时收窄）。
        left: this.showLeftScale ? PRICE_SCALE_MIN_WIDTH : 0,
        right: this.container.clientWidth - (this.showRightScale ? PRICE_SCALE_MIN_WIDTH : 0),
        // Y：pane1 顶部 → pane5 底部（信息行 pane2/4 在内）。
        top: this.getPaneTop(1),
        bottom: this.getPaneTop(5) + (this.paneHeights[5] ?? 0),
      }),
    })

    // Pane 构建：pane0~pane3 全部 series / primitive 由 paneFactory.createPanes
    // 统一创建装配（职责解耦）——信息行 pane0 / K 线主图 pane1（含分时双线 +
    // 左右刻度 + 十字星指示值 + 高低价标注 + SAR + 指标线）/ 成交量信息行 pane2 /
    // 成交量 pane3。
    this.exposeDebugApi()
    const panes = createPanes({
      chart: this.chart,
      getTheme: () => this.theme,
      getBars: () => this.bars,
      getPeriod: () => this.period,
      indicatorManager: this.indicatorManager,
      timeshareManager: this.timeshareManager,
      crosshairManager: this.crosshairManager,
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
    this.volumePane2LinePrimitive = panes.pane2LinePrimitive
    this.volumePane3LinePrimitive = panes.pane3LinePrimitive

    // pane4 / pane5：指标组（初始关闭）。
    // 指标层初始关闭（4 Pane：pane0..pane3，main : volume = 80 : 20）；
    // 用户点击附图指标按钮（setSubIndicator）时由 IndicatorManager 创建 pane4 / pane5
    //（60:20:20），关闭时移除 —— 布局随 getShowIndicator 状态重算。

    // 高度分配：pane0 / pane2 / pane4 固定 topPaneHeight（同一 factor，绝对相等），
    // pane1 K 线，pane3 成交量 / pane5 指标。
    this.timeFormat = options.format
    // 构造即应用初始周期（组件透传 props.period）——分时判定 / 数据过滤按此生效；
    // 缺省不设置（父组件未传时周期为空，不发起数据请求）。
    // 默认值语义：options.period 为 undefined（父组件未传）→ ''（不设置，
    // init 守卫跳过，与 symbol 空值守卫一致）；显式传具体周期 → 按该周期加载。
    this.period = options.period ?? ''
    // 最后价线显隐（默认 true；组件 props.priceLineVisible 透传，
    // setPriceLineVisible 可运行时切换）。
    this.setPriceLineVisible(options.priceLineVisible ?? true)
    // 构造即应用分时交互（默认周期为分时时 setPeriod 不触发 →
    // 平移禁用必须在此生效，否则分时仍可拖拽平移）。
    this.applyTimeshareInteractions()

    this.applyStretchFactors()
    // 成交量组显隐（默认开；props.volumeVisible=false → 移除 pane2/3 + 布局重算）。
    this.setVolumeVisible(options.volumeVisible ?? true)
    // 分时均价线显隐（默认渲染；props.avgLineVisible=false → 隐藏均价线 + 信息行 / tooltip 同步）。
    this.setAvgLineVisible(options.avgLineVisible ?? true)

    // 数据 + 首绘：数据由组件经 ChartDataService 拉取后 setKlineData 注入
    //（控制器不再内置 Mock 生成，统一走 service 层，便于接入真实行情）。
    this.applyData()
    this.chart.timeScale().fitContent()

    // 容器尺寸监听：重算固定 Pane 高度（topPaneHeight）。
    this.resizeObserver = new ResizeObserver(() => {
      // 容器尺寸变化 → 重算 pane 高度（pane1..5 高度按比例分配）。
      this.applyStretchFactors()
      // 分时：fitContent 只在数据加载时按当时宽度 fit，
      // 全屏 / 窗口缩放后容器变宽，X 轴数据带不会自动重新铺满 → 左侧留白。
      // 这里在容器 resize 时重新 fit（分时整日数据全量可见、平移禁用，无副作用）；
      // K 线为固定 120 根可视（setVisibleLogicalRange），库自动调整 barSpacing 撑满，无需处理。
      if (this.timeshareManager.isTimeshare) {
        this.chart.timeScale().fitContent()
      }
    })
    this.resizeObserver.observe(this.container)

    // 平移左滑到边缘 → 触发更早历史加载（回调组件拉取）。
    // 可视逻辑范围左边界 ≤ 0（到达最左边缘）时触发一次；
    // 组件侧防抖 + added=0 停止（见 loadEarlier），此处仅负责"到达边缘"信号。
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.handleVisibleLogicalRangeChange)

    // 外部自定义数据直通（无 mock / http 环境时构造传入，
    // 跳过 service 拉取；series 已全部就绪，setKlineData 直接渲染 + fitContent）。
    if (options.initialBars && options.initialBars.length > 0) {
      this.setKlineData(options.initialBars)
    }
  }

  // 十字星指示值注册表适配器（IndicatorManager 需要注册 / 移除 pane5 的指示值 primitive）。
  private crosshairManagerRegistry = {
    registerPrimitive: (primitive: CrosshairAxisLabelPrimitive): void => {
      this.crosshairManager.registerPrimitive(primitive)
    },
    removeByPaneIndex: (paneIndex: number): void => {
      this.crosshairManager.removeByPaneIndex(paneIndex)
    },
    // 自绘十字星竖线 primitive 注册 / 注销（指标层 pane4/5 使用）。
    registerLinePrimitive: (primitive: CrosshairLinePrimitive): void => {
      this.crosshairManager.registerLinePrimitive(primitive)
    },
    unregisterLinePrimitive: (primitive: CrosshairLinePrimitive): void => {
      this.crosshairManager.unregisterLinePrimitive(primitive)
    },
  }

  /* ===================== 布局 ===================== */

  // 高度分配：委托 paneLayout.applyPaneStretchFactors。
  // 固定空 Pane（pane0 / pane2 / pane4）设同一像素因子 topPaneHeight（绝对相等），
  // 内容 Pane 按组比例分配剩余高度（指标开 60:20:20 / 关 80:20）。
  private applyStretchFactors = (): void => {
    applyPaneStretchFactors({
      chart: this.chart,
      container: this.container,
      getShowVolume: () => this.volumeVisible,
      getShowIndicator: () => this.indicatorManager.getShowIndicator(),
      onHeights: heights => {
        this.paneHeights = heights
      },
    })
  }

  /** 所在 pane 顶部 y（相对图表 canvas）：委托 paneLayout.calcPaneTop。 */
  private getPaneTop = (paneIndex: number): number => calcPaneTop(this.paneHeights, paneIndex)

  // 调试数据暴露（仅开发用）：委托 viewport.exposeDebugApi，
  // 挂 window.__klineChart，getter 惰性读取 → 数据 / 周期实时变化生效。
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
      // 视口探针（调试）：直接委托 chart.timeScale()。
      getVisibleLogicalRange: () => this.chart.timeScale().getVisibleLogicalRange(),
      getVisibleRange: () => this.chart.timeScale().getVisibleRange(),
      // 十字星命中 time 探针（调试）：拖拽 / 键盘移动时实时查看 overlayTime 是否跟随。
      getOverlayTime: () => this.crosshairManager.getOverlayTime(),
      // 自绘竖线 x 探针（调试）：高频移动帧级采样（null = 未命中 / pane0）。
      getLineX: () => this.crosshairManager.getLineX(),
      // 竖线同步判定探针（调试）：pixel / snap / none（速度自适应验证）。
      getSyncMode: () => this.crosshairManager.debugLastSync.mode,
    })
  }

  /* ===================== 数据 ===================== */

  // bars 归一化（抽取）：统一 time 为数字秒、过滤非法条。
  // applyData / applyVolumeData 共用同一数据源语义（series.setData 前必须归一化）。
  private getNormalizedBars = (): { bar: ChartDataPoint; time: number }[] =>
    this.bars
      .map(bar => ({ bar, time: normalizeChartTime(bar.time) }))
      .filter(
        (entry): entry is { bar: ChartDataPoint; time: number } => entry.time !== null,
      )

  // 成交量锚点数据回放：volumeSeries 重建后重放当前周期数据 +
  // 均量线 / pane2 信息行缓存重建（IndicatorManager.rebuildVolumeData）。
  // 分时 = Histogram 直方图锚点（1px 细柱自绘）、K 线 = 透明锚点（柱体自绘）；
  // 成交量组关闭时（volumeSeries = null）为空操作。
  private applyVolumeData = (): void => {
    if (!this.volumeSeries) return
    const normalized = this.getNormalizedBars()
    this.volumeSeries.setData(
      normalized.map(({ bar, time }) => ({
        time: time as UTCTimestamp,
        value: bar.volume ?? 0, // pointType='timeshare' / 'kline' 均含 volume
      }))
    )
    // 成交量均量线 VOL MA5 / MA10 + pane2 信息行缓存（IndicatorManager 构建）。
    this.indicatorManager.rebuildVolumeData()
  }

  /** K 线 / 成交量 / 指标数据写入（series 锚点 + 各 primitive 数据缓存重建）。 */
  private applyData = (): void => {
    // setData 前统一归一化 time（非法条过滤），series 同步；
    // 抽取为 getNormalizedBars（applyData / applyVolumeData 共用）。
    const normalized = this.getNormalizedBars()

    // 分时周期：pane1 双线 + pane3 直方图。
    if (this.timeshareManager.isTimeshare) {
      // K 线 series 清空（分时无 OHLC 蜡烛），避免残留旧周期图形。
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
      // 右刻度承载 series 同步价格数据（修复）：right scale 必须有
      // firstValue（非空数据）——否则左刻度关 + 右刻度开时，库 defaultPriceScale
      // 回退到 right（空 scale）→ 十字星横线 price/y = NaN 消失；同步 price 后
      // right 范围与 left 同源一致，横线与指示值均正常。
      this.timeshareRightAxisSeries?.setData(
        normalized.map(({ bar, time }) => ({
          time: time as UTCTimestamp,
          value: bar.price ?? 0,
        }))
      )
      // 成交量锚点数据回放（成交量组开启时回放 + 均量 / 信息行缓存重建，
      // 关闭时 volumeSeries 为 null 跳过；可见 1px 细柱由 VolumeBarPrimitive 自绘）。
      this.applyVolumeData()
      // 指标缓存重建（分时：成交量均量 / 附图指标 / 主图指标见 indicatorManager 守卫）。
      this.indicatorManager.rebuildIndicatorData()
      this.indicatorManager.refreshMainIndicatorData()
      // 分时 pane1 价格范围：以首根 preClose 为对称中心（左右刻度中间对齐）。
      this.timeshareManager.applyPriceRange()
      return
    }

    // K 线周期（原逻辑）：蜡烛 + 成交量自绘柱体。
    // 恢复价格轴自动缩放与库默认 margins（分时固定范围 + 对称 margins 不带到 K 线周期；
    // K 线刻度为坐标反算值，与十字星同源，无"固定中间值"矛盾）。
    this.chart.priceScale('left', 1).applyOptions({
      autoScale: true,
      scaleMargins: { top: 0.2, bottom: 0.1 },
    })
    this.chart.priceScale('right', 1).applyOptions({
      scaleMargins: { top: 0.2, bottom: 0.1 },
    })
    // K 线三态颜色：按 close vs preClose 红/绿/平盘，覆盖库默认 close>=open
    // 判定（一字板 open===close 会被库画成上涨红）；主题切换时 applyTheme 会重设数据刷新。
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
    // 最后价虚线：库 priceLine 已关闭（改由 PriceLinePrimitive 自绘，见
    // paneFactory），此处 applyOptions 保持关闭状态并强制 invalidate —— 周期切换
    //（setData + setVisibleLogicalRange 时序）后触发一次重绘，自绘线随之现取刷新。
    this.klineSeries.applyOptions({ priceLineVisible: false })
    // 分时双线清空（K 线周期不显示分时线）。
    this.timesharePriceSeries?.setData([])
    this.timeshareAvgSeries?.setData([])
    // 右刻度承载 series 同步收盘数据（修复，同分时分支原因）：
    // right scale 保持有数据 → 左刻度关 + 右刻度开时库 defaultPriceScale 回退
    // 到 right 也不至于 firstValue=null（十字星横线不消失）。
    this.timeshareRightAxisSeries?.setData(
      normalized.map(({ bar, time }) => ({
        time: time as UTCTimestamp,
        value: bar.close ?? 0,
      }))
    )
    // 成交量锚点数据回放 + 均量 / 信息行缓存（成交量组开启时回放，关闭时跳过；
    // 可见柱体由 VolumeBarPrimitive 按 bars 自绘）。
    this.applyVolumeData()
    // 附图指标：指标层开启时按当前选中指标全量重建
    //（pane5 线 / 柱 / Y 轴锚点 + pane4 信息行值；数据变化时重算，series 关闭时跳过）。
    this.indicatorManager.rebuildIndicatorData()
    // 主图指标：数据变化时按当前激活指标重建（指标未开时为空操作）。
    this.indicatorManager.refreshMainIndicatorData()
  }

  /* ===================== 数据（service 集成） ===================== */

  /**
   * 首次初始化：拉取最新一页历史 → 回填渲染 + fitContent → 订阅实时推送。
   *
   * @remarks
   * 由组件统一调用（数据 IO 桥转发）。竞态 / 重试 / 状态流转逻辑见
   * ChartDataBridge。
   *
   * @returns 完成 Promise（bridge.init 内部处理全部状态流转）。
   */
  init = async (): Promise<void> => {
    await this.dataBridge.init()
  }

  /**
   * 外部数据整体写入（ChartDataService 拉取历史后调用）。
   *
   * @remarks
   * 按当前周期过滤数据点（K 线周期取 pointType='kline'，分时周期取 'timeshare'）→
   * 重建 series / 指标缓存并设置初始视口（周期切换、首次加载统一入口）。
   *  - K 线：视口仅展示最近 VISIBLE_BAR_COUNT（120）根，右边缘对齐
   *    （数据不足 120 根时全部展示）；左滑边缘仍可翻更早历史。
   *  - 分时：全量 N 日数据（1d~5d）fitContent，不参与左滑翻页（hasMoreHistory=false）。
   *
   * @param points 外部数据点数组（未过滤，按当前周期语义筛选）。
   */
  setKlineData = (points: ChartDataPoint[]): void => {
    this.bars = points.filter(point =>
      this.timeshareManager.isTimeshare ? point.pointType === 'timeshare' : point.pointType === 'kline'
    )
    this.rebuildBarIndex()
    // 刻度显隐（Y 轴刻度区宽度）在数据写入前应用——与 X 轴视口完全解耦，
    // 避免 applyPriceScaleVisible 内部"保存/恢复 visibleRange"与下方数据 setData /
    // fitContent / setVisibleLogicalRange 交叉（跨周期数据时间戳跨度大时，恢复的
    // 旧 range 会干扰视口铺满，见 K线→分时视图未铺满修复）。
    // pane 在构造时已全部创建（addSeries 即建 pane），此处遍历全部 pane 生效。
    this.applyPriceScaleVisible('left', this.showLeftScale)
    this.applyPriceScaleVisible('right', this.showRightScale)
    this.applyData()
    // 分时数据为完整 N 个交易日（无更早分页），不触发左滑边缘加载。
    if (this.timeshareManager.isTimeshare) {
      this.dataBridge.setHasMoreHistory(false)
      this.chart.timeScale().fitContent()
      return
    }
    this.dataBridge.setHasMoreHistory(points.length >= (this.service?.fetchLimit ?? 0))
    // K 线初始视口：仅展示最近 VISIBLE_BAR_COUNT 根（右边缘对齐，from 不为负）。
    const total = this.bars.length
    if (total > 0) {
      this.chart.timeScale().setVisibleLogicalRange({
        from: Math.max(total - VISIBLE_BAR_COUNT, 0),
        to: total - 1,
      })
    }
  }

  // 实时指标缓存统一重建（节流关键）：单点入口（updateLastBar）与批量
  // flush（realtimePipeline）共用，高频推送窗口内只重建一次，避免逐点重建开销。
  private rebuildRealtimeIndicators = (): void => {
    this.indicatorManager.rebuildVolumeData()
    this.indicatorManager.refreshMainIndicatorData()
    this.indicatorManager.rebuildIndicatorData()
    // 分时实时推送：价格范围随最新数据重新对称。
    this.timeshareManager.applyPriceRange()
  }

  /**
   * 实时增量更新（ChartDataService 订阅回调；外部 / 测试单点调用入口）。
   *
   * @remarks
   * series 更新 + bars/barIndex 维护 + 指标缓存重建（单点立即执行）；
   * 订阅内部走 pipeline.enqueueRealtimePoint（节流批量合并）。
   *
   * @param point 实时推送的增量数据点。
   */
  updateLastBar = (point: ChartDataPoint): void => {
    this.realtimePipeline.updateLastBar(point)
  }

  /**
   * 更早历史前置插入（平移左滑到边缘 → 组件拉取更早页后调用）。
   *
   * @remarks
   * 过滤 kline 点 → 前置合并（去重 / 升序，见 mergeBars）→ 重建 series / 指标缓存 →
   * 视口逻辑范围右移 added（保持用户当前看到的数据位置不变）。
   *
   * @param points 更早历史数据点数组。
   * @returns 实际新增条数（0 = 无更早数据，调用方停止后续触发）。
   */
  prependHistory = (points: ChartDataPoint[]): number => {
    // 按当前周期过滤（分时周期 hasMoreHistory=false 不会触发翻页，此处统一防御）。
    const incoming = points.filter(point =>
      this.timeshareManager.isTimeshare ? point.pointType === 'timeshare' : point.pointType === 'kline'
    )
    if (!incoming.length) return 0
    const { bars, added } = mergeBars(this.bars, incoming)
    if (added === 0) return 0
    // 保存当前可见逻辑范围，setData 后偏移恢复（新数据前置 → 原有数据右移 added 根）。
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

  /** 重建 time → bar 索引（批量数据变更后调用：setKlineData / prependHistory）。 */
  private rebuildBarIndex = (): void => {
    this.barIndex = new Map(this.bars.map(bar => [bar.time, bar]))
  }

  /** 按 time 取整根 K 线（十字星 tooltip 命中数据源，O(1) 索引）。 */
  private getBarByTime = (time: number): ChartDataPoint | undefined => this.barIndex.get(time)

  /** 时间文本（十字星 tooltip 时间列；与 pane0 信息行同款格式：format 模板或按周期自动）。 */
  private getTimeText = (time: number): string =>
    this.timeFormat ? formatTimeByFmt(time, this.timeFormat) : formatAxisTime(time, this.period)

  /** 当前最早一根 K 线 time（无数据时 undefined；组件用作 before 分页锚点）。 */
  getEarliestTime = (): number | undefined => this.bars[0]?.time

  /* ===================== 对外 API ===================== */

  /**
   * 更新股票代码（props.symbol 变化时 init 用新标的拉数）。
   *
   * @remarks
   * 惰性 getter 现取 this.symbol，触发重绘即刷新 pane0 信息行。
   *
   * @param symbol 新股票代码。
   */
  setSymbol = (symbol: string): void => {
    this.symbol = symbol
    this.chart.applyOptions({})
  }

  /**
   * 更新股票名称（pane0 信息行：名称 [代码]）。
   *
   * @param name 新股票名称。
   */
  setName = (name: string): void => {
    this.name = name
    this.chart.applyOptions({})
  }

  /**
   * 更新数据服务实例（props.service 变化时 init 用新服务拉数）。
   *
   * @param service 新的 ChartDataService 实例。
   */
  setService = (service: ChartDataService): void => {
    this.service = service
  }

  /**
   * 周期切换：pane0 信息行时间格式随周期变化
   * （日/周/月 → YYYY-MM-DD；分时 → HH:mm；分钟 K → YYYY-MM-DD HH:mm）。
   *
   * @remarks
   * 信息行分段在 draw 时现取 getPeriod，此处仅存值 + 触发重绘；
   * 分时不可平移（分时整日数据 fitContent 固定视口，滚轮 / 按住拖拽 /
   * 触摸平移全部关闭；缩放仍由工具栏按钮控制，handleScale 全局已禁滚轮）；
   * 切回 K 线周期恢复默认平移交互。
   *
   * @param period 目标周期（'' = 周期未设置，不发起请求）。
   */
  setPeriod = (period: PeriodValueOrEmpty): void => {
    if (this.period === period) return
    this.period = period
    this.applyTimeshareInteractions()
  }

  // 平移交互按周期应用（抽取）：分时（1d~5d）禁用滚轮 / 拖拽平移，
  // K 线恢复默认。setPeriod 与构造（默认周期即分时时，setPeriod 因周期相同
  // 直接 return，必须构造时应用）统一走此方法。
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

  /**
   * 主题切换（深系 / 浅系）：不改变 X 轴视口 / 布局尺寸。
   *
   * @param name 新主题名。
   */
  applyTheme = (name: ChartThemeName): void => {
    this.theme = name
    const themeColorSet = themeColors(name)
    this.tooltip.setTheme(themeColorSet)
    this.chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: themeColorSet.background },
        textColor: themeColorSet.textColor,
        panes: {
          // 分隔线颜色跟随背景（保持分割线不可见）。
          separatorColor: themeColorSet.background,
          separatorHoverColor: themeColorSet.background,
        },
      },
      // 栅格保持关闭（栅格由 GridPrimitive 自绘，draw 时现取新主题色）。
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      // 十字星线颜色 + 指示值标签背景跟随主题（半透明线深浅系区分；
      // 实线 LineStyle.Solid 与初始配置一致：修复 pane3/pane5 底部暗段缺失；
      // 竖线 / 横线均自绘：库横竖线关闭（visible: false），
      // 自绘颜色下方同步；时间轴 + 价格轴标签文字颜色库自动黑白对比）。
      crosshair: {
        vertLine: {
          color: themeColorSet.crosshairLineColor,
          labelBackgroundColor: themeColorSet.crosshairLabelBackground,
          style: LineStyle.Solid,
          visible: false,
        },
        horzLine: {
          color: themeColorSet.crosshairLineColor,
          labelBackgroundColor: themeColorSet.crosshairLabelBackground,
          style: LineStyle.Solid,
          visible: false,
        },
      },
    })
    // 自绘十字星竖线颜色同步主题（与库横线同色，深浅系区分）。
    this.crosshairManager.setAllLineColor(themeColorSet.crosshairLineColor)
    // K 线换色（上涨柱体填充跟随背景色保持空心）。
    this.klineSeries.applyOptions({
      upColor: themeColorSet.background, // 空心填充 = 新主题背景色
      downColor: themeColorSet.downColor,
      borderUpColor: themeColorSet.upColor,
      borderDownColor: themeColorSet.downColor,
      wickUpColor: themeColorSet.upColor,
      wickDownColor: themeColorSet.downColor,
    })
    // 分时双线颜色跟随主题（深浅系区分）。
    this.timesharePriceSeries?.applyOptions({ color: themeColorSet.timesharePriceColor })
    this.timeshareAvgSeries?.applyOptions({ color: themeColorSet.timeshareAvgColor })
    // 成交量锚点色跟随背景（保持不可见）；可见柱体由 primitive 动态取新主题色。
    this.volumeSeries?.applyOptions({ color: themeColorSet.background })
    // 指标相关颜色（MACD 锚点 / SAR 圆点 / 成交量均量线）由指标管理器统一同步。
    this.indicatorManager.updateThemeColors(themeColorSet)
    // K 线逐根三态色基于主题 palette（红/绿/平盘），主题切换后重设数据刷新；
    // 分时周期无 K 线数据（bars 为 timeshare 点），跳过防 NaN。
    if (!this.timeshareManager.isTimeshare) this.refreshKlineColors(themeColorSet)
    // 空 Pane 文字颜色在 draw 时动态取色，applyOptions 触发重绘即自动更新。
  }

  // K 线逐根三态配色重设：委托 viewport.refreshKlineColors（主题切换时调用，不动数据与指标）。
  private refreshKlineColors = (palette: BarPalette): void => {
    viewportRefreshKlineColors(this.bars, this.klineSeries, palette)
  }

  /** 放大（X 轴 barSpacing ×1.25，限幅 80）：委托 viewport.zoomIn。 */
  zoomIn = (): void => viewportZoomIn(this.chart)

  /** 缩小（X 轴 barSpacing ÷1.25，下限 0.5）：委托 viewport.zoomOut。 */
  zoomOut = (): void => viewportZoomOut(this.chart)

  /**
   * 左移（视口向左平移 60 根 K 线，看更早数据）：委托 viewport.shiftLeft。
   *
   * @remarks
   * 用逻辑范围平移替代 scrollToPosition（后者距右边缘不足一屏时减幅变负被 clamp，
   * 直接跳到最新数据末尾）；逻辑范围平移到达最左自然停止，无跳变。
   */
  shiftLeft = (): void => viewportShiftLeft(this.chart)

  /** 右移（视口向右平移 60 根 K 线，看更晚数据；到达最右自然停止，不跳变）：委托 viewport.shiftRight。 */
  shiftRight = (): void => viewportShiftRight(this.chart)

  /**
   * 设置主图指标（互斥单选；转发至指标管理器）。
   *
   * @param name 主图指标名（null = 关闭）。
   */
  setMainIndicator = (name: MainIndicatorType | null): void => {
    this.indicatorManager.setMainIndicator(name)
  }

  /**
   * 设置附图指标（互斥单选；转发至指标管理器，null = 关闭指标层）。
   *
   * @param name 附图指标名（null = 关闭）。
   */
  setSubIndicator = (name: import('../indicator').SubIndicatorType | null): void => {
    this.indicatorManager.setSubIndicator(name)
  }

  /**
   * 重建附图指标数据缓存：数据未变化但指标层可能处于"过期/清空"状态时
   * 强制按当前 bars 重算。
   *
   * @remarks
   * 典型场景：分时切回 K 线（分时下 CR 被防御清空缓存但状态保留；data 直通模式下
   * 切周期不触发 applyData → 需显式重建，见 KLineChart.vue period watch）。
   * 指标层关闭时为空操作（rebuildDataIfOpen 幂等）。
   */
  refreshSubIndicatorData = (): void => {
    this.indicatorManager.rebuildIndicatorData()
  }

  /**
   * 时间轴开关：切换显隐后重算 pane 高度（时间轴高度占用随之变化，
   * 保证固定空 Pane 仍绝对相等）。
   *
   * @param visible true = 显示时间轴。
   */
  toggleTimeAxis = (visible: boolean): void => {
    this.chart.timeScale().applyOptions({ visible })
    this.applyStretchFactors()
  }

  /**
   * 左刻度区开关：显隐所有 Pane 的 left price scale（视图内数据不变）。
   *
   * @param visible true = 显示左刻度区。
   */
  setLeftScaleVisible = (visible: boolean): void => {
    if (this.showLeftScale === visible) return
    this.showLeftScale = visible
    this.applyPriceScaleVisible('left', visible)
  }

  /**
   * 右刻度区开关：显隐所有 Pane 的 right price scale（视图内数据不变）。
   *
   * @param visible true = 显示右刻度区。
   */
  setRightScaleVisible = (visible: boolean): void => {
    if (this.showRightScale === visible) return
    this.showRightScale = visible
    this.applyPriceScaleVisible('right', visible)
  }

  /**
   * 分时均价线显隐：默认渲染；关闭时均价线不渲染，
   * pane0 信息行 / tooltip 同步隐藏均价（依赖注入 getter 即时反映，无需通知）。
   *
   * @remarks
   * 由 App.vue 按钮 / 组件 props.avgLineVisible 驱动：
   *  - 开关 true → applyOptions lineVisible: true（恢复渲染）
   *  - 开关 false → applyOptions lineVisible: false（不渲染，series 保留避免重建）
   *
   * @param visible true = 渲染均价线。
   */
  setAvgLineVisible(visible: boolean): void {
    this.avgLineVisible = visible
    this.timeshareAvgSeries?.applyOptions({ lineVisible: visible })
  }

  /**
   * 成交量组显隐开关（pane2 成交量信息行 + pane3 成交量图，仿 pane4/5
   * 创建/移除式开关）。
   *
   * @remarks
   * 由 App.vue 按钮 / 组件 props.volumeVisible 驱动：
   *  - 关：销毁 pane2/3（含十字星指示值注销）→ 布局重算（指标开 80:20 / 全关仅 K 线）；
   *  - 开：重建 pane2/3 + 应用左右刻度显隐 + 重放成交量数据 → 布局重算。
   * 顺序守卫：先更新 volumeVisible 再操作 pane（布局重算读取最新开关状态，
   * 与附图指标开关同一范式——状态赋值必须先于 Pane 组重建）。
   *
   * @param visible true = 显示成交量组。
   */
  setVolumeVisible = (visible: boolean): void => {
    if (this.volumeVisible === visible) return
    this.volumeVisible = visible
    if (visible) {
      // 协调：vol 关闭期间指标组顺移 pane2/3；重开 vol 前先临时移除
      // 指标组（2/3 → 仅 K 线 2 Pane），volume 追加 2/3 后指标组重建回末尾
      // 4/5 —— 否则 addSeries(2) 会与顺移的指标组共享 pane（指标层关闭标记
      // 由 setSubIndicator 内部维护，activeSubIndicator 状态保留可恢复）。
      const showIndicator = this.indicatorManager.getShowIndicator()
      const activeIndicator = this.indicatorManager.getActiveSubIndicator()
      if (showIndicator && activeIndicator) {
        this.indicatorManager.setSubIndicator(null)
      }
      this.createVolumePanes()
      // 重放成交量锚点数据 + 均量 / 信息行缓存。
      this.applyVolumeData()
      if (showIndicator && activeIndicator) {
        this.indicatorManager.setSubIndicator(activeIndicator)
      }
      // 新 pane 应用左右刻度显隐（构造时 pane 已建，这里仅对重建组生效）。
      this.applyPriceScaleVisible('left', this.showLeftScale)
      this.applyPriceScaleVisible('right', this.showRightScale)
    } else {
      this.removeVolumePanes()
    }
    // 高度按最新开关组合重算（四态：6 / 4 / 4 / 2 Pane）。
    this.applyStretchFactors()
  }

  /** 重建成交量组 Pane（pane2/3）：复用 paneFactory.createVolumePanes。 */
  private createVolumePanes = (): void => {
    const bundle = createVolumePanes({
      chart: this.chart,
      getTheme: () => this.theme,
      getBars: () => this.bars,
      getPeriod: () => this.period,
      indicatorManager: this.indicatorManager,
      timeshareManager: this.timeshareManager,
      crosshairManager: this.crosshairManager,
    })
    // pane2InfoSeries 由 paneFactory 创建并挂载（pane 级移除，无需控制器保存引用）。
    this.volumeSeries = bundle.volumeSeries
    this.volumeMaPrimitive = bundle.volumeMaPrimitive
    this.volumePane2LinePrimitive = bundle.pane2LinePrimitive
    this.volumePane3LinePrimitive = bundle.pane3LinePrimitive
  }

  // 移除成交量组 Pane（pane2/3）：与 SubIndicatorPaneManager.removePanes 同一范式——
  // 库 removePane 从 panes 数组 splice：删 pane2 后原 pane3 顺移到 index 2，
  // 再删一次即移除整组；pane 上 series（含 primitive）强引用随之断开可被 GC，
  // 本控制器再置 null 解除自身引用，保证反复开 / 关无泄漏。
  // 十字星指示值：pane3 的 CrosshairAxisLabelPrimitive 在 crosshairManager
  // 注册表中按 paneIndex 3 移除；pane2 InfoLabelPrimitive 未注册，随 pane 销毁。
  private removeVolumePanes = (): void => {
    // 移除前显式卸载均量线 primitive（防泄漏语义与 destroy 一致）。
    if (this.volumeMaPrimitive && this.volumeSeries) {
      this.volumeSeries.detachPrimitive(this.volumeMaPrimitive)
    }
    // ★ 顺序守卫：十字星指示值注销必须先于 removePane——
    // removePane 后指标组顺移（4/5 → 2/3），其 CrosshairAxisLabelPrimitive 的
    // getPaneIndex() 动态变为 3，此时再 removeByPaneIndex(3) 会误删指标组的
    // 指示值。先注销（此时指标组仍在 4/5，getPaneIndex()=5 ≠ 3）只删 volume 的。
    this.crosshairManager.removeByPaneIndex(3)
    // 注销成交量组自绘竖线 primitive（防注册表持有已销毁实例 → 泄漏）。
    if (this.volumePane2LinePrimitive !== null) {
      this.crosshairManager.unregisterLinePrimitive(this.volumePane2LinePrimitive)
      this.volumePane2LinePrimitive = null
    }
    if (this.volumePane3LinePrimitive !== null) {
      this.crosshairManager.unregisterLinePrimitive(this.volumePane3LinePrimitive)
      this.volumePane3LinePrimitive = null
    }
    // ★ 修复：先清空成交量组（pane2/3）所有 series 数据再移除 pane——
    // 库 removePane 只从 panes 数组 splice，被移除 series 的 points 仍残留挂
    // timeScale（K 线周期 400 点残留 → 切分时后 fitContent 视口被撑到 1.5 年，
    // 时间轴错乱 / 主图指标被压缩："日K → 成交量关 → 1日分时 底部时间轴不对"）。
    // 清空时指标组仍在 pane4/5（volume 关前未顺移），pane2/3 恰为 volume 组，无副作用；
    // 数据由 VolumeBarPrimitive 自绘，清空 series 不影响日K 量柱显示。
    const volumePanes = this.chart.panes()
    for (const paneIndex of [2, 3]) {
      const volumePane = volumePanes[paneIndex]
      if (volumePane) {
        volumePane.getSeries().forEach((series) => series.setData([]))
      }
    }
    this.chart.removePane(2)
    this.chart.removePane(2)
    this.volumeSeries = null
    this.volumeMaPrimitive = null
  }

  /**
   * 最后价线显隐：切换自绘 priceLine（幂等）。
   *
   * @remarks
   * 变化时对 klineSeries 同值 applyOptions 强制 invalidate 立即生效
   *（库 priceLine 保持关闭，重绘由自绘 primitive 现取 visible）；
   * 分时模式无 kline 点天然不绘制，调用无副作用。
   *
   * @param visible true = 显示最后价线。
   */
  setPriceLineVisible = (visible: boolean): void => {
    if (!this.priceLinePrimitive) return
    this.priceLinePrimitive.setVisible(visible)
    this.klineSeries.applyOptions({ priceLineVisible: false })
  }

  /**
   * 键盘方向键移动十字星：每次移动 1 根 bar。
   *
   * @remarks
   *  - 基准：十字星当前命中的 bar（overlayTime 反查，鼠标 / 上次键盘位置天然同步）；
   *    未激活（overlayTime = null）时从最后 bar 起算（首次按键定位到最后 bar 附近）；
   *  - 目标：委托 viewport.computeCrosshairTargetIndex（纯函数，clamp 到数据范围）；
   *  - 视口跟随：目标超出可视区（边缘继续按键）→ 视口平移让目标可见
   *    （getCrosshairScrollOffset，边缘=1 根）；
   *  - 定位：chart.setCrosshairPosition(价格, time, 主 series)——库自动重绘竖线 / 横线 /
   *    轴标签，并触发 crosshairMove 事件 → CrosshairManager 联动 overlayTime / tooltip /
   *    左刻度指示值（与鼠标命中同一条链路，无重复逻辑）；
   *  - 分时模式（1d~5d）同样支持（每 bar = 每分钟，price 取分时价格）；
   *    K 线模式 price 取 bar.close。
   *
   * @param delta 移动方向（-1 = 向左一根，1 = 向右一根）。
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
    // 视口跟随：十字星到达可视区最后一个数据（左 / 右）继续按键时，
    // 目标 bar 超出可视区 —— 视口平移让目标进入视野（边缘场景 = 平移 1 个 bar，
    // 距可视区较远时一次滚动到位）。getVisibleLogicalRange 未布局（null）时跳过。
    const visible = this.chart.timeScale().getVisibleLogicalRange()
    const scrollOffset = getCrosshairScrollOffset(target, visible)
    if (scrollOffset !== 0 && visible !== null) {
      this.chart.timeScale().setVisibleLogicalRange({
        from: visible.from + scrollOffset,
        to: visible.to + scrollOffset,
      })
    }
    const bar = this.bars[target]
    const time = normalizeChartTime(bar.time)
    if (time === null) return
    const price = this.timeshareManager.isTimeshare
      ? (bar.price ?? 0)
      : (bar.close ?? 0)
    this.chart.setCrosshairPosition(price, time as UTCTimestamp, series)
    // 全链路同步：setCrosshairPosition 触发的 crosshairMove 事件经 rAF
    // 节流下一帧才处理 —— tooltip 数据浮层仍显示旧 bar（更新延迟）、pane0 时间 /
    // 左刻度指示值滞后。此处同步对齐 overlayTime / tooltip / 左刻度指示值，
    // 随后的 rAF 事件写入相同值无副作用（见 CrosshairManager.syncKeyboardMove）。
    this.crosshairManager.syncKeyboardMove(bar, time, series.priceToCoordinate(price) ?? null)
  }

  // 刻度区统一应用（左右宽度一致）：逐个 Pane 设置 price scale 显隐与最小宽度。
  // 切换前后保持当前可见时间范围不变——刻度区开关只改变数据区宽度，
  // 不改变视图内的数据（不再 fitContent 重置视口）。委托 viewport.applyPriceScaleVisible。
  private applyPriceScaleVisible = (side: 'left' | 'right', visible: boolean): void => {
    viewportApplyPriceScaleVisible(this.chart, side, visible)
  }

  /**
   * 销毁：移除监听 / primitive / chart / 清除实例标记（防内存泄漏）。
   */
  destroy = (): void => {
    // 退订实时推送 + 使在途 init / loadEarlier 请求失效（destroyed 语义，委托 IO 桥）。
    this.dataBridge.dispose()
    // 清理实时节流：取消窗口内 trailing 定时器 + 清空未消费队列（委托实时管线）。
    this.realtimePipeline.cancel()
    // 十字星管理器退订监听 + 清空指示值 primitive 引用。
    this.crosshairManager.destroy()
    // 移除十字星数据浮层节点（防泄漏）。
    this.tooltip.destroy()
    // 指标管理器清空全部内部引用 / 缓存。
    this.indicatorManager.destroy()
    // 卸载 SAR 圆点 primitive（挂在 klineSeries 上，随 chart.remove 一起释放，显式 detach 更保险）。
    if (this.sarMarkerPrimitive) {
      this.klineSeries.detachPrimitive(this.sarMarkerPrimitive)
      this.sarMarkerPrimitive = null
    }
    // 卸载主图指标线 primitive（同挂在 klineSeries 上）。
    if (this.indicatorLinePrimitive) {
      this.klineSeries.detachPrimitive(this.indicatorLinePrimitive)
      this.indicatorLinePrimitive = null
    }
    // 卸载成交量均量线 primitive（挂在 volumeSeries 上；成交量组关闭时 series 为 null 跳过）。
    if (this.volumeMaPrimitive && this.volumeSeries) {
      this.volumeSeries.detachPrimitive(this.volumeMaPrimitive)
    }
    this.volumeMaPrimitive = null
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.handleVisibleLogicalRangeChange)
    this.chart.remove()
    this.container.dataset.lwcMounted = 'false'
    // 数据引用显式清空（防 chart.remove 后仍持有大数组 / 索引，加快 GC）。
    this.bars = []
    this.barIndex = new Map()
  }
}
