// mergeBars.ts —— 历史数据前置合并工具。
// 「平移左滑到边缘 → 自动加载更早历史」的数据合并纯函数：
//  - 新拉取的更早页（incoming，time 全部 < 现有最早）与现有 bars 合并；
//  - 按 time 去重（同 time 以 incoming 为准：分页覆盖语义）+ 升序排序；
//  - 返回合并结果与实际新增条数（added）：
//      added > 0 → 视口逻辑范围需右移 added（保持用户看到的原数据位置不变）；
//      added = 0 → 无更早数据（重复页），调用方应停止后续触发（防死循环）。
import type { ChartDataPoint } from '../../types/chart'

/** 合并结果：合并后 bars（升序、time 唯一）+ 实际新增条数。 */
export interface MergeBarsResult {
  /** 合并后数据（升序、time 唯一）。 */
  bars: ChartDataPoint[]
  /** 实际新增条数（added = 0 表示无更早数据，调用方停止触发）。 */
  added: number
}

/**
 * 前置合并：incoming（更早历史页）插到 existing 之前，去重 + 升序。
 *
 * @remarks
 * 同 time 冲突时 incoming 优先（新拉取覆盖旧根，分页覆盖语义）。
 *
 * @param existing 现有数据（升序）。
 * @param incoming 新拉取的更早历史页。
 * @returns 合并结果（见 {@link MergeBarsResult}）。
 */
export const mergeBars = (
  existing: ChartDataPoint[],
  incoming: ChartDataPoint[],
): MergeBarsResult => {
  const existingCount = existing.length
  const map = new Map<number, ChartDataPoint>()
  for (const point of existing) map.set(point.time, point)
  for (const point of incoming) map.set(point.time, point)
  const bars = [...map.values()].sort((a, b) => a.time - b.time)
  return { bars, added: bars.length - existingCount }
}
