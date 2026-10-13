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
 * MACD 指标配色（东方财富风格）：
 *  - DIF / DEA 线固定配色（深浅系通用）；
 *  - 柱体红绿由 MacdBarPrimitive 自绘（取主题 upColor / downColor，红涨绿跌，
 *    与 pane1 / pane3 一致）。
 */
export const macdColors = {
  /** DIF 线 */
  difLine: '#A0A0A0',
  /** DEA 线 */
  deaLine: '#F4AA0A',
} as const
