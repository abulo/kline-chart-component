/**
 * timing.test.ts —— 防抖 / 节流工具单测（v1.7.1）
 *
 * 验证：防抖（连续触发只执行最后一次 / 立即触发后间隔执行 / cancel）、
 * 节流（leading 立即执行 / 窗口内合并 / trailing 保留末次参数不丢点 / cancel）。
 * 使用 vi.useFakeTimers 控制时间推进。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { debounce, throttle } from '../src/chart/util/timing'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('debounce 防抖', () => {
  it('连续触发只执行最后一次（合并为最后一次参数）', () => {
    const fn = vi.fn()
    const run = debounce(fn, 200)
    run('a')
    run('b')
    run('c')
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(199)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')
  })

  it('停止触发满等待时间后再次调用会重新计时（重置窗口）', () => {
    const fn = vi.fn()
    const run = debounce(fn, 100)
    run(1)
    vi.advanceTimersByTime(80)
    run(2) // 重置窗口
    vi.advanceTimersByTime(80)
    expect(fn).not.toHaveBeenCalled() // 尚未到 100ms（重置后）
    vi.advanceTimersByTime(20)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(2)
  })

  it('cancel 取消尚未执行的调用', () => {
    const fn = vi.fn()
    const run = debounce(fn, 200)
    run('x')
    run.cancel()
    vi.advanceTimersByTime(500)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('throttle 节流', () => {
  it('leading：窗口已过立即执行，窗口内合并为一次', () => {
    const fn = vi.fn()
    const run = throttle(fn, 60)
    run(1) // leading 立即
    run(2) // 窗口内合并
    run(3)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(1)
    vi.advanceTimersByTime(60) // trailing：窗口末次参数（最新）执行
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith(3)
  })

  it('trailing 保留窗口末次参数（不丢最后一个点）', () => {
    const fn = vi.fn()
    const run = throttle(fn, 100)
    run('a')
    run('b')
    run('c')
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn.mock.calls[0][0]).toBe('a') // leading
    expect(fn.mock.calls[1][0]).toBe('c') // trailing 最新参数
  })

  it('窗口结束后再次触发 leading 生效（节流不阻塞后续调用）', () => {
    const fn = vi.fn()
    const run = throttle(fn, 100)
    run(1) // leading 立即
    run(2) // 窗口内 → trailing 挂起
    vi.advanceTimersByTime(100) // trailing 执行（窗口从 t=100 重新起算）
    expect(fn).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(100) // 新窗口结束
    run(3) // 窗口已过 → leading 立即
    expect(fn).toHaveBeenCalledTimes(3)
    expect(fn.mock.calls[2][0]).toBe(3)
  })

  it('cancel 取消窗口内 trailing 调用', () => {
    const fn = vi.fn()
    const run = throttle(fn, 100)
    run(1)
    run(2)
    run.cancel()
    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(1) // 仅 leading
    expect(fn).toHaveBeenCalledWith(1)
  })
})
