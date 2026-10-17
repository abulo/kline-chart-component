/**
 * crosshairTooltip.ts —— 十字星数据浮层（v1.6.42：移除拖动手柄，回归角落定位 + 文字可选）
 *
 * 职责：十字星命中时显示"时间 / 开盘 / 收盘 / 最高 / 最低 / 涨跌 / 涨幅 /
 * 成交量 / 成交额"九项数据。
 *
 * 交互设计（v1.6.36 ~ v1.6.42）：
 *  - **进入方向定位（v1.6.43 修正）**：鼠标从图表左半区进入 → 浮层固定在
 *    pane **右上角**；从右半区进入 → pane **左上角**（不随命中 pane 变化，
 *    默认 pane1 主图，v1.6.37）；
 *  - **文字可选中（v1.6.38 / v1.6.48 / v1.6.53）**：浮层主体 `userSelect: text`
 *    可自由选中 / 复制文字（v1.6.48 修复"无法选中"根因：鼠标移入浮层时图表
 *    mouseleave → 未命中分支隐藏浮层，以 isHovered 悬停守卫跳过 hide）；
 *  - **拖动（v1.6.53 按下即拖）**：**只要鼠标在 tooltip 任何位置按下即可拖动**
 *    （无 ≡ 手柄图标，grab 光标）——按下后位移 ≥ 4px 即拖动浮层（拖动期间
 *    userSelect:none），松开后位置**固定**直到鼠标离开图表（hide 清除固定位，
 *    再次进入重新角落定位）；无位移 = 点击（单击放光标 / **双击选词 / 三击
 *    选行**仍可用，与拖动互不冲突）；
 *  - 鼠标离开图表再进入 → 按新进入方向重新定位。
 *
 * 防闪 / 防抖（v1.6.40）：
 *  - **挂载 document.body**（position: fixed）—— 脱离图表 DOM 树 / canvas 层级 /
 *    overflow 裁剪，pointer-events: auto 明确拦截：鼠标在浮层上时图表收不到事件，
 *    十字星冻结、内容不被每帧更新破坏，文字选区稳定；
 *  - **幂等显示**：show 仅在 hidden → visible 时置 display / 测量尺寸 / 定位；
 *    已显示时只更新文本，不再每帧重置 left/top、不再每帧强制 reflow；
 *  - **等宽数字（v1.6.41）**：font-feature-settings "tnum"，九行数值按位对齐；
 *  - **第一行时间直显（v1.6.44）**：首行不显示"时间"汉字标签，时间顶格直显；
 *  - **选中冻结（v1.6.46）**：mousedown → mouseup 期间暂停 show 内容更新，
 *    文字选区不被 textContent 变更破坏（兼容 Safari -webkit-user-select）；
 *  - **阻止 document 冒泡（v1.6.47）**：浮层按下时 stopPropagation——库在 document
 *    级监听 mousedown（点击图表外 → 清十字星 → tooltip 隐藏），拦截后选中不再被中断。
 */
import { formatPrice, formatVolume } from '../util/format'
import type { ChartThemeColors } from '../core/theme'
import type { ChartDataPoint } from '../../types/chart'

/** 浮层一行（label 左列 / value 右列；color 可选覆盖值颜色，如红涨绿跌） */
export interface TooltipRow {
  /** 左列标签（时间 / 开盘 / …） */
  label: string
  /** 右列数值文本 */
  value: string
  /** 值颜色（undefined = 使用主题默认文字色） */
  color?: string
}

/** 涨跌着色参考色（红涨绿跌：upColor 红 / downColor 绿） */
export interface TooltipColors {
  /** 上涨色 */
  up: string
  /** 下跌色 */
  down: string
}

/** 组装浮层九行（纯函数，可单测；时间文本外部按 pane0 格式传入） */
export const buildTooltipRows = (
  bar: ChartDataPoint,
  timeText: string,
  colors: TooltipColors,
): TooltipRow[] => {
  // 涨跌基准 = 昨收（preClose 缺失时回退开盘点，兜底不抛错）
  const preClose = bar.preClose ?? bar.open ?? 0
  const change = (bar.close ?? 0) - preClose
  const changePct = preClose > 0 ? (change / preClose) * 100 : 0
  const sign = change > 0 ? '+' : change < 0 ? '-' : ''
  const changeColor = change > 0 ? colors.up : change < 0 ? colors.down : undefined
  // 单值对比昨收着色：> preClose 红（up）、< preClose 绿（down）、相等中性（v1.6.55）
  const colorByPreClose = (value: number | undefined): string | undefined => {
    if (value == null) return undefined
    if (value > preClose) return colors.up
    if (value < preClose) return colors.down
    return undefined
  }
  // 第一行时间直显（label 置空，show 时该行 label 列不占位，v1.6.44）
  return [
    { label: '', value: timeText },
    { label: '开盘', value: formatPrice(bar.open), color: colorByPreClose(bar.open) },
    { label: '收盘', value: formatPrice(bar.close), color: colorByPreClose(bar.close) },
    { label: '最高', value: formatPrice(bar.high), color: colorByPreClose(bar.high) },
    { label: '最低', value: formatPrice(bar.low), color: colorByPreClose(bar.low) },
    { label: '涨跌', value: `${sign}${formatPrice(Math.abs(change))}`, color: changeColor },
    { label: '涨幅', value: `${sign}${Math.abs(changePct).toFixed(2)}%`, color: changeColor },
    { label: '成交量', value: formatVolume(bar.volume) },
    { label: '成交额', value: formatVolume(bar.amount) },
  ]
}

/** 浮层定位参数（纯函数输入，可单测） */
export interface TooltipPositionParams {
  /** 进入方向（鼠标从图表左 / 右侧进入；左 → 右上角，右 → 左上角，v1.6.43） */
  entrySide: 'left' | 'right'
  /** 所在 pane 顶部 y（相对图表 canvas） */
  paneTop: number
  /** 浮层实际宽 / 高（px，显示后测量） */
  tooltipWidth: number
  tooltipHeight: number
  /** 容器宽 / 高（px，右缘 / 下缘 clamp 边界） */
  containerWidth: number
  containerHeight: number
}

/** 与 pane 边缘的间距（px） */
const PANE_EDGE_OFFSET = 2

/**
 * 解析浮层位置（纯函数，v1.6.43 修正映射）：
 *  - 进入方向定位：**左进入 → pane 右上角；右进入 → pane 左上角**（鼠标
 *    从左侧移入时浮层靠右不挡 K 线视线，从右侧移入时靠左）；
 *  - 角落定位 clamp 到容器内（右缘距 2px，不越界）。
 */
export const resolveTooltipPosition = (
  params: TooltipPositionParams,
): { left: number; top: number } => {
  const top = params.paneTop + PANE_EDGE_OFFSET
  if (params.entrySide === 'left') {
    // 左进入 → 右上角（右缘 2px；浮层过宽时 clamp 到左缘 2px 不越界）
    return {
      left: Math.max(params.containerWidth - params.tooltipWidth - PANE_EDGE_OFFSET, PANE_EDGE_OFFSET),
      top,
    }
  }
  // 右进入 → 左上角
  return { left: PANE_EDGE_OFFSET, top }
}

/** 浮层显示参数（由十字星管理器在命中时注入） */
export interface CrosshairTooltipShowParams {
  /** 进入方向（鼠标从图表左 / 右侧进入；左 → 右上角，右 → 左上角，v1.6.43） */
  entrySide: 'left' | 'right'
  /** 所在 pane 顶部 y（相对图表 canvas；角落定位基准） */
  paneTop: number
  /** 命中的 K 线（九项数据源） */
  bar: ChartDataPoint
  /** 时间文本（已按 pane0 信息行格式格式化） */
  timeText: string
}

/** 行高（px） */
const ROW_HEIGHT = 19
/** 拖动判定阈值（px）：位移 < 阈值 = 点击（双击 / 三击选词），≥ 阈值 = 拖动浮层 */
const DRAG_THRESHOLD = 4
/** 左列标签列宽（px，九行等宽对齐） */
const LABEL_WIDTH = 48

export class CrosshairTooltip {
  /** 浮层根节点（挂 document.body，position: fixed；pointer-events: auto 拦截自身区域） */
  private readonly root: HTMLDivElement
  /** 图表容器（定位基准：容器 rect + 容器内坐标 → body 坐标） */
  private readonly container: HTMLElement
  /** 九行节点（label + value 两列，预建复用） */
  private readonly rowNodes: { label: HTMLSpanElement; value: HTMLSpanElement }[] = []
  /** 当前主题色（setTheme 更新：背景 / 文字 / 边框 / 涨跌色） */
  private theme: ChartThemeColors
  /** 浮层是否显示中（幂等：仅 hidden → visible 时置 display / 测量 / 定位） */
  private visible = false
  /**
   * 鼠标是否悬停在浮层上（v1.6.48）：
   * 浮层挂 body（图表 DOM 外），鼠标移入浮层时 lightweight-charts 会向图表容器
   * 派发 mouseleave → 库清除十字星 → crosshairMove(null) → 未命中分支隐藏浮层，
   * 导致文字无法选中。hovered 记录悬停态，未命中分支据此跳过 hide（见
   * crosshairManager.applyCrosshairMove 未命中分支的 hovered 守卫）。
   */
  private hovered = false
  /** 鼠标是否悬停在浮层上（crosshairManager 未命中分支读取；拖动中视为悬停，
   *  拖拽时鼠标可能短暂离开浮层边缘，未命中分支不能 hide，v1.6.49） */
  get isHovered(): boolean {
    return this.hovered || this.dragging
  }
  /** 显示后测量的实际尺寸（px，hidden → visible 时重测，避免每帧强制 reflow） */
  private size: { width: number; height: number } | null = null
  /** 文本选区冻结中（mousedown → mouseup：选中文字期间暂停 show 内容更新，
   *  防止 textContent 变更破坏正在进行的选区；v1.6.46 修复"无法选中"） */
  private frozen = false
  /** 拖动起点（mousedown 按下点；位移 ≥ DRAG_THRESHOLD 判定为拖动，v1.6.49） */
  private dragStart: { x: number; y: number } | null = null
  /** 按下点相对浮层左上角的偏移（px；拖动跟随用） */
  private dragOffset: { x: number; y: number } | null = null
  /** 是否正在拖动浮层（拖动期间禁用文字选择，防止拖出选区） */
  private dragging = false
  /** 拖动后的固定位置（body 坐标；hide 时清除 → 下次进入重新角落定位） */
  private fixedPos: { left: number; top: number } | null = null

  constructor(container: HTMLElement, theme: ChartThemeColors) {
    this.theme = theme
    this.container = container
    const root = document.createElement('div')
    root.style.position = 'fixed'
    root.style.display = 'none'
    root.style.pointerEvents = 'auto' // 拦截自身区域：浮层上鼠标事件不穿透到图表
    root.style.userSelect = 'text' // 允许选中 / 复制文字
    root.style.webkitUserSelect = 'text' // Safari 兼容（v1.6.46）
    root.style.cursor = 'grab' // 按下即拖（v1.6.53）：全容器任意位置可拖动
    root.style.zIndex = '9999' // 脱离图表层级，永远置顶
    root.style.boxSizing = 'border-box'
    root.style.borderRadius = '4px'
    root.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.25)'
    root.style.padding = '5px 5px'
    root.style.fontFamily =
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif'
    root.style.fontSize = '12px'
    root.style.lineHeight = `${ROW_HEIGHT}px`
    root.style.whiteSpace = 'nowrap'
    root.style.fontFeatureSettings = '"tnum"' // 等宽数字：九行数值按位对齐，滚动时数字不跳动
    // 预建九行（label + value），后续只更新 textContent
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
    // 挂载到 body（脱离图表 DOM 树，杜绝层级 / 事件拦截不确定性）
    document.body.appendChild(root)
    this.root = root
    // 选中冻结：按下（开始文本选择）→ 冻结 show；松开（window 级，拖选移出浮层也能恢复）
    root.addEventListener('mousedown', this.handleMouseDown)
    // 悬停态监听（v1.6.48）：进入/离开浮层更新 hovered，未命中分支据此保持浮层
    root.addEventListener('mouseenter', this.handleMouseEnter)
    root.addEventListener('mouseleave', this.handleMouseLeave)
    this.applyTheme(theme)
  }

  /**
   * 显示浮层（幂等）：
   *  - 已显示（visible）→ 仅更新文本，不重定位 / 不重测尺寸（角落固定不随鼠标）；
   *  - hidden → 置 display、重测尺寸、按进入方向角落定位。
   */
  show = (params: CrosshairTooltipShowParams): void => {
    // 选中文字期间冻结内容更新（textContent 变更会破坏正在进行的文字选区）
    if (this.frozen) return
    const rows = buildTooltipRows(params.bar, params.timeText, {
      up: this.theme.upColor,
      down: this.theme.downColor,
    })
    this.rowNodes.forEach((node, index) => {
      const row = rows[index]
      if (!row) return
      node.label.textContent = row.label
      // 第一行时间顶格直显（label 列不占位），其余行保留 label + value 两列
      node.label.style.display = index === 0 ? 'none' : ''
      node.value.textContent = row.value
      node.value.style.color = row.color ?? this.theme.tooltipText
    })
    if (this.visible) return // 已显示：保持原位置（角落），只更新文本
    this.visible = true
    this.root.style.display = 'block'
    // 重测尺寸（hidden → visible 时一次；避免每帧 offsetWidth 强制 reflow）
    this.root.style.left = '0px'
    this.root.style.top = '0px'
    this.size = { width: this.root.offsetWidth, height: this.root.offsetHeight }
    if (this.fixedPos) {
      // 拖动后的固定位置优先（鼠标未离开图表期间保持，v1.6.49）
      this.root.style.left = `${this.fixedPos.left}px`
      this.root.style.top = `${this.fixedPos.top}px`
    } else {
      this.place(params.entrySide, params.paneTop)
    }
  }

  /** 隐藏浮层（幂等：仅显示中才置 none）；下次进入按新方向重新定位 */
  hide = (): void => {
    if (!this.visible) return
    this.visible = false
    this.root.style.display = 'none'
    // 隐藏解除拖动固定（下次进入按新方向重新角落定位，v1.6.49）
    this.fixedPos = null
  }

  /** 主题切换：背景 / 边框 / 文字色跟随深浅系 */
  setTheme = (colors: ChartThemeColors): void => {
    this.theme = colors
    this.applyTheme(colors)
  }

  /** 销毁：移除浮层节点 + 清理冻结监听（防泄漏） */
  destroy = (): void => {
    this.root.removeEventListener('mousedown', this.handleMouseDown)
    this.root.removeEventListener('mouseenter', this.handleMouseEnter)
    this.root.removeEventListener('mouseleave', this.handleMouseLeave)
    window.removeEventListener('mousemove', this.handleMouseMove)
    window.removeEventListener('mouseup', this.handleMouseUp)
    this.root.remove()
  }

  /** 应用主题样式（背景 / 边框 / 文字） */
  private applyTheme = (colors: ChartThemeColors): void => {
    this.root.style.background = colors.tooltipBackground
    this.root.style.border = `1px solid ${colors.paneBorder}`
    this.root.style.color = colors.tooltipText
    for (const node of this.rowNodes) {
      node.label.style.color = colors.textColor
      // 值颜色默认文字色（涨跌行由 show 覆盖为 up/down 色）
      node.value.style.color = colors.tooltipText
    }
  }

  /**
   * 按下浮层：进入选中冻结 + **阻止冒泡到 document**（v1.6.47 修复"无法选中"根因）：
   * lightweight-charts 在 document 级监听 mousedown（outsideHandler，点击图表外部时
   * 清除十字星 → crosshairMove(null) → tooltip 被 hide）。浮层挂 body（图表外），
   * 若不在浮层上按下时拦截冒泡，mousedown 会触发该 handler → tooltip 立即隐藏、
   * 文字选区无法开始。stopPropagation 让 document 收不到，十字星保持，可正常选中。
   */
  /** 鼠标进入浮层：记录悬停态（未命中分支据此不隐藏，v1.6.48） */
  private handleMouseEnter = (): void => {
    this.hovered = true
  }

  /** 鼠标离开浮层：清除悬停态（之后按正常未命中逻辑处理） */
  private handleMouseLeave = (): void => {
    this.hovered = false
  }

  private handleMouseDown = (event: MouseEvent): void => {
    event.stopPropagation() // v1.6.47：阻止冒泡到 document（库 outsideHandler 点击图表外 → 清十字星）
    this.frozen = true // 拖动 / 点击期间暂停 show 内容更新（防视觉跳动 / 选区被破坏）
    window.addEventListener('mouseup', this.handleMouseUp)
    // v1.6.53 按下即拖：任意位置按下立即注册拖动监听（位移 ≥ 阈值即拖动）
    this.dragStart = { x: event.clientX, y: event.clientY }
    window.addEventListener('mousemove', this.handleMouseMove)
  }

  /**
   * 移动（window 级：拖出浮层也能继续拖动，v1.6.49）：
   *  - 位移 < DRAG_THRESHOLD：算点击（双击 / 三击选词可用，不移动浮层）；
   *  - 首次超过阈值：进入拖动（禁用文字选择，防止拖出选区）+ 记录按下点相对
   *    浮层左上角的偏移；
   *  - 拖动中：浮层跟随鼠标（clientX/Y 即 body 坐标，position: fixed 直接用）。
   */
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
      this.dragOffset = {
        x: this.dragStart.x - this.root.offsetLeft,
        y: this.dragStart.y - this.root.offsetTop,
      }
    }
    this.root.style.left = `${event.clientX - this.dragOffset!.x}px`
    this.root.style.top = `${event.clientY - this.dragOffset!.y}px`
  }

  /**
   * 松开（window 级：拖出浮层也能结束）：
   *  - 拖动结束 → 记录固定位置（鼠标未离开图表期间保持），恢复文字选择能力；
   *  - 点击（无位移，双击 / 三击选词）→ 仅解除冻结，浏览器原生选区保持；
   *  - 清理拖动监听与起点。
   */
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
  }

  /** 定位：容器内坐标 + 容器 rect → body 坐标（position: fixed） */
  private place = (entrySide: 'left' | 'right', paneTop: number): void => {
    if (!this.size) return
    const rect = this.container.getBoundingClientRect()
    const pos = resolveTooltipPosition({
      entrySide,
      paneTop,
      tooltipWidth: this.size.width,
      tooltipHeight: this.size.height,
      containerWidth: rect.width,
      containerHeight: rect.height,
    })
    this.root.style.left = `${rect.left + pos.left}px`
    this.root.style.top = `${rect.top + pos.top}px`
  }
}
