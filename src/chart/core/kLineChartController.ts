/**
 * KLineChartController.ts —— 多 Pane K 线图表控制器（v1.4.73 功能拆分版）
 *
 * 布局：一个 chart 内多 Pane（lightweight-charts 原生多 Pane，指标层可开关）：
 *   指标开启（6 Pane）：
 *     pane0：顶部信息行空 Pane（无数据，自绘"名称 [代码] 时间 + 主图指标值"，固定高 22px）
 *     pane1：K 线主图（Candlestick，红涨绿跌，上涨柱体空心；可叠加 MA/EXPMA/BOLL/SAR/BBI）
 *     pane2：成交量信息行空 Pane（设置与 pane0 一致，高度绝对相等）
 *     pane3：成交量（自绘：上涨空心红柱 / 下跌绿实心，柱宽与间隔同 pane1 绝对一致）
 *     pane4：指标信息行空 Pane（自绘所选附图指标各线数值，随十字星）
 *     pane5：附图指标（RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR，互斥单选；
 *            MACD 红绿柱自绘，其余线型指标 top 层自绘，高度与 pane3 一致）
 *   指标关闭（4 Pane）：pane0..pane3（去掉 pane4 / pane5，main : volume = 80 : 20）
 *
 * 高度算法（指标开 60 : 20 : 20 / 指标关 80 : 20）：
 *   库实际可用高度 H = 容器高度 - 时间轴高度（库默认 28px，显隐按库状态）
 *                      - 分隔线总高（patch-lwc-separator.js 已将 SeparatorHeight 1→0）
 *   固定空 Pane 总高 = 固定 Pane 数量 × 22（topPaneHeight），剩余 R = H - 固定总高：
 *     指标开：pane0 = 22px、pane1 = 0.6×R；pane2 = 22px、pane3 = 0.2×R；
 *             pane4 = 22px、pane5 = 0.2×R
 *     指标关：pane0 = 22px、pane1 = 0.8×R；pane2 = 22px、pane3 = 0.2×R
 *   像素因子方案：stretchFactor 直接设为目标像素高度 → stretchPixels = 1
 *   → 非最后 pane = round(factor) 精确、最后 pane = 剩余 = 目标，无舍入误差；
 *   时间轴开 / 关仅影响 H（关时时间轴高度 = 0），组比例不变。
 *
 * ===== 模块划分（v1.4.73 功能拆分，每个 class / 常量一个文件） =====
 * 本控制器只保留：图表创建 / Pane 构建 / 数据写入 / 布局 / 主题 / 缩放平移 /
 * 刻度开关 / 生命周期，并把职责委托给以下模块：
 *  - constants.ts：共享常量（LIBRARY_TIME_AXIS_HEIGHT / PRICE_SCALE_MIN_WIDTH）；
 *  - types.ts：公共类型（KLineChartOptions / MainIndicatorName / IndicatorLineSpec）；
 *  - indicatorMeta.ts：附图指标线名元信息（subIndicatorLabels）；
 *  - indicatorManager.ts：指标管理器（主图五指标 + 附图十指标 + 成交量均量线 +
 *    信息行分段构建，全部指标元素 top 层自绘，setMainIndicator / setSubIndicator）；
 *  - crosshairManager.ts：十字星管理器（十字星移动联动 + overlayTime + 左刻度指示值）；
 *  - layout.ts / candlestickWidth.ts / volume/ / overlay/ / indicator/ / axis/ /
 *    grid/ / border/ / highLow/：布局常量与算法、各自绘 primitive（独立文件）。
 *
 * 全局控制（全部由 App.vue 提供按钮）：
 *  - 时间轴开关：控制底部时间轴（timeScale）显示 / 隐藏；
 *  - 放大 / 缩小 / 左移 / 右移：全局 timeScale 操作（图表内禁用滚轮/触摸缩放）；
 *  - 风格切换：深系 / 浅系（theme.ts 统一配色，红涨绿跌锁定）；
 *  - 左 / 右刻度区开关：显隐全部 Pane 的 price scale（宽度一致 72px，无边框）；
 *  - 附图指标（互斥）：RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR（pane5 指标层，
 *    setSubIndicator：选中 = 打开指标层、取消选中 = 关闭指标层，pane4 信息行显示数值；
 *    MACD 柱 + 线、其余指标线全部 top 层自绘，指标切换动态重算缓存）；
 *  - 主图指标（互斥）：MA / EXPMA / BOLL / SAR / BBI（pane1 叠加，东财指标库，
 *    setMainIndicator：切换时先清空缓存，SAR 用 SarMarkerPrimitive 显隐控制）。
 *
 * 生命周期：实例保护（container dataset 标记防重复创建 chart）；
 * ResizeObserver 跟随容器尺寸重算 pane 高度；destroy 销毁（防内存泄漏）。
 */

import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  type ISeriesApi,
  type UTCTimestamp,
  type LogicalRange,
  type Time,
} from "lightweight-charts";
import {
  themeColors,
  chartFontFamily,
  chartFont,
  type ChartThemeName,
} from "./theme";
import { resolveBarColors, type BarPalette } from "./resolveBarColors";
import { mergeBars } from "./mergeBars";
import type { ChartDataPoint } from "../../types/chart";
import {
  fixedPaneCount,
  fixedPaneCountWithoutIndicator,
  topPaneHeight,
  groupRatios,
  groupRatiosWithoutIndicator,
  calcPaneHeights,
} from "./layout";
import { TopPaneOverlayPrimitive } from "../overlay/topPaneOverlayPrimitive";
import { InfoLabelPrimitive } from "../overlay/infoLabelPrimitive";
import {
  IndicatorLinePrimitive,
  type IndicatorLineSet,
} from "../overlay/indicatorLinePrimitive";
import { HighLowMarkerPrimitive } from "../highLow/highLowMarkerPrimitive";
import { VolumeBarPrimitive } from "../volume/volumeBarPrimitive";
import { SarMarkerPrimitive } from "../indicator/sarMarkerPrimitive";
import { PaneBorderPrimitive } from "../border/paneBorderPrimitive";
import { GridPrimitive } from "../grid/gridPrimitive";
import { formatVolume, formatPrice, normalizeChartTime, formatTimeByFmt, formatAxisTime } from "../util/format";
import {
  isTimesharePeriod,
  timeshareVerticalCount,
  type PeriodValue,
} from "../periods";
import { AxisLabelPrimitive } from "../axis/axisLabelPrimitive";
import { CrosshairAxisLabelPrimitive } from "../crosshair/crosshairAxisLabelPrimitive";
import { CrosshairLineCapPrimitive } from "../crosshair/crosshairLineCapPrimitive";
import { CrosshairTooltip, type TooltipBounds } from "../crosshair/crosshairTooltip";
import { IndicatorManager } from "./indicatorManager";
import { CrosshairManager } from "./crosshairManager";
import { LIBRARY_TIME_AXIS_HEIGHT, PRICE_SCALE_MIN_WIDTH, VIEW_SHIFT_STEP } from "./constants";
import type { KLineChartOptions, MainIndicatorName, ChartLoadStatus } from "./types";
import type { ChartDataService } from "../../services/chartDataService";

/** 公共类型 re-export（App.vue 等外部使用者继续从本文件导入，保持接口稳定） */
export type { MainIndicatorName, KLineChartOptions } from "./types";

/** 控制器构造选项（re-export，见 types.ts） */
// （上方 export type 已统一转发）

export class KLineChartController {
  /** chart 实例（多 Pane 容器） */
  private readonly chart: ReturnType<typeof createChart>;
  /** 挂载容器（布局高度 / 实例标记 / ResizeObserver） */
  private readonly container: HTMLElement;
  /** K 线数据（ChartDataPoint：统一数据点类型，pointType='kline'，mock 120 根。
   *  直接作为指标库 / primitive / series 数据源，无内部中间类型。
   *  可变引用：service 拉取（setKlineData）整体替换、实时订阅（updateLastBar）原地更新。
   *  分时周期时存 pointType='timeshare' 点（price / avgPrice 口径，无 OHLC） */
  private bars: ChartDataPoint[] = [];
  /** 分时价格线（pane1，LineSeries；分时周期渲染 price，K 线周期 setData([]) 不可见） */
  private timesharePriceSeries: ISeriesApi<"Line"> | null = null
  /** 分时均价线（pane1，LineSeries；分时周期渲染 avgPrice） */
  private timeshareAvgSeries: ISeriesApi<"Line"> | null = null
  /** time → bar 索引（十字星 tooltip 命中取数 O(1)；批量重建 / 实时增量维护） */
  private barIndex = new Map<number, ChartDataPoint>();
  /** 各 Pane 像素高度（applyStretchFactors 更新；十字星 tooltip 定位 paneTop 用） */
  private paneHeights: number[] = [];
  /** 十字星数据浮层（v1.6.35：命中显示时间/OHLC/涨跌/涨幅/量额九项） */
  private readonly tooltip: CrosshairTooltip;
  /** 股票名称（pane0 顶部信息行显示：名称 [代码]） */
  private name: string;
  /** 股票代码（pane0 顶部信息行显示：名称 [代码]） */
  private symbol: string;
  /** 时间格式模板（v1.6.9 透传 KLineChart.vue format；undefined → 按周期自动） */
  private readonly timeFormat: string | undefined;
  /** 当前周期（v1.6.9 setPeriod 更新；pane0 信息行时间格式按周期切换） */
  private period: PeriodValue;
  /** 数据服务（init / loadEarlier 经其拉取历史与订阅实时；组件构造时注入） */
  private service: ChartDataService | undefined;
  /** 加载状态回调（可选；init 全流程状态通知） */
  private readonly onStatusChange: ((status: ChartLoadStatus) => void) | undefined;
  /** 数据加载请求序号（快速切换周期 / 标的时丢弃过期响应，防乱序覆盖） */
  private loadSeq = 0;
  /** 是否还有更早历史（返回不足 limit 或合并 0 新增 → false，防死循环） */
  private hasMoreHistory = true;
  /** 更早历史加载中标志（防抖：一次只允许一个在途请求） */
  private loadingEarlier = false;
  /** 实时订阅退订函数（周期 / 标的切换与 destroy 时调用） */
  private realtimeUnsubscribe: (() => void) | null = null;
  /** 可视逻辑范围变化处理：到达最左边缘（from ≤ 0）→ 触发更早历史加载（内部 loadEarlier） */
  private readonly handleVisibleLogicalRangeChange = (
    range: LogicalRange | null,
  ): void => {
    if (range && range.from <= 0) void this.loadEarlier();
  };

  /** K 线 series（pane1；红涨绿跌，上涨柱体空心） */
  private klineSeries: ISeriesApi<"Candlestick">;
  /** pane2 成交量信息行 series（InfoLabelPrimitive 挂载；竖线补齐 primitive 也挂这里） */
  private pane2InfoSeries: ISeriesApi<"Line">;
  /** 成交量 series（pane3；Histogram 仅作 scale 锚点，可见柱体由 primitive 自绘） */
  private volumeSeries: ISeriesApi<"Histogram">;

  /** 当前主题（深系 / 浅系） */
  private theme: ChartThemeName;
  /** 左刻度区开关状态（显隐全部 Pane 的 left price scale） */
  private showLeftScale: boolean;
  /** 右刻度区开关状态（显隐全部 Pane 的 right price scale） */
  private showRightScale: boolean;

  /** 容器尺寸监听（跟随容器高度重算固定 Pane 高度） */
  private resizeObserver: ResizeObserver | null = null;

  /** 指标管理器（主图 / 附图指标 + 信息行 + 成交量均量线） */
  private readonly indicatorManager: IndicatorManager;
  /** 十字星管理器（十字星移动联动 + 左刻度指示值） */
  private readonly crosshairManager: CrosshairManager;

  /** pane1 SAR 圆点 primitive（构造创建并 attach，destroy 显式 detach） */
  private sarMarkerPrimitive: SarMarkerPrimitive | null = null;
  /** pane1 主图指标线 primitive（IndicatorLinePrimitive，top 层自绘） */
  private indicatorLinePrimitive: IndicatorLinePrimitive | null = null;
  /** pane3 成交量均量线 primitive（IndicatorLinePrimitive，top 层自绘） */
  private volumeMaPrimitive: IndicatorLinePrimitive | null = null;

  constructor(options: KLineChartOptions) {
    this.container = options.container;
    this.showLeftScale = false;
    this.showRightScale = false;
    this.theme = "dark";
    // 股票信息（pane0 顶部信息行显示，格式：名称 [代码]）
    this.name = options.name ?? "";
    this.symbol = options.symbol ?? "";
    // 数据服务（组件构造时注入 props.service ?? defaultService；未注入则 init 报错不拉数）
    this.service = options.service;
    this.onStatusChange = options.onStatusChange;
    // 十字星数据浮层：挂 document.body（position: fixed，v1.6.40 脱离图表 DOM 树，
    // 杜绝层级 / 事件拦截不确定性；传入 chart 容器作为定位基准 rect）
    this.tooltip = new CrosshairTooltip(this.container, themeColors(this.theme));

    /* ---------- 0. 实例保护：容器打标记防重复创建 chart 实例 ----------
     * 组件重复挂载 / HMR / 路由切换时可能再次进入构造；标记在 destroy 时清除，
     * 保证同一容器同一时刻只有一个 chart 实例（防止内存泄漏与布局错乱）。
     */
    if (this.container.dataset.lwcMounted === "true") {
      throw new Error(
        "KLineChartController: 容器已挂载 chart 实例，禁止重复创建",
      );
    }
    this.container.dataset.lwcMounted = "true";

    /* ---------- 1. 创建 chart ---------- */
    const initialThemeColors = themeColors(this.theme);
    this.chart = createChart(this.container, {
      autoSize: true, // 自动跟随容器尺寸
      layout: {
        background: {
          type: ColorType.Solid,
          color: initialThemeColors.background,
        },
        textColor: initialThemeColors.textColor,
        fontSize: 12,
        fontFamily: chartFontFamily,
        attributionLogo: false,
        panes: {
          enableResize: false, // Pane 高度不可拖拽（由代码固定比例）
          // 分隔线颜色 = 背景色（视觉上不设置分割线）
          separatorColor: initialThemeColors.background,
          separatorHoverColor: initialThemeColors.background,
        },
      },
      // 十字星：Normal 模式 = 横竖线自由跟随鼠标（不吸附数据点）
      crosshair: {
        mode: CrosshairMode.Normal,
        // 横 / 竖线：半透明虚线（crosshairLineColor，深浅系区分）——
        // 穿过 MACD 红绿柱 / K 线 / 成交量柱时柱体透出，不被不透明线遮盖；
        // 时间轴（X 轴）十字星指示值标签背景跟随深浅系 crosshairLabelBackground
        // （文字颜色由库按背景亮度自动对比：深背景白字 / 浅背景黑字）
        vertLine: {
          color: initialThemeColors.crosshairLineColor,
          labelBackgroundColor: initialThemeColors.crosshairLabelBackground,
        },
        horzLine: {
          color: initialThemeColors.crosshairLineColor,
          labelBackgroundColor: initialThemeColors.crosshairLabelBackground,
        },
      },
      // 栅格化关闭：纵向 / 横向栅格线全部隐藏（栅格由 GridPrimitive 自绘）
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
      // 左右刻度区隐藏：数据区域铺满整个宽度（刻度区由开关显隐，见 setLeftScaleVisible）
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
        allowBoldLabels: false,
      },
      localization: {
        // 十字光标时间格式化：format 模板优先；缺省按周期自动
        // （日/周/月 → YYYY-MM-DD；分时 → HH:mm；分钟 K → YYYY-MM-DD HH:mm）
        timeFormatter: (t: Time) => {
          const ts = t as number
          return this.timeFormat
            ? formatTimeByFmt(ts, this.timeFormat)
            : formatAxisTime(ts, this.period)
        },
      },
    });

    /* ---------- 2. 管理器：指标 + 十字星 ----------
     * 指标管理器依赖惰性 getter（klineSeries / volumeSeries 尚未创建，
     * getter 在 draw / 调用时才求值，保证构建顺序安全）。
     */
    this.indicatorManager = new IndicatorManager({
      chart: this.chart,
      getBars: () => this.bars,
      getTheme: () => this.theme,
      getOverlayTime: () => this.crosshairManager.getOverlayTime(),
      getName: () => this.name,
      getSymbol: () => this.symbol,
      crosshairRegistry: this.crosshairManagerRegistry,
      onIndicatorStateChange: () => this.applyStretchFactors(),
      // v1.6.9：pane0 信息行时间格式（format 模板优先，缺省按周期自动）
      getTimeFormat: () => this.timeFormat,
      getPeriod: () => this.period,
    });
    // 十字星管理器：构造即订阅十字星移动（pane0 不触发 / 内容 Pane 注入左刻度指示值 /
    // 命中更新数据浮层 v1.6.35）
    this.crosshairManager = new CrosshairManager({
      chart: this.chart,
      tooltip: this.tooltip,
      getBarByTime: this.getBarByTime,
      getPaneTop: this.getPaneTop,
      getTimeText: this.getTimeText,
      getWidth: () => this.container.clientWidth,
      getTooltipBounds: (): TooltipBounds => ({
        // X：pane1~pane5 数据区左右缘（扣除左 / 右刻度区宽，开关打开时收窄）
        left: this.showLeftScale ? PRICE_SCALE_MIN_WIDTH : 0,
        right: this.container.clientWidth - (this.showRightScale ? PRICE_SCALE_MIN_WIDTH : 0),
        // Y：pane1 顶部 → pane5 底部（信息行 pane2/4 在内）
        top: this.getPaneTop(1),
        bottom: this.getPaneTop(5) + (this.paneHeights[5] ?? 0),
      }),
    });

    /* ---------- 3. pane0：顶部空 Pane（无数据，自绘"名称 [代码] 时间 + 指标值"） ---------- */
    this.chart
      .addSeries(
        LineSeries,
        {
          priceScaleId: "left",
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        0,
      )
      .attachPrimitive(
        // pane0 顶层遮罩（topPaneViews）：背景填充 + 信息行分段文字，绘制在十字星之上，
        // 借此遮住十字星竖线（实现"十字星不贯穿 pane0"）。
        // 分段结构：首段"股票名称 [代码] 时间"（主题文字色）+ 各指标值段
        // （MA/EXPMA/BOLL/BBI 用对应线色、SAR 随 trend 红/绿，见 IndicatorManager.buildInfoSegments）；
        // 时间与指标值均随十字星 —— 命中时 = 命中 bar、未命中时 = 最新 bar
        new TopPaneOverlayPrimitive(
          () => this.indicatorManager.buildInfoSegments(),
          () => themeColors(this.theme).background,
        ),
      );

    /* ---------- 4. pane1：K 线主图（红涨绿跌；上涨柱体空心） ----------
     * 空心实现：上涨（up）柱体填充色 = 图表背景色（视觉空心），
     * 边框 / 影线保留红色；下跌（down）柱体绿色实心。
     */
    this.klineSeries = this.chart.addSeries(
      CandlestickSeries,
      {
        priceScaleId: "left",
        upColor: initialThemeColors.background, // 上涨柱体填充 = 背景色（空心）
        downColor: initialThemeColors.downColor,
        borderUpColor: initialThemeColors.upColor, // 上涨边框红色
        borderDownColor: initialThemeColors.downColor,
        wickUpColor: initialThemeColors.upColor, // 上涨影线红色
        wickDownColor: initialThemeColors.downColor,
        priceLineVisible: false,
        lastValueVisible: false,
        // 隐藏库刻度标签（刻度区保留）：刻度值由 AxisLabelPrimitive 自绘并与栅格横线对齐
        priceFormat: {
          type: "custom",
          formatter: () => "",
        },
      },
      1,
    );
    // 分时双线（v1.7.0）：pane1 分时周期渲染 price / avgPrice 两条 LineSeries
    // （东财分时惯例：价格线 + 均价线），K 线周期 setData([]) 不可见。
    // 颜色随深浅系（theme.timesharePriceColor / timeshareAvgColor），主题切换时 applyTheme 同步
    const timeshareLineOptions = {
      priceScaleId: "left",
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false, // 十字星 marker 由库统一绘制，双线不重复出点
      lineWidth: 1,
      // 隐藏库刻度标签（刻度区保留）：刻度值由 AxisLabelPrimitive 自绘
      priceFormat: {
        type: "custom",
        formatter: () => "",
      },
    } as const;
    this.timesharePriceSeries = this.chart.addSeries(
      LineSeries,
      {
        ...timeshareLineOptions,
        color: initialThemeColors.timesharePriceColor,
      },
      1,
    );
    this.timeshareAvgSeries = this.chart.addSeries(
      LineSeries,
      {
        ...timeshareLineOptions,
        color: initialThemeColors.timeshareAvgColor,
      },
      1,
    );
    // 内容 Pane 边框（pane1）：自绘 1px 矩形，颜色随主题（深浅系区分）
    this.klineSeries.attachPrimitive(
      new PaneBorderPrimitive(() => themeColors(this.theme).paneBorder),
    );
    // pane1 栅格：竖 4 等分（分时按周期份数：1d=4 / 2d=2 / 3d=3 / 4d=4 / 5d=5）；
    // 横向等分数随指标开关变化（关 8 / 开 6）
    this.klineSeries.attachPrimitive(
      new GridPrimitive({
        getColor: () => themeColors(this.theme).grid,
        getHorizontalCount: () =>
          this.indicatorManager.getShowIndicator() ? 6 : 8,
        getVerticalCount: () =>
          this.isTimeshare ? timeshareVerticalCount(this.period) : 4,
      }),
    );
    // pane1 左刻度标签：与栅格横线对齐（值 = 横线处价格，K 线价格 2 位小数）。
    // series 动态取数（v1.7.0）：分时周期取 price 线（K 线空数据），K 线周期取 klineSeries
    this.klineSeries.attachPrimitive(
      new AxisLabelPrimitive({
        series: () => (this.isTimeshare ? this.timesharePriceSeries! : this.klineSeries),
        getPaneIndex: () => 1,
        getHorizontalCount: () =>
          this.indicatorManager.getShowIndicator() ? 6 : 8,
        getColor: () => themeColors(this.theme).textColor,
        getBackColor: () => themeColors(this.theme).background,
        getFont: () => chartFont,
        format: (price) => formatPrice(price),
      }),
    );
    // pane1 十字星左刻度指示值：十字星横线所在价格（K 线价格 2 位小数）。
    // series 动态取数（v1.7.0）：分时周期取 price 线，K 线周期取 klineSeries
    const pane1CrosshairLabel = new CrosshairAxisLabelPrimitive({
      series: () => (this.isTimeshare ? this.timesharePriceSeries! : this.klineSeries),
      getPaneIndex: () => 1,
      getColor: () => themeColors(this.theme).crosshairLabelText,
      getBackColor: () => themeColors(this.theme).crosshairLabelBackground,
      getFont: () => chartFont,
      format: (price) => formatPrice(price),
    });
    this.klineSeries.attachPrimitive(pane1CrosshairLabel);
    this.crosshairManager.registerPrimitive(pane1CrosshairLabel);
    // pane1 最高价 / 最低价标注：可视区域内 high 最大 / low 最小的 bar，
    // 最高价黄色标注在柱顶上方、最低价蓝色标注在柱底下方（各带同色实线
    // 连接到柱体上 / 下边缘中间，随平移 / 缩放实时重算）
    this.klineSeries.attachPrimitive(
      new HighLowMarkerPrimitive({
        series: this.klineSeries,
        getBars: () => this.bars,
        getHighColor: () => themeColors(this.theme).highMarkerColor,
        getLowColor: () => themeColors(this.theme).lowMarkerColor,
        getBackColor: () => themeColors(this.theme).crosshairLabelBackground,
      }),
    );
    // pane1 SAR 圆点：SarMarkerPrimitive 自绘（多头红 / 空头绿，zOrder normal 不遮十字星）；
    // 初始隐藏，由主图指标按钮开启（setMainIndicator('sar') 时 setVisible(true) + 重算数据）；
    // 数据源 = 指标管理器 SAR 缓存，显隐 / 换色由管理器统一控制（registerSarMarker）
    this.sarMarkerPrimitive = new SarMarkerPrimitive(
      this.chart,
      this.klineSeries,
      () => this.indicatorManager.getSarPoints(),
      themeColors(this.theme),
    );
    this.sarMarkerPrimitive.setVisible(false);
    this.klineSeries.attachPrimitive(this.sarMarkerPrimitive);
    this.indicatorManager.registerSarMarker(this.sarMarkerPrimitive);
    // pane1 主图指标线：IndicatorLinePrimitive 自绘（top canvas，十字星之上，
    // 不被十字星横线遮挡）；数据由 IndicatorManager.setMainIndicator 写入缓存现取
    this.indicatorLinePrimitive = new IndicatorLinePrimitive(
      (): IndicatorLineSet => ({
        lines: this.indicatorManager.getMainIndicatorLines(),
        getTimeScale: () => this.chart.timeScale(),
        anchorSeries: () => this.klineSeries,
      }),
    );
    this.klineSeries.attachPrimitive(this.indicatorLinePrimitive);
    // pane1 十字星竖线底部补齐（见 CrosshairLineCapPrimitive：填虚线最后空白段）
    this.klineSeries.attachPrimitive(this.createCrosshairLineCap());

    /* ---------- 5. pane2：成交量信息行（自绘分段文字，设置与 pane0 一致） ----------
     * 显示 "成交量: x  MA5: x  MA10: x"（数值随十字星命中 bar / 最新 bar）；
     * 用 InfoLabelPrimitive（**不填背景**）—— 十字星竖线需贯穿 pane2，
     * 不能像 pane0 那样用背景遮罩遮挡竖线。
     */
    this.pane2InfoSeries = this.chart.addSeries(
      LineSeries,
      {
        priceScaleId: "left",
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      2,
    );
    this.pane2InfoSeries.attachPrimitive(
      new InfoLabelPrimitive(() =>
        this.indicatorManager.buildVolumeInfoSegments(),
      ),
    );
    // pane2 十字星竖线底部补齐（见 CrosshairLineCapPrimitive：填虚线最后空白段）
    this.pane2InfoSeries.attachPrimitive(this.createCrosshairLineCap());

    /* ---------- 6. pane3：成交量（自绘柱体，视觉与 pane1 完全一致） ----------
     * HistogramSeries 仅作数据锚点：color = 背景色（不可见），
     * 用于建立 Y 轴（volume 值域）的 scale 范围；
     * 可见柱体由 VolumeBarPrimitive 自绘：
     *   上涨（close >= open）：空心红柱（背景填充 + 红框，同 pane1 上涨柱）
     *   下跌：绿色实心（同 pane1 下跌柱）
     *   柱宽 = optimalCandlestickWidth(barSpacing, dpr)（与 pane1 同函数，
     *   宽度 / 间隔绝对一致）
     */
    this.volumeSeries = this.chart.addSeries(
      HistogramSeries,
      {
        priceScaleId: "left",
        base: 0,
        color: initialThemeColors.background, // 不可见（仅建 scale）
        priceLineVisible: false,
        lastValueVisible: false,
        // 隐藏库刻度标签（刻度区保留）：刻度值由 AxisLabelPrimitive 自绘并与栅格横线对齐
        priceFormat: {
          type: "custom",
          formatter: () => "",
        },
      },
      3,
    );
    this.volumeSeries.attachPrimitive(
      new VolumeBarPrimitive(
        () => this.bars,
        () => themeColors(this.theme),
      ),
    );
    // 内容 Pane 边框（pane3）：自绘 1px 矩形，颜色随主题（深浅系区分）
    this.volumeSeries.attachPrimitive(
      new PaneBorderPrimitive(() => themeColors(this.theme).paneBorder),
    );
    // pane3 栅格：竖 4 等分（分时按周期份数）；横向 2 等分（中间 1 条）
    this.volumeSeries.attachPrimitive(
      new GridPrimitive({
        getColor: () => themeColors(this.theme).grid,
        getHorizontalCount: () => 2,
        getVerticalCount: () =>
          this.isTimeshare ? timeshareVerticalCount(this.period) : 4,
      }),
    );
    // pane3 左刻度标签：与栅格横线对齐（值 = 横线处成交量，万 / 亿格式化）
    this.volumeSeries.attachPrimitive(
      new AxisLabelPrimitive({
        series: this.volumeSeries,
        getPaneIndex: () => 3,
        getHorizontalCount: () => 2,
        getColor: () => themeColors(this.theme).textColor,
        getBackColor: () => themeColors(this.theme).background,
        getFont: () => chartFont,
        format: (volume) => formatVolume(Math.max(0, volume)),
      }),
    );
    // pane3 十字星左刻度指示值：十字星横线所在成交量（万 / 亿格式化，不小于 0）
    const pane3CrosshairLabel = new CrosshairAxisLabelPrimitive({
      series: this.volumeSeries,
      getPaneIndex: () => 3,
      getColor: () => themeColors(this.theme).crosshairLabelText,
      getBackColor: () => themeColors(this.theme).crosshairLabelBackground,
      getFont: () => chartFont,
      format: (volume) => formatVolume(Math.max(0, volume)),
    });
    this.volumeSeries.attachPrimitive(pane3CrosshairLabel);
    this.crosshairManager.registerPrimitive(pane3CrosshairLabel);

    /* 成交量均量线 VOL MA5 / MA10（东财成交量副图默认）：
     * 与成交量柱同 priceScaleId 'left'（同一量刻度）；
     * 用 IndicatorLinePrimitive 自绘（top canvas，十字星之上，不被横线遮挡）——
     * 数据由 IndicatorManager.rebuildVolumeData 写入缓存现取；颜色 = theme.volMa5 / volMa10 */
    this.volumeMaPrimitive = new IndicatorLinePrimitive(
      (): IndicatorLineSet => ({
        lines: this.indicatorManager.getVolumeMaLines(),
        getTimeScale: () => this.chart.timeScale(),
        anchorSeries: () => this.volumeSeries,
      }),
    );
    this.volumeSeries.attachPrimitive(this.volumeMaPrimitive);
    // pane3 十字星竖线底部补齐（见 CrosshairLineCapPrimitive：填虚线最后空白段）
    this.volumeSeries.attachPrimitive(this.createCrosshairLineCap());

    /* ---------- 7. pane4 / pane5：指标组（初始关闭） ----------
     * 指标层初始关闭（4 Pane：pane0..pane3，main : volume = 80 : 20）；
     * 用户点击附图指标按钮（setSubIndicator）时由 IndicatorManager 创建 pane4 / pane5
     * （60:20:20），关闭时移除 —— 布局随 getShowIndicator 状态重算。
     */

    /* ---------- 8. 高度分配：pane0 / pane2 / pane4 固定 topPaneHeight（同一 factor，绝对相等），pane1 K 线，pane3 成交量 / pane5 指标 ---------- */
    this.timeFormat = options.format;
    this.period = "day";

    this.applyStretchFactors();

    /* ---------- 9. 数据 + 首绘 ----------
     * 数据由组件经 ChartDataService 拉取后 setKlineData 注入（v1.6.16：
     * 控制器不再内置 Mock 生成，统一走 service 层，便于接入真实行情）。 */
    this.applyData();
    this.chart.timeScale().fitContent();

    /* ---------- 10. 容器尺寸监听：重算固定 Pane 高度（topPaneHeight） ---------- */
    this.resizeObserver = new ResizeObserver(() => this.applyStretchFactors());
    this.resizeObserver.observe(this.container);

    /* ---------- 11. 平移左滑到边缘 → 触发更早历史加载（回调组件拉取） ----------
     * 可视逻辑范围左边界 ≤ 0（到达最左边缘）时触发一次；
     * 组件侧防抖 + added=0 停止（见 loadEarlier），此处仅负责"到达边缘"信号。
     */
    this.chart
      .timeScale()
      .subscribeVisibleLogicalRangeChange(this.handleVisibleLogicalRangeChange);

    // v1.6.28：外部自定义数据直通（无 mock / http 环境时构造传入，
    // 跳过 service 拉取；series 已全部就绪，setKlineData 直接渲染 + fitContent）
    if (options.initialBars && options.initialBars.length > 0) {
      this.setKlineData(options.initialBars);
    }
  }

  /** 十字星指示值注册表适配器（IndicatorManager 需要注册 / 移除 pane5 的指示值 primitive） */
  private crosshairManagerRegistry = {
    registerPrimitive: (primitive: CrosshairAxisLabelPrimitive): void => {
      this.crosshairManager.registerPrimitive(primitive);
    },
    removeByPaneIndex: (paneIndex: number): void => {
      this.crosshairManager.removeByPaneIndex(paneIndex);
    },
  };

  /**
   * 十字星竖线底部补齐 primitive（pane1/2/3/4/5 各挂一个）：
   * 填库 LargeDashed 竖线因 pane 高度非虚线周期整数倍产生的底部空白段，
   * 使竖线视觉到底（见 CrosshairLineCapPrimitive 头注释）。
   * 颜色 / 时间 / x 全部动态获取（主题切换、十字星移动即时生效）。
   */
  private createCrosshairLineCap = (): CrosshairLineCapPrimitive =>
    new CrosshairLineCapPrimitive({
      getOverlayTime: () => this.crosshairManager.getOverlayTime(),
      getTimeScale: () => this.chart.timeScale(),
      getLineColor: () => themeColors(this.theme).crosshairLineColor,
    });

  /* ===================== 布局 ===================== */

  /**
   * 高度分配：固定空 Pane（pane0 / pane2 / pane4）设同一像素因子 topPaneHeight
   * （绝对相等），内容 Pane 按组比例分配剩余高度（指标开 60:20:20 / 关 80:20）。
   */
  private applyStretchFactors = (): void => {
    const panes = this.chart.panes();
    if (panes.length < 2) return;
    // 库实际可用高度 = 容器高度 - 时间轴高度（显隐按库当前状态）。
    // Pane 之间无间隔：库分隔线高度已通过 patch（node_modules dist
    // SeparatorConstants.SeparatorHeight: 1 → 0）置零，pane 紧贴、无 1px 预留。
    const timeAxisHeight = this.chart.timeScale().options().visible
      ? LIBRARY_TIME_AXIS_HEIGHT
      : 0;
    const usableHeight = this.container.clientHeight - timeAxisHeight;
    // 指标开启：3 个固定空 Pane、60:20:20；指标关闭：2 个固定空 Pane、80:20
    const fixedCount = this.indicatorManager.getShowIndicator()
      ? fixedPaneCount
      : fixedPaneCountWithoutIndicator;
    const ratios = this.indicatorManager.getShowIndicator()
      ? groupRatios
      : groupRatiosWithoutIndicator;
    const paneHeights = calcPaneHeights(
      usableHeight,
      topPaneHeight,
      fixedCount,
      ratios,
    );
    panes.forEach((pane, index) => pane.setStretchFactor(paneHeights[index]));
    // v1.6.35：记录各 Pane 像素高度（十字星 tooltip 定位：paneTop = 前序 Pane 高度累加）
    this.paneHeights = paneHeights;
  };

  /** 所在 pane 顶部 y（相对图表 canvas）：前序 Pane 像素高度累加（v1.6.35 tooltip 定位） */
  private getPaneTop = (paneIndex: number): number => {
    let top = 0
    for (let i = 0; i < paneIndex; i++) top += this.paneHeights[i] ?? 0
    return top
  };

  /** 当前周期是否为分时（1d~5d，v1.7.0）：
   *  pane1 双线（price/avgPrice）/ 成交量直方图 / 栅格份数 / 指标过滤（无 CR） /
   *  无主图指标 / App 平移缩放按钮隐藏 —— 全部由该判定统一驱动 */
  private get isTimeshare(): boolean {
    return isTimesharePeriod(this.period)
  }

  /* ===================== 数据 ===================== */

  /** K 线 / 成交量 / 指标数据写入（series 锚点 + 各 primitive 数据缓存重建） */
  private applyData = (): void => {
    // v1.6.10：setData 前统一归一化 time（非法条过滤），series 同步
    const normalized = this.bars
      .map((bar) => ({ bar, time: normalizeChartTime(bar.time) }))
      .filter((entry) => entry.time !== null);

    // —— 分时周期（v1.7.0）：pane1 双线 + pane3 直方图 ——
    if (this.isTimeshare) {
      // K 线 series 清空（分时无 OHLC 蜡烛），避免残留旧周期图形
      this.klineSeries.setData([]);
      this.timesharePriceSeries?.setData(
        normalized.map(({ bar, time }) => ({
          time: time as UTCTimestamp,
          value: bar.price ?? 0, // pointType='timeshare' 必含 price
        })),
      );
      this.timeshareAvgSeries?.setData(
        normalized.map(({ bar, time }) => ({
          time: time as UTCTimestamp,
          value: bar.avgPrice ?? 0, // pointType='timeshare' 必含 avgPrice
        })),
      );
      // 成交量直方图（分时）：Histogram 直接可见渲染，红绿按 price vs preClose 三态
      // （与 K 线柱体同一判定基准，v1.6.57 口径）——颜色逐点注入
      this.volumeSeries.applyOptions({ base: 0 });
      this.volumeSeries.setData(
        normalized.map(({ bar, time }) => {
          const preClose = bar.preClose ?? bar.price ?? 0
          const value = bar.volume ?? 0
          const colors = themeColors(this.theme)
          const color =
            (bar.price ?? 0) > preClose
              ? colors.upColor
              : (bar.price ?? 0) < preClose
                ? colors.downColor
                : colors.flatColor
          return { time: time as UTCTimestamp, value, color }
        }),
      );
      // 指标缓存重建（分时：成交量均量 / 附图指标 / 主图指标见 indicatorManager 守卫）
      this.indicatorManager.rebuildVolumeData();
      this.indicatorManager.rebuildIndicatorData();
      this.indicatorManager.refreshMainIndicatorData();
      return;
    }

    // —— K 线周期（原逻辑）：蜡烛 + 成交量自绘柱体 ——
    // K 线三态颜色（v1.6.57）：按 close vs preClose 红/绿/平盘，覆盖库默认 close>=open
    // 判定（一字板 open===close 会被库画成上涨红）；主题切换时 applyTheme 会重设数据刷新
    const barPalette = themeColors(this.theme)
    this.klineSeries.setData(
      normalized.map(({ bar, time }) => ({
        time: time as UTCTimestamp,
        open: bar.open!, // pointType='kline' 必含 OHLC（mock 已填全，非空断言）
        high: bar.high!,
        low: bar.low!,
        close: bar.close!,
        ...resolveBarColors(bar, barPalette),
      })),
    );
    // 分时双线清空（K 线周期不显示分时线）
    this.timesharePriceSeries?.setData([]);
    this.timeshareAvgSeries?.setData([]);
    // 成交量：Histogram 仅作 scale 锚点，颜色统一走 options.color（背景色，不可见），
    // 主题切换时由 applyTheme 同步更新；可见柱体由 VolumeBarPrimitive 按 bars 自绘
    this.volumeSeries.setData(
      normalized.map(({ bar, time }) => ({
        time: time as UTCTimestamp,
        value: bar.volume!, // pointType='kline' 必含 volume
      })),
    );
    // 成交量均量线 VOL MA5 / MA10 + pane2 信息行缓存（IndicatorManager 构建）
    this.indicatorManager.rebuildVolumeData();
    // 附图指标：指标层开启时按当前选中指标全量重建
    // （pane5 线 / 柱 / Y 轴锚点 + pane4 信息行值；数据变化时重算，series 关闭时跳过）
    this.indicatorManager.rebuildIndicatorData();
    // 主图指标：数据变化时按当前激活指标重建（指标未开时为空操作）
    this.indicatorManager.refreshMainIndicatorData();
  };

  /* ===================== 数据（service 集成） ===================== */

  /** 更新加载状态并回调外部（可选；状态仅作通知，不持久化） */
  private setStatus = (status: ChartLoadStatus): void => {
    this.onStatusChange?.(status);
  };

  /**
   * 首次初始化（v1.6.17 由组件统一调用，替代原组件 loadData + setupRealtime）：
   * 拉取最新一页历史 → setKlineData 全量重绘 + fitContent → 订阅实时推送。
   * 竞态保护：loadSeq 代际丢弃过期响应；失败 → status='error' 不抛异常。
   * 状态：'loading'（首载）→ 'ready' / 'error'。
   */
  init = async (): Promise<void> => {
    this.setStatus('loading');
    const seq = ++this.loadSeq;
    if (!this.service) {
      console.error('[KLineChart] init: 未注入 ChartDataService（组件构造时传 service）');
      this.setStatus('error');
      return;
    }
    try {
      const points = await this.service.fetchHistory({
        symbol: this.symbol,
        period: this.period,
        limit: this.service.fetchLimit,
      });
      if (seq !== this.loadSeq) return; // 期间又切换了周期 / 标的 → 丢弃过期响应
      // 返回满页说明还有更早数据，允许后续左滑边缘自动加载
      this.hasMoreHistory = points.length >= this.service.fetchLimit;
      this.setKlineData(points);
      this.setStatus('ready');
      this.startRealtime();
    } catch (error) {
      if (seq !== this.loadSeq) return;
      console.error('[KLineChart] init failed:', error);
      this.setStatus('error');
    }
  };

  /** 订阅实时行情（先退订旧订阅保证唯一；回调 = 控制器增量更新最后一根） */
  private startRealtime = (): void => {
    this.realtimeUnsubscribe?.();
    if (!this.service) return;
    this.realtimeUnsubscribe = this.service.subscribeRealtime(
      this.symbol,
      this.period,
      (point) => this.updateLastBar(point),
    );
  };

  /**
   * 加载更早一页历史（左滑到最左边缘自动触发）：
   * 以当前最早一根 time 为 before 锚点拉取更早页 → prependHistory 前置插入。
   * 停止条件：返回条数 < limit（服务语义：无更早数据）或合并新增 0（重复页）。
   */
  private loadEarlier = async (): Promise<void> => {
    if (this.loadingEarlier || !this.hasMoreHistory || !this.service) return;
    const earliest = this.getEarliestTime();
    if (earliest === undefined) return;
    this.loadingEarlier = true;
    const seq = this.loadSeq;
    // v1.6.20：左滑分页回传 'loading-older'（与首次加载 'loading' 区分）
    this.setStatus('loading-older');
    try {
      const points = await this.service.fetchHistory({
        symbol: this.symbol,
        period: this.period,
        before: earliest,
        limit: this.service.fetchLimit,
      });
      if (seq !== this.loadSeq) return; // 期间重新 init（周期 / 标的切换）→ 丢弃，状态由新 init 自己发
      const added = this.prependHistory(points);
      if (added === 0 || points.length < this.service.fetchLimit) this.hasMoreHistory = false;
      this.setStatus('ready');
    } catch (error) {
      if (seq !== this.loadSeq) return;
      console.error('[KLineChart] loadEarlier failed:', error);
      this.setStatus('error');
    } finally {
      this.loadingEarlier = false;
    }
  };

  /**
   * 外部数据整体写入（ChartDataService 拉取历史后调用）：
   * 按当前周期过滤数据点（K 线周期取 pointType='kline'，分时周期取 'timeshare'）→
   * 重建 series / 指标缓存并 fitContent（周期切换、首次加载统一入口）。
   * 分时周期为全量 N 日数据（1d~5d），不参与左滑翻页（hasMoreHistory=false）。
   */
  setKlineData = (points: ChartDataPoint[]): void => {
    this.bars = points.filter((point) =>
      this.isTimeshare ? point.pointType === "timeshare" : point.pointType === "kline",
    );
    this.rebuildBarIndex();
    this.applyData();
    // 分时数据为完整 N 个交易日（无更早分页），不触发左滑边缘加载
    if (this.isTimeshare) {
      this.hasMoreHistory = false;
    } else {
      this.hasMoreHistory = points.length >= (this.service?.fetchLimit ?? 0);
    }
    this.chart.timeScale().fitContent();
  };

  /**
   * 实时增量更新（ChartDataService 订阅回调）：
   *  - 同 time = 刷新最后一点（series.update 覆盖语义）；
   *  - time 更大 = 追加新点（实时推送）。
   * 按周期接收对应点类型：K 线周期收 pointType='kline'（update K 线 / 成交量锚点），
   * 分时周期收 'timeshare'（update 价格 / 均价线 / 成交量直方图）。指标缓存增量重建。
   */
  updateLastBar = (point: ChartDataPoint): void => {
    const expected = this.isTimeshare ? "timeshare" : "kline";
    if (point.pointType !== expected) return;
    // v1.6.10：time 统一归一化为数字秒（防 BusinessDay 对象 → series.update 报错）
    const time = normalizeChartTime(point.time);
    if (time === null) return;
    // 越界防御：新 time 早于最后一根（周期切换残留 / 旧周期实时推送）→ 忽略，
    // 避免 lightweight-charts "Cannot update oldest data, last time=[object Object]"
    const last = this.bars[this.bars.length - 1];
    if (last && time < normalizeChartTime(last.time)!) return;
    if (this.isTimeshare) {
      // 分时：更新价格 / 均价线 + 成交量直方图（红绿按 price vs preClose 三态）
      this.timesharePriceSeries?.update({
        time: time as UTCTimestamp,
        value: point.price ?? 0,
      });
      this.timeshareAvgSeries?.update({
        time: time as UTCTimestamp,
        value: point.avgPrice ?? 0,
      });
      const preClose = point.preClose ?? point.price ?? 0
      const colors = themeColors(this.theme)
      this.volumeSeries.update({
        time: time as UTCTimestamp,
        value: point.volume ?? 0,
        color:
          (point.price ?? 0) > preClose
            ? colors.upColor
            : (point.price ?? 0) < preClose
              ? colors.downColor
              : colors.flatColor,
      });
    } else {
      this.klineSeries.update({
        time: time as UTCTimestamp,
        open: point.open!,
        high: point.high!,
        low: point.low!,
        close: point.close!,
        ...resolveBarColors(point, themeColors(this.theme)), // 三态色随实时数据更新（v1.6.57）
      });
      this.volumeSeries.update({
        time: time as UTCTimestamp,
        value: point.volume ?? 0,
      });
    }
    if (last && time > normalizeChartTime(last.time)!) {
      this.bars.push({ ...point, time });
    } else {
      const index = this.bars.findIndex(
        (bar) => normalizeChartTime(bar.time) === time,
      );
      if (index >= 0) this.bars[index] = { ...point, time };
    }
    // 实时增量维护 tooltip 索引（O(1)；批量场景走 rebuildBarIndex）
    this.barIndex.set(time, { ...point, time });
    this.indicatorManager.rebuildVolumeData();
    this.indicatorManager.refreshMainIndicatorData();
    this.indicatorManager.rebuildIndicatorData();
  };

  /**
   * 更早历史前置插入（平移左滑到边缘 → 组件拉取更早页后调用）：
   * 过滤 kline 点 → 前置合并（去重 / 升序，见 mergeBars）→ 重建 series / 指标缓存 →
   * 视口逻辑范围右移 added（保持用户当前看到的数据位置不变）。
   * @returns 实际新增条数（0 = 无更早数据，调用方停止后续触发）
   */
  prependHistory = (points: ChartDataPoint[]): number => {
    // 按当前周期过滤（分时周期 hasMoreHistory=false 不会触发翻页，此处统一防御）
    const incoming = points.filter((point) =>
      this.isTimeshare ? point.pointType === "timeshare" : point.pointType === "kline",
    );
    if (!incoming.length) return 0;
    const { bars, added } = mergeBars(this.bars, incoming);
    if (added === 0) return 0;
    // 保存当前可见逻辑范围，setData 后偏移恢复（新数据前置 → 原有数据右移 added 根）
    const range = this.chart.timeScale().getVisibleLogicalRange();
    this.bars = bars;
    this.rebuildBarIndex();
    this.applyData();
    if (range) {
      this.chart.timeScale().setVisibleLogicalRange({
        from: range.from + added,
        to: range.to + added,
      });
    }
    return added;
  };

  /** 重建 time → bar 索引（批量数据变更后调用：setKlineData / prependHistory） */
  private rebuildBarIndex = (): void => {
    this.barIndex = new Map(this.bars.map((bar) => [bar.time, bar]));
  };

  /** 按 time 取整根 K 线（十字星 tooltip 命中数据源，O(1) 索引） */
  private getBarByTime = (time: number): ChartDataPoint | undefined =>
    this.barIndex.get(time);

  /** 时间文本（十字星 tooltip 时间列；与 pane0 信息行同款格式：format 模板或按周期自动） */
  private getTimeText = (time: number): string =>
    this.timeFormat ? formatTimeByFmt(time, this.timeFormat) : formatAxisTime(time, this.period);

  /** 当前最早一根 K 线 time（无数据时 undefined；组件用作 before 分页锚点） */
  getEarliestTime = (): number | undefined => this.bars[0]?.time;

  /* ===================== 对外 API ===================== */

  /** 主题切换（深系 / 浅系）：不改变 X 轴视口 / 布局尺寸 */
  /**
   * 周期切换（v1.6.9）：pane0 信息行时间格式随周期变化
   * （日/周/月 → YYYY-MM-DD；分时 → HH:mm；分钟 K → YYYY-MM-DD HH:mm）。
   * 信息行分段在 draw 时现取 getPeriod，此处仅存值 + requestUpdate 触发重绘。
   */
  /** 更新股票代码（v1.6.22 修复：props.symbol 变化时 init 用新标的拉数）；
   *  惰性 getter 现取 this.symbol，触发重绘即刷新 pane0 信息行 */
  setSymbol = (symbol: string): void => {
    this.symbol = symbol;
    this.chart.applyOptions({});
  };

  /** 更新股票名称（pane0 信息行：名称 [代码]） */
  setName = (name: string): void => {
    this.name = name;
    this.chart.applyOptions({});
  };

  /** 更新数据服务实例（v1.6.22 修复：props.service 变化时 init 用新服务拉数） */
  setService = (service: ChartDataService): void => {
    this.service = service;
  };

  setPeriod = (period: PeriodValue): void => {
    if (this.period === period) return;
    this.period = period;
    // 分时不可平移（v1.7.0）：分时整日数据 fitContent 固定视口，滚轮 / 按住拖拽 /
    // 触摸平移全部关闭（缩放仍由工具栏按钮控制，handleScale 全局已禁滚轮）；
    // 切回 K 线周期恢复默认平移交互
    this.chart.applyOptions({
      handleScroll: this.isTimeshare
        ? {
            mouseWheel: false,
            pressedMouseMove: false,
            horzTouchDrag: false,
            vertTouchDrag: false,
          }
        : {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: true,
          },
    });
  };

  applyTheme = (name: ChartThemeName): void => {
    this.theme = name;
    const themeColorSet = themeColors(name);
    this.tooltip.setTheme(themeColorSet);
    this.chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: themeColorSet.background },
        textColor: themeColorSet.textColor,
        panes: {
          // 分隔线颜色跟随背景（保持分割线不可见）
          separatorColor: themeColorSet.background,
          separatorHoverColor: themeColorSet.background,
        },
      },
      // 栅格保持关闭（栅格由 GridPrimitive 自绘，draw 时现取新主题色）
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      // 十字星线颜色 + 指示值标签背景跟随主题（半透明线深浅系区分；
      // 时间轴 + 价格轴标签文字颜色库自动黑白对比）
      crosshair: {
        vertLine: {
          color: themeColorSet.crosshairLineColor,
          labelBackgroundColor: themeColorSet.crosshairLabelBackground,
        },
        horzLine: {
          color: themeColorSet.crosshairLineColor,
          labelBackgroundColor: themeColorSet.crosshairLabelBackground,
        },
      },
    });
    // K 线换色（上涨柱体填充跟随背景色保持空心）
    this.klineSeries.applyOptions({
      upColor: themeColorSet.background, // 空心填充 = 新主题背景色
      downColor: themeColorSet.downColor,
      borderUpColor: themeColorSet.upColor,
      borderDownColor: themeColorSet.downColor,
      wickUpColor: themeColorSet.upColor,
      wickDownColor: themeColorSet.downColor,
    });
    // 分时双线颜色跟随主题（深浅系区分，v1.7.0）
    this.timesharePriceSeries?.applyOptions({ color: themeColorSet.timesharePriceColor });
    this.timeshareAvgSeries?.applyOptions({ color: themeColorSet.timeshareAvgColor });
    // 成交量锚点色跟随背景（保持不可见）；可见柱体由 primitive 动态取新主题色
    this.volumeSeries.applyOptions({ color: themeColorSet.background });
    // 指标相关颜色（MACD 锚点 / SAR 圆点 / 成交量均量线）由指标管理器统一同步
    this.indicatorManager.updateThemeColors(themeColorSet);
    // K 线逐根三态色基于主题 palette（红/绿/平盘），主题切换后重设数据刷新（v1.6.57）；
    // 分时周期无 K 线数据（bars 为 timeshare 点），跳过防 NaN（v1.7.0）
    if (!this.isTimeshare) this.refreshKlineColors(themeColorSet);
    // 空 Pane 文字颜色在 draw 时动态取色，applyOptions 触发重绘即自动更新
  };

  /** 按当前主题重设 K 线逐根三态色（主题切换时调用，不动数据与指标） */
  private refreshKlineColors = (palette: BarPalette): void => {
    const points = this.bars
      .map((bar) => {
        const time = normalizeChartTime(bar.time)
        if (time === null) return null
        return {
          time: time as UTCTimestamp,
          open: bar.open!,
          high: bar.high!,
          low: bar.low!,
          close: bar.close!,
          ...resolveBarColors(bar, palette),
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
    this.klineSeries.setData(points)
  };

  /** 放大（X 轴 barSpacing ×1.25，限幅） */
  zoomIn = (): void => {
    const timeScaleApi = this.chart.timeScale();
    const barSpacing = timeScaleApi.options().barSpacing;
    timeScaleApi.applyOptions({ barSpacing: Math.min(barSpacing * 1.25, 80) });
  };

  /** 缩小（X 轴 barSpacing ÷1.25，限幅） */
  zoomOut = (): void => {
    const timeScaleApi = this.chart.timeScale();
    const barSpacing = timeScaleApi.options().barSpacing;
    // 下限 0.5 = 库 timeScale 最小 barSpacing：可一路缩到全部数据可见（极致缩小）
    timeScaleApi.applyOptions({ barSpacing: Math.max(barSpacing / 1.25, 0.5) });
  };

  /**
   * 左移（视口向左平移 50 根K线，看更早数据）。
   * 用逻辑范围平移替代 scrollToPosition（后者距右边缘不足一屏时减幅变负被 clamp，
   * 直接跳到最新数据末尾）；逻辑范围平移到达最左自然停止，无跳变。
   */
  shiftLeft = (): void => {
    const timeScaleApi = this.chart.timeScale();
    const range = timeScaleApi.getVisibleLogicalRange();
    if (!range) return;
    timeScaleApi.setVisibleLogicalRange({
      from: range.from - VIEW_SHIFT_STEP,
      to: range.to - VIEW_SHIFT_STEP,
    });
  };

  /** 右移（视口向右平移 50 根K线，看更晚数据；到达最右自然停止，不跳变） */
  shiftRight = (): void => {
    const timeScaleApi = this.chart.timeScale();
    const range = timeScaleApi.getVisibleLogicalRange();
    if (!range) return;
    timeScaleApi.setVisibleLogicalRange({
      from: range.from + VIEW_SHIFT_STEP,
      to: range.to + VIEW_SHIFT_STEP,
    });
  };

  /** 设置主图指标（互斥单选；转发至指标管理器，null = 关闭） */
  setMainIndicator = (name: MainIndicatorName | null): void => {
    this.indicatorManager.setMainIndicator(name);
  };

  /** 设置附图指标（互斥单选；转发至指标管理器，null = 关闭指标层） */
  setSubIndicator = (
    name: import("../indicator").SubIndicatorType | null,
  ): void => {
    this.indicatorManager.setSubIndicator(name);
  };

  /** 时间轴开关：切换显隐后重算 pane 高度（时间轴高度占用随之变化，保证固定空 Pane 仍绝对相等） */
  toggleTimeAxis = (visible: boolean): void => {
    this.chart.timeScale().applyOptions({ visible });
    this.applyStretchFactors();
  };

  /** 左刻度区开关：显隐所有 Pane 的 left price scale（视图内数据不变） */
  setLeftScaleVisible = (visible: boolean): void => {
    if (this.showLeftScale === visible) return;
    this.showLeftScale = visible;
    this.applyPriceScaleVisible("left", visible);
  };

  /** 右刻度区开关：显隐所有 Pane 的 right price scale（视图内数据不变） */
  setRightScaleVisible = (visible: boolean): void => {
    if (this.showRightScale === visible) return;
    this.showRightScale = visible;
    this.applyPriceScaleVisible("right", visible);
  };

  /** 刻度区统一应用（左右宽度一致）：逐个 Pane 设置 price scale 显隐与最小宽度。
   *  切换前后**保持当前可见时间范围不变**——刻度区开关只改变数据区宽度，
   *  不改变视图内的数据（不再 fitContent 重置视口）。 */
  private applyPriceScaleVisible = (
    side: "left" | "right",
    visible: boolean,
  ): void => {
    // 保存当前可见时间范围（秒级 {from, to}），宽度变化后恢复（视图内数据不变）
    const visibleRange = this.chart.timeScale().getVisibleRange();
    const panes = this.chart.panes();
    panes.forEach((_, paneIndex) => {
      this.chart.priceScale(side, paneIndex).applyOptions({
        visible,
        borderVisible: false, // 刻度区无边框
        minimumWidth: visible ? PRICE_SCALE_MIN_WIDTH : 0, // 关闭时不占位；打开时左右宽度一致
      });
    });
    // 恢复原可见时间范围（刻度区开关仅改变数据区宽度，不改变视图内的数据）
    if (visibleRange) this.chart.timeScale().setVisibleRange(visibleRange);
  };

  /** 销毁：移除监听 / primitive / chart / 清除实例标记（防内存泄漏） */
  destroy = (): void => {
    // 退订实时推送 + 使在途 init / loadEarlier 请求失效（destroyed 语义）
    this.realtimeUnsubscribe?.();
    this.realtimeUnsubscribe = null;
    this.loadSeq++;
    // 十字星管理器退订监听 + 清空指示值 primitive 引用
    this.crosshairManager.destroy();
    // 移除十字星数据浮层节点（防泄漏）
    this.tooltip.destroy();
    // 指标管理器清空全部内部引用 / 缓存
    this.indicatorManager.destroy();
    // 卸载 SAR 圆点 primitive（挂在 klineSeries 上，随 chart.remove 一起释放，显式 detach 更保险）
    if (this.sarMarkerPrimitive) {
      this.klineSeries.detachPrimitive(this.sarMarkerPrimitive);
      this.sarMarkerPrimitive = null;
    }
    // 卸载主图指标线 primitive（同挂在 klineSeries 上）
    if (this.indicatorLinePrimitive) {
      this.klineSeries.detachPrimitive(this.indicatorLinePrimitive);
      this.indicatorLinePrimitive = null;
    }
    // 卸载成交量均量线 primitive（挂在 volumeSeries 上）
    if (this.volumeMaPrimitive) {
      this.volumeSeries.detachPrimitive(this.volumeMaPrimitive);
      this.volumeMaPrimitive = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.chart
      .timeScale()
      .unsubscribeVisibleLogicalRangeChange(
        this.handleVisibleLogicalRangeChange,
      );
    this.chart.remove();
    this.container.dataset.lwcMounted = "false";
  };
}
