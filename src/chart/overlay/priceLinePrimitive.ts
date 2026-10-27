// priceLinePrimitive.ts —— 最后价线自绘 primitive。
// 背景：库原生 priceLine 只有两种锚定——
//  - PriceLineSource.LastBar：锚定"真实最后 bar"，价格 = 最新价，但左移看历史
//    时最后 bar 移出视口 → 价格线消失（用户最早反馈"不操作一会就没了"）；
//  - PriceLineSource.LastVisible：锚定"视口内最后可见 bar"，左移时可见，
//    但显示的是历史价格，"最后价"语义失真。
//
// 本 primitive 实现用户期望的第三种行为（东方财富 / 通达信风格）：
//  - 价格 = 真实最后 bar 的 close（最新价，语义正确）；
//  - 横虚线横贯主图全宽，不锚定具体 bar → 任何视口位置（含左移看历史 /
//    实时追加）都持续可见。
//
// 渲染：横虚线（1px，原生涨跌色——最后 bar close vs preClose：红涨 / 绿跌 /
// 平盘深系白·浅系黑）+ 右缘内侧价格标签（线色背景 + 自动黑白对比文字），
// 每次 draw 现取最后 close / 涨跌色 —— 实时更新、主题切换无需额外刷新。
import {
  type IPrimitivePaneView,
  type ISeriesApi,
  type ISeriesPrimitive,
  type Time,
} from 'lightweight-charts'
import type { ChartDataPoint } from '../../types/chart'
import { PriceLinePaneView } from './priceLinePaneView'

/** 收窄后的最后 K 线 bar（仅价格与昨收，供价格线取值）。 */
export interface LastKlineBar {
  /** 最后 K 线 bar 收盘价。 */
  close: number
  /** 最后 K 线 bar 昨收价（涨跌色判断基准）。 */
  preClose: number
}

/**
 * 逆序查找真实最后 K 线 bar（过滤分时点；K 线模式全部为 kline 点）。
 *
 * @remarks
 * 抽成纯函数便于单元测试（见 tests/priceLine.test.ts）。
 *
 * @param bars 当前全部数据点。
 * @returns 收窄后的最后 K 线 bar；无 kline 点（如分时模式）时返回 undefined。
 */
export const findLastKlineBar = (bars: ChartDataPoint[]): LastKlineBar | undefined => {
  for (let i = bars.length - 1; i >= 0; i--) {
    const bar = bars[i]
    if (bar.pointType === 'kline' && typeof bar.close === 'number') {
      return { close: bar.close, preClose: bar.preClose }
    }
  }
  return undefined
}

/** 最后价线 primitive 配置。 */
export interface PriceLinePrimitiveConfig {
  /** 真实最后 bar close 获取器（draw 现取 —— 实时 update 追加后自动跟随最新价）。 */
  getLastClose: () => number | null
  /** 价格线颜色获取器（原生涨跌色：红涨 / 绿跌 / 平盘色，draw 现取跟随主题）。 */
  getColor: () => string
  /** 所属 series（priceToCoordinate 反算价格线 y 坐标）。 */
  series: ISeriesApi<'Candlestick'>
}

/**
 * 最后价线自绘 primitive。
 *
 * @remarks
 * 价格 = 真实最后 bar close，横虚线横贯主图全宽 → 任何视口位置都持续可见
 *（左移看历史 / 实时追加）；右缘价格标签线色背景 + 自动黑白对比文字。
 */
export class PriceLinePrimitive implements ISeriesPrimitive<Time> {
  /** 自绘配置（只读）。 */
  public readonly config: PriceLinePrimitiveConfig

  /** 是否显示（由 KLineChartOptions.priceLineVisible / 组件 props 控制；draw 现取）。 */
  private visibleValue = true

  /** 渲染视图（单例：构造时创建一次，paneViews 每次返回同一实例，避免每帧重复创建对象）。 */
  private readonly paneView: PriceLinePaneView

  constructor(config: PriceLinePrimitiveConfig) {
    this.config = config
    this.paneView = new PriceLinePaneView(this)
  }

  /** 当前可见状态（供 paneView draw 判断）。 */
  get visible(): boolean {
    return this.visibleValue
  }

  /** 显隐开关（组件 / controller 调用；调用方切换后触发一次重绘立即生效）。 */
  setVisible = (visible: boolean): void => {
    this.visibleValue = visible
  }

  /** pane 视图（默认 zOrder：series 层，与库 priceLine 同级）。 */
  paneViews = (): readonly IPrimitivePaneView[] => {
    return [this.paneView]
  }
}
