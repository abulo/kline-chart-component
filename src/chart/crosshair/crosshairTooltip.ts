// crosshairTooltip.ts —— 十字星数据浮层。
// 职责：十字星命中时显示"时间 / 开盘 / 收盘 / 最高 / 最低 / 涨跌 / 涨幅 /
// 成交量 / 成交额"九项数据。
//
// 交互设计：
//  - 进入方向定位：鼠标从图表左半区进入 → 浮层固定在 pane 右上角；
//    从右半区进入 → pane 左上角（不随命中 pane 变化，默认 pane1 主图）；
//  - 文字可选中：浮层主体 userSelect: text 可自由选中 / 复制文字
//    （修复"无法选中"根因：鼠标移入浮层时图表 mouseleave → 未命中分支隐藏
//    浮层，以 isHovered 悬停守卫跳过 hide）；
//  - 拖动（按下即拖）：只要鼠标在 tooltip 任何位置按下即可拖动
//    （无 ≡ 手柄图标，grab 光标）——按下后位移 ≥ 4px 即拖动浮层（拖动期间
//    userSelect:none），松开后位置固定直到鼠标离开图表（hide 清除固定位，
//    再次进入重新角落定位）；无位移 = 点击（单击放光标 / 双击选词 / 三击
//    选行仍可用，与拖动互不冲突）；
//  - 鼠标离开图表再进入 → 按新进入方向重新定位。
//
// 防闪 / 防抖：
//  - 挂载图表容器内（position: absolute）——① 鼠标在浮层上时 mousemove
//    冒泡到图表容器 → 库继续收到事件，十字星持续跟手（修复"鼠标快速移动经过
//    tooltip 固定区域时十字星消失/延迟"：旧实现挂 body，浮层钉在数据区右上角，
//    指针移入浮层即脱离图表 DOM 树，库触发 mouseleave → 十字星清空，横扫图表
//    时竖线断开）；② 浮层随容器滚动 / 位移天然锚定，不再需要 scroll 补偿；
//  - 幂等显示：show 仅在 hidden → visible 时置 display / 测量尺寸 / 定位；
//    已显示时只更新文本，不再每帧重置 left/top、不再每帧强制 reflow；
//  - 等宽数字：font-feature-settings "tnum"，九行数值按位对齐；
//  - 第一行时间直显：首行不显示"时间"汉字标签，时间顶格直显；
//  - 选中冻结：mousedown → mouseup 期间暂停 show 内容更新，文字选区不被
//    textContent 变更破坏（兼容 Safari -webkit-user-select）；
//  - 阻止容器冒泡：浮层按下时 stopPropagation——库在 document 级监听 mousedown
//    （点击图表外 → 清十字星 → tooltip 隐藏），拦截后选中不再被中断。
//
// v1.7.7 事件转发（修复"鼠标快速移动经过 tooltip 时十字星消失/延迟"）：
// lightweight-charts 的十字星 mousemove 监听挂在各 Pane 的 top canvas
//（style.zIndex = '2'，图表内容层），tooltip 浮层（zIndex 9999）覆盖在其上时，
// 指针在浮层上的 mousemove 不会进入 canvas 事件流，且移入浮层触发 canvas
// mouseleave → 库清除十字星（竖线消失）。修复：浮层内 mousemove 时把事件
// 转发到鼠标所在 Pane 的 top canvas（合成 mouseenter 先重挂库的 mousemove
// 监听，再合成 mousemove 驱动十字星按坐标更新）——浮层全部既有功能
//（角落定位 / 文字选中 / 按下即拖）保持不变，十字星全程跟手。
import { formatPrice, formatVolume } from '../util/format'
import type { ChartThemeColors } from '../core/theme'
import type { ChartDataPoint } from '../../types/chart'

/** 浮层一行（label 左列 / value 右列；color 可选覆盖值颜色，如红涨绿跌）。 */
export interface TooltipRow {
  /** 左列标签（时间 / 开盘 / …）。 */
  label: string
  /** 右列数值文本。 */
  value: string
  /** 值颜色（undefined = 使用主题默认文字色）。 */
  color?: string
}

/** 涨跌着色参考色（红涨绿跌：upColor 红 / downColor 绿）。 */
export interface TooltipColors {
  /** 上涨色。 */
  up: string
  /** 下跌色。 */
  down: string
  /** 分时均价色（与均价线同色 timeshareAvgColor）。 */
  avg?: string
}

/**
 * 组装浮层行（纯函数，可单测；时间文本外部按 pane0 格式传入）。
 *
 * @remarks
 * - K 线点：时间 / 开盘 / 收盘 / 最高 / 最低 / 涨跌 / 涨幅 / 成交量 / 成交额（九行）；
 * - 分时点：时间 / 价格 / 均价 / 涨跌 / 涨幅 / 成交量 / 成交额
 *   （分时无 OHLC，价格替代开收盘、均价替代最高最低位，涨跌基准 = 昨收 preClose）。
 *
 * @param bar 命中的 K 线 / 分时点。
 * @param timeText 时间文本（已按 pane0 信息行格式格式化）。
 * @param colors 涨跌着色参考色（红涨绿跌 / 均价色）。
 * @param showVolume 成交量组关闭（volumeVisible=false）时隐藏 成交量 / 成交额 两行。
 * @param showAvg 均价线关闭（avgLineVisible=false）时隐藏 均价 行（分时专用）。
 * @returns 按显示顺序排列的浮层行。
 */
export const buildTooltipRows = (
  bar: ChartDataPoint,
  timeText: string,
  colors: TooltipColors,
  showVolume = true, // 成交量组关闭（volumeVisible=false）时隐藏 成交量 / 成交额 两行
  showAvg = true, // 均价线关闭（avgLineVisible=false）时隐藏 均价 行（分时专用）
): TooltipRow[] => {
  // 涨跌基准 = 昨收（preClose 缺失时回退开盘点 / 价格，兜底不抛错）。
  const isTimeshare = bar.pointType === 'timeshare'
  const preClose = bar.preClose ?? bar.open ?? bar.price ?? 0
  const price = isTimeshare ? bar.price : bar.close
  const change = (price ?? 0) - preClose
  const changePct = preClose > 0 ? (change / preClose) * 100 : 0
  const sign = change > 0 ? '+' : change < 0 ? '-' : ''
  const changeColor = change > 0 ? colors.up : change < 0 ? colors.down : undefined
  // 单值对比昨收着色：> preClose 红（up）、< preClose 绿（down）、相等中性。
  const colorByPreClose = (value: number | undefined): string | undefined => {
    if (value == null) return undefined
    if (value > preClose) return colors.up
    if (value < preClose) return colors.down
    return undefined
  }
  // 第一行时间直显（label 置空，show 时该行 label 列不占位）。
  if (isTimeshare) {
    // 分时：价格（着色）+ 均价（均价线同色 timeshareAvgColor）+ 涨跌 / 涨幅（着色）；
    // 成交量组关闭（showVolume=false）时隐藏 成交量 / 成交额 两行；
    // 均价线关闭（showAvg=false）时隐藏 均价 行（顺序：价格 / 均价 / 涨跌 / 涨幅）。
    const rows: TooltipRow[] = [
      { label: '', value: timeText },
      { label: '价格', value: formatPrice(bar.price), color: colorByPreClose(bar.price) },
    ]
    if (showAvg) {
      rows.push({ label: '均价', value: formatPrice(bar.avgPrice), color: colors.avg })
    }
    rows.push(
      { label: '涨跌', value: `${sign}${formatPrice(Math.abs(change))}`, color: changeColor },
      { label: '涨幅', value: `${sign}${Math.abs(changePct).toFixed(2)}%`, color: changeColor },
    )
    if (showVolume) {
      rows.push(
        { label: '成交量', value: formatVolume(bar.volume) },
        { label: '成交额', value: formatVolume(bar.amount) },
      )
    }
    return rows
  }
  const rows: TooltipRow[] = [
    { label: '', value: timeText },
    { label: '开盘', value: formatPrice(bar.open), color: colorByPreClose(bar.open) },
    { label: '收盘', value: formatPrice(bar.close), color: colorByPreClose(bar.close) },
    { label: '最高', value: formatPrice(bar.high), color: colorByPreClose(bar.high) },
    { label: '最低', value: formatPrice(bar.low), color: colorByPreClose(bar.low) },
    { label: '涨跌', value: `${sign}${formatPrice(Math.abs(change))}`, color: changeColor },
    { label: '涨幅', value: `${sign}${Math.abs(changePct).toFixed(2)}%`, color: changeColor },
  ]
  if (showVolume) {
    rows.push(
      { label: '成交量', value: formatVolume(bar.volume) },
      { label: '成交额', value: formatVolume(bar.amount) },
    )
  }
  return rows
}

/** 浮层定位参数（纯函数输入，可单测）。 */
export interface TooltipPositionParams {
  /** 进入方向（鼠标从图表左 / 右侧进入；左 → 右上角，右 → 左上角）。 */
  entrySide: 'left' | 'right'
  /** 所在 pane 顶部 y（相对图表容器；角落定位基准）。 */
  paneTop: number
  /** 浮层实际宽（px，显示后测量）。 */
  tooltipWidth: number
  /** pane1~pane5 数据区左缘（相对容器；左刻度开 = 刻度区宽，关 = 0）。 */
  paneLeft: number
  /** pane1~pane5 数据区右缘（相对容器；容器宽 - 右刻度区宽）。 */
  paneRight: number
}

/**
 * tooltip 可移动 / 可拖动区域（相对图表容器坐标）。
 *
 * @remarks
 * - X：pane1~pane5 数据区（左缘扣除左刻度区宽，右缘扣除右刻度区宽），
 *   左右刻度开关改变时随 show 重新注入，默认角落定位与拖动边界都以此为准；
 * - Y：pane1 顶部 → pane5 底部（信息行 pane2/4 在内）。
 */
export interface TooltipBounds {
  /** pane1~pane5 数据区左缘（相对容器；左刻度开 = 刻度区宽，关 = 0）。 */
  left: number
  /** pane1~pane5 数据区右缘（相对容器；容器宽 - 右刻度区宽）。 */
  right: number
  /** pane1 顶部（相对容器）。 */
  top: number
  /** pane5 底部（相对容器）。 */
  bottom: number
}

/** 与 pane 边缘的间距（px）。 */
const PANE_EDGE_OFFSET = 2

/**
 * 解析浮层位置（纯函数）。
 *
 * @remarks
 * - 进入方向定位：左进入 → pane 右上角；右进入 → pane 左上角（鼠标
 *   从左侧移入时浮层靠右不挡 K 线视线，从右侧移入时靠左）；
 * - 角落定位与 clamp 都以 pane1~pane5 数据区（paneLeft ~ paneRight）为边界，
 *   左右刻度开关打开时浮层不会越界到刻度区（右缘 2px / 左缘 2px 内缩）。
 *
 * @param params 定位参数（进入方向 / pane 顶 y / 浮层宽 / 数据区左右缘）。
 * @returns 浮层左上角在容器内的坐标。
 */
export const resolveTooltipPosition = (
  params: TooltipPositionParams,
): { left: number; top: number } => {
  const top = params.paneTop + PANE_EDGE_OFFSET
  if (params.entrySide === 'left') {
    // 左进入 → 右上角（数据区右缘内缩 2px；浮层过宽时 clamp 到左缘 2px 不越界）。
    return {
      left: Math.max(
        params.paneRight - params.tooltipWidth - PANE_EDGE_OFFSET,
        params.paneLeft + PANE_EDGE_OFFSET,
      ),
      top,
    }
  }
  // 右进入 → 左上角（数据区左缘内缩 2px）。
  return { left: params.paneLeft + PANE_EDGE_OFFSET, top }
}

/** 拖动位置 clamp 参数（纯函数输入，可单测；容器坐标，浮层 absolute 挂容器内）。 */
export interface TooltipClampParams {
  /** 期望位置（容器坐标，鼠标跟随结果）。 */
  left: number
  top: number
  /** pane1~pane5 可移动 / 可拖动区域（相对容器）。 */
  bounds: TooltipBounds
  /** 浮层宽 / 高（px）。 */
  width: number
  height: number
}

/**
 * 拖动位置 clamp（纯函数；浮层 absolute 挂容器内，left/top 即容器坐标，
 * 直接对 bounds 求 clamp，不再叠加容器视口原点）。
 *
 * @remarks
 * - X ∈ [bounds.left + 2, bounds.right - width - 2]（不越左右刻度区）；
 * - Y ∈ [bounds.top + 2, bounds.bottom - height - 2]（不越 pane1 顶 / pane5 底）；
 * - 数据区比浮层小（极端）时取最小边界（left/top），保证不出界。
 *
 * @param params 期望位置 + 可拖动区域 + 浮层尺寸。
 * @returns clamp 后的位置（容器坐标）。
 */
export const clampTooltipPosition = (
  params: Omit<TooltipClampParams, 'containerLeft' | 'containerTop'>,
): { left: number; top: number } => {
  const minLeft = params.bounds.left + PANE_EDGE_OFFSET
  const maxLeft = params.bounds.right - params.width - PANE_EDGE_OFFSET
  const minTop = params.bounds.top + PANE_EDGE_OFFSET
  const maxTop = params.bounds.bottom - params.height - PANE_EDGE_OFFSET
  return {
    left: Math.min(Math.max(params.left, minLeft), Math.max(minLeft, maxLeft)),
    top: Math.min(Math.max(params.top, minTop), Math.max(minTop, maxTop)),
  }
}

/** 浮层显示参数（由十字星管理器在命中时注入）。 */
export interface CrosshairTooltipShowParams {
  /** 进入方向（鼠标从图表左 / 右侧进入；左 → 右上角，右 → 左上角）。 */
  entrySide: 'left' | 'right'
  /** 所在 pane 顶部 y（相对图表容器；角落定位基准）。 */
  paneTop: number
  /** pane1~pane5 可移动 / 可拖动区域（相对容器；默认位置与拖动 clamp 边界）。 */
  bounds: TooltipBounds
  /** 命中的 K 线（九项数据源）。 */
  bar: ChartDataPoint
  /** 时间文本（已按 pane0 信息行格式格式化）。 */
  timeText: string
  /** 成交量组是否可见（关闭时隐藏 成交量 / 成交额 两行）。 */
  showVolume: boolean
  /** 均价线是否可见（关闭时隐藏 均价 行，分时专用）。 */
  showAvg: boolean
}

/** 行高（px）。 */
const ROW_HEIGHT = 19
/** 拖动判定阈值（px）：位移 < 阈值 = 点击（双击 / 三击选词），≥ 阈值 = 拖动浮层。 */
const DRAG_THRESHOLD = 4
/** 左列标签列宽（px，九行等宽对齐）。 */
const LABEL_WIDTH = 48

/**
 * 十字星数据浮层。
 *
 * @remarks
 * 浮层挂载在图表容器内（absolute）：角落进入方向定位 + 文字可选中 +
 * 按下即拖；浮层内 mousemove 转发到命中 Pane 的 top canvas，十字星全程跟手。
 */
export class CrosshairTooltip {
  /** 浮层根节点（挂图表容器内，position: absolute；pointer-events: auto 拦截自身区域）。 */
  private readonly root: HTMLDivElement
  /** 图表容器（定位基准：absolute 子元素的 positioned 祖先）。 */
  private readonly container: HTMLElement
  /** 九行节点（label + value 两列，预建复用）。 */
  private readonly rowNodes: { label: HTMLSpanElement; value: HTMLSpanElement }[] = []
  /** 当前主题色（setTheme 更新：背景 / 文字 / 边框 / 涨跌色）。 */
  private theme: ChartThemeColors
  /** 浮层是否显示中（幂等：仅 hidden → visible 时置 display / 测量 / 定位）。 */
  private visible = false
  /**
   * 鼠标是否悬停在浮层上：浮层挂图表 DOM 内，鼠标移入浮层时 lightweight-charts
   * 会向图表容器派发 mouseleave → 库清除十字星 → crosshairMove(null) → 未命中
   * 分支隐藏浮层，导致文字无法选中。hovered 记录悬停态，未命中分支据此跳过 hide。
   */
  private hovered = false
  /** 悬停态读取（crosshairManager 未命中分支读取；拖动中视为悬停——拖拽时鼠标可能
   *  短暂离开浮层边缘，未命中分支不能 hide）。 */
  get isHovered(): boolean {
    return this.hovered || this.dragging
  }
  /** 显示后测量的实际尺寸（px，hidden → visible 时重测，避免每帧强制 reflow）。 */
  private size: { width: number; height: number } | null = null
  /** 文本选区冻结中（mousedown → mouseup：选中文字期间暂停 show 内容更新，
   *  防止 textContent 变更破坏正在进行的选区）。 */
  private frozen = false
  /** 拖动起点（mousedown 按下点；位移 ≥ DRAG_THRESHOLD 判定为拖动）。 */
  private dragStart: { x: number; y: number } | null = null
  /** 按下点相对浮层左上角的偏移（px；拖动跟随用）。 */
  private dragOffset: { x: number; y: number } | null = null
  /** 是否正在拖动浮层（拖动期间禁用文字选择，防止拖出选区）。 */
  private dragging = false
  /** 拖动开始时的容器 body 坐标原点（缓存一次，拖动帧复用——避免每帧
   *  getBoundingClientRect 强制 reflow，性能优化）。 */
  private dragRect: { left: number; top: number } | null = null
  /** 拖动后的固定位置（容器坐标；hide 时清除 → 下次进入重新角落定位）。 */
  private fixedPos: { left: number; top: number } | null = null
  /** pane1~pane5 可移动 / 可拖动区域（相对容器；每次 show 注入，默认定位 + 拖动 clamp 用）。 */
  private bounds: TooltipBounds | null = null
  /** 内容 Pane 的 top canvas 集合（库十字星 mousemove 监听目标；show 时惰性刷新）。 */
  private topCanvases: HTMLCanvasElement[] = []
  /** 当前已转发 mouseenter 的 canvas（目标切换时重新合成 enter 重挂库监听）。 */
  private forwardedCanvas: HTMLCanvasElement | null = null

  constructor(container: HTMLElement, theme: ChartThemeColors) {
    this.theme = theme
    this.container = container
    // 容器作为定位原点（absolute 子元素需要 positioned 祖先；
    // 库容器默认无 position，显式置 relative，不干扰库内部布局）。
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative'
    }
    // 收集内容 Pane 的 top canvas（库 mousemove 监听目标；后续 show 时
    // 惰性刷新——pane 重建（成交量 / 指标开关）后旧 canvas 被移除，isConnected 判失效）。
    this.ensureTopCanvases()
    const root = document.createElement('div')
    root.style.position = 'absolute' // 挂容器内（旧实现 fixed + body）
    root.style.display = 'none'
    root.style.pointerEvents = 'auto' // 拦截自身区域按下（拖动 / 选词）；mousemove 冒泡到容器 → 十字星持续跟手
    root.style.userSelect = 'text' // 允许选中 / 复制文字
    root.style.webkitUserSelect = 'text' // Safari 兼容
    root.style.cursor = 'grab' // 按下即拖：全容器任意位置可拖动
    root.style.zIndex = '9999' // 容器内层级：盖住全部 canvas
    root.style.boxSizing = 'border-box'
    root.style.borderRadius = '4px'
    root.style.padding = '5px 5px'
    root.style.fontFamily =
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif'
    root.style.fontSize = '12px'
    root.style.lineHeight = `${ROW_HEIGHT}px`
    root.style.whiteSpace = 'nowrap'
    root.style.fontFeatureSettings = '"tnum"' // 等宽数字：九行数值按位对齐，滚动时数字不跳动
    // 预建九行（label + value），后续只更新 textContent。
    for (let i = 0; i < 9; i++) {
      const row = document.createElement('div')
      row.style.display = 'flex'
      row.style.alignItems = 'center'
      const label = document.createElement('span')
      label.style.width = `${LABEL_WIDTH}px`
      label.style.marginRight = '4px'
      label.style.opacity = '0.75'
      const value = document.createElement('span')
      row.appendChild(label)
      row.appendChild(value)
      root.appendChild(row)
      this.rowNodes.push({ label, value })
    }
    // 挂载到图表容器内（absolute 随容器滚动 / 位移天然锚定，
    // 鼠标在浮层上 mousemove 冒泡到容器 → 十字星不冻结）。
    container.appendChild(root)
    this.root = root
    // 选中冻结：按下（开始文本选择）→ 冻结 show；松开（window 级，拖选移出浮层也能恢复）。
    root.addEventListener('mousedown', this.handleMouseDown)
    // 浮层内 mousemove → 转发到命中 Pane 的 top canvas（十字星持续跟手）。
    root.addEventListener('mousemove', this.handleTooltipMove)
    // 悬停态监听：进入/离开浮层更新 hovered，未命中分支据此保持浮层。
    root.addEventListener('mouseenter', this.handleMouseEnter)
    root.addEventListener('mouseleave', this.handleMouseLeave)
    this.applyTheme(theme)
  }

  /**
   * 显示浮层（幂等）。
   *
   * @remarks
   * - 已显示（visible）→ 仅更新文本，不重定位 / 不重测尺寸（角落固定不随鼠标）；
   * - hidden → 置 display、重测尺寸、按进入方向角落定位。
   *
   * @param params 显示参数（进入方向 / pane 顶 y / 可拖动区域 / 命中的 bar / 时间文本 / 开关状态）。
   */
  show = (params: CrosshairTooltipShowParams): void => {
    // 选中文字期间冻结内容更新（textContent 变更会破坏正在进行的文字选区）。
    if (this.frozen) return
    // 惰性刷新 top canvas 集合（pane 重建后旧 canvas 失效 → 重新收集）。
    this.ensureTopCanvases()
    // 每次显示注入最新可移动 / 可拖动区域（刻度开关变化后角落定位与拖动边界即时生效）。
    this.bounds = params.bounds
    const rows = buildTooltipRows(
      params.bar,
      params.timeText,
      {
        up: this.theme.upColor,
        down: this.theme.downColor,
        avg: this.theme.timeshareAvgColor,
      },
      params.showVolume, // 成交量组关闭 → 隐藏量额两行
      params.showAvg, // 均价线关闭 → 隐藏均价行
    )
    this.rowNodes.forEach((node, index) => {
      const row = rows[index]
      // 分时（7 行）比 K 线（9 行）少：多余节点清空，避免残留上一周期文本。
      if (!row) {
        node.label.textContent = ''
        node.label.style.display = 'none'
        node.value.textContent = ''
        return
      }
      node.label.textContent = row.label
      // 第一行时间顶格直显（label 列不占位），其余行保留 label + value 两列。
      node.label.style.display = index === 0 ? 'none' : ''
      node.value.textContent = row.value
      node.value.style.color = row.color ?? this.theme.tooltipText
    })
    if (this.visible) return // 已显示：保持原位置（角落），只更新文本
    this.visible = true
    this.root.style.display = 'block'
    // 重测尺寸（hidden → visible 时一次；避免每帧 offsetWidth 强制 reflow）。
    this.root.style.left = '0px'
    this.root.style.top = '0px'
    this.size = { width: this.root.offsetWidth, height: this.root.offsetHeight }
    if (this.fixedPos) {
      // 拖动后的固定位置优先（鼠标未离开图表期间保持）。
      this.root.style.left = `${this.fixedPos.left}px`
      this.root.style.top = `${this.fixedPos.top}px`
    } else {
      this.place(params.entrySide, params.paneTop)
    }
  }

  /** 隐藏浮层（幂等：仅显示中才置 none）；下次进入按新方向重新定位。 */
  hide = (): void => {
    if (!this.visible) return
    this.visible = false
    this.root.style.display = 'none'
    // 隐藏解除拖动固定（下次进入按新方向重新角落定位）。
    this.fixedPos = null
  }

  /** 主题切换：背景 / 边框 / 文字色跟随深浅系。 */
  setTheme = (colors: ChartThemeColors): void => {
    this.theme = colors
    this.applyTheme(colors)
  }

  /** 销毁：移除浮层节点 + 清理冻结监听（防泄漏）。 */
  destroy = (): void => {
    this.root.removeEventListener('mousedown', this.handleMouseDown)
    this.root.removeEventListener('mousemove', this.handleTooltipMove)
    this.root.removeEventListener('mouseenter', this.handleMouseEnter)
    this.root.removeEventListener('mouseleave', this.handleMouseLeave)
    window.removeEventListener('mousemove', this.handleMouseMove)
    window.removeEventListener('mouseup', this.handleMouseUp)
    this.root.remove()
    this.topCanvases = []
    this.forwardedCanvas = null
  }

  /** 应用主题样式（背景 / 边框 / 文字）。 */
  private applyTheme = (colors: ChartThemeColors): void => {
    this.root.style.background = colors.tooltipBackground
    this.root.style.border = `1px solid ${colors.paneBorder}`
    this.root.style.boxShadow = colors.tooltipShadow
    this.root.style.color = colors.tooltipText
    for (const node of this.rowNodes) {
      node.label.style.color = colors.textColor
      // 值颜色默认文字色（涨跌行由 show 覆盖为 up/down 色）。
      node.value.style.color = colors.tooltipText
    }
  }

  // 按下浮层：进入选中冻结 + 阻止冒泡到 document（修复"无法选中"根因）：
  // lightweight-charts 在 document 级监听 mousedown（outsideHandler，点击图表外部时
  // 清除十字星 → crosshairMove(null) → tooltip 被 hide）。浮层挂容器内，若不在
  // 浮层上按下时拦截冒泡，mousedown 会触发该 handler → tooltip 立即隐藏、
  // 文字选区无法开始。stopPropagation 让 document 收不到，十字星保持，可正常选中。

  /** 鼠标进入浮层：记录悬停态（未命中分支据此不隐藏）。 */
  private handleMouseEnter = (): void => {
    this.hovered = true
  }

  /** 鼠标离开浮层：清除悬停态（之后按正常未命中逻辑处理）；重置转发目标。 */
  private handleMouseLeave = (): void => {
    this.hovered = false
    this.forwardedCanvas = null
  }

  // 浮层内 mousemove → 转发到鼠标所在 Pane 的 top canvas：
  //  - 命中测试：遍历内容 Pane top canvas（zIndex=2）的 rect，找到含鼠标点的目标；
  //  - 目标切换 / 首次进入：先合成 mouseenter（库 mouseEnterHandler 会重挂
  //    mousemove 监听——移入浮层时真实 mouseleave 已把它卸载），再合成 mousemove；
  //  - 拖动（dragging）或选中冻结（frozen）期间不转发：十字星冻结在当前位置，
  //    避免拖拽浮层时十字星跳动（未命中分支由 isHovered 守卫保持浮层）。
  private handleTooltipMove = (event: MouseEvent): void => {
    if (this.dragging || this.frozen) return
    const cv = this.hitTopCanvas(event.clientX, event.clientY)
    if (!cv) return
    if (cv !== this.forwardedCanvas) {
      cv.dispatchEvent(
        new MouseEvent('mouseenter', {
          clientX: event.clientX,
          clientY: event.clientY,
          bubbles: false,
        }),
      )
      this.forwardedCanvas = cv
    }
    cv.dispatchEvent(
      new MouseEvent('mousemove', { clientX: event.clientX, clientY: event.clientY, bubbles: true }),
    )
  }

  /** 命中测试：返回包含鼠标点（视口坐标）的内容 Pane top canvas（无命中 → null）。 */
  private hitTopCanvas = (clientX: number, clientY: number): HTMLCanvasElement | null => {
    for (const cv of this.topCanvases) {
      const r = cv.getBoundingClientRect()
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return cv
      }
    }
    return null
  }

  // 收集 / 刷新内容 Pane top canvas 集合：库十字星 mousemove 监听挂在这些
  // canvas（style.zIndex='2'）。pane 重建（成交量 / 指标开关移除重建）后旧 canvas
  // 从 DOM 移除（isConnected=false），此处惰性重新收集，避免转发到已销毁元素
  //（无效果 / 泄漏）。
  private ensureTopCanvases = (): void => {
    if (this.topCanvases.length > 0 && this.topCanvases.every((c) => c.isConnected)) return
    this.topCanvases = [...this.container.querySelectorAll('canvas')].filter(
      (c) => getComputedStyle(c).zIndex === '2',
    )
    this.forwardedCanvas = null
  }

  private handleMouseDown = (event: MouseEvent): void => {
    event.stopPropagation() // 阻止冒泡到 document（库 outsideHandler 点击图表外 → 清十字星）
    this.frozen = true // 拖动 / 点击期间暂停 show 内容更新（防视觉跳动 / 选区被破坏）
    window.addEventListener('mouseup', this.handleMouseUp)
    // 按下即拖：任意位置按下立即注册拖动监听（位移 ≥ 阈值即拖动）。
    this.dragStart = { x: event.clientX, y: event.clientY }
    window.addEventListener('mousemove', this.handleMouseMove)
  }

  // 移动（window 级：拖出浮层也能继续拖动）：
  //  - 位移 < DRAG_THRESHOLD：算点击（双击 / 三击选词可用，不移动浮层）；
  //  - 首次超过阈值：进入拖动（禁用文字选择，防止拖出选区）+ 记录按下点相对
  //    浮层左上角的偏移；
  //  - 拖动中：浮层跟随鼠标（容器坐标 = clientX/Y - 容器视口原点，
  //    absolute 挂容器内），位置 clamp 在 pane1~pane5 数据区内：
  //    X 不越左右刻度区，Y 不越 pane1 顶 / pane5 底。
  private handleMouseMove = (event: MouseEvent): void => {
    if (!this.dragStart) return
    if (!this.dragging) {
      const dx = event.clientX - this.dragStart.x
      const dy = event.clientY - this.dragStart.y
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return // 点击：未过阈值不拖动
      this.dragging = true
      this.root.style.userSelect = 'none'
      this.root.style.webkitUserSelect = 'none'
      this.root.style.cursor = 'grabbing'
      // 拖动开始缓存容器视口坐标原点（拖动帧复用，避免每帧 getBoundingClientRect 强制 reflow）。
      const rect = this.container.getBoundingClientRect()
      this.dragRect = { left: rect.left, top: rect.top }
      // 按下点相对浮层左上角的偏移（容器坐标；按下点 - 容器原点 - 浮层当前左上）。
      this.dragOffset = {
        x: this.dragStart.x - this.dragRect.left - this.root.offsetLeft,
        y: this.dragStart.y - this.dragRect.top - this.root.offsetTop,
      }
    }
    // 容器坐标（absolute：相对容器定位）。
    let left = event.clientX - this.dragRect!.left - this.dragOffset!.x
    let top = event.clientY - this.dragRect!.top - this.dragOffset!.y
    // 拖动边界（容器坐标）：pane1~pane5 数据区内缩 2px，浮层不越界到刻度区 / 图表外。
    const bounds = this.bounds
    if (bounds && this.size) {
      const clamped = clampTooltipPosition({
        left,
        top,
        bounds,
        width: this.size.width,
        height: this.size.height,
      })
      left = clamped.left
      top = clamped.top
    }
    this.root.style.left = `${left}px`
    this.root.style.top = `${top}px`
  }

  // 松开（window 级：拖出浮层也能结束）：
  //  - 拖动结束 → 记录固定位置（鼠标未离开图表期间保持），恢复文字选择能力；
  //  - 点击（无位移，双击 / 三击选词）→ 仅解除冻结，浏览器原生选区保持；
  //  - 清理拖动监听与起点。
  private handleMouseUp = (): void => {
    this.frozen = false
    window.removeEventListener('mousemove', this.handleMouseMove)
    window.removeEventListener('mouseup', this.handleMouseUp)
    if (this.dragging) {
      this.fixedPos = { left: this.root.offsetLeft, top: this.root.offsetTop }
      this.dragging = false
      this.root.style.userSelect = 'text'
      this.root.style.webkitUserSelect = 'text'
    }
    this.root.style.cursor = 'grab' // 恢复按下即拖提示
    this.dragStart = null
    this.dragOffset = null
    this.dragRect = null // 清理拖动缓存（防残留，下次拖动重新测量）
  }

  // 定位：容器坐标（absolute 挂容器内；旧实现 fixed + body 需叠加容器 rect）；
  // 角落位置限定在 pane1~pane5 数据区（paneLeft ~ paneRight），左右刻度开时不越界。
  private place = (entrySide: 'left' | 'right', paneTop: number): void => {
    if (!this.size || !this.bounds) return
    const pos = resolveTooltipPosition({
      entrySide,
      paneTop,
      tooltipWidth: this.size.width,
      paneLeft: this.bounds.left,
      paneRight: this.bounds.right,
    })
    this.root.style.left = `${pos.left}px`
    this.root.style.top = `${pos.top}px`
  }
}
