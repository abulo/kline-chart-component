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
import { CrosshairTooltip, type TooltipBounds } from '../crosshair/crosshairTooltip'
import type { ChartDataPoint } from '../../types/chart'

/** 十字星管理器构造依赖 */
export interface CrosshairManagerDeps {
  /** chart 实例（subscribe / unsubscribeCrosshairMove、clearCrosshairPosition） */
  chart: ReturnType<typeof import('lightweight-charts').createChart>
  /** 十字星数据浮层（命中显示九项数据 / 离开隐藏，v1.6.35） */
  tooltip: CrosshairTooltip
  /** 命中 bar 数据源（按 time 取整根 K 线：OHLC + 量额 + 昨收） */
  getBarByTime: (time: number) => ChartDataPoint | undefined
  /** 指定 pane 顶部 y（相对图表容器；tooltip 默认取 pane1 角落定位） */
  getPaneTop: (paneIndex: number) => number
  /** 时间文本（按 pane0 信息行同款格式：format 模板或按周期自动） */
  getTimeText: (time: number) => string
  /** 图表容器宽度（px；进入方向判定：鼠标 x < 宽/2 → 左进入，v1.6.36） */
  getWidth: () => number
  /** pane1~pane5 可移动 / 可拖动区域（相对容器；默认位置与拖动 clamp 边界，
   *  扣除左右刻度区宽，刻度开关变化时随每次 show 重新注入，v1.6.58） */
  getTooltipBounds: () => TooltipBounds
}

export class CrosshairManager {
  /** 依赖（构造注入，只读） */
  private readonly deps: CrosshairManagerDeps
  /** chart 实例（退订 / 清除十字星） */
  private readonly chart: CrosshairManagerDeps['chart']

  /** 十字星当前命中的 bar 时间（null = 未命中 → 信息行显示最新 bar） */
  private overlayTime: number | null = null

  /** 十字星左刻度指示值 primitive 注册表（pane1 / pane3 / pane5 各一个） */
  private crosshairAxisLabelPrimitives: CrosshairAxisLabelPrimitive[] = []
  /** 当前进入方向（鼠标从图表左 / 右侧进入；tooltip 角落定位基准，v1.6.36） */
  private entrySide: 'left' | 'right' = 'left'
  /** 上一帧是否命中（false → 本次为"再次进入"，按鼠标 x 重判进入方向） */
  private wasHit = false

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
    this.deps = deps
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

  /**
   * 键盘移动十字星全链路同步（v1.7.1）：`chart.setCrosshairPosition` 触发的
   * crosshairMove 事件经 rAF 节流在**下一帧**才处理（applyCrosshairMove）——
   * 同帧内 cap 竖线仍以旧 overlayTime 绘制（"两条竖线"）、tooltip 数据浮层仍显示
   * 旧 bar（数据更新延迟），快速连发按键时持续滞后。
   * 控制器在 setCrosshairPosition 后同步调用本方法，立即对齐三处联动：
   *  1. overlayTime（cap 竖线 / pane0 信息行与库竖线同帧对齐）；
   *  2. tooltip 数据浮层（bar / 时间文本即时刷新；frozen 选中文字期间仍跳过）；
   *  3. 左刻度指示值（键盘定位横线在主 series（pane1）的 close/price 价，
   *     仅注入 pane1，其余 pane 清除 —— 与鼠标命中"仅命中 pane"语义一致）。
   * 随后 rAF 事件处理写入相同数据，无副作用。
   *
   * @param bar            命中 bar（数据浮层数据源）
   * @param hitTime        目标 bar 时间（秒级）
   * @param pane1LocalY    横线在 pane1 的本地 y（主 series priceToCoordinate，
   *                       库 set 后下一帧事件会写入相同值）
   */
  syncKeyboardMove = (bar: ChartDataPoint, hitTime: number, pane1LocalY: number | null): void => {
    this.overlayTime = hitTime
    // 从无十字星状态键盘激活（上帧未命中）：默认左进入（tooltip 右上角，v1.6.36 语义）；
    // 鼠标已命中（wasHit=true）时沿用鼠标进入方向，键盘移动不重置角落方向
    if (!this.wasHit) {
      this.entrySide = 'left'
    }
    this.wasHit = true
    this.deps.tooltip.show({
      entrySide: this.entrySide,
      // 默认固定在 pane1（K 线主图）的角落，不随命中 pane 变化（v1.6.37）
      paneTop: this.deps.getPaneTop(1),
      // 可移动 / 可拖动区域：pane1~pane5 数据区（左右刻度开关打开时自动收窄）
      bounds: this.deps.getTooltipBounds(),
      bar,
      timeText: this.deps.getTimeText(hitTime),
    })
    for (const primitive of this.crosshairAxisLabelPrimitives) {
      primitive.setCrosshairY(primitive.config.getPaneIndex() === 1 ? pane1LocalY : null)
    }
  }

  /** 十字星移动订阅入口：rAF 节流合并（每帧最多处理一次，防拖拽平移卡顿） */
  private handleCrosshairMove = (param: MouseEventParams): void => {
    // v1.7.1 同步先更新 overlayTime（廉价字段赋值，不触发重绘）：库十字星 time
    // 变化（键盘 / 拖拽平移 / 缩放）时，pane0 信息行 / 左刻度指示值 / tooltip 数据
    // **同帧**取到新 time —— 消除 rAF 节流导致的一帧延迟（pane0 时间 / 指示值滞后）。
    // 与 applyCrosshairMove 同口径：pane0 / 未命中 → null；
    // 鼠标悬停在数据浮层上（tooltip.isHovered，浮层上选中文字期间）保持原值不清除。
    if (param.point && param.paneIndex !== undefined && param.paneIndex !== 0) {
      this.overlayTime = (param.time as number | undefined) ?? null
    } else if (!this.deps.tooltip.isHovered) {
      this.overlayTime = null
    }
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
      // pane0 内不触发十字星：清除十字星 + 隐藏浮层后**直接返回**（v1.6.39 修复：
      // 原实现缺少 return，pane0 内每帧 hide 后继续走命中逻辑 show →
      // tooltip 高频闪烁，且 display 切换销毁文字选区导致无法选中）
      this.chart.clearCrosshairPosition()
      this.overlayTime = null
      this.wasHit = false
      this.deps.tooltip.hide()
      for (const primitive of this.crosshairAxisLabelPrimitives) {
        primitive.setCrosshairY(null)
      }
      return
    }
    if (!point || param.paneIndex === undefined) {
      // 未命中（鼠标离开图表 / pane0 内）：pane0 时间回退到最新 bar 日期，
      // 清除各 pane 指示值 + 隐藏数据浮层（隐藏解除 tooltip 拖动固定，下次进入重定位）
      //
      // **hovered 守卫（v1.6.48，修复"tooltip 无法选中"根因）**：浮层挂 body
      // （图表 DOM 外），鼠标移入浮层时库向图表容器派发 mouseleave → 清除十字星 →
      // crosshairMove(null) 走到此分支。若直接 hide，浮层在按下选中前就消失。
      // 鼠标仍悬停在浮层上（isHovered）时跳过 hide / 回退 / 清指示值，保持浮层
      // 与 pane0 时间，文字选区可正常进行。
      if (this.deps.tooltip.isHovered) {
        return
      }
      this.overlayTime = null
      this.wasHit = false
      this.deps.tooltip.hide()
      for (const primitive of this.crosshairAxisLabelPrimitives) {
        primitive.setCrosshairY(null)
      }
      return
    }
    // 十字星命中（pane1/3/5）：pane0 时间跟随命中 bar 的日期。
    // 库 crosshairMove 事件本身会触发重绘，pane0 draw 现取 overlayTime 即时更新
    this.overlayTime = (param.time as number | undefined) ?? null
    // 命中时更新数据浮层（时间按 pane0 格式；取不到 bar 则隐藏防残留）：
    //  - "再次进入"（上帧未命中）时按鼠标 x 判定进入方向（左/右半区）；
    //  - 进入方向仅决定角落初始位置；用户拖动后由 tooltip 内部固定，不覆盖。
    const hitTime = this.overlayTime
    if (hitTime !== null) {
      const bar = this.deps.getBarByTime(hitTime)
      if (bar) {
        if (!this.wasHit) {
          const width = this.deps.getWidth()
          this.entrySide = point.x < width / 2 ? 'left' : 'right'
        }
        this.wasHit = true
        this.deps.tooltip.show({
          entrySide: this.entrySide,
          // 默认固定在 pane1（K 线主图）的角落，不随命中 pane 变化（v1.6.37）
          paneTop: this.deps.getPaneTop(1),
          // 可移动 / 可拖动区域：pane1~pane5 数据区（左右刻度开关打开时自动收窄）
          bounds: this.deps.getTooltipBounds(),
          bar,
          timeText: this.deps.getTimeText(hitTime),
        })
      } else {
        this.deps.tooltip.hide()
      }
    }
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
