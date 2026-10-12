/**
 * KLineChartController.ts —— 顶部空 Pane + K 线控制器（v1.4.0）
 *
 * 布局：一个 chart 内 2 个 Pane（lightweight-charts 原生多 Pane）：
 *   pane0：顶部空 Pane（无数据，仅自绘"测试"文字，固定高度 24px，不可拖拽）
 *   pane1：K 线主图（Candlestick，红涨绿跌，上涨柱体空心）
 *
 * v1.4.0 变更：
 *  - 新增 pane0 顶部空 Pane："测试"文字（ISeriesPrimitive 自绘），
 *    垂直居中、距左 6px、高度固定 24px、Pane 高度不可拖拽（enableResize: false）；
 *  - 重新引入 ResizeObserver 与 _timeAxisVisible 状态，用于在容器尺寸 /
 *    时间轴开关变化时按绝对像素（24px）重算 pane0 的 stretchFactor。
 *
 * 高度算法（导出纯函数 calcFixedTopFactor 可单测）：
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
  type ISeriesPrimitive,
  type IPrimitivePaneView,
  type IPrimitivePaneRenderer,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { themeColors, CHART_FONT_FAMILY, type ChartThemeName } from './theme'
import { genMockBars, type BasicBar } from './mock'

/** 控制器选项 */
export interface KLineChartOptions {
  /** 图表挂载容器（需有确定宽高） */
  container: HTMLElement
}

/** Pane 总数（pane0 顶部空 Pane + pane1 K 线） */
export const PANE_COUNT = 2

/** 顶部空 Pane 固定高度（px） */
export const TOP_PANE_HEIGHT = 24

/** 底部时间轴高度（px）：lightweight-charts v5 时间轴高度固定（无公开 API），
 *  时间轴显示时从可用总高度中扣除 */
export const TIME_AXIS_HEIGHT = 28

/**
 * 计算顶部固定高度 Pane 的 stretchFactor（下方 Pane 的 stretchFactor 固定为 1）。
 * 使 pane0 实际高度 ≈ topHeight：factor / (factor + 1) × total = topHeight。
 * @param totalHeight 可用总高度（已扣除时间轴）
 * @param topHeight 顶部 Pane 目标高度
 * @returns pane0 的 stretchFactor（<=0 时返回 1 兜底，避免除零）
 */
export const calcFixedTopFactor = (totalHeight: number, topHeight: number): number => {
  const k = totalHeight - topHeight
  return k > 0 ? topHeight / k : 1
}

/* ===================== 顶部空 Pane 文字 primitive ===================== */

/**
 * TestLabelPrimitive —— 在 pane0 上自绘"测试"文字。
 * 通过 ISeriesPrimitive 挂载到空 series：paneViews 返回渲染器，
 * draw 时取 pane 内容区尺寸，文字垂直居中、距左 6px；
 * 颜色每次 draw 动态获取（跟随主题 textColor），主题切换无需额外刷新。
 */
class TestLabelPrimitive implements ISeriesPrimitive<Time> {
  private readonly _text: string
  private readonly _getColor: () => string

  constructor(text: string, getColor: () => string) {
    this._text = text
    this._getColor = getColor
  }

  /** 返回本 primitive 的 pane 视图（渲染器） */
  paneViews(): readonly IPrimitivePaneView[] {
    return [new TestLabelPaneView(this)]
  }
}

/** 空 Pane 文字视图：持有 primitive 引用，提供 renderer */
class TestLabelPaneView implements IPrimitivePaneView {
  private readonly _source: TestLabelPrimitive

  constructor(source: TestLabelPrimitive) {
    this._source = source
  }

  /** 渲染器：文字垂直居中、距左 6px（media 坐标系 = CSS 像素） */
  renderer(): IPrimitivePaneRenderer {
    return {
      draw: (target) => {
        // v5：draw 接收 CanvasRenderingTarget2D（fancy-canvas），
        // useMediaCoordinateSpace 为回调式 API，scope 提供 context 与 mediaSize
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          context.font = `12px ${CHART_FONT_FAMILY}`
          context.fillStyle = this._source['_getColor']()
          context.textBaseline = 'middle'
          context.fillText(this._source['_text'], 6, mediaSize.height / 2)
        })
      },
    }
  }
}

export class KLineChartController {
  /* ===== 图表 / 容器 ===== */
  private readonly _chart: ReturnType<typeof createChart>
  private readonly _container: HTMLElement

  /* ===== 数据 ===== */
  private readonly _bars: BasicBar[]

  /* ===== series（pane0 空线 = 文字载体；pane1 K 线） ===== */
  private _klineSeries: ISeriesApi<'Candlestick'>

  /* ===== 状态 ===== */
  private _theme: ChartThemeName
  private _timeAxisVisible = true

  /** 容器尺寸监听：尺寸变化时重算 pane0 固定高度（24px） */
  private _resizeObserver: ResizeObserver | null = null

  constructor(options: KLineChartOptions) {
    this._container = options.container
    this._theme = 'dark'

    /* ---------- 0. 实例保护：容器打标记防重复创建 chart 实例 ----------
     * 组件重复挂载 / HMR / 路由切换时可能再次进入构造；标记在 destroy 时清除，
     * 保证同一容器同一时刻只有一个 chart 实例（防止内存泄漏与布局错乱）。
     */
    if (this._container.dataset.lwcMounted === 'true') {
      throw new Error('KLineChartController: 容器已挂载 chart 实例，禁止重复创建')
    }
    this._container.dataset.lwcMounted = 'true'

    /* ---------- 1. 创建 chart ---------- */
    const c0 = themeColors(this._theme)
    this._chart = createChart(this._container, {
      autoSize: true, // 自动跟随容器尺寸
      layout: {
        background: { type: ColorType.Solid, color: c0.background },
        textColor: c0.textColor,
        fontSize: 12,
        fontFamily: CHART_FONT_FAMILY,
        attributionLogo: false,
        panes: {
          enableResize: false, // Pane 高度不可拖拽（由代码固定比例）
          // 分隔线颜色 = 背景色（视觉上不设置分割线）
          separatorColor: c0.background,
          separatorHoverColor: c0.background,
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
    this._chart.addSeries(
      LineSeries,
      {
        priceScaleId: 'left',
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      0,
    ).attachPrimitive(new TestLabelPrimitive('测试', () => themeColors(this._theme).textColor))

    /* ---------- 3. pane1：K 线主图（红涨绿跌；上涨柱体空心） ----------
     * 空心实现：上涨（up）柱体填充色 = 图表背景色（视觉空心），
     * 边框 / 影线保留红色；下跌（down）柱体绿色实心。
     */
    this._klineSeries = this._chart.addSeries(
      CandlestickSeries,
      {
        priceScaleId: 'left',
        upColor: c0.background, // 上涨柱体填充 = 背景色（空心）
        downColor: c0.downColor,
        borderUpColor: c0.upColor, // 上涨边框红色
        borderDownColor: c0.downColor,
        wickUpColor: c0.upColor, // 上涨影线红色
        wickDownColor: c0.downColor,
        priceLineVisible: false,
        lastValueVisible: false,
      },
      1,
    )

    /* ---------- 4. 高度分配：pane0 固定 24px，pane1 占剩余 ---------- */
    this._applyStretchFactors()

    /* ---------- 5. 数据 + 首绘 ---------- */
    this._bars = genMockBars(120)
    this._applyData()
    this._chart.timeScale().fitContent()

    /* ---------- 6. 容器尺寸监听：重算 pane0 固定高度（24px） ---------- */
    this._resizeObserver = new ResizeObserver(() => this._applyStretchFactors())
    this._resizeObserver.observe(this._container)
  }

  /* ===================== 布局 ===================== */

  /** 重算 pane 高度：pane0 = 24px（stretchFactor 按可用高度折算），pane1 占剩余 */
  private _applyStretchFactors = (): void => {
    const panes = this._chart.panes()
    if (panes.length < 2) return
    // 可用高度 = 容器高度 - 时间轴高度（显示时，v5 时间轴高度固定常量）
    const total = this._container.clientHeight - (this._timeAxisVisible ? TIME_AXIS_HEIGHT : 0)
    panes[0].setStretchFactor(calcFixedTopFactor(total, TOP_PANE_HEIGHT))
    panes[1].setStretchFactor(1)
  }

  /* ===================== 数据 ===================== */

  /** K 线数据写入 */
  private _applyData = (): void => {
    this._klineSeries.setData(
      this._bars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    )
  }

  /* ===================== 对外 API ===================== */

  /** 主题切换（深系 / 浅系）：不改变 X 轴视口 / 布局尺寸 */
  applyTheme = (name: ChartThemeName): void => {
    this._theme = name
    const c = themeColors(name)
    this._chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: c.background },
        textColor: c.textColor,
        panes: {
          // 分隔线颜色跟随背景（保持分割线不可见）
          separatorColor: c.background,
          separatorHoverColor: c.background,
        },
      },
      // 栅格保持关闭
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
    })
    // K 线换色（上涨柱体填充跟随背景色保持空心）
    this._klineSeries.applyOptions({
      upColor: c.background, // 空心填充 = 新主题背景色
      downColor: c.downColor,
      borderUpColor: c.upColor,
      borderDownColor: c.downColor,
      wickUpColor: c.upColor,
      wickDownColor: c.downColor,
    })
    // 空 Pane 文字颜色在 draw 时动态取色，applyOptions 触发重绘即自动更新
  }

  /** 放大（X 轴 barSpacing ×1.25，限幅） */
  zoomIn = (): void => {
    const ts = this._chart.timeScale()
    const bs = ts.options().barSpacing
    ts.applyOptions({ barSpacing: Math.min(bs * 1.25, 80) })
  }

  /** 缩小（X 轴 barSpacing ÷1.25，限幅） */
  zoomOut = (): void => {
    const ts = this._chart.timeScale()
    const bs = ts.options().barSpacing
    ts.applyOptions({ barSpacing: Math.max(bs / 1.25, 2) })
  }

  /** 时间轴开关：显隐时间轴并重算 pane 高度（时间轴高度释放 / 占用） */
  toggleTimeAxis = (show: boolean): void => {
    if (this._timeAxisVisible === show) return
    this._timeAxisVisible = show
    this._chart.timeScale().applyOptions({ visible: show })
    this._applyStretchFactors()
  }

  /** 销毁：移除监听 / chart / 清除实例标记（防内存泄漏） */
  destroy = (): void => {
    this._resizeObserver?.disconnect()
    this._resizeObserver = null
    this._chart.remove()
    this._container.dataset.lwcMounted = 'false'
  }
}
