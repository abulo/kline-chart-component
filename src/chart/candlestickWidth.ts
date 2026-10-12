/**
 * candlestickWidth.ts —— 蜡烛柱体真实像素宽度（v1.4.10）
 *
 * 与 lightweight-charts v5.2.1 库源码（PaneRendererCandlesticks）**完全一致**：
 *  - optimalCandlestickWidth：库源码原版（coeff 分母为 Math.PI * 0.5，
 *    并含 min(res, barSpacing×dpr) 与 max(floor(dpr)) 裁剪）；
 *  - candlestickBarWidth：再叠加库的**奇偶修正**（柱宽与影线宽同奇偶，
 *    保证十字星叠加对称）。
 * 自绘成交量使用同一函数 → 柱宽 / 间隔与 pane1 绝对一致。
 * 说明：返回值为**位图像素**宽度（已乘 devicePixelRatio），
 * 转 CSS 像素需除以 pixelRatio；绘制坐标同样按 bitmap 取整对齐。
 */

/**
 * 库源码原版 optimalCandlestickWidth（位图像素宽度）
 * @param barSpacing  timeScale barSpacing（CSS 像素）
 * @param pixelRatio  window.devicePixelRatio
 * @returns 柱体位图像素宽度（未做奇偶修正）
 */
export const optimalCandlestickWidth = (barSpacing: number, pixelRatio: number): number => {
  const barSpacingSpecialCaseFrom = 2.5
  const barSpacingSpecialCaseTo = 4
  const barSpacingSpecialCaseCoeff = 3
  if (barSpacing >= barSpacingSpecialCaseFrom && barSpacing <= barSpacingSpecialCaseTo) {
    return Math.floor(barSpacingSpecialCaseCoeff * pixelRatio)
  }
  // coeff should be 1 on small barspacing and go to 0.8 while groing bar spacing
  const barSpacingReducingCoeff = 0.2
  const coeff =
    1 -
    (barSpacingReducingCoeff * Math.atan(Math.max(barSpacingSpecialCaseTo, barSpacing) - barSpacingSpecialCaseTo)) /
      (Math.PI * 0.5)
  const res = Math.floor(barSpacing * coeff * pixelRatio)
  const scaledBarSpacing = Math.floor(barSpacing * pixelRatio)
  const optimal = Math.min(res, scaledBarSpacing)
  return Math.max(Math.floor(pixelRatio), optimal)
}

/**
 * 库渲染最终柱宽：optimalCandlestickWidth + 奇偶修正
 * （PaneRendererCandlesticks 中：柱宽 >= 2 时与影线宽 wickWidth = floor(dpr) 同奇偶，
 * 否则柱宽 -1，保证十字星叠加对称）。
 * @param barSpacing  timeScale barSpacing（CSS 像素）
 * @param pixelRatio  window.devicePixelRatio
 * @returns 实际绘制的柱体位图像素宽度
 */
export const candlestickBarWidth = (barSpacing: number, pixelRatio: number): number => {
  let barWidth = optimalCandlestickWidth(barSpacing, pixelRatio)
  if (barWidth >= 2) {
    const wickWidth = Math.floor(pixelRatio)
    if (wickWidth % 2 !== barWidth % 2) {
      barWidth--
    }
  }
  return barWidth
}
