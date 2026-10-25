/**
 * paneFactory.ts —— Pane 构建工厂（v1.7.1 自 KLineChartController.ts 拆分）
 *
 * 职责：pane0~pane3（信息行 / K 线主图 / 成交量信息行 / 成交量）全部 series 与
 * primitive 的创建与装配，返回构建结果（PaneBundle）由 controller 保存引用。
 * 构建只依赖 chart 实例 + 若干惰性读取闭包（theme / bars / indicatorManager /
 * timeshareManager / crosshairManager），与 controller 其它逻辑解耦。
 *
 * 注意：pane4 / pane5（附图指标组）由 SubIndicatorPaneManager 按需创建，不在此处。
 */
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type ISeriesApi,
} from 'lightweight-charts'
import type { ChartDataPoint } from '../../types/chart'
import { timeshareVerticalCount, type PeriodValueOrEmpty } from '../periods'
import { chartFont, themeColors, transparentColor, type ChartThemeName } from './theme'
import { formatPrice, formatVolume, formatPercent } from '../util/format'
import { TopPaneOverlayPrimitive } from '../overlay/topPaneOverlayPrimitive'
import { InfoLabelPrimitive } from '../overlay/infoLabelPrimitive'
import {
  IndicatorLinePrimitive,
  type IndicatorLineSet,
} from '../overlay/indicatorLinePrimitive'
import { HighLowMarkerPrimitive } from '../highLow/highLowMarkerPrimitive'
import { VolumeBarPrimitive } from '../volume/volumeBarPrimitive'
import { SarMarkerPrimitive } from '../indicator/sarMarkerPrimitive'
import { PaneBorderPrimitive } from '../border/paneBorderPrimitive'
import { GridPrimitive } from '../grid/gridPrimitive'
import { AxisLabelPrimitive } from '../axis/axisLabelPrimitive'
import { CrosshairAxisLabelPrimitive } from '../crosshair/crosshairAxisLabelPrimitive'
import { CrosshairLineCapPrimitive } from '../crosshair/crosshairLineCapPrimitive'
import { findLastKlineBar, PriceLinePrimitive } from '../overlay/priceLinePrimitive'
import { TimeshareManager } from './timeshareManager'
import type { IndicatorManager } from './indicatorManager'
import type { CrosshairManager } from './crosshairManager'

/** 构造依赖（controller 注入；除 chart 外均为惰性闭包，构建顺序安全） */
export interface PaneFactoryDeps {
  chart: ReturnType<typeof import('lightweight-charts').createChart>
  /** 主题名（构建时颜色快照 + 后续回调实时取） */
  getTheme: () => ChartThemeName
  /** 当前全部 bar（分时点 / K 线，成交量与高低点标注取数） */
  getBars: () => ChartDataPoint[]
  /** 当前周期（分时栅格竖线份数） */
  getPeriod: () => PeriodValueOrEmpty
  /** 指标管理器（pane0/2 信息行、SAR 圆点、主图 / 均量线数据源） */
  indicatorManager: IndicatorManager
  /** 分时计算管理器（等分 / 固定刻度 / 三态着色） */
  timeshareManager: TimeshareManager
  /** 十字星管理器（指示值 primitive 注册，move 回调注入 y） */
  crosshairManager: CrosshairManager
  /** 十字星竖线底部补齐 primitive（controller 统一创建，防泄漏由 controller destroy 管理） */
  createCrosshairLineCap: () => CrosshairLineCapPrimitive
}

/** 构建结果：controller 保存引用的全部 series 与自绘 primitive */
export interface PaneBundle {
  /** pane1 K 线主图（Candlestick，红涨绿跌 / 上涨空心） */
  klineSeries: ISeriesApi<'Candlestick'>
  /** pane1 分时价格线（LineSeries，分时专用） */
  timesharePriceSeries: ISeriesApi<'Line'>
  /** pane1 分时均价线（LineSeries，分时专用） */
  timeshareAvgSeries: ISeriesApi<'Line'>
  /** pane1 分时右刻度承载 series（挂 right scale，空数据透明锚点） */
  timeshareRightAxisSeries: ISeriesApi<'Line'>
  /** pane2 成交量信息行（自绘分段文字） */
  pane2InfoSeries: ISeriesApi<'Line'>
  /** pane3 成交量锚点（Histogram，color=背景不可见，仅建 Y 轴） */
  volumeSeries: ISeriesApi<'Histogram'>
  /** pane1 SAR 圆点自绘 primitive（初始隐藏） */
  sarMarkerPrimitive: SarMarkerPrimitive
  /** pane1 最后价线自绘 primitive（v1.7.1：priceLineVisible 参数控制显隐） */
  priceLinePrimitive: PriceLinePrimitive
  /** pane1 主图指标线自绘 primitive（top canvas，十字星之上） */
  indicatorLinePrimitive: IndicatorLinePrimitive
  /** pane3 成交量均量线 VOL MA5/MA10 自绘 primitive */
  volumeMaPrimitive: IndicatorLinePrimitive
}

/** 构建全部内容 Pane（pane0~pane3）的 series / primitive 并装配 */
export const createPanes = (deps: PaneFactoryDeps): PaneBundle => {
  const { chart, getTheme, getBars, getPeriod, indicatorManager, timeshareManager, crosshairManager } = deps
  const initialThemeColors = themeColors(getTheme())

  /* ---------- 3. pane0：顶部空 Pane（无数据，自绘"名称 [代码] 时间 + 指标值"） ---------- */
  chart
    .addSeries(
      LineSeries,
      {
        priceScaleId: 'left',
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      0,
    )
    .attachPrimitive(
      // pane0 顶层遮罩（topPaneViews）：背景填充 + 信息行分段文字，绘制在十字星之上，
      // 借此遮住十字星竖线（实现"十字星不贯穿 pane0"）。
      // 分段结构：首段"股票名称 [代码] 时间"（主题文字色）+ 各指标值段
      // （MA/EXPMA/BOLL/BBI 用对应线色、SAR 随 trend 红/绿，见 IndicatorManager.buildInfoSegments）；
      // 时间与指标值均随十字星 —— 命中时 = 命中 bar、未命中时 = 最新 bar
      new TopPaneOverlayPrimitive(
        () => indicatorManager.buildInfoSegments(),
        () => themeColors(getTheme()).background,
      ),
    )

  /* ---------- 4. pane1：K 线主图（红涨绿跌；上涨柱体空心） ----------
   * 空心实现：上涨（up）柱体填充色 = 图表背景色（视觉空心），
   * 边框 / 影线保留红色；下跌（down）柱体绿色实心。
   */
  const klineSeries = chart.addSeries(
    CandlestickSeries,
    {
      priceScaleId: 'left',
      upColor: initialThemeColors.background, // 上涨柱体填充 = 背景色（空心）
      downColor: initialThemeColors.downColor,
      borderUpColor: initialThemeColors.upColor, // 上涨边框红色
      borderDownColor: initialThemeColors.downColor,
      wickUpColor: initialThemeColors.upColor, // 上涨影线红色
      wickDownColor: initialThemeColors.downColor,
      // v1.7.1：最后价虚线改为 PriceLinePrimitive 自绘（真实最后 bar 价格 +
      // 横贯全宽始终可见），库 priceLine 关闭避免重复渲染
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
  // 分时双线（v1.7.0）：pane1 分时周期渲染 price / avgPrice 两条 LineSeries
  // （东财分时惯例：价格线 + 均价线），K 线周期 setData([]) 不可见。
  // 颜色随深浅系（theme.timesharePriceColor / timeshareAvgColor），主题切换时 applyTheme 同步
  const timeshareLineOptions = {
    priceScaleId: 'left',
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false, // 十字星 marker 由库统一绘制，双线不重复出点
    lineWidth: 1,
    // 隐藏库刻度标签（刻度区保留）：刻度值由 AxisLabelPrimitive 自绘
    priceFormat: {
      type: 'custom',
      formatter: () => '',
    },
  } as const
  const timesharePriceSeries = chart.addSeries(
    LineSeries,
    {
      ...timeshareLineOptions,
      color: initialThemeColors.timesharePriceColor,
    },
    1,
  )
  const timeshareAvgSeries = chart.addSeries(
    LineSeries,
    {
      ...timeshareLineOptions,
      color: initialThemeColors.timeshareAvgColor,
    },
    1,
  )
  // 分时右刻度承载 series（v1.7.1）：挂 pane1 right price scale（空数据透明锚点），
  // 仅提供右刻度 canvas（右刻度区开关打开时占位 72px）；右刻度百分比标签由下方
  // 右刻度 AxisLabelPrimitive 自绘（getPrice 复用左刻度 price scale 坐标反算 → 左右对齐）
  const timeshareRightAxisSeries = chart.addSeries(
    LineSeries,
    {
      priceScaleId: 'right',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      lineWidth: 1,
      color: transparentColor,
      priceFormat: {
        type: 'custom',
        formatter: () => '',
      },
    },
    1,
  )
  // 内容 Pane 边框（pane1）：自绘 1px 矩形，颜色随主题（深浅系区分）
  klineSeries.attachPrimitive(
    new PaneBorderPrimitive(() => themeColors(getTheme()).paneBorder),
  )
  // pane1 栅格：竖 4 等分（分时按周期份数：1d=4 / 2d=2 / 3d=3 / 4d=4 / 5d=5）；
  // 横向等分数随指标开关变化（关 8 / 开 6）
  klineSeries.attachPrimitive(
    new GridPrimitive({
      getColor: () => themeColors(getTheme()).grid,
      getHorizontalCount: () => (indicatorManager.getShowIndicator() ? 6 : 8),
      getVerticalCount: () =>
        timeshareManager.isTimeshare ? timeshareVerticalCount(getPeriod()) : 4,
    }),
  )
  // pane1 左刻度标签：与栅格横线对齐（值 = 横线处价格，K 线价格 2 位小数）。
  // series 动态取数（v1.7.0）：分时周期取 price 线（K 线空数据），K 线周期取 klineSeries；
  // 分时按值着色（v1.7.1）：刻度值 vs 首根 preClose 三态 —— 上红 / 下绿 / 平盘中色
  klineSeries.attachPrimitive(
    new AxisLabelPrimitive({
      series: () =>
        timeshareManager.isTimeshare ? timesharePriceSeries : klineSeries,
      getPaneIndex: () => 1,
      getHorizontalCount: () => (indicatorManager.getShowIndicator() ? 6 : 8),
      getColor: () => themeColors(getTheme()).textColor,
      getBackColor: () => themeColors(getTheme()).background,
      getFont: () => chartFont,
      format: (price) => formatPrice(price),
      getValueColor: timeshareManager.scaleValueColor,
      // 分时：全序列固定等差刻度（中间 = 首根 preClose，上下 = preClose ± k×step，
      // v1.7.1 等差数列需求；首尾同样参与等差，不随平移 / 缩放变化）。
      // K 线周期返回 null → 回退坐标反算
      getFixedValues: () => timeshareManager.fixedValues,
    }),
  )
  // pane1 右刻度标签（v1.7.1，分时专用）：挂右刻度承载 series，百分比刻度与
  // 左刻度同一 y 坐标（getPrice 取左 price scale 反算 → 左右值严格对齐）；
  // 中间 = 0%（= preClose），向上 +%（红）/ 向下 -%（绿）/ 平盘 0.00%（中色）。
  // K 线周期右刻度区保持空白（原行为，不显示标签）。
  timeshareRightAxisSeries.attachPrimitive(
    new AxisLabelPrimitive({
      series: () => timeshareRightAxisSeries,
      getEnabled: () => timeshareManager.isTimeshare, // 仅分时显示；K 线周期右刻度区保持空白
      align: 'left', // v1.7.1：右刻度文字左对齐贴右刻度区左缘，与左刻度右对齐对称
      getPaneIndex: () => 1,
      getHorizontalCount: () => (indicatorManager.getShowIndicator() ? 6 : 8),
      getColor: () => themeColors(getTheme()).textColor,
      getBackColor: () => themeColors(getTheme()).background,
      getFont: () => chartFont,
      // 百分比：由**左刻度显示的数值**（同序列值按 2 位小数显示精度）相对首根
      // preClose 计算 —— 右刻度值 = (左刻度显示值 − preClose) / preClose × 100%，
      // 与左刻度文字严格一一对应（如左 12.67 → 右 +26.70%）
      format: (price) => formatPercent(Number(price.toFixed(2)), timeshareManager.preClose),
      getValueColor: timeshareManager.scaleValueColor,
      // 分时：与左刻度共用同一等差序列（价格等差 → 百分比等差，中间精确 0.00%）
      getFixedValues: () => timeshareManager.fixedValues,
    }),
  )
  // pane1 十字星左刻度指示值：十字星横线所在价格（K 线价格 2 位小数）。
  // series 动态取数（v1.7.0）：分时周期取 price 线，K 线周期取 klineSeries
  const pane1CrosshairLabel = new CrosshairAxisLabelPrimitive({
    series: () =>
      timeshareManager.isTimeshare ? timesharePriceSeries : klineSeries,
    getPaneIndex: () => 1,
    getColor: () => themeColors(getTheme()).crosshairLabelText,
    getBackColor: () => themeColors(getTheme()).crosshairLabelBackground,
    getFont: () => chartFont,
    format: (price) => formatPrice(price),
  })
  klineSeries.attachPrimitive(pane1CrosshairLabel)
  // v1.7.1 分时右刻度区十字星指示值：库按 priceScaleId 过滤渲染（挂在 left 轴 series
  // 上的指示值只画左刻度区）→ 在右刻度承载 series（挂 'right'）上再挂一个，
  // 背景色 / 文字色 / 字体**照搬左刻度指示值**（crosshairLabelText / crosshairLabelBackground /
  // chartFont），文字 = 与右刻度标签同格式的百分比（左显示值回算）；左对齐贴区左缘
  // （与右刻度标签同侧）；仅分时渲染（K 线周期右刻度区保持空白，原行为）。
  // **反算 series 必须用 timesharePriceSeries（left scale 固定对称范围 [preClose±half]）**：
  // right 轴承载 series 无 autoscaleInfoProvider，其范围是实际数据波动（不对称），
  // coordinateToPrice 反算会与刻度序列错位 → 中间指示值 ≠ 0.00%（对不上根因，v1.7.1）。
  // 挂载仍留在 right 轴承载 series（决定渲染到右刻度区），反算走 left 与刻度同源。
  const pane1RightCrosshairLabel = new CrosshairAxisLabelPrimitive({
    series: () => timesharePriceSeries,
    getPaneIndex: () => 1,
    getEnabled: () => timeshareManager.isTimeshare,
    align: 'left',
    getColor: () => themeColors(getTheme()).crosshairLabelText,
    getBackColor: () => themeColors(getTheme()).crosshairLabelBackground,
    getFont: () => chartFont,
    format: (price) => formatPercent(Number(price.toFixed(2)), timeshareManager.preClose),
  })
  timeshareRightAxisSeries.attachPrimitive(pane1RightCrosshairLabel)
  // 注册进十字星管理器（move 回调按 paneIndex 注入横线 y；漏注册则 y 恒 null 不绘制，
  // v1.7.1 右刻度区指示值不显示根因）
  crosshairManager.registerPrimitive(pane1RightCrosshairLabel)
  crosshairManager.registerPrimitive(pane1CrosshairLabel)
  // pane1 最高价 / 最低价标注：可视区域内 high 最大 / low 最小的 bar，
  // 最高价黄色标注在柱顶上方、最低价蓝色标注在柱底下方（各带同色实线
  // 连接到柱体上 / 下边缘中间，随平移 / 缩放实时重算）
  klineSeries.attachPrimitive(
    new HighLowMarkerPrimitive({
      series: klineSeries,
      getBars,
      getHighColor: () => themeColors(getTheme()).highMarkerColor,
      getLowColor: () => themeColors(getTheme()).lowMarkerColor,
      getBackColor: () => themeColors(getTheme()).crosshairLabelBackground,
    }),
  )
  // v1.7.1 最后价虚线（自绘）：价格 = 真实最后 K 线 bar 的 close（最新价），
  // 横虚线横贯 pane1 全宽 —— 周期切换 / 实时更新 / 左移看历史任何视口位置
  // 都持续可见（库原生 LastBar/LastVisible 无法同时满足"最新价 + 始终可见"）。
  // 颜色 = 原生涨跌语义（最后 bar close vs preClose：红涨 / 绿跌 / 平盘
  // 深系白·浅系黑）；分时模式 klineSeries 隐藏且 getBars 无 kline 点 → 自动不绘制。
  const priceLinePrimitive = new PriceLinePrimitive({
    series: klineSeries,
    getLastClose: () => findLastKlineBar(getBars())?.close ?? null,
    // 原生涨跌色：最后 bar close vs preClose —— 大于红 / 小于绿 / 等于平盘色
    getColor: () => {
      const theme = themeColors(getTheme())
      const bar = findLastKlineBar(getBars())
      if (!bar) return theme.flatColor
      return bar.close > bar.preClose
        ? theme.upColor
        : bar.close < bar.preClose
          ? theme.downColor
          : theme.flatColor
    },
  })
  klineSeries.attachPrimitive(priceLinePrimitive)
  // pane1 SAR 圆点：SarMarkerPrimitive 自绘（多头红 / 空头绿，zOrder normal 不遮十字星）；
  // 初始隐藏，由主图指标按钮开启（setMainIndicator('sar') 时 setVisible(true) + 重算数据）；
  // 数据源 = 指标管理器 SAR 缓存，显隐 / 换色由管理器统一控制（registerSarMarker）
  const sarMarkerPrimitive = new SarMarkerPrimitive(
    chart,
    klineSeries,
    () => indicatorManager.getSarPoints(),
    themeColors(getTheme()),
  )
  sarMarkerPrimitive.setVisible(false)
  klineSeries.attachPrimitive(sarMarkerPrimitive)
  indicatorManager.registerSarMarker(sarMarkerPrimitive)
  // pane1 主图指标线：IndicatorLinePrimitive 自绘（top canvas，十字星之上，
  // 不被十字星横线遮挡）；数据由 IndicatorManager.setMainIndicator 写入缓存现取
  const indicatorLinePrimitive = new IndicatorLinePrimitive(
    (): IndicatorLineSet => ({
      lines: indicatorManager.getMainIndicatorLines(),
      getTimeScale: () => chart.timeScale(),
      anchorSeries: () => klineSeries,
    }),
  )
  klineSeries.attachPrimitive(indicatorLinePrimitive)
  // pane1 十字星竖线底部补齐（见 CrosshairLineCapPrimitive：填虚线最后空白段）
  klineSeries.attachPrimitive(deps.createCrosshairLineCap())

  /* ---------- 5. pane2：成交量信息行（自绘分段文字，设置与 pane0 一致） ----------
   * 显示 "成交量: x  MA5: x  MA10: x"（数值随十字星命中 bar / 最新 bar）；
   * 用 InfoLabelPrimitive（**不填背景**）—— 十字星竖线需贯穿 pane2，
   * 不能像 pane0 那样用背景遮罩遮挡竖线。
   */
  const pane2InfoSeries = chart.addSeries(
    LineSeries,
    {
      priceScaleId: 'left',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    },
    2,
  )
  pane2InfoSeries.attachPrimitive(
    new InfoLabelPrimitive(() => indicatorManager.buildVolumeInfoSegments()),
  )
  // pane2 十字星竖线底部补齐（见 CrosshairLineCapPrimitive：填虚线最后空白段）
  pane2InfoSeries.attachPrimitive(deps.createCrosshairLineCap())

  /* ---------- 6. pane3：成交量（自绘柱体，视觉与 pane1 完全一致） ----------
   * HistogramSeries 仅作数据锚点：color = 背景色（不可见），
   * 用于建立 Y 轴（volume 值域）的 scale 范围；
   * 可见柱体由 VolumeBarPrimitive 自绘：
   *   上涨（close >= open）：空心红柱（背景填充 + 红框，同 pane1 上涨柱）
   *   下跌：绿色实心（同 pane1 下跌柱）
   *   柱宽 = optimalCandlestickWidth(barSpacing, dpr)（与 pane1 同函数，
   *   宽度 / 间隔绝对一致）
   */
  const volumeSeries = chart.addSeries(
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
  volumeSeries.attachPrimitive(
    new VolumeBarPrimitive(() => getBars(), () => themeColors(getTheme())),
  )
  // 内容 Pane 边框（pane3）：自绘 1px 矩形，颜色随主题（深浅系区分）
  volumeSeries.attachPrimitive(
    new PaneBorderPrimitive(() => themeColors(getTheme()).paneBorder),
  )
  // pane3 栅格：竖 4 等分（分时按周期份数）；横向 2 等分（中间 1 条）
  volumeSeries.attachPrimitive(
    new GridPrimitive({
      getColor: () => themeColors(getTheme()).grid,
      getHorizontalCount: () => 2,
      getVerticalCount: () =>
        timeshareManager.isTimeshare ? timeshareVerticalCount(getPeriod()) : 4,
    }),
  )
  // pane3 左刻度标签：与栅格横线对齐（值 = 横线处成交量，万 / 亿格式化）
  volumeSeries.attachPrimitive(
    new AxisLabelPrimitive({
      series: volumeSeries,
      getPaneIndex: () => 3,
      getHorizontalCount: () => 2,
      getColor: () => themeColors(getTheme()).textColor,
      getBackColor: () => themeColors(getTheme()).background,
      getFont: () => chartFont,
      format: (volume) => formatVolume(Math.max(0, volume)),
    }),
  )
  // pane3 十字星左刻度指示值：十字星横线所在成交量（万 / 亿格式化，不小于 0）
  const pane3CrosshairLabel = new CrosshairAxisLabelPrimitive({
    series: volumeSeries,
    getPaneIndex: () => 3,
    getColor: () => themeColors(getTheme()).crosshairLabelText,
    getBackColor: () => themeColors(getTheme()).crosshairLabelBackground,
    getFont: () => chartFont,
    format: (volume) => formatVolume(Math.max(0, volume)),
  })
  volumeSeries.attachPrimitive(pane3CrosshairLabel)
  crosshairManager.registerPrimitive(pane3CrosshairLabel)

  /* 成交量均量线 VOL MA5 / MA10（东财成交量副图默认）：
   * 与成交量柱同 priceScaleId 'left'（同一量刻度）；
   * 用 IndicatorLinePrimitive 自绘（top canvas，十字星之上，不被横线遮挡）——
   * 数据由 IndicatorManager.rebuildVolumeData 写入缓存现取；颜色 = theme.volMa5 / volMa10 */
  const volumeMaPrimitive = new IndicatorLinePrimitive(
    (): IndicatorLineSet => ({
      lines: indicatorManager.getVolumeMaLines(),
      getTimeScale: () => chart.timeScale(),
      anchorSeries: () => volumeSeries,
    }),
  )
  volumeSeries.attachPrimitive(volumeMaPrimitive)
  // pane3 十字星竖线底部补齐（见 CrosshairLineCapPrimitive：填虚线最后空白段）
  volumeSeries.attachPrimitive(deps.createCrosshairLineCap())

  return {
    klineSeries,
    timesharePriceSeries,
    timeshareAvgSeries,
    timeshareRightAxisSeries,
    pane2InfoSeries,
    volumeSeries,
    sarMarkerPrimitive,
    priceLinePrimitive: priceLinePrimitive, // v1.7.1：显隐由 controller 参数控制
    indicatorLinePrimitive,
    volumeMaPrimitive,
  }
}
