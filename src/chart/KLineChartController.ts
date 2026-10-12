/**
 * KLineChartController.ts —— 顶部空 Pane + K 线控制器（v1.4.3）
 *
 * 布局：一个 chart 内 2 个 Pane（lightweight-charts 原生多 Pane）：
 *   pane0：顶部空 Pane（无数据，仅自绘"测试"文字，固定高度 24px，不可拖拽）
 *   pane1：K 线主图（Candlestick，红涨绿跌，上涨柱体空心）
 *
 * 模块划分（v1.4.3，每个 class 一个文件）：
 *  - layout.ts：布局常量（paneCount / topPaneHeight / timeAxisHeight）与
 *    高度算法 calcFixedTopFactor；
 *  - TestLabelPrimitive.ts：顶部空 Pane"测试"文字 primitive；
 *  - TestLabelPaneView.ts：文字渲染视图（renderer）。
 *
 * 高度算法：
 *   可用高度 = 容器高度 - 时间轴高度（显示时）
 *   pane0 stretchFactor : pane1 stretchFactor = 24 : (可用高度 - 24)
 *   （pane1 的 stretchFactor 固定为 1，pane0 按比例折算）
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
  LineSeries,
  ColorType,
  CrosshairMode,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { themeColors, chartFontFamily, type ChartThemeName } from './theme'
import { genMockBars, type BasicBar } from './mock'
import { timeAxisHeight, topPaneHeight, calcFixedTopFactor } from './layout'
import { TestLabelPrimitive } from './TestLabelPrimitive'

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

  /* ===== series（pane0 空线 = 文字载体；pane1 K 线） ===== */
  private klineSeries: ISeriesApi<'Candlestick'>

  /* ===== 状态 ===== */
  private theme: ChartThemeName
  private timeAxisVisible = true

  /** 容器尺寸监听：尺寸变化时重算 pane0 固定高度（24px） */
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

    /* ---------- 4. 高度分配：pane0 固定 24px，pane1 占剩余 ---------- */
    this.applyStretchFactors()

    /* ---------- 5. 数据 + 首绘 ---------- */
    this.bars = genMockBars(120)
    this.applyData()
    this.chart.timeScale().fitContent()

    /* ---------- 6. 容器尺寸监听：重算 pane0 固定高度（24px） ---------- */
    this.resizeObserver = new ResizeObserver(() => this.applyStretchFactors())
    this.resizeObserver.observe(this.container)
  }

  /* ===================== 布局 ===================== */

  /** 重算 pane 高度：pane0 = 24px（stretchFactor 按可用高度折算），pane1 占剩余 */
  private applyStretchFactors = (): void => {
    const panes = this.chart.panes()
    if (panes.length < 2) return
    // 可用高度 = 容器高度 - 时间轴高度（显示时，v5 时间轴高度固定常量）
    const availableHeight = this.container.clientHeight - (this.timeAxisVisible ? timeAxisHeight : 0)
    panes[0].setStretchFactor(calcFixedTopFactor(availableHeight, topPaneHeight))
    panes[1].setStretchFactor(1)
  }

  /* ===================== 数据 ===================== */

  /** K 线数据写入 */
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

  /** 时间轴开关：显隐时间轴并重算 pane 高度（时间轴高度释放 / 占用） */
  toggleTimeAxis = (visible: boolean): void => {
    if (this.timeAxisVisible === visible) return
    this.timeAxisVisible = visible
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
