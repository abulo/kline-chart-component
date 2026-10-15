/**
 * crosshairManager.ts —— 十字星管理器（v1.4.73 拆分自 KLineChartController.ts）
 *
 * 职责：十字星移动联动（订阅 / 退订 + 回调处理）：
 *  - pane0 内不触发十字星（清除十字星位置，十字星仅可在 pane1 ~ pane5 触发）；
 *  - 命中内容 Pane（pane1 / pane3 / pane5）时，向 CrosshairAxisLabelPrimitive
 *    注入横线本地 y，在左刻度区自绘指示值（横线所在价格 / 成交量 / 指标值）；
 *  - 未命中 / 离开图表：overlayTime 置 null（信息行回退最新 bar）+ 清空全部指示值。
 *
 * 对外暴露：
 *  - getOverlayTime：pane0 / pane2 / pane4 信息行"时间同源"取值（命中 bar / 最新 bar）；
 *  - registerPrimitive / removeByPaneIndex：十字星指示值 primitive 注册表
 *    （pane1 / pane3 由控制器构建 Pane 时注册；pane5 由 IndicatorManager 注册 /
 *     指标层关闭时按 pane 下标移除）。
 */
import { type MouseEventParams } from 'lightweight-charts'
import { CrosshairAxisLabelPrimitive } from '../crosshair/crosshairAxisLabelPrimitive'

/** 十字星管理器构造依赖 */
export interface CrosshairManagerDeps {
  /** chart 实例（subscribe / unsubscribeCrosshairMove、clearCrosshairPosition） */
  chart: ReturnType<typeof import('lightweight-charts').createChart>
}

export class CrosshairManager {
  /** 依赖（构造注入，只读） */
  private readonly chart: CrosshairManagerDeps['chart']

  /** 十字星当前命中的 bar 时间（null = 未命中 → 信息行显示最新 bar） */
  private overlayTime: number | null = null

  /** 十字星左刻度指示值 primitive 注册表（pane1 / pane3 / pane5 各一个） */
  private crosshairAxisLabelPrimitives: CrosshairAxisLabelPrimitive[] = []

  /* ---------- 十字星 move rAF 节流（性能，v1.5.9） ----------
   * 拖拽平移 / 快速 mousemove 时 crosshairMove 触发频率可能远高于帧率，
   * 每次回调 setCrosshairY → requestUpdate → 库 fullUpdate 全图重绘 → 卡顿。
   * 用 requestAnimationFrame 合并：同帧内多次 move 只处理最后一次，每帧最多一次重绘。
   */
  /** 待处理的最新 move 参数（节流窗口内合并） */
  private pendingParam: MouseEventParams | null = null
  /** 是否已调度下一帧处理（true = 帧内合并中） */
  private frameScheduled = false

  constructor(deps: CrosshairManagerDeps) {
    this.chart = deps.chart
    this.chart.subscribeCrosshairMove(this.handleCrosshairMove)
  }

  /** 注册十字星指示值 primitive（pane1 / pane3 由控制器、pane5 由 IndicatorManager 调用） */
  registerPrimitive = (primitive: CrosshairAxisLabelPrimitive): void => {
    this.crosshairAxisLabelPrimitives.push(primitive)
  }

  /** 按 pane 下标移除（指标层关闭时移除 pane5 的指示值 primitive，防泄漏 / 防对已销毁 series 注入） */
  removeByPaneIndex = (paneIndex: number): void => {
    this.crosshairAxisLabelPrimitives = this.crosshairAxisLabelPrimitives.filter(
      (primitive) => primitive.config.getPaneIndex() !== paneIndex,
    )
  }

  /** 十字星当前时间（null = 未命中；IndicatorManager 构建 pane0/2/4 信息行取值） */
  getOverlayTime = (): number | null => this.overlayTime

  /** 十字星移动订阅入口：rAF 节流合并（每帧最多处理一次，防拖拽平移卡顿） */
  private handleCrosshairMove = (param: MouseEventParams): void => {
    this.pendingParam = param
    if (this.frameScheduled) return
    this.frameScheduled = true
    requestAnimationFrame(() => {
      this.frameScheduled = false
      if (this.pendingParam !== null) this.applyCrosshairMove(this.pendingParam)
    })
  }

  /**
   * 十字星移动处理（每帧至多一次）：pane0 清除十字星；内容 Pane 注入左刻度指示值。
   *  - pane0 内不触发十字星（库十字星由内部 mousemove 驱动，此回调与库 set
   *    同帧执行，同一次 invalidate 重绘，视觉上 pane0 内十字星不出现）；
   *  - 命中内容 Pane：point.y 相对"十字星当前所在 pane 的 canvas"（数据区本地坐标），
   *    因此 point.y 即为该 pane 内的本地 y，无需再减去前序 pane 高度和；
   *  - 十字星离开图表 / 命中非内容 Pane 时，全部指示值置 null（清除残留）。
   */
  private applyCrosshairMove = (param: MouseEventParams): void => {
    const point = param.point
    // pane0 内不触发十字星（库十字星由内部 mousemove 驱动，此回调与库 set
    // 同帧执行，同一次 invalidate 重绘，视觉上 pane0 内十字星不出现）
    if (param.paneIndex === 0) {
      this.chart.clearCrosshairPosition()
    }
    if (!point || param.paneIndex === undefined) {
      // 未命中（鼠标离开图表 / pane0 内）：pane0 时间回退到最新 bar 日期，
      // 并清除各 pane 指示值
      this.overlayTime = null
      for (const primitive of this.crosshairAxisLabelPrimitives) {
        primitive.setCrosshairY(null)
      }
      return
    }
    // 十字星命中（pane1/3/5）：pane0 时间跟随命中 bar 的日期。
    // 库 crosshairMove 事件本身会触发重绘，pane0 draw 现取 overlayTime 即时更新
    this.overlayTime = (param.time as number | undefined) ?? null
    // 库 MouseEventParams.point 相对"十字星当前所在 pane 的 canvas"（数据区本地坐标），
    // 因此 point.y 即为该 pane 内的本地 y，无需再减去前序 pane 高度和
    const localY = point.y
    for (const primitive of this.crosshairAxisLabelPrimitives) {
      // 仅向十字星命中的 pane 注入（其他 pane 清除，避免残留旧指示值）
      primitive.setCrosshairY(
        primitive.config.getPaneIndex() === param.paneIndex ? localY : null,
      )
    }
  }

  /** 销毁：退订十字星监听 + 取消待处理帧 + 清空指示值 primitive 引用（防内存泄漏） */
  destroy = (): void => {
    this.chart.unsubscribeCrosshairMove(this.handleCrosshairMove)
    this.pendingParam = null
    this.frameScheduled = false
    this.crosshairAxisLabelPrimitives = []
    this.overlayTime = null
  }
}
