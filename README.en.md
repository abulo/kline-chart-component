# Multi-Pane K-Line Component (Vue3 + TypeScript + lightweight-charts v5)

A multi-pane K-line chart component: multiple panes inside one `chart` (native multi-pane support of lightweight-charts v5), including a top info row (name [code] time + main indicator values), the K-line main chart, volume, and a sub-indicator pane (ten mutually exclusive indicators: RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR). The indicator pane is dynamically shown / hidden based on the selected indicator.

---

## 1. Layout Structure

With indicators **enabled** (6 panes, `main : volume : indicator = 60 : 20 : 20`):

```
┌──────────────────────────────────────┐
│ pane0  Info row (name[code] time + indicator values [per-line colors], follows crosshair) │
│ pane1  K-line main chart (Candlestick)   │  ← main group 60%
│ pane2  Volume info row (volume + MA5/MA10)│
│ pane3  Volume (self-drawn red/green bars) │  ← volume group 20%
│ pane4  Indicator info row (line values, fixed 22px)│
│ pane5  Sub indicator (ten mutually exclusive)     │  ← indicator group 20%
└──────────────────────────────────────┘
    Bottom: shared time scale (timeAxis, toggleable)
```

With indicators **disabled** (4 panes, `main : volume = 80 : 20`): pane4 / pane5 are removed, pane1 / pane3 ratios become 80 : 20.

Height allocation (same whether the time axis is on or off; only the usable height differs):
- Empty panes are fixed at `topPaneHeight = 22px` (same stretchFactor, exactly equal);
- Remaining height is split by group ratios (`calcPaneHeights` pure function, see `chart/core/layout.ts`);
- Pixel-factor approach: `stretchFactor` is set directly to the target pixel height → no rounding error, panes fully fill the space;
- Pane heights are not resizable (`layout.panes.enableResize: false`); separators between panes use the library default 1px (an earlier script patched `SeparatorHeight` to 0, but the crosshair "not reaching bottom" issue was fixed at the source layer via dash phase alignment, so the patch script was removed).

## 2. Visuals & Interaction

- **Theme switching**: dark / light palettes are fully centralized in `theme.ts` (`ChartThemeColors` + `chartThemes`, no scattered hard-coded colors on the page); on switch, App.vue also syncs the **html page background** (independent `pageBackground`: dark #0B0E13 / light #EDEFF3, contrasting with the chart background #131722 / #FFFFFF) plus the chart `applyTheme`;
- **Red up / green down**: up `#FF0000`, down `#008000` (identical for both themes, centralized in `theme.ts`);
- **Hollow up bars**: K-line / volume / MACD bars > 0 are "background-filled + red outline" hollow red bars; down bars are solid green;
- **Consistent bar width**: pane1 / pane3 / pane5 bar width = `candlestickBarWidth(barSpacing, dpr)` (library's original `optimalCandlestickWidth` + odd/even fix, see `chart/core/candlestickWidth.ts`), width / spacing exactly identical;
- **Self-drawn grid** (`GridPrimitive`, zOrder 'bottom', below the data):
  - Vertical lines: 4 divisions (3 lines);
  - Horizontal lines: pane1 8 divisions with indicator off / 6 with indicator on; pane3 / pane5 2 divisions (1 middle line);
  - Grid is fixed in pane-local coordinates, does not move when panning / zooming the data;
- **Self-drawn left axis labels** (`AxisLabelPrimitive` + `AxisLabelView` + `AxisLabelPaneView`):
  - Label positions exactly align with grid horizontal lines (same division formula), value = real-time price at that y (coordinateToPrice back-calculation, changes with pan / zoom);
  - Row count = divisions + 1 (first/last inset 8px to avoid clipping): pane1 = 9 / 7 labels, pane3 / pane5 = 3;
  - pane5 middle label is fixed at 0 (MACD splits positive/negative at the 0 axis);
  - **Text settings fully identical to the crosshair indicator value** (shared `drawAxisLabel`: right-aligned, 6px from right edge, 6px background padding left/right, 18px tall, 12px chartFontFamily, color follows theme);
- **Crosshair left-axis indicator value** (`CrosshairAxisLabelPrimitive` + `CrosshairAxisLabelPaneView`):
  - On crosshair move, draws the value label of the horizontal line in the left axis area (price / volume / MACD value, refreshed frame-by-frame with the mouse);
  - **Background block & text colors follow the dark/light theme** (`crosshairLabelBackground` / `crosshairLabelText`, see theme.ts): dark background #2A2E39 / text #D1D4DC, light background #F0F2F5 / text #33373E;
  - Implementation: `priceAxisPaneViews` + zOrder 'top' (price-axis top canvas, Cursor-level redraw, smooth without lag);
  - Coordinates: library `point.y` is a pane-local coordinate, injected directly without previous-pane height conversion;
  - Text drawn right-aligned (`textAlign = 'right'`) to avoid clipping beyond the price-axis canvas;
- **Crosshair data tooltip** (`CrosshairTooltip`, v1.6.35): when the crosshair hits (pane1/3/5), follows the mouse and shows nine data items — time / open / close / high / low / change / change% / volume / amount;
  - **Time format consistent with the pane0 info row** (`format` template or automatic per period, see §5.2 format);
  - **Change / change% are red-up / green-down** (theme.upColor / downColor), other text uses the theme default color;
  - Background / border / text colors follow the theme (`tooltipBackground` / `tooltipText` / `paneBorder`);
  - **Entry-side positioning (v1.6.43 fix)**: mouse enters from the left half → tooltip anchors to the **top-right corner of pane1** (K-line main chart); enters from the right half → anchors to the **top-left corner of pane1** (no longer follows the mouse or the hit pane);
  - **Movable / draggable area (v1.6.58)**: both the default corner position and the drag clamp bounds are limited to the **pane1~pane5 data area** (`TooltipBounds` injected on each hit): X excludes the left / right axis widths (tooltip never overflows into the axis areas when axis toggles are on), Y from pane1 top to pane5 bottom;
  - **Drag & selection (v1.6.53 press-to-drag / v1.6.59 performance)**: **pressing anywhere on the tooltip starts a drag** (no ≡ handle icon, grab cursor) — moving ≥ 4px after press drags the tooltip (userSelect:none while dragging), position is fixed after release until the mouse leaves the chart, re-entering re-anchors to a corner; **no movement = click** (single-click focuses cursor / **double-click selects a word / triple-click selects a line** still work, no conflict with drag); the drag clamp is extracted as the pure function `clampTooltipPosition` (unit-testable); during drag the container coordinate origin is cached (no per-frame getBoundingClientRect forced reflow);
  - **Text selectable (v1.6.48 root-cause fix)**: tooltip body is freely selectable / copyable; tooltip anchors to a corner;
  - **Selectable root-cause fix (v1.6.48)**: the tooltip is mounted on body (outside the chart DOM); moving the mouse into the tooltip makes lightweight-charts dispatch mouseleave to the chart container → clears crosshair → crosshairMove(null) → the not-hit branch hides the tooltip (text cannot be selected). Fix: the tooltip records hover state (mouseenter / mouseleave → `isHovered`), and the `applyCrosshairMove` not-hit branch skips hide / time rollback / indicator clearing while the mouse still hovers the tooltip, so selection works normally (verified with CDP: stays visible on hover, press-drag selects text, selection persists after release);
    No drag handle (drag handle removed in v1.6.42); leaving the chart and re-entering re-anchors per the new entry side;
  - **Mounting & anti-flicker (v1.6.40)**: the tooltip is mounted on document.body (position: fixed), outside the chart DOM tree; after showing, only text is updated, no repositioning / no forced reflow (idempotent show, no high-frequency flashing);
  - Performance: nine rows are pre-created as fixed nodes (only textContent updates, no innerHTML), crosshair events reuse the rAF throttle (at most one DOM update per frame), hit data lookup goes through the time→bar index O(1) (maintained incrementally in real time);
  - Positioning algorithm extracted as the pure function `resolveTooltipPosition` (unit-covered: corner anchoring / drag fixation / out-of-bounds clamp);
- **Crosshair does not pierce pane0**: crosshair is not triggered inside pane0 (cleared by controller); the pane0 top overlay (`TopPaneOverlayPrimitive`, zOrder 'top') covers the vertical line with the background color;
- **Keyboard arrow-key crosshair navigation (v1.7.1)**: in K-line mode (also works for timeshare 1d~5d), **each Left/Right arrow press moves the crosshair exactly 1 bar** — the base index is the currently hit bar (`overlayTime` reverse lookup, so mouse and keyboard positions stay in sync); when inactive (`overlayTime` null) it starts from the last bar; the target index is delegated to the pure function `viewport.computeCrosshairTargetIndex` (clamped to `[0, lastIndex]`, unit-testable); positioning uses `chart.setCrosshairPosition(price, time, mainSeries)` — the library redraws the vertical/horizontal lines and axis labels and fires the crosshairMove event → `CrosshairManager` links the tooltip / pane0 info line / left-axis indicator values (the same pipeline as mouse hits); K-line price = `bar.close`, timeshare price = `bar.price`; the component keydown handler (KLineChart.vue) ignores the keys inside input controls and calls `preventDefault` to stop page scrolling; **"double vertical line" fix (v1.7.1)**: the crosshairMove event fired by `setCrosshairPosition` only updates `overlayTime` on the *next* frame (rAF-throttled) — on the same frame `CrosshairLineCapPrimitive` still draws its line at the old `overlayTime`, producing two offset vertical lines; the controller now calls `CrosshairManager.setOverlayTimeByKeyboard(time)` right after `setCrosshairPosition` so the cap line aligns with the library line on the same frame (the later rAF event writes the same value, no side effects); **cache memory management (v1.7.1)**: MockChartDataService caches now use LRU caps (`touchCache` pure function, module-level, unit-tested) — daily/timeshare pools keep max 4 symbols, derived period pools (week/month/minute K; 1-min K is ~14k bars per symbol) keep max 8 keys, realtime timers keep max 8 subscriptions; evicting the least-recently-used entry prevents unbounded growth on symbol switching; price-line label inverse text extracted to `priceLabelInverseText` (theme.ts), no hard-coded colors in components;
**arrow-key hold auto-repeat (v1.7.1)**: native browser keydown repeat has a ~500ms initial delay and is capped by the OS repeat rate — replaced by a custom beat (`KEYBOARD_REPEAT_MS=40`, KLineChart.vue): the first press moves 1 bar immediately, then 1 bar every 40ms (~25 bars/s); `event.repeat` repeats are ignored to avoid double speed; stops on keyup / window blur / unmount (leak-safe); measured: holding Left for 500ms moves ~19 bars (daily candles include weekends);
**keyboard crosshair viewport follow (v1.7.1)**: when arrow keys move the crosshair past the last visible bar (left/right edge), the target bar lies outside the viewport — `getCrosshairScrollOffset` (pure function) computes the scroll amount and the viewport pans so the target becomes visible (at the edge it pans exactly 1 bar; farther gaps scroll in one step, e.g. pressing an arrow while inactive makes the crosshair immediately visible); measured: viewport [280,399], hovering edge bar 280 → ArrowLeft → viewport [279,398], crosshair hits 279;
**"tooltip update delay" fix (v1.7.1)**: the tooltip also updates through the rAF event pipeline (the new bar's `tooltip.show` only runs on the *next* frame), so it lags during rapid key presses — the controller now calls `CrosshairManager.syncKeyboardMove(bar, time, pane1LocalY)` right after `setCrosshairPosition` to align the full chain on the same frame (overlayTime + tooltip data + left-axis indicator values; the indicator value is injected only into pane1 since the keyboard line sits at the main series' close/price); **"double vertical line" final resolution — custom cap line removed (v1.7.1)**: after several alignment fixes (window mousemove mouse lookup / drag-state hover fallback bypass / precise data-area x) edge cases still misaligned (drag path crossing the tooltip overlay, bar-center snap vs exact library follow). The custom thin vertical line (`CrosshairLineCapPrimitive` / `CrosshairLineCapPaneView`, mounted on panes 1~5) is **deleted entirely** — only the library vertical line remains (`CrosshairMode.Normal`, exactly follows the mouse; keyboard moves are driven by `setCrosshairPosition`). Cleaned up together: `CrosshairManager`'s window mousemove/mousedown/mouseup tracking and keyboard-x injection, controller `getCrosshairX`, IndicatorManager/SubIndicatorPaneManager passthrough, and debug probes (capX/lastMouseX/keyboardX...). Keyboard crosshair navigation stays (`syncKeyboardMove` aligns overlayTime/tooltip/left-axis indicator values); measured hover / keyboard / drag all show a **single vertical line**;
- **Crosshair thin dashed line** (`CrosshairLineCapPrimitive` + `CrosshairLineCapPaneView`, v1.4.101): the vertical line is redrawn on the top layer as a 0.75 CSS px subpixel thin dashed line (dash period [1,1] physical px (densest)), with a solid segment at the bottom to guarantee "reaching the bottom"; horizontal/vertical line color `crosshairLineColor` at 0.25 opacity (dark/light themed, theme.ts), visually thinner and fainter; the library's own crosshair lines are kept (the time-axis time label depends on library drawing);
- **Indicator overlays drawn above the crosshair** (`IndicatorLinePrimitive`, zOrder 'top' self-drawn on the top canvas): main indicator lines (MA / EXPMA / BOLL / BBI) and volume average lines (VOL MA5 / MA10) are self-drawn polylines above the crosshair — when the crosshair horizontal line passes through, indicator lines remain fully visible (the library draws the crosshair above series on the top canvas, so LineSeries would always be covered by the horizontal line; hence self-drawing); coordinates = timeScale.timeToCoordinate × anchorSeries.priceToCoordinate, clipped by the visible time range, paths broken where coordinates are missing;
- **Content pane borders** (`PaneBorderPrimitive`): pane1 / pane3 / pane5 self-drawn 1px rectangular borders, theme-colored; drawn in bitmap physical pixels (always flush with the rightmost canvas edge when zoomed, no subpixel gaps);
- **High / low price markers** (`HighLowMarkerPrimitive` + `HighLowMarkerPaneView`): in the pane1 visible range, the bar with the max high / min low — highest price marked with 12px yellow text above the top of the body, lowest price with 12px blue text below the bottom, each with a same-color solid line from the text block to the middle of the body's top / bottom edge; recomputed in real time on pan / zoom, text never overflows horizontally; theme-colored (theme.highMarkerColor / lowMarkerColor);
- **Last-price line** (`PriceLinePrimitive` + `PriceLinePaneView`, v1.7.1): the library's native priceLine only supports `LastBar` (real last bar — disappears when panning left as the last bar leaves the viewport) or `LastVisible` (rightmost visible bar — visible when panning, but shows a historical price, losing the "last price" semantics). This component draws it manually:
  - **Price = the real last K-line bar's close** (`findLastKlineBar` scans backwards, skipping timeshare points; pure function with unit tests in `tests/priceLine.test.ts`);
  - The dashed line spans the **full pane1 width** (1px, `setLineDash([6,4])`, mimicking the library's dashed style) with a price label inside the right edge (line-colored background + auto black/white text by luminance);
  - **Clamping**: when the last price is outside the current viewport's price range (e.g. panning left through history), the line clamps to the top / bottom edge of the main chart while the label keeps showing the real last price — visible at any viewport position;
  - **Up/down colors**: last bar `close vs preClose` → red (`upColor`) / green (`downColor`) / flat (`flatColor`, white on dark theme / black on light), same theme palette as the K-line bodies, auto-updating with realtime ticks;
  - **Timeshare mode**: `klineSeries` is hidden and `getBars()` contains no kline points → not drawn automatically;
  - **Visibility toggle**: `KLineChartOptions.priceLineVisible` (default `true`; component prop `priceLineVisible`; the App.vue "价格线" toolbar button toggles it at runtime) → `KLineChartController.setPriceLineVisible(visible)` (idempotent; on change it calls `applyOptions({ priceLineVisible: false })` on `klineSeries` to force an immediate invalidation — the library line stays off, the redraw comes from the primitive reading its own `visible`);
  - **Realtime viewport follow** (`followLastBarIfTracking`): after a new K-line bar is appended, the viewport repositions to the last 120 bars **only when its right edge is within 1 bar of the last bar** (`|range.to - lastIndex| < 1`). lightweight-charts lets the logical range extend past the data's right edge (after a drag `to` can exceed `lastIndex`), so **an out-of-bounds drag or panning to older history (right edge far from the last bar) is treated as the user leaving tracking — realtime pushes never yank the viewport back** (fixes "view snaps back after moving ~10 bars to the right"); after panning to history the viewport stays completely still (verified: 20s / 2 appended bars without movement);
  - Unit tests (8 cases: 4 data + 3 visibility + 1 construction) in `tests/priceLine.test.ts`;
- **Empty-pane "test" label** (`TestLabelPrimitive`): vertically centered, 6px from the left, follows the theme text color.

## 3. Global Controls (App.vue Toolbar)

| Button | Function |
|---|---|
| Sub indicators (mutually exclusive) | RSI / KDJ / MACD / WR / DMI / BIAS / OBV / CCI / ROC / CR: selected = indicator pane on (60:20:20), deselected = indicator pane off (80:20); pane4 shows per-line values |
| Time axis on/off | Show / hide the bottom time axis (recomputes pane heights) |
| Left scale on/off | Toggle the left axis area (all panes together, width 72px, fitContent after toggle) |
| Right scale on/off | Toggle the right axis area (same as left) |
| Zoom out / in | Global X-axis `barSpacing` zoom (clamped 2~80) |
| Shift left / right | X-axis pan (`scrollToPosition` ±10 bars per click) |
| Light / dark | Theme switch (all colors centralized in `chart/core/theme.ts`) |

Bottom "main indicators" container: MA / EXPMA / BOLL / SAR / BBI five buttons are **mutually exclusive** (clicking an active one = off), indicators are drawn on pane1 (overlaid on the same price scale as the K-line); SAR is a parabolic dot (dot marker).

Mouse wheel / two-finger / axis-drag zoom inside the chart is disabled (`handleScale` all off); zoom is controlled only by the buttons. Panning is kept.

## 4. Directory Structure

```
src/
├── App.vue                    # Toolbar + container (80% width/height, centered)
├── main.ts                    # Entry
├── components/
│   └── KLineChart.vue         # Chart component (props: symbol / name / timeAxis / leftScale / rightScale / theme / mainIndicator / subIndicator / period / service; period fully controlled by parent and emits period-change, v1.5.7)
├── chart/                     # Chart source, grouped by feature
│   ├── periods.ts            # Period config (PERIODS 13 items: 1~5 day intraday + daily/weekly/monthly K + 60~1 min K; periodMap O(1) lookup + getPeriodLabel, v1.4.94)
│   ├── core/                  # Core: controller / layout / theme / mock / candlestick width
│   │   ├── KLineChartController.ts # Controller (v1.7.1 split version, <1000 lines): data / lifecycle / public API; pane building & intraday math delegated to the modules below
│   │   ├── indicatorManager.ts # Indicator manager (five main indicators + volume average lines + pane0/pane2 info rows; setMainIndicator / setSubIndicator forwards to the sub-indicator pane)
│   │   ├── subIndicatorPaneManager.ts # Sub-indicator pane manager (pane4 info row + pane5 indicator chart: create/destroy/data/info-row/theme; split out in v1.4.89)
│   │   ├── crosshairManager.ts # Crosshair manager (crosshair move link + overlayTime + left-axis indicator registry)
│   │   ├── timeshareManager.ts # Intraday (1d~5d) math manager (v1.7.1 split: isTimeshare / preClose / symmetric half-range / arithmetic scale values / three-state coloring / fixed price range)
│   │   ├── paneFactory.ts      # Pane building factory (v1.7.1 split: creates & wires all pane0~pane3 series / primitives)
│   │   ├── paneLayout.ts       # Pane height allocation utilities (v1.7.1 split: equal fixed panes + group ratios; paneTop accumulation)
│   │   ├── viewport.ts         # Viewport / axis / palette utilities (v1.7.1 split: zoom-pan / axis visibility / K-line recolor / debug object)
│   │   ├── constants.ts        # Shared constants (LIBRARY_TIME_AXIS_HEIGHT / PRICE_SCALE_MIN_WIDTH / VIEW_SHIFT_STEP)
│   │   ├── types.ts            # Core shared types (KLineChartOptions / IndicatorLineSpec; main/sub indicator types live in indicator/types.ts)
│   │   ├── indicatorMeta.ts    # Sub-indicator line-name metadata (subIndicatorLabels)
│   │   ├── layout.ts          # Layout constants & height computation (60/20/20 ⇄ 80/20)
│   │   ├── theme.ts           # Dark / light themes (all colors centralized) + main / sub indicator palettes
│   │   ├── resolveBarColors.ts# Per-bar three-state colors (close vs preClose: up / down / flat)
│   │   ├── mergeBars.ts        # New/old data merge (realtime push / pagination dedup)
│   │   ├── mock.ts            # Mock data (daily K, pure functions, unit-testable)
│   │   └── candlestickWidth.ts# Candlestick / bar width (library original optimalCandlestickWidth)
│   ├── axis/                  # Left-axis labels (aligned with grid lines, text identical to indicator values)
│   │   ├── axisLabelPrimitive.ts
│   │   ├── axisLabelView.ts
│   │   └── axisLabelPaneView.ts  # Self-drawn render + shared drawAxisLabel (shared by indicator values)
│   ├── crosshair/             # Crosshair left-axis indicator + vertical-line bottom cap + data tooltip
│   │   ├── crosshairAxisLabelPrimitive.ts
│   │   ├── crosshairAxisLabelPaneView.ts
│   │   ├── crosshairTooltip.ts   # Crosshair data tooltip (nine data items following the mouse, v1.6.35)
│   │   ├── crosshairLineCapPrimitive.ts # Vertical-line bottom cap (fills the last gap of LargeDashed, v1.4.90)
│   │   └── crosshairLineCapPaneView.ts
│   ├── border/                # Content pane borders (self-drawn)
│   │   ├── paneBorderPrimitive.ts
│   │   └── paneBorderPaneView.ts
│   ├── highLow/               # pane1 visible-range high / low price markers (solid line to the body)
│   │   ├── highLowMarkerPrimitive.ts
│   │   └── highLowMarkerPaneView.ts
│   ├── grid/                  # Fixed-division grid (4 vertical / horizontal per pane config)
│   │   ├── gridPrimitive.ts
│   │   └── gridPaneView.ts
│   ├── volume/                # Volume bars self-drawn (red hollow up / green solid down)
│   │   ├── volumeBarPrimitive.ts
│   │   └── volumeBarPaneView.ts
│   ├── indicator/             # Eastmoney-style indicator library (unified export index.ts):
│   │   │                       #   K-line main: MA/EXPMA/BOLL/SAR/BBI + 10 sub indicators + 9 intraday indicators
│   │   ├── index.ts           # Unified export (main calcMA/EXPMA/BOLL/SAR/BBI + sub calcSubIndicator by name, v1.7.0)
│   │   ├── types.ts           # Shared types (IndicatorLine / K / MainIndicators / SarPoint;
│   │   │                       #   main MainIndicatorType + sub SubIndicatorType enums)
│   │   ├── options.ts         # Main/sub indicator button options (MainIndicatorOptions / SubIndicatorOptions, moved from App.vue)
│   │   ├── utils.ts           # Shared utils (tdxSMA / ema / runningMax / toLines)
│   │   ├── macd.ts            # MACD (calcMACD, Eastmoney convention, pure function)
│   │   ├── macdBarPrimitive.ts
│   │   └── macdBarPaneView.ts
│   │   ├── sarMarkerPrimitive.ts # SAR dot self-drawn plugin (attached to klineSeries, long red / short green)
│   │   ├── ma.ts              # Simple moving average (MA5/10/20/30/60)
│   │   ├── expma.ts           # Exponential smoothing (EXPMA12/50)
│   │   ├── boll.ts            # Bollinger Bands (N=20, K=2)
│   │   ├── sar.ts             # Parabolic SAR (Eastmoney SAR(4, 0.02, 0.2))
│   │   ├── bbi.ts             # Bull & Bear Index ((MA3+MA6+MA12+MA24)/4)
│   │   └── (rsi/kdj/wr/dmi/bias/obv/cci/roc/cr/volumeMa sub & intraday indicators)
│   ├── overlay/               # pane0 top overlay (covers the crosshair vertical line)
│   │   ├── topPaneOverlayPrimitive.ts
│   │   └── topPaneOverlayPaneView.ts
│   └── util/
│       └── format.ts          # Number formatting (price / volume / indicator scale / date)
└── types/
    └── chart.ts               # Unified data point types (kept, for backend integration)
tests/
├── mock.test.ts               # Mock data tests
├── theme.test.ts              # Theme / palette tests
├── candlestickWidth.test.ts   # Candlestick width tests
├── periods.test.ts            # Period config tests (13-item list / unique value / periodMap / getPeriodLabel, v1.4.94)
├── macd.test.ts               # MACD calculation tests
├── multipane.test.ts          # Layout constant / height algorithm tests
├── stress.test.ts             # Data stress tests (10000 bars × all indicators: integrity / no NaN / O(n) cache semantics / time budget, v1.4.93)
└── util.test.ts               # Formatting function tests
```

## 5. Component Manual (KLineChart)

### 5.1 Quick Start

```html
<KLineChart
  symbol="300750"
  name="宁德时代"
  :time-axis="true"
  :left-scale="false"
  :right-scale="false"
  theme="dark"
  main-indicator="ma"
  sub-indicator="macd"
  :period="'day'"
  format="YYYY-MM-DD"
  @period-change="onPeriodChange"
/>
```

The parent only maintains state and passes Props (one-way data flow); transient actions such as zoom in / out, shift left / right are invoked on the controller via `ref`.

### 5.2 Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `symbol` | `string` | `''` | Stock code (pane0 info row: name [code]) |
| `name` | `string` | `''` | Stock name (pane0 info row: name [code]) |
| `timeAxis` | `boolean` | `true` | Time axis visibility (recomputes pane heights) |
| `leftScale` | `boolean` | `false` | Left axis area visibility (uniform width 72px, fitContent after toggle) |
| `rightScale` | `boolean` | `false` | Right axis area visibility (same as left) |
| `theme` | `string` | `'dark'` | Style: `'dark'` / `'light'` |
| `mainIndicator` | `string` | `''` | Main indicator: `MA / EXPMA / BOLL / SAR / BBI` (`''` = off, mutually exclusive) |
| `subIndicator` | `string` | `''` | Sub indicator: `RSI / KDJ / MACD / WR / DMI / BIAS / OBV / CCI / ROC / CR` (`''` = indicator pane off, mutually exclusive) |
| `period` | `PeriodValue` | `'day'` | Current period (externally controlled; on change the service re-fetches data for that period) |
| `service` | `ChartDataService` | `MockChartDataService` singleton | Data service implementation (pass an `HttpChartDataService` instance for real quotes, zero component changes) |
| `data` | `ChartDataPoint[]` | `undefined` | External custom data (when provided, renders `data` first, skipping service fetch / pagination / realtime, v1.6.28) |
| `format` | `string` | `''` | Time format template (e.g. `'YYYY-MM-DD'` / `'YYYY-MM-DD HH:mm'`); falls back to automatic per period (v1.6.9) |

> Removed props: `dataCount / total / size / pageSize` (per-page count, injected via `new MockChartDataService({ fetchLimit })` since v1.6.27), `periodWhitelist` (period whitelist, removed in v1.6.34; the period bar is fully controlled by the parent).

### 5.3 Events

| Event | Payload | Triggered when |
|---|---|---|
| `period-change` | `value: PeriodValue` | Period changes (App period bar click / internal switch) |
| `status-change` | `status: ChartLoadStatus` | Load status changes: `'loading'` (initial) / `'loading-older'` (left-edge pagination) / `'ready'` / `'error'` (v1.6.18) |

### 5.4 Controller Methods (via ref)

```ts
const chartRef = ref<InstanceType<typeof KLineChart> | null>(null)

// Transient actions
chartRef.value?.controller?.zoomIn()       // Zoom in (barSpacing clamped 2~80)
chartRef.value?.controller?.zoomOut()      // Zoom out
chartRef.value?.controller?.shiftLeft()    // Shift left (logical-range pan by one screen width, stops naturally at the far left)
chartRef.value?.controller?.shiftRight()   // Shift right (logical-range pan by one screen width, stops naturally at the far right)

// Data & instrument (v1.6.17+: data flow moved into the controller)
chartRef.value?.controller?.init()                    // Fetch history + redraw + subscribe realtime (called automatically by the component)
chartRef.value?.controller?.setSymbol('600519')       // Update stock code (pane0 display + takes effect on the next init)
chartRef.value?.controller?.setName('贵州茅台')        // Update stock name
chartRef.value?.controller?.setService(mockService)   // Update the data service instance (takes effect on the next init)
chartRef.value?.controller?.setPeriod('day')          // Update period (pane0 time format switches accordingly)

// State setters (Props watchers call them automatically; manual calls are for programmatic control)
chartRef.value?.controller?.applyTheme('light')
chartRef.value?.controller?.toggleTimeAxis(false)
chartRef.value?.controller?.setLeftScaleVisible(true)
chartRef.value?.controller?.setRightScaleVisible(true)
chartRef.value?.controller?.setMainIndicator('boll')   // MA/EXPMA/BOLL/SAR/BBI / null
chartRef.value?.controller?.setSubIndicator('kdj')     // Sub indicator name / null = indicator pane off

// Lifecycle (called automatically on unmount; manual calls prevent double mounting)
chartRef.value?.controller?.destroy()

// Load status (component-internal ref; read the current value via ref)
chartRef.value?.loadStatus  // 'idle' | 'loading' | 'loading-older' | 'ready' | 'error'
```

### 5.5 Data Integration (src/services)

The component data layer uniformly goes through the `ChartDataService` interface (`src/services/chartDataService.ts`): history pagination `fetchHistory` + realtime subscription `subscribeRealtime`; the component / controller have zero dependency on a concrete implementation. v1.7.1 split: the pure data-generation layer (daily-K pool / intraday patterns / minute aggregation / week-month aggregation) moved to `src/services/mockDataGenerator.ts` (35 top-level exports, unit-testable); the service layer keeps orchestration & caching only.

- **Default**: `MockChartDataService` singleton (built-in ~3-year daily K pool + intraday / minute K / weekly / monthly aggregation + simulated realtime push; same symbol + period cache reused, memory-friendly).
  Per-page fetch count (v1.6.27) is a **required per-instance config**:
  `new MockChartDataService({ fetchLimit: 200 })` or
  `new HttpChartDataService({ historyUrl: '/api/kline/history', fetchLimit: 200 })`
  (no global constant);
  the controller's init / left-edge pagination both use `service.fetchLimit`, and the `hasMoreHistory`
  full-page check follows accordingly.
  Minute K (60/30/15/5/1 min) uses **realistic simulation**: Brownian bridges anchored to daily K open/close (cross-period price consistency, no gaps), aggregated by real trading sessions (60m 4 segments / 30m 8 / 15m 16 / 5m 48 / 1m 241, segment starts 09:30/10:30/13:00…), U-shaped volume distribution (heavy at open/close);
- **Custom data passthrough (v1.6.28)**: without mock / http environments, the parent passes `data` directly (`ChartDataPoint[]`, same K-line structure as fetchHistory returns): injected at construction via `initialBars`, **skipping service fetch / left-edge pagination / realtime subscription**; when `data` changes, a watcher automatically calls `setKlineData` to redraw. When both `data` and `service` exist, `data` wins.
- **Real quotes**: the parent passes an `HttpChartDataService` instance (`src/services/httpChartDataService.ts`, HTTP history + WS / SSE / Poll three realtime modes + LRU history cache):

```html
<KLineChart
  symbol="300750"
  name="宁德时代"
  :period="activePeriod"
  :service="new HttpChartDataService({
    historyUrl: 'http://10.0.0.8:8080/api/v2/kline_list', // full URL required (v1.6.30)
    wsUrl: 'wss://...',
  })"
  @period-change="onPeriodChange"
/>
```
All history / realtime endpoint addresses are **explicitly configured** (v1.6.30, no base-URL derivation): `historyUrl` (history, **required** full URL), `wsUrl` / `sseUrl` / `pollUrl` (three realtime modes; full URL required when used; the corresponding mode is disabled with a warn when omitted); full URLs with their own query strings append params with `&`.

SSE realtime (v1.6.31) is based on **`@microsoft/fetch-event-source`** (fetch streaming): supports custom `headers` / `cookies` (injected like HTTP requests), auto-reconnects every 3s on disconnect; HTTP 401/403 auth failures abort the subscription to avoid infinite loops. WebSocket is still limited by browsers and cannot inject custom headers — when auth depends on custom headers, use `'sse'` or `'poll'` instead.

Backend contract: `GET {historyUrl}?symbol=&period=&before=&limit=` returns (historyUrl required) `{ code: 200, data: ChartDataPoint[] }` (time ascending; returned count < limit means no older data); realtime pushes share the same structure as history, `time` equal to the last bar = refresh that bar, larger = append a new K-line.

**Data flow (v1.6.17)**: `controller.init()` manages everything — fetch the latest page → `setKlineData` redraw + fitContent → subscribe realtime; when `symbol` / `period` / `service` change, the component updates the controller then re-runs `init()` (loadSeq discards stale responses as races).

**Pan-left auto-load of older history (v1.6.17, moved into the controller `loadEarlier`)**: when the visible range reaches the far-left edge, the controller uses the current earliest bar's `time` as the `before` anchor to fetch one more page, prepending via `prependHistory` (dedupe / ascending + viewport keeps the original data position); stops when the return is below limit or the merged increment is 0.

### HttpChartDataService constructor options (v1.7.1)

```ts
new HttpChartDataService({
  fetchLimit: 200,                    // required: bars per page (history / pan-left paging)
  historyUrl: 'http://<host>/api/kline/history', // required: full history URL (own route / query)
  realtimeTransport: 'ws',            // optional: 'ws' (default) | 'sse' | 'poll'
  wsUrl: 'wss://<host>/ws',           // required for 'ws'
  sseUrl: 'https://<host>/sse',       // required for 'sse'
  sseEventName: 'message',            // optional: SSE event name, default 'message'
  pollUrl: 'https://<host>/api/kline/latest', // required for 'poll'
  pollIntervalMs: 3000,               // optional: poll interval ms, default 3000
  timeoutMs: 8000,                    // optional: fetch timeout ms, default 8000
  headers: { Authorization: 'Bearer <token>' },  // optional: injected into all HTTP requests
  cookies: { session: 'abc123' },     // optional: object form, serialized into the Cookie header
  params: { market: 'SH' },           // optional: extra URL query on every request
  cache: true,                        // optional: history cache on/off, default true
  maxCacheEntries: 12,                // optional: LRU cache entry cap (symbol|period combos)
  maxKnownTotals: 64,                 // optional: "known total count" record cap (memory guard)
  cacheTtlMs: 30000,                  // optional: latest-page cache TTL ms (older paging unaffected)
})
```

**Realtime transport comparison**:

| Mode | Options used | Custom headers / cookies | Notes |
|---|---|---|---|
| `'ws'` (default) | `wsUrl` | ✗ browser forbids injection | Full-duplex WebSocket push; cross-origin needs server support |
| `'sse'` | `sseUrl` + `sseEventName` | ✓ via `@microsoft/fetch-event-source` | One-way server push; 3s auto-reconnect; aborts on 401/403 |
| `'poll'` | `pollUrl` + `pollIntervalMs` | ✓ plain fetch | HTTP polling (default 3000ms); no persistent connection |

When auth depends on custom request headers, prefer `'sse'` or `'poll'` (WebSocket cannot inject headers).

**Full-URL semantics (v1.6.30)**: `historyUrl` / `wsUrl` / `sseUrl` / `pollUrl` always take a **full URL** (may include own route / query); the library appends core params (`symbol` / `period` / `before` / `limit`) with `&` (core params win over `params` on name conflict). A missing URL for a mode disables that mode with a console.warn.

**Request protocol**: history `GET {historyUrl}?symbol=&period=&before=&limit=` returns `{ code: 200, data: ChartDataPoint[] }` (time ascending; count < limit means no older data) or a bare array; realtime pushes share the same structure, `time` equal to the last bar = refresh that bar, larger = append a new bar.

**Memory management**: history cache LRU-evicts per `symbol|period` combo (`maxCacheEntries`, default 12); `knownTotals` independently tracks each key's known total count (survives cache eviction) and is only LRU-pruned above `maxKnownTotals` (default 64), preventing unlimited metadata growth across paging round-trips; data handed to callers is always an independent copy, realtime updates never pollute the cache.

Data point type `ChartDataPoint` (`src/types/chart.ts`, K-line):

```ts
{
  time: number          // second-level timestamp, strictly increasing (library assertion)
  tradeDate: string     // 'YYYY-MM-DD' (pane0 info row time display)
  preClose: number      // previous close
  pointType: 'kline'    // K-line type guard (intraday point 'timeshare' is not rendered for now)
  open: number
  high: number
  low: number
  close: number
  volume: number        // volume (volume-pane anchor / average line)
}[]
```

### 5.6 Theme & Colors

- Dark / light colors are fully centralized in `src/chart/core/theme.ts` (`chartThemes.dark` / `.light`);
- Main indicator colors `mainIndicatorColors`, sub indicator colors `subIndicatorColors`: shared by both themes, de-whitened since v1.4.92 (gray line `#666666` / BOLL middle band `#33373E` / BBI `#607D8B`) so they stay clearly visible on the light theme;
- The page html background is synced by App.vue with the theme (`pageBackground`); all in-chart colors go through the theme object.

### 5.7 Intraday Chart (1d~5d, v1.7.0)

Intraday periods (`1d` ~ `5d`) share the same component and layout as K-line periods. Rendering / interaction differences:

- **Data format**: `pointType='timeshare'` points — `time` (second-level timestamp, strictly increasing) / `tradeDate` ('YYYY-MM-DD') / `preClose` (previous close) / `price` (current price) / `avgPrice` (average price) / `volume`;
- **Mock counts (sentiment patterns, v1.7.0)**: each day is assigned an intraday pattern by "pattern sequence × symbol offset" (deterministically covering 8 types): half-day (09:31~11:30, **120 points**) / 厂字板 (limit-up open → broken pullback → re-sealed at close) / one-line limit up / one-line limit down / 天地天 (limit up → limit down → limit up) / 地天地 (limit down → limit up → limit down) / consecutive-up (high open → sealed limit up at close) / consecutive-down (high open → sealed limit down at close); the latest day is a full 241 points / older days 240 (missing the first minute); `fetchHistory` groups by trading day and takes the most recent N days (`timesharePatternPath` pure function, unit-testable);
- **pane1 intraday twin lines**: `LineSeries` price line + average line (dark #FFFFFF / #F4AA0A, light #33373E / #B8860B, `theme.timesharePriceColor` / `timeshareAvgColor`); cleared and invisible on K-line periods;
- **No main indicators**: the main-indicator bar is hidden on intraday (MA/EXPMA/BOLL/SAR/BBI are OHLC-based; intraday points have no OHLC);
- **Volume pane3**: K-line periods use self-drawn red/green bars + VOL MA5/MA10 average lines; intraday periods use self-drawn **1px thin bars** with **average lines removed** (`rebuildVolumeData` intraday guard, pane2 info row shows volume only, v1.7.0); **intraday volume bar color rules**: the first bar of a trading day compares with previous close preClose, the rest compare with the previous minute price (> red / < green / = flat color, `resolveTimeshareVolumeColor` pure function);
- **MACD pane5**: K-line periods use `MacdBarPrimitive` self-drawn red/green bars (bar width identical to K-lines, positive values hollow red); intraday periods also self-drawn but with a **fixed 1px solid thin line** (`getIsTimeshare` injection: positive solid red / negative solid green, no hollow);
- **Sub indicators**: no CR on intraday (`TIMESHARE_DISABLED_SUB_INDICATORS`, filtered in the App buttons); other indicators are computed on the price series (K-convention data conversion `close = price`);
- **Grid vertical divisions**: `timeshareGridVerticalCount` — 1d=4 / 2d=2 / 3d=3 / 4d=4 / 5d=5 (`getVerticalCount` dynamic, K-line constant 4);
- **Interaction**: on intraday the pan / zoom buttons are hidden and **chart panning interaction is fully disabled** (wheel / press-drag / touch, `setPeriod` dynamically toggles `handleScroll`; zoom remains controlled by toolbar buttons); `hasMoreHistory=false` (intraday data is complete, no left-edge pagination); pane0 / tooltip / time-axis indicator time format **YYYY-MM-DD HH:mm** (`formatAxisTime` intraday branch, adjusted from HH:mm in v1.7.0 to distinguish dates across multi-day intraday); **time-axis tick labels** (`tickMarkFormatter`): K-line state **YYYY-MM-DD** / intraday state **HH:mm** (not affected by the format param);
- **pane0 info row (intraday)**: appends price / **average price** / change / change% / volume / amount (price / change / change% **numbers** colored red-up / green-down / flat vs previous close, labels use the text color; **average price number = average-line color** (timeshareAvgColor); volume/amount uncolored, `buildInfoSegments` intraday branch + `barTimeMap` O(1) lookup);
- **tooltip**: intraday points show time / price (colored) / **average price (average-line color)** / change / change% / volume / amount (seven rows, change baseline = previous close);
- **Files**: `src/chart/periods.ts` (`isTimesharePeriod` / `timeshareGridVerticalCount` / `timeshareVerticalCount`), `src/chart/core/kLineChartController.ts` (intraday twin-line branch), `src/chart/core/subIndicatorPaneManager.ts` (intraday indicator adaptation), `src/services/chartDataService.ts` (intraday mock: `timesharePatternPath` 8 patterns + `buildTsPool` per-day allocation), `src/services/mockDataGenerator.ts` (pure data-generation layer, v1.7.1), `src/chart/core/timeshareManager.ts` / `paneFactory.ts` / `paneLayout.ts` / `viewport.ts` (v1.7.1 split modules).

#### 5.7.1 Intraday pane1 Left/Right Axis (v1.7.1)

- **Value range**: interval-symmetric expansion (user-specified `symmetricExpandRange`) — half-span `expandDistance = max(upper deviation, lower deviation)`, range `[preClose−half, preClose+half]`, **middle value always the first bar's preClose** (uniform for 1d~5d, `getTimesharePreClose`); tick values generated by `buildTimeshareScaleValues` as a strictly arithmetic sequence (first/last = newMax / newMin, middle = preClose, 6 divisions with indicator on / 8 with off);
- **0 margins**: on intraday pane1 left / right scales use `scaleMargins = { top: 0, bottom: 0 }` (symmetric) → the middle horizontal line sits exactly at the pixel center; a one-line limit-up price line **hugs the pane1 top border**, limit-down hugs the bottom border; K-line periods restore the library default margins;
- **Crosshair indicator = tick value**: symmetric 0 margins guarantee the coordinate center ↔ pixel center exactly aligns, so the crosshair on the middle line reads preClose (the middle tick), with per-row one-to-one correspondence up and down (fixes: under the library's asymmetric default margins the same y read 9.43 instead of 10);
- **Right axis**: percentage = `(left-axis displayed value − preClose) / preClose × 100%` (series values first rounded to the left axis's 2 decimals, left 12.67 → right +26.70%, `formatPercent` carries +/-); the **right-axis crosshair indicator** is a separate primitive (the library filters by priceScaleId; a left-axis indicator is not drawn in the right axis area), back-calculated on the fixed left range, background / text color / font copied from the left-axis indicator, left-aligned to the area's left edge, rendered on intraday only;
- **Coloring**: left-axis price / right-axis percentage vs preClose in three states (> red / < green / = flat dark white / light black, `getScaleValueColor` + `resolveVsBaseColor`);
- **Debugging**: `window.__klineChart` (dev only) live-reads `bars` / `preClose` / `timeshareHalf` / `scaleValues` / `horizontalCount` / `getMaxMin()`.

## 6. Running

```bash
pnpm install       # pinned versions: lightweight-charts 5.2.1 / vue 3.5.43
pnpm dev           # development (http://127.0.0.1:5210)
pnpm test          # vitest unit tests (incl. split-module tests splitModules.test.ts)
pnpm build         # vue-tsc type check + build
```

## 7. Memory & Performance

- **Crosshair rAF throttling (v1.5.9)**: during drag-pan / fast mousemove the library's crosshairMove can fire at high frequency; the controller merges same-frame events into one processing pass (at most one redraw per frame); `setCrosshairY` skips equal values, so unchanged movement no longer triggers fullUpdate.

- **Function-style convention (v1.6.24)**: arrow functions across the codebase — top-level / object methods are all arrows; class methods uniformly use arrow-function fields (`method = (): T => {}`, `this` bound to the instance, so library callbacks never lose `this`); `constructor` / `get` / `set` accessors keep the method form per syntax. Class methods are never called inside the constructor; field references all live inside lazy arrow bodies, no initialization-order risk.
- **primitive view singleton reuse**: every primitive's `paneViews()` / `priceAxisPaneViews()` returns a singleton view created at construction, avoiding per-frame `new` objects that create GC pressure;
- **Render clipping**: volume / MACD bars and SAR dots are clipped by the visible logical range (`getVisibleLogicalRange`); indicator polylines (`IndicatorLinePrimitive`) are clipped by the visible point range (`getVisibleRange()`) — all only iterate visible elements, never the full dataset (long data of 10000 bars draws only the ~120 visible bars per frame; pan / zoom do not slow down linearly with total data);
- **Indicator values O(1) lookup**: pane0 / pane2 info rows look up `Map<time, value>` on demand (`mainIndicatorValueMaps` / `volumeInfoMap` / `sarValueMap`), rebuilt when switching indicators / data, emptied when cleared, no accumulation;
- **Label caching**: axis labels are rebuilt in `updateAllViews` (chart update), the render draw only reads the cached collection without recomputing;
- **Lifecycle**: controller `destroy()` removes the crosshair listener, disconnects the ResizeObserver, `detachPrimitive` (SAR dots / main indicator lines / volume average lines), `chart.remove()`, clears the container marker; when an indicator is off the series calls `removePane` before nulling; primitive `detached()` clears references;
- **Instance protection**: the container `dataset.lwcMounted` marker prevents duplicate chart instances.

## GitHub Pages live preview

Auto-deployment via GitHub Actions is built in (`.github/workflows/pages.yml`, v1.7.1):

- **URL**: `https://abulo.github.io/kline-chart-component/` (Pages project path = repository name)
- **Trigger**: push to `main` (or run the workflow manually from the Actions tab)
- **Pipeline**: `pnpm install --frozen-lockfile` → `pnpm run build` → `actions/upload-pages-artifact` → `actions/deploy-pages`
- **One-time setup**: repo `Settings → Pages → Build and deployment → Source` = `GitHub Actions`
- **Environment**: node 24 + pnpm 12 (`packageManager` in `package.json` pins `pnpm@12.9.1`; the Actions workflow uses `pnpm/action-setup@v4` + `actions/setup-node@v4` with node 24)
- **Local check**: `pnpm run build` then `npx vite preview`, open `http://127.0.0.1:4173/kline-chart-component/`

> Package manager (v1.7.1): the project uses **pnpm** (`package-lock.json` removed, `pnpm-lock.yaml` committed). To migrate back to npm, delete `pnpm-lock.yaml` and run `npm install`.
