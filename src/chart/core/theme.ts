/**
 * theme.ts —— 图表风格（深系 / 浅系）统一配置（v1.2.1）
 *
 * 设计原则：所有颜色集中在本文件，组件内不再出现硬编码色值；
 * App.vue 提供深 / 浅切换按钮，一处切换、全局生效。
 *
 * 覆盖范围：
 *  - 图表核心：背景 / 文字 / K 线涨跌
 *  - 页面布局（App.vue）：页面背景 / 工具栏 / 按钮
 *
 * 说明：
 *  - A 股习惯"红涨绿跌"，深系与浅系保持一致（upColor / downColor 锁定）；
 *  - v1.2.1 清理：删除 CHART_FONT（未使用，保留 chartFontFamily 供库
 *    layout.fontFamily 使用）、删除 separatorColor（单 Pane 无分隔线 + 栅格
 *    关闭，无渲染效果）；
 *  - 后续指标 / 分时颜色在此文件扩展。
 */

/**
 * 全局字体（用户指定）：纯字体家族，给 lightweight-charts layout.fontFamily。
 */
export const chartFontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif'

/** 图表内自绘文字统一字体（12px + chartFontFamily，刻度标签 / 指示值 / 空 Pane 文字共用） */
/** 全透明色（占位 series 统一透明，避免自绘柱体与库内建渲染叠加遮挡） */
export const transparentColor = 'rgba(0, 0, 0, 0)'

export const chartFont = `12px ${chartFontFamily}`

/** 主题色定义 */
export interface ChartThemeColors {
  /* ===== 图表核心 ===== */
  /** 图表背景色（layout.background） */
  background: string
  /** 刻度 / 文字颜色（layout.textColor） */
  textColor: string
  /** 上涨颜色（K 线上涨 / 涨跌红字） */
  upColor: string
  /** 下跌颜色（K 线下跌 / 涨跌绿字） */
  downColor: string
  /** 内容 Pane 边框色（pane1 / pane3 / pane5 自绘矩形边框，深浅系区分） */
  paneBorder: string
  /** 栅格线颜色（自绘等分栅格：竖 4 等分 / 横按 pane 配置，深浅系区分） */
  grid: string
  /** 十字星指示值标签背景块颜色（左刻度区命中标签，深浅系区分，需与图表背景可见区分） */
  crosshairLabelBackground: string
  /** 十字星指示值标签文字颜色（深浅系区分） */
  crosshairLabelText: string
  /**
   * 十字星横 / 竖线颜色（半透明，深浅系区分）：
   * 库默认 '#9598A1' 不透明 —— 竖线穿过 MACD 红绿柱 / K 线 / 成交量柱时，
   * 不透明虚线会完全遮盖柱体。半透明后虚线间隙与线体都透出柱体，视觉
   * 上"不被遮盖"，同时十字星仍清晰可见（保持"十字星在柱上方"层级不变）。
   */
  crosshairLineColor: string
  /** 最高价标注颜色（黄色系，深浅系区分保证可读性） */
  highMarkerColor: string
  /** 最低价标注颜色（蓝色系，深浅系区分保证可读性） */
  lowMarkerColor: string
  /** SAR 多头圆点色（与 K 线上涨色一致，红涨绿跌） */
  sarUp: string
  /** SAR 空头圆点色（与 K 线下跌色一致，红涨绿跌） */
  sarDown: string
  /** 成交量 MA5 线颜色（pane3 VOL MA5，成交量副图惯例黄色） */
  volMa5: string
  /** 成交量 MA10 线颜色（pane3 VOL MA10，成交量副图惯例粉色） */
  volMa10: string

  /* ===== 页面布局（App.vue） ===== */
  /** 页面整体背景（html 背景，跟随主题） */
  pageBackground: string
  /** 顶部工具栏背景 */
  toolbarBackground: string
  /** 工具栏底部分隔线 */
  toolbarBorder: string
  /** 按钮背景 */
  buttonBackground: string
  /** 按钮文字 */
  buttonText: string
  /** 按钮描边 */
  buttonBorder: string
  /** 按钮 hover 背景 */
  buttonHover: string
  /** 按钮 active（开关开启）文字 / 描边色 */
  buttonActiveColor: string
  /** 布局提示文字 */
  hintText: string
}

/** 主题名 */
export type ChartThemeName = 'dark' | 'light'

/** 深系 / 浅系两套主题 */
export const chartThemes: Record<ChartThemeName, ChartThemeColors> = {
  /* ---------------- 深系（默认） ---------------- */
  dark: {
    background: '#131722',
    textColor: '#B2B5BE',
    upColor: '#FF0000',
    downColor: '#008000',
    paneBorder: '#2A2E39',
    grid: '#1E222D',
    crosshairLabelBackground: '#2A2E39',
    crosshairLabelText: '#D1D4DC',
    // 浅灰蓝半透明（#9598A1 @ 25%）：深背景上清晰、穿过柱体时透出、细虚线更淡
    crosshairLineColor: 'rgba(149, 152, 161, 0.25)',
    highMarkerColor: '#F4AA0A',
    lowMarkerColor: '#2962FF',
    sarUp: '#FF0000',
    sarDown: '#008000',
     volMa5: '#FFD54F',
    volMa10: '#F06292',

    pageBackground: '#0B0E13',
    toolbarBackground: '#1E222D',
    toolbarBorder: '#2A2E39',
    buttonBackground: '#2A2E39',
    buttonText: '#D1D4DC',
    buttonBorder: '#4C525E',
    buttonHover: '#363C4A',
    buttonActiveColor: '#FF6B6B',
    hintText: '#787B86',
  },

  /* ---------------- 浅系 ---------------- */
  light: {
    background: '#FFFFFF',
    textColor: '#4A4A55',
    upColor: '#FF0000',
    downColor: '#008000',
    paneBorder: '#D4D8DE',
    grid: '#E6E8EC',
    crosshairLabelBackground: '#F0F2F5',
    crosshairLabelText: '#33373E',
    // 中灰半透明（白底更清晰；细虚线更淡）
    crosshairLineColor: 'rgba(90, 96, 112, 0.25)',
    highMarkerColor: '#B8860B',
    lowMarkerColor: '#2452CC',
    sarUp: '#FF0000',
    sarDown: '#008000',
    volMa5: '#FFD54F',
    volMa10: '#F06292',

    pageBackground: '#EDEFF3',
    toolbarBackground: '#F3F4F6',
    toolbarBorder: '#D4D8DE',
    buttonBackground: '#FFFFFF',
    buttonText: '#33373E',
    buttonBorder: '#C9CED6',
    buttonHover: '#E9EBEF',
    buttonActiveColor: '#E33A2C',
    hintText: '#8A9099',
  },
}

/** 默认主题（首次进入深系） */
export const defaultTheme: ChartThemeName = 'dark'

/** 便捷取色：主题名 → 颜色对象 */
export const themeColors = (name: ChartThemeName): ChartThemeColors => chartThemes[name]

/* ==================== 指标配色（深浅系通用，不随主题变化） ==================== */

/**
 * 主图指标配色（pane1 叠加线，深浅系通用）。
 * 注意（v1.4.92）：原东财标准色中的"白线"（MA5 / EXPMA12 / 附图第一线 #A0A0A0）、
 * BOLL 中轨纯白（#FFFFFF）、BBI 浅蓝灰（#B0BEC5）在浅系（白底）下过淡 / 不可见，
 * 统一替换为深浅系均清晰可见的深色：灰线 → #666666、BOLL 中轨 → #33373E、BBI → #607D8B。
 *  - MA：5 / 10 / 20 / 30 / 60 五线（深灰 / 黄 / 粉 / 深绿 / 蓝）；
 *  - EXPMA：12 / 50 两线（深灰 / 黄）；
 *  - BOLL：上轨 / 中轨 / 下轨（黄 / 深灰 / 粉）；
 *  - SAR：抛物点按趋势着色（多头 = K 线上涨色、空头 = K 线下跌色，取主题 up/down）；
 *  - BBI：多空指标（蓝灰）。
 */
export const mainIndicatorColors = {
  /** MA 五线（MA5 / MA10 / MA20 / MA30 / MA60） */
  ma: ['#666666', '#DD9900', '#FF00FF', '#007130', '#0079D5'],
  /** EXPMA 两线（EXPMA12 / EXPMA50） */
  expma: ['#666666', '#DD9900'],
  /** BOLL 三轨（上轨 / 中轨 / 下轨） */
  boll: ['#FFD54F', '#33373E', '#F06292'],
  /** BBI 单线 */
  bbi: '#607D8B',
} as const

/**
 * 附图指标线颜色（东财标准色，深浅系通用；下标顺序与各指标 calc 返回线序一致）。
 *  - MACD 第三色用于指标信息行 MACD 柱值文本（柱体渲染仍为红涨 / 绿跌）；
 *  - 深 / 浅系共用同一配色（与主图指标一致，不随主题变化）；
 *  - v1.4.92：第一线（东财标准白线）由 #A0A0A0 加深为 #666666，浅系白底下清晰可见。
 */
export const subIndicatorColors = {
  /** RSI：RSI6 / RSI12 / RSI24 */
  rsi: ['#666666', '#F4AA0A', '#FF1DFF'],
  /** KDJ：K / D / J */
  kdj: ['#666666', '#F4AA0A', '#FF1DFF'],
  /** MACD：DIF / DEA / MACD 柱值（柱体渲染红涨绿跌，第三色仅供信息行文本） */
  macd: ['#666666', '#F4AA0A', '#FF1DFF'],
  /** WR：WR10 / WR6 */
  wr: ['#666666', '#F4AA0A'],
  /** DMI：PDI / MDI / ADX / ADXR */
  dmi: ['#666666', '#F4AA0A', '#FF1DFF', '#007130'],
  /** BIAS：BIAS6 / BIAS12 / BIAS24 */
  bias: ['#666666', '#F4AA0A', '#FF1DFF'],
  /** OBV：OBV / OBVMA */
  obv: ['#666666', '#F4AA0A'],
  /** CCI：单线 */
  cci: ['#666666'],
  /** ROC：ROC / ROCMA */
  roc: ['#666666', '#F4AA0A'],
  /** CR：CR / MA5 / MA10 / MA20 */
  cr: ['#666666', '#F4AA0A', '#FF1DFF', '#007130'],
} as const
