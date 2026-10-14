/**
 * subIndicatorPaneManager.ts —— 附图指标 Pane 管理器（v1.4.89 拆分自 indicatorManager.ts）
 *
 * 集中管理附图指标层的两个 Pane：
 *  - pane4：指标信息行（空 Pane，自绘所选附图指标各线数值，高度与 pane0 / pane2 绝对相等）；
 *  - pane5：指标图（红绿柱 + 指标线 + 对称刻度，高度与 pane3 一致）。
 *
 * 职责（全部 top 层 / normal 层自绘，不创建可见 series）：
 *  - 创建 / 销毁：setSubIndicator 打开（创建 pane4 + pane5）或关闭（移除整组）；
 *  - 数据重建：线 / 红绿柱 / Y 轴对称锚点 / 信息行值缓存（applyData 与切换指标时全量重建）；
 *  - 信息行分段文字构建（随十字星现取，O(1)）；
 *  - 主题同步（锚点 series 保持全透明、不覆盖自绘内容）。
 *
 * 依赖注入（IndicatorManager 提供，series 惰性 getter —— 构造时 series 可能尚未创建，
 * getter 在 draw / 调用时才求值，保证构建顺序安全）：
 *  - chart / getBars / getTheme / getOverlayTime / crosshairRegistry。
 */
import {
  LineSeries,
  HistogramSeries,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { ChartDataPoint } from '../../types/chart'
import { themeColors, subIndicatorColors, chartFont, type ChartThemeName, type ChartThemeColors } from './theme'
import { InfoLabelPrimitive } from '../overlay/infoLabelPrimitive'
import { IndicatorLinePrimitive } from '../overlay/indicatorLinePrimitive'
import { MacdBarPrimitive, type MacdPoint } from '../indicator/macdBarPrimitive'
import { PaneBorderPrimitive } from '../border/paneBorderPrimitive'
import { GridPrimitive } from '../grid/gridPrimitive'
import { AxisLabelPrimitive } from '../axis/axisLabelPrimitive'
import { CrosshairAxisLabelPrimitive } from '../crosshair/crosshairAxisLabelPrimitive'
import { CrosshairLineCapPrimitive } from '../crosshair/crosshairLineCapPrimitive'
import { calcSubIndicators, type SubIndicatorType } from '../indicator'
import { formatAxisSmart } from '../util/format'
import { subIndicatorLabels } from './indicatorMeta'
import type { CrosshairPrimitiveRegistry, IndicatorLineSpec, IndicatorValueMap } from './types'
import type { TextSegment } from '../overlay/topPaneOverlayPrimitive'

/**
 * 以 0 为对称中心的附图指标集合：
 *  - MACD：DIF/DEA/柱以 0 轴为正负分界（柱 base=0），scale 值域 [-absMax, +absMax]、
 *    中间刻度固定 0、首尾刻度固定 ±absMax（|max| = |min|）；
 *  - CCI：以 0 为中心正负摆动（常用 ±100 / ±200），同样要求刻度对称、中间为 0。
 * 其余指标（RSI 0-100、KDJ 0-100 等）按实际值域显示。
 */
const zeroCenteredSubIndicators = ['macd', 'cci'] as const

/** 判断指标是否要求 0 对称刻度（scale 值域 [-absMax, +absMax] + 中间固定 0） */
export const isZeroCenteredSubIndicator = (name: string): boolean =>
  (zeroCenteredSubIndicators as readonly string[]).includes(name)

/**
 * 不可见 series 颜色（全透明）：
 * 建 scale 的锚点 series 用透明色而非背景色 —— 透明不产生像素、不会覆盖
 * 同 canvas 上的自绘内容（v1.4.83 起 MACD 柱 / 指标线在 normal / top 层绘制，
 * 若锚点柱用不透明背景色，会在 main canvas 逐根覆盖红绿柱与灰黄线，
 * 表现为"柱被切割、线不连贯"）；scale 值域只取数据值，与颜色无关。
 */
export const invisibleSeriesColor = 'rgba(0, 0, 0, 0)'

/** 附图指标 Pane 管理器构造依赖 */
export interface SubIndicatorPaneManagerDeps {
  /** chart 实例（addSeries / applyOptions / removePane / priceScale） */
  chart: ReturnType<typeof import('lightweight-charts').createChart>
  /** K 线数据（ChartDataPoint[]，pointType='kline'；指标库 / 信息行共用） */
  getBars: () => ChartDataPoint[]
  /** 当前主题名（深浅系切换时 updateThemeColors 使用） */
  getTheme: () => ChartThemeName
  /** 十字星当前时间（null = 未命中 → 显示最新 bar；CrosshairManager 提供） */
  getOverlayTime: () => number | null
  /** 十字星指示值注册表（CrosshairManager；pane5 的注册 / 移除走这里） */
  crosshairRegistry: CrosshairPrimitiveRegistry
}

export class SubIndicatorPaneManager {
  /* ===== 依赖（构造注入，只读） ===== */
  private readonly chart: SubIndicatorPaneManagerDeps['chart']
  private readonly getBars: SubIndicatorPaneManagerDeps['getBars']
  private readonly getTheme: SubIndicatorPaneManagerDeps['getTheme']
  private readonly getOverlayTime: SubIndicatorPaneManagerDeps['getOverlayTime']
  private readonly crosshairRegistry: CrosshairPrimitiveRegistry

  /* ===== 附图指标状态 ===== */
  /** 当前激活的附图指标（null = 关闭指标层；互斥） */
  private activeSubIndicator: SubIndicatorType | null = null
  /** 指标 Pane 开关状态（true = 显示 pane4 / pane5；由 activeSubIndicator 驱动） */
  private showIndicator = false
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
   * 当前附图指标 scale 值域边界（rebuildData 每次重建时缓存）：
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

  constructor(deps: SubIndicatorPaneManagerDeps) {
    this.chart = deps.chart
    this.getBars = deps.getBars
    this.getTheme = deps.getTheme
    this.getOverlayTime = deps.getOverlayTime
    this.crosshairRegistry = deps.crosshairRegistry
  }

  /* ===================== 对外数据源（controller / primitive 注入） ===================== */

  /** 指标层开关状态（controller 布局 / 栅格横线等分数使用） */
  getShowIndicator = (): boolean => this.showIndicator

  /**
   * 设置附图指标（互斥单选）：
   *  - name = null：关闭指标层（移除 pane4 / pane5，布局 80:20）；
   *  - name = 指标：打开指标层（若未开则创建 pane4 / pane5）并重建该指标数据
   *    （pane5 线 / 柱 / Y 轴锚点 + pane4 信息行值，布局 60:20:20）。
   * 由 App.vue 十按钮驱动：点击已选中指标 = 取消（null）、点击其他指标 = 切换。
   * 状态变化后由调用方（IndicatorManager）触发 onIndicatorStateChange 重算布局。
   */
  setSubIndicator = (name: SubIndicatorType | null): void => {
    if (this.activeSubIndicator === name) return
    this.activeSubIndicator = name
    if (name === null) {
      // 取消选中：关闭指标层
      this.removePanes()
      // 清空指标缓存（防残留旧指标数据 / 引用泄漏）
      this.subIndicatorLines = []
      this.subIndicatorValueMaps = []
      this.macdPoints = []
      return
    }
    // 选中指标：指标层未开则先创建 pane4 / pane5，再重建数据
    if (!this.showIndicator) {
      this.createPanes()
    }
    this.rebuildData()
  }

  /** 创建指标组 Pane（pane4 指标信息行 + pane5 附图指标）。
   *  注意库 addSeries 行为：指定的 paneIndex 超出当前 pane 数量时，库自动
   *  创建中间缺失的 pane（pane4 / pane5 一次性补齐）。 */
  private createPanes = (): void => {
    // 指标层开启标记：pane 数量变化后布局按 6 Pane / 60:20:20 分配高度，
    // 且 pane1 栅格横线等分数（6）随指标开状态同步
    this.showIndicator = true
    // pane4：指标信息行空 Pane（自绘所选附图指标各线数值，设置与 pane0 一致，
    // 高度 topPaneHeight 绝对相等）
    const pane4InfoSeries = this.chart.addSeries(
      LineSeries,
      {
        priceScaleId: 'left',
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      4,
    )
    pane4InfoSeries.attachPrimitive(
      // 用 InfoLabelPrimitive（不填背景）——十字星竖线贯穿 pane4（与 pane2 一致）；
      // 数值 = buildInfoSegments 现取（label + 线色，随十字星命中 bar / 最新 bar）
      new InfoLabelPrimitive(() => this.buildInfoSegments()),
    )
    // pane4 十字星竖线底部补齐（见 CrosshairLineCapPrimitive：填虚线最后空白段）
    pane4InfoSeries.attachPrimitive(this.createCrosshairLineCap())

    /* pane5：附图指标（RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR，互斥单选，高度与 pane3 一致）
     * 通用结构：
     *  - indicatorsBarSeries（Histogram）仅作 scale 锚点：color = 全透明（不可见），
     *    setData 覆盖当前指标全部线值域（首尾点取极值，见 rebuildData）；
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
        // 全透明不可见（仅建 scale）：锚点柱不产生像素，避免在 normal 层
        // 逐根覆盖自绘的 MACD 红绿柱与指标线（见 invisibleSeriesColor 说明）
        color: invisibleSeriesColor,
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
    // 的值被不对称边距扭曲 → 即使 Y 轴值域对称（rebuildData 已 |max|=|min|），
    // 显示刻度的最大值 / 最小值绝对值仍不相等（如 MACD 顶部约 +1.5A / 底部约 -1.2A）。
    // 改为 top = bottom = 0.1：数据映射上下镜像对称，首尾刻度反推值绝对值严格相等，
    // 同时柱体上下各留 10% 边距（不贴边、视觉更均匀）。
    this.chart.priceScale('left', 5).applyOptions({
      scaleMargins: { top: 0.1, bottom: 0.1 },
    })
    // pane5 刻度对称锚点 series（不可见）：全部时间点交替 ±absMax，
    // 使任意可视窗口都含正 / 负锚点 → autoScale 并集恒为对称 [-absMax, +absMax]，
    // 0 值线固定不漂移（数据由 rebuildData 同步更新）
    this.indicatorScaleAnchorSeries = this.chart.addSeries(
      LineSeries,
      {
        priceScaleId: 'left',
        // 全透明不可见（仅撑 scale 值域）：1px 背景色线在 normal 层也会与自绘内容
        // 叠加产生遮挡，统一用透明色（见 invisibleSeriesColor 说明）
        color: invisibleSeriesColor,
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
        getFixedMiddleValue: () => (isZeroCenteredSubIndicator(this.activeSubIndicator ?? '') ? 0 : undefined),
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
    // pane5 指标线：IndicatorLinePrimitive 自绘（zOrder 'top' → 十字星之上，
    // 与 pane3 成交量均量线一致：指标线完整可见、不被十字星横线遮挡；
    // MACD 红绿柱（MacdBarPaneView 'normal'）仍在十字星之下，十字星穿过柱区可见）
    this.subIndicatorLinePrimitive = new IndicatorLinePrimitive(
      () => ({
        lines: this.subIndicatorLines,
        getTimeScale: () => this.chart.timeScale(),
        anchorSeries: () => this.indicatorsBarSeries!,
      }),
    )
    this.indicatorsBarSeries.attachPrimitive(this.subIndicatorLinePrimitive)
    // pane5 十字星竖线底部补齐（见 CrosshairLineCapPrimitive：填虚线最后空白段）
    this.indicatorsBarSeries.attachPrimitive(this.createCrosshairLineCap())
  }

  /**
   * 十字星竖线底部补齐 primitive（pane4 / pane5 各挂一个）：
   * 填库 LargeDashed 竖线因 pane 高度非虚线周期整数倍产生的底部空白段，
   * 使竖线视觉到底（见 CrosshairLineCapPrimitive 头注释）。
   * 颜色 / 时间 / x 全部动态获取（主题切换、十字星移动即时生效）。
   */
  private createCrosshairLineCap = (): CrosshairLineCapPrimitive =>
    new CrosshairLineCapPrimitive({
      getOverlayTime: this.getOverlayTime,
      getTimeScale: () => this.chart.timeScale(),
      getLineColor: () => themeColors(this.getTheme()).crosshairLineColor,
    })

  /** 关闭指标层：移除 pane4 / pane5 并清空相关 series 引用（防内存泄漏）。
   *  库 removePane 从 panes 数组 splice，pane 上 series（含 primitive）的强引用
   *  随之断开可被 GC；管理器再置 null 解除自身引用，保证反复开 / 关无泄漏。
   *  removePane(4) 两次：删 pane4 后原 pane5 顺移到 index 4，再删一次即移除整组。 */
  private removePanes = (): void => {
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
  private rebuildData = (): void => {
    if (this.indicatorsBarSeries === null) return
    const name = this.activeSubIndicator
    if (name === null) return
    // 东财指标库：calcSubIndicators 返回十指标全量 Record，取当前选中指标的分组线
    const lines = calcSubIndicators(this.getBars())[name]
    if (lines.length === 0 || lines[0].length === 0) return
    const colors = subIndicatorColors[name]
    // pane5 线缓存（IndicatorLinePrimitive 自绘现取；线色 = subIndicatorColors 对应下标）
    // MACD：只画 DIF / DEA 两条线，MACD 柱（第三条）由 MacdBarPrimitive 红绿柱自绘，
    // 不再画线（避免柱与线重复叠加）；其余指标全部线型绘制。
    const lineCount = name === 'macd' ? Math.min(2, lines.length) : lines.length
    this.subIndicatorLines = lines.slice(0, lineCount).map((points, index) => ({
      color: colors[index] ?? colors[0],
      points,
    }))
    // Y 轴锚点：不可见 Histogram setData 以第 0 条线为骨架，
    // 首 / 尾两点替换为全部线的最大 / 最小值 → scale 值域覆盖全部线（正负双方向），
    // 避免中间极值线超出 Y 轴被裁剪
    const allValues = lines.flat().map((point) => point.value)
    // 0 对称指标（MACD / CCI）特殊：MACD 首根 DIF/DEA/柱 = 0（EMA 首日以收盘起步）
    // 且柱以 0 轴为正负分界，若全正 / 全负值域不含 0 → 首根（0 值）线起点与柱被
    // priceToCoordinate 判 null 裁剪（"第一个数据不渲染"）；CCI 以 0 为自然中心。
    // 统一处理：强制 scale 覆盖 0 且对称（见下方）。
    // 其他指标（OBV 等累计值）按实际值域，避免 0 拉宽 scale 压缩图形。
    const forceZero = isZeroCenteredSubIndicator(name)
    // 单趟扫描极值（数据量小；用循环避免 spread 大数组栈风险）
    let maxValue = -Infinity
    let minValue = Infinity
    for (const value of allValues) {
      if (value > maxValue) maxValue = value
      if (value < minValue) minValue = value
    }
    if (forceZero) {
      // 0 对称指标刻度对称：Y 轴以 0 为对称中心，左刻度最大值与最小值绝对值相等
      // （|max| = |min| = 全量极值绝对值的最大值；如 MACD DIF 最大 2.1 / 柱最小 -1.3
      //  → 刻度范围 [-2.1, +2.1]；CCI 同理，±值镜像对齐）
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
  rebuildDataIfOpen = (): void => {
    if (this.indicatorsBarSeries !== null) {
      this.rebuildData()
    }
  }

  /* ===================== 主题同步（applyTheme 调用） ===================== */

  /** 主题切换后同步指标相关颜色（数据不变，仅换色 + 触发重绘）。
   *  锚点 series 保持全透明（仅建 scale，不可见不覆盖）；
   *  可见柱体由 MacdBarPrimitive 动态取新主题色。 */
  updateThemeColors = (themeColorSet: ChartThemeColors): void => {
    this.indicatorsBarSeries?.applyOptions({ color: invisibleSeriesColor })
    this.indicatorScaleAnchorSeries?.applyOptions({ color: invisibleSeriesColor })
  }

  /* ===================== 信息行分段文字 ===================== */

  /**
   * 构建 pane4 指标信息行分段（所选附图指标各线数值，label + 线色，随十字星命中 bar /
   * 最新 bar）；指标层关闭（pane4 已移除）时不会被调用。
   * 分段间距与 pane2 成交量信息行一致：后续段前导 1 空格
   * （InfoLabelPaneView 按 measureText 无缝拼接，间距完全由文本决定）。
   * MACD 三段：DIF / DEA / MACD 柱值（柱值文本色取 subIndicatorColors.macd[2]）。
   */
  buildInfoSegments = (): TextSegment[] => {
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
