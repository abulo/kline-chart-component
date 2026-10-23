/**
 * timing.ts —— 防抖 / 节流工具（v1.7.1）
 *
 * 用于数据请求与实时推送的频控，避免数据争抢：
 *  - debounce：快速连续触发（如周期 / 标的快速切换）只执行最后一次（数据请求防抖）；
 *  - throttle：高频推送（WS / SSE / 轮询）合并为窗口内一次执行（实时更新节流），
 *    trailing 保留窗口末次参数（不丢尾点）。
 * 两者均返回带 cancel() 的包装函数，组件卸载 / 控制器销毁时调用清理定时器防泄漏。
 */
export interface Debounced<A extends unknown[]> {
  (...args: A): void
  /** 取消尚未执行的防抖调用（清理定时器） */
  cancel(): void
}

/**
 * 防抖：连续调用重置计时，停止触发 waitMs 后执行最后一次。
 *  - 用于"快速切换周期 / 标的"场景：合并为最后一次数据请求，避免并发请求争抢；
 *  - cancel() 供组件卸载时清理（定时器不泄漏）。
 */
export const debounce = <A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
): Debounced<A> => {
  let timer: ReturnType<typeof setTimeout> | null = null
  const wrapped = (...args: A): void => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, waitMs)
  }
  wrapped.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  return wrapped
}

export interface Throttled<A extends unknown[]> {
  (...args: A): void
  /** 取消窗口内的 trailing 调用与待执行参数（清理定时器） */
  cancel(): void
}

/**
 * 节流：waitMs 窗口内最多执行一次（leading 立即执行），窗口末次触发保留为
 * trailing（窗口结束时用最新参数执行一次），保证**不丢最后一个点**。
 *  - 用于实时推送（WS / SSE / 轮询高频回调）：合并渲染帧内多次推送，
 *    避免逐点重建指标缓存导致的数据争抢 / 卡顿；
 *  - cancel() 供控制器销毁时清理（防泄漏）。
 */
export const throttle = <A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
): Throttled<A> => {
  // -Infinity：首次调用 now - lastTime = +Infinity ≥ waitMs → leading 立即执行
  let lastTime = -Infinity
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingArgs: A | null = null

  const wrapped = (...args: A): void => {
    pendingArgs = args // 始终记录最新参数（trailing 用）
    const now = Date.now()
    const remaining = waitMs - (now - lastTime)
    if (remaining <= 0) {
      // leading：窗口已过 → 立即执行，清掉 pending 与旧定时器
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      lastTime = now
      pendingArgs = null
      fn(...args)
      return
    }
    // 窗口内：仅当没有挂起的 trailing 定时器时挂一个（到窗口结束用最新参数执行）
    if (timer === null) {
      timer = setTimeout(() => {
        timer = null
        if (pendingArgs) {
          lastTime = Date.now()
          const argsAtFire = pendingArgs
          pendingArgs = null
          fn(...argsAtFire)
        }
      }, remaining)
    }
  }

  wrapped.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    pendingArgs = null
  }
  return wrapped
}
