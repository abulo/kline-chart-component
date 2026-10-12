/**
 * KLineChartController.ts —— 单 Pane K 线控制器（v1.2.1）
 *
 * 布局：一个 chart 内 1 个 Pane（lightweight-charts 原生多 Pane 的 pane0）：
 *   pane0：K 线主图（Candlestick）
 *
 * v1.2.1 变更（清理未使用参数）：
 *  - 删除 KLineChartOptions.symbol / _symbol（存入后从未读取）；
 *  - 删除 _resizeObserver（autoSize 已由库处理，空监听无实际功能）；
 *  - 删除 layout.panes 配置（单 Pane 无 pane 分隔线，参数无渲染效果）；
 *  - 删除 crosshair.mode（0 为库默认值）与 timeScale.timeVisible/secondsVisible
 *    （false 为库默认值），保留有实际效果的 borderVisible: false；
 *  - 删除无调用者的 getter（chart / theme / timeAxisVisible）与
 *    _timeAxisVisible 冗余状态，toggleTimeAxis 直接应用库选项。
 *
 * 全局控制（全部由 App.vue 提供按钮）：
 *  - 时间轴开关：控制底部时间轴（timeScale）显示 / 隐藏；
 *  - 放大 / 缩小：全局 timeScale.barSpacing（图表内禁用滚轮/触摸缩放）；
 *  - 风格切换：深系 / 浅系。
 *
 * 生命周期：实例保护（container dataset 标记防重复创建 chart）；
 * destroy 销毁（防内存泄漏）。
 */

import {
  createChart,
  CandlestickSeries,
  ColorType,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { themeColors, CHART_FONT_FAMILY, type ChartThemeName } from './theme'
import { genMockBars, type BasicBar } from './mock'

/** 控制器选项 */
export interface KLineChartOptions {
  /** 图表挂载容器（需有确定宽高） */
  container: HTMLElement
}

/** Pane 总数（仅 K 线主图） */
export const PANE_COUNT = 1

export class KLineChartController {
  /* ===== 图表 / 容器 ===== */
  private readonly _chart: ReturnType<typeof createChart>
  private readonly _container: HTMLElement

  /* ===== 数据 ===== */
  private readonly _bars: BasicBar[]

  /* ===== series（仅 K 线） ===== */
  private _klineSeries: ISeriesApi<'Candlestick'>

  /* ===== 当前主题 ===== */
  private _theme: ChartThemeName

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

    /* ---------- 2. K 线主图（红涨绿跌；上涨柱体空心） ----------
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
      0,
    )

    /* ---------- 3. 数据 + 首绘 ---------- */
    this._bars = genMockBars(120)
    this._applyData()
    this._chart.timeScale().fitContent()
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

  /** 时间轴开关：底部时间轴显示 / 隐藏（库 timeScale.visible 支持） */
  toggleTimeAxis = (show: boolean): void => {
    this._chart.timeScale().applyOptions({ visible: show })
  }

  /** 销毁：移除 chart / 清除实例标记（防内存泄漏） */
  destroy = (): void => {
    this._chart.remove()
    this._container.dataset.lwcMounted = 'false'
  }
}
