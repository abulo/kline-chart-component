/**
 * cacheLru.test.ts —— LRU 缓存管理单测（v1.7.1）
 *
 * 覆盖 MockChartDataService 缓存内存管理：touchCache 纯函数
 *  - 命中刷新顺序（最近使用置顶，防止"热 symbol"被误淘汰）
 *  - 超限淘汰最久未使用
 *  - factory 懒生成
 *  - 空 Map / 上限 1 等边界
 */
import { describe, expect, it } from 'vitest'
import { touchCache } from '../src/services/chartDataService'

describe('touchCache（LRU 缓存管理，v1.7.1）', () => {
  it('未命中：factory 生成并写入', () => {
    const map = new Map<string, number>()
    const factory = (): number => 42
    expect(touchCache(map, 'a', 4, factory)).toBe(42)
    expect(map.get('a')).toBe(42)
    expect(map.size).toBe(1)
  })

  it('命中：返回缓存值且不重复调用 factory', () => {
    const map = new Map<string, number>()
    let calls = 0
    const factory = (): number => {
      calls += 1
      return 7
    }
    touchCache(map, 'a', 4, factory)
    touchCache(map, 'a', 4, factory)
    expect(calls).toBe(1)
    expect(map.get('a')).toBe(7)
  })

  it('命中：刷新 LRU 顺序（delete + 重插 → 遍历序 = 最近使用序）', () => {
    const map = new Map<string, number>()
    touchCache(map, 'a', 3, () => 1)
    touchCache(map, 'b', 3, () => 2)
    touchCache(map, 'c', 3, () => 3)
    // 访问 a（变为最近使用），遍历序应变为 b,c,a
    touchCache(map, 'a', 3, () => 999)
    expect([...map.keys()]).toEqual(['b', 'c', 'a'])
  })

  it('超限：淘汰最久未使用（遍历序第一个）', () => {
    const map = new Map<string, number>()
    touchCache(map, 'a', 2, () => 1)
    touchCache(map, 'b', 2, () => 2)
    // 超限：淘汰 a
    touchCache(map, 'c', 2, () => 3)
    expect([...map.keys()]).toEqual(['b', 'c'])
    expect(map.get('a')).toBeUndefined()
  })

  it('超限淘汰的是"最久未使用"而非插入序（LRU 语义）', () => {
    const map = new Map<string, number>()
    touchCache(map, 'a', 2, () => 1)
    touchCache(map, 'b', 2, () => 2)
    // 访问 a → 顺序变为 b,a；此时插入 c → 淘汰 b（最久未使用）
    touchCache(map, 'a', 2, () => 11)
    touchCache(map, 'c', 2, () => 3)
    expect([...map.keys()]).toEqual(['a', 'c'])
    expect(map.get('b')).toBeUndefined()
  })

  it('边界：maxSize=1 时每次新 key 都淘汰旧值', () => {
    const map = new Map<string, number>()
    touchCache(map, 'a', 1, () => 1)
    touchCache(map, 'b', 1, () => 2)
    touchCache(map, 'c', 1, () => 3)
    expect([...map.keys()]).toEqual(['c'])
  })

  it('边界：map.size 未超限时不淘汰', () => {
    const map = new Map<string, number>()
    touchCache(map, 'a', 3, () => 1)
    touchCache(map, 'b', 3, () => 2)
    expect(map.size).toBe(2)
    expect([...map.keys()]).toEqual(['a', 'b'])
  })
})
