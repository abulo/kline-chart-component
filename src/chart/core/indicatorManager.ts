/**
 * indicatorManager.ts —— 指标管理器（v1.4.73 拆分自 KLineChartController.ts）
 *
 * 职责：集中管理主图 / 附图指标与信息行数据源，包含：
 *  - 主图指标（MA / EXPMA / BOLL / SAR / BBI，互斥）：setMainIndicator，
 *    线型指标由 IndicatorLinePrimitive top 层自绘（数据源 getMainIndicatorLines），
 *    SAR 圆点由 SarMarkerPrimitive 自绘（控制器创建后经 registerSarMarker 注册）；
 *  - 附图指标（RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR，互斥）：setSubIndicator
 *    转发给 SubIndicatorPaneManager（pane4 指标信息行 + pane5 指标图，见
 *    subIndicatorPaneManager.ts），本类只负责开 / 关后的布局重算回调；
 *  - 成交量均量线（VOL MA5 / MA10）与 pane2 成交量信息行缓存；
 *  - pane0 / pane2 信息行分段文字构建（随十字星现取，O(1)）。
 *
 * 依赖注入（controller 提供，series 惰性 getter —— 构造时 series 可能尚未创建，
 * getter 在 draw / 调用时才求值，保证构建顺序安全）：
 *  - chart / klineSeries / volumeSeries / bars（ChartDataPoint[]）；
 *  - theme / overlayTime（十字星当前时间）/ 股票名 / 代码；
 *  - crosshairManager（转发给 SubIndicatorPaneManager 注册 pane5 指示值）；
 *  - onIndicatorStateChange（指标开 / 关后由 controller 重算 pane 高度）。
 */
import type { ChartDataPoint } from '../../types/chart'
import { themeColors, mainIndicatorColors, type ChartThemeName } from './theme'
import { SarMarkerPrimitive } from '../indicator/sarMarkerPrimitive'
import {
  calcMA,
  calcEXPMA,
  calcBOLL,
  calcSAR,
  calcBBI,
  calcVolMA,
  type IndicatorLine,
  type SarPoint,
  type SubIndicatorType,
} from '../indicator'
import { formatVolume, formatPrice, formatTimeByFmt, formatAxisTime } from '../util/format'
import type { ChartThemeColors } from './theme'
import { isTimesharePeriod, timeshareVerticalCount, type PeriodValueOrEmpty } from '../periods'
import { type IndicatorLineSpec, type CrosshairPrimitiveRegistry, type IndicatorValueMap } from './types'
import { type MainIndicatorType } from '../indicator'
import { SubIndicatorPaneManager } from './subIndicatorPaneManager'
import type { TextSegment } from '../overlay/topPaneOverlayPrimitive'

/**
 * 以 0 为对称中心的附图指标集合（MACD / CCI）判定与不可见锚点颜色
 * 已随 pane4 / pane5 拆至 subIndicatorPaneManager.ts（v1.4.89）。
 */

/** 指标管理器构造依赖 */
export interface IndicatorManagerDeps {
  /** chart 实例（addSeries / applyOptions / removePane） */
  chart: ReturnType<typeof import('lightweight-charts').createChart>
  /** K 线数据（ChartDataPoint[]，pointType='kline'；构造时已生成，指标库 / 信息行共用） */
  getBars: () => ChartDataPoint[]
  /** 当前主题名（深浅系切换时 updateThemeColors 使用） */
  getTheme: () => ChartThemeName
  /** 十字星当前时间（null = 未命中 → 显示最新 bar；CrosshairManager 提供） */
  getOverlayTime: () => number | null
  /** 十字星竖线实时 x（数据区坐标，v1.7.1；Controller 提供，pane4/5 cap 竖线共用） */
  getCrosshairX: () => number | null
  /** 股票名称（pane0 首段） */
  getName: () => string
  /** 股票代码（pane0 首段） */
  getSymbol: () => string
  /** 十字星指示值注册表（CrosshairManager；仅转发给 SubIndicatorPaneManager 注册 pane5 指示值） */
  crosshairRegistry: CrosshairPrimitiveRegistry
  /** 指标开 / 关状态变化回调（controller 据此重算 pane 高度） */
  onIndicatorStateChange: () => void
  /** 时间格式模板（v1.6.9 透传 format；undefined → 按周期自动） */
  getTimeFormat: () => string | undefined
  /** 当前周期（v1.6.9；日/周/月 → YYYY-MM-DD，分时 → HH:mm，分钟 K → YYYY-MM-DD HH:mm） */
  getPeriod: () => PeriodValueOrEmpty
}

/** 指标值缓存项（信息行分段：label + 线色 + time→value Map，现取 O(1)）——见 types.ts */

export class IndicatorManager {
  /* ===== 依赖（构造注入，只读） ===== */
  private readonly chart: IndicatorManagerDeps['chart']
  private readonly getBars: IndicatorManagerDeps['getBars']
  private readonly getTheme: IndicatorManagerDeps['getTheme']
  private readonly getOverlayTime: IndicatorManagerDeps['getOverlayTime']
  private readonly getName: IndicatorManagerDeps['getName']
  private readonly getSymbol: IndicatorManagerDeps['getSymbol']
  private readonly onIndicatorStateChange: IndicatorManagerDeps['onIndicatorStateChange']
  /** 时间格式模板（v1.6.9） */
  private readonly getTimeFormat: IndicatorManagerDeps['getTimeFormat']
  /** 当前周期（v1.6.9） */
  private readonly getPeriod: IndicatorManagerDeps['getPeriod']

  /* ===== 主图指标状态 ===== */
  /** 当前激活的主图指标（null = 关闭；互斥） */
  private mainIndicator: MainIndicatorType | null = null
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
  /** pane2 成交量信息行缓存（time → 成交量 + 成交额 + MA5/MA10 值；MA 前 N-1 根为 null，O(1) 现取） */
  private volumeInfoMap: Map<number, { volume: number; amount: number; ma5: number | null; ma10: number | null }> = new Map()
  /** bar 按 time 索引（v1.7.0 分时 pane0 信息行取 价格/涨跌/涨幅/量额；数据变化时随
   *  rebuildVolumeData 重建，O(1) 现取，避免 draw 每帧线性查找） */
  private barTimeMap: Map<number, ChartDataPoint> = new Map()

  /* ===== 附图指标（pane4 / pane5 全部逻辑在 SubIndicatorPaneManager） ===== */
  /** pane4 指标信息行 + pane5 指标图管理器（创建 / 销毁 / 数据 / 信息行） */
  private readonly subIndicatorPane: SubIndicatorPaneManager

  constructor(deps: IndicatorManagerDeps) {
    this.chart = deps.chart
    this.getBars = deps.getBars
    this.getTheme = deps.getTheme
    this.getOverlayTime = deps.getOverlayTime
    this.getName = deps.getName
    this.getSymbol = deps.getSymbol
    this.onIndicatorStateChange = deps.onIndicatorStateChange
    this.getTimeFormat = deps.getTimeFormat
    this.getPeriod = deps.getPeriod
    // 附图指标管理器：pane4 / pane5 独立成类（见 subIndicatorPaneManager.ts；
    // crosshairRegistry 直接转发，本类不持有）
    this.subIndicatorPane = new SubIndicatorPaneManager({
      chart: deps.chart,
      getBars: deps.getBars,
      getTheme: deps.getTheme,
      getOverlayTime: deps.getOverlayTime,
      getCrosshairX: deps.getCrosshairX,
      crosshairRegistry: deps.crosshairRegistry,
      // v1.7.0：分时模式判定 + 竖向栅格份数（分时按周期 / K 线恒 4）
      getIsTimeshare: () => isTimesharePeriod(deps.getPeriod()),
      getVerticalCount: () => timeshareVerticalCount(deps.getPeriod()),
    })
  }

  /* ===================== 对外数据源（controller 构建 primitive 时注入） ===================== */

  /** pane1 主图指标线数据源（IndicatorLinePrimitive 自绘现取） */
  getMainIndicatorLines = (): IndicatorLineSpec[] => this.mainIndicatorLines

  /** pane3 成交量均量线数据源（IndicatorLinePrimitive 自绘现取） */
  getVolumeMaLines = (): IndicatorLineSpec[] => this.volumeMaLines

  /** SAR 圆点数据源（SarMarkerPrimitive 自绘现取） */
  getSarPoints = (): SarPoint[] => this.sarPoints

  /** 指标层开关状态（controller 布局 / 栅格横线等分数使用；转发 SubIndicatorPaneManager） */
  getShowIndicator = (): boolean => this.subIndicatorPane.getShowIndicator()

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
  setMainIndicator = (name: MainIndicatorType | null): void => {
    this.clearMainIndicatorSeries()
    if (name === null) {
      this.mainIndicator = null
      return
    }
    // 分时周期无主图指标（v1.7.0）：pane1 为分时双线，MA/EXPMA/BOLL/SAR/BBI
    // 基于 OHLC 计算（分时点无 OHLC → NaN）；分时下清空缓存，切回 K 线周期恢复
    if (isTimesharePeriod(this.getPeriod())) {
      this.mainIndicator = null
      return
    }
    this.mainIndicator = name
    const colors = mainIndicatorColors
    const bars = this.getBars()
    switch (name) {
      case 'ma': {
        // MA5 / MA10 / MA20 / MA30 / MA60 五条线（东财标准五线）
        const Periods = [5, 10, 20, 30, 60]
        Periods.forEach((period, index) => {
          this.appendMainIndicatorLine(calcMA(bars, period), colors.ma[index], `MA${period}`)
        })
        break
      }
      case 'expma': {
        // EXPMA12 / EXPMA50 两条线（东财默认参数）
        const Periods = [12, 50]
        Periods.forEach((period, index) => {
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
   *  东财指标库 calcVolMA（前 N-1 根跳过），与成交量柱同量纲。
   *  分时周期（v1.7.0）去掉均量线：只显示 1px 量柱，不叠加 VOL MA5 / MA10。 */
  rebuildVolumeData = (): void => {
    if (isTimesharePeriod(this.getPeriod())) {
      const tsBars = this.getBars()
      // barTimeMap：分时 pane0 信息行 价格/涨跌/涨幅/量额 现取（O(1)，v1.7.0）
      this.barTimeMap = new Map(tsBars.map((bar) => [bar.time, bar]))
      this.volumeMaLines = []
      this.volumeInfoMap = new Map(
        tsBars.map((bar) => [
          bar.time,
          { volume: bar.volume ?? 0, amount: bar.amount ?? 0, ma5: null, ma10: null },
        ]),
      )
      return
    }
    const bars = this.getBars()
    // barTimeMap：分时 pane0 信息行数据源（K 线周期未使用，仍同步重建保持统一）
    this.barTimeMap = new Map(bars.map((bar) => [bar.time, bar]))
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
          amount: bar.amount ?? 0,
          ma5: volMa5Map.get(bar.time) ?? null,
          ma10: volMa10Map.get(bar.time) ?? null,
        },
      ]),
    )
  }

  /* ===================== 附图指标（转发 SubIndicatorPaneManager） ===================== */

  /**
   * 设置附图指标（互斥单选）：转发 SubIndicatorPaneManager（创建 / 重建 / 关闭
   * pane4 + pane5），随后触发布局重算回调（指标开 / 关改变 pane 数量与高度比例）。
   * 由 App.vue 十按钮驱动：点击已选中指标 = 取消（null）、点击其他指标 = 切换。
   */
  setSubIndicator = (name: SubIndicatorType | null): void => {
    this.subIndicatorPane.setSubIndicator(name)
    this.onIndicatorStateChange()
  }

  /** 附图指标数据重建入口（controller.applyData 调用；指标层关闭时为空操作） */
  rebuildIndicatorData = (): void => {
    this.subIndicatorPane.rebuildDataIfOpen()
  }

  /* ===================== 主题同步（applyTheme 调用） ===================== */

  /** 主题切换后同步指标相关颜色（数据不变，仅换色 + 触发重绘） */
  updateThemeColors = (themeColorSet: ChartThemeColors): void => {
    // 附图指标锚点 series 保持全透明（仅建 scale，不可见不覆盖）
    // → SubIndicatorPaneManager.updateThemeColors 处理
    this.subIndicatorPane.updateThemeColors()
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
    // v1.6.9：format 模板优先；缺省按周期自动（日/周/月 → YYYY-MM-DD；分时 → YYYY-MM-DD HH:mm；分钟 K → YYYY-MM-DD HH:mm）
    const timeFormat = this.getTimeFormat()
    const timeText = timeFormat ? formatTimeByFmt(time ?? 0, timeFormat) : formatAxisTime(time, this.getPeriod())
    const segments: TextSegment[] = [{ text: `${base} ${timeText}`, color: theme.textColor }]
    if (time === null) return segments
    // 分时周期（v1.7.0）：pane0 追加 价格 / 均价 / 涨跌 / 涨幅 / 成交量 / 成交额。
    // 着色规则：价格 / 涨跌 / 涨幅 **数字**按 vs 昨收红涨绿跌平盘着色（label 用文字色），
    // 均价 / 成交量 / 成交额不着色（label + 数字均文字色）；数据 barTimeMap O(1) 现取
    if (isTimesharePeriod(this.getPeriod())) {
      const tsBar = this.barTimeMap.get(time)
      if (tsBar !== undefined) {
        const price = tsBar.price ?? 0
        const preClose = tsBar.preClose ?? price
        const diff = price - preClose
        const pct = preClose > 0 ? (diff / preClose) * 100 : 0
        const sign = diff > 0 ? '+' : diff < 0 ? '-' : ''
        const trendColor = diff > 0 ? theme.upColor : diff < 0 ? theme.downColor : theme.flatColor
        const labelColor = theme.textColor
        segments.push(
          { text: ' 价格: ', color: labelColor },
          { text: formatPrice(price), color: trendColor },
          { text: ' 均价: ', color: labelColor },
          { text: formatPrice(tsBar.avgPrice ?? 0), color: theme.timeshareAvgColor },
          { text: ' 涨跌: ', color: labelColor },
          { text: `${sign}${formatPrice(Math.abs(diff))}`, color: trendColor },
          { text: ' 涨幅: ', color: labelColor },
          { text: `${sign}${Math.abs(pct).toFixed(2)}%`, color: trendColor },
          { text: ' 成交量: ', color: labelColor },
          { text: formatVolume(tsBar.volume), color: labelColor },
          { text: ' 成交额: ', color: labelColor },
          { text: formatVolume(tsBar.amount), color: labelColor },
        )
      }
      return segments
    }
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
   * 构建 pane2 成交量信息行分段文字（"成交量: x  成交额: x  MA5: x  MA10: x"，逐段着色）：
   *  - 成交量 / 成交额本体 = 主题文字色；MA5 / MA10 = theme.volMa5（黄）/ volMa10（粉）；
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
      { text: ` 成交额: ${formatVolume(info.amount)}`, color: theme.textColor },
    ]
    if (info.ma5 !== null) segments.push({ text: ` MA5: ${formatVolume(info.ma5)}`, color: theme.volMa5 })
    if (info.ma10 !== null) segments.push({ text: ` MA10: ${formatVolume(info.ma10)}`, color: theme.volMa10 })
    return segments
  }

  /** 销毁：清空全部内部引用 / 缓存（series 由控制器统一 chart.remove 释放） */
  destroy = (): void => {
    this.subIndicatorPane.destroy()
    this.mainIndicator = null
    this.mainIndicatorLines = []
    this.mainIndicatorValueMaps = []
    this.sarValueMap = new Map()
    this.sarPoints = []
    this.sarMarkerPrimitive = null
    this.volumeMaLines = []
    this.volumeInfoMap = new Map()
    this.barTimeMap = new Map()
  }
}
