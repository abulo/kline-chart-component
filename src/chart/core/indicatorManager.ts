/**
 * indicatorManager.ts —— 指标管理器（v1.4.73 拆分自 kLineChartController.ts）
 *
 * 职责：集中管理全部指标相关状态与绘制数据源，包含：
 *  - 主图指标（MA / EXPMA / BOLL / SAR / BBI，互斥）：setMainIndicator，
 *    线型指标由 IndicatorLinePrimitive top 层自绘（数据源 getMainIndicatorLines），
 *    SAR 圆点由 SarMarkerPrimitive 自绘（控制器创建后经 registerSarMarker 注册）；
 *  - 附图指标（RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR，互斥）：setSubIndicator，
 *    指标层（pane4 信息行 + pane5 指标图）动态开 / 关，全部元素 top 层自绘；
 *  - 成交量均量线（VOL MA5 / MA10）与 pane2 成交量信息行缓存；
 *  - pane0 / pane2 / pane4 信息行分段文字构建（随十字星现取，O(1)）。
 *
 * 依赖注入（controller 提供，series 惰性 getter —— 构造时 series 可能尚未创建，
 * getter 在 draw / 调用时才求值，保证构建顺序安全）：
 *  - chart / klineSeries / volumeSeries / bars（ChartDataPoint[]）；
 *  - theme / overlayTime（十字星当前时间）/ 股票名 / 代码；
 *  - crosshairManager（pane5 十字星指示值注册与移除）；
 *  - onIndicatorStateChange（指标开 / 关后由 controller 重算 pane 高度）。
 */
import {
  LineSeries,
  HistogramSeries,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { ChartDataPoint } from '../../types/chart'
import { themeColors, mainIndicatorColors, subIndicatorColors, type ChartThemeName } from './theme'
import { InfoLabelPrimitive } from '../overlay/infoLabelPrimitive'
import { IndicatorLinePrimitive } from '../overlay/indicatorLinePrimitive'
import { MacdBarPrimitive, type MacdPoint } from '../indicator/macdBarPrimitive'
import { SarMarkerPrimitive } from '../indicator/sarMarkerPrimitive'
import { PaneBorderPrimitive } from '../border/paneBorderPrimitive'
import { GridPrimitive } from '../grid/gridPrimitive'
import { AxisLabelPrimitive } from '../axis/axisLabelPrimitive'
import { CrosshairAxisLabelPrimitive } from '../crosshair/crosshairAxisLabelPrimitive'
import {
  calcMA,
  calcEXPMA,
  calcBOLL,
  calcSAR,
  calcBBI,
  calcVolMA,
  calcSubIndicators,
  type IndicatorLine,
  type SarPoint,
  type SubIndicatorType,
} from '../indicator'
import { formatVolume, formatPrice, formatAxisSmart, formatDate } from '../util/format'
import { chartFont, type ChartThemeColors } from './theme'
import { subIndicatorLabels } from './indicatorMeta'
import { type MainIndicatorName, type IndicatorLineSpec } from './types'
import type { TextSegment } from '../overlay/topPaneOverlayPrimitive'

/** 十字星指示值 primitive 管理接口（CrosshairManager 提供） */
export interface CrosshairPrimitiveRegistry {
  /** 注册（pane1 / pane3 由控制器注册，pane5 由本管理器注册） */
  registerPrimitive: (primitive: CrosshairAxisLabelPrimitive) => void
  /** 按 pane 下标移除（指标层关闭时移除 pane5 的指示值 primitive） */
  removeByPaneIndex: (paneIndex: number) => void
}

/** 指标管理器构造依赖 */
export interface IndicatorManagerDeps {
  /** chart 实例（addSeries / applyOptions / removePane） */
  chart: ReturnType<typeof import('lightweight-charts').createChart>
  /** K 线 series 惰性 getter（构造时可能未创建，调用时求值） */
  getKlineSeries: () => ISeriesApi<'Candlestick'>
  /** 成交量 series 惰性 getter（同上） */
  getVolumeSeries: () => ISeriesApi<'Histogram'>
  /** K 线数据（ChartDataPoint[]，pointType='kline'；构造时已生成，指标库 / 信息行共用） */
  getBars: () => ChartDataPoint[]
  /** 当前主题名（深浅系切换时 updateThemeColors 使用） */
  getTheme: () => ChartThemeName
  /** 十字星当前时间（null = 未命中 → 显示最新 bar；CrosshairManager 提供） */
  getOverlayTime: () => number | null
  /** 股票名称（pane0 首段） */
  getName: () => string
  /** 股票代码（pane0 首段） */
  getSymbol: () => string
  /** 十字星指示值注册表（CrosshairManager；pane5 的注册 / 移除走这里） */
  crosshairRegistry: CrosshairPrimitiveRegistry
  /** 指标开 / 关状态变化回调（controller 据此重算 pane 高度） */
  onIndicatorStateChange: () => void
}

/** 指标值缓存项（信息行分段：label + 线色 + time→value Map，现取 O(1)） */
interface IndicatorValueMap {
  /** 指标线名（如 MA5 / DIF / RSI6） */
  label: string
  /** 指标线颜色（分段文字着色） */
  color: string
  /** time → 指标值 */
  values: Map<number, number>
}

export class IndicatorManager {
  /* ===== 依赖（构造注入，只读） ===== */
  private readonly chart: IndicatorManagerDeps['chart']
  private readonly getKlineSeries: IndicatorManagerDeps['getKlineSeries']
  private readonly getVolumeSeries: IndicatorManagerDeps['getVolumeSeries']
  private readonly getBars: IndicatorManagerDeps['getBars']
  private readonly getTheme: IndicatorManagerDeps['getTheme']
  private readonly getOverlayTime: IndicatorManagerDeps['getOverlayTime']
  private readonly getName: IndicatorManagerDeps['getName']
  private readonly getSymbol: IndicatorManagerDeps['getSymbol']
  private readonly crosshairRegistry: CrosshairPrimitiveRegistry
  private readonly onIndicatorStateChange: IndicatorManagerDeps['onIndicatorStateChange']

  /* ===== 主图指标状态 ===== */
  /** 当前激活的主图指标（null = 关闭；互斥） */
  private mainIndicator: MainIndicatorName | null = null
  /** pane1 主图指标线缓存（{ 线色, 数据点 }[]；IndicatorLinePrimitive 自绘现取） */
  private mainIndicatorLines: IndicatorLineSpec[] = []
  /** 主图线型指标值缓存（pane0 信息行分段着色现取，O(1)） */
  private mainIndicatorValueMaps: IndicatorValueMap[] = []
  /** SAR 值缓存（time → SarPoint；SAR 无固定线色，颜色按 trend 逐 bar 决定） */
  private sarValueMap: Map<number, SarPoint> = new Map()
  /** SAR 圆点数据缓存（SarMarkerPrimitive 自绘现取；每次开启指标时全量重算） */
  private sarPoints: SarPoint[] = []
  /** SAR 圆点自绘 primitive（控制器创建并 attach 后注册；显隐 / 换色由本管理器控制） */
  private sarMarkerPrimitive: SarMarkerPrimitive | null = null

  /* ===== 成交量缓存 ===== */
  /** pane3 成交量均量线（VOL MA5 / MA10）数据缓存：top 层 primitive 自绘（十字星之上） */
  private volumeMaLines: IndicatorLineSpec[] = []
  /** pane2 成交量信息行缓存（time → 成交量 + MA5/MA10 值；MA 前 N-1 根为 null，O(1) 现取） */
  private volumeInfoMap: Map<number, { volume: number; ma5: number | null; ma10: number | null }> = new Map()

  /* ===== 附图指标状态 ===== */
  /** 当前激活的附图指标（null = 关闭指标层；互斥） */
  private activeSubIndicator: SubIndicatorType | null = null
  /** 指标 Pane 开关状态（true = 显示 pane4 / pane5；由 activeSubIndicator 驱动） */
  private showIndicator: boolean
  /** pane5 指标柱（Histogram，指标通用；开启时创建，关闭时销毁置 null） */
  private indicatorsBarSeries: ISeriesApi<'Histogram'> | null = null
  /**
   * pane5 刻度对称锚点 series（Line，不可见）：
   * 数据 = 全部时间点交替 ±absMax（i 偶 = +maxValue、i 奇 = -minValue），
   * 使可视区内**任意窗口**都同时含正 / 负锚点 → priceScale autoScale 并集恒为
   * [-absMax, +absMax]：平移 / 缩放 / 切换指标时 0 值线（中间刻度）固定不漂移，
   * 首尾刻度对称（|max| = |min|）。若只用首尾两根锚点，平移后可视区不含锚点，
   * 库按可视区数据重算值域，DIF/DEA/MACD 线条会整体上下漂移。
   */
  private indicatorScaleAnchorSeries: ISeriesApi<'Line'> | null = null
  /**
   * 当前附图指标 scale 值域边界（rebuildSubIndicatorData 每次重建时缓存）：
   * 供 pane5 左刻度**首尾固定值**显示（getEdgeFixedValues → ±absMax），
   * 保证刻度 |max| = |min| 严格成立、与平移 / 内嵌偏移无关。
   */
  private subScaleMax = 0
  private subScaleMin = 0
  /** pane5 附图指标各线数据缓存（{ 线色, 数据点 }[]；top 层自绘现取） */
  private subIndicatorLines: IndicatorLineSpec[] = []
  /** pane5 附图指标线自绘 primitive（挂 indicatorsBarSeries，zOrder 'top'） */
  private subIndicatorLinePrimitive: IndicatorLinePrimitive | null = null
  /** pane5 MACD 柱自绘 primitive（非 MACD 时 macdPoints 为空不绘制） */
  private macdBarPrimitive: MacdBarPrimitive | null = null
  /** pane4 指标信息行值缓存（label + 线色 + time→value Map，现取 O(1)） */
  private subIndicatorValueMaps: IndicatorValueMap[] = []
  /** MACD 指标点缓存（MacdBarPrimitive 自绘现取；仅 MACD 有值） */
  private macdPoints: MacdPoint[] = []

  constructor(deps: IndicatorManagerDeps) {
    this.chart = deps.chart
    this.getKlineSeries = deps.getKlineSeries
    this.getVolumeSeries = deps.getVolumeSeries
    this.getBars = deps.getBars
    this.getTheme = deps.getTheme
    this.getOverlayTime = deps.getOverlayTime
    this.getName = deps.getName
    this.getSymbol = deps.getSymbol
    this.crosshairRegistry = deps.crosshairRegistry
    this.onIndicatorStateChange = deps.onIndicatorStateChange
    // 指标层初始关闭（App.vue 默认无附图指标选中，点击指标按钮时才打开）
    this.showIndicator = false
  }

  /* ===================== 对外数据源（controller 构建 primitive 时注入） ===================== */

  /** pane1 主图指标线数据源（IndicatorLinePrimitive 自绘现取） */
  getMainIndicatorLines = (): IndicatorLineSpec[] => this.mainIndicatorLines

  /** pane3 成交量均量线数据源（IndicatorLinePrimitive 自绘现取） */
  getVolumeMaLines = (): IndicatorLineSpec[] => this.volumeMaLines

  /** SAR 圆点数据源（SarMarkerPrimitive 自绘现取） */
  getSarPoints = (): SarPoint[] => this.sarPoints

  /** 指标层开关状态（controller 布局 / 栅格横线等分数使用） */
  getShowIndicator = (): boolean => this.showIndicator

  /** 注册 SAR 圆点 primitive（控制器在 pane1 构建时创建并 attach 后调用） */
  registerSarMarker = (primitive: SarMarkerPrimitive): void => {
    this.sarMarkerPrimitive = primitive
  }

  /* ===================== 主图指标 ===================== */

  /**
   * 设置主图指标（互斥单选）：
   *  - name = null：清空全部指标线并隐藏 SAR；
   *  - name = 指标：清空旧线后按指标计算并写入缓存（top 层自绘，无 LineSeries）。
   */
  setMainIndicator = (name: MainIndicatorName | null): void => {
    this.clearMainIndicatorSeries()
    if (name === null) {
      this.mainIndicator = null
      return
    }
    this.mainIndicator = name
    const colors = mainIndicatorColors
    const bars = this.getBars()
    switch (name) {
      case 'ma': {
        // MA5 / MA10 / MA20 / MA30 / MA60 五条线（东财标准五线）
        const periods = [5, 10, 20, 30, 60]
        periods.forEach((period, index) => {
          this.appendMainIndicatorLine(calcMA(bars, period), colors.ma[index], `MA${period}`)
        })
        break
      }
      case 'expma': {
        // EXPMA12 / EXPMA50 两条线（东财默认参数）
        const periods = [12, 50]
        periods.forEach((period, index) => {
          this.appendMainIndicatorLine(calcEXPMA(bars, period), colors.expma[index], `EXPMA${period}`)
        })
        break
      }
      case 'boll': {
        // BOLL 上轨 / 中轨 / 下轨三条线（东财周期 20、倍数 2）
        const [upper, mid, lower] = calcBOLL(bars)
        this.appendMainIndicatorLine(upper, colors.boll[0], 'BOLL上')
        this.appendMainIndicatorLine(mid, colors.boll[1], 'BOLL中')
        this.appendMainIndicatorLine(lower, colors.boll[2], 'BOLL下')
        break
      }
      case 'sar': {
        // SAR：SarMarkerPrimitive 自绘圆点（多头红 / 空头绿），无需独立 LineSeries；
        // 数据全量重算后置入缓存，setVisible(true) 内部触发重绘。
        // 圆点颜色由 updateThemeColors 同步（构造时已用当前主题初始化），此处无需再 setTheme。
        // 同时构建 SAR 值缓存（pane0 信息行显示 "SAR: x"，颜色按 trend 红/绿）
        this.sarPoints = calcSAR(bars)
        this.sarValueMap = new Map(this.sarPoints.map((point) => [point.time, point]))
        this.sarMarkerPrimitive?.setVisible(true)
        break
      }
      case 'bbi': {
        // BBI 单线（(MA3 + MA6 + MA12 + MA24) / 4）
        this.appendMainIndicatorLine(calcBBI(bars), colors.bbi, 'BBI')
        break
      }
    }
    // 指标线由 IndicatorLinePrimitive 自绘（top canvas）：切换指标不再有 LineSeries
    // 增删自动触发重绘，这里显式触发一次全量重绘（applyOptions 内部无条件 fullUpdate）
    this.chart.applyOptions({})
  }

  /** 清空当前所有主图指标（缓存置空 + 值缓存清空；SAR primitive 仅隐藏，防内存泄漏） */
  private clearMainIndicatorSeries = (): void => {
    // 指标线由 IndicatorLinePrimitive 自绘（top canvas），清空数据缓存即可
    // （下一次库重绘时不再绘制旧线）
    this.mainIndicatorLines = []
    // 清空指标值缓存（pane0 信息行不再显示旧指标值）
    this.mainIndicatorValueMaps = []
    this.sarValueMap = new Map()
    this.sarMarkerPrimitive?.setVisible(false)
  }

  /** 创建指标线并写入数据（颜色 / 宽度按指标配置；label 供 pane0 信息行显示）。
   *  指标线只入缓存（IndicatorLinePrimitive top canvas 自绘），不创建 LineSeries */
  private appendMainIndicatorLine = (points: IndicatorLine[], color: string, label: string): void => {
    // 数据缓存：IndicatorLinePrimitive draw 时按可视范围现取并连线
    this.mainIndicatorLines.push({ color, points })
    // 同步值缓存（pane0 信息行按 time 现取指标值，O(1)；颜色 = 指标线颜色）
    this.mainIndicatorValueMaps.push({
      label,
      color,
      values: new Map(points.map((point) => [point.time, point.value])),
    })
  }

  /** 数据变化时刷新当前主图指标（controller.applyData 末尾调用；指标未开时为空操作） */
  refreshMainIndicatorData = (): void => {
    if (this.mainIndicator === null) return
    // 重建：清空当前线并重新按当前指标名写入（复用互斥逻辑）
    const active = this.mainIndicator
    this.setMainIndicator(active)
  }

  /* ===================== 成交量缓存（applyData 调用） ===================== */

  /** 重建成交量均量线（VOL MA5 / MA10）与 pane2 信息行缓存（数据变化时全量重建）。
   *  东财指标库 calcVolMA（前 N-1 根跳过），与成交量柱同量纲。 */
  rebuildVolumeData = (): void => {
    const bars = this.getBars()
    const theme = themeColors(this.getTheme())
    const volMa5Line = calcVolMA(bars, 5)
    const volMa10Line = calcVolMA(bars, 10)
    this.volumeMaLines = [
      { color: theme.volMa5, points: volMa5Line },
      { color: theme.volMa10, points: volMa10Line },
    ]
    const volMa5Map = new Map(volMa5Line.map((point) => [point.time, point.value]))
    const volMa10Map = new Map(volMa10Line.map((point) => [point.time, point.value]))
    this.volumeInfoMap = new Map(
      bars.map((bar) => [
        bar.time,
        {
          volume: bar.volume!, // pointType='kline' 必含 volume
          ma5: volMa5Map.get(bar.time) ?? null,
          ma10: volMa10Map.get(bar.time) ?? null,
        },
      ]),
    )
  }

  /* ===================== 附图指标（setSubIndicator 管理指标层） ===================== */

  /**
   * 设置附图指标（互斥单选）：
   *  - name = null：关闭指标层（移除 pane4 / pane5，布局 80:20）；
   *  - name = 指标：打开指标层（若未开则创建 pane4 / pane5）并重建该指标数据
   *    （pane5 线 / 柱 / Y 轴锚点 + pane4 信息行值，布局 60:20:20）。
   * 由 App.vue 十按钮驱动：点击已选中指标 = 取消（null）、点击其他指标 = 切换。
   */
  setSubIndicator = (name: SubIndicatorType | null): void => {
    if (this.activeSubIndicator === name) return
    this.activeSubIndicator = name
    if (name === null) {
      // 取消选中：关闭指标层
      this.removeIndicatorPanes()
      // 清空指标缓存（防残留旧指标数据 / 引用泄漏）
      this.subIndicatorLines = []
      this.subIndicatorValueMaps = []
      this.macdPoints = []
      this.onIndicatorStateChange()
      return
    }
    // 选中指标：指标层未开则先创建 pane4 / pane5，再重建数据
    if (!this.showIndicator) {
      this.createIndicatorPanes()
    }
    this.rebuildSubIndicatorData()
    this.onIndicatorStateChange()
  }

  /** 创建指标组 Pane（pane4 指标信息行 + pane5 附图指标）。
   *  注意库 addSeries 行为：指定的 paneIndex 超出当前 pane 数量时，库自动
   *  创建中间缺失的 pane（pane4 / pane5 一次性补齐）。 */
  private createIndicatorPanes = (): void => {
    // 指标层开启标记：pane 数量变化后布局按 6 Pane / 60:20:20 分配高度，
    // 且 pane1 栅格横线等分数（6）随指标开状态同步
    this.showIndicator = true
    // pane4：指标信息行空 Pane（自绘所选附图指标各线数值，设置与 pane0 一致，
    // 高度 topPaneHeight 绝对相等）
    this.chart.addSeries(
      LineSeries,
      {
        priceScaleId: 'left',
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      4,
    ).attachPrimitive(
      // 用 InfoLabelPrimitive（不填背景）——十字星竖线贯穿 pane4（与 pane2 一致）；
      // 数值 = buildSubIndicatorInfoSegments 现取（label + 线色，随十字星命中 bar / 最新 bar）
      new InfoLabelPrimitive(() => this.buildSubIndicatorInfoSegments()),
    )

    /* pane5：附图指标（RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR，互斥单选，高度与 pane3 一致）
     * 通用结构：
     *  - indicatorsBarSeries（Histogram）仅作 scale 锚点：color = 背景色（不可见），
     *    setData 覆盖当前指标全部线值域（首尾点取极值，见 rebuildSubIndicatorData）；
     *  - 线型指标（全部指标）由 subIndicatorLinePrimitive（IndicatorLinePrimitive，top 层）
     *    自绘 —— 十字星之上，不被横线遮挡；数据 = subIndicatorLines 缓存现取；
     *  - MACD 红绿柱由 MacdBarPrimitive 自绘（> 0 空心红柱 / < 0 绿实心，宽与 pane1 蜡烛
     *    绝对一致）；非 MACD 时 macdPoints 为空，柱不绘制。
     */
    this.indicatorsBarSeries = this.chart.addSeries(
      HistogramSeries,
      {
        priceScaleId: 'left',
        base: 0, // 柱从 0 轴绘制（正负双方向）
        color: themeColors(this.getTheme()).background, // 不可见（仅建 scale）
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
    // pane5 左刻度对称边距：库 priceScale.scaleMargins 默认 { top: 0.2, bottom: 0.1 }
    // —— 上下边距不对称。首尾刻度（内嵌 AXIS_LABEL_PAD=8px）经 coordinateToPrice 反推
    // 的值被不对称边距扭曲 → 即使 Y 轴值域对称（rebuildSubIndicatorData 已 |max|=|min|），
    // 显示刻度的最大值 / 最小值绝对值仍不相等（如 MACD 顶部约 +1.5A / 底部约 -1.2A）。
    // 改为 top = bottom = 0.1：数据映射上下镜像对称，首尾刻度反推值绝对值严格相等，
    // 同时柱体上下各留 10% 边距（不贴边、视觉更均匀）。
    this.chart.priceScale('left', 5).applyOptions({
      scaleMargins: { top: 0.1, bottom: 0.1 },
    })
    // pane5 刻度对称锚点 series（不可见）：全部时间点交替 ±absMax，
    // 使任意可视窗口都含正 / 负锚点 → autoScale 并集恒为对称 [-absMax, +absMax]，
    // 0 值线固定不漂移（数据由 rebuildSubIndicatorData 同步更新）
    this.indicatorScaleAnchorSeries = this.chart.addSeries(
      LineSeries,
      {
        priceScaleId: 'left',
        color: themeColors(this.getTheme()).background, // 不可见（仅撑 scale 值域）
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        priceFormat: {
          type: 'custom',
          formatter: () => '',
        },
      },
      5,
    )
    // MACD 红绿柱自绘（仅激活 MACD 时有数据；柱体 > 0 空心红 / < 0 绿实心）
    this.macdBarPrimitive = new MacdBarPrimitive(
      () => this.macdPoints,
      () => themeColors(this.getTheme()),
    )
    this.indicatorsBarSeries.attachPrimitive(this.macdBarPrimitive)
    // 内容 Pane 边框（pane5）：自绘 1px 矩形，颜色随主题（深浅系区分）
    this.indicatorsBarSeries.attachPrimitive(
      new PaneBorderPrimitive(() => themeColors(this.getTheme()).paneBorder),
    )
    // pane5 栅格：竖 4 等分；横向 2 等分（中间 1 条）
    this.indicatorsBarSeries.attachPrimitive(
      new GridPrimitive({
        getColor: () => themeColors(this.getTheme()).grid,
        getHorizontalCount: () => 2,
      }),
    )
    // pane5 左刻度标签：与栅格横线对齐（值 = 横线处指标值，大数缩写 / 自适应小数）。
    // 中间刻度：MACD 柱以 0 轴为正负分界 → 固定显示 0（getFixedMiddleValue 动态获取，
    // 切换指标无需重建刻度 primitive）；其他指标按 scale 中间值显示
    this.indicatorsBarSeries.attachPrimitive(
      new AxisLabelPrimitive({
        series: this.indicatorsBarSeries,
        getPaneIndex: () => 5,
        getHorizontalCount: () => 2,
        getColor: () => themeColors(this.getTheme()).textColor,
        getBackColor: () => themeColors(this.getTheme()).background,
        getFont: () => chartFont,
        format: (value) => formatAxisSmart(value),
        getFixedMiddleValue: () => (this.activeSubIndicator === 'macd' ? 0 : undefined),
        // 首尾刻度固定显示 scale 边界值（±absMax）：避免内嵌 8px 位置经
        // coordinateToPrice 反推产生顶/底不同溢出率导致 |max| ≠ |min|（0.27/-0.28）；
        // MACD 与全部附图指标通用（RSI 等首尾显示其值域边界，更直观）
        getEdgeFixedValues: () => ({
          topValue: this.subScaleMax,
          bottomValue: this.subScaleMin,
        }),
      }),
    )
    // pane5 十字星左刻度指示值：十字星横线所在指标值（大数缩写 / 自适应小数）
    const pane5CrosshairLabel = new CrosshairAxisLabelPrimitive({
      series: this.indicatorsBarSeries,
      getPaneIndex: () => 5,
      getColor: () => themeColors(this.getTheme()).crosshairLabelText,
      getBackColor: () => themeColors(this.getTheme()).crosshairLabelBackground,
      getFont: () => chartFont,
      format: (value) => formatAxisSmart(value),
    })
    this.indicatorsBarSeries.attachPrimitive(pane5CrosshairLabel)
    this.crosshairRegistry.registerPrimitive(pane5CrosshairLabel)
    // pane5 指标线：IndicatorLinePrimitive 自绘（top canvas，十字星之上，
    // 不被横线遮挡）；数据由 rebuildSubIndicatorData 写入 subIndicatorLines 缓存现取
    this.subIndicatorLinePrimitive = new IndicatorLinePrimitive(
      () => ({
        lines: this.subIndicatorLines,
        getTimeScale: () => this.chart.timeScale(),
        anchorSeries: () => this.indicatorsBarSeries!,
      }),
    )
    this.indicatorsBarSeries.attachPrimitive(this.subIndicatorLinePrimitive)
  }

  /** 关闭指标层：移除 pane4 / pane5 并清空相关 series 引用（防内存泄漏）。
   *  库 removePane 从 panes 数组 splice，pane 上 series（含 primitive）的强引用
   *  随之断开可被 GC；管理器再置 null 解除自身引用，保证反复开 / 关无泄漏。
   *  removePane(4) 两次：删 pane4 后原 pane5 顺移到 index 4，再删一次即移除整组。 */
  private removeIndicatorPanes = (): void => {
    // 指标层关闭标记：先置 false 再移除 Pane，布局按 4 Pane / 80:20 分配，
    // 避免 Pane 移除瞬间仍按 6 Pane 布局计算
    this.showIndicator = false
    this.chart.removePane(4)
    this.chart.removePane(4)
    this.indicatorsBarSeries = null
    this.indicatorScaleAnchorSeries = null
    this.macdBarPrimitive = null
    this.subIndicatorLinePrimitive = null
    // 移除 pane5 十字星指示值 primitive 引用（series 已销毁，清引用防泄漏 /
    // 避免 handleCrosshairMove 继续对已销毁 series 注入）
    this.crosshairRegistry.removeByPaneIndex(5)
  }

  /**
   * 重建当前附图指标数据缓存（pane5 线 / 柱 / Y 轴锚点 + pane4 信息行值）。
   * 仅指标层开启且存在选中指标时调用；数据变化（applyData）与切换指标
   * （setSubIndicator）时全量重建，避免旧指标残留（防内存泄漏与串色）。
   */
  private rebuildSubIndicatorData = (): void => {
    if (this.indicatorsBarSeries === null) return
    const name = this.activeSubIndicator
    if (name === null) return
    // 东财指标库：calcSubIndicators 返回十指标全量 Record，取当前选中指标的分组线
    const lines = calcSubIndicators(this.getBars())[name]
    if (lines.length === 0 || lines[0].length === 0) return
    const colors = subIndicatorColors[name]
    // pane5 线缓存（IndicatorLinePrimitive 自绘现取；线色 = subIndicatorColors 对应下标）
    this.subIndicatorLines = lines.map((points, index) => ({
      color: colors[index] ?? colors[0],
      points,
    }))
    // Y 轴锚点：不可见 Histogram setData 以第 0 条线为骨架，
    // 首 / 尾两点替换为全部线的最大 / 最小值 → scale 值域覆盖全部线（正负双方向），
    // 避免中间极值线超出 Y 轴被裁剪
    const allValues = lines.flat().map((point) => point.value)
    // MACD 特殊：首根 DIF/DEA/柱 = 0（EMA 首日以收盘起步）且柱以 0 轴为正负分界，
    // 若全正 / 全负值域不含 0 → 首根（0 值）线起点与柱被 priceToCoordinate 判 null
    // 裁剪（"第一个数据不渲染"）；强制 scale 覆盖 0。
    // 其他指标（OBV 等累计值）按实际值域，避免 0 拉宽 scale 压缩图形。
    const forceZero = name === 'macd'
    // 单趟扫描极值（数据量小；用循环避免 spread 大数组栈风险）
    let maxValue = -Infinity
    let minValue = Infinity
    for (const value of allValues) {
      if (value > maxValue) maxValue = value
      if (value < minValue) minValue = value
    }
    if (forceZero) {
      // MACD 刻度对称：Y 轴以 0 为对称中心，左刻度最大值与最小值绝对值相等
      // （|max| = |min| = 全量极值绝对值的最大值；如 DIF 最大 2.1 / 柱最小 -1.3
      //  → 刻度范围 [-2.1, +2.1]，正负刻度值镜像对齐）
      const absMax = Math.max(Math.abs(maxValue), Math.abs(minValue), 0)
      maxValue = absMax
      minValue = -absMax
    }
    // 缓存 scale 值域边界（pane5 首尾刻度固定显示用；首尾标签不再反推，
    // 避免内嵌偏移顶/底溢出率不同导致 |max| ≠ |min|）
    this.subScaleMax = maxValue
    this.subScaleMin = minValue
    const anchorPoints = lines[0].map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.value,
    }))
    anchorPoints[0] = { time: lines[0][0].time as UTCTimestamp, value: maxValue }
    anchorPoints[anchorPoints.length - 1] = {
      time: lines[0][lines[0].length - 1].time as UTCTimestamp,
      value: minValue,
    }
    this.indicatorsBarSeries.setData(anchorPoints)
    // 刻度对称锚点 series：全部时间点交替 ±absMax（可视区任意窗口恒含正 / 负锚点，
    // scale 值域恒为 [-absMax, +absMax] → 0 值线固定；平移 / 切换指标均不漂移）
    if (this.indicatorScaleAnchorSeries !== null) {
      this.indicatorScaleAnchorSeries.setData(
        lines[0].map((point, index) => ({
          time: point.time as UTCTimestamp,
          value: index % 2 === 0 ? maxValue : minValue,
        })),
      )
    }
    // MACD 柱点缓存（MacdBarPrimitive 自绘现取；仅 MACD 有值，其他指标为空不画柱）
    if (name === 'macd') {
      const [difLine, deaLine, histLine] = lines
      this.macdPoints = difLine.map((point, index) => ({
        time: point.time,
        dif: point.value,
        dea: deaLine[index].value,
        macd: histLine[index].value,
      }))
    } else {
      this.macdPoints = []
    }
    // pane4 信息行值缓存（label + 线色 + time→value Map，现取 O(1)）
    this.subIndicatorValueMaps = lines.map((points, index) => ({
      label: subIndicatorLabels[name][index] ?? `LINE${index}`,
      color: colors[index] ?? colors[0],
      values: new Map(points.map((point) => [point.time, point.value])),
    }))
    // 强制一帧全量重绘：切换指标后线 / 柱 / 刻度中间值全部更新
    this.chart.applyOptions({})
  }

  /** 附图指标数据重建入口（controller.applyData 调用；指标层关闭时为空操作） */
  rebuildIndicatorData = (): void => {
    if (this.indicatorsBarSeries !== null) {
      this.rebuildSubIndicatorData()
    }
  }

  /* ===================== 主题同步（applyTheme 调用） ===================== */

  /** 主题切换后同步指标相关颜色（数据不变，仅换色 + 触发重绘） */
  updateThemeColors = (themeColorSet: ChartThemeColors): void => {
    // 附图指标锚点色跟随背景（保持不可见）；可见柱体由 MacdBarPrimitive 动态取新主题色
    this.indicatorsBarSeries?.applyOptions({ color: themeColorSet.background })
    // SAR 圆点颜色（多头红 / 空头绿）随主题更新
    this.sarMarkerPrimitive?.setTheme(themeColorSet)
    // 成交量均量线颜色跟随主题（数据不变，仅换色；MA5/MA10 色值见 theme.volMa5/volMa10）
    if (this.volumeMaLines.length === 2) {
      this.volumeMaLines = [
        { ...this.volumeMaLines[0], color: themeColorSet.volMa5 },
        { ...this.volumeMaLines[1], color: themeColorSet.volMa10 },
      ]
    }
  }

  /* ===================== 信息行分段文字 ===================== */

  /**
   * 构建 pane0 信息行分段文字（首段"股票名称 [代码] 时间" + 各指标值段，逐段着色）：
   *  - 首段颜色 = 主题文字色；
   *  - 线型指标段（MA/EXPMA/BOLL/BBI）= 对应指标线颜色，格式 " MA5: 25.55"；
   *  - SAR 段颜色 = 该 bar trend（多头红 / 空头绿），格式 " SAR: 25.55"；
   *  - 时间与指标值同源（overlayTime ?? 最新 bar）；无指标 / 该 bar 无值自动跳过；
   *  - 数据来自 setMainIndicator 构建的缓存（O(1) 现取，无每帧计算）。
   */
  buildInfoSegments = (): TextSegment[] => {
    const theme = themeColors(this.getTheme())
    // 首段：股票名称 [代码] 时间（主题文字色）
    const symbol = this.getSymbol()
    const name = this.getName()
    const base = symbol ? `${name} [${symbol}]` : name || '测试'
    const bars = this.getBars()
    const time = this.getOverlayTime() ?? bars[bars.length - 1]?.time ?? null
    const segments: TextSegment[] = [{ text: `${base} ${formatDate(time)}`, color: theme.textColor }]
    if (time === null) return segments
    // 指标值段：线型指标（MA/EXPMA/BOLL/BBI）按线色，SAR 按 trend 色
    for (const line of this.mainIndicatorValueMaps) {
      const value = line.values.get(time)
      if (value !== undefined) segments.push({ text: ` ${line.label}: ${formatPrice(value)}`, color: line.color })
    }
    const sarPoint = this.sarValueMap.get(time)
    if (sarPoint !== undefined) {
      segments.push({
        text: ` SAR: ${formatPrice(sarPoint.value)}`,
        color: sarPoint.trend === 1 ? theme.sarUp : theme.sarDown,
      })
    }
    return segments
  }

  /**
   * 构建 pane2 成交量信息行分段文字（"成交量: x  MA5: x  MA10: x"，逐段着色）：
   *  - 成交量本体 = 主题文字色；MA5 / MA10 = theme.volMa5（黄）/ volMa10（粉）；
   *  - 数值同源（overlayTime ?? 最新 bar），十字星命中显示命中 bar 的成交量与均量；
   *  - MA 前 N-1 根无值（null）自动跳过；数据来自 rebuildVolumeData 构建的 volumeInfoMap（O(1)）。
   */
  buildVolumeInfoSegments = (): TextSegment[] => {
    const theme = themeColors(this.getTheme())
    const bars = this.getBars()
    const time = this.getOverlayTime() ?? bars[bars.length - 1]?.time ?? null
    if (time === null) return []
    const info = this.volumeInfoMap.get(time)
    if (info === undefined) return []
    const segments: TextSegment[] = [
      { text: `成交量: ${formatVolume(info.volume)}`, color: theme.textColor },
    ]
    if (info.ma5 !== null) segments.push({ text: ` MA5: ${formatVolume(info.ma5)}`, color: theme.volMa5 })
    if (info.ma10 !== null) segments.push({ text: ` MA10: ${formatVolume(info.ma10)}`, color: theme.volMa10 })
    return segments
  }

  /**
   * 构建 pane4 指标信息行分段（所选附图指标各线数值，label + 线色，随十字星命中 bar /
   * 最新 bar）；指标层关闭（pane4 已移除）时不会被调用。
   * 分段间距与 pane2 成交量信息行一致：后续段前导 1 空格
   * （InfoLabelPaneView 按 measureText 无缝拼接，间距完全由文本决定）。
   * MACD 三段：DIF / DEA / MACD 柱值（柱值文本色取 subIndicatorColors.macd[2]）。
   */
  buildSubIndicatorInfoSegments = (): TextSegment[] => {
    const bars = this.getBars()
    const time = this.getOverlayTime() ?? bars[bars.length - 1]?.time ?? null
    if (time === null || this.subIndicatorValueMaps.length === 0) return []
    const segments: TextSegment[] = []
    this.subIndicatorValueMaps.forEach((line, index) => {
      const value = line.values.get(time)
      if (value === undefined) return
      segments.push({
        // 首段无前导空格、后续段前导 1 空格（与 pane2"成交量: x  MA5: x"一致）
        text: `${index === 0 ? '' : ' '}${line.label}: ${formatAxisSmart(value)}`,
        color: line.color,
      })
    })
    return segments
  }

  /** 销毁：清空全部内部引用 / 缓存（series 由控制器统一 chart.remove 释放） */
  destroy = (): void => {
    this.mainIndicator = null
    this.mainIndicatorLines = []
    this.mainIndicatorValueMaps = []
    this.sarValueMap = new Map()
    this.sarPoints = []
    this.sarMarkerPrimitive = null
    this.volumeMaLines = []
    this.volumeInfoMap = new Map()
    this.activeSubIndicator = null
    this.showIndicator = false
    this.indicatorsBarSeries = null
    this.subIndicatorLines = []
    this.subIndicatorLinePrimitive = null
    this.macdBarPrimitive = null
    this.subIndicatorValueMaps = []
    this.macdPoints = []
  }
}
