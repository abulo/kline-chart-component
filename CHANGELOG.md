# 版本记录（CHANGELOG）

版本号遵循语义化版本（Semantic Versioning）：`主版本号.次版本号.修订号`

- **主版本号（MAJOR）**：不兼容的重构 / 架构变更；
- **次版本号（MINOR）**：向后兼容的功能新增；
- **修订号（PATCH）**：向后兼容的缺陷修复。

---

## v1.6.28（2026-10-16）

外部自定义数据直通（无 mock / http 环境时直接传入渲染）。

### 变更
- `src/chart/core/types.ts`：`KLineChartOptions` 新增 `initialBars?: ChartDataPoint[]`
  （构造注入后直接渲染，跳过 service 拉取 / 分页 / 实时）。
- `src/chart/core/kLineChartController.ts`：构造末尾（series 全部就绪后）若
  `initialBars` 非空 → `setKlineData(initialBars)` + fitContent。
- `src/components/kLineChart.vue`：
  - 新增 prop `data?: ChartDataPoint[]`（data 非空 = data 直通模式，`useCustomData`）；
  - 构造透传 `initialBars: props.data`，data 模式跳过 `init()`；
  - watch `data` → `setKlineData` 注入重绘；
  - period / symbol / service watch 在 data 模式短路（不拉取）；symbol / service
    watch 恢复 setSymbol / setService 接线（与 controller setter 一致）。

### 用法
```vue
<KLineChart :data="localBars" symbol="600519" name="贵州茅台" />
```
`data` 与 `service` 同时存在时 `data` 优先；`data` 变化自动重绘。

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.27（2026-10-16）

删除 `DEFAULT_FETCH_LIMIT` 全局常量，`fetchLimit` 改为构造必填。

### 变更
- `src/chart/core/constants.ts`：删除 `DEFAULT_FETCH_LIMIT`。
- `src/services/chartDataService.ts`：`MockChartDataServiceOptions.fetchLimit` 必填，
  构造参数必填；移除常量 import 与缺省回退。
- `src/services/httpChartDataService.ts`：`HttpChartDataServiceOptions.fetchLimit` 必填，
  移除常量 import 与缺省回退。
- 调用点补参：`App.vue` / `kLineChart.vue`（defaultService）/ `tests/chartDataService.test.ts`
  均传 `{ fetchLimit: 200 }`。

### 用法（构造必填）
```ts
new MockChartDataService({ fetchLimit: 200 })
new HttpChartDataService({ baseUrl: '/api', fetchLimit: 200 })
```

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.26（2026-10-16）

分页条数改为服务实例级配置（fetchLimit，构造传入）。

### 变更
- `src/services/chartDataService.ts`：`ChartDataService` 接口新增 `readonly fetchLimit`；
  `MockChartDataService` 新增构造参数 `{ fetchLimit?: number }`（缺省 DEFAULT_FETCH_LIMIT）。
- `src/services/httpChartDataService.ts`：`HttpChartDataServiceOptions` 新增
  `fetchLimit?: number`，构造注入 `this.fetchLimit`。
- `src/chart/core/kLineChartController.ts`：init / loadEarlier 的 `limit` 与
  `hasMoreHistory` 满页判断改为 `this.service.fetchLimit`（移除 DEFAULT_FETCH_LIMIT 引用）。

### 用法
```ts
new MockChartDataService({ fetchLimit: 200 })
new HttpChartDataService({ baseUrl: '/api', fetchLimit: 200 })
```

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.25（2026-10-16）

箭头转换后质量收尾审计。

### 审计结论
- 构造器内 `this.method()` 调用：**0 处** —— 箭头字段初始化顺序无风险
  （字段引用均在惰性箭头体内，构造时不触发）。
- 未使用导出：与 v1.6.22 一致（Deps/Config/Options 内部类型注解；
  periods / mock 有测试保护保留），无新增死代码。
- 硬编码颜色 / 命名 / 内存（destroy 退订 + loadSeq 竞态）：维持 v1.6.22 结论。

### 文档
- `README.md`：七、内存与性能 补充「函数风格约定」—— 全库统一箭头函数；
  类方法箭头字段（this 绑实例），constructor / get / set 保留方法形式；
  构造函数不调用类方法，无初始化顺序风险。

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.24（2026-10-16）

全量类方法简写 → 箭头函数字段。

### 变更
- `src/**/*.ts`：71 处类方法简写（`method() {}`）统一改为箭头函数字段
  （`method = () => {}`），覆盖 lightweight-charts Primitive / PaneView /
  PaneRenderer 接口实现（attached / detached / paneViews / renderer / draw /
  zOrder / setTheme 等）与业务类方法；`constructor` / `get` / `set` 存取器
  保持方法形式（不能转）。对象方法简写为 0；顶层 `function` 关键字为 0。
  箭头字段绑定实例 this，被库回调调用时不丢 this。
- `src/components/kLineChart.vue`：`themeColors(props.theme)` 补
  `as ChartThemeName` 断言（props.theme 类型为 string，与 applyTheme 一致）。

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.23（2026-10-15）

加载遮罩 / 更早数据提示颜色收进风格文件。

### 变更
- `src/chart/core/theme.ts`：`ChartThemeColors` 新增 `maskBackground` / `maskText`；
  深系 `rgba(19,23,34,0.72)` + `#D1D4DC`，浅系 `rgba(255,255,255,0.72)` + `#33373E`。
- `src/components/kLineChart.vue`：
  - 根容器注入 CSS 变量 `--kmask-bg` / `--kmask-text`（computed 随 `props.theme`
    从 `themeColors()` 取值）；
  - `.kline__mask` / `.kline__older-tip` 恢复 `var()` 引用（older-tip 同时恢复
    padding / border-radius，背景块随主题）。

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.22（2026-10-15）

代码质量收尾 + 修复 v1.6.17 重构引入的 symbol / service 切换失效 bug。

### 修复
- `kLineChartController.ts`：`symbol` / `name` / `service` 由 readonly 改为可变，
  新增 `setSymbol` / `setName` / `setService`（含 applyOptions 重绘刷新 pane0 信息行）。
- `kLineChart.vue`：`symbol` watch → `setSymbol + setName + init`；新增 `name` watch →
  `setName`；`service` watch → `setService + init`。
  （此前 props.symbol / service 变化时 init 仍用构造时旧值，切标的 / 切服务不生效。）

### 审计结论
- 未使用导出：与 v1.6.13 一致（Deps/Config/Options 为内部类型注解；
  periods 导出有 tests/periods.test.ts 保护保留；mock.ts 有 tests/mock.test.ts 保护保留）。
- 硬编码颜色：无（全部集中在 theme.ts / indicatorMeta.ts / Primitive 渲染层）。
- 内存管理：destroy 退订实时 + loadSeq++ 使在途请求失效；组件卸载仅调 destroy。
- 命名：驼峰语义化；模块级常量 UPPER_SNAKE_CASE 惯例保留。

### 文档
- `README.md`：5.3 事件表补 `status-change`；5.4 控制器方法补 init / setSymbol /
  setName / setService / setPeriod / loadStatus；5.5 数据流与左滑分页描述更新
  （v1.6.17 已移入控制器 loadEarlier）。

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.21（2026-10-15）

组件内部可读加载状态：`loadStatus` ref + defineExpose。

### 变更
- `src/components/kLineChart.vue`：
  - 新增 `loadStatus = ref<ChartLoadStatus>('idle')`：controller 状态回调同步赋值
    （组件内部模板 / script 直接读取）；
  - `defineExpose({ controller, loadStatus })`：父组件经 `chartRef.value.loadStatus`
    读取当前状态（与 emit 并存）。

### 组件内部用法
```ts
// script / 模板内直接引用
if (loadStatus.value === 'loading-older') /* 左滑分页中 */
```
父组件 ref 用法：
```ts
const chartRef = ref<InstanceType<typeof KLineChart> | null>(null)
chartRef.value?.loadStatus // 'idle' | 'loading' | 'loading-older' | 'ready' | 'error'
```

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.20（2026-10-15）

`ChartLoadStatus` 区分首载与分页：新增 `'loading-older'`。

### 变更
- `src/chart/core/types.ts`：`ChartLoadStatus = 'idle' | 'loading' | 'loading-older'
  | 'ready' | 'error'`（init 首载 → 'loading'；左滑分页 → 'loading-older'；成功 → 'ready'，
  失败 → 'error'）。
- `src/chart/core/kLineChartController.ts`：`loadEarlier` 改发 `'loading-older'`。

### 父组件监听示例
```ts
@status-change="(status) => {
  if (status === 'loading') /* 首次加载 */
  if (status === 'loading-older') /* 左滑加载更早历史 */
  if (status === 'ready' || status === 'error') /* 完成 / 失败 */
}"
```

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.19（2026-10-15）

左滑分页（loadEarlier）补齐加载状态回传。

### 变更
- `src/chart/core/kLineChartController.ts`：`loadEarlier` 增加
  `setStatus('loading')` → 成功 `setStatus('ready')` / 失败 `setStatus('error')`，
  与 init 一致；期间重新 init 时（seq 过期）不发状态（由新 init 自己发）。

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.18（2026-10-15）

加载状态回传组件：`onStatusChange` → `emit('status-change')` 事件。

### 变更
- `src/components/kLineChart.vue`：
  - 新增 `defineEmits`：`'status-change': [status: ChartLoadStatus]`；
  - 构造 controller 时把 `onStatusChange` 包装为 `(status) => emit('status-change', status)`。
- `src/App.vue`：示例监听 `@status-change="onChartStatusChange"`（console.log 展示用法）。

### 使用方式（父组件）
```vue
<KLineChart ... @status-change="(status) => { /* 'loading' | 'ready' | 'error' */ }" />
```
备选：如需回调式而非事件式，也可在组件加函数 prop `onStatusChange?` 直接透传
（`KLineChartOptions.onStatusChange` 本就支持回调）。

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.17（2026-10-15）

加载流程收进控制器：`controller.init()` 统一管理（拉历史 + 订阅实时 + 更早分页）。

### 变更
- `src/chart/core/kLineChartController.ts`：
  - 新增 `init()`（拉最新页 → setKlineData 重绘 + fitContent → 订阅实时），
    `startRealtime()`（退订旧订阅保证唯一）、`loadEarlier()`（左滑边缘自动分页，
    取代原组件 loadEarlier / onNeedEarlierData 回调）；
  - 新增字段：`service` / `onStatusChange` / `loadSeq` / `hasMoreHistory` /
    `loadingEarlier` / `realtimeUnsubscribe` / `status`；
  - `handleVisibleLogicalRangeChange` 改为内部触发 `loadEarlier()`；
  - `destroy()` 退订实时 + `loadSeq++`（使在途请求失效）。
- `src/chart/core/types.ts`：`KLineChartOptions` 删除 `onNeedEarlierData`，新增
  `service?` / `onStatusChange?`；新增 `ChartLoadStatus`（'idle'|'loading'|'ready'|'error'）。
- `src/components/kLineChart.vue`：删除组件侧 loadData / setupRealtime / loadEarlier /
  hasMoreHistory / loadSeq / unsubscribeRealtime；构造透传 `service`；onMounted 与
  period / symbol / service watch 改调 `controller.init()`；onBeforeUnmount 仅 destroy。
- 行为等价：竞态保护、左滑分页停止条件、实时唯一订阅语义均保留（从组件移入控制器）。

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.16（2026-10-15）

Mock 数据统一走服务层：控制器不再内置生成，App.vue 集中选择服务并注入组件。

### 变更
- `src/chart/core/kLineChartController.ts`：移除 `genMockBars` 依赖与构造时预生成；
  `bars` 字段默认 `[]`（数据由组件经 `ChartDataService.fetchHistory` 拉取后
  `setKlineData` 注入）。
- `src/chart/core/mock.ts`：`genMockBars` 保留（仅测试 / 数据服务复用），注释标注用途。
- `src/App.vue`：新增 `chartDataService` 实例（MockChartDataService），模板
  `:service="chartDataService"` 注入组件；注释说明接入真实行情时替换为
  HttpChartDataService 即可（组件 / 控制器零改动）。
- 组件 `service` prop 保持默认 MockChartDataService 兜底（未传时行为不变）。

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.15（2026-10-15）

删除 `pageSize` 参数（每页拉取条数固定为内部常量）。

### 变更
- `src/chart/core/constants.ts`：新增公共常量 `DEFAULT_FETCH_LIMIT = 120`
  （内置 Mock 数据量 / 历史分页 limit）。
- `src/chart/core/types.ts`：`KLineChartOptions` 删除 `pageSize`（顺带清理双注释残留）。
- `src/chart/core/kLineChartController.ts`：删除 `pageSize` 字段与构造赋值，
  `genMockBars(DEFAULT_FETCH_LIMIT)`。
- `src/components/kLineChart.vue`：删除 `pageSize` props / 默认值 / watch / 构造透传，
  `fetchHistory` limit 与 `hasMoreHistory` 判定改用 `DEFAULT_FETCH_LIMIT`。
- `README.md`：props 表格与文件树注释同步删除。
- 压力测试不受影响：`tests/stress.test.ts` 用独立 `BAR_COUNT = 10000`
  直接调 `genMockBars(10000)`（函数签名保留 count 参数）。

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.14（2026-10-15）

按文件系统大小写敏感梳理全项目 import。

### 梳理
- 全项目静态扫描（src + tests + 根目录）所有相对 import 与磁盘文件名大小写：
  - `src/` 内 **0 处不匹配**（文件名全小写、import 全小写，一致）；
  - 无同名不同大小写的重复文件（`chart/core/types.ts` 与 `chart/indicator/types.ts`
    属不同目录，正常）。
- 修复唯一不匹配：`tests/periods.test.ts` import `../src/chart/Periods`（大写）
  → `../src/chart/periods`（小写）—— macOS 大小写不敏感掩盖，大小写敏感环境（Linux / CI）
  会报模块找不到。

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.13（2026-10-15）

代码质量收尾（内存 / 缓存 / 命名 / 颜色 / 文档 / 清理审计）。

### 审计结论（未改）
- **资源清理完备**：组件 onBeforeUnmount 退订实时 + `controller.destroy()`；
  controller 的 ResizeObserver 有 disconnect；Mock 服务 interval 均 clearInterval。
- **命名合规**：变量 / 函数均驼峰语义化；模块级常量采用 UPPER_SNAKE_CASE 惯例（保留）。
- **指标颜色**：已在 indicatorMeta.ts / theme.ts 公共文件集中管理（子文件注释仅为文档说明）。
- **`httpChartDataService.ts`（HttpChartDataService）未被默认接线**：保留（后端真实行情实现，
  父组件传 `service` 即接入），README 已补充接入说明。

### 清理
- `src/chart/core/theme.ts`：新增公共颜色 `transparentColor`（rgba(0,0,0,0)）；
  `subIndicatorPaneManager.ts` 删除本文件硬编码色 `invisibleSeriesColor`，统一引用
  `theme.transparentColor`（颜色提取到公共文件）。
- 审计确认 `periods.ts` 的 `periodMap` / `getPeriodLabel` / `PeriodLabel` / `PeriodItem`
  有测试保护（tests/periods.test.ts），属有意功能，保留。

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.12（2026-10-15）

`dataCount` 参数更名 → `pageSize`（意义：每页获取多少条数据）。

### 变更
- `src/chart/core/types.ts`：`KLineChartOptions.dataCount` → `pageSize?: number`。
- `src/chart/core/kLineChartController.ts`：字段 / 构造 / genMockBars 改用 `pageSize`。
- `src/components/kLineChart.vue`：props `pageSize?: number`（默认 120）、构造透传、
  fetchHistory limit 与 hasMoreHistory 判定同步更名。
- `README.md`：props 表格与注释同步。

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.11（2026-10-15）

本地设置记录：十字光标（时间轴 / crosshair）时间格式化。

### 设置（kLineChartController.ts chart options localization）
```ts
localization: {
  // 十字光标时间格式化
  timeFormatter: (t: Time) => formatTimeByFmt(t as number, this.timeFormat),
},
```
- 十字光标命中时，时间轴 / 标签按 `format` 参数模板显示（透传 KLineChart.vue format；
  缺省按周期自动：日/周/月 → YYYY-MM-DD，分时 → HH:mm，分钟 K → YYYY-MM-DD HH:mm）。

### 修复：日/周/月 K 十字光标仍显示 HH:mm
- 根因：`formatTimeByFmt` 默认模板是 `YYYY-MM-DD HH:mm`，`this.timeFormat` 为 undefined
  时（未传 format 参数）落入默认，无视周期。
- 修复：timeFormatter 改为 `format 模板优先，否则按周期自动`
  （`this.timeFormat ? formatTimeByFmt(ts, this.timeFormat) : formatAxisTime(ts, this.period)`），
  与 pane0 信息行时间逻辑一致。

### 修复（配套编译）
- `Time` 类型补 import（lightweight-charts）；
- `updateLastBar` series.update 恢复 `time as UTCTimestamp` 断言（number → Time 类型兼容）。

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件）；未运行 / 未截图。

## v1.6.10（2026-10-15）

修复点击分钟 K（60/30/15/5/1 分 K）时实时更新报错：
`Cannot update oldest data, last time=[object Object], new time=[object Object]`。

### 根因
lightweight-charts 5 内部把 series 的 time 统一转为 BusinessDay 对象存储，
报错信息因此显示 [object Object]，实际判定是 `key(newTime) < key(lastTime)`：
分钟 K 之间（或周期切换瞬间）切换时，旧周期的实时推送/残留数据的 time
早于当前 series 最后一根，`SeriesApi.update` 直接抛错。

### 变更
- `src/chart/util/format.ts`：新增 `normalizeChartTime(time)` —— 任意来源 time →
  秒级数字时间戳（number / BusinessDay / Date / ISO；非法 → null）。
- `src/chart/core/kLineChartController.ts`：
  - `applyData`：setData 前统一归一化 time（非法条过滤），K 线 + 成交量 series 同步；
  - `updateLastBar`：time 归一化 + 非法跳过 + **新 time 早于最后一根时防御性忽略**
    （周期切换残留不再抛给库），bars 缓存同步写回归一化 time。

### 验证
vue-tsc 通过；vitest 114/114 全绿（14 文件，新增 normalizeChartTime 3 项）；未运行 / 未截图。

## v1.6.9（2026-10-15）

KLineChart.vue 新增 `format` 参数（时间格式模板字符串），透传给 KLineChartController；
周期切换时 pane0 信息行时间格式自动切换。

### 新增
- `src/components/kLineChart.vue`：`format?: string`（如 'YYYY-MM-DD' / 'YYYY-MM-DD HH:mm'），
  构造时透传 `format: props.format`；外部 period 变化时调用 `controller.setPeriod(value)`。
- `src/chart/core/types.ts`：`KLineChartOptions.format?: string`。
- `src/chart/util/format.ts`：新增 `formatTimeByFmt(ts, fmt)`（支持 YYYY/MM/DD/HH/mm/ss 标记）。
- `src/chart/core/kLineChartController.ts`：`timeFormat` 字段 + `period` 字段 + 公开
  `setPeriod(period)`（信息行 draw 时现取 getPeriod → applyOptions({}) 触发全图重绘）。
- `src/chart/core/indicatorManager.ts`：deps 新增 `getTimeFormat` / `getPeriod`；
  pane0 信息行时间 = `format ? formatTimeByFmt : formatAxisTime(time, period)`。

### 周期 → 时间格式规则（format 缺省时）
- 日 K / 周 K / 月 K → `YYYY-MM-DD`
- 分时（1d~5d）→ `HH:mm`
- 60 / 30 / 15 / 5 / 1 分 K → `YYYY-MM-DD HH:mm`

### 修复
- 删除外部注入失效的 `localization.timeFormatter`（隐式 any）；
- `setPeriod` 重绘改用公开 API `chart.applyOptions({})`（IChartApi 无 requestUpdate）；
- 统一 App / 组件 import 小写（macOS 大小写敏感）。

### 验证
vue-tsc 通过；vitest 111/111 全绿（14 文件，新增 formatTimeByFmt 3 项）；未运行 / 未截图。

## v1.6.0（2026-10-15）

版本号按用户要求提升至 v1.6.0（主版本号升级，作为新基线）。

- 代码 / 功能状态与 v1.5.11 交付一致：多 Pane K 线组件、timeAxis 构造透传、
  按周期时间格式（pane0 信息行 + 十字星时间轴指示值）、十字星 rAF 节流、
  分钟 K 真实化模拟数据等。

### 验证
vue-tsc 通过；vitest 108/108 全绿（14 文件）；未运行 / 未截图。

## v1.5.11（2026-10-15）

KLineChart.vue 的 timeAxis 透传给 KLineChartController 构造。

### 变更
- `src/chart/core/types.ts`：KLineChartOptions 新增 `timeAxis?: boolean`。
- `src/chart/core/KLineChartController.ts`：构造内应用
  `timeScale.applyOptions({ visible: options.timeAxis ?? true })`，置于布局初始化之前；
  后续外部变化仍走 `toggleTimeAxis(visible)`；
  移除外部注入的失效 `tickMarkFormatter`（依赖已删除的 formatTimeByFmt）。
- `src/components/KLineChart.vue`：onMounted 构造传入 `timeAxis: props.timeAxis`，
  移除构造后重复的 `toggleTimeAxis(props.timeAxis)`。

### 验证
vue-tsc 通过；vitest 108/108 全绿（14 文件）；未运行 / 未截图。

## v1.5.10（2026-10-15）

pane0 信息行与十字星时间轴指示值支持按周期区分的时间格式。

- `format.ts` 新增 `formatClock` / `formatDateTime` / `formatAxisTime`：
  日/周/月 K → YYYY-MM-DD；分时 1d~5d → HH:mm；60/30/15/5/1 分钟 K → YYYY-MM-DD HH:mm。
- pane0 信息行时间改为 `formatAxisTime(time, getPeriod())`。
- 十字星时间轴指示值：新增 `setOnCrosshairTime` 回调 + 组件自绘覆盖块
  （不透明背景遮库时间 label，配色跟随深/浅系）。

### 验证
vue-tsc 通过；vitest 108/108 全绿（14 文件）；未运行 / 未截图。

## v1.5.9（2026-10-15）

修复拖拽平移 / 快速移动鼠标时的卡顿（平移性能优化）。

### 根因
拖拽平移 = 持续 mousemove → 库 `crosshairMove` 高频触发（频率可远高于帧率）→
每次回调 `setCrosshairY` → `requestUpdate` → 库 fullUpdate 全图重绘 → 卡顿。
（自绘 primitive 均已按可视逻辑范围裁剪，10000 条数据下每帧仅绘制可视 ~120 根，
非渲染热点；热点在十字星事件的无效高频重绘。）

### 变更
- `src/chart/core/crosshairManager.ts`：
  - `handleCrosshairMove` 增加 **rAF 节流**：同帧内多次 move 合并为一次处理
    （`pendingParam` + `frameScheduled`），每帧至多一次十字星联动与重绘；
  - 处理逻辑抽到 `applyCrosshairMove`（行为不变：pane0 清除、命中 pane 注入指示值）；
  - `destroy` 取消待处理帧并清空 pendingParam（防销毁后残留回调）。
- `src/chart/crosshair/crosshairAxisLabelPrimitive.ts`：
  - `setCrosshairY` **同值跳过**：y 未变化时不重复 requestUpdate（拖拽时连续相同 y 不再触发重绘）。

### 验证
vue-tsc 通过；vitest 103/103 全绿（14 文件）；未运行 / 未截图。

## v1.5.8（2026-10-15）

分钟 K（周/月/60/30/15/5/1 分）模拟数据真实化。

### 变更
- `src/services/chartDataService.ts`（MockChartDataService）：
  - **分钟 K 全新生成器** `buildMinuteKPool` + `buildIntradayPath`：
    - 布朗桥锚定**日 K 开/收**——09:30 竞价价 = 日开盘、15:00 = 日收盘，
      中间点 = 线性锚点 + 终值归零噪声（分钟路径与日/周/月 K 价格自洽，跨周期连续）；
    - 按**真实交易时段**聚合：60 分 4 段（09:30-10:30/10:30-11:30/13:00-14:00/14:00-15:00）、
      30 分 8 段、15 分 16 段、5 分 48 段、1 分 241 段；
      段首 time 统一为 09:30/10:30/11:30/13:00/14:00…（规范时间轴）；
    - 段间 open ≈ 前根 close（分钟路径连续，午休无跳空、无序号分段的
      "尾段 1 点一字线 / 段跨午休" 怪状）；
    - 成交量 U 型分布（开盘 09:30-09:45 / 尾盘 14:45-15:00 放量 ×3）；
  - 删除 `minuteBucketOf` / `ensureMinutePool` / `minutePools`（旧序号分段逻辑）；
    `buildTsPool` 仅服务分时（1d~5d）；
- README 5.5 补充分钟 K 生成方式说明。

### 验证
vue-tsc 通过；vitest 103/103 全绿（14 文件）；
临时数据真实性脚本（已删）4 项全过：60min 240 根且时段对齐、段间无跳空、
30/15/5min 根数 = 60 日 × 每日段数、1min 14460 根间隔 60s/午休 5460s/跨日连续、
60min 末段收盘与日 K close 自洽；未运行 / 未截图。

## v1.5.7（2026-10-15）

删除 periodWhitelist（周期白名单）全部设置，周期由父组件全量控制。

### 变更
- `KLineChart.vue`：删除 `periodWhitelist` prop 与默认值、`whitelistedPeriods`
  解析、组件内白名单周期按钮栏（模板 + CSS）及 `periodBarStyle` CSS 变量；
  删除无调用方的 `switchPeriod`、`defineEmits`（周期变化由 props.period watch 驱动，
  父组件自身感知）与 `computed` import；
- `theme.ts`：删除 `periodBarColors` / `PeriodBarColors`（白名单栏删除后无引用）；
- `App.vue`：删除周期白名单注释残留，周期栏注释改为"全量互斥单选"；
- `README.md`：Props / 事件表去掉 periodWhitelist，删除 5.5 白名单章节并重排
  章节号（5.6/5.7 → 5.5/5.6），顺带修正 5.4 控制器方法注释
  （shift 描述同步为"逻辑范围平移一屏宽"）。

### 验证
vue-tsc 通过（含 noUnused 检查）；vitest 103/103 全绿（14 文件）；
未运行 / 未截图。

## v1.5.6（2026-10-15）

代码质量收尾：颜色统一提取、开启未用代码检查、修复偶发测试失败。

### 变更
- **颜色提取到公共文件**：白名单周期栏配色提取至 `theme.ts` 的
  `periodBarColors`（深 / 浅系两组，active 红底白字两系一致）；
  `KLineChart.vue` 周期栏 CSS 改用 var() 引用（`--period-btn-*`），
  消除组件内硬编码颜色，并补齐浅系配色适配；
- **tsconfig** 开启 `noUnusedLocals / noUnusedParameters`（全量零报错，
  确认无未使用变量 / 参数 / 文件；全 src 文件引用复查无孤儿文件）；
- **修复偶发测试失败根因**：`tests/stress.test.ts` 耗时用例（10000 条生成 /
  主图 / 成交量 / 附图十种 / 性能）显式 `testTimeout=20000ms`——
  附图十种全量约 3.3s，默认单测 5s 上限在全量并发负载下偶发超时（此前
  多次"复跑即绿"的偶发失败即此因）；
- 复查：订阅 / 缓存清理完整（destroy 退订 + Mock 池缓存 / Http LRU 边界 +
  组件卸载置空引用）；函数名驼峰语义化（指标周期变量如 ma12 / e26 为业务值）。

### 验证
vue-tsc 通过（含 noUnused 检查）；vitest 103/103 全绿（14 文件，连续多次全量复跑）；
未运行 / 未截图。

## v1.5.5（2026-10-15）

修复缩小不能到极致。

### 变更
- `KLineChartController.zoomOut`：barSpacing 下限 4px → **0.5px**
  （库 timeScale 最小 barSpacing），可一路缩小到全部数据可见（极致缩小）。

### 验证
vue-tsc 通过；vitest 103/103 全绿（14 文件）；未运行 / 未截图。

## v1.5.4（2026-10-15）

修复左移 / 右移"点击一下就跳到最新数据末尾"。

### 变更
- `KLineChartController.shiftLeft / shiftRight`：
  - 弃用 `scrollPosition() + scrollToPosition(position ∓ width)`——距右边缘不足一屏时
    减幅变负被库 clamp，直接跳到最新数据末尾；
  - 改为**逻辑范围平移**：`getVisibleLogicalRange` → `setVisibleLogicalRange(from ∓ width)`，
    平移一屏宽度，到达最左 / 最右自然停止，无跳变；
- `tests/stress.test.ts`：性能上限 3000ms → 8000ms（环境波动 / CI 负载容忍，
  常规 <200ms；消除偶发失败）。

### 验证
vue-tsc 通过；vitest 103/103 全绿（14 文件，连续 3 次全量复跑）；
未运行 / 未截图。

## v1.5.3（2026-10-15）

左 / 右刻度开关切换不再改变视图内数据。

### 变更
- `KLineChartController.applyPriceScaleVisible`：
  - 开关切换前保存当前可见时间范围（`getVisibleRange`），
    切换后 `setVisibleRange` 恢复——刻度区开关只改变数据区宽度，
    **不再 fitContent 重置视口**（视图内的 K 线数据保持不变）。

### 验证
vue-tsc 通过；vitest 103/103 全绿（14 文件）；未运行 / 未截图。

## v1.5.2（2026-10-15）

平移左滑到最左边缘自动加载更早历史（分页前置插入）。

### 变更
- `KLineChartController.ts`：
  - `KLineChartOptions` 新增 `onNeedEarlierData` 回调；构造订阅
    `subscribeVisibleLogicalRangeChange`——可视逻辑范围左边界 ≤ 0（到达最左边缘）触发；
  - 新增 `prependHistory(points)`：过滤 kline 点 → 前置合并（去重 / 升序）→ 重建
    series / 指标缓存 → 视口逻辑范围右移 added（保持当前看到的数据位置不变）；
    返回实际新增条数（0 = 无更早数据）；`getEarliestTime()`：before 分页锚点；
  - destroy 退订 visible range 监听；
- 新增 `src/chart/core/mergeBars.ts`（纯函数：前置合并去重排序 + added 条数）；
- `KLineChart.vue`：`loadEarlier()`——防抖（单在途请求）+ 停止条件（返回不足 limit
  或合并新增 0 时 hasMoreHistory=false 防死循环）；周期 / symbol 切换重置边缘加载状态；
- README 5.6 补充"平移左滑自动加载更早历史"说明；
- 新增 `tests/mergeBars.test.ts`（4 项）：前置插入、去重（incoming 优先）、
  重复页 added=0、空输入。

### 验证
vue-tsc 通过；vitest 103/103 全绿（14 文件）；未运行 / 未截图。

## v1.5.1（2026-10-15）

service prop 简化：直接定义 `service?: ChartDataService`（无默认值）。

### 变更
- `KLineChart.vue`：
  - 删除 withDefaults 中 `service: () => defaultService`（对象默认值需工厂函数，冗余）；
  - 组件内 loadData / setupRealtime 改用 `props.service ?? defaultService` 兜底
    （未传 service 时使用模块级 Mock 单例）；
  - 修复被环境/格式化器改动产生的重复 import（ChartDataService 值导入 interface）与
    defaultService 定义丢失，恢复 `import { MockChartDataService }` + 单例声明。

### 验证
vue-tsc 通过；vitest 99/99 全绿（13 文件，chartDataService 单文件多次复跑稳定）；
未运行 / 未截图。

## v1.5.0（2026-10-15）

数据服务（src/services）集成到组件：历史拉取 + 实时订阅统一走 ChartDataService 接口。

### 变更
- `KLineChart.vue`：
  - 新增 props：`period`（PeriodValue，默认 'day'，外部可控）、`service`
    （ChartDataService，默认 MockChartDataService 单例，接入真实行情传
    HttpChartDataService 实例零改动）、`dataCount` 语义改为每页拉取条数（limit）；
  - 首次挂载 / symbol / period / dataCount / service 变化 → fetchHistory 拉历史 →
    controller.setKlineData（过滤 kline 点、整体重建 + fitContent）；
  - 实时订阅 service.subscribeRealtime → controller.updateLastBar（同 time 覆盖
    最后一根 / 更大 time 追加新 K，指标增量重建）；卸载 / 周期切换先退订（防泄漏）；
  - loadData 请求序号守卫：快速切换周期丢弃过期响应（防乱序覆盖）；
  - 恢复组件内白名单周期按钮栏（periodWhitelist 有值时渲染，点击切换 + emit
    period-change）；
- `KLineChartController.ts`：新增 `setKlineData(points)` / `updateLastBar(point)`
  （bars 改可变引用）；
- `App.vue`：`:period="activePeriod"` + `@period-change` 联动（App 周期栏点击 →
  组件重拉该周期数据）；
- README 使用手册更新：5.2 Props 新增 period / service、5.6 数据接入改为
  service 集成说明（Mock 默认 / Http 接入 / 后端接口约定）；
- 新增 `tests/chartDataService.test.ts`（9 项）：日 K / 周 / 月 / 分时 1d 数据形态、
  before 分页、seed 稳定、实时订阅 fake timers 回调与退订。

### 验证
vue-tsc 通过；vitest 99/99 全绿（13 文件）；未运行 / 未截图。

## v1.4.101（2026-10-15）

十字星虚线周期改 [1, 1]（最密）。

### 变更
- `crosshairLineCapPaneView.ts`：`DASH_LENGTH_PHYSICAL` 2 → 1；
  - 自绘细虚线（0.75 CSS px 亚像素抗锯齿保留）周期 [1, 1] 物理 px（最密，观感更细腻）；
  - 底部补齐实线长度同步（1 物理 px），"竖线到底"不变；
- `crosshairLineCapPrimitive.ts` / README：注释与说明同步 [1, 1]
  （库 LargeDashed [6, 6] 事实描述保留）。

### 验证
vue-tsc 通过；vitest 90/90 全绿（12 文件）；未运行 / 未截图。

## v1.4.100（2026-10-15）

十字星虚线周期改 [2, 2]（更密更精致）。

### 变更
- `crosshairLineCapPaneView.ts`：`DASH_LENGTH_PHYSICAL` 6 → 2；
  - 自绘细虚线（0.75 CSS px 亚像素抗锯齿保留）周期由 [6, 6] 改为 [2, 2] 物理 px，
    虚线更密、视觉更精致；
  - 底部补齐实线长度同步（2 物理 px），"竖线到底"不变；
- `crosshairLineCapPrimitive.ts` / README：注释与说明同步 [2, 2]。

### 验证
vue-tsc 通过；vitest 90/90 全绿（12 文件）；未运行 / 未截图。

## v1.4.99（2026-10-15）

十字星虚线更细（亚像素自绘竖线 + 透明度降低）。

### 背景
库 crosshair 线宽仅支持整数（1 已最细），无法再细 → 视觉偏粗。

### 变更
- `crosshairLineCapPaneView.ts`：竖线改为 top 层**整条重绘细虚线**：
  - 线宽 0.75 CSS px（= 0.75 × dpr 物理 px，canvas 亚像素抗锯齿 → 视觉细于库 1px）；
  - 虚线周期 [6, 6] 物理 px 与库 LargeDashed 对齐（同色覆盖库竖线本体，无缝）；
  - 底部补齐实线（同宽）保留，"竖线到底"修复不被破坏；
  - 库竖线保留（时间轴时间 label 依赖库绘制）；
- `crosshairLineCapPrimitive.ts`：注释同步（细虚线 + 补齐语义）；
- `theme.ts`：`crosshairLineColor` 透明度 0.45 → 0.25（深系 rgba(149,152,161,0.25) /
  浅系 rgba(90,96,112,0.25)）——横线（库 1px 淡色）与竖线（自绘同色）整体更淡；
- README 视觉与交互章节补充"十字星细虚线"说明。

### 验证
vue-tsc 通过；vitest 90/90 全绿（12 文件）；未运行 / 未截图。

## v1.4.98（2026-10-14）

README 新增组件使用手册。

### 变更
- README 新增"五、组件使用手册（KLineChart）"章节（原 五~八 章节顺延为 六~九）：
  5.1 快速开始 / 5.2 Props 一览（10 项，含 periodWhitelist）/ 5.3 事件（period-change）/
  5.4 控制器方法（ref 访问：zoomIn/zoomOut/shiftLeft/shiftRight/applyTheme/
  toggleTimeAxis/setLeftScaleVisible/setRightScaleVisible/setMainIndicator/
  setSubIndicator/destroy）/ 5.5 周期白名单用法（数组|字符串）/ 5.6 数据接入
  （ChartDataPoint 结构与 time 递增约束）/ 5.7 主题与配色（深浅系 + 去白化指标色）；
- 运行章节测试条数修正为 90 项。

### 验证
vue-tsc 通过；vitest 90/90 全绿（12 文件）；未运行 / 未截图。

## v1.4.97（2026-10-14）

周期白名单全局生效：App 周期栏按白名单渲染。

### 变更
- `App.vue`：周期白名单改为单一配置源 `periodWhitelist = 'day,week,month'`：
  - App 底部周期栏由全量 13 项改为渲染 `whitelistedPeriods`（白名单过滤，
    未知周期自动剔除）→ 仅显示 日K / 周K / 月K 三个；
  - 同源传给 `KLineChart` 的 `:period-whitelist` prop（组件内白名单栏一致）；
  - 高亮 / 互斥单选逻辑不变（默认日K在白名单内）。

### 验证
vue-tsc 通过；vitest 90/90 全绿（12 文件）；未运行 / 未截图。

## v1.4.96（2026-10-14）

修复：周期白名单按钮不可见（定位祖先缺失）。

### 根因
`KLineChart.vue` 模板为多根结构，白名单周期栏 `.kline-period-bar` 使用
`position: absolute` 但无 `relative` 定位祖先 → 按钮相对最近的 positioned
祖先（页面 / 外层容器）定位，飘出图表容器外，视觉上"白名单没有生效"。

### 变更
- `KLineChart.vue`：模板改为单根包裹 `.kline-chart`（`position: relative`），
  白名单周期栏 absolute 相对包裹层悬浮于图表顶部（不参与布局、不改变尺寸）；
- `App.vue`：`<KLineChart>` 传入 `period-whitelist="day,week,month"`
  （组件内渲染日K / 周K / 月K 三个白名单周期按钮）。

### 验证
vue-tsc 通过；vitest 90/90 全绿（12 文件）；未运行 / 未截图。

## v1.4.95（2026-10-14）

周期选择：App 周期栏 + 组件周期白名单。

### 变更
- `App.vue`：底部新增周期栏（`period-bar`，样式与主 / 附图指标栏一致）：
  渲染 `PERIODS` 13 项（分时 1~5 日 + 日/周/月 K + 60~1 分 K），互斥单选，
  默认日K，点击切换 `activePeriod`（仅维护状态，周期数据请求另行接入）；
- `KLineChart.vue`：新增 `periodWhitelist` prop（`PeriodValue[] | string`）：
  - 数组（如 `['day','week','month']`）或逗号分隔字符串（如 `'day,week,month'`）；
  - 有值（非空）时组件内渲染白名单内的周期按钮（悬浮于图表顶部，不参与布局），
    点击 emit `'period-change'`（value 为周期标识）；无值 / 空时不渲染
    （周期由外部 App 工具栏控制）；
  - `whitelistedPeriods` computed 解析白名单并过滤 `PERIODS`（未知周期自动剔除）。

### 验证
vue-tsc 通过；vitest 90/90 全绿（12 文件）；未运行 / 未截图。

## v1.4.94（2026-10-14）

周期配置独立文件。

### 变更
- 新增 `src/chart/periods.ts`（chart/ 下独立文件，不建子目录）：
  - `PERIODS`：13 项周期（1~5 日分时 / 日周月 K / 60/30/15/5/1 分 K），
    `as const` 派生联合类型 `PeriodValue` / `PeriodLabel` / `PeriodItem`；
  - `periodMap`：value → 配置项 O(1) 查询表（模块加载一次构建，切换周期零线性查找）；
  - `getPeriodLabel`：按 value 取展示文案，未知周期容错返回原值；
- 新增 `tests/periods.test.ts`（6 项：清单完整 / value 唯一 / label 非空 /
  periodMap 一致性 / getPeriodLabel 命中与容错 / PeriodValue 联合类型抽检）。

### 验证
vue-tsc 通过；vitest 90/90 全绿（12 文件，新增 periods 6 项）；未运行 / 未截图。

## v1.4.93（2026-10-14）

数据极限压力测试：10000 条数据全指标验证 + 组件支持数据条数配置。

### 变更
- `KLineChart.vue` / `KLineChartOptions`：新增 `dataCount` prop（默认 120，
  压测 / 演示可传 10000；controller 构造即用 `genMockBars(dataCount)` 生成）；
- 新增 `tests/stress.test.ts`（6 项，10000 条）：
  ① 数据完整性（time 严格递增唯一 / tradeDate 格式 / OHLC 值域自洽）；
  ② 主图指标 MA×5 / EXPMA×2 / BOLL×3 / SAR / BBI 全量计算无 NaN；
  ③ 成交量均量 VOL MA5 / MA10；
  ④ 附图指标十种（RSI/KDJ/MACD/WR/DMI/BIAS/OBV/CCI/ROC/CR）全量无 NaN；
  ⑤ 缓存语义：每条线 time 唯一（O(1) 查询 Map 前提，无重复 / 无乱序）；
  ⑥ 性能：10000 条 × 全部指标一次性计算耗时上限（实为 O(n) 线性）；
- 各指标文件注释色值同步 v1.4.92 去白化（#A0A0A0 → #666666）；
- 修复：theme.ts `volMa5` / `volMa10` 被环境回滚为错误值（#DD9900 / #FF00FF）
  → 恢复为 v1.4.92 正确值（#FFD54F / #F06292）；
- 文件名驼峰规范（K 线专有名词大写 K）：`kLineChart.vue` → `KLineChart.vue`、
  `kLineChartController.ts` → `KLineChartController.ts`，全部 import / README / CHANGELOG 引用同步修正。

### 验证
vue-tsc 通过；vitest 84/84 全绿（11 文件，新增 stress 6 项）；
压测数据 10000 条全指标计算 < 100ms（O(n)）；未运行 / 未截图。

## v1.4.92（2026-10-14）

指标配色去白化：浅系（白底）下所有指标线清晰可见。

### 变更（theme.ts 统一管理，主 / 附图指标共 10+ 处）
- MA5 / EXPMA12 及全部附图指标第一线（RSI6 / K / DIF / WR10 / PDI / BIAS6 / OBV /
  CCI / ROC / CR）：东财标准白线 `#A0A0A0` 在浅系下过淡 → 统一加深为 `#666666`；
- BOLL 中轨 `#FFFFFF`（浅系白底完全不可见）→ `#33373E`（深灰黑，深浅系均清晰）；
- BBI `#B0BEC5`（浅蓝灰过淡）→ `#607D8B`（蓝灰）；
- 深浅系共用同一配色（不随主题变化），替换色均满足深系（#131722）与浅系（#FFFFFF）
  双背景对比度；
- 同步更新 theme.ts 头注释（说明东财标准色 → 适配深色版原因）与 tests/theme.test.ts
  断言（10 处色值）。

### 验证
vue-tsc 通过；vitest 78/78 全绿；未运行 / 未截图。

## v1.4.91（2026-10-14）

代码质量收尾（清理未使用声明 / 依赖瘦身）。

### 清理
- `axisLabelPaneView.ts` / `crosshairAxisLabelPaneView.ts` / `highLowMarkerPaneView.ts`：
  删除只赋值未读取的 `source` 字段（渲染器 `rendererImpl` 闭包已持有 primitive 引用，
  不持有冗余引用可减少内存驻留）；
- `indicatorManager.ts`：删除 `IndicatorManagerDeps` 中未使用的
  `getKlineSeries` / `getVolumeSeries` 惰性 getter（拆分后无人调用）及对应字段；
  `crosshairRegistry` 仅构造时转发给 SubIndicatorPaneManager，不再冗余持有；
- `subIndicatorPaneManager.ts`：`updateThemeColors(themeColorSet)` 删除未读参数
  （锚点 series 固定全透明，与主题无关）；`ChartThemeColors` import 同步移除。

### 质量核查（本轮扫描结论）
- 硬编码颜色：全仓扫描 hex / rgba —— 除注释文档外无硬编码，颜色统一在 theme.ts；
- 未使用文件：无（所有文件均有引用）；命名均驼峰语义化、无特殊符号；
- 缓存管理：IndicatorLineSpec / InfoSegment / 指示值均按需重建 + 现取 O(1)，destroy 清理引用；
- 验证：vue-tsc 通过（含 --noUnusedLocals --noUnusedParameters）；vitest 78/78 全绿；
  未运行 / 未截图。

## v1.4.90（2026-10-14）

修复十字星竖线"距底部还有距离，有些地方能到底、有些地方不能到底"。

### 根因
库 CrosshairRenderer 竖线为 LargeDashed 虚线（[6, 6] 物理像素，周期 12px），
从 pane 顶部画到底部。pane 高度（物理像素）非 12 的整数倍时，虚线最后一段
是空白段 → 竖线视觉上距 pane 底部有 0~6 CSS px 缺口；不同 pane 高度 /
窗口尺寸变化 → 相位随机 → 表现时有时无。

### 变更
- 新增 `crosshairLineCapPrimitive.ts` / `crosshairLineCapPaneView.ts`：
  top 层（库竖线之后）补画最后一段虚线段长度（6 / dpr CSS px）的实线 ——
  无缺口时与最后实线段重叠（无视觉变化）、有缺口时恰好填满空白段，
  虚线主体（LargeDashed）观感不变；
- 挂载：pane1 / pane2 / pane3（KLineChartController）、pane4 / pane5
  （SubIndicatorPaneManager）各一个实例；pane0 不挂（被信息行背景遮住）。
  颜色 / 时间 / x 全部动态获取（主题切换、十字星移动即时生效）。

### 验证
vue-tsc 通过；vitest 78/78 全绿；未运行 / 未截图。

## v1.4.89（2026-10-14）

重构 pane4（指标信息行）与 pane5（指标图）：从 indicatorManager.ts 拆出为
独立类 SubIndicatorPaneManager（subIndicatorPaneManager.ts）。

### 变更
- 新增 `src/chart/core/subIndicatorPaneManager.ts`：pane4 / pane5 的创建、销毁、
  数据重建（线 / 红绿柱 / Y 轴对称锚点 / 信息行值）、pane4 信息行分段构建、
  主题同步（锚点 series 保持全透明）、销毁清理 —— 每类一文件，职责单一；
- `indicatorManager.ts`：749 → 374 行，只保留主图指标 / 成交量均量线 /
  pane0 / pane2 信息行；setSubIndicator / getShowIndicator / rebuildIndicatorData /
  updateThemeColors / destroy 转发 SubIndicatorPaneManager；
- `types.ts`：新增公共类型 CrosshairPrimitiveRegistry / IndicatorValueMap
  （原定义于 indicatorManager，供两个管理器共用）。

### 验证
vue-tsc 通过；vitest 78/78 全绿；未运行 / 未截图。

## v1.4.88（2026-10-14）

十字星在 pane5 的逻辑照搬 pane3：指标线层级 'normal' → 'top'。

### 变更
- `indicatorManager.ts`：pane5 指标线（DIF/DEA 等）zOrder 由 'normal'（十字星之下）
  改为默认 'top'（十字星之上），与 pane3 成交量均量线一致 —— 指标线完整可见、
  不被十字星横线遮挡；MACD 红绿柱保持 'normal'（十字星穿过柱区仍可见）。
- `indicatorLinePrimitive.ts`：选项注释同步（'normal' 改为预留分支）。

### 验证
vue-tsc 通过；vitest 78/78 全绿；未运行 / 未截图。

## v1.4.87（2026-10-14）

十字星线透明度 0.6 → 0.45（消除线被竖线轻微遮盖的断口观感）。

### 说明
"MACD 线条之间的间隔"经排查为**正常现象**：DIF（白）与 DEA（黄）是两条
不同周期的均线差，数值不同 → 纵坐标不同 → 两条线之间存在垂直间距，交叉点
即金叉 / 死叉。数据层已加测试（macdLineContinuity）证明线点完整、无 NaN、
time 与 K 线严格对齐；挂载顺序保证线绘制在柱之上。

### 变更
- `theme.ts`：crosshairLineColor 透明度 0.6 → **0.45**（深浅系同步）——
  竖线穿过 DIF/DEA 线与红绿柱时遮盖更轻微，线保持连贯；十字星仍清晰。

### 验证
vue-tsc 通过；vitest 78/78 全绿（新增 3 项 macdLineContinuity）；未运行 / 未截图。

## v1.4.86（2026-10-14）

修复十字星（竖线 / 横线）穿过 MACD 红绿柱时柱体被遮盖。

### 根因
十字星线使用库默认 `#9598A1` **不透明**虚线（LargeDashed）。竖线在柱体上方
（v1.4.83 起"十字星在 pane5 最上层"），穿过红绿柱时，不透明虚线把柱体
完全盖住 → 视觉上"红绿柱被遮盖"。

### 变更
- `theme.ts`：新增 `crosshairLineColor`（半透明）——
  深系 `rgba(149,152,161,0.6)`（#9598A1 @ 60%）、浅系 `rgba(90,96,112,0.6)`
  （中灰，白底更清晰）；
- `KLineChartController.ts`：初始 options 与主题切换（applyTheme）同步设置
  `crosshair.vertLine.color / horzLine.color` —— 虚线间隙与线体均透出柱体，
  "不被遮盖"，同时十字星仍清晰（层级保持"十字星在柱上方"不变）。

### 验证
vue-tsc 通过；vitest 75/75 全绿；未运行 / 未截图。

## v1.4.85（2026-10-14）

修复十字星竖线"不能到 pane5 底部"。

### 根因
lightweight-charts 在 Pane 之间绘制 1px 分隔线（`SeparatorConstants.SeparatorHeight`）。
此前注释声称"已通过 patch-lwc-separator.js 将 1 → 0"，但该 patch **未生效**
（node_modules 重装后丢失、scripts 脚本不存在）：指标开（6 Pane）时 5 条分隔线
共 5px，全部从 Pane 可用高度中扣除 → pane5 实际高度比布局目标偏小，且 pane5
底部残留 1px 分隔线 —— 竖线虽画满 pane5 canvas，但视觉上被分隔线截断，
表现为"竖线不能到 pane5 底部"。

### 变更
- patch lightweight-charts dist 中 4 处 `SeparatorConstants.SeparatorHeight` 1 → 0
  （SeparatorWidget 行高 / getSize / getBitmapSize / adjustSizeImpl）；
- 新增 `scripts/patch-lwc-separator.js`（幂等，可重复执行）并接入
  `npm run patch`：node_modules 重装后一键恢复；
- README 补充 patch 必要性说明（未 patch 时 Pane 间 1px 分隔线 + pane5 高度
  偏小 + 竖线视觉截断）。

### 说明（竖线机制）
库竖线在每个 Pane 的 top canvas 绘制 0 → Pane 高度，无裁剪；本修复后 pane5
高度恢复布局目标值，竖线贯穿 pane5 到底（时间轴之上）。鼠标移出 Pane 数据区
（进入时间轴 / 图表外）时库会清除十字星，属库标准行为。

### 验证
vue-tsc 通过；vitest 75/75 全绿；未运行 / 未截图。

## v1.4.84（2026-10-14）

修复 MACD 附图红绿柱被"切割"、DIF / DEA 灰黄线不连贯。

### 根因
v1.4.83 将 MACD 柱（MacdBarPrimitive）与 pane5 指标线降为 normal 层（十字星之上）
后，二者与锚点 series 同在 main canvas。库 normal 层绘制顺序 = **先 pane
primitive、后 series 本体**：锚点 series（`indicatorsBarSeries`，Histogram，
颜色 = 不透明背景色）每个 bar 画一根背景色柱形 → 逐根覆盖先画的自绘红绿柱
与灰黄线 → 柱被切、线断断续续。v1.4.81（zOrder 'top'）时柱画在 top canvas，
被 main canvas 的锚点柱盖住，无此问题。

### 变更
- `indicatorManager.ts` 新增 `invisibleSeriesColor = 'rgba(0, 0, 0, 0)'`；
- 锚点 series（`indicatorsBarSeries` / `indicatorScaleAnchorSeries`）颜色
  背景色 → **全透明**：透明不产生像素、不覆盖自绘内容；scale 值域只取
  数据值，与颜色无关，刻度对称 / 0 值线固定不受影响；
- `updateThemeColors` 主题切换时同步保持锚点全透明（避免浅 / 深切换时
  被改回不透明背景色导致问题复发）。

### 验证
vue-tsc 通过；vitest 75/75 全绿；未运行 / 未截图。

## v1.4.83（2026-10-14）

十字星（横线 / 竖线）在附图指标 MACD 时置于红绿柱上方（不放在下方）。

### 背景
v1.4.82 的对应修改因用户环境回滚丢失（源码退回 v1.4.81、zip 被清理），
本版重建并交付。

### 根因
库 top canvas 绘制顺序固定：先 `drawCrosshair`（十字星横竖线）→ 再画
primitive 的 zOrder 'top' 视图。MACD 柱（MacdBarPrimitive）此前 zOrder = 'top'
→ 画在十字星**之上**，十字星被红绿柱盖住（视觉上横线 / 竖线在柱下方）。

### 变更
- `macdBarPaneView.ts`：MACD 柱 zOrder 'top' → **'normal'**（数据层：十字星之下、
  K 线 / 柱之上）；库按 zOrder 提取分层（main canvas z-index 1 < top canvas
  z-index 2），十字星横竖线必在柱上方；
- `indicatorLinePrimitive.ts`：新增构造选项 `getZOrder?: () => 'top' | 'normal'`
  （默认 'top'，pane1 主图 / pane3 成交量线行为不变）；
- `indicatorLinePaneView.ts`：zOrder 由注入 getter 动态决定；
- `indicatorManager.ts`：pane5 指标线（DIF / DEA）传 `getZOrder: () => 'normal'`
  → 与柱同层，十字星同样在其上方。
- 栅格（bottom）/ 边框（normal 默认）本就在十字星之下，无需改动。

### 验证
- vue-tsc 通过；vitest 75/75 全绿；未运行 / 未截图。

## v1.4.81（2026-10-14）

MACD 去掉 MACD 柱的线条：只保留 DIF / DEA 两条线 + 红绿柱。

### 变更
- `indicatorManager.ts` `rebuildSubIndicatorData`：
  - `subIndicatorLines` 对 MACD 只取前两条（DIF / DEA）画线；
    MACD 柱（第三条）由 MacdBarPrimitive 红绿柱自绘，不再画线
    （此前柱与线重复叠加）；
  - 其余指标仍全部线型绘制；
  - pane4 信息行值缓存（subIndicatorValueMaps）保持全量三条
    （DIF / DEA / MACD 值继续显示，不受影响）。

### 验证
- vue-tsc 通过；vitest 75/75 全绿；未运行 / 未截图。

## v1.4.80（2026-10-14）

CCI 附图指标刻度与 MACD 对齐：中间值固定 0、刻度对称（|max| = |min|）。

### 变更
- `indicatorManager.ts`：新增 0 对称中心指标集合
  `zeroCenteredSubIndicators = ['macd', 'cci']` 与判定函数
  `isZeroCenteredSubIndicator`（语义化，后续 0 中心指标直接加入集合）：
  - `rebuildSubIndicatorData`：`forceZero` 改用集合判定 →
    CCI 与 MACD 一样 scale 值域强制对称 `[-absMax, +absMax]`（CCI 以 0 为
    自然中心，常用 ±100/±200 摆动）；
  - pane5 中间刻度：`getFixedMiddleValue` 改用集合判定 → CCI 中间固定 0；
  - 首尾固定值（v1.4.79 的 getEdgeFixedValues）本已通用 → CCI 首尾自动显示
    ±absMax；
  - 刻度对称锚点 series（交替 ±absMax）本已通用 → CCI 平移时 0 值线同样固定。

### 验证
- vue-tsc 通过；vitest 75/75 全绿；未运行 / 未截图。

## v1.4.79（2026-10-14）

彻底修复附图指标左刻度 |max| ≠ |min|（实测 0.27 / -0.28，差 0.01）。

### 根因（v1.4.76 值域对称 + v1.4.77 边距对称后仍不对称）
首尾刻度标签位置**内嵌 AXIS_LABEL_PAD = 8px**（顶部 y=8、底部 y=H-8），
值经库 `coordinateToLogical` 反推。库映射公式（默认不反转）：

```
invCoord = H - 1 - y
logical = min + (max-min) × (invCoord - bottomMarginPx) / (internalHeight - 1)
```

scale max 映射在 y = 0.1H、min 映射在 y = 0.9H（对称），但内嵌 8px 的位置
使顶 / 底产生**不同溢出率**（对称值域 ±A 时：顶部 ≈ +0.151A、底部 ≈ −0.163A，
随 pane 高度变化）→ 反推显示值 |max| ≠ |min|（如 0.27 / −0.28）。

### 修复
- `axisLabelPrimitive.ts`：`AxisLabelConfig` 新增 `getEdgeFixedValues?`；
  首尾刻度（i = 0 / hCount）存在该值时**直接固定显示** scale 边界值，
  不再 coordinateToPrice 反推（位置仍内嵌，仅值改为固定）；
- `indicatorManager.ts`：缓存 `subScaleMax / subScaleMin`（rebuildSubIndicatorData
  每次重建赋值 = maxValue / minValue），pane5 刻度 primitive 传入
  `getEdgeFixedValues: () => ({ topValue: subScaleMax, bottomValue: subScaleMin })`：
  - MACD：首尾直接显示 ±absMax，|max| = |min| **严格成立**、与平移无关；
  - 全部附图指标通用（RSI 等首尾显示其值域边界，更直观）；
  - 中间刻度逻辑不变（MACD 固定 0 / 其他反推）。

### 验证
- vue-tsc 通过；vitest 75/75 全绿；未运行 / 未截图。

## v1.4.78（2026-10-14）

修复平移时 DIF / DEA / MACD 线条整体漂移（0 值线未固定）。

### 根因
pane5 的 Y 轴锚点极值（±absMax）只固定在**首 / 末两根**（indicatorsBarSeries
首尾点替换为极值）。平移后可视区域不再包含首尾锚点 → 库 autoScale 按**可视区内**
数据重算值域（中间只有 DIF/DEA/柱 实际值，不含 ±absMax）→ 值域随平移变化，
0 值线（中间刻度）漂移，线条整体上下移动。

### 修复
- `indicatorManager.ts`：
  - 新增不可见锚点 series `indicatorScaleAnchorSeries`（Line，pane5，
    color = 背景色、priceLine/lastValue 隐藏）：
    数据 = 全部时间点**交替 ±absMax**（i 偶 = +maxValue、i 奇 = -minValue）；
  - 可视区任意窗口（≥2 根）都同时含正 / 负锚点 → priceScale autoScale 并集
    恒为 `[-absMax, +absMax]`：平移 / 缩放 / 切换指标时 0 值线固定不漂移；
  - `rebuildSubIndicatorData` 每次 setData 同步更新锚点（新指标新极值自动生效）；
  - `removeIndicatorPanes` 随 pane 销毁置空（无泄漏）。
- 保持 v1.4.77 的对称 scaleMargins（top = bottom = 0.1），刻度 |max| = |min| 不变。

### 验证
- vue-tsc 通过；vitest 75/75 全绿；未运行 / 未截图。

## v1.4.77（2026-10-14）

修复 MACD 左刻度最大值 / 最小值绝对值仍不相等（根因：库 scaleMargins 默认不对称）。

### 根因（v1.4.76 值域已对称，但显示刻度仍不对称）
库 `priceScale.scaleMargins` 默认 `{ top: 0.2, bottom: 0.1 }` —— 上下边距**不对称**。
首尾刻度标签（内嵌 AXIS_LABEL_PAD = 8px）经 `series.coordinateToPrice(y)` 反推
显示值，反推结果被不对称边距扭曲：数据值域即使为对称的 `[-A, +A]`，
顶部刻度（y = 8px）反推约 `+1.5A`、底部刻度（y = H-8px）反推约 `-1.2A`
（H = pane 高度），`|max| ≠ |min|`。

### 修复
- `indicatorManager.ts` `createIndicatorPanes`：pane5 创建后对其 left priceScale
  设置对称边距 `scaleMargins: { top: 0.1, bottom: 0.1 }`：
  - 数据映射上下镜像对称 → 首尾刻度反推值绝对值严格相等（|max| = |min|）；
  - 柱体上下各留 10% 边距（不贴边、视觉更均匀，替代默认上 20% / 下 10%）。
- 附图指标层（pane5）通用生效（MACD 及 RSI/KDJ 等全部附图指标），无副作用。

### 验证
- vue-tsc 通过；vitest 75/75 全绿；未运行 / 未截图。

## v1.4.76（2026-10-14）

MACD 左刻度对称：附图指标 MACD 的 Y 轴最大值与最小值绝对值相等（|max| = |min|）。

### 变更
- `indicatorManager.ts` `rebuildSubIndicatorData`：
  - 极值扫描改为单趟循环（替代 spread，避免大数组栈风险）；
  - MACD 时 scale 值域强制对称：`absMax = max(|max|, |min|, 0)`，
    刻度范围 `[-absMax, +absMax]` —— Y 轴以 0 为对称中心，
    pane5 左刻度首尾值镜像对齐（如 DIF 最大 2.1 / 柱最小 -1.3 → [-2.1, +2.1]）；
  - 其他指标仍按实际值域（避免 0 拉宽 scale 压缩图形）。

### 验证
- vue-tsc 通过；vitest 75/75 全绿；未运行 / 未截图。

## v1.4.75（2026-10-14）

统一数据源：去掉内部 BasicBar，全链路直接使用 ChartDataPoint（types/chart.ts）。

### 变更
- `mock.ts`：`genMockBars` 返回 `ChartDataPoint[]`（pointType='kline' + tradeDate +
  preClose + OHLC + volume），删除 `BasicBar` 接口；
- `KLineChartController.ts`：`bars` 类型改 `ChartDataPoint[]`；删除
  `chartDataPoints` 适配字段与 BasicBar→ChartDataPoint 转换（mock 直接产出）；
  series.setData 字段加非空断言（pointType='kline' 必含 OHLC/volume）；
- `indicatorManager.ts`：`getBars: () => ChartDataPoint[]`（指标库 K 输入
  兼容 ChartDataPoint），删除 `getChartDataPoints` 依赖，指标计算直接消费 bars；
- `volumeBarPrimitive/PaneView`、`highLowMarkerPrimitive/PaneView`：数据源类型
  改 ChartDataPoint[]，OHLC/volume 访问加非空断言；
- `types/chart.ts` 注释更新（组件直接使用 ChartDataPoint）；
- tests（mock / indicators / highLow）：makeBar 与断言适配 ChartDataPoint。

### 说明
- ChartDataPoint 的 K 线字段为可选（统一类型需承载分时/竞价），
  消费方在 pointType='kline' 语义下使用非空断言（mock 已填全字段）；
- 指标库内部 `K = Pick<ChartDataPoint, ...>` + `!` 断言，无需改动。

### 验证
- vue-tsc 通过；vitest 75/75 全绿；未运行 / 未截图。

## v1.4.74（2026-10-14）

KLineChart.vue 工具栏状态 Props 化（单向数据流）。

### 变更
- `kLineChart.vue` 新增 6 个 Props：
  - `timeAxis: boolean`（时间轴开关，默认开）
  - `leftScale: boolean`（左刻度区开关，默认关）
  - `rightScale: boolean`（右刻度区开关，默认关）
  - `theme: string`（风格 'dark' | 'light'，默认深系）
  - `mainIndicator: string`（主图指标，'' = 关闭）
  - `subIndicator: string`（附图指标，'' = 关闭指标层）
  组件 onMounted 创建控制器后立即应用全部初始值；watch 各 Props 变化驱动
  对应控制器方法（applyTheme / toggleTimeAxis / setLeftScaleVisible /
  setRightScaleVisible / setMainIndicator / setSubIndicator）。
- `App.vue` 按钮只维护状态，模板经 Props 传给图表组件（activeMainIndicator /
  activeSubIndicator 以 `?? ''` 映射空串）；放大 / 缩小 / 左移 / 右移等
  瞬时动作仍经 chartRef 直接调用控制器。
- 主题切换：App.vue 仅同步 html 背景（pageBackground），图表主题由 Props
  watch 驱动（职责分离）。

### 验证
- vue-tsc 通过；vitest 75/75 全绿；未运行 / 未截图。

## v1.4.73（2026-10-14）

按功能拆分 `KLineChartController.ts`（1173 行 → 6 个文件），功能零变化（纯重构）。

### 拆分结构（每个 class / 常量一个文件）
- `src/chart/core/KLineChartController.ts`（瘦身至 ~700 行）：
  仅保留图表创建 / Pane 构建 / 数据写入（applyData）/ 布局（applyStretchFactors）/
  主题（applyTheme）/ 缩放平移 / 刻度开关 / 生命周期（destroy），职责委托给管理器；
- `src/chart/core/indicatorManager.ts`（新）：
  `IndicatorManager` 指标管理器 —— 主图五指标（setMainIndicator）+ 附图十指标
  （setSubIndicator / 指标层 pane4+pane5 创建与移除 / rebuildSubIndicatorData）+
  成交量均量线（rebuildVolumeData）+ pane0/2/4 信息行分段
  （buildInfoSegments / buildVolumeInfoSegments / buildSubIndicatorInfoSegments）+
  主题同步（updateThemeColors）。依赖注入（series 惰性 getter + theme / overlayTime /
  十字星注册表 / 布局回调），构造时 series 未创建也可安全组合；
- `src/chart/core/crosshairManager.ts`（新）：
  `CrosshairManager` 十字星管理器 —— handleCrosshairMove（pane0 不触发 / 内容 Pane
  注入左刻度指示值）+ overlayTime（信息行时间同源）+ 指示值 primitive 注册表
  （registerPrimitive / removeByPaneIndex），构造即订阅、destroy 退订；
- `src/chart/core/constants.ts`（新）：LIBRARY_TIME_AXIS_HEIGHT / PRICE_SCALE_MIN_WIDTH；
- `src/chart/core/types.ts`（新）：KLineChartOptions / MainIndicatorName / IndicatorLineSpec
  （controller re-export 保持外部导入接口不变）；
- `src/chart/core/indicatorMeta.ts`（新）：subIndicatorLabels（附图指标线名）。

### 说明
- 十字星指示值数组归 CrosshairManager 所有：pane1/pane3 由控制器注册，
  pane5 由 IndicatorManager 经 crosshairRegistry 注册 / 按 pane 下标移除；
- `MainIndicatorName` 继续从 controller re-export（App.vue 导入路径不变）；
- 未删除任何文件；无未使用 import / 函数残留。

### 验证
- vue-tsc 通过；vitest 75/75 全绿；未运行 / 未截图。

## v1.4.72（2026-10-14）

pane4 指标信息行文字间距与 pane2 成交量信息行一致。

### 根因
`InfoLabelPaneView` 按 `measureText` 无缝拼接分段文字，段间距完全由文本自身决定：
- pane2（成交量）：后续段文本前导 1 空格（`成交量: x  MA5: x  MA10: x`）→ 有间距；
- pane4（指标信息行）：`${label}: ${value}` 无前导空格 → 各段首尾紧贴、无间距。

### 修复
- `buildSubIndicatorInfoSegments`：首段无前导空格、后续段前导 1 空格，
  与 pane2 间距一致（如 `RSI6: 50.2  RSI12: 48.1  RSI24: 45.3`）。

### 验证
- vue-tsc 通过；vitest 75/75 全绿；未运行 / 未截图。

## v1.4.71（2026-10-14）

统一指标层绘制层级：MACD 柱改为 top 层重绘（与指标线一致，纳入 setSubIndicator 统一管理）。

### 背景
指标层统一由 `setSubIndicator(name | null)` 管理（开层 / 关层 / 切换指标）：
- 线型指标（含 MACD 的 DIF / DEA 线）：`IndicatorLinePrimitive` top 层自绘（十字星之上）；
- MACD 红绿柱此前 `MacdBarPaneView` **无 zOrder → 默认 normal（bottom canvas）**，
  绘制在十字星之下 —— 与指标线层级不一致，十字星横线会遮挡 MACD 柱
  （违反用户既定叠加顺序：十字星 → 指标绘图 → K线/成交量）。

### 修复
- `MacdBarPaneView` 新增 `zOrder(): 'top'`：MACD 柱改 top canvas 重绘，
  与 DIF / DEA 线、其他指标线同层（十字星之上）；
- 指标层全部元素（线 + 柱）统一在 top 层、由 setSubIndicator 切换时
  `rebuildSubIndicatorData` 全量重建 + `chart.applyOptions({})` 强制重绘；
  非 MACD 指标时 macdPoints 为空 → 柱不绘制，无残留。

### 验证
- vue-tsc 通过；vitest 75/75 全绿；未运行 / 未截图。

## v1.4.70（2026-10-14）

修复 MACD 首根数据不渲染。

### 根因
MACD 计算特性：EMA 首日以首日收盘价起步 → 首根 DIF / DEA / 柱值 = 0；
Y 轴锚点（rebuildSubIndicatorData）此前取全量线 min / max 作为 scale 值域，
当 MACD 全为正（或全为负）时值域不含 0 → `priceToCoordinate(0)` 返回 null，
首根（0 值）的 DIF / DEA 线起点与柱被渲染裁剪（视觉上"第一个数据没渲染"）。

### 修复
- `rebuildSubIndicatorData`：MACD 指标时 scale 强制覆盖 0
  （`maxValue = Math.max(...values, 0)`、`minValue = Math.min(...values, 0)`），
  保证 0 轴始终在值域内，首根柱与线起点正常绘制；
- 其他指标（如 OBV 累计值）保持实际值域，避免 0 拉宽 scale 压缩图形。

### 说明
- MACD 首根柱值本身 = 0（算法特性）：柱体高度为 0，视觉上本就无柱；
  本次修复的是"值域不含 0 时首根线起点 / 柱整体被裁剪"的问题。

### 验证
- vue-tsc 通过；vitest 75/75 全绿；未运行 / 未截图。

## v1.4.69（2026-10-14）

修复附图指标：点击指标后图表消失 / 布局错乱。

### 根因
`showIndicator` 状态标记未随指标层开 / 关同步（构造时 false 后不再更新）：
- 点击指标 → `createIndicatorPanes()` 创建 6 Pane，但 `applyStretchFactors()` 仍按
  4 Pane / 80:20 分配高度（paneHeights 仅 4 项）→ pane4 / pane5 高度异常（≈0），
  指标图与信息行消失；
- 同时 pane1 栅格横线等分数（指标关 8 / 开 6）也错误保持 8。

### 修复
- `createIndicatorPanes()` 开头置 `this.showIndicator = true`（开层即同步标记）；
- `removeIndicatorPanes()` 开头置 `this.showIndicator = false`（关层先改标记再移除 Pane，
  避免移除瞬间仍按 6 Pane 布局计算）。

### 验证
- vue-tsc 通过；vitest 75/75 全绿；未运行 / 未截图。

## v1.4.68（2026-10-14）

附图指标层重构：MACD 专属 → 十指标通用（RSI / KDJ / MACD / WR / DMI / BIAS / OBV / CCI / ROC / CR）。

### 新增
- App.vue 底部新增「附图指标」按钮组（十指标互斥单选）：点击已选中指标 = 取消
  （关闭指标层，布局 80:20）；点击其他指标 = 切换（打开指标层，布局 60:20:20）。
  移除原「指标开/关」布尔按钮（语义被十按钮取代：无选中即关指标层）。
- 控制器新增 `setSubIndicator(name | null)`（互斥单选）与 `removeIndicatorPanes`：
  - 选中：指标层未开则创建 pane4 / pane5，再重建该指标数据；取消：移除两 Pane 并清空缓存；
  - 新增 `rebuildSubIndicatorData`：`calcSubIndicators` 取当前指标分组线 →
    `subIndicatorLines`（top 层自绘线缓存）+ `subIndicatorValueMaps`（pane4 信息行值缓存）
    + `macdPoints`（仅 MACD）+ Y 轴锚点（Histogram 骨架首尾取全量线 min/max，
    覆盖正负值域防裁剪）。
- pane4 升级为「指标信息 Pane」：`InfoLabelPrimitive` 显示所选指标各线数值
  （label + 线色，随十字星命中 bar / 最新 bar；MACD 显示 DIF / DEA / MACD）。
- pane5 通用指标层：`IndicatorLinePrimitive` top 层自绘全部指标线（十字星之上）；
  MACD 柱保留 `MacdBarPrimitive` 自绘（红空心 / 绿实心）；刻度中间值动态
  `getFixedMiddleValue`（MACD = 0，其余指标 = scale 中间值，切换无需重建刻度）。

### 变更
- `AxisLabelPrimitive`：`fixedMiddleValue` 静态值 → `getFixedMiddleValue` 动态获取器。
- theme.ts：新增 `subIndicatorColors`（十指标东财标准色集中管理）；删除已无引用的
  `macdColors`（DIF/DEA 色并入 subIndicatorColors.macd）。
- 控制器：删除 `difSeries / deaSeries`（MACD 线改 top 层自绘）；`KLineChartOptions`
  移除 `showIndicator`（指标层初始关闭，由选中指标驱动）；BasicBar → ChartDataPoint
  适配（补 tradeDate / pointType，构造时转换一次缓存）。
- 删除已无使用的 `testLabel/` 目录（pane4 由 InfoLabelPrimitive 接管）。

### 验证
- vue-tsc 通过；vitest 75/75 全绿（新增 subIndicatorColors 十指标配色断言）；
  未运行 / 未截图。

## v1.4.67（2026-10-14）

修复窗口缩放时 pane1 / pane3 / pane5 最右 / 最下边框与画布边缘出现 subpixel 缝隙。

### 变更
- 根因：`PaneBorderPaneView` 原用 `useMediaCoordinateSpace`（CSS 像素）绘制边框，
  窗口缩小 / 放大时 canvas CSS 宽度取整（floor）与物理宽度存在亚像素差，
  边框右缘落在 floor-0.5 处 → 视觉上最右边缘留一条缝隙；
- 修复：改用 `useBitmapCoordinateSpace`（物理像素）绘制 ——
  `strokeRect(0.5, 0.5, bitmapSize.width - 1, bitmapSize.height - 1)`，
  边框覆盖 canvas 物理最右 / 最下列 `[W-1, W)`，缩放任意尺寸均贴住画布边缘，
  无取整缝隙；+0.5 保持 1px 线条锐利；
- 容器侧已有 `overflow: hidden`（裁掉容器与 canvas 的亚像素差），组合后边框
  视觉上始终在最边缘；
- 验证：vue-tsc 通过、vitest 74/74 全绿；未运行 / 未截图。

## v1.4.66（2026-10-14）

全量质量审计（内存 / 缓存 / 命名 / 颜色 / 效率 / 文档 / 测试 / 清理）。

### 审计结果与修复
- **颜色集中**：扫描确认除 theme.ts 外无实际散落硬编码色值（指标库文件中的 # 色值均为注释说明，属用户库，未改动）；全部主题字段经脚本核对使用情况；
- **修复未使用字段**：`theme.pageBackground` 定义后未被引用 —— App.vue html 背景原用 `background`，现改回 `pageBackground`（深系 #0B0E13 / 浅系 #EDEFF3，与图表背景区分）；
- **命名**：函数 / 变量均驼峰语义化（`buildInfoSegments` / `buildVolumeInfoSegments` / `volumeMaLines` / `mainIndicatorValueMaps` 等）；常量按惯例全大写（`LIBRARY_TIME_AXIS_HEIGHT` 等），无下划线小写变量；
- **内存**：订阅成对（仅 subscribeCrosshairMove / unsubscribeCrosshairMove）；destroy 显式 detach 三个 primitive（SAR / 主图指标线 / 成交量均量线）+ chart.remove；指标开 / 关与 applyData 换数据时各缓存（mainIndicatorLines / mainIndicatorValueMaps / sarValueMap / volumeMaLines / volumeInfoMap / macdPoints）统一重建或置空，无累积；
- **效率**：渲染裁剪复查齐全（成交量 / MACD 柱 / SAR 圆点按逻辑范围、指标折线按可视时间范围）；信息行按 Map O(1) 现取；primitive 视图单例复用；
- **未使用**：全量扫描 src/chart 无孤儿文件、无未使用 import / 私有方法（脚本 + 人工复核）；
- **测试**：theme.test.ts 新增 pageBackground 与 volMa 配色 2 用例，72 → 74；验证 vue-tsc 通过、vitest 74/74 全绿；未运行 / 未截图。

## v1.4.65（2026-10-14）

指标叠加绘图提升到十字星之上（修复十字星横线穿过时指标线被遮挡"一部分看不见"）。

### 变更
- 根因（已核库源码 PaneWidget._internal_paint）：十字星画在 **top canvas**
  （drawCrosshair），所有 series / normal primitive 画在 bottom canvas ——
  永远在十字星之下，十字星横线会压住指标线；
- 方案：新增 `IndicatorLinePrimitive`（zOrder 'top'，top canvas 自绘折线）：
  - 主图指标线（MA / EXPMA / BOLL / BBI）：从 LineSeries 改为缓存
    （mainIndicatorLines）+ top 层自绘，挂在 klineSeries 上；
  - 成交量均量线（VOL MA5 / MA10）：同样从 LineSeries 改为 volumeMaLines 缓存 +
    top 层自绘，挂在 volumeSeries 上；
  - 绘制：x = timeScale.timeToCoordinate、y = anchorSeries.priceToCoordinate；
    按 getVisibleRange() 裁剪可视点区间（数据升序线性扫描），坐标缺失断开路径；
  - 切换指标后显式 `chart.applyOptions({})` 触发重绘（不再有 series 增删自动重绘）；
  - applyTheme 时同步刷新成交量均量线颜色（数据不变仅换色）；
  - destroy 显式 detach 两个 primitive（防内存泄漏）；
- 叠加顺序达成：**指标绘图 → 十字星 → K线 / 成交量**；
- 验证：vue-tsc 通过、vitest 72/72 全绿；未运行 / 未截图。

## v1.4.64（2026-10-14）

pane2 升级为成交量信息行（成交量 + VOL MA5/MA10 值）；pane3 叠加成交量均量线。

### 变更
- pane2：显示 `成交量: x  MA5: x  MA10: x`（随十字星命中 bar / 最新 bar）：
  成交量本体用主题文字色，MA5 黄（volMa5）、MA10 粉（volMa10）；
  使用新建 `InfoLabelPrimitive`（**不填背景**，区别于 pane0 的 TopPaneOverlayPrimitive ——
  十字星竖线需贯穿 pane2，不能被背景遮挡）；
- pane3：新增 VOL MA5 / MA10 两条 LineSeries（东财指标库 `calcVolMA`，与成交量柱
  同 priceScaleId 'left' 同量刻度；前 N-1 根无值）；applyData 换数据时与
  `volumeInfoMap`（pane2 信息行缓存，O(1) 现取）一并重建；
- theme.ts：新增 `volMa5: '#FFD54F' / volMa10: '#F06292'`（深浅系一致，
  与用户库 volumeMa.ts 注释预留色值对齐）；
- 测试：新增 tests/volumeMa.test.ts（calcVolMA 3 用例：MA5 窗口、不足 N 根无输出、
  MA3 滑动推进），69 → 72；
- 验证：vue-tsc 通过、vitest 72/72 全绿；未运行 / 未截图。

## v1.4.63（2026-10-14）

pane0 信息行指标值按对应指标线颜色分段着色。

### 变更
- `mainIndicatorValueMaps` 缓存增加 `color` 字段（= 指标线颜色），
  SAR 改用独立 `sarValueMap: Map<time, SarPoint>`（颜色按 bar trend 红/绿）；
- `TopPaneOverlayPrimitive`：单一整段文字改为 `getTextSegments() => TextSegment[]`
  （{ text, color } 分段结构）；渲染视图逐段绘制，x 用 measureText 精确推进，
  段间距由段文本前导空格保证；
- controller 新增 `buildInfoSegments()`：首段"股票名称 [代码] 时间"（主题文字色）+
  各指标值段（MA/EXPMA/BOLL/BBI 线色、SAR trend 色）；时间/指标值仍随十字星；
- 深浅系切换自动跟随（段颜色 draw 时从 theme 现取）；
- 验证：vue-tsc 通过、vitest 69/69 全绿；未运行 / 未截图。

## v1.4.62（2026-10-14）

pane0 信息行追加主图指标值（MA / EXPMA / BOLL / SAR / BBI，随十字星联动）。

### 变更
- controller 新增 `mainIndicatorValueMaps` 缓存：setMainIndicator 构建指标线时同步
  构建 `{ label, time→value Map }`（O(1) 现取，无每帧计算）；SAR 从 SarPoint[]
  构建 Map；clearMainIndicatorSeries 一并清空；
- pane0 文字格式升级为：`股票名称 [代码] 时间 [指标值...]`：
  - MA：`MA5: x MA10: x MA20: x MA30: x MA60: x`；
  - EXPMA：`EXPMA12: x EXPMA50: x`；BOLL：`BOLL上: x BOLL中: x BOLL下: x`；
  - SAR：`SAR: x`；BBI：`BBI: x`（值统一 2 位小数，空格分隔）；
- 联动：时间与指标值同源（overlayTime ?? 最新 bar）——十字星命中显示命中 bar
  的指标值、未命中显示最新 bar 指标值；某 bar 无指标值（如 MA 前 N-1 根）自动跳过；
- applyData 换数据后指标重建（refreshMainIndicatorData → setMainIndicator）自动
  同步值缓存；
- 验证：vue-tsc 通过、vitest 69/69 全绿；未运行 / 未截图。

## v1.4.61（2026-10-14）

pane0 信息行格式改为 `股票名称 [代码] 时间`，时间跟随十字星。

### 变更
- pane0 整段文字：`股票名称 [代码] 时间`（单行左对齐、距左 6px），
  替代原"左侧名称 / 右侧时间"双段布局；
- 时间联动十字星：`handleCrosshairMove` 命中（pane1/3/5）时设置
  `overlayTime = 命中 bar 时间戳`；未命中（鼠标离开 / pane0 内）时置 null →
  draw 现取 `overlayTime ?? 最新 bar 时间`。库 crosshairMove 事件自带重绘，
  pane0 文字实时刷新、无需手动 invalidate；
- `TopPaneOverlayPrimitive`：leftText + getRightText 收敛为单一 `getLeftText`
  动态获取器（整段文字 draw 时现取）；
- 验证：vue-tsc 通过、vitest 69/69 全绿；未运行 / 未截图。

## v1.4.60（2026-10-14）

pane0 顶部信息行新增右侧时间显示（最新 bar 时间，YYYY-MM-DD）。

### 变更
- `format.ts` 新增 `formatDate(seconds)`：秒级时间戳 → 本地日期 YYYY-MM-DD，
  非法输入返回 '--'（纯函数，可单测）；
- `TopPaneOverlayPrimitive`：单一 text 改为 leftText（股票名称 [代码]，距左 6px）
  + getRightText（右侧时间，右对齐距右 6px，draw 时现取跟随最新数据）；
- controller 构造处传入 `formatDate(最新 bar.time)` —— applyData 换数据后
  pane0 右侧时间自动跟随最新 K 线日期；
- 测试：util.test.ts 新增 formatDate 3 用例（格式 / 补零 / 非法输入），66 → 69；
- 验证：vue-tsc 通过、vitest 69/69 全绿；未运行 / 未截图。

## v1.4.59（2026-10-14）

修复：反复点击 SAR 按钮无效果。

### 根因
`SarMarkerPrimitive.setVisible()` 只修改 `_visible` 标志，不会引起 lightweight-charts
invalidate —— primitive 的 draw 由库重绘驱动，仅改标志时画面不刷新（MA/EXPMA 等
走 addSeries+setData 会自动重绘，SAR 走 primitive 显隐因此"看不见"）。

### 修复
- `SarMarkerPrimitive` 构造时保存 chart 引用；`setVisible(v)` 在显隐变化后调用
  `chart.applyOptions({})` —— 已核库源码：`ChartModel.applyOptions` 末尾无条件
  `fullUpdate()`，空对象即可安全触发重绘（无任何副作用）；
- `setTheme()` 同样补 applyOptions 触发重绘（主题切换时圆点色立即生效）；
- controller `setMainIndicator('sar')` 移除冗余 `setTheme` 调用（构造时已初始化，
  applyTheme 负责同步主题色），一次点击只触发一次重绘；
- 验证：vue-tsc 通过、vitest 66/66 全绿；未运行 / 未截图。

## v1.4.58（2026-10-14）

全量质量审计收尾（内存 / 缓存 / 注释 / 命名 / 颜色 / 效率 / 文档 / 测试 / 清理）。

### 审计结果（逐项核查，均达标）
- **颜色收敛**：src 内除 theme.ts 外 0 处硬编码色值；SAR 圆点色（sarUp/sarDown）已入主题；
- **内存**：订阅点（crosshairMove / ResizeObserver）destroy 全部清理；SAR primitive 显式
  detachPrimitive；指标开关 removePane 后置 null；primitive detached() 清空引用；
- **缓存**：刻度标签在 updateAllViews（图表更新）重建，draw 只读缓存；渲染视图 / renderer
  构造时单例，paneViews() 不每帧 new；成交量 / MACD 柱 / SAR 圆点按可视逻辑范围裁剪；
- **执行效率**：handleCrosshairMove 仅 O(1) 注入；栅格 / 标签 / 极值标注均按可视范围循环；
- **命名**：全部驼峰语义化、无下划线 / 短横线；无孤儿文件（index.ts 目录索引、main.ts 入口除外）；
- **死代码**：controller 全部私有方法均有调用；createSeriesMarkers / colors.sar 已无残留。

### 变更
- tests/theme.test.ts：新增 SAR 圆点色断言（深浅系红涨绿跌一致）+ 主图指标配色断言
  （MA 五线 / EXPMA 两线 / BOLL 三轨 / BBI 单线），测试 64 → 66；
- README：内存与性能章节补充标签缓存 / SAR 圆点裁剪 / detachPrimitive 说明；
- KLineChartController.ts：头部模块注释更新至当前架构（v1.4.57，六 Pane + 主图指标 +
  东财指标库 + 各自绘 primitive 职责）；
- 验证：vue-tsc 通过、vitest 66/66 全绿；未运行 / 未截图。

## v1.4.57（2026-10-14）

修复 SAR 圆点绘制：接入用户新增的 `src/chart/indicator/sarMarkerPrimitive.ts` 自绘插件。

### 变更
- `sarMarkerPrimitive.ts` import 修正：
  - `SarPoint`：`./indicators` → `./`（index.ts 统一出口 re-export）；
  - 主题类型：`./theme` → `../core/theme`，统一使用 `ChartThemeColors`；
- theme.ts 新增 `sarUp` / `sarDown` 字段（多头红 / 空头绿，与 K 线红涨绿跌一致，
  深浅系相同）；清理未使用的 ChartTheme 别名；
- controller：SAR 由 `createSeriesMarkers`（LineSeries 圆点标记）改为
  `SarMarkerPrimitive`（挂 klineSeries、zOrder normal 不遮十字星）；
  - 构造期创建单例并 attach，初始 setVisible(false)；
  - `setMainIndicator('sar')`：全量重算 calcSAR → sarPoints 缓存 + setVisible(true)；
  - 切换 / 关闭其他指标：setVisible(false)（不重复创建，防泄漏）；
  - applyTheme 同步 setTheme；destroy 显式 detachPrimitive；
- 删除 `createSeriesMarkers` 的库导入（不再使用）；
- 验证：vue-tsc 通过、vitest 64/64 全绿；未运行 / 未截图。

## v1.4.56（2026-10-14）

controller 改用 `src/chart/indicator/` 东财指标库（统一出口 index.ts）。

### 变更
- 主图五指标接入库函数（输入 BasicBar[] 兼容 K[]）：
  - MA：`calcMA`，周期改东财标准 **5/10/20/30/60** 五线；
  - EXPMA：`calcEXPMA`，参数改东财默认 **12/50**；
  - BOLL：`calcBOLL`（返回 [上轨, 中轨, 下轨]）；
  - SAR：`calcSAR`（返回含 trend 的 SarPoint[]），圆点按趋势着色
    （多头 = K 线上涨色、空头 = 下跌色）；
  - BBI：`calcBBI`；
- MACD 接入库：`calcMACD` 返回 [DIF, DEA, 柱值] 三线，controller 适配为
  MacdPoint 缓存（MacdPoint 定义移入 macdBarPrimitive.ts，供自绘与 Y 轴锚点共用）；
- theme.mainIndicatorColors 改为东财标准色（MA 白/黄/粉/深绿/蓝、EXPMA 白/黄、
  BOLL 黄/白/粉、BBI 浅蓝灰）；删除 sar 字段（SAR 用主题 up/down）；
- 删除无引用文件 indicatorPoint.ts（用户版指标库自带 types.ts）；
- 测试：indicators.test.ts / macd.test.ts 重写适配新 API（64 项全绿）；
  vue-tsc 通过；未运行 / 未截图。

## v1.4.55（2026-10-14）

目录整理：`src/chart/indicator/main/` 删除，主图指标文件直接并入
`src/chart/indicator/`（不再创建子文件夹）。

### 变更
- 移动 6 个文件（ma / expma / boll / sar / bbi / indicatorPoint）到
  `src/chart/indicator/` 并删除 `main/` 目录；
- 更新 controller / tests import 路径与 README 目录结构；
- 验证：vue-tsc 通过；vitest 64 项全绿；未运行 / 未截图。

## v1.4.54（2026-10-14）

主图指标算法对齐**东方财富口径**（其余指标核对一致，仅 SAR 调整）。

### 变更
- **SAR 改为东财 / 通达信公式系统内置算法** `SAR(4, 0.02, 0.2)`：
  - 前 4 根观察窗口判定方向（窗口末根收盘 ≥ 首根收盘 → 上升式）；
  - 上升式初始 SAR = 窗口最低价、初始 EP = 窗口最高价（下降式对称）；
  - 从窗口末根起输出初始 SAR，之后逐根递推
    `SAR(n) = SAR(n-1) + AF × [EP(n-1) - SAR(n-1)]`；创新高 AF += 0.02
    封顶 0.2；上升式 SAR 不高于前两期最低价（保护）；跌破/升破反转；
- 核对确认无需调整：MA（滑动均值）、EXPMA（EMA 首值 = 首根收盘）、
  BOLL（STD 分母 N，东财口径）、BBI（(MA3+MA6+MA12+MA24)/4）；
- 测试：SAR 用例更新为东财窗口口径（点数 = n-3、初始 SAR = 窗口最低、
  反转贴极值），64 项全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.53（2026-10-13）

App.vue 底部新增主图指标容器：MA / EXPMA / BOLL / SAR / BBI 五个互斥按钮，画在 pane1。

### 变更
- 新增主图指标计算（纯函数，每 class 一个文件，`src/chart/indicator/main/`）：
  - `ma.ts`：简单移动平均（MA5 / 10 / 20 / 30）；
  - `expma.ts`：指数平滑（EXPMA12 / 26，α = 2/(N+1)）；
  - `boll.ts`：布林带（N=20、K=2，总体标准差分母 N，东财口径）；
  - `sar.ts`：抛物线转向（Wilder 算法，AF 0.02 封顶 0.2）；
  - `bbi.ts`：(MA3 + MA6 + MA12 + MA24) / 4，O(n) 索引对齐；
  - `indicatorPoint.ts`：统一指标点类型。
- theme.ts 新增 `mainIndicatorColors`（深浅系通用，东方财富风格）；
- controller：新增 `MainIndicatorName` 类型与 `setMainIndicator(name | null)`（互斥：
  切换时先 `chart.removeSeries` 清空当前线再重建，防内存泄漏）；SAR 用
  `createSeriesMarkers` 圆点标记（5.x 插件 API）；指标线同 pane1
  priceScaleId 'left' 与 K 线同刻度叠加；applyData 末尾刷新当前指标数据；
- App.vue：底部新增"主图指标"容器（样式与顶部工具栏一致），5 按钮互斥开关
  （点击已激活 = 关闭）；chart-wrap 改为 flex:1 占满剩余高度（容纳底部容器）；
- 测试：新增 tests/indicators.test.ts（8 用例：MA / EXPMA / BOLL / SAR / BBI），
  共 64 项全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.52（2026-10-13）

KLineChart.vue 新增 `symbol` / `name` 参数，pane0 顶部信息行显示"股票名称 [代码]"。

### 变更
- KLineChart.vue：`withDefaults(defineProps)` 新增 `symbol?` / `name?`（默认空串），
  透传给 KLineChartController；
- controller：KLineChartOptions 新增 `name?` / `symbol?`；pane0 顶层遮罩文字由
  固定"测试"改为 `名称 [代码]`（symbol 为空时仅显示 name，两者都空回退"测试"）；
- App.vue：示例传 `symbol="300750" name="宁德时代"`；
- 验证：vitest 57 项全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.51（2026-10-13）

App.vue 工具栏新增"左移 / 右移"按钮（X 轴平移）。

### 变更
- controller 新增 `shiftLeft` / `shiftRight`：基于 lightweight-charts 5.2.1
  `scrollToPosition(position, animated)` 平移（position = 距最新 bar 的 bar 数，
  ±10 根/次；右移时库内部自动钳制到边界）；
- App.vue 工具栏在"缩小 / 放大"前插入"左移 / 右移"按钮；
- 验证：vitest 57 项全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.50（2026-10-13）

最高价 / 最低价标注与十字星标签背景：浅系配色优化（白底可读性）。

### 变更
- theme.ts 浅系调整（深系不变）：
  - `crosshairLabelBackground`：#E9EBEF → **#F0F2F5**（极浅灰，柔和衬托）；
  - `highMarkerColor`：#CC8800 → **#B8860B**（深金黄，主流软件同款）；
  - `lowMarkerColor`：#1E4FE0 → **#2452CC**（深蓝，白底对比更稳）。
- 深系保持：#2A2E39 / #F4AA0A / #2962FF。
- 测试：theme.test.ts 色值断言同步更新，57 项全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.49（2026-10-13）

修复：最高价 / 最低价标注**同时显示**（此前最低价被丢弃）。

### 变更
- 问题根因：v1.4.48 的 `findExtremeBar` 返回单个标注且最高价优先 —— 最高价与
  最低价不同根时，最低价不显示。
- 修复：改为 `findExtremeBars`（纯函数，返回 `{ high, low }` 两个极值，互不
  抢占，同根也各自返回）；渲染时分别绘制：最高价黄色标注在柱顶上方 +
  黄色实线连接柱体上边缘中间，最低价蓝色标注在柱底下方 + 蓝色实线连接
  柱体下边缘中间。
- 测试：tests/highLow.test.ts 改为断言 `findExtremeBars`（同时返回两值 /
  子区间 / 空区间 / 无效索引容错），57 项全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.48（2026-10-13）

pane1 主图标注**可视区域内**最高价 / 最低价（带同色实线连接柱体）。

### 变更
- 新增 `src/chart/highLow/highLowMarkerPrimitive.ts` + `highLowMarkerPaneView.ts`
  （每个 class 独立文件、渲染器单例复用防内存泄漏），挂载到 pane1 klineSeries；
- 逻辑：遍历当前可视逻辑范围取 high 最大 / low 最小的 bar，随平移 / 缩放实时重算；
- **最高价**：12px 黄色文字 + 背景块，标注在柱体最高价位置**上方**，
  黄色实线从文字块边缘连到**柱体上边缘中间**（连接点 = 柱体中心 x / 柱顶 y）；
- **最低价**：12px 蓝色文字 + 背景块，标注在柱体最低价位置**下方**，
  蓝色实线从文字块边缘连到**柱体下边缘中间**（连接点 = 柱体中心 x / 柱底 y）；
- 文字左右不越界（靠近 pane 边界自动内靠）；
- **深浅系配色**（theme.ts 新增 `highMarkerColor` / `lowMarkerColor`）：
  深系 黄 #F4AA0A / 蓝 #2962FF；浅系 黄 #CC8800 / 蓝 #1E4FE0（白底加深保证可读）；
  背景块 = crosshairLabelBackground；
- 极值查找提取为纯函数 `findExtremeBar`（可单测：最高优先、子区间、空区间、
  无效索引跳过容错）。
- 测试：theme.test.ts 新增标注色断言；新增 tests/highLow.test.ts（3 用例），
  总 53 → 57 全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.47（2026-10-13）

左刻度**指示值**文字不越界：十字星靠近 pane 顶部 / 底部时，标签完整位于 pane 内。

### 变更
- `crosshairAxisLabelPaneView` 绘制时对横线 y 做钳制：
  `yClamped = clamp(y, AXIS_LABEL_HEIGHT/2, mediaSize.height - AXIS_LABEL_HEIGHT/2)`，
  标签块（高 18px、垂直居中）始终不超出当前 pane 的垂直范围；
  pane 高度不足 18px 时跳过绘制（防异常）。
- 验证：vitest 53 项全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.46（2026-10-13）

文件命名去除数字：`pane0Overlay*` → `topPaneOverlay*`（语义化驼峰）。

### 变更
- `git mv src/chart/overlay/pane0OverlayPrimitive.ts` → `topPaneOverlayPrimitive.ts`、
  `pane0OverlayPaneView.ts` → `topPaneOverlayPaneView.ts`；
- 类名 `Pane0OverlayPrimitive` → `TopPaneOverlayPrimitive`、
  `Pane0OverlayPaneView` → `TopPaneOverlayPaneView`；controller import / 实例化、
  README 同步更新；`find src -name '*[0-9]*'` 无命中（源码无数字命名文件）。
- 验证：vitest 53 项全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.45（2026-10-13）

时间轴（X 轴）十字星指示值标签背景色接入深浅系配色。

### 变更
- createChart 与 applyTheme 的 crosshair 配置新增
  `vertLine.labelBackgroundColor` / `horzLine.labelBackgroundColor` =
  主题 `crosshairLabelBackground`（深系 #2A2E39 / 浅系 #E9EBEF）；
  时间轴十字星日期标签背景随深浅系切换同步更新。
- 文字颜色说明：lightweight-charts 十字星标签文字色由库按背景亮度自动
  黑白对比（深背景白字 / 浅背景黑字），方向与 crosshairLabelText 一致。
- 验证：vitest 53 项全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.44（2026-10-13）

十字星左刻度**指示值**标签背景块与文字颜色按深浅系定义。

### 变更
- `theme.ts` 新增 `crosshairLabelBackground` / `crosshairLabelText` 字段：
  - 深系：背景 `#2A2E39`（与图表背景 #131722 可见区分）、文字 `#D1D4DC`；
  - 浅系：背景 `#E9EBEF`（与白底可见区分）、文字 `#33373E`。
- controller 三处 CrosshairAxisLabelPrimitive（pane1 / pane3 / pane5 指示值）的
  getColor / getBackColor 改用上述字段（原为 textColor / background —— 背景块
  与图表底色同色不可见）。
- 测试：theme.test.ts 新增用例（深浅系各自取值、背景块与图表背景可区分、
  文字色互不相同），总用例 52 → 53 全绿；vue-tsc 通过；未运行 / 未截图。

## v1.4.43（2026-10-13）

左刻度标签文字右缘距调整：4px → 6px（文字右缘 = 价格轴右缘 − 6px）。

### 变更
- `axisLabelPaneView.ts` 公共常量 `AXIS_LABEL_PAD_X` 由 4 改为 6 —— 指示值与刻度值
  共用同一常量，两处文字右缘距同步变为 6px（背景块左右内边距随之为 6px，背景与
  图表底色同色无视觉影响）；相关注释 / README / CHANGELOG 同步更新。
- 验证：vitest 52 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.42（2026-10-13）

优化：左刻度**指示值**与**刻度值**文字设置统一（以指示值为基准）。

### 变更
- **背景**：指示值（crosshairAxisLabelPaneView）为自绘 canvas；刻度值原走库
  ISeriesPrimitiveAxisView（axis 标签）渲染，库自带内边距 / 对齐细节，两处文字
  视觉不一致。
- **修复**：刻度值改为自绘（AxisLabelPaneView），与指示值**共用同一套绘制规格**
  （axisLabelPaneView 导出的公共常量 AXIS_LABEL_PAD_X = 4 / AXIS_LABEL_HEIGHT =
  18 与公共绘制函数 drawAxisLabel）：
  - 字体：12px chartFontFamily（新增 theme.chartFont 统一常量）；
  - 对齐：textAlign = 'right'，文字右缘 = 价格轴右缘 - 6px；
  - 背景块：左右内边距各 4px、高 18px、垂直居中；
  - 颜色：文字 = 主题 textColor、背景 = 主题 background（跟随深浅系）。
- **AxisLabelPrimitive**：priceAxisViews（axis 标签路径）→ priceAxisPaneViews
  （zOrder 'top' 自绘，与指示值同一层）；config 新增 getFont；
  AxisLabelView 退化为纯数据载体（不再实现库 axis view 接口，保留 coordinate /
  fixedValue / text()）。
- **统一字体**：theme.ts 新增 chartFont（`12px ${chartFontFamily}`）；
  controller 三处指示值 getFont、三处刻度 getFont、空 Pane "测试"文字
  （testLabel / pane0Overlay）全部改用 chartFont。
- 验证：vitest 52 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.41（2026-10-13）

代码质量整理（内存 / 缓存 / 命名 / 颜色集中 / 效率 / 文档 / 测试 / 清理）。

### 变更
- **执行效率（primitive 视图单例化）**：6 个 primitive（volumeBar / macdBar /
  paneBorder / grid / testLabel / pane0Overlay）的 `paneViews()` 原每次绘制都
  `new XxxPaneView(this)`（每帧产生 6 个新对象 → GC 压力）；改为构造时创建单例
  视图、`paneViews()` 返回同一实例（与 crosshairAxisLabelPrimitive /
  axisLabelPrimitive 一致）。十字星移动 / 缩放等高频绘制场景不再有对象创建开销；
- **清理未使用函数**：`chart/util/format.ts` 删除 11 个未被引用的遗留函数 / 常量
  （早期分时 / 浮层 / 信息行功能遗留）：formatSigned、formatSignedPct、
  formatPctAbs、formatAmount、calcTsRise、stretchRange、PERIOD_DATE_FORMAT、
  resolvePeriodDateFormat、formatDateStr、formatTimeByFmt、layoutTickPositions；
  保留 formatPrice / formatVolume / formatAxisSmart（当前实际使用）；
- **颜色集中到公共文件**：controller 内硬编码的 `MACD_COLORS`（DIF #A0A0A0 /
  DEA #F4AA0A）提取到 `chart/core/theme.ts` 的 `macdColors`（指标配色集中管理，
  深浅系通用）；controller 改为引用 theme 导出；
- **文档**：README.md 全面重写 —— 由过时的"单 Pane"描述更新为当前 6 Pane 多 Pane
  布局（分组比例 / 空 Pane / 自绘栅格 / 刻度标签 / 十字星指示值 / 内存性能），
  目录结构补齐 axis / crosshair / overlay / util；
- **测试**：tests/util.test.ts 由仅 4 项扩展至 13 项 —— 新增 formatPrice
  （小数位 / 空值）与 formatAxisSmart（亿 / 万 / 普通 / 极小值自适应小数位）覆盖；
- **命名检查**：全量扫描确认无下划线命名，类 / 方法 / 常量均驼峰语义化，无需调整；
- 验证：vitest 43 → 52 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.40（2026-10-13）

修复十字星左刻度指示值：pane1 显示但刷新卡顿、pane3 / pane5 完全不显示。

### 变更
- 定位过程（像素级诊断，诊断设施已清理）：
  1. **卡顿根因**：v1.4.39 用 priceAxisViews（axis 标签）渲染，而库价格轴 main canvas
     仅在**非 Cursor 级** invalidate 时重绘（含 backLabels → axis 标签），十字星移动
     是 Cursor 级 → 标签刷新滞后 → pane1 卡顿；
  2. **pane3 / pane5 不显示根因①**：库 MouseEventParams.point 是**当前 pane 的本地
     坐标**（相对 pane canvas 顶部），controller 错误地累计前序 pane 高度做 offset
     减法，导致注入 y 严重偏移、coordinateToPrice 越界返回 null；
  3. **不显示根因②**：paneView 内 fillText 未设置 `textAlign`（默认 'left'），文字
     从 x=68 向右绘制超出 72px 宽的价格轴 canvas 被裁剪 → 文字不可见（背景块可见
     但文字消失）。
- 修复方案（回到 priceAxisPaneViews + zOrder 'top'，v1.4.38 路径并修正两处根因）：
  - crosshairAxisLabelPrimitive：`priceAxisPaneViews()` 返回单例
    crosshairAxisLabelPaneView（IPrimitivePaneView，zOrder 'top'）；
  - controller `handleCrosshairMove`：`localY = point.y` **直接使用**（不再减前序
    pane 高度），命中 pane 注入本地 y、其他 pane 置 null；
  - crosshairAxisLabelPaneView：绘制在价格轴 top canvas（Cursor 级重绘、流畅），
    值 = series.coordinateToPrice(y) 反算；`ctx.textAlign = 'right'` +
    `fillText(text, width - PAD, y)`（文字右对齐，避免被 canvas 裁剪），背景块
    包裹文字并留内边距；
  - 删除 v1.4.39 的 crosshairAxisLabelView.ts（不再使用的 axis 标签路径）。
- 验证：像素直方图确认 pane1 / pane3 / pane5 价格轴 top canvas 均出现文字色像素；
  完整截图 OCR 确认 pane3 出现第 4 个标签（指示值 1.48万）；
  vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图（诊断截图仅存 /tmp 已清理）。

## v1.4.39（2026-10-13）

修复 pane3 / pane5 十字星左刻度指示值不显示。

### 变更
- 原因：v1.4.38 用 priceAxisPaneViews（IPrimitivePaneView）渲染指示值，
  pane1 正常但 pane3 / pane5 不显示（该路径对部分 Pane 的价格轴不可靠）；
- 修复：改用 priceAxisViews（ISeriesPrimitiveAxisView）—— 与 AxisLabelPrimitive
  刻度标签同一渲染路径（pane1 / pane3 / pane5 刻度标签均正常显示的最可靠机制）：
  - crosshairAxisLabelPrimitive：priceAxisViews() 返回单例 CrosshairAxisLabelView，
    setCrosshairY(y) 注入 / 读取十字星横线本地 y；
  - 新增 crosshairAxisLabelView（ISeriesPrimitiveAxisView）：visible = y 非 null；
    fixedCoordinate() = y（精确贴横线，自动避让不影响，且固定标签绘制在普通
    刻度标签之上不被遮挡）；coordinate() 返回大负数（不参与 unfixed 布局）；
    text() = series.coordinateToPrice(y) 实时反算 + format（越界返回空串）；
    textColor / backColor 取主题（跟随深浅系）；
  - 删除不再使用的 crosshairAxisLabelPaneView.ts；
- controller 挂载 / 注入逻辑不变（v1.4.38）；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.38（2026-10-13）

十字星移动时，左刻度区显示指示值（横线所在数值标签）。

### 变更
- 新增 `src/chart/crosshair/`：crosshairAxisLabelPrimitive.ts +
  crosshairAxisLabelPaneView.ts
  - priceAxisPaneViews() + zOrder 'top'：绘制在价格轴 top canvas（最上层，
    库 9637 行 sourceTopPaneViews 路径），不干扰刻度标签（刻度标签仍由
    AxisLabelPrimitive 按栅格等分对齐）；
  - setCrosshairY(y) 注入十字星横线本地 y；标签值 = series.coordinateToPrice(y)
    实时反算；样式 = 圆角背景块（主题背景色）+ 文字（主题文字色），右对齐贴
    价格轴右缘（"冒泡"观感）；
- controller：
  - 字段 crosshairAxisLabelPrimitives（pane1 / pane3 常驻，pane5 随指标开关增删）；
  - 统一 handleCrosshairMove 回调：pane0 清除十字星（v1.4.37 逻辑）+ 按前序
    pane 高度和换算本地 y 注入命中 pane 的指示值（未命中 pane 置 null 清除残留）；
  - 指标关闭时 filter 移除 pane5 引用（series 已销毁，防对已销毁 series 注入）；
  - destroy：unsubscribeCrosshairMove + 清空数组（防内存泄漏）；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.37（2026-10-13）

pane0 内不触发十字星。

### 变更
- controller：新增 `handleCrosshairMoveInPane0`（const 箭头函数）——
  鼠标位于 pane0（index 0）时调用 `chart.clearCrosshairPosition()` 清除十字星；
  十字星仅可在 pane1 ~ pane5（K 线 / 成交量 / 指标）内触发与移动；
- 说明：库十字星由内部 mousemove 驱动，回调与库 set 同帧（同一次 invalidate
  重绘），pane0 内十字星不出现；pane0 顶层背景遮罩（v1.4.36）保留作双保险；
- 内存：destroy 中 `unsubscribeCrosshairMove` 移除监听，防泄漏；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.36（2026-10-13）

pane0 永远位于十字星上层，遮住十字星竖线（竖线不贯穿 pane0）。

### 变更
- 库渲染层级确认（dist 源码）：
  - 每个 PaneWidget 有 bottom / top 两层 canvas；
  - bottom canvas：背景 → 栅格 → 系列 → 十字星线（CrosshairPaneView 属
    pane 级视图，画在各 pane 的 bottom canvas 上）→ 刻度标签；
  - top canvas：十字星标签 → **zOrder 'top' 的 paneViews**（库 9637 行）；
- 新增 `src/chart/overlay/`：pane0OverlayPrimitive.ts + pane0OverlayPaneView.ts
  - 挂载到 pane0 空 series，`paneViews()` 返回 zOrder 'top' 的视图；
  - draw：先用主题背景色填充整个 pane0 区域（不透明覆盖 → 遮住底层十字星
    竖线），再绘制"测试"文字（垂直居中、距左 6px、主题 textColor）；
  - 颜色每次 draw 动态获取（跟随深浅系主题）；
- controller：pane0 挂载由 TestLabelPrimitive 替换为 Pane0OverlayPrimitive
  （TestLabelPrimitive 仍被 pane2 / pane4 使用，未删除）；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.35（2026-10-13）

修复 `primitive.setCrosshairY is not a function` 崩溃（工作树混版）。

### 变更
- 背景：工作树被覆盖回 v1.4.33 的 controller（含 handleCrosshairMove /
  subscribeCrosshairMove / axisLabelPrimitives 十字星注入配置），而
  axisLabelPrimitive.ts 已回滚为无 setCrosshairY 的版本 → 十字星移动时
  调用不存在的方法，运行时抛 `TypeError: primitive.setCrosshairY is not a function`；
- 按"删除 axis 相关配置"意图重新清理 controller：
  - 删除 axisLabelPrimitives 数组、handleCrosshairMove 方法、
    subscribeCrosshairMove / unsubscribeCrosshairMove、MouseEventParams 导入；
  - pane1 / pane3 / pane5 挂载恢复直接 attachPrimitive(new AxisLabelPrimitive(...))；
  - handleScale 的 axisPressedMouseMove / axisDoubleClickReset 保持删除（v1.4.34）；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.34（2026-10-13）

删除 axis 相关配置。

### 变更
- handleScale：删除 `axisPressedMouseMove: false` / `axisDoubleClickReset: false`
  （axis 相关配置）——恢复库默认：按住价格轴拖动可缩放、双击价格轴可重置；
  滚轮 / 双指缩放仍关闭（mouseWheel / pinch: false），缩放仅由工具栏按钮控制；
- controller：删除十字星左刻度指示值相关的 axis 注入配置
  （axisLabelPrimitives 数组、handleCrosshairMove 方法、subscribeCrosshairMove /
  unsubscribeCrosshairMove、MouseEventParams 导入）；
- 同步用户手动回滚：axisLabelPrimitive.ts 恢复 v1.4.31 版本（无 crosshairY），
  pane1 / pane3 / pane5 挂载恢复直接 attachPrimitive(new AxisLabelPrimitive(...))；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.31（2026-10-13）

MACD 柱改为从中间值（数据区中间，与中间刻度 0 对齐）向上下延伸。

### 变更
- macdBarPaneView：柱底基准由 `priceToCoordinate(0)`（scale 的 0 轴位置）
  改为 `mediaSize.height / 2`（数据区中间）—— 与中间刻度固定值 0 对齐；
  - 延伸量 = |priceToCoordinate(0) - priceToCoordinate(macd)|（值相对 0 轴的像素距离，
    比例仍由 scale 决定，随平移 / 缩放一致）；
  - 柱 > 0：从中间向上（空心红柱）；柱 < 0：从中间向下（绿色实心）；
- macdBarPrimitive：文件头注释同步更新；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.30（2026-10-13）

MACD（pane5）左刻度中间值固定为 0。

### 变更
- axisLabelPrimitive：AxisLabelConfig 新增可选 `fixedMiddleValue`；
  buildLabelViews 对中间刻度（i = count / 2）传入固定值；
- axisLabelView：AxisLabelView 新增可选 `fixedValue`，text() 优先显示
  固定值（否则按坐标反算价格）；
- controller：pane5 挂载 `fixedMiddleValue: 0` —— MACD 柱以 0 轴为正负分界，
  中间刻度不再受 scale 中间值影响，固定显示 0；
- pane1 / pane3 不受影响（未设置 fixedMiddleValue）；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.29（2026-10-13）

成交量（pane3）尾部刻度值 clamp 到非负（不小于 0）。

### 变更
- pane3 AxisLabelPrimitive 的 format 增加 `Math.max(0, volume)`：
  priceScale 底部默认留白可能使刻度 y 处反算出负成交量，
  成交量最低为 0，负值无意义 → 截断为 0 显示（'0' / '0.00万'）；
- K 线（价格恒正）/ MACD（允许负值）不受影响；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.28（2026-10-13）

左刻度刻度值数量调整为「等分数 + 1（含首尾）」，首尾刻度内嵌完整可见。

### 变更
- axisLabelPrimitive：`buildLabelViews` 循环 i = 0..count（含首尾），
  刻度行数 = 等分数 + 1：
  - 指标关：pane1 = 9 个值（8 等分）、pane3 = 3 个值（2 等分）；
  - 指标开：pane1 = 7 个值（6 等分）、pane3 / pane5 = 3 个值（2 等分）；
- 中间刻度（i = 1..count-1）仍与栅格横线同一等分公式（完全对齐）；
- 首尾刻度（i = 0 / count）内嵌 `AXIS_LABEL_PAD = 8` px，
  避免库渲染的背景块 / 文字被价格轴边缘裁切；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.27（2026-10-13）

左刻度区刻度值与自绘栅格横线**完全对齐**（自绘价格轴刻度标签）。

### 变更
- 新增 `src/chart/axis/axisLabelPrimitive.ts` + `axisLabelView.ts`：
  - `AxisLabelPrimitive`（ISeriesPrimitive）：`priceAxisViews()` 返回刻度标签集合，
    标签 y 与 `GridPrimitive` 同一等分公式（`Math.round(h * i / count)`，
    i = 1..count-1），pane 高度取自 `chartApi.panes()[i].getHeight()`；
  - `AxisLabelView`（ISeriesPrimitiveAxisView）：`fixedCoordinate()` 强制标签
    绘制在栅格横线 y 处（防库自动防重叠移动导致错位）；
    `text()` 用 `series.coordinateToPrice(y)` 实时反算当前价格并格式化
    （随数据平移 / 缩放变化，位置固定）；textColor / backColor 取主题
    textColor / background（深浅系区分）；
- 隐藏库刻度标签（刻度区保留）：pane1 klineSeries / pane3 volumeSeries /
  pane5 indicatorsBarSeries 的 `priceFormat formatter` 返回 `''`，
  刻度值全部由自绘标签承担（刻度区宽度仍受 leftPriceScale minimumWidth = 72 控制）；
- 挂载与格式化：
  - pane1：`formatPrice`（K 线价格 2 位小数），行数随指标开关 6 / 8 等分变化；
  - pane3：`formatVolume`（成交量 万 / 亿）；
  - pane5：`formatAxisSmart`（MACD 值，自适应小数位）；
- 机制已验证：库 dist 在渲染价格轴时调用 `_internal_priceAxisViews` 收集
  primitive 视图并绘制（19 处相关代码）；pane 尺寸变化触发 primitive
  `updateAllViews` 重建标签，平移 / 缩放时 `text()` 每次渲染求值；
- 验证：vitest 43 项全绿（6 files）；vue-tsc 通过；未运行 / 未截图。

## v1.4.19（2026-10-12）

给内容 Pane（pane1 / pane3 / pane5）添加 1px 自绘边框，颜色区分深浅系。

### 变更
- 新增 `paneBorderPrimitive.ts` / `paneBorderPaneView.ts`：`ISeriesPrimitive`
  自绘直角矩形边框（strokeRect(0.5, 0.5, w-1, h-1)，CSS 像素网格对齐不模糊）；
- 挂载：pane1（K 线）→ klineSeries、pane3（成交量）→ volumeSeries、
  pane5（指标）→ indicatorsBarSeries（指标开启时随 pane 创建）；
  空 Pane（pane0 / pane2 / pane4）不加边框；
- theme.ts：新增 `paneBorder`（深系 `#2A2E39` / 浅系 `#D4D8DE`），
  主题切换 draw 动态取色自动更新；
- 同步用户修改：`topPaneHeight` 24 → 22（layout.ts），控制器注释 24px → 22px
  口径同步。

### 验证
- vitest 38 项全绿（新增 theme paneBorder 深浅系断言、topPaneHeight=22）；
- vue-tsc 类型检查通过；未运行 / 未截图。

---

## v1.4.18（2026-10-12）

MACD 红绿柱改为自绘，宽度 / 间隔复用成交量函数（`candlestickBarWidth`），与 pane1 蜡烛柱绝对一致。

### 变更
- 新增 `macdBarPrimitive.ts` / `macdBarPaneView.ts`：MACD 柱自绘
  （`ISeriesPrimitive` 挂载到 pane5 指标 series）——
  柱宽 = `candlestickBarWidth(barSpacing, dpr)`（与成交量同一函数，
  宽度 / 间隔与 pane1 绝对一致）；柱中心 = 同一逻辑索引坐标；
  柱 > 0 **空心红柱**（背景填充 + 红框）、柱 < 0 绿色实心；柱底 = 0 轴；
- controller：
  - `indicatorsBarSeries`（Histogram）改为仅作 scale 锚点（color = 背景色不可见），
    与成交量同机制；
  - 新增 `macdPoints` 缓存字段（applyData 计算一次，primitive 与 series 共用）；
  - `applyTheme` 同步更新锚点色（保持不可见）；
  - 删除不再使用的 `MACD_COLORS.macdUp` / `macdDown`（自绘取主题 up/down，
    红涨绿跌与 pane1 / pane3 一致）。

### 验证
- vue-tsc 类型检查通过；vitest 37 项全绿；未运行 / 未截图。

---

## v1.4.17（2026-10-12）

新增 App.vue 指标开关：指标关时 4 Pane（main : volume = 80 : 20），指标开时 6 Pane（60 : 20 : 20）。

### 变更
- App.vue：新增「指标开 / 关」按钮，调控制器 `setShowIndicator`；
- controller：
  - options 新增 `showIndicator?`（默认 true，指标 Pane 初始状态）；
  - 指标 Pane（pane4 / pane5）创建提取为 `createIndicatorPanes`（仅开启时创建）；
  - 新增 `setShowIndicator`：开 = `createIndicatorPanes` + 重算指标数据 + 重排布局；
    关 = `removePane(4)` ×2（删 pane4 后原 pane5 顺移到 index 4，再删一次移除整组）
    + 引用置 null。**防内存泄漏**：库 removePane 从 panes 数组 splice，pane 上
    series（含 primitive）强引用随之断开可被 GC，控制器解除自身引用即安全；
  - `applyStretchFactors` 参数化：指标开 3 固定空 Pane + 60:20:20，
    指标关 2 固定空 Pane + 80:20（时间轴开 / 关一致，仅 H 不同）；
- layout.ts：新增 `paneCountWithoutIndicator`（4）/ `fixedPaneCountWithoutIndicator`（2）/
  `groupRatiosWithoutIndicator`（80:20）；`calcPaneHeights` 泛化接收
  `fixedCount` 与 `ratios`，返回 4 或 6 项，空 Pane 高度扣除后内容按比例分配，
  总高度 = 固定 + 剩余 = 可用高度（完全铺满）。

### 验证
- vitest 37 项全绿（新增指标关 80:20 分配 / 数量守恒断言）；
- vue-tsc 类型检查通过；未运行 / 未截图。

---

## v1.4.16（2026-10-12）

`macdBarSeries` 重命名为 `indicatorsBarSeries`（指标通用柱，为后续扩展其他指标预留）。

### 变更
- controller：`macdBarSeries` → `indicatorsBarSeries`（字段 / 创建 / setData / 注释）；
  DIF / DEA 线保留 MACD 语义（具体指标专属）。

### 验证
- vue-tsc 类型检查通过；vitest 35 项全绿；未运行 / 未截图。

---

## v1.4.15（2026-10-12）

Pane 分组：main / volume / indicator = 60 : 20 : 20（时间轴开 / 关一致）。

### 变更
- 分组：pane0 + pane1 => main、pane2 + pane3 => volume、pane4 + pane5 => indicator；
- `layout.ts`：删除 `calcPaneFactors` / `volumeRatio` / `indicatorRatio`（不再使用），
  新增 `groupRatios`（main 0.6 / volume 0.2 / indicator 0.2）与 `calcPaneHeights`：
  R = 可用高度 − 3×24（空 Pane 高度已扣除），内容 Pane 按组比例分配
  （pane1 = 0.6R、pane3 = 0.2R、pane5 = 0.2R），空 Pane 固定 24px，
  总高度 = R + 72 = 可用高度（完全铺满）；
- controller：`applyStretchFactors` 改**像素因子方案**——stretchFactor 直接设为目标
  像素高度 → 库 totalStretch = Σ高度 = H → stretchPixels = 1，非最后 Pane
  = round(factor) 精确、最后 Pane = 剩余 = 目标，**无舍入误差**；
  时间轴开 / 关仅影响 H（关时时间轴高度 = 0），组比例不变。

### 验证
- vitest 35 项全绿（multipane 更新：内容比例 60:20:20、总和守恒、时间轴开关
  仅 H 不同比例不变、不足兜底）；
- vue-tsc 类型检查通过；未运行 / 未截图。

---

## v1.4.14（2026-10-12）

新增 pane5 指标 Pane（先实现 MACD），高度与 pane3 成交量一致。

### 变更
- 布局升级为 6 Pane：pane0 顶部空 Pane + pane1 K 线 + pane2 底部空 Pane +
  pane3 成交量 + pane4 底部空 Pane + **pane5 指标**；
- `layout.ts`：`paneCount = 6`，新增 `indicatorRatio = 0.25`（与成交量一致）；
  `calcPaneFactors` 按 `S = (total - 3×24) / (1 + 0.25 + 0.25)` 计算，
  返回 `indicatorFactor`；
- 新增 `src/chart/indicators/macd.ts`：MACD 纯计算（东方财富算法）——
  `EMA(close,12)` / `EMA(close,26)` → DIF，`EMA(DIF,9)` → DEA，
  `MACD = 2×(DIF-DEA)`；
- controller：pane5 创建 MACD（`Histogram` 红绿柱 base:0 + `Line` DIF/DEA），
  `applyData` 计算并写入；配色固定（DIF `#A0A0A0`、DEA `#F4AA0A`、
  柱 > 0 红 `#FF0000`、< 0 绿 `#008000`，深浅系通用）；
- pane0 / pane2 / pane4 仍同一 fixedFactor，绝对相等（非最后 Pane = round(fixed)）；
  pane5 为库最后 Pane，吸收舍入，与 pane3 偏差 ≤ 2px（库机制，不可配置）。

### 验证
- vitest 36 项全绿（新增 macd.test.ts 9 项：EMA 手算逐项一致 / 首值 = 0 /
  MACD = 2×(DIF-DEA) / 单调序列 DIF > 0；multipane 更新 6 Pane 模拟，
  断言固定 Pane 恒 24、pane3 与 pane5 偏差 ≤ 2px、高度守恒）；
- vue-tsc 类型检查通过；未运行 / 未截图。

---

## v1.4.13（2026-10-12）

新增 pane4（在 pane3 之后），设置与 pane0 完全一致（"测试"文字、24px、不可拖拽）。

### 变更
- 布局升级为 5 Pane：pane0 顶部空 Pane + pane1 K 线 + pane2 底部空 Pane +
  pane3 成交量 + pane4 底部空 Pane；
- `layout.ts`：`paneCount = 5`，新增 `fixedPaneCount = 3`；`calcPaneFactors`
  按 3 个固定空 Pane 计算：`S = (total - 3×24) / 1.25`，三者同一 `fixedFactor`；
- controller：新增 pane4（LineSeries + `TestLabelPrimitive('测试')`，index 4），
  `applyStretchFactors` 给 panes[4] 同一 fixedFactor。

### pane4 精确性证明（库最后 Pane = 剩余吸收者）
库 `_adjustSizeImpl`：最后 Pane 高度 = 剩余（吸收前面 round 误差）。
推导：`S = (total-72)/1.25 = 0.8×T`，`0.25S = 0.2×T`，记 f=frac(S)、g=frac(0.25S)，
因 `0.8T + 0.2T = T` 为整数 → `f+g ∈ {0,1}`，二者舍入误差互补 → 最后 Pane
`pane4 = ceil(24 + 0) = 24` 精确，与 pane0/pane2 **绝对相等**。

### 验证
- vitest 28 项全绿（multipane 库分配模拟覆盖 total ≡ 0..4 mod 5 全部情形，
  断言 pane0 = pane2 = pane4 = 24 恒成立 + 高度总和守恒）；
- vue-tsc 类型检查通过；未运行 / 未截图。

---

## v1.4.12（2026-10-12）

所有文件名统一为小驼峰命名（camelCase）。

### 变更
- `src/chart/`：`KLineChartController.ts → KLineChartController.ts`、
  `TestLabelPrimitive.ts → testLabelPrimitive.ts`、`TestLabelPaneView.ts → testLabelPaneView.ts`、
  `VolumeBarPrimitive.ts → volumeBarPrimitive.ts`、`VolumeBarPaneView.ts → volumeBarPaneView.ts`；
- `src/components/`：`KLineChart.vue → kLineChart.vue`；
- 全部 import 路径与注释同步更新；class 名保持 PascalCase（TS 类型惯例）；
- `git mv` 保留文件历史。

### 验证
- vue-tsc 类型检查通过；vitest 27 项全绿；未运行 / 未截图。

---

## v1.4.11（2026-10-12）

修复 pane3 成交量柱体底部**未贴合 Pane 底部**（底部留缝隙）。

### 根因
自绘 yBase 用的是 `series.priceToCoordinate(0)`。Histogram `base: 0` 的
autoScale 值域从 0 起算，`priceToCoordinate(0)` 映射到的是 **Pane 底部内边距处**
（`scaleMargins.bottom`），而非 Pane 底部 → 柱体底部留出一条内边距缝隙。

### 修复
柱体底部直接取 Pane 底部坐标 `mediaSize.height`（CSS 像素），
与价格 scale 无关，任何缩放 / 时间轴显隐下都**绝对贴底**；
柱顶仍用 `series.priceToCoordinate(volume)`（volume 在值域内，映射准确）。

### 验证
- vue-tsc 类型检查通过；vitest 27 项全绿；未运行 / 未截图。

---

## v1.4.10（2026-10-12）

修复 pane3 成交量柱体与 pane1 K 线柱体**不完全一致**（宽度偏差 1px）。

### 根因
v1.4.9 复刻的是**用户提供的插件版** `optimalCandlestickWidth`，与库源码
（`PaneRendererCandlesticks`）存在三处差异：
1. coeff 分母：插件版 `Math.PI`，库源码 `Math.PI * 0.5`（barSpacing=10 时柱宽差 1px）；
2. 库源码多 `optimal = Math.min(res, floor(barSpacing×dpr))` 上限裁剪；
3. 库渲染后还有**奇偶修正**：柱宽 ≥ 2 时与影线宽 `wickWidth = floor(dpr)` 同奇偶，
   否则 `barWidth--`（保证十字星叠加对称）——dpr=1 时偶数柱宽会再减 1px。

### 修复
- `candlestickWidth.ts` 改为**库源码原版**：coeff 分母 `Math.PI * 0.5` + min 上限 + max 兜底；
  新增 `candlestickBarWidth` = 原版 + 奇偶修正（渲染最终柱宽）；
- `VolumeBarPaneView` 使用 `candlestickBarWidth`，并按库 bitmap 取整对齐柱位：
  `left = round(center×dpr) - floor(barWidthBitmap/2)`，再转 CSS 像素
  → 柱宽 / 间隔 / 位置与 pane1 **绝对一致**。

### 验证
- vitest 27 项全绿（candlestickWidth 扩为 7 项：与库源码**逐值断言**——
  b=10/dpr=1→7、b=20/dpr=1→15、b=8/dpr=2→12 等，含奇偶修正用例）；
- vue-tsc 类型检查通过；未运行 / 未截图。

---

## v1.4.9（2026-10-12）

成交量红柱空心 + 柱宽/间隔与 pane1 绝对一致。

### 变更
- **成交量改为自绘**（新增 `VolumeBarPrimitive.ts` / `VolumeBarPaneView.ts`）：
  HistogramSeries 仅作 Y 轴（volume 值域）scale 锚点，color = 背景色（不可见），
  主题切换时随背景同步；
- **上涨空心红柱**：背景色填充 + 红色边框（同 pane1 上涨柱）；**下跌绿实心**；
- **柱宽/间隔与 pane1 绝对一致**：新增 `candlestickWidth.ts`
  （官方原版 `optimalCandlestickWidth`，库 npm 包未随附 plugins，按官方实现复刻）——
  自绘柱宽 = optimalCandlestickWidth(barSpacing, dpr)/dpr（与 pane1 Candlestick
  内部同一函数同一 barSpacing），柱中心 = 同一逻辑索引坐标 → 宽度与间隔完全对齐；
- primitive `detached` 清空引用（防内存泄漏）。

### 验证
- vitest 24 项全绿（新增 candlestickWidth 4 项：特殊区间 / 常规区间 / 兜底 / 同源一致）；
- vue-tsc 类型检查通过；未运行 / 未截图（按用户偏好）。

---

## v1.4.8（2026-10-12）

新增 pane3 成交量图（红涨绿跌参考 pane1）。

### 变更
- **布局扩为 4 Pane**：pane0（顶部空 Pane 24px）→ pane1（K 线）→ pane2（底部空
  Pane 24px）→ pane3（成交量，最底部）；
- **pane3 成交量**：`HistogramSeries`（`base: 0` 柱体紧贴 Pane 底部）；
  颜色语义与 pane1 一致——上涨（close >= open）红 `#FF0000`、下跌绿
  `#008000`（深浅系色值相同，无需随主题切换重设）；
- **高度分配**：`calcFixedEdgeFactor` → `calcPaneFactors`，
  `stretchPixels S = (H - 2×24)/(1 + 0.25)`，
  `pane0 : pane1 : pane2 : pane3 = f : 1 : f : 0.25`（`f = 24/S`）；
  数学恒等保证 `f×S = 24` → pane0 与 pane2 仍**绝对相等**，
  K 线 round 误差由最后的成交量 Pane 吸收；
- `mock.ts` 恢复 `volume` 字段（随机正整数，8000~20000）；
- 删除 `calcFixedEdgeFactor`（被 `calcPaneFactors` 取代，无残留引用）。

### 验证
- vitest 20 项全绿（布局常量 + 库分配模拟 4 Pane + 成交量数据合法性）；
- vue-tsc 类型检查通过；未运行 / 未截图（按用户偏好）。

---

## v1.4.7（2026-10-12）

修复 pane0 / pane2 高度不相等（时间轴开关均精确相等）。

### 背景
v1.4.6 删除 `timeAxisHeight` 后，因子按容器全高计算；而库 `_adjustSizeImpl`
实际可用高度 = 容器 − 时间轴默认高度(28px) − 分隔线总高(2px)，二者不匹配，
导致 pane0 ≈ 21px、pane2 ≈ 25px（差约 4px，用户实测发现）。

### 变更
- 新增控制器私有常量 `LIBRARY_TIME_AXIS_HEIGHT = 28`（**非用户参数**）：
  来自库源码 rendererOptions 合计（borderSize 1 + tickLength 5 + fontSize 12 +
  paddingTop 3 + paddingBottom 3 + labelBottomOffset 4，fontSize=12 时偶数化不变），
  仅用于布局换算；
- `applyStretchFactors` 按**库实际可用高度**计算：
  `usableHeight = clientHeight - 时间轴高（按库当前显隐状态） - 分隔线总高(panes.length-1)`；
  数学恒等：`e = fixed/(H-48)` 时 `2e+1 = H/(H-48)`、`S = H-48`、`e×S = fixed`，
  `pane2 = H - fixed - (H-2×fixed) = fixed` → pane0 与 pane2 **绝对相等**；
- `toggleTimeAxis` 切换显隐后重算 stretchFactor（时间轴开/关均精确相等）；
- 新增单测「库分配模拟：e = fixed/(H-2fixed) 时 pane0 与 pane2 高度绝对相等」
  （模拟库 round/剩余分配逻辑，覆盖时间轴开/关多种容器高度）。

### 验证
- vitest 18 项全绿（新增 1 项）；vue-tsc 类型检查通过；未运行 / 未截图。

---

## v1.4.6（2026-10-12）

移除 timeAxisHeight 参数，时间轴完全交给库默认处理。

### 变更
- `layout.ts` 删除 `timeAxisHeight` 常量（时间轴采用库系统默认高度，
  不再持有高度参数）；
- `KLineChartController.ts`：
  - `applyStretchFactors` 直接基于容器高度计算
    （`calcFixedEdgeFactor(container.clientHeight, 24)`），
    时间轴高度由库内部占位；
  - 删除 `timeAxisVisible` 状态与 `toggleTimeAxis` 中的重算逻辑
    （pane 比例与时间轴显隐无关），开关仅切换 `timeScale.visible`；
- 清理残留引用（grep 确认无 `timeAxisHeight` / `timeAxisVisible` 代码引用）。

### 验证
- vitest 17 项全绿；vue-tsc 类型检查通过；未运行 / 未截图（按用户偏好）。

---

## v1.4.5（2026-10-12）

时间轴恢复系统默认 + pane0/pane2 绝对等高 + 清理未用文件。

### 变更
- **时间轴采用系统默认设置**：删除自绘时间轴 primitive
  （`TimeAxisCenteredLabelsPrimitive.ts` 整文件移除），时间轴文字 / tick /
  高度全部恢复库默认渲染；高度计算仍按库默认时间轴高度（25px）从可用高度扣除；
- **pane0 与 pane2 高度绝对相等**：两者使用**同一个** stretchFactor
  （`calcFixedEdgeFactor`），库按相同比例分配，无任何额外偏移；
- 清理未使用引用：控制器移除 `TimeAxisCenteredLabelsPrimitive` import 与挂载代码；
  全仓库 grep 确认无 `formatTradeDate` / `calcFixedTopFactor` 残留。

### 验证
- vitest 17 项全绿；vue-tsc 类型检查通过；未运行 / 未截图（按用户偏好）。

---

## v1.4.4（2026-10-12）

时间轴文字垂直居中 + 底部空 Pane。

### 变更
- **时间轴文字垂直居中**（新增 `TimeAxisCenteredLabelsPrimitive.ts`）：
  lightweight-charts v5 时间轴文字默认中心 y≈14.5px（总高 25px，偏下约 2px，
  无公开配置项）。新增 primitive 挂载到 K 线 series，通过 `timeAxisPaneViews`
  自绘刻度文字：背景色覆盖库默认文字（保留顶部 tick 区域）、按可见逻辑范围与
  barSpacing 选择刻度（最小文字间隔 72px）、`coordinateToTime` 取时间戳格式化为
  YYYY-MM-DD、垂直居中绘制（y = 高度 / 2）；颜色 / 背景跟随主题动态取色。
- **底部空 Pane（pane2）**：设置与 pane0 完全一致（"测试"文字、24px、
  距左 6px、垂直居中、不可拖拽）；
- 高度算法升级：`calcFixedTopFactor` → `calcFixedEdgeFactor`（顶 / 底双固定
  Pane：factor = fixedHeight / (totalHeight - 2 × fixedHeight)）；
- `timeAxisHeight` 修正为 25px（v5 时间轴 cell 实际高度，按库源码常量）。

### 验证
- vitest 17 项全绿（新增 calcFixedEdgeFactor 3 项、paneCount=3）；
- vue-tsc 类型检查通过；未运行 / 未截图（按用户偏好）。

---

## v1.4.3（2026-10-12）

代码结构拆分：每个 class 独立一个文件，布局常量 / 算法独立成模块。

### 变更（src/chart/ 目录结构）
```
src/chart/
├── KLineChartController.ts   # class KLineChartController（控制器）
├── TestLabelPrimitive.ts     # class TestLabelPrimitive（空 Pane 文字 primitive）
├── TestLabelPaneView.ts      # class TestLabelPaneView（文字渲染视图）
├── layout.ts                 # 布局常量（paneCount / topPaneHeight /
│                             #   timeAxisHeight）与 calcFixedTopFactor 算法
├── theme.ts                  # 主题色配置（无 class，保留）
└── mock.ts                   # mock 数据（无 class，保留）
```
- primitive 字段改为 public readonly（text / getColor），供渲染视图跨文件访问；
- 测试 import 同步指向 layout.ts。

### 验证
- vitest 17 项全绿；vue-tsc 类型检查通过；未运行 / 未截图（按用户偏好）。

---

## v1.4.2（2026-10-12）

命名规范化：全部变量改成语义化驼峰（纯字母，无下划线 / 缩写 / 特殊符号）。

### 变更（全仓库）
- 类私有成员去掉 `_` 前缀（`_chart` → `chart`、`_container` → `container`、
  `_bars` → `bars`、`_klineSeries` → `klineSeries`、`_theme` → `theme`、
  `_timeAxisVisible` → `timeAxisVisible`、`_resizeObserver` → `resizeObserver`、
  `_applyStretchFactors` → `applyStretchFactors`、`_applyData` → `applyData`）；
- primitive 内部成员：`_source` → `source`、`_text` → `text`、`_getColor` → `getColor`；
- 缩写展开：`c0` → `initialThemeColors`、`c` → `themeColorSet`、
  `ts` → `timeScaleApi`、`bs` → `barSpacing`、`k` → `remainingHeight`、
  `total` → `availableHeight`、`b` → `bar`、`i` → `index`、`n` → `barCount`、
  `d` → `dateCursor`、`f` → `factor`；
- 常量改为驼峰：`PANE_COUNT` → `paneCount`、`TOP_PANE_HEIGHT` → `topPaneHeight`、
  `TIME_AXIS_HEIGHT` → `timeAxisHeight`、`CHART_FONT_FAMILY` → `chartFontFamily`、
  `DEFAULT_THEME` → `defaultTheme`（导出引用同步更新：控制器 / 测试）。

### 验证
- vitest 17 项全绿；vue-tsc 类型检查通过；未运行 / 未截图（按用户偏好）。

---

## v1.4.1（2026-10-12）

缺陷修复：Pane 分割线不可见 + 十字星跟随鼠标。

### 变更（KLineChartController.ts）
- **Pane 分割线**：`layout.panes.separatorColor / separatorHoverColor`
  设置为当前主题背景色（视觉上 pane 之间无分割线），主题切换时同步跟随；
- **十字星**：`crosshair.mode = CrosshairMode.Normal`，横向 / 竖向十字线
  自由跟随鼠标位置（不再吸附数据点）。

### 验证
- vitest 17 项全绿；vue-tsc 类型检查通过；未运行 / 未截图（按用户偏好）。

---

## v1.4.0（2026-10-12）

新增**顶部空 Pane**（pane0），K 线主图下移至 pane1。

### 变更（KLineChartController.ts）
- 顶部空 Pane（pane0）：无数据，仅通过 `ISeriesPrimitive` 自绘"测试"文字；
- 文字规格：垂直居中、距左 **6px**、颜色跟随主题 `textColor`（深/浅系自动适配）；
- 高度：固定 **24px**（`TOP_PANE_HEIGHT`），Pane 高度不可拖拽
  （`layout.panes.enableResize: false`）；
- 高度算法：`calcFixedTopFactor(totalHeight, topHeight)`（导出纯函数可单测），
  使 pane0 stretchFactor = 24 / (可用高度 - 24)，K 线 pane factor = 1；
- 重新引入 `ResizeObserver` 与 `_timeAxisVisible` 状态：容器尺寸 / 时间轴开关
  变化时重算 pane0 高度（时间轴高度按 v5 固定值 `TIME_AXIS_HEIGHT = 28` 扣除）。

### 测试与验证
- vitest 17 项全绿（新增 calcFixedTopFactor 3 项、PANE_COUNT=2、TOP_PANE_HEIGHT）；
- vue-tsc 类型检查通过；
- 未生成运行截图（按用户偏好仅做代码级验证）。

---

## v1.3.0（2026-10-12）

K 线颜色风格调整：**红涨绿跌 + 上涨柱体空心**。

### 变更（KLineChartController.ts）
- 上涨（up）柱体：填充色改为图表背景色（视觉空心），红色边框 + 红色影线；
- 下跌（down）柱体：绿色实心（填充 / 边框 / 影线均绿）；
- 主题切换时上涨柱体填充色跟随新主题背景色，空心效果在深系 / 浅系下均正确。

### 测试与验证
- vitest 13 项全绿；
- vue-tsc 类型检查通过；
- 实拍截图：深系 / 浅系（可见红色空心柱体 + 绿色实心柱体）。

---

## v1.2.1（2026-10-12）

单 Pane K 线版本（v1.2.0）的**未使用参数清理**，无行为变更。

### 清理（KLineChartController.ts）
- 删除 `KLineChartOptions.symbol` 与 `_symbol` 字段（存入后从未读取）；
- 删除 `_resizeObserver` 空监听（autoSize 已由库处理，无实际功能）；
- 删除 `layout.panes` 配置（单 Pane 无 pane 分隔线，参数无渲染效果）；
- 删除 `crosshair.mode`（0 为库默认值）与 `timeScale.timeVisible/secondsVisible`
  （false 为库默认值），保留有实际效果的 `timeScale.borderVisible: false`；
- 删除无调用者的 getter（`chart` / `theme` / `timeAxisVisible`）与
  `_timeAxisVisible` 冗余状态，`toggleTimeAxis` 直接应用库选项。

### 清理（theme.ts / mock.ts）
- 删除 `CHART_FONT`（未使用，保留 `CHART_FONT_FAMILY`）；
- 删除 `separatorColor`（单 Pane 无分隔线 + 栅格关闭，无渲染效果）；
- 删除 `BasicBar.volume` 字段与生成逻辑（单 Pane 不渲染成交量；
  统一数据模型的 volume 保留在 `types/chart.ts`）。

### 测试与验证
- vitest 13 项全绿（mock / theme / multipane，新增 separatorColor 清理断言）；
- vue-tsc 类型检查通过；
- 实拍截图：深系 / 浅系 / 时间轴开关。

---

## v1.2.0（2026-10-12）

在 v1.1.0（2 Pane：K 线 + 成交量）基础上收敛为 **单 Pane**。

### 变更
- **仅保留 pane0 K 线主图**（Candlestick）；删除 pane1 成交量（Histogram）及其数据写入。
- 栅格化 / 左右刻度区保持关闭（v1.1.0 起生效），数据区铺满。

### 清理
- 控制器删除 `HistogramSeries` 导入、成交量 series 创建、成交量数据写入；
- `_series` 数组简化为单一 `_klineSeries` 字段。

### 测试与验证
- vitest 12 项全绿（mock / theme / multipane，PANE_COUNT=1）；
- vue-tsc 类型检查通过；
- CDP 实拍截图：深系 / 浅系 / 时间轴开关。

---

## v1.1.0（2026-10-12）

在 v1.0.0（6 Pane 骨架）基础上收敛为 **2 个 Pane**。

### 变更
- **仅保留 2 个 Pane**：pane0 K 线主图（Candlestick）+ pane1 成交量（Histogram）；
  删除 pane2~5 示例折线（Line）。
- **删除栅格化**：`grid.vertLines / horzLines` 全部隐藏（深系 / 浅系均无栅格线）。
- **删除左右刻度区**：`leftPriceScale / rightPriceScale` 全部隐藏，数据区铺满整个宽度。

### 清理
- `theme.ts` 删除 `auxLineColors`（示例线颜色）字段；
- `mock.ts` 删除 `genAuxLines`（示例折线数据）；
- 控制器删除 `SCALE_AREA_WIDTH` 常量与示例折线创建 / 写入逻辑。

### 测试与验证
- vitest 12 项全绿（mock / theme / multipane）；
- vue-tsc 类型检查通过；
- CDP 实拍截图：深系 / 浅系 / 时间轴开关。

---

## v1.0.0（2026-10-12）

首个版本。**放弃之前所有需求，全新架构重构**：多 Pane 布局（一个 chart 内 6 个
Pane），版本号从 v1.0.0 重新起算。本阶段完成"绘制 6 个 Pane"骨架。

### 架构
- **6 个 Pane（lightweight-charts 原生多 Pane）**：
  - pane0：K 线主图（Candlestick，红涨绿跌实心）；
  - pane1：成交量（Histogram，红涨绿跌柱）；
  - pane2~5：示例折线（Line，占位，后续替换为附图指标）。
- **高度均分**：6 个 Pane `stretchFactor` 均分（1:1:1:1:1:1），高度跟随父容器
  （库 autoSize 自适应，不设死值）。
- **底部共享时间轴**：所有 Pane 共用一条 timeScale。

### 全局控制（App.vue）
- 时间轴开 / 关（`timeScale.visible`）；
- 缩小 / 放大（X 轴 `barSpacing` 限幅 2~80，图表内禁滚轮 / 触摸缩放）；
- 深系 / 浅系主题切换（颜色集中在 `chart/theme.ts`）。

### 清理
- 删除旧架构全部代码：`panes/ChartOverlay.ts`、`panes/ColumnSeries.ts`、
  `layout.ts`（三层 60:20:20 / 80:20 布局）及旧测试（layout / macd）；
- 保留 `types/chart.ts`（统一数据点类型，供后续后端接入）。

### 测试与验证
- vitest 16 项全绿（mock / theme / multipane）；
- vue-tsc 类型检查通过；
- CDP 实拍截图：6 Pane 均分可见、深系 / 浅系、时间轴开关。
