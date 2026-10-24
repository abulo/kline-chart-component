<script setup lang="ts">
/**
 * KLineChart.vue —— 图表组件（v1.5.0：数据服务集成）
 *
 * 职责：提供一个占满容器的 div，挂载 KLineChartController；
 * 将工具栏状态下沉为 Props（单向数据流），组件内部 watch Props 驱动控制器；
 * **数据层接入 src/services（ChartDataService 接口）**：
 *  - controller.init 统一拉历史 + 订阅实时（v1.6.17；首次挂载 / symbol / period / service 变化触发）
 *    → controller.setKlineData（过滤 kline 点，整体重建 + fitContent）；
 *  - 实时订阅在 controller 内部（startRealtime → updateLastBar）
 *    （同 time 覆盖最后一根 / 更大 time 追加新 K，指标增量重建）。
 *
 * Props：
 *  - symbol / name：股票代码 / 名称（pane0 信息行：名称 [代码]）；
 *  - timeAxis / leftScale / rightScale / theme / mainIndicator / subIndicator：状态开关；
 *  - 拉取条数：服务实例 fetchLimit（构造必填，如 200）；
 *  - period：当前周期（外部可控，默认 'day'；变化时重新拉取）；
 *  - service：数据服务实现（默认 MockChartDataService 单例；接入真实行情传
 *    HttpChartDataService 实例即可，组件 / 控制器零改动）。
 *
 * 生命周期（实例保护 + 内存管理）：
 *  - onMounted：controller 为空才创建（防重复挂载重复创建 chart），随后 controller.init()；
 *  - onBeforeUnmount：controller.destroy()（内部退订实时 + 使在途请求失效）并置空引用；
 *  - 数据加载竞态由 controller 内部 loadSeq 守卫（快速切换周期 / 标的丢弃过期响应）。
 */
import { onBeforeUnmount, onMounted, ref, watch, computed } from "vue";
import { KLineChartController } from "../chart/core/kLineChartController";
import type { ChartThemeName } from "../chart/core/theme";
import  { themeColors } from "../chart/core/theme";
import type { MainIndicatorType, SubIndicatorType } from "../chart/indicator";
import type { PeriodValue } from "../chart/periods";
import { isTimesharePeriod } from "../chart/periods";
import type { ChartDataService } from "../services/chartDataService";
import type { ChartDataPoint } from "../types/chart";
import type { ChartLoadStatus } from "../chart/core/types";
import { MockChartDataService } from "../services/chartDataService";
import { debounce } from "../chart/util/timing";
import { SWITCH_DEBOUNCE_MS } from "../chart/core/constants";

/** 默认数据服务（Mock 单例：池缓存复用，内存友好；接入后端时父组件传 HttpChartDataService） */
const defaultService = new MockChartDataService({ fetchLimit: 200 });

/** 图表组件 Props（工具栏状态 + 数据服务 单向数据流） */
/** 加载状态事件（v1.6.18）：controller.init 全流程状态通知（'loading' | 'ready' | 'error'） */
const emit = defineEmits<{
  "status-change": [status: ChartLoadStatus];
  /** 全屏切换（v1.7.1）：组件内"退出全屏"按钮触发，父组件据以更新 fullscreen prop */
  "fullscreen-change": [fullscreen: boolean];
}>();

/** 当前加载状态（v1.6.21 组件内部可读：模板 / script 直接引用；变化时同步 emit） */
const loadStatus = ref<ChartLoadStatus>("idle");

/** 是否使用外部自定义数据（v1.6.28：data 非空 → 不走 service 拉取） */
const useCustomData = computed(() => !!props.data && props.data.length > 0);

const props = withDefaults(
  defineProps<{
    /** 股票代码（pane0 顶部信息行显示） */
    symbol?: string;
    /** 股票名称（pane0 顶部信息行显示） */
    name?: string;
    /** 时间轴开关（默认开） */
    timeAxis?: boolean;
    /** 左刻度区开关（默认关） */
    leftScale?: boolean;
    /** 右刻度区开关（默认关） */
    rightScale?: boolean;
    /** 风格（'dark' | 'light'，默认深系） */
    theme?: string;
    /** 主图指标（'' = 关闭；互斥单选，由父组件保证） */
    mainIndicator?: string;
    /** 附图指标（'' = 关闭指标层；互斥单选，由父组件保证） */
    subIndicator?: string;
    /** 当前周期（外部可控；变化时经 service 重新拉取该周期数据） */
    period?: PeriodValue;
    /** 数据服务（默认 MockChartDataService 单例；传 HttpChartDataService 接入真实行情） */
    service?: ChartDataService;
    /** 外部自定义数据（v1.6.28）：提供时优先渲染 data，跳过 service 拉取 / 分页 / 实时 */
    data?: ChartDataPoint[];
    /** 时间格式模板（v1.6.9）：如 'YYYY-MM-DD' / 'YYYY-MM-DD HH:mm'；缺省按周期自动 */
    format?: string;
    /** 全屏（v1.7.1）：true 时组件铺满浏览器视口（fixed 覆盖），false 保持父容器布局 */
    fullscreen?: boolean;
  }>(),
  {
    symbol: "",
    name: "",
    timeAxis: true,
    leftScale: false,
    rightScale: false,
    theme: "dark",
    mainIndicator: "",
    subIndicator: "",
    period: "day",
    fullscreen: false,
  },
);

/** 容器 ref（需有确定宽高，由父组件 CSS 保证） */
const containerRef = ref<HTMLDivElement | null>(null);

/** 控制器实例（父组件 ref 访问：放大 / 缩小 / 左移 / 右移） */
const controller = ref<KLineChartController | null>(null);

/** 数据请求防抖（v1.7.1）：周期 / 标的 / 服务快速切换时合并为最后一次 init，
 *  避免并发 fetchHistory 数据争抢；setPeriod / setSymbol 等 UI 状态仍立即生效，
 *  仅数据拉取延迟 SWITCH_DEBOUNCE_MS（controller 内部 loadSeq 仍作兜底丢弃过期响应）。
 *  - 声明在 controller 之后（闭包引用不触发 TDZ；首次挂载前 props 变化 → 判空跳过）。 */
const debouncedInit = debounce(() => {
  void controller.value?.init();
}, SWITCH_DEBOUNCE_MS);

/** ESC 退出全屏（v1.7.1）：仅 props.fullscreen 为 true 时响应；
 *  经 fullscreen-change 回传父组件关闭（受控 prop 同步，与退出按钮一致） */
const handleKeydown = (event: KeyboardEvent): void => {
  if (event.key === "Escape" && props.fullscreen) {
    emit("fullscreen-change", false);
  }
};

/** 组件内当前周期（默认取 props.period；白名单按钮点击 / 外部 period 变化同步） */
const activePeriod = ref<PeriodValue>(props.period);

// v1.6.24：props.theme 为 string，需断言到 ChartThemeName（与 applyTheme 调用一致）
const theme = computed(() => themeColors(props.theme as ChartThemeName));

onMounted(() => {
  // 实例保护：仅当控制器未创建（且容器未被标记）时才创建；
  // 若已存在实例则复用（防重复挂载导致 chart 重复创建）
  if (!containerRef.value || controller.value) return;
  controller.value = new KLineChartController({
    container: containerRef.value,
    symbol: props.symbol,
    name: props.name,
    // v1.6.9：时间格式模板透传（pane0 信息行时间；缺省按周期自动）
    format: props.format,
    // v1.6.17：数据服务由组件注入（默认 Mock 兜底），controller.init 统一管理拉取 / 实时
    service: props.service ?? defaultService,
    // v1.6.28：外部自定义数据直通（data 提供时跳过 service 拉取）
    initialBars: props.data,
    // v1.6.21：加载状态回调 → 组件内部 loadStatus 同步 + emit 'status-change'（父组件监听）
    onStatusChange: (status) => {
      loadStatus.value = status;
      emit("status-change", status);
    },
  });
  // 创建后立即应用全部 Props 初始值（与控制器构造默认值一致时幂等无副作用）
  controller.value.applyTheme(props.theme as ChartThemeName);
  controller.value.toggleTimeAxis(props.timeAxis);
  controller.value.setLeftScaleVisible(props.leftScale);
  controller.value.setRightScaleVisible(props.rightScale);
  controller.value.setMainIndicator(
    props.mainIndicator ? (props.mainIndicator as MainIndicatorType) : null,
  );
  controller.value.setSubIndicator(
    props.subIndicator ? (props.subIndicator as SubIndicatorType) : null,
  );
  // 数据层：controller.init 统一拉历史 + 订阅实时（v1.6.17）；
  // v1.6.28：外部 data 直通时不 init（构造已 setKlineData，跳过 service）
  if (!useCustomData.value) void controller.value.init();
  // ESC 退出全屏（v1.7.1）：挂 window（chart 任意区域/焦点均生效），
  // 仅全屏态触发；onBeforeUnmount 移除（防泄漏）
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  // 取消挂起的防抖 init（快速切换后立即卸载 → 不再发过期请求）
  debouncedInit.cancel();
  // 移除 ESC 监听（与 onMounted 配对，防泄漏）
  window.removeEventListener("keydown", handleKeydown);
  // destroy 内部已退订实时推送（v1.6.17）
  controller.value?.destroy();
  controller.value = null;
});

/* ===== Props watch：状态变化 → 驱动控制器 / 数据层（单向数据流） ===== */
/** 时间轴开关 */
watch(
  () => props.timeAxis,
  (visible) => controller.value?.toggleTimeAxis(visible),
);
/** 左刻度区开关 */
watch(
  () => props.leftScale,
  (visible) => controller.value?.setLeftScaleVisible(visible),
);
/** 右刻度区开关 */
watch(
  () => props.rightScale,
  (visible) => controller.value?.setRightScaleVisible(visible),
);
/** 风格切换（图表主题；html 背景由父组件同步） */
watch(
  () => props.theme,
  (value) => controller.value?.applyTheme(value as ChartThemeName),
);
/** 主图指标（'' → null = 关闭） */
watch(
  () => props.mainIndicator,
  (value) =>
    controller.value?.setMainIndicator(
      value ? (value as MainIndicatorType) : null,
    ),
);
/** 附图指标（'' → null = 关闭指标层） */
watch(
  () => props.subIndicator,
  (value) =>
    controller.value?.setSubIndicator(
      value ? (value as SubIndicatorType) : null,
    ),
);
/** 外部自定义数据变化 → 直接注入渲染（v1.6.28；data 模式不走 service） */
watch(
  () => props.data,
  (data) => {
    if (data && data.length > 0) controller.value?.setKlineData(data);
  },
);
/** 外部周期变化 → 同步内部周期 + 防抖重新 init（拉历史 + 重订阅实时，重置边缘加载状态） */
watch(
  () => props.period,
  (value, oldValue) => {
    if (value === activePeriod.value) return;
    activePeriod.value = value;
    // v1.6.9：周期切换 → pane0 信息行时间格式随周期变更（setPeriod 触发重绘，立即生效）
    controller.value?.setPeriod(value);
    // 分时 → K 线（v1.7.1 修复）：分时期间 indicatorManager.setMainIndicator 会被
    // 静默清空（分时无主图指标），而 props.mainIndicator 值未变 → watch 不触发、
    // 切回 K 线后主图指标缓存仍为空（表现为"需手动点击才生效"）。
    // 此处用 oldValue 精准判定"从分时切到 K 线"，主动重新应用当前主图指标（幂等）。
    if (isTimesharePeriod(oldValue) && !isTimesharePeriod(value)) {
      controller.value?.setMainIndicator(
        props.mainIndicator ? (props.mainIndicator as MainIndicatorType) : null,
      );
      // 附图指标同根因防御（v1.7.1）：分时下 CR 等被防御清空缓存（状态保留），
      // data 直通模式切周期不触发 applyData → 显式重建（指标层关闭时空操作）
      controller.value?.refreshSubIndicatorData();
    }
    // v1.6.28：data 直通模式不拉取（数据以外部 data 为准）
    if (useCustomData.value) return;
    // v1.7.1 防抖：快速连续切换周期只发最后一次 init（loadSeq 兜底丢过期响应）
    debouncedInit();
  },
);
/** symbol 变化 → 更新控制器标的 + 防抖重新 init（v1.6.22：init 使用新 symbol / name） */
watch(
  () => props.symbol,
  () => {
    controller.value?.setSymbol(props.symbol);
    controller.value?.setName(props.name);
    // v1.6.28：data 直通模式不拉取
    if (useCustomData.value) return;
    debouncedInit();
  },
);
/** name 变化 → 更新 pane0 信息行显示（无需重拉数据） */
watch(
  () => props.name,
  (value) => controller.value?.setName(value),
);
/** service 实例变化 → 更新控制器服务 + 防抖重新 init（v1.6.22：init 使用新 service） */
watch(
  () => props.service,
  () => {
    controller.value?.setService(props.service ?? defaultService);
    // v1.6.28：data 直通模式不拉取
    if (useCustomData.value) return;
    debouncedInit();
  },
);

/** 向父组件暴露控制器（放大 / 缩小 / 左移 / 右移等瞬时动作） */
/** 对外暴露：控制器 + 当前加载状态（父组件 chartRef.value.loadStatus 读取） */
defineExpose({ controller, loadStatus });
</script>

<template>
  <div class="kline-chart" :class="{ fullscreen: props.fullscreen }">
    <!-- 首次加载遮罩 -->
    <div v-if="loadStatus === 'loading'"
      class="kline-mask"
      :style="{
        background: theme.maskBackground,
        color: theme.maskText,
      }">
      加载中…
    </div>
    <!-- 向左加载更早历史提示 -->
    <div v-if="loadStatus === 'loading-older'"
      class="kline-older"
      :style="{
        background: theme.maskBackground,
        color: theme.maskText,
      }">
      正在加载更早数据…
    </div>
    <div ref="containerRef" class="kline-chart-container" />
    <!-- 全屏退出按钮（v1.7.1）：全屏时组件铺满视口盖住页面其他区域，
         此按钮为唯一出口（工具栏在视口外被盖住） -->
    <button
      v-if="props.fullscreen"
      class="exit-fullscreen"
      @click="emit('fullscreen-change', false)"
    >
      退出全屏
    </button>
  </div>
</template>

<style scoped>
.kline-chart {
  position: relative;
  width: 100%;
  height: 100%;
}

/* 全屏态（v1.7.1）：fixed 铺满浏览器视口，盖住页面其他区域；
   背景由库绘制（autoSize + ResizeObserver 自动跟随容器尺寸） */
.kline-chart.fullscreen {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 9999;
}

/* 全屏退出按钮（右上角，z-index 高于图表绘制层；颜色跟随当前主题） */
.exit-fullscreen {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10000;
  font-size: 12px;
  padding: 4px 12px;
  cursor: pointer;
  border-radius: 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
  background: v-bind('theme.buttonBackground');
  color: v-bind('theme.buttonText');
  border: 1px solid v-bind('theme.buttonBorder');
}

.kline-chart-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* —— 加载状态 —— */
.kline-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  pointer-events: none;
  z-index: 4;
}
.kline-older {
  position: absolute;
  top: 5%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  pointer-events: none;
  z-index: 4;
}
</style>
