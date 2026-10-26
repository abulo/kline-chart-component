/**
 * crosshairLinePrimitive.ts —— 十字星竖线 / 横线自绘 primitive（v1.7.6，v1.7.7 修正重绘时机）
 *
 * 背景：库 crosshair 竖线为 pane 级默认绘制，存在两个缺陷（v1.7.5 排查结论）：
 *  1. 库竖线沿 pane 数据区绘制时，顶部 / 底部会随 bar 位置出现 13px 级空白段
 *     （与 pane 内内容区域裁剪 / top 层指标线（IndicatorLinePrimitive，zOrder 'top'）
 *     叠加相关），用户逐刻度移动十字星时感觉"竖线有些地方没渲染到、底部缺失"；
 *  2. 库竖线 alpha 0.25（后调 0.6）叠加在 MACD 红绿柱上对比度不足，视觉被"盖住"。
 *
 * v1.7.6 方案（用户确认"竖线被柱体盖住"为不满意点后实施）：series 级 primitive
 * （挂到各 pane 代表 series，zOrder 'top' **最后挂载**）→ 竖线贯穿 pane 全高、
 * 画在所有指标线 / 柱体 / K 线之上，任何位置无暗段 / 无缺口。
 *
 * v1.7.7 重绘时机修正（十字星快速移动跟随延迟）：竖线 setX 必须发生在
 * **库重绘之前**（crosshairMove 事件同步派发阶段当帧执行，见
 * CrosshairManager.handleCrosshairMove 提前同步）——库在 mousemove 后调度
 * rAF 重绘，本次重绘即用新 x 上屏，竖线与库横线同帧跟手；
 * 若在 rAF 节流回调（applyCrosshairMove）里 setX，则晚于库重绘一帧，
 * 且分时无后续重绘源 → 竖线停在旧值（v1.7.6 分时竖线不显示的根因）。
 * 无需额外 requestUpdate（ChartApi 无此方法，调用为 no-op）。
 *
 * v1.7.8 虚线（用户需求：十字星横竖线与价格线一致）：横线也改为自绘（库
 * horzLine 的 dash 由线宽派生 [2w, 2w]，无法表达价格线 [6, 4]）——每 pane
 * 独立 primitive 实例（构造注入 paneIndex），横线只在**十字星命中的 pane**
 * 绘制（与库行为一致：库 horzLine 仅命中 pane 可见），y 为命中 pane 的本地
 * 坐标；横竖线统一 `setLineDash([6, 4])`（与 priceLinePaneView 完全一致）。
 *
 * 性能：每帧至多一条 1px 竖线 + 一条 1px 横线（useMediaCoordinateSpace 单路径），
 * 开销可忽略；由 CrosshairManager 统一按 param.logical / point 分发坐标。
 */
import {
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type ISeriesPrimitive,
  type Time,
} from 'lightweight-charts'

/** 与最后价线（priceLinePaneView）一致的虚线样式：6px 线 / 4px 空 */
const CROSSHAIR_LINE_DASH = [6, 4]

/**
 * 自绘十字星横竖线 primitive（挂到每个 pane 的代表 series 上，zOrder 'top'）。
 * 每个 pane 一个实例（构造注入 paneIndex）：竖线全部 pane 绘制（同一 x，
 * 贯穿 pane 全高）；横线仅"命中 pane"绘制（该 pane 的本地 y）。
 */
export class CrosshairLinePrimitive implements ISeriesPrimitive<Time> {
  /** 所属 pane 索引（1 = 主图 / 2,4 = 信息行 / 3 = 成交量 / 5 = 指标；横线仅命中 pane 绘制） */
  readonly paneIndex: number

  /** 当前竖线 x（pane 本地坐标；null = 未命中 / 应隐藏） */
  private x: number | null = null

  /** 十字星横线在命中 pane 的本地 y（null = 未命中 / 不绘制） */
  private y: number | null = null

  /** 十字星当前命中的 pane 索引（仅 `paneIndex === activePaneIndex` 的实例画横线） */
  private activePaneIndex: number | null = null

  /** 竖线颜色（随主题切换，controller 在 setTheme 时调用 setColor 同步） */
  private color = 'rgba(149, 152, 161, 1)'

  constructor(paneIndex: number) {
    this.paneIndex = paneIndex
  }

  /** 更新竖线位置（null 清除 → 该帧不绘制） */
  setX = (x: number | null): void => {
    this.x = x
  }

  /**
   * 更新横线状态：命中 pane 的本地 y + 当前命中 pane 索引
   * （y 为 null 或本实例 paneIndex ≠ activePaneIndex → 不绘制横线）
   */
  setCrosshairY = (y: number | null, activePaneIndex: number | null): void => {
    this.y = y
    this.activePaneIndex = activePaneIndex
  }

  /** 更新竖线颜色（主题切换时同步） */
  setColor = (color: string): void => {
    this.color = color
  }

  /** 当前竖线位置（PaneView 现取） */
  getX = (): number | null => this.x

  /** 当前横线 y（PaneView 现取） */
  getY = (): number | null => this.y

  /** 当前命中 pane 索引（PaneView 现取，判定本 pane 是否画横线） */
  getActivePaneIndex = (): number | null => this.activePaneIndex

  /** 当前竖线颜色（PaneView 现取，主题切换时 setColor 更新） */
  getColor = (): string => this.color

  /** Pane 视图（单例：横竖线渲染视图） */
  paneViews = (): readonly IPrimitivePaneView[] => [new CrosshairLinePaneView(this)]
}

/** 横竖线渲染视图：zOrder 'top'，自绘 1px 虚线（[6,4]，与价格线一致） */
class CrosshairLinePaneView implements IPrimitivePaneView {
  /** 所属 primitive（取横竖线位置 / 颜色 / 命中状态） */
  private readonly source: CrosshairLinePrimitive

  constructor(source: CrosshairLinePrimitive) {
    this.source = source
  }

  /** 层级：'top' → 绘制在所有指标内容之上（后挂载保证同层内最后绘制） */
  zOrder = (): 'top' => 'top'

  /** 渲染器：一条竖线（贯穿 pane 全高）+ 一条横线（仅命中 pane，虚线样式） */
  renderer = (): IPrimitivePaneRenderer => ({
    draw: (target) => {
      const x = this.source.getX()
      const y = this.source.getY()
      const activePaneIndex = this.source.getActivePaneIndex()
      // 完全未命中（无竖线且本 pane 非命中 pane 或无横线 y）→ 跳过
      if (x === null && !(y !== null && activePaneIndex === this.source.paneIndex)) {
        return
      }
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        context.lineWidth = 1
        context.strokeStyle = this.source.getColor()
        // v1.7.8：横竖线统一虚线，与最后价线（priceLinePaneView）一致 6px 线 / 4px 空
        context.setLineDash(CROSSHAIR_LINE_DASH)
        // 竖线（所有 pane 绘制同一 x）
        // v1.7.12：以 bar 中心（浮点 x）为竖线**几何中心**绘制，不再 Math.round+0.5
        // 偏移——否则吸附时竖线整体右偏（如 bar 中心 291.57 → round 后 292.5，
        // 柱体宽 11 / 竖线宽 3 时竖线覆盖 293-296 而非柱体中心 (5,6,7)）。
        // 浮点坐标由 canvas 亚像素抗锯齿柔和处理，中心与柱体中心精确对齐。
        if (x !== null) {
          context.beginPath()
          context.moveTo(x, 0)
          context.lineTo(x, mediaSize.height)
          context.stroke()
        }
        // 横线（仅十字星命中的 pane；y 为该 pane 本地坐标，亚像素对齐）
        if (y !== null && activePaneIndex === this.source.paneIndex) {
          const py = Math.round(y) + 0.5
          context.beginPath()
          context.moveTo(0, py)
          context.lineTo(mediaSize.width, py)
          context.stroke()
        }
      })
    },
  })
}
